/**
 * La psyché (jalon 14) : ce qui fait que deux personnages ne vivent pas le
 * même drame de la même façon. Stress qui s'accumule et abattement dont on
 * sort par les proches ; lieux qu'on évite après un traumatisme ; objectif
 * personnel selon ses valeurs, ennui de la répétition et sens de la vie ;
 * rêves la nuit à partir de deux souvenirs ; souvenirs anciens qui se
 * réécrivent (jamais les faits journalisés) ; personnalité qui plie sous les
 * épreuves dans des bornes ; attachement à un lieu et à un outil ; deuil d'un
 * an avec son anniversaire ; la gravure sur pierre d'un ancien oisif.
 */
import type { Personnalite } from "../agents/identite.js";
import { NOURRITURE, quantite, retirer } from "../agents/inventaire.js";
import { ajouterHumeur } from "../agents/corps.js";
import { clamp } from "../agents/besoins.js";
import type { Personnage } from "../agents/personnage.js";
import type { Evenement } from "../evenements/journal.js";
import type { TypeObjet } from "../monde/recettes.js";
import { Grille } from "../monde/grille.js";
import type { Position } from "../monde/grille.js";
import type { Monde } from "../monde.js";
import { batimentsAccessibles } from "../monde.js";
import type { Souvenir } from "./souvenir.js";
import type { Valeur } from "../agents/noms.js";

// ------------------------------------------------------------------ état

export type GenreObjectif =
  | "reserves"
  | "enfant"
  | "decouvrir"
  | "prestige"
  | "notable"
  | "dons"
  | "toit"
  | "transmettre"
  | "jouer"
  | "loin";

/** Un objectif personnel, choisi selon ses valeurs au début d'une saison. */
export interface Objectif {
  readonly genre: GenreObjectif;
  readonly but: string;
  readonly depuis: number;
  readonly jusqua: number;
  /** Mesure au départ (nombre de lieux connus, dons faits, etc.). */
  readonly depart: number;
  readonly cible: number;
  issue: "en_cours" | "accompli" | "manque";
}

export interface LieuEvite {
  readonly x: number;
  readonly y: number;
  readonly rayon: number;
  readonly jusqua: number;
  readonly motif: string;
}

export interface Deuil {
  readonly defunt: string;
  readonly prenom: string;
  readonly tick: number;
  anniversaires: number;
}

export interface Psyche {
  /** Stress 0..100 : s'accumule aux épreuves, retombe avec le temps et les proches. */
  stress: number;
  joursStressHaut: number;
  /** Abattement : on ne fait plus grand-chose, on en sort par le soutien des proches. */
  abattu: boolean;
  abattuDepuis: number;
  lieuxEvites: LieuEvite[];
  objectif: Objectif | null;
  /** Sens de la vie 0..100 : objectifs accomplis, dons, enfants, savoirs transmis. */
  sens: number;
  /** Ennui 0..100 : la même chose refaite jour après jour. */
  ennui: number;
  /** Les trente dernières intentions (type), pour mesurer la répétition. */
  dernieresIntentions: string[];
  reve: { readonly tick: number; readonly texte: string } | null;
  attachement: {
    lieu: Position | null;
    objet: TypeObjet | null;
  };
  deuils: Deuil[];
  /** Le caractère de départ : la personnalité plie, mais dans des bornes autour de lui. */
  personnaliteBase: Personnalite;
  /** Dons faits, compteur pour les objectifs et le sens. */
  dons: number;
  gravures: number;
}

export function psycheInitiale(personnalite: Personnalite): Psyche {
  return {
    stress: 0,
    joursStressHaut: 0,
    abattu: false,
    abattuDepuis: -1,
    lieuxEvites: [],
    objectif: null,
    sens: 30,
    ennui: 0,
    dernieresIntentions: [],
    reve: null,
    attachement: { lieu: null, objet: null },
    deuils: [],
    personnaliteBase: { ...personnalite },
    dons: 0,
    gravures: 0,
  };
}

// ------------------------------------------------------------ constantes

