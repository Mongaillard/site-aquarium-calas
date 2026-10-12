// Réglages d'octobre 2026 : les coutures. Chaque série de réglages a été relue
// seule ; ce fichier tient ce qui ne se voyait qu'une fois toutes fusionnées —
// cloche × Centre-Ville perdu, réparer au doigt × IA Express, raser × prix des
// âges × ancienne sauvegarde, plafond de mémoire × partie figée, civilisations
// × style des personnages et carte du Temple, consigne d'un ordre armé.
// Sans navigateur : les règles se jouent sous Node ; les méthodes de js/main.js
// sont lues dans sa source et jouées sur un faux jeu, comme dans
// reglages-score.test.js.
// Lancement : node test/reglages-integration.test.js

import { World } from '../js/game.js';
import { serializeWorld, restoreWorld } from '../js/save.js';
import {
  AGES, BUILDING_TYPES, CIVILISATIONS, TICKS_PER_SECOND, TILE, ficheDe, nomDe,
} from '../js/config.js';
import { STATE } from '../js/entities.js';
import { UI, toucherArmee } from '../js/ui.js';
import {
  BUDGET_TROUPES_MO, STYLES, prevoirTroupe, setStyleUnites, styleUnites, troupesADecharger, troupesSelonStyle,
} from '../js/sprites.js';
import { txt } from '../js/langue.js';
import { readFileSync } from 'node:fs';

const DT = 1 / TICKS_PER_SECOND;
let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? '  ok  ' : ' FAIL ';
  if (!condition) failures++;
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

/** Un scénario : une exception y compte pour un échec, sans taire les suivants. */
function essai(nom, scenario) {
  try { scenario(); } catch (e) { check(`${nom} (exception)`, false, e.message); }
}

const centre = (w, i = 0) => w.buildings.find((b) => !b.dead && b.playerIndex === i && b.type === 'towncenter');
const villageois = (w, i = 0) => w.units.filter((u) => !u.dead && u.playerIndex === i && u.isVillager);
const messages = (w) => w.drainEvents().filter((e) => e.type === 'notice').map((e) => e.text);
const stock = (w, i = 0) => ({ ...w.players[i].resources });
const ecart = (apres, avant) => Object.fromEntries(Object.keys(avant).filter((k) => apres[k] !== avant[k]).map((k) => [k, apres[k] - avant[k]]));
const pareil = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Un monde sans adversaire qui joue : seules les règles s'y expriment. */
function monde(options) {
  const w = new World({ difficulty: 'normal', ...options });
  w.ais = [];
  w.drainEvents();
  return w;
}
function pas(w, secondes, stop) {
  for (let i = 0; i < secondes * TICKS_PER_SECOND; i++) {
    w.update(DT);
    if (stop && stop()) return true;
  }
  return false;
}
/** Un bâtiment posé d'office à côté du Centre-Ville. */
function batir(w, joueur, type, rang = 0) {
  const depart = w.map.startPositions[joueur];
  return w.spawnBuilding(joueur, type, depart.tx + 4 + rang * 4, depart.ty + 5, true);
}
/** Une troupe posée près du Centre-Ville de `chez` (le sien par défaut). */
function troupe(w, joueur, type, rang = 0, chez = joueur) {
  const c = centre(w, chez);
  return w.spawnUnit(joueur, type, c.x + TILE * (rang % 5 - 2), c.y + TILE * (3 + Math.floor(rang / 5)));
}

/**
 * Le jeu (Game, js/main.js) ne se charge pas sous Node : écrans, toile, son.
 * Ses méthodes sont lues dans sa source et jouées telles quelles sur un faux
 * jeu. `portee` : ce qu'elles prennent au module (fonctions importées, page) ;
 * `txt`, par où passent leurs messages (js/langue.js), en fait toujours partie.
 */
function methodesDe(fichier, noms, portee = {}) {
  portee = { txt, ...portee };
  const source = readFileSync(new URL(fichier, import.meta.url), 'utf8');
  const methode = (nom) => {
    const m = source.match(new RegExp(`\\n  ${nom}\\([^)]*\\) \\{\\n[\\s\\S]*?\\n  \\}\\n`));
    if (!m) throw new Error(`${fichier} : méthode ${nom} introuvable`);
    return m[0];
  };
  return new Function(...Object.keys(portee), `return class {${noms.map(methode).join('')}};`)(...Object.values(portee));
}
/** Une interface qui retient ce qu'elle montre : la consigne (affichée tant qu'elle a un texte) et les messages. */
function fausseInterface() {
  return {
    consigne: '', dits: [],
    setBuildHint(texte) { this.consigne = texte || ''; },
    toast(texte, genre = 'info') { this.dits.push({ texte, genre }); },
    dernier() { return this.dits[this.dits.length - 1] || { texte: '', genre: '' }; },
    refreshSelection() {}, closeBuildMenu() {}, closeWorkerMenu() {}, hideModal() {},
  };
}

