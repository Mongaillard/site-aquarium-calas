/**
 * « Demander à Claude » : quand le cerveau à règles est à court (besoin
 * ressenti sans idée, inconfort chronique, échecs répétés, aucun projet), un
 * personnage pose une question. Le moteur construit le contexte et un
 * catalogue fermé d'options ; Claude choisit ; le moteur applique, journalise
 * (`conseil`) et suit l'ambition qui en naît (`ambition`). Tout est mesurable
 * et déterministe ici : la page ne fait que mettre la question en mots.
 */
import type { ContexteConseil, OptionConseil, QuestionConseil } from "@sdv/protocole";
import type { Ambition, Personnage } from "../agents/personnage.js";
import type { Intention } from "../actions/types.js";
import { INVENTIONS, LECONS, SEUIL_SAVOIR, titreSavoir } from "../savoirs/catalogue.js";
import type { Invention, Lecon } from "../savoirs/catalogue.js";
import { besoinRessenti } from "../savoirs/inventions.js";
import { apprendre } from "../savoirs/lecons.js";
import {
  DISTANCE_MIGRATION,
  batimentsAccessibles,
  estEau,
  grainesAccessibles,
  membresFamille,
  prochainBatimentNecessaire,
} from "../monde.js";
import type { Monde } from "../monde.js";
import { PLANS_BATIMENT } from "../monde/batiments.js";
import type { TypeBatiment } from "../monde/batiments.js";
import { INFO_BIOME } from "../monde/biomes.js";
import { Grille } from "../monde/grille.js";
import { betesDe, enclosDe } from "../monde/village.js";

export const MOTIFS = [
  "besoin_sans_idee",
  "inconfort_chronique",
  "echec_repete",
  "sans_projet",
  "observateur",
] as const;
export type Motif = (typeof MOTIFS)[number];

export const POIDS_MOTIF: Readonly<Record<Motif, number>> = {
  besoin_sans_idee: 2,
  inconfort_chronique: 3,
  echec_repete: 3,
  sans_projet: 1,
  observateur: 10,
};

/** Somme des poids à partir de laquelle on demande conseil. */
export const SEUIL_CONSEIL = 2;
/** Délai entre deux questions d'une même personne (et pour le bouton de l'observateur). */
export const JOURS_ENTRE_CONSEILS = 5;
export const JOURS_ENTRE_CONSEILS_OBSERVATEUR = 1;
/** Une question non répondue expire après un jour. */
export const JOURS_EXPIRATION = 1;
export const FILE_MAX = 4;
/** Durée par défaut d'une ambition, si Claude n'en donne pas. */
export const JOURS_AMBITION = 7;
export const JOURS_AMBITION_EXPLORER = 4;
/** Lieux à découvrir pour accomplir une ambition d'exploration. */
export const LIEUX_A_DECOUVRIR = 12;
/** Bonus de score du cerveau à règles sur les candidats de la priorité choisie. */
export const BONUS_PRIORITE = 0.35;

export const PRIORITES = ["provisions", "chaleur", "social", "soin", "explorer"] as const;
export type Priorite = (typeof PRIORITES)[number];

export const DIRECTIONS: Readonly<Record<string, readonly [number, number]>> = {
  nord: [0, -1],
  est: [1, 0],
  sud: [0, 1],
  ouest: [-1, 0],
  nord_est: [1, -1],
  sud_est: [1, 1],
  sud_ouest: [-1, 1],
  nord_ouest: [-1, -1],
};

const LIBELLES_DIRECTION: Readonly<Record<string, string>> = {
  nord: "au nord",
  est: "à l'est",
  sud: "au sud",
  ouest: "à l'ouest",
  nord_est: "au nord-est",
  sud_est: "au sud-est",
  sud_ouest: "au sud-ouest",
  nord_ouest: "au nord-ouest",
};

const LIBELLES_PRIORITE: Readonly<Record<Priorite, string>> = {
  provisions: "remplir les stocks avant tout",
  chaleur: "se mettre au chaud avant tout",
  social: "prendre soin des siens et des veillées",
  soin: "soigner et se soigner d'abord",
  explorer: "partir voir plus loin",
};

const BATIMENTS_CONSEILLABLES: readonly TypeBatiment[] = [
  "abri",
  "feu_de_camp",
  "entrepot",
  "maison",
  "puits",
  "fumoir",
  "enclos",
  "champ",
  "palissade",
];

