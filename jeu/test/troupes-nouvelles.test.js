// Les trois troupes des ligues 6 à 8 : le Pavoisier, le Frondeur et le Sapeur.
// Leurs statistiques, leur bâtiment et leur âge ; le bonus du Frondeur contre
// un TYPE de cible ; des duels joués pour de bon, dont les temps mesurés
// servent à juger l'équilibre ; l'ordinateur, qui ne les forme que si la
// partie les lui donne (World, option `troupesEnPlus`) ; la sauvegarde ; ce
// que le profil du joueur en dit à la partie ; les écrans de la collection.
// La garantie qui compte : sans cette option, une partie est celle d'avant.
// Tout se joue sans navigateur, comme dans simulation.test.js.
// Lancement : node test/troupes-nouvelles.test.js

import { World, ESSAI_NOMBRE } from '../js/game.js';
import { AIPlayer } from '../js/ai.js';
import { serializeWorld, restoreWorld, PROGRESSION_KEY, lireProgression } from '../js/save.js';
import { UNIT_TYPES, BUILDING_TYPES, AGES, DIFFICULTIES, TICKS_PER_SECOND, TILE, nomDe, portraitDe } from '../js/config.js';
import { computeDamage } from '../js/entities.js';
import { ICONES, ICON_BOX, iconeSVG } from '../js/icones.js';
import { PROGRESSION } from '../js/progression-config.js';
import { profilNeuf, migrerProfil, regulariser, reglagesDePartie, definitionAuNiveau } from '../js/progression.js';
import { ouvrirProgression, htmlBandeau, htmlFinDePartie, reglerPeuple, installerProgression } from '../js/progression-ecrans.js';

const DT = 1 / TICKS_PER_SECOND;
let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? '  ok  ' : ' FAIL ';
  if (!condition) failures++;
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

// --- Outils ------------------------------------------------------------------

const NOUVELLES = ['pavoisier', 'frondeur', 'sapeur'];
const ANCIENNES = ['triton', 'horseArcher', 'catapult', 'hydra'];   // les quatre que l'ordinateur forme de lui-même
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const moyenne = (liste) => liste.reduce((s, v) => s + v, 0) / liste.length;
const secondes = (liste) => liste.map((t) => `${t.toFixed(1)} s`).join(' et ');

function advance(world, duree, stop) {
  const ticks = Math.round(duree * TICKS_PER_SECOND);
  for (let i = 0; i < ticks; i++) {
    world.update(DT);
    if (stop && stop()) return true;
  }
  return false;
}

/** Un monde sans IA, où l'on pose tout à la main. */
function monde(options = {}) {
  const w = new World({ seed: 9, mapSize: 'large', difficulty: 'normal', ...options });
  w.ais = [];
  return w;
}

const centreDe = (w, i = 0) => w.buildings.find((b) => !b.dead && b.playerIndex === i && b.type === 'towncenter');

/** Une case libre pour ce bâtiment, à `d` cases au moins du bâtiment principal du camp. */
function emplacement(w, type, d, joueur = 0) {
  const tc = centreDe(w, joueur);
  for (let r = d; r <= d + 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (w.canPlace(joueur, type, tc.tx + dx, tc.ty + dy, true)) return { tx: tc.tx + dx, ty: tc.ty + dy };
      }
    }
  }
  throw new Error('aucun emplacement pour ' + type);
}
function batir(w, type, joueur = 0) {
  const e = emplacement(w, type, 5, joueur);
  return w.spawnBuilding(joueur, type, e.tx, e.ty, true);
}

/** Un coin dégagé, loin des deux bases : `demiL` × `demiH` cases libres de part et d'autre. */
function clairiere(w, demiL = 9, demiH = 6) {
  for (let ty = demiH + 2; ty < w.map.h - demiH - 2; ty += 2) for (let tx = demiL + 2; tx < w.map.w - demiL - 2; tx += 2) {
    if (w.map.startPositions.some((b) => Math.hypot(tx - b.tx, ty - b.ty) < 18)) continue;
    let ok = true;
    for (let dy = -demiH; dy <= demiH && ok; dy++) for (let dx = -demiL; dx <= demiL && ok; dx++) if (!w.map.isOpenTile(tx + dx, ty + dy)) ok = false;
    if (ok) return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, tx, ty };
  }
  throw new Error('pas de clairière');
}

const prix = (type) => { const c = UNIT_TYPES[type].cost; return (c.food || 0) + (c.wood || 0) + (c.gold || 0); };
const coutDe = (camp) => camp.reduce((s, [type, n]) => s + n * prix(type), 0);
const nomDuCamp = (camp) => camp.map(([type, n]) => `${n} ${nomDe(type, 'atlante', n).toLowerCase()}`).join(' + ');
const vivants = (unites) => unites.filter((u) => !u.dead);

/** Range un camp en lignes de cinq, à `cases` cases du centre de la clairière, du côté `cote` (−1 ou 1). */
function ranger(w, c, camp, joueur, cote, cases) {
  const total = camp.reduce((s, [, n]) => s + n, 0), rangs = Math.min(total, 5);
  const unites = [];
  let k = 0;
  for (const [type, n] of camp) for (let i = 0; i < n; i++, k++) {
    unites.push(w.spawnUnit(joueur, type,
      c.x + cote * (cases + Math.floor(k / rangs) * 0.9) * TILE, c.y + ((k % rangs) - (rangs - 1) / 2) * TILE * 0.9));
  }
  return unites;
}

/**
 * Deux camps face à face dans une clairière, envoyés l'un sur l'autre en
 * attaque-déplacement. `camp` = [[type, nombre], …], les premiers devant.
 * Rend le vainqueur ('A', 'B' ou '='), la durée du combat et ce qu'il reste à chacun.
 */
function combat(campA, campB) {
  const w = monde();
  for (const p of w.players) p.age = 2;
  const c = clairiere(w);
  const A = ranger(w, c, campA, 0, -1, 3.5), B = ranger(w, c, campB, 1, 1, 3.5);
  const pvMax = (us) => us.reduce((s, u) => s + u.maxHp, 0);
  const maxA = pvMax(A), maxB = pvMax(B);
  w.formationMove(A, c.x + 3.5 * TILE, c.y, true);
  w.formationMove(B, c.x - 3.5 * TILE, c.y, true);
  const debut = w.time;
  advance(w, 300, () => vivants(A).length === 0 || vivants(B).length === 0);
  const a = vivants(A), b = vivants(B);
  return {
    gagnant: a.length && !b.length ? 'A' : b.length && !a.length ? 'B' : '=', duree: w.time - debut,
    resteA: a.length, resteB: b.length, pvA: a.reduce((s, u) => s + u.hp, 0) / maxA, pvB: b.reduce((s, u) => s + u.hp, 0) / maxB,
  };
}

/** Le même combat, chaque camp de chaque côté. `vA` : les combats gagnés par A ; durées et restes en moyenne. */
function duel(campA, campB) {
  const r1 = combat(campA, campB), r2 = combat(campB, campA);
  const vus = [
    { gagnant: r1.gagnant, duree: r1.duree, resteA: r1.resteA, resteB: r1.resteB, pvA: r1.pvA, pvB: r1.pvB },
    { gagnant: { A: 'B', B: 'A' }[r2.gagnant] || '=', duree: r2.duree, resteA: r2.resteB, resteB: r2.resteA, pvA: r2.pvB, pvB: r2.pvA },
  ];
  const m = (champ) => moyenne(vus.map((v) => v[champ]));
  const r = {
    vA: vus.filter((v) => v.gagnant === 'A').length, vB: vus.filter((v) => v.gagnant === 'B').length, n: vus.length,
    duree: m('duree'), resteA: m('resteA'), resteB: m('resteB'), pvA: m('pvA'), pvB: m('pvB'),
  };
  r.texte = `${nomDuCamp(campA)} (${coutDe(campA)}) contre ${nomDuCamp(campB)} (${coutDe(campB)}) : ${r.vA} à ${r.vB} en ${secondes(vus.map((v) => v.duree))}, `
    + `survivants ${r.resteA} / ${r.resteB}, points de vie restants ${Math.round(r.pvA * 100)} % / ${Math.round(r.pvB * 100)} %`;
  return r;
}

