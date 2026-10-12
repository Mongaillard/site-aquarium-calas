// ---------------------------------------------------------------------------
// La partie guidée : le tutoriel du jeu.
//
// Une vraie partie, sans adversaire qui joue, où le guide demande une chose à
// la fois. Tant qu'elle n'est pas faite, il n'avance pas ; il montre où poser
// le doigt (js/guide-ecran.js) et dit sa consigne à voix haute quand la voix
// existe dans la langue du joueur (assets/voix/).
//
// Ce module ne touche ni à l'écran ni au son : il lit la partie et dit où on
// en est. Il se teste sans navigateur (test/guide.test.js).
// ---------------------------------------------------------------------------

import { TILE, BUILDING_TYPES, nomDe, ficheDe } from './config.js';
import { villagerTask } from './entities.js';
import { txt } from './langue.js';

/** La carte du guide est toujours la même : le doigt sait où pointer. */
export const GRAINE_DU_GUIDE = 20261012;
/** Les renforts offerts avant l'assaut, et les points de vie de la cible : elle tombe en quelques secondes. */
export const RENFORTS = 3;
export const VIE_DE_LA_CIBLE = 60;
const TROUPE = 'militia';
const CIBLE = 'house';

/**
 * Les réglages de la partie guidée : le format le plus court (réserves
 * pleines, caserne déjà bâtie), sur sa toute petite carte, et personne en
 * face — la place adverse est « distante », aucun ordinateur ne la joue.
 */
export function partieGuidee(civs) {
  return {
    mode: 'escarmouche', mapSize: 'tiny', difficulty: 'easy', speed: 'normal',
    civs, seed: GRAINE_DU_GUIDE, places: ['local', 'distant'], tutoriel: true,
  };
}

// --- Ce que le guide lit dans la partie --------------------------------------

const centre = (tx, ty, taille = 1) => ({ x: (tx + taille / 2) * TILE, y: (ty + taille / 2) * TILE });
const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const lePlusPres = (liste, point) => liste.reduce((mieux, e) => (!mieux || distance2(e, point) < distance2(mieux, point) ? e : mieux), null);

function mesOuvriers(g) {
  return g.monde.units.filter((u) => !u.dead && u.playerIndex === g.moi && u.isVillager && !u.garrisonedIn);
}
function mesSoldats(g) {
  return g.monde.units.filter((u) => !u.dead && u.playerIndex === g.moi && !u.isVillager && !u.isAnimal && !u.garrisonedIn);
}
function enMain(g, filtre) {
  return g.jeu.selection.filter((e) => !e.dead && e.playerIndex === g.moi && filtre(e));
}
const ouvriersEnMain = (g) => enMain(g, (e) => e.kind === 'unit' && e.isVillager);
const soldatsEnMain = (g) => enMain(g, (e) => e.kind === 'unit' && !e.isVillager && !e.isAnimal);

function maCaserne(g) {
  return g.monde.buildings.find((b) => !b.dead && b.complete && b.playerIndex === g.moi && b.type === 'barracks') || null;
}
function monCentre(g) {
  return g.monde.buildings.find((b) => !b.dead && b.playerIndex === g.moi && b.type === 'towncenter') || null;
}
function mesMaisons(g) {
  return g.monde.buildings.filter((b) => !b.dead && b.playerIndex === g.moi && b.type === 'house').length;
}

/** L'ouvrier à montrer : celui qu'on a déjà montré s'il vit encore, sinon le plus proche du centre de la vue. */
function ouvrierAMontrer(g) {
  const ouvriers = mesOuvriers(g);
  const garde = ouvriers.find((u) => u.id === g.memo.ouvrier);
  if (garde) return garde;
  const choisi = lePlusPres(ouvriers, g.jeu.camera);
  g.memo.ouvrier = choisi ? choisi.id : null;
  return choisi;
}

