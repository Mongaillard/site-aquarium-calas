/** Rendu ASCII de la grille (utilisé par la CLI et les tests). */
import { INFO_BIOME } from "./biomes.js";
import type { Grille } from "./grille.js";
import { ASCII_RESSOURCE } from "./ressources.js";

export interface OptionsAscii {
  /** Affiche les gisements par-dessus les biomes. */
  readonly ressources?: boolean;
  /** Rectangle à dessiner (bornes incluses) ; par défaut, tout ce qui est généré. */
  readonly zone?: {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
  };
  /** Ne dessine que les tuiles déjà générées (aucune génération à l'affichage). */
  readonly sansGeneration?: boolean;
}

export function rendreAscii(grille: Grille, options: OptionsAscii = {}): string {
  const zone = options.zone ?? grille.zoneGeneree();
  if (zone === null) return "";
  const lignes: string[] = [];
  for (let y = zone.y0; y <= zone.y1; y++) {
    let ligne = "";
    for (let x = zone.x0; x <= zone.x1; x++) {
      const t = options.sansGeneration ? grille.tuileSiGeneree(x, y) : grille.tuileOuNull(x, y);
      if (t === null) {
        ligne += " ";
      } else if (options.ressources && t.gisement) {
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
