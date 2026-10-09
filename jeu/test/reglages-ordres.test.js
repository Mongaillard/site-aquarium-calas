// Réglages « ordres » (tour de table du 04/10/2026, point 2) : un appui au sol
// fait toujours reculer, on riposte quand on tape un bâtiment, on répare et on
// soigne au doigt. Sans navigateur, comme simulation.test.js.
// Lancement : node test/reglages-ordres.test.js

import { World } from '../js/game.js';
import { serializeWorld, restoreWorld } from '../js/save.js';
import { TICKS_PER_SECOND, TILE, nomDe } from '../js/config.js';
import { dist, clamp } from '../js/utils.js';
import { STATE } from '../js/entities.js';
import { readFileSync } from 'node:fs';

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

/**
 * Une clairière nue au milieu d'une carte moyenne, loin des deux bases : sans
 * IA, sans bêtes (un cerf sous le point visé change l'ordre en chasse), et les
 * unités de départ rendues inoffensives.
 */
function arene(seed = 7) {
  const w = new World({ seed, mapSize: 'medium', difficulty: 'normal' });
  w.ais = [];
  w.players[0].resources = { food: 5000, wood: 5000, gold: 5000 };
  for (const a of w.units.filter((u) => u.isAnimal)) {
    a.dead = true;
    w.byId.delete(a.id);
    w.units.splice(w.units.indexOf(a), 1);
    w.entities.splice(w.entities.indexOf(a), 1);
  }
  for (const u of w.units) u.stance = 'passive';
  const c = Math.floor(w.map.w / 2);
  w.map.clearArea(c, c, 18);
  return { w, c, cx: c * TILE + TILE / 2, cy: c * TILE + TILE / 2 };
}

/** n unités du même type, en colonne autour de (x, y). */
function colonne(w, joueur, type, n, x, y) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(w.spawnUnit(joueur, type, x, y + (i - (n - 1) / 2) * TILE * 1.1));
  return out;
}

const vivants = (unites) => unites.filter((u) => !u.dead);
const cases = (d) => (d / TILE).toFixed(1);

console.log('=== Réglages « ordres » ===\n');

// ---------------------------------------------------------------------------
// 1. Un appui au sol fait toujours reculer
// ---------------------------------------------------------------------------
console.log('— Un appui au sol fait toujours reculer');

/** Six miliciens en mêlée contre six, puis l'ordre de marche 14 cases derrière eux. */
function repli(attitude) {
  const { w, cx, cy } = arene(21);
  const miens = colonne(w, 0, 'militia', 6, cx - TILE * 1.5, cy);
  colonne(w, 1, 'militia', 6, cx + TILE * 1.5, cy);
  advance(w, 4);
  const enMelee = miens.filter((u) => u.state === STATE.ATTACK).length;
  w.setStance(vivants(miens), attitude);
  const depart = vivants(miens).map((u) => ({ u, x: u.x }));
  const ordre = w.commandUnits(vivants(miens), cx - TILE * 15.5, cy);
  advance(w, 8);
  const reculs = depart.filter((d) => !d.u.dead).map((d) => (d.x - d.u.x) / TILE);
  return {
    enMelee, ordre: ordre.kind, morts: depart.length - reculs.length,
    recul: reculs.reduce((s, r) => s + r, 0) / Math.max(1, reculs.length),
    retournes: depart.filter((d) => !d.u.dead && d.u.state === STATE.ATTACK).length,
  };
}

{
  const agressif = repli('aggressive');
  const defensif = repli('defensive');
  // Un milicien fait une case par seconde : huit secondes, presque huit cases.
  check('agressif, en pleine mêlée : l’ordre de marche est suivi jusqu’au bout',
    agressif.enMelee === 6 && agressif.ordre === 'move' && agressif.recul >= 7 && agressif.retournes === 0,
    `${agressif.enMelee} en mêlée, recul moyen ${agressif.recul.toFixed(1)} cases en 8 s, ${agressif.morts} mort(s), ${agressif.retournes} retourné(s) au combat`);
  check('agressif : le repli vaut celui d’une troupe en défensif',
    Math.abs(agressif.recul - defensif.recul) < 0.5 && agressif.morts <= defensif.morts,
    `${agressif.recul.toFixed(1)} cases contre ${defensif.recul.toFixed(1)}`);
}

{
  // Un éclaireur envoyé au-delà d'une maison ennemie : il passe, il ne s'arrête
  // pas pour la frapper.
  const { w, c, cx, cy } = arene(23);
  const maison = w.spawnBuilding(1, 'house', c, c - 1, true);
  const eclaireur = w.spawnUnit(0, 'scout', cx - TILE * 10, cy + TILE * 1.5);
  const but = { x: cx + TILE * 7, y: cy + TILE * 1.5 };
  const trajet = dist(eclaireur.x, eclaireur.y, but.x, but.y) / eclaireur.speedPx();
  w.commandUnits([eclaireur], but.x, but.y);
  const arrive = advance(w, trajet * 1.5 + 2, () => dist(eclaireur.x, eclaireur.y, but.x, but.y) < TILE);
  check('un éclaireur passe devant une maison ennemie sans s’y arrêter',
    arrive && maison.hp === maison.maxHp,
    `${arrive ? 'arrivé en ' + w.time.toFixed(1) + ' s' : 'pas arrivé'} (trajet ${trajet.toFixed(1)} s), maison ${Math.round(maison.hp)}/${maison.maxHp}`);
}