/**
 * Une cible immobile et sans riposte, sous le tir de `tireurs` rangés à
 * `cases` cases d'elle. Rend le temps qu'elle met à tomber (Infinity si elle tient).
 */
function sousLeTir(type, tireurs, cases = 3.5) {
  const w = monde();
  for (const p of w.players) p.age = 2;
  const c = clairiere(w);
  const cible = w.spawnUnit(0, type, c.x, c.y);
  cible.stance = 'passive';
  const T = ranger(w, c, tireurs, 1, 1, cases);
  for (const t of T) t.attackEntity(cible);
  const debut = w.time;
  advance(w, 240, () => cible.dead);
  return cible.dead ? w.time - debut : Infinity;
}

/**
 * Des assaillants du joueur 0 contre un bâtiment adverse posé dans une
 * clairière, partis de sept cases. Rend s'il est rasé, en combien de temps
 * (marche comprise), et combien d'assaillants y sont restés.
 */
function assaut(camp, batiment) {
  const w = monde();
  for (const p of w.players) p.age = 2;
  const c = clairiere(w);
  const taille = BUILDING_TYPES[batiment].size;
  const b = w.spawnBuilding(1, batiment, c.tx - Math.floor(taille / 2), c.ty - Math.floor(taille / 2), true);
  const unites = ranger(w, c, camp, 0, -1, 7);
  for (const u of unites) u.attackEntity(b);
  const debut = w.time;
  advance(w, 400, () => b.dead || vivants(unites).length === 0);
  return { rase: b.dead, duree: w.time - debut, morts: unites.length - vivants(unites).length, pv: b.maxHp };
}

console.log('=== Les trois troupes des ligues 6 à 8 ===');

// ---------------------------------------------------------------------------
// 1. Statistiques, bâtiment, nom et pictogramme
// ---------------------------------------------------------------------------
console.log('\n--- Statistiques, bâtiment, pictogramme ---');
{
  // Les valeurs de départ, recopiées de la consigne : un réglage qui s'en
  // écarte fait échouer le test — à relever ici, à dessein, le jour où on l'ajuste.
  const ATTENDU = {
    pavoisier: {
      id: 'pavoisier', name: 'Pavoisier', icon: 'pavoisier', class: 'infantry',
      cost: { food: 60, gold: 40 }, trainTime: 20, hp: 70, speed: 0.85,
      attack: 4, attackType: 'melee', range: 0.8, attackSpeed: 2.0,
      meleeArmor: 1, pierceArmor: 6, los: 5, radius: 10, from: 'barracks', age: 1,
    },
    frondeur: {
      id: 'frondeur', name: 'Frondeur', icon: 'frondeur', class: 'archer',
      cost: { food: 30, wood: 30 }, trainTime: 16, hp: 30, speed: 1.05,
      attack: 3, attackType: 'pierce', range: 4, attackSpeed: 2.0,
      bonus: { archer: 6 }, bonusType: { horseArcher: 6 },
      meleeArmor: 0, pierceArmor: 1, los: 6, radius: 8, projectile: true, from: 'archery', age: 1,
    },
    sapeur: {
      id: 'sapeur', name: 'Sapeur', icon: 'sapeur', class: 'infantry',
      cost: { food: 50, gold: 40 }, trainTime: 18, hp: 35, speed: 1.3,
      attack: 3, attackType: 'melee', range: 0.8, attackSpeed: 2.0,
      bonus: { building: 10, siege: 8 },
      meleeArmor: 0, pierceArmor: 0, los: 5, radius: 9, from: 'barracks', age: 2,
    },
  };
  for (const type of NOUVELLES) {
    const { desc, ...def } = UNIT_TYPES[type] || {};
    const ecarts = Object.keys({ ...ATTENDU[type], ...def }).filter((c) => !egal(def[c], ATTENDU[type][c]));
    check(`${ATTENDU[type].name} : ses statistiques sont celles de la consigne, sans champ en plus ni en moins`, !!UNIT_TYPES[type] && ecarts.length === 0, ecarts.join(', '));
    check('… une description en français, dans le ton des autres', typeof desc === 'string' && desc.length > 40 && desc.length < 220 && /[.]$/.test(desc), desc);
    const formeurs = Object.values(BUILDING_TYPES).filter((b) => (b.trains || []).includes(type)).map((b) => b.id);
    check(`… formé ${type === 'frondeur' ? 'à l’archerie' : 'à la caserne'}, et nulle part ailleurs`, egal(formeurs, [ATTENDU[type].from]));
    check('… le même nom chez les deux peuples, accordé au nombre',
      nomDe(type, 'atlante') === ATTENDU[type].name && nomDe(type, 'solarien') === ATTENDU[type].name && nomDe(type, 'solarien', 3) === `${ATTENDU[type].name}s`);
    const icone = ICONES[UNIT_TYPES[type].icon];
    const nombres = icone ? icone.d.join(' ').match(/-?\d+(\.\d+)?/g).map(Number) : [];
    check('… un pictogramme original, dessiné dans le carré de 512',
      !!icone && / \(dessin original\)$/.test(icone.n) && icone.d.length >= 1 && nombres.length > 8
      && nombres.every((n) => n >= 0 && n <= ICON_BOX) && iconeSVG(UNIT_TYPES[type].icon, 22).includes('<path'),
      icone ? `${icone.n}, de ${Math.min(...nombres)} à ${Math.max(...nombres)}` : 'absent');
  }
  check('les trois pictogrammes sont trois dessins différents', new Set(NOUVELLES.map((t) => ICONES[t].d.join(' '))).size === 3
    && egal(NOUVELLES.map((t) => ICONES[t].n), ['pavois (dessin original)', 'fronde (dessin original)', 'pioche (dessin original)']));
  check('la caserne et l’archerie forment toujours ce qu’elles formaient, dans le même ordre : les nouvelles viennent après',
    egal(BUILDING_TYPES.barracks.trains, ['militia', 'spearman', 'triton', 'champion', 'pavoisier', 'sapeur'])
    && egal(BUILDING_TYPES.archery.trains, ['archer', 'crossbowman', 'horseArcher', 'frondeur']));
  check('ce sont des troupes comme les autres : une place de population, ni ouvrier ni animal, et pas plus de vue que l’éclaireur',
    NOUVELLES.every((t) => (UNIT_TYPES[t].pop || 1) === 1 && !['villager', 'animal'].includes(UNIT_TYPES[t].class) && UNIT_TYPES[t].los <= UNIT_TYPES.scout.los));
}

