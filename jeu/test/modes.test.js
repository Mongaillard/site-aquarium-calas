// Les formats de partie ajoutés aux deux d'origine. L'Escarmouche : sa mise en
// place (toute petite carte, réserves pleines, caserne offerte, population
// entière), des parties jouées pour de bon par l'ordinateur — contre lui-même
// et contre un joueur qui ne fait rien —, la trêve du niveau Facile, et la
// table de ses coffres, un cran sous celle des autres formats.
// La garantie qui compte : Express et Classique sont ceux d'avant (leurs
// empreintes sont tenues par da-accueil.test.js et progression-partie.test.js).
// Tout se joue sans navigateur. Lancement : node test/modes.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../js/game.js';
import { serializeWorld, restoreWorld } from '../js/save.js';
import { GAME_MODES, MAP_SIZES, DIFFICULTIES, DEFAULT_MODE, BUILDING_TYPES, TICKS_PER_SECOND, TILE } from '../js/config.js';
import { PROGRESSION as R } from '../js/progression-config.js';
import { profilNeuf, appliquerResultat, tableDesCoffres, verifierProbabilites } from '../js/progression.js';
import { resumeReglages, texteDeConsigne } from '../js/ui.js';
import { formatNumber } from '../js/utils.js';
import { executer, avancer as avancerLeJournal, Journal, ORDRES } from '../js/ordres.js';
import { COULEURS_EQUIPES } from '../js/config.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const DT = 1 / TICKS_PER_SECOND;
let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${detail ? ' — ' + detail : ''}`);
}
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const GRAINES = [1, 7, 42, 808, 4242, 31337];
const de = (w, i, liste) => liste.filter((e) => e.playerIndex === i && !e.dead);
const centre = (w, i) => w.buildings.find((b) => b.playerIndex === i && b.type === 'towncenter' && !b.dead);

/** Joue une partie jusqu'à sa fin (ou `max` secondes) ; rend ce qu'on y a vu. */
function jouer(options, { deuxOrdinateurs = false, max = 400 } = {}) {
  const w = new World(options);
  if (deuxOrdinateurs) w.addAI(0);
  const vu = { w, premierCoup: null, premiereVague: null, formes: [{}, {}], batis: [new Set(), new Set()], ouvriersMax: 0 };
  while (!w.gameOver && w.time < max) {
    w.update(DT);
    for (const e of w.drainEvents()) {
      if (vu.premierCoup === null && (e.type === 'melee' || e.type === 'shoot') && e.combat) vu.premierCoup = w.time;
      if (e.type === 'trained' && e.unit) vu.formes[e.player][e.unit.type] = (vu.formes[e.player][e.unit.type] || 0) + 1;
    }
    if (vu.premiereVague === null && w.ais.some((a) => a.waveCount > 0)) vu.premiereVague = w.time;
    for (const b of w.buildings) vu.batis[b.playerIndex].add(b.type);
    vu.ouvriersMax = Math.max(vu.ouvriersMax, w.units.filter((u) => u.playerIndex === 1 && !u.dead && u.isVillager).length);
  }
  return vu;
}

// ---------------------------------------------------------------------------
console.log('=== Escarmouche ===\n--- Le format ---');
const E = GAME_MODES.escarmouche;
check('cinq formats : Escarmouche, Express, Prise de positions, 2 contre 2, Classique — et le Classique reste celui par défaut',
  Object.keys(GAME_MODES).join() === 'escarmouche,express,positions,deux,classique' && DEFAULT_MODE === 'classique');
check('cinq minutes, sur la carte minuscule, deux fois plus petite que celle d’Express',
  E.timeLimit === 300 && E.mapSize === 'tiny' && MAP_SIZES.tiny.tiles === 48 && MAP_SIZES.tiny.tiles ** 2 * 2 < MAP_SIZES[GAME_MODES.express.mapSize].tiles ** 2);
check('réserves pleines, en chiffres ronds : 1 000 vivres, 1 000 bois, 500 or', E.resources.food === 1000 && E.resources.wood === 1000 && E.resources.gold === 500);
check('on gagne en rasant le bâtiment principal adverse, deux fois plus fragile ; sinon au score', E.victory === 'towncenter' && E.townCenterHp === 0.5);
check('sa description le dit en une ligne', /5 min/.test(E.desc) && /caserne/.test(E.desc) && /score/.test(E.desc));
check('le résumé des réglages le nomme, lui et sa carte',
  /Escarmouche/.test(resumeReglages({ civAdverse: 'atlante', mode: 'escarmouche', difficulty: 'normal', mapSize: 'tiny', speed: 'normal' }))
  && /carte\u00a0minuscule/.test(resumeReglages({ civAdverse: 'atlante', mode: 'escarmouche', difficulty: 'normal', mapSize: 'tiny', speed: 'normal' })));
check('le niveau Facile y laisse une minute et demie de trêve, et le dit', DIFFICULTIES.easy.treve.escarmouche === 90 && /1 min 30 en Escarmouche/.test(DIFFICULTIES.easy.desc));

check('ses réserves s’affichent sans virgule : « 1000 », pas « 1,0k »', formatNumber(1000) === '1000' && formatNumber(1234.7) === '1234' && formatNumber(999.9) === '999' && formatNumber(12345) === '12k' && !/[,.]/.test(formatNumber(9999)));

console.log('--- La mise en place ---');
{
  let ok = { carte: true, batiments: true, troupes: true, age: true, reserves: true, population: true, caserne: true, relie: true };
  const details = [];
  for (const seed of GRAINES) {
    const w = new World({ seed, mode: 'escarmouche' });
    if (w.map.w !== 48 || w.map.h !== 48) ok.carte = false;
    for (const p of w.players) {
      const b = de(w, p.index, w.buildings), u = de(w, p.index, w.units).filter((x) => !x.isAnimal);
      if (b.map((x) => x.type).sort().join() !== 'barracks,towncenter' || !b.every((x) => x.complete)) ok.batiments = false;
      if (u.filter((x) => x.isVillager).length !== 5 || u.filter((x) => x.type === 'scout').length !== 1 || u.length !== 6) ok.troupes = false;
      if (p.age !== 1) ok.age = false;
      if (p.resources.food !== 1000 || p.resources.wood !== 1000 || p.resources.gold !== 500) ok.reserves = false;
      if (p.popCap !== 30 || p.pop !== 6 || w.popMax !== 30) ok.population = false;
      // La caserne : du côté du centre de la carte, à moins de dix cases du bâtiment principal, sans le toucher.
      const tc = b.find((x) => x.type === 'towncenter'), cas = b.find((x) => x.type === 'barracks');
      if (tc && cas) {
        const milieu = { x: w.map.w * TILE / 2, y: w.map.h * TILE / 2 };
        const d = Math.hypot(cas.x - tc.x, cas.y - tc.y) / TILE;
        const versLeCentre = Math.hypot(cas.x - milieu.x, cas.y - milieu.y) < Math.hypot(tc.x - milieu.x, tc.y - milieu.y);
        const separes = cas.tx >= tc.tx + tc.size + 1 || tc.tx >= cas.tx + cas.size + 1 || cas.ty >= tc.ty + tc.size + 1 || tc.ty >= cas.ty + cas.size + 1;
        if (!(d < 10 && versLeCentre && separes)) { ok.caserne = false; details.push(`graine ${seed}, camp ${p.index} : à ${d.toFixed(1)} cases`); }
      } else ok.caserne = false;
    }
    const [a, b] = w.map.startPositions;
    // (Depuis une case libre au pied de chaque bâtiment principal : la sienne est prise.)
    if (!w.map.floodReaches(w.map.findFreeTile(a.tx, a.ty), w.map.findFreeTile(b.tx, b.ty))) ok.relie = false;
    if (Math.min(a.tx, a.ty, b.tx, b.ty, 47 - a.tx, 47 - a.ty, 47 - b.tx, 47 - b.ty) < 9) ok.carte = false;
  }
  check('la carte fait 48 cases de côté, les bases à neuf cases au moins du bord', ok.carte);
  check('chaque camp a son bâtiment principal et une caserne, achevés', ok.batiments);
  check('… cinq ouvriers et un éclaireur', ok.troupes);
  check('… l’Âge Féodal', ok.age);
  check('… 1 000 vivres, 1 000 bois, 500 or', ok.reserves);
  check('… et toute sa population d’emblée : 30 places, pas une maison à bâtir', ok.population);
  check('la caserne est posée du côté du centre de la carte, près du bâtiment principal, sans le toucher', ok.caserne, details.join(' ; '));
  check('les deux bases sont reliées, sur six graines', ok.relie);
  const empreinte = (w) => w.entities.map((e) => `${e.type}:${Math.round(e.x)}:${Math.round(e.y)}:${Math.round(e.hp)}`).join('|');
  const un = jouer({ seed: 4242, mode: 'escarmouche' }, { max: 90 }).w, deux = jouer({ seed: 4242, mode: 'escarmouche' }, { max: 90 }).w;
  check('la même graine donne la même partie', empreinte(un) === empreinte(deux) && un.time === deux.time);
}

console.log('--- L’ordinateur ---');
{
  const parties = GRAINES.map((seed) => jouer({ seed, mode: 'escarmouche', difficulty: 'normal' }, { deuxOrdinateurs: true }));
  check('deux ordinateurs face à face : on se bat avant 1:30, sur six graines', parties.every((p) => p.premierCoup !== null && p.premierCoup < 90), parties.map((p) => (p.premierCoup === null ? 'jamais' : mmss(p.premierCoup))).join(', '));
  check('la partie finit à cinq minutes au plus tard, avec un vainqueur', parties.every((p) => p.w.gameOver && p.w.time <= 300 + DT && p.w.gameOver.winner >= 0), parties.map((p) => mmss(p.w.time)).join(', '));
  check('l’ordinateur ne bâtit qu’une archerie : ni camps, ni fermes, ni maisons — son bois va aux soldats',
    parties.every((p) => p.batis.every((s) => [...s].sort().join() === 'archery,barracks,towncenter')), [...parties[0].batis[1]].join('+'));
  const soldats = (f) => (f.militia || 0) + (f.spearman || 0) + (f.archer || 0);
  check('il forme miliciens, lanciers et archers, vingt soldats au moins par camp', parties.every((p) => p.formes.every((f) => f.militia > 0 && f.spearman > 0 && f.archer > 0 && soldats(f) >= 20)),
    parties.map((p) => p.formes.map(soldats).join('/')).join(', '));
  check('… et peu d’ouvriers : dix au plus', parties.every((p) => p.ouvriersMax <= 10), parties.map((p) => p.ouvriersMax).join(', '));

  const passives = GRAINES.map((seed) => jouer({ seed, mode: 'escarmouche', difficulty: 'normal' }));
  check('contre un joueur qui ne fait rien, il rase son bâtiment principal avant la fin du temps', passives.every((p) => p.w.gameOver && p.w.gameOver.winner === 1 && !centre(p.w, 0) && p.w.time < 300),
    passives.map((p) => mmss(p.w.time)).join(', '));
  check('… mais pas avant deux minutes : le joueur a le temps de lever une armée', passives.every((p) => p.w.time > 120), passives.map((p) => mmss(p.w.time)).join(', '));
  const faciles = GRAINES.slice(0, 3).map((seed) => jouer({ seed, mode: 'escarmouche', difficulty: 'easy' }));
  check('en Facile, aucune vague avant 1:30', faciles.every((p) => p.premiereVague === null || p.premiereVague >= 90), faciles.map((p) => (p.premiereVague === null ? 'aucune' : mmss(p.premiereVague))).join(', '));
}

// ---------------------------------------------------------------------------
console.log('--- Le classement et les coffres ---');
{
  const t = tableDesCoffres('escarmouche'), tous = tableDesCoffres('express');
  check('l’Escarmouche a sa table de coffres ; Express, Classique et un format inconnu ont celle de tous',
    t === R.sources.parFormat.escarmouche && tous === R.sources.partie && tableDesCoffres('classique') === tous && tableDesCoffres('toString') === tous && tableDesCoffres(undefined) === tous);
  check('ses taux, tels que proposés : victoire 35/40/20/5, défaite 75/20/5/0',
    JSON.stringify(t.victoire) === '{"bois":35,"argent":40,"or":20,"legendaire":5}' && JSON.stringify(t.defaite) === '{"bois":75,"argent":20,"or":5,"legendaire":0}');
  const haut = (table) => table.or + table.legendaire;
  check('un cran en dessous : à chaque issue, moins d’or et de légendaire, plus de bois', ['victoire', 'egalite', 'defaite'].every((i) => haut(t[i]) < haut(tous[i]) && t[i].legendaire <= tous[i].legendaire && t[i].bois > tous[i].bois));
  check('… et la victoire y reste meilleure que la défaite', haut(t.victoire) > haut(t.egalite) && haut(t.egalite) > haut(t.defaite));
  check('les tables sont valides : des pour-cent ronds qui somment à 100', verifierProbabilites().valide, verifierProbabilites().erreurs.join(' ; '));
  const coffreDe = (format, tirage) => {
    const r = appliquerResultat(profilNeuf(), { issue: 'victoire', duree: 280, contreOrdinateur: 'echelle', jour: '2026-10-08', alea: () => tirage, format });
    return r.evenements.filter((e) => e.type === 'coffre' && e.origine === 'victoire').map((e) => e.coffre).join();
  };
  check('la même victoire, le même tirage : un coffre d’argent en Express, de bois en Escarmouche', coffreDe('express', 0.3) === 'argent' && coffreDe('escarmouche', 0.3) === 'bois', `${coffreDe('express', 0.3)} / ${coffreDe('escarmouche', 0.3)}`);
  check('… et le légendaire y est deux fois plus rare', coffreDe('express', 0.92) === 'legendaire' && coffreDe('escarmouche', 0.92) === 'or' && coffreDe('escarmouche', 0.96) === 'legendaire');
  const r = appliquerResultat(profilNeuf(), { issue: 'victoire', duree: 280, contreOrdinateur: 'echelle', jour: '2026-10-08', alea: () => 0, format: 'escarmouche' });
  check('elle compte au classement comme les autres : les points de la victoire', r.profil.elo === profilNeuf().elo + R.elo.victoire && r.profil.victoires === 1);
  const main = lire('js/main.js'), ecrans = lire('js/progression-ecrans.js');
  check('la partie dit son format au classement, à sa fin comme à son abandon', /format: this\.world\.modeId/.test(main) && /format: save\.mode/.test(main));
  check('l’écran des coffres montre la table de l’Escarmouche sous celle de tous', /s\.parFormat/.test(ecrans) && /un cran en dessous/.test(ecrans));
}

// ===========================================================================
console.log('\n=== Prise de positions ===\n--- Le format ---');
const P = GAME_MODES.positions, RP = P.positions;
check('trois positions, un cercle de 3 cases, 10 secondes pour prendre, 1 point toutes les 5 secondes, le premier à 200',
  RP.nombre === 3 && RP.rayon === 3 && RP.prise === 10 && RP.pas === 5 && RP.but === 200);
check('la carte et le départ d’Express, quinze minutes au plus', P.mapSize === GAME_MODES.express.mapSize && P.startAge === 1 && P.villagers === 7
  && JSON.stringify(P.resources) === JSON.stringify(GAME_MODES.express.resources) && P.popMax === 40 && P.timeLimit === 900);
check('raser le bâtiment principal adverse gagne aussi — et il y garde tous ses points de vie', P.victory === 'towncenter' && P.townCenterHp === 1);
check('sa description donne la règle en une ligne', /trois positions/.test(P.desc) && /200/.test(P.desc) && /5 s/.test(P.desc));
check('les autres formats n’ont ni positions ni points : leurs parties et leurs sauvegardes sont celles d’avant', ['escarmouche', 'express', 'classique'].every((mode) => {
  const w = new World({ seed: 5, mode });
  return w.positions.length === 0 && !('positions' in w.players[0].stats) && !('positions' in serializeWorld(w)) && !('pasDePoints' in serializeWorld(w));
}));

console.log('--- Les positions sur la carte ---');
{
  const ok = { nombre: true, egales: true, bornes: true, prise: true, abords: true, reliees: true, memes: true, ecartees: true };
  const details = [];
  for (const seed of [...GRAINES, 99, 2026, 77, 123456]) {
    const w = new World({ seed, mode: 'positions' });
    const [a, b] = w.map.startPositions;
    if (w.positions.length !== 3) ok.nombre = false;
    for (const pos of w.positions) {
      const da = Math.hypot(pos.tx - a.tx, pos.ty - a.ty), db = Math.hypot(pos.tx - b.tx, pos.ty - b.ty);
      if (Math.abs(da - db) > 1.5) { ok.egales = false; details.push(`graine ${seed} : ${da.toFixed(1)} / ${db.toFixed(1)}`); }
      if (pos.tx < 6 || pos.ty < 6 || pos.tx > w.map.w - 7 || pos.ty > w.map.h - 7) ok.bornes = false;
      if (!w.map.isBlocked(pos.tx, pos.ty)) ok.prise = false;
      // Autour du monument, le terrain est dégagé : on peut s'y tenir.
      let libres = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if ((dx || dy) && !w.map.isBlocked(pos.tx + dx, pos.ty + dy) && !w.map.resourceAt(pos.tx + dx, pos.ty + dy)) libres++;
      if (libres < 24) ok.abords = false;
      for (const base of [a, b]) if (!w.map.floodReaches(w.map.findFreeTile(base.tx, base.ty), { tx: pos.tx, ty: pos.ty + 1 })) ok.reliees = false;
    }
    const d = (p, q) => Math.hypot(p.tx - q.tx, p.ty - q.ty);
    if (d(w.positions[0], w.positions[1]) < 12 || d(w.positions[1], w.positions[2]) < 12) ok.ecartees = false;
    const milieu = w.positions[1];
    if (Math.abs(milieu.tx - w.map.w / 2) > 1 || Math.abs(milieu.ty - w.map.h / 2) > 1) ok.egales = false;
    if (JSON.stringify(new World({ seed, mode: 'positions' }).positions) !== JSON.stringify(w.positions)) ok.memes = false;
  }
  check('trois positions par carte, sur dix graines', ok.nombre);
  check('chacune à égale distance des deux bases, celle du milieu au centre de la carte', ok.egales, details.join(' ; '));
  check('aucune au bord de la carte, et douze cases au moins entre deux voisines', ok.bornes && ok.ecartees);
  check('la case du monument est prise, le terrain autour est dégagé', ok.prise && ok.abords);
  check('toutes sont reliées aux deux bases', ok.reliees);
  check('la même graine les pose au même endroit', ok.memes);
}

console.log('--- Prendre, tenir, perdre ---');
/** Une partie sans ordinateur ni éclaireurs : seuls comptent les soldats qu'on y pose. */
function terrain(seed = 42) {
  const w = new World({ seed, mode: 'positions' });
  w.ais.length = 0;
  for (const u of w.units) if (!u.isAnimal && !u.isVillager) u.dead = true;
  return w;
}
const poser = (w, camp, type, pos, n = 2, dy = 1.2) => Array.from({ length: n }, (_, i) => {
  const u = w.spawnUnit(camp, type, pos.x + (i - (n - 1) / 2) * 20, pos.y + TILE * dy);
  w.setStance([u], 'passive');   // ils tiennent la place sans se battre : c'est la règle qu'on mesure
  return u;
});
const avancer = (w, secondes, vus = []) => { const pas = Math.round(secondes * TICKS_PER_SECOND); for (let i = 0; i < pas && !w.gameOver; i++) { w.update(DT); vus.push(...w.drainEvents().filter((e) => e.type === 'position')); } return vus; };
{
  const w = terrain(), pos = w.positions[1];
  poser(w, 0, 'militia', pos);
  let vus = avancer(w, 9.5);
  check('deux soldats seuls dans le cercle : rien avant dix secondes, mais la prise avance', pos.camp === -1 && pos.preneur === 0 && pos.prise > 0 && vus.length === 0, `prise ${pos.prise} pas`);
  vus = avancer(w, 0.6);
  check('à dix secondes, la position est à eux, et la partie l’annonce', pos.camp === 0 && pos.preneur === -1 && pos.prise === 0 && vus.length === 1 && vus[0].camp === 0 && vus[0].ancien === -1 && vus[0].position === 1);
  for (const u of w.units) if (u.playerIndex === 0 && !u.isVillager && !u.isAnimal) u.dead = true;
  avancer(w, 20);
  check('ils partent : elle reste à leur camp', pos.camp === 0 && pos.presents.join() === '0,0');
  const avant = w.players[0].stats.positions;
  avancer(w, 60);
  check('elle rapporte un point toutes les cinq secondes : douze en une minute', w.players[0].stats.positions - avant === 12 && w.players[1].stats.positions === 0, `${w.players[0].stats.positions - avant}`);
  check('le score du format, ce sont ces points, et rien d’autre', w.score(w.players[0]) === w.players[0].stats.positions && JSON.stringify(Object.keys(w.detailScore(w.players[0]))) === '["positions","total"]');

  const rouges = poser(w, 1, 'militia', pos);
  vus = avancer(w, 5);
  check('l’adversaire arrive seul : la reprise commence, la position est encore au premier', pos.camp === 0 && pos.preneur === 1 && pos.prise === 5 * TICKS_PER_SECOND);
  const bleus = poser(w, 0, 'spearman', pos, 2, -1.2);
  avancer(w, 8);
  check('les deux camps dans le cercle : disputée, plus rien ne bouge', pos.camp === 0 && pos.prise === 5 * TICKS_PER_SECOND && pos.presents.join() === '2,2');
  for (const u of rouges) u.dead = true;
  avancer(w, 3);
  check('son propriétaire resté seul : la reprise entamée se défait, au même rythme', pos.camp === 0 && pos.prise === 2 * TICKS_PER_SECOND && pos.preneur === 1);
  avancer(w, 3);
  check('… jusqu’à rien', pos.prise === 0 && pos.preneur === -1);
  for (const u of bleus) u.dead = true;
  poser(w, 1, 'militia', pos);
  vus = avancer(w, 10.5);
  check('l’adversaire seul dix secondes : il la reprend, et la partie dit à qui elle était', pos.camp === 1 && vus.length === 1 && vus[0].camp === 1 && vus[0].ancien === 0);
}
{
  const w = terrain(7), pos = w.positions[0];
  poser(w, 0, 'villager', pos, 3);
  poser(w, 0, 'priest', pos, 1, -1.2);
  avancer(w, 15);
  check('des ouvriers et une soigneuse ne prennent rien : il faut des soldats', pos.camp === -1 && pos.prise === 0 && pos.presents.join() === '0,0');
  const loin = w.spawnUnit(0, 'militia', pos.x + TILE * (RP.rayon + 1.5), pos.y);
  w.setStance([loin], 'passive');
  avancer(w, 15);
  check('un soldat juste hors du cercle non plus', pos.camp === -1 && pos.presents[0] === 0);
  const eclaireur = poser(w, 0, 'scout', pos, 1);
  avancer(w, 4);
  eclaireur[0].dead = true;
  avancer(w, 2);
  check('une prise abandonnée en route se défait', pos.camp === -1 && pos.preneur === 0 && pos.prise === 2 * TICKS_PER_SECOND);
  avancer(w, 3);
  check('… et il faudra la reprendre du début', pos.prise === 0 && pos.preneur === -1);
}

console.log('--- Gagner ---');
{
  const w = terrain(), pos = w.positions[1];
  poser(w, 0, 'militia', pos);
  avancer(w, 11);
  w.players[0].stats.positions = RP.but - 1; w.players[1].stats.positions = 150;
  avancer(w, 6);
  const g = w.gameOver;
  check('le premier à 200 points gagne sur-le-champ', !!g && g.positions === true && g.winner === 0 && g.victory === true && !g.timeUp, g ? `${g.scores}` : 'pas finie');
  check('… et le résultat porte les points des deux camps', !!g && g.scores.join() === `${RP.but},150` && g.detail[0].positions === RP.but);

  const t = terrain(); t.time = P.timeLimit - 1;
  t.players[0].stats.positions = 120; t.players[1].stats.positions = 141;
  avancer(t, 2);
  check('à quinze minutes, le meilleur total l’emporte', !!t.gameOver && t.gameOver.timeUp === true && t.gameOver.winner === 1 && t.gameOver.victory === false && t.gameOver.scores.join() === '120,141');
  const e = terrain(); e.time = P.timeLimit - 1;
  e.players[0].stats.positions = 99; e.players[1].stats.positions = 99;
  avancer(e, 2);
  check('… et deux totaux égaux font une égalité', !!e.gameOver && e.gameOver.winner === -1);

  const c = terrain();
  centre(c, 1).takeDamage(99999, null);
  avancer(c, 1);
  check('raser le bâtiment principal adverse gagne aussi, quels que soient les points', !!c.gameOver && c.gameOver.winner === 0 && c.gameOver.victory === true && !c.gameOver.positions);
  check('ce bâtiment a tous ses points de vie, deux fois ceux d’Express', centre(terrain(), 0).maxHp === BUILDING_TYPES.towncenter.hp && centre(new World({ seed: 1, mode: 'express' }), 0).maxHp * 2 === BUILDING_TYPES.towncenter.hp);
}

console.log('--- La sauvegarde ---');
{
  const w = new World({ seed: 808, mode: 'positions' });
  w.addAI(0);
  while (w.time < 260) w.update(DT);
  const pos = w.positions[2];
  poser(w, 0, 'militia', pos);
  for (let i = 0; i < 77; i++) w.update(DT);
  const image = JSON.parse(JSON.stringify(serializeWorld(w)));
  const r = restoreWorld(image);
  const etat = (m) => JSON.stringify({ p: m.positions.map((x) => [x.tx, x.ty, x.camp, x.preneur, x.prise]), points: m.players.map((x) => x.stats.positions), pas: m.pasDePoints });
  check('une partie rechargée retrouve ses positions, les prises entamées, les points et le compte en cours', !!r && etat(r) === etat(w) && r.positions[2].prise > 0, r ? etat(r) : 'illisible');
  check('… et les soldats que l’ordinateur y avait postés', !!r && JSON.stringify(r.ais.map((a) => [...a.gardes])) === JSON.stringify(w.ais.map((a) => [...a.gardes])));
  // (Par identifiant : la reprise range les entités dans un autre ordre.)
  const empreinte = (m) => m.entities.filter((x) => !x.dead).sort((x, y) => x.id - y.id).map((x) => `${x.id}:${x.type}:${Math.round(x.x)}:${Math.round(x.y)}:${Math.round(x.hp)}`).join('|') + etat(m);
  for (let i = 0; i < 60 * TICKS_PER_SECOND; i++) { w.update(DT); r.update(DT); }
  check('une minute plus tard, les deux parties sont encore la même', empreinte(w) === empreinte(r));
}

console.log('--- L’ordinateur ---');
{
  const suivre = (options, deuxOrdinateurs) => {
    const w = new World(options);
    if (deuxOrdinateurs) w.addAI(0);
    const prises = [];
    let premiereVague = null, gardesMax = 0;
    while (!w.gameOver && w.time < 1000) {
      w.update(DT);
      for (const e of w.drainEvents()) if (e.type === 'position') prises.push({ t: w.time, ...e });
      if (premiereVague === null && w.ais.some((a) => a.waveCount > 0)) premiereVague = w.time;
      gardesMax = Math.max(gardesMax, ...w.ais.map((a) => a.gardes.size));
    }
    return { w, prises, premiereVague, gardesMax };
  };
  const passives = [1, 42, 808].map((seed) => suivre({ seed, mode: 'positions', difficulty: 'normal' }, false));
  check('contre un joueur qui ne fait rien, il prend sa première position avant trois minutes', passives.every((p) => p.prises.length > 0 && p.prises[0].t < 180 && p.prises[0].camp === 1), passives.map((p) => (p.prises[0] ? mmss(p.prises[0].t) : 'jamais')).join(', '));
  check('… finit par les tenir toutes les trois, et gagne aux points avant treize minutes', passives.every((p) => p.w.gameOver && p.w.gameOver.positions && p.w.gameOver.winner === 1 && p.w.positions.every((x) => x.camp === 1) && p.w.time < 780),
    passives.map((p) => `${mmss(p.w.time)} (${p.w.players[1].stats.positions} points)`).join(', '));
  check('… en y laissant des soldats de garde', passives.every((p) => p.gardesMax >= 3), passives.map((p) => p.gardesMax).join(', '));
  check('il ne rase pas pour autant la base du joueur avant d’avoir tout pris', passives.every((p) => !!centre(p.w, 0)));
  const duels = [1, 42, 808].map((seed) => suivre({ seed, mode: 'positions', difficulty: 'normal' }, true));
  check('deux ordinateurs face à face : les positions changent de mains, les deux camps marquent', duels.every((p) => p.prises.length >= 4 && p.w.players.every((j) => j.stats.positions > 30) && new Set(p.prises.map((x) => x.camp)).size === 2),
    duels.map((p) => `${p.prises.length} prises, ${p.w.players.map((j) => j.stats.positions).join('/')}`).join(' ; '));
  check('… et la partie finit à quinze minutes au plus tard', duels.every((p) => p.w.gameOver && p.w.time <= 900 + DT), duels.map((p) => mmss(p.w.time)).join(', '));
  const facile = suivre({ seed: 42, mode: 'positions', difficulty: 'easy' }, false);
  check('en Facile, trois minutes de trêve : aucune vague avant', DIFFICULTIES.easy.treve.positions === 180 && facile.premiereVague >= 180 && /3 min en Prise de positions/.test(DIFFICULTIES.easy.desc), mmss(facile.premiereVague || 0));
}

console.log('--- À l’écran, au classement ---');
{
  const main = lire('js/main.js'), ui = lire('js/ui.js'), rendu = lire('js/render.js'), page = lire('index.html'), sw = lire('sw.js');
  check('la partie annonce une position prise, perdue (avec l’endroit), ou prise par l’adversaire', /case 'position':/.test(main) && /Position prise !/.test(main) && /Position perdue !/.test(main) && /L’adversaire prend une position/.test(main));
  check('le haut de l’écran montre les points et un losange par position', /id="positions-box"/.test(page) && /positionsBox/.test(ui) && /etatDesPositions/.test(ui));
  check('la carte dessine le cercle de prise, son arc et le monument ; la mini-carte, un losange par position', /dessinerCerclesDesPositions\(\)/.test(rendu) && /dessinerMonument\(e\.pos\)/.test(rendu) && /for \(const pos of this\.world\.positions\) \{\n      const x = pos\.x \/ TILE \* scale/.test(rendu));
  check('le monument a son illustration, dans la liste hors ligne, et un dessin de repli', fs.existsSync(path.join(RACINE, 'assets/position.webp')) && sw.includes("'./assets/position.webp'") && /assets\/position\.webp/.test(rendu) && /POSITION_NEUTRE/.test(rendu));
  check('l’aide explique la règle, et l’écran de fin dit ce qui a tranché', /Tenez des <b>soldats<\/b> dans le cercle/.test(ui) && /Vous tenez les positions/.test(ui) && /les points des positions départagent/.test(ui) && /Points des positions/.test(ui));
  check('elle compte au classement, avec les coffres de tous les formats', tableDesCoffres('positions') === R.sources.partie);
}

// ===========================================================================
console.log('\n=== 2 contre 2 ===\n--- Le format et les places ---');
const D = GAME_MODES.deux;
const centreDe = (w, i) => w.buildings.find((b) => b.playerIndex === i && b.type === 'towncenter' && !b.dead);
const parId = (m) => m.entities.filter((x) => !x.dead).sort((x, y) => x.id - y.id).map((x) => `${x.id}:${x.type}:${x.playerIndex}:${Math.round(x.x)}:${Math.round(x.y)}:${Math.round(x.hp)}`).join('|');
check('deux équipes de deux : les places 0 et 1 alliées, 2 et 3 en face', JSON.stringify(D.equipes) === '[0,0,1,1]');
check('trente de population par camp, vingt minutes au plus, le bâtiment principal décide', D.popMax === 30 && D.timeLimit === 1200 && D.victory === 'towncenter' && /deux bâtiments principaux/.test(D.desc));
{
  const w = new World({ seed: 42, mode: 'deux', civs: ['atlante', 'atlante', 'solarien', 'solarien'] });
  check('quatre camps ; par défaut le joueur tient la place 0, l’ordinateur les trois autres',
    w.players.length === 4 && w.parEquipes && w.humanIndex === 0 && w.places.map((p) => p.controle).join() === 'local,ordinateur,ordinateur,ordinateur'
    && w.ais.map((a) => a.index).join() === '1,2,3');
  check('chacun son nom, son peuple et sa couleur : les alliés en tons froids, les adversaires en tons chauds',
    w.players.map((p) => p.name).join() === 'Vous,Allié,Adversaire 1,Adversaire 2' && w.players.map((p) => p.civ).join() === 'atlante,atlante,solarien,solarien'
    && w.players.every((p, i) => p.color === COULEURS_EQUIPES[i]) && new Set(w.players.map((p) => p.color.main)).size === 4);
  check('qui est du même bord : soi, son allié — ni ceux d’en face, ni la nature',
    w.allies(0, 0) && w.allies(0, 1) && w.allies(2, 3) && !w.allies(0, 2) && !w.allies(1, 3) && !w.allies(-1, 0) && w.allies(-1, -1)
    && w.adversairesDe(0).map((p) => p.index).join() === '2,3' && w.coequipiersDe(0).map((p) => p.index).join() === '1' && w.adversaire(3).index === 0);
  check('le tissu se peint par bord : bleu pour l’équipe du joueur, rouge pour celle d’en face', [0, 1, 2, 3, -1].map((i) => w.bordDe(i)).join() === '0,0,1,1,-1');
  const [a, b, c, d] = w.map.startPositions;
  check('une base par coin : les alliés du même côté, chacun son vis-à-vis', w.map.startPositions.length === 4 && a.tx === b.tx && c.tx === d.tx && a.tx < c.tx && a.ty === d.ty && b.ty === c.ty && a.ty > b.ty);
  check('chaque camp a son bâtiment principal, six ouvriers et un éclaireur, à l’Âge Féodal', w.players.every((p) => centreDe(w, p.index) && p.age === 1
    && w.units.filter((u) => u.playerIndex === p.index && u.isVillager).length === 6 && w.units.filter((u) => u.playerIndex === p.index && u.type === 'scout').length === 1));
  const libre = (p) => w.map.findFreeTile(p.tx, p.ty);
  check('les quatre bases sont reliées', [b, c, d].every((p) => w.map.floodReaches(libre(a), libre(p))));
  const vu = (i) => { const t = centreDe(w, i); return w.fog.visible[t.ty * w.map.w + t.tx] === 1; };
  check('la vue est partagée : le joueur voit la base de son allié, pas celles d’en face', vu(0) && vu(1) && !vu(2) && !vu(3));
}
check('les formats à deux camps n’ont pas bougé : deux places, chacune son équipe, la place 1 à l’ordinateur', ['escarmouche', 'express', 'positions', 'classique'].every((mode) => {
  const w = new World({ seed: 5, mode });
  return w.players.length === 2 && !w.parEquipes && w.players.map((p) => p.equipe).join() === '0,1' && w.ais.map((a) => a.index).join() === '1'
    && w.map.startPositions.length === 2 && !('places' in serializeWorld(w)) && w.bordDe(1) === 1 && w.adversaire(0).index === 1 && w.adversaire(1).index === 0;
}));

console.log('--- Alliés et ennemis ---');
{
  const w = new World({ seed: 7, mode: 'deux' });
  w.ais.length = 0;
  const allie = centreDe(w, 1), ennemi = centreDe(w, 2);
  const pres = w.spawnUnit(0, 'militia', allie.x + TILE * 3, allie.y + TILE * 3);
  const archer = w.spawnUnit(0, 'archer', allie.x + TILE * 4, allie.y + TILE * 3);
  w.setStance([pres, archer], 'aggressive');
  for (let i = 0; i < 12 * TICKS_PER_SECOND; i++) w.update(DT);
  check('des soldats agressifs au pied de la base alliée ne s’en prennent à personne', pres.state !== 'attack' && archer.state !== 'attack' && allie.hp === allie.maxHp
    && w.units.filter((u) => u.playerIndex === 1).every((u) => u.hp === u.maxHp));
  const ordre = w.commandUnits([pres], allie.x, allie.y);
  check('toucher le bâtiment d’un allié n’est pas un ordre d’attaque', !ordre || ordre.kind !== 'attack');
  check('… et il ne se vise pas comme un ennemi', w.enemyAt(allie.x, allie.y, 0) === null && w.enemyAt(ennemi.x, ennemi.y, 0) === ennemi);
  const loin = w.spawnUnit(0, 'militia', ennemi.x + TILE * 3, ennemi.y + TILE * 3);
  w.setStance([loin], 'aggressive');
  for (let i = 0; i < 12 * TICKS_PER_SECOND; i++) w.update(DT);
  check('les mêmes, au pied d’une base adverse, attaquent', loin.state === 'attack' || ennemi.hp < ennemi.maxHp || w.units.some((u) => u.playerIndex === 2 && u.hp < u.maxHp));
  const hydre = w.spawnUnit(0, 'hydra', allie.x - TILE * 3, allie.y + TILE * 3);
  const voisin = w.spawnUnit(1, 'militia', hydre.x + 20, hydre.y);
  w.setStance([hydre, voisin], 'aggressive');
  for (let i = 0; i < 8 * TICKS_PER_SECOND; i++) w.update(DT);
  check('l’Hydre d’un camp ne mord pas le soldat de son allié posé contre elle', voisin.hp === voisin.maxHp && hydre.hp === hydre.maxHp);
}

console.log('--- Gagner, perdre ---');
{
  const w = new World({ seed: 7, mode: 'deux' }); w.ais.length = 0;
  const vus = [];
  const pas = (n) => { for (let i = 0; i < n; i++) { w.update(DT); vus.push(...w.drainEvents().filter((e) => e.type === 'campTombe')); } };
  centreDe(w, 2).takeDamage(99999, null); pas(20);
  check('un bâtiment principal adverse tombe : la partie continue, et le dit', !w.gameOver && w.players[2].defeated && !w.players[3].defeated && vus.length === 1 && vus[0].player === 2);
  centreDe(w, 3).takeDamage(99999, null); pas(20);
  check('le second tombe : l’équipe du joueur a gagné', !!w.gameOver && w.gameOver.victory === true && w.gameOver.equipe === 0 && w.allies(w.gameOver.winner, 0));
  const p = new World({ seed: 7, mode: 'deux' }); p.ais.length = 0;
  centreDe(p, 0).takeDamage(99999, null); for (let i = 0; i < 20; i++) p.update(DT);
  check('le joueur perd le sien : son allié tient, rien n’est fini', !p.gameOver && p.players[0].defeated);
  centreDe(p, 1).takeDamage(99999, null); for (let i = 0; i < 20; i++) p.update(DT);
  check('… l’allié aussi : défaite', !!p.gameOver && p.gameOver.victory === false && p.gameOver.equipe === 1);
  const t = new World({ seed: 7, mode: 'deux' }); t.ais.length = 0; t.time = D.timeLimit - 1;
  t.players[2].stats.destroyed = 5000;
  for (let i = 0; i < 40; i++) t.update(DT);
  check('à vingt minutes, la meilleure somme des deux scores l’emporte', !!t.gameOver && t.gameOver.timeUp && t.gameOver.equipe === 1 && t.gameOver.victory === false
    && t.gameOver.scoresEquipes.length === 2 && t.gameOver.scoresEquipes[1] > t.gameOver.scoresEquipes[0]
    && t.gameOver.scoresEquipes[0] === t.gameOver.scores[0] + t.gameOver.scores[1] && t.scoreEquipe(1) === t.gameOver.scoresEquipes[1]);
  const r = new World({ seed: 7, mode: 'deux' }); r.resign();
  check('abandonner donne la partie à ceux d’en face', !!r.gameOver && r.gameOver.resigned && r.gameOver.victory === false && r.gameOver.equipe === 1 && !r.allies(r.gameOver.winner, 0));
}

console.log('--- Les ordinateurs ---');
{
  const parties = [1, 42, 808].map((seed) => {
    const w = new World({ seed, mode: 'deux', places: ['ordinateur', 'ordinateur', 'ordinateur', 'ordinateur'] });
    let entreAllies = 0, coups = 0;
    while (!w.gameOver && w.time < 1300) {
      w.update(DT);
      for (const e of w.drainEvents()) if ((e.type === 'melee' || e.type === 'shoot') && e.combat) coups++;
      if (Math.round(w.time * 20) % 20 === 0) for (const u of w.units) if (!u.dead && u.state === 'attack' && u.target && u.target.playerIndex >= 0 && u.target.playerIndex !== u.playerIndex && w.allies(u.target.playerIndex, u.playerIndex)) entreAllies++;
    }
    return { w, entreAllies, coups };
  });
  check('quatre ordinateurs, trois graines : la partie finit à vingt minutes au plus tard, avec une équipe gagnante', parties.every((p) => p.w.gameOver && p.w.time <= 1200 + DT && [0, 1].includes(p.w.gameOver.equipe)), parties.map((p) => mmss(p.w.time)).join(', '));
  check('on s’y bat', parties.every((p) => p.coups > 200), parties.map((p) => p.coups).join(', '));
  check('jamais un soldat n’y attaque un allié', parties.every((p) => p.entreAllies === 0), parties.map((p) => p.entreAllies).join(', '));
  check('chaque ordinateur vise un camp d’en face', parties.every((p) => p.w.ais.every((ia) => !p.w.allies(ia.adversaireVise(), ia.index))));
}
{
  // Les consignes à l'allié. Au début de la partie il n'a pas un soldat : la consigne attend, et le joueur le lit.
  const w = new World({ seed: 42, mode: 'deux' });
  while (w.time < 30) w.update(DT);
  const ia = w.ais.find((a) => a.index === 1), mien = centreDe(w, 0), sien = centreDe(w, 1), leur = centreDe(w, 2);
  const postes = () => [...ia.gardes.keys()].map((id) => w.byId.get(id)).filter((u) => u && !u.dead);
  const pres = (c, cases) => postes().filter((u) => Math.hypot(u.x - c.x, u.y - c.y) < TILE * cases).length;
  check('« Défends-moi » sans un soldat au camp : la consigne est prise, attend, et le joueur lit pourquoi',
    ia.disponibles().length === 0 && w.consigner(0, 1, 'defendre') === true && ia.consigne.type === 'defendre'
    && texteDeConsigne(ia, 'defendre').includes('aucun soldat au camp') && texteDeConsigne(null, 'defendre').includes('hors de combat'));
  for (let i = 0; i < 5 * TICKS_PER_SECOND; i++) w.update(DT);
  check('… cinq secondes plus tard elle attend encore, personne n’est posté', !!ia.consigne && ia.gardes.size === 0);
  // Quatre soldats sortent de sa caserne.
  const recrues = [0, 1, 2, 3].map((i) => w.spawnUnit(1, 'militia', sien.x + TILE * (i - 1.5), sien.y + TILE * 3));
  for (let i = 0; i < 3 * TICKS_PER_SECOND; i++) w.update(DT);
  check('dès qu’il a des soldats, ils partent : la consigne est suivie, les quatre sont postés chez le joueur',
    ia.consigne === null && recrues.every((u) => ia.gardes.has(u.id)) && recrues.every((u) => u.state !== 'idle'));
  let trajet = 0;
  while (pres(mien, 9) < 4 && trajet < 150) { w.update(DT); trajet += DT; }
  check('… ils traversent la carte et arrivent à sa base', pres(mien, 9) === 4, `${pres(mien, 9)} sur place après ${Math.round(trajet)} s`);
  for (let i = 0; i < 60 * TICKS_PER_SECOND; i++) w.update(DT);
  check('… une minute plus tard ils y sont toujours : la garde dure trois minutes, comptées du départ',
    pres(mien, 11) >= 3 && ia.gardes.size >= 3, `${pres(mien, 11)} sur place, ${ia.gardes.size} postés`);
  check('« À toi de voir » les libère', w.consigner(0, 1, 'libre') === true && ia.consigne === null && ia.gardes.size === 0);
  check('attaqué chez lui, il le dit : sa base d’abord', (ia.defendUntil = w.time + 5) && texteDeConsigne(ia, 'defendre').includes('attaqué chez lui'));
  check('on ne donne de consigne ni à soi, ni à un adversaire, ni sans point', !w.consigner(0, 0, 'defendre') && !w.consigner(0, 2, 'defendre') && !w.consigner(0, 1, 'attaquer') && !w.consigner(2, 1, 'defendre'));
}
{
  // « Attaque ici », et ce que le joueur lit quand l'allié a des soldats chez lui.
  const w = new World({ seed: 42, mode: 'deux' });
  while (w.time < 30) w.update(DT);
  const ia = w.ais.find((a) => a.index === 1), sien = centreDe(w, 1), leur = centreDe(w, 2);
  const recrues = [0, 1, 2].map((i) => w.spawnUnit(1, 'militia', sien.x + TILE * (i - 1), sien.y + TILE * 3));
  for (let i = 0; i < 2 * TICKS_PER_SECOND; i++) w.update(DT);
  check('avec trois soldats au camp, il annonce combien partent', ia.disponibles().length === 3
    && texteDeConsigne(ia, 'defendre') === 'Votre allié envoie 3 soldats vous défendre' && texteDeConsigne(ia, 'attaquer') === 'Votre allié envoie 3 soldats à l’attaque');
  check('« Attaque ici » : la consigne porte le point, et attend 2 minutes au plus',
    w.consigner(0, 1, 'attaquer', leur.x, leur.y + TILE * 4) === true && ia.consigne.type === 'attaquer' && ia.consigne.x === leur.x && Math.round(ia.consigne.jusqua - w.time) === 120);
  for (let i = 0; i < 3 * TICKS_PER_SECOND; i++) w.update(DT);
  check('… ses soldats partent à l’attaque, sans rester postés', ia.consigne === null && recrues.every((u) => !ia.gardes.has(u.id) && u.state !== 'idle'));
  const depart = recrues.map((u) => Math.hypot(u.x - leur.x, u.y - leur.y));
  for (let i = 0; i < 30 * TICKS_PER_SECOND; i++) w.update(DT);
  check('… trente secondes plus tard ils se sont rapprochés du point', recrues.every((u, i) => u.dead || Math.hypot(u.x - leur.x, u.y - leur.y) < depart[i] - TILE * 10));
}

console.log('--- La sauvegarde ---');
{
  const w = new World({ seed: 42, mode: 'deux', civs: ['atlante', 'atlante', 'solarien', 'solarien'] });
  while (w.time < 240) w.update(DT);
  w.consigner(0, 1, 'defendre');
  for (let i = 0; i < 100; i++) w.update(DT);
  const r = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
  check('une partie rechargée retrouve ses quatre camps, leurs équipes, leurs couleurs et qui tient chaque place',
    !!r && r.players.length === 4 && r.parEquipes && r.players.map((p) => `${p.equipe}${p.civ}${p.color.name}`).join() === w.players.map((p) => `${p.equipe}${p.civ}${p.color.name}`).join()
    && JSON.stringify(r.places) === JSON.stringify(w.places) && r.ais.map((a) => a.index).sort().join() === '1,2,3');
  check('… et les soldats que l’allié avait postés', !!r && JSON.stringify(r.ais.map((a) => [a.index, [...a.gardes]]).sort()) === JSON.stringify(w.ais.map((a) => [a.index, [...a.gardes]]).sort()));
  for (let i = 0; i < 90 * TICKS_PER_SECOND; i++) { w.update(DT); r.update(DT); }
  check('une minute et demie plus tard, les deux parties sont encore la même', parId(w) === parId(r));
}

console.log('--- Prêt pour d’autres joueurs : les places et les ordres ---');
{
  const ami = new World({ seed: 9, mode: 'deux', places: ['local', 'distant', 'ordinateur', 'ordinateur'] });
  check('le joueur et un ami contre deux ordinateurs : seules les places d’en face sont à l’ordinateur', ami.ais.map((a) => a.index).join() === '2,3' && ami.humanIndex === 0 && ami.parEquipes);
  const tous = new World({ seed: 9, mode: 'deux', places: ['local', 'distant', 'distant', 'distant'] });
  check('deux joueurs contre deux joueurs : aucun ordinateur', tous.ais.length === 0 && tous.players.every((p) => !p.isAI) && tous.humanIndex === 0);
  check('les règles n’en dépendent pas : mêmes équipes, mêmes bases, même vue partagée', JSON.stringify(tous.players.map((p) => p.equipe)) === '[0,0,1,1]'
    && JSON.stringify(tous.map.startPositions) === JSON.stringify(ami.map.startPositions) && tous.allies(0, 1) && !tous.allies(1, 2));

  check('le vocabulaire des ordres : huit types', Object.keys(ORDRES).join() === 'aller,former,batir,age,recherche,attitude,ralliement,consigne');
  // Un journal d'ordres pour les quatre places : chacun forme des ouvriers, envoie son éclaireur au centre, puis des soldats.
  const journalDe = (w) => {
    const j = new Journal();
    for (const p of w.players) {
      const tc = centreDe(w, p.index), eclaireur = w.units.find((u) => u.playerIndex === p.index && u.type === 'scout');
      j.noter(1, { place: p.index, type: 'former', batiment: tc.id, troupe: 'villager' });
      j.noter(40, { place: p.index, type: 'aller', unites: [eclaireur.id], x: w.map.pixelWidth / 2, y: w.map.pixelHeight / 2, agressif: true });
      j.noter(60, { place: p.index, type: 'attitude', unites: [eclaireur.id], attitude: 'aggressive' });
      j.noter(200, { place: p.index, type: 'ralliement', batiment: tc.id, x: tc.x + 64, y: tc.y + 96 });
      j.noter(300, { place: p.index, type: 'former', batiment: tc.id, troupe: 'villager' });
    }
    return j;
  };
  const un = new World({ seed: 9, mode: 'deux', places: ['distant', 'distant', 'distant', 'distant'] });
  const deux = new World({ seed: 9, mode: 'deux', places: ['distant', 'distant', 'distant', 'distant'] });
  const journal = journalDe(un);
  const refusUn = avancerLeJournal(un, journal, 1200), refusDeux = avancerLeJournal(deux, new Journal(JSON.parse(JSON.stringify(journal.aPlat()))), 1200);
  check('le même journal, rejoué sur un autre monde (après un aller-retour en JSON), donne la même partie', refusUn === 0 && refusDeux === 0 && parId(un) === parId(deux) && un.time === deux.time);
  check('… et les ordres ont bien été suivis : huit ouvriers de plus, les quatre éclaireurs partis vers le centre', un.players.every((p) => un.units.filter((u) => u.playerIndex === p.index && u.isVillager).length === 8)
    && un.units.filter((u) => u.type === 'scout').every((u) => { const tc = centreDe(un, u.playerIndex); return Math.hypot(u.x - tc.x, u.y - tc.y) > TILE * 12; }));
  const sans = new World({ seed: 9, mode: 'deux', places: ['distant', 'distant', 'distant', 'distant'] });
  avancerLeJournal(sans, new Journal(), 1200);
  check('sans ordres, personne ne joue à la place d’un joueur à distance', parId(sans) !== parId(un) && sans.players.every((p) => sans.units.filter((u) => u.playerIndex === p.index && u.isVillager).length === 6));

  const w = new World({ seed: 9, mode: 'deux', places: ['distant', 'distant', 'distant', 'distant'] });
  const avant = parId(w), tcAllie = centreDe(w, 1), tcAdverse = centreDe(w, 2), unAdverse = w.units.find((u) => u.playerIndex === 2);
  const refus = [
    executer(w, { place: 0, type: 'former', batiment: tcAllie.id, troupe: 'villager' }),
    executer(w, { place: 0, type: 'former', batiment: tcAdverse.id, troupe: 'villager' }),
    executer(w, { place: 0, type: 'aller', unites: [unAdverse.id], x: 100, y: 100 }),
    executer(w, { place: 0, type: 'detruire', batiment: tcAdverse.id }),
    executer(w, { place: 7, type: 'age', batiment: tcAllie.id }),
    executer(w, { place: 0, type: 'aller', unites: 'tout', x: 1, y: 1 }),
    executer(w, null),
  ];
  check('on ne commande que ce qui est à soi : les troupes et les bâtiments d’un allié ou d’un adversaire sont refusés, comme un ordre inconnu ou illisible',
    refus.every((r) => r.ok === false && typeof r.raison === 'string') && parId(w) === avant && centreDe(w, 1).queue.length === 0 && centreDe(w, 2).queue.length === 0);
  check('… et le sien passe', executer(w, { place: 0, type: 'former', batiment: centreDe(w, 0).id, troupe: 'villager' }).ok === true && centreDe(w, 0).queue.length === 1);
}

console.log('--- À l’écran ---');
{
  const main = lire('js/main.js'), ui = lire('js/ui.js'), rendu = lire('js/render.js'), page = lire('index.html');
  check('le 2 contre 2 n’est jamais classé, et l’accueil le dit', /function partieClassee\(\)/.test(main) && /!GAME_MODES\[settings\.mode\]\.equipes/.test(main) && /id="equipes-note"/.test(page));
  check('la partie reçoit quatre peuples : celui du joueur pour son équipe, celui d’en face pour l’autre', /const parPlace = \(paire\)/.test(main));
  check('un bouton donne ses consignes à l’allié ; « Attaque ici » attend un toucher sur la carte', /id="btn-allie"/.test(page) && /showConsignes\(\)/.test(ui) && /this\.consigneArmee/.test(main) && /'attaquer', p\.x, p\.y/.test(main));
  check('le score du haut de l’écran et l’écran de fin comptent par équipe', /scoreEquipe\(player\.equipe\)/.test(ui) && /tableDesEquipes/.test(ui) && /Par équipe/.test(ui));
  check('ce qui est à un allié est dit « allié », et son tissu reste bleu', /\(allié\)/.test(ui) && /imagePourJoueur\(sprite, this\.world\.bordDe\(u\.playerIndex\)\)/.test(rendu));
  check('un camp qui tombe s’annonce : le sien, celui de l’allié, celui d’un adversaire', /case 'campTombe':/.test(main) && /Votre allié a perdu son bâtiment principal/.test(main));
}

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
