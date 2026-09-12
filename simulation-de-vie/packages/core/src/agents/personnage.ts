/** Personnage : identité + corps + besoins + état de décision. */
import type { Action, Intention } from "../actions/types.js";
import type { Position } from "../monde/grille.js";
import type { Outil, Ressource } from "../monde/ressources.js";
import type { Rng } from "../rng.js";
import { besoinsInitiaux } from "./besoins.js";
import type { Besoins } from "./besoins.js";
import { experienceInitiale } from "./competences.js";
import type { Experience } from "./competences.js";
import { phenotype } from "./genetique.js";
import { genererIdentite } from "./identite.js";
import type { Identite, OptionsIdentite } from "./identite.js";
import { creerInventaire } from "./inventaire.js";
import type { Inventaire } from "./inventaire.js";

export type Stade = "enfant" | "adolescent" | "adulte" | "ancien";

export interface Corps {
  sante: number;
  ageJours: number;
  stade: Stade;
  position: Position;
  inventaire: Inventaire;
  /** Vrai pendant l'action `dormir`. */
  endormi: boolean;
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
  dernierEchec: Echec | null;
  echecsConsecutifs: number;
  /** Flux de hasard propre (bruit de décision), dérivé de la graine du monde. */
  readonly rng: Rng;
}

export interface OptionsPersonnage extends OptionsIdentite {
  readonly position: Position;
  readonly ageJours: number;
  readonly joursParAnnee: number;
  readonly ageAdulte: number;
  readonly ageAncien: number;
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
    dernierEchec: null,
    echecsConsecutifs: 0,
    rng: rng.fork("decisions"),
  };
}

export function cleLieu(x: number, y: number): string {
  return `${x},${y}`;
}

export function ageAnnees(p: Personnage, joursParAnnee: number): number {
  return Math.floor(p.corps.ageJours / joursParAnnee);
}
