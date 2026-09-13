/**
 * La société (jalon 13) : comment trois familles deviennent un village avec
 * ses règles. Prestige, coutumes nées des leçons, veillées et fêtes, justice
 * réparatrice et bannissement, rancunes et rixes, notables, décisions
 * collectives, alliances par mariage, factions et tension, deuil violent et
 * haine héréditaire, lieux interdits, maîtres et apprentis. Tout est
 * déterministe : les tirages viennent du flux de hasard du monde.
 */
import { gagnerExperience, niveau } from "../agents/competences.js";
import { COMPETENCES } from "../agents/competences.js";
import type { Competence } from "../agents/competences.js";
import { ajouterHumeur, blesser } from "../agents/corps.js";
import { phenotype } from "../agents/genetique.js";
import { NOURRITURE, quantite, transferer } from "../agents/inventaire.js";
import { relationAvec } from "../agents/personnage.js";
import type { Personnage } from "../agents/personnage.js";
import { clamp } from "../agents/besoins.js";
import type { Evenement } from "../evenements/journal.js";
import { PLANS_BATIMENT } from "../monde/batiments.js";
import type { Batiment } from "../monde/batiments.js";
import { centreVillage } from "../monde/danger.js";
import { Grille } from "../monde/grille.js";
import type { Position } from "../monde/grille.js";
import type { Monde } from "../monde.js";
import { LECONS } from "../savoirs/catalogue.js";
import type { Lecon } from "../savoirs/catalogue.js";
import { apprendre, connait } from "../savoirs/lecons.js";
import { ajusterRelation, borner } from "./relations.js";

// ------------------------------------------------------------------ état

export interface Coutume {
  readonly lecon: Lecon;
  readonly depuisJour: number;
}

export type MotifGrief = "vol" | "heritage" | "sang";
export type IssueGrief = "ouvert" | "repare" | "exil" | "pardonne" | "rixe";

/** Un grief : ce qu'on reproche à quelqu'un, jugé à la veillée. */
export interface Grief {
  readonly id: string;
  readonly jour: number;
  readonly plaignant: string;
  readonly accuse: string;
  readonly motif: MotifGrief;
  readonly details: string;
  etat: IssueGrief;
  jugeJour: number | null;
}

export type SujetDecision = "stocks" | "puits" | "exil";

export interface Decision {
  readonly jour: number;
  readonly sujet: SujetDecision;
  readonly libelle: string;
  readonly pour: number;
  readonly contre: number;
  readonly adoptee: boolean;
}

export interface LieuInterdit {
  readonly x: number;
  readonly y: number;
  readonly rayon: number;
  readonly jusquaJour: number;
  readonly motif: string;
}

export interface Faction {
  readonly nom: string;
  readonly familles: readonly string[];
  readonly membres: number;
}

export interface Veillee {
  readonly tick: number;
  readonly x: number;
  readonly y: number;
  readonly participants: readonly string[];
  readonly fete: string | null;
}

export interface Bannissement {
  readonly depuisJour: number;
  readonly jusquaJour: number;
  readonly motif: string;
}

export interface EtatSociete {
  coutumes: Coutume[];
  griefs: Grief[];
  /** Tension du village 0..100 : monte avec les vols, les rixes, les décisions perdues. */
  tension: number;
  decisions: Decision[];
  derniereDecisionJour: number;
  lieuxInterdits: LieuInterdit[];
  /** Familles alliées par un mariage (« A|B », noms triés). */
  alliances: string[];
  /** Stocks ouverts à tous jusqu'à ce jour (décision d'hiver). */
  stocksOuvertsJusquaJour: number;
  feteDuSoir: { readonly genre: string; readonly sujet: string | null } | null;
  derniereVeillee: Veillee | null;
  factions: Faction[];
  /** Dernière rixe par paire (« a|b »), en tick. */
  rixes: Map<string, number>;
  compteurs: {
    veillees: number;
    fetes: number;
    palabres: number;
    exils: number;
    rixes: number;
    reparations: number;
    infractions: number;
  };
  compteurGriefs: number;
}

export function etatSocieteInitial(): EtatSociete {
  return {
    coutumes: [],
    griefs: [],
    tension: 0,
    decisions: [],
    derniereDecisionJour: -100,
    lieuxInterdits: [],
    alliances: [],
    stocksOuvertsJusquaJour: -1,
    feteDuSoir: null,
    derniereVeillee: null,
    factions: [],
    rixes: new Map(),
    compteurs: {
      veillees: 0,
      fetes: 0,
      palabres: 0,
      exils: 0,
      rixes: 0,
      reparations: 0,
      infractions: 0,
    },
    compteurGriefs: 0,
  };
}

/** Le monde vu par la société : le monde, plus son état social. */
export interface MondeSocial extends Monde {
  readonly societe: EtatSociete;
}

// ------------------------------------------------------------ constantes

/** Part des adultes qui doivent connaître une leçon, et pendant combien de jours, pour qu'elle devienne coutume. */
export const PART_COUTUME = 0.6;
export const JOURS_COUTUME = 30;
/** En dessous de cette part, une coutume se perd. */
export const PART_ABANDON = 0.4;
/** Prestige à partir duquel on compte parmi les notables (trois au plus). */
export const SEUIL_NOTABLE = 15;
export const NOTABLES_MAX = 3;
/** Rancune à partir de laquelle une rixe peut éclater, et jours entre deux rixes d'une même paire. */
export const SEUIL_RIXE = 60;
export const JOURS_ENTRE_RIXES = 10;
/** Une décision collective au plus tous les dix jours. */
export const JOURS_ENTRE_DECISIONS = 10;
/** Durée d'un bannissement, et distance à laquelle le banni s'établit. */
export const JOURS_EXIL = 60;
export const DISTANCE_EXIL = 40;
/** Un lieu interdit dure une saison. */
export const JOURS_TABOU = 30;
export const RAYON_TABOU = 3;
/** Rayon d'une veillée autour du feu, et adultes qu'il faut pour en tenir une. */
export const RAYON_VEILLEE = 8;
export const ADULTES_VEILLEE = 3;
/** Tension au-delà de laquelle chaque faction veille de son côté. */
export const TENSION_SCISSION = 70;
/** Jours entre deux recueillements sur une tombe. */
export const JOURS_ENTRE_RECUEILLEMENTS = 30;

const CAUSES_EXPLIQUEES = new Set([
  "faim",
  "froid",
  "soif",
  "vieillesse",
  "loups",
  "accouchement",
  "hémorragie",
  "infection",
  "mort au berceau",
]);

const CAUSES_VIOLENTES = new Set(["loups", "hémorragie", "infection", "rixe"]);

// --------------------------------------------------------------- outils

function jourDe(monde: Monde): number {
  return monde.horloge.moment().jourAbsolu;
}

export function adultes(monde: Monde): Personnage[] {
  return monde.personnages.filter(
    (p) => p.vivant && (p.corps.stade === "adulte" || p.corps.stade === "ancien"),
  );
}

