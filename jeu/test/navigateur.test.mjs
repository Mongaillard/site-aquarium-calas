// Test de fumée dans un vrai navigateur (Playwright + Chromium).
// Vérifie que la page se charge sans erreur, que la partie démarre, que le
// rendu tourne à une fréquence correcte et que les gestes tactiles répondent.
//
// Lancement : node jeu/test/navigateur.test.mjs   (nécessite playwright)

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

// Le serveur sert le dossier du jeu, quel que soit le répertoire courant.
const GAME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 8123;
const BASE = `http://127.0.0.1:${PORT}/index.html`;
const SHOTS = process.env.SHOT_DIR || '/tmp';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`[${ok ? '  ok  ' : ' FAIL '}] ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

const server = spawn('npx', ['--yes', 'http-server', GAME_DIR, '-p', String(PORT), '-s', '-c-1'], {
  stdio: 'ignore', detached: true,
});
process.on('exit', () => { try { process.kill(-server.pid); } catch {} });
await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['Pixel 7'], hasTouch: true, isMobile: true });
const page = await context.newPage();

const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

await page.goto(BASE, { waitUntil: 'networkidle' });
check('page chargée', await page.title() === 'Âge des Empires Mobile', await page.title());
await page.screenshot({ path: `${SHOTS}/jeu-accueil.png` });

await page.click('#btn-play');
await page.waitForTimeout(2500);
check('HUD affiché', await page.isVisible('#topbar'));

const state = await page.evaluate(() => {
  const g = window.__jeu;
  return {
    units: g.world.units.length,
    buildings: g.world.buildings.length,
    food: g.world.players[0].resources.food,
    zoom: g.camera.zoom,
    canvasW: g.renderer.canvas.width,
  };
});
check('monde créé', state.units >= 8 && state.buildings >= 2,
  `${state.units} unités, ${state.buildings} bâtiments`);
check('canvas dimensionné', state.canvasW > 300, state.canvasW + ' px');

// Fréquence d'images sur 2 secondes
const fps = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0;
  const t0 = performance.now();
  const tick = () => {
    frames++;
    if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
    else resolve(Math.round((frames * 1000) / (performance.now() - t0)));
  };
  requestAnimationFrame(tick);
}));
check('fluidité', fps >= 30, fps + ' images/s');

// Sélection d'un villageois par tap sur sa position écran
const tapped = await page.evaluate(() => {
  const g = window.__jeu;
  const v = g.world.units.find((u) => u.playerIndex === 0 && u.isVillager);
  const p = g.camera.worldToScreen(v.x, v.y);
  g.tapAt(p.x, p.y, false);
  return g.selection.length;
});
check('sélection au toucher', tapped === 1, tapped + ' entité(s)');

// Ordre de récolte sur l'arbre le plus proche
const gathering = await page.evaluate(async () => {
  const g = window.__jeu;
  const v = g.selection[0];
  const tree = g.world.findNearestResource(v.x, v.y, 'wood', 30 * 32, 0);
  const p = g.camera.worldToScreen(tree.tx * 32 + 16, tree.ty * 32 + 16);
  g.tapAt(p.x, p.y, false);
  return { state: v.state, hasTile: !!v.resourceTile };
});
check('ordre de récolte transmis', gathering.state === 'gather' && gathering.hasTile, gathering.state);

// Menu de construction + pose d'une maison
await page.evaluate(() => window.__jeu.openBuildMenu());
await page.waitForTimeout(200);
check('menu de construction ouvert', await page.isVisible('#build-list'));
const placed = await page.evaluate(() => {
  const g = window.__jeu;
  g.startBuildMode('house');
  const tc = g.world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  // On cherche un emplacement libre autour du Centre-Ville.
  for (let r = 4; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = tc.tx + dx, ty = tc.ty + dy;
        if (g.world.canPlace(0, 'house', tx, ty)) {
          g.updateGhostWorld((tx + 1) * 32, (ty + 1) * 32);
          g.confirmBuild();
          return g.world.buildings.some((b) => b.type === 'house' && b.playerIndex === 0);
        }
      }
    }
  }
  return false;
});
check('maison posée', placed);

// Formation d'un villageois au Centre-Ville
const trained = await page.evaluate(() => {
  const g = window.__jeu;
  const tc = g.world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  g.setSelection([tc]);
  const before = tc.queue.length;
  g.trainUnit(tc, 'villager');
  return tc.queue.length === before + 1;
});
check('production lancée', trained);

// Gestes : pincement (zoom) et glissement (caméra)
const gestures = await page.evaluate(async () => {
  const g = window.__jeu;
  const z0 = g.camera.zoom;
  g.camera.zoomBy(1.4, 200, 300);
  const zoomed = g.camera.zoom > z0;
  const x0 = g.camera.x;
  g.camera.panByScreen(-120, 0);
  return { zoomed, panned: Math.abs(g.camera.x - x0) > 10 };
});
check('zoom', gestures.zoomed);
check('déplacement de la caméra', gestures.panned);

await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/jeu-partie.png` });

