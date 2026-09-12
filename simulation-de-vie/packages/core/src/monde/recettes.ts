/** Objets et recettes d'artisanat (section 7.1). */
import type { Competence } from "../agents/competences.js";
import type { Ressource } from "./ressources.js";

export const TYPES_OBJET = [
  "hache_pierre",
  "pioche",
  "lance",
  "canne_a_peche",
  "filet",
  "vetement_cuir",
  "pot_argile",
  "bandage",
] as const;
export type TypeObjet = (typeof TYPES_OBJET)[number];

export interface Objet {
  readonly type: TypeObjet;
  /** Solidité 0..100 ; un outil à 0 est cassé et disparaît. */
  solidite: number;
}

export type Atelier = "feu" | "four";

export type ProduitRecette =
  { readonly objet: TypeObjet } | { readonly ressource: Ressource; readonly quantite: number };

export interface Recette {
  readonly nom: string;
  readonly produit: ProduitRecette;
  readonly ingredients: Partial<Record<Ressource, number>>;
  readonly competence: Competence;
  readonly niveauRequis: number;
  readonly atelier: Atelier | null;
  /** Durée en ticks au niveau requis. */
  readonly duree: number;
}

export const RECETTES = {
  hache_pierre: {
    nom: "hache de pierre",
    produit: { objet: "hache_pierre" },
    ingredients: { bois: 2, pierre: 3, fibres: 1 },
    competence: "artisanat",
    niveauRequis: 0,
    atelier: null,
    duree: 4,
  },
  pioche: {
    nom: "pioche",
    produit: { objet: "pioche" },
    ingredients: { bois: 2, pierre: 4 },
    competence: "artisanat",
    niveauRequis: 2,
    atelier: null,
    duree: 5,
  },
  lance: {
    nom: "lance",
    produit: { objet: "lance" },
    ingredients: { bois: 3, pierre: 1 },
    competence: "artisanat",
    niveauRequis: 1,
    atelier: null,
    duree: 4,
  },
  canne_a_peche: {
    nom: "canne à pêche",
    produit: { objet: "canne_a_peche" },
    ingredients: { bois: 2, fibres: 2 },
    competence: "artisanat",
    niveauRequis: 1,
    atelier: null,
    duree: 4,
  },
  filet: {
    nom: "filet",
    produit: { objet: "filet" },
    ingredients: { fibres: 6 },
    competence: "artisanat",
    niveauRequis: 3,
    atelier: null,
    duree: 6,
  },
  corde: {
    nom: "corde",
    produit: { ressource: "corde", quantite: 1 },
    ingredients: { fibres: 3 },
    competence: "artisanat",
    niveauRequis: 0,
    atelier: null,
    duree: 2,
  },
  vetement_cuir: {
    nom: "vêtement de cuir",
    produit: { objet: "vetement_cuir" },
    ingredients: { cuir: 3, corde: 1 },
    competence: "artisanat",
    niveauRequis: 3,
    atelier: null,
    duree: 8,
  },
  pot_argile: {
    nom: "pot d'argile",
    produit: { objet: "pot_argile" },
    ingredients: { argile: 3 },
    competence: "artisanat",
    niveauRequis: 2,
    atelier: "four",
    duree: 6,
  },
  repas_cuit: {
    nom: "repas cuit",
    produit: { ressource: "repas_cuit", quantite: 1 },
    ingredients: { baies: 1 },
    competence: "cuisine",
    niveauRequis: 0,
    atelier: "feu",
    duree: 2,
  },
  bandage: {
    nom: "bandage",
    produit: { objet: "bandage" },
    ingredients: { fibres: 2 },
    competence: "soin",
    niveauRequis: 1,
    atelier: null,
    duree: 2,
  },
} as const satisfies Record<string, Recette>;

export type NomRecette = keyof typeof RECETTES;
export const NOMS_RECETTES = Object.keys(RECETTES) as NomRecette[];

export function recette(nom: NomRecette): Recette {
  return RECETTES[nom];
}

/** Solidité initiale d'un objet fabriqué (nombre d'usages pour un outil). */
export const SOLIDITE_INITIALE: Record<TypeObjet, number> = {
  hache_pierre: 40,
  pioche: 40,
  lance: 30,
  canne_a_peche: 30,
  filet: 50,
  vetement_cuir: 100,
  pot_argile: 100,
  bandage: 1,
};
