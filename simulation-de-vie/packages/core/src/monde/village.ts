/**
 * Le village apprivoise (jalon « le village apprivoise ») : capture et
 * apprivoisement d'une bête après la chasse, enclos et élevage (lait, laine,
 * viande, naissances en captivité, fourrage d'hiver), champs semés de graines
 * de baies (quatre stades, récolte d'automne, gel, ravages, fertilité qui
 * s'épuise et jachère), et un titre de métier tiré de la pratique.
 */
import type { Monde } from "../monde.js";
import type { Personnage } from "../agents/personnage.js";
import { COMPETENCES, niveau } from "../agents/competences.js";
import type { Competence } from "../agents/competences.js";
import { ajouter, retirer } from "../agents/inventaire.js";
import type { Rng } from "../rng.js";
import type { Batiment } from "./batiments.js";
import { PROFILS } from "./faune.js";
import type { Espece } from "./faune.js";
import { Grille } from "./grille.js";
import type { Position } from "./grille.js";

// ---------------------------------------------------------------- bétail

/** Docilité par espèce : le mouflon s'apprivoise, le cerf jamais. */
/** Bêtes par famille au-delà desquelles on ne capture plus (l'enclos et le fourrage ont leurs limites). */
export const BETES_PAR_FAMILLE_MAX = 4;

export const DOCILITE: Readonly<Record<Espece, number>> = {
  mouflon: 0.7,
  aurochs: 0.4,
  lievre: 0.3,
  sanglier: 0.2,
  cerf: 0,
  loup: 0,
};

export interface Bete {
  readonly id: string;
  readonly espece: Espece;
  readonly famille: string;
  proprietaire: string;
  position: Position;
  ageJours: number;
  /** 0..1 : une bête docile ne s'enfuit pas et se laisse traire. */
  docilite: number;
  /** Jours sans fourrage l'hiver. */
  faim: number;
  readonly neeEnCaptivite: boolean;
  /** Dernier jour de traite (jour absolu). */
  derniereTraite: number;
  /** Dernière tonte (année). */
  derniereTonte: number;
}

/** Places par enclos. */
export const CAPACITE_ENCLOS = 6;
/** Jours sans fourrage avant qu'une bête ne meure, l'hiver. */
export const FAMINE_BETAIL = 10;
/** Rayon dans lequel une bête broute les fibres autour de son enclos, l'hiver. */
export const RAYON_PATURAGE = 6;
/** Âge adulte d'une bête (jours) : elle peut alors mettre bas, donner du lait. */
export const AGE_ADULTE_BETAIL = 120;

/** L'enclos terminé de la famille, s'il en existe un avec de la place. */
export function enclosDe(monde: Monde, famille: string): Batiment | null {
  for (const b of monde.batiments.values()) {
    if (b.type === "enclos" && b.etat === "termine" && b.famille === famille) return b;
  }
  return null;
}

export function betesDe(monde: Monde, famille: string): Bete[] {
  return [...monde.betail.values()].filter((b) => b.famille === famille);
}

/**
 * Après une chasse réussie : avec une corde, un jeune isolé d'une espèce
 * docile peut être ramené vivant. Renvoie la bête ou null.
 */
export function tenterCapture(
  p: Personnage,
  espece: Espece,
  rng: Rng,
  prochainId: () => string,
): Bete | null {
  const docilite = DOCILITE[espece];
  if (docilite <= 0) return null;
  // Il faut une corde pour entraver la bête.
  if ((p.corps.inventaire.ressources.corde ?? 0) < 1) return null;
  if (!rng.chance(docilite * 0.8)) return null;
  retirer(p.corps.inventaire, "corde", 1);
  const id = prochainId();
  const bete: Bete = {
    id,
    espece,
    famille: p.identite.nomFamille,
    proprietaire: p.id,
    position: { ...p.corps.position },
    ageJours: 60,
    docilite: docilite * 0.6,
    faim: 0,
    neeEnCaptivite: false,
    derniereTraite: 0,
    derniereTonte: 0,
  };
  return bete;
}

