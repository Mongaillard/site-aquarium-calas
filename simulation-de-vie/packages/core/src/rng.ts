/**
 * Générateur de nombres pseudo-aléatoires déterministe (xoshiro128**).
 *
 * Principe P1 : tout hasard du moteur passe par une instance de `Rng` dérivée
 * de la graine du monde. Une même graine produit toujours la même séquence.
 * `fork(label)` dérive un flux indépendant et reproductible, ce qui permet à
 * chaque sous-système (génération, météo, agents…) d'avoir son propre flux sans
 * que l'ordre d'appel d'un sous-système n'influence les autres.
 */

export type Graine = number | string;

export interface EtatRng {
  readonly graine: string;
  readonly s: readonly [number, number, number, number];
}

/** Hash FNV-1a 32 bits d'une chaîne, utilisé pour dériver des graines. */
export function fnv1a32(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** splitmix32 : étale une graine 32 bits en quatre mots d'état bien mélangés. */
function splitmix32(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  private constructor(
    readonly graine: string,
    etat: readonly [number, number, number, number],
  ) {
    this.s0 = etat[0];
    this.s1 = etat[1];
    this.s2 = etat[2];
    this.s3 = etat[3];
  }

  /** Crée un générateur à partir d'une graine numérique ou textuelle. */
  static depuisGraine(graine: Graine): Rng {
    const texte = String(graine);
    const sm = splitmix32(fnv1a32(texte));
    let etat: [number, number, number, number] = [sm(), sm(), sm(), sm()];
    // xoshiro exige un état non entièrement nul.
    if (etat.every((v) => v === 0)) {
      etat = [1, 2, 3, 4];
    }
    return new Rng(texte, etat);
  }

  /** Restaure un générateur depuis un état sérialisé (snapshots). */
  static depuisEtat(etat: EtatRng): Rng {
    return new Rng(etat.graine, etat.s);
  }

  /** Dérive un flux indépendant, reproductible, identifié par un label. */
  fork(label: string): Rng {
    return Rng.depuisGraine(`${this.graine}/${label}`);
  }

  etat(): EtatRng {
    return { graine: this.graine, s: [this.s0, this.s1, this.s2, this.s3] };
  }

  /** Entier non signé 32 bits. */
  suivantU32(): number {
    const resultat = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = this.s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return resultat;
  }

  /** Flottant uniforme dans [0, 1). */
  suivant(): number {
    return this.suivantU32() / 4294967296;
  }

  /** Flottant uniforme dans [min, max). */
  flottant(min: number, max: number): number {
    return min + (max - min) * this.suivant();
  }

  /** Entier uniforme dans [min, max] (bornes incluses). */
  entier(min: number, max: number): number {
    if (max < min) throw new RangeError(`entier(): max (${max}) < min (${min})`);
    return min + Math.floor(this.suivant() * (max - min + 1));
  }

  /** Vrai avec probabilité p. */
  chance(p: number): boolean {
    return this.suivant() < p;
  }

  /** Tirage gaussien (Box-Muller). */
  gaussien(moyenne = 0, ecartType = 1): number {
    let u = 0;
    while (u === 0) u = this.suivant();
    const v = this.suivant();
    return moyenne + ecartType * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Élément uniforme d'un tableau non vide. */
  choisir<T>(tableau: readonly T[]): T {
    if (tableau.length === 0) throw new RangeError("choisir(): tableau vide");
    const element = tableau[this.entier(0, tableau.length - 1)];
    return element as T;
  }

  /** Élément pondéré : `poids[i]` est le poids de `tableau[i]`. */
  choisirPondere<T>(tableau: readonly T[], poids: readonly number[]): T {
    if (tableau.length === 0 || tableau.length !== poids.length) {
      throw new RangeError("choisirPondere(): tableau et poids incohérents");
    }
    let total = 0;
    for (const p of poids) total += p;
    let r = this.suivant() * total;
    for (let i = 0; i < tableau.length; i++) {
      r -= poids[i] ?? 0;
      if (r < 0) return tableau[i] as T;
    }
    return tableau[tableau.length - 1] as T;
  }

  /** Copie mélangée (Fisher-Yates). */
  melanger<T>(tableau: readonly T[]): T[] {
    const copie = [...tableau];
    for (let i = copie.length - 1; i > 0; i--) {
      const j = this.entier(0, i);
      const a = copie[i] as T;
      copie[i] = copie[j] as T;
      copie[j] = a;
    }
    return copie;
  }
}
