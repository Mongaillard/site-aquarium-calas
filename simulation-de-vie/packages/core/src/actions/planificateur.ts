/** Planificateur : intention → suite d'actions atomiques (section 6, « Planification »). */
import {
  CADENCE_FRAPPE,
  RAYON_ASSAUT,
  RAYON_CHAMP,
  adversaireLePlusProche,
  batailleDe,
} from "../monde/bataille.js";
import { niveau } from "../agents/competences.js";
import {
  NOURRITURE,
  nourritureDisponible,
  placeLibre,
  possede,
  quantite,
  outilSatisfait,
  objet,
} from "../agents/inventaire.js";
import { estLieuEau } from "../agents/personnage.js";
import type { LieuConnu, Personnage } from "../agents/personnage.js";
import { PLANS_BATIMENT, materiauxManquants } from "../monde/batiments.js";
import type { Batiment, TypeBatiment } from "../monde/batiments.js";
import { INFO_BIOME } from "../monde/biomes.js";
import { Grille } from "../monde/grille.js";
import type { Position } from "../monde/grille.js";
import { RECETTES, REPARATIONS_MAX, inventionDeRecette } from "../monde/recettes.js";
import type { NomRecette, TypeObjet } from "../monde/recettes.js";
import type { Ressource } from "../monde/ressources.js";
import { porteeRecolte } from "../monde/ressources.js";
import {
  abriDisponible,
  autorise,
  batimentAReparer,
  batimentsAccessibles,
  chantierFamilial,
  eauAdjacente,
  estEau,
  feuAAlimenter,
  feuProche,
  portsDe,
  prochainBatimentNecessaire,
  RESERVE_BOIS_MAX,
  siteDuPortail,
  tuileEnceinteManquante,
} from "../monde.js";
import type { Monde } from "../monde.js";
import { grandEnfant } from "../agents/vie.js";
import { eviteLeLieu } from "../social/societe.js";
import { lieuEvite } from "../memoire/psyche.js";
import { partenaireDe } from "../social/couple.js";
import { relationAvec } from "../agents/personnage.js";
import { trouverChemin, trouverCheminVers } from "./chemin.js";
import { connait } from "../savoirs/lecons.js";
import { estIdTrouvaille } from "../savoirs/catalogue.js";
import type { IdTrouvaille, Savoir } from "../savoirs/catalogue.js";
import { recetteDeTrouvaille } from "../savoirs/grammaire.js";
import { cleLieu } from "../agents/personnage.js";
import { PROFILS } from "../monde/faune.js";
import { directionVoulue } from "../cerveau/conseil.js";
import { DISTANCE_MIGRATION } from "../monde.js";
import type { Troupeau } from "../monde/faune.js";
import type { Action, Intention } from "./types.js";

export type ResultatPlan =
  { readonly ok: true; readonly plan: Action[] } | { readonly ok: false; readonly raison: string };

const ESSAIS_MAX = 3;
const ok = (plan: Action[]): ResultatPlan => ({ ok: true, plan });
const echec = (raison: string): ResultatPlan => ({ ok: false, raison });

export function planifier(monde: Monde, p: Personnage, intention: Intention): ResultatPlan {
  switch (intention.type) {
    case "boire":
      return planifierBoire(monde, p);
    case "manger":
      return planifierManger(monde, p);
    case "recolter":
      return planifierRecolte(monde, p, intention.ressource, 1, false);
    case "dormir":
      return planifierDormir(monde, p);
    case "explorer":
      return planifierExploration(monde, p);
    case "attendre":
      return ok([{ type: "attendre", ticksRestants: intention.ticks }]);
    case "construire":
      return planifierConstruction(monde, p);
    case "fabriquer":
      return planifierFabrication(monde, p, intention.recette);
    case "defricher":
      return planifierDefrichage(monde, p, intention.cible);
    case "stocker":
      return planifierStockage(monde, p);
    case "parler":
      return planifierRencontre(monde, p, intention.cible, (cible) => ({
        type: "parler",
        cible: cible.id,
        ticksRestants: null,
      }));
    case "offrir":
      return planifierRencontre(monde, p, intention.cible, (cible) => ({
        type: "offrir",
        cible: cible.id,
        ressource: intention.ressource,
        quantite: Math.max(1, Math.min(2, quantite(p.corps.inventaire, intention.ressource) - 1)),
      }));
    case "demander":
      return planifierRencontre(monde, p, intention.cible, (cible) => ({
        type: "demander",
        cible: cible.id,
        ressource: intention.ressource,
        quantite: p.corps.stade === "enfant" ? 1 : 2,
      }));
    case "voler":
      return planifierVol(monde, p);
    case "courtiser":
      return planifierRencontre(monde, p, intention.cible, (cible) => ({
        type: "courtiser",
        cible: cible.id,
        ticksRestants: null,
      }));
    case "se_reproduire":
      return planifierReproduction(monde, p);
    case "suivre":
      return planifierSuivi(monde, intention.cible);
    case "se_rechauffer":
      return planifierRechauffement(monde, p);
    case "soigner":
      if (intention.cible === p.id) return ok([{ type: "soigner", cible: p.id, ticksRestants: 3 }]);
      return planifierRencontre(monde, p, intention.cible, (cible) => ({
        type: "soigner",
        cible: cible.id,
        ticksRestants: 3,
      }));
    case "se_reposer":
      return planifierRepos(monde, p);
    case "fuir":
      return planifierFuite(monde, p);
    case "defendre":
      return planifierRencontre(monde, p, intention.cible, (cible) => ({
        type: "defendre",
        cible: cible.id,
        ticksRestants: 12,
      }));
    case "veiller":
      return planifierVeille(monde, p);
    case "reparer":
      return planifierReparationOutil(monde, p, intention.objet);
    case "prier":
      return planifierPriere(monde, p);
    case "migrer":
      return marcherVers(monde, p, intention.cible, 1, "aucun chemin vers le nouveau village");
    case "combattre":
      return planifierCombat(monde, p, intention.bataille);
    case "se_recueillir": {
      const aller = allerPresDe(monde, p, intention.cible);
      const recueil: Action = { type: "se_recueillir", cible: intention.cible, ticksRestants: 3 };
      if (aller === null && Grille.distance(p.corps.position, intention.cible) > 1)
        return echec("la tombe est hors d'atteinte");
      return ok(aller ? [aller, recueil] : [recueil]);
    }
    case "abattre": {
      const bete = monde.betail.get(intention.bete);
      if (bete === undefined) return echec("plus de bête");
      const plan: Action[] = [];
      const aller = allerPresDe(monde, p, bete.position);
      if (aller) plan.push(aller);
      plan.push({ type: "abattre", bete: bete.id, ticksRestants: 3 });
      plan.push({ type: "manger", ressource: "gibier", ticksRestants: null });
      return ok(plan);
    }
  }
}

