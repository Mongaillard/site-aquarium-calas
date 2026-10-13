// ---------------------------------------------------------------------------
// Les scénarios : des parties écrites d'avance.
//
// Une partie ordinaire oppose deux camps qui bâtissent ; un scénario écrit ce
// qui arrive (état des lieux du 12/10/2026, étape 9). Il est fait de briques :
//   - un FORMAT d'emprunt (`base`), dont il change ce qu'il veut (`format`) ;
//   - des VAGUES écrites d'avance, qui entrent par une porte de la carte et
//     marchent sur le bâtiment principal du joueur ;
//   - un MONSTRE-CHEF : une troupe aux points de vie fixés, qui change quand
//     sa vie passe sous un seuil (il appelle des soldats, il frappe plus vite) ;
//   - un CAMP d'en face, bâti et gardé, où personne ne forme rien ;
//   - un BUT qui n'est pas « raser l'autre » : tenir, abattre le monstre,
//     récolter, raser le camp… ;
//   - trois BUTS À ÉTOILE, chacun gagné une fois (js/progression.js).
// Le défi du jour est un scénario tiré de la date : le même pour tous, sans
// serveur. Les autres portent un nom et ne changent pas. Ceux d'un chapitre
// de la CAMPAGNE se racontent, et s'ouvrent l'un après l'autre.
//
// Ce module ne touche ni à l'écran ni au profil : il décrit, et il fait vivre
// le scénario dans la partie (World, js/game.js). Il tourne sans navigateur
// (test/scenarios.test.js).
// ---------------------------------------------------------------------------

import { TILE, UNIT_TYPES, BUILDING_TYPES, GAME_MODES, CIVILISATIONS, nomDe, civDe, troupeDe } from './config.js';
import { STATE } from './entities.js';
import { txt, nombreLocal } from './langue.js';

const TOUTES = Object.keys(UNIT_TYPES).filter((t) => UNIT_TYPES[t].class !== 'villager' && UNIT_TYPES[t].class !== 'animal');
const CAVALERIE = TOUTES.filter((t) => UNIT_TYPES[t].class === 'cavalry');

// --- Les règles tordues ----------------------------------------------------------
// Une règle change une partie ordinaire contre l'ordinateur, pour les deux
// camps : ce qu'on ne forme pas (`interdites`, ou `seules` : tout le reste est
// interdit), ce que le format donne au départ (`format`), l'éclaireur du
// départ (`sansEclaireur`). Une ligne par règle.

export const REGLES = {
  aPied: {
    id: 'aPied', nom: 'Tous à pied', base: 'express', icone: 'spearman',
    resume: 'Aucune cavalerie, pour personne : ni éclaireur, ni cavalier.',
    interdites: CAVALERIE, sansEclaireur: true,
  },
  lances: {
    id: 'lances', nom: 'Mur de lances', base: 'escarmouche', icone: 'pavoisier',
    resume: 'Rien que des lanciers et leurs cousins : ni épée, ni arc, ni cheval.',
    seules: ['spearman', 'pavoisier', 'sapeur'], sansEclaireur: true,
  },
  fourmiliere: {
    id: 'fourmiliere', nom: 'Fourmilière', base: 'express', icone: 'ouvriers',
    resume: '15 ouvriers dès le départ, et de la place pour 60.',
    format: { villagers: 15, popMax: 60, popStart: 20 },
  },
  tirGroupe: {
    id: 'tirGroupe', nom: 'Tir groupé', base: 'escarmouche', icone: 'archer',
    resume: 'Rien que des tireurs : archers, frondeurs, arbalétriers.',
    seules: ['archer', 'frondeur', 'crossbowman'], sansEclaireur: true,
    format: { batimentsDeDepart: ['archery'], aiBatiments: [], aiTroupes: ['archer'] },
  },
  papier: {
    id: 'papier', nom: 'Palais de papier', base: 'escarmouche', icone: 'towncenter',
    resume: 'Les deux bâtiments principaux tiennent à peine debout : le premier qui frappe fort gagne.',
    format: { townCenterHp: 0.25 },
  },
};

/** Ce que les deux camps ne forment pas sous cette règle (ou dans ce scénario). */
export function interditesDe(def) {
  if (!def) return [];
  if (Array.isArray(def.seules)) return TOUTES.filter((t) => !def.seules.includes(t));
  return Array.isArray(def.interdites) ? def.interdites.filter((t) => TOUTES.includes(t)) : [];
}

// --- Les scénarios qui portent un nom ---------------------------------------------
//   base      : le format d'emprunt (js/config.js, GAME_MODES) ;
//   graine    : le numéro de la carte — toujours la même ;
//   format    : ce que le scénario change au format ;
//   adversaire: 'aucun' — personne ne bâtit en face, tout vient des vagues —,
//               ou 'ordinateur' (par défaut) ;
//   civAdverse: le peuple d'en face, quand le scénario y tient — 'autre' : l'autre peuple que
//               celui du joueur ;
//   portes    : 'coins' — les vagues entrent par les trois autres coins de la
//               carte — ; sinon par le coin d'en face seulement ;
//   vagues    : `{ a, troupes, porte }` — l'heure (secondes), ce qui entre, par où ;
//   maraudeurs: vrai quand les vagues ne sont pas le sujet de la partie — des pillards qui
//               gênent : l'écran les annonce sans les compter ;
//   chef      : `{ type, vie, a, phases, duPeuple }` ; une phase `{ sous, appelle, def, annonce }`
//               se joue une fois, quand sa vie passe sous `sous` pour cent ; `duPeuple` : le
//               monstre garde ce que son peuple lui donne (le Sphinx balaie, l'Hydre se soigne) ;
//   camp      : `{ batiments, garde, vie }` — ce que le camp d'en face a de bâti (posé autour de
//               sa place, achevé), les troupes qui le gardent, en attitude défensive, et ce que
//               ses bâtiments tiennent, en pour cent de leurs points de vie (un camp de fortune
//               n'est pas une forteresse) ;
//   but       : `{ genre: 'tenir' }` (toutes les vagues), `{ genre: 'abattre', avant }`,
//               `{ genre: 'recolter', quoi, combien, avant }` (ce que le joueur récolte pendant
//               la partie — de la nourriture, le seul `quoi` écrit), `{ genre: 'raser', avant }`
//               (tous les bâtiments du camp) ;
//   chapitre  : le chapitre de la campagne dont il est une mission, et `recit` : ce qui se dit
//               `avant` la partie et `apres` la victoire (voir CHAPITRES) ;
//   etoiles   : les trois buts à étoile (voir etoilesDe) ;
//   record    : ce que le palmarès garde — 'vague' (la plus haute) ou 'temps' (le plus court).