// Simulation accélérée : on vérifie qu'une longue partie ne casse rien.
const longRun = await page.evaluate(() => {
  const g = window.__jeu;
  for (let i = 0; i < 20 * 60 * 5; i++) g.world.update(1 / 20);  // 5 minutes de jeu
  return {
    time: Math.round(g.world.time),
    entities: g.world.entities.length,
    over: !!g.world.gameOver,
  };
});
check('5 minutes simulées sans erreur', longRun.time > 280, longRun.time + ' s, ' + longRun.entities + ' entités');
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}/jeu-apres-5min.png` });

// Gestes réels : un vrai tap tactile doit sélectionner l'unité touchée.
await page.evaluate(() => {
  const g = window.__jeu;
  g.setSelection([]);
  const v = g.world.units.find((u) => u.playerIndex === 0 && u.isVillager);
  g.camera.centerOn(v.x, v.y);
  window.__cible = v.id;
});
const target = await page.evaluate(() => {
  const g = window.__jeu;
  const v = g.world.byId.get(window.__cible);
  const p = g.camera.worldToScreen(v.x, v.y);
  return { x: Math.round(p.x), y: Math.round(p.y) };
});
await page.touchscreen.tap(target.x, target.y);
await page.waitForTimeout(150);
const tapSelection = await page.evaluate(() => window.__jeu.selection.map((e) => e.id));
check('tap tactile réel', tapSelection.length === 1, tapSelection.length + ' sélection(s)');

// Glissement à la souris : rectangle de sélection (chemin « bureau »).
await page.evaluate(() => window.__jeu.setSelection([]));
await page.mouse.move(target.x - 90, target.y - 90);
await page.mouse.down();
await page.mouse.move(target.x + 90, target.y + 90, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(150);
const boxSelection = await page.evaluate(() => window.__jeu.selection.length);
check('sélection rectangulaire', boxSelection >= 1, boxSelection + ' unité(s)');

// Affectation manuelle des ouvriers
check('barre des ouvriers visible', await page.isVisible('#worker-bar'));
const before = await page.evaluate(() => window.__jeu.workerStats());
await page.click('#btn-workers');
await page.waitForTimeout(200);
check('panneau d’affectation ouvert', await page.isVisible('#worker-list'));
check('affectation manuelle par défaut',
  (await page.isChecked('#auto-workers')) === false);

await page.click('[data-give="wood"]');
await page.waitForTimeout(400);
const afterGive = await page.evaluate(() => window.__jeu.workerStats());
check('un ouvrier envoyé au bois', afterGive.wood > before.wood,
  `${before.wood} → ${afterGive.wood}`);

await page.click('[data-take="wood"]');
await page.waitForTimeout(300);
const afterTake = await page.evaluate(() => window.__jeu.workerStats());
check('un ouvrier retiré du bois', afterTake.wood < afterGive.wood,
  `${afterGive.wood} → ${afterTake.wood}`);

await page.click('[data-select="wood"]');
await page.waitForTimeout(250);
const grouped = await page.evaluate(() => window.__jeu.selection.length);
check('sélection du groupe « bois »', grouped >= 1, grouped + ' villageois');
check('panneau refermé après sélection', await page.isHidden('#worker-list'));

// Le compteur de la barre suit l'état réel
const barCount = await page.evaluate(() => ({
  affiche: Number(document.getElementById('wk-wood').textContent),
  reel: window.__jeu.workerStats().wood,
}));
check('compteur de la barre à jour', barCount.affiche === barCount.reel,
  `barre=${barCount.affiche} réel=${barCount.reel}`);

// Appui long → sélection rectangulaire, malgré le tremblement du doigt.
// (Le seuil portait autrefois sur la distance CUMULÉE : les micro-mouvements
// d'un doigt posé annulaient l'appui long avant qu'il ne se déclenche.)
const longPress = await page.evaluate(async () => {
  const g = window.__jeu;
  const canvas = document.getElementById('game');
  const rect = canvas.getBoundingClientRect();
  g.setSelection([]);
  const tc = g.world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  g.camera.centerOn(tc.x, tc.y);
  const villagers = g.world.units
    .filter((u) => u.playerIndex === 0 && u.isVillager && !u.garrisonedIn)
    .map((u) => g.camera.worldToScreen(u.x, u.y))
    .filter((p) => p.x > 40 && p.y > 40 && p.x < rect.width - 40 && p.y < rect.height - 120);
  if (villagers.length < 2) return { skipped: true };
  const minX = Math.min(...villagers.map((p) => p.x)) - 30;
  const minY = Math.min(...villagers.map((p) => p.y)) - 30;
  const maxX = Math.max(...villagers.map((p) => p.x)) + 30;
  const maxY = Math.max(...villagers.map((p) => p.y)) + 30;

  const send = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
    pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true,
    clientX: rect.left + x, clientY: rect.top + y,
  }));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  send('pointerdown', minX, minY);
  // Doigt posé : il tremble de un à trois pixels, sans jamais s'écarter.
  for (let i = 0; i < 26; i++) {
    await wait(20);
    send('pointermove', minX + (i % 2 ? 2 : -2), minY + (i % 3 ? 1 : -2));
  }
  const armed = !!g.renderer.selectionBox;
  // Puis on trace le rectangle.
  for (let i = 1; i <= 10; i++) {
    send('pointermove', minX + ((maxX - minX) * i) / 10, minY + ((maxY - minY) * i) / 10);
  }
  send('pointerup', maxX, maxY);
  return { armed, selected: g.selection.length };
});
check('appui long : le rectangle s’arme malgré le tremblement',
  longPress.skipped || longPress.armed, longPress.skipped ? 'ignoré' : String(longPress.armed));
check('appui long : la sélection multiple fonctionne',
  longPress.skipped || longPress.selected >= 2,
  longPress.skipped ? 'ignoré' : longPress.selected + ' unités');

// Attitudes de combat (principe d'AoE)
const stanceCheck = await page.evaluate(() => {
  const g = window.__jeu;
  const soldier = g.world.spawnUnit(0, 'militia', g.camera.x, g.camera.y);
  g.setSelection([soldier]);
  return { id: soldier.id, stance: soldier.stance };
});
check('attitude par défaut : agressif', stanceCheck.stance === 'aggressive', stanceCheck.stance);
await page.waitForTimeout(250);
const stanceButtons = await page.$$eval('#command-panel .cmd .cmd-label',
  (els) => els.map((e) => e.textContent));
check('les quatre attitudes sont proposées',
  ['Agressif', 'Défensif', 'Tenir', 'Passif'].every((n) => stanceButtons.includes(n)),
  stanceButtons.join(', '));

const standIndex = stanceButtons.indexOf('Tenir');
await page.click(`#command-panel .cmd:nth-of-type(${standIndex + 1})`);
await page.waitForTimeout(200);
const newStance = await page.evaluate(() => window.__jeu.selection[0].stance);
check('changement d’attitude au doigt', newStance === 'standGround', newStance);