/** Inventions dont on a l'idée sans avoir réussi le prototype. */
export function ideesEnCours(p: Personnage): Invention[] {
  return [...p.savoirs.entries()]
    .filter(([k, v]) => k in INVENTIONS && v.force >= SEUIL_SAVOIR && v.force < 1)
    .map(([k]) => k as Invention);
}

function connaitSavoir(p: Personnage, s: Invention | Lecon): boolean {
  return (p.savoirs.get(s)?.force ?? 0) >= SEUIL_SAVOIR;
}

/** Y a-t-il ce soir un besoin ressenti qu'aucune idée ne vient combler ? */
export function besoinSansIdee(monde: Monde, p: Personnage): boolean {
  if (ideesEnCours(p).length > 0) return false;
  return (Object.keys(INVENTIONS) as Invention[]).some(
    (i) => !connaitSavoir(p, i) && besoinRessenti(monde, p, i),
  );
}

/** Les motifs mesurables d'une demande de conseil, ce soir, pour cette personne. */
export function motifsDeConseil(monde: Monde, p: Personnage): Motif[] {
  const d = p.drapeaux;
  const motifs: Motif[] = [];
  if (p.corps.stade === "enfant" || p.corps.stade === "adolescent") return motifs;
  if (d.soirsSansIdee >= 3 && ideesEnCours(p).length === 0) motifs.push("besoin_sans_idee");
  if (d.joursFaim >= 3 || d.joursFroid >= 3 || d.joursMoralBas >= 4)
    motifs.push("inconfort_chronique");
  if (p.echecsConsecutifs >= 4) motifs.push("echec_repete");
  if (
    p.projet === null &&
    prochainBatimentNecessaire(monde, p) === null &&
    ideesEnCours(p).length === 0 &&
    monde.horloge.moment().jourAbsolu >= 10 &&
    p.ambition?.issue !== "en_cours"
  )
    motifs.push("sans_projet");
  return motifs;
}

export function scoreMotifs(motifs: readonly Motif[]): number {
  let s = 0;
  for (const m of motifs) s += POIDS_MOTIF[m];
  return s;
}

/** Leçons inconnues, de la plus utile à la moins utile dans la situation. */
export function leconsUtiles(monde: Monde, p: Personnage): { lecon: Lecon; pourquoi: string }[] {
  const saison = monde.horloge.moment().saison;
  const froid = saison === "automne" || saison === "hiver";
  const enfants = membresFamille(monde, p).filter((m) => m.corps.stade === "enfant").length;
  const acces = batimentsAccessibles(monde, p);
  const puits = [...monde.batiments.values()].some((b) => b.type === "puits");
  const blesse = p.corps.etat.blessures.length > 0;
  const loups = [...monde.troupeaux.values()].some((t) => t.espece === "loup" && t.taille > 0);
  const regles: { lecon: Lecon; ok: boolean; pourquoi: string }[] = [
    {
      lecon: "provisions_hiver",
      ok: froid || p.drapeaux.joursFaim > 0,
      pourquoi: froid ? "la saison froide est là" : "la faim revient",
    },
    {
      lecon: "rentrer_quand_on_gele",
      ok: p.drapeaux.joursFroid > 0 || froid,
      pourquoi: "on a grelotté ces jours-ci",
    },
    { lecon: "vetements_chauds", ok: froid, pourquoi: "le froid passe à travers les fibres" },
    {
      lecon: "enfants_dabord",
      ok: enfants > 0,
      pourquoi: `${String(enfants)} enfant${enfants > 1 ? "s" : ""} à charge`,
    },
    { lecon: "partager_en_hiver", ok: saison === "hiver", pourquoi: "c'est l'hiver" },
    { lecon: "puits_pres_du_village", ok: !puits, pourquoi: "aucun puits au village" },
    { lecon: "soigner_les_blesses", ok: blesse, pourquoi: "une plaie ouverte" },
    {
      lecon: "murs_contre_les_loups",
      ok: loups && acces.some((b) => PLANS_BATIMENT[b.type].abri),
      pourquoi: "des loups rôdent",
    },
    { lecon: "veilleur_de_nuit", ok: loups, pourquoi: "des loups rôdent" },
    {
      lecon: "accoucheuse",
      ok: membresFamille(monde, p).some((m) => m.corps.enceinte !== null),
      pourquoi: "une grossesse dans la famille",
    },
    { lecon: "le_ciel_ecoute", ok: p.foi >= 5, pourquoi: "une foi déjà solide" },
    { lecon: "le_ciel_frappe", ok: false, pourquoi: "le ciel n'a rien montré" },
    { lecon: "ne_pas_attendre_le_ciel", ok: false, pourquoi: "rien à en dire" },
  ];
  const utiles = regles.filter((r) => r.ok && !connaitSavoir(p, r.lecon));
  const autres = regles.filter((r) => !r.ok && !connaitSavoir(p, r.lecon));
  return [...utiles, ...autres].map((r) => ({ lecon: r.lecon, pourquoi: r.pourquoi }));
}

