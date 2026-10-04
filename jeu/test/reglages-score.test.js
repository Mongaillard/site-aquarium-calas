// Réglages « score » : le score Express compte le combat, une partie Classique
// se termine sans chasse à la dernière ferme, et un palmarès garde la trace
// des parties finies. Sans navigateur : les règles se jouent sous Node, les
// textes de l'écran de fin et de l'aide se lisent dans le HTML qu'ils produisent.
// Lancement : node test/reglages-score.test.js

import { World } from '../js/game.js';
import { AIPlayer } from '../js/ai.js';
import {
  serializeWorld, restoreWorld, clearSave, saveGame, loadSave, SAVE_VERSION, SAVE_KEY,
  PALMARES_KEY, lirePalmares, lignePalmares, inscrireAuPalmares, resumePalmares,
} from '../js/save.js';
import { DIFFICULTIES, TICKS_PER_SECOND, TILE, UNIT_TYPES, BUILDING_TYPES } from '../js/config.js';
import { UI } from '../js/ui.js';
import { ICONES } from '../js/icones.js';
import { formatTime } from '../js/utils.js';
import { readFileSync } from 'node:fs';

const DT = 1 / TICKS_PER_SECOND;
let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? '  ok  ' : ' FAIL ';
  if (!condition) failures++;
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

const prix = (def) => Object.values(def.cost).reduce((a, b) => a + b, 0);
const centre = (w, i = 0) => w.buildings.find((b) => !b.dead && b.playerIndex === i && b.type === 'towncenter');
const batiments = (w, i) => w.buildings.filter((b) => !b.dead && b.playerIndex === i);
const messages = (w) => w.drainEvents().filter((e) => e.type === 'notice').map((e) => e.text);
/** Un monde sans adversaire qui joue : seules les règles s'y expriment. */
function monde(options) {
  const w = new World({ difficulty: 'normal', ...options });
  w.ais = [];
  w.drainEvents();
  return w;
}
/** Une troupe posée près du Centre-Ville de son camp. */
function troupe(w, joueur, type, rang = 0) {
  const c = centre(w, joueur);
  return w.spawnUnit(joueur, type, c.x + TILE * (3 + (rang % 4)), c.y + TILE * (3 + Math.floor(rang / 4)));
}
/** Un bâtiment posé d'office à côté du Centre-Ville (ou de l'endroit où il se tenait). */
function batir(w, joueur, type, acheve = true, rang = 0) {
  const depart = w.map.startPositions[joueur];
  return w.spawnBuilding(joueur, type, depart.tx + 4 + rang * 4, depart.ty + 5, acheve);
}
/** Deux IA s'affrontent jusqu'à la fin de la partie, ou jusqu'à la limite donnée. */
function partieIA({ seed, mode, mapSize, difficultes, minutes }) {
  const w = new World({ seed, mode, mapSize, difficulty: difficultes[1] });
  w.players[0].autoWorkers = true;
  w.ais.push(new AIPlayer(w, 0, DIFFICULTIES[difficultes[0]]));
  while (!w.gameOver && w.time < minutes * 60) { w.update(DT); w.drainEvents(); }
  return w;
}

console.log('=== Réglages « score » ===\n');

// ---------------------------------------------------------------------------
// 1. Le score Express compte le combat
// ---------------------------------------------------------------------------
console.log('--- Le score Express ---');
{
  const w = monde({ seed: 91, mode: 'express' });
  const [moi, lui] = w.players;
  const depart = w.detailScore(moi);
  const attendu = prix(BUILDING_TYPES.towncenter) + w.mode.villagers * prix(UNIT_TYPES.villager) + prix(UNIT_TYPES.scout);
  check('au départ, le score est le prix de ce qui est debout', depart.recolte === 0 && depart.abattu === 0
    && depart.debout === attendu && depart.total === attendu, JSON.stringify(depart));
  check('le score est la somme de ses trois parts', w.score(moi) === depart.recolte + depart.debout + depart.abattu);

  w.deposit(0, 'wood', 100);
  check('récolter compte pour moitié : 100 de bois, 50 points', w.detailScore(moi).recolte === 50 && w.score(moi) === attendu + 50,
    String(w.score(moi) - attendu));

  // Un soldat tué : son prix quitte le score de l'un, et entre deux fois dans celui de l'autre.
  const garde = troupe(w, 0, 'militia');
  const cible = troupe(w, 1, 'militia');
  const avant = [w.detailScore(moi), w.detailScore(lui)];
  w.killEntity(cible, garde);
  const apres = [w.detailScore(moi), w.detailScore(lui)];
  const v = prix(UNIT_TYPES.militia);
  check('un soldat ennemi abattu rapporte deux fois son prix', apres[0].abattu - avant[0].abattu === 2 * v && moi.stats.destroyed === v,
    `+${apres[0].abattu - avant[0].abattu} pour un Milicien à ${v}`);
  check('… et coûte son prix à celui qui le perd', avant[1].debout - apres[1].debout === v && apres[1].abattu === 0,
    `−${avant[1].debout - apres[1].debout}`);
  check('avant, ce soldat ne pesait que 10 points : l’écart créé est maintenant de trois fois son prix',
    (apres[0].total - apres[1].total) - (avant[0].total - avant[1].total) === 3 * v, String(3 * v));

  // Un bâtiment rasé compte aussi, et sa garnison avec lui.
  const maison = batir(w, 1, 'house');
  const abattuAvant = moi.stats.destroyed;
  w.killEntity(maison, garde);
  check('un bâtiment ennemi rasé rapporte son prix (compté double au score)', moi.stats.destroyed - abattuAvant === prix(BUILDING_TYPES.house)
    && w.detailScore(moi).abattu === 2 * moi.stats.destroyed, `+${moi.stats.destroyed - abattuAvant}`);
  const tour = batir(w, 1, 'tower', true, 1);
  const abrite = troupe(w, 1, 'archer', 1);
  abrite.garrisonedIn = tour; tour.garrison.push(abrite);
  const avantTour = moi.stats.destroyed;
  w.killEntity(tour, garde);
  check('la garnison qui périt avec le bâtiment est comptée à celui qui le rase',
    moi.stats.destroyed - avantTour === prix(BUILDING_TYPES.tower) + prix(UNIT_TYPES.archer) && abrite.dead,
    `+${moi.stats.destroyed - avantTour}`);

  // Ce qui ne rapporte rien : ses propres pertes, une suppression, les animaux.
  const stable = moi.stats.destroyed, stableLui = lui.stats.destroyed;
  w.killEntity(troupe(w, 0, 'militia', 2), garde);          // tué par son propre camp
  w.killEntity(troupe(w, 1, 'militia', 2), null);           // supprimé par son propriétaire
  const cerf = w.units.find((u) => u.isAnimal);
  if (cerf) w.killEntity(cerf, garde);
  check('ni ses propres troupes, ni une suppression, ni un animal ne rapportent de points',
    moi.stats.destroyed === stable && lui.stats.destroyed === stableLui, `${moi.stats.destroyed} / ${lui.stats.destroyed}`);
  // Un bâtiment en chantier ne compte pas encore dans ce qui est debout.
  const deboutAvant = w.detailScore(moi).debout;
  batir(w, 0, 'barracks', false);
  check('un chantier ne compte pas encore comme « debout »', w.detailScore(moi).debout === deboutAvant);
}

