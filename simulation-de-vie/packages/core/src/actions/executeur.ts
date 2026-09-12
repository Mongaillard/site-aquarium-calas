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
import { cleLieu, relationAvec } from "../agents/personnage.js";
import type { Personnage } from "../agents/personnage.js";
import { PLANS_BATIMENT, materiauxLivres, materiauxManquants } from "../monde/batiments.js";
import { INFO_BIOME } from "../monde/biomes.js";
import { Grille } from "../monde/grille.js";
import type { Position } from "../monde/grille.js";
import { EFFETS_METEO } from "../monde/meteo.js";
import { RECETTES, SOLIDITE_INITIALE } from "../monde/recettes.js";
import type { Ressource } from "../monde/ressources.js";
import { atelierAdjacent, autorise, eauAdjacente, feuProche } from "../monde.js";
import type { Monde } from "../monde.js";
import { composerDialogue, transcrire } from "../social/dialogue.js";
import { accepteDemande, effetsDon, effetsRefus, effetsVol } from "../social/echange.js";
import { ajusterRelation } from "../social/relations.js";
import { SEUILS_COUPLE, accepteCour, eligibles, gainAttirance, unir } from "../social/couple.js";
import { rayonVision } from "../cerveau/perception.js";
import { avancementGrossesse, peutConcevoir } from "../agents/vie.js";
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
  if (monde) {
    v *= EFFETS_METEO[monde.meteo].vitesse;
    if (p.corps.enceinte !== null && avancementGrossesse(monde, p) > 2 / 3) v *= 0.8;
  }
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
    case "parler":
      return tickParler(monde, p, action);
    case "offrir":
      return tickOffrir(monde, p, action);
    case "demander":
      return tickDemander(monde, p, action);
    case "voler":
      return tickVoler(monde, p, action);
    case "courtiser":
      return tickCourtiser(monde, p, action);
    case "se_reproduire":
      return tickSeReproduire(monde, p, action);
    case "suivre":
      return tickSuivre(monde, p, action);
    case "se_rechauffer": {
      const pos = p.corps.position;
      const ici = monde.grille.tuile(pos.x, pos.y).batiment;
      const abri = ici !== null && ici.etat === "termine" && PLANS_BATIMENT[ici.type].abri;
      if (!abri && feuProche(monde, pos) === null) return echec("pas de chaleur ici");
      action.ticksRestants -= 1;
      return p.besoins.chaleur >= 85 || action.ticksRestants <= 0 ? TERMINEE : ENCOURS;
    }
  }
}

function tickCourtiser(
  monde: Monde,
  p: Personnage,
  action: Extract<Action, { type: "courtiser" }>,
): Resultat {
  const poursuite = poursuivre(monde, p, action.cible, action);
  if (poursuite !== null) return poursuite;
  const cible = interlocuteur(monde, p, action.cible);
  if (typeof cible === "string") return echec(cible);
  if (!eligibles(monde, p, cible)) return echec(`${cible.identite.prenom} n'est pas libre`);
  action.ticksRestants ??= 3;
  action.ticksRestants -= 1;
  if (action.ticksRestants > 0) return ENCOURS;
  const tick = monde.horloge.tick;
  const accepte = accepteCour(p, cible);
  const ra = relationAvec(p, cible.id);
  const rb = relationAvec(cible, p.id);
  if (accepte) {
    ra.cours += 1;
    ajusterRelation(
      ra,
      p.identite.personnalite,
      cible.identite.personnalite,
      { affinite: 3, attirance: 10 },
      tick,
    );
    ajusterRelation(
      rb,
      cible.identite.personnalite,
      p.identite.personnalite,
      { affinite: 3, attirance: 10 },
      tick,
    );
    p.besoins.moral = clamp(p.besoins.moral + 5);
    cible.besoins.moral = clamp(cible.besoins.moral + 5);
  } else {
    ajusterRelation(
      ra,
      p.identite.personnalite,
      cible.identite.personnalite,
      { attirance: -5 },
      tick,
    );
    p.besoins.moral = clamp(p.besoins.moral - 4);
  }
  p.besoins.social = clamp(p.besoins.social + 15);
  cible.besoins.social = clamp(cible.besoins.social + 15);
  monde.emettre("cour", p, { cible: cible.id, accepte, cours: ra.cours }, accepte ? 4 : 3);
  if (
    accepte &&
    ra.cours >= SEUILS_COUPLE.coursPourUnion &&
    rb.attirance > SEUILS_COUPLE.attirance
  ) {
    unir(p, cible, tick);
    monde.emettre(
      "union",
      p,
      { cible: cible.id, prenoms: `${p.identite.prenom} & ${cible.identite.prenom}` },
      8,
    );
  }
  return accepte ? TERMINEE : echec(`${cible.identite.prenom} a décliné`);
}