{
  // À l'arrivée, l'attitude reprend ses droits.
  const { w, cx, cy } = arene(24);
  const soldat = w.spawnUnit(0, 'militia', cx - TILE * 8, cy);
  const proie = w.spawnUnit(1, 'villager', cx - TILE * 4, cy + TILE * 1.5);
  proie.stance = 'passive';
  const but = { x: cx + TILE * 2, y: cy };
  w.commandUnits([soldat], but.x, but.y);
  let detourne = false;
  const arrive = advance(w, 20, () => {
    if (soldat.state === STATE.ATTACK) detourne = true;
    return dist(soldat.x, soldat.y, but.x, but.y) < TILE * 0.7;
  });
  proie.x = but.x + TILE * 2; proie.y = but.y;   // l'ennemi est maintenant au bout du chemin
  const engage = advance(w, 4, () => soldat.target === proie);
  check('en marche, l’unité agressive ne sort pas du rang', arrive && !detourne && proie.hp === proie.maxHp,
    `${arrive ? 'arrivée' : 'pas arrivée'}${detourne ? ', détournée en route' : ''}`);
  check('à l’arrivée, elle engage de nouveau ce qu’elle voit', engage, soldat.state);
}

{
  // « Attaquer ici » garde son comportement : on engage en chemin, puis on repart.
  const { w, cx, cy } = arene(25);
  const soldats = colonne(w, 0, 'militia', 3, cx - TILE * 8, cy);
  const proie = w.spawnUnit(1, 'villager', cx - TILE * 4, cy + TILE);
  proie.stance = 'passive';
  const but = { x: cx + TILE * 6, y: cy };
  w.formationMove(soldats, but.x, but.y, true);
  const engage = advance(w, 6, () => soldats.some((s) => s.target === proie));
  const abattue = advance(w, 30, () => proie.dead);
  advance(w, 14);
  const arrives = soldats.filter((s) => dist(s.x, s.y, but.x, but.y) < TILE * 2.5).length;
  check('« Attaquer ici » : la troupe engage ce qu’elle croise', engage && abattue,
    `${engage ? 'engagée' : 'pas engagée'}, proie ${abattue ? 'abattue' : 'en vie'}`);
  check('« Attaquer ici » : puis elle reprend sa route', arrives === 3, `${arrives}/3 au but`);
}

{
  // Le retour au poste, lui, n'est pas un ordre de marche : il reste offensif
  // pour une unité agressive, simple marche pour les autres.
  const { w, cx, cy } = arene(26);
  const agressif = w.spawnUnit(0, 'militia', cx, cy);
  const defensif = w.spawnUnit(0, 'militia', cx, cy + TILE * 3);
  defensif.setStance('defensive');
  for (const u of [agressif, defensif]) { u.guardPoint = { x: u.x - TILE * 6, y: u.y }; u.returnToGuard(); }
  check('retour au poste : offensif en agressif, simple marche sinon',
    agressif.state === STATE.ATTACK_MOVE && defensif.state === STATE.MOVE, `${agressif.state} / ${defensif.state}`);
}

// ---------------------------------------------------------------------------
// 2. Riposter quand on tape un bâtiment
// ---------------------------------------------------------------------------
console.log('\n— Riposter quand on tape un bâtiment');

/**
 * `n` miliciens du joueur `camp` occupés sur une maison adverse (qui ne tombera
 * pas : on mesure le combat, pas la démolition), puis `m` miliciens ennemis
 * leur tombent dessus. `designee` : la maison est un ordre, sinon ils l'ont
 * choisie eux-mêmes.
 */
function siege(n, m, { camp = 0, designee = true, attitude = 'aggressive', type = 'militia' } = {}) {
  const { w, c, cx, cy } = arene(31);
  const autre = 1 - camp;
  const maison = w.spawnBuilding(autre, 'house', c, c, true);
  maison.maxHp = 100000; maison.hp = 100000;
  const assiegeants = colonne(w, camp, type, n, cx - TILE * 1.2, cy + TILE);
  if (attitude !== 'aggressive') w.setStance(assiegeants, attitude);
  if (designee) for (const u of assiegeants) u.attackEntity(maison);
  advance(w, 5);
  const surLaMaison = assiegeants.filter((u) => u.state === STATE.ATTACK && u.target === maison).length;
  const secours = colonne(w, autre, 'militia', m, cx - TILE * 6, cy + TILE);
  for (const e of secours) e.attackEntity(assiegeants[0], true);
  // Peu après le premier coup : qui s'est retourné ?
  advance(w, 30, () => assiegeants.some((u) => u.hp < u.maxHp));
  advance(w, 1.5);
  const retournes = vivants(assiegeants).filter((u) => u.target && u.target.kind === 'unit').length;
  advance(w, 60, () => vivants(assiegeants).length === 0 || vivants(secours).length === 0);
  advance(w, 6);
  const restent = vivants(assiegeants);
  return {
    w, maison, assiegeants, secours, surLaMaison, retournes,
    restent: restent.length, ennemis: vivants(secours).length,
    repris: restent.filter((u) => u.state === STATE.ATTACK && u.target === maison).length,
    ordreGarde: restent.every((u) => u.autoTarget === !designee),
  };
}