export const SEUIL_ABATTEMENT = 70;
export const JOURS_AVANT_ABATTEMENT = 5;
export const SEUIL_SORTIE_ABATTEMENT = 40;
export const SEUIL_ENNUI = 60;
/** Une personnalité ne s'éloigne jamais de plus de cela de son point de départ. */
export const BORNE_PERSONNALITE = 0.2;
export const JOURS_EVITEMENT = 60;
export const RAYON_EVITEMENT = 4;
export const JOURS_OBJECTIF = 30;

// --------------------------------------------------------------- outils

function borner01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** La personnalité plie, dans des bornes autour du caractère de départ. */
export function flechirPersonnalite(p: Personnage, cle: keyof Personnalite, delta: number): void {
  const base = p.psyche.personnaliteBase[cle];
  const v = p.identite.personnalite[cle] + delta;
  p.identite.personnalite[cle] = borner01(
    Math.max(base - BORNE_PERSONNALITE, Math.min(base + BORNE_PERSONNALITE, v)),
  );
}

export function stresser(p: Personnage, delta: number): void {
  p.psyche.stress = Math.max(0, Math.min(100, p.psyche.stress + delta));
}

/** Vrai si le personnage évite ce lieu (traumatisme), sauf famine. */
export function lieuEvite(p: Personnage, pos: Position, tick: number): boolean {
  if (p.besoins.faim < 30) return false;
  return p.psyche.lieuxEvites.some((l) => tick < l.jusqua && Grille.distance(pos, l) <= l.rayon);
}

function eviterLeLieu(monde: Monde, p: Personnage, pos: Position, motif: string): void {
  const tick = monde.horloge.tick;
  if (p.psyche.lieuxEvites.some((l) => tick < l.jusqua && Grille.distance(pos, l) <= 2)) return;
  p.psyche.lieuxEvites.push({
    x: pos.x,
    y: pos.y,
    rayon: RAYON_EVITEMENT,
    jusqua: tick + JOURS_EVITEMENT * monde.horloge.ticksParJour,
    motif,
  });
  if (p.psyche.lieuxEvites.length > 6) p.psyche.lieuxEvites.shift();
}

// -------------------------------------------------------- observation

/** Le stress vient des événements ; les bons moments l'apaisent. */
export function observerPsyche(monde: Monde, e: Evenement): void {
  const tick = monde.horloge.tick;
  const acteur = e.acteur === null ? undefined : monde.personnages.find((p) => p.id === e.acteur);
  const cible = (cle: string): Personnage | undefined =>
    monde.personnages.find((p) => p.id === String(e.details[cle] ?? ""));
  switch (e.type) {
    case "blessure":
      if (acteur) stresser(acteur, 6 * Number(e.details.gravite ?? 1));
      break;
    case "combat": {
      if (acteur === undefined) break;
      stresser(acteur, e.details.issue === "mort" ? 0 : 20);
      if (e.position !== null && e.details.issue !== "mort")
        eviterLeLieu(monde, acteur, e.position, "les loups");
      // Les témoins proches en gardent quelque chose aussi.
      if (e.position !== null)
        for (const t of monde.personnages) {
          if (!t.vivant || t.id === acteur.id || t.corps.endormi) continue;
          if (Grille.distance(t.corps.position, e.position) <= 6) stresser(t, 8);
        }
      break;
    }
    case "alarme":
      for (const t of monde.personnages) {
        if (!t.vivant || t.corps.endormi) continue;
        if (e.position !== null && Grille.distance(t.corps.position, e.position) <= 10)
          stresser(t, 5);
      }
      break;
    case "vol": {
      const famille = String(e.details.famille ?? "");
      for (const t of monde.personnages)
        if (t.vivant && t.identite.nomFamille === famille) stresser(t, 6);
      break;
    }
    case "rixe":
      if (acteur) stresser(acteur, 10);
      {
        const perdant = cible("cible");
        if (perdant) stresser(perdant, 12);
      }
      break;
    case "action_echouee":
      if (acteur && acteur.echecsConsecutifs >= 3) stresser(acteur, 2);
      break;
    case "maladie":
      if (acteur) stresser(acteur, 8);
      break;
    case "justice":
      if (acteur && e.details.genre === "exil") stresser(acteur, 30);
      break;
    case "veillee":
      break;
    case "jeu":
      if (acteur) stresser(acteur, -4);
      {
        const avec = cible("avec");
        if (avec) stresser(avec, -4);
      }
      break;
    case "dialogue": {
      if (acteur === undefined) break;
      const avec = cible("avec");
      if (avec === undefined) break;
      const lien = acteur.relations.get(avec.id)?.lien;
      if (lien === "ami" || lien === "partenaire" || lien === "parent" || lien === "enfant") {
        stresser(acteur, -3);
        stresser(avec, -3);
      }
      break;
    }
    case "offre":
      if (acteur) {
        acteur.psyche.dons += 1;
        acteur.psyche.sens = Math.min(100, acteur.psyche.sens + 1);
        stresser(acteur, -1);
      }
      break;
    case "naissance":
      if (acteur) {
        stresser(acteur, -10);
        acteur.psyche.sens = Math.min(100, acteur.psyche.sens + 10);
        flechirPersonnalite(acteur, "agreabilite", 0.02);
      }
      break;
    case "outil_casse": {
      if (acteur === undefined) break;
      const objet = String(e.details.outil ?? "");
      if (acteur.psyche.attachement.objet === objet) {
        ajouterHumeur(acteur, "perte", -8, 5 * monde.horloge.ticksParJour, tick);
        acteur.psyche.attachement.objet = null;
        acteur.memoire.ajouter(
          tick,
          "reflexion",
          `Ma ${objet.replace(/_/g, " ")} s'est cassée. Je l'avais depuis si longtemps.`,
          5,
          [],
        );
      }
      break;
    }
    default:
      break;
  }
}

