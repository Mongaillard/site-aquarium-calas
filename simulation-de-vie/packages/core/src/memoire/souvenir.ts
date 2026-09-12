/**
 * Flux de mémoire d'un personnage (section 5.4) : souvenirs horodatés avec
 * importance, récupération par récence × importance × pertinence, oubli par
 * compression.
 */
import type { Position } from "../monde/grille.js";

export const TYPES_SOUVENIR = ["observation", "action", "dialogue", "reflexion", "plan"] as const;
export type TypeSouvenir = (typeof TYPES_SOUVENIR)[number];

export interface Souvenir {
  readonly id: number;
  readonly tick: number;
  readonly type: TypeSouvenir;
  /** Phrase en langage naturel, à la première personne. */
  readonly texte: string;
  importance: number; // 1..10
  readonly sujets: readonly string[]; // ids d'entités concernées
  readonly position: Position | null;
  dernierAcces: number;
}

export interface ContexteRecuperation {
  readonly tick: number;
  readonly sujets?: readonly string[];
  readonly position?: Position;
  /** Types acceptés (tous si omis). */
  readonly types?: readonly TypeSouvenir[];
}

export interface OptionsFlux {
  readonly ticksParJour: number;
  readonly demiVieRecenceJours: number;
  readonly maxSouvenirs: number;
  /** Poids α (récence), β (importance), γ (pertinence). */
  readonly poids?: {
    readonly recence: number;
    readonly importance: number;
    readonly pertinence: number;
  };
}

export class FluxMemoire {
  private readonly souvenirs: Souvenir[] = [];
  private prochainId = 1;
  private readonly poids: { recence: number; importance: number; pertinence: number };

  constructor(readonly options: OptionsFlux) {
    this.poids = options.poids ?? { recence: 1, importance: 1, pertinence: 1 };
  }

  get taille(): number {
    return this.souvenirs.length;
  }

  tous(): readonly Souvenir[] {
    return this.souvenirs;
  }

  ajouter(
    tick: number,
    type: TypeSouvenir,
    texte: string,
    importance: number,
    sujets: readonly string[] = [],
    position: Position | null = null,
  ): Souvenir {
    const s: Souvenir = {
      id: this.prochainId++,
      tick,
      type,
      texte,
      importance: Math.max(1, Math.min(10, Math.round(importance))),
      sujets: [...sujets],
      position: position ? { ...position } : null,
      dernierAcces: tick,
    };
    this.souvenirs.push(s);
    if (this.souvenirs.length > this.options.maxSouvenirs) this.oublier(tick);
    return s;
  }

  /** Score de récupération d'un souvenir dans un contexte (exposé pour les tests). */
  score(s: Souvenir, ctx: ContexteRecuperation): number {
    const demiVie = this.options.demiVieRecenceJours * this.options.ticksParJour;
    const age = Math.max(0, ctx.tick - s.dernierAcces);
    const recence = Math.pow(0.5, age / demiVie);
    const importance = s.importance / 10;
    let pertinence = 0;
    if (ctx.sujets && ctx.sujets.length > 0 && s.sujets.length > 0) {
      let communs = 0;
      for (const sujet of ctx.sujets) if (s.sujets.includes(sujet)) communs++;
      pertinence = communs / Math.max(ctx.sujets.length, s.sujets.length);
    }
    if (ctx.position && s.position) {
      const d = Math.max(
        Math.abs(ctx.position.x - s.position.x),
        Math.abs(ctx.position.y - s.position.y),
      );
      pertinence = Math.max(pertinence, d <= 8 ? 1 - d / 8 : 0);
    }
    return (
      this.poids.recence * recence +
      this.poids.importance * importance +
      this.poids.pertinence * pertinence
    );
  }

  /** Les `k` souvenirs les plus pertinents ; marque leur accès. */
  recuperer(ctx: ContexteRecuperation, k: number): Souvenir[] {
    const candidats = ctx.types
      ? this.souvenirs.filter((s) => ctx.types?.includes(s.type))
      : this.souvenirs;
    const classes = candidats
      .map((s) => ({ s, score: this.score(s, ctx) }))
      .sort((a, b) => b.score - a.score || b.s.tick - a.s.tick || b.s.id - a.s.id)
      .slice(0, k)
      .map((x) => x.s);
    for (const s of classes) s.dernierAcces = ctx.tick;
    return classes;
  }

  /** Souvenirs d'une fenêtre de ticks (les plus récents en dernier). */
  depuis(tick: number): Souvenir[] {
    return this.souvenirs.filter((s) => s.tick >= tick);
  }

  /**
   * Oubli : les souvenirs d'importance ≤ 2 non consultés depuis 30 jours sont
   * résumés en un seul souvenir puis supprimés. Renvoie le nombre supprimé.
   */
  oublier(tick: number, importanceMax = 2, joursSansAcces = 30): number {
    const limite = tick - joursSansAcces * this.options.ticksParJour;
    const aCompresser = this.souvenirs.filter(
      (s) => s.importance <= importanceMax && s.dernierAcces < limite,
    );
    if (aCompresser.length === 0) return 0;
    const ids = new Set(aCompresser.map((s) => s.id));
    for (let i = this.souvenirs.length - 1; i >= 0; i--) {
      const s = this.souvenirs[i];
      if (s && ids.has(s.id)) this.souvenirs.splice(i, 1);
    }
    const premier = aCompresser[0];
    const dernier = aCompresser[aCompresser.length - 1];
    const jours =
      premier && dernier
        ? Math.round((dernier.tick - premier.tick) / this.options.ticksParJour) + 1
        : 1;
    const resume: Souvenir = {
      id: this.prochainId++,
      tick,
      type: "reflexion",
      texte: `Pendant environ ${jours} jour${jours > 1 ? "s" : ""}, j'ai vécu ${aCompresser.length} petits moments ordinaires dont je ne garde qu'une impression floue.`,
      importance: 2,
      sujets: [],
      position: null,
      dernierAcces: tick,
    };
    this.souvenirs.push(resume);
    return aCompresser.length;
  }
}