export function estBanni(monde: Monde, p: Personnage): boolean {
  return p.banni !== null && jourDe(monde) < p.banni.jusquaJour;
}

export function cleAlliance(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function allies(societe: EtatSociete, a: string, b: string): boolean {
  return a === b || societe.alliances.includes(cleAlliance(a, b));
}

/** Coutumes en vigueur, sous forme d'ensemble. */
export function coutumesActives(societe: EtatSociete): Set<Lecon> {
  return new Set(societe.coutumes.map((c) => c.lecon));
}

export function estCoutume(societe: EtatSociete, lecon: Lecon): boolean {
  return societe.coutumes.some((c) => c.lecon === lecon);
}

/** Vrai si la position est dans un lieu interdit encore en vigueur. */
export function lieuInterdit(monde: MondeSocial, pos: Position): LieuInterdit | null {
  const jour = jourDe(monde);
  for (const l of monde.societe.lieuxInterdits) {
    if (jour >= l.jusquaJour) continue;
    if (Grille.distance(pos, l) <= l.rayon) return l;
  }
  return null;
}

/**
 * Un personnage évite-t-il ce lieu ? Un tabou se respecte, sauf famine
 * (faim < 30) : la faim passe avant la peur.
 */
export function eviteLeLieu(monde: MondeSocial, p: Personnage, pos: Position): boolean {
  if (p.besoins.faim < 30) return false;
  return lieuInterdit(monde, pos) !== null;
}

/** Les notables : les trois plus grands prestiges parmi les adultes, à partir du seuil. */
export function notables(monde: Monde): Personnage[] {
  return adultes(monde)
    .filter((p) => p.prestige >= SEUIL_NOTABLE)
    .sort((a, b) => b.prestige - a.prestige || a.id.localeCompare(b.id))
    .slice(0, NOTABLES_MAX);
}

export function estNotable(monde: Monde, p: Personnage): boolean {
  return notables(monde).some((n) => n.id === p.id);
}

function poidsDeVote(p: Personnage): number {
  return 1 + Math.max(0, p.prestige) / 20;
}

function nourritureDuStock(b: Batiment): number {
  if (b.stock === null) return 0;
  let n = 0;
  for (const [r, q] of Object.entries(b.stock.ressources))
    if (NOURRITURE[r as keyof typeof NOURRITURE] !== undefined) n += q;
  return n;
}

/** Nourriture rangée dans les stocks d'une famille. */
export function nourritureFamiliale(monde: Monde, famille: string): number {
  let n = 0;
  for (const b of monde.batiments.values())
    if (b.etat === "termine" && b.famille === famille) n += nourritureDuStock(b);
  return n;
}

function stockFamilial(monde: Monde, famille: string): Batiment | null {
  let meilleur: Batiment | null = null;
  for (const b of monde.batiments.values()) {
    if (b.etat !== "termine" || b.famille !== famille || b.stock === null) continue;
    if (meilleur === null || nourritureDuStock(b) > nourritureDuStock(meilleur)) meilleur = b;
  }
  return meilleur;
}

function familles(monde: Monde): string[] {
  return [...new Set(adultes(monde).map((p) => p.identite.nomFamille))].sort();
}

function meilleureCompetence(p: Personnage): Competence {
  let meilleure: Competence = COMPETENCES[0];
  for (const c of COMPETENCES) if (p.experience[c] > p.experience[meilleure]) meilleure = c;
  return meilleure;
}

function ajouterTension(societe: EtatSociete, delta: number): void {
  societe.tension = borner(societe.tension + delta, 0, 100);
}

function ouvrirGrief(
  monde: MondeSocial,
  plaignant: Personnage,
  accuse: Personnage,
  motif: MotifGrief,
  details: string,
): Grief {
  const s = monde.societe;
  s.compteurGriefs += 1;
  const grief: Grief = {
    id: `grief-${String(s.compteurGriefs)}`,
    jour: jourDe(monde),
    plaignant: plaignant.id,
    accuse: accuse.id,
    motif,
    details,
    etat: "ouvert",
    jugeJour: null,
  };
  s.griefs.push(grief);
  if (s.griefs.length > 60) s.griefs.splice(0, s.griefs.length - 60);
  return grief;
}

// ------------------------------------------------------- observation

/**
 * Chaque événement nourrit le prestige, les rancunes, les griefs, la tension
 * et les fêtes à venir. Appelé par le journal.
 */
export function observerEvenement(monde: MondeSocial, e: Evenement): void {
  const s = monde.societe;
  const acteur = e.acteur === null ? undefined : monde.personnages.find((p) => p.id === e.acteur);
  const prestige = (p: Personnage | undefined, delta: number): void => {
    if (p !== undefined) p.prestige = borner(p.prestige + delta, 0, 100);
  };
  switch (e.type) {
    case "offre": {
      prestige(acteur, 2);
      const cible = monde.personnages.find((p) => p.id === String(e.details.cible ?? ""));
      if (acteur && cible && acteur.identite.nomFamille !== cible.identite.nomFamille)
        ajouterTension(s, -1);
      break;
    }
    case "demande": {
      const cible = monde.personnages.find((p) => p.id === String(e.details.cible ?? ""));
      if (e.details.accepte === true) {
        prestige(cible, 1);
      } else if (acteur && cible) {
        const saison = monde.horloge.moment().saison;
        const hiver = saison === "hiver" || saison === "automne";
        const r = relationAvec(acteur, cible.id);
        r.rancune = borner(r.rancune + (hiver ? 10 : 6), 0, 100);
        acteur.drapeaux.refusePar = { id: cible.id, tick: e.tick };
        if (hiver) {
          ajouterTension(s, 2);
          // Refuser à manger en hiver enfreint la coutume du partage.
          if (
            estCoutume(s, "partager_en_hiver") &&
            NOURRITURE[String(e.details.ressource) as keyof typeof NOURRITURE] !== undefined
          )
            infraction(monde, cible, "partager_en_hiver", acteur);
        }
      }
      break;
    }
    case "vol": {
      if (acteur === undefined) break;
      prestige(acteur, -10);
      ajouterTension(s, 5);
      const famille = String(e.details.famille ?? "");
      const temoins = Number(e.details.temoins ?? 0);
      const leses = monde.personnages.filter(
        (p) => p.vivant && p.identite.nomFamille === famille && p.id !== acteur.id,
      );
      for (const l of leses) {
        const r = relationAvec(l, acteur.id);
        r.rancune = borner(r.rancune + 30, 0, 100);
      }
      if (temoins > 0) {
        const plaignant = leses.sort(
          (a, b) => b.prestige - a.prestige || a.id.localeCompare(b.id),
        )[0];
        if (plaignant !== undefined) {
          ouvrirGrief(
            monde,
            plaignant,
            acteur,
            "vol",
            `${String(e.details.quantite)} ${String(e.details.ressource)}`,
          );
        }
      }
      break;
    }
    case "invention":
      prestige(acteur, 6);
      break;
    case "batiment_termine":
      prestige(acteur, 3);
      break;
    case "chasse":
      if (e.details.reussie === true) prestige(acteur, 2);
      break;
    case "soin":
      if (e.details.soiMeme !== true) prestige(acteur, 2);
      break;
    case "combat":
      if (e.details.issue !== "mort" && e.details.issue !== "fuite") prestige(acteur, 4);
      break;
    case "adoption":
      prestige(acteur, 3);
      break;
    case "naissance":
      prestige(acteur, 2);
      s.feteDuSoir = { genre: "naissance", sujet: String(e.details.prenom ?? "") };
      break;
    case "union": {
      prestige(acteur, 1);
      s.feteDuSoir = { genre: "union", sujet: String(e.details.prenoms ?? "") };
      const cible = monde.personnages.find((p) => p.id === String(e.details.cible ?? ""));
      if (acteur && cible) alliance(monde, acteur, cible);
      break;
    }
    case "deces":
      s.feteDuSoir = { genre: "funerailles", sujet: String(e.details.prenom ?? "") };
      break;
    case "repas": {
      // Manger devant un enfant affamé enfreint « les enfants d'abord ».
      if (acteur === undefined || acteur.corps.stade === "enfant") break;
      if (!estCoutume(s, "enfants_dabord")) break;
      const enfant = monde.personnages.find(
        (p) =>
          p.vivant &&
          p.corps.stade === "enfant" &&
          p.besoins.faim < 30 &&
          Grille.distance(p.corps.position, acteur.corps.position) <= 4,
      );
      if (enfant !== undefined && quantite(acteur.corps.inventaire, "baies") + 1 > 0)
        infraction(monde, acteur, "enfants_dabord", enfant);
      break;
    }
    default:
      break;
  }
}

/** Enfreindre une coutume devant témoins coûte : réputation, prestige, affinité des témoins. */
function infraction(
  monde: MondeSocial,
  coupable: Personnage,
  lecon: Lecon,
  lese: Personnage,
): void {
  const s = monde.societe;
  const tick = monde.horloge.tick;
  const temoins = monde.personnages.filter(
    (t) =>
      t.vivant &&
      !t.corps.endormi &&
      t.id !== coupable.id &&
      Grille.distance(t.corps.position, coupable.corps.position) <= 6,
  );
  if (temoins.length === 0) return;
  coupable.reputation = borner(coupable.reputation - 5, -100, 100);
  coupable.prestige = borner(coupable.prestige - 3, 0, 100);
  for (const t of temoins)
    ajusterRelation(
      relationAvec(t, coupable.id),
      t.identite.personnalite,
      coupable.identite.personnalite,
      { affinite: -5, confiance: -3 },
      tick,
    );
  s.compteurs.infractions += 1;
  monde.emettre(
    "coutume",
    coupable,
    {
      genre: "infraction",
      lecon,
      titre: LECONS[lecon].titre,
      lese: lese.id,
      temoins: temoins.length,
    },
    5,
    coupable.corps.position,
  );
}

/** Un mariage entre deux familles les allie : les abris s'ouvrent, une dot passe. */
function alliance(monde: MondeSocial, a: Personnage, b: Personnage): void {
  const s = monde.societe;
  const fa = a.identite.nomFamille;
  const fb = b.identite.nomFamille;
  if (fa === fb) return;
  ajouterTension(s, -10);
  const cle = cleAlliance(fa, fb);
  const nouvelle = !s.alliances.includes(cle);
  if (nouvelle) s.alliances.push(cle);
  // La dot : la famille la mieux pourvue donne trois portions à l'autre.
  const na = nourritureFamiliale(monde, fa);
  const nb = nourritureFamiliale(monde, fb);
  const [riche, pauvre] = na >= nb ? [fa, fb] : [fb, fa];
  const de = stockFamilial(monde, riche);
  const vers = stockFamilial(monde, pauvre);
  let dot = 0;
  if (de?.stock && vers?.stock && Math.abs(na - nb) >= 4) {
    for (const r of Object.keys(NOURRITURE) as (keyof typeof NOURRITURE)[]) {
      if (dot >= 3) break;
      dot += transferer(de.stock, vers.stock, r, Math.min(3 - dot, quantite(de.stock, r)));
    }
  }
  monde.emettre(
    "alliance",
    a,
    { cible: b.id, familles: cle, nouvelle, dot, de: riche, vers: pauvre },
    nouvelle ? 7 : 4,
  );
}

// ----------------------------------------------------------------- aube

/** Ce que l'aube fait à la société. */
export function aubeSociete(monde: MondeSocial): void {
  const s = monde.societe;
  const jour = jourDe(monde);
  // Le prestige s'érode ; les rancunes s'apaisent.
  for (const p of monde.personnages) {
    if (!p.vivant) continue;
    if (p.prestige > 0) p.prestige = Math.max(0, p.prestige - 1);
    for (const r of p.relations.values()) if (r.rancune > 0) r.rancune = Math.max(0, r.rancune - 1);
    // Fin d'un bannissement : le retour est possible.
    if (p.banni !== null && jour >= p.banni.jusquaJour) {
      const motif = p.banni.motif;
      p.banni = null;
      if (p.ambition?.genre === "migrer" && p.ambition.issue === "en_cours")
        p.ambition.issue = "abandonnee";
      monde.emettre("justice", p, { genre: "retour", motif }, 6);
      p.memoire.ajouter(
        monde.horloge.tick,
        "reflexion",
        "Mon exil est fini. On me laissera revenir.",
        7,
        [],
      );
    }
  }
  s.tension = Math.max(0, s.tension - 0.5);
  s.lieuxInterdits = s.lieuxInterdits.filter((l) => {
    if (jour < l.jusquaJour) return true;
    monde.emettre("tabou", null, { genre: "leve", x: l.x, y: l.y, motif: l.motif }, 3, {
      x: l.x,
      y: l.y,
    });
    return false;
  });
  mettreAJourCoutumes(monde);
  choisirMaitres(monde);
  if (jour % 7 === 0) s.factions = calculerFactions(monde);
  // Solstices : une fête le quinzième jour de l'été et de l'hiver.
  const moment = monde.horloge.moment();
  if ((moment.saison === "ete" || moment.saison === "hiver") && moment.jourDeSaison === 15)
    s.feteDuSoir = { genre: "solstice", sujet: moment.saison === "ete" ? "l'été" : "l'hiver" };
  deciderEnsemble(monde);
}

/** Une leçon connue de 60 % des adultes pendant trente jours devient coutume ; à 40 %, elle se perd. */
function mettreAJourCoutumes(monde: MondeSocial): void {
  const s = monde.societe;
  const jour = jourDe(monde);
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  const ad = adultes(monde);
  if (ad.length < 2) return;
  for (const lecon of Object.keys(LECONS) as Lecon[]) {
    const porteurs = ad.filter((p) => connait(p, lecon));
    const anciens = porteurs.filter(
      (p) => tick - (p.savoirs.get(lecon)?.depuis ?? tick) >= JOURS_COUTUME * T,
    );
    const part = porteurs.length / ad.length;
    const partAncienne = anciens.length / ad.length;
    const active = estCoutume(s, lecon);
    if (!active && partAncienne >= PART_COUTUME) {
      s.coutumes.push({ lecon, depuisJour: jour });
      // Ce qui est coutume, tout adulte le sait désormais.
      for (const p of ad) apprendre(p, lecon, 1, "la coutume", tick);
      monde.emettre(
        "coutume",
        null,
        {
          genre: "adoptee",
          lecon,
          titre: LECONS[lecon].titre,
          morale: LECONS[lecon].morale,
          part: Math.round(part * 100),
        },
        8,
      );
    } else if (active && part < PART_ABANDON) {
      s.coutumes = s.coutumes.filter((c) => c.lecon !== lecon);
      monde.emettre(
        "coutume",
        null,
        { genre: "abandonnee", lecon, titre: LECONS[lecon].titre, part: Math.round(part * 100) },
        6,
      );
    }
  }
}

/** Un adolescent choisit un maître : l'adulte qui sait le mieux faire ce qui l'attire. */
function choisirMaitres(monde: MondeSocial): void {
  const tick = monde.horloge.tick;
  for (const p of monde.personnages) {
    if (!p.vivant) continue;
    if (p.corps.stade !== "adolescent") {
      if (p.maitre !== null && p.corps.stade === "adulte") {
        monde.emettre("maitre", p, { genre: "fin", maitre: p.maitre }, 4);
        p.maitre = null;
      }
      continue;
    }
    const maitreActuel =
      p.maitre === null ? undefined : monde.personnages.find((m) => m.id === p.maitre);
    if (maitreActuel?.vivant) continue;
    const competence = meilleureCompetence(p);
    let meilleur: Personnage | null = null;
    let score = -Infinity;
    for (const m of adultes(monde)) {
      if (p.identite.parents?.includes(m.id) ?? false) continue;
      const n = niveau(m.experience[competence]);
      if (n < 1) continue;
      const autreFamille = m.identite.nomFamille !== p.identite.nomFamille;
      const sc = n + (autreFamille ? 1 : 0) + relationAvec(p, m.id).affinite / 50 + m.prestige / 40;
      if (sc > score) {
        score = sc;
        meilleur = m;
      }
    }
    if (meilleur === null) continue;
    p.maitre = meilleur.id;
    ajusterRelation(
      relationAvec(p, meilleur.id),
      p.identite.personnalite,
      meilleur.identite.personnalite,
      { affinite: 8, confiance: 8 },
      tick,
    );
    monde.emettre("maitre", p, { genre: "choisi", maitre: meilleur.id, competence }, 5);
  }
}

/** Les factions : des familles rapprochées par des amitiés ou des mariages. */
export function calculerFactions(monde: MondeSocial): Faction[] {
  const fam = familles(monde);
  const parent = new Map<string, string>(fam.map((f) => [f, f]));
  const racine = (f: string): string => {
    let r = f;
    while (parent.get(r) !== r) r = parent.get(r) ?? r;
    return r;
  };
  const unir = (a: string, b: string): void => {
    const ra = racine(a);
    const rb = racine(b);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  };
  for (const cle of monde.societe.alliances) {
    const [a, b] = cle.split("|");
    if (a !== undefined && b !== undefined && parent.has(a) && parent.has(b)) unir(a, b);
  }
  const ad = adultes(monde);
  for (let i = 0; i < fam.length; i++) {
    for (let j = i + 1; j < fam.length; j++) {
      const fa = fam[i];
      const fb = fam[j];
      if (fa === undefined || fb === undefined) continue;
      let total = 0;
      let n = 0;
      for (const p of ad) {
        if (p.identite.nomFamille !== fa) continue;
        for (const q of ad) {
          if (q.identite.nomFamille !== fb) continue;
          total += relationAvec(p, q.id).affinite + relationAvec(q, p.id).affinite;
          n += 2;
        }
      }
      if (n > 0 && total / n >= 20) unir(fa, fb);
    }
  }
  const groupes = new Map<string, string[]>();
  for (const f of fam) {
    const r = racine(f);
    const g = groupes.get(r) ?? [];
    g.push(f);
    groupes.set(r, g);
  }
  return [...groupes.values()]
    .map((fs) => {
      const membres = ad.filter((p) => fs.includes(p.identite.nomFamille));
      const chef = [...fs].sort(
        (a, b) =>
          membres.filter((p) => p.identite.nomFamille === b).reduce((t, p) => t + p.prestige, 0) -
            membres
              .filter((p) => p.identite.nomFamille === a)
              .reduce((t, p) => t + p.prestige, 0) || a.localeCompare(b),
      )[0];
      return { nom: chef ?? fs[0] ?? "", familles: [...fs].sort(), membres: membres.length };
    })
    .sort((a, b) => b.membres - a.membres || a.nom.localeCompare(b.nom));
}

/** Faction d'une famille (son nom), ou la famille elle-même. */
export function factionDe(societe: EtatSociete, famille: string): string {
  return societe.factions.find((f) => f.familles.includes(famille))?.nom ?? famille;
}

// ------------------------------------------------------ décisions

/**
 * Une décision collective au plus tous les dix jours : ouvrir les stocks en
 * hiver, creuser un puits commun. Le vote est pondéré par le prestige.
 */
function deciderEnsemble(monde: MondeSocial): void {
  const s = monde.societe;
  const jour = jourDe(monde);
  if (jour - s.derniereDecisionJour < JOURS_ENTRE_DECISIONS) return;
  const ad = adultes(monde).filter((p) => !estBanni(monde, p));
  if (ad.length < 3) return;
  const saison = monde.horloge.moment().saison;
  const froid = saison === "hiver" || saison === "automne";
  // Ouvrir les stocks : quelqu'un a faim, sa famille n'a rien, une autre a de quoi.
  if (froid && jour >= s.stocksOuvertsJusquaJour) {
    const affame = ad.find(
      (p) => p.besoins.faim < 35 && nourritureFamiliale(monde, p.identite.nomFamille) < 5,
    );
    const riche = familles(monde).some((f) => nourritureFamiliale(monde, f) >= 20);
    if (affame !== undefined && riche) {
      voter(
        monde,
        ad,
        "stocks",
        "ouvrir les stocks à tous pour vingt jours",
        (p) => {
          const mienne = nourritureFamiliale(monde, p.identite.nomFamille);
          if (mienne < 20) return true;
          if (connait(p, "partager_en_hiver") || estCoutume(s, "partager_en_hiver")) return true;
          return (
            p.identite.personnalite.agreabilite > 0.6 || p.identite.valeurs.includes("harmonie")
          );
        },
        () => {
          s.stocksOuvertsJusquaJour = jour + 20;
          ajouterTension(s, -3);
        },
        () => {
          ajouterTension(s, 4);
        },
      );
      return;
    }
  }
  // Un puits commun : la leçon est connue, personne n'en a bâti, le village est assez grand.
  const puits = [...monde.batiments.values()].some((b) => b.type === "puits");
  if (
    !puits &&
    ad.length >= 6 &&
    (estCoutume(s, "puits_pres_du_village") || ad.some((p) => connait(p, "puits_pres_du_village")))
  ) {
    const centre = centreVillage(monde);
    if (centre !== null) {
      voter(
        monde,
        ad,
        "puits",
        "creuser un puits commun au milieu du village",
        (p) =>
          connait(p, "puits_pres_du_village") ||
          p.identite.personnalite.conscience > 0.5 ||
          p.identite.valeurs.includes("securite"),
        () => {
          const site = siteLibre(monde, centre, 6);
          const fondateur = notables(monde)[0] ?? ad[0];
          if (site !== null && fondateur !== undefined) {
            const b = monde.fonderChantier("puits", site, fondateur);
            b.commun = true;
          }
        },
        () => {
          ajouterTension(s, 2);
        },
      );
    }
  }
}

function siteLibre(monde: Monde, centre: Position, rayon: number): Position | null {
  for (let r = 0; r <= rayon; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const t = monde.grille.tuileOuNull(centre.x + dx, centre.y + dy);
        if (
          t !== null &&
          t.batiment === null &&
          t.gisement === null &&
          monde.grille.estPraticable(t.x, t.y)
        )
          return { x: t.x, y: t.y };
      }
  return null;
}

function voter(
  monde: MondeSocial,
  votants: readonly Personnage[],
  sujet: SujetDecision,
  libelle: string,
  pour: (p: Personnage) => boolean,
  siAdoptee: () => void,
  siRejetee: () => void,
): Decision {
  const s = monde.societe;
  let oui = 0;
  let non = 0;
  for (const p of votants) {
    if (pour(p)) oui += poidsDeVote(p);
    else non += poidsDeVote(p);
  }
  const adoptee = oui > non;
  const decision: Decision = {
    jour: jourDe(monde),
    sujet,
    libelle,
    pour: Math.round(oui * 10) / 10,
    contre: Math.round(non * 10) / 10,
    adoptee,
  };
  s.decisions.push(decision);
  if (s.decisions.length > 20) s.decisions.shift();
  s.derniereDecisionJour = decision.jour;
  if (adoptee) siAdoptee();
  else siRejetee();
  monde.emettre(
    "decision",
    null,
    { sujet, libelle, pour: decision.pour, contre: decision.contre, adoptee },
    7,
    centreVillage(monde),
  );
  return decision;
}

// --------------------------------------------------------------- soirée

/**
 * La veillée (21 h) : les adultes éveillés se retrouvent autour du feu le plus
 * fréquenté. On s'y rapproche, on y transmet un savoir, on y juge les griefs ;
 * les soirs de fête, tout le village y est.
 */
export function soireeSociete(monde: MondeSocial): void {
  const s = monde.societe;
  const tick = monde.horloge.tick;
  amitiesDEnfance(monde);
  const fete = s.feteDuSoir;
  s.feteDuSoir = null;
  const eveilles = adultes(monde).filter((p) => !p.corps.endormi && !estBanni(monde, p));
  // Le feu le plus fréquenté.
  let feu: Batiment | null = null;
  let autour: Personnage[] = [];
  for (const b of monde.batiments.values()) {
    if (b.etat !== "termine" || !b.allume || PLANS_BATIMENT[b.type].atelier !== "feu") continue;
    const proches = eveilles.filter(
      (p) => Grille.distance(p.corps.position, b.position) <= RAYON_VEILLEE,
    );
    if (
      proches.length > autour.length ||
      (proches.length === autour.length && feu !== null && b.id < feu.id)
    ) {
      feu = b;
      autour = proches;
    }
  }
  if (feu === null || autour.length < ADULTES_VEILLEE) return;
  // Sous tension, chaque faction veille de son côté : seule la faction majoritaire reste.
  if (s.tension >= TENSION_SCISSION && fete === null) {
    const compte = new Map<string, number>();
    for (const p of autour) {
      const f = factionDe(s, p.identite.nomFamille);
      compte.set(f, (compte.get(f) ?? 0) + 1);
    }
    const majoritaire = [...compte.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0]?.[0];
    autour = autour.filter((p) => factionDe(s, p.identite.nomFamille) === majoritaire);
    if (autour.length < ADULTES_VEILLEE) return;
  }
  const rng = monde.rng.fork(`veillee/${String(tick)}`);
  // On se rassemble en cercle autour du feu, et on y reste une heure.
  placerEnCercle(monde, feu.position, autour);
  const gainAffinite = fete === null ? 2 : 4;
  for (const p of autour) {
    p.besoins.social = clamp(p.besoins.social + 10);
    p.besoins.moral = clamp(p.besoins.moral + (fete === null ? 3 : 6));
    if (fete !== null) ajouterHumeur(p, "fete", 8, 2 * monde.horloge.ticksParJour, tick);
    for (const q of autour) {
      if (q.id === p.id) continue;
      ajusterRelation(
        relationAvec(p, q.id),
        p.identite.personnalite,
        q.identite.personnalite,
        { affinite: gainAffinite, confiance: 1 },
        tick,
      );
    }
  }
  // Un savoir passe de qui sait à qui ne sait pas.
  let transmis: Lecon | null = null;
  const paires: [Personnage, Personnage, Lecon][] = [];
  for (const lecon of Object.keys(LECONS) as Lecon[]) {
    const sachants = autour.filter((p) => connait(p, lecon));
    const ignorants = autour.filter((p) => !connait(p, lecon));
    if (sachants.length === 0 || ignorants.length === 0) continue;
    for (const a of sachants) for (const b of ignorants) paires.push([a, b, lecon]);
  }
  if (paires.length > 0) {
    const [conteur, auditeur, lecon] = rng.choisir(paires);
    if (
      apprendre(
        auditeur,
        lecon,
        0.7,
        conteur.savoirs.get(lecon)?.origine ?? conteur.identite.prenom,
        tick,
      )
    ) {
      transmis = lecon;
      auditeur.memoire.ajouter(
        tick,
        "dialogue",
        `À la veillée, ${conteur.identite.prenom} a raconté : ${LECONS[lecon].morale}`,
        6,
        [conteur.id],
      );
      conteur.prestige = borner(conteur.prestige + 1, 0, 100);
    }
  }
  s.compteurs.veillees += 1;
  if (fete !== null) {
    s.compteurs.fetes += 1;
    ajouterTension(s, -5);
    if (fete.genre === "funerailles")
      for (const p of autour) {
        const i = p.humeur.findIndex((m) => m.cle.startsWith("deuil:"));
        const deuil = p.humeur[i];
        if (deuil !== undefined) p.humeur[i] = { ...deuil, valeur: Math.min(0, deuil.valeur + 3) };
      }
  } else ajouterTension(s, -1);
  s.derniereVeillee = {
    tick,
    x: feu.position.x,
    y: feu.position.y,
    participants: autour.map((p) => p.id),
    fete: fete === null ? null : fete.genre,
  };
  monde.emettre(
    "veillee",
    null,
    {
      feu: feu.id,
      participants: autour.length,
      noms: autour.map((p) => p.identite.prenom).join(", "),
      fete: fete?.genre ?? null,
      sujet: fete?.sujet ?? null,
      transmis,
    },
    fete === null ? 4 : 7,
    feu.position,
  );
  for (const p of autour)
    p.memoire.ajouter(
      tick,
      "observation",
      fete === null
        ? `Veillée autour du feu avec ${autour.length - 1} des nôtres.`
        : `Fête ${libelleFete(fete.genre, fete.sujet)} autour du feu : nous étions ${String(autour.length)}.`,
      fete === null ? 3 : 6,
      autour.filter((q) => q.id !== p.id).map((q) => q.id),
      feu.position,
    );
  // La palabre : les griefs ouverts se jugent devant tous.
  jugerLesGriefs(monde, autour, feu.position);
  prixDuSang(monde, autour);
}

export function libelleFete(genre: string, sujet: string | null): string {
  switch (genre) {
    case "naissance":
      return `pour la naissance de ${sujet ?? "l'enfant"}`;
    case "union":
      return `pour l'union de ${sujet ?? "deux des nôtres"}`;
    case "funerailles":
      return `des funérailles de ${sujet ?? "l'un des nôtres"}`;
    case "solstice":
      return `du solstice de ${sujet ?? "la saison"}`;
    default:
      return genre;
  }
}

function placerEnCercle(monde: Monde, centre: Position, gens: Personnage[]): void {
  const places: Position[] = [];
  for (let r = 1; r <= 3 && places.length < gens.length; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const t = monde.grille.tuileOuNull(centre.x + dx, centre.y + dy);
        if (t?.batiment !== null || !monde.grille.estPraticable(t.x, t.y)) continue;
        places.push({ x: t.x, y: t.y });
      }
  }
  gens.forEach((p, i) => {
    const place = places[i];
    if (place === undefined) return;
    p.corps.position = { x: place.x, y: place.y };
    p.plan = [{ type: "attendre", ticksRestants: 6 }];
    p.actionEnCours = null;
  });
}