/** L'arbre le plus proche d'un point, en coordonnées du monde. */
export function arbreLePlusPres(monde, point) {
  let mieux = null;
  for (const res of monde.map.resources.values()) {
    if (res.type !== 'wood' || res.amount <= 0) continue;
    const p = centre(res.tx, res.ty);
    if (!mieux || distance2(p, point) < distance2(mieux, point)) mieux = p;
  }
  return mieux;
}

/** Une place libre pour un bâtiment, au plus près d'un point : en spirale, case par case. */
export function placeLibre(monde, joueur, type, point, { de = 2, jusqua = 12, sansBrouillard = false } = {}) {
  const taille = BUILDING_TYPES[type].size;
  const tx0 = Math.round(point.x / TILE - taille / 2), ty0 = Math.round(point.y / TILE - taille / 2);
  for (let r = de; r <= jusqua; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (monde.canPlace(joueur, type, tx0 + dx, ty0 + dy, sansBrouillard)) return { tx: tx0 + dx, ty: ty0 + dy, ...centre(tx0 + dx, ty0 + dy, taille) };
      }
    }
  }
  return null;
}

/** La troupe que le guide fait former : le milicien, ou la première que la caserne sait former. */
function troupeAFormer(g) {
  const caserne = maCaserne(g);
  const interdites = g.monde.players[g.moi].interdites;
  const possibles = (caserne ? caserne.def.trains || [] : []).filter((t) => !interdites || !interdites.has(t));
  return possibles.includes(TROUPE) ? TROUPE : possibles[0] || TROUPE;
}

// --- Les cibles : où le doigt se pose ------------------------------------------
//   { monde: {x, y} }         un point de la carte ;
//   { element: '#btn' }       un bouton de l'écran ;
//   { commande: (b) => … }    un bouton du panneau de commandes (ils n'ont pas de nom fixe) ;
//   geste : 'toucher' (par défaut), 'double', 'glisser', 'rectangle' (de `monde` à `vers`).

const surLeMonde = (point, geste = 'toucher', vers = null) => (point ? { monde: { x: point.x, y: point.y }, geste, ...(vers ? { vers } : {}) } : null);
const surLEcran = (element) => ({ element, geste: 'toucher' });

// --- Les étapes ----------------------------------------------------------------
//   voix    : le nom de la phrase dite (assets/voix/<langue>/<voix>.mp4), ou rien ;
//   texte   : la consigne à l'écran (elle peut suivre où en est le joueur) ;
//   suite   : le mot du bouton, pour une étape qui ne demande qu'à être lue ;
//   debut   : ce que le guide prépare en y entrant ;
//   cible   : où le doigt se pose ;
//   faite   : la chose demandée est-elle faite ?

