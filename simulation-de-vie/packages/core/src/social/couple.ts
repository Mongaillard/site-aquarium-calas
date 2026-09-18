/** Couples, cour et union (section 8.1). */
import { relationAvec } from "../agents/personnage.js";
import type { Personnage } from "../agents/personnage.js";
import type { Monde } from "../monde.js";
import { compatibilite } from "./relations.js";

/** Attirance mutuelle et affinité requises pour courtiser, nombre de cours réussies pour s'unir. */
export const SEUILS_COUPLE = {
  attirance: 50,
  affinite: 30,
  coursPourUnion: 3,
} as const;

/** Partenaire vivant de `p`, s'il en a un. */
export function partenaireDe(monde: Monde, p: Personnage): Personnage | null {
  for (const r of p.relations.values()) {
    if (r.lien !== "partenaire") continue;
    const autre = monde.personnages.find((a) => a.id === r.cible);
    if (autre?.vivant) return autre;
  }
  return null;
}

/** Vrai si `p` a le trait qui autorise les écarts à la monogamie. */
export function estVolage(p: Personnage): boolean {
  return p.identite.traits.includes("volage");
}

/**
 * Deux personnes peuvent-elles se courtiser ? Adultes de sexes opposés, sans
 * lien de parenté, libres (ou volages), d'âges pas trop éloignés.
 */
export function eligibles(monde: Monde, a: Personnage, b: Personnage): boolean {
  if (a.id === b.id || !a.vivant || !b.vivant) return false;
  if (a.corps.stade !== "adulte" || b.corps.stade !== "adulte") return false;
  if (a.identite.sexe === b.identite.sexe) return false;
  const lien = relationAvec(a, b.id).lien;
  if (lien === "parent" || lien === "enfant" || lien === "fratrie") return false;
  if (
    a.identite.nomFamille === b.identite.nomFamille &&
    a.identite.parents === null &&
    b.identite.parents === null
  ) {
    return false; // fratrie de la population initiale
  }
  if (monde.config.social.monogamie) {
    if (partenaireDe(monde, a) !== null && !estVolage(a)) return false;
    if (partenaireDe(monde, b) !== null && !estVolage(b)) return false;
  }
  const ecartAns = Math.abs(a.corps.ageJours - b.corps.ageJours) / monde.config.vie.joursParAnnee;
  return ecartAns <= 15;
}

/** Croissance de l'attirance après une conversation cordiale entre personnes éligibles. */
export function gainAttirance(a: Personnage, b: Personnage): number {
  const compat = compatibilite(a.identite.personnalite, b.identite.personnalite);
  return Math.max(2, 12 + compat * 8 + a.identite.personnalite.ouverture * 3);
}

/** `a` souhaite-t-il courtiser `b` ? (attirance et affinité de `a`, éligibilité) */
export function veutCourtiser(monde: Monde, a: Personnage, b: Personnage): boolean {
  if (!eligibles(monde, a, b)) return false;
  const r = relationAvec(a, b.id);
  return r.attirance > SEUILS_COUPLE.attirance && r.affinite > SEUILS_COUPLE.affinite;
}

/** Réponse de `b` à la cour de `a` : selon son attirance, son affinité et sa compatibilité. */
export function accepteCour(a: Personnage, b: Personnage): boolean {
  const r = relationAvec(b, a.id);
  const compat = compatibilite(a.identite.personnalite, b.identite.personnalite);
  const p =
    0.2 +
    r.attirance / 150 +
    r.affinite / 250 +
    compat * 0.15 +
    b.identite.personnalite.extraversion * 0.1;
  return b.rng.chance(Math.max(0.05, Math.min(0.95, p)));
}

/** Scelle l'union : lien partenaire dans les deux sens, affinité et confiance renforcées. */
export function unir(a: Personnage, b: Personnage, tick: number): void {
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    const r = relationAvec(x, y.id);
    r.lien = "partenaire";
    r.affinite = Math.max(r.affinite, 70);
    r.confiance = Math.max(r.confiance, 70);
    r.attirance = Math.max(r.attirance, 70);
    r.derniereInteraction = tick;
  }
}

/** Rompt une union (décès, séparation) : le lien redevient une connaissance proche. */
export function rompre(a: Personnage, b: Personnage): void {
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    const r = x.relations.get(y.id);
    if (r?.lien === "partenaire") r.lien = "connaissance";
  }
}