function batimentsPossibles(monde: Monde, p: Personnage): OptionConseil[] {
  const acces = batimentsAccessibles(monde, p);
  const a = (t: TypeBatiment): boolean => acces.some((b) => b.type === t);
  const famille = membresFamille(monde, p).length;
  const saison = monde.horloge.moment().saison;
  const options: OptionConseil[] = [];
  for (const type of BATIMENTS_CONSEILLABLES) {
    if (a(type) && type !== "palissade") continue;
    let pourquoi: string | null = null;
    switch (type) {
      case "abri":
        pourquoi = "la famille dort dehors";
        break;
      case "feu_de_camp":
        pourquoi = "pas de feu à la famille";
        break;
      case "entrepot":
        pourquoi = "rien pour garder les provisions";
        break;
      case "maison":
        pourquoi = famille >= 3 ? `une famille de ${String(famille)}` : null;
        break;
      case "puits":
        pourquoi = [...monde.batiments.values()].some((b) => b.type === "puits")
          ? null
          : "l'eau propre est loin, ou souillée";
        break;
      case "fumoir":
        pourquoi = connaitSavoir(p, "fumoir") ? "le poisson se gâte au stock" : null;
        break;
      case "enclos":
        pourquoi =
          betesDe(monde, p.identite.nomFamille).length > 0 &&
          enclosDe(monde, p.identite.nomFamille) === null
            ? "des bêtes sans enclos"
            : null;
        break;
      case "champ":
        pourquoi =
          (saison === "printemps" || saison === "ete") && grainesAccessibles(monde, p) >= 4
            ? "des graines en réserve à la belle saison"
            : null;
        break;
      case "palissade":
        pourquoi =
          acces.some((b) => b.etat === "termine" && PLANS_BATIMENT[b.type].abri) &&
          !acces.some((b) => b.type === "palissade")
            ? "des pieux autour de l'abri contre les loups"
            : null;
        break;
      default:
        break;
    }
    if (pourquoi === null) continue;
    options.push({
      id: `batiment:${type}`,
      libelle: `bâtir : ${PLANS_BATIMENT[type].nom}`,
      pourquoi,
    });
  }
  return options;
}

/** Faim ou froid qui durent : à partir de ce nombre de jours, on peut conseiller de migrer. */
export const JOURS_AVANT_MIGRATION = 5;
export const JOURS_AMBITION_MIGRER = 10;

/** Migrer : la direction la moins connue, si la misère dure. */
function migrationPossible(monde: Monde, p: Personnage): OptionConseil[] {
  if (p.drapeaux.joursFaim < JOURS_AVANT_MIGRATION && p.drapeaux.joursFroid < JOURS_AVANT_MIGRATION)
    return [];
  const dir = directionsPossibles(monde, p)[0];
  if (dir === undefined) return [];
  const nom = dir.id.slice("explorer:".length);
  return [
    {
      id: `migrer:${nom}`,
      libelle: `partir vivre ailleurs, ${LIBELLES_DIRECTION[nom] ?? nom}`,
      pourquoi: "ici, la faim ou le froid durent depuis des jours",
    },
  ];
}