function tickSeReproduire(
  monde: Monde,
  p: Personnage,
  action: Extract<Action, { type: "se_reproduire" }>,
): Resultat {
  const partenaire = monde.personnages.find((x) => x.id === action.partenaire);
  if (!partenaire?.vivant) return echec("partenaire absent");
  if (relationAvec(p, partenaire.id).lien !== "partenaire") return echec("pas de lien de couple");
  if (partenaire.corps.endormi) return echec(`${partenaire.identite.prenom} dort`);
  if (Grille.distance(p.corps.position, partenaire.corps.position) > 1)
    return echec(`${partenaire.identite.prenom} n'est pas là`);
  const b = monde.grille.tuile(p.corps.position.x, p.corps.position.y).batiment;
  if (b?.etat !== "termine" || !PLANS_BATIMENT[b.type].abri) return echec("pas à l'abri");
  if (!autorise(monde, b, p) && !autorise(monde, b, partenaire))
    return echec("cet abri n'est pas le nôtre");
  const mere = p.identite.sexe === "F" ? p : partenaire;
  const pere = mere === p ? partenaire : p;
  if (mere.corps.stade !== "adulte" || pere.corps.stade !== "adulte") return echec("pas en âge");
  if (mere.corps.enceinte !== null) return echec(`${mere.identite.prenom} attend déjà un enfant`);
  if (!peutConcevoir(monde, mere)) return echec("pas le moment d'avoir un enfant");
  for (const x of [p, partenaire]) {
    if (x.besoins.faim < 40 || x.besoins.soif < 40 || x.besoins.sommeil < 40)
      return echec("pas en état");
  }
  action.ticksRestants ??= 2;
  action.ticksRestants -= 1;
  if (action.ticksRestants > 0) return ENCOURS;
  partenaire.corps.position = { ...p.corps.position };
  const tick = monde.horloge.tick;
  ajusterRelation(
    relationAvec(p, partenaire.id),
    p.identite.personnalite,
    partenaire.identite.personnalite,
    { affinite: 3, attirance: 5 },
    tick,
  );
  ajusterRelation(
    relationAvec(partenaire, p.id),
    partenaire.identite.personnalite,
    p.identite.personnalite,
    { affinite: 3, attirance: 5 },
    tick,
  );
  p.besoins.moral = clamp(p.besoins.moral + 6);
  partenaire.besoins.moral = clamp(partenaire.besoins.moral + 6);
  let chance = monde.config.vie.probabiliteGrossesse;
  if (mere.besoins.faim < 50) chance *= 0.5;
  if (mere.corps.sante < 50) chance *= 0.5;
  if (mere.rng.chance(chance)) {
    mere.corps.enceinte = { depuisTick: tick, pere: pere.id };
    monde.emettre("grossesse", mere, { pere: pere.id }, 7, null);
  }
  return TERMINEE;
}

/** Suivre quelqu'un : un pas vers lui à chaque tick tant qu'il est à plus de 2 tuiles. */
function tickSuivre(
  monde: Monde,
  p: Personnage,
  action: Extract<Action, { type: "suivre" }>,
): Resultat {
  const cible = monde.personnages.find((x) => x.id === action.cible);
  if (!cible?.vivant) return echec("personne à suivre");
  action.ticksRestants -= 1;
  const pos = p.corps.position;
  if (Grille.distance(pos, cible.corps.position) > 2) {
    const dx = Math.sign(cible.corps.position.x - pos.x);
    const dy = Math.sign(cible.corps.position.y - pos.y);
    const essais: Position[] = [
      { x: pos.x + dx, y: pos.y + dy },
      { x: pos.x + dx, y: pos.y },
      { x: pos.x, y: pos.y + dy },
    ];
    for (const e of essais) {
      if ((e.x !== pos.x || e.y !== pos.y) && monde.grille.estPraticable(e.x, e.y)) {
        p.corps.position = e;
        break;
      }
    }
  }
  return action.ticksRestants <= 0 ? TERMINEE : ENCOURS;
}

