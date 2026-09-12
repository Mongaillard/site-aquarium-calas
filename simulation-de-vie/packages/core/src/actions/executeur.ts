/** Exécution tick par tick des actions atomiques (section 6). */
import { clamp } from "../agents/besoins.js";
import { gagnerExperience, niveau } from "../agents/competences.js";
import { NOURRITURE, ajouter, placeLibre, quantite, retirer } from "../agents/inventaire.js";
import { cleLieu } from "../agents/personnage.js";
import type { Personnage } from "../agents/personnage.js";
import { INFO_BIOME } from "../monde/biomes.js";
import { Grille } from "../monde/grille.js";
import type { Position } from "../monde/grille.js";
import { eauAdjacente } from "../monde.js";
import type { Monde } from "../monde.js";
import { trouverChemin } from "./chemin.js";
import type { Action } from "./types.js";

export type Resultat =
  | { readonly statut: "encours" }
  | { readonly statut: "terminee" }
  | { readonly statut: "echec"; readonly raison: string };

const ENCOURS: Resultat = { statut: "encours" };
const TERMINEE: Resultat = { statut: "terminee" };
const echec = (raison: string): Resultat => ({ statut: "echec", raison });

/** Vitesse de déplacement (tuiles de coût 1 par tick). */
export function vitesse(p: Personnage): number {
  let v = 1;
  if (p.besoins.faim < 20 || p.besoins.soif < 20) v *= 0.7;
  if (p.corps.stade === "enfant") v *= 0.8;
  if (p.corps.stade === "ancien") v *= 0.85;
  return v;
}

export function executerTick(monde: Monde, p: Personnage, action: Action): Resultat {
  switch (action.type) {
    case "deplacer":
      return tickDeplacer(monde, p, action);
    case "recolter":
      return tickRecolter(monde, p, action);
    case "boire":
      return tickBoire(monde, p, action);
    case "manger":
      return tickManger(monde, p, action);
    case "dormir":
      return tickDormir(monde, p, action);
    case "attendre":
      action.ticksRestants -= 1;
      return action.ticksRestants <= 0 ? TERMINEE : ENCOURS;
  }
}

function tickDeplacer(
  monde: Monde,
  p: Personnage,
  action: Extract<Action, { type: "deplacer" }>,
): Resultat {
  const pos = p.corps.position;
  if (action.chemin === null) {
    action.chemin = trouverChemin(monde.grille, pos, action.cible);
    if (action.chemin === null) return echec("destination inaccessible");
  }
  if (action.chemin.length === 0) return TERMINEE;
  action.progression += vitesse(p);
  while (action.chemin.length > 0) {
    const suivante = action.chemin[0];
    if (suivante === undefined) break;
    if (!monde.grille.estPraticable(suivante.x, suivante.y)) return echec("chemin bloqué");
    const diag = suivante.x !== pos.x && suivante.y !== pos.y;
    const cout =
      INFO_BIOME[monde.grille.tuile(suivante.x, suivante.y).biome].coutDeplacement *
      (diag ? Math.SQRT2 : 1);
    if (action.progression < cout) break;
    action.progression -= cout;
    p.corps.position = { x: suivante.x, y: suivante.y };
    action.chemin.shift();
  }
  return action.chemin.length === 0 ? TERMINEE : ENCOURS;
}

function tickRecolter(
  monde: Monde,
  p: Personnage,
  action: Extract<Action, { type: "recolter" }>,
): Resultat {
  const tuile = monde.grille.tuileOuNull(action.cible.x, action.cible.y);
  const gisement = tuile?.gisement ?? null;
  if (gisement === null) {
    p.connaissance.delete(cleLieu(action.cible.x, action.cible.y));
    return echec("plus de gisement ici");
  }
  if (Grille.distance(p.corps.position, action.cible) > 1) return echec("gisement trop loin");
  if (gisement.outilRequis !== null) return echec(`outil requis : ${gisement.outilRequis}`);
  if (p.corps.stade === "enfant") return echec("trop jeune pour récolter");
  if (gisement.quantite < 1) return echec("gisement épuisé");
  if (placeLibre(p.corps.inventaire) <= 0) return echec("inventaire plein");

  const niv = niveau(p.experience.recolte);
  action.ticksRestants ??= Math.max(2, Math.round(6 - niv * 0.4));
  action.ticksRestants -= 1;
  if (action.ticksRestants > 0) return ENCOURS;

  const rendement = Math.min(
    Math.floor(gisement.quantite),
    1 + Math.floor(niv / 2),
    placeLibre(p.corps.inventaire),
  );
  const pris = ajouter(p.corps.inventaire, gisement.type, rendement);
  gisement.quantite -= pris;
  gagnerExperience(p.experience, "recolte", 2);
  const connu = p.connaissance.get(cleLieu(action.cible.x, action.cible.y));
  if (connu) connu.quantiteVue = gisement.quantite;
  monde.emettre("recolte", p, { ressource: gisement.type, quantite: pris }, 2, action.cible);
  if (gisement.quantite < 1) {
    monde.emettre("gisement_epuise", p, { ressource: gisement.type }, 3, action.cible);
    if (gisement.tauxRegen === 0 && tuile) tuile.gisement = null;
  }
  return TERMINEE;
}

function tickBoire(
  monde: Monde,
  p: Personnage,
  action: Extract<Action, { type: "boire" }>,
): Resultat {
  if (!eauAdjacente(monde, p.corps.position)) return echec("pas d'eau à portée");
  action.ticksRestants ??= 1;
  action.ticksRestants -= 1;
  if (action.ticksRestants > 0) return ENCOURS;
  p.besoins.soif = 100;
  return TERMINEE;
}

function tickManger(
  monde: Monde,
  p: Personnage,
  action: Extract<Action, { type: "manger" }>,
): Resultat {
  const valeur = NOURRITURE[action.ressource];
  if (valeur === undefined) return echec(`${action.ressource} n'est pas comestible`);
  if (quantite(p.corps.inventaire, action.ressource) <= 0)
    return echec(`plus de ${action.ressource}`);
  action.ticksRestants ??= 1;
  action.ticksRestants -= 1;
  if (action.ticksRestants > 0) return ENCOURS;
  let mange = 0;
  while (p.besoins.faim < 90 && retirer(p.corps.inventaire, action.ressource, 1) === 1) {
    p.besoins.faim = clamp(p.besoins.faim + valeur);
    mange++;
  }
  if (mange === 0) return echec("pas faim");
  p.besoins.moral = clamp(p.besoins.moral + 2);
  monde.emettre("repas", p, { ressource: action.ressource, quantite: mange }, 2);
  return TERMINEE;
}

function tickDormir(
  monde: Monde,
  p: Personnage,
  action: Extract<Action, { type: "dormir" }>,
): Resultat {
  if (!p.corps.endormi) {
    p.corps.endormi = true;
    monde.emettre("endormi", p, {}, 1);
  }
  action.ticksDormis += 1;
  const b = p.besoins;
  const reveil = b.sommeil >= 95 || b.soif < 8 || b.faim < 8 || action.ticksDormis >= 12 * 6;
  if (!reveil) return ENCOURS;
  p.corps.endormi = false;
  monde.emettre("reveil", p, { ticksDormis: action.ticksDormis }, 1);
  return TERMINEE;
}

export function positionEgale(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}