/** Les enfants de familles différentes qui jouent ensemble le soir se lient ; le village s'en apaise. */
function amitiesDEnfance(monde: MondeSocial): void {
  const tick = monde.horloge.tick;
  const jeunes = monde.personnages.filter(
    (p) =>
      p.vivant &&
      !p.corps.endormi &&
      (p.corps.stade === "enfant" || p.corps.stade === "adolescent"),
  );
  for (const a of jeunes)
    for (const b of jeunes) {
      if (a.id >= b.id || a.identite.nomFamille === b.identite.nomFamille) continue;
      if (Grille.distance(a.corps.position, b.corps.position) > 6) continue;
      ajusterRelation(
        relationAvec(a, b.id),
        a.identite.personnalite,
        b.identite.personnalite,
        { affinite: 2, confiance: 1 },
        tick,
      );
      ajusterRelation(
        relationAvec(b, a.id),
        b.identite.personnalite,
        a.identite.personnalite,
        { affinite: 2, confiance: 1 },
        tick,
      );
      monde.societe.tension = Math.max(0, monde.societe.tension - 0.3);
    }
}

/**
 * La justice réparatrice : un grief se juge à la veillée. L'accusé répare
 * s'il le peut ; sinon, s'il est déjà mal vu ou récidiviste, le village vote
 * son exil ; sinon on lui pardonne.
 */
