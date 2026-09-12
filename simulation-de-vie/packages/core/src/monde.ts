/**
 * Vue du monde partagée par les sous-systèmes (actions, cerveaux, planificateur)
 * sans dépendre de la classe `Simulation` (évite les imports circulaires).
 */
import type { Personnage } from "./agents/personnage.js";
import type { SimConfig } from "./config.js";
import type { Evenement, TypeEvenement } from "./evenements/journal.js";
import type { Grille, Position } from "./monde/grille.js";
import type { Horloge } from "./monde/horloge.js";
import type { Rng } from "./rng.js";

export interface Monde {
  readonly config: SimConfig;
  readonly grille: Grille;
  readonly horloge: Horloge;
  readonly rng: Rng;
  readonly personnages: readonly Personnage[];
  emettre(
    type: TypeEvenement,
    acteur: Personnage | null,
    details?: Evenement["details"],
    importance?: number,
    position?: Position | null,
  ): void;
}

/** Vrai si la tuile est de l'eau (source de boisson). */
export function estEau(monde: Monde, x: number, y: number): boolean {
  const t = monde.grille.tuileOuNull(x, y);
  return t !== null && (t.biome === "eau_profonde" || t.biome === "eau_peu_profonde");
}

/** Vrai si une tuile d'eau est à distance ≤ 1 de la position. */
export function eauAdjacente(monde: Monde, pos: Position): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (estEau(monde, pos.x + dx, pos.y + dy)) return true;
    }
  }
  return false;
}

export function personnagesVivants(monde: Monde): Personnage[] {
  return monde.personnages.filter((p) => p.vivant);
}