/** Une vague : `a` secondes, ce qui entre, la porte (0 : en face). */
const vague = (a, troupes, porte = 0) => ({ a, troupes, porte });

export const SCENARIOS = {
  survie: {
    id: 'survie', nom: 'Tenir le Fort', icone: 'tower',
    resume: 'Douze vagues, une par minute, de plus en plus fortes. La dernière amène une Hydre.',
    base: 'escarmouche', graine: 20261013, adversaire: 'aucun', civAdverse: 'atlante', portes: 'coins',
    format: { timeLimit: 0, townCenterHp: 1, popMax: 40, popStart: 32 },
    vagues: [
      vague(60, { militia: 3 }),
      vague(120, { militia: 4 }, 1),
      vague(180, { militia: 3, archer: 2 }, 2),
      vague(240, { spearman: 4, archer: 2 }),
      vague(300, { militia: 5, archer: 3 }, 1),
      vague(360, { scout: 4, militia: 4 }, 2),
      vague(420, { spearman: 6, archer: 4 }),
      vague(480, { militia: 6, ram: 1 }, 1),
      vague(540, { knight: 4, archer: 4 }, 2),
      vague(600, { champion: 6, ram: 1 }),
      vague(660, { knight: 5, crossbowman: 5 }, 1),
      vague(720, { hydra: 1, champion: 6, archer: 4 }),
    ],
    but: { genre: 'tenir' },
    etoiles: [{ genre: 'vague', seuil: 6 }, { genre: 'vague', seuil: 9 }, { genre: 'victoire' }],
    record: 'vague',
  },
  hydre: {
    id: 'hydre', nom: 'Le réveil de l’Hydre', icone: 'hydra',
    resume: 'Un monstre-chef de 2 000 points de vie marche sur ta base. Abats-le en moins de 8 minutes.',
    base: 'escarmouche', graine: 20261014, adversaire: 'aucun', civAdverse: 'atlante',
    format: { timeLimit: 480, townCenterHp: 1, popMax: 40, popStart: 32, resources: { food: 2000, wood: 2000, gold: 1000 }, batimentsDeDepart: ['barracks', 'archery'] },
    chef: {
      type: 'hydra', vie: 2000, a: 90,
      phases: [
        { sous: 66, appelle: { militia: 4 }, annonce: 'renforts' },
        { sous: 33, def: { attackSpeed: 1.5, speed: 1.2 }, annonce: 'rage' },
      ],
    },
    but: { genre: 'abattre', avant: 480 },
    etoiles: [{ genre: 'victoire' }, { genre: 'temps', sous: 360 }, { genre: 'centre', part: 50 }],
    record: 'temps',
  },

  // --- La campagne, chapitre 1 : La rive d'en face ------------------------------------------
  // Trois missions qui se suivent, trois façons de jouer : récolter sous la menace, aller raser
  // un camp gardé, abattre le monstre que ce camp gardait. Elles se jouent avec le peuple du
  // joueur, contre l'autre : dans un récit, {0} est le peuple d'en face et {1} son monstre.
  riveGreniers: {
    id: 'riveGreniers', nom: 'Pied à terre', icone: 'food', chapitre: 'rive',
    resume: 'Les greniers sont vides. Remplis-les malgré les maraudeurs.',
    base: 'express', graine: 20261101, adversaire: 'aucun', civAdverse: 'autre', maraudeurs: true,
    format: { timeLimit: 420, townCenterHp: 1 },
    vagues: [vague(150, { scout: 2 }), vague(255, { militia: 3 }), vague(345, { scout: 2, archer: 2 })],
    but: { genre: 'recolter', quoi: 'food', combien: 800, avant: 420 },
    etoiles: [{ genre: 'victoire' }, { genre: 'temps', sous: 360 }, { genre: 'pertes', sous: 2 }],
    record: 'temps',
    recit: {
      avant: [
        'Nous avons traversé de nuit, et la terre d’en face est bonne.',
        'Mais nos greniers sont vides, et les {0} rôdent déjà.',
        'Remplis-les avant qu’ils ne reviennent en nombre.',
      ],
      apres: ['Les greniers sont pleins : nous restons.', 'Les {0}, eux, n’ont pas dit leur dernier mot.'],
    },
  },
  riveCamp: {
    id: 'riveCamp', nom: 'Le camp d’en face', icone: 'barracks', chapitre: 'rive',
    resume: 'Les maraudeurs sortent d’un camp, de l’autre côté de la carte. Va le raser.',
    base: 'escarmouche', graine: 20261102, adversaire: 'aucun', civAdverse: 'autre', maraudeurs: true,
    format: { timeLimit: 600, townCenterHp: 1, popMax: 40, popStart: 32 },
    camp: { batiments: ['barracks', 'archery', 'tower'], garde: { spearman: 3, archer: 3 }, vie: 50 },
    vagues: [
      vague(100, { militia: 3 }),
      vague(200, { militia: 2, archer: 2 }),
      vague(300, { spearman: 3, archer: 2 }),
      vague(400, { militia: 4, archer: 2 }),
      vague(500, { knight: 3 }),
    ],
    but: { genre: 'raser', avant: 600 },
    etoiles: [{ genre: 'victoire' }, { genre: 'temps', sous: 480 }, { genre: 'pertes', sous: 12 }],
    record: 'temps',
    recit: {
      avant: [
        'Leurs maraudeurs sortent d’un camp, de l’autre côté de la carte.',
        'Tant qu’il tient debout, ils reviendront.',
        'Va le raser : tous ses bâtiments, tour comprise.',
      ],
      apres: ['Le camp des {0} n’est plus qu’un tas de pierres.', 'Mais sous ces pierres, quelque chose a bougé.'],
    },
  },
  riveGardien: {
    id: 'riveGardien', nom: 'Ce que le camp gardait', icone: 'hydra', chapitre: 'rive',
    resume: 'Un monstre marche sur tes murs, avec ce qu’il reste des maraudeurs. Abats-le.',
    base: 'escarmouche', graine: 20261103, adversaire: 'aucun', civAdverse: 'autre', portes: 'coins', maraudeurs: true,
    format: { timeLimit: 540, townCenterHp: 1, popMax: 40, popStart: 32, resources: { food: 2000, wood: 2000, gold: 1000 }, batimentsDeDepart: ['barracks', 'archery'] },
    chef: {
      type: 'hydra', vie: 2000, a: 120, duPeuple: true,
      phases: [
        { sous: 70, appelle: { spearman: 3 }, annonce: 'renforts' },
        { sous: 40, appelle: { archer: 3 }, annonce: 'renforts' },
        { sous: 20, def: { attackSpeed: 1.5, speed: 1.2 }, annonce: 'rage' },
      ],
    },
    vagues: [vague(200, { militia: 3 }, 1), vague(320, { militia: 3, archer: 2 }, 2), vague(440, { knight: 3 }, 1)],
    but: { genre: 'abattre', avant: 540 },
    etoiles: [{ genre: 'victoire' }, { genre: 'temps', sous: 420 }, { genre: 'centre', part: 50 }],
    record: 'temps',
    recit: {
      avant: [
        'En rasant leur camp, tu as réveillé ce qu’il gardait.',
        'Leur {1} marche sur nous, avec ce qu’il reste des {0}.',
        'Abats ce monstre avant qu’il ne rase nos murs.',
      ],
      apres: ['Le monstre est à terre, et la rive est à nous.', 'Les {0} parlent déjà de revanche : c’est une autre histoire.'],
    },
  },
};