// Garnison : bouton « Abriter » puis appui sur le Centre-Ville
const garrisoned = await page.evaluate(async () => {
  const g = window.__jeu;
  const tc = g.world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const villagers = g.world.units
    .filter((u) => u.playerIndex === 0 && u.isVillager && !u.garrisonedIn).slice(0, 2);
  g.setSelection(villagers);
  g.toggleGarrison();
  const armed = g.garrisonArmed;
  const p = g.camera.worldToScreen(tc.x, tc.y);
  g.tapAt(p.x, p.y, false);
  const ordered = villagers.filter((v) => v.state === 'garrison').length;
  for (let i = 0; i < 20 * 30; i++) {
    g.world.update(1 / 20);
    if (tc.garrison.length >= ordered && ordered > 0) break;
  }
  return { armed, ordered, inside: tc.garrison.length, arrows: tc.arrowCount() };
});
check('mode « abriter » armé', garrisoned.armed);
check('le refuge désigné reçoit les unités', garrisoned.ordered >= 1,
  garrisoned.ordered + ' villageois envoyés');
check('les occupants sont bien entrés', garrisoned.inside >= 1, garrisoned.inside + ' à l’intérieur');
check('le Centre-Ville occupé tire', garrisoned.arrows >= 1, garrisoned.arrows + ' flèche(s)');

// Cloche du village depuis le panneau du Centre-Ville
const bell = await page.evaluate(() => {
  const g = window.__jeu;
  const tc = g.world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  g.setSelection([tc]);
  const before = tc.garrison.length;
  g.ringTownBell();           // premier coup : libère (des unités sont déjà dedans)
  return { before, after: tc.garrison.length };
});
check('la cloche libère la garnison', bell.after < bell.before || bell.before === 0,
  `${bell.before} → ${bell.after}`);

// Des soldats qui touchent un abri allié s'y réfugient directement.
const soldierShelter = await page.evaluate(() => {
  const g = window.__jeu;
  const tc = g.world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const soldier = g.world.spawnUnit(0, 'militia', tc.x + 96, tc.y + 96);
  g.setSelection([soldier]);
  const p = g.camera.worldToScreen(tc.x, tc.y);
  g.tapAt(p.x, p.y, false);
  return soldier.state;
});
check('appui direct : les soldats se réfugient', soldierShelter === 'garrison', soldierShelter);

// Menu pause
await page.evaluate(() => window.__jeu.togglePause());
await page.waitForTimeout(150);
check('menu pause affiché', await page.isVisible('.modal-card'));
check('partie en pause', await page.evaluate(() => window.__jeu.paused));
await page.click('[data-act="help"]');
await page.waitForTimeout(120);
check('aide affichée', (await page.textContent('.modal-card')).includes('Comment jouer'));
await page.click('[data-act="close"]');
await page.waitForTimeout(120);
await page.evaluate(() => window.__jeu.togglePause());

// Écran de fin (on abandonne volontairement)
await page.evaluate(() => window.__jeu.resign());
await page.waitForTimeout(300);
const endText = await page.textContent('.modal-card');
check('écran de fin affiché', endText.includes('Défaite') && endText.includes('Ressources récoltées'));

check('aucune erreur console', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
try { process.kill(-server.pid); } catch {}
console.log(`\n${failures === 0 ? '✅ Navigateur : tous les tests passent' : '❌ ' + failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