{
  // Le cas du rapport : un camp récolte 400 de plus mais perd sept soldats de
  // plus qu'il n'en tue. Avec l'ancien barème il gagnait ; plus maintenant.
  const w = monde({ seed: 5, mode: 'express' });
  const [moi, lui] = w.players;
  w.deposit(0, 'food', 2000);
  w.deposit(1, 'food', 2400);
  const miens = [], siens = [];
  for (let i = 0; i < 10; i++) { miens.push(troupe(w, 0, 'militia', i)); siens.push(troupe(w, 1, 'militia', i)); }
  for (let i = 0; i < 7; i++) w.killEntity(siens[i], miens[i]);
  const ancien = (p) => {
    const g = p.stats.gathered;
    return g.food + g.wood + g.gold
      + 10 * w.units.filter((u) => !u.dead && !u.isAnimal && u.playerIndex === p.index).length
      + 25 * batiments(w, p.index).filter((b) => b.complete).length;
  };
  check('ancien barème : le camp qui a perdu sept soldats de plus l’emportait', ancien(lui) > ancien(moi),
    `${ancien(moi)} contre ${ancien(lui)}`);
  check('nouveau barème : il ne l’emporte plus', w.score(moi) > w.score(lui), `${w.score(moi)} contre ${w.score(lui)}`);
  const d = w.detailScore(moi);
  check('ce que l’on abat et ce que l’on garde pèsent au moins autant que la récolte', d.debout + d.abattu >= d.recolte,
    JSON.stringify(d));

  // Au temps écoulé, le résultat porte les scores et leur détail.
  w.time = w.mode.timeLimit - DT / 2;
  w.update(DT);
  const fin = w.gameOver;
  check('au temps écoulé, le meilleur score l’emporte', !!fin && fin.timeUp === true && fin.winner === 0 && fin.victory === true,
    fin ? `vainqueur ${fin.winner}` : 'partie toujours en cours');
  check('le résultat porte les deux scores et leur détail', !!fin && fin.scores.length === 2 && fin.detail.length === 2
    && fin.detail.every((x, i) => x.total === fin.scores[i] && x.total === x.recolte + x.debout + x.abattu
      && [x.recolte, x.debout, x.abattu].every((n) => Number.isInteger(n) && n >= 0)),
    fin ? fin.scores.join(' contre ') : '');
}

{
  // Fin par le Centre-Ville, ou abandon : le résultat d'une partie Express porte aussi les scores.
  const w = monde({ seed: 91, mode: 'express' });
  w.killEntity(centre(w, 1), troupe(w, 0, 'militia'));
  w.checkVictory();
  check('Express, Centre-Ville adverse rasé : victoire, avec les scores au résultat',
    !!w.gameOver && w.gameOver.victory === true && !w.gameOver.timeUp && Array.isArray(w.gameOver.scores) && Array.isArray(w.gameOver.detail),
    JSON.stringify(w.gameOver && w.gameOver.scores));
  const a = monde({ seed: 91, mode: 'express' });
  a.resign();
  check('Express, abandon : défaite, avec les scores au résultat', a.gameOver.resigned === true && a.gameOver.victory === false
    && Array.isArray(a.gameOver.scores));
  const c = monde({ seed: 91, mode: 'classique' });
  c.resign();
  check('Classique : pas de score au résultat (le format ne se joue pas aux points)', c.gameOver.scores === undefined && c.gameOver.detail === undefined);
}

