/** Construction de la perception d'un personnage (section 10.2, sous-ensemble M2). */
import { INVENTIONS, SEUIL_SAVOIR } from "../savoirs/catalogue.js";
import type { Invention, Savoir } from "../savoirs/catalogue.js";
import { savoirsConnus } from "../savoirs/lecons.js";
import {
  aDeLaFievre,
  capacites,
  estEpuise,
  fractureNonImmobilisee,
  graviteMax,
  saigne,
  soinNecessaire,
} from "../agents/corps.js";
import type { TypeObjet } from "../monde/recettes.js";
import { REPARATIONS_MAX, SEUIL_REPARATION } from "../monde/recettes.js";
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
  estTuileEau,
  feuAAlimenter,
  feuEteint,
  feuProche,
  membresFamille,
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
import { avancementGrossesse, grandEnfant, peutConcevoir } from "../agents/vie.js";
import { PROFILS, troupeauxVisiblesDepuis } from "../monde/faune.js";
import { DOCILITE, betesDe } from "../monde/village.js";
import { prioriteEnCours } from "./conseil.js";
import type { Priorite } from "./conseil.js";
import type { Espece, EtatTroupeau } from "../monde/faune.js";
import { coutumesActives, tombeARecueillir } from "../social/societe.js";
import { intentionDominante } from "../memoire/psyche.js";
import type { Lecon } from "../savoirs/catalogue.js";

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
  /** Blessé visible : ce qu'il lui faudrait. */
  readonly soinNecessaire: "bandage" | "cataplasme" | "attelle" | null;
  readonly saigne: boolean;
  readonly estMonParent: boolean;
  readonly estMonPartenaire: boolean;
  /** Est en train de chasser (pour se joindre à la battue). */
  readonly chasse: boolean;
  /** Veille la nuit près du feu. */
  readonly veille: boolean;
  /** Malade (on garde ses distances). */
  readonly malade: boolean;
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
  readonly moi: {
    readonly besoins: Readonly<Besoins>;
    readonly nourritureEnPoche: boolean;
    readonly savoirs: ReadonlySet<Savoir>;
    /** Je saigne et j'ai un bandage sur moi : on s'en occupe tout de suite. */
    readonly saigneAvecBandage?: boolean;
    /** Adulte armé (lance, arc, hache) : peut défendre. */
    readonly arme?: boolean;
    readonly enfant?: boolean;
  };
  readonly abriDisponible: boolean;
  readonly feuConnu: boolean;
  /** Le feu familial est éteint (ou à court de bois) : on s'en occupe. */
  /** Danger : l'alarme a été donnée, ou une meute lancée sur quelqu'un est en vue. */
  readonly menace?: {
    readonly distance: number;
    /** La personne que la meute vise, si elle est à moins de douze tuiles. */
    readonly cible: string | null;
    readonly cibleEstMonEnfant: boolean;
  } | null;
}

/** Y a-t-il un feu de camp allumé quelque part dans le monde ? */
export function feuConnu(monde: Monde): boolean {
  for (const b of monde.batiments.values()) {
    if (b.type === "feu_de_camp" && b.etat === "termine" && b.allume) return true;
  }
  return false;
}

export function percevoirLeger(monde: Monde, p: Personnage): PerceptionLegere {
  const inv = p.corps.inventaire;
  return {
    moi: {
      besoins: p.besoins,
      nourritureEnPoche: quantiteNourriture(inv) > 0,
      savoirs: savoirsConnus(p),
      saigneAvecBandage: saigne(p) && possede(inv, "bandage"),
      arme:
        p.corps.stade !== "enfant" &&
        (possede(inv, "lance") || possede(inv, "arc") || possede(inv, "hache_pierre")),
      enfant: p.corps.stade === "enfant",
    },
    abriDisponible: abriDisponible(monde, p) !== null,
    feuConnu: feuConnu(monde),
    menace: menacePercue(monde, p),
  };
}

