/** Rendu ASCII de la grille (utilisé par la CLI et les tests). */
import { INFO_BIOME } from "./biomes.js";
import type { Grille } from "./grille.js";
import { ASCII_RESSOURCE } from "./ressources.js";

export interface OptionsAscii {
  /** Affiche les gisements par-dessus les biomes. */
  readonly ressources?: boolean;
}

export function rendreAscii(grille: Grille, options: OptionsAscii = {}): string {
  const lignes: string[] = [];
  for (let y = 0; y < grille.hauteur; y++) {
    let ligne = "";
    for (let x = 0; x < grille.largeur; x++) {
      const t = grille.tuile(x, y);
      if (options.ressources && t.gisement) {
        ligne += ASCII_RESSOURCE[t.gisement.type];
      } else {
        ligne += INFO_BIOME[t.biome].ascii;
      }
    }
    lignes.push(ligne);
  }
  return lignes.join("\n");
}

export const LEGENDE_ASCII: string = [
  "Biomes : ~ eau profonde   - eau peu profonde   . plage   , prairie",
  "         T forêt          n colline            ^ montagne   % marais",
  'Gisements : t bois  o pierre  * baies  f poisson  g gibier  " fibres  a argile',
].join("\n");
