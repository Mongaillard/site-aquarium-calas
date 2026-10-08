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
import { GAME_MODES, MAP_SIZES, DIFFICULTIES, DEFAULT_MODE, BUILDING_TYPES, TICKS_PER_SECOND, TILE } from '../js/config.js';
import { PROGRESSION as R } from '../js/progression-config.js';
import { profilNeuf, appliquerResultat, tableDesCoffres, verifierProbabilites } from '../js/progression.js';
import { resumeReglages } from '../js/ui.js';
import { formatNumber } from '../js/utils.js';

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
check('trois formats : Escarmouche, Express, Classique — et le Classique reste celui par défaut',
  Object.keys(GAME_MODES).join() === 'escarmouche,express,classique' && DEFAULT_MODE === 'classique');
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

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
