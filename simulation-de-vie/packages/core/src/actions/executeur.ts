/** Exécution tick par tick des actions atomiques (section 6). */
import { clamp } from "../agents/besoins.js";
import { gagnerExperience, niveau } from "../agents/competences.js";
import {
  NOURRITURE,
  ajouter,
  ajouterObjet,
  placeLibre,
  possede,
  quantite,
  retirer,
  transferer,
  userObjet,
} from "../agents/inventaire.js";
import { cleLieu } from "../agents/personnage.js";
import type { Personnage } from "../agents/personnage.js";
import { PLANS_BATIMENT, materiauxLivres, materiauxManquants } from "../monde/batiments.js";
import { INFO_BIOME } from "../monde/biomes.js";
import { Grille } from "../monde/grille.js";
import type { Position } from "../monde/grille.js";
import { EFFETS_METEO } from "../monde/meteo.js";
import { RECETTES, SOLIDITE_INITIALE } from "../monde/recettes.js";
import type { Ressource } from "../monde/ressources.js";
import { atelierAdjacent, autorise, eauAdjacente } from "../monde.js";
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

/** Durée maximale d'une session de travail continue sur un chantier. */
const SESSION_TRAVAIL_MAX = 36;

/** Vitesse de déplacement (tuiles de coût 1 par tick). */
export function vitesse(p: Personnage, monde?: Monde): number {
  let v = 1;
  if (p.besoins.faim < 20 || p.besoins.soif < 20) v *= 0.7;
  if (p.corps.stade === "enfant") v *= 0.8;
  if (p.corps.stade === "ancien") v *= 0.85;
  if (monde) v *= EFFETS_METEO[monde.meteo].vitesse;
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
    case "fabriquer":
      return tickFabriquer(monde, p, action);
    case "fonder":
      return tickFonder(monde, p, action);
    case "construire":
      return tickConstruire(monde, p, action);
    case "deposer":
      return tickDeposer(monde, p, action);
    case "prendre":
      return tickPrendre(monde, p, action);
    case "jeter": {
      const n = retirer(p.corps.inventaire, action.ressource, action.quantite);
      if (n <= 0) return echec("rien à jeter");
      monde.emettre("jete", p, { ressource: action.ressource, quantite: n }, 1);
      return TERMINEE;
    }
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
  action.progression += vitesse(p, monde);
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
  const outil = gisement.outilRequis;
  if (outil !== null && !possede(p.corps.inventaire, outil))
    return echec(`outil requis : ${outil}`);
  if (p.corps.stade === "enfant") return echec("trop jeune pour récolter");
  if (gisement.quantite < 1) return echec("gisement épuisé");
  if (placeLibre(p.corps.inventaire) <= 0) return echec("inventaire plein");

  const niv = niveau(p.experience.recolte);
  action.ticksRestants ??= Math.max(2, Math.round(6 - niv * 0.4));
  action.ticksRestants -= 1;
  if (action.ticksRestants > 0) return ENCOURS;

  const parAction = (1 + Math.floor(niv / 2)) * (outil === "hache_pierre" ? 2 : 1);
  const rendement = Math.min(
    Math.floor(gisement.quantite),
    parAction,
    placeLibre(p.corps.inventaire),
  );
  const pris = ajouter(p.corps.inventaire, gisement.type, rendement);
  gisement.quantite -= pris;
  gagnerExperience(p.experience, "recolte", 2);
  if (outil !== null && userObjet(p.corps.inventaire, outil)) {
    monde.emettre("outil_casse", p, { outil }, 3);
  }
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
  p.besoins.moral = clamp(p.besoins.moral + (action.ressource === "repas_cuit" ? 6 : 2));
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

function tickFabriquer(
  monde: Monde,
  p: Personnage,
  action: Extract<Action, { type: "fabriquer" }>,
): Resultat {
  const recette = RECETTES[action.recette];
  if (p.corps.stade === "enfant") return echec("trop jeune pour fabriquer");
  const niv = niveau(p.experience[recette.competence]);
  if (niv < recette.niveauRequis)
    return echec(`niveau ${recette.niveauRequis} requis en ${recette.competence}`);
  for (const [r, n] of Object.entries(recette.ingredients) as [Ressource, number][]) {
    if (quantite(p.corps.inventaire, r) < n) return echec(`il manque ${r}`);
  }
  if (
    recette.atelier !== null &&
    atelierAdjacent(monde, p.corps.position, recette.atelier) === null
  ) {
    return echec(`atelier requis : ${recette.atelier}`);
  }
  action.ticksRestants ??= Math.max(
    1,
    Math.round(recette.duree * (1 - 0.05 * (niv - recette.niveauRequis))),
  );
  action.ticksRestants -= 1;
  if (action.ticksRestants > 0) return ENCOURS;

  for (const [r, n] of Object.entries(recette.ingredients) as [Ressource, number][]) {
    retirer(p.corps.inventaire, r, n);
  }
  if ("objet" in recette.produit) {
    const objet = {
      type: recette.produit.objet,
      solidite: SOLIDITE_INITIALE[recette.produit.objet],
    };
    if (!ajouterObjet(p.corps.inventaire, objet)) return echec("inventaire plein");
  } else {
    ajouter(p.corps.inventaire, recette.produit.ressource, recette.produit.quantite);
  }
  gagnerExperience(p.experience, recette.competence, 3);
  monde.emettre("fabrication", p, { recette: action.recette }, "objet" in recette.produit ? 5 : 2);
  return TERMINEE;
}

function tickFonder(
  monde: Monde,
  p: Personnage,
  action: Extract<Action, { type: "fonder" }>,
): Resultat {
  const tuile = monde.grille.tuileOuNull(action.cible.x, action.cible.y);
  if (tuile === null) return echec("hors du monde");
  if (Grille.distance(p.corps.position, action.cible) > 1) return echec("site trop loin");
  if (!INFO_BIOME[tuile.biome].constructible) return echec("terrain non constructible");
  if (tuile.batiment !== null) return echec("tuile déjà occupée");
  if (tuile.gisement !== null) return echec("un gisement occupe la tuile");
  if (p.corps.stade === "enfant") return echec("trop jeune pour construire");
  const b = monde.fonderChantier(action.batimentType, action.cible, p);
  p.projet = { batimentId: b.id };
  return TERMINEE;
}

function tickConstruire(
  monde: Monde,
  p: Personnage,
  action: Extract<Action, { type: "construire" }>,
): Resultat {
  const b = monde.batiments.get(action.batimentId);
  if (b === undefined) return echec("bâtiment disparu");
  if (Grille.distance(p.corps.position, b.position) > 1) return echec("chantier trop loin");
  if (p.corps.stade === "enfant") return echec("trop jeune pour construire");
  const plan = PLANS_BATIMENT[b.type];

  if (b.etat === "chantier") {
    // 1. Livrer ce que l'on porte.
    let livre = 0;
    for (const [r, manque] of Object.entries(materiauxManquants(b)) as [Ressource, number][]) {
      const n = Math.min(manque, quantite(p.corps.inventaire, r));
      if (n > 0) {
        retirer(p.corps.inventaire, r, n);
        b.livre[r] = (b.livre[r] ?? 0) + n;
        livre += n;
        monde.emettre("livraison", p, { batiment: b.id, ressource: r, quantite: n }, 1, b.position);
      }
    }
    if (!materiauxLivres(b)) return livre > 0 ? TERMINEE : echec("matériaux manquants");

    // 2. Travailler.
    const niv = niveau(p.experience.construction);
    b.travailRestant -= 1 + 0.1 * niv;
    action.ticksTravail += 1;
    gagnerExperience(p.experience, "construction", 1);
    if (b.travailRestant > 0)
      return action.ticksTravail >= SESSION_TRAVAIL_MAX ? TERMINEE : ENCOURS;

    b.etat = "termine";
    b.travailRestant = 0;
    b.termineAuTick = monde.horloge.tick;
    b.allume = plan.atelier === "feu";
    monde.emettre("batiment_termine", p, { batiment: b.id, type: b.type }, 7, b.position);
    for (const autre of monde.personnages) {
      if (autre.projet?.batimentId === b.id) autre.projet = null;
    }
    return TERMINEE;
  }

  // Bâtiment terminé : rallumer un feu ou réparer.
  if (plan.atelier === "feu" && !b.allume) {
    if (retirer(p.corps.inventaire, "bois", 1) < 1) return echec("il manque bois");
    b.allume = true;
    monde.emettre("feu_rallume", p, { batiment: b.id }, 2, b.position);
    return TERMINEE;
  }
  if (b.solidite < 100) {
    b.solidite = Math.min(100, b.solidite + 4);
    gagnerExperience(p.experience, "construction", 1);
    if (b.solidite < 100) return ENCOURS;
    monde.emettre("batiment_repare", p, { batiment: b.id, type: b.type }, 2, b.position);
    return TERMINEE;
  }
  return echec("rien à construire ici");
}

function stockAccessible(monde: Monde, p: Personnage, batimentId: string) {
  const b = monde.batiments.get(batimentId);
  if (b === undefined) return { erreur: "bâtiment disparu" } as const;
  if (b.etat !== "termine" || b.stock === null) return { erreur: "pas de stock ici" } as const;
  if (!autorise(b, p)) return { erreur: "accès refusé" } as const;
  if (Grille.distance(p.corps.position, b.position) > 1)
    return { erreur: "stock trop loin" } as const;
  return { b, stock: b.stock } as const;
}

function tickDeposer(
  monde: Monde,
  p: Personnage,
  action: Extract<Action, { type: "deposer" }>,
): Resultat {
  const acces = stockAccessible(monde, p, action.batimentId);
  if ("erreur" in acces) return echec(acces.erreur);
  const n = transferer(p.corps.inventaire, acces.stock, action.ressource, action.quantite);
  if (n <= 0) return echec("rien à déposer");
  monde.emettre(
    "depot",
    p,
    { batiment: acces.b.id, ressource: action.ressource, quantite: n },
    1,
    acces.b.position,
  );
  return TERMINEE;
}

function tickPrendre(
  monde: Monde,
  p: Personnage,
  action: Extract<Action, { type: "prendre" }>,
): Resultat {
  const acces = stockAccessible(monde, p, action.batimentId);
  if ("erreur" in acces) return echec(acces.erreur);
  const n = transferer(acces.stock, p.corps.inventaire, action.ressource, action.quantite);
  if (n <= 0) return echec("rien à prendre");
  monde.emettre(
    "retrait",
    p,
    { batiment: acces.b.id, ressource: action.ressource, quantite: n },
    1,
    acces.b.position,
  );
  return TERMINEE;
}

export function positionEgale(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}