console.log('=== Réglages d’octobre : les coutures de la fusion ===\n');

// ---------------------------------------------------------------------------
// 1. Cloche × dernier Centre-Ville perdu : le conseil doit pouvoir se suivre
// ---------------------------------------------------------------------------
console.log('--- Centre-Ville perdu après la cloche ---');
/** Classique, une caserne, la cloche (ou non), puis le Centre-Ville tombe sous l'ennemi : ce que le jeu dit. */
function centrePerdu({ civs, cloche, dehors = 0 }) {
  const w = monde({ seed: 91, mode: 'classique', civs });
  batir(w, 0, 'barracks');
  const tc = centre(w);
  let abrites = 0;
  if (cloche) {
    abrites = w.ringTownBell(0).sheltered;
    pas(w, 40, () => tc.garrison.length === abrites);
  }
  for (let i = 0; i < dehors; i++) troupe(w, 0, 'villager', i);   // formé pendant l'alerte, resté dehors
  const dedans = tc.garrison.length;
  w.drainEvents();
  w.killEntity(tc, troupe(w, 1, 'ram', 0, 0));
  const dits = messages(w);
  w.checkVictory();
  return { w, dits, abrites, dedans, vivants: villageois(w).length };
}
essai('Centre-Ville perdu après la cloche', () => {
  const a = centrePerdu({ civs: ['atlante', 'atlante'], cloche: true });
  check('la cloche abrite tout le village, qui périt avec le Centre-Ville ; la partie continue sur la caserne',
    a.abrites === 4 && a.dedans === 4 && a.vivants === 0 && !a.w.gameOver, `${a.dedans}/${a.abrites} abrités, ${a.vivants} en vie`);
  check('… le jeu ne conseille pas de rebâtir quand plus personne ne peut bâtir',
    a.dits.length === 1 && a.dits[0].includes('Centre-Ville perdu') && !a.dits[0].includes('Rebâtissez')
    && a.dits[0].includes('Plus aucun villageois') && a.dits[0].includes('bâtiments militaires'), a.dits.join(' | ') || 'aucun message');

  const s = centrePerdu({ civs: ['solarien', 'atlante'], cloche: true });
  check('… avec les noms de sa civilisation', s.vivants === 0 && s.dits.length === 1 && s.dits[0].includes('Palais du Soleil perdu')
    && s.dits[0].includes('Plus aucun fellah') && !s.dits[0].includes('Rebâtissez') && !/villageois|Centre-Ville/.test(s.dits[0]),
    s.dits.join(' | ') || 'aucun message');

  // Témoins : dès qu'un villageois survit, le conseil reste « Rebâtissez ».
  const t = centrePerdu({ civs: ['atlante', 'atlante'], cloche: false });
  check('sans cloche, les villageois survivent : « Rebâtissez un Centre-Ville » reste le conseil',
    t.vivants === 4 && t.dits.length === 1 && t.dits[0].includes('Rebâtissez un Centre-Ville'), t.dits.join(' | ') || 'aucun message');
  const u = centrePerdu({ civs: ['atlante', 'atlante'], cloche: true, dehors: 1 });
  check('un seul villageois resté dehors suffit', u.dedans === 4 && u.vivants === 1 && u.dits.length === 1
    && u.dits[0].includes('Rebâtissez un Centre-Ville'), u.dits.join(' | ') || 'aucun message');
});

