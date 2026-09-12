/** Inventaire d'un personnage ou d'un stock : ressources en vrac et objets. */
import type { Outil } from "../monde/ressources.js";
import type { Objet, TypeObjet } from "../monde/recettes.js";
import type { Ressource } from "../monde/ressources.js";

export interface Inventaire {
  ressources: Partial<Record<Ressource, number>>;
  objets: Objet[];
  readonly capacite: number;
}

export function creerInventaire(capacite: number): Inventaire {
  return { ressources: {}, objets: [], capacite };
}

export function quantite(inv: Inventaire, r: Ressource): number {
  return inv.ressources[r] ?? 0;
}

/** Unités de ressources + un emplacement par objet. */
export function total(inv: Inventaire): number {
  let t = inv.objets.length;
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

/** Transfère jusqu'à `n` unités de `de` vers `vers` ; renvoie la quantité transférée. */
export function transferer(de: Inventaire, vers: Inventaire, r: Ressource, n: number): number {
  const possible = Math.min(Math.floor(n), quantite(de, r), placeLibre(vers));
  if (possible <= 0) return 0;
  retirer(de, r, possible);
  ajouter(vers, r, possible);
  return possible;
}

/** Un outil requis peut être remplacé par une invention : le filet pêche, le piège chasse. */
export function outilSatisfait(inv: Inventaire, outil: Outil | null): boolean {
  if (outil === null) return true;
  if (possede(inv, outil)) return true;
  if (outil === "canne_a_peche") return possede(inv, "filet");
  if (outil === "lance") return possede(inv, "piege");
  return false;
}

export function ajouterObjet(inv: Inventaire, objet: Objet): boolean {
  if (placeLibre(inv) <= 0) return false;
  inv.objets.push(objet);
  return true;
}

export function objet(inv: Inventaire, type: TypeObjet): Objet | null {
  return inv.objets.find((o) => o.type === type) ?? null;
}

export function possede(inv: Inventaire, type: TypeObjet): boolean {
  return objet(inv, type) !== null;
}

/**
 * Use un objet d'une unité ; renvoie `true` s'il s'est cassé (et a été retiré).
 */
export function userObjet(inv: Inventaire, type: TypeObjet): boolean {
  const o = objet(inv, type);
  if (o === null) return false;
  o.solidite -= 1;
  if (o.solidite <= 0) {
    inv.objets.splice(inv.objets.indexOf(o), 1);
    return true;
  }
  return false;
}

/** Ressources comestibles et valeur nutritive (faim rendue par unité). */
export const NOURRITURE: Partial<Record<Ressource, number>> = {
  baies: 15,
  repas_cuit: 25,
  poisson: 35,
  gibier: 45,
};

/** Nourriture crue transformable en repas cuit. */
export const NOURRITURE_CRUE: readonly Ressource[] = ["baies", "poisson", "gibier"];

export function nourritureDisponible(inv: Inventaire): Ressource | null {
  // Priorité à la nourriture la plus nourrissante.
  const candidats = (Object.keys(NOURRITURE) as Ressource[])
    .filter((r) => quantite(inv, r) > 0)
    .sort((a, b) => (NOURRITURE[b] ?? 0) - (NOURRITURE[a] ?? 0));
  return candidats[0] ?? null;
}

export function quantiteNourriture(inv: Inventaire): number {
  let n = 0;
  for (const r of Object.keys(NOURRITURE) as Ressource[]) n += quantite(inv, r);
  return n;
}
