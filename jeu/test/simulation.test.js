// Test de simulation sans navigateur : deux IA s'affrontent, on vérifie que
// l'économie tourne, que les bâtiments sortent et que rien n'explose.
// Lancement : node jeu/test/simulation.test.js

import { World } from '../js/game.js';
import { AIPlayer } from '../js/ai.js';
import { serializeWorld, restoreWorld } from '../js/save.js';
import { DIFFICULTIES, TICKS_PER_SECOND, TILE } from '../js/config.js';
import { formatTime, dist, RNG } from '../js/utils.js';
import { STATE, Projectile } from '../js/entities.js';
import { readFileSync } from 'node:fs';
import { TERRAIN, BLOCK } from '../js/map.js';
import { planterRivage, planterCampagne, planterDecor, plansDEau, hacher, MARE_MAX, CUITES } from '../js/decor.js';

const DT = 1 / TICKS_PER_SECOND;
let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? '  ok  ' : ' FAIL ';
  if (!condition) failures++;
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

function runMatch({ seed, mapSize, difficulty, minutes }) {
  const world = new World({ seed, mapSize, difficulty });
  // On confie aussi le joueur humain à une IA pour que la partie se joue seule.
  // Un camp piloté par l'IA récolte comme l'IA : réaffectation automatique
  // comprise (le mode manuel du joueur est testé séparément plus bas).
  world.players[0].autoWorkers = true;
  world.ais.push(new AIPlayer(world, 0, DIFFICULTIES[difficulty]));
  const ticks = Math.round(minutes * 60 * TICKS_PER_SECOND);
  const started = Date.now();
  let combats = 0;
  for (let i = 0; i < ticks; i++) {
    world.update(DT);
    for (const ev of world.drainEvents()) if (ev.type === 'destroyed') combats++;
    if (world.gameOver) break;
  }
  return { world, elapsed: Date.now() - started, combats, ticks };
}

console.log('=== Simulation headless ===\n');

const { world, elapsed, combats } = runMatch({
  seed: 12345, mapSize: 'medium', difficulty: 'normal', minutes: 16,
});

const [p0, p1] = world.players;
const report = (p) => {
  const units = world.units.filter((u) => u.playerIndex === p.index);
  const villagers = units.filter((u) => u.isVillager).length;
  const buildings = world.buildings.filter((b) => b.playerIndex === p.index);
  console.log(
    `  Joueur ${p.index} · âge ${p.age + 1} · pop ${p.pop}/${p.popCap} · ` +
    `${villagers} villageois, ${units.length - villagers} soldats, ${buildings.length} bâtiments`);
  console.log(
    `    récolté : 🍖 ${Math.round(p.stats.gathered.food)}  🪵 ${Math.round(p.stats.gathered.wood)}  ` +
    `🪙 ${Math.round(p.stats.gathered.gold)} · formés ${p.stats.trained} · perdus ${p.stats.lost}`);
  return { villagers, units, buildings };
};

console.log(`Temps simulé : ${formatTime(world.time)} en ${elapsed} ms (${Math.round(world.time / (elapsed / 1000))}x temps réel)`);
const r0 = report(p0);
const r1 = report(p1);
console.log(`Chemins calculés : ${world.pathfinder.searches} · destructions : ${combats}\n`);

check('la simulation avance', world.time > 60, formatTime(world.time));
check('performance correcte', elapsed < 30000, elapsed + ' ms pour 16 min de jeu');
for (const p of world.players) {
  const total = p.stats.gathered.food + p.stats.gathered.wood + p.stats.gathered.gold;
  check(`joueur ${p.index} récolte`, total > 1500, Math.round(total) + ' ressources');
  check(`joueur ${p.index} produit des villageois`, p.stats.trained >= 8, p.stats.trained + ' unités formées');
  check(`joueur ${p.index} construit`, p.stats.built >= 3, p.stats.built + ' bâtiments posés');
  // Sur une carte moyenne les razzias commencent tôt : le camp harcelé peut
  // légitimement rester à l'Âge Sombre. On exige donc progression OU combat.
  check(`joueur ${p.index} progresse ou se défend`, p.age >= 1 || p.stats.lost >= 3,
    'âge ' + (p.age + 1) + ', ' + p.stats.lost + ' unités perdues');
}
check('au moins un camp atteint l’Âge Féodal', world.players.some((p) => p.age >= 1));
check('des villageois travaillent encore', r0.villagers > 0 && r1.villagers > 0);
check('des combats ont eu lieu', combats > 0, combats + ' entités détruites');
check('aucune entité fantôme', world.entities.every((e) => !e.dead));
check('population cohérente', world.players.every((p) => p.pop === world.units.filter((u) => u.playerIndex === p.index && !u.isAnimal).length));

// Partie « économique » : sur une grande carte, les bases sont assez éloignées
// pour que les deux camps puissent développer leur économie sans être razziés.
const eco = runMatch({ seed: 2024, mapSize: 'large', difficulty: 'normal', minutes: 13 });
for (const p of eco.world.players) {
  const g = p.stats.gathered;
  check(`économie : joueur ${p.index} atteint l’Âge Féodal`, p.age >= 1, 'âge ' + (p.age + 1));
  check(`économie : joueur ${p.index} récolte les 3 ressources`,
    g.food > 600 && g.wood > 600 && g.gold > 150,
    `🍖${Math.round(g.food)} 🪵${Math.round(g.wood)} 🪙${Math.round(g.gold)}`);
  // Un chômage passager est normal (villageois qui sortent d'un abri, gisement
  // épuisé…) : ce qu'on traque, c'est une inactivité qui dure. On observe donc
  // le minimum sur une fenêtre de quelques secondes.
  let minIdle = Infinity;
  for (let i = 0; i < 12 * TICKS_PER_SECOND; i++) {
    eco.world.update(DT);
    if (i % TICKS_PER_SECOND !== 0) continue;
    const idle = eco.world.units.filter(
      (u) => u.playerIndex === p.index && u.isVillager && u.state === 'idle' && !u.garrisonedIn).length;
    if (idle < minIdle) minIdle = idle;
  }
  check(`économie : joueur ${p.index} garde ses villageois occupés`, minIdle <= 2,
    minIdle + ' inactifs au plus bas sur 12 s');
}

// Troisième partie, carte et difficulté différentes : on vérifie la robustesse.
const alt = runMatch({ seed: 777, mapSize: 'small', difficulty: 'hard', minutes: 6 });
check('seconde partie stable', alt.world.time > 60, formatTime(alt.world.time));
check('carte connectée (pas de blocage total)', alt.world.pathfinder.searches > 50,
  alt.world.pathfinder.searches + ' recherches');

// --- Affectation manuelle des ouvriers --------------------------------------
// Par défaut le joueur affecte lui-même ses villageois : quand un gisement
// s'épuise, l'ouvrier livre son chargement puis attend les ordres.
{
  const world = new World({ seed: 5, mapSize: 'small', difficulty: 'normal' });
  const player = world.players[0];
  check('affectation manuelle par défaut', player.autoWorkers === false);
  check('l’IA garde la réaffectation automatique', world.players[1].autoWorkers === true);

  const villager = world.units.find((u) => u.playerIndex === 0 && u.isVillager);
  const tc = world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  // On place l'ouvrier sur un arbre presque vide, juste à côté du Centre-Ville.
  const tree = [...world.map.resources.values()]
    .filter((r) => r.type === 'wood')
    .sort((a, b) => (a.tx * TILE - tc.x) ** 2 + (a.ty * TILE - tc.y) ** 2
      - ((b.tx * TILE - tc.x) ** 2 + (b.ty * TILE - tc.y) ** 2))[0];
  // On l'isole : sans bois à proximité, il n'y a pas d'enchaînement possible
  // et c'est bien au joueur de réaffecter l'ouvrier.
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (dx === 0 && dy === 0) continue;
      const other = world.map.resourceAt(tree.tx + dx, tree.ty + dy);
      if (other && other.type === 'wood') world.map.harvest(tree.tx + dx, tree.ty + dy, 1e9);
    }
  }
  tree.amount = 6;
  villager.x = tree.tx * TILE + TILE * 1.2;
  villager.y = tree.ty * TILE + TILE / 2;
  villager.gatherAt(tree.tx, tree.ty);

  let sawIdleEvent = false;
  for (let i = 0; i < 90 * TICKS_PER_SECOND && villager.state !== 'idle'; i++) {
    world.update(DT);
    for (const ev of world.drainEvents()) if (ev.type === 'idleWorker') sawIdleEvent = true;
  }
  check('l’ouvrier s’arrête quand le gisement est épuisé', villager.state === 'idle', villager.state);
  check('le joueur est prévenu du villageois sans travail', sawIdleEvent);
  check('le chargement a bien été livré', villager.carry.amount < 1 && player.stats.gathered.wood > 0,
    Math.round(player.stats.gathered.wood) + ' bois rapportés');
  check('l’arbre épuisé a disparu', !world.map.resourceAt(tree.tx, tree.ty));

  // Avec l'automatisme, le même villageois repart de lui-même sur un autre arbre.
  player.autoWorkers = true;
  const second = [...world.map.resources.values()].find((r) => r.type === 'wood');
  second.amount = 5;
  villager.gatherAt(second.tx, second.ty);
  for (let i = 0; i < 120 * TICKS_PER_SECOND; i++) {
    world.update(DT);
    if (villager.resourceTile && villager.resourceTile.tx !== second.tx) break;
  }
  check('avec l’automatisme, l’ouvrier enchaîne tout seul',
    villager.state !== 'idle' || villager.carry.amount > 0, villager.state);
}

// --- Le décor des rivages ------------------------------------------------------
// Rochers, galets, touffes, roseaux et nénuphars se déduisent de la carte, sans
// toucher à la simulation : chaque pièce debout tient sur une case de terre au
// bord de l'eau, un nénuphar sur l'eau, rien sur un arbre ; même graine, même
// décor ; une mare a ses roseaux, un lac n'en a pas.
{
  const world = new World({ seed: 11, mapSize: 'small', difficulty: 'normal' });
  const map = world.map;
  const decor = planterRivage(map);
  const eau = (x, y) => map.inBounds(x, y) && map.terrain[y * map.w + x] === TERRAIN.WATER;
  const bordEau = (tx, ty) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && eau(tx + dx, ty + dy)) return true;
    return false;
  };
  const debout = decor.debout.flat(), plats = decor.cuits.flat(), toutes = [...debout, ...plats];
  check('le rivage est décoré', decor.total > 100 && toutes.length === decor.total, decor.total + ' pièces');
  check('chaque pièce du rivage tient sur la terre au bord de l’eau — ou flotte', toutes.length > 0 && toutes.every((d) => eau(d.tx, d.ty) ? d.piece.classe === 'nenuphar' : bordEau(d.tx, d.ty)), toutes.length + ' pièces');
  const nenuphars = plats.filter((d) => d.piece.classe === 'nenuphar');
  check('les nénuphars flottent sur l’eau', nenuphars.length > 0 && nenuphars.every((d) => eau(d.tx, d.ty)), nenuphars.length + ' nénuphars');
  check('rien sur un arbre ni un buisson', toutes.every((d) => eau(d.tx, d.ty) || !map.resources.has(d.ty * map.w + d.tx)));
  let bienRange = true;
  decor.debout.forEach((liste, ty) => { for (const d of liste) if (Math.max(0, Math.min(map.h - 1, Math.floor(d.y / TILE))) !== ty) bienRange = false; });
  check('chaque pièce debout est rangée sur la ligne de son pied', bienRange);
  const corps = plansDEau(map);
  const tailles = new Set();
  for (let i = 0; i < corps.length; i++) if (corps[i] > 0) tailles.add(corps[i]);
  const mares = [...tailles].filter((t) => t <= MARE_MAX).length;
  const roseaux = debout.filter((d) => d.piece.classe === 'roseau').length;
  check('chaque case d’eau connaît la taille de son plan d’eau', [...corps].every((c, i) => (map.terrain[i] === TERRAIN.WATER) === (c > 0)));
  check('une mare a ses roseaux, un lac n’en a pas', mares > 0 ? roseaux > 0 : roseaux === 0, `${mares} mare(s), ${roseaux} roseaux`);
  const cle = (d) => JSON.stringify([...d.debout.flat(), ...d.cuits.flat()].map((p) => [p.tx, p.ty, p.piece.nom, Math.round(p.x * 100), Math.round(p.y * 100), p.miroir, Math.round(p.echelle * 1000)]));
  check('même carte, même décor', cle(planterRivage(map)) === cle(decor));
  const autre = planterRivage(new World({ seed: 12, mapSize: 'small', difficulty: 'normal' }).map);
  check('une autre graine, un autre décor', cle(autre) !== cle(decor));
  const h = hacher(3, 4, 5, 6);
  check('le hachage est stable et borné', h === hacher(3, 4, 5, 6) && h >= 0 && h < 1 && h !== hacher(3, 4, 5, 7) && h !== hacher(4, 3, 5, 6));

  // La campagne : le reste de la carte, selon le sol.
  const campagne = planterCampagne(map);
  const cDebout = campagne.debout.flat(), cPlats = campagne.cuits.flat(), cToutes = [...cDebout, ...cPlats];
  const terre = (d) => map.terrain[d.ty * map.w + d.tx];
  const pre = (d) => terre(d) === TERRAIN.GRASS || terre(d) === TERRAIN.GRASS_DARK;
  check('la campagne est décorée', campagne.total > 200 && cToutes.length === campagne.total, campagne.total + ' pièces');
  check('rien dans l’eau, rien au bord de l’eau, rien sur une ressource', cToutes.every((d) => !eau(d.tx, d.ty) && !bordEau(d.tx, d.ty) && !map.resources.has(d.ty * map.w + d.tx)));
  check('ni roseau ni nénuphar hors des rivages', cToutes.every((d) => d.piece.classe !== 'roseau' && d.piece.classe !== 'nenuphar'));
  const foret = (d) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = map.resources.get((d.ty + dy) * map.w + d.tx + dx); if (q && q.type === 'wood') return true; } return false; };
  check('fleurs et herbe verte poussent sur les prés ; les buissons aussi, ou au pied d’une forêt', cToutes.filter((d) => d.piece.classe.startsWith('fleur') || d.piece.classe === 'herbe').every(pre)
    && cToutes.filter((d) => d.piece.classe === 'buisson').every((d) => pre(d) || foret(d))
    && cToutes.some((d) => d.piece.classe === 'buisson') && cToutes.some((d) => d.piece.classe.startsWith('fleur')),
    `${cToutes.filter((d) => d.piece.classe === 'buisson').length} buissons, ${cToutes.filter((d) => d.piece.classe.startsWith('fleur')).length} fleurs`);
  check('les touffes sèches poussent sur la terre et le sable', cToutes.filter((d) => d.piece.classe === 'touffe').every((d) => !pre(d)) && cToutes.some((d) => d.piece.classe === 'touffe'));
  check('agaves et pampas aussi', cToutes.filter((d) => d.piece.classe === 'agave' || d.piece.classe === 'pampa').every((d) => !pre(d)) && cToutes.some((d) => d.piece.classe === 'agave'),
    `${cToutes.filter((d) => d.piece.classe === 'agave').length} agaves, ${cToutes.filter((d) => d.piece.classe === 'pampa').length} pampas`);
  check('les fougères poussent au pied des forêts', cToutes.filter((d) => d.piece.classe === 'fougere').every(foret) && cToutes.some((d) => d.piece.classe === 'fougere'),
    cToutes.filter((d) => d.piece.classe === 'fougere').length + ' fougères');
  check('le couvre-sol pousse sur les prés ou au pied des forêts', cToutes.filter((d) => d.piece.classe === 'couvre').every((d) => pre(d) || foret(d)) && cToutes.some((d) => d.piece.classe === 'couvre'));
  check('cuit dans le sol ou debout, selon la classe', cPlats.every((d) => CUITES.has(d.piece.classe)) && cDebout.every((d) => !CUITES.has(d.piece.classe)));
  const tout = planterDecor(map);
  check('le décor complet est la somme du rivage et de la campagne', tout.total === decor.total + campagne.total && tout.rivage === decor.total && tout.campagne === campagne.total
    && tout.debout.reduce((n, l) => n + l.length, 0) + tout.cuits.reduce((n, l) => n + l.length, 0) === tout.total, `${tout.total} = ${decor.total} + ${campagne.total}`);
}