// ---------------------------------------------------------------------------
// 2. Civilisations × menu Construire : une carte nomme les troupes de son camp
// ---------------------------------------------------------------------------
console.log('\n--- Les cartes du menu Construire ---');
/** Les cartes que l'interface écrit pour ce joueur (le vrai UI.openBuildMenu, sur une fausse liste). */
function cartesDeConstruction(civ) {
  const w = monde({ seed: 91, mode: 'classique', civs: [civ, 'atlante'] });
  w.players[0].age = AGES.length - 1;
  const liste = { innerHTML: '', querySelectorAll: () => [] };
  const ui = Object.create(UI.prototype);
  ui.world = w;
  ui.game = { civ, audio: { play() {} } };
  ui.nodes = { buildMenu: { classList: { add() {}, remove() {} } } };
  const page = globalThis.document;
  globalThis.document = { getElementById: () => liste };
  try { ui.openBuildMenu(); } finally {
    if (page === undefined) delete globalThis.document; else globalThis.document = page;
  }
  const cartes = {};
  for (const m of liste.innerHTML.matchAll(/data-type="(\w+)"[\s\S]*?bc-name">([^<]*)<[\s\S]*?bc-desc">([^<]*)</g)) cartes[m[1]] = { nom: m[2], desc: m[3] };
  return cartes;
}
essai('cartes du menu Construire', () => {
  const sol = cartesDeConstruction('solarien'), atl = cartesDeConstruction('atlante');
  check('le menu montre une carte par bâtiment', Object.keys(sol).length === Object.keys(BUILDING_TYPES).length
    && Object.keys(atl).length === Object.keys(BUILDING_TYPES).length, `${Object.keys(sol).length} cartes`);
  const pretres = nomDe('priest', 'solarien', 2);
  check('Solariens : la carte du Temple annonce la troupe que son bouton forme (les Prêtres du Soleil)',
    BUILDING_TYPES.temple.trains.includes('priest') && !!sol.temple && sol.temple.nom === 'Temple du Soleil'
    && sol.temple.desc.includes(pretres) && !sol.temple.desc.includes('Prêtresse'), sol.temple ? sol.temple.desc : 'pas de carte');
  check('Atlantes : la carte du Temple garde ses Prêtresses', !!atl.temple && atl.temple.desc.includes('Prêtresses'), atl.temple ? atl.temple.desc : 'pas de carte');

  // Le garde-fou, pour toute civilisation qui renomme : aucun nom qu'elle a remplacé ne traîne sur une de ses cartes.
  for (const civ of Object.keys(CIVILISATIONS)) {
    const remplaces = Object.keys(CIVILISATIONS[civ].noms)
      .filter((type) => nomDe(type, civ) !== nomDe(type, 'atlante')).map((type) => nomDe(type, 'atlante'));
    if (remplaces.length === 0) continue;
    const cartes = civ === 'solarien' ? sol : cartesDeConstruction(civ);
    const fautes = [];
    for (const [type, carte] of Object.entries(cartes)) {
      for (const nom of remplaces) if (carte.desc.toLowerCase().includes(nom.toLowerCase())) fautes.push(`${carte.nom} (${type}) dit « ${nom} »`);
    }
    check(`${CIVILISATIONS[civ].name} : aucune carte ne nomme une troupe ou un bâtiment sous le nom d’une autre civilisation`,
      fautes.length === 0, fautes.join(' ; ') || `${remplaces.length} nom(s) remplacé(s) cherché(s)`);
  }
});

