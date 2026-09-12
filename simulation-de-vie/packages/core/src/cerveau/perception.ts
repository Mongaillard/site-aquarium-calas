/** Construction de la perception d'un personnage (section 10.2, sous-ensemble M1). */
import type { Besoins } from "../agents/besoins.js";
import type { Personnalite } from "../agents/identite.js";
import { nourritureDisponible, placeLibre } from "../agents/inventaire.js";
import { cleLieu } from "../agents/personnage.js";
import type { Echec, LieuConnu, Personnage, Stade } from "../agents/personnage.js";
import type { Intention } from "../actions/types.js";
import { estEau } from "../monde.js";
import type { Monde } from "../monde.js";
import { Grille } from "../monde/grille.js";
import type { Position } from "../monde/grille.js";
import type { Moment } from "../monde/horloge.js";

export interface PersonneVisible {
  readonly id: string;
  readonly prenom: string;
  readonly position: Position;
  readonly distance: number;
}

export interface Perception {
  readonly moi: {
    readonly id: string;
    readonly position: Position;
    readonly besoins: Readonly<Besoins>;
    readonly sante: number;
    readonly stade: Stade;
    readonly personnalite: Personnalite;
    readonly endormi: boolean;
    readonly placeLibre: number;
    readonly nourritureEnPoche: boolean;
    readonly intention: Intention | null;
    readonly dernierEchec: Echec | null;
  };
  readonly moment: Moment;
  readonly rayon: number;
  readonly lieuxConnus: readonly LieuConnu[];
  readonly personnesVisibles: readonly PersonneVisible[];
}

/** Rayon de vision courant (jour / nuit). */
export function rayonVision(monde: Monde, moment: Moment): number {
  return moment.estNuit ? monde.config.perception.rayonNuit : monde.config.perception.rayonJour;
}

/** Met à jour la connaissance du personnage à partir des tuiles visibles. */
export function observer(monde: Monde, p: Personnage, rayon: number): void {
  const { x, y } = p.corps.position;
  const tick = monde.horloge.tick;
  for (let dy = -rayon; dy <= rayon; dy++) {
    for (let dx = -rayon; dx <= rayon; dx++) {
      const t = monde.grille.tuileOuNull(x + dx, y + dy);
      if (t === null) continue;
      const cle = cleLieu(t.x, t.y);
      if (t.gisement) {
        const connu = p.connaissance.get(cle);
        if (connu?.type === t.gisement.type) {
          connu.quantiteVue = t.gisement.quantite;
          connu.tickVu = tick;
        } else {
          p.connaissance.set(cle, {
            x: t.x,
            y: t.y,
            type: t.gisement.type,
            quantiteVue: t.gisement.quantite,
            tickVu: tick,
          });
        }
      } else if (estEau(monde, t.x, t.y)) {
        if (!p.connaissance.has(cle)) {
          p.connaissance.set(cle, {
            x: t.x,
            y: t.y,
            type: "eau",
            quantiteVue: Infinity,
            tickVu: tick,
          });
        }
      } else if (p.connaissance.has(cle)) {
        // Le gisement connu a disparu.
        p.connaissance.delete(cle);
      }
    }
  }
}

export function percevoir(monde: Monde, p: Personnage): Perception {
  const moment = monde.horloge.moment();
  const rayon = rayonVision(monde, moment);
  observer(monde, p, rayon);

  const personnesVisibles: PersonneVisible[] = [];
  for (const autre of monde.personnages) {
    if (!autre.vivant || autre.id === p.id) continue;
    const distance = Grille.distance(p.corps.position, autre.corps.position);
    if (distance <= rayon) {
      personnesVisibles.push({
        id: autre.id,
        prenom: autre.identite.prenom,
        position: { ...autre.corps.position },
        distance,
      });
    }
  }

  return {
    moi: {
      id: p.id,
      position: { ...p.corps.position },
      besoins: p.besoins,
      sante: p.corps.sante,
      stade: p.corps.stade,
      personnalite: p.identite.personnalite,
      endormi: p.corps.endormi,
      placeLibre: placeLibre(p.corps.inventaire),
      nourritureEnPoche: nourritureDisponible(p.corps.inventaire) !== null,
      intention: p.intention,
      dernierEchec: p.dernierEchec,
    },
    moment,
    rayon,
    lieuxConnus: [...p.connaissance.values()],
    personnesVisibles,
  };
}
