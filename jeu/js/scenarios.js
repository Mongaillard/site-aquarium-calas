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
//   - un BUT qui n'est pas « raser l'autre » : tenir, abattre le monstre… ;
//   - trois BUTS À ÉTOILE, chacun gagné une fois (js/progression.js).
// Le défi du jour est un scénario tiré de la date : le même pour tous, sans
// serveur. Les autres portent un nom et ne changent pas.
//
// Ce module ne touche ni à l'écran ni au profil : il décrit, et il fait vivre
// le scénario dans la partie (World, js/game.js). Il tourne sans navigateur
// (test/scenarios.test.js).
// ---------------------------------------------------------------------------

import { TILE, UNIT_TYPES, GAME_MODES, nomDe } from './config.js';
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
//   civAdverse: le peuple d'en face, quand le scénario y tient ;
//   portes    : 'coins' — les vagues entrent par les trois autres coins de la
//               carte — ; sinon par le coin d'en face seulement ;
//   vagues    : `{ a, troupes, porte }` — l'heure (secondes), ce qui entre, par où ;
//   chef      : `{ type, vie, a, phases }` ; une phase `{ sous, appelle, def, annonce }`
//               se joue une fois, quand sa vie passe sous `sous` pour cent ;
//   but       : `{ genre: 'tenir' }` (toutes les vagues), `{ genre: 'abattre', avant }` ;
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
};

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
 * Les réglages d'une partie de ce scénario (World, js/game.js). `civs` : le
 * peuple du joueur, puis celui qu'il a choisi en face — le scénario impose
 * parfois le sien.
 */
export function optionsDeScenario(ref, civs = []) {
  const r = refDeScenario(ref), def = scenarioDe(r);
  if (!def) return null;
  return {
    scenario: r, mode: def.base, mapSize: GAME_MODES[def.base].mapSize, seed: def.graine,
    civs: [civs[0], def.civAdverse || civs[1]],
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

/** Le nom du monstre-chef d'un scénario, dans la langue du joueur (« Hydre », « Sphinx »). */
export function nomDuChef(def) {
  return def && def.chef ? nomDe(def.chef.type, def.civAdverse) : '';
}

/** Un but à étoile, en une phrase. */
export function texteDuBut(def, but) {
  switch (but.genre) {
    case 'victoire':
      if (def.but && def.but.genre === 'tenir') return txt`Tenir les ${def.vagues.length} vagues`;
      if (def.but && def.but.genre === 'abattre') return txt`Abattre le monstre : ${nomDuChef(def)}`;
      return txt('Gagner la partie');
    case 'net': return txt('Raser le bâtiment principal adverse avant la fin du temps');
    case 'temps': return txt`Gagner en moins de ${Math.round(but.sous / 60)} minutes`;
    case 'pertes': return txt`Gagner en perdant moins de ${but.sous} unités`;
    case 'centre': return but.part === 50 ? txt('Finir avec ton bâtiment principal au moins à moitié de sa vie') : txt`Finir avec ton bâtiment principal au moins à ${but.part} % de sa vie`;
    case 'vague': return txt`Voir arriver la vague ${but.seuil}`;
    default: return '';
  }
}

/** Les trois buts d'un scénario, en phrases. */
export function butsDe(def) {
  return (def.etoiles || []).map((but) => texteDuBut(def, but));
}

/** La consigne de départ d'un scénario, en une phrase : ce qu'il faut faire pour gagner. */
export function consigneDe(def) {
  if (def.but && def.but.genre === 'tenir') return txt`${def.vagues.length} vagues arrivent, une par minute. Défends ton bâtiment principal.`;
  if (def.but && def.but.genre === 'abattre') return txt`Un monstre approche : ${nomDuChef(def)}, ${nombreLocal(def.chef.vie)} points de vie. Abats-le en moins de ${Math.round(def.but.avant / 60)} minutes.`;
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
      if (u.state === STATE.IDLE && !u.def.heal) u.attackEntity(cible);
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
    let def = UNIT_TYPES[c.type];
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
      monde.pushEvent({ type: 'vague', numero: this.vague, total: vagues.length, x: porte.x, y: porte.y });
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
   * avant la suivante, la vie du monstre-chef. Rien pour un scénario sans vague
   * ni monstre.
   */
  affichage() {
    const monde = this.monde, vagues = this.def.vagues || [];
    const etat = {};
    if (vagues.length) {
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
  for (const table of [REGLES, SCENARIOS]) {
    for (const fiche of Object.values(table)) { visite(fiche, 'nom'); visite(fiche, 'resume'); }
  }
  // (Le défi du samedi a son résumé à lui.)
  const samedi = { resume: 'Huit vagues, une par minute, sur la carte du jour.' };
  visite(samedi, 'resume');
}