{
  // Sauvegarde : la nouvelle statistique voyage avec la partie, et une
  // sauvegarde d'avant (sans elle) se reprend avec zéro.
  const w = monde({ seed: 91, mode: 'express' });
  w.killEntity(troupe(w, 1, 'militia'), troupe(w, 0, 'militia'));
  const instantane = JSON.parse(JSON.stringify(serializeWorld(w)));
  const repris = restoreWorld(instantane);
  check('la valeur abattue survit à la sauvegarde', !!repris && repris.players[0].stats.destroyed === w.players[0].stats.destroyed
    && repris.score(repris.players[0]) === w.score(w.players[0]), repris ? String(repris.players[0].stats.destroyed) : 'reprise refusée');
  for (const j of instantane.players) delete j.stats.destroyed;
  const ancienne = restoreWorld(instantane);
  check('une sauvegarde d’avant ce réglage se reprend : statistique absente, zéro', !!ancienne
    && ancienne.players.every((p) => p.stats.destroyed === 0 && Number.isFinite(ancienne.score(p))),
    ancienne ? ancienne.players.map((p) => ancienne.score(p)).join(' / ') : 'reprise refusée');
  check('la version de sauvegarde ne change pas', SAVE_VERSION === 1 && instantane.version === 1, String(SAVE_VERSION));
}

{
  // Parties IA contre IA : la récolte ne fait plus l'essentiel du score.
  const parts = [], lignes = [];
  let somme = true, vainqueur = true;
  for (const seed of [101, 202, 606]) {
    const w = partieIA({ seed, mode: 'express', difficultes: ['normal', 'normal'], minutes: 11 });
    const fin = w.gameOver;
    if (!fin || !fin.detail) { somme = false; continue; }
    for (const x of fin.detail) {
      parts.push(x.recolte / x.total);
      if (x.debout + x.abattu < x.recolte) somme = false;
    }
    if (fin.timeUp && fin.winner >= 0 && fin.scores[fin.winner] < fin.scores[1 - fin.winner]) vainqueur = false;
    lignes.push(`graine ${seed} : ${fin.timeUp ? 'aux points' : 'par le Centre-Ville'}, ${fin.scores.join(' contre ')}`);
  }
  const maxi = Math.round(100 * Math.max(...parts));
  check('IA contre IA en Express : la récolte pèse moins de la moitié du score (c’était 80 %)', parts.length === 6 && maxi < 50,
    `de ${Math.round(100 * Math.min(...parts))} à ${maxi} % · ${lignes.join(' · ')}`);
  check('… et ce que l’on abat et garde pèse au moins autant qu’elle, dans chaque camp', somme);
  check('… aux points, c’est bien le meilleur score qui gagne', vainqueur);
}