/** Prier : à l'autel s'il y en a un à vingt tuiles, sinon sur place. */
function planifierPriere(monde: Monde, p: Personnage): ResultatPlan {
  const pos = p.corps.position;
  let autel: Batiment | null = null;
  let distance = 20;
  for (const b of monde.batiments.values()) {
    if (b.type !== "autel" || b.etat !== "termine") continue;
    const d = Grille.distance(pos, b.position);
    if (d < distance) {
      distance = d;
      autel = b;
    }
  }
  if (autel === null) return ok([{ type: "prier", autel: null, ticksRestants: 3 }]);
  const priere: Action = { type: "prier", autel: autel.id, ticksRestants: 4 };
  if (Grille.distance(pos, autel.position) <= 1) return ok([priere]);
  const aller = allerPresDe(monde, p, autel.position);
  if (aller === null) return ok([{ type: "prier", autel: null, ticksRestants: 3 }]);
  return ok([aller, priere]);
}

/** Réparer un outil ébréché : il faut une bûche. */
function planifierReparationOutil(monde: Monde, p: Personnage, type: TypeObjet): ResultatPlan {
  const o = objet(p.corps.inventaire, type);
  if (o === null) return echec("plus d'outil à réparer");
  if ((o.reparations ?? 0) >= REPARATIONS_MAX) return echec("cet outil ne se répare plus");
  if (quantite(p.corps.inventaire, "bois") < 1)
    return planifierApprovisionnement(monde, p, { bois: 1 }, "la réparation");
  return ok([{ type: "reparer", objet: type, ticksRestants: 3 }]);
}

/** Fuir la meute : à l'abri (jusqu'à 40 tuiles), sinon près d'un feu, sinon vers les autres. */
function planifierFuite(monde: Monde, p: Personnage): ResultatPlan {
  const pos = p.corps.position;
  const attente: Action = { type: "attendre", ticksRestants: 24 };
  const abri = abriDisponible(monde, p);
  if (abri !== null && Grille.distance(pos, abri.position) <= 40) {
    if (pos.x === abri.position.x && pos.y === abri.position.y) return ok([attente]);
    const aller = allerSur(monde, p, abri.position);
    if (aller) return ok([aller, attente]);
  }
  if (feuProche(monde, pos) !== null) return ok([attente]);
  const feu = feuLePlusProche(monde, pos, 40);
  if (feu !== null) {
    const aller = allerPresDe(monde, p, feu.position);
    if (aller) return ok([aller, attente]);
  }
  // Ni abri ni feu : rejoindre l'adulte le plus proche.
  let proche: Personnage | null = null;
  let distance = Infinity;
  for (const a of monde.personnages) {
    if (!a.vivant || a.id === p.id || a.corps.stade === "enfant") continue;
    const d = Grille.distance(a.corps.position, pos);
    if (d < distance) {
      distance = d;
      proche = a;
    }
  }
  if (proche !== null) return ok([{ type: "suivre", cible: proche.id, ticksRestants: 24 }]);
  return echec("nulle part où fuir");
}

/** Veiller la nuit près du feu familial (ou du feu le plus proche). */
function planifierVeille(monde: Monde, p: Personnage): ResultatPlan {
  const pos = p.corps.position;
  const veille: Action = { type: "veiller", ticksRestants: 36 };
  const feuFamilial = batimentsAccessibles(monde, p, "feu_de_camp").find(
    (b) => b.etat === "termine" && b.allume,
  );
  const feu = feuFamilial ?? feuLePlusProche(monde, pos, 25);
  if (feu === null) return echec("aucun feu où veiller");
  if (Grille.distance(pos, feu.position) <= 1) return ok([veille]);
  const aller = allerPresDe(monde, p, feu.position);
  if (aller === null) return echec("feu inaccessible");
  return ok([aller, veille]);
}

/** Se reposer à l'abri (jusqu'à 80 tuiles), sinon près d'un feu, sinon sur place. */
function planifierRepos(monde: Monde, p: Personnage): ResultatPlan {
  const pos = p.corps.position;
  const repos: Action = { type: "se_reposer", ticksRestants: 36 };
  const abri = abriDisponible(monde, p);
  if (abri !== null && Grille.distance(pos, abri.position) <= 80) {
    if (pos.x === abri.position.x && pos.y === abri.position.y) return ok([repos]);
    const aller = allerSur(monde, p, abri.position);
    if (aller) return ok([aller, repos]);
  }
  const feu = feuLePlusProche(monde, pos, 25);
  if (feu !== null && feuProche(monde, pos) === null) {
    const aller = allerPresDe(monde, p, feu.position);
    if (aller) return ok([aller, repos]);
  }
  return ok([repos]);
}

/**
 * Se réchauffer là où le bilan thermique est le meilleur : un abri (surtout
 * avec un feu à côté) protège mieux qu'un feu en plein vent.
 */
function planifierRechauffement(monde: Monde, p: Personnage): ResultatPlan {
  const pos = p.corps.position;
  const attente: Action = { type: "se_rechauffer", ticksRestants: 36 };
  const abri = abriDisponible(monde, p);
  if (abri !== null && Grille.distance(pos, abri.position) <= 80) {
    if (pos.x === abri.position.x && pos.y === abri.position.y) return ok([attente]);
    const aller = allerSur(monde, p, abri.position);
    if (aller) return ok([aller, attente]);
  }
  if (feuProche(monde, pos) !== null) return ok([attente]);
  const feu = feuLePlusProche(monde, pos, 25);
  if (feu !== null) {
    const aller = allerPresDe(monde, p, feu.position);
    if (aller) return ok([aller, attente]);
  }
  // **[DÉCISION]** Ni abri ni feu à portée : on allume un feu là où l'on est (M43).
  // Un feu de camp coûte cinq bûches et trois tours de travail — le prix d'une nuit
  // dehors en hiver. Le plan échouait purement et simplement, et l'on gelait sur
  // place avec le bois sur le dos.
  if (
    p.corps.stade !== "enfant" &&
    quantite(p.corps.inventaire, "bois") >= (PLANS_BATIMENT.feu_de_camp.materiaux.bois ?? 5)
  ) {
    const surPlace = planifierFondation(monde, p, "feu_de_camp");
    if (surPlace.ok) return surPlace;
  }
  return echec("aucune source de chaleur connue");
}

/**
 * Meilleure nourriture que le personnage sait aller chercher : poisson (canne),
 * baies, et en dernier recours le gibier, qu'il faut encore attraper.
 */
export function meilleureNourritureConnue(p: Personnage): Ressource | null {
  const inv = p.corps.inventaire;
  let gibier = false;
  let poisson = false;
  let baies = false;
  for (const l of p.connaissance.values()) {
    if (l.quantiteVue < 1 || !outilSatisfait(inv, l.outilRequis)) continue;
    if (l.type === "gibier") gibier = true;
    else if (l.type === "poisson") poisson = true;
    else if (l.type === "baies") baies = true;
  }
  return poisson ? "poisson" : baies ? "baies" : gibier ? "gibier" : null;
}

/**
 * Reproduction (section 8.1) : les deux partenaires rejoignent l'abri. Le
 * partenaire, s'il est proche, disponible et consentant (attirance suffisante),
 * reçoit le plan de s'y rendre et d'y attendre.
 */
