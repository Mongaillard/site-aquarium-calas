// Réglages d'équilibre : des âges qui se méritent, le Champion et l'Arbalétrier,
// le boulet de la Catapulte (esquive, tir ami) et les trois morsures de l'Hydre.
// Tout se joue sans navigateur, comme dans simulation.test.js.
// Lancement : node test/reglages-equilibre.test.js

import { World } from '../js/game.js';
import { AIPlayer } from '../js/ai.js';
import { serializeWorld, restoreWorld, SAVE_VERSION } from '../js/save.js';
import { AGES, UNIT_TYPES, GAME_MODES, DIFFICULTIES, TICKS_PER_SECOND, TILE } from '../js/config.js';
import { computeDamage } from '../js/entities.js';
import { canAfford } from '../js/utils.js';

const DT = 1 / TICKS_PER_SECOND;
let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? '  ok  ' : ' FAIL ';
  if (!condition) failures++;
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

function advance(world, seconds, stop) {
  const ticks = Math.round(seconds * TICKS_PER_SECOND);
  for (let i = 0; i < ticks; i++) {
    world.update(DT);
    if (stop && stop()) return true;
  }
  return false;
}

/** Un monde sans IA, où l'on pose tout à la main. */
function monde(options = {}) {
  const w = new World({ seed: 9, mapSize: 'medium', difficulty: 'normal', ...options });
  w.ais = [];
  return w;
}

const centreDe = (w, i = 0) => w.buildings.find((b) => b.playerIndex === i && b.type === 'towncenter');

/** Pose un bâtiment du joueur 0 sur le premier emplacement libre autour de son Centre-Ville. */
function batir(w, type, fini = true) {
  const tc = centreDe(w);
  for (let r = 4; r <= 18; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (w.canPlace(0, type, tc.tx + dx, tc.ty + dy, true)) return w.spawnBuilding(0, type, tc.tx + dx, tc.ty + dy, fini);
  }
  throw new Error('aucun emplacement pour ' + type);
}

/** Un coin dégagé, loin des deux bases : `demiL` × `demiH` cases libres de part et d'autre. */
function clairiere(w, demiL = 7, demiH = demiL) {
  for (let ty = demiH + 2; ty < w.map.h - demiH - 2; ty += 2) for (let tx = demiL + 2; tx < w.map.w - demiL - 2; tx += 2) {
    if (w.map.startPositions.some((b) => Math.hypot(tx - b.tx, ty - b.ty) < 18)) continue;
    let ok = true;
    for (let dy = -demiH; dy <= demiH && ok; dy++) for (let dx = -demiL; dx <= demiL && ok; dx++) if (!w.map.isOpenTile(tx + dx, ty + dy)) ok = false;
    if (ok) return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, tx, ty };
  }
  throw new Error('pas de clairière');
}

/** Une unité posée au pixel près (spawnUnit la cale au centre d'une case), sans initiative. */
function poser(w, joueur, type, x, y) {
  const u = w.spawnUnit(joueur, type, x, y);
  u.x = x; u.y = y;
  u.stance = 'passive';
  return u;
}

const prix = (type) => { const c = UNIT_TYPES[type].cost; return (c.food || 0) + (c.wood || 0) + (c.gold || 0); };
const coutDe = (camp) => camp.reduce((s, [type, n]) => s + n * prix(type), 0);
const nomDuCamp = (camp) => camp.map(([type, n]) => `${n} ${type}`).join(' + ');

/**
 * Deux camps face à face dans une clairière, envoyés l'un sur l'autre en
 * attaque-déplacement. `camp` = [[type, nombre], …], les premiers devant.
 * Rend le vainqueur ('A', 'B' ou '=') et ce qu'il reste de points de vie à chacun (0 à 1).
 */