// ---------------------------------------------------------------------------
// 3. La consigne d'un ordre armé part avec lui (Stop, croix, pose, partie suivante)
// ---------------------------------------------------------------------------
console.log('\n--- La consigne d’un ordre armé ---');
function jeuDesOrdres(w, ui = fausseInterface()) {
  const page = { removeEventListener() {}, getElementById: () => ({ classList: { add() {} } }) };
  const Jeu = methodesDe('../js/main.js', [
    'desarmer', 'lacherSelection', 'selectArmy', 'stopSelection', 'toggleAttackMove', 'toggleRally', 'toggleGarrison',
    'startBuildMode', 'cancelBuild', 'destroy',
  ], { nomDe, ficheDe, toucherArmee, rendreVariantes() {}, document: page, window: page });
  const jeu = new Jeu();
  Object.assign(jeu, {
    world: w, ui, civ: w.players[w.humanIndex].civ, selection: [], buildMode: null,
    attackMoveArmed: false, rallyArmed: false, garrisonArmed: false, running: true,
    camera: { viewWidth: 0, viewHeight: 0, screenToWorld: () => ({ x: 0, y: 0 }), centerOn() {} },
    renderer: { ghost: null, viderTroncons() {} }, audio: { play() {} }, ecouteurs: { abort() {} },
    updateGhostWorld() { this.renderer.ghost = this.buildMode; },
    setSelection(liste) { this.selection = liste.filter((e) => e && !e.dead); },
    saveNow() {}, fermerMarque() {},
  });
  jeu.arme = () => jeu.attackMoveArmed || jeu.rallyArmed || jeu.garrisonArmed;
  return jeu;
}
essai('consigne d’un ordre armé', () => {
  const w = monde({ seed: 91, mode: 'classique' });
  const soldats = [troupe(w, 0, 'militia', 0), troupe(w, 0, 'militia', 1)];
  const jeu = jeuDesOrdres(w);
  const ui = jeu.ui;

  jeu.setSelection(soldats);
  jeu.toggleAttackMove();
  const armee = jeu.attackMoveArmed && ui.consigne === 'Touchez la zone à attaquer';
  jeu.stopSelection();
  check('« Attaquer ici » puis « Stop » : l’ordre tombe, et sa consigne avec lui', armee && !jeu.arme() && ui.consigne === '',
    `consigne « ${ui.consigne} »`);

  // Tous les ordres armés, toutes les sorties : après, rien d'armé, plus de consigne.
  const ordres = { 'Attaquer ici': 'toggleAttackMove', Ralliement: 'toggleRally', Abriter: 'toggleGarrison' };
  const sorties = { Stop: 'stopSelection', 'la croix': 'lacherSelection', 'la pastille Armée': 'selectArmy' };
  const restes = [];
  for (const [ordre, armer] of Object.entries(ordres)) {
    for (const [sortie, quitter] of Object.entries(sorties)) {
      jeu.setSelection([soldats[0]]);
      jeu[armer]();
      const montree = ui.consigne !== '';
      jeu[quitter]();
      if (!montree || jeu.arme() || ui.consigne !== '') restes.push(`${ordre} puis ${sortie} : « ${ui.consigne} »`);
    }
  }
  check('aucun ordre armé ne laisse sa consigne derrière lui (Stop, croix, pastille Armée)', restes.length === 0, restes.join(' ; '));

  // Une pose en cours a pris la place de la consigne : « Stop » et la pastille ne l'effacent pas.
  const ouvrier = villageois(w)[0];
  for (const [sortie, quitter] of [['Stop', 'stopSelection'], ['la pastille Armée', 'selectArmy']]) {
    jeu.setSelection([ouvrier, soldats[0]]);
    jeu.toggleAttackMove();
    jeu.startBuildMode('house');
    const pose = ui.consigne;
    jeu[quitter]();
    check(`pose en cours, puis ${sortie} : l’ordre armé tombe, la consigne de pose reste tant que le fantôme est là`,
      pose.startsWith('Maison') && !jeu.arme() && !!jeu.buildMode && jeu.renderer.ghost === jeu.buildMode && ui.consigne === pose,
      `consigne « ${ui.consigne} »`);
    jeu.cancelBuild();
  }
  jeu.setSelection([ouvrier]);
  jeu.startBuildMode('house');
  jeu.lacherSelection();
  check('la croix pendant une pose : plus de fantôme, plus de sélection, plus de consigne',
    !jeu.buildMode && jeu.renderer.ghost === null && jeu.selection.length === 0 && ui.consigne === '', `consigne « ${ui.consigne} »`);
  jeu.setSelection([soldats[0]]);
  ui.setBuildHint('Touchez la zone à attaquer');   // une consigne restée là sans ordre armé, d'où qu'elle vienne
  jeu.lacherSelection();
  check('la croix efface toute consigne, même orpheline : après elle, plus rien en main ni à l’écran',
    jeu.selection.length === 0 && ui.consigne === '', `consigne « ${ui.consigne} »`);

  // Partie quittée ordre armé ou pose en cours (abandon, chrono, menu) : la suivante ouvre sans consigne.
  const restesSuivante = [];
  for (const [quoi, faire] of [['« Attaquer ici » armé', (j) => j.toggleAttackMove()], ['« Abriter » armé', (j) => j.toggleGarrison()],
    ['une pose en cours', (j) => j.startBuildMode('towncenter')]]) {
    const avant = jeuDesOrdres(w, ui);
    avant.setSelection([ouvrier, soldats[0]]);
    faire(avant);
    const montree = ui.consigne !== '';
    avant.destroy();
    const suivante = jeuDesOrdres(monde({ seed: 92, mode: 'express' }), ui);   // la page garde la même bulle
    if (!montree || suivante.ui.consigne !== '' || suivante.arme()) restesSuivante.push(`${quoi} : « ${ui.consigne} »`);
  }
  check('partie quittée avec une consigne à l’écran : la partie suivante n’en hérite pas', restesSuivante.length === 0, restesSuivante.join(' ; '));
});