// ----------------------------------------------------------------- mort

/** Une mort proche : deuil long (un an, avec anniversaire), lieu évité, personnalité qui plie. */
export function mortPsyche(monde: Monde, defunt: Personnage, cause: string): void {
  const tick = monde.horloge.tick;
  const violente = cause === "loups" || cause === "hémorragie" || cause === "infection";
  for (const p of monde.personnages) {
    if (!p.vivant || p.id === defunt.id) continue;
    const lien = p.relations.get(defunt.id)?.lien ?? "inconnu";
    const proche =
      lien === "partenaire" || lien === "parent" || lien === "enfant" || lien === "fratrie";
    if (!proche && lien !== "ami") continue;
    stresser(p, proche ? 25 : 10);
    if (proche) {
      p.psyche.deuils.push({
        defunt: defunt.id,
        prenom: defunt.identite.prenom,
        tick,
        anniversaires: 0,
      });
      if (p.psyche.deuils.length > 8) p.psyche.deuils.shift();
      flechirPersonnalite(p, "nevrosisme", violente ? 0.05 : 0.02);
      if (violente) {
        flechirPersonnalite(p, "ouverture", -0.02);
        eviterLeLieu(monde, p, defunt.corps.position, `la mort de ${defunt.identite.prenom}`);
      }
    }
  }
}

// ----------------------------------------------------------------- aube