function combat(campA, campB, seed) {
  const w = new World({ seed, mapSize: 'large', difficulty: 'normal' });
  w.ais = [];
  for (const p of w.players) p.age = 2;
  const c = clairiere(w, 9, 6);
  const ECART = 7;
  const ranger = (camp, joueur, cote) => {
    const total = camp.reduce((s, [, n]) => s + n, 0), rangs = Math.min(total, 5);
    const unites = [];
    let k = 0;
    for (const [type, n] of camp) for (let i = 0; i < n; i++, k++) {
      unites.push(w.spawnUnit(joueur, type,
        c.x + cote * (ECART / 2 + Math.floor(k / rangs) * 0.9) * TILE, c.y + ((k % rangs) - (rangs - 1) / 2) * TILE * 0.9));
    }
    return unites;
  };
  const A = ranger(campA, 0, -1), B = ranger(campB, 1, 1);
  const pvMax = (us) => us.reduce((s, u) => s + u.maxHp, 0);
  const maxA = pvMax(A), maxB = pvMax(B);
  w.formationMove(A, c.x + (ECART / 2) * TILE, c.y, true);
  w.formationMove(B, c.x - (ECART / 2) * TILE, c.y, true);
  const vivants = (us) => us.filter((u) => !u.dead);
  advance(w, 240, () => vivants(A).length === 0 || vivants(B).length === 0);
  const a = vivants(A), b = vivants(B);
  return {
    gagnant: a.length && !b.length ? 'A' : b.length && !a.length ? 'B' : '=',
    pvA: a.reduce((s, u) => s + u.hp, 0) / maxA, pvB: b.reduce((s, u) => s + u.hp, 0) / maxB,
  };
}

/** Le même combat sur plusieurs terrains, chaque camp de chaque côté. */
function duel(campA, campB, seeds = [9, 11]) {
  let vA = 0, vB = 0, pvA = 0, pvB = 0, n = 0;
  for (const seed of seeds) for (const inverse of [false, true]) {
    const r = inverse ? combat(campB, campA, seed) : combat(campA, campB, seed);
    const gagnant = inverse ? ({ A: 'B', B: 'A' }[r.gagnant] || '=') : r.gagnant;
    if (gagnant === 'A') vA++; else if (gagnant === 'B') vB++;
    pvA += inverse ? r.pvB : r.pvA; pvB += inverse ? r.pvA : r.pvB;
    n++;
  }
  return {
    vA, vB, n, pvA: pvA / n, pvB: pvB / n,
    texte: `${nomDuCamp(campA)} (${coutDe(campA)}) contre ${nomDuCamp(campB)} (${coutDe(campB)}) : ${vA} à ${vB}, `
      + `points de vie restants ${Math.round((pvA / n) * 100)} % / ${Math.round((pvB / n) * 100)} %`,
  };
}

/** `campA` l'emporte nettement : au moins trois combats sur quatre. */
function bat(label, campA, campB) {
  const r = duel(campA, campB);
  check(label, r.vA >= r.n - 1, r.texte);
}

console.log('=== Réglages d’équilibre ===');