/**
 * Une heure d'une bête : à l'enclos elle y reste ; sinon elle suit son maître
 * de loin, ou s'échappe (une bête peu docile sans enclos).
 */
export function heureBete(monde: Monde, b: Bete): "reste" | "suit" | "fuit" {
  const enclos = enclosDe(monde, b.famille);
  if (enclos !== null) {
    // Au parc, chaque bête a son coin : elles ne s'empilent plus sur la même case (M39a).
    if (Grille.distance(b.position, enclos.position) > 1)
      b.position = placeAuParc(monde, b, enclos);
    return "reste";
  }
  const maitre = monde.personnages.find((p) => p.id === b.proprietaire && p.vivant);
  if (maitre === undefined) return "fuit";
  const d = Grille.distance(b.position, maitre.corps.position);
  if (d > 2) {
    const dx = Math.sign(maitre.corps.position.x - b.position.x);
    const dy = Math.sign(maitre.corps.position.y - b.position.y);
    for (let i = 0; i < Math.min(3, d - 1); i++) {
      const pos = { x: b.position.x + dx, y: b.position.y + dy };
      const t = monde.grille.tuileSiGeneree(pos.x, pos.y);
      if (t === null) break;
      b.position = pos;
    }
  }
  return "suit";
}

/**
 * La place d'une bête dans le parc : les huit cases autour du piquet, prises
 * dans l'ordre des bêtes de la famille, pour qu'elles se répartissent.
 */