// ---------------------------------------------------------------------------
// 4. Réparer au doigt × IA : un ouvrier ne rend pas le Centre-Ville imprenable
// ---------------------------------------------------------------------------
console.log('\n--- L’IA et les réparateurs ---');
essai('l’IA chasse les réparateurs', () => {
  // Le siège : quatre miliciens et un bélier de l'IA sur le Centre-Ville du joueur, un ouvrier envoyé le réparer.
  const w = new World({ seed: 4242, mode: 'express', difficulty: 'hard' });
  const tc = centre(w);
  tc.hp = tc.maxHp * 0.6;
  const soldats = [0, 1, 2, 3].map((i) => troupe(w, 1, 'militia', i, 0));
  const belier = troupe(w, 1, 'ram', 4, 0);
  for (const u of [...soldats, belier]) u.attackEntity(tc);
  const ia = w.ais.find((a) => a.index === 1);
  // Un villageois au pied du mur qui court s'abriter dans le bâtiment frappé n'est pas un réparateur.
  const fuyard = w.spawnUnit(0, 'villager', tc.x, tc.y - TILE * 2.5);
  const enRoute = fuyard.garrisonAt(tc) && fuyard.state === STATE.GARRISON && fuyard.target === tc;
  ia.survey();
  ia.chasserLesReparateurs();
  check('un villageois qui court s’abriter dans le bâtiment frappé ne détourne pas le siège', enRoute && soldats.every((u) => u.target === tc && !u.reprise));
  fuyard.stop();
  const avant = villageois(w).length;
  const ouvrier = villageois(w).filter((v) => v !== fuyard)
    .sort((a, b) => Math.hypot(a.x - tc.x, a.y - tc.y) - Math.hypot(b.x - tc.x, b.y - tc.y))[0];
  const ordre = w.ordreSurAllie([ouvrier], tc);
  const lance = w.commandUnits([ouvrier], tc.x, tc.y, { cible: tc });
  check('des ouvriers en main, toucher son Centre-Ville abîmé lance la réparation', ordre === 'repair' && !!lance && lance.kind === 'repair'
    && ouvrier.state === STATE.BUILD && ouvrier.target === tc, `${ordre}, ${lance && lance.kind}`);

  let belierDetourne = false;
  const surLui = () => soldats.filter((u) => !u.dead && u.target === ouvrier).length;
  const vise = pas(w, 25, () => { belierDetourne = belierDetourne || belier.target !== tc; return surLui() > 0; });
  check('les soldats de l’IA qui frappent le bâtiment se retournent contre l’ouvrier qui le répare', vise,
    vise ? `${surLui()} soldat(s) sur lui à ${w.time.toFixed(1)} s` : `personne en 25 s, Centre-Ville ${Math.round(tc.hp)}/${tc.maxHp}`);
  const tue = pas(w, 25, () => { belierDetourne = belierDetourne || belier.target !== tc; return ouvrier.dead; });
  check('… le réparateur n’y survit pas', tue, `ouvrier ${ouvrier.dead ? 'tué' : Math.round(ouvrier.hp) + ' pv'} à ${w.time.toFixed(1)} s`);
  pas(w, 3);
  const revenus = soldats.filter((u) => !u.dead && u.state === STATE.ATTACK && u.target === tc && !u.reprise).length;
  check('… puis ils reprennent le bâtiment, sans s’en prendre aux villageois qui ne réparent pas',
    revenus === soldats.filter((u) => !u.dead).length && revenus > 0 && villageois(w).length === avant - 1 && !fuyard.dead,
    `${revenus} soldat(s) sur le Centre-Ville, ${villageois(w).length} villageois en vie`);
  check('… le bélier, lui, n’a pas quitté son mur', !belierDetourne && !belier.dead && belier.target === tc);
});

/**
 * Une partie Express entière contre l'IA, joueur sans armée. Son seul geste :
 * dès que le Centre-Ville est entamé, un ouvrier (le plus proche, remplacé
 * s'il meurt) reçoit l'ordre du toucher, au plus une fois toutes les 30 s.
 */
function partieDuReparateur(seed, difficulty) {
  const w = new World({ seed, mode: 'express', difficulty });
  const tc = centre(w);
  let ouvrier = null, prochain = 0, ordres = 0, pvMin = tc.maxHp;
  while (!w.gameOver && w.time < w.mode.timeLimit + 60) {   // (le chrono d'Express finit la partie à coup sûr)
    w.update(DT);
    w.drainEvents();
    if (tc.dead) continue;
    pvMin = Math.min(pvMin, tc.hp);
    if (tc.hp >= tc.maxHp || w.time < prochain) continue;
    if (!ouvrier || ouvrier.dead) {
      ouvrier = villageois(w).filter((v) => !v.garrisonedIn)
        .sort((a, b) => Math.hypot(a.x - tc.x, a.y - tc.y) - Math.hypot(b.x - tc.x, b.y - tc.y))[0] || null;
    }
    if (ouvrier && w.ordreSurAllie([ouvrier], tc) === 'repair' && w.commandUnits([ouvrier], tc.x, tc.y, { cible: tc })) {
      ordres++;
      prochain = w.time + 30;
    }
  }
  return { w, tc, ordres, pvMin };
}
essai('Express : le Centre-Ville réparé finit par tomber', () => {
  for (const [seed, difficulty] of [[4242, 'hard'], [5, 'normal']]) {
    const { w, tc, ordres, pvMin } = partieDuReparateur(seed, difficulty);
    check(`Express ${difficulty}, graine ${seed} : un ouvrier renvoyé à la réparation toutes les 30 s ne sauve plus le Centre-Ville — l’IA gagne par son objectif`,
      ordres > 0 && tc.dead && !!w.gameOver && !w.gameOver.timeUp && w.gameOver.victory === false && w.time < w.mode.timeLimit,
      `${tc.dead ? 'tombé à ' + Math.round(w.time) + ' s' : 'debout au temps, au plus bas ' + Math.round(pvMin) + '/' + tc.maxHp}, ${ordres} ordre(s), ${villageois(w).length} villageois en vie`);
  }
});