/** Directions dans lesquelles il y a encore à découvrir (au plus deux). */
function directionsPossibles(monde: Monde, p: Personnage): OptionConseil[] {
  const pos = p.corps.position;
  const notees: { dir: string; connus: number }[] = [];
  for (const [dir, [dx, dy]] of Object.entries(DIRECTIONS)) {
    const cible = { x: pos.x + dx * 10, y: pos.y + dy * 10 };
    const t = monde.grille.tuileOuNull(cible.x, cible.y);
    if (t === null) continue;
    if (!INFO_BIOME[t.biome].praticable || estEau(monde, cible.x, cible.y)) continue;
    let connus = 0;
    for (const l of p.connaissance.values()) if (Grille.distance(l, cible) <= 8) connus++;
    notees.push({ dir, connus });
  }
  notees.sort((a, b) => a.connus - b.connus || a.dir.localeCompare(b.dir));
  return notees.slice(0, 2).map((n) => ({
    id: `explorer:${n.dir}`,
    libelle: `chercher plus loin ${LIBELLES_DIRECTION[n.dir] ?? n.dir}`,
    pourquoi: n.connus === 0 ? "terres inconnues" : `${String(n.connus)} lieux connus seulement`,
  }));
}

/** Le catalogue fermé des options proposées à Claude pour cette personne (neuf au plus). */
export function optionsConseil(monde: Monde, p: Personnage): OptionConseil[] {
  const options: OptionConseil[] = [];
  if (ideesEnCours(p).length === 0) {
    for (const i of Object.keys(INVENTIONS) as Invention[]) {
      if (connaitSavoir(p, i) || !besoinRessenti(monde, p, i)) continue;
      options.push({
        id: `invention:${i}`,
        libelle: `chercher : ${INVENTIONS[i].nom}`,
        pourquoi: INVENTIONS[i].idee,
      });
      if (options.length >= 3) break;
    }
  }
  options.push(...batimentsPossibles(monde, p).slice(0, 3));
  for (const l of leconsUtiles(monde, p).slice(0, 2))
    options.push({ id: `lecon:${l.lecon}`, libelle: LECONS[l.lecon].titre, pourquoi: l.pourquoi });
  const saison = monde.horloge.moment().saison;
  const froid = saison === "automne" || saison === "hiver";
  const priorites: Priorite[] = ["provisions"];
  if (froid || p.drapeaux.joursFroid > 0) priorites.push("chaleur");
  if (p.besoins.social < 50 || p.besoins.moral < 50) priorites.push("social");
  if (p.corps.etat.blessures.length > 0 || p.corps.etat.maladies.length > 0) priorites.push("soin");
  for (const pr of priorites.slice(0, 2))
    options.push({
      id: `priorite:${pr}`,
      libelle: LIBELLES_PRIORITE[pr],
      pourquoi: "une ligne de conduite",
    });
  options.push(...directionsPossibles(monde, p));
  options.push(...migrationPossible(monde, p));
  return options.slice(0, 10);
}

/** Le contexte compact d'une question, construit par le moteur. */
export function contexteConseil(monde: Monde, p: Personnage): ContexteConseil {
  const batiments: Record<string, number> = {};
  const chantiers: string[] = [];
  const stocks: Record<string, number> = {};
  for (const b of batimentsAccessibles(monde, p)) {
    if (b.etat === "chantier") {
      chantiers.push(PLANS_BATIMENT[b.type].nom);
      continue;
    }
    const nom = PLANS_BATIMENT[b.type].nom;
    batiments[nom] = (batiments[nom] ?? 0) + 1;
    if (b.stock)
      for (const [r, n] of Object.entries(b.stock.ressources)) stocks[r] = (stocks[r] ?? 0) + n;
  }
  const famille = membresFamille(monde, p);
  const moment = monde.horloge.moment();
  const b = p.besoins;
  const arrondir = (v: number): number => Math.round(v);
  return {
    prenom: p.identite.prenom,
    nomFamille: p.identite.nomFamille,
    sexe: p.identite.sexe,
    stade: p.corps.stade,
    ageAnnees: Math.floor(p.corps.ageJours / monde.config.vie.joursParAnnee),
    motto: p.identite.motto,
    valeurs: p.identite.valeurs,
    traits: p.identite.traits,
    besoins: {
      faim: arrondir(b.faim),
      soif: arrondir(b.soif),
      sommeil: arrondir(b.sommeil),
      chaleur: arrondir(b.chaleur),
      securite: arrondir(b.securite),
      social: arrondir(b.social),
      moral: arrondir(b.moral),
    },
    inconfort: {
      joursFaim: p.drapeaux.joursFaim,
      joursFroid: p.drapeaux.joursFroid,
      joursMoralBas: p.drapeaux.joursMoralBas,
      echecsConsecutifs: p.echecsConsecutifs,
      dernierEchec: p.dernierEchec ? `${p.dernierEchec.action} — ${p.dernierEchec.raison}` : null,
    },
    moment: { saison: moment.saison, jourAbsolu: moment.jourAbsolu, meteo: monde.meteo },
    village: {
      batiments,
      chantiers,
      stocks,
      famille: famille.length,
      enfants: famille.filter((m) => m.corps.stade === "enfant").length,
    },
    savoirs: [...p.savoirs.entries()]
      .filter(([k, v]) => v.force >= SEUIL_SAVOIR && (v.force >= 1 || k in LECONS))
      .map(([k]) => titreSavoir(k)),
    ideesEnCours: ideesEnCours(p).map((i) => INVENTIONS[i].nom),
    souvenirs: p.memoire
      .tous()
      .slice(-5)
      .map((s) => s.texte),
  };
}