function jugerLesGriefs(monde: MondeSocial, presents: Personnage[], lieu: Position): void {
  const s = monde.societe;
  const jour = jourDe(monde);
  const tick = monde.horloge.tick;
  for (const g of s.griefs) {
    if (g.etat !== "ouvert") continue;
    const accuse = monde.personnages.find((p) => p.id === g.accuse);
    const plaignant = monde.personnages.find((p) => p.id === g.plaignant);
    if (accuse === undefined || plaignant === undefined || !accuse.vivant) {
      g.etat = "pardonne";
      g.jugeJour = jour;
      continue;
    }
    if (!presents.some((p) => p.id === accuse.id)) continue; // on ne juge pas un absent
    s.compteurs.palabres += 1;
    g.jugeJour = jour;
    // Réparer : rendre le double, en nourriture, de sa poche ou du stock familial.
    const du = g.motif === "vol" ? 2 * Math.max(1, Number.parseInt(g.details, 10) || 1) : 3;
    const vers =
      stockFamilial(monde, plaignant.identite.nomFamille)?.stock ?? plaignant.corps.inventaire;
    const sources = [
      accuse.corps.inventaire,
      stockFamilial(monde, accuse.identite.nomFamille)?.stock ?? null,
    ];
    let rendu = 0;
    for (const src of sources) {
      if (src === null) continue;
      for (const r of Object.keys(NOURRITURE) as (keyof typeof NOURRITURE)[]) {
        if (rendu >= du) break;
        rendu += transferer(src, vers, r, Math.min(du - rendu, quantite(src, r)));
      }
    }
    const recidive = s.griefs.some(
      (x) => x.id !== g.id && x.accuse === accuse.id && x.etat !== "ouvert",
    );
    let issue: IssueGrief;
    if (rendu >= du) {
      issue = "repare";
      s.compteurs.reparations += 1;
      accuse.reputation = borner(accuse.reputation + 5, -100, 100);
      accuse.prestige = borner(accuse.prestige + 2, 0, 100);
      relationAvec(plaignant, accuse.id).rancune = Math.max(
        0,
        relationAvec(plaignant, accuse.id).rancune - 30,
      );
      ajouterTension(s, -2);
    } else if (accuse.reputation <= -30 || recidive) {
      const decision = voter(
        monde,
        presents,
        "exil",
        `bannir ${accuse.identite.prenom} pour ${JOURS_EXIL} jours`,
        (p) =>
          p.id !== accuse.id &&
          !(p.identite.nomFamille === accuse.identite.nomFamille) &&
          relationAvec(p, accuse.id).affinite < 10,
        () => undefined,
        () => undefined,
      );
      if (decision.adoptee) {
        issue = "exil";
        bannir(monde, accuse, `${g.motif} (${g.details})`);
      } else {
        issue = "pardonne";
        ajouterTension(s, 3);
      }
    } else {
      issue = "pardonne";
      relationAvec(plaignant, accuse.id).rancune = Math.max(
        0,
        relationAvec(plaignant, accuse.id).rancune - 15,
      );
      accuse.reputation = borner(accuse.reputation + 2, -100, 100);
    }
    g.etat = issue;
    monde.emettre(
      "palabre",
      accuse,
      {
        grief: g.id,
        motif: g.motif,
        details: g.details,
        plaignant: plaignant.id,
        issue,
        rendu,
        presents: presents.length,
      },
      7,
      lieu,
    );
    accuse.memoire.ajouter(
      tick,
      "observation",
      issue === "repare"
        ? `À la veillée, on m'a demandé des comptes pour ${g.details} ; j'ai rendu ce que je devais.`
        : issue === "exil"
          ? `Le village m'a banni pour ${JOURS_EXIL} jours. Je pars, loin, avec ma honte.`
          : `On m'a reproché ${g.details} devant tous, puis on m'a pardonné.`,
      issue === "exil" ? 10 : 7,
      [plaignant.id],
      lieu,
    );
    if (issue === "pardonne") {
      ajusterRelation(
        relationAvec(plaignant, accuse.id),
        plaignant.identite.personnalite,
        accuse.identite.personnalite,
        { affinite: 4 },
        tick,
      );
    }
  }
}