// ---------------------------------------------------------------------------
// 2. Une partie Classique qui se termine
// ---------------------------------------------------------------------------
console.log('\n--- La conquête ---');
{
  const militaires = ['barracks', 'archery', 'stable', 'siege', 'temple'];
  const civils = ['house', 'mill', 'lumbercamp', 'miningcamp', 'farm', 'blacksmith', 'tower'];
  check('les bâtiments militaires sont ceux qui forment des troupes, hors Centre-Ville',
    Object.values(BUILDING_TYPES).filter((b) => b.trains && b.id !== 'towncenter').map((b) => b.id).sort().join() === [...militaires].sort().join());

  // Sans Centre-Ville ni bâtiment militaire : vaincu, même avec des ouvriers et des bâtiments civils.
  {
    const w = monde({ seed: 91, mode: 'classique' });
    civils.forEach((type, i) => batir(w, 1, type, true, i));
    for (let i = 0; i < 12; i++) troupe(w, 1, 'villager', i);
    for (let i = 0; i < 6; i++) troupe(w, 1, 'militia', i + 12);
    w.checkVictory();
    const avant = !!w.gameOver;
    w.killEntity(centre(w, 1), troupe(w, 0, 'militia'));
    w.checkVictory();
    check('Classique : sans Centre-Ville ni bâtiment militaire, le camp est vaincu — malgré ses fermes, sa tour, sa forge, ses ouvriers et ses soldats',
      !avant && !!w.gameOver && w.gameOver.victory === true && w.gameOver.winner === 0 && w.players[1].defeated,
      `${batiments(w, 1).length} bâtiments et ${w.units.filter((u) => u.playerIndex === 1 && !u.isAnimal).length} unités restaient`);
  }

  // Chaque bâtiment militaire, à lui seul, tient le camp en vie ; achevé ou en chantier.
  for (const acheve of [true, false]) {
    const tenus = [];
    for (const type of militaires) {
      const w = monde({ seed: 91, mode: 'classique' });
      const b = batir(w, 1, type, acheve);
      w.killEntity(centre(w, 1), null);
      w.checkVictory();
      const tient = !w.gameOver;
      w.killEntity(b, null);
      w.checkVictory();
      if (tient && w.gameOver && w.gameOver.victory) tenus.push(type);
    }
    check(`un bâtiment militaire ${acheve ? 'achevé' : 'en chantier'} tient le camp en vie, et sa chute donne la victoire`,
      tenus.length === militaires.length, tenus.join(', '));
  }
  {
    // Un Centre-Ville en chantier compte aussi (le camp se relève).
    const w = monde({ seed: 91, mode: 'classique' });
    const ancienCentre = centre(w, 1);
    batir(w, 1, 'towncenter', false);
    w.killEntity(ancienCentre, null);
    w.checkVictory();
    check('Classique : un Centre-Ville en chantier tient le camp en vie', !w.gameOver);
  }
  {
    // Le joueur aussi peut tomber ainsi.
    const w = monde({ seed: 91, mode: 'classique' });
    for (let i = 0; i < 8; i++) troupe(w, 0, 'villager', i);
    batir(w, 0, 'house');
    w.killEntity(centre(w, 0), troupe(w, 1, 'militia'));
    w.update(DT);
    check('Classique : le joueur sans Centre-Ville ni bâtiment militaire a perdu', !!w.gameOver && w.gameOver.victory === false && w.gameOver.winner === 1,
      JSON.stringify(w.gameOver));
  }
  {
    // Express : rien ne change, une fondation de Centre-Ville ne sauve pas, une caserne non plus.
    const w = monde({ seed: 91, mode: 'express' });
    batir(w, 1, 'barracks');
    w.killEntity(centre(w, 1), null);
    w.checkVictory();
    check('Express : le dernier Centre-Ville décide toujours, caserne ou pas', !!w.gameOver && w.gameOver.victory === true);
  }

  // L'avertissement : dernier Centre-Ville perdu, il ne reste que des bâtiments militaires.
  {
    const w = monde({ seed: 91, mode: 'classique' });
    batir(w, 0, 'barracks');
    w.drainEvents();
    w.killEntity(centre(w, 0), troupe(w, 1, 'militia'));
    const dits = messages(w);
    w.checkVictory();
    check('dernier Centre-Ville perdu, caserne debout : la partie continue et le joueur est prévenu',
      !w.gameOver && dits.length === 1 && dits[0].includes('Rebâtissez un Centre-Ville') && dits[0].includes('bâtiments militaires'),
      dits.join(' | ') || 'aucun message');
  }
  {
    const w = monde({ seed: 91, mode: 'classique', civs: ['solarien', 'atlante'] });
    batir(w, 0, 'temple');
    w.drainEvents();
    w.killEntity(centre(w, 0), troupe(w, 1, 'militia'));
    const dits = messages(w);
    check('… avec le nom du bâtiment dans sa civilisation', dits.length === 1 && dits[0].includes('Rebâtissez un Palais du Soleil')
      && !dits[0].includes('Centre-Ville'), dits.join(' | ') || 'aucun message');
  }
  {
    // Pas d'avertissement quand il n'a pas lieu d'être.
    const silences = [];
    const a = monde({ seed: 91, mode: 'classique' });      // il reste un second Centre-Ville
    batir(a, 0, 'barracks'); batir(a, 0, 'towncenter', true, 2); a.drainEvents();
    a.killEntity(centre(a, 0), null);
    silences.push(messages(a).length);
    const b = monde({ seed: 91, mode: 'classique' });      // c'est l'adversaire qui perd le sien
    batir(b, 1, 'barracks'); b.drainEvents();
    b.killEntity(centre(b, 1), null);
    silences.push(messages(b).length);
    const c = monde({ seed: 91, mode: 'classique' });      // plus rien : c'est la défaite, pas un conseil
    c.drainEvents();
    c.killEntity(centre(c, 0), null);
    silences.push(messages(c).length);
    const d = monde({ seed: 91, mode: 'express' });        // en Express, la partie est finie
    batir(d, 0, 'barracks'); d.drainEvents();
    d.killEntity(centre(d, 0), null);
    silences.push(messages(d).length);
    const e = monde({ seed: 91, mode: 'classique' });      // une fondation annulée par le joueur lui-même
    batir(e, 0, 'barracks'); const vieux = centre(e, 0);
    const fondation = batir(e, 0, 'towncenter', false, 2);
    e.killEntity(vieux, null); e.drainEvents();
    e.killEntity(fondation, null, true);
    silences.push(messages(e).length);
    check('pas d’avertissement s’il reste un Centre-Ville, pour l’adversaire, à la défaite, en Express, ni pour un chantier annulé',
      silences.every((n) => n === 0), silences.join(','));
  }
}

{
  // Parties IA contre IA : des parties Classique se terminent. (Entre deux IA
  // de même niveau, aucune ne perce l'autre en quarante minutes, avec l'ancienne
  // règle comme avec la nouvelle : c'est l'affaire de l'IA, pas de la règle. On
  // mesure donc des niveaux inégaux, et on tolère une partie qui traîne.)
  const finies = [], lignes = [];
  for (const [seed, difficultes] of [[11, ['hard', 'easy']], [33, ['hard', 'easy']], [11, ['normal', 'easy']]]) {
    const w = partieIA({ seed, mode: 'classique', mapSize: 'medium', difficultes, minutes: 40 });
    const fin = w.gameOver;
    if (fin) finies.push(seed);
    const perdant = fin && fin.winner >= 0 ? 1 - fin.winner : -1;
    lignes.push(`graine ${seed} ${DIFFICULTIES[difficultes[0]].name} contre ${DIFFICULTIES[difficultes[1]].name} : `
      + (fin ? `finie à ${formatTime(fin.time)}, il restait au vaincu ${batiments(w, perdant).length} bâtiment(s) et `
        + `${w.units.filter((u) => !u.dead && u.playerIndex === perdant && u.isVillager).length} ouvrier(s)` : 'pas finie à 40:00'));
  }
  check('IA contre IA en Classique, niveaux inégaux : des parties se terminent avant 40 minutes', finies.length >= 2, lignes.join(' · '));
}

