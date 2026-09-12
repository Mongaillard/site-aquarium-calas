/**
 * Empreinte déterministe des morceaux générés (FNV-1a 32 bits) : sert aux
 * tests de reproductibilité (P1). Les morceaux sont pris dans un ordre fixe,
 * l'empreinte ne dépend donc pas de l'ordre de génération.
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
  const morceaux = [...grille.morceauxGeneres()].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  absorber(morceaux.length);
  for (const m of morceaux) {
    absorber(m.cx);
    absorber(m.cy);
    for (const t of m.tuiles) {
      if (t === null) {
        absorber(255);
        continue;
      }
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
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