// ---------------------------------------------------------------------------
// Des âges qui se méritent : un prix relevé, et des bâtiments à avoir bâtis.
// ---------------------------------------------------------------------------
{
  console.log('\n— Les âges : prix et bâtiments exigés —');
  const w = monde();
  const p = w.players[0];
  const tc = centreDe(w);
  p.resources = { food: 5000, wood: 5000, gold: 5000 };

  check('le prix des âges a monté', AGES[1].cost.food === 400 && AGES[2].cost.food === 600 && AGES[2].cost.gold === 200,
    `Féodal ${JSON.stringify(AGES[1].cost)}, Châteaux ${JSON.stringify(AGES[2].cost)}`);

  // Âge Féodal : une Caserne et un Moulin, terminés.
  let etat = w.canAdvanceAge(tc);
  check('sans Caserne ni Moulin, l’Âge Féodal est refusé même les caisses pleines', !etat.ok && etat.reason === 'Il faut une Caserne et un Moulin', etat.reason);
  w.drainEvents();
  const lance = w.advanceAge(tc);
  const avis = w.drainEvents().find((e) => e.type === 'notice');
  check('… rien n’est payé, et le joueur lit pourquoi', !lance && p.resources.food === 5000 && !p.ageProgress && !!avis && avis.text === etat.reason,
    avis ? avis.text : 'aucun message');

  const caserne = batir(w, 'barracks', false);
  etat = w.canAdvanceAge(tc);
  check('Caserne en chantier : il ne manque plus à poser que le Moulin', !etat.ok && etat.reason === 'Il faut un Moulin', etat.reason);
  const moulin = batir(w, 'mill', false);
  etat = w.canAdvanceAge(tc);
  check('les deux en chantier : il reste à les finir', !etat.ok && etat.reason === 'Chantier à terminer d’abord : Caserne, Moulin', etat.reason);
  check('conditionAge compte ce qui manque', w.conditionAge(p).manque === 2 && !w.conditionAge(p).ok);
  caserne.complete = true; moulin.complete = true;
  check('Caserne et Moulin terminés : la condition est remplie', w.conditionAge(p).ok && w.canAdvanceAge(tc).ok);

  p.resources.food = 399;
  etat = w.canAdvanceAge(tc);
  check('la condition remplie, il reste le prix : 400 de nourriture', !etat.ok && etat.reason === 'Ressources insuffisantes', etat.reason);
  p.resources.food = 5000;
  check('le passage se lance et coûte 400 de nourriture', w.advanceAge(tc) && p.resources.food === 4600 && !!p.ageProgress, `nourriture ${p.resources.food}`);
  advance(w, AGES[1].time + 1, () => p.age === 1);
  check('… et l’Âge Féodal arrive', p.age === 1 && !p.ageProgress);

  // Âge des Châteaux : deux bâtiments DIFFÉRENTS parmi quatre, au choix.
  etat = w.canAdvanceAge(tc);
  check('Âge des Châteaux : deux bâtiments de l’Âge Féodal, au choix',
    !etat.ok && etat.reason === 'Il faut 2 bâtiments parmi : Archerie, Écurie, Forge, Temple de l’Hydre', etat.reason);
  batir(w, 'archery'); batir(w, 'archery');
  etat = w.canAdvanceAge(tc);
  check('deux Archeries ne font pas deux bâtiments', !etat.ok && etat.reason === 'Il faut encore un bâtiment parmi : Écurie, Forge, Temple de l’Hydre', etat.reason);
  const forge = batir(w, 'blacksmith', false);
  etat = w.canAdvanceAge(tc);
  check('la Forge en chantier : il reste à la finir', !etat.ok && etat.reason === 'Chantier à terminer d’abord : Forge', etat.reason);
  forge.complete = true;
  check('Archerie et Forge : la condition est remplie', w.canAdvanceAge(tc).ok);

  // La sauvegarde ne garde rien de plus : la condition se relit sur les bâtiments.
  const repris = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
  check('la sauvegarde garde sa version, et la condition se retrouve à la reprise',
    SAVE_VERSION === 1 && !!repris && repris.conditionAge(repris.players[0]).ok && repris.canAdvanceAge(centreDe(repris)).ok);

  w.killEntity(forge, null, true);
  etat = w.canAdvanceAge(tc);
  check('la Forge rasée, la condition n’est plus remplie', !etat.ok && /^Il faut encore un bâtiment/.test(etat.reason), etat.reason);
  batir(w, 'temple');
  const avant = { ...p.resources };
  check('avec un Temple : le passage coûte 600 de nourriture et 200 d’or',
    w.advanceAge(tc) && p.resources.food === avant.food - 600 && p.resources.gold === avant.gold - 200,
    `nourriture ${avant.food} → ${p.resources.food}, or ${avant.gold} → ${p.resources.gold}`);
  advance(w, AGES[2].time + 1, () => p.age === 2);
  check('… et l’Âge des Châteaux arrive ; il n’y a rien au-delà', p.age === 2 && w.conditionAge(p).ok && !w.canAdvanceAge(tc).ok);
}
{
  // Les noms sont ceux de la civilisation du joueur.
  const w = monde({ civs: ['solarien', 'atlante'] });
  const tc = centreDe(w);
  w.players[0].resources = { food: 5000, wood: 5000, gold: 5000 };
  let raison = w.canAdvanceAge(tc).reason;
  check('chez les Solariens : « une Cour des Gardes et un Grenier »', raison === 'Il faut une Cour des Gardes et un Grenier', raison);
  batir(w, 'barracks'); batir(w, 'mill');
  w.players[0].age = 1;
  raison = w.canAdvanceAge(tc).reason;
  check('… puis leurs bâtiments de l’Âge Féodal',
    raison === 'Il faut 2 bâtiments parmi : Champ de tir, Enclos des montures, Fonderie, Temple du Soleil', raison);
}
{
  // Express : départ à l'Âge Féodal avec un stock garni, qui payait l'Âge des Châteaux d'entrée.
  const w = monde({ mode: 'express', mapSize: undefined });
  const p = w.players[0];
  const tc = centreDe(w);
  check('Express : le stock de départ ne paie plus l’Âge des Châteaux',
    p.age === 1 && !canAfford(GAME_MODES.express.resources, AGES[2].cost) && !canAfford(p.resources, AGES[2].cost),
    `stock ${JSON.stringify(p.resources)}, prix ${JSON.stringify(AGES[2].cost)}`);
  let etat = w.canAdvanceAge(tc);
  check('… et il faut d’abord deux bâtiments', !etat.ok && /^Il faut 2 bâtiments parmi/.test(etat.reason), etat.reason);
  batir(w, 'archery'); batir(w, 'stable');
  etat = w.canAdvanceAge(tc);
  check('… les deux bâtis, il manque encore de quoi payer', !etat.ok && etat.reason === 'Ressources insuffisantes', etat.reason);
}

