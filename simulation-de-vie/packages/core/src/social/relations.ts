/** Relations entre personnages (section 5.5). */
import type { Personnalite } from "../agents/identite.js";

export const LIENS = [
  "inconnu",
  "connaissance",
  "ami",
  "partenaire",
  "parent",
  "enfant",
  "fratrie",
  "rival",
  "ennemi",
] as const;
export type Lien = (typeof LIENS)[number];

/** Liens fixés par la parenté ou l'union : ils ne dérivent pas des seuils. */
export const LIENS_FIXES: readonly Lien[] = ["partenaire", "parent", "enfant", "fratrie"];

export interface Relation {
  readonly cible: string;
  lien: Lien;
  affinite: number; // -100..100
  confiance: number; // 0..100
  attirance: number; // 0..100
  derniereInteraction: number; // tick, -Infinity si jamais
  /** > 0 : la cible me doit ; < 0 : je lui dois. */
  dette: number;
  interactions: number;
}

export function relationVierge(cible: string): Relation {
  return {
    cible,
    lien: "inconnu",
    affinite: 0,
    confiance: 20,
    attirance: 0,
    derniereInteraction: -Infinity,
    dette: 0,
    interactions: 0,
  };
}

export function relationFamiliale(cible: string, lien: Lien): Relation {
  return { ...relationVierge(cible), lien, affinite: 40, confiance: 60 };
}

/** Lien dérivé des seuils (sauf liens fixes). */
export function lienDerive(r: Relation): Lien {
  if (LIENS_FIXES.includes(r.lien)) return r.lien;
  if (r.affinite <= -40) return "ennemi";
  if (r.affinite <= -15) return "rival";
  if (r.affinite >= 60 && r.confiance >= 50) return "ami";
  if (r.interactions > 0) return "connaissance";
  return "inconnu";
}

/**
 * Compatibilité de personnalité dans [-1, 1] : agréabilités proches et
 * ouvertures proches rapprochent ; deux névrosismes élevés éloignent.
 */
export function compatibilite(a: Personnalite, b: Personnalite): number {
  const proximite =
    1 - (Math.abs(a.agreabilite - b.agreabilite) + Math.abs(a.ouverture - b.ouverture)) / 2;
  const tension = a.nevrosisme * b.nevrosisme;
  return Math.max(-1, Math.min(1, proximite * 2 - 1 - tension * 0.5));
}

export interface Ajustement {
  readonly affinite?: number;
  readonly confiance?: number;
  readonly attirance?: number;
  readonly dette?: number;
}

/**
 * Applique un ajustement, amplifié par le névrosisme du sujet (±) et coloré
 * par la compatibilité (les gestes positifs comptent plus entre personnes
 * compatibles, les négatifs plus entre incompatibles).
 */
export function ajusterRelation(
  r: Relation,
  sujet: Personnalite,
  autre: Personnalite,
  ajustement: Ajustement,
  tick: number,
): void {
  const amplification = 0.8 + sujet.nevrosisme * 0.6;
  const compat = compatibilite(sujet, autre);
  const moduler = (delta: number): number => {
    const facteur = delta >= 0 ? 1 + compat * 0.3 : 1 - compat * 0.3;
    return delta * amplification * facteur;
  };
  if (ajustement.affinite !== undefined)
    r.affinite = borner(r.affinite + moduler(ajustement.affinite), -100, 100);
  if (ajustement.confiance !== undefined)
    r.confiance = borner(r.confiance + moduler(ajustement.confiance), 0, 100);
  if (ajustement.attirance !== undefined)
    r.attirance = borner(r.attirance + ajustement.attirance, 0, 100);
  if (ajustement.dette !== undefined) r.dette += ajustement.dette;
  r.derniereInteraction = tick;
  r.interactions += 1;
  r.lien = lienDerive(r);
}

export function borner(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Vrai si le lien autorise le tutoiement (section 10.4). */
export function tutoie(r: Relation): boolean {
  return r.lien !== "inconnu" &&
    r.lien !== "connaissance" &&
    r.lien !== "rival" &&
    r.lien !== "ennemi"
    ? true
    : r.lien === "connaissance" && r.affinite >= 30;
}
