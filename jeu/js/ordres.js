// ---------------------------------------------------------------------------
// Les ordres des joueurs, sous une forme qui se transmet.
//
// Une partie est une simulation à pas fixe et à graine (js/game.js) : deux
// appareils qui partent des mêmes options et appliquent les mêmes ordres aux
// mêmes pas obtiennent le même monde, à l'unité près. Jouer à plusieurs, c'est
// donc échanger des ORDRES, jamais des états — et un serveur qui fait foi n'a
// qu'à rejouer le journal pour vérifier une partie.
//
// Ce module fixe ce vocabulaire. Un ordre est un objet JSON : sa `place` (qui
// le donne), son `type`, et rien d'autre que des identifiants d'unités ou de
// bâtiments, des noms de types et des nombres. `executer(world, ordre)`
// l'applique après avoir vérifié que cette place a le droit de le donner : on
// ne commande que ses propres troupes, on ne forme que dans ses bâtiments.
//
// Qui tient une place est dit à la partie (World, option `places`) :
//   'local'      — le joueur de l'appareil. Aujourd'hui l'interface appelle
//                  directement les fonctions du monde que ce module appelle ;
//   'ordinateur' — animé par le monde lui-même, sans ordres ;
//   'distant'    — un joueur d'un autre appareil : personne ne joue pour lui
//                  ici, ses ordres arrivent par executer(), au pas convenu.
// Les trois façons de jouer à 2 contre 2 ne diffèrent que par ces places :
//   le joueur et un ordinateur contre deux ordinateurs
//                                  ['local', 'ordinateur', 'ordinateur', 'ordinateur'] ;
//   le joueur et un ami contre deux ordinateurs
//                                  ['local', 'distant', 'ordinateur', 'ordinateur'] ;
//   deux joueurs contre deux joueurs
//                                  ['local', 'distant', 'distant', 'distant'].
// Les règles (équipes, vue partagée, victoire, scores) ne regardent jamais qui
// tient une place : le jour où un serveur relaie les ordres, il ne reste qu'à
// faire passer ceux du joueur local par le réseau avant de les exécuter ici.
// ---------------------------------------------------------------------------

import { UNIT_TYPES, BUILDING_TYPES, TECHS, STANCES } from './config.js';

/** Les types d'ordre, et ce que chacun doit porter. */
export const ORDRES = {
  aller: 'unites, x, y [, agressif]',        // se déplacer — ou récolter, attaquer, bâtir : selon ce qui est sous le point
  former: 'batiment, troupe',                 // mettre une troupe en file
  batir: 'batiment (le type), tx, ty [, unites]',
  age: 'batiment',                            // passer à l'âge suivant
  recherche: 'batiment, tech',
  attitude: 'unites, attitude',
  ralliement: 'batiment, x, y',
  consigne: 'allie, consigne [, x, y]',       // par équipes : à un allié tenu par l'ordinateur
};

const fini = (v) => typeof v === 'number' && Number.isFinite(v);

/** Les entités vivantes que cette place possède, parmi ces identifiants. */
function lesSiennes(world, place, ids, sorte) {
  if (!Array.isArray(ids)) return [];
  const vues = new Set();
  const out = [];
  for (const id of ids) {
    const e = world.byId.get(id);
    if (!e || e.dead || e.playerIndex !== place || e.kind !== sorte || vues.has(id)) continue;
    vues.add(id);
    out.push(e);
  }
  return out;
}

/**
 * Applique un ordre au monde. Rend `{ ok: true }`, ou `{ ok: false, raison }`
 * quand il est mal formé ou que la place n'a pas le droit de le donner — le
 * monde n'est alors pas touché. Un ordre permis mais sans effet (plus assez de
 * ressources, emplacement pris entre-temps) est « ok » : c'est le monde qui
 * tranche, comme pour un toucher du joueur.
 */
