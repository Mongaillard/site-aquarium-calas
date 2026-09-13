/** Inventaire d'un personnage ou d'un stock : ressources en vrac et objets. */
import type { Outil } from "../monde/ressources.js";
import type { Objet, TypeObjet } from "../monde/recettes.js";
import type { Ressource } from "../monde/ressources.js";

export interface Inventaire {
  ressources: Partial<Record<Ressource, number>>;
  objets: Objet[];
  capacite: number;
  /** Âge moyen (en jours) de chaque pile de nourriture ; absent = fraîche. */
  age?: Partial<Record<Ressource, number>>;
}

/** Durée de conservation (jours) de chaque nourriture, à l'air libre. */
export const VIE_NOURRITURE: Partial<Record<Ressource, number>> = {
  baies: 6,
  poisson: 15,
  gibier: 5,
  repas_cuit: 12,
  poisson_fume: 90,
  graines: 300,
  lait: 2,
};

export function ageDe(inv: Inventaire, r: Ressource): number {
  return inv.age?.[r] ?? 0;
}

function fixerAge(inv: Inventaire, r: Ressource, age: number): void {
  if (VIE_NOURRITURE[r] === undefined) return;
  inv.age ??= {};
  if (age <= 0) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete inv.age[r];
  } else {
    inv.age[r] = age;
  }
}

/** Ajoute des unités d'un âge donné : la pile prend l'âge moyen pondéré. */
export function ajouterAge(inv: Inventaire, r: Ressource, n: number, age: number): number {
  const avant = quantite(inv, r);
  const ageAvant = ageDe(inv, r);
  const ajout = Math.min(Math.floor(n), placeLibre(inv));
  if (ajout <= 0) return 0;
  inv.ressources[r] = avant + ajout;
  fixerAge(inv, r, (avant * ageAvant + ajout * age) / (avant + ajout));
  return ajout;
}

/**
 * Un jour passe : les nourritures vieillissent. Une pile a un âge moyen ; tant
 * qu'il reste sous la moitié de la durée de conservation (multipliée par
 * `conservation`), tout est frais ; au-delà, la part la plus vieille se gâte :
 * un `vie`-ième de la pile par jour (ce qu'on a rentré il y a `vie` jours), et
 * la pile rajeunit d'autant. Une réserve régulièrement renouvelée se maintient
 * donc à ce qu'on a récolté ces derniers `vie` jours.
 */
export function pourrir(
  inv: Inventaire,
  conservation: number,
): { ressource: Ressource; quantite: number }[] {
  const pertes: { ressource: Ressource; quantite: number }[] = [];
  for (const [r, vie] of Object.entries(VIE_NOURRITURE) as [Ressource, number][]) {
    const n = quantite(inv, r);
    if (n <= 0) {
      fixerAge(inv, r, 0);
      continue;
    }
    const vieEffective = vie * conservation;
    const age = ageDe(inv, r) + 1;
    if (age <= vieEffective / 2) {
      fixerAge(inv, r, age);
      continue;
    }
    const perte = Math.min(n, Math.max(1, Math.ceil(n / vieEffective)));
    retirer(inv, r, perte);
    const reste = n - perte;
    // Ce qui part était le plus vieux : la pile qui reste est plus jeune.
    fixerAge(inv, r, reste > 0 ? Math.max(0, (n * age - perte * vieEffective) / reste) : 0);
    pertes.push({ ressource: r, quantite: perte });
  }
  return pertes;
}

/** La nourriture de ce type est-elle gâtée (au-delà de sa durée de conservation) ? */
export function estGate(inv: Inventaire, r: Ressource): boolean {
  const vie = VIE_NOURRITURE[r];
  return vie !== undefined && ageDe(inv, r) > vie;
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

/** Ajoute jusqu'à `n` unités fraîches ; renvoie la quantité effectivement ajoutée. */
export function ajouter(inv: Inventaire, r: Ressource, n: number): number {
  return ajouterAge(inv, r, n, 0);
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
    fixerAge(inv, r, 0);
  } else {
    inv.ressources[r] = reste;
  }
  return retrait;
}

/** Transfère jusqu'à `n` unités de `de` vers `vers` ; renvoie la quantité transférée. */
export function transferer(de: Inventaire, vers: Inventaire, r: Ressource, n: number): number {
  const possible = Math.min(Math.floor(n), quantite(de, r), placeLibre(vers));
  if (possible <= 0) return 0;
  const age = ageDe(de, r);
  retirer(de, r, possible);
  ajouterAge(vers, r, possible, age);
  return possible;
}

/** Un outil requis peut être remplacé par une invention : le filet pêche, le piège chasse. */
export function outilSatisfait(inv: Inventaire, outil: Outil | null): boolean {
  if (outil === null) return true;
  if (possede(inv, outil)) return true;
  if (outil === "canne_a_peche") return possede(inv, "filet");
  if (outil === "lance") return possede(inv, "piege") || possede(inv, "arc");
  if (outil === "hache_pierre") return possede(inv, "hache_cuivre");
  if (outil === "pioche") return possede(inv, "pioche_cuivre");
  return false;
}

/** Retire un objet du type donné (le plus usé d'abord) ; vrai s'il y en avait un. */
export function retirerObjet(inv: Inventaire, type: TypeObjet): boolean {
  let indice = -1;
  for (let i = 0; i < inv.objets.length; i++) {
    const o = inv.objets[i];
    if (o?.type === type && (indice < 0 || o.solidite < (inv.objets[indice]?.solidite ?? Infinity)))
      indice = i;
  }
  if (indice < 0) return false;
  inv.objets.splice(indice, 1);
  return true;
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
  poisson_fume: 50,
  lait: 20,
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