// --- Le troupeau ---------------------------------------------------------------
// Des hardes sur la carte : quatre cochons près de chaque base, des cerfs loin
// des bases, ni comptés ni produits. Un cerf se chasse : il détale quand on le
// frappe puis s'arrête ; abattu, il laisse une carcasse que le chasseur dépèce
// sans nouvel ordre. Un cochon se capture en l'approchant, se mène au doigt et
// s'abat au village.
{
  const w = new World({ seed: 11, mapSize: 'small', difficulty: 'normal' });
  w.ais = [];
  const betes = w.units.filter((u) => u.isAnimal);
  const cochons = betes.filter((b) => b.type === 'pig'), cerfs = betes.filter((b) => b.type === 'deer');
  const tc = w.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  check('des hardes au départ : cochons près des bases, cerfs plus loin', cochons.length >= 6 && cerfs.length >= 6, `${cochons.length} cochons, ${cerfs.length} cerfs`);
  check('des cochons à moins de dix cases du Centre-Ville', cochons.filter((c) => dist(c.x, c.y, tc.x, tc.y) < TILE * 10).length >= 3);
  check('les cerfs se tiennent loin des bases', cerfs.every((c) => w.map.startPositions.every((s) => dist(c.x, c.y, s.tx * TILE, s.ty * TILE) > TILE * 11)));
  check('les animaux ne comptent pas dans la population', w.players[0].pop === 5 && w.players[0].pop === w.units.filter((u) => u.playerIndex === 0 && !u.isAnimal).length, w.players[0].pop + ' de population');
  check('sur des cases libres, jamais dans l’eau', betes.every((b) => w.map.isOpenTile(Math.floor(b.x / TILE), Math.floor(b.y / TILE))));
  const avant = betes.map((b) => [b.x, b.y]);
  advance(w, 30);
  const bouge = betes.filter((b, i) => dist(b.x, b.y, avant[i][0], avant[i][1]) > 8).length;
  check('ils pâturent : presque tous ont bougé en trente secondes', bouge >= betes.length * 0.7, `${bouge}/${betes.length}`);
  check('sans s’éloigner de leur pâture', betes.every((b) => dist(b.x, b.y, b.home.x, b.home.y) < TILE * 5));
  check('aucun soldat ne les prend pour cible de lui-même', w.units.every((u) => !u.target || !u.target.isAnimal));
  // La chasse.
  const v = w.units.find((u) => u.playerIndex === 0 && u.isVillager);
  const cerf = cerfs.filter((c) => !c.dead).sort((a, b) => dist(a.x, a.y, v.x, v.y) - dist(b.x, b.y, v.x, v.y))[0];
  const ordre = w.commandUnits([v], cerf.x, cerf.y, { tolerance: 10 });
  check('un villageois envoyé sur un cerf part chasser', !!ordre && ordre.kind === 'hunt' && v.state === STATE.ATTACK && v.target === cerf, ordre && ordre.kind);
  const pv = cerf.hp;
  let fuite = false;
  advance(w, 150, () => { if (cerf.hp < pv && cerf.fleeTimer > 0) fuite = true; return cerf.dead; });
  check('frappé, le cerf détale ; il finit abattu', fuite && cerf.dead, cerf.dead ? `abattu à ${Math.round(w.time)} s` : `pv ${cerf.hp}/${pv}`);
  const carcasse = [...w.map.resources.values()].find((r) => r.gibier === 'deer');
  check('il laisse une carcasse de 140 de nourriture, qui ne bloque pas le passage', !!carcasse && carcasse.max === 140 && carcasse.type === 'food' && !w.map.isBlocked(carcasse.tx, carcasse.ty));
  check('le chasseur la dépèce sans nouvel ordre', !!carcasse && v.state === STATE.GATHER && !!v.resourceTile && v.resourceTile.tx === carcasse.tx && v.resourceTile.ty === carcasse.ty, v.state);
  // Le cerf est tombé loin de la base : un seul voyage suffit à prouver la chaîne.
  const food0 = w.players[0].resources.food;
  advance(w, 120, () => w.players[0].resources.food >= food0 + 10);
  check('et la nourriture arrive au village', w.players[0].resources.food >= food0 + 10, `${food0} → ${Math.round(w.players[0].resources.food)}`);
  // La capture d'un cochon.
  const cochon = cochons.filter((c) => !c.dead && c.playerIndex < 0).sort((a, b) => dist(a.x, a.y, tc.x, tc.y) - dist(b.x, b.y, tc.x, tc.y))[0];
  const v2 = w.units.filter((u) => u.playerIndex === 0 && u.isVillager && u !== v)[0];
  w.commandUnits([v2], cochon.x, cochon.y - TILE, { tolerance: 0 });
  advance(w, 60, () => cochon.playerIndex === 0);
  check('un villageois qui approche un cochon le capture', cochon.playerIndex === 0 && !cochon.dead);
  const p0 = [cochon.x, cochon.y];
  advance(w, 20);
  check('capturé, il n’erre plus', dist(cochon.x, cochon.y, p0[0], p0[1]) < TILE, Math.round(dist(cochon.x, cochon.y, p0[0], p0[1])) + ' px');
  const but = { x: tc.x + TILE * 3, y: tc.y + TILE * 3 };
  const mene = w.commandUnits([cochon], but.x, but.y, { tolerance: 0 });
  advance(w, 40, () => cochon.state === STATE.IDLE);
  check('on le mène au doigt, comme une unité', !!mene && mene.kind === 'move' && dist(cochon.x, cochon.y, but.x, but.y) < TILE * 2.5, `${Math.round((dist(cochon.x, cochon.y, but.x, but.y) / TILE) * 10) / 10} cases du but`);
  const abat = w.commandUnits([v2], cochon.x, cochon.y, { tolerance: 8 });
  advance(w, 60, () => cochon.dead);
  check('ses propres villageois l’abattent : cent de nourriture', !!abat && abat.kind === 'hunt' && cochon.dead && [...w.map.resources.values()].some((r) => r.gibier === 'pig' && r.max === 100), abat && abat.kind);
  // Un ordre de marche à côté d'un animal reste un ordre de marche.
  const v3 = w.units.filter((u) => u.playerIndex === 0 && u.isVillager && u !== v && u !== v2)[0];
  const cerf2 = cerfs.find((c) => !c.dead);
  const pres = w.commandUnits([v3], cerf2.x + TILE * 0.9, cerf2.y, { tolerance: TILE });
  check('un ordre à côté d’un animal est un déplacement, pas une chasse', !!pres && pres.kind !== 'hunt' && v3.state !== STATE.ATTACK, pres && pres.kind);
}

// --- Collé au gisement ---------------------------------------------------------
// Un villageois récolte le corps contre la case, sur un de ses côtés : l'ouest
// ou l'est de préférence (les poses de travail sont de profil), le nord ou le
// sud sinon, un angle en dernier recours. Plusieurs récolteurs se répartissent
// les côtés.
{
  const world = new World({ seed: 11, mapSize: 'small', difficulty: 'normal' });
  const map = world.map;
  const tc = world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const villagers = world.units.filter((u) => u.playerIndex === 0 && u.isVillager);
  // Un arbre dégagé sur ses huit côtés, près de la base.
  const degage = (r) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && !map.isOpenTile(r.tx + dx, r.ty + dy)) return false;
    return true;
  };
  const arbres = [...map.resources.values()].filter((r) => r.type === 'wood' && degage(r))
    .sort((a, b) => dist(a.tx * TILE, a.ty * TILE, tc.x, tc.y) - dist(b.tx * TILE, b.ty * TILE, tc.x, tc.y));
  const arbre = arbres[0];
  const cx = arbre.tx * TILE + TILE / 2, cy = arbre.ty * TILE + TILE / 2;
  const v = villagers[0];
  v.x = cx; v.y = cy + 4 * TILE;       // il arrive par le sud
  v.gatherAt(arbre.tx, arbre.ty);
  const auTravail = (u) => u.state === STATE.GATHER && u.carry.amount > 0;
  for (let i = 0; i < 30 * TICKS_PER_SECOND && !auTravail(v); i++) world.update(DT);
  const d1 = dist(v.x, v.y, cx, cy);
  check('le bûcheron récolte collé à l’arbre', auTravail(v) && d1 < TILE * 0.75, `${d1.toFixed(1)} px du centre de l’arbre (état ${v.state})`);
  check('… sur son flanc ouest ou est, pas au nord ni au sud', Math.abs(v.x - cx) > Math.abs(v.y - cy) && (v.gatherSpot.cote === 'O' || v.gatherSpot.cote === 'E'),
    `côté ${v.gatherSpot && v.gatherSpot.cote}, dx ${(v.x - cx).toFixed(0)} dy ${(v.y - cy).toFixed(0)}`);
  check('il fait face à l’arbre', Math.abs(Math.atan2(cy - v.y, cx - v.x) - v.facing) < 0.4 || Math.abs(Math.abs(Math.atan2(cy - v.y, cx - v.x) - v.facing) - Math.PI * 2) < 0.4,
    `orientation ${v.facing.toFixed(2)} pour un arbre à ${Math.atan2(cy - v.y, cx - v.x).toFixed(2)}`);

  // Deux autres sur le même arbre : chacun son côté.
  const v2 = villagers[1], v3 = villagers[2];
  v2.x = cx; v2.y = cy + 4 * TILE; v2.gatherAt(arbre.tx, arbre.ty);
  v3.x = cx; v3.y = cy + 4 * TILE; v3.gatherAt(arbre.tx, arbre.ty);
  for (let i = 0; i < 30 * TICKS_PER_SECOND && !(auTravail(v2) && auTravail(v3)); i++) world.update(DT);
  const cotes = [v, v2, v3].map((u) => u.gatherSpot && u.gatherSpot.cote);
  check('trois bûcherons sur un arbre se répartissent ses côtés', new Set(cotes).size === 3 && auTravail(v2) && auTravail(v3), cotes.join(' '));
  const ecart = Math.min(dist(v.x, v.y, v2.x, v2.y), dist(v.x, v.y, v3.x, v3.y), dist(v2.x, v2.y, v3.x, v3.y));
  check('… sans se marcher dessus', ecart > TILE * 0.6, `${ecart.toFixed(1)} px entre les plus proches`);

  // Un arbre dont seul le nord est libre : on récolte quand même, du nord.
  const bouche = arbres[1];
  const bx = bouche.tx * TILE + TILE / 2, by = bouche.ty * TILE + TILE / 2;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((dx || dy) && !(dx === 0 && dy === -1)) map.blocked[(bouche.ty + dy) * map.w + bouche.tx + dx] |= 1;
  }
  const v4 = villagers[3];
  v4.x = bx; v4.y = by - 4 * TILE;
  v4.gatherAt(bouche.tx, bouche.ty);
  for (let i = 0; i < 30 * TICKS_PER_SECOND && !auTravail(v4); i++) world.update(DT);
  const d4 = dist(v4.x, v4.y, bx, by);
  check('un seul côté libre : on y récolte, collé quand même', auTravail(v4) && d4 < TILE * 0.75 && v4.gatherSpot.cote === 'N', `côté ${v4.gatherSpot && v4.gatherSpot.cote}, ${d4.toFixed(1)} px (état ${v4.state})`);
}