/** Une meute lancée sur quelqu'un, en vue ou signalée par l'alarme. */
export function menacePercue(
  monde: Monde,
  p: Personnage,
): NonNullable<PerceptionLegere["menace"]> | null {
  const tick = monde.horloge.tick;
  const alerte = p.drapeaux.alerteJusqua > tick;
  const rayon = rayonVision(monde, monde.horloge.moment());
  let meilleure: { distance: number; proie: string | null } | null = null;
  for (const t of monde.troupeaux.values()) {
    if (!PROFILS[t.espece].predateur || t.taille <= 0 || t.proieHumaine === null) continue;
    const d = Grille.distance(t.position, p.corps.position);
    if (d > (alerte ? 24 : rayon)) continue;
    if (meilleure === null || d < meilleure.distance)
      meilleure = { distance: d, proie: t.proieHumaine };
  }
  if (meilleure === null)
    return alerte ? { distance: 24, cible: null, cibleEstMonEnfant: false } : null;
  const idProie = meilleure.proie;
  const proie = idProie === null ? undefined : monde.personnages.find((x) => x.id === idProie);
  const cibleProche =
    proie !== undefined &&
    proie.vivant &&
    Grille.distance(proie.corps.position, p.corps.position) <= 12
      ? proie
      : null;
  return {
    distance: meilleure.distance,
    cible: cibleProche?.id ?? null,
    cibleEstMonEnfant:
      cibleProche !== null && (cibleProche.identite.parents?.includes(p.id) ?? false),
  };
}

function betailFamilial(monde: Monde, p: Personnage): { premiere: string; nombre: number } | null {
  const betes = betesDe(monde, p.identite.nomFamille);
  const premiere = betes[0];
  return premiere === undefined ? null : { premiere: premiere.id, nombre: betes.length };
}

export interface TroupeauVisible {
  readonly id: string;
  readonly espece: Espece;
  readonly nom: string;
  readonly predateur: boolean;
  readonly taille: number;
  readonly distance: number;
  readonly position: Position;
  readonly mefiance: number;
  readonly etat: EtatTroupeau;
  /** Espèce qu'on peut apprivoiser (mouflon, aurochs, lièvre, sanglier). */
  readonly docile: boolean;
}