// --- La campagne ----------------------------------------------------------------------------
// Un chapitre raconte une histoire en quelques missions. L'ordre des missions, ce qui les ouvre et
// ce que le chapitre donne sont des réglages du profil (PROGRESSION.campagne,
// js/progression-config.js) ; ici, son nom et ce qu'il raconte.

export const CHAPITRES = {
  rive: {
    id: 'rive', nom: 'La rive d’en face',
    resume: 'Ton peuple traverse. En face, la terre est bonne — et déjà prise.',
  },
};

/** Les missions d'un chapitre, dans l'ordre où la table des scénarios les écrit. */
export function missionsDe(chapitre) {
  return Object.keys(SCENARIOS).filter((id) => SCENARIOS[id].chapitre === chapitre);
}

/** Les scénarios qui portent un nom sans être d'un chapitre : ceux de l'écran des défis. */
export const SCENARIOS_LIBRES = Object.keys(SCENARIOS).filter((id) => !SCENARIOS[id].chapitre);

/**
 * Un récit de mission dans la langue du joueur : ses phrases, où {0} devient le peuple d'en face
 * et {1} son monstre. `civ` : le peuple du joueur.
 */
export function recitDe(def, moment, civ) {
  const phrases = def && def.recit && Array.isArray(def.recit[moment]) ? def.recit[moment] : [];
  const face = peupleAdverseDe(def, civ);
  // (Les noms des peuples et des troupes sont déjà dans la langue du joueur : js/config.js les traduit en se chargeant.)
  const valeurs = [CIVILISATIONS[face].name, nomDe('hydra', face)];
  return phrases.map((phrase) => txt(phrase).replace(/\{(\d)\}/g, (trou, i) => (valeurs[Number(i)] !== undefined ? valeurs[Number(i)] : trou)));
}

// --- Le défi du jour ----------------------------------------------------------------

/** Ce que chaque jour de la semaine propose, du dimanche au samedi : une règle tordue, ou un scénario. */
export const SEMAINE_DES_DEFIS = ['hydre', 'aPied', 'lances', 'fourmiliere', 'tirGroupe', 'papier', 'survie'];

/** Les trois buts à étoile d'un défi fait d'une règle : gagner, gagner net, gagner sans trop de pertes. */
const ETOILES_DE_REGLE = [{ genre: 'victoire' }, { genre: 'net' }, { genre: 'pertes', sous: 8 }];
/** Le défi du samedi : la Survie, raccourcie à ses huit premières vagues. */
const VAGUES_DU_SAMEDI = 8;