for (const [n, m] of [[5, 3], [4, 3], [6, 4], [8, 5]]) {
  const r = siege(n, m);
  check(`${n} miliciens sur une maison, ${m} ennemis arrivent : ils gagnent le combat`,
    r.surLaMaison === n && r.ennemis === 0 && r.restent >= n - m,
    `restent ${r.restent} sur ${n}, ${r.ennemis} ennemi(s)`);
  check(`${n} contre ${m} : la menace écartée, ils reprennent la maison — et c’est toujours un ordre`,
    r.restent > 0 && r.repris === r.restent && r.ordreGarde, `${r.repris}/${r.restent} sur la maison`);
}

{
  const r = siege(5, 3, { designee: false });
  check('maison choisie d’eux-mêmes : même riposte, même reprise',
    r.surLaMaison === 5 && r.ennemis === 0 && r.restent >= 2 && r.repris === r.restent && r.ordreGarde,
    `restent ${r.restent} sur 5, ${r.ennemis} ennemi(s), ${r.repris} sur la maison`);
}

{
  const r = siege(5, 3, { camp: 1 });
  check('les troupes de l’adversaire ripostent aussi',
    r.surLaMaison === 5 && r.ennemis === 0 && r.restent >= 2 && r.repris === r.restent,
    `restent ${r.restent} sur 5, ${r.ennemis} assaillant(s) du joueur`);
}

{
  const r = siege(5, 3, { attitude: 'defensive' });
  check('en défensif : ils ripostent', r.retournes >= 1 && r.ennemis === 0 && r.restent >= 2,
    `${r.retournes} retourné(s), restent ${r.restent} sur 5`);
}

for (const [attitude, nom] of [['standGround', 'position tenue'], ['passive', 'sans attaque']]) {
  const r = siege(5, 3, { attitude });
  check(`attitude « ${nom} » : ils restent sur la maison, comme on le leur a dit`,
    r.surLaMaison === 5 && r.retournes === 0 && r.ennemis === 3, `${r.retournes} retourné(s), ${r.ennemis} ennemi(s) en vie`);
}

{
  // Un engin de siège reste à son mur.
  const r = siege(2, 1, { type: 'ram' });
  check('un bélier ne lâche pas son mur pour une troupe', r.surLaMaison === 2 && r.retournes === 0,
    `${r.retournes} retourné(s)`);
}

{
  // Le camarade qui voit frapper son voisin se retourne aussi — sinon ils
  // tombent un à un. Un seul assaillant, un seul homme frappé.
  const { w, c, cx, cy } = arene(32);
  const maison = w.spawnBuilding(1, 'house', c, c, true);
  maison.maxHp = 100000; maison.hp = 100000;
  const miens = colonne(w, 0, 'militia', 4, cx - TILE * 1.2, cy + TILE);
  for (const u of miens) u.attackEntity(maison);
  advance(w, 5);
  const ennemi = w.spawnUnit(1, 'champion', cx - TILE * 5, cy + TILE);
  ennemi.attackEntity(miens[0], true);
  advance(w, 30, () => miens.some((u) => u.hp < u.maxHp));
  advance(w, 0.2);
  const retournes = miens.filter((u) => u.target === ennemi).length;
  check('un seul homme frappé : ses camarades se retournent avec lui', retournes === 4, `${retournes}/4`);
}

/**
 * Siège en anneau : `n` miliciens répartis tout autour d'un bâtiment de trois
 * cases, puis `m` miliciens ennemis arrivent par l'ouest. D'une face à l'autre,
 * les assiégeants sont à plus de cinq cases : hors de vue les uns des autres.
 */