// Changer un villageois de métier ne doit pas jeter son chargement.
{
  const world = new World({ seed: 8, mapSize: 'small', difficulty: 'normal' });
  const villager = world.units.find((u) => u.playerIndex === 0 && u.isVillager);
  villager.carry = { type: 'wood', amount: 10 };
  const before = world.players[0].resources.wood;
  const gold = [...world.map.resources.values()].find((r) => r.type === 'gold');
  villager.gatherAt(gold.tx, gold.ty);
  check('un changement de métier passe d’abord par l’entrepôt', villager.state === 'return');
  for (let i = 0; i < 120 * TICKS_PER_SECOND; i++) {
    world.update(DT);
    if (world.players[0].resources.wood > before) break;
  }
  check('le chargement n’est pas perdu', world.players[0].resources.wood >= before + 9,
    Math.round(world.players[0].resources.wood - before) + ' bois livrés');
}

// --- Comportements « Age of Empires » ---------------------------------------
// Attitudes, poursuite bornée, garnison, cloche, vitesse de groupe.

/** Petit bac à sable : un monde sans IA, où l'on place les unités à la main. */
function sandbox(seed = 3) {
  const world = new World({ seed, mapSize: 'small', difficulty: 'normal' });
  world.ais = [];
  return world;
}

function advance(world, seconds, stop) {
  const ticks = Math.round(seconds * TICKS_PER_SECOND);
  for (let i = 0; i < ticks; i++) {
    world.update(DT);
    if (stop && stop()) return true;
  }
  return false;
}

{
  // Position tenue : l'unité ne quitte jamais son poste.
  const world = sandbox();
  const tc = world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const guard = world.spawnUnit(0, 'militia', tc.x + TILE * 6, tc.y + TILE * 6);
  const intruder = world.spawnUnit(1, 'militia', guard.x + TILE * 4, guard.y);
  intruder.setStance('passive');
  guard.setStance('standGround');
  const post = { x: guard.x, y: guard.y };
  advance(world, 6);
  check('position tenue : l’unité ne bouge pas',
    dist(guard.x, guard.y, post.x, post.y) < TILE * 0.6,
    Math.round(dist(guard.x, guard.y, post.x, post.y)) + ' px parcourus');
  check('position tenue : l’intrus n’est pas poursuivi', intruder.hp === intruder.maxHp);

  // Mais elle frappe ce qui entre à portée.
  intruder.x = guard.x + TILE * 0.8;
  intruder.y = guard.y;
  advance(world, 4);
  check('position tenue : frappe ce qui entre à portée', intruder.hp < intruder.maxHp,
    Math.round(intruder.hp) + '/' + intruder.maxHp + ' PV');
}

{
  // Sans attaque : l'unité ignore l'ennemi, même collé.
  const world = sandbox(4);
  const tc = world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const pacifist = world.spawnUnit(0, 'militia', tc.x + TILE * 6, tc.y + TILE * 6);
  const enemy = world.spawnUnit(1, 'militia', pacifist.x + TILE, pacifist.y);
  pacifist.setStance('passive');
  enemy.setStance('passive');
  advance(world, 5);
  check('sans attaque : n’engage jamais', enemy.hp === enemy.maxHp && pacifist.target === null);
}

{
  // Agressif : poursuit, puis regagne son poste si la cible file trop loin.
  const world = sandbox(5);
  const tc = world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const soldier = world.spawnUnit(0, 'militia', tc.x + TILE * 7, tc.y + TILE * 7);
  soldier.setStance('aggressive');
  const post = { x: soldier.x, y: soldier.y };
  const prey = world.spawnUnit(1, 'villager', soldier.x + TILE * 3, soldier.y);
  prey.setStance('passive');
  const engaged = advance(world, 4, () => soldier.target === prey);
  check('agressif : engage l’ennemi en vue', engaged);

  // La proie s'enfuit très loin : la poursuite doit s'arrêter.
  prey.x = post.x + TILE * 30;
  prey.y = post.y;
  advance(world, 12, () => soldier.target === null && soldier.state === 'idle');
  check('poursuite bornée : la cible trop lointaine est abandonnée', soldier.target === null,
    'cible=' + (soldier.target ? 'encore suivie' : 'lâchée'));
  check('agressif : retour au poste après l’engagement',
    dist(soldier.x, soldier.y, post.x, post.y) < TILE * 2.5,
    Math.round(dist(soldier.x, soldier.y, post.x, post.y) / TILE) + ' cases du poste');
}

{
  // Garnison : abri, invisibilité pour l'ennemi, soin, puis sortie.
  const world = sandbox(6);
  const tc = world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const villager = world.units.find((u) => u.playerIndex === 0 && u.isVillager);
  villager.hp = 10;
  check('le Centre-Ville vide ne tire pas', tc.arrowCount() === 0);

  villager.garrisonAt(tc);
  const entered = advance(world, 20, () => villager.garrisonedIn === tc);
  check('garnison : le villageois entre', entered && tc.garrison.length === 1);
  check('garnison : une flèche par occupant', tc.arrowCount() === 1);

  world.rebuildGrid();
  let visible = false;
  world.grid.forEachNear(tc.x, tc.y, TILE * 6, (e) => { if (e === villager) visible = true; });
  check('garnison : l’occupant n’est plus une cible', !visible);

  advance(world, 5);
  check('garnison : l’occupant se soigne', villager.hp > 10, Math.round(villager.hp) + ' PV');

  world.releaseGarrison(tc);
  check('garnison : sortie sur ordre', villager.garrisonedIn === null && tc.garrison.length === 0);
}

{
  // Un Centre-Ville occupé tire ; vide, il encaisse sans riposter.
  const world = sandbox(7);
  const tc = world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  // On veut mesurer le seul tir du bâtiment : la garnison de départ (dont
  // l'éclaireur, agressif) ne doit pas s'en mêler.
  for (const u of world.units) if (u.playerIndex === 0) u.setStance('passive');
  const attacker = world.spawnUnit(1, 'militia', tc.x + TILE * 3, tc.y);
  attacker.setStance('passive');
  advance(world, 4);
  check('Centre-Ville vide : aucune riposte', attacker.hp === attacker.maxHp,
    Math.round(attacker.hp) + '/' + attacker.maxHp + ' PV');

  for (const v of world.units.filter((u) => u.playerIndex === 0 && u.isVillager).slice(0, 3)) {
    tc.addToGarrison(v);
  }
  check('trois occupants, trois flèches', tc.arrowCount() === 3);
  advance(world, 6);
  check('Centre-Ville occupé : il tire', attacker.hp < attacker.maxHp,
    Math.round(attacker.hp) + '/' + attacker.maxHp + ' PV');
}

{
  // Cloche du village : tout le monde à l'abri, puis tout le monde dehors.
  const world = sandbox(9);
  const first = world.ringTownBell(0);
  check('cloche : les villageois courent s’abriter', first.sheltered >= 3, first.sheltered + ' abrités');
  advance(world, 25, () => world.units.filter((u) => u.playerIndex === 0 && u.garrisonedIn).length >= 3);
  const inside = world.units.filter((u) => u.playerIndex === 0 && u.garrisonedIn).length;
  check('cloche : ils sont bien entrés', inside >= 3, inside + ' à l’intérieur');
  const second = world.ringTownBell(0);
  check('cloche : le second coup les fait ressortir', second.released >= 3, second.released + ' libérés');
}

{
  // La garnison périt avec le bâtiment.
  const world = sandbox(10);
  const tc = world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const villager = world.units.find((u) => u.playerIndex === 0 && u.isVillager);
  tc.addToGarrison(villager);
  world.killEntity(tc, null, false);
  check('la garnison périt avec le bâtiment', villager.dead);
}

{
  // Vitesse de groupe : l'armée avance au rythme du plus lent.
  const world = sandbox(11);
  const tc = world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const ram = world.spawnUnit(0, 'ram', tc.x + TILE * 4, tc.y + TILE * 4);
  const scout = world.spawnUnit(0, 'scout', tc.x + TILE * 5, tc.y + TILE * 4);
  world.formationMove([ram, scout], tc.x + TILE * 12, tc.y + TILE * 12, false);
  check('vitesse de groupe : le rapide s’aligne sur le lent',
    Math.abs(scout.speedPx() - ram.speedPx()) < 0.01,
    `éclaireur ${scout.speedPx().toFixed(1)} px/s · bélier ${ram.speedPx().toFixed(1)} px/s`);
  scout.moveTo(tc.x, tc.y);   // ordre individuel : il retrouve sa vitesse
  check('vitesse de groupe : un ordre individuel libère l’unité',
    scout.speedPx() > ram.speedPx() * 2);
}

{
  // Rendement décroissant des bâtisseurs.
  const world = sandbox(12);
  const site = world.spawnBuilding(0, 'house', 4, 4, false);
  site.builderCount = 1;
  const solo = site.buildEfficiency();
  site.builderCount = 4;
  const team = site.buildEfficiency() * 4;
  check('bâtisseurs : deux valent mieux qu’un', team > solo * 1.5, `1 → ${solo.toFixed(2)} · 4 → ${team.toFixed(2)}`);
  check('bâtisseurs : rendement décroissant', team < solo * 4, `4 ouvriers = ${team.toFixed(2)}× un seul`);
}

// --- Bugs signalés en partie réelle ------------------------------------------

{
  // « Je clique sur un villageois, puis sur la ressource : il y va mais il ne
  // récolte pas. » Cas limite : l'arbre visé est au cœur d'un bois, donc
  // impossible à border. L'ordre doit être reporté sur un arbre exploitable.
  const world = sandbox(42);
  const villager = world.units.find((u) => u.playerIndex === 0 && u.isVillager);
  const tc = world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const enclave = [...world.map.resources.values()].find(
    (r) => r.type === 'wood' && !world.map.hasFreeNeighbour(r.tx, r.ty)
      && Math.hypot(r.tx * TILE - tc.x, r.ty * TILE - tc.y) < 20 * TILE);
  check('la carte contient bien un arbre enclavé', !!enclave);
  if (enclave) {
    world.commandUnits([villager], enclave.tx * TILE + TILE / 2, enclave.ty * TILE + TILE / 2);
    check('l’ordre est reporté sur un arbre exploitable',
      villager.resourceTile
        && (villager.resourceTile.tx !== enclave.tx || villager.resourceTile.ty !== enclave.ty)
        && world.map.hasOpenNeighbour(villager.resourceTile.tx, villager.resourceTile.ty),
      villager.resourceTile ? `case ${villager.resourceTile.tx},${villager.resourceTile.ty}` : 'aucune case');
    const harvested = advance(world, 60, () => villager.carry.amount > 0.5);
    check('le villageois finit par récolter', harvested,
      `sac ${villager.carry.amount.toFixed(1)} · état ${villager.state}`);
  }
}

{
  // Cas courant : un arbre normal, en lisière. Doit être rapide.
  const world = sandbox(13);
  const villager = world.units.find((u) => u.playerIndex === 0 && u.isVillager);
  const tree = world.findNearestResource(villager.x, villager.y, 'wood', 20 * TILE, 0);
  world.commandUnits([villager], tree.tx * TILE + TILE / 2, tree.ty * TILE + TILE / 2);
  const distance = dist(villager.x, villager.y, tree.tx * TILE, tree.ty * TILE) / TILE;
  let seconds = 0;
  const ok = advance(world, 40, () => { seconds += DT; return villager.carry.amount > 0.5; });
  check('récolte d’un arbre ordinaire sans détour', ok && seconds < distance * 1.6 + 6,
    `${distance.toFixed(1)} cases parcourues en ${seconds.toFixed(1)} s`);
}

{
  // « Une fois le sac plein, il reste planté devant la ressource. »
  // Même si tous les dépôts ont été marqués en échec, il doit livrer.
  const world = sandbox(8);
  const villager = world.units.find((u) => u.playerIndex === 0 && u.isVillager);
  const tc = world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const tree = world.findNearestResource(villager.x, villager.y, 'wood', 30 * TILE, 0);
  villager.gatherAt(tree.tx, tree.ty);
  advance(world, 90, () => villager.carry.amount >= villager.carryCapacity() - 1);
  check('le sac se remplit', villager.carry.amount > 5, villager.carry.amount.toFixed(1));

  villager.failedDropoffs = new Set([tc.id]);   // le trajet précédent a échoué
  villager.startReturn();
  check('un échec de trajet ne condamne pas le dépôt', villager.state === 'return', villager.state);
  const delivered = advance(world, 60, () => world.players[0].stats.gathered.wood > 0);
  check('le chargement finit toujours par être livré', delivered,
    Math.round(world.players[0].stats.gathered.wood) + ' bois déposés');
  check('le villageois repart travailler', villager.state !== 'idle', villager.state);
}