export const ETAPES = [
  {
    id: 'bienvenue', voix: 'bienvenue', suite: () => txt('Commencer'),
    texte: () => txt('Bienvenue, chef. Ici, tout le monde t’obéit au doigt et à l’œil.'),
  },
  {
    id: 'carte', voix: 'carte',
    texte: () => txt('Glisse un doigt pour parcourir la carte. Pince pour zoomer.'),
    debut: (g) => { g.memo.vue = { x: g.jeu.camera.x, y: g.jeu.camera.y, zoom: g.jeu.camera.zoom }; g.memo.parcouru = 0; },
    cible: () => ({ geste: 'glisser' }),
    // (Deux cases de carte parcourues, ou un zoom franc : le geste est compris.)
    suivre: (g) => {
      const { vue } = g.memo, camera = g.jeu.camera;
      g.memo.parcouru += Math.hypot(camera.x - vue.x, camera.y - vue.y);
      g.memo.zoome = g.memo.zoome || Math.abs(camera.zoom / vue.zoom - 1) > 0.12;
      g.memo.vue = { x: camera.x, y: camera.y, zoom: vue.zoom };
    },
    faite: (g) => g.memo.parcouru > TILE * 2 || !!g.memo.zoome,
  },
  {
    id: 'choisir', voix: 'choisir',
    texte: () => txt('Touche une unité pour la choisir. Touche-la deux fois, et toutes ses semblables suivent.'),
    debut: (g) => { g.jeu.setSelection([]); g.voir(ouvrierAMontrer(g)); },
    cible: (g) => surLeMonde(ouvrierAMontrer(g)),
    faite: (g) => enMain(g, (e) => e.kind === 'unit').length > 0,
  },
  {
    id: 'semblables',
    texte: () => txt('Maintenant, touche-la deux fois de suite : toutes ses semblables à l’écran sont choisies.'),
    cible: (g) => surLeMonde(enMain(g, (e) => e.kind === 'unit')[0] || ouvrierAMontrer(g), 'double'),
    faite: (g) => g.notes.double > 0 && enMain(g, (e) => e.kind === 'unit').length > 1,
  },
  {
    id: 'rectangle', voix: 'rectangle',
    texte: () => txt('Appuie longtemps, puis glisse : tu traces un rectangle, et tout ce qui est dedans t’écoute.'),
    debut: (g) => { g.jeu.setSelection([]); g.voir(ouvrierAMontrer(g)); },
    cible: (g) => {
      const ouvriers = mesOuvriers(g);
      if (!ouvriers.length) return null;
      const xs = ouvriers.map((u) => u.x), ys = ouvriers.map((u) => u.y), marge = TILE * 0.9;
      return surLeMonde({ x: Math.min(...xs) - marge, y: Math.min(...ys) - marge }, 'rectangle',
        { x: Math.max(...xs) + marge, y: Math.max(...ys) + marge });
    },
    faite: (g) => g.notes.rectangle > 0 && enMain(g, (e) => e.kind === 'unit').length > 0,
  },
  {
    id: 'ordres', voix: 'ordres',
    texte: (g) => (ouvriersEnMain(g).length
      ? txt('Maintenant, montre-leur quoi faire. Touche un arbre : ils coupent. Touche le sol : ils y vont. Touche un ennemi : ils s’en occupent.')
      : txt('Choisis d’abord un ouvrier : touche-le.')),
    debut: (g) => { g.memo.bucherons = mesOuvriers(g).filter((u) => villagerTask(u) === 'wood').length; },
    cible: (g) => {
      const equipe = ouvriersEnMain(g);
      if (!equipe.length) return surLeMonde(ouvrierAMontrer(g));
      return surLeMonde(arbreLePlusPres(g.monde, equipe[0]));
    },
    faite: (g) => g.notes.ordre > 0 && mesOuvriers(g).filter((u) => villagerTask(u) === 'wood').length > g.memo.bucherons,
  },
  {
    id: 'barre', voix: 'barre',
    texte: () => txt('Tes ouvriers ne quittent jamais leur poste tout seuls. La barre en bas à gauche te dit qui fait quoi, et te laisse changer d’avis.'),
    cible: () => surLEcran('#btn-workers'),
    faite: (g) => g.jeu.menuOuvert('ouvriers'),
  },
  {
    id: 'postes',
    texte: () => txt('Ici, + et − déplacent un ouvrier d’un poste à l’autre. Ferme le panneau pour continuer.'),
    cible: () => surLEcran('#btn-close-workers'),
    faite: (g) => !g.jeu.menuOuvert('ouvriers'),
  },
  {
    id: 'batir', voix: 'batir',
    texte: (g) => {
      const maison = ficheDe(CIBLE, g.jeu.civ).name;
      if (g.jeu.buildMode) return txt`Touche le terrain là où tu veux poser ta ${maison}.`;
      if (g.jeu.menuOuvert('construire')) return txt`Touche « ${maison} » dans la liste.`;
      if (ouvriersEnMain(g).length) return txt('Avec le bois, les vivres et l’or, bâtis ta cité et forme ton armée. Touche « Construire ».');
      return txt('Avec le bois, les vivres et l’or, bâtis ta cité et forme ton armée. Pour bâtir, choisis d’abord un ouvrier.');
    },
    debut: (g) => { g.memo.maisons = mesMaisons(g); g.jeu.setSelection([]); g.voir(ouvrierAMontrer(g)); },
    cible: (g) => {
      if (g.jeu.buildMode) {
        g.memo.place = g.memo.place || placeLibre(g.monde, g.moi, g.jeu.buildMode.type, monCentre(g) || g.jeu.camera, { de: 5 });
        return surLeMonde(g.memo.place);
      }
      if (g.jeu.menuOuvert('construire')) return surLEcran(`#build-list [data-type="${CIBLE}"]`);
      if (ouvriersEnMain(g).length) return { commande: (b) => b.icon === 'chantier', geste: 'toucher' };
      return surLeMonde(ouvrierAMontrer(g));
    },
    faite: (g) => mesMaisons(g) > g.memo.maisons,
  },
  {
    id: 'former',
    texte: (g) => {
      const caserne = ficheDe('barracks', g.jeu.civ).name, soldat = nomDe(troupeAFormer(g), g.jeu.civ);
      return g.jeu.selection.length === 1 && g.jeu.selection[0] === maCaserne(g)
        ? txt`Touche « ${soldat} » : ta ${caserne} le forme.`
        : txt`À présent, un soldat. Touche ta ${caserne}.`;
    },
    debut: (g) => { g.jeu.setSelection([]); g.voir(maCaserne(g)); },
    cible: (g) => {
      const caserne = maCaserne(g);
      if (!caserne) return null;
      if (g.jeu.selection.length === 1 && g.jeu.selection[0] === caserne) {
        const troupe = troupeAFormer(g);
        return { commande: (b) => b.troupe === troupe, geste: 'toucher' };
      }
      return surLeMonde(caserne);
    },
    // (Sans caserne — le joueur l'aurait rasée —, on ne le retient pas ici.)
    faite: (g) => g.notes.formation > 0 || !maCaserne(g),
  },
  {
    id: 'attaquer', voix: 'but',
    texte: (g) => (soldatsEnMain(g).length
      ? txt('Ton but : ne laisser à l’adversaire ni bâtiment principal, ni bâtiment militaire. Touche ce bâtiment ennemi : tes soldats l’attaquent.')
      : txt('Ton but : ne laisser à l’adversaire ni bâtiment principal, ni bâtiment militaire. Des renforts sont là : touche « Armée » pour prendre tous tes soldats.')),
    debut: (g) => {
      g.jeu.setSelection([]);
      const cible = g.poserLaCible();
      g.memo.cible = cible ? cible.id : null;
      g.voir(cible);
    },
    cible: (g) => {
      const cible = g.monde.byId.get(g.memo.cible);
      if (!cible || cible.dead) return null;
      return soldatsEnMain(g).length ? surLeMonde(cible) : surLEcran('#btn-armee');
    },
    faite: (g) => { const cible = g.monde.byId.get(g.memo.cible); return !cible || cible.dead; },
  },
  {
    id: 'express', voix: 'express', suite: () => txt('Continuer'),
    texte: () => txt('En partie Express, son bâtiment principal suffit. Et si le temps s’écoule, le meilleur score l’emporte.'),
  },
  {
    id: 'sauvegarde', voix: 'sauvegarde', suite: () => txt('Continuer'),
    texte: () => txt('Pas d’inquiétude : ta partie se sauvegarde toute seule.'),
  },
  {
    id: 'fin', voix: 'fin', fin: true,
    texte: () => txt('À toi de jouer.'),
  },
];