const FORME_DU_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Le rang d'un jour « AAAA-MM-JJ » (jours depuis le 1er janvier 1970), ou null. Même calcul que js/progression.js. */
function rangDuJour(jour) {
  const m = typeof jour === 'string' ? FORME_DU_JOUR.exec(jour) : null;
  if (!m) return null;
  const mois = Number(m[2]), quantieme = Number(m[3]);
  if (mois < 1 || mois > 12 || quantieme < 1 || quantieme > 31) return null;
  const annee = Number(m[1]) - (mois <= 2 ? 1 : 0);
  const ere = Math.floor(annee / 400);
  const anDeLEre = annee - ere * 400;
  const jourDeLAn = Math.floor((153 * (mois + (mois > 2 ? -3 : 9)) + 2) / 5) + quantieme - 1;
  const jourDeLEre = anDeLEre * 365 + Math.floor(anDeLEre / 4) - Math.floor(anDeLEre / 100) + jourDeLAn;
  return ere * 146097 + jourDeLEre - 719468;
}

/** Le jour de la semaine d'un rang : 0 pour dimanche. (Le 1er janvier 1970 était un jeudi.) */
const jourDeSemaine = (rang) => (((rang + 4) % 7) + 7) % 7;

/**
 * Le défi d'un jour « AAAA-MM-JJ » : un scénario complet, tiré de la date. La
 * carte change chaque jour (sa graine vient du rang du jour) ; la règle suit le
 * jour de la semaine — le lundi, on sait que c'est « Tous à pied ». null si le
 * jour est illisible.
 */
export function defiDuJour(jour) {
  const rang = rangDuJour(jour);
  if (rang === null) return null;
  const quoi = SEMAINE_DES_DEFIS[jourDeSemaine(rang)];
  const graine = 730000 + rang * 97;
  if (REGLES[quoi]) {
    const regle = REGLES[quoi];
    return {
      ...regle, id: 'defi', jour, regle: regle.id, graine, adversaire: 'ordinateur',
      etoiles: ETOILES_DE_REGLE, record: null,
    };
  }
  const modele = SCENARIOS[quoi];
  // (Le samedi : la Survie en plus court, sur la carte du jour ; le dimanche : le monstre-chef, sur la carte du jour.)
  if (modele.vagues) {
    const vagues = modele.vagues.slice(0, VAGUES_DU_SAMEDI);
    return {
      ...modele, id: 'defi', jour, modele: modele.id, graine, vagues, record: null,
      resume: 'Huit vagues, une par minute, sur la carte du jour.',
      etoiles: [{ genre: 'vague', seuil: 4 }, { genre: 'vague', seuil: 6 }, { genre: 'victoire' }],
    };
  }
  return { ...modele, id: 'defi', jour, modele: modele.id, graine, record: null };
}

// --- Retrouver un scénario ----------------------------------------------------------

/**
 * Une référence de scénario, telle qu'une partie la reçoit et que la sauvegarde
 * la garde : `{ id }`, ou `{ id: 'defi', jour }`. null pour tout le reste.
 */
export function refDeScenario(donnee) {
  const id = typeof donnee === 'string' ? donnee : donnee && typeof donnee === 'object' ? donnee.id : null;
  if (id === 'defi') {
    const jour = donnee && typeof donnee === 'object' ? donnee.jour : null;
    return rangDuJour(jour) === null ? null : { id, jour };
  }
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(SCENARIOS, id) ? { id } : null;
}

/** Le scénario que désigne une référence, ou null. */
export function scenarioDe(ref) {
  const r = refDeScenario(ref);
  if (!r) return null;
  return r.id === 'defi' ? defiDuJour(r.jour) : SCENARIOS[r.id];
}

/** Le format d'une partie de ce scénario : celui qu'il emprunte, avec ce qu'il y change. */
export function formatDe(def) {
  return { ...GAME_MODES[def.base], ...(def.format || {}), name: txt(def.nom) };
}

/**
 * Le peuple d'en face dans ce scénario, pour un joueur de ce peuple : celui que le scénario impose,
 * l'autre que le sien (`civAdverse: 'autre'`), ou `parDefaut` — celui qu'il a choisi à l'accueil.
 */
export function peupleAdverseDe(def, civ, parDefaut) {
  if (def && def.civAdverse === 'autre') {
    const mien = civDe(civ);
    return Object.keys(CIVILISATIONS).find((c) => c !== mien) || mien;
  }
  return civDe((def && def.civAdverse) || parDefaut);
}

/**
 * Les réglages d'une partie de ce scénario (World, js/game.js). `civs` : le
 * peuple du joueur, puis celui qu'il a choisi en face — le scénario impose
 * parfois le sien.
 */
export function optionsDeScenario(ref, civs = []) {
  const r = refDeScenario(ref), def = scenarioDe(r);
  if (!def) return null;
  return {
    scenario: r, mode: def.base, mapSize: GAME_MODES[def.base].mapSize, seed: def.graine,
    civs: [civs[0], def.civAdverse ? peupleAdverseDe(def, civs[0]) : civs[1]],
    ...(def.adversaire === 'aucun' ? { places: ['local', 'distant'] } : {}),
  };
}

// --- Les buts à étoile ---------------------------------------------------------------
//   victoire : gagner (tenir toutes les vagues, abattre le monstre, battre l'ordinateur) ;
//   net      : gagner avant la fin du temps — le bâtiment principal adverse rasé ;
//   temps    : gagner en moins de `sous` secondes ;
//   pertes   : gagner en perdant moins de `sous` unités ;
//   centre   : gagner avec le bâtiment principal à `part` pour cent de sa vie, ou plus ;
//   vague    : voir arriver la vague `seuil` — gagnée même si la partie est perdue ensuite.

/**
 * Les buts atteints, dans l'ordre : un tableau de trois vrais ou faux. `bilan` :
 * ce que la partie a donné (Scenario.bilan).
 */
