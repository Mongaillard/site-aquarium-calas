/** Inventaire d'un personnage : ressources en vrac (les objets arrivent en M2). */
import type { Ressource } from "../monde/ressources.js";

export interface Inventaire {
  ressources: Partial<Record<Ressource, number>>;
  readonly capacite: number;
}

export function creerInventaire(capacite: number): Inventaire {
  return { ressources: {}, capacite };
}

export function quantite(inv: Inventaire, r: Ressource): number {
  return inv.ressources[r] ?? 0;
}

export function total(inv: Inventaire): number {
  let t = 0;
  for (const v of Object.values(inv.ressources)) t += v;
  return t;
}

export function placeLibre(inv: Inventaire): number {
  return Math.max(0, inv.capacite - total(inv));
}

/** Ajoute jusqu'à `n` unités ; renvoie la quantité effectivement ajoutée. */
export function ajouter(inv: Inventaire, r: Ressource, n: number): number {
  const ajout = Math.min(Math.floor(n), placeLibre(inv));
  if (ajout <= 0) return 0;
  inv.ressources[r] = quantite(inv, r) + ajout;
  return ajout;
}

/** Retire jusqu'à `n` unités ; renvoie la quantité effectivement retirée. */
export function retirer(inv: Inventaire, r: Ressource, n: number): number {
  const retrait = Math.min(Math.floor(n), quantite(inv, r));
  if (retrait <= 0) return 0;
  const reste = quantite(inv, r) - retrait;
  if (reste === 0) {
    // Clé calculée mais bornée à l'énumération `Ressource` : suppression volontaire.
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete inv.ressources[r];
  } else {
    inv.ressources[r] = reste;
  }
  return retrait;
}

/** Ressources comestibles et valeur nutritive (faim rendue par unité). */
export const NOURRITURE: Partial<Record<Ressource, number>> = {
  baies: 15,
  poisson: 35,
  gibier: 45,
};

export function nourritureDisponible(inv: Inventaire): Ressource | null {
  // Priorité à la nourriture la plus nourrissante.
  const candidats = (Object.keys(NOURRITURE) as Ressource[])
    .filter((r) => quantite(inv, r) > 0)
    .sort((a, b) => (NOURRITURE[b] ?? 0) - (NOURRITURE[a] ?? 0));
  return candidats[0] ?? null;
}
