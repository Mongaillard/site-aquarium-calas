// Test de simulation sans navigateur : deux IA s'affrontent, on vérifie que
// l'économie tourne, que les bâtiments sortent et que rien n'explose.
// Lancement : node jeu/test/simulation.test.js

import { World } from '../js/game.js';
import { AIPlayer } from '../js/ai.js';
import { DIFFICULTIES, TICKS_PER_SECOND } from '../js/config.js';
import { formatTime } from '../js/utils.js';

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
  check(`joueur ${p.index} progresse en âge`, p.age >= 1, 'âge ' + (p.age + 1));
}
check('des villageois travaillent encore', r0.villagers > 0 && r1.villagers > 0);
check('des combats ont eu lieu', combats > 0, combats + ' entités détruites');
check('aucune entité fantôme', world.entities.every((e) => !e.dead));
check('population cohérente', world.players.every((p) => p.pop === world.units.filter((u) => u.playerIndex === p.index).length));

// Deuxième partie, carte et difficulté différentes : on vérifie la robustesse.
const alt = runMatch({ seed: 777, mapSize: 'small', difficulty: 'hard', minutes: 6 });
check('seconde partie stable', alt.world.time > 60, formatTime(alt.world.time));
check('carte connectée (pas de blocage total)', alt.world.pathfinder.searches > 50,
  alt.world.pathfinder.searches + ' recherches');

console.log(`\n${failures === 0 ? '✅ Tous les tests passent' : '❌ ' + failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
