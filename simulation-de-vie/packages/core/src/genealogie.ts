/** Généalogie (section 12) : arbre des filiations et des unions, exportable en JSON. */
import type { Personnage } from "./agents/personnage.js";

export interface NoeudGenealogie {
  readonly id: string;
  readonly prenom: string;
  readonly nomFamille: string;
  readonly sexe: "F" | "M";
  readonly naissance: number;
  readonly deces: number | null;
  readonly causeDeces: string | null;
  readonly parents: readonly [string, string] | null;
  readonly enfants: readonly string[];
  readonly partenaires: readonly string[];
  readonly generation: number;
}

export interface Genealogie {
  readonly personnes: readonly NoeudGenealogie[];
  readonly generations: number;
}

export function construireGenealogie(personnages: readonly Personnage[]): Genealogie {
  const parId = new Map(personnages.map((p) => [p.id, p] as const));
  const enfantsDe = new Map<string, string[]>();
  for (const p of personnages) {
    if (p.identite.parents === null) continue;
    for (const parent of p.identite.parents) {
      enfantsDe.set(parent, [...(enfantsDe.get(parent) ?? []), p.id]);
    }
  }
  const generationDe = new Map<string, number>();
  const generation = (id: string): number => {
    const connue = generationDe.get(id);
    if (connue !== undefined) return connue;
    const p = parId.get(id);
    const g =
      p?.identite.parents === null || p === undefined
        ? 0
        : 1 + Math.max(...p.identite.parents.map((x) => (parId.has(x) ? generation(x) : -1)));
    generationDe.set(id, g);
    return g;
  };
  const personnes = personnages.map((p): NoeudGenealogie => ({
    id: p.id,
    prenom: p.identite.prenom,
    nomFamille: p.identite.nomFamille,
    sexe: p.identite.sexe,
    naissance: p.identite.naissance,
    deces: p.tickDeces,
    causeDeces: p.causeDeces,
    parents: p.identite.parents,
    enfants: [...(enfantsDe.get(p.id) ?? [])],
    partenaires: [...p.relations.values()]
      .filter((r) => r.lien === "partenaire")
      .map((r) => r.cible),
    generation: generation(p.id),
  }));
  return { personnes, generations: 1 + Math.max(0, ...personnes.map((n) => n.generation)) };
}

/** Descendants vivants d'un personnage (enfants, petits-enfants…). */
export function descendantsVivants(personnages: readonly Personnage[], id: string): Personnage[] {
  const resultat: Personnage[] = [];
  const file = [id];
  while (file.length > 0) {
    const courant = file.shift();
    for (const p of personnages) {
      if (p.identite.parents?.includes(courant ?? "") ?? false) {
        if (p.vivant) resultat.push(p);
        file.push(p.id);
      }
    }
  }
  return resultat;
}