/** Bannir : plus d'accès aux bâtiments, et l'ambition de s'établir à quarante tuiles. */
export function bannir(monde: MondeSocial, p: Personnage, motif: string): void {
  const s = monde.societe;
  const jour = jourDe(monde);
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  p.banni = { depuisJour: jour, jusquaJour: jour + JOURS_EXIL, motif };
  const centre = centreVillage(monde) ?? { ...p.corps.position };
  if (p.ambition !== null && p.ambition.issue === "en_cours") p.ambition.issue = "abandonnee";
  p.ambition = {
    genre: "migrer",
    cible: "exil",
    origine: { x: centre.x, y: centre.y },
    but: "vivre loin du village le temps de l'exil",
    pensee: "Ils m'ont chassé. Je vivrai seul, plus loin, et je reviendrai quand ce sera fini.",
    depuis: tick,
    jusqua: tick + JOURS_EXIL * T,
    issue: "en_cours",
    lieuxAuDepart: p.connaissance.size,
  };
  p.projet = null;
  p.plan = [];
  p.actionEnCours = null;
  p.intention = null;
  p.reputation = borner(p.reputation - 10, -100, 100);
  ajouterHumeur(p, "exil", -15, 20 * T, tick);
  s.compteurs.exils += 1;
  ajouterTension(s, 8);
  monde.emettre("justice", p, { genre: "exil", motif, jours: JOURS_EXIL }, 9, p.corps.position);
}