// ---------------------------------------------------------------------------
// 2. L'âge requis, et la formation
// ---------------------------------------------------------------------------
console.log('\n--- L’âge requis ---');
{
  const w = monde({ mapSize: 'medium' });
  const p = w.players[0];
  Object.assign(p.resources, { food: 5000, wood: 5000, gold: 5000 });
  p.age = 2;   // (l'archerie ne se pose pas avant l'Âge Féodal ; l'âge est ramené plus bas)
  for (let i = 0; i < 3; i++) batir(w, 'house');
  const caserne = batir(w, 'barracks'), archerie = batir(w, 'archery');
  const ou = { pavoisier: caserne, frondeur: archerie, sapeur: caserne };
  const reponses = (age) => { p.age = age; return NOUVELLES.map((t) => { const r = w.canTrain(ou[t], t); return r.ok ? 'oui' : r.reason; }); };
  const feodal = 'Âge requis : ' + AGES[1].name, chateaux = 'Âge requis : ' + AGES[2].name;
  check('à l’Âge Sombre, aucune des trois ne se forme', egal(reponses(0), [feodal, feodal, chateaux]), reponses(0).join(' · '));
  check('à l’Âge Féodal : le Pavoisier et le Frondeur, pas encore le Sapeur', egal(reponses(1), ['oui', 'oui', chateaux]), reponses(1).join(' · '));
  check('à l’Âge des Châteaux : les trois', egal(reponses(2), ['oui', 'oui', 'oui']));

  const avant = { ...p.resources }, pop = p.pop;
  const commandes = NOUVELLES.map((t) => w.trainUnit(ou[t], t));
  check('la commande est prise et payée à son prix : 140 de nourriture, 30 de bois, 80 d’or pour les trois',
    commandes.every(Boolean) && avant.food - p.resources.food === 140 && avant.wood - p.resources.wood === 30 && avant.gold - p.resources.gold === 80);
  advance(w, 45);
  const sorties = NOUVELLES.map((t) => w.units.find((u) => u.playerIndex === 0 && u.type === t));
  check('les trois sortent de leur bâtiment, avec les points de vie et la définition de config.js',
    sorties.every((u, i) => u && !u.dead && u.def === UNIT_TYPES[NOUVELLES[i]] && u.hp === UNIT_TYPES[NOUVELLES[i]].hp && u.radius === UNIT_TYPES[NOUVELLES[i]].radius)
    && p.pop === pop + 3, sorties.map((u) => (u ? `${u.type} ${u.hp} PV` : 'absent')).join(', '));
  check('… prêtes à se battre : attitude agressive, comme tout soldat', sorties.every((u) => u && u.stance === 'aggressive'));

  const verrou = monde({ mapSize: 'medium', troupesInterdites: [NOUVELLES, []] });
  verrou.players[0].age = 2;
  Object.assign(verrou.players[0].resources, { food: 5000, wood: 5000, gold: 5000 });
  const c2 = batir(verrou, 'barracks'), a2 = batir(verrou, 'archery');
  check('interdites au joueur, elles sont refusées comme toute troupe à débloquer — le reste se forme',
    [[c2, 'pavoisier'], [a2, 'frondeur'], [c2, 'sapeur']].every(([b, t]) => { const r = verrou.canTrain(b, t); return !r.ok && r.reason === 'Troupe à débloquer'; })
    && verrou.canTrain(c2, 'champion').ok && verrou.canTrain(a2, 'archer').ok);
  const niveau5 = monde({ mapSize: 'medium', niveaux: [{ pavoisier: 5, sapeur: 3 }, {}] });
  const tc = centreDe(niveau5);
  const haut = niveau5.spawnUnit(0, 'pavoisier', tc.x + 120, tc.y + 120), bas = niveau5.spawnUnit(1, 'pavoisier', tc.x + 160, tc.y + 120);
  check('elles prennent leur niveau comme les autres : Pavoisier de niveau 5 à 84 points de vie, celui d’en face à 70',
    haut.maxHp === 84 && Math.abs(haut.def.attack - 4.8) < 1e-9 && haut.def.pierceArmor === 6 && bas.maxHp === 70 && bas.def === UNIT_TYPES.pavoisier
    && egal(niveau5.defTroupe('sapeur', 0), definitionAuNiveau(UNIT_TYPES.sapeur, 'sapeur', 3)));
}

// ---------------------------------------------------------------------------
// 3. Le bonus du Frondeur : par classe, et par TYPE de cible
// ---------------------------------------------------------------------------
console.log('\n--- Le bonus du Frondeur ---');
{
  const w = monde({ mapSize: 'medium' });
  const c = centreDe(w), moi = w.players[0];
  const cibles = {};
  for (const type of ['archer', 'crossbowman', 'horseArcher', 'frondeur', 'militia', 'knight', 'scout', 'villager', 'ram', 'hydra', 'pavoisier']) {
    cibles[type] = w.spawnUnit(1, type, c.x + 200, c.y + 200);
  }
  const caserne = batir(w, 'barracks', 1);
  const degats = (attaquant, cible) => computeDamage(UNIT_TYPES[attaquant] || attaquant, moi, cible);
  check('contre un archer : 3 + 6 = 9, soit quatre pierres pour ses 30 points de vie', degats('frondeur', cibles.archer) === 9, `${degats('frondeur', cibles.archer)}`);
  check('contre un arbalétrier : 3 + 6, moins 1 d’armure = 8', degats('frondeur', cibles.crossbowman) === 8, `${degats('frondeur', cibles.crossbowman)}`);
  check('contre un archer monté, qui est de la cavalerie : le bonus par TYPE joue — 8',
    cibles.horseArcher.combatClass === 'cavalry' && degats('frondeur', cibles.horseArcher) === 8, `${degats('frondeur', cibles.horseArcher)}`);
  check('contre un autre frondeur, tireur lui aussi : 8', degats('frondeur', cibles.frondeur) === 8);
  check('contre un milicien : pas de bonus — 3 moins 1 d’armure = 2', degats('frondeur', cibles.militia) === 2, `${degats('frondeur', cibles.militia)}`);
  check('contre un cavalier ou un éclaireur, cavalerie sans arc : pas de bonus — 1, le minimum',
    degats('frondeur', cibles.knight) === 1 && degats('frondeur', cibles.scout) === 1, `${degats('frondeur', cibles.knight)} et ${degats('frondeur', cibles.scout)}`);
  check('ni contre un ouvrier (3), un bélier, une Hydre, un Pavoisier ou un bâtiment (1)',
    degats('frondeur', cibles.villager) === 3 && ['ram', 'hydra', 'pavoisier'].every((t) => degats('frondeur', cibles[t]) === 1) && degats('frondeur', caserne) === 1);
  // Le champ nouveau s'AJOUTE au bonus par classe, et ne change rien à qui ne le porte pas.
  const mixte = { attack: 3, attackType: 'pierce', bonus: { cavalry: 2 }, bonusType: { horseArcher: 6, barracks: 4 } };
  check('le bonus par type s’ajoute au bonus par classe : 3 + 2 + 6 − 1 = 10 sur un archer monté, 3 + 2 − 2 = 3 sur un cavalier',
    degats(mixte, cibles.horseArcher) === 10 && degats(mixte, cibles.knight) === 3);
  check('… il vaut aussi pour un type de bâtiment : 3 + 4 − 7 → 1, le minimum ; 13 + 4 − 7 = 10', degats(mixte, caserne) === 1 && degats({ ...mixte, attack: 13 }, caserne) === 10);
  const sansLeChamp = Object.keys(UNIT_TYPES).filter((t) => !UNIT_TYPES[t].bonusType);
  check('seul le Frondeur porte ce champ : les seize autres troupes, les animaux et les bâtiments frappent comme avant',
    egal(Object.keys(UNIT_TYPES).filter((t) => UNIT_TYPES[t].bonusType), ['frondeur']) && sansLeChamp.length === Object.keys(UNIT_TYPES).length - 1
    && Object.values(BUILDING_TYPES).every((b) => !b.bonusType)
    && degats('archer', cibles.horseArcher) === 3 && degats('knight', cibles.archer) === 14 && degats('spearman', cibles.horseArcher) === 14
    && degats(BUILDING_TYPES.tower, cibles.ram) === 3 && degats('ram', caserne) === 37);
  const niveau5 = definitionAuNiveau(UNIT_TYPES.frondeur, 'frondeur', 5);
  check('au niveau 5, la pierre monte (3,6), pas le bonus : 9,6 sur un archer, 8,6 sur un archer monté',
    Math.abs(computeDamage(niveau5, moi, cibles.archer) - 9.6) < 1e-9 && Math.abs(computeDamage(niveau5, moi, cibles.horseArcher) - 8.6) < 1e-9);
}