function planifierReproduction(monde: Monde, p: Personnage): ResultatPlan {
  const partenaire = partenaireDe(monde, p);
  if (partenaire === null) return echec("pas de partenaire");
  if (partenaire.corps.endormi) return echec(`${partenaire.identite.prenom} dort`);
  if (Grille.distance(p.corps.position, partenaire.corps.position) > 6)
    return echec(`${partenaire.identite.prenom} est loin`);
  const abri = abriDisponible(monde, p) ?? abriDisponible(monde, partenaire);
  if (abri === null) return echec("aucun abri disponible");
  if (relationAvec(partenaire, p.id).attirance < 40)
    return echec(`${partenaire.identite.prenom} n'en a pas envie`);
  for (const x of [p, partenaire]) {
    if (x.besoins.faim < 40 || x.besoins.soif < 40 || x.besoins.sommeil < 40)
      return echec("pas en état");
  }
  const allerPartenaire = allerSur(monde, partenaire, abri.position);
  partenaire.plan = allerPartenaire
    ? [allerPartenaire, { type: "attendre", ticksRestants: 8 }]
    : [{ type: "attendre", ticksRestants: 8 }];
  partenaire.actionEnCours = null;
  partenaire.intention = { type: "suivre", cible: p.id };
  const aller = allerSur(monde, p, abri.position);
  const plan: Action[] = aller ? [aller] : [];
  plan.push({ type: "attendre", ticksRestants: 1 });
  plan.push({ type: "se_reproduire", partenaire: partenaire.id, ticksRestants: null });
  return ok(plan);
}

function planifierSuivi(monde: Monde, cibleId: string): ResultatPlan {
  const cible = monde.personnages.find((x) => x.id === cibleId);
  if (!cible?.vivant) return echec("personne à suivre");
  return ok([{ type: "suivre", cible: cible.id, ticksRestants: 12 }]);
}

/** Rejoindre une personne (≤ 2 tuiles) puis agir avec elle. */
function planifierRencontre(
  monde: Monde,
  p: Personnage,
  cibleId: string,
  action: (cible: Personnage) => Action,
): ResultatPlan {
  const cible = monde.personnages.find((a) => a.id === cibleId);
  if (!cible?.vivant) return echec("personne introuvable");
  if (cible.corps.endormi) return echec(`${cible.identite.prenom} dort`);
  const plan: Action[] = [];
  if (Grille.distance(p.corps.position, cible.corps.position) > 2) {
    const aller = allerPresDe(monde, p, cible.corps.position);
    if (aller === null) return echec(`${cible.identite.prenom} est inaccessible`);
    plan.push(aller);
  }
  plan.push(action(cible));
  return ok(plan);
}

/** Stock d'autrui contenant de la nourriture, à moins de 15 tuiles. */
export function stockVolable(
  monde: Monde,
  p: Personnage,
): { batiment: Batiment; ressource: Ressource } | null {
  let meilleur: { batiment: Batiment; ressource: Ressource; distance: number } | null = null;
  for (const b of monde.batiments.values()) {
    if (b.etat !== "termine" || b.stock === null || autorise(monde, b, p)) continue;
    const ressource = nourritureDisponible(b.stock);
    if (ressource === null) continue;
    const distance = Grille.distance(p.corps.position, b.position);
    if (distance <= 15 && (meilleur === null || distance < meilleur.distance))
      meilleur = { batiment: b, ressource, distance };
  }
  return meilleur ? { batiment: meilleur.batiment, ressource: meilleur.ressource } : null;
}

function planifierVol(monde: Monde, p: Personnage): ResultatPlan {
  const cible = stockVolable(monde, p);
  if (cible === null) return echec("rien à voler à portée");
  const plan: Action[] = [];
  const aller = allerPresDe(monde, p, cible.batiment.position);
  if (aller) plan.push(aller);
  plan.push({
    type: "voler",
    batimentId: cible.batiment.id,
    ressource: cible.ressource,
    quantite: 2,
  });
  return ok(plan);
}

/** Déplacement vers une tuile à distance ≤ `portee` de `cible` (ou `null` si inaccessible). */
function allerPresDe(monde: Monde, p: Personnage, cible: Position, portee = 1): Action | null {
  const pos = p.corps.position;
  if (Grille.distance(pos, cible) <= portee) return null;
  const destination = destinationPourAtteindre(monde, pos, cible, portee);
  if (destination === null) return null;
  const chemin = trouverChemin(monde.grille, pos, destination, {
    traverseEau: possede(p.corps.inventaire, "pirogue"),
    ports: portsDe(monde),
  });
  if (chemin === null) return null;
  return { type: "deplacer", cible: destination, chemin, progression: 0 };
}

/**
 * Une longue marche : un chemin d'un coup si possible, sinon vingt tuiles dans la direction
 * (migration, M17 ; troupe en marche, M32).
 */
function marcherVers(
  monde: Monde,
  p: Personnage,
  cible: Position,
  portee: number,
  raison: string,
): ResultatPlan {
  const aller = allerPresDe(monde, p, cible, portee);
  if (aller !== null) return ok([aller]);
  const pos = p.corps.position;
  const dx = cible.x - pos.x;
  const dy = cible.y - pos.y;
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  if (d <= Math.max(2, portee)) return ok([{ type: "attendre", ticksRestants: 3 }]);
  const etape = {
    x: pos.x + Math.round((dx / d) * Math.min(20, d)),
    y: pos.y + Math.round((dy / d) * Math.min(20, d)),
  };
  const pas = allerPresDe(monde, p, etape);
  if (pas === null) return echec(raison);
  return ok([pas]);
}

/** Bataille (M32) : en marche, rejoindre le lieu ; au combat, l'adversaire le plus proche, puis frapper. */
function planifierCombat(monde: Monde, p: Personnage, id: string): ResultatPlan {
  const b = batailleDe(monde, id);
  if (b === undefined || b.phase === "finie") return echec("la bataille est finie");
  const pos = p.corps.position;
  if (b.phase === "marche") {
    if (Grille.distance(pos, b.lieu) <= RAYON_ASSAUT)
      return ok([{ type: "attendre", ticksRestants: 2 }]);
    return marcherVers(monde, p, b.lieu, RAYON_ASSAUT, "aucun chemin vers le village ennemi");
  }
  // Au combat : on rejoint le champ, on ne court pas après ceux qui l'ont quitté.
  if (Grille.distance(pos, b.lieu) > RAYON_CHAMP)
    return marcherVers(monde, p, b.lieu, RAYON_ASSAUT, "aucun chemin vers le champ de bataille");
  const cible = adversaireLePlusProche(monde, b, p.id, pos);
  if (cible === null) return ok([{ type: "attendre", ticksRestants: 2 }]);
  const frappe: Action = { type: "combattre", cible: cible.id, ticksRestants: CADENCE_FRAPPE };
  if (Grille.distance(pos, cible.position) <= 1) return ok([frappe]);
  const aller = allerPresDe(monde, p, cible.position, 1);
  if (aller === null) return ok([{ type: "attendre", ticksRestants: 2 }]);
  // Deux pas à la fois : l'adversaire bouge aussi, on ne le dépasse pas.
  const chemin = aller.type === "deplacer" ? aller.chemin : null;
  const etape = chemin?.[1];
  if (chemin !== null && etape !== undefined && chemin.length > 2)
    return ok([
      { type: "deplacer", cible: etape, chemin: chemin.slice(0, 2), progression: 0 },
      frappe,
    ]);
  return ok([aller, frappe]);
}