/** Le prix du sang : qui est haï d'une famille présente peut l'effacer en donnant six portions. */
function prixDuSang(monde: MondeSocial, presents: Personnage[]): void {
  const tick = monde.horloge.tick;
  for (const hai of presents) {
    const haineurs = presents.filter(
      (p) => p.id !== hai.id && (p.relations.get(hai.id)?.haine ?? false),
    );
    if (haineurs.length === 0) continue;
    const famille = haineurs[0]?.identite.nomFamille;
    if (famille === undefined) continue;
    const vers = stockFamilial(monde, famille)?.stock ?? haineurs[0]?.corps.inventaire;
    if (vers === undefined) continue;
    const sources = [
      hai.corps.inventaire,
      stockFamilial(monde, hai.identite.nomFamille)?.stock ?? null,
    ];
    let donne = 0;
    for (const src of sources) {
      if (src === null) continue;
      for (const r of Object.keys(NOURRITURE) as (keyof typeof NOURRITURE)[]) {
        if (donne >= 6) break;
        donne += transferer(src, vers, r, Math.min(6 - donne, quantite(src, r)));
      }
    }
    if (donne < 6) continue;
    for (const p of monde.personnages) {
      if (p.identite.nomFamille !== famille) continue;
      const r = p.relations.get(hai.id);
      if (r?.haine) {
        r.haine = false;
        r.rancune = 0;
      }
    }
    ajouterTension(monde.societe, -6);
    monde.emettre("justice", hai, { genre: "prix_du_sang", famille, donne }, 8, hai.corps.position);
    hai.memoire.ajouter(
      tick,
      "observation",
      `J'ai payé le prix du sang aux ${famille} : six portions, et la haine est levée.`,
      8,
      haineurs.map((p) => p.id),
    );
  }
}