// ---------------------------------------------------------------------------
// 4. Des duels joués pour de bon. Les temps mesurés servent à juger
//    l'équilibre : ils sont écrits à côté de chaque vérification.
// ---------------------------------------------------------------------------
console.log('\n--- Le Frondeur contre les tireurs, à prix égal ---');
{
  const archers = duel([['frondeur', 7]], [['archer', 6]]);
  check('sept frondeurs battent six archers, pour le même prix', archers.vA === archers.n && coutDe([['frondeur', 7]]) === coutDe([['archer', 6]]), archers.texte);
  check('… nettement : il leur reste plus de la moitié de leurs points de vie', archers.pvA > 0.5 && archers.resteA >= 5);
  const montes = duel([['frondeur', 2]], [['horseArcher', 1]]);
  check('deux frondeurs battent un archer monté, pour le même prix', montes.vA === montes.n && coutDe([['frondeur', 2]]) === coutDe([['horseArcher', 1]]), montes.texte);
  const arbaletes = duel([['frondeur', 5]], [['crossbowman', 3]]);
  check('cinq frondeurs battent trois arbalétriers, pour le même prix', arbaletes.vA === arbaletes.n && coutDe([['frondeur', 5]]) === coutDe([['crossbowman', 3]]), arbaletes.texte);
  const miliciens = duel([['frondeur', 4]], [['militia', 3]]);
  check('sans son bonus il ne vaut rien : trois miliciens battent quatre frondeurs, pour le même prix',
    miliciens.vB === miliciens.n && miliciens.resteB === 3 && coutDe([['frondeur', 4]]) === coutDe([['militia', 3]]), miliciens.texte);
}

console.log('\n--- Le Pavoisier sous les flèches ---');
{
  const ARCHERS = [['archer', 4]];
  const pavoisier = sousLeTir('pavoisier', ARCHERS), milicien = sousLeTir('militia', ARCHERS), champion = sousLeTir('champion', ARCHERS);
  check('une flèche d’archer lui ôte 1 point de vie, 4 à un milicien',
    (() => { const w = monde({ mapSize: 'medium' }); const c = centreDe(w); const j = w.players[1];
      return computeDamage(UNIT_TYPES.archer, j, w.spawnUnit(0, 'pavoisier', c.x + 150, c.y + 150)) === 1
        && computeDamage(UNIT_TYPES.archer, j, w.spawnUnit(0, 'militia', c.x + 150, c.y + 150)) === 4
        && computeDamage(BUILDING_TYPES.tower, j, w.spawnUnit(0, 'pavoisier', c.x + 150, c.y + 150)) === 1; })());
  check('sous le tir de quatre archers, immobile, il tient au moins cinq fois plus longtemps qu’un milicien',
    Number.isFinite(pavoisier) && Number.isFinite(milicien) && pavoisier >= 5 * milicien,
    `Pavoisier ${pavoisier.toFixed(1)} s, milicien ${milicien.toFixed(1)} s (×${(pavoisier / milicien).toFixed(1)}), champion ${champion.toFixed(1)} s`);
  check('… et plus longtemps que le champion, pourtant plus cher', pavoisier > champion);
  const mur = duel([['pavoisier', 7]], [['archer', 10]]), ligne = duel([['militia', 9]], [['archer', 10]]);
  check('sept pavoisiers battent dix archers, pour le même prix', mur.vA === mur.n && coutDe([['pavoisier', 7]]) === coutDe([['archer', 10]]), mur.texte);
  check('… sans perdre un homme, là où des miliciens pour le même prix en perdent', mur.resteA === 7 && ligne.resteA < 9 && mur.pvA > ligne.pvA + 0.2, ligne.texte);
  check('… mais plus lentement qu’eux : il frappe peu', mur.duree > ligne.duree, `${mur.duree.toFixed(1)} s contre ${ligne.duree.toFixed(1)} s`);
  // Une tour : 6 de dégâts perforants, toutes les 1,6 s.
  const tour = (type) => {
    const w = monde();
    const c = clairiere(w);
    w.spawnBuilding(1, 'tower', c.tx + 3, c.ty - 1, true);
    const cible = w.spawnUnit(0, type, c.x, c.y);
    cible.stance = 'passive';
    const debut = w.time;
    advance(w, 240, () => cible.dead);
    return cible.dead ? w.time - debut : Infinity;
  };
  const sousTourP = tour('pavoisier'), sousTourM = tour('militia');
  check('au pied d’une tour, il tient au moins cinq fois plus longtemps qu’un milicien',
    Number.isFinite(sousTourM) && sousTourP >= 5 * sousTourM, `Pavoisier ${sousTourP.toFixed(1)} s, milicien ${sousTourM.toFixed(1)} s`);
}

console.log('\n--- Le Sapeur contre les bâtiments et les engins ---');
{
  const SAPEURS = [['sapeur', 5]], BELIERS = [['ram', 2]];
  check('cinq sapeurs coûtent à peu près deux béliers (450 contre 470)', coutDe(SAPEURS) === 450 && coutDe(BELIERS) === 470);
  const releve = {};
  for (const batiment of ['barracks', 'tower', 'towncenter']) {
    releve[batiment] = { sapeurs: assaut(SAPEURS, batiment), beliers: assaut(BELIERS, batiment) };
  }
  const dit = (b) => `${nomDe(b, 'atlante')} (${releve[b].sapeurs.pv} PV) : sapeurs ${releve[b].sapeurs.duree.toFixed(1)} s, ${releve[b].sapeurs.morts} mort(s) — `
    + `béliers ${releve[b].beliers.duree.toFixed(1)} s, ${releve[b].beliers.morts} mort(s) — ×${(releve[b].beliers.duree / releve[b].sapeurs.duree).toFixed(1)}`;
  // Un bâtiment sans défense : les sapeurs vont plus vite, sans aller jusqu'au
  // double (à +25 c'était le triple). Une tour : elle leur prend des hommes,
  // et le bélier, cuirassé contre les flèches, n'y laisse personne.
  for (const batiment of ['barracks', 'towncenter']) {
    const r = releve[batiment], gain = r.beliers.duree / r.sapeurs.duree;
    check(`à prix égal, les sapeurs rasent ${batiment === 'barracks' ? 'une caserne' : 'un Centre-Ville'} avant les béliers, sans aller deux fois plus vite`,
      r.sapeurs.rase && r.beliers.rase && gain > 1.2 && gain < 2, dit(batiment));
  }
  check('contre une tour, les sapeurs y laissent des hommes, les béliers aucun', releve.tower.sapeurs.morts >= 2 && releve.tower.beliers.morts === 0 && releve.tower.beliers.rase, dit('tower'));
  const coup = (() => { const w = monde({ mapSize: 'medium' }); const b = batir(w, 'barracks', 1); const c = centreDe(w);
    return [computeDamage(UNIT_TYPES.sapeur, w.players[0], b), computeDamage(UNIT_TYPES.ram, w.players[0], b),
      computeDamage(UNIT_TYPES.sapeur, w.players[0], w.spawnUnit(1, 'ram', c.x + 150, c.y + 150)),
      computeDamage(UNIT_TYPES.sapeur, w.players[0], w.spawnUnit(1, 'catapult', c.x + 150, c.y + 150)),
      computeDamage(UNIT_TYPES.sapeur, w.players[0], w.spawnUnit(1, 'militia', c.x + 150, c.y + 150))]; })();
  check('un coup de sapeur : 11 sur une caserne (37 pour le bélier, deux fois plus lent), 9 sur un bélier, 11 sur une catapulte, 2 sur un milicien',
    egal(coup, [11, 37, 9, 11, 2]), coup.join(', '));
  const engins = duel(SAPEURS, BELIERS);
  check('cinq sapeurs brisent deux béliers', engins.vA === engins.n, engins.texte);
  const catapulte = duel([['sapeur', 3]], [['catapult', 1]]);
  check('trois sapeurs brisent une catapulte, pour le même prix à peu près', catapulte.vA === catapulte.n, catapulte.texte);
  // Très fragile : tout soldat l'arrête.
  const miliciens = duel([['sapeur', 4]], [['militia', 5]]), archer = duel([['sapeur', 1]], [['archer', 1]]);
  check('très fragile : cinq miliciens abattent quatre sapeurs sans perdre un homme', miliciens.vB === miliciens.n && miliciens.resteB === 5, miliciens.texte);
  check('… et un archer seul abat un sapeur seul', archer.vB === archer.n, archer.texte);
}