{
  // Arbre épuisé : le villageois enchaîne sur le voisin immédiat (même bosquet),
  // sans attendre un nouvel ordre — mais il ne part pas à l'autre bout du monde.
  const world = sandbox(23);
  const villager = world.units.find((u) => u.playerIndex === 0 && u.isVillager);
  // Un arbre avec au moins un voisin arbre exploitable.
  let tree = null;
  for (const res of world.map.resources.values()) {
    if (res.type !== 'wood' || !world.map.hasOpenNeighbour(res.tx, res.ty)) continue;
    let voisinOk = false;
    for (let dy = -2; dy <= 2 && !voisinOk; dy++) {
      for (let dx = -2; dx <= 2 && !voisinOk; dx++) {
        if (dx === 0 && dy === 0) continue;
        const other = world.map.resourceAt(res.tx + dx, res.ty + dy);
        if (other && other.type === 'wood' && world.map.hasOpenNeighbour(other.tx, other.ty)) voisinOk = true;
      }
    }
    if (voisinOk) { tree = res; break; }
  }
  check('la carte offre un bosquet', !!tree);
  tree.amount = 4;
  villager.gatherAt(tree.tx, tree.ty);
  const enchaine = advance(world, 120, () => villager.resourceTile
    && (villager.resourceTile.tx !== tree.tx || villager.resourceTile.ty !== tree.ty));
  check('arbre épuisé : il passe au suivant du même bosquet', enchaine,
    villager.resourceTile ? `case ${villager.resourceTile.tx},${villager.resourceTile.ty} · état ${villager.state}` : villager.state);
  check('l’arbre épuisé a bien disparu', !world.map.resourceAt(tree.tx, tree.ty));
}

{
  // Doigt qui rate la case d'un cheveu : l'ordre doit quand même être compris.
  const world = sandbox(17);
  const villager = world.units.find((u) => u.playerIndex === 0 && u.isVillager);
  // On cherche un arbre bordé d'une case vide, et on vise cette case vide :
  // c'est le geste d'un pouce imprécis sur un petit écran.
  let tree = null, miss = null;
  for (const res of world.map.resources.values()) {
    if (res.type !== 'wood') continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = res.tx + dx, y = res.ty + dy;
      if (world.map.resourceAt(x, y) || world.map.isBlocked(x, y)) continue;
      tree = res; miss = { x, y };
      break;
    }
    if (tree) break;
  }
  check('la carte offre un arbre bordé de vide', !!tree);
  const result = world.commandUnits([villager], miss.x * TILE + TILE / 2, miss.y * TILE + TILE / 2);
  check('tap à côté de l’arbre : l’ordre de récolte est compris',
    result && result.kind === 'gather' && villager.resourceTile,
    `ordre = ${result ? result.kind : 'aucun'}`);
}

{
  // Un villageois ne doit jamais rester inactif avec un sac plein.
  const world = sandbox(21);
  const villager = world.units.find((u) => u.playerIndex === 0 && u.isVillager);
  villager.carry = { type: 'wood', amount: 10 };
  villager.startReturn();
  check('sac plein : il part livrer, il ne s’arrête pas', villager.state === 'return', villager.state);
}

// --- Chantiers : file d'attente et renforts ----------------------------------

/** Emplacements constructibles distincts autour du Centre-Ville. */
function freeSpots(world, type, count) {
  const tc = world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const spots = [];
  for (let r = 3; r <= 12 && spots.length < count; r++) {
    for (let dy = -r; dy <= r && spots.length < count; dy++) {
      for (let dx = -r; dx <= r && spots.length < count; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = tc.tx + dx, ty = tc.ty + dy;
        if (!world.canPlace(0, type, tx, ty)) continue;
        if (spots.some((s2) => Math.abs(s2.tx - tx) < 3 && Math.abs(s2.ty - ty) < 3)) continue;
        spots.push({ tx, ty });
      }
    }
  }
  return spots;
}

{
  // Enchaîner deux poses : l'ouvrier termine la première puis attaque la seconde.
  const world = sandbox(52);
  const villager = world.units.find((u) => u.playerIndex === 0 && u.isVillager);
  world.players[0].resources.wood = 1000;
  const spots = freeSpots(world, 'house', 2);
  check('deux emplacements trouvés', spots.length === 2);

  const premier = world.placeBuilding(0, 'house', spots[0].tx, spots[0].ty, [villager]);
  const second = world.placeBuilding(0, 'house', spots[1].tx, spots[1].ty, [villager]);
  check('le premier chantier reste la cible', villager.target === premier);
  check('le second part en file d’attente',
    villager.buildQueue.length === 1 && villager.buildQueue[0] === second,
    villager.buildQueue.length + ' en file');

  const finis = advance(world, 200, () => premier.complete && second.complete);
  check('les deux chantiers sont menés à terme', finis,
    `premier ${Math.round(premier.progressRatio * 100)} % · second ${Math.round(second.progressRatio * 100)} %`);
}

{
  // Un ordre direct remplace la file : le joueur a changé d'avis.
  const world = sandbox(53);
  const villager = world.units.find((u) => u.playerIndex === 0 && u.isVillager);
  world.players[0].resources.wood = 1000;
  const spots = freeSpots(world, 'house', 3);
  const a = world.placeBuilding(0, 'house', spots[0].tx, spots[0].ty, [villager]);
  world.placeBuilding(0, 'house', spots[1].tx, spots[1].ty, [villager]);
  check('file constituée', villager.buildQueue.length === 1);

  const c = world.placeBuilding(0, 'house', spots[2].tx, spots[2].ty, []);
  villager.buildAt(c);   // appui direct sur un chantier
  check('un appui direct remplace la file',
    villager.target === c && villager.buildQueue.length === 0,
    `cible ${villager.target === c ? 'nouvelle' : 'inchangée'}, file ${villager.buildQueue.length}`);
  check('le premier chantier est bien abandonné', villager.target !== a);

  // Et un ordre de récolte la vide aussi.
  villager.buildQueue.push(a);
  const arbre = world.findNearestResource(villager.x, villager.y, 'wood', 30 * TILE, 0);
  villager.gatherAt(arbre.tx, arbre.ty);
  check('un ordre de récolte vide la file', villager.buildQueue.length === 0);
}

{
  // Renforts : plusieurs ouvriers accélèrent réellement, avec rendement décroissant.
  const duree = (n) => {
    const world = sandbox(51);
    world.players[0].resources.wood = 1000;
    const spots = freeSpots(world, 'house', 1);
    const equipe = world.units.filter((u) => u.playerIndex === 0 && u.isVillager).slice(0, n);
    equipe.forEach((v, i) => {
      v.x = (spots[0].tx + i * 0.3) * TILE;
      v.y = (spots[0].ty - 1) * TILE;
    });
    const site = world.placeBuilding(0, 'house', spots[0].tx, spots[0].ty, equipe);
    let t = 0;
    for (let i = 0; i < 200 * TICKS_PER_SECOND && !site.complete; i++) { world.update(DT); t += DT; }
    return site.complete ? t : Infinity;
  };
  const solo = duree(1), trio = duree(3);
  check('trois ouvriers construisent plus vite qu’un', trio < solo * 0.65,
    `1 ouvrier ${solo.toFixed(1)} s · 3 ouvriers ${trio.toFixed(1)} s`);
  check('le rendement reste décroissant', trio > solo / 3,
    `gain ×${(solo / trio).toFixed(2)} pour trois fois plus de bras`);
}

{
  // Affecter quelqu'un à un chantier : le geste doit être celui de la récolte.
  const world = sandbox(54);
  world.players[0].resources.wood = 1000;
  const spots = freeSpots(world, 'house', 2);
  const villagers = world.units.filter((u) => u.playerIndex === 0 && u.isVillager);
  const site = world.placeBuilding(0, 'house', spots[0].tx, spots[0].ty, []);
  check('chantier posé sans personne dessus', site && world.buildersOn(site) === 0);

  // Appui sur le chantier, villageois en main.
  const ordre = world.commandUnits([villagers[0]], site.x, site.y);
  check('un appui sur le chantier vaut ordre de construire',
    ordre && ordre.kind === 'build' && ordre.workers === 1 && villagers[0].target === site,
    `ordre « ${ordre ? ordre.kind : 'aucun'} »`);
  check('le chantier compte son ouvrier avant même qu’il arrive',
    world.buildersOn(site) === 1, String(world.buildersOn(site)));

  // Renfort automatique : assignBuilder choisit un chantier tout seul.
  const cible = world.assignBuilder(villagers[1]);
  check('un renfort trouve le chantier sans qu’on le désigne', cible === site);

  // Deuxième chantier : le suivant doit y aller plutôt que s'entasser.
  const second = world.placeBuilding(0, 'house', spots[1].tx, spots[1].ty, []);
  const choix = world.assignBuilder(villagers[2]);
  check('le chantier qui manque de bras passe devant', choix === second,
    choix === site ? 'renfort entassé sur le premier' : 'ok');

  check('les chantiers en cours sont listés', world.constructionSites(0).length === 2);
  world.update(DT);
  check('le relevé par tick compte aussi ceux qui marchent',
    site.assignedBuilders === 2 && second.assignedBuilders === 1,
    `${site.assignedBuilders} / ${second.assignedBuilders}`);

  // Et on peut retirer quelqu'un du chantier : il redevient disponible.
  villagers[0].stop();
  check('retirer un ouvrier libère le chantier', world.buildersOn(site) === 1);
}

// --- Sauvegarde et reprise ---------------------------------------------------

/**
 * Empreinte de l'état visible d'une partie : si deux mondes la partagent, un
 * joueur ne peut pas les distinguer.
 */
function empreinte(world) {
  const n = (v) => Math.round(v * 100) / 100;
  const parties = [
    't' + n(world.time),
    'r' + world.players.map((p) => [p.age, n(p.resources.food), n(p.resources.wood), n(p.resources.gold),
      p.pop, p.popCap, [...p.techs].sort().join('+')].join('/')).join('|'),
    'g' + world.map.resources.size,
    'u' + world.units.filter((u) => !u.dead)
      .map((u) => [u.id, u.type, n(u.x), n(u.y), n(u.hp), u.state, n(u.carry.amount)].join(','))
      .sort().join(';'),
    'b' + world.buildings.filter((b) => !b.dead)
      .map((b) => [b.id, b.type, n(b.hp), b.complete ? 1 : 0, n(b.buildProgress), b.queue.length].join(','))
      .sort().join(';'),
  ];
  return parties.join('#');
}

{
  // Une partie rechargée doit reprendre exactement là où elle s'est arrêtée —
  // et continuer de la même façon, IA et hasard compris.
  const world = new World({ seed: 808, mapSize: 'small', difficulty: 'normal' });
  world.players[0].autoWorkers = true;
  world.ais.push(new AIPlayer(world, 0, DIFFICULTIES.normal));
  advance(world, 150);

  const instantane = JSON.parse(JSON.stringify(serializeWorld(world, { speed: 'rapide' })));
  const avant = empreinte(world);
  const repris = restoreWorld(instantane);
  check('la sauvegarde se recharge', !!repris);
  check('l’état repris est identique', empreinte(repris) === avant,
    empreinte(repris) === avant ? '' : 'divergence immédiate');
  check('les réglages de la partie sont conservés',
    repris.seed === world.seed && repris.modeId === world.modeId
    && repris.mapSizeId === world.mapSizeId && repris.difficultyId === world.difficultyId);
  check('le brouillard exploré est restauré',
    repris.fog.explored.reduce((a, b) => a + b, 0) === world.fog.explored.reduce((a, b) => a + b, 0));

  // Les deux mondes avancent maintenant en parallèle : ils doivent rester
  // indiscernables. C'est ce qui prouve que rien n'a été oublié.
  advance(world, 60);
  advance(repris, 60);
  const original = empreinte(world);
  const suite = empreinte(repris);
  check('la partie reprise évolue à l’identique', suite === original,
    suite === original ? '60 s rejouées à l’identique' : 'les deux parties divergent');

  // Et une sauvegarde d'une autre version est refusée plutôt que mal relue.
  check('une sauvegarde étrangère est refusée',
    restoreWorld({ ...instantane, version: 999 }) === null);
}

{
  // Une sauvegarde ne doit contenir aucune référence d'entité. Un poste différé
  // (« je livre mon bois, puis je vais à cette ferme ») en contenait une : la
  // structure devenait circulaire, l'écriture échouait, et la partie n'était
  // silencieusement jamais sauvegardée.
  const world = new World({ seed: 404, mapSize: 'small', difficulty: 'normal' });
  const v = world.units.find((u) => u.playerIndex === 0 && u.isVillager);
  const tc = world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const ferme = world.spawnBuilding(0, 'farm', tc.tx + 5, tc.ty + 5, true);
  v.carry = { type: 'wood', amount: 8 };
  v.gatherFarm(ferme);          // il passe livrer d'abord : le poste est différé
  check('le poste différé est bien en place', !!v.pendingJob && v.pendingJob.farm === ferme);

  let texte = null;
  try { texte = JSON.stringify(serializeWorld(world)); } catch { texte = null; }
  check('l’instantané reste écrivable', typeof texte === 'string',
    texte ? Math.round(texte.length / 1024) + ' Ko' : 'structure circulaire');

  const repris = texte ? restoreWorld(JSON.parse(texte)) : null;
  const vr = repris && repris.byId.get(v.id);
  check('le poste différé survit à la reprise',
    !!vr && !!vr.pendingJob && vr.pendingJob.farm === repris.byId.get(ferme.id));
  check('le dépôt visé survit aussi',
    !!vr && (!v.returnTo || vr.returnTo === repris.byId.get(v.returnTo.id)));
}

