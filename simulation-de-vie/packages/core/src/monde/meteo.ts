/** Météo et saisons (section 4.3). */
import type { Rng } from "../rng.js";
import type { Saison } from "./horloge.js";

export const METEOS = ["clair", "pluie", "orage", "neige", "canicule"] as const;
export type Meteo = (typeof METEOS)[number];

export interface EffetsMeteo {
  /** Multiplicateur des pertes de chaleur en extérieur. */
  readonly froid: number;
  /** Multiplicateur de la vitesse de déplacement. */
  readonly vitesse: number;
  /** Multiplicateur de la régénération des baies. */
  readonly regenBaies: number;
  /** Multiplicateur de la soif. */
  readonly soif: number;
  /** Réduction du rayon de vision. */
  readonly vision: number;
  /** Éteint les feux de camp et use davantage les bâtiments. */
  readonly tempete: boolean;
}

export const EFFETS_METEO: Record<Meteo, EffetsMeteo> = {
  clair: { froid: 1, vitesse: 1, regenBaies: 1, soif: 1, vision: 0, tempete: false },
  pluie: { froid: 1.5, vitesse: 0.9, regenBaies: 1.5, soif: 0.9, vision: 1, tempete: false },
  orage: { froid: 2, vitesse: 0.8, regenBaies: 1.2, soif: 0.9, vision: 2, tempete: true },
  neige: { froid: 2.5, vitesse: 0.7, regenBaies: 0, soif: 1, vision: 1, tempete: false },
  canicule: { froid: 0.2, vitesse: 0.9, regenBaies: 0.6, soif: 1.6, vision: 0, tempete: false },
};

/** Poids de tirage des météos par saison. */
const POIDS: Record<Saison, Partial<Record<Meteo, number>>> = {
  printemps: { clair: 55, pluie: 35, orage: 10 },
  ete: { clair: 60, pluie: 15, orage: 10, canicule: 15 },
  automne: { clair: 45, pluie: 40, orage: 15 },
  hiver: { clair: 45, pluie: 20, neige: 35 },
};

export interface EffetsSaison {
  /** Perte de chaleur de base en extérieur, la nuit et le jour (en unités, voir besoins). */
  readonly froidNuit: number;
  readonly froidJour: number;
  /** Multiplicateur de la régénération des baies. */
  readonly regenBaies: number;
}

export const EFFETS_SAISON: Record<Saison, EffetsSaison> = {
  printemps: { froidNuit: 1, froidJour: 0, regenBaies: 1 },
  ete: { froidNuit: 0.5, froidJour: 0, regenBaies: 1.4 },
  automne: { froidNuit: 1.3, froidJour: 0.3, regenBaies: 0.6 },
  hiver: { froidNuit: 2, froidJour: 1, regenBaies: 0 },
};

/** Météo du jour, tirée de façon reproductible à partir du numéro de jour. */
export function tirerMeteo(rng: Rng, saison: Saison, jourAbsolu: number): Meteo {
  const flux = rng.fork(`meteo/${jourAbsolu}`);
  const poids = POIDS[saison];
  const candidats = METEOS.filter((m) => (poids[m] ?? 0) > 0);
  return flux.choisirPondere(
    candidats,
    candidats.map((m) => poids[m] ?? 0),
  );
}
