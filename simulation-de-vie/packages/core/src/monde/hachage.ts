/**
 * Empreinte déterministe de la grille (FNV-1a 32 bits) : sert aux tests de
 * reproductibilité (P1) et à la vérification des snapshots.
 */
import { codeBiome } from "./biomes.js";
import type { Grille } from "./grille.js";
import { RESSOURCES } from "./ressources.js";

export function hacherGrille(grille: Grille): string {
  let h = 0x811c9dc5;
  const absorber = (v: number): void => {
    h ^= v & 0xff;
    h = Math.imul(h, 0x01000193);
  };
  absorber(grille.largeur);
  absorber(grille.hauteur);
  for (const t of grille.toutes()) {
    absorber(codeBiome(t.biome));
    // Altitude et humidité quantifiées sur 8 bits pour rester stables.
    absorber(Math.round((t.altitude + 1) * 127));
    absorber(Math.round((t.humidite + 1) * 127));
    if (t.gisement) {
      absorber(RESSOURCES.indexOf(t.gisement.type) + 1);
      absorber(t.gisement.quantite);
      absorber(t.gisement.max);
    } else {
      absorber(0);
    }
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
