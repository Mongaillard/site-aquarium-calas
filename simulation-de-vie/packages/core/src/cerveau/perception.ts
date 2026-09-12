/** Construction de la perception d'un personnage (section 10.2, sous-ensemble M2). */
import type { Besoins } from "../agents/besoins.js";
import type { Personnalite } from "../agents/identite.js";
import {
  nourritureDisponible,
  placeLibre,
  possede,
  quantite,
  quantiteNourriture,
} from "../agents/inventaire.js";
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
import type { Moment, Saison } from "../monde/horloge.js";
import { EFFETS_METEO } from "../monde/meteo.js";
import type { Meteo } from "../monde/meteo.js";
import type { Ressource } from "../monde/ressources.js";
import type { Souvenir } from "../memoire/souvenir.js";
import type { Lien } from "../social/relations.js";
import { meilleureNourritureConnue, stockVolable } from "../actions/planificateur.js";
import { eligibles, partenaireDe, veutCourtiser } from "../social/couple.js";
import { avancementGrossesse, peutConcevoir } from "../agents/vie.js";

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
  readonly stade: Stade;
  readonly attirance: number;
  /** Cette personne et moi pourrions former un couple. */
  readonly eligible: boolean;
  /** Visiblement un peu affamé (faim < 55) : un parent s'en inquiète. */
  readonly aUnPeuFaim: boolean;
  readonly enceinte: boolean;
  /** Je souhaite courtiser cette personne (attirance, affinité, éligibilité). */
  readonly courtisable: boolean;
  readonly estMonEnfant: boolean;
  readonly estMonParent: boolean;
  readonly estMonPartenaire: boolean;
}

export interface ProjetPercu {
  readonly batimentId: string;
  readonly type: TypeBatiment;
  readonly etat: "chantier" | "termine";
  readonly manquants: Partial<Record<Ressource, number>>;
  readonly distance: number;
}

/** Perception minimale évaluée à chaque tick pour les réflexes d'urgence. */
export interface PerceptionLegere {
  readonly moi: { readonly besoins: Readonly<Besoins> };
  readonly abriDisponible: boolean;
  readonly feuConnu: boolean;
}

/** Y a-t-il un feu de camp allumé quelque part dans le monde ? */
export function feuConnu(monde: Monde): boolean {
  for (const b of monde.batiments.values()) {
    if (b.type === "feu_de_camp" && b.etat === "termine" && b.allume) return true;
  }
  return false;
}

export function percevoirLeger(monde: Monde, p: Personnage): PerceptionLegere {
  return {
    moi: { besoins: p.besoins },
    abriDisponible: abriDisponible(monde, p) !== null,
    feuConnu: feuConnu(monde),
  };
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
    readonly enceinte: boolean;
    readonly avancementGrossesse: number;
    /** Le couple peut-il concevoir maintenant (âge, grossesse, délai post-partum) ? */
    readonly coupleFecond: boolean;
    /** Enfants vivants à charge (stade enfant). */
    readonly enfantsACharge: number;
    /** Parents vivants : un enfant sait toujours où ils sont. */
    readonly parents: readonly {
      readonly id: string;
      readonly distance: number;
      readonly endormi: boolean;
    }[];
    readonly partenaire: {
      readonly id: string;
      readonly prenom: string;
      readonly distance: number;
    } | null;
    readonly valeurs: readonly string[];
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
  /** Meilleure nourriture que je sais aller chercher (outil en main), ou null. */
  readonly nourritureAccessible: Ressource | null;
  /** Je connais un banc de poissons (canne requise). */
  readonly connaitPoisson: boolean;
  readonly possedeCanne: boolean;
  /** Quantité de nourriture en poche. */
  readonly nourritureEnPocheQuantite: number;
  readonly saison: Saison;
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
      monde.grille.decouvrir(t.x, t.y);
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

export function percevoir(monde: Monde, p: Personnage, observerDabord = true): Perception {
  const moment = monde.horloge.moment();
  const rayon = rayonVision(monde, moment);
  if (observerDabord) observer(monde, p, rayon);

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
        stade: autre.corps.stade,
        attirance: rel.attirance,
        eligible: eligibles(monde, p, autre),
        aUnPeuFaim: autre.besoins.faim < 55,
        enceinte: autre.corps.enceinte !== null,
        courtisable: veutCourtiser(monde, p, autre),
        estMonEnfant: rel.lien === "enfant",
        estMonParent: rel.lien === "parent",
        estMonPartenaire: rel.lien === "partenaire",
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
  const partenaire = partenaireDe(monde, p);
  const feuAllume = feuConnu(monde);

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
      enceinte: p.corps.enceinte !== null,
      avancementGrossesse: avancementGrossesse(monde, p),
      parents: (p.identite.parents ?? [])
        .map((id) => monde.personnages.find((x) => x.id === id))
        .filter((x): x is Personnage => x?.vivant === true)
        .map((x) => ({
          id: x.id,
          distance: Grille.distance(p.corps.position, x.corps.position),
          endormi: x.corps.endormi,
        }))
        .sort((x, y) => x.distance - y.distance),
      enfantsACharge: monde.personnages.filter(
        (x) =>
          x.vivant && x.corps.stade === "enfant" && (x.identite.parents?.includes(p.id) ?? false),
      ).length,
      coupleFecond:
        partenaire !== null &&
        peutConcevoir(monde, p.identite.sexe === "F" ? p : partenaire) &&
        (p.identite.sexe === "F" ? partenaire : p).corps.stade === "adulte",
      partenaire: partenaire
        ? {
            id: partenaire.id,
            prenom: partenaire.identite.prenom,
            distance: Grille.distance(p.corps.position, partenaire.corps.position),
          }
        : null,
      valeurs: p.identite.valeurs,
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
    feuConnu: feuAllume,
    stockAccessible: acces.some((b) => b.etat === "termine" && b.stock !== null),
    besoinConstruction: prochainBatimentNecessaire(monde, p),
    reparationNecessaire: batimentAReparer(monde, p) !== null,
    connaitArbres: [...p.connaissance.values()].some(
      (l) => l.type === "bois" && l.outilRequis === "hache_pierre" && l.quantiteVue >= 1,
    ),
    stockVolable: stockVolable(monde, p) !== null,
    nourritureAccessible: meilleureNourritureConnue(p),
    connaitPoisson: [...p.connaissance.values()].some(
      (l) => l.type === "poisson" && l.quantiteVue >= 1,
    ),
    possedeCanne: possede(inv, "canne_a_peche"),
    nourritureEnPocheQuantite: quantiteNourriture(inv),
    saison: moment.saison,
    souvenirsRecents: p.memoire.depuis(monde.horloge.tick - monde.horloge.ticksParJour),
  };
}
