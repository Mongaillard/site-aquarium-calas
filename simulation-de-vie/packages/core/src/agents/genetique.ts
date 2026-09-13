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

/** Probabilité de mutation d'un allèle à l'héritage, et écart-type du bruit. */
export const TAUX_MUTATION = 0.05;
export const ECART_MUTATION = 0.1;

/**
 * Héritage (section 8.2) : pour chaque gène, un allèle tiré chez la mère et un
 * chez le père, chacun muté avec probabilité `TAUX_MUTATION`.
 */
export function heriter(mere: Genome, pere: Genome, rng: Rng): Genome {
  const enfant = {} as Genome;
  for (const gene of GENES) {
    const deMere = mere[gene][rng.entier(0, 1)] ?? 0.5;
    const dePere = pere[gene][rng.entier(0, 1)] ?? 0.5;
    enfant[gene] = [muter(deMere, rng), muter(dePere, rng)];
  }
  return enfant;
}

function muter(allele: number, rng: Rng): number {
  return rng.chance(TAUX_MUTATION) ? clamp01(allele + rng.gaussien(0, ECART_MUTATION)) : allele;
}

/** Teint : dominance simple, l'allèle le plus foncé s'exprime. */
export function phenotypeTeint(genome: Genome): number {
  const [a, b] = genome.teint;
  return Math.max(a, b);
}

/** Espérance de vie génétique en années : 55 à 85 selon le gène de longévité. */
export function esperanceDeVie(genome: Genome): number {
  return 55 + phenotype(genome, "longevite") * 30;
}

/**
 * Probabilité journalière de mort naturelle : nulle avant 55 ans, puis
 * croissante, et forte au-delà de l'espérance de vie génétique.
 */
export function probabiliteMortNaturelle(
  ageAnnees: number,
  genome: Genome,
  ageAncien: number,
): number {
  if (ageAnnees < ageAncien) return 0;
  const esperance = esperanceDeVie(genome);
  const base = 0.0002 * (1 + (ageAnnees - ageAncien));
  const audela = ageAnnees >= esperance ? 0.01 * (1 + (ageAnnees - esperance)) : 0;
  return Math.min(0.5, base + audela);
}