export interface Perception {
  readonly moi: {
    readonly id: string;
    readonly position: Position;
    readonly besoins: Readonly<Besoins>;
    readonly sante: number;
    readonly stade: Stade;
    /** Enfant d'au moins six ans : il cueille des baies lui-même. */
    readonly grandEnfant: boolean;
    readonly personnalite: Personnalite;
    readonly endormi: boolean;
    readonly placeLibre: number;
    /** Une corde en poche (pour ramener une bête vivante), et les bêtes de la famille. */
    readonly possedeCorde: boolean;
    readonly betesFamille: number;
    readonly minerai: number;
    readonly nourritureEnPoche: boolean;
    readonly ressourceNourriture: Ressource | null;
    readonly nourritureCrue: number;
    readonly possedeHache: boolean;
    /** Outil ébréché qu'on peut encore réparer, s'il y en a un. */
    readonly outilAReparer: TypeObjet | null;
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
    /** Leçons et inventions que je connais. */
    readonly savoirs: ReadonlySet<Savoir>;
    /** Inventions dont j'ai l'idée mais pas encore le prototype réussi. */
    readonly ideesEnCours: readonly Invention[];
    readonly possede: (objet: TypeObjet) => boolean;
    readonly cuir: number;
    /** Bêtes de la famille (identifiant de la première, et nombre). */
    readonly betail: { readonly premiere: string; readonly nombre: number } | null;
    readonly poissonCru: number;
    /** Le corps : ce qui saigne, ce qui brûle de fièvre, ce qui est cassé, la fatigue. */
    readonly corps: {
      readonly blesse: boolean;
      readonly saigne: boolean;
      readonly fievre: boolean;
      readonly fractureLibre: boolean;
      readonly graviteMax: number;
      readonly fatigue: number;
      readonly epuise: boolean;
      readonly mobilite: number;
      readonly soinNecessaire: "bandage" | "cataplasme" | "attelle" | null;
      readonly malade: boolean;
    };
    readonly explorerPlusLoin: boolean;
    /** Priorité choisie sur les conseils de Claude (ambition en cours), s'il y en a une. */
    readonly priorite: Priorite | null;
    /** Le bâtiment qu'un conseil de Claude nous a fait vouloir, s'il en est un. */
    readonly ambitionBatiment: string | null;
    /** Le site du nouveau village vers lequel on marche (schisme), tant qu'on en est à plus de six tuiles. */
    readonly destination: Position | null;
    /** Foi 0..10, et si l'on n'a pas encore prié aujourd'hui. */
    readonly foi: number;
    readonly peutPrier: boolean;
    /** Jours consécutifs de faim, de froid ou de moral bas (le plus long des trois). */
    readonly joursDeGene: number;
    /** Abattu (jalon 14) : on ne fait plus que le nécessaire. */
    readonly abattu: boolean;
    /** L'intention qu'on refait sans cesse, quand l'ennui est là (on cherche autre chose). */
    readonly intentionDominante: string | null;
  };
  /** Un autel terminé à vingt tuiles. */
  readonly autelConnu: boolean;
  /** Les coutumes du village : des leçons que tout le monde suit, qu'on les ait apprises ou non. */
  readonly coutumes: ReadonlySet<Lecon>;
  /** La tombe d'où vient une leçon connue, si l'on ne s'y est pas recueilli depuis une saison. */
  readonly tombeARecueillir: Position | null;
  readonly moment: Moment;
  readonly meteo: Meteo;
  readonly rayon: number;
  readonly lieuxConnus: readonly LieuConnu[];
  readonly personnesVisibles: readonly PersonneVisible[];
  /** Troupeaux et meutes en vue, du plus proche au plus lointain. */
  readonly troupeauxVisibles: readonly TroupeauVisible[];
  readonly abriDisponible: boolean;
  readonly feuProche: boolean;
  readonly feuConnu: boolean;
  readonly feuFamilialAAlimenter: boolean;
  /** Le feu familial est éteint (pas seulement à court de bois). */
  readonly feuFamilialEteint: boolean;
  /** Un fumoir terminé existe dans la famille. */
  readonly fumoirConnu: boolean;
  readonly stockAccessible: boolean;
  /** L'âge du cuivre : minerai vu, four de la famille, lingots et minerai à portée. */
  readonly connaitMinerai: boolean;
  readonly fourConnu: boolean;
  readonly cuivreAccessible: number;
  readonly mineraiAccessible: number;
  /** Nourriture des stocks accessibles, en unités par membre de la famille. */
  readonly reserveJours: number;
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
  // Les troupeaux en vue sont notés comme lieux de gibier, là où on les a vus.
  const troupeauxIci = new Map<string, number>();
  for (const tr of troupeauxVisiblesDepuis(monde, p.corps.position, rayon)) {
    if (!PROFILS[tr.espece].predateur)
      troupeauxIci.set(cleLieu(tr.position.x, tr.position.y), tr.taille);
  }
  const connaissance = p.connaissance;
  // Parcours par morceau : la question revient pour cent soixante-neuf tuiles à chaque pas.
  monde.grille.parcourir(x - rayon, y - rayon, x + rayon, y + rayon, (t, m, i) => {
    monde.grille.decouvrirIndex(m, i);
    const cle = cleLieu(t.x, t.y);
    const betes = troupeauxIci.get(cle);
    if (betes !== undefined) {
      connaissance.set(cle, {
        x: t.x,
        y: t.y,
        type: "gibier",
        outilRequis: "lance",
        quantiteVue: betes,
        tickVu: tick,
      });
    } else if (t.gisement) {
      const connu = connaissance.get(cle);
      if (connu?.type === t.gisement.type && connu.outilRequis === t.gisement.outilRequis) {
        connu.quantiteVue = t.gisement.quantite;
        connu.tickVu = tick;
      } else {
        connaissance.set(cle, {
          x: t.x,
          y: t.y,
          type: t.gisement.type,
          outilRequis: t.gisement.outilRequis,
          quantiteVue: t.gisement.quantite,
          tickVu: tick,
        });
      }
    } else if (estTuileEau(t)) {
      if (!connaissance.has(cle)) {
        connaissance.set(cle, {
          x: t.x,
          y: t.y,
          type: "eau",
          outilRequis: null,
          quantiteVue: Infinity,
          tickVu: tick,
        });
      }
    } else if (connaissance.has(cle)) {
      // Le gisement connu a disparu.
      connaissance.delete(cle);
    }
  });
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
        soinNecessaire: soinNecessaire(autre, monde.horloge.tick),
        saigne: saigne(autre),
        estMonParent: rel.lien === "parent",
        estMonPartenaire: rel.lien === "partenaire",
        chasse:
          autre.actionEnCours?.type === "chasser" ||
          (autre.intention?.type === "recolter" && autre.intention.ressource === "gibier"),
        veille: autre.actionEnCours?.type === "veiller",
        malade: autre.corps.etat.maladies.length > 0,
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
      grandEnfant: grandEnfant(monde, p),
      personnalite: p.identite.personnalite,
      endormi: p.corps.endormi,
      placeLibre: placeLibre(inv),
      possedeCorde: quantite(inv, "corde") >= 1,
      betesFamille: betesDe(monde, p.identite.nomFamille).length,
      minerai: quantite(inv, "minerai"),
      nourritureEnPoche: nourritureDisponible(inv) !== null,
      ressourceNourriture: nourritureDisponible(inv),
      nourritureCrue: quantite(inv, "baies") + quantite(inv, "poisson") + quantite(inv, "gibier"),
      possedeHache: possede(inv, "hache_pierre"),
      outilAReparer:
        inv.objets.find(
          (o) => o.solidite < SEUIL_REPARATION && (o.reparations ?? 0) < REPARATIONS_MAX,
        )?.type ?? null,
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
      savoirs: savoirsConnus(p),
      ideesEnCours: [...p.savoirs.entries()]
        .filter(([k, v]) => k in INVENTIONS && v.force >= SEUIL_SAVOIR && v.force < 1)
        .map(([k]) => k as Invention),
      possede: (objet) => possede(inv, objet),
      cuir: quantite(inv, "cuir"),
      betail: betailFamilial(monde, p),
      poissonCru: quantite(inv, "poisson"),
      corps: {
        blesse: p.corps.etat.blessures.length > 0,
        saigne: saigne(p),
        fievre: aDeLaFievre(p, monde.horloge.tick),
        fractureLibre: fractureNonImmobilisee(p),
        graviteMax: graviteMax(p),
        fatigue: p.corps.etat.fatigue,
        epuise: estEpuise(p),
        mobilite: capacites(p, monde.config.vie.joursParAnnee, monde.horloge.tick).mobilite,
        soinNecessaire: soinNecessaire(p, monde.horloge.tick),
        malade: p.corps.etat.maladies.length > 0,
      },
      explorerPlusLoin: p.drapeaux.explorerPlusLoinJusqua > monde.horloge.tick,
      priorite: prioriteEnCours(p),
      ambitionBatiment:
        p.ambition?.issue === "en_cours" && p.ambition.genre === "batiment"
          ? p.ambition.cible
          : null,
      destination:
        p.ambition?.issue === "en_cours" &&
        p.ambition.genre === "migrer" &&
        p.ambition.destination !== undefined &&
        Grille.distance(p.corps.position, p.ambition.destination) > 6
          ? { ...p.ambition.destination }
          : null,
      foi: p.foi,
      joursDeGene: Math.max(p.drapeaux.joursFaim, p.drapeaux.joursFroid, p.drapeaux.joursMoralBas),
      peutPrier:
        p.dernierePriere < 0 || monde.horloge.tick - p.dernierePriere >= monde.horloge.ticksParJour,
      abattu: p.psyche.abattu,
      intentionDominante: intentionDominante(p),
    },
    autelConnu: [...monde.batiments.values()].some(
      (b) =>
        b.type === "autel" &&
        b.etat === "termine" &&
        Grille.distance(b.position, p.corps.position) <= 20,
    ),
    coutumes: coutumesActives(monde.societe),
    tombeARecueillir: tombeARecueillir(monde, p),
    moment,
    meteo: monde.meteo,
    rayon,
    lieuxConnus: [...p.connaissance.values()],
    troupeauxVisibles: troupeauxVisiblesDepuis(monde, p.corps.position, rayon).map((t) => ({
      id: t.id,
      espece: t.espece,
      nom: PROFILS[t.espece].pluriel,
      predateur: PROFILS[t.espece].predateur,
      taille: t.taille,
      distance: Grille.distance(t.position, p.corps.position),
      position: t.position,
      mefiance: t.mefiance,
      etat: t.etat,
      docile: DOCILITE[t.espece] > 0,
    })),
    personnesVisibles,
    abriDisponible: abriDisponible(monde, p) !== null,
    feuProche: feuProche(monde, p.corps.position) !== null,
    feuConnu: feuAllume,
    feuFamilialAAlimenter: feuAAlimenter(monde, p) !== null,
    feuFamilialEteint: feuEteint(monde, p) !== null,
    fumoirConnu: acces.some((b) => b.etat === "termine" && b.type === "fumoir"),
    stockAccessible: acces.some((b) => b.etat === "termine" && b.stock !== null),
    connaitMinerai: [...p.connaissance.values()].some(
      (l) => l.type === "minerai" && l.quantiteVue >= 1,
    ),
    fourConnu: acces.some((b) => b.etat === "termine" && b.type === "four"),
    cuivreAccessible: acces.reduce(
      (t, b) => t + (b.etat === "termine" && b.stock !== null ? quantite(b.stock, "cuivre") : 0),
      quantite(inv, "cuivre"),
    ),
    mineraiAccessible: acces.reduce(
      (t, b) => t + (b.etat === "termine" && b.stock !== null ? quantite(b.stock, "minerai") : 0),
      quantite(inv, "minerai"),
    ),
    reserveJours:
      acces.reduce(
        (t, b) => t + (b.etat === "termine" && b.stock !== null ? quantiteNourriture(b.stock) : 0),
        0,
      ) / Math.max(1, membresFamille(monde, p).length),
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
