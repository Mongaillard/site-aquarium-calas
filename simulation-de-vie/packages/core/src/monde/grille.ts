/**
 * Grille de tuiles sans limite (section 4.1) : le monde est découpé en
 * morceaux carrés générés à la demande, de façon déterministe, dès qu'un
 * personnage (ou un calcul de chemin) s'en approche. Les coordonnées peuvent
 * être négatives ; l'origine (0, 0) est le berceau de la colonie.
 */
import type { Biome } from "./biomes.js";
import { INFO_BIOME } from "./biomes.js";
import type { Batiment } from "./batiments.js";
import type { Gisement } from "./ressources.js";

export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface Tuile {
  readonly x: number;
  readonly y: number;
  readonly biome: Biome;
  /** Altitude normalisée dans [-1, 1] (négatif = sous le niveau de la mer). */
  readonly altitude: number;
  /** Humidité normalisée dans [-1, 1]. */
  readonly humidite: number;
  gisement: Gisement | null;
  batiment: Batiment | null;
}

/** Côté d'un morceau, en tuiles. */
export const TAILLE_MORCEAU = 32;

/** Un morceau du monde : TAILLE_MORCEAU² tuiles (ou trous, pour les grilles finies). */
export interface Morceau {
  readonly cx: number;
  readonly cy: number;
  /** Tuiles, indexées (y − cy·T) · T + (x − cx·T) ; `null` = hors du monde. */
  readonly tuiles: readonly (Tuile | null)[];
  /** Tuiles dotées d'un gisement à la génération, dans un ordre stable. */
  readonly avecGisement: readonly Tuile[];
  /** 1 = tuile déjà vue par la colonie. */
  readonly decouvertes: Uint8Array;
  nbTuiles: number;
  nbDecouvertes: number;
}

/** Produit les tuiles d'un morceau ; ne doit dépendre que de (cx, cy) et de la graine. */
export type Generateur = (cx: number, cy: number) => (Tuile | null)[];

export function coordMorceau(v: number): number {
  return Math.floor(v / TAILLE_MORCEAU);
}

export function cleMorceau(cx: number, cy: number): number {
  return (cx + 32_768) * 65_536 + (cy + 32_768);
}

const VOISINAGE_8: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

export class Grille {
  private readonly morceaux = new Map<number, Morceau>();
  /** Dernier morceau consulté : la plupart des accès successifs tombent dans le même. */
  private dernier: Morceau | null = null;
  /** Morceaux dans l'ordre de génération. */
  private readonly ordre: Morceau[] = [];
  private nbDecouvertes = 0;
  private nbTuiles = 0;

  /**
   * @param generateur produit un morceau à la demande
   * @param limite garde-fou : au-delà de cette distance à l'origine, il n'y a plus rien
   */
  constructor(
    private readonly generateur: Generateur,
    readonly limite = 100_000,
  ) {}

  /** Grille finie à partir de tuiles rangées ligne par ligne (tests, scénarios) ; rien au-delà. */
  static depuisTuiles(largeur: number, hauteur: number, tuiles: readonly Tuile[]): Grille {
    if (tuiles.length !== largeur * hauteur) {
      throw new RangeError("Grille : nombre de tuiles incohérent avec les dimensions");
    }
    const T = TAILLE_MORCEAU;
    const grille = new Grille((cx, cy) => {
      const resultat: (Tuile | null)[] = [];
      for (let j = 0; j < T; j++) {
        for (let i = 0; i < T; i++) {
          const x = cx * T + i;
          const y = cy * T + j;
          const dedans = x >= 0 && y >= 0 && x < largeur && y < hauteur;
          resultat.push(dedans ? (tuiles[y * largeur + x] ?? null) : null);
        }
      }
      return resultat;
    });
    for (let cy = 0; cy < Math.ceil(hauteur / T); cy++)
      for (let cx = 0; cx < Math.ceil(largeur / T); cx++) grille.morceau(cx, cy);
    return grille;
  }

  /** Le morceau (cx, cy), généré s'il ne l'était pas encore. */
  morceau(cx: number, cy: number): Morceau {
    const dernier = this.dernier;
    if (dernier !== null && dernier.cx === cx && dernier.cy === cy) return dernier;
    const cle = cleMorceau(cx, cy);
    const existant = this.morceaux.get(cle);
    if (existant !== undefined) {
      this.dernier = existant;
      return existant;
    }
    const tuiles = this.generateur(cx, cy);
    const avecGisement: Tuile[] = [];
    let nbTuiles = 0;
    for (const t of tuiles) {
      if (t === null) continue;
      nbTuiles += 1;
      if (t.gisement !== null) avecGisement.push(t);
    }
    const m: Morceau = {
      cx,
      cy,
      tuiles,
      avecGisement,
      decouvertes: new Uint8Array(TAILLE_MORCEAU * TAILLE_MORCEAU),
      nbTuiles,
      nbDecouvertes: 0,
    };
    this.morceaux.set(cle, m);
    this.ordre.push(m);
    this.nbTuiles += nbTuiles;
    this.dernier = m;
    return m;
  }