/** L'aube de la psyché : stress, abattement, ennui, objectifs, anniversaires, attachements. */
export function aubePsyche(monde: Monde, p: Personnage): void {
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  const moment = monde.horloge.moment();
  const ps = p.psyche;
  // Le stress retombe ; la faim qui dure le nourrit.
  stresser(p, -3);
  if (p.drapeaux.joursFaim > 0) stresser(p, 2);
  if (p.drapeaux.joursFroid > 0) stresser(p, 2);
  // Les lieux évités s'oublient.
  ps.lieuxEvites = ps.lieuxEvites.filter((l) => tick < l.jusqua);
  // L'abattement : cinq jours de stress haut ; on en sort quand il est retombé.
  if (ps.stress >= SEUIL_ABATTEMENT) ps.joursStressHaut += 1;
  else ps.joursStressHaut = 0;
  if (!ps.abattu && ps.joursStressHaut >= JOURS_AVANT_ABATTEMENT) {
    ps.abattu = true;
    ps.abattuDepuis = tick;
    flechirPersonnalite(p, "nevrosisme", 0.03);
    monde.emettre("psyche", p, { genre: "abattement" }, 7);
    p.memoire.ajouter(tick, "reflexion", "Je n'ai plus goût à rien. Chaque jour pèse.", 7, []);
  } else if (ps.abattu && ps.stress < SEUIL_SORTIE_ABATTEMENT) {
    ps.abattu = false;
    const jours = Math.round((tick - ps.abattuDepuis) / T);
    monde.emettre("psyche", p, { genre: "sortie", jours }, 6);
    p.memoire.ajouter(
      tick,
      "reflexion",
      "Je respire de nouveau. Les miens m'ont tenu debout.",
      7,
      [],
    );
    flechirPersonnalite(p, "extraversion", 0.02);
  }
  if (ps.abattu) ajouterHumeur(p, "abattement", -15, 2 * T, tick);
  // L'ennui : la même intention sept fois sur dix, sur trente décisions.
  if (ps.dernieresIntentions.length >= 20) {
    const compte = new Map<string, number>();
    for (const i of ps.dernieresIntentions) compte.set(i, (compte.get(i) ?? 0) + 1);
    const max = Math.max(...compte.values());
    if (max / ps.dernieresIntentions.length >= 0.7) ps.ennui = Math.min(100, ps.ennui + 12);
    else ps.ennui = Math.max(0, ps.ennui - 8);
  }
  if (ps.ennui >= SEUIL_ENNUI) ajouterHumeur(p, "ennui", -5, 2 * T, tick);
  // Un ancien qui s'ennuie grave une pierre.
  if (
    p.corps.stade === "ancien" &&
    ps.ennui >= SEUIL_ENNUI &&
    ps.objectif === null &&
    ps.gravures < 3
  )
    graver(monde, p);
  // L'objectif personnel : choisi au premier jour d'une saison, mesuré chaque jour.
  if (ps.objectif?.issue === "en_cours") mesurerObjectif(monde, p);
  if (ps.objectif?.issue !== "en_cours" && moment.jourDeSaison === 1 && p.corps.stade !== "enfant")
    choisirObjectif(monde, p);
  // Les anniversaires de deuil.
  for (const d of ps.deuils) {
    const ans = Math.floor((tick - d.tick) / monde.horloge.ticksParAnnee);
    if (ans >= 1 && ans > d.anniversaires && (tick - d.tick) % monde.horloge.ticksParAnnee < T) {
      d.anniversaires = ans;
      ajouterHumeur(p, `anniversaire:${d.defunt}`, -6, 3 * T, tick);
      p.memoire.ajouter(
        tick,
        "reflexion",
        `Il y a ${ans === 1 ? "un an" : `${String(ans)} ans`}, ${d.prenom} nous quittait. Je pense à ${d.prenom} aujourd'hui.`,
        6,
        [d.defunt],
      );
      monde.emettre(
        "psyche",
        p,
        { genre: "anniversaire", defunt: d.defunt, prenom: d.prenom, ans },
        4,
      );
    }
  }
  // Les attachements se fixent une fois par mois.
  if (moment.jourAbsolu % 30 === 0) fixerAttachements(monde, p);
  // Le souvenir ancien se réécrit, une fois par semaine, un à la fois.
  if (moment.jourAbsolu % 7 === p.id.length % 7) deformerUnSouvenir(monde, p);
}

/** Chaque décision laisse une trace, pour mesurer la répétition. */
export function noterIntention(p: Personnage, type: string): void {
  const l = p.psyche.dernieresIntentions;
  l.push(type);
  if (l.length > 30) l.shift();
}

/** Le type d'intention dominant des derniers jours, s'il y en a un (pour la variété). */
export function intentionDominante(p: Personnage): string | null {
  const l = p.psyche.dernieresIntentions;
  if (l.length < 20 || p.psyche.ennui < SEUIL_ENNUI) return null;
  const compte = new Map<string, number>();
  for (const i of l) compte.set(i, (compte.get(i) ?? 0) + 1);
  let meilleur: string | null = null;
  let max = 0;
  for (const [k, n] of compte)
    if (n > max) {
      max = n;
      meilleur = k;
    }
  return meilleur;
}

// ------------------------------------------------------------ objectifs

const OBJECTIFS_PAR_VALEUR: Readonly<Record<Valeur, GenreObjectif>> = {
  richesse: "reserves",
  famille: "enfant",
  curiosite: "decouvrir",
  honneur: "prestige",
  pouvoir: "notable",
  harmonie: "dons",
  securite: "toit",
  tradition: "transmettre",
  plaisir: "jouer",
  liberte: "loin",
};