console.log('\n--- Les contres annoncés ---');
{
  const seul = duel([['knight', 1]], [['frondeur', 1]]), groupe = duel([['knight', 4]], [['frondeur', 9]]);
  check('un cavalier bat un frondeur', seul.vA === seul.n && seul.pvA > 0.9, seul.texte);
  check('… et quatre cavaliers battent neuf frondeurs, pour le même prix', groupe.vA === groupe.n && coutDe([['knight', 4]]) === coutDe([['frondeur', 9]]), groupe.texte);
  const champion = duel([['champion', 1]], [['pavoisier', 1]]), champions = duel([['champion', 5]], [['pavoisier', 6]]);
  check('un champion bat un pavoisier', champion.vA === champion.n && champion.pvA > 0.7, champion.texte);
  check('… et cinq champions battent six pavoisiers, pour le même prix', champions.vA === champions.n && coutDe([['champion', 5]]) === coutDe([['pavoisier', 6]]), champions.texte);
  const cavalier = duel([['knight', 1]], [['pavoisier', 1]]);
  check('un cavalier bat un pavoisier', cavalier.vA === cavalier.n && cavalier.pvA > 0.7, cavalier.texte);
  // La catapulte : son boulet est un coup de mêlée, le bouclier n'y peut rien.
  const boulets = sousLeTir('pavoisier', [['catapult', 1]], 5), fleches = sousLeTir('pavoisier', [['archer', 4]]);
  check('une catapulte écrase un pavoisier à l’arrêt en trois boulets, bien plus vite que quatre archers — pour un prix voisin',
    Number.isFinite(boulets) && boulets < fleches / 2, `catapulte ${boulets.toFixed(1)} s, quatre archers ${fleches.toFixed(1)} s`);
}