/**
 * Si l'interlocuteur s'est éloigné (3 à 8 tuiles), fait un pas vers lui et
 * renvoie « en cours » ; au-delà de 10 pas de poursuite, abandonne.
 */
function poursuivre(
  monde: Monde,
  p: Personnage,
  cibleId: string,
  action: { poursuite?: number },
): Resultat | null {
  const cible = monde.personnages.find((x) => x.id === cibleId);
  if (!cible?.vivant) return null;
  const d = Grille.distance(p.corps.position, cible.corps.position);
  if (d <= 2) return null;
  if (d > 8) return echec(`${cible.identite.prenom} est trop loin`);
  action.poursuite = (action.poursuite ?? 0) + 1;
  if (action.poursuite > 10) return echec(`${cible.identite.prenom} s'est éloigné`);
  const pos = p.corps.position;
  const dx = Math.sign(cible.corps.position.x - pos.x);
  const dy = Math.sign(cible.corps.position.y - pos.y);
  for (const e of [
    { x: pos.x + dx, y: pos.y + dy },
    { x: pos.x + dx, y: pos.y },
    { x: pos.x, y: pos.y + dy },
  ]) {
    if ((e.x !== pos.x || e.y !== pos.y) && monde.grille.estPraticable(e.x, e.y)) {
      p.corps.position = e;
      break;
    }
  }
  return ENCOURS;
}

/** Interlocuteur vivant, éveillé, à ≤ 2 tuiles. */
function interlocuteur(monde: Monde, p: Personnage, id: string): Personnage | string {
  const cible = monde.personnages.find((a) => a.id === id);
  if (!cible?.vivant) return "interlocuteur absent";
  if (cible.corps.endormi) return `${cible.identite.prenom} dort`;
  if (Grille.distance(p.corps.position, cible.corps.position) > 2)
    return `${cible.identite.prenom} est trop loin`;
  return cible;
}

function tickParler(
  monde: Monde,
  p: Personnage,
  action: Extract<Action, { type: "parler" }>,
): Resultat {
  const poursuite = poursuivre(monde, p, action.cible, action);
  if (poursuite !== null) return poursuite;
  const cible = interlocuteur(monde, p, action.cible);
  if (typeof cible === "string") return echec(cible);
  action.ticksRestants ??= 2 + Math.min(2, Math.round(p.identite.personnalite.extraversion * 2));
  action.ticksRestants -= 1;
  if (action.ticksRestants > 0) return ENCOURS;

  const dialogue = composerDialogue(monde, p, cible);
  const tick = monde.horloge.tick;
  const informations: string[] = [];
  for (const effet of dialogue.effets) {
    const de = effet.de === p.id ? p : cible;
    const vers = effet.vers === p.id ? p : cible;
    switch (effet.type) {
      case "information": {
        const cle = cleLieu(effet.lieu.x, effet.lieu.y);
        if (!vers.connaissance.has(cle))
          vers.connaissance.set(cle, { ...effet.lieu, tickVu: tick });
        informations.push(`${effet.lieu.type}@${effet.lieu.x},${effet.lieu.y}→${vers.id}`);
        break;
      }
      case "relation":
        ajusterRelation(
          relationAvec(de, vers.id),
          de.identite.personnalite,
          vers.identite.personnalite,
          { affinite: effet.affinite, confiance: effet.confiance },
          tick,
        );
        break;
      case "invitation": {
        const b = monde.batiments.get(effet.batimentId);
        if (b && !b.autorises.includes(vers.id)) {
          b.autorises.push(vers.id);
          monde.emettre(
            "invitation",
            de,
            { cible: vers.id, batiment: b.id, type: b.type },
            4,
            b.position,
          );
        }
        break;
      }
      case "don": {
        const n = transferer(
          de.corps.inventaire,
          vers.corps.inventaire,
          effet.ressource,
          effet.quantite,
        );
        if (n > 0) {
          effetsDon(de, vers, n, tick);
          monde.emettre(
            "offre",
            de,
            { cible: vers.id, ressource: effet.ressource, quantite: n },
            3,
          );
        }
        break;
      }
    }
  }
  p.besoins.social = clamp(p.besoins.social + 25);
  cible.besoins.social = clamp(cible.besoins.social + 25);
  if (dialogue.sujet !== "dispute" && eligibles(monde, p, cible)) {
    for (const [x, y] of [
      [p, cible],
      [cible, p],
    ] as const) {
      const r = relationAvec(x, y.id);
      r.attirance = Math.min(100, r.attirance + gainAttirance(x, y));
      r.affinite = Math.min(100, r.affinite + 3);
    }
  }
  if (dialogue.sujet === "dispute") {
    p.besoins.moral = clamp(p.besoins.moral - 4);
    cible.besoins.moral = clamp(cible.besoins.moral - 4);
  } else {
    p.besoins.moral = clamp(p.besoins.moral + 2);
    cible.besoins.moral = clamp(cible.besoins.moral + 2);
  }
  gagnerExperience(p.experience, "persuasion", 1);
  const prenom = (id: string): string =>
    monde.personnages.find((a) => a.id === id)?.identite.prenom ?? id;
  monde.emettre(
    "dialogue",
    p,
    {
      avec: cible.id,
      sujet: dialogue.sujet,
      repliques: dialogue.repliques.length,
      informations: informations.join(" "),
      transcription: transcrire(dialogue, prenom),
    },
    dialogue.sujet === "dispute" ? 4 : dialogue.sujet === "salutations" ? 2 : 3,
  );
  return TERMINEE;
}