export function creerQuestion(
  monde: Monde,
  p: Personnage,
  motifs: readonly Motif[],
  numero: number,
): QuestionConseil {
  const tick = monde.horloge.tick;
  return {
    id: `q-${String(numero)}-${p.id}`,
    personnageId: p.id,
    tick,
    expireA: tick + JOURS_EXPIRATION * monde.horloge.ticksParJour,
    motifs: [...motifs],
    contexte: contexteConseil(monde, p),
    options: optionsConseil(monde, p),
  };
}

export interface ChoixConseil {
  readonly choix: string;
  readonly pensee: string;
  readonly ambition?: { readonly but: string; readonly jours: number } | undefined;
}

/**
 * Applique un choix valide (déjà vérifié dans les options de la question) :
 * pose l'ambition et, pour une invention ou une leçon, le savoir. Renvoie
 * l'ambition créée.
 */
export function appliquerConseil(
  monde: Monde,
  p: Personnage,
  option: OptionConseil,
  choix: ChoixConseil,
): Ambition {
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  const [genreBrut, cible = ""] = option.id.split(":");
  const genre = genreBrut as Ambition["genre"];
  const jours =
    choix.ambition?.jours ??
    (genre === "explorer"
      ? JOURS_AMBITION_EXPLORER
      : genre === "migrer"
        ? JOURS_AMBITION_MIGRER
        : JOURS_AMBITION);
  const foyer = batimentsAccessibles(monde, p).find(
    (b) => b.etat === "termine" && PLANS_BATIMENT[b.type].abri,
  );
  const pensee = choix.pensee.trim().slice(0, 300);
  if (p.ambition !== null && p.ambition.issue === "en_cours") p.ambition.issue = "abandonnee";
  const ambition: Ambition = {
    genre,
    cible,
    but: (choix.ambition?.but ?? option.libelle).trim().slice(0, 200),
    pensee,
    depuis: tick,
    jusqua: tick + Math.max(1, Math.min(30, jours)) * T,
    issue: "en_cours",
    lieuxAuDepart: p.connaissance.size,
    ...(genre === "migrer" ? { origine: { ...(foyer?.position ?? p.corps.position) } } : {}),
  };
  p.ambition = ambition;
  p.drapeaux.conseilDemandeA = tick;
  switch (genre) {
    case "invention":
      apprendre(p, cible as Invention, SEUIL_SAVOIR, "Claude", tick);
      p.memoire.ajouter(
        tick,
        "reflexion",
        `On m'a soufflé une idée. ${INVENTIONS[cible as Invention].idee}`,
        7,
        [],
      );
      break;
    case "lecon":
      apprendre(p, cible as Lecon, 1, "Claude", tick);
      p.memoire.ajouter(
        tick,
        "reflexion",
        `J'ai compris ceci : ${LECONS[cible as Lecon].morale}`,
        7,
        [],
      );
      break;
    case "explorer":
      p.drapeaux.explorerPlusLoinJusqua = ambition.jusqua;
      break;
    case "migrer":
      // Toute la famille adulte part : même ambition, même direction, même échéance.
      p.drapeaux.explorerPlusLoinJusqua = ambition.jusqua;
      for (const m of membresFamille(monde, p)) {
        if (m.id === p.id || !m.vivant || m.corps.stade === "enfant") continue;
        if (m.ambition?.issue === "en_cours") m.ambition.issue = "abandonnee";
        m.ambition = { ...ambition, pensee: "", lieuxAuDepart: m.connaissance.size };
        m.drapeaux.explorerPlusLoinJusqua = ambition.jusqua;
        m.memoire.ajouter(
          tick,
          "reflexion",
          `${p.identite.prenom} veut partir vivre ailleurs ; je pars avec.`,
          6,
          [p.id],
        );
      }
      break;
    case "batiment":
    case "priorite":
      break;
  }
  if (pensee.length > 0) p.penseeClaude = { texte: pensee, tick };
  p.memoire.ajouter(tick, "reflexion", `Je sais ce que je veux : ${ambition.but}.`, 6, []);
  return ambition;
}