/** Les phrases dites, une fois chacune : ce que la banque des voix doit contenir. */
export function voixDuGuide() {
  return ETAPES.filter((e) => e.voix).map((e) => e.voix);
}

/**
 * Les langues où le guide parle : ailleurs, il se lit sans rien dire. Une langue n'entre ici qu'avec une voix
 * du pays : la voix française, à qui l'on fait dire de l'anglais ou de l'espagnol, garde son accent
 * (essayé puis retiré le 12/10/2026 — voir assets/voix/SOURCES.md).
 */
export const LANGUES_DITES = ['fr'];

/** Le chemin d'une phrase dite, dans une langue. */
export const cheminDeLaVoix = (langue, nom) => `assets/voix/${langue}/${nom}.mp4`;

// --- Le guide ------------------------------------------------------------------

/**
 * `jeu` : la partie vue par le guide — `world`, `selection`, `camera`, `civ`,
 * `buildMode`, `setSelection(liste)`, `menuOuvert(nom)`, `montrer(x, y)`.
 * `surEtape(etape)` est rappelé à chaque changement d'étape (l'écran, la voix).
 */
export class Guide {
  constructor(jeu, { surEtape = null } = {}) {
    this.jeu = jeu;
    this.monde = jeu.world;
    this.moi = jeu.world.humanIndex;
    this.surEtape = surEtape;
    this.numero = -1;
    this.memo = {};
    this.notes = {};
    this.fini = false;
  }

