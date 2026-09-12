/**
 * Maladies (jalon « le temps compte ») : quatre maux au catalogue, chacun avec
 * une cause lisible, une durée, une perte de santé par jour plafonnée par
 * l'âge, une contagion pour la toux grise, une immunité acquise pour les
 * fièvres. Une épidémie au plus tous les deux ans.
 */
import type { Monde } from "../monde.js";
import { Grille } from "../monde/grille.js";
import { phenotype } from "./genetique.js";
import type { Personnage } from "./personnage.js";

export const MALADIES = [
  "refroidissement",
  "fievre_des_eaux",
  "mal_des_ventres",
  "toux_grise",
] as const;
export type Maladie = (typeof MALADIES)[number];

export interface ProfilMaladie {
  readonly nom: string;
  /** Durée en jours (avant modulation par l'immunité). */
  readonly duree: number;
  /** Perte de santé par jour, pour un adulte ; ×1,5 pour un enfant ou un ancien. */
  readonly perteParJour: number;
  /** Contagion par heure, par malade à moins de deux tuiles. */
  readonly contagion: number;
  /** Une fois guéri, on ne l'attrape plus. */
  readonly immunisante: boolean;
  /** Multiplicateur de la faim (le mal des ventres creuse). */
  readonly faim: number;
}

export const PROFILS_MALADIE: Readonly<Record<Maladie, ProfilMaladie>> = {
  refroidissement: {
    nom: "refroidissement",
    duree: 4,
    perteParJour: 2,
    contagion: 0,
    immunisante: false,
    faim: 1,
  },
  fievre_des_eaux: {
    nom: "fièvre des eaux",
    duree: 8,
    perteParJour: 4,
    contagion: 0,
    immunisante: true,
    faim: 1,
  },
  mal_des_ventres: {
    nom: "mal des ventres",
    duree: 4,
    perteParJour: 2,
    contagion: 0,
    immunisante: false,
    faim: 1.3,
  },
  toux_grise: {
    nom: "toux grise",
    duree: 12,
    perteParJour: 3,
    contagion: 0.02,
    immunisante: true,
    faim: 1,
  },
};

export interface MaladieEnCours {
  readonly type: Maladie;
  readonly depuis: number;
  jusqua: number;
}

/** Rayon autour d'un point d'eau dans lequel une tombe souille l'eau. */
export const RAYON_SOUILLURE = 4;
/** Chance d'attraper la fièvre des eaux en buvant une eau souillée. */
export const CHANCE_FIEVRE_DES_EAUX = 0.03;
/** Chance du mal des ventres par repas de nourriture gâtée. */
export const CHANCE_MAL_DES_VENTRES = 0.3;
/** Chance quotidienne de refroidissement quand on a grelotté (chaleur < 25) dans la journée. */
export const CHANCE_REFROIDISSEMENT = 0.1;
/** Au plus une épidémie de toux grise tous les deux ans. */
export const ANNEES_ENTRE_EPIDEMIES = 2;

export function estMalade(p: Personnage, type?: Maladie): boolean {
  return p.corps.etat.maladies.some((m) => type === undefined || m.type === type);
}

export function estImmunise(p: Personnage, type: Maladie): boolean {
  return p.corps.etat.immunites.includes(type);
}

/**
 * Tombe malade, si ce n'est déjà fait et si l'on n'est pas immunisé ; la
 * durée dépend de l'immunité innée. Renvoie la maladie déclarée ou null.
 */
export function tomberMalade(
  monde: Monde,
  p: Personnage,
  type: Maladie,
  origine: string,
): MaladieEnCours | null {
  if (!p.vivant || estMalade(p, type) || estImmunise(p, type)) return null;
  const T = monde.horloge.ticksParJour;
  const tick = monde.horloge.tick;
  const profil = PROFILS_MALADIE[type];
  const immunite = phenotype(p.identite.genome, "immunite");
  const duree = Math.max(2, Math.round(profil.duree * (1.3 - 0.6 * immunite)));
  const m: MaladieEnCours = { type, depuis: tick, jusqua: tick + duree * T };
  p.corps.etat.maladies.push(m);
  monde.emettre("maladie", p, { maladie: type, nom: profil.nom, origine, jours: duree }, 6);
  p.memoire.ajouter(
    tick,
    "observation",
    `Je suis tombé${p.identite.sexe === "F" ? "e" : ""} malade (${profil.nom}), ${origine}.`,
    6,
    [],
  );
  return m;
}

