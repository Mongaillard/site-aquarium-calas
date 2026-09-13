/** Actions atomiques (section 6) et intentions (section 10). */
import type { TypeBatiment } from "../monde/batiments.js";
import type { Position } from "../monde/grille.js";
import type { NomRecette, TypeObjet } from "../monde/recettes.js";
import type { Ressource } from "../monde/ressources.js";

export type Action =
  | {
      readonly type: "deplacer";
      readonly cible: Position;
      chemin: Position[] | null;
      progression: number;
    }
  | { readonly type: "recolter"; readonly cible: Position; ticksRestants: number | null }
  | { readonly type: "boire"; readonly cible: Position; ticksRestants: number | null }
  | { readonly type: "manger"; readonly ressource: Ressource; ticksRestants: number | null }
  | { readonly type: "dormir"; ticksDormis: number }
  | { readonly type: "attendre"; ticksRestants: number }
  | { readonly type: "fabriquer"; readonly recette: NomRecette; ticksRestants: number | null }
  | { readonly type: "fonder"; readonly batimentType: TypeBatiment; readonly cible: Position }
  | { readonly type: "construire"; readonly batimentId: string; ticksTravail: number }
  | {
      readonly type: "deposer";
      readonly batimentId: string;
      readonly ressource: Ressource;
      readonly quantite: number;
    }
  | {
      readonly type: "prendre";
      readonly batimentId: string;
      readonly ressource: Ressource;
      readonly quantite: number;
    }
  | { readonly type: "jeter"; readonly ressource: Ressource; readonly quantite: number }
  | {
      readonly type: "parler";
      readonly cible: string;
      ticksRestants: number | null;
      poursuite?: number;
    }
  | {
      readonly type: "offrir";
      readonly cible: string;
      readonly ressource: Ressource;
      readonly quantite: number;
    }
  | {
      readonly type: "demander";
      readonly cible: string;
      readonly ressource: Ressource;
      readonly quantite: number;
    }
  | {
      readonly type: "voler";
      readonly batimentId: string;
      readonly ressource: Ressource;
      readonly quantite: number;
    }
  | {
      readonly type: "courtiser";
      readonly cible: string;
      ticksRestants: number | null;
      poursuite?: number;
    }
  | { readonly type: "se_reproduire"; readonly partenaire: string; ticksRestants: number | null }
  | { readonly type: "suivre"; readonly cible: string; ticksRestants: number }
  | { readonly type: "se_rechauffer"; ticksRestants: number }
  | { readonly type: "soigner"; readonly cible: string; ticksRestants: number }
  /** Chasse d'un troupeau à portée (lance, arc ou piège). */
  | { readonly type: "chasser"; readonly troupeau: string; ticksRestants: number }
  /** Veille de nuit près du feu ; garde auprès de quelqu'un que la meute vise. */
  | { readonly type: "veiller"; ticksRestants: number }
  | { readonly type: "defendre"; readonly cible: string; ticksRestants: number }
  /** Réparer un outil ébréché avec une bûche. */
  | { readonly type: "reparer"; readonly objet: TypeObjet; ticksRestants: number }
  /** Abattre une bête du troupeau familial. */
  | { readonly type: "abattre"; readonly bete: string; ticksRestants: number }
  | { readonly type: "se_reposer"; ticksRestants: number }
  /** Prier le ciel, à l'autel s'il y en a un (une offrande de nourriture y est déposée). */
  | { readonly type: "prier"; readonly autel: string | null; ticksRestants: number }
  /** Se recueillir sur la tombe d'où vient une leçon. */
  | { readonly type: "se_recueillir"; readonly cible: Position; ticksRestants: number };

export type TypeAction = Action["type"];