// ---------------------------------------------------------------------------
// L'IA remplit la condition : deux parties IA contre IA, Classique, Normal.
// ---------------------------------------------------------------------------
{
  console.log('\n— L’IA et les âges —');
  const mmss = (s) => (s === null ? 'jamais' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
  for (const seed of [42, 99]) {
    const w = new World({ seed, mapSize: 'medium', difficulty: 'normal' });
    w.players[0].autoWorkers = true;
    w.ais.push(new AIPlayer(w, 0, DIFFICULTIES.normal));
    const feodal = [null, null], chateaux = [null, null];
    let enRegle = true;
    advance(w, 18 * 60, () => {
      w.players.forEach((p, k) => {
        // Un passage lancé sans les bâtiments exigés serait une faille de la règle.
        if (p.ageProgress && !p.ageProgress.verifie) { p.ageProgress.verifie = true; if (!w.conditionAge(p).ok) enRegle = false; }
        if (p.age >= 1 && feodal[k] === null) feodal[k] = w.time;
        if (p.age >= 2 && chateaux[k] === null) chateaux[k] = w.time;
      });
      return chateaux.every((t) => t !== null) || !!w.gameOver;
    });
    check(`graine ${seed} : les deux IA atteignent l’Âge des Châteaux avant 18 minutes`,
      chateaux.every((t) => t !== null && t < 18 * 60),
      `Féodal ${feodal.map(mmss).join(' et ')}, Châteaux ${chateaux.map(mmss).join(' et ')}`);
    check(`graine ${seed} : … en ayant bâti ce que chaque âge exige`, enRegle);
  }
}

// ---------------------------------------------------------------------------
// Champion et Arbalétrier : l'infanterie lourde a son contre.
// ---------------------------------------------------------------------------
{
  console.log('\n— Le Champion et ce qui le bat —');
  const w = monde();
  w.players[0].age = 2; w.players[1].age = 2;
  const c = clairiere(w);
  const champion = poser(w, 1, 'champion', c.x, c.y);
  check('le Champion a perdu un point d’armure de mêlée', champion.meleeArmor() === 2 && champion.pierceArmor() === 2,
    `${champion.meleeArmor()} / ${champion.pierceArmor()}`);
  check('un carreau d’Arbalétrier lui ôte 15 points (9 + 8 contre l’infanterie, moins 2)',
    computeDamage(UNIT_TYPES.crossbowman, w.players[0], champion) === 15, `${computeDamage(UNIT_TYPES.crossbowman, w.players[0], champion)}`);
  check('un Cavalier lui en ôte 8, un lancier 2', computeDamage(UNIT_TYPES.knight, w.players[0], champion) === 8
    && computeDamage(UNIT_TYPES.spearman, w.players[0], champion) === 2);

  // À coût égal (1 200 de ressources, à quinze près).
  bat('12 Arbalétriers battent 10 Champions', [['crossbowman', 12]], [['champion', 10]]);
  bat('9 Cavaliers battent 10 Champions', [['knight', 9]], [['champion', 10]]);
  bat('10 Champions battent toujours 20 lanciers', [['champion', 10]], [['spearman', 20]]);
  bat('… 15 miliciens', [['champion', 10]], [['militia', 15]]);
  bat('… et 13 Atlantes', [['champion', 10]], [['triton', 13]]);
  // Le triangle d'origine n'a pas bougé.
  bat('20 lanciers battent 9 Cavaliers', [['spearman', 20]], [['knight', 9]]);
  bat('9 Cavaliers battent 17 archers', [['knight', 9]], [['archer', 17]]);
  bat('9 Cavaliers battent 12 Arbalétriers', [['knight', 9]], [['crossbowman', 12]]);
  // L'armée « qui gagnait contre tout ».
  bat('9 Champions battent 4 Champions et 2 Catapultes', [['champion', 9]], [['champion', 4], ['catapult', 2]]);
  bat('8 Cavaliers aussi', [['knight', 8]], [['champion', 4], ['catapult', 2]]);
  bat('7 Champions battent 3 Catapultes seules', [['champion', 7]], [['catapult', 3]]);
}

// ---------------------------------------------------------------------------
// Le boulet de la Catapulte : il blesse aussi les siens, et s'esquive en marchant.
// ---------------------------------------------------------------------------
{
  console.log('\n— Le boulet : tir ami —');
  const w = monde();
  w.players[0].age = 2; w.players[1].age = 2;
  const c = clairiere(w);
  const cata = poser(w, 0, 'catapult', c.x - TILE * 5, c.y);
  const ennemi = poser(w, 1, 'militia', c.x, c.y);
  const ami = poser(w, 0, 'militia', c.x + 22, c.y);
  const mourant = poser(w, 0, 'militia', c.x - 22, c.y);
  mourant.hp = 5;
  const loin = poser(w, 0, 'militia', c.x, c.y + TILE * 3);
  const maison = w.spawnBuilding(0, 'house', c.tx, c.ty - 2, true);   // son bord est à une demi-case du point de chute
  const tues = w.players[0].stats.killed, perdus = w.players[0].stats.lost;
  ami.attackEntity(ennemi);     // en mêlée, là où le boulet va tomber
  advance(w, 0.5);
  w.drainEvents();
  cata.attackEntity(ennemi);
  advance(w, 4, () => w.projectiles.length === 0 && ennemi.hp < ennemi.maxHp);
  const evenements = w.drainEvents();
  check('le boulet blesse l’ennemi visé', ennemi.hp <= ennemi.maxHp - (26 - 1), `${ennemi.hp}/${ennemi.maxHp}`);
  check('… et la troupe amie prise dans l’explosion, avec son armure', ami.hp === ami.maxHp - (26 - 1), `allié ${ami.hp}/${ami.maxHp}`);
  check('… mais pas celle restée à l’écart, ni la maison du tireur, ni la catapulte',
    loin.hp === loin.maxHp && maison.hp === maison.maxHp && cata.hp === cata.maxHp
      && maison.edgeDistanceTo(ennemi.x, ennemi.y) <= UNIT_TYPES.catapult.splash * TILE,
    `allié écarté ${loin.hp}, maison ${maison.hp}/${maison.maxHp}, catapulte ${cata.hp}`);
  check('un allié tué par le boulet est une perte, pas une victoire du tireur',
    mourant.dead && w.players[0].stats.lost === perdus + 1 && w.players[0].stats.killed === tues,
    `perdus ${perdus} → ${w.players[0].stats.lost}, tués ${tues} → ${w.players[0].stats.killed}`);
  check('pas d’alerte « Vous êtes attaqué » pour un tir ami', !evenements.some((e) => e.type === 'underAttack'),
    evenements.filter((e) => e.type === 'underAttack').length + ' alerte(s)');
  const avis = evenements.filter((e) => e.type === 'notice');
  check('le joueur est prévenu en clair, une seule fois', avis.length === 1 && avis[0].text === 'Votre Catapulte a touché vos propres troupes.',
    avis.map((e) => e.text).join(' | '));

  // Un boulet en vol, sauvegardé : le tir ami s'applique aussi après la reprise.
  ami.hp = ami.maxHp; ennemi.hp = ennemi.maxHp;
  w.avisTirAmi = 0;
  advance(w, 8, () => w.projectiles.length > 0);
  const repris = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
  advance(w, 4, () => w.projectiles.length === 0);
  let amiRepris = null;
  if (repris) { advance(repris, 4, () => repris.projectiles.length === 0); amiRepris = repris.units.find((u) => u.id === ami.id); }
  check('un boulet en vol se sauvegarde : même tir ami après la reprise',
    ami.hp < ami.maxHp && !!amiRepris && amiRepris.hp === ami.hp, `${ami.hp} PV, ${amiRepris ? amiRepris.hp : '?'} après reprise`);
}
{
  // Au repos, une troupe rend les coups à qui la frappe — pas à sa propre catapulte.
  // Le garde attend à côté de l'ennemi visé ; celui-ci disparaît boulet en vol :
  // quand le boulet tombe, le garde est au repos, sans personne d'autre à frapper.
  const w = monde();
  w.players[0].age = 2; w.players[1].age = 2;
  const c = clairiere(w);
  const cata = poser(w, 0, 'catapult', c.x - TILE * 5, c.y);
  const ennemi = poser(w, 1, 'militia', c.x, c.y);
  const garde = poser(w, 0, 'militia', c.x + 22, c.y);
  garde.stance = 'defensive';
  cata.attackEntity(ennemi);
  advance(w, 2, () => w.projectiles.length > 0);
  w.killEntity(ennemi, null, true);
  cata.stop();
  advance(w, 4, () => w.projectiles.length === 0);
  check('une troupe au repos, touchée par le boulet des siens, ne se retourne pas contre la catapulte',
    garde.hp === garde.maxHp - (26 - 1) && garde.state === 'idle' && !garde.target && cata.hp === cata.maxHp,
    `${garde.hp}/${garde.maxHp} PV, état ${garde.state}, cible ${garde.target ? garde.target.type : 'aucune'}`);
}
{
  console.log('\n— Le boulet : une troupe en marche l’esquive —');
  // La troupe défile en travers, à `cases` de la catapulte, qui reçoit l'ordre de tirer sur elle.
  const scene = (type, cases, enMarche) => {
    const w = monde();
    w.players[0].age = 2; w.players[1].age = 2;
    const c = clairiere(w);
    const cata = poser(w, 0, 'catapult', c.x - TILE * cases, c.y);
    const cible = poser(w, 1, type, c.x, c.y - TILE * 3);
    if (enMarche) { cible.moveTo(c.x, c.y + TILE * 6); advance(w, 1.5); }
    cata.attackEntity(cible);
    const tire = advance(w, 8, () => w.projectiles.length > 0);
    cata.stop();
    advance(w, 4, () => w.projectiles.length === 0);
    return { tire, touche: cible.hp < cible.maxHp, pv: `${cible.hp}/${cible.maxHp}` };
  };
  let s = scene('champion', 6, false);
  check('un Champion à l’arrêt est touché', s.tire && s.touche, s.pv);
  s = scene('champion', 6, true);
  check('le même en marche, visé de six cases, esquive (avant : touché)', s.tire && !s.touche, s.pv);
  s = scene('militia', 5, true);
  check('un milicien en marche, visé de cinq cases, esquive', s.tire && !s.touche, s.pv);
  s = scene('champion', 3, true);
  check('de près, la marche ne suffit plus : à trois cases le Champion est touché', s.tire && s.touche, s.pv);
  s = scene('knight', 3, true);
  check('un Cavalier au galop esquive même de près', s.tire && !s.touche, s.pv);
}

// ---------------------------------------------------------------------------
// L'Hydre : trois morsures par coup, sur les ennemis devant elle.
// ---------------------------------------------------------------------------
{
  console.log('\n— L’Hydre —');
  const scene = () => {
    const w = monde();
    w.players[0].age = 2; w.players[1].age = 2;
    const c = clairiere(w);
    const hydre = poser(w, 0, 'hydra', c.x, c.y);
    const u = {
      cible: poser(w, 1, 'militia', c.x + 40, c.y),
      proche: poser(w, 1, 'militia', c.x + 36, c.y - 30),
      suivant: poser(w, 1, 'militia', c.x + 30, c.y + 44),
      quatrieme: poser(w, 1, 'militia', c.x + 58, c.y - 22),   // à portée, mais trois têtes ont déjà mordu
      derriere: poser(w, 1, 'militia', c.x - 40, c.y),         // le plus proche de tous… dans son dos
      ami: poser(w, 0, 'militia', c.x + 20, c.y + 24),         // devant elle, mais des siens
    };
    hydre.attackEntity(u.cible);
    advance(w, 0.1);
    return { w, hydre, u, perte: Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v.maxHp - v.hp])) };
  };
  const { w, hydre, u, perte } = scene();
  const portee = hydre.rangePx() + hydre.radius;
  check('tous les ennemis de la scène sont à portée de cou',
    [u.cible, u.proche, u.suivant, u.quatrieme, u.derriere].every((e) => e.edgeDistanceTo(hydre.x, hydre.y) <= portee));
  check('l’Hydre mord sa cible et les deux ennemis les plus proches devant elle : 11 − 1 d’armure chacun',
    perte.cible === 10 && perte.proche === 10 && perte.suivant === 10, JSON.stringify(perte));
  check('… pas un quatrième, ni l’ennemi dans son dos, ni un allié', perte.quatrieme === 0 && perte.derriere === 0 && perte.ami === 0);
  check('la règle est déterministe : la même scène donne les mêmes morsures', JSON.stringify(scene().perte) === JSON.stringify(perte));
  advance(w, 1.5);
  check('une morsure toutes les deux secondes, pas trois', u.cible.maxHp - u.cible.hp === 10);

  // Contre un bâtiment : il n'est mordu qu'une fois, avec le bonus (11 + 9, moins l'armure).
  {
    const w2 = monde();
    w2.players[0].age = 2; w2.players[1].age = 2;
    const c = clairiere(w2);
    const maison = w2.spawnBuilding(1, 'house', c.tx + 1, c.ty, true);
    const h = poser(w2, 0, 'hydra', c.x - 10, c.y + 16);
    const garde = poser(w2, 1, 'militia', c.x + 10, c.y - 28);
    h.attackEntity(maison);
    advance(w2, 0.2);
    check('un bâtiment n’est mordu qu’une fois (20 moins son armure, comme avant), le garde à côté l’est aussi',
      maison.maxHp - maison.hp === 11 + 9 - 1 && garde.maxHp - garde.hp === 10,
      `maison −${maison.maxHp - maison.hp}, garde −${garde.maxHp - garde.hp}`);
  }

  // Elle vaut l'escouade qu'elle remplace : trois places, 400 de ressources.
  bat('à places égales, 1 Hydre bat 3 Champions (avant : elle perdait)', [['hydra', 1]], [['champion', 3]]);
  const r = duel([['hydra', 3]], [['champion', 10]]);
  check('à coût égal, 3 Hydres tiennent tête à 10 Champions (avant : 58 % de points de vie restants aux Champions)',
    r.pvB - r.pvA < 0.3, r.texte);
  const k = duel([['hydra', 3]], [['knight', 9]]);
  check('… et à 9 Cavaliers, sans les écraser', Math.abs(k.pvA - k.pvB) < 0.3, k.texte);
  bat('3 Hydres dévorent 15 miliciens', [['hydra', 3]], [['militia', 15]]);
  bat('… et 20 lanciers', [['hydra', 3]], [['spearman', 20]]);
}

console.log(`\n${failures === 0 ? '✅ Tous les tests passent' : '❌ ' + failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
