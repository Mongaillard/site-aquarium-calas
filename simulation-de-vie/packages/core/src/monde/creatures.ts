/**
 * Les créatures du ciel (M25, façon unités mythiques) : un gardien posté qui
 * repousse meutes et bandes, un fléau lâché qui rôde, ronge les gisements et
 * effraie. Chaque domaine a les siennes ; elles vivent vingt jours.
 */
import { DUREE_CREATURE_JOURS, FICHES_DOMAINE } from "@sdv/protocole";
import type { Domaine, GenreCreature } from "@sdv/protocole";
import type { Monde } from "../monde.js";
import type { Rng } from "../rng.js";
import type { EtatDanger } from "./danger.js";
import { INFO_BIOME } from "./biomes.js";
import { faireFuir } from "./faune.js";
import { Grille } from "./grille.js";
import type { Position } from "./grille.js";
import type { EtatVillages } from "./villages.js";

export interface Creature {
  readonly id: string;
  readonly genre: GenreCreature;
  readonly domaine: Domaine;
  position: Position;
  /** Là où on l'a posée : le gardien y reste, le fléau rôde autour. */
  readonly poste: Position;
  /** Jour absolu où elle s'en va. */
  readonly finJour: number;
  /** Ce qu'elle a repoussé ou ravagé (pour la chronique). */
  faits: number;
}

export interface MondeCreatures extends Monde {
  readonly danger: EtatDanger;
  readonly villages: EtatVillages;
}

/** Portée d'un gardien (meutes, bandes) et rayon d'errance et de nuisance d'un fléau. */
export const PORTEE_GARDIEN = 12;
export const ERRANCE_FLEAU = 6;
export const RAYON_FLEAU = 4;

export function creerCreature(
  id: string,
  genre: GenreCreature,
  domaine: Domaine,
  position: Position,
  jourAbsolu: number,
): Creature {
  return {
    id,
    genre,
    domaine,
    position: { ...position },
    poste: { ...position },
    finJour: jourAbsolu + DUREE_CREATURE_JOURS,
    faits: 0,
  };
}

export function ficheCreature(c: Creature): { nom: string; emoji: string } {
  const d = FICHES_DOMAINE[c.domaine];
  return c.genre === "gardien" ? d.gardien : d.fleau;
}

/** Chaque heure : le gardien veille, le fléau rôde. */
export function heureCreatures(
  monde: MondeCreatures,
  creatures: ReadonlyMap<string, Creature>,
  rng: Rng,
): void {
  for (const c of creatures.values()) {
    if (c.genre === "gardien") veiller(monde, c);
    else roder(monde, c, rng);
  }
}

function veiller(monde: MondeCreatures, c: Creature): void {
  const fiche = ficheCreature(c);
  // Les meutes en chasse à portée rebroussent chemin ; la menace en cours s'éteint.
  for (const t of monde.troupeaux.values()) {
    if (t.espece !== "loup" || Grille.distance(t.position, c.poste) > PORTEE_GARDIEN) continue;
    if (t.etat === "fuite") continue;
    faireFuir(t, c.poste, 1);
    t.proieHumaine = null;
    t.enMenace = false;
    if (monde.danger.menace?.meute === t.id) monde.danger.menace = null;
    c.faits += 1;
    monde.emettre(
      "divin",
      null,
      { pouvoir: "gardien_repousse", nom: fiche.nom, quoi: "meute", espece: t.espece },
      5,
      { ...t.position },
    );
  }
  // Les bandes qui approchent s'en retournent.
  for (const b of monde.villages.bandes) {
    if (b.etat === "parti" || Grille.distance(b.position, c.poste) > PORTEE_GARDIEN) continue;
    b.etat = "parti";
    c.faits += 1;
    monde.emettre(
      "divin",
      null,
      { pouvoir: "gardien_repousse", nom: fiche.nom, quoi: "bande", taille: b.taille },
      6,
      { ...b.position },
    );
  }
  // Les gens autour se sentent en sécurité.
  for (const p of monde.personnages) {
    if (!p.vivant || Grille.distance(p.corps.position, c.poste) > ERRANCE_FLEAU) continue;
    p.besoins.securite = Math.min(100, p.besoins.securite + 3);
  }
}

function roder(monde: MondeCreatures, c: Creature, rng: Rng): void {
  // Un pas au hasard autour du poste, sur une tuile praticable.
  for (let essai = 0; essai < 6; essai++) {
    const x = c.position.x + rng.entier(-2, 2);
    const y = c.position.y + rng.entier(-2, 2);
    if (Grille.distance({ x, y }, c.poste) > ERRANCE_FLEAU) continue;
    const t = monde.grille.tuileOuNull(x, y);
    if (t === null || !INFO_BIOME[t.biome].praticable) continue;
    c.position = { x, y };
    break;
  }
  // Les gisements alentour s'amenuisent, les bêtes fuient, les gens ont peur.
  for (let dy = -RAYON_FLEAU; dy <= RAYON_FLEAU; dy++)
    for (let dx = -RAYON_FLEAU; dx <= RAYON_FLEAU; dx++) {
      const t = monde.grille.tuileSiGeneree(c.position.x + dx, c.position.y + dy);
      if (t?.gisement && t.gisement.quantite > 0) {
        t.gisement.quantite = Math.max(
          0,
          t.gisement.quantite - Math.max(0.5, t.gisement.quantite * 0.08),
        );
        c.faits += 1;
      }
    }
  for (const t of monde.troupeaux.values()) {
    if (t.espece === "loup" || t.etat === "fuite") continue;
    if (Grille.distance(t.position, c.position) <= ERRANCE_FLEAU) faireFuir(t, c.position, 0.5);
  }
  for (const p of monde.personnages) {
    if (!p.vivant || Grille.distance(p.corps.position, c.position) > RAYON_FLEAU) continue;
    p.besoins.securite = Math.max(0, p.besoins.securite - 8);
    p.besoins.moral = Math.max(0, p.besoins.moral - 3);
  }
}

/** À l'aube : celles dont le temps est venu s'en vont ; renvoie les parties. */
export function jourCreatures(creatures: Map<string, Creature>, jourAbsolu: number): Creature[] {
  const parties: Creature[] = [];
  for (const c of [...creatures.values()])
    if (jourAbsolu >= c.finJour) {
      creatures.delete(c.id);
      parties.push(c);
    }
  return parties;
}
