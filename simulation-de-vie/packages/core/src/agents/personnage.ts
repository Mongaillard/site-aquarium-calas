/** Personnage : identité + corps + besoins + état de décision. */
import type { Savoir, SavoirAcquis } from "../savoirs/catalogue.js";
import type { Action, Intention } from "../actions/types.js";
import type { Position } from "../monde/grille.js";
import type { Outil, Ressource } from "../monde/ressources.js";
import { FluxMemoire } from "../memoire/souvenir.js";
import type { Rng } from "../rng.js";
import { relationVierge } from "../social/relations.js";
import type { Relation } from "../social/relations.js";
import { besoinsInitiaux } from "./besoins.js";
import { etatCorpsInitial } from "./corps.js";
import type { EtatCorps, Modificateur } from "./corps.js";
import type { Besoins } from "./besoins.js";
import { experienceInitiale } from "./competences.js";
import type { Experience } from "./competences.js";
import { phenotype } from "./genetique.js";
import { genererIdentite } from "./identite.js";
import type { Identite, OptionsIdentite } from "./identite.js";
import { creerInventaire } from "./inventaire.js";
import type { Inventaire } from "./inventaire.js";

export type Stade = "enfant" | "adolescent" | "adulte" | "ancien";

export interface Grossesse {
  readonly depuisTick: number;
  readonly pere: string;
}

export interface Corps {
  sante: number;
  ageJours: number;
  stade: Stade;
  position: Position;
  inventaire: Inventaire;
  /** Vrai pendant l'action `dormir`. */
  endormi: boolean;
  enceinte: Grossesse | null;
  /** Tick du dernier accouchement (délai avant une nouvelle grossesse). */
  dernierAccouchement: number | null;
  /** Blessures, fatigue, carences, handicaps, cicatrices, régime. */
  etat: EtatCorps;
}

/** Lieu mémorisé : gisement ou point d'eau vu par le personnage (préfigure la mémoire de M3). */
export interface LieuConnu {
  readonly x: number;
  readonly y: number;
  readonly type: Ressource;
  readonly outilRequis: Outil | null;
  quantiteVue: number;
  tickVu: number;
}

export interface Echec {
  readonly tick: number;
  readonly action: string;
  readonly raison: string;
}

/** Projet de construction en cours : chantier auquel le personnage contribue. */
export interface Projet {
  readonly batimentId: string;
}

/** Indicateurs issus des réflexions, valables jusqu'au tick indiqué. */
export interface Drapeaux {
  prudenceNourritureJusqua: number;
  chercheAbriJusqua: number;
  explorerPlusLoinJusqua: number;
  /** Alarme entendue : on se met à l'abri ou on défend jusqu'à ce tick. */
  alerteJusqua: number;
  /** A vu de la nourriture se gâter récemment (jusqu'à ce tick) : l'idée du fumoir vient. */
  nourritureGateeJusqua: number;
  /** Minimums du jour, pour la réflexion du soir. */
  faimMinDuJour: number;
  chaleurMinDuJour: number;
  /** Clés des réflexions déjà faites (évite les répétitions). */
  readonly reflexionsFaites: Set<string>;
  /** Jours consécutifs de faim, de froid, de moral bas (mis à jour à l'aube). */
  joursFaim: number;
  joursFroid: number;
  joursMoralBas: number;
  /** Soirs de suite où un besoin réel n'a pas fait venir d'idée. */
  soirsSansIdee: number;
  /** Tick de la dernière question posée à Claude (−1 : jamais). */
  conseilDemandeA: number;
}

/**
 * Ambition née d'un conseil de Claude : ce que la personne veut obtenir, pour
 * combien de temps, et ce qu'il en est advenu. Une seule à la fois.
 */
export interface Ambition {
  readonly genre: "invention" | "batiment" | "lecon" | "priorite" | "explorer";
  readonly cible: string;
  readonly but: string;
  readonly pensee: string;
  readonly depuis: number;
  readonly jusqua: number;
  issue: "en_cours" | "accomplie" | "abandonnee";
  /** Pour `explorer` : lieux connus au départ (accompli douze lieux plus tard). */
  readonly lieuxAuDepart: number;
}

export interface Personnage {
  readonly id: string;
  readonly identite: Identite;
  readonly corps: Corps;
  readonly besoins: Besoins;
  readonly experience: Experience;
  vivant: boolean;
  causeDeces: string | null;
  tickDeces: number | null;
  intention: Intention | null;
  projet: Projet | null;
  plan: Action[];
  actionEnCours: Action | null;
  /** Lieux connus, indexés par "x,y". */
  readonly connaissance: Map<string, LieuConnu>;
  /** Leçons et inventions retenues, avec leur force et leur origine. */
  readonly savoirs: Map<Savoir, SavoirAcquis>;
  /** Pensée intérieure soufflée par Claude (M5), valable une journée. */
  penseeClaude: { texte: string; tick: number } | null;
  /** Ambition en cours ou dernière issue (conseil de Claude). */
  ambition: Ambition | null;
  /** Modificateurs d'humeur datés (deuil, blessure, naissance…). */
  readonly humeur: Modificateur[];
  readonly relations: Map<string, Relation>;
  readonly memoire: FluxMemoire;
  /** Réputation -100..100, modifiée par les témoins de ses actes. */
  reputation: number;
  readonly drapeaux: Drapeaux;
  dernierEchec: Echec | null;
  echecsConsecutifs: number;
  /** Après l'échec de planification d'une urgence, on la laisse en sommeil jusqu'à ce tick. */
  urgenceIgnoreeJusqua: number;
  /** Flux de hasard propre (bruit de décision), dérivé de la graine du monde. */
  readonly rng: Rng;
}