// ---------------------------------------------------------------------------
// 5. L'ordinateur : seulement si la partie les lui donne
// ---------------------------------------------------------------------------
console.log('\n--- L’ordinateur ---');
/** Un camp riche et logé, à cet âge, avec ses bâtiments militaires debout. */
function equiper(w, joueur, age = 2) {
  const p = w.players[joueur];
  p.age = age;
  Object.assign(p.resources, { food: 20000, wood: 20000, gold: 20000 });
  const poses = {};
  const types = age >= 2 ? ['barracks', 'archery', 'stable', 'siege', 'temple'] : ['barracks', 'archery', 'stable'];
  for (const type of ['house', 'house', 'house', 'house', 'house', 'house', ...types]) poses[type] = batir(w, type, joueur);
  return poses;
}
/** Ce que l'ordinateur met en formation en 150 secondes : les types vus dans ses files. */
function forme(options, age = 2) {
  const m = new World({ seed: 51, difficulty: 'hard', ...options });
  equiper(m, 1, age);
  for (const u of m.units) if (u.playerIndex === 0 && u.setStance) u.setStance('passive');
  const vus = new Set();
  advance(m, 150, () => {
    for (const bat of m.buildings) if (bat.playerIndex === 1) for (const q of bat.queue) if (q.kind === 'unit') vus.add(q.id);
    return false;
  });
  return { vus, monde: m };
}
{
  const ordinaire = forme({});
  check('sans option, l’ordinateur à l’Âge des Châteaux, riche et logé, ne forme aucune des trois',
    NOUVELLES.every((t) => !ordinaire.vus.has(t)) && ordinaire.vus.has('knight') && ordinaire.vus.has('champion'), [...ordinaire.vus].join(' '));
  check('… pas même si on les donne en plus au JOUEUR : la liste est par camp',
    NOUVELLES.every((t) => !forme({ troupesEnPlus: [NOUVELLES, []] }).vus.has(t)));
  const avec = forme({ troupesEnPlus: [[], NOUVELLES] });
  check('avec `troupesEnPlus`, il forme les trois', NOUVELLES.every((t) => avec.vus.has(t)), [...avec.vus].join(' '));
  check('… mêlées à sa rotation : il forme toujours ses champions, ses tireurs et ses cavaliers',
    ['champion', 'archer', 'crossbowman', 'horseArcher', 'knight'].every((t) => avec.vus.has(t)));
  check('… sans casser ses commandes : l’Hydre, puis les engins de siège, et ses Prêtresses',
    ['hydra', 'ram', 'catapult', 'priest'].every((t) => avec.vus.has(t)) && [...ordinaire.vus].every((t) => avec.vus.has(t)));
  const sorties = (type) => avec.monde.units.filter((u) => u.playerIndex === 1 && u.type === type).length;
  check('… et elles sortent bien de ses bâtiments', NOUVELLES.every((t) => sorties(t) >= 1), NOUVELLES.map((t) => `${sorties(t)} ${t}`).join(', '));
  const bride = forme({ troupesEnPlus: [[], NOUVELLES], troupesInterdites: [[], ['sapeur', 'hydra']] });
  check('une troupe à la fois interdite et en plus n’est pas formée : sans Sapeur ni Hydre, il forme les deux autres',
    !bride.vus.has('sapeur') && !bride.vus.has('hydra') && bride.vus.has('pavoisier') && bride.vus.has('frondeur') && bride.vus.has('knight'), [...bride.vus].join(' '));
  const une = forme({ troupesEnPlus: [[], ['frondeur']] });
  check('une seule en plus : celle-là, pas les deux autres', une.vus.has('frondeur') && !une.vus.has('pavoisier') && !une.vus.has('sapeur'));
  const feodal = forme({ troupesEnPlus: [[], NOUVELLES] }, 1);
  check('à l’Âge Féodal, il forme déjà le Pavoisier et le Frondeur — pas le Sapeur, qui attend l’Âge des Châteaux',
    feodal.monde.players[1].age === 1 && feodal.vus.has('pavoisier') && feodal.vus.has('frondeur') && !feodal.vus.has('sapeur')
    && feodal.vus.has('spearman') && feodal.vus.has('archer'),
    `${[...feodal.vus].join(' ')} — ${AGES[feodal.monde.players[1].age].name} au bout de 150 s`);
  const illisible = new World({ seed: 51, troupesEnPlus: [['licorne', 'villager', 'deer', 'constructor', 7, null], 'toutes'] });
  check('une liste illisible ne donne rien : ni type inconnu, ni ouvrier, ni animal',
    illisible.players[0].enPlus.size === 0 && illisible.players[1].enPlus.size === 0 && new World({ seed: 51 }).players[1].enPlus.size === 0);

  // ---------------------------------------------------------------------------
  // 6. La sauvegarde
  // ---------------------------------------------------------------------------
  console.log('\n--- La sauvegarde ---');
  const image = JSON.parse(JSON.stringify(serializeWorld(avec.monde)));
  check('la sauvegarde garde les troupes en plus du camp qui en a, et rien pour l’autre',
    egal(image.players[1].enPlus, NOUVELLES) && !('enPlus' in image.players[0]));
  const repris = restoreWorld(image);
  check('la partie reprise les retrouve', !!repris && egal([...repris.players[1].enPlus], NOUVELLES) && repris.players[0].enPlus.size === 0);
  check('… ses troupes nouvelles aussi, à leur place et avec leurs points de vie',
    !!repris && NOUVELLES.every((t) => egal(repris.units.filter((u) => u.type === t).map((u) => [u.id, u.hp, u.x, u.y]),
      avec.monde.units.filter((u) => !u.dead && u.type === t).map((u) => [u.id, u.hp, u.x, u.y]))));
  check('… et elle se sauvegarde à l’identique', !!repris && JSON.stringify({ ...serializeWorld(repris), savedAt: 0 }) === JSON.stringify({ ...image, savedAt: 0 }));
  const suite = new Set();
  if (repris) {
    for (const u of repris.units) if (u.playerIndex === 0 && u.setStance) u.setStance('passive');
    advance(repris, 60, () => {
      for (const bat of repris.buildings) if (bat.playerIndex === 1) for (const q of bat.queue) if (q.kind === 'unit') suite.add(q.id);
      return false;
    });
  }
  check('… l’ordinateur y forme encore des troupes nouvelles', NOUVELLES.some((t) => suite.has(t)), [...suite].join(' '));
  const bridee = JSON.parse(JSON.stringify(serializeWorld(bride.monde)));
  check('interdites et en plus se gardent côte à côte',
    egal(bridee.players[1].enPlus, NOUVELLES) && egal(bridee.players[1].interdites, ['sapeur', 'hydra'])
    && egal([...restoreWorld(bridee).players[1].interdites], ['sapeur', 'hydra']));

  // Une partie sans option : rien de nouveau dans ce qu'elle range.
  const CLES_DU_JOUEUR = ['civ', 'resources', 'age', 'ageProgress', 'techs', 'defeated', 'autoWorkers', 'mods', 'stats'];
  const sans = JSON.parse(JSON.stringify(serializeWorld(ordinaire.monde)));
  const texte = JSON.stringify(sans);
  check('une partie sans option se sauvegarde comme avant : les mêmes clés par joueur, aucune nouvelle',
    sans.players.every((j) => egal(Object.keys(j), CLES_DU_JOUEUR)), Object.keys(sans.players[1]).join(' '));
  check('… et rien dans l’état rangé ne parle de troupes en plus ni des trois troupes',
    !texte.includes('enPlus') && !texte.includes('interdites') && !texte.includes('niveaux') && NOUVELLES.every((t) => !texte.includes(t)));
  const ancienne = restoreWorld(sans);
  check('une sauvegarde d’avant, sans ce champ, se reprend sans rien en plus',
    !!ancienne && ancienne.players.every((j) => j.enPlus.size === 0 && j.interdites.size === 0)
    && JSON.stringify({ ...serializeWorld(ancienne), savedAt: 0 }) === JSON.stringify({ ...sans, savedAt: 0 }));

  // Deux ordinateurs jouent huit minutes sans option : pas une des trois
  // troupes, d'aucun côté. (L'Âge des Châteaux, lui, est couvert plus haut.)
  const libre = new World({ seed: 808, mode: 'express', mapSize: 'small', difficulty: 'hard' });
  libre.players[0].autoWorkers = true;
  libre.ais.push(new AIPlayer(libre, 0, DIFFICULTIES.hard));
  const formees = new Set();
  advance(libre, 480, () => {
    for (const bat of libre.buildings) for (const q of bat.queue) if (q.kind === 'unit') formees.add(q.id);
    return !!libre.gameOver;
  });
  check('deux ordinateurs, huit minutes d’Express sans option : aucune des trois troupes n’est formée, d’aucun côté',
    NOUVELLES.every((t) => !formees.has(t)) && libre.units.every((u) => !NOUVELLES.includes(u.type))
    && libre.players.every((j) => j.age >= 1 && j.stats.trained > 10) && formees.has('archer') && formees.has('spearman'),
    `${[...formees].join(' ')} — ${Math.round(libre.time)} s de jeu, ${libre.players.map((j) => j.stats.trained).join(' et ')} troupes formées`);
}

