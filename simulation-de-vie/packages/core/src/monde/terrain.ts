/**
 * Le pinceau du ciel (jalon 25, « sculpter le monde ») : l'observateur remodèle
 * le terrain tuile par tuile — terre, eau, forêt, montagne, sable — avant de
 * poser un peuple, ou en cours de partie. Chaque coup de pinceau est
 * reproductible (gisements tirés du flux du monde) et sauvegardé avec la grille.
 */
import type { Biome } from "./biomes.js";
import { INFO_BIOME } from "./biomes.js";
import { tirerGisement } from "./generation.js";
import type { Grille, Position, Tuile } from "./grille.js";
import type { Rng } from "../rng.js";

export const PINCEAUX = ["terre", "eau", "foret", "montagne", "sable"] as const;
export type Pinceau = (typeof PINCEAUX)[number];

/** Rayon maximal d'un coup de pinceau, en tuiles. */
export const RAYON_PINCEAU_MAX = 6;

export interface ResultatSculpture {
  /** Tuiles dont le biome a changé. */
  readonly tuiles: number;
  /** Tuiles touchées mais laissées telles quelles (bâtiment, hors du monde, déjà ce biome). */
  readonly ignorees: number;
}

/** Le biome que pose un pinceau à une distance donnée du centre (cœur, puis lisière). */
export function biomeDuPinceau(pinceau: Pinceau, distance: number, rayon: number): Biome {
  const lisiere = rayon >= 2 && distance > rayon - 1;
  switch (pinceau) {
    case "terre":
      return "prairie";
    case "eau":
      return lisiere ? "eau_peu_profonde" : "eau_profonde";
    case "foret":
      return "foret";
    case "montagne":
      return lisiere ? "colline" : "montagne";
    case "sable":
      return "plage";
  }
}

/**
 * Applique un pinceau en disque autour d'un centre. Les tuiles bâties sont
 * épargnées ; les autres prennent le biome du pinceau, perdent leur gisement et
 * en retirent un nouveau selon le biome posé. Tout ce qui est sculpté est
 * découvert : le ciel voit ce qu'il façonne.
 */
export function sculpter(
  grille: Grille,
  rng: Rng,
  pinceau: Pinceau,
  centre: Position,
  rayon: number,
): ResultatSculpture {
  const r = Math.max(0, Math.min(RAYON_PINCEAU_MAX, Math.floor(rayon)));
  let tuiles = 0;
  let ignorees = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r + 0.5) continue;
      const x = centre.x + dx;
      const y = centre.y + dy;
      const t = grille.tuileOuNull(x, y);
      if (t?.batiment !== null) {
        ignorees += 1;
        continue;
      }
      const biome = biomeDuPinceau(pinceau, d, r);
      grille.decouvrir(x, y);
      if (!grille.modifierBiome(x, y, biome)) {
        ignorees += 1;
        continue;
      }
      tuiles += 1;
      const g = tirerGisement(rng, biome);
      if (g !== null) grille.poserGisement(t, g);
    }
  }
  // La lisière du coup de pinceau se découvre aussi : on voit où l'on pose la suite.
  for (let dy = -r - 1; dy <= r + 1; dy++)
    for (let dx = -r - 1; dx <= r + 1; dx++) grille.decouvrir(centre.x + dx, centre.y + dy);
  return { tuiles, ignorees };
}

/** La tuile praticable la plus proche (spirale carrée), ou null dans un rayon donné. */
export function tuilePraticableProche(
  grille: Grille,
  origine: Position,
  rayonMax = 12,
): Tuile | null {
  for (let r = 0; r <= rayonMax; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const t = grille.tuileOuNull(origine.x + dx, origine.y + dy);
        if (t !== null && INFO_BIOME[t.biome].praticable && t.biome !== "eau_peu_profonde")
          return t;
      }
    }
  }
  return null;
}