/** Déplacement exactement sur `cible`. */
function allerSur(monde: Monde, p: Personnage, cible: Position): Action | null {
  const pos = p.corps.position;
  if (pos.x === cible.x && pos.y === cible.y) return null;
  const chemin = trouverChemin(monde.grille, pos, cible, {
    traverseEau: possede(p.corps.inventaire, "pirogue"),
    ports: portsDe(monde),
  });
  if (chemin === null) return null;
  return { type: "deplacer", cible, chemin, progression: 0 };
}

/** Une tuile d'où l'on boit : au bord d'une eau qu'on connaît, ou d'un puits. */
function riveConnue(monde: Monde, p: Personnage, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const t = monde.grille.tuileOuNull(x + dx, y + dy);
      if (t === null || !estEau(monde, t.x, t.y)) continue;
      if (t.batiment !== null && PLANS_BATIMENT[t.batiment.type].sourceEau) return true;
      const l = p.connaissance.get(cleLieu(t.x, t.y));
      if (l !== undefined && estLieuEau(l)) return true;
    }
  return false;
}

function planifierBoire(monde: Monde, p: Personnage): ResultatPlan {
  const pos = p.corps.position;
  if (eauAdjacente(monde, pos)) return ok([{ type: "boire", cible: pos, ticksRestants: null }]);
  if (lieuxConnusTries(p, "eau").length === 0) return echec("aucun point d'eau connu");
  // Depuis M30, l'eau la plus proche à vol d'oiseau n'a pas toujours de rive de ce côté-ci (un
  // banc peu profond, un îlot, l'autre berge) : on cherche la rive atteignable la plus proche.
  const chemin = trouverCheminVers(monde.grille, pos, (x, y) => riveConnue(monde, p, x, y), {
    traverseEau: possede(p.corps.inventaire, "pirogue"),
    ports: portsDe(monde),
    maxNoeuds: 6_000,
  });
  const cible = chemin?.at(-1);
  if (chemin === null || cible === undefined) return echec("point d'eau inaccessible");
  return ok([
    { type: "deplacer", cible, chemin, progression: 0 },
    { type: "boire", cible, ticksRestants: null },
  ]);
}

/**
 * Un inventaire plein empêche de prendre quoi que ce soit dans un stock : on
 * y dépose d'abord ce qui encombre le plus (jamais de la nourriture).
 */
function faireDePlace(p: Personnage, b: Batiment): Action | null {
  const inv = p.corps.inventaire;
  if (placeLibre(inv) > 0 || b.stock === null || placeLibre(b.stock) <= 0) return null;
  const encombrant = (Object.entries(inv.ressources) as [Ressource, number][])
    .filter(([r, n]) => NOURRITURE[r] === undefined && n > 0)
    .sort((a, c) => c[1] - a[1])[0];
  if (encombrant === undefined) return null;
  return { type: "deposer", batimentId: b.id, ressource: encombrant[0], quantite: encombrant[1] };
}

function planifierManger(monde: Monde, p: Personnage): ResultatPlan {
  const ressource = nourritureDisponible(p.corps.inventaire);
  if (ressource !== null) return ok([{ type: "manger", ressource, ticksRestants: null }]);
  if (p.corps.stade === "enfant") {
    const stock = batimentsAccessibles(monde, p).find(
      (b) => b.etat === "termine" && b.stock !== null && nourritureDisponible(b.stock) !== null,
    );
    if (stock?.stock) {
      const dansStock = nourritureDisponible(stock.stock);
      if (dansStock !== null) {
        const plan: Action[] = [];
        const aller = allerPresDe(monde, p, stock.position);
        if (aller) plan.push(aller);
        const place = faireDePlace(p, stock);
        if (place) plan.push(place);
        plan.push({ type: "prendre", batimentId: stock.id, ressource: dansStock, quantite: 2 });
        plan.push({ type: "manger", ressource: dansStock, ticksRestants: null });
        return ok(plan);
      }
    }
    const parents = (p.identite.parents ?? [])
      .map((id) => monde.personnages.find((x) => x.id === id))
      .filter((x): x is Personnage => x?.vivant === true && !x.corps.endormi)
      .sort(
        (x, y) =>
          Grille.distance(p.corps.position, x.corps.position) -
          Grille.distance(p.corps.position, y.corps.position),
      );
    const parent =
      parents.find((x) => nourritureDisponible(x.corps.inventaire) !== null) ?? parents[0];
    const parentProche =
      parent !== undefined && Grille.distance(p.corps.position, parent.corps.position) <= 30
        ? parent
        : undefined;
    const ressource =
      parentProche === undefined ? null : nourritureDisponible(parentProche.corps.inventaire);
    if (parentProche !== undefined && ressource !== null) {
      return planifierRencontre(monde, p, parentProche.id, (cible) => ({
        type: "demander",
        cible: cible.id,
        ressource,
        quantite: 1,
      }));
    }
    // Un grand enfant (six ans) va cueillir des baies lui-même.
    if (grandEnfant(monde, p)) {
      const cueillette = planifierRecolte(monde, p, "baies", 2, true);
      if (cueillette.ok) return cueillette;
    }
    if (parentProche !== undefined)
      return echec(`${parentProche.identite.prenom} n'a rien à donner`);
    return echec("trop jeune pour récolter : il faut demander");
  }

  // Nourriture dans un stock familial proche ?
  for (const b of batimentsAccessibles(monde, p)) {
    if (b.etat !== "termine" || b.stock === null) continue;
    const dansStock = nourritureDisponible(b.stock);
    if (dansStock === null) continue;
    if (Grille.distance(p.corps.position, b.position) > 20) break;
    const plan: Action[] = [];
    const aller = allerPresDe(monde, p, b.position);
    if (aller) plan.push(aller);
    const place = faireDePlace(p, b);
    if (place) plan.push(place);
    plan.push({ type: "prendre", batimentId: b.id, ressource: dansStock, quantite: 3 });
    plan.push({ type: "manger", ressource: dansStock, ticksRestants: null });
    return ok(plan);
  }
  const nourriture = meilleureNourritureConnue(p) ?? "baies";
  return planifierRecolte(monde, p, nourriture, 1, true);
}

/**
 * Récolte de `ressource` : jusqu'à `repetitions` actions sur le gisement connu
 * le plus proche que l'on peut exploiter (outil possédé si requis).
 */