function anneau(n, m, type = 'towncenter') {
  const { w, c } = arene(35);
  const batiment = w.spawnBuilding(1, type, c, c, true);
  batiment.maxHp = 100000; batiment.hp = 100000;
  const rayon = (batiment.size / 2 + 1.5) * TILE;
  const miens = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    miens.push(w.spawnUnit(0, 'militia', batiment.x + Math.cos(a) * rayon, batiment.y + Math.sin(a) * rayon));
  }
  for (const u of miens) u.attackEntity(batiment);
  advance(w, 6);
  const auMur = miens.filter((u) => u.state === STATE.ATTACK && u.target === batiment).length;
  const eux = colonne(w, 1, 'militia', m, batiment.x - (batiment.size / 2 + 7) * TILE, batiment.y);
  for (const e of eux) e.moveTo(batiment.x - (batiment.size / 2 + 1) * TILE, batiment.y, true);
  // Au premier coup reçu : qui s'est retourné, et qui ne voyait pas l'homme frappé ?
  advance(w, 30, () => miens.some((u) => u.hp < u.maxHp));
  const frappe = miens.find((u) => u.hp < u.maxHp);
  const horsDeVue = frappe ? miens.filter((u) => dist(u.x, u.y, frappe.x, frappe.y) > u.def.los * TILE).length : 0;
  const retournes = miens.filter((u) => u.target && u.target.kind === 'unit').length;
  advance(w, 120, () => vivants(miens).length === 0 || vivants(eux).length === 0);
  advance(w, 8);
  const restent = vivants(miens);
  return {
    auMur, horsDeVue, retournes, restent: restent.length, ennemis: vivants(eux).length,
    repris: restent.filter((u) => u.state === STATE.ATTACK && u.target === batiment && !u.reprise).length,
  };
}

{
  const r = anneau(6, 4);
  check('6 miliciens autour d’un Centre-Ville, 4 ennemis arrivent : au premier coup tous se retournent, la face opposée aussi',
    r.auMur === 6 && r.horsDeVue >= 2 && r.retournes === 6,
    `${r.retournes}/6 retournés, dont ${r.horsDeVue} hors de vue de l’homme frappé`);
  check('siège en anneau, 6 contre 4 : ils gagnent, puis reprennent le bâtiment',
    r.ennemis === 0 && r.restent >= 2 && r.repris === r.restent,
    `restent ${r.restent} sur 6, ${r.ennemis} ennemi(s), ${r.repris} au mur`);
}

for (const [n, m, type] of [[4, 3, 'towncenter'], [5, 4, 'temple'], [8, 6, 'barracks']]) {
  const r = anneau(n, m, type);
  check(`siège en anneau (${type}), ${n} contre ${m} : les plus nombreux gagnent`,
    r.auMur === n && r.retournes === n && r.ennemis === 0 && r.restent >= 1,
    `${r.retournes}/${n} retournés, restent ${r.restent}, ${r.ennemis} ennemi(s)`);
}

{
  // Sans placement à la main : deux groupes envoyés par ordre sur un
  // Centre-Ville, l'un par l'ouest, l'autre par l'est, puis six ennemis.
  const { w, c } = arene(36);
  const cv = w.spawnBuilding(1, 'towncenter', c, c, true);
  cv.maxHp = 100000; cv.hp = 100000;
  const miens = [...colonne(w, 0, 'militia', 4, cv.x - TILE * 7, cv.y), ...colonne(w, 0, 'militia', 4, cv.x + TILE * 7, cv.y)];
  const ordre = w.commandUnits(miens, cv.x, cv.y);
  advance(w, 16);
  const auMur = miens.filter((u) => u.state === STATE.ATTACK && u.target === cv && cv.edgeDistanceTo(u.x, u.y) < TILE * 1.5).length;
  const eux = colonne(w, 1, 'militia', 6, cv.x - TILE * 9, cv.y);
  for (const e of eux) e.moveTo(cv.x - TILE * 2.5, cv.y, true);
  advance(w, 150, () => vivants(miens).length === 0 || vivants(eux).length === 0);
  check('deux groupes de 4 sur un Centre-Ville, pris à revers par 6 : ils gagnent',
    ordre.kind === 'attack' && auMur === 8 && vivants(eux).length === 0 && vivants(miens).length >= 2,
    `${auMur}/8 au mur, restent ${vivants(miens).length} sur 8, ${vivants(eux).length} ennemi(s)`);
}

{
  // La règle s'arrête au bâtiment : un soldat occupé sur un AUTRE mur, hors de
  // vue de l'homme frappé, y reste — on ne vide pas tout un front pour un coup.
  const { w, c, cx, cy } = arene(37);
  const maison = w.spawnBuilding(1, 'house', c, c, true);
  const autre = w.spawnBuilding(1, 'house', c + 4, c, true);
  for (const b of [maison, autre]) { b.maxHp = 100000; b.hp = 100000; }
  const miens = colonne(w, 0, 'militia', 2, cx - TILE * 1.2, cy + TILE);
  const ailleurs = w.spawnUnit(0, 'militia', autre.x + TILE * 1.7, autre.y);
  for (const u of miens) u.attackEntity(maison);
  ailleurs.attackEntity(autre);
  advance(w, 5);
  const ennemi = w.spawnUnit(1, 'champion', cx - TILE * 4, cy + TILE);
  ennemi.attackEntity(miens[0], true);
  advance(w, 30, () => miens.some((u) => u.hp < u.maxHp));
  const frappe = miens.find((u) => u.hp < u.maxHp);
  const ecart = frappe ? dist(ailleurs.x, ailleurs.y, frappe.x, frappe.y) / TILE : 0;
  // (Son attitude, elle, le laisserait riposter : c'est bien le bâtiment qui le retient.)
  check('un soldat occupé sur un autre bâtiment, hors de vue, reste à son mur',
    miens.every((u) => u.target === ennemi) && ailleurs.target === autre && !ailleurs.reprise
    && ecart > ailleurs.def.los && ailleurs.peutRiposter(ennemi),
    `à ${ecart.toFixed(1)} cases de l’homme frappé (vue ${ailleurs.def.los})`);
}