export function executer(world, ordre) {
  const refus = (raison) => ({ ok: false, raison });
  if (!ordre || typeof ordre !== 'object') return refus('ordre illisible');
  const place = ordre.place;
  const joueur = world.players[place];
  if (!Number.isInteger(place) || !joueur) return refus('place inconnue');
  if (world.gameOver) return refus('partie finie');
  if (!Object.prototype.hasOwnProperty.call(ORDRES, ordre.type)) return refus('type inconnu');
  const batiment = () => {
    const b = world.byId.get(ordre.batiment);
    return b && !b.dead && b.kind === 'building' && b.playerIndex === place ? b : null;
  };

  switch (ordre.type) {
    case 'aller': {
      const unites = lesSiennes(world, place, ordre.unites, 'unit');
      if (!unites.length || !fini(ordre.x) || !fini(ordre.y)) return refus('rien à déplacer');
      world.commandUnits(unites, ordre.x, ordre.y, { aggressive: !!ordre.agressif });
      return { ok: true };
    }
    case 'former': {
      const b = batiment();
      if (!b || !UNIT_TYPES[ordre.troupe]) return refus('bâtiment ou troupe inconnus');
      world.trainUnit(b, ordre.troupe);
      return { ok: true };
    }
    case 'batir': {
      if (!BUILDING_TYPES[ordre.batiment] || !Number.isInteger(ordre.tx) || !Number.isInteger(ordre.ty)) return refus('chantier illisible');
      world.placeBuilding(place, ordre.batiment, ordre.tx, ordre.ty, lesSiennes(world, place, ordre.unites, 'unit'));
      return { ok: true };
    }
    case 'age': {
      const b = batiment();
      if (!b) return refus('bâtiment inconnu');
      world.advanceAge(b);
      return { ok: true };
    }
    case 'recherche': {
      const b = batiment();
      if (!b || !TECHS[ordre.tech]) return refus('bâtiment ou recherche inconnus');
      world.researchTech(b, ordre.tech);
      return { ok: true };
    }
    case 'attitude': {
      const unites = lesSiennes(world, place, ordre.unites, 'unit');
      if (!unites.length || !STANCES[ordre.attitude]) return refus('attitude inconnue');
      world.setStance(unites, ordre.attitude);
      return { ok: true };
    }
    case 'ralliement': {
      const b = batiment();
      if (!b || !fini(ordre.x) || !fini(ordre.y)) return refus('ralliement illisible');
      world.setRally(b, ordre.x, ordre.y);
      return { ok: true };
    }
    case 'consigne':
      return world.consigner(place, ordre.allie, ordre.consigne, ordre.x, ordre.y) ? { ok: true } : refus('consigne refusée');
    default:
      return refus('type inconnu');
  }
}

/**
 * Le journal d'une partie : ses ordres, rangés par pas de simulation. C'est ce
 * qu'un serveur garde et relaie, et ce qui suffit à refaire la partie.
 */
export class Journal {
  constructor(ordres = []) {
    this.parPas = new Map();
    for (const o of ordres) this.noter(o.pas, o);
  }

  /** Inscrit un ordre au pas dit. */
  noter(pas, ordre) {
    if (!this.parPas.has(pas)) this.parPas.set(pas, []);
    this.parPas.get(pas).push({ ...ordre, pas });
  }

  /** Les ordres de ce pas, dans l'ordre où ils ont été inscrits. */
  du(pas) { return this.parPas.get(pas) || []; }

  /** Tout le journal, à plat, dans l'ordre des pas : ce qui se transmet. */
  aPlat() {
    return [...this.parPas.keys()].sort((a, b) => a - b).flatMap((pas) => this.parPas.get(pas));
  }
}

/**
 * Fait avancer un monde de `pas` pas en lui appliquant, avant chacun, les
 * ordres que le journal porte pour lui. `depuis` : le numéro du premier pas.
 * Rend le nombre d'ordres refusés.
 */
export function avancer(world, journal, pas, depuis = 0, dt = 1 / 20) {
  let refuses = 0;
  for (let i = 0; i < pas && !world.gameOver; i++) {
    for (const ordre of journal.du(depuis + i)) if (!executer(world, ordre).ok) refuses++;
    world.update(dt);
  }
  return refuses;
}