const BUTS: Readonly<Record<GenreObjectif, string>> = {
  reserves: "ranger trente portions dans nos stocks",
  enfant: "voir naître un enfant dans la famille",
  decouvrir: "découvrir trente lieux nouveaux",
  prestige: "gagner en prestige aux yeux des autres",
  notable: "compter parmi les notables du village",
  dons: "donner cinq fois de quoi manger",
  toit: "avoir une maison ou une palissade à nous",
  transmettre: "transmettre un savoir à quelqu'un",
  jouer: "jouer ou faire de la musique cinq fois",
  loin: "aller à trente tuiles de chez nous",
};

function mesure(monde: Monde, p: Personnage, genre: GenreObjectif): number {
  switch (genre) {
    case "reserves": {
      let n = 0;
      for (const b of batimentsAccessibles(monde, p))
        if (b.etat === "termine" && b.stock !== null)
          for (const [r, q] of Object.entries(b.stock.ressources))
            if (NOURRITURE[r as keyof typeof NOURRITURE] !== undefined) n += q;
      return n;
    }
    case "enfant":
      return monde.personnages.filter(
        (x) => x.identite.nomFamille === p.identite.nomFamille && x.corps.stade === "enfant",
      ).length;
    case "decouvrir":
      return p.connaissance.size;
    case "prestige":
      return p.prestige;
    case "notable":
      return p.prestige;
    case "dons":
      return p.psyche.dons;
    case "toit":
      return batimentsAccessibles(monde, p).filter(
        (b) => b.etat === "termine" && (b.type === "maison" || b.type === "palissade"),
      ).length;
    case "transmettre":
      return monde.personnages.filter((x) =>
        [...x.savoirs.values()].some((s) => s.origine === p.identite.prenom),
      ).length;
    case "jouer":
      return p.memoire
        .tous()
        .filter((s) => s.texte.includes("osselets") || s.texte.includes("flûte")).length;
    case "loin": {
      const foyer = batimentsAccessibles(monde, p).find((b) => b.etat === "termine")?.position;
      return foyer === undefined ? 0 : Grille.distance(p.corps.position, foyer);
    }
  }
}

function choisirObjectif(monde: Monde, p: Personnage): void {
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  const valeurs = p.identite.valeurs;
  const valeur = valeurs[Math.floor(p.rng.suivant() * valeurs.length)];
  if (valeur === undefined) return;
  const genre = OBJECTIFS_PAR_VALEUR[valeur];
  const depart = mesure(monde, p, genre);
  const cible =
    genre === "reserves"
      ? depart + 30
      : genre === "enfant"
        ? depart + 1
        : genre === "decouvrir"
          ? depart + 30
          : genre === "prestige"
            ? depart + 15
            : genre === "notable"
              ? 15
              : genre === "dons"
                ? depart + 5
                : genre === "toit"
                  ? depart + 1
                  : genre === "transmettre"
                    ? depart + 1
                    : genre === "jouer"
                      ? depart + 5
                      : 30;
  p.psyche.objectif = {
    genre,
    but: BUTS[genre],
    depuis: tick,
    jusqua: tick + JOURS_OBJECTIF * T,
    depart,
    cible,
    issue: "en_cours",
  };
  monde.emettre("psyche", p, { genre: "objectif", objectif: genre, but: BUTS[genre] }, 3);
  p.memoire.ajouter(tick, "plan", `Cette saison, je veux ${BUTS[genre]}.`, 5, []);
}

function mesurerObjectif(monde: Monde, p: Personnage): void {
  const o = p.psyche.objectif;
  if (o?.issue !== "en_cours") return;
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  const valeur = mesure(monde, p, o.genre);
  if (valeur >= o.cible) {
    o.issue = "accompli";
    ajouterHumeur(p, "joie", 12, 10 * T, tick);
    p.psyche.sens = Math.min(100, p.psyche.sens + 15);
    stresser(p, -10);
    flechirPersonnalite(p, "conscience", 0.02);
    monde.emettre("psyche", p, { genre: "accompli", objectif: o.genre, but: o.but }, 6);
    p.memoire.ajouter(tick, "reflexion", `J'y suis arrivé : ${o.but}. Quelle joie.`, 8, []);
  } else if (tick >= o.jusqua) {
    o.issue = "manque";
    p.psyche.sens = Math.max(0, p.psyche.sens - 5);
    monde.emettre("psyche", p, { genre: "manque", objectif: o.genre, but: o.but }, 3);
    p.memoire.ajouter(tick, "reflexion", `La saison est passée sans que j'aie pu ${o.but}.`, 4, []);
  }
}

