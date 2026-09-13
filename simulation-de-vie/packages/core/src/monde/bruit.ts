/**
 * Bruit simplex 2D (algorithme de Stefan Gustavson) avec table de permutation
 * seedée, plus une somme d'octaves (fBm). Valeurs dans [-1, 1].
 */
import type { Rng } from "../rng.js";

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const GRADIENTS: readonly (readonly [number, number])[] = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export class BruitSimplex2D {
  private readonly perm: Uint8Array;

  constructor(rng: Rng) {
    const base = Array.from({ length: 256 }, (_, i) => i);
    const melange = rng.melanger(base);
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = melange[i & 255] ?? 0;
  }

  private grad(hash: number, x: number, y: number): number {
    const g = GRADIENTS[hash & 7] ?? GRADIENTS[0];
    return (g?.[0] ?? 0) * x + (g?.[1] ?? 0) * y;
  }

  /** Bruit brut en (x, y), dans [-1, 1]. */
  valeur(x: number, y: number): number {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;

    const contribution = (dx: number, dy: number, hash: number): number => {
      let t0 = 0.5 - dx * dx - dy * dy;
      if (t0 < 0) return 0;
      t0 *= t0;
      return t0 * t0 * this.grad(hash, dx, dy);
    };

    const p = this.perm;
    const h0 = p[ii + (p[jj] ?? 0)] ?? 0;
    const h1 = p[ii + i1 + (p[jj + j1] ?? 0)] ?? 0;
    const h2 = p[ii + 1 + (p[jj + 1] ?? 0)] ?? 0;
    const n = contribution(x0, y0, h0) + contribution(x1, y1, h1) + contribution(x2, y2, h2);
    return 70 * n;
  }

  /**
   * Somme d'octaves (fractional Brownian motion), normalisée dans [-1, 1].
   * @param frequence fréquence de base (inverse de l'échelle)
   * @param octaves nombre de couches
   * @param persistance facteur d'amplitude entre octaves (0.5 typique)
   * @param lacunarite facteur de fréquence entre octaves (2 typique)
   */
  fbm(
    x: number,
    y: number,
    frequence: number,
    octaves = 4,
    persistance = 0.5,
    lacunarite = 2,
  ): number {
    let amplitude = 1;
    let freq = frequence;
    let total = 0;
    let max = 0;
    for (let o = 0; o < octaves; o++) {
      total += this.valeur(x * freq, y * freq) * amplitude;
      max += amplitude;
      amplitude *= persistance;
      freq *= lacunarite;
    }
    return total / max;
  }
}
