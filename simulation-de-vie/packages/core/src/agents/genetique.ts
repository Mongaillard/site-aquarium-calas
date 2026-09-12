/** Génome et phénotype (section 8.2). L'héritage et la mutation arrivent en M4. */
import type { Rng } from "../rng.js";

export const GENES = [
  "taille",
  "force",
  "endurance",
  "immunite",
  "longevite",
  "fertilite",
  "ouverture",
  "conscience",
  "extraversion",
  "agreabilite",
  "nevrosisme",
  "teint",
] as const;
export type Gene = (typeof GENES)[number];

/** Chaque gène est une paire d'allèles [mère, père] dans [0, 1]. */
export type Genome = Record<Gene, [number, number]>;

export function genomeAleatoire(rng: Rng): Genome {
  const genome = {} as Genome;
  for (const gene of GENES) {
    genome[gene] = [clamp01(rng.gaussien(0.5, 0.2)), clamp01(rng.gaussien(0.5, 0.2))];
  }
  return genome;
}

/** Phénotype : moyenne des deux allèles. */
export function phenotype(genome: Genome, gene: Gene): number {
  const [a, b] = genome[gene];
  return (a + b) / 2;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
