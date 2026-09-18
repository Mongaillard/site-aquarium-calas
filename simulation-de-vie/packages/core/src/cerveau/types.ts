/** Interface des cerveaux (section 10.1). */
import type { Intention } from "../actions/types.js";
import type { Perception, PerceptionLegere } from "./perception.js";

export interface Cerveau {
  /** Choix d'une intention quand le personnage n'a rien à faire. Synchrone, sans réseau. */
  decider(perception: Perception): Intention;
  /**
   * Réflexe d'urgence évalué à chaque tick : renvoie une intention qui doit
   * interrompre le plan courant, ou `null`.
   */
  urgence(perception: PerceptionLegere): Intention | null;
}