function tickOffrir(
  monde: Monde,
  p: Personnage,
  action: Extract<Action, { type: "offrir" }>,
): Resultat {
  const cible = interlocuteur(monde, p, action.cible);
  if (typeof cible === "string") return echec(cible);
  const n = transferer(
    p.corps.inventaire,
    cible.corps.inventaire,
    action.ressource,
    action.quantite,
  );
  if (n <= 0)
    return echec(
      placeLibre(cible.corps.inventaire) <= 0
        ? "son inventaire est plein"
        : `plus de ${action.ressource}`,
    );
  effetsDon(p, cible, n, monde.horloge.tick);
  p.besoins.moral = clamp(p.besoins.moral + 2);
  monde.emettre("offre", p, { cible: cible.id, ressource: action.ressource, quantite: n }, 3);
  return TERMINEE;
}

function tickDemander(
  monde: Monde,
  p: Personnage,
  action: Extract<Action, { type: "demander" }>,
): Resultat {
  const cible = interlocuteur(monde, p, action.cible);
  if (typeof cible === "string") return echec(cible);
  const tick = monde.horloge.tick;
  const accepte = accepteDemande(p, cible, action.ressource, action.quantite);
  let n = 0;
  if (accepte) {
    n = transferer(cible.corps.inventaire, p.corps.inventaire, action.ressource, action.quantite);
    if (n > 0) {
      effetsDon(cible, p, n, tick);
      gagnerExperience(p.experience, "persuasion", 2);
    }
  } else {
    effetsRefus(p, cible, tick);
  }
  monde.emettre(
    "demande",
    p,
    { cible: cible.id, ressource: action.ressource, quantite: n, accepte: accepte && n > 0 },
    accepte && n > 0 ? 3 : 2,
  );
  return accepte && n > 0 ? TERMINEE : echec(`${cible.identite.prenom} a refusé`);
}

function tickVoler(
  monde: Monde,
  p: Personnage,
  action: Extract<Action, { type: "voler" }>,
): Resultat {
  const b = monde.batiments.get(action.batimentId);
  if (b?.etat !== "termine" || b.stock === null) return echec("pas de stock ici");
  if (autorise(monde, b, p)) return echec("ce stock est le mien");
  if (Grille.distance(p.corps.position, b.position) > 1) return echec("stock trop loin");
  const n = transferer(b.stock, p.corps.inventaire, action.ressource, action.quantite);
  if (n <= 0) return echec("rien à voler");
  const temoins = effetsVol(monde, p, b, rayonVision(monde, monde.horloge.moment()));
  p.besoins.moral = clamp(p.besoins.moral - p.identite.personnalite.agreabilite * 10);
  monde.emettre(
    "vol",
    p,
    {
      batiment: b.id,
      famille: b.famille,
      ressource: action.ressource,
      quantite: n,
      temoins: temoins.length,
    },
    6,
    b.position,
  );
  return TERMINEE;
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
  if (!autorise(monde, b, p)) return { erreur: "accès refusé" } as const;
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
