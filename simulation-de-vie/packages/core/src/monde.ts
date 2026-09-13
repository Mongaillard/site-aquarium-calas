/**
 * Vue du monde partagée par les sous-systèmes (actions, cerveaux, planificateur)
 * sans dépendre de la classe `Simulation` (évite les imports circulaires).
 */
import type { Personnage } from "./agents/personnage.js";
import type { SimConfig } from "./config.js";
import type { Evenement, TypeEvenement } from "./evenements/journal.js";
import type { Batiment, TypeBatiment } from "./monde/batiments.js";
import { PLANS_BATIMENT } from "./monde/batiments.js";
import { INFO_BIOME } from "./monde/biomes.js";
import { Grille } from "./monde/grille.js";
import { SEUIL_SAVOIR } from "./savoirs/catalogue.js";
import type { Position } from "./monde/grille.js";
import type { Horloge } from "./monde/horloge.js";
import type { Meteo } from "./monde/meteo.js";
import type { Troupeau } from "./monde/faune.js";
import type { Bete } from "./monde/village.js";
import { betesDe, enclosDe } from "./monde/village.js";
import type { Rng } from "./rng.js";
import type { EtatSociete } from "./social/societe.js";
import type { EtatChronique } from "./memoire/legendes.js";
import type { EtatVillages } from "./monde/villages.js";

export interface Monde {
  readonly config: SimConfig;
  readonly grille: Grille;
  readonly horloge: Horloge;
  readonly rng: Rng;
  readonly personnages: readonly Personnage[];
  readonly batiments: ReadonlyMap<string, Batiment>;
  /** La faune : un objet par troupeau ou meute (jalon « la faune vit »). */
  readonly troupeaux: ReadonlyMap<string, Troupeau>;
  /** Le bétail : bêtes apprivoisées, par identifiant. */
  readonly betail: ReadonlyMap<string, Bete>;
  ajouterBete(bete: Bete): void;
  retirerBete(id: string): void;
  prochainIdBete(): string;
  readonly meteo: Meteo;
  emettre(
    type: TypeEvenement,
    acteur: Personnage | null,
    details?: Evenement["details"],
    importance?: number,
    position?: Position | null,
  ): void;
  /** Fonde un chantier sur une tuile libre ; renvoie le bâtiment créé. */
  fonderChantier(type: TypeBatiment, position: Position, fondateur: Personnage): Batiment;
  /** Retire un bâtiment du monde (effondrement). */
  detruireBatiment(id: string): void;
  /** Fait naître l'enfant d'un couple ; renvoie le nouveau personnage. */
  naitre(mere: Personnage, pere: Personnage): Personnage;
  /** Fait mourir un personnage (cause libre). */
  tuer(p: Personnage, cause: string): void;
  /** La société (jalon 13) : coutumes, griefs, tension, alliances, lieux interdits. */
  readonly societe: EtatSociete;
  /** La mémoire collective (jalon 14) : récits, légendes, noms de lieux, proverbes. */
  readonly chronique: EtatChronique;
  /** Les villages (jalon 15) : schismes, bandes, caravanes, diplomatie. */
  readonly villages: EtatVillages;
}

/**
 * Deux personnes sont apparentées si elles portent le même nom ou si un lien
 * familial (partenaire, parent, enfant, fratrie) les unit.
 */
export function apparentes(a: Personnage, b: Personnage): boolean {
  if (a.id === b.id) return true;
  if (a.identite.nomFamille === b.identite.nomFamille) return true;
  const lien = a.relations.get(b.id)?.lien;
  return lien === "partenaire" || lien === "parent" || lien === "enfant" || lien === "fratrie";
}

/** Vrai si la tuile est de l'eau (source de boisson). */
export function estEau(monde: Monde, x: number, y: number): boolean {
  const t = monde.grille.tuileOuNull(x, y);
  if (t === null) return false;
  if (t.biome === "eau_profonde" || t.biome === "eau_peu_profonde") return true;
  return (
    t.batiment !== null &&
    t.batiment.etat === "termine" &&
    PLANS_BATIMENT[t.batiment.type].sourceEau
  );
}

/** Vrai si une source d'eau est à distance ≤ 1 de la position. */
export function eauAdjacente(monde: Monde, pos: Position): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (estEau(monde, pos.x + dx, pos.y + dy)) return true;
    }
  }
  return false;
}

export function personnagesVivants(monde: Monde): Personnage[] {
  return monde.personnages.filter((p) => p.vivant);
}