// ---------------------------------------------------------------------------
// 7. Du profil à la partie
// ---------------------------------------------------------------------------
console.log('\n--- Du profil à la partie ---');
{
  const R = PROGRESSION;
  const enLigue = (elo) => regulariser({ ...profilNeuf(), elo }).profil;
  const seuil = (ligue) => R.ligues[ligue - 1].seuil;
  check('les trois troupes : épiques, offertes aux ligues 6, 7, 8 ou après 130, 180, 250 parties, +5 % de points de vie et de dégâts par niveau',
    egal(NOUVELLES.map((t) => [R.troupes[t].categorie, R.troupes[t].gratuite.ligue, R.troupes[t].gratuite.parties]),
      [['epique', 6, 130], ['epique', 7, 180], ['epique', 8, 250]])
    && NOUVELLES.every((t) => egal(R.troupes[t].ameliorations, { fois: { hp: [1000, 1050, 1100, 1150, 1200], attack: [1000, 1050, 1100, 1150, 1200] } })
      && R.troupes[t].aVenir === undefined && R.troupes[t].depart === undefined && R.troupes[t].enPlus === true)
    && ANCIENNES.every((t) => R.troupes[t].enPlus === undefined));

  // Partie classée : ce que la LIGUE du joueur offre.
  const attendu = { 5: [], 6: ['pavoisier'], 7: ['pavoisier', 'frondeur'], 8: NOUVELLES };
  for (const ligue of [5, 6, 7, 8]) {
    const p = enLigue(seuil(ligue));
    const r = reglagesDePartie(p, 'classe');
    const reste = NOUVELLES.filter((t) => !attendu[ligue].includes(t));
    check(`ligue ${ligue}, partie classée : l’ordinateur reçoit en plus ${attendu[ligue].length ? attendu[ligue].join(', ') : 'aucune des trois'}`,
      p.ligue === ligue && egal(r.troupesEnPlus, [[], attendu[ligue]]), JSON.stringify(r.troupesEnPlus));
    check('… le joueur les a aussi ; les autres restent interdites aux deux camps, et les quatre anciennes sont permises',
      egal(r.troupesInterdites, [reste, reste]) && attendu[ligue].every((t) => p.debloquees[t] === 'ligue'), JSON.stringify(r.troupesInterdites));
  }
  check('aux ligues 1 à 4, rien en plus ; aux ligues 9 et 10, les trois',
    [1, 2, 3, 4].every((l) => egal(reglagesDePartie(enLigue(seuil(l))).troupesEnPlus, [[], []]))
    && [9, 10].every((l) => egal(reglagesDePartie(enLigue(seuil(l))).troupesEnPlus, [[], NOUVELLES])));
  check('les quatre anciennes passent toujours par les troupes interdites, jamais par les troupes en plus',
    egal(reglagesDePartie(profilNeuf()).troupesInterdites, [[...ANCIENNES, ...NOUVELLES], [...ANCIENNES, ...NOUVELLES]])
    && [1, 3, 5, 8, 10].every((l) => reglagesDePartie(enLigue(seuil(l))).troupesEnPlus.flat().every((t) => NOUVELLES.includes(t))));
  const achat = enLigue(seuil(5));
  achat.debloquees.sapeur = 'achat';
  check('un Sapeur acheté en ligue 5 : le joueur le forme en classé, l’ordinateur attend la ligue 8',
    egal(reglagesDePartie(achat, 'classe').troupesInterdites, [['pavoisier', 'frondeur'], NOUVELLES]) && egal(reglagesDePartie(achat, 'classe').troupesEnPlus, [[], []]));
  const redescendu = { ...enLigue(seuil(6)), elo: seuil(6) - 100, ligue: 5 };
  check('redescendu en ligue 5, le joueur garde son Pavoisier ; l’ordinateur, lui, suit la ligue où l’on joue',
    migrerProfil(redescendu).ligue === 5 && migrerProfil(redescendu).debloquees.pavoisier === 'ligue'
    && egal(reglagesDePartie(redescendu, 'classe').troupesInterdites, [['frondeur', 'sapeur'], NOUVELLES])
    && egal(reglagesDePartie(redescendu, 'classe').troupesEnPlus, [[], []]));

  // Partie libre : ce que le JOUEUR a débloqué.
  check('partie libre, profil neuf : rien en plus', egal(reglagesDePartie(profilNeuf(), 'libre').troupesEnPlus, [[], []]));
  check('partie libre, Sapeur acheté en ligue 5 : l’ordinateur peut le former lui aussi',
    egal(reglagesDePartie(achat, 'libre').troupesEnPlus, [[], ['sapeur']])
    && egal(reglagesDePartie(achat, 'libre').troupesInterdites, [['pavoisier', 'frondeur'], ['pavoisier', 'frondeur']]));
  const veteran = regulariser({ ...profilNeuf(), parties: 200, defaites: 200 }).profil;
  check('partie libre, 200 parties en ligue 1 : Pavoisier et Frondeur débloqués par les parties, donnés en plus à l’ordinateur',
    veteran.ligue === 1 && egal(reglagesDePartie(veteran, 'libre').troupesEnPlus, [[], ['pavoisier', 'frondeur']])
    && egal(reglagesDePartie(veteran, 'libre').troupesInterdites, [['sapeur'], ['sapeur']]));
  check('… en classé, à la même ligue 1, il ne les reçoit pas : le joueur seul les forme',
    egal(reglagesDePartie(veteran, 'classe').troupesEnPlus, [[], []])
    && egal(reglagesDePartie(veteran, 'classe').troupesInterdites, [['sapeur'], [...ANCIENNES, ...NOUVELLES]]));
  check('partie libre en ligue 8 : les trois', egal(reglagesDePartie(enLigue(seuil(8)), 'libre').troupesEnPlus, [[], NOUVELLES]));

  // Le monde reçoit ces réglages tels quels.
  const w = new World({ seed: 51, mode: 'express', ...reglagesDePartie(enLigue(seuil(7)), 'classe') });
  check('le monde créé avec les réglages de la ligue 7 : Pavoisier et Frondeur en plus pour l’ordinateur, Sapeur interdit aux deux',
    egal([...w.players[1].enPlus], ['pavoisier', 'frondeur']) && w.players[0].enPlus.size === 0
    && egal([...w.players[0].interdites], ['sapeur']) && egal([...w.players[1].interdites], ['sapeur'])
    && w.players[1].niveaux.pavoisier === 4 && w.defTroupe('pavoisier', 1).hp === 81);

  // Un profil rangé avant ce changement.
  const dAvant = (base) => {
    const q = JSON.parse(JSON.stringify(base));
    for (const t of NOUVELLES) { delete q.troupes[t]; delete q.debloquees[t]; }
    return q;
  };
  const ancien = dAvant(enLigue(seuil(4)));
  let leve = null, relu = null;
  try { relu = migrerProfil(ancien); } catch (e) { leve = e; }
  check('un profil rangé avant ce changement se relit sans erreur, et reçoit les trois troupes au niveau 1, verrouillées',
    leve === null && !!relu && Object.keys(ancien.troupes).length === 14 && Object.keys(relu.troupes).length === 17
    && NOUVELLES.every((t) => egal(relu.troupes[t], { niveau: 1, fragments: 0 }) && !(t in relu.debloquees))
    && relu.elo === ancien.elo && relu.ligue === 4 && egal(relu.debloquees, ancien.debloquees) && egal(relu.coffres, ancien.coffres));
  check('… ses réglages de partie : les trois interdites, rien en plus',
    egal(reglagesDePartie(ancien, 'classe').troupesInterdites, [['hydra', ...NOUVELLES], ['hydra', ...NOUVELLES]])
    && egal(reglagesDePartie(ancien, 'classe').troupesEnPlus, [[], []]) && egal(reglagesDePartie(ancien, 'libre').troupesEnPlus, [[], []]));
  check('… elles restent verrouillées tant que leur condition n’est pas remplie',
    egal(regulariser(ancien).evenements, []) && NOUVELLES.every((t) => !(t in regulariser(ancien).profil.debloquees)));
  const ancienHaut = dAvant(enLigue(seuil(7)));
  const mis = regulariser(ancienHaut);
  check('… et celles dont la condition était déjà remplie arrivent : en ligue 7, le Pavoisier et le Frondeur',
    egal(mis.evenements, [{ type: 'troupeDebloquee', troupe: 'pavoisier', origine: 'ligue' }, { type: 'troupeDebloquee', troupe: 'frondeur', origine: 'ligue' }])
    && !mis.profil.debloquees.sapeur && egal(reglagesDePartie(ancienHaut, 'classe').troupesEnPlus, [[], ['pavoisier', 'frondeur']]));

  // Tel qu'il est rangé dans le navigateur.
  const m = new Map([[PROGRESSION_KEY, JSON.stringify(ancienHaut)]]);
  const store = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
  const lu = lireProgression();
  check('lu sur l’appareil, l’ancien profil est remis d’aplomb : dix-sept troupes, les deux nouvelles de sa ligue débloquées',
    Object.keys(lu.troupes).length === 17 && lu.debloquees.pavoisier === 'ligue' && lu.debloquees.frondeur === 'ligue' && !lu.debloquees.sapeur && lu.ligue === 7);

  // ---------------------------------------------------------------------------
  // 8. Les écrans : la collection, la fiche, les ligues
  // ---------------------------------------------------------------------------
  console.log('\n--- Les écrans ---');
  const noeud = { innerHTML: '', classList: { add() {}, remove() {} }, querySelector: () => null };
  Object.defineProperty(globalThis, 'document', { value: { getElementById: (id) => (id === 'progression' ? noeud : null) }, configurable: true, writable: true });
  const ecran = (nom, arg) => { noeud.innerHTML = ''; ouvrirProgression(nom, arg); return noeud.innerHTML; };
  const propre = (html) => html.length > 200 && !/undefined|NaN|\[object/.test(html);
  /** La vignette d'une troupe : son portrait s'il existe, sinon son pictogramme. */
  const vignette = (html, type, peuple = 'atlante') => {
    const src = portraitDe(type, peuple);
    return src ? html.includes(`<img src="${src}"`) : html.includes(ICONES[type].d[0]);
  };
  for (const peuple of ['atlante', 'solarien']) {
    reglerPeuple(peuple);
    const collection = ecran('troupes');
    check(`collection (${peuple}) : les trois troupes y ont leur carte, avec leur nom et leur vignette`,
      propre(collection) && NOUVELLES.every((t) => collection.includes(`data-ecran="fiche" data-arg="${t}"`) && collection.includes(`<b>${UNIT_TYPES[t].name}</b>`) && vignette(collection, t, peuple))
      && (collection.match(/class="prog-troupe /g) || []).length === 17);
  }
  reglerPeuple('atlante');
  const collection = ecran('troupes');
  const carte = (t) => (collection.match(new RegExp(`<button class="prog-troupe[^>]*data-arg="${t}">[\\s\\S]*?</button>`)) || [''])[0];
  check('… débloquées, elles montrent leur niveau ; le Sapeur, verrouillé, sa ligue sous cadenas',
    carte('pavoisier').includes('Niv. 1') && carte('frondeur').includes('Niv. 1') && !carte('pavoisier').includes('verrouillee')
    && carte('sapeur').includes('verrouillee') && carte('sapeur').includes('Ligue d’Orichalque') && !carte('sapeur').includes('Niv.'));
  for (const type of NOUVELLES) {
    const fiche = ecran('fiche', type);
    const verrouillee = type === 'sapeur';
    check(`fiche du ${UNIT_TYPES[type].name} : son nom, sa catégorie, sa vignette, ses points de vie et ses dégâts au niveau suivant`,
      propre(fiche) && fiche.includes(`<h2>${UNIT_TYPES[type].name}</h2>`) && fiche.includes('data-categorie="epique"') && vignette(fiche, type)
      && fiche.includes(`<td>Points de vie</td><td>${UNIT_TYPES[type].hp}</td>`) && fiche.includes('<td>Dégâts</td>') && fiche.includes('<th>Niveau 2</th>')
      && (verrouillee ? fiche.includes('À débloquer') && fiche.includes('Offerte en ligue d’Orichalque, ou après 250 parties') : fiche.includes('Passer au niveau 2')));
  }
  const ligues = ecran('ligues');
  check('ligues : Or, Cristal et Orichalque annoncent chacune leur troupe',
    propre(ligues) && /Ligue d’Or<[\s\S]*?Reçu : Coffre d’or · Pavoisier/.test(ligues) && /Ligue de Cristal<[\s\S]*?Reçu : Coffre d’or · Frondeur/.test(ligues)
    && /Ligue d’Orichalque<[\s\S]*?À gagner : Coffre légendaire · Sapeur/.test(ligues));
  const fin = htmlFinDePartie([{ type: 'elo', avant: 1120, apres: 1150, variation: 30, classee: true },
    { type: 'troupeDebloquee', troupe: 'pavoisier', origine: 'ligue' }], lu);
  check('fin de partie : la troupe gagnée est annoncée, avec sa vignette', propre(fin) && fin.includes('Nouvelle troupe : <b>Pavoisier</b>') && vignette(fin, 'pavoisier'));
  check('bandeau de l’accueil : rien n’y casse', propre(htmlBandeau(lu)));
  check('un type qui n’est pas une troupe du jeu ramène à la collection', ecran('fiche', 'licorne').includes('Mes troupes'));

  // Le bouton « Essayer » d'une troupe verrouillée : absent tant que l'accueil
  // ne sait pas lancer d'essai, puis un toucher, ou deux si une partie dort.
  check('sans lanceur d’essai, la fiche d’une troupe verrouillée n’a pas de bouton « Essayer »', !ecran('fiche', 'sapeur').includes('data-act="essayer"'));
  let clic = null;
  const demandes = [];
  let reponse = 'lancee';
  document.addEventListener = (type, f) => { if (type === 'click') clic = f; };
  installerProgression({ quandOnEssaie: (type, sur) => { demandes.push([type, sur]); return reponse; } });
  const toucher = (dataset) => clic({ target: { closest: () => ({ dataset }) } });
  const ficheSapeur = ecran('fiche', 'sapeur');
  check('avec lui, la fiche du Sapeur verrouillé propose « Essayer en partie libre » et dit ce que l’essai ne compte pas',
    propre(ficheSapeur) && ficheSapeur.includes('data-act="essayer" data-arg="sapeur"') && ficheSapeur.includes('Essayer en partie libre')
    && ficheSapeur.includes('ne compte ni au classement ni au palmarès') && ficheSapeur.includes('Offerte en ligue d’Orichalque'));
  check('… pas celle d’une troupe déjà débloquée', !ecran('fiche', 'pavoisier').includes('data-act="essayer"'));
  ecran('fiche', 'sapeur');
  toucher({ act: 'essayer', arg: 'sapeur' });
  check('un toucher lance l’essai de cette troupe', egal(demandes, [['sapeur', false]]));
  reponse = 'confirmer';
  ecran('fiche', 'sapeur');
  toucher({ act: 'essayer', arg: 'sapeur' });
  check('une partie dort : la fiche demande un second toucher, et dit que la partie sera effacée',
    noeud.innerHTML.includes('la partie en cours sera effacée') && noeud.innerHTML.includes('data-i="1"') && propre(noeud.innerHTML));
  reponse = 'lancee';
  toucher({ act: 'essayer', arg: 'sapeur', i: '1' });
  check('… le second toucher la lance pour de bon', egal(demandes[demandes.length - 1], ['sapeur', true]));
  const avant = demandes.length;
  toucher({ act: 'essayer', arg: 'pavoisier' });
  check('une troupe déjà débloquée ne s’essaie pas', demandes.length === avant);
  Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true, writable: true });
}

// --- La partie d'essai ---------------------------------------------------------------
{
  console.log('\n--- La partie d’essai ---');
  const base = { seed: 4242, mode: 'express', mapSize: 'small', difficulty: 'normal' };
  const compte = (m, type, joueur) => m.units.filter((u) => !u.dead && u.type === type && u.playerIndex === joueur).length;
  const temoin = new World(base);
  for (const type of NOUVELLES) {
    const w = new World({ ...base, essai: type, troupesInterdites: [[], [type]] });
    check(`essai du ${UNIT_TYPES[type].name} : ${ESSAI_NOMBRE} attendent le joueur, aucun chez l’ordinateur, et leurs places sont offertes`,
      w.essai === type && compte(w, type, 0) === ESSAI_NOMBRE && compte(w, type, 1) === 0
      && w.players[0].pop === temoin.players[0].pop + ESSAI_NOMBRE && w.players[0].popCap === temoin.players[0].popCap + ESSAI_NOMBRE
      && w.players[1].pop === temoin.players[1].pop && w.players[1].popCap === temoin.players[1].popCap,
      `${w.players[0].pop} sur ${w.players[0].popCap}`);
  }
  const hydres = new World({ ...base, essai: 'hydra' });
  check('une troupe qui occupe trois places en offre neuf', hydres.players[0].popCap === temoin.players[0].popCap + 3 * ESSAI_NOMBRE && compte(hydres, 'hydra', 0) === ESSAI_NOMBRE);
  check('ni l’ouvrier ni un type inconnu ne s’essaient : la partie est une partie ordinaire',
    ['villager', 'licorne', 7, null].every((t) => { const w = new World({ ...base, essai: t }); return w.essai === null && w.units.length === temoin.units.length && w.players[0].popCap === temoin.players[0].popCap; }));
  const essai = new World({ ...base, essai: 'sapeur' });
  advance(essai, 20);
  const image = JSON.parse(JSON.stringify(serializeWorld(essai)));
  const repris = restoreWorld(image);
  check('la sauvegarde garde la troupe essayée, ses soldats et ses places offertes',
    image.essai === 'sapeur' && !!repris && repris.essai === 'sapeur' && compte(repris, 'sapeur', 0) === compte(essai, 'sapeur', 0)
    && repris.players[0].popCap === essai.players[0].popCap);
  check('… et une partie ordinaire ne porte pas ce champ', !('essai' in serializeWorld(temoin)));
}

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