function planifierRecolte(
  monde: Monde,
  p: Personnage,
  ressource: Ressource,
  repetitions: number,
  puisManger: boolean,
): ResultatPlan {
  if (ressource === "gibier") return planifierChasse(monde, p, puisManger);
  const inv = p.corps.inventaire;
  const lieux = lieuxConnusTries(p, ressource).filter(
    (l) =>
      l.quantiteVue >= 1 &&
      outilSatisfait(inv, l.outilRequis) &&
      !eviteLeLieu(monde, p, l) &&
      !lieuEvite(p, l, monde.horloge.tick),
  );
  if (lieux.length === 0) return echec(`aucun gisement de ${ressource} exploitable connu`);
  const liberation = placeLibre(inv) <= 0 ? libererPlace(monde, p, [ressource]) : [];
  if (placeLibre(inv) <= 0 && liberation.length === 0) return echec("inventaire plein");
  const placeLiberee = liberation.reduce(
    (t, a) => t + (a.type === "jeter" || a.type === "deposer" ? a.quantite : 0),
    0,
  );
  const portee = porteeRecolte(ressource);
  let essais = 0;
  for (const lieu of lieux) {
    // Un gisement sans terre à portée (du poisson au large) ne vaut pas un chemin.
    if (destinationPourAtteindre(monde, p.corps.position, lieu, portee) === null) continue;
    if (++essais > ESSAIS_MAX) break;
    const plan: Action[] = [...liberation];
    const aller = allerPresDe(monde, p, lieu, portee);
    if (aller === null && Grille.distance(p.corps.position, lieu) > portee) continue;
    if (aller) plan.push(aller);
    const parAction = 1 + Math.floor(niveau(p.experience.recolte) / 2);
    const place = Math.max(1, placeLibre(inv) + placeLiberee);
    const n = Math.max(
      1,
      Math.min(repetitions, Math.floor(lieu.quantiteVue / parAction), Math.ceil(place / parAction)),
    );
    for (let i = 0; i < n; i++)
      plan.push({ type: "recolter", cible: { x: lieu.x, y: lieu.y }, ticksRestants: null });
    if (puisManger) plan.push({ type: "manger", ressource, ticksRestants: null });
    return ok(plan);
  }
  return echec(`gisement de ${ressource} inaccessible`);
}

/**
 * Chasse : on rejoint le troupeau vu en dernier (les lieux de gibier sont les
 * positions où l'on a aperçu des bêtes), à portée de lance ou d'arc. Un
 * troupeau qui n'est plus près de l'endroit noté est oublié.
 */
function planifierChasse(monde: Monde, p: Personnage, puisManger: boolean): ResultatPlan {
  const inv = p.corps.inventaire;
  if (!outilSatisfait(inv, "lance")) return echec("il faut une lance, un arc ou un piège");
  const liberation = placeLibre(inv) <= 0 ? libererPlace(monde, p, ["gibier"]) : [];
  if (placeLibre(inv) <= 0 && liberation.length === 0) return echec("inventaire plein");
  const portee = possede(inv, "arc") ? 5 : 2;
  const lieux = lieuxConnusTries(p, "gibier");
  if (lieux.length === 0) return echec("aucun gibier connu");
  // Les troupeaux encore près de l'endroit noté, les plus rentables d'abord
  // (viande par bête, proximité, méfiance) ; les autres sont oubliés.
  const candidats = new Map<string, { troupeau: Troupeau; score: number }>();
  for (const lieu of lieux) {
    let troupeau: Troupeau | null = null;
    let distance = Infinity;
    for (const t of monde.troupeaux.values()) {
      if (t.taille <= 0 || PROFILS[t.espece].predateur) continue;
      const d = Grille.distance(t.position, lieu);
      if (d <= 10 && d < distance) {
        distance = d;
        troupeau = t;
      }
    }
    if (troupeau === null) {
      p.connaissance.delete(cleLieu(lieu.x, lieu.y));
      continue;
    }
    const d = Grille.distance(p.corps.position, troupeau.position);
    const score =
      (PROFILS[troupeau.espece].viande + PROFILS[troupeau.espece].cuir) / (1 + d / 8) -
      troupeau.mefiance * 2;
    const deja = candidats.get(troupeau.id);
    if (deja === undefined || deja.score < score) candidats.set(troupeau.id, { troupeau, score });
  }
  const tries = [...candidats.values()].sort((a, b) => b.score - a.score);
  for (const { troupeau } of tries.slice(0, ESSAIS_MAX)) {
    const plan: Action[] = [...liberation];
    if (Grille.distance(p.corps.position, troupeau.position) > portee) {
      const aller = allerPresDe(monde, p, troupeau.position);
      if (aller === null) continue;
      // On s'arrête dès qu'on est à portée : inutile d'aller coller le troupeau.
      if (aller.type === "deplacer" && aller.chemin !== null) {
        const chemin = aller.chemin;
        while (chemin.length > 1) {
          const avantDernier = chemin[chemin.length - 2];
          if (
            avantDernier === undefined ||
            Grille.distance(avantDernier, troupeau.position) > portee
          )
            break;
          chemin.pop();
        }
        const dernier = chemin[chemin.length - 1];
        plan.push(dernier === undefined ? aller : { ...aller, cible: dernier, chemin });
      } else {
        plan.push(aller);
      }
    }
    plan.push({ type: "chasser", troupeau: troupeau.id, ticksRestants: 2 });
    if (puisManger) plan.push({ type: "manger", ressource: "gibier", ticksRestants: null });
    return ok(plan);
  }
  return echec("le gibier est hors d'atteinte");
}

/** Dormir : à l'abri si possible, sinon près d'un feu, sinon sur place. */
function planifierDormir(monde: Monde, p: Personnage): ResultatPlan {
  const abri = abriDisponible(monde, p);
  if (abri !== null) {
    const aller = allerSur(monde, p, abri.position);
    return ok(
      aller ? [aller, { type: "dormir", ticksDormis: 0 }] : [{ type: "dormir", ticksDormis: 0 }],
    );
  }
  if (feuProche(monde, p.corps.position) === null) {
    const feu = feuLePlusProche(monde, p.corps.position, 12);
    if (feu !== null) {
      const aller = allerPresDe(monde, p, feu.position);
      if (aller) return ok([aller, { type: "dormir", ticksDormis: 0 }]);
    }
  }
  return ok([{ type: "dormir", ticksDormis: 0 }]);
}

function feuLePlusProche(monde: Monde, pos: Position, rayonMax: number): Batiment | null {
  let meilleur: Batiment | null = null;
  let dMin = Infinity;
  for (const b of monde.batiments.values()) {
    if (b.type !== "feu_de_camp" || b.etat !== "termine" || !b.allume) continue;
    const d = Grille.distance(pos, b.position);
    if (d <= rayonMax && d < dMin) {
      dMin = d;
      meilleur = b;
    }
  }
  return meilleur;
}

/** Au-delà de cette distance au foyer, l'exploration devient de moins en moins tentante. */
const RAYON_EXPLORATION = 36;