// ---------------------------------------------------------- gravure

/** Un ancien qui s'ennuie grave une pierre : son motto, ou ce qu'il a retenu de la vie. */
function graver(monde: Monde, p: Personnage): void {
  const tick = monde.horloge.tick;
  const sources = [p.corps.inventaire, ...batimentsAccessibles(monde, p).map((b) => b.stock)];
  let pierre = 0;
  for (const src of sources) {
    if (src === null || pierre >= 2) continue;
    pierre += retirer(src, "pierre", Math.min(2 - pierre, quantite(src, "pierre")));
  }
  if (pierre < 2) return;
  const place = placeLibre(monde, p.corps.position, 3);
  if (place === null) return;
  const inscription =
    p.psyche.deuils[0] !== undefined
      ? `« ${p.identite.motto} » — ${p.identite.prenom}, qui n'a pas oublié ${p.psyche.deuils[0].prenom}.`
      : `« ${p.identite.motto} » — ${p.identite.prenom}, ${p.identite.nomFamille}.`;
  const stele = monde.fonderChantier("stele", place, p);
  stele.etat = "termine";
  stele.travailRestant = 0;
  stele.termineAuTick = tick;
  stele.epitaphe = inscription;
  p.psyche.gravures += 1;
  p.psyche.ennui = 0;
  p.psyche.sens = Math.min(100, p.psyche.sens + 20);
  ajouterHumeur(p, "gravure", 8, 10 * monde.horloge.ticksParJour, tick);
  monde.emettre("gravure", p, { inscription }, 7, place);
  p.memoire.ajouter(
    tick,
    "action",
    `J'ai gravé une pierre pour ceux qui viendront : ${inscription}`,
    8,
    [],
    place,
  );
}

function placeLibre(monde: Monde, centre: Position, rayon: number): Position | null {
  for (let r = 1; r <= rayon; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const t = monde.grille.tuileOuNull(centre.x + dx, centre.y + dy);
        if (t?.batiment !== null || t.gisement !== null || !monde.grille.estPraticable(t.x, t.y))
          continue;
        return { x: t.x, y: t.y };
      }
  return null;
}

// ------------------------------------------------------ attachements

/** Le lieu des bons souvenirs, et l'outil qu'on garde, deviennent des attachements. */
function fixerAttachements(monde: Monde, p: Personnage): void {
  const T = monde.horloge.ticksParJour;
  const tick = monde.horloge.tick;
  const compte = new Map<string, { n: number; x: number; y: number }>();
  for (const s of p.memoire.tous()) {
    if (s.position === null || s.importance < 4 || tick - s.tick > 90 * T) continue;
    if (/mort|faim|froid|loups|blessé|volé/.test(s.texte)) continue;
    const cle = `${String(Math.floor(s.position.x / 4))},${String(Math.floor(s.position.y / 4))}`;
    const c = compte.get(cle) ?? { n: 0, x: s.position.x, y: s.position.y };
    c.n += 1;
    compte.set(cle, c);
  }
  let meilleur: { n: number; x: number; y: number } | null = null;
  for (const c of compte.values()) if (meilleur === null || c.n > meilleur.n) meilleur = c;
  if (meilleur !== null && meilleur.n >= 3) {
    const nouveau =
      p.psyche.attachement.lieu === null ||
      Grille.distance(p.psyche.attachement.lieu, meilleur) > 4;
    p.psyche.attachement.lieu = { x: meilleur.x, y: meilleur.y };
    if (nouveau)
      p.memoire.ajouter(
        tick,
        "reflexion",
        "Il y a un endroit où je me sens bien, et j'y reviens volontiers.",
        4,
        [],
        { x: meilleur.x, y: meilleur.y },
      );
  }
  if (p.psyche.attachement.objet === null) {
    const outil = p.corps.inventaire.objets.find((o) => o.type !== "traineau");
    if (outil !== undefined) p.psyche.attachement.objet = outil.type;
  }
}