{
  // Mode Express : départ à l'Âge Féodal, et le Centre-Ville décide.
  const world = new World({ seed: 91, mode: 'express', difficulty: 'normal' });
  const villageois = world.units.filter((u) => u.playerIndex === 0 && u.isVillager).length;
  check('Express démarre à l’Âge Féodal', world.players[0].age === 1, 'âge ' + world.players[0].age);
  check('Express démarre avec plus de villageois', villageois === 7, villageois + ' villageois');
  check('Express plafonne la population plus bas', world.popMax === 40, String(world.popMax));
  check('Express part avec des ressources garnies', world.players[0].resources.food === 500);
  check('Express laisse de la place pour produire tout de suite',
    world.players[0].pop < world.players[0].popCap,
    `${world.players[0].pop}/${world.players[0].popCap}`);

  const tc = world.buildings.find((b) => b.playerIndex === 1 && b.type === 'towncenter');
  world.killEntity(tc, null, true);
  world.checkVictory();
  check('le dernier Centre-Ville tombé donne la victoire',
    world.gameOver && world.gameOver.victory === true,
    world.gameOver ? 'partie finie' : 'partie toujours en cours');

  // Le Centre-Ville est l'objectif : il ne peut pas être imprenable.
  const express = new World({ seed: 92, mode: 'express', difficulty: 'normal' });
  const classiqueTc = new World({ seed: 92, mode: 'classique', difficulty: 'normal' });
  const hpExpress = express.buildings.find((b) => b.type === 'towncenter').maxHp;
  const hpClassique = classiqueTc.buildings.find((b) => b.type === 'towncenter').maxHp;
  check('le Centre-Ville est plus fragile en Express', hpExpress === Math.round(hpClassique * 0.5),
    `${hpExpress} contre ${hpClassique} points de vie`);

  // Et la partie se termine au chronomètre, quoi qu'il arrive sur le terrain.
  express.time = 600 - DT / 2;   // le tick suivant franchit la limite
  express.update(DT);
  check('la limite de temps met fin à la partie',
    !!express.gameOver && express.gameOver.timeUp === true,
    express.gameOver ? 'terminée' : 'toujours en cours');
  check('le score départage au temps écoulé',
    express.gameOver && express.gameOver.scores.length === 2
    && express.gameOver.scores.every((v) => Number.isFinite(v)),
    express.gameOver ? express.gameOver.scores.join(' vs ') : '');

  // En Classique, raser le seul Centre-Ville ne suffit pas.
  const classique = new World({ seed: 91, mode: 'classique', difficulty: 'normal' });
  const tc2 = classique.buildings.find((b) => b.playerIndex === 1 && b.type === 'towncenter');
  classique.killEntity(tc2, null, true);
  classique.checkVictory();
  check('en Classique la partie continue après le Centre-Ville',
    !classique.gameOver, classique.gameOver ? 'finie trop tôt' : '');
}

// --- Viser l'ennemi au doigt --------------------------------------------------

{
  const world = sandbox(45);
  const tc = world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const soldat = world.spawnUnit(0, 'militia', tc.x + 3 * TILE, tc.y + 3 * TILE);
  const ennemi = world.spawnUnit(1, 'militia', tc.x + 2 * TILE, tc.y + 2 * TILE);

  // Au doigt, une unité n'offrait qu'une cible de neuf pixels à l'écran.
  const rate = world.commandUnits([soldat], ennemi.x + 28, ennemi.y + 10);
  check('un appui à côté de l’ennemi lance quand même l’attaque',
    rate && rate.kind === 'attack' && soldat.target === ennemi,
    `ordre « ${rate ? rate.kind : 'aucun'} »`);

  // Mêlée : l'ennemi l'emporte sur l'allié tout proche.
  const allie = world.spawnUnit(0, 'villager', ennemi.x + 12, ennemi.y + 6);
  soldat.stop();
  const melee = world.commandUnits([soldat], allie.x, allie.y);
  check('dans une mêlée, l’ennemi est visé avant l’allié',
    melee && melee.kind === 'attack' && soldat.target === ennemi,
    `ordre « ${melee ? melee.kind : 'aucun'} »`);

  // Sans tolérance, un ordre lointain reste un déplacement.
  soldat.stop();
  const loin = world.commandUnits([soldat], ennemi.x + 6 * TILE, ennemi.y + 6 * TILE);
  check('un ordre loin de l’ennemi reste un déplacement',
    loin && loin.kind === 'move', `ordre « ${loin ? loin.kind : 'aucun'} »`);

  // Un villageois aussi doit pouvoir riposter sur ordre.
  const paysan = world.units.find((u) => u.playerIndex === 0 && u.isVillager);
  world.commandUnits([paysan], ennemi.x, ennemi.y);
  check('un villageois attaque sur ordre du joueur',
    paysan.target === ennemi && paysan.state === 'attack', paysan.state);

  // Et l'attaque ordonnée ne subit pas la limite de poursuite d'attitude.
  check('une attaque ordonnée n’est pas une prise de cible automatique',
    paysan.autoTarget === false);
}

// --- Répartition d'un groupe sur les ressources ------------------------------

{
  const world = sandbox(31);
  // Un bosquet offrant au moins six cases exploitables.
  let bosquet = null;
  for (const res of world.map.resources.values()) {
    if (res.type !== 'wood') continue;
    if (world.collectResourceTiles(res.tx, res.ty, 'wood', 3).length >= 6) { bosquet = res; break; }
  }
  check('la carte offre un bosquet assez large', !!bosquet);

  const groupe = [];
  for (let i = 0; i < 6; i++) {
    groupe.push(world.spawnUnit(0, 'villager',
      bosquet.tx * TILE + (i - 3) * TILE, bosquet.ty * TILE + 5 * TILE));
  }
  world.commandUnits(groupe, bosquet.tx * TILE + TILE / 2, bosquet.ty * TILE + TILE / 2);

  const cases = groupe.map((v) => v.resourceTile && `${v.resourceTile.tx},${v.resourceTile.ty}`);
  const distinctes = new Set(cases.filter(Boolean));
  check('un groupe envoyé sur un bosquet se répartit', distinctes.size >= 5,
    `${distinctes.size} cases distinctes pour ${groupe.length} villageois`);

  const parCase = {};
  for (const c of cases) if (c) parCase[c] = (parCase[c] || 0) + 1;
  check('personne ne s’entasse', Math.max(...Object.values(parCase)) <= 2,
    'au plus ' + Math.max(...Object.values(parCase)) + ' par case');

  // Chacun doit travailler une case proche de lui, pas la n-ième de la liste.
  const detours = groupe.map((v) => dist(v.x, v.y,
    v.resourceTile.tx * TILE + TILE / 2, v.resourceTile.ty * TILE + TILE / 2) / TILE);
  check('chacun prend une case proche de lui', Math.max(...detours) < 9,
    'détour maximal ' + Math.max(...detours).toFixed(1) + ' cases');
}

{
  // Un renfort ne vient pas se coller sur une case déjà travaillée.
  const world = sandbox(33);
  let bosquet = null;
  for (const res of world.map.resources.values()) {
    if (res.type !== 'wood') continue;
    if (world.collectResourceTiles(res.tx, res.ty, 'wood', 3).length >= 4) { bosquet = res; break; }
  }
  const ancien = world.spawnUnit(0, 'villager', bosquet.tx * TILE, bosquet.ty * TILE + 3 * TILE);
  world.commandUnits([ancien], bosquet.tx * TILE + TILE / 2, bosquet.ty * TILE + TILE / 2);
  const priseAncienne = `${ancien.resourceTile.tx},${ancien.resourceTile.ty}`;

  const renfort = world.spawnUnit(0, 'villager', ancien.x + TILE, ancien.y);
  world.commandUnits([renfort], bosquet.tx * TILE + TILE / 2, bosquet.ty * TILE + TILE / 2);
  check('le renfort évite la case déjà occupée',
    `${renfort.resourceTile.tx},${renfort.resourceTile.ty}` !== priseAncienne,
    `ancien ${priseAncienne} · renfort ${renfort.resourceTile.tx},${renfort.resourceTile.ty}`);
}

{
  // Les fermes : une ferme nourrit un villageois.
  const world = sandbox(35);
  const tc = world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  // On pose les fermes directement : le test porte sur la répartition, pas sur
  // les prérequis de construction (une ferme exige un moulin).
  const libre = (tx, ty) => {
    for (let y = ty; y < ty + 2; y++) {
      for (let x = tx; x < tx + 2; x++) if (world.map.isBlocked(x, y)) return false;
    }
    return true;
  };
  const fermes = [];
  for (let r = 3; r <= 10 && fermes.length < 3; r++) {
    for (let dy = -r; dy <= r && fermes.length < 3; dy++) {
      for (let dx = -r; dx <= r && fermes.length < 3; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = tc.tx + dx, ty = tc.ty + dy;
        if (!world.map.inBounds(tx + 1, ty + 1) || !libre(tx, ty)) continue;
        if (fermes.some((f) => Math.abs(f.tx - tx) < 3 && Math.abs(f.ty - ty) < 3)) continue;
        fermes.push(world.spawnBuilding(0, 'farm', tx, ty, true));
      }
    }
  }
  check('trois fermes disponibles', fermes.length === 3, fermes.length + ' fermes');

  const groupe = world.units.filter((u) => u.playerIndex === 0 && u.isVillager).slice(0, 3);
  world.commandUnits(groupe, fermes[0].x, fermes[0].y);
  const occupees = new Set(groupe.map((v) => v.target && v.target.id));
  check('un groupe envoyé sur une ferme se répartit sur les autres',
    occupees.size === 3, occupees.size + ' fermes occupées pour 3 villageois');
}

// Déterminisme : une même graine doit rejouer exactement la même partie.
const runA = runMatch({ seed: 99, mapSize: 'small', difficulty: 'normal', minutes: 3 });
const runB = runMatch({ seed: 99, mapSize: 'small', difficulty: 'normal', minutes: 3 });
const fingerprint = (w) => w.players.map((p) =>
  [p.age, p.pop, Math.round(p.resources.food), Math.round(p.resources.wood), p.stats.trained].join('/')).join('|');
check('parties reproductibles à graine égale', fingerprint(runA.world) === fingerprint(runB.world),
  fingerprint(runA.world) === fingerprint(runB.world)
    ? fingerprint(runA.world)
    : `A=${fingerprint(runA.world)} B=${fingerprint(runB.world)}`);