export function etoilesDe(def, bilan) {
  const b = bilan || {};
  return (def.etoiles || []).map((but) => {
    switch (but.genre) {
      case 'victoire': return !!b.victoire;
      case 'net': return !!b.victoire && !b.auTemps;
      case 'temps': return !!b.victoire && b.temps < but.sous;
      case 'pertes': return !!b.victoire && b.pertes < but.sous;
      case 'centre': return !!b.victoire && b.centre >= but.part;
      case 'vague': return b.vague >= but.seuil;
      default: return false;
    }
  });
}

/**
 * Le nom du monstre-chef d'un scénario, dans la langue du joueur (« Hydre », « Sphinx »). `civ` : le peuple
 * du joueur — il ne compte que si le monstre est celui de « l'autre peuple ».
 */
export function nomDuChef(def, civ) {
  return def && def.chef ? nomDe(def.chef.type, peupleAdverseDe(def, civ)) : '';
}

/** Combien de bâtiments le camp d'un scénario a à raser. */
const batimentsDuCampDe = (def) => (def.camp && Array.isArray(def.camp.batiments) ? def.camp.batiments.length : 0);

/** Un but à étoile, en une phrase. `civ` : le peuple du joueur (voir nomDuChef). */
export function texteDuBut(def, but, civ) {
  switch (but.genre) {
    case 'victoire':
      if (def.but && def.but.genre === 'tenir') return txt`Tenir les ${def.vagues.length} vagues`;
      if (def.but && def.but.genre === 'abattre') return txt`Abattre le monstre : ${nomDuChef(def, civ)}`;
      if (def.but && def.but.genre === 'recolter') return txt`Récolter ${nombreLocal(def.but.combien)} de nourriture en moins de ${Math.round(def.but.avant / 60)} minutes`;
      if (def.but && def.but.genre === 'raser') return txt`Raser le camp : ses ${batimentsDuCampDe(def)} bâtiments`;
      return txt('Gagner la partie');
    case 'net': return txt('Raser le bâtiment principal adverse avant la fin du temps');
    case 'temps': return txt`Gagner en moins de ${Math.round(but.sous / 60)} minutes`;
    case 'pertes': return txt`Gagner en perdant moins de ${but.sous} unités`;
    case 'centre': return but.part === 50 ? txt('Finir avec ton bâtiment principal au moins à moitié de sa vie') : txt`Finir avec ton bâtiment principal au moins à ${but.part} % de sa vie`;
    case 'vague': return txt`Voir arriver la vague ${but.seuil}`;
    default: return '';
  }
}

/** Les trois buts d'un scénario, en phrases. `civ` : le peuple du joueur (voir nomDuChef). */
export function butsDe(def, civ) {
  return (def.etoiles || []).map((but) => texteDuBut(def, but, civ));
}

/** La consigne de départ d'un scénario, en une phrase : ce qu'il faut faire pour gagner. `civ` : le peuple du joueur. */
export function consigneDe(def, civ) {
  if (def.but && def.but.genre === 'tenir') return txt`${def.vagues.length} vagues arrivent, une par minute. Défends ton bâtiment principal.`;
  if (def.but && def.but.genre === 'abattre') return txt`Un monstre approche : ${nomDuChef(def, civ)}, ${nombreLocal(def.chef.vie)} points de vie. Abats-le en moins de ${Math.round(def.but.avant / 60)} minutes.`;
  if (def.but && def.but.genre === 'recolter') return txt`Récolte ${nombreLocal(def.but.combien)} de nourriture en moins de ${Math.round(def.but.avant / 60)} minutes. Des maraudeurs rôdent.`;
  if (def.but && def.but.genre === 'raser') return txt`Leur camp est de l’autre côté de la carte : rase ses ${batimentsDuCampDe(def)} bâtiments en moins de ${Math.round(def.but.avant / 60)} minutes.`;
  return txt(def.resume);
}

// --- Le scénario dans la partie -------------------------------------------------------

/** Tous les combien de pas de simulation les troupes du scénario au repos reprennent leur marche (2 s). */
const RELANCE = 40;
/**
 * L'horloge de la partie avance par vingtièmes de seconde, en nombres à virgule : à « 60 secondes » elle marque
 * 59,999999999998. Une heure écrite (« à 60 s ») se compare donc avec cette marge, et un compte à rebours ne
 * saute pas d'une seconde pour autant.
 */
const MARGE = 1e-6;
/** Les secondes entières qu'il reste jusqu'à une heure donnée. */
const resteJusqua = (heure, maintenant) => Math.max(0, Math.ceil(heure - maintenant - MARGE));

/**
 * Un scénario en train de se jouer. La partie l'appelle à chaque pas
 * (`avancer`) : il lance ses vagues, fait vivre son monstre-chef et, s'il a un
 * but à lui (`juge`), dit quand la partie est gagnée ou perdue. Tout se compte
 * sur l'horloge de la partie : rejoué avec la même graine et les mêmes ordres,
 * il donne la même partie.
 */
export class Scenario {
  constructor(monde, ref, def) {
    this.monde = monde;
    this.ref = ref;
    this.def = def;
    this.vague = 0;          // vagues déjà lancées
    this.chef = null;        // le numéro du monstre-chef, une fois entré
    this.chefEntre = false;
    this.phase = 0;          // phases du monstre déjà jouées
    this.compteur = 0;       // pas de simulation depuis la dernière relance
    this.raison = '';        // ce qui a tranché, quand le scénario juge
    // Les portes ne dépendent que de la carte neuve : une partie rechargée retrouve les mêmes.
    this.portes = this.trouverLesPortes();
  }

