/** Planificateur : intention → suite d'actions atomiques (section 6, « Planification »). */
import { nourritureDisponible } from "../agents/inventaire.js";
import type { LieuConnu, Personnage } from "../agents/personnage.js";
import { INFO_BIOME } from "../monde/biomes.js";
import { Grille } from "../monde/grille.js";
import type { Position } from "../monde/grille.js";
import type { Ressource } from "../monde/ressources.js";
import { eauAdjacente, estEau } from "../monde.js";
import type { Monde } from "../monde.js";
import { trouverChemin } from "./chemin.js";
import type { Action, Intention } from "./types.js";

export type ResultatPlan =
  { readonly ok: true; readonly plan: Action[] } | { readonly ok: false; readonly raison: string };

const ESSAIS_MAX = 3;

export function planifier(monde: Monde, p: Personnage, intention: Intention): ResultatPlan {
  switch (intention.type) {
    case "boire":
      return planifierBoire(monde, p);
    case "manger":
      return planifierManger(monde, p);
    case "recolter":
      return planifierRecolte(monde, p, intention.ressource, false);
    case "dormir":
      return { ok: true, plan: [{ type: "dormir", ticksDormis: 0 }] };
    case "explorer":
      return planifierExploration(monde, p);
    case "attendre":
      return { ok: true, plan: [{ type: "attendre", ticksRestants: intention.ticks }] };
  }
}

function planifierBoire(monde: Monde, p: Personnage): ResultatPlan {
  const pos = p.corps.position;
  if (eauAdjacente(monde, pos))
    return { ok: true, plan: [{ type: "boire", cible: pos, ticksRestants: null }] };
  const lieux = lieuxConnusTries(p, "eau");
  if (lieux.length === 0) return { ok: false, raison: "aucun point d'eau connu" };
  for (const lieu of lieux.slice(0, ESSAIS_MAX)) {
    const destination = destinationPourAtteindre(monde, pos, lieu);
    if (destination === null) continue;
    const chemin = trouverChemin(monde.grille, pos, destination);
    if (chemin === null) continue;
    return {
      ok: true,
      plan: [
        { type: "deplacer", cible: destination, chemin, progression: 0 },
        { type: "boire", cible: destination, ticksRestants: null },
      ],
    };
  }
  return { ok: false, raison: "point d'eau inaccessible" };
}

function planifierManger(monde: Monde, p: Personnage): ResultatPlan {
  const ressource = nourritureDisponible(p.corps.inventaire);
  if (ressource !== null)
    return { ok: true, plan: [{ type: "manger", ressource, ticksRestants: null }] };
  return planifierRecolte(monde, p, "baies", true);
}

function planifierRecolte(
  monde: Monde,
  p: Personnage,
  ressource: Ressource,
  puisManger: boolean,
): ResultatPlan {
  const pos = p.corps.position;
  const lieux = lieuxConnusTries(p, ressource).filter((l) => l.quantiteVue >= 1);
  if (lieux.length === 0) return { ok: false, raison: `aucun gisement de ${ressource} connu` };
  for (const lieu of lieux.slice(0, ESSAIS_MAX)) {
    const destination = destinationPourAtteindre(monde, pos, lieu);
    if (destination === null) continue;
    const chemin = trouverChemin(monde.grille, pos, destination);
    if (chemin === null) continue;
    const plan: Action[] = [
      { type: "deplacer", cible: destination, chemin, progression: 0 },
      { type: "recolter", cible: { x: lieu.x, y: lieu.y }, ticksRestants: null },
    ];
    if (puisManger) plan.push({ type: "manger", ressource, ticksRestants: null });
    return { ok: true, plan };
  }
  return { ok: false, raison: `gisement de ${ressource} inaccessible` };
}

/** Cible d'exploration : direction dont le voisinage est le moins connu, à 8–14 tuiles. */
function planifierExploration(monde: Monde, p: Personnage): ResultatPlan {
  const pos = p.corps.position;
  const directions: (readonly [number, number])[] = [
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
  ];
  const candidats: { cible: Position; score: number }[] = [];
  for (const [dx, dy] of directions) {
    const distance = p.rng.entier(8, 14);
    const cible = { x: pos.x + dx * distance, y: pos.y + dy * distance };
    const tuile = monde.grille.tuileOuNull(cible.x, cible.y);
    if (tuile === null || !INFO_BIOME[tuile.biome].praticable || estEau(monde, cible.x, cible.y))
      continue;
    let connus = 0;
    for (const l of p.connaissance.values()) if (Grille.distance(l, cible) <= 6) connus++;
    candidats.push({ cible, score: -connus + p.rng.suivant() * 0.5 });
  }
  candidats.sort((a, b) => b.score - a.score);
  for (const c of candidats.slice(0, ESSAIS_MAX)) {
    const chemin = trouverChemin(monde.grille, pos, c.cible, { maxNoeuds: 4_000 });
    if (chemin !== null && chemin.length > 0) {
      return { ok: true, plan: [{ type: "deplacer", cible: c.cible, chemin, progression: 0 }] };
    }
  }
  // Repli : un pas au hasard sur une tuile praticable voisine.
  const voisins = monde.grille
    .voisins(pos.x, pos.y)
    .filter((t) => INFO_BIOME[t.biome].praticable && !estEau(monde, t.x, t.y));
  if (voisins.length === 0) return { ok: false, raison: "aucune direction praticable" };
  const v = p.rng.choisir(voisins);
  return {
    ok: true,
    plan: [{ type: "deplacer", cible: { x: v.x, y: v.y }, chemin: null, progression: 0 }],
  };
}

/** Lieux connus d'un type, du plus proche au plus lointain (distance de Tchebychev). */
export function lieuxConnusTries(p: Personnage, type: Ressource): LieuConnu[] {
  const pos = p.corps.position;
  return [...p.connaissance.values()]
    .filter((l) => l.type === type)
    .sort(
      (a, b) =>
        Grille.distance(pos, a) - Grille.distance(pos, b) ||
        distanceCarree(pos, a) - distanceCarree(pos, b) ||
        a.y - b.y ||
        a.x - b.x,
    );
}

/**
 * Tuile praticable à distance ≤ 1 du lieu, la plus proche du personnage.
 * Préfère la terre ferme à l'eau peu profonde.
 */
export function destinationPourAtteindre(
  monde: Monde,
  depuis: Position,
  lieu: Position,
): Position | null {
  let meilleure: Position | null = null;
  let meilleurScore = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = lieu.x + dx;
      const y = lieu.y + dy;
      if (!monde.grille.estPraticable(x, y)) continue;
      const score =
        Grille.distance(depuis, { x, y }) +
        (estEau(monde, x, y) ? 0.5 : 0) +
        distanceCarree(depuis, { x, y }) * 0.001;
      if (score < meilleurScore) {
        meilleurScore = score;
        meilleure = { x, y };
      }
    }
  }
  return meilleure;
}

function distanceCarree(a: Position, b: Position): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}
