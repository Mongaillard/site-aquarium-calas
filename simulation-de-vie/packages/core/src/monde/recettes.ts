/** Objets et recettes d'artisanat (section 7.1). */
import type { Competence } from "../agents/competences.js";
import type { Ressource } from "./ressources.js";

export const TYPES_OBJET = [
  "hache_pierre",
  "pioche",
  "hache_cuivre",
  "pioche_cuivre",
  "lance",
  "canne_a_peche",
  "filet",
  "vetement_cuir",
  "pot_argile",
  "bandage",
  "piege",
  "pirogue",
  "osselets",
  "arc",
  "couche",
  "traineau",
  "flute",
  "cataplasme",
  "attelle",
  /** Une chose née de la grammaire d'invention (M38) : c'est `trouvaille` qui dit laquelle. */
  "trouvaille",
] as const;
export type TypeObjet = (typeof TYPES_OBJET)[number];

export interface Objet {
  readonly type: TypeObjet;
  /** Solidité 0..100 ; un outil à 0 est cassé et disparaît. */
  solidite: number;
  /** Réparations déjà faites (deux au plus). */
  reparations?: number;
  /** Identifiant de la trouvaille (M38), pour un objet de type `trouvaille`. */
  trouvaille?: string;
}

/** Un outil ébréché se répare deux fois, pas plus. */
export const REPARATIONS_MAX = 2;
/** Solidité en dessous de laquelle on répare. */
export const SEUIL_REPARATION = 25;

export type Atelier = "feu" | "four" | "fumoir";

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
  /** Recette d'invention : il faut en avoir eu l'idée (ou l'avoir apprise) pour la fabriquer. */
  readonly invention?:
    | "filet"
    | "piege"
    | "pirogue"
    | "osselets"
    | "arc"
    | "fumoir"
    | "couche"
    | "traineau"
    | "flute"
    | "vetement"
    | "fonte"
    | "outils_de_cuivre";
}

/** L'invention qu'exige une recette, s'il y en a une. */
export function inventionDeRecette(nom: NomRecette): Recette["invention"] {
  const recette: Recette = RECETTES[nom];
  return recette.invention;
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
    niveauRequis: 0,
    atelier: null,
    duree: 4,
  },
  cuivre: {
    nom: "lingot de cuivre",
    produit: { ressource: "cuivre", quantite: 1 },
    ingredients: { minerai: 3, bois: 2 },
    competence: "artisanat",
    niveauRequis: 1,
    atelier: "four",
    duree: 8,
    invention: "fonte",
  },
  hache_cuivre: {
    nom: "hache de cuivre",
    produit: { objet: "hache_cuivre" },
    ingredients: { cuivre: 1, bois: 2 },
    competence: "artisanat",
    niveauRequis: 1,
    atelier: null,
    duree: 5,
    invention: "outils_de_cuivre",
  },
  pioche_cuivre: {
    nom: "pioche de cuivre",
    produit: { objet: "pioche_cuivre" },
    ingredients: { cuivre: 1, bois: 2 },
    competence: "artisanat",
    niveauRequis: 1,
    atelier: null,
    duree: 5,
    invention: "outils_de_cuivre",
  },
  canne_a_peche: {
    nom: "canne à pêche",
    produit: { objet: "canne_a_peche" },
    ingredients: { bois: 2, fibres: 2 },
    competence: "artisanat",
    niveauRequis: 0,
    atelier: null,
    duree: 4,
  },
  filet: {
    nom: "filet",
    produit: { objet: "filet" },
    ingredients: { fibres: 6, bois: 1 },
    competence: "artisanat",
    niveauRequis: 1,
    atelier: null,
    duree: 6,
    invention: "filet",
  },
  piege: {
    nom: "piège",
    produit: { objet: "piege" },
    ingredients: { bois: 3, fibres: 2 },
    competence: "artisanat",
    niveauRequis: 0,
    atelier: null,
    duree: 5,
    invention: "piege",
  },
  pirogue: {
    nom: "pirogue",
    produit: { objet: "pirogue" },
    ingredients: { bois: 8, fibres: 4 },
    competence: "artisanat",
    niveauRequis: 1,
    atelier: null,
    duree: 12,
    invention: "pirogue",
  },
  osselets: {
    nom: "osselets",
    produit: { objet: "osselets" },
    ingredients: { pierre: 3 },
    competence: "artisanat",
    niveauRequis: 0,
    atelier: null,
    duree: 3,
    invention: "osselets",
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
    niveauRequis: 1,
    atelier: null,
    duree: 8,
    invention: "vetement",
  },
  arc: {
    nom: "arc",
    produit: { objet: "arc" },
    ingredients: { bois: 3, fibres: 3 },
    competence: "artisanat",
    niveauRequis: 1,
    atelier: null,
    duree: 6,
    invention: "arc",
  },
  couche: {
    nom: "couche de fibres",
    produit: { objet: "couche" },
    ingredients: { fibres: 8, bois: 2 },
    competence: "artisanat",
    niveauRequis: 0,
    atelier: null,
    duree: 6,
    invention: "couche",
  },
  traineau: {
    nom: "traîneau",
    produit: { objet: "traineau" },
    ingredients: { bois: 6, fibres: 4 },
    competence: "artisanat",
    niveauRequis: 1,
    atelier: null,
    duree: 8,
    invention: "traineau",
  },
  flute: {
    nom: "flûte",
    produit: { objet: "flute" },
    ingredients: { bois: 1 },
    competence: "artisanat",
    niveauRequis: 0,
    atelier: null,
    duree: 3,
    invention: "flute",
  },
  poisson_fume: {
    nom: "poisson fumé",
    produit: { ressource: "poisson_fume", quantite: 3 },
    ingredients: { poisson: 3 },
    competence: "cuisine",
    niveauRequis: 0,
    atelier: "fumoir",
    duree: 4,
    invention: "fumoir",
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
    niveauRequis: 0,
    atelier: null,
    duree: 2,
  },
  cataplasme: {
    nom: "cataplasme d'herbes",
    produit: { objet: "cataplasme" },
    ingredients: { herbes: 2 },
    competence: "soin",
    niveauRequis: 0,
    atelier: null,
    duree: 2,
  },
  attelle: {
    nom: "attelle",
    produit: { objet: "attelle" },
    ingredients: { bois: 1, corde: 1 },
    competence: "soin",
    niveauRequis: 0,
    atelier: null,
    duree: 3,
  },
} as const satisfies Record<string, Recette>;

export type NomRecette = keyof typeof RECETTES;
export const NOMS_RECETTES = Object.keys(RECETTES) as NomRecette[];

export function recette(nom: NomRecette): Recette {
  return RECETTES[nom];
}

/** Solidité initiale d'un objet fabriqué (nombre d'usages pour un outil). */
export const SOLIDITE_INITIALE: Record<TypeObjet, number> = {
  // Une trouvaille porte sa propre solidité (M38) ; celle-ci ne sert que de secours.
  trouvaille: 60,
  hache_pierre: 40,
  pioche: 40,
  hache_cuivre: 160,
  pioche_cuivre: 160,
  lance: 30,
  canne_a_peche: 30,
  filet: 50,
  vetement_cuir: 100,
  pot_argile: 100,
  bandage: 1,
  piege: 25,
  pirogue: 200,
  osselets: 100,
  arc: 30,
  couche: 100,
  traineau: 100,
  flute: 100,
  cataplasme: 1,
  attelle: 1,
};
