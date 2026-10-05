// L'adversaire, seconde vague de réglages : un niveau Facile qui laisse le
// temps d'apprendre (trêve, petites vagues, annonce, riposte qui ne sort pas
// de la base), et la tour posée près de chez lui qui ne le paralyse plus
// (troupe abritée ignorée, alerte bornée, épargne maintenue, terrain battu
// évité par ses ouvriers et ses soldats, assaut du bâtiment qui tire). Tout se
// joue sans navigateur : le monde tourne, on regarde ce que fait l'IA — pas ce
// que dit son code.
// Lancement : node test/reglages-ia.test.js

import { World } from '../js/game.js';
import { serializeWorld, restoreWorld } from '../js/save.js';
import { TICKS_PER_SECOND, TILE } from '../js/config.js';

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

const mmss = (t) => (t == null ? '--' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
const centre = (w, i) => w.buildings.find((b) => b.playerIndex === i && b.type === 'towncenter' && !b.dead);
const armee = (w, i = 1) => w.units.filter((u) => !u.dead && u.playerIndex === i && !u.isVillager && !u.isAnimal);
const ouvriers = (w, i = 1) => w.units.filter((u) => !u.dead && u.playerIndex === i && u.isVillager);

/** Fait tourner le monde jusqu'à l'heure dite ; `chaque()` est appelé après chaque pas, et arrête s'il rend vrai. */
function jouer(w, heure, chaque) {
  while (w.time < heure - 1e-6 && !w.gameOver) {
    w.update(DT);
    if (chaque && chaque()) return;
  }
}

/**
 * Le relevé d'une partie contre l'IA (joueur 1), à appeler à chaque pas :
 *   annonces : les messages « L'ennemi prépare une attaque » reçus par le joueur ;
 *   vagues   : l'heure de chaque vague et ses partants — les troupes que ce pas
 *              vient de lancer vers la base du joueur ;
 *   sortie   : la première fois qu'une troupe adverse est à plus de 24 cases de
 *              son centre (elle a quitté sa base) ;
 *   coup     : le premier coup reçu par le joueur ;
 *   ages     : l'heure de chaque passage d'âge de l'IA.
 */
function releve(w) {
  const ai = w.ais[0];
  const base = { x: centre(w, 0).x, y: centre(w, 0).y };
  const camp = { x: centre(w, 1).x, y: centre(w, 1).y };
  const r = { annonces: [], vagues: [], sortie: null, coup: null, ages: [], messages: 0 };
  const partis = new Set();
  let vues = 0, age = w.players[1].age, pas = 0;
  r.pas = () => {
    pas++;
    if (ai.waveCount > vues) {
      vues = ai.waveCount;
      const partants = armee(w).filter((u) => !partis.has(u.id) && ((u.target && u.target.playerIndex === 0)
        || (u.destination && Math.hypot(u.destination.x - base.x, u.destination.y - base.y) < 30 * TILE)));
      for (const u of partants) partis.add(u.id);
      r.vagues.push({ t: w.time, partants: partants.length, armee: armee(w).length });
    }
    if (w.players[1].age > age) { age = w.players[1].age; r.ages.push(w.time); }
    if (r.sortie === null && pas % 10 === 0
        && armee(w).some((u) => Math.hypot(u.x - camp.x, u.y - camp.y) > 24 * TILE)) r.sortie = w.time;
    for (const e of w.drainEvents()) {
      if (e.type === 'underAttack' && r.coup === null) r.coup = w.time;
      if (e.type === 'notice' && /prépare une attaque/.test(e.text)) r.annonces.push({ t: w.time, text: e.text });
    }
  };
  return r;
}

/**
 * Un emplacement pour une tour du joueur, à `d` cases au moins du centre
 * adverse : du côté de la base du joueur (« devant », sur le chemin des
 * vagues), à l'opposé (« derriere ») ou au plus près des ouvriers adverses
 * (« ouvriers »).
 */
function emplacementTour(w, d, cote) {
  const eux = centre(w, 1), moi = centre(w, 0);
  w.players[0].age = Math.max(1, w.players[0].age);   // la tour est un bâtiment de l'Âge Féodal
  const ouv = ouvriers(w);
  const milieu = { x: ouv.reduce((s, u) => s + u.x, 0) / Math.max(1, ouv.length), y: ouv.reduce((s, u) => s + u.y, 0) / Math.max(1, ouv.length) };
  let best = null, bestD = Infinity;
  for (let ty = 1; ty < w.map.h - 2; ty++) for (let tx = 1; tx < w.map.w - 2; tx++) {
    const cx = (tx + 1) * TILE, cy = (ty + 1) * TILE;
    const de = Math.hypot(cx - eux.x, cy - eux.y) / TILE;
    if (de < d || de > d + 1.5 || !w.canPlace(0, 'tower', tx, ty, true)) continue;
    const dm = cote === 'ouvriers' ? Math.hypot(cx - milieu.x, cy - milieu.y)
      : Math.hypot(cx - moi.x, cy - moi.y) * (cote === 'derriere' ? -1 : 1);
    if (dm < bestD) { bestD = dm; best = { tx, ty }; }
  }
  if (!best) throw new Error('aucun emplacement pour la tour');
  return best;
}

/** La tour habitée du tour de table : une tour du joueur près de la base adverse, `occupants` ouvriers dedans. */
function tourHabitee(w, d, cote, occupants = 1) {
  const e = emplacementTour(w, d, cote);
  const tour = w.spawnBuilding(0, 'tower', e.tx, e.ty, true);
  for (let k = 0; k < occupants; k++) tour.addToGarrison(w.spawnUnit(0, 'villager', tour.x, tour.y + TILE * 2));
  return tour;
}

/**
 * Les pertes de l'IA autour d'une tour du joueur, à appeler à chaque pas : ses
 * ouvriers et ses soldats morts à portée de tir de la tour (deux cases de marge).
 */
function pertesSousLaTour(w, tour) {
  const suivis = new Map();   // unité → dernière position connue
  const r = { ouvriers: 0, soldats: 0 };
  let pas = 0;
  r.pas = () => {
    if (++pas % 10 !== 0) return;
    for (const u of w.units) if (u.playerIndex === 1 && !u.isAnimal && !u.dead) suivis.set(u, { x: u.x, y: u.y });
    for (const [u, p] of suivis) {
      if (!u.dead) continue;
      suivis.delete(u);
      if (Math.hypot(p.x - tour.x, p.y - tour.y) > tour.rangePx() + 2 * TILE) continue;
      if (u.isVillager) r.ouvriers++; else r.soldats++;
    }
  };
  return r;
}

/** Des troupes de plus pour l'IA, posées à son camp, au pied de son centre. */
function renfort(w, type, n) {
  const tc = centre(w, 1);
  const troupe = [];
  for (let k = 0; k < n; k++) troupe.push(w.spawnUnit(1, type, tc.x + (k % 4 - 1.5) * TILE, tc.y + (4 + Math.floor(k / 4)) * TILE));
  return troupe;
}

console.log('=== Réglages : l’adversaire ===\n');

// ---------------------------------------------------------------------------
// 1. Un niveau Facile qui l'est vraiment
// ---------------------------------------------------------------------------

// Classique : rien avant 15:00, une première vague de 3 soldats, une annonce à
// 14:00. (Avant : première vague entre 7:32 et 11:09, de 5 soldats, sans prévenir.)
essai('Facile, Classique', () => {
  const lignes = [];
  let fin = null;
  for (const [seed, civs] of [[42, null], [7, ['solarien', 'atlante']], [2024, null]]) {
    const w = new World({ seed, mode: 'classique', difficulty: 'easy', ...(civs ? { civs } : {}) });
    const r = releve(w);
    jouer(w, 17 * 60, r.pas);
    lignes.push({ seed, r, solarien: !!civs });
    // Sur la première graine, la partie va à son terme : le joueur ne fait rien.
    if (seed === 42) { jouer(w, 26 * 60, r.pas); fin = w.gameOver ? { t: w.time, vainqueur: w.gameOver.winner } : null; }
  }
  const liste = (f) => lignes.map((l) => f(l.r)).join(', ');
  check('Facile, Classique : aucune vague avant 15:00, sur trois graines',
    lignes.every((l) => l.r.vagues.length > 0 && l.r.vagues[0].t >= 900 && l.r.vagues[0].t < 905),
    `première vague à ${liste((r) => mmss(r.vagues[0] && r.vagues[0].t))}`);
  check('… et aucune troupe adverse ne quitte sa base avant 15:00',
    lignes.every((l) => l.r.sortie !== null && l.r.sortie >= 900),
    `première troupe hors de sa base à ${liste((r) => mmss(r.sortie))}`);
  check('… le premier coup tombe après 15:00 : l’adversaire finit par attaquer',
    lignes.every((l) => l.r.coup !== null && l.r.coup > 900 && l.r.coup < 17 * 60),
    `premier coup reçu à ${liste((r) => mmss(r.coup))}`);
  check('la première vague compte 3 soldats, la suivante 5 : elles grossissent lentement',
    lignes.every((l) => l.r.vagues.length >= 2 && l.r.vagues[0].partants === 3 && l.r.vagues[1].partants === 5),
    `partants : ${liste((r) => r.vagues.map((v) => v.partants).join(' puis '))}`);
  check('une minute avant, le joueur reçoit une annonce — une seule de toute la partie',
    lignes.every((l) => l.r.annonces.length === 1 && l.r.annonces[0].t >= 840 && l.r.annonces[0].t < 842),
    `annonces à ${liste((r) => r.annonces.map((a) => mmss(a.t)).join(' et ') || 'aucune')}`);
  const textes = lignes.map((l) => (l.r.annonces[0] || {}).text);
  check('l’annonce nomme la caserne du joueur dans SA civilisation',
    lignes.every((l, i) => textes[i] === `L’ennemi prépare une attaque : formez des soldats à la ${l.solarien ? 'Cour des Gardes' : 'Caserne'}`),
    textes.join(' | '));
  check('un joueur qui ne fait rien finit par perdre, bien après la trêve',
    !!fin && fin.vainqueur === 1 && fin.t > 17 * 60,
    fin ? `défaite à ${mmss(fin.t)}` : 'partie encore en cours à 26:00');
});

// Express : rien avant 4:30, annonce à 3:30, 3 soldats.
// (Avant : première vague à 1:21, « Vous êtes attaqué ! » à 2:00.)
essai('Facile, Express', () => {
  const lignes = [];
  let fin = null;
  for (const seed of [42, 7, 2024]) {
    const w = new World({ seed, mode: 'express', difficulty: 'easy' });
    const r = releve(w);
    jouer(w, 6 * 60, r.pas);
    lignes.push(r);
    if (seed === 42) { jouer(w, 11 * 60, r.pas); fin = w.gameOver ? { t: w.time, vainqueur: w.gameOver.winner } : null; }
  }
  const liste = (f) => lignes.map(f).join(', ');
  check('Facile, Express : aucune vague avant 4:30, sur trois graines',
    lignes.every((r) => r.vagues.length > 0 && r.vagues[0].t >= 270 && r.vagues[0].t < 275 && r.sortie >= 270),
    `première vague à ${liste((r) => mmss(r.vagues[0] && r.vagues[0].t))}, première troupe hors de sa base à ${liste((r) => mmss(r.sortie))}`);
  check('… la première vague compte 3 soldats, et le premier coup tombe après 4:30',
    lignes.every((r) => r.vagues[0].partants === 3 && r.coup !== null && r.coup > 270),
    `partants : ${liste((r) => r.vagues[0].partants)} ; premier coup à ${liste((r) => mmss(r.coup))}`);
  check('… annoncée une fois, à 3:30',
    lignes.every((r) => r.annonces.length === 1 && r.annonces[0].t >= 210 && r.annonces[0].t < 212),
    `annonces à ${liste((r) => r.annonces.map((a) => mmss(a.t)).join(' et ') || 'aucune')}`);
  check('… et le joueur qui ne fait rien perd quand même la partie',
    !!fin && fin.vainqueur === 1, fin ? `défaite à ${mmss(fin.t)}` : 'pas de fin de partie');
});

// L'annonce et la trêve survivent à une sauvegarde reprise : ni annonce en
// double, ni annonce perdue, et la vague part à la même heure.
essai('Facile, reprise', () => {
  const partie = (heureSauvegarde) => {
    const w = new World({ seed: 42, mode: 'express', difficulty: 'easy' });
    const avant = releve(w);
    jouer(w, heureSauvegarde, avant.pas);
    const repris = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    const apres = releve(repris);
    jouer(repris, 290, apres.pas);
    return { avant, apres, repris };
  };
  const tot = partie(200), tard = partie(230);
  check('partie sauvegardée à 3:20 puis reprise : l’annonce tombe à 3:30, une seule fois',
    tot.avant.annonces.length === 0 && tot.apres.annonces.length === 1 && Math.floor(tot.apres.annonces[0].t) === 210,
    `${tot.avant.annonces.length} avant, ${tot.apres.annonces.length} après la reprise`);
  check('partie sauvegardée à 3:50 puis reprise : l’annonce déjà faite n’est pas répétée',
    tard.avant.annonces.length === 1 && tard.apres.annonces.length === 0,
    `${tard.avant.annonces.length} avant, ${tard.apres.annonces.length} après la reprise`);
  check('… et la trêve tient : la vague part à 4:30 dans les deux parties reprises',
    [tot, tard].every((p) => p.apres.vagues.length === 1 && p.apres.vagues[0].t >= 270 && p.apres.vagues[0].partants === 3),
    [tot, tard].map((p) => (p.apres.vagues[0] ? `${mmss(p.apres.vagues[0].t)} (${p.apres.vagues[0].partants})` : 'aucune')).join(', '));
});

// La trêve tient aussi quand le joueur va voir : son éclaireur de départ
// s'approche à neuf cases du centre adverse (à 6:00 en Classique, à 0:30 en
// Express), puis rentre. La riposte de l'IA ne sort pas de sa base. (Avant, sur
// ces graines : trois soldats le suivaient jusque chez lui, y arrivaient à
// 7:34 — 1:35 en Express —, tuaient ses ouvriers et frappaient son centre.)
essai('Facile, l’éclaireur en visite', () => {
  const visite = (mode, seed, depart, treve) => {
    const w = new World({ seed, mode, difficulty: 'easy' });
    const ai = w.ais[0];
    const moi = centre(w, 0), eux = centre(w, 1);
    const eclaireur = w.units.find((u) => u.playerIndex === 0 && u.type === 'scout');
    const r = { poursuivants: 0, alerte: null, chezMoi: null, loin: 0, coups: 0, vagues: 0, ouvriers: '', centre: '' };
    const ouvriersAuDepart = ouvriers(w, 0).length;
    let phase = 0, pas = 0;
    jouer(w, treve, () => {
      if (phase === 0 && w.time >= depart) { eclaireur.moveTo(eux.x, eux.y + TILE * 4); phase = 1; }
      if (phase === 1 && Math.hypot(eclaireur.x - eux.x, eclaireur.y - eux.y) < TILE * 9) { eclaireur.moveTo(moi.x, moi.y + TILE * 3); phase = 2; }
      if (r.alerte === null && w.time < ai.defendUntil) r.alerte = w.time;
      for (const e of w.drainEvents()) {
        // Un coup reçu « chez lui » : à moins de vingt cases de son centre.
        if (e.type === 'underAttack' && Math.hypot(e.x - moi.x, e.y - moi.y) < TILE * 20) r.coups++;
      }
      if (++pas % 5 !== 0) return;
      const troupe = armee(w);
      r.poursuivants = Math.max(r.poursuivants, troupe.filter((u) => u.target === eclaireur).length);
      for (const u of troupe) r.loin = Math.max(r.loin, Math.hypot(u.x - eux.x, u.y - eux.y) / TILE);
      if (r.chezMoi === null && troupe.some((u) => Math.hypot(u.x - moi.x, u.y - moi.y) < TILE * 12)) r.chezMoi = w.time;
    });
    r.vagues = ai.waveCount;
    r.ouvriers = `${ouvriers(w, 0).length}/${ouvriersAuDepart}`;
    r.centre = `${Math.round(moi.hp)}/${moi.maxHp}`;
    r.intact = ouvriers(w, 0).length === ouvriersAuDepart && moi.hp === moi.maxHp;
    return r;
  };
  const classique = visite('classique', 42, 6 * 60, 900), express = visite('express', 42, 30, 270);
  const dit = (r) => `alerte à ${mmss(r.alerte)}, ${r.poursuivants} soldat(s) sur l’éclaireur, au plus loin à ${r.loin.toFixed(0)} cases de leur centre`;
  check('l’éclaireur du joueur s’approche : l’IA se met en alerte et lance ses soldats dessus',
    [classique, express].every((r) => r.alerte !== null && r.poursuivants > 0), `Classique : ${dit(classique)} ; Express : ${dit(express)}`);
  check('… mais ils ne le suivent pas chez lui : aucune troupe adverse à douze cases de son centre avant 15:00 (4:30 en Express)',
    [classique, express].every((r) => r.chezMoi === null && r.loin < 24 && r.vagues === 0),
    [classique, express].map((r) => (r.chezMoi === null ? 'aucune' : 'à ' + mmss(r.chezMoi))).join(', '));
  check('… et le joueur ne reçoit pas un coup chez lui de toute la trêve : ses ouvriers et son centre sont intacts',
    [classique, express].every((r) => r.coups === 0 && r.intact),
    [classique, express].map((r) => `${r.coups} coup(s), ouvriers ${r.ouvriers}, centre ${r.centre}`).join(' ; '));
});

// Normal et Difficile ne bougent pas : mêmes heures et mêmes tailles qu'avant
// les réglages (mesuré sur six graines, joueur passif — Classique : première
// vague de 6 soldats entre 9:03 et 10:18 en Normal, entre 8:36 et 10:41 en
// Difficile ; la deuxième quand l'armée en compte 10, ou 11 en Difficile,
// entre 10:44 et 12:15, ou 10:07 et 12:14. Express : 3 soldats entre 1:21 et
// 1:29, puis une deuxième vague 23 secondes après, 18 en Difficile). Et
// aucune annonce.
essai('Normal et Difficile', () => {
  const deux = (options, limite) => {
    const w = new World(options);
    const r = releve(w);
    jouer(w, limite, () => { r.pas(); return r.vagues.length > 1; });
    return { v: r.vagues, annonces: r.annonces.length };
  };
  const premiere = (p, min, max, n) => p.v.length > 0 && p.v[0].t >= min && p.v[0].t <= max && p.v[0].partants === n && p.annonces === 0;
  const seconde = (p, min, max, n) => p.v.length > 1 && p.v[1].t >= min && p.v[1].t <= max && p.v[1].armee === n;
  const dit = (ps) => ps.map((p) => p.v.map((v) => `${mmss(v.t)} (${v.partants} partants, armée de ${v.armee})`).join(' puis ') || 'aucune').join(' | ');
  const normal = [42, 2024].map((seed) => deux({ seed, mode: 'classique', difficulty: 'normal' }, 13 * 60));
  check('Normal, Classique : première vague entre 8:30 et 10:50, 6 soldats, comme avant',
    normal.every((p) => premiere(p, 510, 650, 6)), dit(normal));
  check('… et la deuxième entre 10:15 et 12:45, quand l’armée compte 10 soldats, comme avant',
    normal.every((p) => seconde(p, 615, 765, 10)), dit(normal));
  const difficile = [deux({ seed: 42, mode: 'classique', difficulty: 'hard' }, 13 * 60)];
  check('Difficile, Classique : première vague entre 8:05 et 11:15, 6 soldats, la deuxième entre 9:40 et 12:45 à 11, comme avant',
    difficile.every((p) => premiere(p, 485, 675, 6) && seconde(p, 580, 765, 11)), dit(difficile));
  const [expressNormal, expressDifficile] = ['normal', 'hard'].map((difficulty) => deux({ seed: 42, mode: 'express', difficulty }, 3 * 60));
  check('Normal et Difficile, Express : première vague entre 1:10 et 1:45, 3 soldats, comme avant',
    [expressNormal, expressDifficile].every((p) => premiere(p, 70, 105, 3)), dit([expressNormal, expressDifficile]));
  const ecart = (p) => (p.v.length > 1 ? p.v[1].t - p.v[0].t : NaN);
  check('… et le rythme des vagues n’a pas bougé : la deuxième suit de 23 secondes en Normal, de 18 en Difficile',
    Math.abs(ecart(expressNormal) - 23) < 1 && Math.abs(ecart(expressDifficile) - 18) < 1,
    `${ecart(expressNormal).toFixed(1)} s en Normal, ${ecart(expressDifficile).toFixed(1)} s en Difficile`);
});

// ---------------------------------------------------------------------------
// 2. La tour posée près de sa base
// ---------------------------------------------------------------------------

// Une troupe abritée n'est plus une menace pour findThreat.
essai('troupe abritée', () => {
  const w = new World({ seed: 42, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  const e = emplacementTour(w, 9, 'derriere');
  const tour = w.spawnBuilding(0, 'tower', e.tx, e.ty, true);
  const v = w.spawnUnit(0, 'villager', tour.x, tour.y + TILE * 2);
  ai.survey();
  check('dehors, à neuf cases du centre adverse, un ouvrier du joueur est une menace', ai.findThreat() === v);
  tour.addToGarrison(v);
  check('abrité dans la tour, il n’en est plus une', v.garrisonedIn === tour && ai.findThreat() === null);
  let alerte = 0;
  jouer(w, 60, () => { if (w.time < ai.defendUntil) alerte++; });
  check('… et l’IA ne se met pas en alerte', alerte === 0, `${(alerte * DT).toFixed(0)} s d’alerte en une minute`);
});

// Le scénario du tour de table : tour posée à 7:00 près de la base adverse, un
// ouvrier dedans, le joueur ne fait rien d'autre. (Avant, même graine : aucune
// vague en 25 minutes, alerte 100 % du temps, Âge Féodal à 20:04, 38 miliciens
// restés chez eux, tour debout.)
essai('tour habitée, la partie', () => {
  const w = new World({ seed: 99, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  const r = releve(w);
  jouer(w, 7 * 60, r.pas);
  const tour = tourHabitee(w, 11, 'devant');
  const pertes = pertesSousLaTour(w, tour);
  let secondes = 0, alerte = 0, enfermes = 0, rasee = null, pas = 0;
  jouer(w, 13.5 * 60, () => {
    r.pas(); pertes.pas();
    if (++pas % TICKS_PER_SECOND === 0) {
      secondes++;
      if (w.time < ai.defendUntil) alerte++;
      enfermes += ouvriers(w).filter((u) => u.garrisonedIn).length;
    }
    if (tour.dead && rasee === null) rasee = w.time;
    return rasee !== null && r.ages.length > 0 && r.vagues.length > 0;
  });
  check('tour habitée : l’IA n’est plus en alerte permanente, ses ouvriers ne restent pas enfermés',
    alerte / secondes < 0.1 && enfermes / secondes < 0.5,
    `alerte ${Math.round((100 * alerte) / secondes)} % du temps, ${(enfermes / secondes).toFixed(1)} ouvrier enfermé en moyenne`);
  check('… elle passe à l’Âge Féodal (avant 11:30)', r.ages.length > 0 && r.ages[0] < 11.5 * 60, `Âge Féodal à ${mmss(r.ages[0])}`);
  check('… elle envoie une vague (avant 11:30)', r.vagues.length > 0 && r.vagues[0].t < 11.5 * 60,
    `première vague à ${mmss(r.vagues[0] && r.vagues[0].t)}`);
  check('… et elle rase la tour (avant 13:30)', rasee !== null, rasee === null ? `tour à ${Math.round(tour.hp)}/${tour.maxHp}` : `rasée à ${mmss(rasee)}`);
  check('… sans y laisser son monde : pas plus de deux ouvriers et deux soldats tués sous la tour',
    pertes.ouvriers <= 2 && pertes.soldats <= 2, `${pertes.ouvriers} ouvrier(s) et ${pertes.soldats} soldat(s)`);
});

// Une tour mal placée pour elle : derrière sa base, à huit cases de son centre,
// sur son moulin et deux fermes (graine 123). Ses ouvriers quittent le terrain
// battu au lieu d'y retourner un par un. (Avant ces réglages : alerte toute la
// partie, ni âge ni vague en quarante minutes, 27 ouvriers tués. Avec les
// premiers réglages seuls : Âge Féodal à 22:46 au lieu de 9:47, première vague
// à 23:06, 47 ouvriers tués, aucun assaut.)
essai('tour mal placée', () => {
  const w = new World({ seed: 123, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  const r = releve(w);
  jouer(w, 7 * 60, r.pas);
  const tour = tourHabitee(w, 8, 'derriere');
  const pertes = pertesSousLaTour(w, tour);
  let rasee = null, dessous = 0, mesures = 0, pas = 0;
  const suivre = () => {
    r.pas(); pertes.pas();
    if (tour.dead && rasee === null) rasee = w.time;
    // Passé la première minute, combien de ses ouvriers à portée de la tour ?
    if (++pas % TICKS_PER_SECOND === 0 && w.time > 8 * 60 && !tour.dead) {
      mesures++;
      dessous += ouvriers(w).filter((u) => !u.garrisonedIn && Math.hypot(u.x - tour.x, u.y - tour.y) <= tour.rangePx()).length;
    }
  };
  jouer(w, 8 * 60, suivre);
  check('une tour habitée sur son moulin : elle relève le terrain battu autour d’elle',
    ai.zones.length === 1 && ai.zones[0].id === tour.id && ai.niveauZone(tour.x, tour.y + TILE * 5) === 2 && ai.niveauZone(tour.x, tour.y + TILE * 14) === 0);
  // (La partie est sauvegardée ici, et reprise à part plus bas.)
  const repris = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
  jouer(w, 13 * 60, () => { suivre(); return rasee !== null && r.ages.length > 0 && r.vagues.length > 0; });
  check('… ses ouvriers n’y retournent pas : pas plus de trois tués sous la tour, moins d’un à portée en moyenne',
    pertes.ouvriers <= 3 && mesures > 0 && dessous / mesures < 1,
    `${pertes.ouvriers} ouvrier(s) tué(s), ${(dessous / Math.max(1, mesures)).toFixed(2)} à portée en moyenne de 8:00 à ${mmss(w.time)}`);
  check('… elle passe à l’Âge Féodal à l’heure (avant 11:00)', r.ages.length > 0 && r.ages[0] < 11 * 60, `Âge Féodal à ${mmss(r.ages[0])}`);
  check('… elle envoie sa première vague (avant 12:30) et rase la tour',
    r.vagues.length > 0 && r.vagues[0].t < 12.5 * 60 && rasee !== null,
    `première vague à ${mmss(r.vagues[0] && r.vagues[0].t)}, tour ${rasee === null ? `à ${Math.round(tour.hp)}/${tour.maxHp}` : 'rasée à ' + mmss(rasee)}`);
  const tourReprise = repris.buildings.find((b) => b.id === tour.id);
  jouer(repris, 13 * 60, () => !!tourReprise.dead);
  check('une sauvegarde reprise à 8:00 retrouve le terrain battu et mène au même terme',
    repris.ais[0].zones.length === 1 && rasee !== null && tourReprise.dead && Math.abs(repris.time - rasee) < 1e-6,
    `tour rasée à ${mmss(rasee)} d’un côté, ${tourReprise.dead ? mmss(repris.time) : 'debout'} de l’autre`);
});

// Une tour au cœur de sa base : au milieu de ses ouvriers, à sept cases de son
// centre (graine 99). Dépôts et fermes sont à rebâtir ailleurs, le bois manque :
// elle arrive à l'Âge Féodal avec cinq soldats, un de moins qu'il n'en faut à
// sa première vague, et rase la tour à 12:14. La vague suit. (Avant : plus un
// soldat formé tant que l'Archerie et l'Écurie n'étaient pas bâties — première
// vague à 17:49, cinq minutes et demie après la chute de la tour, avec 945
// d'or et 659 de nourriture en caisse.)
essai('tour au cœur de sa base', () => {
  const w = new World({ seed: 99, mode: 'classique', difficulty: 'normal' });
  const r = releve(w);
  jouer(w, 7 * 60, r.pas);
  const tour = tourHabitee(w, 6, 'ouvriers');
  let rasee = null;
  jouer(w, 14.5 * 60, () => {
    r.pas();
    if (tour.dead && rasee === null) rasee = w.time;
    return rasee !== null && r.vagues.length > 0;
  });
  check('une tour habitée au milieu de ses ouvriers, à sept cases de son centre : elle passe à l’Âge Féodal et rase la tour (avant 13:00)',
    r.ages.length > 0 && rasee !== null && rasee < 13 * 60,
    `Âge Féodal à ${mmss(r.ages[0])}, tour ${rasee === null ? `à ${Math.round(tour.hp)}/${tour.maxHp}` : 'rasée à ' + mmss(rasee)}`);
  check('… et sa première vague n’attend pas l’Archerie et l’Écurie : elle part dans les deux minutes',
    r.vagues.length > 0 && rasee !== null && r.vagues[0].t < rasee + 120,
    `première vague à ${mmss(r.vagues[0] && r.vagues[0].t)}, ${armee(w).length} soldat(s) à ${mmss(w.time)}`);
});

// Une tour vide. Près de ses ouvriers (graine 58), elle tire sur un bâtiment :
// le camp la rase tant qu'elle est occupée. (Avant ces réglages : rasée à
// 24:43 seulement, après 43 ouvriers et 19 soldats tués, Âge Féodal à 24:36.
// Avec les premiers réglages seuls : jamais rasée.)
// Sur le chemin des vagues et hors de portée de tout bâtiment (graine 271),
// rien ne l'occupe : la première vague n'a pas de quoi l'abattre, elle passe
// son chemin. (Avant, et avec « on y va quand même » : six soldats y restaient
// pour un tiers de ses points de vie, dix à la vague suivante.)
essai('tour vide', () => {
  const partie = (seed, cote, fin, arret) => {
    const w = new World({ seed, mode: 'classique', difficulty: 'normal' });
    const r = releve(w);
    jouer(w, 7 * 60, r.pas);
    const e = emplacementTour(w, 11, cote);
    const tour = w.spawnBuilding(0, 'tower', e.tx, e.ty, true);
    const pertes = pertesSousLaTour(w, tour);
    let rasee = null;
    jouer(w, fin, () => { r.pas(); pertes.pas(); if (tour.dead && rasee === null) rasee = w.time; return arret(r, rasee); });
    return { w, r, tour, pertes, rasee };
  };
  const occupee = partie(58, 'ouvriers', 12 * 60, (r, rasee) => rasee !== null);
  check('tour vide près de ses ouvriers : rasée avant 12:00',
    occupee.rasee !== null, occupee.rasee === null ? `tour à ${Math.round(occupee.tour.hp)}/${occupee.tour.maxHp}` : `rasée à ${mmss(occupee.rasee)}`);
  check('… sans pertes : pas plus de deux ouvriers ni d’un soldat tués sous la tour',
    occupee.pertes.ouvriers <= 2 && occupee.pertes.soldats <= 1, `${occupee.pertes.ouvriers} ouvrier(s) et ${occupee.pertes.soldats} soldat(s)`);
  const oisive = partie(271, 'devant', 11.5 * 60, (r) => r.coup !== null);
  check('tour vide que rien n’occupe, sur le chemin des vagues : la première vague part à l’heure et frappe le joueur chez lui',
    oisive.r.vagues.length > 0 && oisive.r.vagues[0].t < 10 * 60 && oisive.r.coup !== null,
    `première vague à ${mmss(oisive.r.vagues[0] && oisive.r.vagues[0].t)}, premier coup reçu à ${mmss(oisive.r.coup)}`);
  check('… sans s’user sur la tour : aucun soldat tué sous elle, elle n’a pas reçu un coup',
    oisive.pertes.soldats === 0 && oisive.tour.hp === oisive.tour.maxHp,
    `${oisive.pertes.soldats} soldat(s) tué(s), tour à ${Math.round(oisive.tour.hp)}/${oisive.tour.maxHp}`);
});

// En Express, la tour posée pour de bon, avec les ordres du jeu : deux ouvriers
// du joueur partent à 0:00, la bâtissent à onze cases du centre adverse et s'y
// abritent ; il ne fait rien d'autre. (Avant ces réglages : alerte 92 % du
// temps, aucune vague, 13 à 15 pertes, l'IA gagnait au score. Avec les
// premiers réglages seuls : ses ouvriers marchaient sous la tour — 20 et 28
// pertes sur ces deux graines — et le joueur passif gagnait la partie au score.)
// (`d` : la distance de la tour au centre adverse, en cases ; `occupants` : les
// ouvriers qui la bâtissent et s'y abritent.)
const partieTourExpress = (seed, { d = 11, niveau = 'normal', occupants = 2 } = {}) => {
  const w = new World({ seed, mode: 'express', difficulty: niveau });
  const ai = w.ais[0];
  const moi = centre(w, 0);
  const e = emplacementTour(w, d, 'devant');
  const pied = { x: (e.tx + 1) * TILE, y: (e.ty + 1) * TILE };
  const equipe = ouvriers(w, 0).slice(0, occupants);
  for (const v of equipe) v.moveTo(pied.x - TILE * 2, pied.y);
  let tour = null, habitee = null, secondes = 0, alerte = 0, pas = 0;
  jouer(w, 11 * 60, () => {
    const vivants = equipe.filter((v) => !v.dead);
    if (!tour && vivants.some((v) => Math.hypot(v.x - pied.x, v.y - pied.y) < TILE * 4)) tour = w.placeBuilding(0, 'tower', e.tx, e.ty, vivants);
    if (tour && tour.complete && habitee === null) {
      if (tour.garrison.length > 0) habitee = w.time; else for (const v of vivants) if (!v.garrisonedIn && v.state !== 'garrison') v.garrisonAt(tour);
    }
    if (++pas % TICKS_PER_SECOND === 0) { secondes++; if (w.time < ai.defendUntil) alerte++; }
    w.drainEvents();
  });
  return { habitee, alerte: alerte / secondes, vagues: ai.waveCount, pertes: w.players[1].stats.lost,
    centre: moi.dead ? 0 : Math.round(moi.hp), dedans: tour ? tour.garrison.length : 0,
    fin: w.gameOver ? w.time : null, vainqueur: w.gameOver ? w.gameOver.winner : null, scores: w.players.map((p) => Math.round(w.score(p))) };
};
const issue = (p) => (p.fin === null ? 'partie en cours' : `${p.vainqueur === 1 ? 'IA' : 'joueur'} à ${mmss(p.fin)} (${p.scores.join(' contre ')})`);

essai('Express, la tour bâtie par le joueur', () => {
  const parties = [2024, 7].map((seed) => partieTourExpress(seed));
  const liste = (f) => parties.map(f).join(', ');
  check('Express : la tour du joueur est debout et habitée avant 1:30, à onze cases du centre adverse',
    parties.every((p) => p.habitee !== null && p.habitee < 90), `habitée à ${liste((p) => mmss(p.habitee))}`);
  check('… l’IA n’est pas paralysée : alerte moins d’un cinquième du temps, des vagues',
    parties.every((p) => p.alerte < 0.2 && p.vagues >= 2), `alerte ${liste((p) => Math.round(100 * p.alerte) + ' %')} ; ${liste((p) => p.vagues)} vagues`);
  check('… ses ouvriers ne vont pas se faire tuer sous la tour : six pertes au plus de toute la partie',
    parties.every((p) => p.pertes <= 6), `pertes de l’IA : ${liste((p) => p.pertes)}`);
  check('… et le joueur qui ne fait rien d’autre ne gagne pas : l’IA l’emporte',
    parties.every((p) => p.vainqueur === 1), liste(issue));
});

// La même tour là où elle tient davantage que le terrain autour d'elle.
// Graine 25, à dix cases : la cour où sortent ses ouvriers n'a d'issue que
// sous les flèches. (Avant : quatorze ouvriers neufs et dix archers tués en
// sortant, 25 pertes, et le joueur passif gagnait au score, 3790 contre 3367.)
// Graine 58 : la sortie de son camp de tir est sous les flèches. (Avant :
// quatorze archers abattus à peine formés, 15 pertes, le centre du joueur
// intact.)
// Graine 22 : la tour tient le seul passage entre les deux bases. (Avant :
// ses vagues y passaient trois soldats après trois soldats, 17 pertes, sans
// rien frapper. De même graine 63 en Facile, quatre ouvriers dans la tour :
// 19 pertes, et le joueur passif gagnait, 3470 contre 3023.)
essai('Express, la tour qui tient la sortie', () => {
  const cour = partieTourExpress(25, { d: 10 });
  check('Express, tour à dix cases devant la cour de son centre (graine 25) : ses ouvriers et ses archers sortent hors des flèches, l’IA l’emporte',
    cour.habitee !== null && cour.pertes <= 6 && cour.vainqueur === 1, `${cour.pertes} perte(s) pour l’IA ; ${issue(cour)}`);
  const camp = partieTourExpress(58);
  check('Express, tour qui bat la sortie de son camp de tir (graine 58) : ses archers ne tombent plus en sortant, elle rase le centre du joueur',
    camp.habitee !== null && camp.pertes <= 6 && camp.centre === 0, `${camp.pertes} perte(s) pour l’IA ; ${issue(camp)}`);
  const goulet = partieTourExpress(22);
  check('Express, tour qui tient le seul passage (graine 22) : ses vagues ne vont plus y mourir, et le joueur passif ne gagne pas',
    goulet.habitee !== null && goulet.pertes <= 6 && goulet.vainqueur === 1, `${goulet.pertes} perte(s) pour l’IA, ${goulet.vagues} vague(s) ; ${issue(goulet)}`);
  const facile = partieTourExpress(63, { niveau: 'easy', occupants: 4 });
  check('… de même en Facile, quatre ouvriers dans la tour (graine 63)',
    facile.dedans === 4 && facile.pertes <= 6 && facile.vainqueur === 1, `${facile.pertes} perte(s) pour l’IA, ${facile.vagues} vague(s) ; ${issue(facile)}`);
});

// L'assaut du bâtiment qui tire : pas sans de quoi l'abattre, et sans s'y user.
essai('tour habitée, l’assaut', () => {
  const w = new World({ seed: 42, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  jouer(w, 60);
  const tour = tourHabitee(w, 7, 'derriere');
  // Une maison du joueur au pied de sa tour : la plus proche de l'IA après elle.
  let maison = null;
  for (let dy = -3; dy <= 3 && !maison; dy++) for (let dx = -3; dx <= 3 && !maison; dx++) {
    if (w.canPlace(0, 'house', tour.tx + dx, tour.ty + dy, true)) maison = w.spawnBuilding(0, 'house', tour.tx + dx, tour.ty + dy, true);
  }
  let assauts = 0, enCours = false;
  const compter = () => { if (!!ai.assaut && !enCours) assauts++; enCours = !!ai.assaut; };
  jouer(w, 240, compter);
  ai.survey();
  check('une tour habitée à sept cases de son centre : l’IA y voit un bâtiment qui tire sur sa base',
    ai.batimentArme() === tour && ai.findThreat() === null);
  const cibleSans = ai.pickAttackTarget(ai.army);
  check('sans de quoi l’abattre, elle n’envoie personne dessus',
    assauts === 0 && tour.hp === tour.maxHp && !armee(w).some((u) => u.target === tour),
    `${assauts} assaut en trois minutes, tour à ${Math.round(tour.hp)}/${tour.maxHp}, ${armee(w).length} soldat(s) au camp`);
  check('… et une vague ne la prendrait pas pour cible, ni la maison qu’elle couvre : elle viserait la base du joueur',
    !!maison && !!cibleSans && cibleSans !== tour && cibleSans !== maison && cibleSans.type === 'towncenter', cibleSans ? cibleSans.type : 'aucune cible');
  const troupe = renfort(w, 'militia', 16);
  const depart = w.time;
  // Dix secondes après, en plein assaut, la partie est sauvegardée et reprise à part.
  jouer(w, depart + 10, compter);
  const repris = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
  const assautRepris = repris.ais[0].assaut;
  jouer(w, depart + 150, () => { compter(); return tour.dead; });
  check('avec seize miliciens au camp, elle lance l’assaut et rase la tour',
    assauts === 1 && tour.dead,
    tour.dead ? `rasée en ${Math.round(w.time - depart)} s, ${troupe.filter((u) => !u.dead).length} miliciens sur 16 en reviennent` : `tour à ${Math.round(tour.hp)}/${tour.maxHp}`);
  check('… sans que cela compte pour une vague', ai.waveCount === 0, `${ai.waveCount} vague(s)`);
  const tourReprise = repris.buildings.find((b) => b.id === tour.id);
  jouer(repris, depart + 150, () => !!tourReprise.dead);
  check('une sauvegarde reprise en plein assaut le mène au même terme',
    !!assautRepris && assautRepris.cible === tour.id && tourReprise.dead && Math.abs(repris.time - w.time) < 1e-6,
    `tour rasée à ${mmss(w.time)} d’un côté, ${tourReprise.dead ? mmss(repris.time) : 'debout'} de l’autre`);
});

// Un bâtiment qu'elle n'arrive pas à abattre : l'assaut est borné dans le
// temps, les survivants décrochent, et elle n'y retourne pas indéfiniment —
// même après une sauvegarde reprise.
essai('tour habitée, l’assaut borné', () => {
  const w = new World({ seed: 42, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  jouer(w, 5);
  const tour = tourHabitee(w, 7, 'derriere');
  // Le relevé des assauts d'un monde : { debut, fin }. La tour est imprenable, rien ne l'entame.
  const releverAssauts = (monde) => {
    const liste = [], t = monde.buildings.find((b) => b.id === tour.id);
    let dernier = null;
    liste.pas = () => {
      t.hp = t.maxHp;
      const a = monde.ais[0].assaut;
      if (a && !dernier) { dernier = { debut: monde.time, fin: null }; liste.push(dernier); }
      if (!a && dernier) { dernier.fin = monde.time; dernier = null; }
    };
    return liste;
  };
  const assauts = releverAssauts(w);
  // Seize miliciens au camp, et seize de plus dès qu'un assaut s'achève : de
  // quoi en donner un autre, si elle y tenait.
  let lot = renfort(w, 'militia', 16), lots = 1;
  jouer(w, 9 * 60, () => {
    assauts.pas();
    const fini = assauts.length > 0 && assauts[assauts.length - 1].fin !== null;
    if (fini && assauts.length === lots && lots < 3) { lot = renfort(w, 'militia', 16); lots++; }
    return lots === 3 && w.time > assauts[assauts.length - 1].fin + 45;
  });
  const durees = assauts.map((a) => Math.round((a.fin === null ? w.time : a.fin) - a.debut));
  check('contre une tour imprenable, un assaut dure deux minutes au plus — quatre quand elle est occupée sur un bâtiment',
    assauts.length === 2 && durees.every((d) => d <= 241), `durées : ${durees.join(', ')} s`);
  check('… et pas plus de trois tentatives au même âge, vague comprise : le renfort suivant n’y est pas envoyé',
    w.players[1].age === 0 && ai.assauts[tour.id] === 3 && !ai.assaut && !lot.some((u) => !u.dead && u.target === tour),
    `${assauts.length} assauts et ${ai.waveCount} vague lancée sur elle, compte ${ai.assauts[tour.id]} ; ${lot.filter((u) => !u.dead && u.target === tour).length} du dernier renfort sur la tour à ${mmss(w.time)}`);
  // Sauvegarde reprise après la troisième : le compte est tenu, rien ne recommence.
  const repris = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
  const suite = releverAssauts(repris);
  renfort(repris, 'militia', 16);
  jouer(repris, repris.time + 45, suite.pas);
  check('… pas davantage après une sauvegarde reprise : le compte est gardé',
    suite.length === 0 && repris.ais[0].assauts[tour.id] === 3, `${suite.length} assaut de plus en 45 s, compte ${repris.ais[0].assauts[tour.id]}`);
});

// Une vague qui vient de partir est encore à deux pas du camp : l'assaut ne la
// rappelle pas. (Avant : ses soldats étaient repris pour l'assaut, la vague
// était comptée sans avoir eu lieu.)
essai('tour habitée, la vague partie', () => {
  const w = new World({ seed: 42, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  jouer(w, 60);
  // Hors de portée de son centre : rien ne l'occupe, six miliciens n'y suffisent pas.
  const tour = tourHabitee(w, 11, 'derriere');
  const vague = renfort(w, 'militia', 6);
  jouer(w, 70, () => ai.waveCount > 0);
  const partie = ai.waveCount === 1 && !ai.assaut && vague.every((u) => u.state === 'attackMove');
  const camp = renfort(w, 'militia', 16);
  jouer(w, w.time + 3);
  check('six miliciens n’ont pas de quoi abattre la tour : ils partent en vague sur le joueur',
    partie, `${ai.waveCount} vague, ${vague.filter((u) => u.state === 'attackMove').length} sur 6 en marche`);
  check('seize de plus au camp l’instant d’après : l’assaut part avec eux, la vague continue sa route',
    !!ai.assaut && camp.filter((u) => u.target === tour).length === 16 && vague.every((u) => u.target !== tour && u.state === 'attackMove'),
    `${camp.filter((u) => u.target === tour).length} du camp et ${vague.filter((u) => u.target === tour).length} de la vague sur la tour`);
});

// Le camp sous les flèches d'une tour qu'elle ne peut pas abattre (deux
// occupants, plantée à cinq cases de son point de regroupement) : ses soldats
// en sortent au lieu d'y rester plantés, et aucun ne s'y attaque de lui-même.
// (Avant : les six y mouraient, « au repos, sans cible » ou un par un au pied du mur.)
essai('le camp sous les flèches', () => {
  const w = new World({ seed: 42, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  jouer(w, 5);
  const tc = centre(w, 1);
  w.players[0].age = 1;
  let best = null, bestD = Infinity;
  for (let ty = 1; ty < w.map.h - 2; ty++) for (let tx = 1; tx < w.map.w - 2; tx++) {
    if (!w.canPlace(0, 'tower', tx, ty, true)) continue;
    const d = Math.hypot((tx + 1) * TILE - tc.x, (ty + 1) * TILE - (tc.y + 9 * TILE));
    if (d < bestD) { bestD = d; best = { tx, ty }; }
  }
  const tour = w.spawnBuilding(0, 'tower', best.tx, best.ty, true);
  for (let k = 0; k < 2; k++) tour.addToGarrison(w.spawnUnit(0, 'villager', tour.x, tour.y + TILE * 2));
  const troupe = renfort(w, 'militia', 6);
  const aPortee = () => troupe.filter((u) => !u.dead && Math.hypot(u.x - tour.x, u.y - tour.y) <= tour.rangePx() + TILE).length;
  const auDepart = aPortee();
  // (Passé les deux premières secondes — le temps que l'IA relève la tour —,
  // plus aucun d'eux ne doit l'avoir pour cible.)
  let assauts = 0, surLaTour = 0;
  const suivre = () => {
    if (ai.assaut) assauts++;
    if (w.time > 7 && troupe.some((u) => !u.dead && u.target === tour)) surLaTour++;
  };
  jouer(w, 5 + 20, suivre);
  const apres20 = aPortee();
  jouer(w, 5 + 45, suivre);
  const morts = troupe.filter((u) => u.dead).length;
  check('six miliciens au camp, une tour à trois flèches plantée à côté : pas de quoi l’abattre, pas d’assaut',
    auDepart === 6 && assauts === 0, `${auDepart} à portée au départ`);
  check('… aucun ne s’y attaque de lui-même, même touché : la tour ne reçoit pas un coup',
    surLaTour === 0 && tour.hp === tour.maxHp, `tour à ${Math.round(tour.hp)}/${tour.maxHp}`);
  check('… ils sortent de sa portée en vingt secondes et n’y reviennent pas, deux morts au plus',
    apres20 === 0 && aPortee() === 0 && morts <= 2, `${apres20} à portée après 20 s, ${aPortee()} après 45 s, ${morts} mort(s) sur 6`);
});

// Chez le joueur, rien de tout cela : ses défenses ne sont pas un « terrain
// battu », et les troupes de l'IA s'en prennent d'elles-mêmes à ses bâtiments,
// tour comprise. Sans cela, plus aucune vague ne raserait sa base.
essai('chez le joueur', () => {
  const w = new World({ seed: 42, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  jouer(w, 5);
  const moi = centre(w, 0);
  w.players[0].age = 1;
  let best = null, bestD = Infinity;
  for (let ty = 1; ty < w.map.h - 2; ty++) for (let tx = 1; tx < w.map.w - 2; tx++) {
    if (!w.canPlace(0, 'tower', tx, ty, true)) continue;
    const d = Math.abs(Math.hypot((tx + 1) * TILE - moi.x, (ty + 1) * TILE - moi.y) - 6 * TILE);
    if (d < bestD) { bestD = d; best = { tx, ty }; }
  }
  const tour = w.spawnBuilding(0, 'tower', best.tx, best.ty, true);
  tour.addToGarrison(w.spawnUnit(0, 'villager', tour.x, tour.y + TILE * 2));
  // Un ouvrier de l'IA égaré sous cette tour, et trois de ses miliciens à côté.
  const egare = w.spawnUnit(1, 'villager', tour.x + TILE * 3, tour.y);
  const troupe = [0, 1, 2].map((k) => w.spawnUnit(1, 'militia', tour.x - TILE * 3, tour.y + (k - 1) * TILE));
  jouer(w, 5 + 4);
  check('une tour habitée du joueur près de SON centre, un ouvrier de l’IA à sa portée : pas de terrain battu',
    ai.zones.length === 0 && !w.players[1].zoneEvitee && ai.batimentArme() === null, `${ai.zones.length} zone(s) relevée(s)${egare.dead ? ', ouvrier tué' : ''}`);
  check('… et les miliciens de l’IA arrivés là s’en prennent d’eux-mêmes à ce qu’ils trouvent',
    troupe.some((u) => !u.dead && u.target && u.target.playerIndex === 0),
    troupe.map((u) => (u.dead ? 'mort' : u.target ? u.target.type : 'sans cible')).join(', '));
});

// Entre les deux : une tour du joueur à seize cases du centre de l'IA, hors de
// sa base, qui bat un de ses ouvriers. Le terrain est évité, mais l'armée du
// camp n'y est pas menée : ce serait une vague qui ne dit pas son nom.
essai('hors de sa base', () => {
  const w = new World({ seed: 42, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  jouer(w, 5);
  const tour = tourHabitee(w, 16, 'devant');
  w.spawnUnit(1, 'villager', tour.x + TILE * 3, tour.y);
  const troupe = renfort(w, 'militia', 16);
  let assauts = 0;
  jouer(w, 5 + 8, () => { if (ai.assaut) assauts++; });
  check('une tour habitée à seize cases de son centre, un ouvrier à sa portée : le terrain battu est relevé',
    ai.zones.length === 1 && ai.niveauZone(tour.x, tour.y + TILE * 4) === 2 && !ai.presDeLaBase(tour));
  check('… mais ce n’est pas un bâtiment à raser par l’armée du camp : seize miliciens n’y sont pas menés',
    ai.batimentArme() === null && assauts === 0 && !troupe.some((u) => u.target === tour),
    `${troupe.filter((u) => u.target === tour).length} milicien(s) sur la tour`);
});

// Une alerte sans combat ne dure pas : l'IA n'a plus d'armée, un ouvrier du
// joueur se plante à côté des siens, hors de portée de tir du centre. (Avant :
// alerte 100 % du temps, six ouvriers enfermés en moyenne jusqu'à la fin.)
essai('alerte sans combat', () => {
  const w = new World({ seed: 42, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  jouer(w, 120);
  for (const u of armee(w)) w.killEntity(u, null);
  const tc = centre(w, 1);
  const loin = ouvriers(w).sort((a, b) => Math.hypot(b.x - tc.x, b.y - tc.y) - Math.hypot(a.x - tc.x, a.y - tc.y))[0];
  const intrus = w.spawnUnit(0, 'villager', loin.x + TILE, loin.y);
  let secondes = 0, alerte = 0, enfermesMax = 0, pas = 0;
  jouer(w, 120 + 30, () => { enfermesMax = Math.max(enfermesMax, ouvriers(w).filter((u) => u.garrisonedIn).length); });
  check('un intrus dans la base : l’IA se met en alerte et abrite les ouvriers menacés',
    w.time < ai.defendUntil && enfermesMax > 0, `${enfermesMax} ouvrier(s) à l’abri`);
  // (Sauvegardée ici, à trente secondes d'alerte, la partie est reprise à part plus bas.)
  const enAlerte = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
  let levee = null;
  jouer(w, 120 + 60, () => { if (levee === null && !(w.time < ai.defendUntil)) levee = w.time; });
  const dehors = ouvriers(w).filter((u) => u.garrisonedIn).length;
  check('quarante-cinq secondes sans un coup : l’alerte est levée, les ouvriers abrités ressortent',
    !intrus.dead && levee !== null && levee > 120 + 40 && !(w.time < ai.defendUntil) && dehors === 0,
    `alerte levée à ${mmss(levee)}, ${dehors} ouvrier(s) encore enfermé(s) à ${mmss(w.time)}`);
  // (Et ici, en plein répit.)
  const enRepit = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
  jouer(w, 7 * 60, () => {
    if (++pas % TICKS_PER_SECOND === 0) { secondes++; if (w.time < ai.defendUntil) alerte++; }
  });
  check('… et l’alerte ne tient pas toute la partie : moins de la moitié du temps',
    !intrus.dead && alerte / secondes < 0.5, `alerte ${Math.round((100 * alerte) / secondes)} % du temps de 3:00 à 7:00`);
  // Les deux sauvegardes : l'alerte reprise est levée à la même heure, le répit repris tient.
  let leveeReprise = null;
  jouer(enAlerte, 120 + 60, () => { if (leveeReprise === null && !(enAlerte.time < enAlerte.ais[0].defendUntil)) leveeReprise = enAlerte.time; });
  check('sauvegarde reprise à trente secondes d’alerte : elle est levée à la même heure, ni plus tôt ni plus tard',
    levee !== null && leveeReprise !== null && Math.abs(leveeReprise - levee) < 1e-6, `levée à ${mmss(leveeReprise)} dans la partie reprise`);
  let realerte = 0, renfermes = 0;
  jouer(enRepit, 120 + 60 + 40, () => {
    if (enRepit.time < enRepit.ais[0].defendUntil) realerte++;
    renfermes = Math.max(renfermes, ouvriers(enRepit).filter((u) => u.garrisonedIn).length);
  });
  check('sauvegarde reprise en plein répit : l’alerte ne reprend pas, personne n’est renvoyé à l’abri',
    realerte === 0 && renfermes === 0, `${(realerte * DT).toFixed(0)} s d’alerte et ${renfermes} ouvrier(s) abrité(s) dans les 40 s qui suivent`);
});

// Une vraie attaque sur sa base, et la partie est sauvegardée en plein combat,
// l'alerte courant depuis plus de quarante-cinq secondes : à la reprise, elle
// tient toujours. (Avant : l'heure du dernier coup reçu n'était pas
// sauvegardée ; l'IA croyait le calme revenu, levait l'alerte au milieu des
// béliers et comptait une vague sans que personne ne parte.)
essai('alerte, reprise en plein combat', () => {
  const w = new World({ seed: 2024, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  jouer(w, 500);
  const tc = centre(w, 1);
  w.players[0].age = 2;
  const maison = w.buildings.find((b) => b.playerIndex === 1 && b.type === 'house' && !b.dead) || tc;
  const raid = [0, 1, 2, 3].map((k) => w.spawnUnit(0, 'ram', tc.x - TILE * (10 + k), tc.y + TILE * 9));
  for (const u of raid) u.attackEntity(maison);
  jouer(w, 552);
  const depuis = w.time - ai.alerteDepuis, enVie = raid.filter((u) => !u.dead).length;
  const repris = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
  const suite = (monde) => {
    const a = monde.ais[0];
    const r = { levee: null, vague: null };
    jouer(monde, 600, () => {
      if (r.levee === null && a.repit > 0) r.levee = monde.time;
      if (r.vague === null && a.waveCount > 0) r.vague = monde.time;
    });
    return r;
  };
  const origine = suite(w), reprise = suite(repris);
  check('quatre béliers sur sa base depuis 52 secondes : on se bat encore, et l’alerte tient jusqu’au bout',
    depuis > 45 && enVie > 0 && origine.levee === null, `à 9:12 : alerte depuis ${depuis.toFixed(0)} s, ${enVie} bélier(s) en vie`);
  check('sauvegarde reprise à ce moment : l’alerte n’est pas levée, et la première vague part à la même heure',
    reprise.levee === null && reprise.vague === origine.vague,
    `partie reprise : alerte ${reprise.levee === null ? 'tenue' : 'levée à ' + mmss(reprise.levee)}, vague à ${mmss(reprise.vague)} ; partie d’origine : vague à ${mmss(origine.vague)}`);
});

// L'épargne pour l'âge suivant continue pendant une alerte. Un intrus que
// l'IA n'arrive pas à tuer la tient en alerte tout du long. (Avant : l'épargne
// sautait, tout partait en miliciens et l'Âge Féodal attendait.)
essai('épargne en alerte', () => {
  const w = new World({ seed: 42, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  jouer(w, 8 * 60);
  const tc = centre(w, 1);
  const intrus = w.spawnUnit(0, 'scout', tc.x - TILE * 9, tc.y + TILE * 9);
  intrus.stance = 'passive';
  let secondes = 0, alerte = 0, pas = 0, feodal = null;
  jouer(w, 12 * 60, () => {
    intrus.hp = intrus.maxHp;   // increvable : l'alerte ne finit pas par sa mort
    if (++pas % TICKS_PER_SECOND === 0) { secondes++; if (w.time < ai.defendUntil) alerte++; }
    if (feodal === null && w.players[1].age >= 1) feodal = w.time;
    return feodal !== null;
  });
  check('en alerte presque tout du long, l’IA passe quand même à l’Âge Féodal (avant 12:00)',
    feodal !== null && alerte / secondes > 0.8,
    `alerte ${Math.round((100 * alerte) / secondes)} % du temps, Âge Féodal à ${mmss(feodal)}, ${armee(w).length} soldats`);
});

// … sauf débordée : tant que l'ennemi a plus de troupes dans sa base qu'elle
// n'a de soldats, elle puise dans son épargne pour en former. (Sans cela :
// aucun soldat formé de toute l'attaque, la moitié du prix de l'âge en caisse.)
essai('épargne, débordée', () => {
  const w = new World({ seed: 2024, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  jouer(w, 8 * 60);
  const tc = centre(w, 1);
  const enReserve = ai.savingForAge, soldats = armee(w).length;
  const connus = new Set(armee(w));
  const raid = [0, 1, 2, 3, 4, 5].map((k) => w.spawnUnit(0, 'militia', tc.x - TILE * (8 + k % 3), tc.y + TILE * (8 + Math.floor(k / 3))));
  for (const u of raid) u.attackEntity(tc);
  let formes = 0, repousse = null;
  jouer(w, 8 * 60 + 60, () => {
    for (const u of armee(w)) if (!connus.has(u)) { connus.add(u); formes++; }
    if (repousse === null && raid.every((u) => u.dead)) repousse = w.time;
  });
  check('à 8:00 elle met de côté pour l’Âge Féodal, et six miliciens entrent chez elle : plus qu’elle n’a de soldats',
    enReserve && soldats < raid.length, `${soldats} soldat(s), épargne ${enReserve ? 'en cours' : 'non commencée'}`);
  check('… elle forme des soldats quand même, et repousse l’attaque dans la minute',
    formes >= 2 && repousse !== null, `${formes} soldat(s) formé(s) en une minute, attaque repoussée à ${mmss(repousse)}`);
});

console.log(`\n${failures === 0 ? '✅ Tous les tests passent' : '❌ ' + failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