// ---------------------------------------------------------------- heure

/** Chaque heure : les rancunes trop fortes finissent en rixe entre voisins éveillés. */
export function heureSociete(monde: MondeSocial): void {
  const s = monde.societe;
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  const ad = adultes(monde).filter((p) => !p.corps.endormi);
  for (const a of ad) {
    for (const r of a.relations.values()) {
      if (r.rancune < SEUIL_RIXE) continue;
      // Une rancune modérée n'éclate que si le village est déjà tendu.
      if (r.rancune < 80 && s.tension < 40) continue;
      const b = ad.find((x) => x.id === r.cible);
      if (b === undefined || Grille.distance(a.corps.position, b.corps.position) > 2) continue;
      const cle = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      if (tick - (s.rixes.get(cle) ?? -Infinity) < JOURS_ENTRE_RIXES * T) continue;
      rixe(monde, a, b);
      s.rixes.set(cle, tick);
      return; // une rixe par heure suffit
    }
  }
}

/** La rixe à mains nues : le plus fort l'emporte, le perdant est contusionné, les deux y perdent. */
export function rixe(monde: MondeSocial, a: Personnage, b: Personnage): void {
  const s = monde.societe;
  const tick = monde.horloge.tick;
  const forceDe = (p: Personnage): number =>
    phenotype(p.identite.genome, "force") + p.rng.suivant() * 0.4 - (p.corps.sante < 50 ? 0.3 : 0);
  const [gagnant, perdant] = forceDe(a) >= forceDe(b) ? [a, b] : [b, a];
  blesser(monde, perdant, "coupure", 1, "flanc", "dans une rixe");
  perdant.besoins.moral = clamp(perdant.besoins.moral - 10);
  for (const p of [a, b]) {
    p.reputation = borner(p.reputation - 5, -100, 100);
    p.prestige = borner(p.prestige - 2, 0, 100);
    const r = relationAvec(p, p === a ? b.id : a.id);
    r.rancune = 20;
    ajusterRelation(
      r,
      p.identite.personnalite,
      (p === a ? b : a).identite.personnalite,
      { affinite: -8, confiance: -8 },
      tick,
    );
  }
  const temoins = monde.personnages.filter(
    (t) =>
      t.vivant &&
      !t.corps.endormi &&
      t.id !== a.id &&
      t.id !== b.id &&
      Grille.distance(t.corps.position, a.corps.position) <= 6,
  );
  for (const t of temoins)
    for (const p of [a, b])
      ajusterRelation(
        relationAvec(t, p.id),
        t.identite.personnalite,
        p.identite.personnalite,
        { affinite: -3 },
        tick,
      );
  // Un grief ouvert entre les deux se règle dans la rixe.
  for (const g of s.griefs)
    if (
      g.etat === "ouvert" &&
      ((g.accuse === a.id && g.plaignant === b.id) || (g.accuse === b.id && g.plaignant === a.id))
    ) {
      g.etat = "rixe";
      g.jugeJour = jourDe(monde);
    }
  s.compteurs.rixes += 1;
  ajouterTension(s, 3);
  monde.emettre(
    "rixe",
    gagnant,
    { cible: perdant.id, temoins: temoins.length },
    7,
    a.corps.position,
  );
  perdant.memoire.ajouter(
    tick,
    "action",
    `${gagnant.identite.prenom} et moi en sommes venus aux mains ; j'ai eu le dessous.`,
    7,
    [gagnant.id],
    a.corps.position,
  );
  gagnant.memoire.ajouter(
    tick,
    "action",
    `${perdant.identite.prenom} et moi en sommes venus aux mains ; j'ai eu le dessus.`,
    6,
    [perdant.id],
    a.corps.position,
  );
}