// ---------------------------------------------------------------------------
// Déplacement : plus personne ne reste coincé.
//
// Avant : le chemin était lissé une fois pour toutes entre centres de cases,
// et un point de passage validé à 17 px de son centre sans y être entré.
// L'unité visait alors le nœud suivant depuis une case d'où la ligne droite
// était bouchée, glissait du mauvais côté, recalculait… et retombait sur le
// même chemin : jusqu'à cent recalculs pour un seul ordre, l'unité figée.
// ---------------------------------------------------------------------------
{
  const passif = (w) => { w.ais = []; for (const u of w.units) u.setStance('passive'); return w; };
  const tirage = new RNG(777);
  // Cases atteignables depuis (tx, ty), même règle diagonale que l'A* ;
  // renvoie la distance en cases (−1 : inaccessible).
  const atteignables = (map, tx, ty) => {
    const { w, h } = map;
    const d = new Int32Array(w * h).fill(-1);
    const file = [ty * w + tx]; d[file[0]] = 0;
    for (let tete = 0; tete < file.length; tete++) {
      const cur = file[tete], cx = cur % w, cy = (cur / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (d[ni] >= 0 || map.blocked[ni]) continue;
        if (dx && dy && (map.blocked[cy * w + nx] || map.blocked[ny * w + cx])) continue;
        d[ni] = d[cur] + 1; file.push(ni);
      }
    }
    return d;
  };
  // Une case ouverte, atteignable, loin de tout ce qui détournerait l'ordre
  // (ennemi → attaque, bâtiment → chantier, gisement → récolte).
  const cibleLibre = (w, d, minCases) => {
    const cands = [];
    for (let i = 0; i < d.length; i++) if (d[i] >= minCases && w.map.isOpenTile(i % w.map.w, (i / w.map.w) | 0)) cands.push(i);
    for (let essai = 0; essai < 200; essai++) {
      const i = cands[tirage.int(0, cands.length - 1)];
      const tx = i % w.map.w, ty = (i / w.map.w) | 0;
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
      if (w.enemyAt(x, y, 0, TILE * 2) || w.entityAt(x, y, null, TILE * 2) || w.resourceNear(x, y)) continue;
      return { tx, ty, x, y, cases: d[i] };
    }
    return null;
  };
  const arrive = (u, x, y, marge) => u.state === STATE.IDLE && dist(u.x, u.y, x, y) <= marge;

  // 1. Seule, vers des cibles tirées au hasard, sur les trois tailles de carte.
  let ordres = 0, arrivees = 0, recalculsMax = 0;
  for (const taille of ['small', 'medium', 'large']) {
    for (let g = 0; g < 2; g++) {
      const w = passif(new World({ seed: 900 + g, mapSize: taille, difficulty: 'normal' }));
      const tc = w.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
      const u = w.spawnUnit(0, 'militia', tc.x + TILE * 3, tc.y);
      u.setStance('passive');
      for (let k = 0; k < 5; k++) {
        const d = atteignables(w.map, Math.floor(u.x / TILE), Math.floor(u.y / TILE));
        const c = cibleLibre(w, d, 8);
        if (!c) continue;
        w.commandUnits([u], c.x, c.y);
        const attendu = (c.cases * TILE) / u.speedPx();
        advance(w, attendu * 2 + 6, () => u.state === STATE.IDLE);
        ordres++;
        if (arrive(u, c.x, c.y, TILE * 1.5)) arrivees++;
        recalculsMax = Math.max(recalculsMax, u.repathAttempts);
      }
    }
  }
  check('seule, une unité arrive partout où un chemin existe', ordres >= 25 && arrivees === ordres, `${arrivees}/${ordres} ordres, trois tailles de carte`);
  check('sans tourner en rond : au plus trois recalculs par ordre', recalculsMax <= 3, `${recalculsMax} recalcul(s) au pire`);

  // 2. Un groupe de douze soldats, par l'ordre de formation.
  {
    const w = passif(new World({ seed: 910, mapSize: 'medium', difficulty: 'normal' }));
    const tc = w.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
    const types = ['militia', 'spearman', 'scout', 'archer', 'knight'];
    const grp = [];
    for (let i = 0; i < 12; i++) {
      const u = w.spawnUnit(0, types[i % types.length], tc.x + TILE * (2 + (i % 4)), tc.y + TILE * (2 + Math.floor(i / 4)));
      u.setStance('passive'); grp.push(u);
    }
    let n = 0, ok = 0;
    for (let k = 0; k < 4; k++) {
      const d = atteignables(w.map, Math.floor(grp[0].x / TILE), Math.floor(grp[0].y / TILE));
      const c = cibleLibre(w, d, 8);
      if (!c) continue;
      w.commandUnits(grp, c.x, c.y);
      const lent = Math.min(...grp.map((u) => u.speedPx()));
      advance(w, (c.cases * TILE) / lent * 2 + 8, () => grp.every((u) => u.state === STATE.IDLE));
      for (const u of grp) { n++; if (arrive(u, c.x, c.y, TILE * 3.5)) ok++; }
    }
    check('un groupe de douze arrive au complet', n >= 36 && ok === n, `${ok}/${n} unités en formation autour de la cible`);
  }

  // 3. Une maison posée sur quatre villageois à l'arrêt.
  {
    const w = passif(new World({ seed: 920, mapSize: 'small', difficulty: 'normal' }));
    const tc = w.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
    w.players[0].resources.wood = 5000;
    let spot = null;
    for (let r = 3; r <= 10 && !spot; r++) {
      for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (w.canPlace(0, 'house', tc.tx + dx, tc.ty + dy, true)) spot = { tx: tc.tx + dx, ty: tc.ty + dy };
      }
    }
    const grp = [];
    for (let i = 0; i < 4; i++) {
      const u = w.spawnUnit(0, 'villager', (spot.tx + (i % 2)) * TILE + TILE / 2, (spot.ty + Math.floor(i / 2)) * TILE + TILE / 2);
      u.setStance('passive'); grp.push(u);
    }
    advance(w, 0.5);
    const site = w.placeBuilding(0, 'house', spot.tx, spot.ty, []);
    const pieges = grp.filter((u) => w.map.isBlocked(Math.floor(u.x / TILE), Math.floor(u.y / TILE))).length;
    check('une maison posée sur des villageois les pousse dehors', !!site && pieges === 0, `${pieges} villageois sous le bâtiment`);
    const d = atteignables(w.map, Math.floor(grp[0].x / TILE), Math.floor(grp[0].y / TILE));
    const c = cibleLibre(w, d, 6);
    w.commandUnits(grp, c.x, c.y);
    // Le temps de marcher jusque-là : la cible tirée au sort peut être loin.
    advance(w, (c.cases * TILE) / grp[0].speedPx() * 2 + 8, () => grp.every((u) => u.state === STATE.IDLE));
    check('et ils repartent normalement', grp.every((u) => arrive(u, c.x, c.y, TILE * 3.5)),
      grp.map((u) => `${u.state} à ${Math.round(dist(u.x, u.y, c.x, c.y))}px`).join(' · '));
  }

  // 4. Une unité prise dans une case bloquée (partie restaurée, bâtiment de
  // l'IA…) en ressort d'elle-même au premier pas.
  {
    const w = passif(sandbox(930));
    const u = w.units.find((v) => v.playerIndex === 0 && v.isVillager);
    const tc = w.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
    const tree = w.findNearestResource(u.x, u.y, 'wood', 20 * TILE, 0);
    u.x = tree.tx * TILE + TILE / 2; u.y = tree.ty * TILE + TILE / 2;
    u.moveTo(tc.x, tc.y + TILE * 5);
    advance(w, 1);
    check('une unité prise dans une case bloquée en ressort', !w.map.isBlocked(Math.floor(u.x / TILE), Math.floor(u.y / TILE)),
      `case ${Math.floor(u.x / TILE)},${Math.floor(u.y / TILE)}`);
  }
}

// ---------------------------------------------------------------------------
// Relecture complète (septembre) : chaque bug corrigé garde son test, écrit à
// partir du script qui l'a reproduit.
// ---------------------------------------------------------------------------
{
  const moyen = (seed) => { const w = new World({ seed, mapSize: 'medium', difficulty: 'normal' }); w.ais = []; return w; };
  const centre = (w, i = 0) => w.buildings.find((b) => b.playerIndex === i && b.type === 'towncenter');
  const cases = (d) => (d / TILE).toFixed(1);

  // Une technologie ne se paie et ne s'applique qu'une fois, même lancée dans deux forges.
  {
    const w = moyen(5);
    const p = w.players[0];
    p.age = 1; p.resources = { food: 5000, wood: 5000, gold: 5000 };
    const tc = centre(w);
    const a = w.spawnBuilding(0, 'blacksmith', tc.tx + 6, tc.ty, true);
    const b = w.spawnBuilding(0, 'blacksmith', tc.tx + 6, tc.ty + 5, true);
    const r1 = w.researchTech(a, 'forging'), r2 = w.researchTech(b, 'forging');
    advance(w, 40);
    check('une technologie en cours dans une forge ne se relance pas dans l’autre', !!r1 && !r2 && p.mods.attackMelee === 1,
      `lancée ${!!r1} puis ${!!r2}, bonus d’attaque ${p.mods.attackMelee}`);
  }

  // Une flèche déjà en vol épargne l'unité entrée à l'abri ; un mort à l'abri libère sa place.
  {
    const w = moyen(7);
    const tc = centre(w);
    const v = w.units.find((u) => u.playerIndex === 0 && u.isVillager);
    v.hp = 2;
    const archer = w.spawnUnit(1, 'archer', tc.x + TILE * 5, tc.y);
    w.projectiles.push(new Projectile(w, archer, v, 10));
    tc.addToGarrison(v);
    advance(w, 1);
    check('une flèche en vol épargne l’unité qui vient d’entrer à l’abri', !v.dead && tc.garrison.includes(v),
      `${v.dead ? 'tuée' : 'vivante'}, ${tc.garrison.length} à l’abri`);
    w.killEntity(v, archer);
    check('un occupant tué à l’abri libère sa place', !tc.garrison.includes(v), `${tc.garrison.length} occupant(s)`);
  }

  // Ralliement sur un de ses bâtiments : le villageois formé s'y rend.
  {
    const w = moyen(9);
    const p = w.players[0]; p.resources = { food: 5000, wood: 5000, gold: 5000 };
    const tc = centre(w);
    const camp = w.spawnBuilding(0, 'lumbercamp', tc.tx + 8, tc.ty, true);
    w.setRally(tc, camp.x, camp.y);
    const avant = new Set(w.units.map((u) => u.id));
    w.trainUnit(tc, 'villager');
    advance(w, 25);
    const nouveau = w.units.find((u) => !avant.has(u.id) && u.isVillager && u.playerIndex === 0);
    check('ralliement sur un camp : le villageois formé s’y rend', !!nouveau && dist(nouveau.x, nouveau.y, camp.x, camp.y) < TILE * 4,
      nouveau ? `${nouveau.state}, à ${cases(dist(nouveau.x, nouveau.y, camp.x, camp.y))} cases` : 'aucun villageois formé');
  }

  // Ralliement sur une ferme en chantier : on la bâtit avant d'y récolter.
  {
    const w = sandbox(13);
    const p = w.players[0]; p.resources = { food: 5000, wood: 5000, gold: 5000 };
    const tc = centre(w);
    const [spot] = freeSpots(w, 'house', 1);   // une ferme demande un moulin ; même emprise qu'une maison
    const ferme = w.spawnBuilding(0, 'farm', spot.tx, spot.ty, false);
    const reserve = ferme.foodLeft;
    w.setRally(tc, ferme.x, ferme.y);
    w.trainUnit(tc, 'villager');
    let entameeAvantFin = false;
    advance(w, 90, () => { if (!ferme.complete && ferme.foodLeft < reserve) entameeAvantFin = true; return ferme.complete; });
    check('ralliement sur une ferme en chantier : le villageois formé la bâtit d’abord', ferme.complete && !entameeAvantFin,
      `${ferme.complete ? 'bâtie' : 'pas bâtie'}${entameeAvantFin ? ', récoltée avant la fin' : ''}`);
  }

  // Le retour après combat ne survit pas à l'ordre suivant.
  {
    const w = moyen(11);
    const a = w.map.findOpenTile(40, 48, 10);
    const s = w.spawnUnit(0, 'militia', a.tx * TILE + 16, a.ty * TILE + 16);
    const e = w.spawnUnit(1, 'villager', s.x + TILE * 3, s.y);
    e.stance = 'passive';
    const B = { x: s.x + TILE * 12, y: s.y };
    s.moveTo(B.x, B.y);
    advance(w, 1);
    const engage = !!s.rallyAfterFight;
    const spot = w.map.findOpenTile(a.tx - 6, a.ty + 6, 10);
    const maison = w.spawnBuilding(1, 'house', spot.tx, spot.ty, true);
    maison.hp = 3;
    s.attackEntity(maison);
    advance(w, 30, () => maison.dead);
    advance(w, 0.2);
    const versB = s.destination && dist(s.destination.x, s.destination.y, B.x, B.y) < TILE;
    check('après un nouvel ordre, une cible abattue ne renvoie plus vers l’ancienne destination', engage && maison.dead && !versB,
      `${s.state}, destination ${JSON.stringify(s.destination)}`);
  }

  // Deux coups de cloche : les villageois reprennent leur poste.
  {
    const w = sandbox(81);
    const vs = w.units.filter((u) => u.playerIndex === 0 && u.isVillager);
    let arbre = null;
    for (const r of w.map.resources.values()) if (r.type === 'wood' && w.map.hasOpenNeighbour(r.tx, r.ty)) { arbre = r; break; }
    w.spreadGatherOrder(vs, arbre.tx, arbre.ty, 'wood');
    advance(w, 20);
    const r1 = w.ringTownBell(0);
    advance(w, 15);
    const r2 = w.ringTownBell(0);
    advance(w, 5);
    check('au second coup de cloche, les villageois reprennent leur poste', r1.sheltered === vs.length && r2.released === vs.length
      && vs.every((v) => v.state === STATE.GATHER && !v.garrisonedIn), vs.map((v) => v.state).join(','));
  }

  // Express : une fondation de Centre-Ville ne sauve pas la partie.
  {
    const w = new World({ seed: 91, mode: 'express', difficulty: 'normal' });
    w.ais = [];
    const tc = centre(w, 1);
    let spot = null;
    for (let r = 5; r < 20 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
      if (w.canPlace(1, 'towncenter', tc.tx + dx, tc.ty + dy, true)) spot = { tx: tc.tx + dx, ty: tc.ty + dy };
    }
    w.players[1].resources.wood = 1000;
    const site = w.placeBuilding(1, 'towncenter', spot.tx, spot.ty, []);
    w.killEntity(tc, null, false);
    advance(w, 1);
    check('Express : son Centre-Ville tombé, une fondation ne sauve pas l’adversaire', !!site && !site.complete && !!w.gameOver && w.gameOver.winner === 0,
      JSON.stringify(w.gameOver));
  }

  // Un cochon capturé se vole, sauf si son maître le garde.
  {
    const w = sandbox(11);
    const tc0 = centre(w);
    const cochon = w.units.filter((u) => u.type === 'pig' && !u.dead)
      .sort((a, b) => dist(b.x, b.y, tc0.x, tc0.y) - dist(a.x, a.y, tc0.x, tc0.y))[0];
    cochon.capturer(0);
    const loin = w.units.every((u) => u.playerIndex !== 0 || u.isAnimal || dist(u.x, u.y, cochon.x, cochon.y) > TILE * 3);
    const voleur = w.spawnUnit(1, 'villager', cochon.x + TILE * 0.8, cochon.y);
    voleur.setStance('passive');
    advance(w, 1.5);
    const vole = cochon.playerIndex === 1;
    const gardien = w.spawnUnit(1, 'villager', cochon.x - TILE * 0.8, cochon.y);
    gardien.setStance('passive');
    const rival = w.spawnUnit(0, 'villager', cochon.x, cochon.y + TILE * 0.8);
    rival.setStance('passive');
    advance(w, 1.5);
    check('un cochon capturé change de main quand l’ennemi l’approche sans gardien', loin && vole, `propriétaire ${cochon.playerIndex}`);
    check('gardé par son maître, il ne change plus de main', cochon.playerIndex === 1, `propriétaire ${cochon.playerIndex}`);
  }

  // Express : l'IA vise le plafond de population de la partie (40), pas celui du Classique.
  {
    const w = new World({ seed: 21, mode: 'express', difficulty: 'normal' });
    const ai = w.ais.find((a) => a.index === 1);
    ai.survey();
    const p = w.players[1];
    p.pop = w.popMax - 2; p.popCap = w.popMax;
    const choix = ai.nextBuilding();
    check('Express : au plafond de 40, l’IA ne bâtit plus de maisons', w.popMax === 40 && choix !== 'house', `plafond ${w.popMax}, choix ${choix}`);
  }

  // La sauvegarde garde ce que vise un point de ralliement.
  {
    const w = sandbox(33);
    const tc = centre(w);
    const baie = w.findNearestResource(tc.x, tc.y, 'food', 20 * TILE, 0);
    w.setRally(tc, baie.tx * TILE + TILE / 2, baie.ty * TILE + TILE / 2);
    const repris = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    const r = centre(repris).rallyResource;
    check('la sauvegarde garde la ressource visée par le ralliement', !!r && r.tx === baie.tx && r.ty === baie.ty, JSON.stringify(r));
  }

  // Annuler une fondation de ferme n'annonce pas une ferme épuisée.
  {
    const w = sandbox(7);
    const [spot] = freeSpots(w, 'house', 1);   // une ferme demande un moulin ; même emprise qu'une maison
    const site = w.spawnBuilding(0, 'farm', spot.tx, spot.ty, false);
    const n0 = w.events.length;
    w.cancelConstruction(site);
    const avis = w.events.slice(n0).filter((e) => e.type === 'notice').map((e) => e.text);
    check('annuler une fondation de ferme n’annonce pas « Ferme épuisée »', avis.length === 0, avis.join(' | ') || 'aucun avis');
  }

  // La file des chemins : une place par unité.
  {
    const w = sandbox(7);
    const v = w.units.find((u) => u.playerIndex === 0 && u.isVillager);
    w.requestPath(v, v.x + TILE * 5, v.y);
    w.requestPath(v, v.x + TILE * 6, v.y);
    const places = w.pathQueue.filter((u) => u === v).length;
    for (let i = 0; i < 5; i++) w.processPathQueue();
    check('une unité n’occupe qu’une place dans la file des chemins', places === 1 && !v.pathPending && !!v.path && v.path.length > 0, `${places} place(s)`);
  }

  // Une vague de l'IA reste à l'attaque et atteint la base adverse.
  {
    const w = new World({ seed: 5, mapSize: 'small', difficulty: 'normal' });
    const ai = w.ais.find((a) => a.index === 1);
    const tc1 = centre(w, 1), tc0 = centre(w, 0);
    const armee = [];
    for (let i = 0; i < 8; i++) {
      armee.push(w.spawnUnit(1, 'militia', tc1.x + ((i % 4) - 1.5) * TILE, tc1.y + TILE * 3 + Math.floor(i / 4) * TILE));
    }
    ai.attackTimer = 0; ai.armyTarget = 3; ai.timer = 0;
    for (const u of w.units) if (u.playerIndex === 0 && !u.isAnimal) u.stop();
    const vagues0 = ai.waveCount;
    advance(w, 20, () => ai.waveCount > vagues0);
    advance(w, 5);
    const enMarche = armee.filter((u) => !u.dead && u.state !== STATE.IDLE);
    const agressifs = enMarche.every((u) => u.stance === 'aggressive');
    let auPlusPres = Infinity;
    advance(w, 85, () => { for (const u of armee) if (!u.dead) auPlusPres = Math.min(auPlusPres, dist(u.x, u.y, tc0.x, tc0.y)); return false; });
    check('une vague lancée reste à l’attaque au tour suivant de l’IA', ai.waveCount > vagues0 && enMarche.length >= 4 && agressifs,
      `${enMarche.length} en marche, ${agressifs ? 'agressifs' : 'repassés en défensif'}`);
    check('et elle atteint le Centre-Ville adverse', auPlusPres < TILE * 4, `au plus près : ${cases(auPlusPres)} cases`);
  }

  // Hors ligne : le cache du service worker garde tout ce que le jeu charge.
  {
    const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8');
    const cache = new Set([...lire('sw.js').matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]));
    const modules = new Set();
    const pile = ['js/main.js'];
    while (pile.length) {
      const m = pile.pop();
      if (modules.has(m)) continue;
      modules.add(m);
      for (const [, cible] of lire(m).matchAll(/(?:from|import)\s*\(?\s*'\.\/([\w-]+\.js)'/g)) pile.push(`js/${cible}`);
    }
    const images = new Set();
    for (const f of ['index.html', 'css/jeu.css', 'manifest.webmanifest', ...modules]) {
      for (const [, img] of lire(f).matchAll(/((?:assets|icons)\/[\w-]+\.(?:webp|png|jpg|svg))/g)) images.add(img);
    }
    const manquants = [...modules, 'index.html', 'css/jeu.css', 'manifest.webmanifest', ...images].filter((f) => !cache.has(f));
    check('hors ligne : le cache garde tous les modules, la feuille de style et les images', manquants.length === 0,
      manquants.join(', ') || `${modules.size} modules, ${images.size} images`);
  }
}