/** Perte de santé quotidienne due aux maladies, plafonnée par l'âge. */
export function sourcesMaladies(p: Personnage): { cause: string; perteParJour: number }[] {
  const fragile = p.corps.stade === "enfant" || p.corps.stade === "ancien";
  return p.corps.etat.maladies.map((m) => ({
    cause: PROFILS_MALADIE[m.type].nom,
    perteParJour: PROFILS_MALADIE[m.type].perteParJour * (fragile ? 1.5 : 1),
  }));
}

/** Multiplicateur de la faim dû aux maladies. */
export function facteurFaimMaladies(p: Personnage): number {
  let f = 1;
  for (const m of p.corps.etat.maladies) f *= PROFILS_MALADIE[m.type].faim;
  return f;
}

/** Passe quotidienne : guérisons et immunités acquises. */
export function jourMaladies(monde: Monde, p: Personnage): void {
  const tick = monde.horloge.tick;
  const etat = p.corps.etat;
  for (let i = etat.maladies.length - 1; i >= 0; i--) {
    const m = etat.maladies[i];
    if (m === undefined || m.jusqua > tick) continue;
    etat.maladies.splice(i, 1);
    const profil = PROFILS_MALADIE[m.type];
    if (profil.immunisante && !etat.immunites.includes(m.type)) etat.immunites.push(m.type);
    monde.emettre("guerison_maladie", p, { maladie: m.type, nom: profil.nom }, 4);
  }
  // Le froid de la journée : qui a grelotté peut prendre un refroidissement.
  if (p.drapeaux.chaleurMinDuJour < 25 && p.rng.chance(CHANCE_REFROIDISSEMENT))
    tomberMalade(monde, p, "refroidissement", "après une journée à grelotter");
}

/** Contagion horaire : la toux grise passe d'un malade aux personnes à deux tuiles. */
export function heureContagion(monde: Monde): void {
  const malades = monde.personnages.filter((p) => p.vivant && estMalade(p, "toux_grise"));
  if (malades.length === 0) return;
  for (const p of monde.personnages) {
    if (!p.vivant || estMalade(p, "toux_grise") || estImmunise(p, "toux_grise")) continue;
    for (const m of malades) {
      if (Grille.distance(m.corps.position, p.corps.position) > 2) continue;
      if (p.rng.chance(PROFILS_MALADIE.toux_grise.contagion)) {
        tomberMalade(monde, p, "toux_grise", `au contact de ${m.identite.prenom}`);
        break;
      }
    }
  }
}

/** L'eau à cet endroit est-elle souillée par une tombe voisine ? (un puits, jamais.) */
export function eauSouillee(monde: Monde, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const t = monde.grille.tuileOuNull(x + dx, y + dy);
      if (t?.batiment?.type === "puits" && t.batiment.etat === "termine") return false;
    }
  for (const b of monde.batiments.values()) {
    if (b.type !== "tombe") continue;
    if (Grille.distance(b.position, { x, y }) <= RAYON_SOUILLURE) return true;
  }
  return false;
}

/** Soigner une maladie avec un cataplasme : trois jours de moins. */
export function soulager(monde: Monde, cible: Personnage): boolean {
  const T = monde.horloge.ticksParJour;
  const m = cible.corps.etat.maladies.find((x) => x.jusqua > monde.horloge.tick + T);
  if (m === undefined) return false;
  m.jusqua = Math.max(monde.horloge.tick + T, m.jusqua - 3 * T);
  return true;
}
