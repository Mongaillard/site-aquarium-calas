// Test de simulation sans navigateur : deux IA s'affrontent, on vérifie que
// l'économie tourne, que les bâtiments sortent et que rien n'explose.
// Lancement : node jeu/test/simulation.test.js

import { World } from '../js/game.js';
import { AIPlayer } from '../js/ai.js';
import { DIFFICULTIES, TICKS_PER_SECOND, TILE } from '../js/config.js';
import { formatTime, dist } from '../js/utils.js';

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
check('population cohérente', world.players.every((p) => p.pop === world.units.filter((u) => u.playerIndex === p.index).length));

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

console.log(`\n${failures === 0 ? '✅ Tous les tests passent' : '❌ ' + failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