// ---------------------------------------------------------------------------
// 3. Le palmarès
// ---------------------------------------------------------------------------
console.log('\n--- Le palmarès ---');
function poserStockage(store) {
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
}
function fauxStockage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    contenu: m,
  };
}
const victoire = (time, extra = {}) => ({ winner: 0, victory: true, time, ...extra });
const defaite = (time, extra = {}) => ({ winner: 1, victory: false, time, ...extra });
{
  // Sans stockage (ou stockage qui refuse) : rien ne plante, rien n'est retenu.
  poserStockage(undefined);
  let plante = false, vide, refus;
  try { vide = lirePalmares(); refus = inscrireAuPalmares({ mode: 'classique', difficulty: 'normal', result: victoire(900) }); } catch { plante = true; }
  check('sans stockage local : palmarès vide, aucune erreur', !plante && Object.keys(vide).length === 0 && refus === null);
  poserStockage({ getItem() { throw new Error('refusé'); }, setItem() { throw new Error('refusé'); }, removeItem() {} });
  plante = false;
  let retour = null;
  try { vide = lirePalmares(); retour = inscrireAuPalmares({ mode: 'classique', difficulty: 'normal', result: victoire(900) }); } catch { plante = true; }
  check('stockage qui refuse lecture et écriture : aucune erreur, et aucun record annoncé', !plante && Object.keys(vide).length === 0 && retour === null);
}
{
  const store = fauxStockage();
  poserStockage(store);
  check('la clé du palmarès', PALMARES_KEY === 'aem.palmares.v1');
  check('rien n’est joué : la ligne est à zéro, rien à montrer à l’accueil',
    JSON.stringify(lignePalmares(lirePalmares(), 'classique', 'normal')) === JSON.stringify({ victoires: 0, defaites: 0, temps: null, score: 0 })
    && resumePalmares(lignePalmares(lirePalmares(), 'classique', 'normal')) === '');

  // Classique : victoires, défaites, meilleur temps.
  const classique = (result) => inscrireAuPalmares({ mode: 'classique', difficulty: 'normal', result });
  const p1 = classique(victoire(1310.4));
  check('première victoire : comptée, son temps entre au palmarès, sans précédent', p1.ligne.victoires === 1 && p1.ligne.defaites === 0
    && p1.temps.record === true && p1.temps.ancien === null && p1.temps.valeur === 1310 && p1.score === null, JSON.stringify(p1));
  check('… sous la bonne clé', store.contenu.has('aem.palmares.v1')
    && JSON.parse(store.contenu.get('aem.palmares.v1'))['classique.normal'].temps === 1310);
  const p2 = classique(victoire(1500));
  check('victoire plus lente : comptée, pas de record, le meilleur temps est rappelé', p2.ligne.victoires === 2 && p2.temps.record === false
    && p2.temps.ancien === 1310 && p2.ligne.temps === 1310);
  const p3 = classique(victoire(1122.9));
  check('victoire plus rapide : nouveau record, avec le précédent', p3.ligne.victoires === 3 && p3.temps.record === true
    && p3.temps.ancien === 1310 && p3.ligne.temps === 1122, JSON.stringify(p3.temps));
  const p4 = classique(defaite(700));
  check('défaite : comptée, ni temps ni score', p4.ligne.defaites === 1 && p4.ligne.victoires === 3 && p4.temps === null && p4.score === null);
  const p5 = classique(defaite(30, { resigned: true }));
  const p6 = classique(defaite(400, { resigned: true }));
  check('un abandon dans la première minute ne compte pas ; après, c’est une défaite', p5 === null && p6.ligne.defaites === 2);
  check('à l’accueil : « 3 victoires · meilleur temps 18:42 »',
    resumePalmares(lignePalmares(lirePalmares(), 'classique', 'normal')) === '3 victoires · meilleur temps 18:42',
    resumePalmares(lignePalmares(lirePalmares(), 'classique', 'normal')));

  // Par format et par difficulté.
  check('une autre difficulté a sa propre ligne', lignePalmares(lirePalmares(), 'classique', 'hard').victoires === 0
    && resumePalmares(lignePalmares(lirePalmares(), 'classique', 'hard')) === '');

  // Express : le meilleur score.
  const express = (result, difficulty = 'normal') => inscrireAuPalmares({ mode: 'express', difficulty, humanIndex: 0, result });
  const e1 = express(defaite(600, { timeUp: true, scores: [4120, 5200] }));
  check('Express perdu aux points : défaite comptée, le score entre quand même au palmarès', e1.ligne.defaites === 1 && e1.ligne.victoires === 0
    && e1.score.record === true && e1.score.ancien === null && e1.score.valeur === 4120 && e1.temps === null, JSON.stringify(e1));
  check('… et se montre à l’accueil, sans victoire', /^meilleur score 4\s?120$/.test(resumePalmares(e1.ligne)), resumePalmares(e1.ligne));
  const e2 = express(victoire(600, { timeUp: true, scores: [6725, 5822] }));
  check('Express gagné aux points : nouveau record de score, pas de record de temps', e2.ligne.victoires === 1 && e2.score.record === true
    && e2.score.ancien === 4120 && e2.ligne.score === 6725 && e2.temps === null && e2.ligne.temps === null);
  const e3 = express(victoire(505.2, { scores: [5100, 3650] }));
  check('Express gagné par le Centre-Ville : le temps entre au palmarès, le score ne bat pas le record', e3.temps.record === true && e3.temps.valeur === 505
    && e3.score.record === false && e3.score.ancien === 6725 && e3.ligne.score === 6725);
  const e4 = express(defaite(420, { scores: [9000, 9500] }));
  const e5 = express(defaite(420, { resigned: true, scores: [9000, 2000] }));
  check('camp rasé ou abandon : le score ne concourt pas', e4.score === null && e5.score === null && e5.ligne.score === 6725 && e5.ligne.defaites === 3);
  const e6 = express({ winner: -1, victory: false, time: 600, timeUp: true, scores: [5000, 5000] });
  check('égalité : ni victoire ni défaite', e6.ligne.victoires === 2 && e6.ligne.defaites === 3);
  check('à l’accueil : victoires, meilleur temps et meilleur score', /^2 victoires · meilleur temps 8:25 · meilleur score 6\s?725$/.test(resumePalmares(e6.ligne)),
    resumePalmares(e6.ligne));
  check('l’Express ne touche pas à la ligne du Classique', lignePalmares(lirePalmares(), 'classique', 'normal').victoires === 3
    && lignePalmares(lirePalmares(), 'classique', 'normal').score === 0);

  // Le palmarès vit à part de la partie en cours.
  const w = monde({ seed: 91, mode: 'classique' });
  check('la partie en cours se range sous une autre clé', saveGame(w) === true && store.contenu.has(SAVE_KEY) && !!loadSave());
  clearSave();
  check('effacer la partie en cours ne touche pas au palmarès', !store.contenu.has(SAVE_KEY) && lignePalmares(lirePalmares(), 'classique', 'normal').victoires === 3);

  // Palmarès abîmé : on repart de zéro, sans erreur.
  store.setItem(PALMARES_KEY, '{pas du JSON');
  const vide = lirePalmares();
  store.setItem(PALMARES_KEY, '[1,2]');
  const tableau = lirePalmares();
  store.setItem(PALMARES_KEY, JSON.stringify({ 'classique.normal': { victoires: 'beaucoup', defaites: -3, temps: 'vite', score: null } }));
  const abime = lignePalmares(lirePalmares(), 'classique', 'normal');
  check('palmarès abîmé : relu comme vide, et réinscriptible', Object.keys(vide).length === 0 && Object.keys(tableau).length === 0
    && abime.victoires === 0 && abime.defaites === 0 && abime.temps === null && abime.score === 0
    && inscrireAuPalmares({ mode: 'classique', difficulty: 'normal', result: victoire(800) }).ligne.victoires === 1);
}
{
  // De bout en bout : une vraie partie Express menée à son terme entre au palmarès.
  const store = fauxStockage();
  poserStockage(store);
  const w = monde({ seed: 91, mode: 'express', difficulty: 'easy' });
  w.deposit(0, 'gold', 1000);
  w.time = w.mode.timeLimit - DT / 2;
  w.update(DT);
  const inscrit = inscrireAuPalmares({ mode: w.modeId, difficulty: w.difficultyId, humanIndex: w.humanIndex, result: w.gameOver });
  check('une partie Express finie au temps s’inscrit avec le score du joueur', !!inscrit && inscrit.ligne.victoires === 1
    && inscrit.score.valeur === w.gameOver.scores[0] && lignePalmares(lirePalmares(), 'express', 'easy').score === w.score(w.players[0]),
    JSON.stringify(inscrit && inscrit.ligne));
}
poserStockage(undefined);