export type Intention =
  | { readonly type: "boire" }
  | { readonly type: "manger" }
  | { readonly type: "dormir" }
  | { readonly type: "recolter"; readonly ressource: Ressource }
  | { readonly type: "explorer" }
  | { readonly type: "attendre"; readonly ticks: number }
  | { readonly type: "construire" }
  | { readonly type: "fabriquer"; readonly recette: NomRecette }
  | { readonly type: "stocker" }
  | { readonly type: "parler"; readonly cible: string }
  | { readonly type: "offrir"; readonly cible: string; readonly ressource: Ressource }
  | { readonly type: "demander"; readonly cible: string; readonly ressource: Ressource }
  | { readonly type: "voler" }
  | { readonly type: "courtiser"; readonly cible: string }
  | { readonly type: "se_reproduire" }
  | { readonly type: "suivre"; readonly cible: string }
  | { readonly type: "se_rechauffer" }
  | { readonly type: "soigner"; readonly cible: string }
  | { readonly type: "se_reposer" }
  /** Danger : se mettre à l'abri ou près du feu, défendre quelqu'un, veiller la nuit. */
  | { readonly type: "fuir" }
  | { readonly type: "defendre"; readonly cible: string }
  | { readonly type: "veiller" }
  | { readonly type: "reparer"; readonly objet: TypeObjet }
  | { readonly type: "abattre"; readonly bete: string }
  | { readonly type: "prier" }
  | { readonly type: "se_recueillir"; readonly cible: Position }
  /** Schisme : marcher vers le site du nouveau village (ambition `migrer` avec destination). */
  | { readonly type: "migrer"; readonly cible: Position };

export type TypeIntention = Intention["type"];

export function decrireIntention(i: Intention): string {
  switch (i.type) {
    case "recolter":
      return `recolter:${i.ressource}`;
    case "attendre":
      return `attendre:${i.ticks}`;
    case "fabriquer":
      return `fabriquer:${i.recette}`;
    case "parler":
      return `parler:${i.cible}`;
    case "offrir":
      return `offrir:${i.ressource}→${i.cible}`;
    case "demander":
      return `demander:${i.ressource}←${i.cible}`;
    case "courtiser":
      return `courtiser:${i.cible}`;
    case "suivre":
      return `suivre:${i.cible}`;
    case "soigner":
      return `soigner:${i.cible}`;
    case "defendre":
      return `defendre:${i.cible}`;
    case "reparer":
      return `reparer:${i.objet}`;
    case "abattre":
      return `abattre:${i.bete}`;
    default:
      return i.type;
  }
}

export function decrireAction(a: Action): string {
  switch (a.type) {
    case "deplacer":
      return `deplacer→(${a.cible.x},${a.cible.y})`;
    case "recolter":
      return `recolter@(${a.cible.x},${a.cible.y})`;
    case "boire":
      return `boire@(${a.cible.x},${a.cible.y})`;
    case "manger":
      return `manger:${a.ressource}`;
    case "dormir":
      return "dormir";
    case "attendre":
      return `attendre:${a.ticksRestants}`;
    case "fabriquer":
      return `fabriquer:${a.recette}`;
    case "fonder":
      return `fonder:${a.batimentType}@(${a.cible.x},${a.cible.y})`;
    case "construire":
      return `construire:${a.batimentId}`;
    case "deposer":
      return `deposer:${a.ressource}×${a.quantite}→${a.batimentId}`;
    case "prendre":
      return `prendre:${a.ressource}×${a.quantite}←${a.batimentId}`;
    case "jeter":
      return `jeter:${a.ressource}×${a.quantite}`;
    case "parler":
      return `parler:${a.cible}`;
    case "offrir":
      return `offrir:${a.ressource}×${a.quantite}→${a.cible}`;
    case "demander":
      return `demander:${a.ressource}×${a.quantite}←${a.cible}`;
    case "voler":
      return `voler:${a.ressource}×${a.quantite}←${a.batimentId}`;
    case "courtiser":
      return `courtiser:${a.cible}`;
    case "se_reproduire":
      return `se_reproduire:${a.partenaire}`;
    case "suivre":
      return `suivre:${a.cible}`;
    case "se_rechauffer":
      return `se_rechauffer:${a.ticksRestants}`;
    case "soigner":
      return `soigner:${a.cible}`;
    case "se_reposer":
      return `se_reposer:${a.ticksRestants}`;
    case "chasser":
      return `chasser:${a.troupeau}`;
    case "veiller":
      return `veiller:${a.ticksRestants}`;
    case "defendre":
      return `defendre:${a.cible}`;
    case "reparer":
      return `reparer:${a.objet}`;
    case "abattre":
      return `abattre:${a.bete}`;
    case "prier":
      return a.autel === null ? "prier" : `prier:${a.autel}`;
    case "se_recueillir":
      return `se_recueillir@(${a.cible.x},${a.cible.y})`;
  }
}

export function memeIntention(a: Intention | null, b: Intention | null): boolean {
  if (a === null || b === null) return a === b;
  return decrireIntention(a) === decrireIntention(b);
}
