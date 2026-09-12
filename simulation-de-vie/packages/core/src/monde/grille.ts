/** Grille de tuiles (section 4.1). */
import type { Biome } from "./biomes.js";
import { INFO_BIOME } from "./biomes.js";
import type { Batiment } from "./batiments.js";
import type { Gisement } from "./ressources.js";

export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface Tuile {
  readonly x: number;
  readonly y: number;
  readonly biome: Biome;
  /** Altitude normalisée dans [-1, 1] (négatif = sous le niveau de la mer). */
  readonly altitude: number;
  /** Humidité normalisée dans [-1, 1]. */
  readonly humidite: number;
  gisement: Gisement | null;
  batiment: Batiment | null;
}

const VOISINAGE_8: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

export class Grille {
  private readonly tuiles: Tuile[];

  constructor(
    readonly largeur: number,
    readonly hauteur: number,
    tuiles: Tuile[],
  ) {
    if (tuiles.length !== largeur * hauteur) {
      throw new RangeError("Grille : nombre de tuiles incohérent avec les dimensions");
    }
    this.tuiles = tuiles;
  }

  contient(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.largeur && y < this.hauteur;
  }

  /** Tuile en (x, y) ; lève une erreur hors limites. */
  tuile(x: number, y: number): Tuile {
    const t = this.tuileOuNull(x, y);
    if (t === null) throw new RangeError(`Tuile hors grille : (${x}, ${y})`);
    return t;
  }

  tuileOuNull(x: number, y: number): Tuile | null {
    if (!this.contient(x, y)) return null;
    return this.tuiles[y * this.largeur + x] ?? null;
  }

  /** Voisins (8 directions) existants. */
  voisins(x: number, y: number): Tuile[] {
    const resultat: Tuile[] = [];
    for (const [dx, dy] of VOISINAGE_8) {
      const t = this.tuileOuNull(x + dx, y + dy);
      if (t) resultat.push(t);
    }
    return resultat;
  }

  estPraticable(x: number, y: number): boolean {
    const t = this.tuileOuNull(x, y);
    return t !== null && INFO_BIOME[t.biome].praticable;
  }

  /** Itère toutes les tuiles, ligne par ligne. */
  *toutes(): IterableIterator<Tuile> {
    yield* this.tuiles;
  }

  /** Nombre de tuiles par biome (les biomes absents ne figurent pas). */
  distributionBiomes(): Partial<Record<Biome, number>> {
    const compte: Partial<Record<Biome, number>> = {};
    for (const t of this.tuiles) compte[t.biome] = (compte[t.biome] ?? 0) + 1;
    return compte;
  }

  /** Distance de Tchebychev (déplacement en 8 directions). */
  static distance(a: Position, b: Position): number {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }
}