// ----------------------------------------------------------------- mort

/**
 * Une mort et ses suites sociales : deuil violent, haine héréditaire quand
 * quelqu'un a laissé mourir de faim, lieu interdit quand la mort est
 * inexplicable.
 */
export function mortSociete(monde: MondeSocial, defunt: Personnage, cause: string): void {
  const s = monde.societe;
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  const jour = jourDe(monde);
  const famille = monde.personnages.filter(
    (p) => p.vivant && p.id !== defunt.id && p.identite.nomFamille === defunt.identite.nomFamille,
  );
  if (CAUSES_VIOLENTES.has(cause)) {
    for (const p of famille) {
      p.drapeaux.traumatiseJusqua = tick + 30 * T;
      ajouterHumeur(p, "traumatisme", -15, 30 * T, tick);
    }
  }
  // Mort de faim peu après un refus : la famille hait celui qui a refusé, et ses enfants après elle.
  const refus = defunt.drapeaux.refusePar;
  if (cause === "faim" && refus !== null && tick - refus.tick <= 3 * T) {
    const coupable = monde.personnages.find((p) => p.id === refus.id);
    if (coupable !== undefined && coupable.identite.nomFamille !== defunt.identite.nomFamille) {
      for (const p of famille) {
        const r = relationAvec(p, coupable.id);
        r.haine = true;
        r.rancune = 100;
        r.affinite = Math.min(r.affinite, -40);
      }
      ajouterTension(s, 6);
      monde.emettre(
        "justice",
        coupable,
        { genre: "haine", defunt: defunt.id, famille: defunt.identite.nomFamille },
        8,
        defunt.corps.position,
      );
    }
  }
  // Une mort inexplicable rend le lieu interdit pour une saison.
  const maladie = !CAUSES_EXPLIQUEES.has(cause);
  if (maladie && cause !== "rixe") {
    const pos = defunt.corps.position;
    if (lieuInterdit(monde, pos) === null) {
      s.lieuxInterdits.push({
        x: pos.x,
        y: pos.y,
        rayon: RAYON_TABOU,
        jusquaJour: jour + JOURS_TABOU,
        motif: `${defunt.identite.prenom}, ${cause}`,
      });
      monde.emettre(
        "tabou",
        defunt,
        {
          genre: "lieu_interdit",
          x: pos.x,
          y: pos.y,
          rayon: RAYON_TABOU,
          jours: JOURS_TABOU,
          cause,
        },
        7,
        pos,
      );
    }
  }
}

/** Un nouveau-né hérite des haines de ses parents. */
export function naissanceSociete(enfant: Personnage, mere: Personnage, pere: Personnage): void {
  for (const parent of [mere, pere])
    for (const r of parent.relations.values()) {
      if (!r.haine) continue;
      const mienne = relationAvec(enfant, r.cible);
      mienne.haine = true;
      mienne.affinite = Math.min(mienne.affinite, -20);
    }
}

// -------------------------------------------------------- recueillement

/**
 * La tombe d'où vient une leçon connue, à vingt tuiles, si l'on ne s'y est pas
 * recueilli depuis une saison.
 */
export function tombeARecueillir(monde: MondeSocial, p: Personnage): Position | null {
  if (p.corps.stade === "enfant") return null;
  const jour = jourDe(monde);
  if (jour - p.drapeaux.recueilliJour < JOURS_ENTRE_RECUEILLEMENTS) return null;
  const origines = new Set<string>();
  for (const [s, v] of p.savoirs) if (s in LECONS && v.origine !== null) origines.add(v.origine);
  if (origines.size === 0) return null;
  let meilleure: Batiment | null = null;
  let d = 20;
  for (const b of monde.batiments.values()) {
    if (b.type !== "tombe" || b.epitaphe === null) continue;
    const prenom = b.epitaphe.split(",")[0]?.replace(/^Ici repose /, "") ?? "";
    if (!origines.has(prenom)) continue;
    const dist = Grille.distance(p.corps.position, b.position);
    if (dist < d) {
      d = dist;
      meilleure = b;
    }
  }
  return meilleure === null ? null : { ...meilleure.position };
}

/** Se recueillir sur une tombe : le moral remonte, la foi un peu, on s'en souvient. */
export function seRecueillir(monde: MondeSocial, p: Personnage, pos: Position): void {
  const tick = monde.horloge.tick;
  p.drapeaux.recueilliJour = jourDe(monde);
  p.besoins.moral = clamp(p.besoins.moral + 6);
  p.foi = Math.min(10, p.foi + 0.3);
  const tombe = monde.grille.tuileOuNull(pos.x, pos.y)?.batiment ?? null;
  const epitaphe = tombe?.epitaphe ?? "";
  monde.emettre("recueillement", p, { epitaphe }, 4, pos);
  p.memoire.ajouter(
    tick,
    "reflexion",
    `Je me suis recueilli sur une tombe. ${epitaphe}`,
    5,
    [],
    pos,
  );
  // Qui se recueille gagne un peu d'expérience sociale : on y parle aux morts, et aux vivants.
  gagnerExperience(p.experience, "persuasion", 1);
}

/** L'apprenti près de son maître apprend : chaque soir, un peu d'expérience et parfois un savoir. */
export function apprentissageDuSoir(monde: MondeSocial, p: Personnage): void {
  if (p.maitre === null) return;
  const maitre = monde.personnages.find((m) => m.id === p.maitre);
  if (!maitre?.vivant) return;
  if (Grille.distance(p.corps.position, maitre.corps.position) > 8) return;
  const competence = meilleureCompetence(p);
  gagnerExperience(p.experience, competence, 2);
  const rng = p.rng;
  if (rng.chance(0.3)) {
    for (const [s, v] of maitre.savoirs) {
      if (v.force < 1) continue;
      if (apprendre(p, s, 0.8, v.origine ?? maitre.identite.prenom, monde.horloge.tick)) break;
    }
  }
}