/** Le soir, près du lieu auquel on tient : un peu de moral, un peu moins de stress. */
export function soirPsyche(p: Personnage): void {
  const lieu = p.psyche.attachement.lieu;
  if (lieu !== null && Grille.distance(p.corps.position, lieu) <= 3) {
    p.besoins.moral = clamp(p.besoins.moral + 2);
    stresser(p, -1);
  }
}

// ----------------------------------------------------------------- rêves

const CADRES_REVE = [
  "Cette nuit, j'ai rêvé que {a} Puis, sans transition, {b}",
  "Un rêve étrange : {a} Et tout à coup {b}",
  "J'ai rêvé de ceci, mêlé : {a} {b} Au réveil je ne savais plus lequel était vrai.",
] as const;

/** Un souvenir cité au fil d'une phrase : sa première lettre baisse si c'est un mot courant. */
function premierePersonne(texte: string): string {
  const t = texte.trim().replace(/\s+/g, " ");
  return /^(Je |J'|Les |La |Le |L'|Un |Une |Il |Elle |On |Nous |Ma |Mon |Mes |Des |Du |Ce |Cette |Quel|Rien |Tout )/.test(
    t,
  )
    ? t.charAt(0).toLowerCase() + t.slice(1)
    : t;
}

/** Un rêve mêle deux souvenirs ; il devient lui-même un souvenir, léger. */
export function rever(monde: Monde, p: Personnage): void {
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  const candidats = p.memoire
    .tous()
    .filter((s) => s.type !== "reve" && s.importance >= 4 && tick - s.tick <= 60 * T);
  if (candidats.length < 2) return;
  const rng = p.rng;
  const a = candidats[Math.floor(rng.suivant() * candidats.length)];
  let b = candidats[Math.floor(rng.suivant() * candidats.length)];
  if (a === undefined || b === undefined) return;
  if (b.id === a.id) b = candidats.find((s) => s.id !== a.id) ?? b;
  const cadre = CADRES_REVE[Math.floor(rng.suivant() * CADRES_REVE.length)] ?? CADRES_REVE[0];
  const texte = cadre
    .replace("{a}", premierePersonne(a.texte))
    .replace("{b}", premierePersonne(b.texte));
  p.psyche.reve = { tick, texte };
  p.memoire.ajouter(tick, "reve", texte, 3, [...new Set([...a.sujets, ...b.sujets])]);
  if (a.importance >= 8 || b.importance >= 8) stresser(p, 2);
  else stresser(p, -1);
}

// -------------------------------------------------- mémoire qui déforme

const EMBELLISSEMENTS = [
  " Du moins, c'est ainsi que je m'en souviens.",
  " Avec le temps, tout cela me paraît plus grand encore.",
  " Je le raconte ainsi, et je finis par le croire.",
] as const;

/** Un souvenir ancien, important et peu consulté, se réécrit : les nombres grossissent, la certitude s'effrite. */
export function deformerUnSouvenir(monde: Monde, p: Personnage): Souvenir | null {
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  const candidats = p.memoire
    .tous()
    .filter(
      (s) =>
        s.altere !== true &&
        s.type !== "reve" &&
        s.importance >= 5 &&
        tick - s.tick >= 60 * T &&
        tick - s.dernierAcces >= 30 * T,
    );
  if (candidats.length === 0) return null;
  const s = candidats[Math.floor(p.rng.suivant() * candidats.length)];
  if (s === undefined) return null;
  const texte = s.texte.replace(/\b(\d+)\b/g, (m) => {
    const n = Number.parseInt(m, 10);
    return Number.isFinite(n) && n > 0 && n < 1000 ? String(Math.ceil(n * 1.5)) : m;
  });
  const suffixe = EMBELLISSEMENTS[Math.floor(p.rng.suivant() * EMBELLISSEMENTS.length)] ?? "";
  s.texte = `${texte}${suffixe}`;
  s.altere = true;
  s.importance = Math.min(10, s.importance + 1);
  return s;
}