  /** Le scénario a son but à lui : c'est lui qui dit la fin, pas les règles du format. */
  get juge() { return !!this.def.but; }

  /** Le camp d'en face (à deux camps : l'autre). */
  get ennemi() { return this.monde.humanIndex === 0 ? 1 : 0; }

  /** Où entrent les vagues : le coin d'en face, et, avec `portes: 'coins'`, les deux autres coins s'ils mènent à la base. */
  trouverLesPortes() {
    const map = this.monde.map;
    const moi = map.startPositions[this.monde.humanIndex], face = map.startPositions[this.ennemi];
    const cases = [face];
    if (this.def.portes === 'coins') {
      for (const coin of [{ tx: moi.tx, ty: face.ty }, { tx: face.tx, ty: moi.ty }]) {
        const libre = map.findOpenTile(coin.tx, coin.ty, 6, 40);
        if (libre && !map.isBlocked(libre.tx, libre.ty) && map.floodReaches(libre, moi)) cases.push(libre);
      }
    }
    return cases.map((c) => ({ x: c.tx * TILE + TILE / 2, y: c.ty * TILE + TILE / 2 }));
  }

  /** Les troupes du scénario encore debout. */
  troupes() {
    const ennemi = this.ennemi;
    return this.monde.units.filter((u) => !u.dead && !u.isAnimal && u.playerIndex === ennemi);
  }

  /** Les bâtiments du camp d'en face encore debout. */
  batimentsDuCamp() {
    const ennemi = this.ennemi;
    return this.monde.buildings.filter((b) => !b.dead && b.playerIndex === ennemi);
  }

  /** Ce que le joueur a récolté depuis le début de la partie, de la ressource que le but demande. */
  recolte() {
    const but = this.def.but, moi = this.monde.players[this.monde.humanIndex];
    return but && but.quoi ? Math.floor(moi.stats.gathered[but.quoi] || 0) : 0;
  }

  /**
   * Le camp d'en face (`def.camp`), posé à la mise en place d'une partie neuve (World.setupStartingPositions) :
   * ses bâtiments, achevés, autour de la place adverse — le premier dessus, les autres en couronne, du côté du
   * joueur d'abord —, et sa garde devant eux, en attitude défensive : elle engage ce qui approche, puis revient
   * à son poste. Personne n'y bâtit ni n'y forme : ce qui en sort est écrit (`vagues`). Une partie reprise
   * retrouve son camp dans la sauvegarde, tel qu'il était.
   */
  poserLeCamp() {
    const camp = this.def.camp, monde = this.monde, ennemi = this.ennemi;
    if (!camp) return;
    const place = monde.map.startPositions[ennemi], moi = monde.map.startPositions[monde.humanIndex];
    const versMoi = Math.atan2(moi.ty - place.ty, moi.tx - place.tx);
    const poses = [];
    (camp.batiments || []).forEach((type, k) => {
      const fiche = BUILDING_TYPES[type];
      if (!fiche) return;
      const demi = (fiche.size - 1) / 2;
      // (Le premier sur la place même ; les suivants de part et d'autre de la route qui mène au joueur, de plus en plus loin.)
      const angle = versMoi + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.9;
      for (let r = k === 0 ? 0 : 5; r <= 12 && poses.length <= k; r++) {
        for (const ecart of [0, 0.35, -0.35, 0.7, -0.7]) {
          const tx = Math.round(place.tx + (k === 0 ? 0 : Math.cos(angle + ecart) * r) - demi), ty = Math.round(place.ty + (k === 0 ? 0 : Math.sin(angle + ecart) * r) - demi);
          if (!monde.canPlace(ennemi, type, tx, ty, true)) continue;
          poses.push(monde.spawnBuilding(ennemi, type, tx, ty, true));
          break;
        }
      }
    });
    // La garde : en arc devant le camp, du côté d'où le joueur viendra.
    const centre = { x: place.tx * TILE + TILE / 2, y: place.ty * TILE + TILE / 2 };
    const total = Object.values(camp.garde || {}).reduce((somme, n) => somme + n, 0);
    let i = 0;
    for (const [type, nombre] of Object.entries(camp.garde || {})) {
      if (!UNIT_TYPES[type]) continue;
      for (let k = 0; k < nombre; k++, i++) {
        const angle = versMoi + ((i + 0.5) / Math.max(1, total) - 0.5) * 2.2, rayon = TILE * (3.4 + (i % 2) * 1.1);
        const garde = monde.spawnUnit(ennemi, type, centre.x + Math.cos(angle) * rayon, centre.y + Math.sin(angle) * rayon);
        garde.setStance('defensive');
      }
    }
    return poses;
  }

  /** Le bâtiment principal du joueur, s'il tient encore. */
  centre() {
    const moi = this.monde.humanIndex;
    return this.monde.buildings.find((b) => !b.dead && b.complete && b.playerIndex === moi && b.type === 'towncenter') || null;
  }

  /** Le monstre-chef, s'il est entré et vit encore. */
  monstre() {
    const u = this.chef === null ? null : this.monde.byId.get(this.chef);
    return u && !u.dead ? u : null;
  }

  /** Fait entrer des troupes par une porte, en cercle autour d'elle. Rend celles qui sont entrées. */
  faireEntrer(troupes, porte) {
    const entrees = [];
    const total = Object.values(troupes).reduce((s, n) => s + n, 0);
    let i = 0;
    for (const [type, nombre] of Object.entries(troupes)) {
      if (!UNIT_TYPES[type]) continue;
      for (let k = 0; k < nombre; k++, i++) {
        const angle = (Math.PI * 2 * i) / Math.max(1, total), rayon = TILE * (1 + (i % 3) * 0.6);
        entrees.push(this.monde.spawnUnit(this.ennemi, type, porte.x + Math.cos(angle) * rayon, porte.y + Math.sin(angle) * rayon));
      }
    }
    return entrees;
  }