// ---------------------------------------------------------------------------
// 5. Raser × prix des âges × ancienne sauvegarde : on rend ce qui a été payé
// ---------------------------------------------------------------------------
console.log('\n--- Passage d’âge remboursé au prix payé ---');
/** Un passage d'âge en cours (les bâtiments exigés posés), sauvegardé ; `ancienne` : comme l'écrivait le jeu d'avant ces réglages. */
function passageSauve(mode, ancienne) {
  const w = monde({ seed: 7, mode });
  const p = w.players[0];
  p.resources = { food: 2000, wood: 2000, gold: 2000 };
  ['barracks', 'mill', 'archery', 'stable'].forEach((type, rang) => batir(w, 0, type, rang));
  const avant = stock(w);
  const lance = w.advanceAge(centre(w));
  const paye = ecart(avant, stock(w));
  pas(w, 8);
  const sauve = JSON.parse(JSON.stringify(serializeWorld(w)));
  if (ancienne) delete sauve.players[0].ageProgress.cost;   // le champ n'existait pas
  return { lance, paye, sauve };
}
function raserLePorteur(sauve) {
  const w = restoreWorld(sauve);
  const p = w.players[0];
  const avant = stock(w);
  const bilan = w.raserBatiment(p.ageProgress.building);
  return { rendu: ecart(stock(w), avant), bilan, passage: p.ageProgress };
}
essai('passage d’âge remboursé au prix payé', () => {
  const anciens = { classique: { food: 300 }, express: { food: 500, gold: 150 } };   // les prix d'avant octobre 2026
  for (const mode of ['classique', 'express']) {
    const neuf = passageSauve(mode, false);
    const prix = AGES[neuf.sauve.players[0].age + 1].cost;
    const r = raserLePorteur(neuf.sauve);
    check(`${mode} : un passage lancé puis repris d’une sauvegarde rend, Centre-Ville rasé, ce qu’il a coûté`,
      neuf.lance && pareil(neuf.paye, prix) && pareil(r.rendu, prix) && r.bilan.rembourse && r.passage === null,
      `payé ${JSON.stringify(neuf.paye)}, rendu ${JSON.stringify(r.rendu)}`);

    // La même sauvegarde, écrite avant ces réglages : le passage y avait coûté l'ancien prix.
    const vieux = raserLePorteur(passageSauve(mode, true).sauve);
    check(`${mode} : repris d’une sauvegarde d’avant les nouveaux prix, il rend l’ancien prix — pas davantage`,
      pareil(vieux.rendu, anciens[mode]) && !pareil(anciens[mode], prix) && vieux.bilan.rembourse,
      `payé alors ${JSON.stringify(anciens[mode])}, rendu ${JSON.stringify(vieux.rendu)}, prix du jour ${JSON.stringify(prix)}`);
  }
  // Le prix noté traverse la sauvegarde, et la reprise ne change rien à la suite de la partie.
  const { sauve } = passageSauve('classique', false);
  const w = restoreWorld(sauve);
  check('le prix payé est noté avec le passage et traverse la sauvegarde', pareil(sauve.players[0].ageProgress.cost, AGES[1].cost)
    && pareil(w.players[0].ageProgress.cost, AGES[1].cost) && pareil(JSON.parse(JSON.stringify(serializeWorld(w))).players[0], sauve.players[0]));
  pas(w, AGES[1].time);
  check('… et le passage repris aboutit comme avant', w.players[0].age === 1 && w.players[0].ageProgress === null);
});

