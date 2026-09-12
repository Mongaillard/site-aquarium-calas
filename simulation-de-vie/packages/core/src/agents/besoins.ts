/** Besoins et état physique (section 5.2). Toutes les valeurs sont sur 0..100. */
import type { Rng } from "../rng.js";

export const BESOINS = [
  "faim",
  "soif",
  "sommeil",
  "chaleur",
  "securite",
  "social",
  "moral",
] as const;
export type Besoin = (typeof BESOINS)[number];
export type Besoins = Record<Besoin, number>;

export function besoinsInitiaux(rng: Rng): Besoins {
  return {
    faim: rng.flottant(70, 100),
    soif: rng.flottant(70, 100),
    sommeil: rng.flottant(70, 100),
    chaleur: 100,
    securite: rng.flottant(50, 80),
    social: rng.flottant(50, 90),
    moral: 70,
  };
}

export interface ContexteBesoins {
  readonly ticksParJour: number;
  readonly estNuit: boolean;
  readonly dort: boolean;
  /** Dans un abri ou une maison (sécurité, sommeil). */
  readonly aAbri: boolean;
  readonly enCompagnie: boolean;
  readonly extraversion: number;
  /**
   * Perte de chaleur en unités (1 unité = 100 points en 1,25 jour) : saison ×
   * météo, 0 si le personnage est protégé.
   */
  readonly perteChaleur: number;
  /** Gain de chaleur en unités : abri, maison, feu proche. */
  readonly gainChaleur: number;
  /** Multiplicateur de la soif (canicule). */
  readonly facteurSoif: number;
}

export const CONTEXTE_BESOINS_DEFAUT: ContexteBesoins = {
  ticksParJour: 144,
  estNuit: false,
  dort: false,
  aAbri: false,
  enCompagnie: false,
  extraversion: 0.5,
  perteChaleur: 0,
  gainChaleur: 0,
  facteurSoif: 1,
};

export interface EffetBesoins {
  /** Variation de santé à appliquer ce tick (négatif = dégât). */
  readonly deltaSante: number;
  /** Causes de dégâts actives, par gravité décroissante. */
  readonly causes: readonly ("soif" | "froid" | "faim")[];
}

/** Applique un tick de décroissance / récupération et renvoie l'effet sur la santé. */
export function appliquerTickBesoins(b: Besoins, ctx: ContexteBesoins): EffetBesoins {
  const T = ctx.ticksParJour;
  const ralenti = ctx.dort ? 0.6 : 1;

  b.faim = clamp(b.faim - (100 / (2 * T)) * ralenti);
  b.soif = clamp(b.soif - (100 / T) * ralenti * ctx.facteurSoif);
  const recuperation = ctx.aAbri ? 1.3 : 1;
  b.sommeil = clamp(
    ctx.dort ? b.sommeil + (100 / (T / 3)) * recuperation : b.sommeil - 100 / (1.5 * T),
  );

  // Chaleur : bilan gains − pertes ; sans perte ni gain, retour lent vers 100.
  const unite = 100 / (1.25 * T);
  const bilan = ctx.gainChaleur - ctx.perteChaleur;
  if (bilan !== 0) {
    b.chaleur = clamp(b.chaleur + bilan * unite);
  } else {
    b.chaleur = clamp(b.chaleur + unite * 0.5);
  }

  if (ctx.estNuit && !ctx.aAbri && !ctx.enCompagnie) {
    b.securite = clamp(b.securite - 100 / (2 * T));
  } else {
    b.securite = clamp(b.securite + (ctx.aAbri ? 2 : 1) * (100 / (T / 2)));
  }

  if (ctx.enCompagnie) {
    // La simple présence rassure lentement ; c'est le dialogue qui nourrit vraiment le lien.
    b.social = clamp(b.social + 100 / (2 * T));
  } else {
    b.social = clamp(b.social - (100 / (3 * T)) * (0.5 + ctx.extraversion));
  }

  const cibleMoral =
    0.25 * b.faim +
    0.15 * b.soif +
    0.2 * b.sommeil +
    0.1 * b.chaleur +
    0.15 * b.securite +
    0.15 * b.social;
  b.moral = clamp(b.moral + (cibleMoral - b.moral) * 0.05);

  // Causes classées par gravité : la première sert de cause de décès.
  const causes: ("soif" | "froid" | "faim")[] = [];
  let deltaSante = 0;
  if (b.soif <= 0) {
    deltaSante -= 25 / T;
    causes.push("soif");
  }
  if (b.chaleur <= 0) {
    deltaSante -= 15 / T;
    causes.push("froid");
  }
  if (b.faim <= 0) {
    deltaSante -= 10 / T;
    causes.push("faim");
  }
  if (causes.length === 0 && b.faim > 50 && b.soif > 50 && b.sommeil > 50 && b.chaleur > 50) {
    deltaSante += 2 / T;
  }
  return { deltaSante, causes };
}

/** Urgence d'un besoin : 0 (satisfait) → 1 (critique), courbe convexe. */
export function urgence(valeur: number): number {
  const manque = clamp(100 - valeur) / 100;
  return manque * manque;
}

export function clamp(v: number): number {
  return v < 0 ? 0 : v > 100 ? 100 : v;
}