  /** Envoie des troupes sur la base du joueur : elles marchent en se battant, au pas du plus lent. */
  envoyer(troupes) {
    const cible = this.centre() || this.monde.buildings.find((b) => !b.dead && b.playerIndex === this.monde.humanIndex);
    if (!cible || !troupes.length) return;
    this.monde.formationMove(troupes, cible.x, cible.y + TILE * 2, true);
  }

  /** Les troupes restées sans rien faire repartent à l'assaut : le bâtiment principal, sinon ce qui reste au joueur. */
  relancer() {
    const moi = this.monde.humanIndex;
    const cible = this.centre()
      || this.monde.buildings.find((b) => !b.dead && b.playerIndex === moi)
      || this.monde.units.find((u) => !u.dead && !u.isAnimal && u.playerIndex === moi && !u.garrisonedIn);
    if (!cible) return;
    for (const u of this.troupes()) {
      // (La garde d'un camp — attitude défensive — tient son poste : seuls les assaillants repartent.)
      if (u.state === STATE.IDLE && !u.def.heal && u.stance === 'aggressive') u.attackEntity(cible);
    }
  }

  /** Le monstre-chef entre : sa vie est celle du scénario, pas celle de la troupe. */
  faireEntrerLeChef() {
    const c = this.def.chef;
    const [monstre] = this.faireEntrer({ [c.type]: 1 }, this.portes[0]);
    this.chefEntre = true;
    if (!monstre) return;
    this.chef = monstre.id;
    this.habillerLeChef(monstre);
    monstre.hp = monstre.maxHp;
    this.envoyer([monstre]);
    this.monde.pushEvent({ type: 'chef', etape: 'entre', x: monstre.x, y: monstre.y, nom: nomDe(c.type, this.monde.players[this.ennemi].civ) });
  }

  /**
   * Ce qui fait d'une troupe le monstre-chef : ses points de vie, et ce que ses
   * phases déjà jouées ont changé à sa définition (elle lui devient propre).
   * Rappelé à la reprise d'une partie : la sauvegarde ne garde que sa vie.
   */
  habillerLeChef(monstre) {
    const c = this.def.chef;
    monstre.chef = true;
    monstre.maxHp = c.vie;
    // (`duPeuple` : il garde ce que son peuple donne à cette troupe — le Sphinx balaie, l'Hydre se soigne.)
    let def = c.duPeuple ? troupeDe(c.type, this.monde.players[this.ennemi].civ) : UNIT_TYPES[c.type];
    for (const phase of c.phases.slice(0, this.phase)) if (phase.def) def = { ...def, ...phase.def };
    monstre.def = def;
  }

  /** Les phases du monstre : chacune se joue une fois, quand sa vie passe sous son seuil. */
  suivreLeChef() {
    const monstre = this.monstre(), c = this.def.chef;
    if (!monstre) return;
    while (this.phase < c.phases.length && monstre.hp * 100 <= c.vie * c.phases[this.phase].sous) {
      const phase = c.phases[this.phase++];
      if (phase.def) this.habillerLeChef(monstre);
      if (phase.appelle) this.envoyer(this.faireEntrer(phase.appelle, monstre));
      this.monde.pushEvent({ type: 'chef', etape: phase.annonce || 'phase', x: monstre.x, y: monstre.y, nom: nomDe(c.type, this.monde.players[this.ennemi].civ) });
    }
  }

  /** Un pas de simulation. */
  avancer() {
    const monde = this.monde, def = this.def;
    if (monde.gameOver) return;
    const vagues = def.vagues || [];
    while (this.vague < vagues.length && monde.time + MARGE >= vagues[this.vague].a) {
      const v = vagues[this.vague++];
      const porte = this.portes[(v.porte || 0) % this.portes.length];
      this.envoyer(this.faireEntrer(v.troupes, porte));
      monde.pushEvent({ type: 'vague', numero: this.vague, total: vagues.length, maraudeurs: !!def.maraudeurs, x: porte.x, y: porte.y });
    }
    if (def.chef && !this.chefEntre && monde.time + MARGE >= def.chef.a) this.faireEntrerLeChef();
    if (def.chef) this.suivreLeChef();
    if (++this.compteur >= RELANCE) { this.compteur = 0; if (def.adversaire === 'aucun') this.relancer(); }
    if (this.juge) this.juger();
  }

  /** La partie est-elle gagnée, ou perdue ? */
  juger() {
    const monde = this.monde, but = this.def.but;
    let issue = null;
    if (!this.centre()) issue = { victoire: false, raison: 'centre' };
    else if (but.genre === 'tenir') {
      if (this.vague >= (this.def.vagues || []).length && this.troupes().length === 0) issue = { victoire: true, raison: 'tenu' };
    } else if (but.genre === 'abattre') {
      if (this.chefEntre && !this.monstre()) issue = { victoire: true, raison: 'abattu' };
      else if (but.avant && monde.time + MARGE >= but.avant) issue = { victoire: false, raison: 'temps' };
    } else if (but.genre === 'recolter') {
      if (this.recolte() >= but.combien) issue = { victoire: true, raison: 'recolte' };
      else if (but.avant && monde.time + MARGE >= but.avant) issue = { victoire: false, raison: 'temps' };
    } else if (but.genre === 'raser') {
      if (this.batimentsDuCamp().length === 0) issue = { victoire: true, raison: 'rase' };
      else if (but.avant && monde.time + MARGE >= but.avant) issue = { victoire: false, raison: 'temps' };
    }
    if (!issue) return;
    this.raison = issue.raison;
    monde.gameOver = {
      winner: issue.victoire ? monde.humanIndex : this.ennemi, victory: issue.victoire, time: monde.time,
      scenario: { ...this.ref, raison: issue.raison },
    };
    monde.pushEvent({ type: 'gameOver', result: monde.gameOver });
  }