{
  // Une riposte ne se laisse pas entraîner : la cible partie trop loin, on
  // retourne au bâtiment (pas à un poste, pas à l'arrêt).
  const { w, c, cx, cy } = arene(33);
  const maison = w.spawnBuilding(1, 'house', c, c, true);
  maison.maxHp = 100000; maison.hp = 100000;
  const soldat = w.spawnUnit(0, 'militia', cx - TILE * 1.2, cy + TILE);
  soldat.attackEntity(maison);
  advance(w, 4);
  const ennemi = w.spawnUnit(1, 'militia', cx - TILE * 3, cy + TILE);
  ennemi.attackEntity(soldat, true);
  const riposte = advance(w, 20, () => soldat.target === ennemi);
  const delaisse = soldat.reprise && soldat.reprise.batiment === maison;
  ennemi.stance = 'passive'; ennemi.stop();
  ennemi.x = soldat.x - TILE * 30;
  const revenu = advance(w, 10, () => soldat.target === maison && soldat.reprise === null);
  check('riposte : le bâtiment est mis de côté, pas oublié', riposte && delaisse);
  check('poursuite bornée : la cible trop lointaine est lâchée pour le bâtiment', revenu,
    `${soldat.state} → ${soldat.target ? soldat.target.type : 'rien'}`);

  // Et un ordre de marche donné en pleine riposte l'emporte sur tout.
  ennemi.x = soldat.x - TILE * 2; ennemi.y = soldat.y;
  ennemi.stance = 'aggressive'; ennemi.attackEntity(soldat, true);
  advance(w, 20, () => soldat.target === ennemi);
  const loin = { x: soldat.x + TILE * 14, y: soldat.y };
  ennemi.stance = 'passive'; ennemi.stop();
  w.commandUnits([soldat], loin.x, loin.y);
  const arrive = advance(w, 30, () => soldat.state === STATE.IDLE);
  advance(w, 3);
  check('un ordre de marche en pleine riposte : suivi, et le bâtiment est oublié',
    arrive && dist(soldat.x, soldat.y, loin.x, loin.y) < TILE * 1.5 && soldat.state === STATE.IDLE,
    `${soldat.state} à ${cases(dist(soldat.x, soldat.y, loin.x, loin.y))} cases du but`);
}

{
  // « Attaquer ici » interrompu par un bâtiment, puis par une riposte : la
  // marche reste due une fois le bâtiment tombé.
  const { w, c, cx, cy } = arene(34);
  const maison = w.spawnBuilding(1, 'house', c, c, true);
  const soldat = w.spawnUnit(0, 'militia', cx - TILE * 5, cy + TILE * 0.5);
  const but = { x: cx + TILE * 9, y: cy + TILE * 0.5 };
  soldat.moveTo(but.x, but.y, true);
  const surMaison = advance(w, 20, () => soldat.state === STATE.ATTACK && soldat.target === maison
    && maison.edgeDistanceTo(soldat.x, soldat.y) < TILE * 1.5);
  const ennemi = w.spawnUnit(1, 'villager', soldat.x - TILE * 1.5, soldat.y);
  ennemi.stance = 'aggressive';
  ennemi.attackEntity(soldat);
  const riposte = advance(w, 10, () => soldat.target === ennemi);
  const abattu = advance(w, 40, () => ennemi.dead);
  advance(w, 0.5);
  const repris = soldat.target === maison;
  maison.hp = 3;
  advance(w, 20, () => maison.dead);
  const arrive = advance(w, 30, () => dist(soldat.x, soldat.y, but.x, but.y) < TILE * 1.5);
  check('riposte en cours d’« Attaquer ici » : le bâtiment est repris', surMaison && riposte && abattu && repris,
    `${surMaison ? '' : 'pas sur la maison, '}${riposte ? '' : 'pas de riposte, '}${soldat.state}`);
  check('puis la marche interrompue reprend jusqu’au but', maison.dead && arrive,
    `à ${cases(dist(soldat.x, soldat.y, but.x, but.y))} cases du but`);
}

