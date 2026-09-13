/** Bâtiments et chantiers (section 7.2). */
import type { Inventaire } from "../agents/inventaire.js";
import { creerInventaire } from "../agents/inventaire.js";
import type { Position } from "./grille.js";
import type { Ressource } from "./ressources.js";
import { cultureInitiale } from "./village.js";
import type { Culture } from "./village.js";

export const TYPES_BATIMENT = [
  "feu_de_camp",
  "abri",
  "maison",
  "entrepot",
  "four",
  "puits",
  "palissade",
  "tombe",
  "fumoir",
  "enclos",
  "champ",
  "autel",
  "stele",
] as const;
export type TypeBatiment = (typeof TYPES_BATIMENT)[number];

export interface PlanBatiment {
  readonly nom: string;
  readonly materiaux: Partial<Record<Ressource, number>>;
  /** Travail total en ticks·personne. */
  readonly travail: number;
  readonly capaciteDormeurs: number;
  readonly capaciteStock: number;
  /** Gain de chaleur (en unités de perte de base) pour qui dort ou se tient dessus. */
  readonly chaleur: number;
  /** Rayon dans lequel le gain de chaleur s'applique (0 = sur la tuile seulement). */
  readonly rayonChaleur: number;
  readonly abri: boolean;
  readonly atelier: "feu" | "four" | "fumoir" | null;
  readonly sourceEau: boolean;
  readonly ascii: string;
}

export const PLANS_BATIMENT: Record<TypeBatiment, PlanBatiment> = {
  feu_de_camp: {
    nom: "feu de camp",
    materiaux: { bois: 5 },
    travail: 3,
    capaciteDormeurs: 0,
    capaciteStock: 0,
    chaleur: 2.5,
    rayonChaleur: 2,
    abri: false,
    atelier: "feu",
    sourceEau: false,
    ascii: "f",
  },
  abri: {
    nom: "abri",
    materiaux: { bois: 10, fibres: 4 },
    travail: 24,
    capaciteDormeurs: 2,
    capaciteStock: 0,
    chaleur: 2,
    rayonChaleur: 0,
    abri: true,
    atelier: null,
    sourceEau: false,
    ascii: "A",
  },
  maison: {
    nom: "maison",
    materiaux: { bois: 30, pierre: 20, corde: 6 },
    travail: 96,
    capaciteDormeurs: 5,
    capaciteStock: 50,
    chaleur: 3,
    rayonChaleur: 0,
    abri: true,
    atelier: null,
    sourceEau: false,
    ascii: "M",
  },
  entrepot: {
    nom: "entrepôt",
    materiaux: { bois: 15, pierre: 10 },
    travail: 40,
    capaciteDormeurs: 0,
    capaciteStock: 200,
    chaleur: 0,
    rayonChaleur: 0,
    abri: false,
    atelier: null,
    sourceEau: false,
    ascii: "E",
  },
  four: {
    nom: "four",
    materiaux: { argile: 12, pierre: 6 },
    travail: 24,
    capaciteDormeurs: 0,
    capaciteStock: 0,
    chaleur: 1,
    rayonChaleur: 1,
    abri: false,
    atelier: "four",
    sourceEau: false,
    ascii: "F",
  },
  puits: {
    nom: "puits",
    materiaux: { pierre: 20 },
    travail: 48,
    capaciteDormeurs: 0,
    capaciteStock: 0,
    chaleur: 0,
    rayonChaleur: 0,
    abri: false,
    atelier: null,
    sourceEau: true,
    ascii: "P",
  },
  palissade: {
    nom: "palissade",
    materiaux: { bois: 2 },
    travail: 4,
    capaciteDormeurs: 0,
    capaciteStock: 0,
    chaleur: 0,
    rayonChaleur: 0,
    abri: false,
    atelier: null,
    sourceEau: false,
    ascii: "#",
  },
  enclos: {
    nom: "enclos",
    materiaux: { bois: 6, fibres: 4 },
    travail: 10,
    capaciteDormeurs: 0,
    capaciteStock: 12,
    chaleur: 0,
    rayonChaleur: 0,
    abri: false,
    atelier: null,
    sourceEau: false,
    ascii: "O",
  },
  champ: {
    nom: "champ",
    materiaux: { graines: 4 },
    travail: 8,
    capaciteDormeurs: 0,
    capaciteStock: 0,
    chaleur: 0,
    rayonChaleur: 0,
    abri: false,
    atelier: null,
    sourceEau: false,
    ascii: "=",
  },
  autel: {
    nom: "autel",
    materiaux: { pierre: 4, bois: 2 },
    travail: 8,
    capaciteDormeurs: 0,
    capaciteStock: 0,
    chaleur: 0,
    rayonChaleur: 0,
    abri: false,
    atelier: null,
    sourceEau: false,
    ascii: "^",
  },
  fumoir: {
    nom: "fumoir",
    materiaux: { bois: 6, pierre: 3, argile: 2 },
    travail: 20,
    capaciteDormeurs: 0,
    capaciteStock: 0,
    chaleur: 1,
    rayonChaleur: 1,
    abri: false,
    atelier: "fumoir",
    sourceEau: false,
    ascii: "S",
  },
  stele: {
    nom: "stèle",
    materiaux: { pierre: 2 },
    travail: 4,
    capaciteDormeurs: 0,
    capaciteStock: 0,
    chaleur: 0,
    rayonChaleur: 0,
    abri: false,
    atelier: null,
    sourceEau: false,
    ascii: "i",
  },
  tombe: {
    nom: "tombe",
    materiaux: { pierre: 4 },
    travail: 8,
    capaciteDormeurs: 0,
    capaciteStock: 0,
    chaleur: 0,
    rayonChaleur: 0,
    abri: false,
    atelier: null,
    sourceEau: false,
    ascii: "+",
  },
};