  /** Le guide commence : à appeler une fois que `surEtape` est branché. */
  demarrer() { this.aller(0); }

  get etape() { return ETAPES[this.numero] || null; }
  get total() { return ETAPES.length; }

  aller(numero) {
    this.numero = numero;
    // (L'ouvrier montré reste le même d'une étape à l'autre : le doigt ne saute pas.)
    this.memo = { ouvrier: this.memo.ouvrier };
    this.notes = { double: 0, rectangle: 0, ordre: 0, formation: 0 };
    const etape = this.etape;
    if (!etape) { this.fini = true; return; }
    if (etape.debut) etape.debut(this);
    if (this.surEtape) this.surEtape(etape);
  }

  /** Un geste du joueur que la partie ne garde nulle part : 'double', 'rectangle', 'ordre', 'formation'. */
  noter(geste) {
    if (geste in this.notes) this.notes[geste]++;
  }

  /** Le bouton d'une étape à lire (« Commencer », « Continuer »). */
  continuer() {
    if (this.etape && this.etape.suite) this.aller(this.numero + 1);
  }

  /** À chaque image : l'étape en cours est-elle faite ? Rend vrai quand le guide vient d'avancer. */
  suivre() {
    const etape = this.etape;
    if (!etape || etape.suite || etape.fin) return false;
    if (etape.suivre) etape.suivre(this);
    if (!etape.faite(this)) return false;
    this.aller(this.numero + 1);
    return true;
  }

  texte() { return this.etape ? this.etape.texte(this) : ''; }
  cible() { return this.etape && this.etape.cible ? this.etape.cible(this) : null; }

  /** Amène la vue sur ce dont l'étape parle. */
  voir(chose) {
    if (chose && this.jeu.montrer) this.jeu.montrer(chose.x, chose.y);
  }

  /**
   * Avant l'assaut : des renforts près de la caserne, et un bâtiment ennemi à
   * portée de vue, presque en ruine. Rend la cible, ou rien si la carte n'a pas
   * de place (l'étape passe alors d'elle-même).
   */
  poserLaCible() {
    const monde = this.monde, depart = maCaserne(this) || monCentre(this);
    if (!depart) return null;
    const ennemi = monde.players.findIndex((p, i) => i !== this.moi && p.equipe !== monde.players[this.moi].equipe);
    const place = ennemi >= 0 ? placeLibre(monde, ennemi, CIBLE, depart, { de: 4, jusqua: 9, sansBrouillard: true }) : null;
    if (!place) return null;
    const cible = monde.spawnBuilding(ennemi, CIBLE, place.tx, place.ty, true);
    cible.hp = Math.min(cible.hp, VIE_DE_LA_CIBLE);
    const sortie = depart.spawnPoint ? depart.spawnPoint() : depart;
    for (let i = 0; i < RENFORTS; i++) {
      const angle = Math.PI * (0.25 + 0.25 * i);
      monde.spawnUnit(this.moi, troupeAFormer(this), sortie.x + Math.cos(angle) * TILE * 1.4, sortie.y + Math.sin(angle) * TILE * 1.4);
    }
    monde.placesOffertes = (monde.placesOffertes || 0) + RENFORTS;
    monde.recomputePopulation();
    monde.updateFog(true);
    return cible;
  }
}
