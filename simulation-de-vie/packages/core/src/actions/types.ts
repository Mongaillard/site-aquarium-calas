/** Actions atomiques (section 6) et intentions (section 10). */
import type { TypeBatiment } from "../monde/batiments.js";
import type { Position } from "../monde/grille.js";
import type { NomRecette } from "../monde/recettes.js";
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
  | { readonly type: "jeter"; readonly ressource: Ressource; readonly quantite: number };

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
  | { readonly type: "stocker" };

export type TypeIntention = Intention["type"];

export function decrireIntention(i: Intention): string {
  switch (i.type) {
    case "recolter":
      return `recolter:${i.ressource}`;
    case "attendre":
      return `attendre:${i.ticks}`;
    case "fabriquer":
      return `fabriquer:${i.recette}`;
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
  }
}

export function memeIntention(a: Intention | null, b: Intention | null): boolean {
  if (a === null || b === null) return a === b;
  return decrireIntention(a) === decrireIntention(b);
}