  /**
   * Ce que la partie a donné, pour les étoiles et le palmarès. `resultat` : celui
   * de la partie (World.gameOver), quelle que soit la façon dont elle a fini.
   */
  bilan(resultat) {
    const monde = this.monde, moi = monde.players[monde.humanIndex];
    const centre = this.centre();
    return {
      victoire: !!(resultat && resultat.victory),
      auTemps: !!(resultat && (resultat.timeUp || resultat.positions)),
      temps: Math.floor(monde.time),
      pertes: moi.stats.lost,
      vague: this.vague,
      centre: centre ? Math.floor((100 * centre.hp) / centre.maxHp) : 0,
    };
  }

  /**
   * Ce que l'écran montre pendant la partie : la vague en cours et le temps
   * avant la suivante, la vie du monstre-chef, ce qui est récolté, ce qu'il
   * reste du camp. Rien pour un scénario sans rien de tout cela.
   */
  affichage() {
    const monde = this.monde, vagues = this.def.vagues || [], but = this.def.but;
    const etat = {};
    if (but && but.genre === 'recolter') etat.recolte = { quoi: but.quoi, fait: Math.min(but.combien, this.recolte()), but: but.combien };
    if (but && but.genre === 'raser') etat.camp = { reste: this.batimentsDuCamp().length, total: batimentsDuCampDe(this.def) };
    // (Des maraudeurs ne se comptent pas : l'écran montre le but de la partie, pas leurs vagues.)
    if (vagues.length && !this.def.maraudeurs) {
      const suivante = vagues[this.vague];
      etat.vague = this.vague;
      etat.vagues = vagues.length;
      etat.dans = suivante ? resteJusqua(suivante.a, monde.time) : null;
    }
    if (this.def.chef) {
      const monstre = this.monstre(), c = this.def.chef;
      etat.chef = {
        nom: nomDe(c.type, monde.players[this.ennemi].civ), max: c.vie,
        vie: monstre ? Math.ceil(monstre.hp) : this.chefEntre ? 0 : c.vie,
        dans: this.chefEntre ? null : resteJusqua(c.a, monde.time),
      };
    }
    return etat;
  }

  /**
   * Les troupes que le scénario fera paraître sous peu, ou qui sont déjà sur la carte : celles des vagues qui
   * entrent d'ici `horizon` secondes, le monstre-chef avant son entrée, ce qu'il appellera une fois là, et tout
   * ce que le scénario a déjà de vivant (la garde d'un camp, que le joueur n'a pas encore vue). L'écran s'en
   * sert pour préparer leurs images à l'avance, comme celles d'une troupe en formation (main.js, veiller) :
   * sans cela, une troupe qui entre toute faite paraît d'abord sous sa silhouette d'attente.
   */
  aVenir(horizon = 30) {
    const monde = this.monde, def = this.def, types = new Set();
    for (const v of (def.vagues || []).slice(this.vague)) {
      if (v.a - monde.time > horizon) break;
      for (const type of Object.keys(v.troupes)) types.add(type);
    }
    const chef = def.chef;
    if (chef && (this.chefEntre || chef.a - monde.time <= horizon)) {
      if (!this.chefEntre) types.add(chef.type);
      for (const phase of chef.phases.slice(this.phase)) for (const type of Object.keys(phase.appelle || {})) types.add(type);
    }
    for (const u of this.troupes()) types.add(u.type);
    return [...types].filter((type) => UNIT_TYPES[type]);
  }

  /** Ce que la sauvegarde garde du scénario. */
  etat() {
    return { ...this.ref, vague: this.vague, chef: this.chef, chefEntre: this.chefEntre, phase: this.phase, compteur: this.compteur };
  }

  /** Reprend un scénario sauvegardé, une fois les troupes de la partie remises en place. */
  reprendre(etat) {
    if (!etat || typeof etat !== 'object') return;
    const entier = (v, max) => Math.max(0, Math.min(max, Math.floor(v) || 0));
    this.vague = entier(etat.vague, (this.def.vagues || []).length);
    this.phase = entier(etat.phase, this.def.chef ? this.def.chef.phases.length : 0);
    this.compteur = entier(etat.compteur, RELANCE);
    this.chefEntre = !!etat.chefEntre;
    this.chef = Number.isFinite(etat.chef) ? etat.chef : null;
    const monstre = this.monstre();
    if (monstre) { const vie = monstre.hp; this.habillerLeChef(monstre); monstre.hp = Math.min(vie, monstre.maxHp); }
  }
}

// --- La langue ---------------------------------------------------------------------------

/** Les textes des scénarios et des règles, pour les dictionnaires (outils/langues.mjs). */
export function textesATraduire(visite) {
  for (const table of [REGLES, SCENARIOS, CHAPITRES]) {
    for (const fiche of Object.values(table)) {
      visite(fiche, 'nom');
      visite(fiche, 'resume');
      // (Le récit d'une mission : ses phrases d'avant et d'après, une à une.)
      for (const moment of ['avant', 'apres']) {
        const phrases = fiche.recit && fiche.recit[moment];
        if (Array.isArray(phrases)) phrases.forEach((_, i) => visite(phrases, i));
      }
    }
  }
  // (Le défi du samedi a son résumé à lui.)
  const samedi = { resume: 'Huit vagues, une par minute, sur la carte du jour.' };
  visite(samedi, 'resume');
}