{
  // La sauvegarde garde la riposte en cours : la partie reprise rejoue la même suite.
  const empreinte = (w) => w.units.filter((u) => !u.isAnimal).map((u) =>
    `${u.id}:${u.x.toFixed(3)},${u.y.toFixed(3)},${u.hp},${u.state},${u.target ? u.target.id : '-'}`).join('|');
  const r0 = (() => {
    const { w, c, cx, cy } = arene(31);
    const maison = w.spawnBuilding(1, 'house', c, c, true);
    maison.maxHp = 100000; maison.hp = 100000;
    const miens = colonne(w, 0, 'militia', 5, cx - TILE * 1.2, cy + TILE);
    for (const u of miens) u.attackEntity(maison);
    advance(w, 5);
    const eux = colonne(w, 1, 'militia', 3, cx - TILE * 6, cy + TILE);
    for (const e of eux) e.attackEntity(miens[0], true);
    advance(w, 30, () => miens.filter((u) => u.reprise).length >= 3);
    return { w, maison, miens };
  })();
  const enRiposte = r0.miens.filter((u) => u.reprise).length;
  const copie = JSON.parse(JSON.stringify(serializeWorld(r0.w)));
  const repris = restoreWorld(copie);
  const gardes = repris.units.filter((u) => u.reprise && u.reprise.batiment === repris.byId.get(r0.maison.id)).length;
  advance(r0.w, 40); advance(repris, 40);
  check('sauvegarde en pleine riposte : le bâtiment délaissé est gardé', enRiposte >= 3 && gardes === enRiposte,
    `${gardes}/${enRiposte}`);
  check('la partie reprise rejoue la même suite', empreinte(r0.w) === empreinte(repris));

  // Une sauvegarde d'avant ce réglage n'a pas le champ : elle se reprend sans riposte en cours.
  for (const u of copie.units) delete u.reprise;
  let ancienne = null, erreur = '';
  try { ancienne = restoreWorld(copie); advance(ancienne, 5); } catch (e) { erreur = e.message; }
  check('une sauvegarde sans ce champ se reprend quand même',
    !!ancienne && ancienne.units.every((u) => u.reprise === null), erreur);
}

// ---------------------------------------------------------------------------
// 3. Réparer et soigner au doigt
// ---------------------------------------------------------------------------
console.log('\n— Réparer et soigner au doigt');

{
  const { w, c, cx, cy } = arene(41);
  const maison = w.spawnBuilding(0, 'house', c, c, true);
  const chantier = w.spawnBuilding(0, 'house', c + 4, c, false);
  const ferme = w.spawnBuilding(0, 'farm', c - 5, c, true);
  const adverse = w.spawnBuilding(1, 'house', c, c + 5, true);
  const ouvriers = colonne(w, 0, 'villager', 2, cx - TILE * 4, cy + TILE * 3);
  const soldat = w.spawnUnit(0, 'militia', cx - TILE * 6, cy + TILE * 3);
  soldat.stance = 'passive';

  check('bâtiment intact : l’appui sélectionne', w.ordreSurAllie(ouvriers, maison) === null);
  maison.hp = maison.maxHp * 0.4; chantier.hp = 1; ferme.hp = ferme.maxHp * 0.5; adverse.hp = adverse.maxHp * 0.5;
  check('ouvriers en main + bâtiment achevé et abîmé : réparation', w.ordreSurAllie(ouvriers, maison) === 'repair');
  check('un soldat dans le groupe ne change rien', w.ordreSurAllie([soldat, ...ouvriers], maison) === 'repair');
  check('des soldats seuls : l’appui sélectionne', w.ordreSurAllie([soldat], maison) === null);
  check('chantier, ferme, bâtiment adverse : ce n’est pas cette règle',
    w.ordreSurAllie(ouvriers, chantier) === null && w.ordreSurAllie(ouvriers, ferme) === null
    && w.ordreSurAllie(ouvriers, adverse) === null);

  // Un ennemi collé au mur : d'après le seul point touché, l'ordre viserait
  // l'ennemi (vue dézoomée : la tolérance du doigt monte à 40 px). La cible
  // reconnue par l'interface l'emporte.
  const rodeur = w.spawnUnit(1, 'militia', maison.x + TILE * 1.3, maison.y);
  rodeur.stance = 'passive';
  const auPoint = w.commandUnits(ouvriers, maison.x, maison.y, { tolerance: 40 });
  for (const v of ouvriers) v.stop();
  const ordre = w.commandUnits(ouvriers, maison.x, maison.y, { tolerance: 40, cible: maison });
  check('la cible désignée par l’interface passe avant ce qui traîne autour du point',
    auPoint.kind === 'attack' && ordre.kind === 'repair' && ordre.workers === 2, `${auPoint.kind} → ${ordre.kind}`);
  const pv = maison.hp;
  const auTravail = advance(w, 20, () => maison.hp > pv);
  advance(w, 5);
  check('les ouvriers réparent : le bâtiment remonte',
    auTravail && maison.hp > pv && ouvriers.every((v) => v.state === STATE.BUILD && v.target === maison),
    `${Math.round(pv)} → ${Math.round(maison.hp)} / ${maison.maxHp}`);
}

