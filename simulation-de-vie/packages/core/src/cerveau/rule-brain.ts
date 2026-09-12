/**
 * Cerveau à règles (section 10.6) : sélection par score d'utilité pondéré par
 * la personnalité, avec un bruit seedé de ±10 %.
 */
import { NOURRITURE } from "../agents/inventaire.js";
import { urgence } from "../agents/besoins.js";
import type { Personnage } from "../agents/personnage.js";
import type { Intention } from "../actions/types.js";
import type { Ressource } from "../monde/ressources.js";
import type { Perception } from "./perception.js";
import type { Cerveau } from "./types.js";

/** En dessous de ces valeurs, boire / manger deviennent des candidats. */
export const SEUILS_ENVIE = {
  soif: 80,
  faim: 70,
} as const;

/** En dessous de ces valeurs, boire / manger interrompent le plan en cours. */
export const SEUILS_URGENCE = {
  soif: 15,
  faim: 12,
} as const;

interface Candidat {
  readonly intention: Intention;
  readonly score: number;
}

export class RuleBrain implements Cerveau {
  constructor(private readonly personnage: Personnage) {}

  urgence(perception: Perception): Intention | null {
    const b = perception.moi.besoins;
    if (b.soif < SEUILS_URGENCE.soif) return { type: "boire" };
    if (b.faim < SEUILS_URGENCE.faim) return { type: "manger" };
    return null;
  }

  decider(perception: Perception): Intention {
    const candidats = this.candidats(perception);
    let meilleur: Candidat | null = null;
    for (const c of candidats) {
      const bruit = 0.9 + 0.2 * this.personnage.rng.suivant();
      const score = c.score * bruit;
      if (meilleur === null || score > meilleur.score) meilleur = { intention: c.intention, score };
    }
    return meilleur?.intention ?? { type: "attendre", ticks: 3 };
  }

  /** Candidats et scores bruts (exposé pour les tests). */
  candidats(perception: Perception): Candidat[] {
    const { besoins, personnalite, nourritureEnPoche, placeLibre } = perception.moi;
    const lieux = perception.lieuxConnus;
    const connait = (type: Ressource): boolean =>
      lieux.some((l) => l.type === type && l.quantiteVue >= 1);
    const connaitEau = connait("eau");
    const connaitNourriture = (Object.keys(NOURRITURE) as Ressource[]).some(connait);
    const candidats: Candidat[] = [];

    if (besoins.soif < SEUILS_ENVIE.soif) {
      candidats.push({
        intention: { type: "boire" },
        score: urgence(besoins.soif) * 3 + (connaitEau ? 0 : -0.1),
      });
    }

    if (besoins.faim < SEUILS_ENVIE.faim) {
      candidats.push({
        intention: { type: "manger" },
        score:
          urgence(besoins.faim) * 2.5 + (nourritureEnPoche ? 0.15 : connaitNourriture ? 0 : -0.2),
      });
    }

    if (besoins.sommeil < 80) {
      candidats.push({
        intention: { type: "dormir" },
        score: urgence(besoins.sommeil) * 2 + (perception.moment.estNuit ? 0.5 : 0),
      });
    }

    // Constituer une réserve de nourriture (conscience) quand on sait où en trouver.
    if (connait("baies") && placeLibre > 0 && !nourritureEnPoche) {
      candidats.push({
        intention: { type: "recolter", ressource: "baies" },
        score: 0.25 + personnalite.conscience * 0.45 + urgence(besoins.faim) * 0.5,
      });
    }

    // Explorer : d'autant plus que l'on connaît peu de lieux ou qu'il manque l'essentiel.
    const manque = (connaitEau ? 0 : 0.5) + (connaitNourriture ? 0 : 0.5);
    const familiarite = Math.min(1, lieux.length / 40);
    candidats.push({
      intention: { type: "explorer" },
      score: 0.15 + personnalite.ouverture * 0.35 + manque * 0.8 - familiarite * 0.2,
    });

    candidats.push({ intention: { type: "attendre", ticks: 3 }, score: 0.05 });
    return candidats;
  }
}