// ---------------------------------------------------------------------------
// 4. L'interface : ce qu'elle écrit (sans navigateur, on lit le HTML produit)
// ---------------------------------------------------------------------------
console.log('\n--- L’interface ---');
/** L'interface réduite à ce que ses méthodes de texte consultent : le monde, et une fenêtre qui retient son HTML. */
function fausseInterface(w) {
  const ui = Object.create(UI.prototype);
  ui.world = w;
  ui.game = {
    civ: w.players[w.humanIndex].civ, paused: false,
    ouvrier: (n = 1) => (n > 1 ? 'ouvriers' : 'ouvrier'),
    restart() {}, quitToMenu() {},
  };
  ui.html = '';
  ui.showModal = (html) => { ui.html = html; return { querySelector: () => ({ addEventListener() {} }), querySelectorAll: () => [] }; };
  ui.hideModal = () => {};
  ui.texte = () => ui.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return ui;
}
{
  // Écran de fin d'une partie Express : le détail du score, et le record.
  const store = fauxStockage();
  poserStockage(store);
  const w = monde({ seed: 91, mode: 'express' });
  w.deposit(0, 'food', 3000);
  w.killEntity(troupe(w, 1, 'militia'), troupe(w, 0, 'militia'));
  w.time = w.mode.timeLimit - DT / 2;
  w.update(DT);
  const ui = fausseInterface(w);
  const d = w.gameOver.detail[0];
  const inscrire = () => inscrireAuPalmares({ mode: w.modeId, difficulty: w.difficultyId, humanIndex: 0, result: w.gameOver });
  ui.showGameOver(w.gameOver, inscrire());
  let t = ui.texte();
  const nombre = (n) => new RegExp(String(n).replace(/(\d)(?=(\d{3})+$)/g, '$1\\s?'));
  check('écran de fin Express : le détail du score, part par part', t.includes('Points de récolte') && t.includes('Troupes et bâtiments debout')
    && t.includes('Ennemis abattus') && t.includes('Score final') && nombre(d.recolte).test(t) && nombre(d.debout).test(t) && nombre(d.total).test(t),
    `récolte ${d.recolte}, debout ${d.debout}, abattu ${d.abattu}, total ${d.total}`);
  check('… avec la règle du score en une phrase', t.includes('la moitié des ressources récoltées') && t.includes('deux fois le prix'));
  check('… les lignes d’avant y sont toujours (victoire, ressources, temps écoulé)', t.includes('Victoire !') && t.includes('Ressources récoltées')
    && t.includes('Temps écoulé après 10:00 — le score départage'));
  check('… premier score : il entre au palmarès, sans parler de record battu', t.includes('Premier score au palmarès') && !t.includes('Nouveau record')
    && t.includes('Express · Normal : 1 victoire, 0 défaite'), (t.match(/Premier score[^.]*?défaite/) || [''])[0]);
  // La même partie avec un record à battre plus bas, puis plus haut.
  store.setItem(PALMARES_KEY, JSON.stringify({ 'express.normal': { victoires: 2, defaites: 1, temps: null, score: d.total - 500 } }));
  ui.showGameOver(w.gameOver, inscrire());
  t = ui.texte();
  check('record battu : « Nouveau record ! », avec le précédent', t.includes('Nouveau record !') && nombre(d.total - 500).test(t.split('Nouveau record !')[1].split('Vous')[0])
    && t.includes('3 victoires, 1 défaite'), (t.match(/Nouveau record ![^:]*?était de [\d\s]+/) || [''])[0]);
  ui.showGameOver(w.gameOver, inscrire());
  t = ui.texte();
  check('record égalé, pas battu : on rappelle le record qui tient', !t.includes('Nouveau record') && t.includes('Meilleur score à battre')
    && t.includes('4 victoires, 1 défaite'));
  // Sans palmarès (stockage indisponible) et sans détail (ancien appel) : l'écran s'affiche quand même.
  ui.showGameOver({ winner: 0, victory: true, timeUp: true, time: 600, scores: [3990, 3960] });
  t = ui.texte();
  check('écran de fin sans palmarès ni détail : scores exacts, rien de cassé', /3\s?990/.test(t) && /3\s?960/.test(t) && !t.includes('undefined')
    && !t.includes('NaN') && !t.includes('Points de récolte') && !t.includes('palmarès'));
  poserStockage(undefined);
}
{
  // Écran de fin en Classique : pourquoi la partie s'arrête, et le record de temps.
  const store = fauxStockage();
  poserStockage(store);
  const w = monde({ seed: 91, mode: 'classique', civs: ['atlante', 'solarien'] });
  w.time = 1025;
  w.killEntity(centre(w, 1), troupe(w, 0, 'militia'));
  w.checkVictory();
  const ui = fausseInterface(w);
  store.setItem(PALMARES_KEY, JSON.stringify({ 'classique.normal': { victoires: 1, defaites: 0, temps: 1122, score: 0 } }));
  ui.showGameOver(w.gameOver, inscrireAuPalmares({ mode: w.modeId, difficulty: w.difficultyId, humanIndex: 0, result: w.gameOver }));
  let t = ui.texte();
  check('victoire en Classique : la raison nomme le bâtiment adverse dans sa civilisation',
    t.includes('L’adversaire n’a plus ni Palais du Soleil ni bâtiment militaire') && t.includes('17:05'), (t.match(/L’adversaire[^:]*: [\d:]+/) || [''])[0]);
  check('… « Nouveau record ! » de temps, avec le précédent', t.includes('Nouveau record ! Victoire en 17:05 — le précédent était de 18:42')
    && t.includes('Classique · Normal : 2 victoires, 0 défaite') && !t.includes('Score final') && !t.includes('Points de récolte'));
  const perdu = monde({ seed: 91, mode: 'classique', civs: ['solarien', 'atlante'] });
  perdu.time = 800;
  perdu.killEntity(centre(perdu, 0), troupe(perdu, 1, 'militia'));
  perdu.checkVictory();
  const ui2 = fausseInterface(perdu);
  ui2.showGameOver(perdu.gameOver, inscrireAuPalmares({ mode: perdu.modeId, difficulty: perdu.difficultyId, humanIndex: 0, result: perdu.gameOver }));
  t = ui2.texte();
  check('défaite en Classique : la raison est dite, le meilleur temps n’est pas touché', t.includes('Défaite')
    && t.includes('Vous n’avez plus ni Palais du Soleil ni bâtiment militaire') && t.includes('2 victoires, 1 défaite')
    && lignePalmares(lirePalmares(), 'classique', 'normal').temps === 1025, (t.match(/Vous n’avez[^:]*: [\d:]+/) || [''])[0]);
  const abandon = monde({ seed: 91, mode: 'classique' });
  abandon.time = 300;
  abandon.resign();
  const ui3 = fausseInterface(abandon);
  ui3.showGameOver(abandon.gameOver, null);
  check('abandon : l’écran le dit', ui3.texte().includes('Vous avez abandonné après 5:00') && ui3.texte().includes('Ressources récoltées'));
  const ex = monde({ seed: 91, mode: 'express' });
  ex.time = 505;
  ex.killEntity(centre(ex, 1), troupe(ex, 0, 'militia'));
  ex.checkVictory();
  const ui4 = fausseInterface(ex);
  ui4.showGameOver(ex.gameOver, null);
  const exPerdu = monde({ seed: 91, mode: 'express' });
  exPerdu.time = 400;
  exPerdu.killEntity(centre(exPerdu, 0), troupe(exPerdu, 1, 'militia'));
  exPerdu.checkVictory();
  const ui5 = fausseInterface(exPerdu);
  ui5.showGameOver(exPerdu.gameOver, null);
  check('Express fini par le Centre-Ville : la raison, et le score quand même', ui4.texte().includes('Le Centre-Ville adverse est tombé en 8:25')
    && ui4.texte().includes('Score final') && ui5.texte().includes('Votre Centre-Ville est tombé') && ui5.texte().includes('Défaite'));
  poserStockage(undefined);
}
{
  // L'aide : l'objectif décrit la nouvelle règle, avec les noms de la civilisation adverse.
  const w = monde({ seed: 91, mode: 'classique', civs: ['atlante', 'solarien'] });
  const ui = fausseInterface(w);
  ui.showHelp();
  let t = ui.texte();
  check('aide : l’objectif nomme le Centre-Ville et les bâtiments militaires adverses',
    t.includes('ni Palais du Soleil ni bâtiment militaire (Cour des Gardes, Champ de tir, Enclos des montures, Atelier des engins, Temple du Soleil)')
    && t.includes('achevé ou en chantier') && !t.includes('détruire tous les bâtiments adverses'), (t.match(/Objectif[^—]*/) || [''])[0]);
  check('aide en Classique : pas de paragraphe sur le score', !t.includes('deux fois le prix'));
  const e = monde({ seed: 91, mode: 'express' });
  const uiE = fausseInterface(e);
  uiE.showHelp();
  t = uiE.texte();
  check('aide en Express : le score est expliqué, avec les noms atlantes pour l’objectif',
    t.includes('ni Centre-Ville ni bâtiment militaire (Caserne, Archerie, Écurie, Atelier de siège, Temple de l’Hydre)')
    && t.includes('deux fois le prix de ce que vous abattez') && t.includes('à côté du chrono'));
}
{
  // La barre du haut : le score des deux camps pendant une partie Express, rien en Classique.
  const noeud = () => ({ textContent: '', style: {}, classes: new Set(['hidden']),
    classList: { toggle(c, on) { if (on) this.p.classes.add(c); else this.p.classes.delete(c); }, add() {}, remove() {}, contains: () => true, p: null },
    parentElement: { classList: { add() {}, remove() {} } } });
  const barre = (w) => {
    const ui = Object.create(UI.prototype);
    ui.world = w;
    ui.lastValues = {};
    ui.hudTimer = 0;
    ui.nodes = {};
    for (const cle of ['food', 'wood', 'gold', 'pop', 'age', 'ageBar', 'timer', 'scoreBox', 'scoreMoi', 'scoreAdverse', 'workerMenu', 'buildMenu']) {
      ui.nodes[cle] = noeud(); ui.nodes[cle].classList.p = ui.nodes[cle];
    }
    ui.refreshWorkerBar = ui.refreshSelection = ui.refreshDisabledStates = () => {};
    ui.update(1);
    return ui;
  };
  const e = monde({ seed: 91, mode: 'express' });
  e.deposit(0, 'wood', 300);
  e.killEntity(troupe(e, 1, 'militia'), troupe(e, 0, 'militia'));
  const uiE = barre(e);
  check('barre du haut, Express : le score du joueur puis celui de l’adversaire, à jour',
    uiE.nodes.scoreMoi.textContent === String(e.score(e.players[0])) && uiE.nodes.scoreAdverse.textContent === String(e.score(e.players[1]))
    && e.score(e.players[0]) !== e.score(e.players[1]), `${uiE.nodes.scoreMoi.textContent} – ${uiE.nodes.scoreAdverse.textContent}`);
  const c = monde({ seed: 91, mode: 'classique' });
  const uiC = barre(c);
  check('barre du haut, Classique : pas de score', uiC.nodes.scoreMoi.textContent === '' && uiC.nodes.scoreAdverse.textContent === '');

  // Ce que le navigateur seul peut montrer : au moins, les pièces sont en place.
  const lire = (chemin) => readFileSync(new URL(chemin, import.meta.url), 'utf8');
  const html = lire('../index.html'), ui = lire('../js/ui.js'), main = lire('../js/main.js'), css = lire('../css/jeu.css');
  check('index.html : le score près du chrono, masqué par défaut, et la ligne du palmarès sous « Jouer »',
    /id="game-timer"[\s\S]{0,120}id="score-box" class="hidden"[\s\S]{0,400}id="score-moi"[\s\S]{0,200}id="score-adverse"/.test(html)
    && /id="btn-play"[\s\S]{0,200}<\/div>\s*<p id="palmares" class="palmares hidden"><\/p>/.test(html));
  check('index.html : l’objectif de l’accueil décrit la nouvelle règle', html.includes('ni bâtiment principal ni bâtiment militaire')
    && !html.includes('détruire tous les bâtiments et ouvriers adverses'));
  check('ui.js : le score n’est montré que sur un format chronométré', ui.includes("scoreBox.classList.toggle('hidden', !this.world.mode.timeLimit)"));
  check('main.js : la fin de partie inscrit au palmarès, l’accueil le relit à chaque changement de format ou de difficulté',
    /showGameOver\(event\.result, inscrireAuPalmares\(/.test(main) && (main.match(/refreshPalmares\(\);/g) || []).length >= 3);
  check('css : les nouveaux éléments ont leur style', ['#score-box', '.palmares', '.fin-palmares', '.fin-note'].every((s) => css.includes(s + ' ')));
  check('icône du score : un tracé vectoriel, pas un emoji', !!ICONES.score && ICONES.score.d.length === 1 && html.includes('data-icone="score"'));
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  check('aucun emoji dans les textes ajoutés', !emoji.test(html) && !emoji.test(ui.slice(ui.indexOf('raisonDeFin(result)'))),
    'index.html et la fin de js/ui.js');
}

console.log(`\n${failures === 0 ? '✅ Tous les tests passent' : '❌ ' + failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
