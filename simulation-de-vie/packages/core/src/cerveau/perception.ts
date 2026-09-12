/** Construction de la perception d'un personnage (section 10.2, sous-ensemble M2). */
import type { Besoins } from "../agents/besoins.js";
import type { Personnalite } from "../agents/identite.js";
import { nourritureDisponible, placeLibre, possede, quantite } from "../agents/inventaire.js";
import { cleLieu, relationAvec } from "../agents/personnage.js";
import type { Echec, LieuConnu, Personnage, Stade } from "../agents/personnage.js";
import type { Intention } from "../actions/types.js";
import {
  abriDisponible,
  batimentAReparer,
  batimentsAccessibles,
  estEau,
  feuProche,
  prochainBatimentNecessaire,
} from "../monde.js";
import type { Monde } from "../monde.js";
import type { TypeBatiment } from "../monde/batiments.js";
import { materiauxManquants } from "../monde/batiments.js";
import { Grille } from "../monde/grille.js";
import type { Position } from "../monde/grille.js";
import type { Moment } from "../monde/horloge.js";
import { EFFETS_METEO } from "../monde/meteo.js";
import type { Meteo } from "../monde/meteo.js";
import type { Ressource } from "../monde/ressources.js";
import type { Souvenir } from "../memoire/souvenir.js";
import type { Lien } from "../social/relations.js";
import { stockVolable } from "../actions/planificateur.js";

export interface PersonneVisible {
  readonly id: string;
  readonly prenom: string;
  readonly position: Position;
  readonly distance: number;
  readonly lien: Lien;
  readonly affinite: number;
  readonly confiance: number;
  readonly famille: boolean;
  readonly endormi: boolean;
  /** Visiblement affamé (faim < 30). */
  readonly aFaim: boolean;
  readonly derniereInteraction: number;
}

export interface ProjetPercu {
  readonly batimentId: string;
  readonly type: TypeBatiment;
  readonly etat: "chantier" | "termine";
  readonly manquants: Partial<Record<Ressource, number>>;
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
    readonly ressourceNourriture: Ressource | null;
    readonly nourritureCrue: number;
    readonly possedeHache: boolean;
    readonly intention: Intention | null;
    readonly dernierEchec: Echec | null;
    readonly projet: ProjetPercu | null;
    readonly reputation: number;
    readonly prudenceNourriture: boolean;
    readonly chercheAbri: boolean;
    readonly explorerPlusLoin: boolean;
  };
  readonly moment: Moment;
  readonly meteo: Meteo;
  readonly rayon: number;
  readonly lieuxConnus: readonly LieuConnu[];
  readonly personnesVisibles: readonly PersonneVisible[];
  readonly abriDisponible: boolean;
  readonly feuProche: boolean;
  readonly feuConnu: boolean;
  readonly stockAccessible: boolean;
  readonly besoinConstruction: TypeBatiment | null;
  readonly reparationNecessaire: boolean;
  readonly connaitArbres: boolean;
  /** Stock d'autrui contenant de la nourriture à portée (tentation). */
  readonly stockVolable: boolean;
  /** Souvenirs des dernières 24 h, du plus ancien au plus récent. */
  readonly souvenirsRecents: readonly Souvenir[];
}

/** Rayon de vision courant (jour / nuit, météo). */
export function rayonVision(monde: Monde, moment: Moment): number {
  const base = moment.estNuit
    ? monde.config.perception.rayonNuit
    : monde.config.perception.rayonJour;
  return Math.max(1, base - EFFETS_METEO[monde.meteo].vision);
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
        if (connu?.type === t.gisement.type && connu.outilRequis === t.gisement.outilRequis) {
          connu.quantiteVue = t.gisement.quantite;
          connu.tickVu = tick;
        } else {
          p.connaissance.set(cle, {
            x: t.x,
            y: t.y,
            type: t.gisement.type,
            outilRequis: t.gisement.outilRequis,
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
            outilRequis: null,
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
      const rel = relationAvec(p, autre.id);
      personnesVisibles.push({
        id: autre.id,
        prenom: autre.identite.prenom,
        position: { ...autre.corps.position },
        distance,
        lien: rel.lien,
        affinite: rel.affinite,
        confiance: rel.confiance,
        famille: autre.identite.nomFamille === p.identite.nomFamille,
        endormi: autre.corps.endormi,
        aFaim: autre.besoins.faim < 30,
        derniereInteraction: rel.derniereInteraction,
      });
    }
  }

  let projet: ProjetPercu | null = null;
  if (p.projet !== null) {
    const b = monde.batiments.get(p.projet.batimentId);
    if (b !== undefined) {
      projet = {
        batimentId: b.id,
        type: b.type,
        etat: b.etat,
        manquants: materiauxManquants(b),
        distance: Grille.distance(p.corps.position, b.position),
      };
    }
  }

  const acces = batimentsAccessibles(monde, p);
  const inv = p.corps.inventaire;
  let feuConnu = false;
  for (const b of monde.batiments.values()) {
    if (b.type === "feu_de_camp" && b.etat === "termine" && b.allume) {
      feuConnu = true;
      break;
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
      placeLibre: placeLibre(inv),
      nourritureEnPoche: nourritureDisponible(inv) !== null,
      ressourceNourriture: nourritureDisponible(inv),
      nourritureCrue: quantite(inv, "baies") + quantite(inv, "poisson") + quantite(inv, "gibier"),
      possedeHache: possede(inv, "hache_pierre"),
      intention: p.intention,
      dernierEchec: p.dernierEchec,
      projet,
      reputation: p.reputation,
      prudenceNourriture: p.drapeaux.prudenceNourritureJusqua > monde.horloge.tick,
      chercheAbri: p.drapeaux.chercheAbriJusqua > monde.horloge.tick,
      explorerPlusLoin: p.drapeaux.explorerPlusLoinJusqua > monde.horloge.tick,
    },
    moment,
    meteo: monde.meteo,
    rayon,
    lieuxConnus: [...p.connaissance.values()],
    personnesVisibles,
    abriDisponible: abriDisponible(monde, p) !== null,
    feuProche: feuProche(monde, p.corps.position) !== null,
    feuConnu,
    stockAccessible: acces.some((b) => b.etat === "termine" && b.stock !== null),
    besoinConstruction: prochainBatimentNecessaire(monde, p),
    reparationNecessaire: batimentAReparer(monde, p) !== null,
    connaitArbres: [...p.connaissance.values()].some(
      (l) => l.type === "bois" && l.outilRequis === "hache_pierre" && l.quantiteVue >= 1,
    ),
    stockVolable: stockVolable(monde, p) !== null,
    souvenirsRecents: p.memoire.depuis(monde.horloge.tick - monde.horloge.ticksParJour),
  };
}