/** Le personnage a-t-il le droit d'utiliser ce bâtiment ? (propriétaire, invité, famille, apparenté au propriétaire) */
export function autorise(monde: Monde, b: Batiment, p: Personnage): boolean {
  const jour = monde.horloge.moment().jourAbsolu;
  // Un banni n'a plus accès à rien, sinon aux tombes et aux chantiers communs.
  if (p.banni !== null && jour < p.banni.jusquaJour) return b.type === "tombe" || b.commun === true;
  if (b.commun === true) return true;
  if (b.proprietaire === p.id || b.autorises.includes(p.id) || b.famille === p.identite.nomFamille)
    return true;
  const s = monde.societe;
  // Les stocks ouverts par décision d'hiver, les abris des familles alliées par mariage.
  if (b.stock !== null && jour < s.stocksOuvertsJusquaJour) return true;
  if (PLANS_BATIMENT[b.type].abri) {
    const a = b.famille;
    const c = p.identite.nomFamille;
    if (s.alliances.includes(a < c ? `${a}|${c}` : `${c}|${a}`)) return true;
  }
  const proprietaire = monde.personnages.find((x) => x.id === b.proprietaire);
  return proprietaire !== undefined && apparentes(p, proprietaire);
}

export function batimentEn(monde: Monde, pos: Position): Batiment | null {
  return monde.grille.tuileOuNull(pos.x, pos.y)?.batiment ?? null;
}

/** Bâtiments (terminés ou non) auxquels le personnage a accès, triés par distance. */
export function batimentsAccessibles(monde: Monde, p: Personnage, type?: TypeBatiment): Batiment[] {
  const pos = p.corps.position;
  return [...monde.batiments.values()]
    .filter((b) => (type === undefined || b.type === type) && autorise(monde, b, p))
    .sort(
      (a, b) =>
        Grille.distance(pos, a.position) - Grille.distance(pos, b.position) ||
        a.id.localeCompare(b.id),
    );
}

/** Nombre d'adultes endormis sur la tuile d'un bâtiment (les enfants se serrent, ils ne comptent pas). */
export function dormeurs(monde: Monde, b: Batiment): number {
  let n = 0;
  for (const p of monde.personnages) {
    if (
      p.vivant &&
      p.corps.endormi &&
      p.corps.stade !== "enfant" &&
      p.corps.position.x === b.position.x &&
      p.corps.position.y === b.position.y
    )
      n++;
  }
  return n;
}

/** Abri terminé, accessible, avec une place libre, le plus proche. */
export function abriDisponible(monde: Monde, p: Personnage): Batiment | null {
  for (const b of batimentsAccessibles(monde, p)) {
    if (b.etat !== "termine" || !PLANS_BATIMENT[b.type].abri) continue;
    if (p.corps.stade === "enfant") return b;
    const surPlace =
      p.corps.position.x === b.position.x && p.corps.position.y === b.position.y && p.corps.endormi
        ? 1
        : 0;
    if (dormeurs(monde, b) - surPlace < PLANS_BATIMENT[b.type].capaciteDormeurs) return b;
  }
  return null;
}

/** Feu de camp allumé à portée de la position (rayon du plan), le plus proche. */
export function feuProche(monde: Monde, pos: Position): Batiment | null {
  let meilleur: Batiment | null = null;
  let distanceMin = Infinity;
  for (const b of monde.batiments.values()) {
    if (b.etat !== "termine" || !b.allume) continue;
    const plan = PLANS_BATIMENT[b.type];
    if (plan.atelier !== "feu") continue;
    const d = Grille.distance(pos, b.position);
    if (d <= plan.rayonChaleur && d < distanceMin) {
      distanceMin = d;
      meilleur = b;
    }
  }
  return meilleur;
}

/** Atelier (feu allumé ou four terminé) à distance ≤ 1. */
export function atelierAdjacent(
  monde: Monde,
  pos: Position,
  atelier: "feu" | "four" | "fumoir",
): Batiment | null {
  for (const b of monde.batiments.values()) {
    if (b.etat !== "termine" || PLANS_BATIMENT[b.type].atelier !== atelier) continue;
    if (atelier === "feu" && !b.allume) continue;
    if (Grille.distance(pos, b.position) <= 1) return b;
  }
  return null;
}

/** Membres vivants de la famille (même nom ou lien familial) d'un personnage, lui compris. */
export function membresFamille(monde: Monde, p: Personnage): Personnage[] {
  return monde.personnages.filter((a) => a.vivant && apparentes(p, a));
}

