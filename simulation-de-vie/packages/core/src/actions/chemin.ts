/** Recherche de chemin A* sur la grille, 8 directions, coût par biome. */
import { INFO_BIOME } from "../monde/biomes.js";
import type { Grille, Position } from "../monde/grille.js";

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

interface Noeud {
  readonly index: number;
  readonly f: number;
}

/**
 * File de priorité binaire minimale sur `f`. À f égal, l'ordre d'insertion
 * départage (déterminisme).
 */
class FilePriorite {
  private readonly tas: (Noeud & { readonly ordre: number })[] = [];
  private compteur = 0;

  get taille(): number {
    return this.tas.length;
  }

  push(n: Noeud): void {
    this.tas.push({ ...n, ordre: this.compteur++ });
    let i = this.tas.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.avant(i, parent)) {
        this.echanger(i, parent);
        i = parent;
      } else break;
    }
  }

  pop(): Noeud | undefined {
    const premier = this.tas[0];
    const dernier = this.tas.pop();
    if (premier === undefined || dernier === undefined) return undefined;
    if (this.tas.length > 0) {
      this.tas[0] = dernier;
      let i = 0;
      for (;;) {
        const g = 2 * i + 1;
        const d = g + 1;
        let min = i;
        if (g < this.tas.length && this.avant(g, min)) min = g;
        if (d < this.tas.length && this.avant(d, min)) min = d;
        if (min === i) break;
        this.echanger(i, min);
        i = min;
      }
    }
    return premier;
  }

  private avant(a: number, b: number): boolean {
    const na = this.tas[a];
    const nb = this.tas[b];
    if (na === undefined || nb === undefined) return false;
    return na.f < nb.f || (na.f === nb.f && na.ordre < nb.ordre);
  }

  private echanger(a: number, b: number): void {
    const t = this.tas[a];
    const u = this.tas[b];
    if (t === undefined || u === undefined) return;
    this.tas[a] = u;
    this.tas[b] = t;
  }
}

export interface OptionsChemin {
  /** Nombre maximal de nœuds développés avant abandon. */
  readonly maxNoeuds?: number;
}

/**
 * Chemin de `depart` (exclu) à `arrivee` (incluse), ou `null` si inaccessible.
 * Le coût d'entrée sur une tuile est son `coutDeplacement`, ×√2 en diagonale.
 */
export function trouverChemin(
  grille: Grille,
  depart: Position,
  arrivee: Position,
  options: OptionsChemin = {},
): Position[] | null {
  if (!grille.estPraticable(arrivee.x, arrivee.y)) return null;
  if (depart.x === arrivee.x && depart.y === arrivee.y) return [];
  const maxNoeuds = options.maxNoeuds ?? 20_000;
  const idx = cle;
  const heuristique = (x: number, y: number): number =>
    Math.max(Math.abs(x - arrivee.x), Math.abs(y - arrivee.y));

  const g = new Map<number, number>();
  const parent = new Map<number, number>();
  const ferme = new Set<number>();
  const file = new FilePriorite();
  const iDepart = idx(depart.x, depart.y);
  const iArrivee = idx(arrivee.x, arrivee.y);
  g.set(iDepart, 0);
  file.push({ index: iDepart, f: heuristique(depart.x, depart.y) });

  let developpes = 0;
  while (file.taille > 0) {
    const courant = file.pop();
    if (courant === undefined) break;
    if (ferme.has(courant.index)) continue;
    if (courant.index === iArrivee) return reconstruire(parent, iDepart, iArrivee);
    ferme.add(courant.index);
    if (++developpes > maxNoeuds) return null;

    const { x: cx, y: cy } = decle(courant.index);
    const gCourant = g.get(courant.index) ?? Infinity;
    for (const [dx, dy] of DIRECTIONS) {
      const nx = cx + dx;
      const ny = cy + dy;
      const tuile = grille.tuileOuNull(nx, ny);
      if (tuile === null) continue;
      const info = INFO_BIOME[tuile.biome];
      if (!info.praticable) continue;
      const iVoisin = idx(nx, ny);
      if (ferme.has(iVoisin)) continue;
      const cout = info.coutDeplacement * (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
      const gVoisin = gCourant + cout;
      if (gVoisin < (g.get(iVoisin) ?? Infinity)) {
        g.set(iVoisin, gVoisin);
        parent.set(iVoisin, courant.index);
        file.push({ index: iVoisin, f: gVoisin + heuristique(nx, ny) });
      }
    }
  }
  return null;
}

/** Clé numérique d'une position (coordonnées négatives comprises). */
const DECALAGE = 1 << 20;
const PAS = 1 << 21;
function cle(x: number, y: number): number {
  return (x + DECALAGE) * PAS + (y + DECALAGE);
}
function decle(k: number): Position {
  const y = (k % PAS) - DECALAGE;
  return { x: (k - (y + DECALAGE)) / PAS - DECALAGE, y };
}

function reconstruire(parent: Map<number, number>, depart: number, arrivee: number): Position[] {
  const chemin: Position[] = [];
  let i = arrivee;
  while (i !== depart) {
    chemin.push(decle(i));
    const p = parent.get(i);
    if (p === undefined) return [];
    i = p;
  }
  chemin.reverse();
  return chemin;
}

/** Coût total d'un chemin (somme des coûts d'entrée). */
export function coutChemin(grille: Grille, depart: Position, chemin: readonly Position[]): number {
  let cout = 0;
  let prec = depart;
  for (const p of chemin) {
    const diag = p.x !== prec.x && p.y !== prec.y;
    cout += INFO_BIOME[grille.tuile(p.x, p.y).biome].coutDeplacement * (diag ? Math.SQRT2 : 1);
    prec = p;
  }
  return cout;
}