// ---------------------------------------------------------------------------
// Unités figées (septembre, second passage) : villageois plantés devant un
// dépôt, soldats immobiles, cloche sans effet. Chaque cause a son test, écrit
// à partir de la partie ou du script qui l'a montrée.
// ---------------------------------------------------------------------------
{
  const petit = (seed) => { const w = new World({ seed, mapSize: 'small', difficulty: 'normal' }); w.ais = []; return w; };
  const centre = (w, i = 0) => w.buildings.find((b) => b.playerIndex === i && b.type === 'towncenter');
  const cases = (d) => (d / TILE).toFixed(1);
  const pas = (w, s, stop) => { for (let i = 0; i < s * TICKS_PER_SECOND; i++) { w.update(1 / TICKS_PER_SECOND); if (stop && stop()) return true; } return false; };

  // Case du pourtour la plus proche emmurée : on livre par une autre.
  {
    const w = petit(5);
    const tc = centre(w);
    const { tx, ty } = tc;
    w.spawnBuilding(0, 'house', tx + 3, ty - 1, true);
    w.spawnBuilding(0, 'house', tx + 4, ty + 1, true);
    w.spawnBuilding(0, 'house', tx + 3, ty + 3, true);
    w.spawnBuilding(0, 'mill', tx + 1, ty + 3, true);
    const poche = w.map.floodSize(tx + 3, ty + 1, 40);
    const v = w.spawnUnit(0, 'villager', (tx + 8) * TILE + TILE / 2, (ty + 2) * TILE + TILE / 2);
    v.carry = { type: 'wood', amount: 10 };
    v.startReturn();
    const bois = w.players[0].resources.wood;
    let t = 0;
    pas(w, 20, () => { t += 1 / TICKS_PER_SECOND; return w.players[0].resources.wood > bois; });
    check('la case du pourtour la plus proche est murée : le villageois livre par une autre', poche < 40 && w.players[0].resources.wood > bois,
      `poche de ${poche} cases, ${w.players[0].resources.wood > bois ? `livré en ${t.toFixed(1)} s` : `rien livré, état ${v.state}`}`);
  }

  // Maison posée en travers d'un chemin : l'unité recalcule et arrive.
  {
    const w = petit(11);
    for (const u of w.units) u.setStance('passive');
    w.players[0].resources.wood = 5000;
    w.fog.explored.fill(1);
    const map = w.map;
    let depart = null;
    for (let ty = 8; ty < map.h - 8 && !depart; ty++) {
      for (let tx = 4; tx < map.w - 18 && !depart; tx++) {
        let ok = true;
        for (let y = ty - 3; y <= ty + 3 && ok; y++) for (let x = tx; x <= tx + 14 && ok; x++) if (map.isBlocked(x, y) || map.resourceAt(x, y)) ok = false;
        if (ok && w.canPlace(0, 'house', tx + 7, ty, true)) depart = { tx, ty };
      }
    }
    const v = w.spawnUnit(0, 'villager', depart.tx * TILE + TILE / 2, depart.ty * TILE + TILE / 2);
    v.setStance('passive');
    const but = { x: (depart.tx + 13) * TILE + TILE / 2, y: depart.ty * TILE + TILE / 2 };
    v.moveTo(but.x, but.y);
    pas(w, 0.2);
    const maison = w.placeBuilding(0, 'house', depart.tx + 4, depart.ty, []);
    pas(w, 20, () => v.state === STATE.IDLE);
    const reste = dist(v.x, v.y, but.x, but.y);
    check('une maison posée en travers du chemin : l’unité la contourne et arrive', !!maison && v.state === STATE.IDLE && reste < TILE,
      `état ${v.state}, à ${cases(reste)} case(s) du but`);
  }

  // Corps à cheval sur une maison posée tout contre lui : il repart.
  {
    const w = petit(920);
    for (const u of w.units) u.setStance('passive');
    w.players[0].resources.wood = 5000;
    const tc = centre(w);
    let spot = null;
    for (let r = 3; r <= 10 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r && w.canPlace(0, 'house', tc.tx + dx, tc.ty + dy, true)
          && w.map.isOpenTile(tc.tx + dx, tc.ty + dy + 2)) spot = { tx: tc.tx + dx, ty: tc.ty + dy };
    }
    const v = w.spawnUnit(0, 'villager', 0, 0);
    v.setStance('passive');
    v.x = (spot.tx + 1) * TILE; v.y = (spot.ty + 2) * TILE + 3;   // 3 px sous le bord de la future maison
    w.update(1 / TICKS_PER_SECOND);
    w.placeBuilding(0, 'house', spot.tx, spot.ty, []);
    const depart = { x: v.x, y: v.y };
    v.moveTo(v.x, v.y + TILE * 6);
    pas(w, 20);
    const bouge = dist(v.x, v.y, depart.x, depart.y);
    check('un corps à cheval sur une maison posée tout contre lui repart', bouge > TILE * 5, `${cases(bouge)} case(s) parcourue(s)`);
  }

  // Une unité formée n'apparaît pas dans une poche murée.
  {
    const w = petit(5);
    const tc = centre(w);
    const { tx, ty } = tc;
    w.spawnBuilding(0, 'house', tx - 1, ty + 3, true);
    w.spawnBuilding(0, 'house', tx + 2, ty + 3, true);
    w.spawnBuilding(0, 'house', tx + 1, ty + 5, true);
    const sp = tc.spawnPoint();
    const ouvert = w.map.floodSize(Math.floor(sp.x / TILE), Math.floor(sp.y / TILE), 40);
    check('le point d’apparition d’un bâtiment n’est jamais une poche murée', ouvert >= 40, `${ouvert} case(s) atteignable(s) depuis lui`);
  }

  // Une maison qui ferme une poche autour d'un villageois l'en fait sortir.
  {
    const w = petit(5);
    w.fog.explored.fill(1);
    w.players[0].resources.wood = 1000;
    const tc = centre(w);
    const { tx, ty } = tc;
    w.spawnBuilding(0, 'house', tx - 1, ty + 3, true);
    w.spawnBuilding(0, 'house', tx + 2, ty + 3, true);
    const v = w.units.find((u) => u.playerIndex === 0 && u.isVillager);
    for (const u of w.units) u.stop();
    v.x = (tx + 1) * TILE + TILE / 2; v.y = (ty + 4) * TILE + TILE / 2;
    w.update(1 / TICKS_PER_SECOND);
    w.placeBuilding(0, 'house', tx + 1, ty + 5, []);
    const libre = w.map.floodSize(Math.floor(v.x / TILE), Math.floor(v.y / TILE), 40);
    check('une maison qui ferme une poche autour d’un villageois l’en fait sortir', libre >= 40, `${libre} case(s) atteignable(s) depuis lui`);
  }

  // L'ordre de s'abriter n'hérite pas du compteur de blocage d'un trajet
  // précédent (il faisait renoncer deux ticks après l'ordre).
  {
    const w = petit(5);
    const tc = centre(w);
    const v = w.units.find((u) => u.playerIndex === 0 && u.isVillager);
    for (const u of w.units) u.stop();
    v.x = tc.x + TILE * 5; v.y = tc.y;
    v.blockedTime = 6.95;
    v.garrisonAt(tc);
    pas(w, 12, () => !!v.garrisonedIn);
    check('l’ordre de s’abriter ne reprend pas le compteur de blocage d’un trajet précédent', v.garrisonedIn === tc, `état ${v.state}`);
  }

  // Abri injoignable : on n'attend pas indéfiniment devant, et le second coup
  // de cloche renvoie quand même au travail.
  {
    const w = petit(5);
    const tc = centre(w);
    // Un mur de deux cases d'épaisseur tout autour du Centre-Ville.
    for (let y = tc.ty - 2; y <= tc.ty + tc.size + 1; y++) {
      for (let x = tc.tx - 2; x <= tc.tx + tc.size + 1; x++) {
        const dedans = x >= tc.tx && x < tc.tx + tc.size && y >= tc.ty && y < tc.ty + tc.size;
        if (!dedans) w.map.block(x, y, BLOCK.TERRAIN);
      }
    }
    for (const u of w.units) if (u.playerIndex === 0 && u.isVillager && !w.map.canStand(u.x, u.y, u.radius * 0.6)) u.x += TILE * 3;
    const v = w.units.find((u) => u.playerIndex === 0 && u.isVillager);
    for (const u of w.units) u.stop();
    const arbre = w.findNearestResource(v.x, v.y, 'wood', 30 * TILE, 0);
    v.gatherAt(arbre.tx, arbre.ty);
    pas(w, 3);
    w.ringTownBell(0);
    pas(w, 15);
    const renonce = v.state === STATE.IDLE && !v.garrisonedIn;
    w.ringTownBell(0);
    pas(w, 0.2);
    check('un abri injoignable : le villageois y renonce au lieu d’attendre sans fin', renonce, `état ${v.state}`);
    check('et le second coup de cloche le renvoie à son poste', v.state === STATE.GATHER, `état ${v.state}`);
  }

  // L'IA ne mure ni un de ses bâtiments ni un passage.
  {
    const w = new World({ seed: 5, mapSize: 'small', difficulty: 'normal' });
    const ai = w.ais[0];
    const map = w.map;
    // Une zone dégagée loin des bases, entourée d'un mur de terrain (le cadre
    // du test) à deux cases d'un moulin, avec une brèche de deux cases à l'est.
    let z = null;
    for (let ty = 10; ty < map.h - 10 && !z; ty++) {
      for (let tx = 10; tx < map.w - 14 && !z; tx++) {
        let ok = true;
        for (let y = ty - 4; y <= ty + 6 && ok; y++) for (let x = tx - 4; x <= tx + 10 && ok; x++) if (map.isBlocked(x, y) || map.resourceAt(x, y)) ok = false;
        const loin = w.buildings.every((b) => dist(b.x, b.y, tx * TILE, ty * TILE) > 16 * TILE);
        if (ok && loin) z = { tx, ty };
      }
    }
    const { tx, ty } = z;
    w.spawnBuilding(1, 'mill', tx, ty, true);
    for (let y = ty - 2; y <= ty + 3; y++) {
      for (let x = tx - 2; x <= tx + 3; x++) {
        const bord = x === tx - 2 || x === tx + 3 || y === ty - 2 || y === ty + 3;
        const breche = x === tx + 3 && (y === ty || y === ty + 1);
        if (bord && !breche) map.block(x, y, BLOCK.TERRAIN);
      }
    }
    const pose = w.canPlace(1, 'house', tx + 3, ty, true);
    const bouche = ai.laisseLesAcces('house', tx + 3, ty);
    const ailleurs = ai.laisseLesAcces('house', tx + 6, ty + 4);
    check('l’IA ne pose pas une maison qui boucherait l’unique accès d’un moulin', pose && !bouche && ailleurs,
      `pose permise ${pose}, brèche ${bouche ? 'bouchée' : 'refusée'}, ailleurs ${ailleurs ? 'accepté' : 'refusé'}`);
  }
  {
    // Un passage : un mur barre toute la carte, sauf une brèche de deux cases.
    // Une maison posée dans la brèche la couperait en deux.
    const w = new World({ seed: 5, mapSize: 'small', difficulty: 'normal' });
    const map = w.map;
    const r = map.h >> 1;
    let g = -1;
    for (let x = 4; x < map.w - 6 && g < 0; x++) {
      let ok = true;
      for (let y = r - 2; y <= r + 1 && ok; y++) for (let xx = x - 1; xx <= x + 2 && ok; xx++) if (map.isBlocked(xx, y) || map.resourceAt(xx, y)) ok = false;
      if (ok) g = x;
    }
    for (let x = 0; x < map.w; x++) if (x !== g && x !== g + 1) map.block(x, r, BLOCK.TERRAIN);
    const pose = w.canPlace(1, 'house', g, r - 1, true);
    const coupe = w.ais[0].laisseLesAcces('house', g, r - 1);
    check('ni une maison qui couperait la carte en deux', pose && !coupe, `pose permise ${pose}, ${coupe ? 'brèche bouchée' : 'refusée'}`);
  }

  // Parties IA contre IA : aucune unité active ne reste figée (même place,
  // même charge, même cible) 25 s d'affilée.
  {
    const figees = [];
    for (const seed of [1000, 8919]) {
      const w = new World({ seed, mode: 'express', mapSize: 'small', difficulty: 'normal' });
      w.addAI(0); w.players[0].autoWorkers = true;
      const suivi = new Map(), vus = new Set();
      for (let i = 0; i < 600 * TICKS_PER_SECOND && !w.gameOver; i++) {
        w.update(1 / TICKS_PER_SECOND);
        if (i % 10) continue;
        for (const u of w.units) {
          if (u.isAnimal || u.garrisonedIn || u.state === STATE.IDLE) { suivi.delete(u.id); continue; }
          const c = u.target;
          const e = [Math.round(u.x / 8), Math.round(u.y / 8), Math.floor(u.carry.amount), u.state, c ? c.id : '',
            c && c.hp ? Math.floor(c.hp) : '', c && c.buildProgress ? Math.floor(c.buildProgress) : ''].join('|');
          const s = suivi.get(u.id);
          if (!s || s.e !== e) { suivi.set(u.id, { e, t: w.time }); continue; }
          if (w.time - s.t > 25 && !vus.has(u.id)) {
            vus.add(u.id);
            figees.push(`graine ${seed} t=${Math.round(w.time)} ${u.type}#${u.id} ${u.state} en ${Math.floor(u.x / TILE)},${Math.floor(u.y / TILE)}`);
          }
        }
      }
    }
    check('parties IA contre IA : aucune unité figée 25 s dans son travail ou sa marche', figees.length === 0,
      figees.slice(0, 3).join(' ; ') || 'aucune');
  }
}