// ---------------------------------------------------------------------------
// 6. Plafond de mémoire × partie figée : un corps à terre garde sa troupe
// ---------------------------------------------------------------------------
console.log('\n--- Les corps à terre et la mémoire des troupes ---');
/**
 * Le ménage tel que le jeu le fait (Game.veiller, une fois par seconde
 * d'horloge réelle, que la partie tourne ou non), sur un vrai monde : seul
 * entretenirMemoire est remplacé, par la règle pure qu'il applique — la troupe
 * d'un couple est « vue » tant que le jeu le dit en jeu, et troupesADecharger
 * désigne celles à rendre. Chaque troupe pèse le budget à elle seule.
 */
function menage(w) {
  const vu = new Map(), rendues = [];
  const Jeu = methodesDe('../js/main.js', ['veiller', 'troupesEnJeu'], {
    TEMOIN_INTERVAL: 5,
    entretenirMemoire(maintenant, enJeu) {
      for (const [type, civ] of enJeu) vu.set(`${type}|${civ}`, maintenant);
      const troupes = [...vu].map(([cle, t]) => ({ cle, octets: BUDGET_TROUPES_MO * 1048576, vu: t, relisible: true }));
      for (const cle of troupesADecharger(troupes, maintenant, BUDGET_TROUPES_MO * 1048576)) { vu.delete(cle); rendues.push(cle); }
    },
  });
  const jeu = new Jeu();
  Object.assign(jeu, { world: w, prochainTemoin: 0, marquer() {}, horloge: 0, rendues });
  /** `secondes` d'horloge réelle ; la simulation n'avance que si la partie tourne. */
  jeu.attendre = (secondes, figee) => {
    for (let i = 0; i < secondes; i++) {
      if (!figee) pas(w, 1);
      jeu.horloge += 1000;
      jeu.veiller(jeu.horloge);
    }
  };
  return jeu;
}
essai('corps à terre', () => {
  const w = monde({ seed: 91, mode: 'classique', civs: ['solarien', 'atlante'] });
  const jeu = menage(w);
  const enJeu = (type, civ) => jeu.troupesEnJeu().some(([t, c]) => t === type && c === civ);
  const corps = () => w.effects.filter((fx) => fx.kind === 'cadavre').length;
  const hydre = troupe(w, 1, 'hydra', 0), garde = troupe(w, 0, 'militia', 1), champion = troupe(w, 1, 'champion', 2);
  jeu.attendre(3, false);
  check('une troupe en vie est « en jeu », dans sa civilisation', enJeu('hydra', 'atlante') && enJeu('militia', 'solarien') && !enJeu('militia', 'atlante'));

  // La dernière Hydre et le dernier Garde tombent, et la partie se fige aussitôt (menu de pause, écran de fin).
  w.killEntity(hydre, garde);
  w.killEntity(garde, champion);
  check('un corps à terre garde sa troupe « en jeu » : elle est encore dessinée', corps() === 2 && enJeu('hydra', 'atlante') && enJeu('militia', 'solarien'),
    `${corps()} corps`);
  jeu.attendre(600, true);
  check('partie figée dix minutes, les corps toujours à l’écran : leurs troupes ne sont jamais rendues (puis relues à l’image suivante)',
    corps() === 2 && !jeu.rendues.includes('hydra|atlante') && !jeu.rendues.includes('militia|solarien'), `rendues : ${jeu.rendues.join(', ') || 'aucune'}`);

  // La partie reprend : les corps s'effacent, et le plafond retrouve ses droits deux minutes plus tard.
  jeu.attendre(10, false);
  check('la partie reprend : le corps effacé, la troupe sans unité n’est plus « en jeu »',
    corps() === 0 && !enJeu('hydra', 'atlante') && !enJeu('militia', 'solarien') && enJeu('champion', 'atlante'));
  jeu.attendre(130, false);
  check('… et deux minutes plus tard le plafond la décharge, comme avant', jeu.rendues.includes('hydra|atlante') && jeu.rendues.includes('militia|solarien')
    && !jeu.rendues.includes('champion|atlante'), `rendues : ${jeu.rendues.join(', ') || 'aucune'}`);
});

