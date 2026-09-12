/**
 * Boucle principale (section 3). En M0 elle ne fait qu'avancer l'horloge sur
 * un monde généré ; les étapes suivantes (corps, cerveaux, actions, événements)
 * s'y grefferont phase par phase.
 */
import type { SimConfig, SimConfigPartielle } from "./config.js";
import { fusionnerConfig, validerConfig } from "./config.js";
import { genererGrille } from "./monde/generation.js";
import type { Grille } from "./monde/grille.js";
import { Horloge } from "./monde/horloge.js";
import { Rng } from "./rng.js";

export class Simulation {
  private constructor(
    readonly config: SimConfig,
    readonly rng: Rng,
    readonly horloge: Horloge,
    readonly grille: Grille,
  ) {}

  /** Crée une simulation neuve à partir d'une configuration (partielle ou non). */
  static creer(partielle: SimConfigPartielle = {}): Simulation {
    const config = fusionnerConfig(partielle);
    validerConfig(config);
    const rng = Rng.depuisGraine(config.seed);
    const horloge = new Horloge({
      minutesParTick: config.temps.minutesParTick,
      joursParSaison: config.monde.joursParSaison,
    });
    const grille = genererGrille(rng.fork("monde"), {
      largeur: config.monde.largeur,
      hauteur: config.monde.hauteur,
    });
    return new Simulation(config, rng, horloge, grille);
  }

  get tick(): number {
    return this.horloge.tick;
  }

  /** Avance la simulation d'un tick. */
  tick1(): void {
    this.horloge.avancer(1);
  }

  /** Avance de `n` ticks. */
  avancer(n: number): void {
    for (let i = 0; i < n; i++) this.tick1();
  }

  /** Avance jusqu'à la prochaine aube. */
  avancerJusquaAube(): void {
    this.avancer(this.horloge.prochaineAube() - this.horloge.tick);
  }
}