// ---------------------------------------------------------------------------
// Second passage sur la simulation (septembre).
// ---------------------------------------------------------------------------
{
  const petit = (seed) => { const w = new World({ seed, mapSize: 'small', difficulty: 'normal' }); w.ais = []; return w; };
  const centre = (w, i = 0) => w.buildings.find((b) => b.playerIndex === i && b.type === 'towncenter');
  const pas = (w, s, stop) => { for (let i = 0; i < s * TICKS_PER_SECOND; i++) { w.update(1 / TICKS_PER_SECOND); if (stop && stop()) return true; } return false; };

  // Une ferme occupe le terrain : ni seconde ferme ni maison dessus.
  {
    const w = petit(5);
    w.players[0].resources.wood = 5000;
    const tc = centre(w);
    w.spawnBuilding(0, 'mill', tc.tx + 5, tc.ty, true);
    let spot = null;
    for (let r = 3; r <= 10 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
      if (w.canPlace(0, 'farm', tc.tx + dx, tc.ty + dy, true)) spot = { tx: tc.tx + dx, ty: tc.ty + dy };
    }
    const ferme = w.placeBuilding(0, 'farm', spot.tx, spot.ty, []);
    const ferme2 = w.placeBuilding(0, 'farm', spot.tx, spot.ty, []);
    const maison = w.placeBuilding(0, 'house', spot.tx + 1, spot.ty + 1, []);
    check('on ne bâtit pas sur une ferme, pas même une autre ferme', !!ferme && !ferme2 && !maison,
      `seconde ferme ${!!ferme2}, maison à cheval ${!!maison}`);
    // Et une ferme qui s'épuise ne débouche pas les cases d'un voisin posé
    // dessus (anciennes parties : l'empilement était possible).
    const dessus = w.spawnBuilding(0, 'house', spot.tx, spot.ty, true);
    ferme.addBuildProgress(1e6);
    ferme.takeFarmFood(1e6);
    check('une ferme épuisée ne rend pas traversable la maison posée sur elle', ferme.dead && w.map.isBlocked(dessus.tx, dessus.ty),
      `ferme ${ferme.dead ? 'épuisée' : 'debout'}, case de la maison ${w.map.isBlocked(dessus.tx, dessus.ty) ? 'bloquée' : 'LIBRE'}`);
  }

  // Deux bêtes abattues sur la même case : deux carcasses.
  {
    const w = petit(11);
    const tc = centre(w);
    const cochons = w.units.filter((u) => u.type === 'pig').slice(0, 2);
    const x = (tc.tx + 5) * TILE + TILE / 2, y = (tc.ty + 5) * TILE + TILE / 2;
    for (const c of cochons) { c.x = x; c.y = y; }
    const avant = [...w.map.resources.values()].filter((r) => r.gibier === 'pig').reduce((s, r) => s + r.amount, 0);
    for (const c of cochons) w.killEntity(c, null);
    const apres = [...w.map.resources.values()].filter((r) => r.gibier === 'pig').reduce((s, r) => s + r.amount, 0);
    const attendu = cochons.reduce((s, c) => s + c.def.food, 0);
    check('deux bêtes tombées sur la même case laissent deux carcasses', apres - avant === attendu, `${apres - avant} nourriture sur ${attendu}`);
  }

  // Envoyé sur un autre bosquet dont l'arbre tombe avant son premier coup de
  // hache : il reste dans ce bosquet-là.
  {
    const w = petit(23);
    const map = w.map;
    const v = w.units.find((u) => u.playerIndex === 0 && u.isVillager);
    const tc = centre(w);
    const d = (a, b) => Math.hypot(a.tx - b.tx, a.ty - b.ty);
    const exploitable = (r) => r.type === 'wood' && map.hasOpenNeighbour(r.tx, r.ty);
    const voisins = (r) => [...map.resources.values()].filter((o) => o !== r && exploitable(o) && Math.max(Math.abs(o.tx - r.tx), Math.abs(o.ty - r.ty)) <= 2).length;
    const arbres = [...map.resources.values()].filter((r) => exploitable(r) && voisins(r) >= 2)
      .sort((a, b) => Math.hypot(a.tx * TILE - tc.x, a.ty * TILE - tc.y) - Math.hypot(b.tx * TILE - tc.x, b.ty * TILE - tc.y));
    const A = arbres[0];
    const B = arbres.find((r) => d(r, A) > 12 && Math.hypot(r.tx * TILE - tc.x, r.ty * TILE - tc.y) < 16 * TILE);
    v.gatherAt(A.tx, A.ty);
    pas(w, 60, () => v.carry.amount >= 3);
    v.gatherAt(B.tx, B.ty);
    pas(w, 2);
    map.harvest(B.tx, B.ty, 1e9);
    let apres = null;
    pas(w, 120, () => { if (v.state === STATE.GATHER && v.resourceTile && w.players[0].stats.gathered.wood > 0) { apres = v.resourceTile; return true; } return false; });
    check('l’arbre désigné tombé avant le premier coup : on reste dans son bosquet', !!apres && d(apres, B) < d(apres, A),
      apres ? `reprend à ${d(apres, B).toFixed(1)} case(s) du bosquet désigné, ${d(apres, A).toFixed(1)} de l’ancien` : `état ${v.state}`);
  }

  // La flèche d'un tireur tombé pendant son vol touche aussi dans la partie reprise.
  {
    const w = new World({ seed: 3, mapSize: 'small', difficulty: 'normal' });
    w.ais = [];
    for (const u of w.units) u.setStance('passive');
    const tc = centre(w);
    const cible = w.spawnUnit(0, 'militia', tc.x + TILE * 6, tc.y + TILE * 6);
    cible.setStance('passive');
    const archer = w.spawnUnit(1, 'archer', cible.x + TILE * 4.5, cible.y);
    archer.attackEntity(cible);
    pas(w, 10, () => w.projectiles.length > 0);
    w.killEntity(archer, null, true);
    const r = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    const cr = r.byId.get(cible.id);
    for (let i = 0; i < 2 * TICKS_PER_SECOND; i++) { w.update(1 / TICKS_PER_SECOND); r.update(1 / TICKS_PER_SECOND); }
    check('la flèche d’un tireur mort en vol touche aussi après rechargement', r.projectiles !== undefined && cible.hp === cr.hp,
      `PV ${cible.hp} dans la partie, ${cr.hp} après reprise`);
  }

  // L'IA ne donne pas d'ordres aux villageois abrités.
  {
    const w = new World({ seed: 808, mapSize: 'small', difficulty: 'normal' });
    pas(w, 60);
    const tc = centre(w, 1);
    const v1 = w.units.filter((u) => u.playerIndex === 1 && u.isVillager)
      .sort((a, b) => dist(a.x, a.y, tc.x, tc.y) - dist(b.x, b.y, tc.x, tc.y))[0];
    const raider = w.spawnUnit(0, 'scout', v1.x + TILE, v1.y);
    raider.setStance('passive');
    raider.hp = raider.maxHp = 1e9;
    pas(w, 20, () => {
      raider.x = v1.garrisonedIn ? tc.x + TILE * 3 : v1.x + TILE; raider.y = v1.garrisonedIn ? tc.y : v1.y;
      return w.units.some((u) => u.playerIndex === 1 && u.garrisonedIn);
    });
    w.players[1].resources.wood += 1000;
    const ordres = new Set();
    pas(w, 30, () => {
      raider.x = tc.x + TILE * 4; raider.y = tc.y;
      for (const u of w.units) if (u.playerIndex === 1 && u.garrisonedIn && u.state !== STATE.IDLE) ordres.add(`${u.id}:${u.state}`);
      return false;
    });
    const abrites = w.units.filter((u) => u.playerIndex === 1 && u.garrisonedIn).length;
    check('l’IA ne donne pas d’ordres aux villageois qu’elle a mis à l’abri', abrites > 0 && ordres.size === 0,
      `${abrites} à l’abri, ordres reçus : ${[...ordres].join(' ') || 'aucun'}`);
  }

  // Un ordre plus récent efface le « je livre, puis… » : la cloche ne renvoie
  // pas à un poste abandonné.
  {
    const w = new World({ seed: 8, mapSize: 'small', difficulty: 'normal' });
    w.ais = [];
    w.players[0].resources.wood = 1000;
    w.fog.explored.fill(1);
    const tc = centre(w);
    const v = w.units.find((u) => u.playerIndex === 0 && u.isVillager);
    for (const u of w.units) if (u.playerIndex === 0 && u !== v) u.stop();
    v.carry = { type: 'wood', amount: 8 };
    const or = w.findNearestResource(v.x, v.y, 'gold', 40 * TILE, 0);
    v.gatherAt(or.tx, or.ty);
    let spot = null;
    for (let r = 3; r <= 10 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r && w.canPlace(0, 'house', tc.tx + dx, tc.ty + dy)) spot = { tx: tc.tx + dx, ty: tc.ty + dy };
    }
    const maison = w.placeBuilding(0, 'house', spot.tx, spot.ty, [v]);
    pas(w, 6);
    w.ringTownBell(0);
    pas(w, 20, () => !!v.garrisonedIn);
    w.ringTownBell(0);
    w.update(1 / TICKS_PER_SECOND);
    check('après la cloche, le villageois reprend l’ordre le plus récent (le chantier, pas l’or)', v.target === maison && v.state === STATE.BUILD,
      `état ${v.state}, cible ${v.target ? v.target.type : v.resourceTile ? 'une case' : '-'}`);
  }
}

console.log(`\n${failures === 0 ? '✅ Tous les tests passent' : '❌ ' + failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