function placeAuParc(monde: Monde, b: Bete, enclos: Batiment): Position {
  const COINS: readonly [number, number][] = [
    [0, 1],
    [1, 1],
    [-1, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
    [1, -1],
    [-1, -1],
  ];
  const troupe = betesDe(monde, b.famille).sort((x, y) => (x.id < y.id ? -1 : 1));
  const rang = Math.max(
    0,
    troupe.findIndex((x) => x.id === b.id),
  );
  const coin = COINS[rang % COINS.length] ?? [0, 1];
  const pos = { x: enclos.position.x + coin[0], y: enclos.position.y + coin[1] };
  return monde.grille.estPraticable(pos.x, pos.y)
    ? pos
    : { x: enclos.position.x, y: enclos.position.y + 1 };
}

export interface EvenementBetail {
  readonly genre: "naissance" | "lait" | "laine" | "famine" | "fuite";
  readonly bete: Bete;
  readonly quantite: number;
}

/**
 * Passe quotidienne d'une bête : elle vieillit, broute (l'hiver, les fibres
 * autour de l'enclos) ou a faim, donne du lait à l'enclos, de la laine au
 * printemps, et met bas si deux adultes de son espèce partagent l'enclos.
 */
export function jourBete(
  monde: Monde,
  b: Bete,
  rng: Rng,
  prochainId: () => string,
): {
  evenements: EvenementBetail[];
  nouvelle: Bete | null;
} {
  const evenements: EvenementBetail[] = [];
  let nouvelle: Bete | null = null;
  const moment = monde.horloge.moment();
  b.ageJours += 1;
  const enclos = enclosDe(monde, b.famille);
  // Sans enclos, une bête peu docile finit par s'échapper.
  if (enclos === null && rng.chance((1 - b.docilite) * 0.1)) {
    evenements.push({ genre: "fuite", bete: b, quantite: 0 });
    return { evenements, nouvelle };
  }
  // L'hiver, elle broute les fibres autour de l'enclos ou dépérit.
  if (moment.saison === "hiver") {
    let broute = false;
    const centre = enclos?.position ?? b.position;
    for (let dy = -RAYON_PATURAGE; dy <= RAYON_PATURAGE && !broute; dy++) {
      for (let dx = -RAYON_PATURAGE; dx <= RAYON_PATURAGE && !broute; dx++) {
        const t = monde.grille.tuileSiGeneree(centre.x + dx, centre.y + dy);
        const g = t?.gisement;
        if (g?.type === "fibres" && g.quantite >= 1) {
          g.quantite -= 1;
          broute = true;
        }
      }
    }
    if (
      !broute &&
      enclos?.stock !== null &&
      enclos !== null &&
      (enclos.stock.ressources.fibres ?? 0) >= 1
    ) {
      enclos.stock.ressources.fibres = (enclos.stock.ressources.fibres ?? 1) - 1;
      broute = true;
    }
    if (broute) b.faim = 0;
    else {
      b.faim += 1;
      if (b.faim > FAMINE_BETAIL) {
        evenements.push({ genre: "famine", bete: b, quantite: 0 });
        return { evenements, nouvelle };
      }
    }
  } else {
    b.faim = 0;
  }
  if (enclos?.stock === null || enclos === null || b.ageJours < AGE_ADULTE_BETAIL)
    return { evenements, nouvelle };
  // Le lait : un par deux jours, du mouflon ou de l'aurochs, dans le stock de l'enclos.
  if (
    (b.espece === "mouflon" || b.espece === "aurochs") &&
    moment.jourAbsolu - b.derniereTraite >= 2 &&
    b.docilite >= 0.4
  ) {
    b.derniereTraite = moment.jourAbsolu;
    const n = ajouter(enclos.stock, "lait", b.espece === "aurochs" ? 2 : 1);
    if (n > 0) evenements.push({ genre: "lait", bete: b, quantite: n });
  }
  // La laine du mouflon, au printemps : six fibres.
  if (
    b.espece === "mouflon" &&
    moment.saison === "printemps" &&
    moment.jourDeSaison >= 15 &&
    b.derniereTonte !== moment.annee
  ) {
    b.derniereTonte = moment.annee;
    const n = ajouter(enclos.stock, "fibres", 6);
    if (n > 0) evenements.push({ genre: "laine", bete: b, quantite: n });
  }
  // Mise bas au printemps : deux adultes de la même espèce, de la place, une chance sur deux.
  if (moment.saison === "printemps" && moment.jourDeSaison === 10) {
    const pairs = betesDe(monde, b.famille).filter(
      (x) => x.id !== b.id && x.espece === b.espece && x.ageJours >= AGE_ADULTE_BETAIL,
    );
    const total = betesDe(monde, b.famille).length;
    if (pairs.length > 0 && total < CAPACITE_ENCLOS && rng.chance(0.5)) {
      const id = prochainId();
      nouvelle = {
        id,
        espece: b.espece,
        famille: b.famille,
        proprietaire: b.proprietaire,
        position: { ...b.position },
        ageJours: 0,
        docilite: Math.min(1, b.docilite + 0.3),
        faim: 0,
        neeEnCaptivite: true,
        derniereTraite: 0,
        derniereTonte: 0,
      };
      evenements.push({ genre: "naissance", bete: nouvelle, quantite: 1 });
    }
  }
  return { evenements, nouvelle };
}

// ---------------------------------------------------------------- champs

/** Un champ : semé ou non, son stade de pousse, ses récoltes consécutives. */
export interface Culture {
  seme: boolean;
  /** 0 semé, 1 levée, 2 pousse, 3 épis, 4 mûr. */
  stade: number;
  /** Jours passés au stade courant. */
  jours: number;
  /** Récoltes consécutives sans jachère (la fertilité s'épuise). */
  recoltes: number;
  /** Une année sans semis rend la fertilité. */
  jachere: boolean;
}

export const GRAINES_PAR_SEMIS = 4;
export const JOURS_PAR_STADE = 12;
export const RENDEMENT_CHAMP = 24;

export function cultureInitiale(): Culture {
  return { seme: false, stade: 0, jours: 0, recoltes: 0, jachere: false };
}

/** Rendement d'une récolte selon la fertilité (deux récoltes de suite l'épuisent). */
export function rendement(culture: Culture, competence: number): number {
  const fertilite = Math.max(0.25, 1 - 0.3 * Math.min(2, culture.recoltes));
  return Math.round(RENDEMENT_CHAMP * fertilite * (1 + 0.08 * competence));
}

export interface EvenementChamp {
  readonly genre: "levee" | "mur" | "gel" | "ravage" | "semis" | "jachere";
  readonly champ: Batiment;
}

/**
 * Passe quotidienne d'un champ : pousse au printemps et l'été, mûr à
 * l'automne (le gisement de la tuile se remplit), gel au premier jour de
 * l'hiver, ravage par un troupeau voisin, jachère qui rend la fertilité.
 */
export function jourChamp(monde: Monde, champ: Batiment, competence: number): EvenementChamp[] {
  const evenements: EvenementChamp[] = [];
  const c = champ.culture;
  if (c === null || champ.etat !== "termine") return evenements;
  const moment = monde.horloge.moment();
  const tuile = monde.grille.tuileOuNull(champ.position.x, champ.position.y);
  if (tuile === null) return evenements;
  if (moment.saison === "hiver" && moment.jourDeSaison === 1) {
    if (c.seme && c.stade < 4) evenements.push({ genre: "gel", champ });
    if (!c.seme) {
      if (c.recoltes > 0) evenements.push({ genre: "jachere", champ });
      c.recoltes = 0;
    }
    c.seme = false;
    c.stade = 0;
    c.jours = 0;
    if (tuile.gisement?.type === "baies" && tuile.gisement.tauxRegen === 0) tuile.gisement = null;
    return evenements;
  }
  if (!c.seme) return evenements;
  // Un troupeau qui passe piétine.
  for (const t of monde.troupeaux.values()) {
    if (PROFILS[t.espece].predateur || t.taille <= 0) continue;
    if (Grille.distance(t.position, champ.position) <= 1 && c.stade > 0 && c.stade < 4) {
      c.stade -= 1;
      c.jours = 0;
      evenements.push({ genre: "ravage", champ });
      break;
    }
  }
  if (c.stade >= 4) return evenements;
  if (moment.saison === "printemps" || moment.saison === "ete" || moment.saison === "automne") {
    c.jours += 1;
    if (c.jours >= JOURS_PAR_STADE) {
      c.jours = 0;
      c.stade += 1;
      if (c.stade === 1) evenements.push({ genre: "levee", champ });
      if (c.stade === 4) {
        // Mûr : la tuile devient un gisement de baies cultivées, à récolter.
        const quantite = rendement(c, competence);
        tuile.gisement = {
          type: "baies",
          quantite,
          max: quantite,
          tauxRegen: 0,
          outilRequis: null,
        };
        c.recoltes += 1;
        evenements.push({ genre: "mur", champ });
      }
    }
  }
  return evenements;
}

/** Semer un champ terminé et vide : quatre graines. */
export function semer(champ: Batiment): boolean {
  const c = champ.culture;
  if (c === null || champ.etat !== "termine" || c.seme) return false;
  c.seme = true;
  c.stade = 0;
  c.jours = 0;
  c.jachere = false;
  return true;
}

// ---------------------------------------------------------------- métiers

const TITRES: Readonly<Record<Competence, readonly [string, string]>> = {
  recolte: ["cueilleur", "cueilleuse"],
  chasse: ["chasseur", "chasseuse"],
  peche: ["pêcheur", "pêcheuse"],
  construction: ["bâtisseur", "bâtisseuse"],
  artisanat: ["artisan", "artisane"],
  cuisine: ["cuisinier", "cuisinière"],
  soin: ["guérisseur", "guérisseuse"],
  persuasion: ["parleur", "parleuse"],
  combat: ["guerrier", "guerrière"],
  agriculture: ["paysan", "paysanne"],
};

/**
 * Titre de métier : la compétence la plus pratiquée, au niveau 3 au moins ;
 * la cueillette, que tout le monde pratique, compte moitié moins. Sinon aucun.
 */
export function titre(p: Personnage): string | null {
  let meilleure: Competence | null = null;
  let score = 0;
  for (const c of COMPETENCES) {
    const s = p.experience[c] * (c === "recolte" ? 0.5 : 1);
    if (s > score) {
      score = s;
      meilleure = c;
    }
  }
  if (meilleure === null || niveau(p.experience[meilleure]) < 3) return null;
  return TITRES[meilleure][p.identite.sexe === "F" ? 1 : 0];
}