export interface OptionsPersonnage extends OptionsIdentite {
  readonly position: Position;
  readonly ageJours: number;
  readonly joursParAnnee: number;
  readonly ageAdulte: number;
  readonly ageAncien: number;
  readonly ticksParJour: number;
  readonly memoire: { readonly maxSouvenirs: number; readonly demiVieRecenceJours: number };
}

export function stadeDepuisAge(
  ageJours: number,
  joursParAnnee: number,
  ageAdulte: number,
  ageAncien: number,
): Stade {
  const ans = ageJours / joursParAnnee;
  if (ans < 12) return "enfant";
  if (ans < ageAdulte) return "adolescent";
  if (ans < ageAncien) return "adulte";
  return "ancien";
}

/** Capacité d'inventaire : 10 unités + jusqu'à 10 selon la force. */
export function capaciteInventaire(identite: Identite, stade: Stade): number {
  const base = 10 + Math.round(phenotype(identite.genome, "force") * 10);
  return stade === "enfant"
    ? Math.round(base / 3)
    : stade === "adolescent"
      ? Math.round(base * 0.6)
      : base;
}

export function creerPersonnage(rngMonde: Rng, options: OptionsPersonnage): Personnage {
  const rng = rngMonde.fork(`personnage/${options.id}`);
  const identite = genererIdentite(rng, options);
  const stade = stadeDepuisAge(
    options.ageJours,
    options.joursParAnnee,
    options.ageAdulte,
    options.ageAncien,
  );
  return {
    id: options.id,
    identite,
    corps: {
      sante: 100,
      ageJours: options.ageJours,
      stade,
      position: { ...options.position },
      inventaire: creerInventaire(capaciteInventaire(identite, stade)),
      endormi: false,
      enceinte: null,
      dernierAccouchement: null,
      etat: etatCorpsInitial(),
    },
    besoins: besoinsInitiaux(rng),
    experience: experienceInitiale(),
    vivant: true,
    causeDeces: null,
    tickDeces: null,
    intention: null,
    projet: null,
    plan: [],
    actionEnCours: null,
    connaissance: new Map(),
    savoirs: new Map(),
    penseeClaude: null,
    ambition: null,
    humeur: [],
    relations: new Map(),
    memoire: new FluxMemoire({
      ticksParJour: options.ticksParJour,
      demiVieRecenceJours: options.memoire.demiVieRecenceJours,
      maxSouvenirs: options.memoire.maxSouvenirs,
    }),
    reputation: 0,
    drapeaux: {
      prudenceNourritureJusqua: -1,
      chercheAbriJusqua: -1,
      explorerPlusLoinJusqua: -1,
      alerteJusqua: -1,
      nourritureGateeJusqua: -1,
      faimMinDuJour: 100,
      chaleurMinDuJour: 100,
      reflexionsFaites: new Set(),
      joursFaim: 0,
      joursFroid: 0,
      joursMoralBas: 0,
      soirsSansIdee: 0,
      conseilDemandeA: -1,
    },
    dernierEchec: null,
    echecsConsecutifs: 0,
    urgenceIgnoreeJusqua: -1,
    rng: rng.fork("decisions"),
  };
}

export function cleLieu(x: number, y: number): string {
  return `${x},${y}`;
}

export function ageAnnees(p: Personnage, joursParAnnee: number): number {
  return Math.floor(p.corps.ageJours / joursParAnnee);
}

/** Relation de `p` envers `id`, créée vierge si nécessaire. */
export function relationAvec(p: Personnage, id: string): Relation {
  let r = p.relations.get(id);
  if (r === undefined) {
    r = relationVierge(id);
    p.relations.set(id, r);
  }
  return r;
}

/**
 * Met à jour le stade de vie selon l'âge ; renvoie l'ancien stade si un
 * changement a eu lieu (sinon `null`). La capacité d'inventaire suit.
 */
export function mettreAJourStade(
  p: Personnage,
  joursParAnnee: number,
  ageAdulte: number,
  ageAncien: number,
): Stade | null {
  const nouveau = stadeDepuisAge(p.corps.ageJours, joursParAnnee, ageAdulte, ageAncien);
  if (nouveau === p.corps.stade) return null;
  const ancien = p.corps.stade;
  p.corps.stade = nouveau;
  const inv = p.corps.inventaire;
  (inv as { capacite: number }).capacite = capaciteInventaire(p.identite, nouveau);
  return ancien;
}