/** Cible d'exploration : direction dont le voisinage est le moins connu, à 8–14 tuiles, près du foyer. */
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
  // Le monde n'a pas de limite : on explore autour du foyer, pas à perte de vue.
  const foyer = batimentsAccessibles(monde, p)[0]?.position ?? { x: 0, y: 0 };
  // Une ambition d'exploration (conseil de Claude) : la direction voulue et ses deux
  // voisines seulement, et deux fois plus loin.
  const voulue = directionVoulue(p);
  const migre = p.ambition?.issue === "en_cours" && p.ambition.genre === "migrer";
  const rayonMax = voulue === null ? RAYON_EXPLORATION : RAYON_EXPLORATION * (migre ? 3 : 2);
  const candidats: { cible: Position; score: number }[] = [];
  for (const [dx, dy] of directions) {
    if (voulue !== null && dx * voulue[0] + dy * voulue[1] <= 0) continue;
    const distance = p.rng.entier(8, 14);
    const cible = { x: pos.x + dx * distance, y: pos.y + dy * distance };
    const tuile = monde.grille.tuileOuNull(cible.x, cible.y);
    if (tuile === null || !INFO_BIOME[tuile.biome].praticable || estEau(monde, cible.x, cible.y))
      continue;
    // Jamais au-delà du rayon d'exploration ; et de là-bas, on ne s'éloigne plus du foyer.
    const dCible = Grille.distance(cible, foyer);
    const dIci = Grille.distance(pos, foyer);
    if (dCible > rayonMax * 1.5) continue;
    if (dIci > rayonMax && dCible >= dIci) continue;
    let connus = 0;
    for (const l of p.connaissance.values()) if (Grille.distance(l, cible) <= 6) connus++;
    const eloignement = Math.max(0, dCible - rayonMax) / 2;
    candidats.push({ cible, score: -Math.min(connus, 10) - eloignement + p.rng.suivant() * 0.5 });
  }
  candidats.sort((a, b) => b.score - a.score);
  for (const c of candidats.slice(0, ESSAIS_MAX)) {
    const chemin = trouverChemin(monde.grille, pos, c.cible, {
      maxNoeuds: 4_000,
      traverseEau: possede(p.corps.inventaire, "pirogue"),
      ports: portsDe(monde),
    });
    if (chemin !== null && chemin.length > 0) {
      return ok([{ type: "deplacer", cible: c.cible, chemin, progression: 0 }]);
    }
  }
  // Repli : un pas au hasard sur une tuile praticable voisine.
  const voisins = monde.grille
    .voisins(pos.x, pos.y)
    .filter((t) => INFO_BIOME[t.biome].praticable && !estEau(monde, t.x, t.y));
  if (voisins.length === 0) return echec("aucune direction praticable");
  const v = p.rng.choisir(voisins);
  return ok([{ type: "deplacer", cible: { x: v.x, y: v.y }, chemin: null, progression: 0 }]);
}

/**
 * Construction (section 7.2) : rejoindre ou fonder un chantier, livrer ce que
 * l'on porte, aller chercher ce qui manque, puis travailler.
 */
function planifierConstruction(monde: Monde, p: Personnage): ResultatPlan {
  const inv = p.corps.inventaire;
  let chantier: Batiment | null = p.projet
    ? (monde.batiments.get(p.projet.batimentId) ?? null)
    : null;
  if (chantier === null || chantier.etat === "termine") {
    p.projet = null;
    const type = prochainBatimentNecessaire(monde, p);
    if (type === null) return planifierReparation(monde, p);
    if (type === "feu_de_camp") {
      const feu = feuAAlimenter(monde, p);
      if (feu !== null) return planifierRallumage(monde, p, feu);
    }
    chantier = chantierFamilial(monde, p, type);
    if (chantier === null) return planifierFondation(monde, p, type);
    p.projet = { batimentId: chantier.id };
  }

  const manquants = materiauxManquants(chantier);
  const aLivrer = (Object.keys(manquants) as Ressource[]).some((r) => quantite(inv, r) > 0);
  if (aLivrer || Object.keys(manquants).length === 0) {
    const plan: Action[] = [];
    const aller = allerPresDe(monde, p, chantier.position);
    if (aller) plan.push(aller);
    plan.push({ type: "construire", batimentId: chantier.id, ticksTravail: 0 });
    return ok(plan);
  }
  return planifierApprovisionnement(monde, p, manquants, `chantier ${chantier.type}`);
}

/** Rallumer ou alimenter un feu : on apporte de quoi remplir la réserve (au moins une bûche). */
function planifierRallumage(monde: Monde, p: Personnage, feu: Batiment): ResultatPlan {
  const besoin = Math.max(1, Math.min(12, RESERVE_BOIS_MAX - feu.reserveBois));
  // Un feu éteint qui a encore des bûches : on court le rallumer, le bois attendra.
  const rallumageSimple = !feu.allume && feu.reserveBois >= 1;
  if (!rallumageSimple && quantite(p.corps.inventaire, "bois") < 1)
    return planifierApprovisionnement(monde, p, { bois: besoin }, "le feu");
  const plan: Action[] = [];
  const aller = allerPresDe(monde, p, feu.position);
  if (aller) plan.push(aller);
  plan.push({ type: "construire", batimentId: feu.id, ticksTravail: 0 });
  return ok(plan);
}

/** Réparer le bâtiment familial le plus abîmé, s'il y en a un. */
function planifierReparation(monde: Monde, p: Personnage): ResultatPlan {
  const b = batimentAReparer(monde, p);
  if (b === null) return echec("rien à construire");
  const plan: Action[] = [];
  const aller = allerPresDe(monde, p, b.position);
  if (aller) plan.push(aller);
  plan.push({ type: "construire", batimentId: b.id, ticksTravail: 0 });
  return ok(plan);
}

/** Va chercher la ressource manquante la plus urgente (récolte ou fabrication). */
function planifierApprovisionnement(
  monde: Monde,
  p: Personnage,
  manquants: Partial<Record<Ressource, number>>,
  pourquoi: string,
): ResultatPlan {
  const inv = p.corps.inventaire;
  if (placeLibre(inv) <= 0) {
    const liberation = libererPlace(monde, p, Object.keys(manquants) as Ressource[]);
    if (liberation.length === 0) return echec(`inventaire plein pour ${pourquoi}`);
    return ok(liberation);
  }
  const ordre = (Object.entries(manquants) as [Ressource, number][]).sort((a, b) => b[1] - a[1]);
  let derniereRaison = `rien à approvisionner pour ${pourquoi}`;
  for (const [r, deficit] of ordre) {
    // Dans un stock familial ?
    for (const b of batimentsAccessibles(monde, p)) {
      if (b.etat !== "termine" || b.stock === null || quantite(b.stock, r) <= 0) continue;
      const plan: Action[] = [];
      const aller = allerPresDe(monde, p, b.position);
      if (aller) plan.push(aller);
      plan.push({
        type: "prendre",
        batimentId: b.id,
        ressource: r,
        quantite: Math.min(deficit, placeLibre(inv)),
      });
      return ok(plan);
    }
    // Récolte directe.
    const recolte = planifierRecolte(monde, p, r, Math.min(4, deficit), false);
    if (recolte.ok) return recolte;
    derniereRaison = recolte.raison;
    // Fabrication sans atelier (corde…).
    const nomRecette = (Object.keys(RECETTES) as NomRecette[]).find((n) => {
      const rec = RECETTES[n];
      return "ressource" in rec.produit && rec.produit.ressource === r && rec.atelier === null;
    });
    if (nomRecette !== undefined) {
      const fabrication = planifierFabrication(monde, p, nomRecette);
      if (fabrication.ok) return fabrication;
      derniereRaison = fabrication.raison;
    }
  }
  return echec(derniereRaison);
}