export interface Batiment {
  readonly id: string;
  readonly type: TypeBatiment;
  readonly position: Position;
  proprietaire: string;
  /** Nom de famille du fondateur : la famille est autorisée d'office. */
  readonly famille: string;
  readonly autorises: string[];
  etat: "chantier" | "termine";
  /** Matériaux déjà livrés sur le chantier. */
  readonly livre: Partial<Record<Ressource, number>>;
  travailRestant: number;
  /** Solidité 0..100 ; s'use chaque jour, s'effondre à 0. */
  solidite: number;
  readonly stock: Inventaire | null;
  /** Feux : allumé ou éteint, et la réserve de bûches (quatre par jour, six sous la neige). */
  allume: boolean;
  reserveBois: number;
  readonly fondeAuTick: number;
  termineAuTick: number | null;
  /** Tombes : ce qu'on y grave. */
  epitaphe: string | null;
  /** Champs : l'état de la culture. */
  culture: Culture | null;
  /** Décidé par le village : tout le monde y a accès et y travaille. */
  commun?: boolean;
}

export function creerChantier(
  id: string,
  type: TypeBatiment,
  position: Position,
  proprietaire: string,
  famille: string,
  tick: number,
): Batiment {
  const plan = PLANS_BATIMENT[type];
  return {
    id,
    type,
    position: { ...position },
    proprietaire,
    famille,
    autorises: [],
    etat: "chantier",
    livre: {},
    travailRestant: plan.travail,
    solidite: 100,
    stock: plan.capaciteStock > 0 ? creerInventaire(plan.capaciteStock) : null,
    allume: false,
    reserveBois: 0,
    fondeAuTick: tick,
    termineAuTick: null,
    epitaphe: null,
    culture: type === "champ" ? cultureInitiale() : null,
  };
}

/** Matériaux qu'il reste à livrer sur un chantier. */
export function materiauxManquants(b: Batiment): Partial<Record<Ressource, number>> {
  const manquants: Partial<Record<Ressource, number>> = {};
  for (const [r, n] of Object.entries(PLANS_BATIMENT[b.type].materiaux) as [Ressource, number][]) {
    const reste = n - (b.livre[r] ?? 0);
    if (reste > 0) manquants[r] = reste;
  }
  return manquants;
}

export function materiauxLivres(b: Batiment): boolean {
  return Object.keys(materiauxManquants(b)).length === 0;
}

export function plan(b: Batiment): PlanBatiment {
  return PLANS_BATIMENT[b.type];
}