{
  const { w, cx, cy } = arene(42);
  const pretresse = w.spawnUnit(0, 'priest', cx - TILE * 4, cy);
  const seconde = w.spawnUnit(0, 'priest', cx - TILE * 4, cy + TILE * 2);
  const blesse = w.spawnUnit(0, 'militia', cx + TILE * 5, cy);
  const soldat = w.spawnUnit(0, 'militia', cx - TILE * 6, cy);
  const ennemi = w.spawnUnit(1, 'militia', cx + TILE * 5, cy + TILE * 6);
  // On mesure l'ordre, pas l'initiative : personne ne bouge de soi-même.
  for (const u of [pretresse, seconde, blesse, soldat, ennemi]) u.stance = 'passive';

  check('allié indemne : l’appui sélectionne', w.ordreSurAllie([pretresse], blesse) === null);
  blesse.hp = 10; ennemi.hp = 10; seconde.hp = 12;
  check('Prêtresse en main + allié blessé : soin', w.ordreSurAllie([pretresse], blesse) === 'heal');
  check('Prêtresse et soldat en main : l’appui sélectionne (on choisit sa troupe dans la mêlée)',
    w.ordreSurAllie([pretresse, soldat], blesse) === null);
  check('un ennemi blessé ne se soigne pas', w.ordreSurAllie([pretresse], ennemi) === null);
  check('une Prêtresse ne se soigne pas elle-même, une autre le peut',
    w.ordreSurAllie([seconde], seconde) === null && w.ordreSurAllie([pretresse, seconde], seconde) === 'heal');

  const ordre = w.commandUnits([pretresse], blesse.x, blesse.y, { cible: blesse });
  const soigne = advance(w, 30, () => blesse.hp > 10);
  check('l’ordre de soin part et le blessé remonte', ordre.kind === 'heal' && soigne && pretresse.target === blesse,
    `${ordre.kind}, ${blesse.hp}/${blesse.maxHp} PV`);
}

{
  // Le texte du toucher (js/main.js) : il passe par la règle et transmet la
  // cible reconnue sous le doigt.
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  check('le toucher applique la règle, sauf au double appui',
    /isDouble \? null : this\.world\.ordreSurAllie\(ownUnits, entity\)/.test(main));
  check('le toucher transmet la cible à l’ordre',
    /this\.issueOrder\(entity\.x, entity\.y, entity\)/.test(main)
    && /commandUnits\(units, worldX, worldY, \{[^}]*\bcible\b[^}]*\}\)/.test(main));
}

/**
 * Le toucher lui-même. js/main.js ne s'importe pas sous node — il s'adresse au
 * navigateur dès son chargement — : on en extrait le texte de quelques méthodes
 * et on les joue sur un faux écran, un vrai monde derrière une interface
 * muette. Si tapAt se met à appeler une méthode ou un import de plus, le banc
 * s'arrête en le nommant : il suffit de l'ajouter ici.
 */
function fauxEcran(w, zoom) {
  const source = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const methode = (nom) => {
    const debut = new RegExp(`\\n  ${nom}\\([^)]*\\) \\{`).exec(source);
    if (!debut) throw new Error(`méthode ${nom} introuvable dans js/main.js`);
    let i = debut.index + debut[0].length;
    for (let ouvertes = 1; ouvertes > 0 && i < source.length; i++) {
      if (source[i] === '{') ouvertes++; else if (source[i] === '}') ouvertes--;
    }
    return source.slice(debut.index + 1, i);
  };
  const vraies = ['tapAt', 'issueOrder', 'devantSousLeDoigt', 'tapTolerance', 'setSelection', 'pingOrder'];
  const Ecran = new Function('nomDe', 'clamp', 'spriteDe', 'TILE',
    `return class { ${vraies.map(methode).join('\n')} }`)(nomDe, clamp, () => null, TILE);
  const g = new Ecran();
  return Object.assign(g, {
    world: w, civ: w.players[w.humanIndex].civ, selection: [], messages: [],
    rallyArmed: false, attackMoveArmed: false, garrisonArmed: false, gestesDits: new Set(),
    camera: { zoom, screenToWorld: (x, y) => ({ x, y }) },
    renderer: { isEntityVisible: () => true },
    ui: { toast: (texte) => g.messages.push(texte), refreshSelection() {}, setBuildHint() {} },
    audio: { resume() {}, play() {} },
    vibrate() {},
    batimentIllustreSous: () => null,   // pas d'images sous node
    selectSameTypeOnScreen: (e) => g.setSelection([e]),
    ouvrier: (n = 1) => nomDe('villager', g.civ, n).toLowerCase(),
  });
}