/**
 * Libère de la place dans un inventaire plein : dépôt dans un stock proche si
 * possible, sinon abandon de la ressource la plus encombrante hors nourriture
 * et hors ressources à garder. Renvoie les actions (vide si rien à faire).
 */
export function libererPlace(monde: Monde, p: Personnage, garder: readonly Ressource[]): Action[] {
  const inv = p.corps.inventaire;
  const candidats = (Object.entries(inv.ressources) as [Ressource, number][])
    .filter(([r]) => NOURRITURE[r] === undefined && !garder.includes(r))
    .sort((a, b) => b[1] - a[1]);
  const plusEncombrant = candidats[0];
  if (plusEncombrant === undefined) return [];
  const [ressource, n] = plusEncombrant;
  const quantiteALiberer = Math.max(3, Math.ceil(n / 2));
  const stock = batimentsAccessibles(monde, p).find(
    (b) =>
      b.etat === "termine" &&
      b.stock !== null &&
      placeLibre(b.stock) > 0 &&
      Grille.distance(p.corps.position, b.position) <= 10,
  );
  if (stock !== undefined) {
    const aller = allerPresDe(monde, p, stock.position);
    const depot: Action = {
      type: "deposer",
      batimentId: stock.id,
      ressource,
      quantite: quantiteALiberer,
    };
    return aller ? [aller, depot] : [depot];
  }
  return [{ type: "jeter", ressource, quantite: quantiteALiberer }];
}

/** Choix d'un site puis fondation du chantier. */
function planifierFondation(monde: Monde, p: Personnage, type: TypeBatiment): ResultatPlan {
  const site = choisirSite(monde, p, type);
  // Un gisement ou un marais sur le tracé du mur (M41) : on l'aménage, puis on bâtira.
  if (site !== null) {
    const t = monde.grille.tuileOuNull(site.x, site.y);
    if (t !== null && (t.gisement !== null || t.biome === "marais"))
      return planifierDefrichage(monde, p, site);
  }
  // Plus de place : on dégage une tuile qu'un gisement occupe (M39d).
  if (site === null) {
    const aDegager = siteADefricher(monde, p);
    if (aDegager !== null) return planifierDefrichage(monde, p, aDegager);
    return echec(`aucun site pour ${type}`);
  }
  const plan: Action[] = [];
  const aller = allerPresDe(monde, p, site);
  if (aller) plan.push(aller);
  plan.push({ type: "fonder", batimentType: type, cible: site });
  return ok(plan);
}

/**
 * Site de construction : tuile constructible libre, proche des bâtiments de la
 * famille (ou de soi), à moins de 8 tuiles d'un point d'eau connu si possible.
 */
export function choisirSite(monde: Monde, p: Personnage, type: TypeBatiment): Position | null {
  if (type === "palissade") return tuileEnceinteManquante(monde, p);
  if (type === "portail") return siteDuPortail(monde, p);
  if (type === "port") return sitePortuaire(monde, p);
  const acces = batimentsAccessibles(monde, p);
  // En migration, loin du vieux foyer, on bâtit là où l'on est.
  const a = p.ambition;
  const migre =
    a?.issue === "en_cours" &&
    a.genre === "migrer" &&
    a.origine !== undefined &&
    Grille.distance(p.corps.position, a.origine) >= DISTANCE_MIGRATION;
  const centre = migre ? p.corps.position : (acces[0]?.position ?? p.corps.position);
  const eaux = lieuxConnusTries(p, "eau");
  let meilleur: Position | null = null;
  let meilleurScore = Infinity;
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      const x = centre.x + dx;
      const y = centre.y + dy;
      const t = monde.grille.tuileOuNull(x, y);
      if (
        t === null ||
        !INFO_BIOME[t.biome].constructible ||
        t.batiment !== null ||
        t.gisement !== null
      )
        continue;
      if (estEau(monde, x, y)) continue;
      const pos = { x, y };
      // Ne pas coller les bâtiments les uns aux autres (sauf feu, qui doit être près des abris).
      let voisinBati = 0;
      for (const v of monde.grille.voisins(x, y)) if (v.batiment !== null) voisinBati++;
      const distEau =
        eaux.length > 0 ? Math.min(...eaux.slice(0, 5).map((e) => Grille.distance(pos, e))) : 8;
      // Un enclos veut de la place autour de lui : le parc doit tenir, clos.
      let libresAutour = 0;
      if (type === "enclos")
        for (const v of monde.grille.voisins(x, y))
          if (v.batiment === null && v.gisement === null && INFO_BIOME[v.biome].constructible)
            libresAutour++;
      const score =
        Grille.distance(centre, pos) +
        (type === "enclos" ? (8 - libresAutour) * 3 : 0) +
        Math.max(0, distEau - 8) * 2 +
        (type === "feu_de_camp" ? (voisinBati > 0 ? -1 : 1) : voisinBati * 1.5) +
        (Grille.distance(pos, p.corps.position) > 12 ? 5 : 0);
      if (score < meilleurScore && monde.grille.estPraticable(x, y)) {
        meilleurScore = score;
        meilleur = pos;
      }
    }
  }
  return meilleur;
}

/**
 * Site d'un port (M30) : de la terre constructible et libre au bord de l'eau, près des
 * bâtiments de la famille ; l'eau profonde à côté vaut mieux, c'est une vraie voie d'eau.
 */
export function sitePortuaire(monde: Monde, p: Personnage): Position | null {
  const centre = batimentsAccessibles(monde, p)[0]?.position ?? p.corps.position;
  let meilleur: Position | null = null;
  let meilleurScore = Infinity;
  for (let dy = -12; dy <= 12; dy++)
    for (let dx = -12; dx <= 12; dx++) {
      const x = centre.x + dx;
      const y = centre.y + dy;
      const t = monde.grille.tuileOuNull(x, y);
      if (
        t === null ||
        !INFO_BIOME[t.biome].constructible ||
        t.batiment !== null ||
        t.gisement !== null ||
        !monde.grille.estPraticable(x, y)
      )
        continue;
      let profonde = 0;
      let eau = 0;
      for (const v of monde.grille.voisins(x, y)) {
        if (v.biome === "eau_profonde") profonde++;
        else if (v.biome === "eau_peu_profonde" || v.biome === "gue") eau++;
      }
      if (profonde + eau === 0) continue;
      const score = Grille.distance(centre, { x, y }) + (profonde > 0 ? 0 : 3);
      if (score < meilleurScore) {
        meilleurScore = score;
        meilleur = { x, y };
      }
    }
  return meilleur;
}