/**
 * Prochain bâtiment dont le personnage (et sa famille) a besoin, par priorité :
 * abris pour tous, puis un feu, puis un lieu de stockage, puis une maison.
 * Les chantiers en cours comptent comme capacité future.
 */
export function prochainBatimentNecessaire(monde: Monde, p: Personnage): TypeBatiment | null {
  if (p.corps.stade === "enfant") return null;
  const acces = batimentsAccessibles(monde, p);
  // Un conseil de Claude : le bâtiment voulu passe devant, s'il manque encore.
  const ambition = p.ambition;
  if (
    ambition !== null &&
    ambition.issue === "en_cours" &&
    ambition.genre === "batiment" &&
    ambition.cible in PLANS_BATIMENT &&
    !acces.some(
      (b) =>
        b.type === ambition.cible && b.termineAuTick !== null && b.termineAuTick >= ambition.depuis,
    ) &&
    (ambition.cible !== "palissade" || tuileEnceinteManquante(monde, p) !== null)
  )
    return ambition.cible as TypeBatiment;
  // Une migration conseillée : loin du foyer qu'on quitte, il faut d'abord un abri.
  if (
    ambition?.issue === "en_cours" &&
    ambition.genre === "migrer" &&
    ambition.origine !== undefined &&
    Grille.distance(p.corps.position, ambition.origine) >= DISTANCE_MIGRATION &&
    !acces.some(
      (b) =>
        PLANS_BATIMENT[b.type].abri &&
        Grille.distance(b.position, p.corps.position) <= DISTANCE_MIGRATION / 2,
    )
  )
    return "abri";
  const famille = membresFamille(monde, p).length;
  let capacite = 0;
  for (const b of acces) capacite += PLANS_BATIMENT[b.type].capaciteDormeurs;
  if (capacite < famille) return "abri";
  // Un feu éteint compte comme un feu à (r)allumer ; un feu à court de bois, à alimenter.
  if (!acces.some((b) => b.type === "feu_de_camp" && (b.etat === "chantier" || b.allume)))
    return "feu_de_camp";
  if (feuAAlimenter(monde, p) !== null) return "feu_de_camp";
  if (!acces.some((b) => PLANS_BATIMENT[b.type].capaciteStock > 0)) return "entrepot";
  if (
    (p.savoirs.get("puits_pres_du_village")?.force ?? 0) >= 0.6 &&
    ![...monde.batiments.values()].some((b) => b.type === "puits")
  )
    return "puits";
  if (famille >= 3 && !acces.some((b) => b.type === "maison")) return "maison";
  // Un chantier décidé par le village : on y contribue une fois la famille logée, nourrie et au sec.
  const commun = acces.find((b) => b.commun === true && b.etat === "chantier");
  if (commun !== undefined && p.besoins.faim >= 50 && p.besoins.chaleur >= 50) return commun.type;
  // Une famille qui croit bâtit un autel (un seul par village).
  const membres = membresFamille(monde, p);
  const foiMoyenne = membres.reduce((t, m) => t + m.foi, 0) / Math.max(1, membres.length);
  if (foiMoyenne >= 5 && ![...monde.batiments.values()].some((b) => b.type === "autel"))
    return "autel";
  // Le fumoir, une fois inventé, dès que le poisson s'entasse.
  if (
    (p.savoirs.get("fumoir")?.force ?? 0) >= SEUIL_SAVOIR &&
    !acces.some((b) => b.type === "fumoir") &&
    acces.some((b) => b.stock !== null && (b.stock.ressources.poisson ?? 0) >= 15)
  )
    return "fumoir";
  // Des bêtes et pas d'enclos : on en bâtit un.
  if (
    betesDe(monde, p.identite.nomFamille).length > 0 &&
    enclosDe(monde, p.identite.nomFamille) === null
  )
    return "enclos";
  // Des graines en main ou au stock à la belle saison : un champ.
  const saison = monde.horloge.moment().saison;
  if (
    (saison === "printemps" || saison === "ete") &&
    !acces.some((b) => b.type === "champ") &&
    grainesAccessibles(monde, p) >= 4
  )
    return "champ";
  // Des murs contre les loups : une enceinte de pieux autour de l'abri familial.
  if (
    (p.savoirs.get("murs_contre_les_loups")?.force ?? 0) >= SEUIL_SAVOIR &&
    tuileEnceinteManquante(monde, p) !== null
  )
    return "palissade";
  return null;
}

