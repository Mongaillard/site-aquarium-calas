/** Compétences (section 5.3) : niveaux 0..10, progression logarithmique par la pratique. */

export const COMPETENCES = [
  "recolte",
  "chasse",
  "peche",
  "construction",
  "artisanat",
  "cuisine",
  "soin",
  "persuasion",
  "combat",
  "agriculture",
] as const;
export type Competence = (typeof COMPETENCES)[number];

export type Experience = Record<Competence, number>;

export function experienceInitiale(): Experience {
  const xp = {} as Experience;
  for (const c of COMPETENCES) xp[c] = 0;
  return xp;
}

/** Niveau 0..10 à partir de l'expérience : 10 → 1, 40 → 2, 90 → 3 … (n² × 10). */
export function niveau(xp: number): number {
  return Math.min(10, Math.floor(Math.sqrt(Math.max(0, xp) / 10)));
}

export function gagnerExperience(xp: Experience, c: Competence, quantite: number): void {
  xp[c] += quantite;
}
