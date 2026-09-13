/** Outils de test : grilles synthétiques. */
import type { Biome } from "../src/monde/biomes.js";
import { Grille } from "../src/monde/grille.js";
import type { Tuile } from "../src/monde/grille.js";
import type { Gisement } from "../src/monde/ressources.js";
import type { Simulation } from "../src/simulation.js";

export interface Surcharge {
  readonly x: number;
  readonly y: number;
  readonly biome?: Biome;
  readonly gisement?: Gisement;
}

/** Grille uniforme (prairie par défaut) avec surcharges ponctuelles. */
export function grilleUniforme(
  largeur: number,
  hauteur: number,
  biome: Biome = "prairie",
  surcharges: Surcharge[] = [],
): Grille {
  const tuiles: Tuile[] = [];
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      tuiles.push({ x, y, biome, altitude: 0.2, humidite: 0, gisement: null, batiment: null });
    }
  }
  for (const s of surcharges) {
    const t = tuiles[s.y * largeur + s.x];
    if (t === undefined) throw new RangeError("surcharge hors grille");
    const nouvelle: Tuile = { ...t, biome: s.biome ?? t.biome, gisement: s.gisement ?? null };
    tuiles[s.y * largeur + s.x] = nouvelle;
  }
  return Grille.depuisTuiles(largeur, hauteur, tuiles);
}

export function gisementBaies(quantite = 5): Gisement {
  return { type: "baies", quantite, max: quantite, tauxRegen: 0.5, outilRequis: null };
}

export function gisementBois(quantite = 10): Gisement {
  return { type: "bois", quantite, max: quantite, tauxRegen: 0.2, outilRequis: "hache_pierre" };
}

/**
 * Avance de `jours` aubes en rendant la main au processus de test toutes les
 * `tranche` journées : un test long ne doit pas bloquer sa communication avec
 * Vitest (délai d'une minute).
 */
export async function joursAsync(sim: Simulation, jours: number, tranche = 10): Promise<void> {
  for (let j = 0; j < jours; j++) {
    sim.avancerJusquaAube();
    if (j % tranche === tranche - 1) await new Promise((r) => setTimeout(r, 0));
  }
}