/** Fabrication : réunir les ingrédients, rejoindre l'atelier si besoin, fabriquer. */
function planifierFabrication(
  monde: Monde,
  p: Personnage,
  nom: NomRecette | IdTrouvaille,
): ResultatPlan {
  // Une trouvaille de la grammaire (M38) porte sa propre recette.
  const trouvee = estIdTrouvaille(nom) ? monde.trouvailles.trouvailles.get(nom) : undefined;
  if (estIdTrouvaille(nom) && trouvee === undefined) return echec("cette idée n'existe pas");
  const recette =
    trouvee !== undefined ? recetteDeTrouvaille(trouvee) : RECETTES[nom as NomRecette];
  const inv = p.corps.inventaire;
  const requis: Savoir | undefined =
    trouvee !== undefined ? trouvee.id : inventionDeRecette(nom as NomRecette);
  if (requis !== undefined && !connait(p, requis)) return echec("je ne sais pas faire cela");
  if (niveau(p.experience[recette.competence]) < recette.niveauRequis) {
    return echec(`niveau ${recette.niveauRequis} requis en ${recette.competence}`);
  }
  const manquants: Partial<Record<Ressource, number>> = {};
  for (const [r, n] of Object.entries(recette.ingredients) as [Ressource, number][]) {
    const deficit = n - quantite(inv, r);
    if (deficit > 0) manquants[r] = deficit;
  }
  if (Object.keys(manquants).length > 0)
    return planifierApprovisionnement(monde, p, manquants, recette.nom);
  const plan: Action[] = [];
  if (recette.atelier !== null) {
    const atelier = atelierLePlusProche(monde, p.corps.position, recette.atelier);
    if (atelier === null) return echec(`aucun atelier ${recette.atelier} connu`);
    const aller = allerPresDe(monde, p, atelier.position);
    if (aller) plan.push(aller);
  }
  plan.push({ type: "fabriquer", recette: nom, ticksRestants: null });
  return ok(plan);
}

function atelierLePlusProche(
  monde: Monde,
  pos: Position,
  atelier: "feu" | "four" | "fumoir",
): Batiment | null {
  let meilleur: Batiment | null = null;
  let dMin = Infinity;
  for (const b of monde.batiments.values()) {
    if (b.etat !== "termine" || PLANS_BATIMENT[b.type].atelier !== atelier) continue;
    if (atelier === "feu" && !b.allume) continue;
    const d = Grille.distance(pos, b.position);
    if (d < dMin) {
      dMin = d;
      meilleur = b;
    }
  }
  return meilleur;
}

/** Stockage : déposer le surplus (tout sauf un peu de nourriture) dans le stock familial le plus proche. */
function planifierStockage(monde: Monde, p: Personnage): ResultatPlan {
  const inv = p.corps.inventaire;
  const stock = batimentsAccessibles(monde, p).find(
    (b) => b.etat === "termine" && b.stock !== null && placeLibre(b.stock) > 0,
  );
  if (stock === undefined) return echec("aucun stock accessible");
  const plan: Action[] = [];
  const aller = allerPresDe(monde, p, stock.position);
  if (aller) plan.push(aller);
  let depose = 0;
  for (const [r, n] of Object.entries(inv.ressources) as [Ressource, number][]) {
    // Un peu de nourriture, et la corde qu'on garde pour ramener une bête vivante.
    const garder = NOURRITURE[r] !== undefined ? 2 : r === "corde" ? 1 : 0;
    const surplus = n - garder;
    if (surplus > 0) {
      plan.push({ type: "deposer", batimentId: stock.id, ressource: r, quantite: surplus });
      depose += surplus;
    }
  }
  if (depose === 0) return echec("rien à stocker");
  return ok(plan);
}

/** Lieux connus d'un type, du plus proche au plus lointain (distance de Tchebychev). */
export function lieuxConnusTries(p: Personnage, type: Ressource): LieuConnu[] {
  const pos = p.corps.position;
  // Pour l'eau, une tuile d'eau compte même si l'on y a noté un banc de poisson (M42).
  const retenu = type === "eau" ? estLieuEau : (l: LieuConnu): boolean => l.type === type;
  return [...p.connaissance.values()]
    .filter(retenu)
    .sort(
      (a, b) =>
        Grille.distance(pos, a) - Grille.distance(pos, b) ||
        distanceCarree(pos, a) - distanceCarree(pos, b) ||
        a.y - b.y ||
        a.x - b.x,
    );
}

/**
 * Tuile praticable à distance ≤ `portee` du lieu, la plus proche du personnage.
 * Préfère la terre ferme à un gué.
 */
export function destinationPourAtteindre(
  monde: Monde,
  depuis: Position,
  lieu: Position,
  portee = 1,
): Position | null {
  let meilleure: Position | null = null;
  let meilleurScore = Infinity;
  for (let dy = -portee; dy <= portee; dy++) {
    for (let dx = -portee; dx <= portee; dx++) {
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

/** Dégager une tuile : on y va, puis on arrache ce qui l'occupe (M39d). */
function planifierDefrichage(monde: Monde, p: Personnage, cible: Position): ResultatPlan {
  const t = monde.grille.tuileOuNull(cible.x, cible.y);
  if (t === null) return echec("hors du monde");
  if (t.gisement === null && t.biome !== "marais") return echec("rien à dégager");
  if (t.gisement !== null && !outilSatisfait(p.corps.inventaire, t.gisement.outilRequis))
    return echec(`il faut ${t.gisement.outilRequis ?? "un outil"} pour dégager`);
  const plan: Action[] = [];
  const aller = allerPresDe(monde, p, cible);
  if (aller) plan.push(aller);
  plan.push({ type: "defricher", cible, ticksRestants: null });
  return ok(plan);
}

/**
 * La tuile à dégager quand il n'y a plus de place à bâtir (M39d) : la plus
 * proche du centre de la famille dont on peut arracher ce qui l'occupe.
 */
export function siteADefricher(monde: Monde, p: Personnage): Position | null {
  const acces = batimentsAccessibles(monde, p);
  const centre = acces[0]?.position ?? p.corps.position;
  let meilleure: Position | null = null;
  let score = Infinity;
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      const x = centre.x + dx;
      const y = centre.y + dy;
      const t = monde.grille.tuileOuNull(x, y);
      if (t?.gisement == null) continue;
      if (t.batiment !== null) continue;
      if (!INFO_BIOME[t.biome].constructible) continue;
      if (!outilSatisfait(p.corps.inventaire, t.gisement.outilRequis)) continue;
      // On ne rase pas un gisement encore riche : on prend le plus maigre, le plus proche.
      const s = Grille.distance(centre, { x, y }) + t.gisement.quantite * 0.35;
      if (s < score) {
        score = s;
        meilleure = { x, y };
      }
    }
  }
  return meilleure;
}
