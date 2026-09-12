/** Ressources et gisements (section 4.2). */
import type { Biome } from "./biomes.js";

export const RESSOURCES = [
  "bois",
  "pierre",
  "baies",
  "poisson",
  "gibier",
  "eau",
  "fibres",
  "argile",
  "graines",
  "cuir",
  "corde",
  "repas_cuit",
  "poisson_fume",
  "herbes",
  "lait",
] as const;
export type Ressource = (typeof RESSOURCES)[number];

export const OUTILS = ["hache_pierre", "pioche", "lance", "canne_a_peche", "filet"] as const;
export type Outil = (typeof OUTILS)[number];

export interface Gisement {
  readonly type: Ressource;
  quantite: number;
  readonly max: number;
  /** Quantité régénérée par jour (0 = non renouvelable). */
  readonly tauxRegen: number;
  readonly outilRequis: Outil | null;
  /** Arbres abattus : tick de l'abattage ; la souche repousse après 180 jours. */
  epuiseDepuis?: number | null;
}

interface ProfilGisement {
  readonly type: Ressource;
  /** Probabilité de présence sur une tuile du biome. */
  readonly probabilite: number;
  readonly min: number;
  readonly max: number;
  readonly tauxRegen: number;
  readonly outilRequis: Outil | null;
}

/**
 * Gisements possibles par biome. Les probabilités sont évaluées dans l'ordre :
 * une tuile ne porte qu'un seul gisement. Le bois mort (sans outil) précède
 * les arbres (hache requise) pour permettre la fabrication de la première hache.
 */
export const GISEMENTS_PAR_BIOME: Record<Biome, readonly ProfilGisement[]> = {
  eau_profonde: [],
  eau_peu_profonde: [
    {
      type: "poisson",
      probabilite: 0.35,
      min: 4,
      max: 12,
      tauxRegen: 1,
      outilRequis: "canne_a_peche",
    },
  ],
  plage: [{ type: "argile", probabilite: 0.12, min: 3, max: 8, tauxRegen: 0.1, outilRequis: null }],
  prairie: [
    { type: "baies", probabilite: 0.1, min: 2, max: 6, tauxRegen: 0.5, outilRequis: null },
    { type: "herbes", probabilite: 0.06, min: 2, max: 5, tauxRegen: 0.5, outilRequis: null },
    { type: "fibres", probabilite: 0.25, min: 3, max: 8, tauxRegen: 1, outilRequis: null },
    { type: "bois", probabilite: 0.04, min: 1, max: 2, tauxRegen: 0.2, outilRequis: null },
  ],
  foret: [
    { type: "bois", probabilite: 0.2, min: 1, max: 3, tauxRegen: 0.3, outilRequis: null },
    {
      type: "bois",
      probabilite: 0.45,
      min: 6,
      max: 20,
      tauxRegen: 0.2,
      outilRequis: "hache_pierre",
    },
    { type: "baies", probabilite: 0.25, min: 3, max: 8, tauxRegen: 0.5, outilRequis: null },
    { type: "herbes", probabilite: 0.05, min: 2, max: 5, tauxRegen: 0.5, outilRequis: null },
  ],
  colline: [{ type: "pierre", probabilite: 0.4, min: 8, max: 25, tauxRegen: 0, outilRequis: null }],
  montagne: [
    { type: "pierre", probabilite: 0.7, min: 15, max: 40, tauxRegen: 0, outilRequis: "pioche" },
  ],
  marais: [
    { type: "fibres", probabilite: 0.4, min: 4, max: 10, tauxRegen: 1.5, outilRequis: null },
    { type: "argile", probabilite: 0.3, min: 4, max: 10, tauxRegen: 0.1, outilRequis: null },
  ],
};

/** Caractère ASCII des gisements pour le rendu. */
export const ASCII_RESSOURCE: Record<Ressource, string> = {
  bois: "t",
  pierre: "o",
  baies: "*",
  poisson: "f",
  gibier: "g",
  eau: "w",
  fibres: '"',
  argile: "a",
  graines: "s",
  cuir: "c",
  corde: "r",
  repas_cuit: "p",
  poisson_fume: "s",
  herbes: "h",
  lait: "l",
};