/** Vérifie chaque aube où en est l'ambition ; renvoie la nouvelle issue, ou null si rien ne change. */
export function jourAmbition(monde: Monde, p: Personnage): Ambition["issue"] | null {
  const a = p.ambition;
  if (a?.issue !== "en_cours") return null;
  const tick = monde.horloge.tick;
  let accompli = false;
  switch (a.genre) {
    case "invention":
      accompli = (p.savoirs.get(a.cible as Invention)?.force ?? 0) >= 1;
      break;
    case "batiment":
      accompli = batimentsAccessibles(monde, p).some(
        (b) =>
          b.type === a.cible &&
          b.etat === "termine" &&
          b.termineAuTick !== null &&
          b.termineAuTick >= a.depuis,
      );
      break;
    case "explorer":
      accompli = p.connaissance.size >= a.lieuxAuDepart + LIEUX_A_DECOUVRIR;
      break;
    case "migrer":
      accompli =
        a.origine !== undefined &&
        batimentsAccessibles(monde, p).some(
          (b) =>
            b.etat === "termine" &&
            PLANS_BATIMENT[b.type].abri &&
            b.termineAuTick !== null &&
            b.termineAuTick >= a.depuis &&
            Grille.distance(b.position, a.origine ?? b.position) >= DISTANCE_MIGRATION,
        );
      break;
    case "lecon":
    case "priorite":
      accompli = tick >= a.jusqua;
      break;
  }
  if (accompli) {
    a.issue = "accomplie";
    return "accomplie";
  }
  if (tick >= a.jusqua) {
    a.issue = "abandonnee";
    return "abandonnee";
  }
  return null;
}

/** L'ambition de priorité en cours, s'il y en a une. */
export function prioriteEnCours(p: Personnage): Priorite | null {
  const a = p.ambition;
  if (a?.issue !== "en_cours" || a.genre !== "priorite") return null;
  return (PRIORITES as readonly string[]).includes(a.cible) ? (a.cible as Priorite) : null;
}

/** Bonus du cerveau à règles pour un candidat, selon la priorité choisie. */
export function bonusPriorite(priorite: Priorite | null, intention: Intention): number {
  if (priorite === null) return 0;
  const t = intention.type;
  let concerne = false;
  switch (priorite) {
    case "provisions":
      concerne = t === "recolter" || t === "stocker" || t === "fabriquer";
      break;
    case "chaleur":
      concerne =
        t === "se_rechauffer" ||
        t === "construire" ||
        (t === "fabriquer" && intention.recette === "vetement_cuir");
      break;
    case "social":
      concerne = t === "parler" || t === "offrir" || t === "courtiser";
      break;
    case "soin":
      concerne =
        t === "soigner" ||
        t === "se_reposer" ||
        (t === "fabriquer" && intention.recette === "bandage");
      break;
    case "explorer":
      concerne = t === "explorer";
      break;
  }
  return concerne ? BONUS_PRIORITE : 0;
}

/** Direction d'exploration voulue par l'ambition, ou null. */
export function directionVoulue(p: Personnage): readonly [number, number] | null {
  const a = p.ambition;
  if (a?.issue !== "en_cours" || (a.genre !== "explorer" && a.genre !== "migrer")) return null;
  return DIRECTIONS[a.cible] ?? null;
}

/** Mise à jour des compteurs d'inconfort à l'aube, à partir des minima de la veille. */
export function jourCompteurs(p: Personnage): void {
  const d = p.drapeaux;
  d.joursFaim = d.faimMinDuJour < 35 ? d.joursFaim + 1 : 0;
  d.joursFroid = d.chaleurMinDuJour < 45 ? d.joursFroid + 1 : 0;
  d.joursMoralBas = p.besoins.moral < 40 ? d.joursMoralBas + 1 : 0;
}