{
  const cercles = (w) => w.effects.filter((e) => e.kind === 'ping').map((e) => e.color).join();
  /**
   * Une Prêtresse et un soldat à l'écart ; un Champion blessé au contact d'un
   * Champion ennemi — à 44 px, l'écart mesuré entre deux Champions en mêlée.
   * C'est là que le soin sert le plus, et l'ennemi entre dans la tolérance du
   * doigt dès qu'on dézoome : il captait l'appui, la Prêtresse marchait vers lui.
   */
  const melee = (zoom) => {
    const { w, cx, cy } = arene(44);
    const g = fauxEcran(w, zoom);
    const pretresse = w.spawnUnit(0, 'priest', cx - TILE * 6, cy);
    const blesse = w.spawnUnit(0, 'champion', cx, cy);
    const ennemi = w.spawnUnit(1, 'champion', cx + TILE * 2, cy);
    const soldat = w.spawnUnit(0, 'militia', cx - TILE * 6, cy + TILE * 2);
    for (const u of [pretresse, blesse, ennemi, soldat]) u.stance = 'passive';
    blesse.hp = 40;
    ennemi.x = blesse.x + 44;
    return { g, w, pretresse, blesse, ennemi, soldat };
  };
  let panne = '';
  try {
    // [zoom, décalage du doigt vers l'ennemi] — 2/3 est le zoom de départ d'un
    // téléphone. À chacun de ces appuis, l'ennemi est dans la tolérance du doigt.
    const soins = [[2 / 3, 4], [2 / 3, 12], [0.5, 0], [0.5, 20], [0.4, 30]].map(([zoom, dx]) => {
      const { g, w, pretresse, blesse, ennemi } = melee(zoom);
      g.setSelection([pretresse]);
      const piege = w.enemyAt(blesse.x + dx, blesse.y, 0, g.tapTolerance()) === ennemi;
      g.tapAt(blesse.x + dx, blesse.y, false);
      const soin = pretresse.state === STATE.ATTACK && pretresse.target === blesse && g.selection[0] === pretresse
        && cercles(w) === '#8ff0c0' && g.messages.length === 1;
      return { piege, soin, texte: `zoom ${zoom.toFixed(2)} +${dx} px : ${soin ? 'soin' : pretresse.state}` };
    });
    check('toucher, en mêlée : la Prêtresse seule soigne le blessé, l’ennemi au contact ne capte pas l’appui',
      soins.every((r) => r.piege && r.soin), soins.map((r) => r.texte).join(', '));

    {
      const { g, pretresse, blesse } = melee(0.5);
      g.setSelection([pretresse]);
      g.tapAt(blesse.x + 4, blesse.y, false);
      g.tapAt(blesse.x + 4, blesse.y, true);
      check('toucher, en mêlée : le double tap sélectionne le blessé, la Prêtresse garde son ordre',
        g.selection.length === 1 && g.selection[0] === blesse && pretresse.target === blesse,
        `sélection ${g.selection.map((e) => e.type)}, Prêtresse ${pretresse.state}`);
    }
    {
      const { g, w, pretresse, blesse, ennemi, soldat } = melee(0.5);
      g.setSelection([pretresse, soldat]);
      g.tapAt(blesse.x + 4, blesse.y, false);
      check('toucher, en mêlée : avec un soldat dans le groupe, c’est l’ennemi qu’on attaque, comme avant',
        soldat.target === ennemi && cercles(w) === '#ff6b6b' && g.selection.length === 2,
        `soldat ${soldat.state}, cercle ${cercles(w)}`);
    }
    {
      const { g, w, pretresse, blesse, ennemi } = melee(0.5);
      ennemi.x = blesse.x + TILE * 4;
      g.setSelection([pretresse]);
      g.tapAt(ennemi.x, ennemi.y, false);
      check('toucher : sans blessé sous le doigt, la Prêtresse suit l’ordre vers l’ennemi, comme avant',
        pretresse.state === STATE.MOVE && !pretresse.target && cercles(w) === '#ff6b6b' && g.messages.length === 0,
        `${pretresse.state}, cercle ${cercles(w)}`);
    }
    {
      // Et la réparation, par le même chemin : un ouvrier, une maison abîmée.
      const { w, c } = arene(45);
      const g = fauxEcran(w, 2 / 3);
      const maison = w.spawnBuilding(0, 'house', c, c, true);
      maison.hp = maison.maxHp * 0.4;
      const ouvrier = w.spawnUnit(0, 'villager', maison.x - TILE * 4, maison.y);
      g.setSelection([ouvrier]);
      g.tapAt(maison.x, maison.y, false);
      check('toucher : un ouvrier en main, l’appui sur un bâtiment abîmé le répare et garde la sélection',
        ouvrier.state === STATE.BUILD && ouvrier.target === maison && g.selection[0] === ouvrier
        && cercles(w) === '#8ecae6' && g.messages.some((m) => /[Dd]ouble tap/.test(m)),
        `${ouvrier.state}, cercle ${cercles(w)}, ${g.messages.length} message(s)`);
      g.tapAt(maison.x, maison.y, true);
      check('toucher : le double tap sélectionne le bâtiment', g.selection.length === 1 && g.selection[0] === maison);
    }
  } catch (e) {
    panne = e.message;
  }
  check('le faux écran a pu jouer le toucher de js/main.js', panne === '', panne);
}

console.log(`\n${failures === 0 ? '✅ Tous les tests passent' : '❌ ' + failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