  /** Le morceau (cx, cy) s'il a déjà été généré, sans le générer. */
  morceauOuNull(cx: number, cy: number): Morceau | null {
    return this.morceaux.get(cleMorceau(cx, cy)) ?? null;
  }

  /** Morceaux déjà générés, dans l'ordre de génération. */
  morceauxGeneres(): readonly Morceau[] {
    return this.ordre;
  }

  get nombreMorceaux(): number {
    return this.ordre.length;
  }

  /** Nombre de tuiles existantes dans les morceaux générés. */
  get nombreTuiles(): number {
    return this.nbTuiles;
  }

  /** Vrai si (x, y) est dans les limites du monde (mais la tuile peut être un trou). */
  contient(x: number, y: number): boolean {
    return Math.abs(x) <= this.limite && Math.abs(y) <= this.limite;
  }

  private static indexLocal(x: number, y: number): number {
    const T = TAILLE_MORCEAU;
    return (y - coordMorceau(y) * T) * T + (x - coordMorceau(x) * T);
  }

  /** Tuile en (x, y) ; lève une erreur s'il n'y a rien. */
  tuile(x: number, y: number): Tuile {
    const t = this.tuileOuNull(x, y);
    if (t === null) throw new RangeError(`Tuile hors du monde : (${String(x)}, ${String(y)})`);
    return t;
  }

  /** Tuile en (x, y), générée au besoin, ou `null` s'il n'y a rien. */
  tuileOuNull(x: number, y: number): Tuile | null {
    if (!this.contient(x, y)) return null;
    const m = this.morceau(coordMorceau(x), coordMorceau(y));
    return m.tuiles[Grille.indexLocal(x, y)] ?? null;
  }

  /** Tuile en (x, y) seulement si son morceau existe déjà (aucune génération). */
  tuileSiGeneree(x: number, y: number): Tuile | null {
    const m = this.morceauOuNull(coordMorceau(x), coordMorceau(y));
    return m?.tuiles[Grille.indexLocal(x, y)] ?? null;
  }

  /** Voisins (8 directions) existants. */
  voisins(x: number, y: number): Tuile[] {
    const resultat: Tuile[] = [];
    for (const [dx, dy] of VOISINAGE_8) {
      const t = this.tuileOuNull(x + dx, y + dy);
      if (t) resultat.push(t);
    }
    return resultat;
  }

  estPraticable(x: number, y: number): boolean {
    const t = this.tuileOuNull(x, y);
    return t !== null && INFO_BIOME[t.biome].praticable;
  }

  /** Marque la tuile comme découverte par la colonie ; vrai si elle ne l'était pas encore. */
  decouvrir(x: number, y: number): boolean {
    if (!this.contient(x, y)) return false;
    const m = this.morceau(coordMorceau(x), coordMorceau(y));
    const i = Grille.indexLocal(x, y);
    if (m.tuiles[i] === null || m.decouvertes[i] === 1) return false;
    m.decouvertes[i] = 1;
    m.nbDecouvertes += 1;
    this.nbDecouvertes += 1;
    return true;
  }

  estDecouverte(x: number, y: number): boolean {
    const m = this.morceauOuNull(coordMorceau(x), coordMorceau(y));
    return m !== null && m.decouvertes[Grille.indexLocal(x, y)] === 1;
  }

  get nombreDecouvertes(): number {
    return this.nbDecouvertes;
  }

  /** Itère les tuiles existantes des morceaux générés, morceau par morceau. */
  *toutes(): IterableIterator<Tuile> {
    for (const m of this.ordre) for (const t of m.tuiles) if (t !== null) yield t;
  }

  /** Tuiles qui portaient un gisement à la génération (pour la repousse). */
  *tuilesAvecGisement(): IterableIterator<Tuile> {
    for (const m of this.ordre) yield* m.avecGisement;
  }

  /** Rectangle englobant (bornes incluses) des tuiles existantes, ou null si rien n'est généré. */
  zoneGeneree(): { x0: number; y0: number; x1: number; y1: number } | null {
    let zone: { x0: number; y0: number; x1: number; y1: number } | null = null;
    for (const t of this.toutes()) {
      if (zone === null) zone = { x0: t.x, y0: t.y, x1: t.x, y1: t.y };
      else {
        if (t.x < zone.x0) zone.x0 = t.x;
        if (t.x > zone.x1) zone.x1 = t.x;
        if (t.y < zone.y0) zone.y0 = t.y;
        if (t.y > zone.y1) zone.y1 = t.y;
      }
    }
    return zone;
  }

  /** Nombre de tuiles générées par biome (les biomes absents ne figurent pas). */
  distributionBiomes(): Partial<Record<Biome, number>> {
    const compte: Partial<Record<Biome, number>> = {};
    for (const t of this.toutes()) compte[t.biome] = (compte[t.biome] ?? 0) + 1;
    return compte;
  }

  /** Distance de Tchebychev (déplacement en 8 directions). */
  static distance(a: Position, b: Position): number {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }
}