// ---------------------------------------------------------------------------
// 7. Civilisations × style des personnages : le message dit ce que l'écran montre
// ---------------------------------------------------------------------------
console.log('\n--- Le style des personnages ---');
/** Le joueur touche chaque style du menu de pause : ce que le jeu lui répond. */
function reponsesAuxStyles(civs, webgl = true) {
  const garde = new Map();
  const Jeu = methodesDe('../js/main.js', ['setStyleUnites'], {
    setStyleUnites, styleUnites, troupesSelonStyle, nomDe, CIVILISATIONS, STYLE_KEY: 'style',
    webglDisponible: () => webgl, localStorage: { setItem: (k, v) => garde.set(k, v) },
  });
  const jeu = new Jeu();
  jeu.world = monde({ seed: 91, mode: 'classique', civs });
  jeu.civ = civs[0];
  jeu.ui = fausseInterface();
  const reponses = {};
  for (const s of STYLES) {
    jeu.setStyleUnites(s.id);
    reponses[s.id] = garde.get('style') === s.id ? jeu.ui.dernier().texte : `style non retenu (${garde.get('style')})`;
  }
  setStyleUnites('3d');
  return reponses;
}
const dit = (reponses) => Object.entries(reponses).map(([id, texte]) => `${id} : « ${texte} »`).join(' ; ');
const AUTRES_STYLES = STYLES.map((s) => s.id).filter((id) => id !== '3d');
essai('style des personnages', () => {
  check('les troupes qui suivent le style : cinq chez les Atlantes, aucune chez les Solariens (chacune a son modèle)',
    pareil(troupesSelonStyle('atlante'), ['militia', 'villager', 'archer', 'spearman', 'scout']) && troupesSelonStyle('solarien').length === 0,
    `${troupesSelonStyle('atlante').join(', ')} | ${troupesSelonStyle('solarien').join(', ') || 'aucune'}`);

  const atl = reponsesAuxStyles(['atlante', 'solarien']);
  check('joueur atlante : les messages d’avant, le chevalier d’essai sous le nom du Milicien',
    atl['3d'] === 'Personnages : tes modèles 3D animés' && atl.anime === 'Personnages : marche dessinée' && atl.peint === 'Personnages : illustration peinte'
    && atl['3d-precalc'] === 'Milicien : chevalier d’essai rendu à l’avance' && atl['3d-direct'] === 'Milicien : chevalier d’essai animé en direct', dit(atl));
  check('… sans WebGL, la 3D en direct prévient toujours', reponsesAuxStyles(['atlante', 'atlante'], false)['3d-direct'].includes('WebGL indisponible'));

  const sol = reponsesAuxStyles(['solarien', 'solarien']);
  check('Solariens contre Solariens : rien ne suit le style, et le jeu le dit au lieu d’annoncer un changement',
    AUTRES_STYLES.every((id) => sol[id].includes('rien ne change') && !sol[id].startsWith('Personnages')), dit(sol));
  const mixte = reponsesAuxStyles(['solarien', 'atlante']);
  check('Solarien contre Atlantes : seules les troupes adverses changent, et le jeu le dit',
    AUTRES_STYLES.every((id) => mixte[id].includes('seules les troupes des Atlantes changent')), dit(mixte));
  const etrangers = [...Object.values(sol), ...Object.values(mixte)].filter((texte) => texte.includes(nomDe('militia', 'atlante')));
  check('un joueur solarien ne lit jamais « Milicien » : sa troupe s’appelle le Garde', etrangers.length === 0, etrangers.join(' | '));
});

// Sans WebGL, les modèles des Solariens ne se préparent pas : leurs troupes
// retombent sur les dessins atlantes, et le style agit de nouveau sur elles.
// (En dernier : l'échec des modèles reste retenu pour la suite du processus.)
async function styleSansModeles() {
  const garde = { document: globalThis.document, fetch: globalThis.fetch, warn: console.warn };
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
  globalThis.fetch = async () => { throw new Error('hors ligne'); };
  console.warn = () => {};
  try {
    for (const type of troupesSelonStyle('atlante')) prevoirTroupe(type, 'solarien');
    for (let i = 0; i < 50 && troupesSelonStyle('solarien').length < 5; i++) await new Promise((suite) => setTimeout(suite, 10));
  } finally {
    if (garde.document === undefined) delete globalThis.document; else globalThis.document = garde.document;
    globalThis.fetch = garde.fetch;
    console.warn = garde.warn;
  }
  const suivent = troupesSelonStyle('solarien');
  check('modèles solariens impossibles à préparer : leurs troupes suivent de nouveau le style', suivent.includes('militia') && suivent.length === 5,
    suivent.join(', ') || 'aucune');
  const sol = reponsesAuxStyles(['solarien', 'solarien']);
  check('… et le message redevient celui du style, au nom du Garde', sol.anime === 'Personnages : marche dessinée'
    && sol['3d-precalc'] === 'Garde : chevalier d’essai rendu à l’avance' && sol['3d-direct'] === 'Garde : chevalier d’essai animé en direct', dit(sol));
}
try { await styleSansModeles(); } catch (e) { check('style sans modèles (exception)', false, e.message); }

console.log(`\n${failures === 0 ? '✅ Tous les tests passent' : '❌ ' + failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