/** Graines en poche et dans les stocks familiaux. */
export function grainesAccessibles(monde: Monde, p: Personnage): number {
  let n = p.corps.inventaire.ressources.graines ?? 0;
  for (const b of batimentsAccessibles(monde, p))
    if (b.etat === "termine" && b.stock !== null) n += b.stock.ressources.graines ?? 0;
  return n;
}

/** Distance au vieux foyer à partir de laquelle une migration s'installe (nouvel abri). */
export const DISTANCE_MIGRATION = 16;

/** Rayon de l'enceinte de palissade autour de l'abri familial. */
export const RAYON_ENCEINTE = 3;

/**
 * Prochaine tuile de l'enceinte familiale qui manque encore : le carré de rayon
 * 3 autour du premier abri de la famille, sauf les tuiles déjà bâties et celles
 * que l'eau ou la montagne ferment d'elles-mêmes.
 */
export function tuileEnceinteManquante(monde: Monde, p: Personnage): Position | null {
  // Le plus ancien abri de la famille (une seule enceinte par famille, quel que soit qui bâtit).
  const abri = batimentsAccessibles(monde, p)
    .filter((b) => b.etat === "termine" && PLANS_BATIMENT[b.type].abri)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (abri === undefined) return null;
  const c = abri.position;
  let meilleure: Position | null = null;
  let distance = Infinity;
  for (let dy = -RAYON_ENCEINTE; dy <= RAYON_ENCEINTE; dy++) {
    for (let dx = -RAYON_ENCEINTE; dx <= RAYON_ENCEINTE; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== RAYON_ENCEINTE) continue;
      const x = c.x + dx;
      const y = c.y + dy;
      const t = monde.grille.tuileOuNull(x, y);
      if (t === null || !INFO_BIOME[t.biome].praticable) continue; // l'eau et la montagne ferment
      if (t.batiment !== null) continue; // déjà bâti (palissade ou autre)
      if (t.gisement !== null) continue; // un gisement ferme la tuile : on ne bâtit pas dessus
      if (!INFO_BIOME[t.biome].constructible) continue;
      const d = Grille.distance(p.corps.position, { x, y });
      if (d < distance) {
        distance = d;
        meilleure = { x, y };
      }
    }
  }
  return meilleure;
}

/** Chantier de ce type appartenant à la famille, s'il en existe un. */
export function chantierFamilial(monde: Monde, p: Personnage, type: TypeBatiment): Batiment | null {
  return batimentsAccessibles(monde, p, type).find((b) => b.etat === "chantier") ?? null;
}

/** Feu de camp familial terminé mais éteint, le plus proche. */
export function feuEteint(monde: Monde, p: Personnage): Batiment | null {
  return (
    batimentsAccessibles(monde, p, "feu_de_camp").find((b) => b.etat === "termine" && !b.allume) ??
    null
  );
}

/** Réserve de bûches d'un feu, au plus ; consommation par jour, et sous la neige. */
export const RESERVE_BOIS_MAX = 20;
/** Bûches par jour : à la belle saison le feu couve sans rien consommer, en saison froide il brûle. */
export const BUCHES_PAR_JOUR = 0;
export const BUCHES_PAR_JOUR_FROID = 1;
export const BUCHES_PAR_JOUR_NEIGE = 2;

/** Réserve en dessous de laquelle on va chercher du bois pour le feu (plus tôt en saison froide). */
export function seuilReserveBois(monde: Monde): number {
  const saison = monde.horloge.moment().saison;
  return saison === "automne" || saison === "hiver" ? 4 : 0;
}

/** Feu familial éteint, ou allumé mais à court de bûches, le plus proche. */
export function feuAAlimenter(monde: Monde, p: Personnage): Batiment | null {
  const seuil = seuilReserveBois(monde);
  return (
    batimentsAccessibles(monde, p, "feu_de_camp").find(
      (b) => b.etat === "termine" && (!b.allume || (seuil > 0 && b.reserveBois < seuil)),
    ) ?? null
  );
}

/** Bâtiment familial terminé dont la solidité est passée sous le seuil, le plus abîmé. */
export function batimentAReparer(monde: Monde, p: Personnage, seuil = 60): Batiment | null {
  let pire: Batiment | null = null;
  for (const b of batimentsAccessibles(monde, p)) {
    if (b.etat !== "termine" || b.solidite >= seuil) continue;
    if (pire === null || b.solidite < pire.solidite) pire = b;
  }
  return pire;
}
