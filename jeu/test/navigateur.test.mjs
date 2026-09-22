// Test de fumée dans un vrai navigateur (Playwright + Chromium).
// Vérifie que la page se charge sans erreur, que la partie démarre, que le
// rendu tourne à une fréquence correcte et que les gestes tactiles répondent.
//
// Lancement : node jeu/test/navigateur.test.mjs   (nécessite playwright)

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { BUILDING_TYPES } from '../js/config.js';

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

// L'icône de l'onglet ne doit rien laisser traîner : un reste de balisage
// fermait l'en-tête, la feuille de style tombait dans le corps de la page.
const entete = await page.evaluate(() => ({
  feuille: !!document.head.querySelector('link[rel="stylesheet"]'),
  textes: [...document.body.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).length,
}));
check('l’en-tête garde sa feuille de style, le corps aucun texte parasite', entete.feuille && entete.textes === 0, JSON.stringify(entete));

// Aucune clé d'icône ne doit s'afficher en toutes lettres : « express Express »
// au lieu du pictogramme, c'est le défaut que ce contrôle attrape.
const ecranAccueil = await page.evaluate(() => {
  const carte = document.querySelector('.start-card');
  return { texte: carte.innerText, traces: carte.querySelectorAll('svg.ic').length };
});
check('l’accueil ne montre aucune clé d’icône en clair',
  !/\b(modeExpress|modeClassique|towncenter|villager|aggressive)\b/.test(ecranAccueil.texte),
  ecranAccueil.texte.split('\n').filter((l) => /mode[EC]/.test(l)).join(' | ') || 'propre');
check('les formats de partie ont leur pictogramme', ecranAccueil.traces >= 2,
  ecranAccueil.traces + ' tracés');


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

// Les deux styles de personnage cohabitent et se changent en cours de partie.
const styles = await page.evaluate(async () => {
  const g = window.__jeu;
  const mod = await import('./js/sprites.js');
  const avant = mod.spriteDe('militia').def.src;
  g.setStyleUnites('peint');
  await new Promise((r) => setTimeout(r, 900));
  const apres = mod.spriteDe('militia').def.src;
  g.setStyleUnites('anime');
  await new Promise((r) => setTimeout(r, 400));
  return { avant, apres, retour: mod.spriteDe('militia').def.src, choix: mod.STYLES.length };
});
check('deux styles de personnage sont proposés', styles.choix === 2, styles.choix + ' styles');
check('le style bascule en cours de partie',
  styles.avant !== styles.apres && styles.retour === styles.avant,
  `${styles.avant.split('/').pop()} → ${styles.apres.split('/').pop()} → ${styles.retour.split('/').pop()}`);

// La marche ne doit pas trembler : la simulation avance vingt fois par seconde
// quand l'écran en affiche soixante, et cadencer l'animation sur la distance
// brute d'une image à l'autre faisait vibrer les personnages.
const cadence = await page.evaluate(async () => {
  const g = window.__jeu;
  const tc = g.world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  g.paused = false;
  const v = g.world.units.find((u) => u.playerIndex === 0 && u.isVillager && !u.garrisonedIn && !u.dead);
  if (!v) return { moy: 0, irregularite: 99, parcouru: 0 };
  v.moveTo(tc.x + 380, tc.y + 30);
  g.camera.centerOn(v.x, v.y);
  await new Promise((r) => setTimeout(r, 800));
  const depart = { x: v.x, y: v.y };
  const phases = [];
  for (let i = 0; i < 70; i++) { await new Promise(requestAnimationFrame); phases.push(v._walk || 0); }
  const parcouru = Math.hypot(v.x - depart.x, v.y - depart.y);
  const pas = [];
  for (let i = 1; i < phases.length; i++) {
    let d = phases[i] - phases[i - 1];
    if (d < -3) d += Math.PI * 2;
    pas.push(d);
  }
  const moy = pas.reduce((s, x) => s + x, 0) / pas.length;
  const ecart = Math.sqrt(pas.reduce((s, x) => s + (x - moy) ** 2, 0) / pas.length);
  return { moy, parcouru, irregularite: moy > 0 ? ecart / moy : 99 };
});
check('le villageois se déplace pour la mesure', cadence.parcouru > 8,
  Math.round(cadence.parcouru) + ' px parcourus');
check('la cadence de marche est régulière', cadence.irregularite < 0.45,
  'irrégularité ' + cadence.irregularite.toFixed(2) + ' (un à-coup par image donnerait 1,4)');


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

// Chantiers : file d'attente et renforts, depuis l'interface.
const chantiers = await page.evaluate(() => {
  const g = window.__jeu;
  g.world.players[0].resources.wood = 1000;
  const tc = g.world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const spots = [];
  for (let r = 3; r <= 12 && spots.length < 2; r++) {
    for (let dy = -r; dy <= r && spots.length < 2; dy++) {
      for (let dx = -r; dx <= r && spots.length < 2; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = tc.tx + dx, ty = tc.ty + dy;
        if (!g.world.canPlace(0, 'house', tx, ty)) continue;
        if (spots.some((s2) => Math.abs(s2.tx - tx) < 3 && Math.abs(s2.ty - ty) < 3)) continue;
        spots.push({ tx, ty });
      }
    }
  }
  if (spots.length < 2) return { skipped: true };

  // Deux villageois sélectionnés : ils doivent TOUS deux aller bâtir.
  const equipe = g.world.units
    .filter((u) => u.playerIndex === 0 && u.isVillager && !u.garrisonedIn).slice(0, 2);
  g.setSelection(equipe);

  g.startBuildMode('house');
  g.updateGhostWorld((spots[0].tx + 1) * 32, (spots[0].ty + 1) * 32);
  g.confirmBuild();
  const surLePremier = equipe.filter((v) => v.state === 'build').length;

  g.setSelection(equipe);
  g.startBuildMode('house');
  g.updateGhostWorld((spots[1].tx + 1) * 32, (spots[1].ty + 1) * 32);
  g.confirmBuild();

  const enFile = equipe.map((v) => v.buildQueue.length);
  const premier = g.world.buildings.find((b) => b.tx === spots[0].tx && b.ty === spots[0].ty);
  const second = g.world.buildings.find((b) => b.tx === spots[1].tx && b.ty === spots[1].ty);
  for (let i = 0; i < 20 * 200 && !(premier.complete && second.complete); i++) g.world.update(1 / 20);
  return {
    surLePremier, enFile,
    ouvriers: premier.builderCount,
    finis: premier.complete && second.complete,
  };
});
check('les villageois sélectionnés vont tous bâtir',
  chantiers.skipped || chantiers.surLePremier === 2,
  chantiers.skipped ? 'ignoré' : chantiers.surLePremier + ' ouvriers');
check('une seconde pose part en file',
  chantiers.skipped || chantiers.enFile.every((n) => n === 1),
  chantiers.skipped ? 'ignoré' : JSON.stringify(chantiers.enFile));
check('les deux chantiers aboutissent',
  chantiers.skipped || chantiers.finis, chantiers.skipped ? 'ignoré' : String(chantiers.finis));

// Affecter un ouvrier à un chantier au doigt : on touche le villageois, puis
// le chantier — exactement le geste qui l'envoie couper du bois.
const auChantier = await page.evaluate(() => {
  const g = window.__jeu;
  g.world.players[0].resources.wood = 1000;
  const tc = g.world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  let spot = null;
  // Au sud du palais de préférence : au nord, le chantier passerait derrière
  // les dômes, et c'est le palais qu'on toucherait — à juste titre.
  for (let r = 3; r <= 12 && !spot; r++) {
    for (let dy = r; dy >= -r && !spot; dy--) {
      for (let dx = -r; dx <= r && !spot; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (g.world.canPlace(0, 'house', tc.tx + dx, tc.ty + dy)) spot = { tx: tc.tx + dx, ty: tc.ty + dy };
      }
    }
  }
  if (!spot) return { skipped: true };
  const site = g.world.placeBuilding(0, 'house', spot.tx, spot.ty, []);
  const v = g.world.units.find(
    (u) => u.playerIndex === 0 && u.isVillager && !u.garrisonedIn && u.state !== 'build');
  v.stop();
  // L'ouvrier se tient à trois cases du chantier : sous le doigt, une unité
  // passe avant un bâtiment, et il n'est pas question de toucher l'ouvrier.
  v.x = site.x - 3 * 32; v.y = site.y + 3 * 32;
  g.setSelection([v]);
  g.camera.centerOn(site.x, site.y);
  window.__chantier = site.id;
  window.__ouvrier = v.id;
  const p = g.camera.worldToScreen(site.x, site.y);
  return { x: Math.round(p.x), y: Math.round(p.y) };
});
if (!auChantier.skipped) {
  await page.touchscreen.tap(auChantier.x, auChantier.y);
  await page.waitForTimeout(200);
}
const affecte = auChantier.skipped ? null : await page.evaluate(() => {
  const g = window.__jeu;
  const site = g.world.byId.get(window.__chantier);
  const v = g.world.byId.get(window.__ouvrier);
  return { etat: v.state, surLeChantier: v.target === site, compte: g.world.buildersOn(site) };
});
check('appui sur un chantier : l’ouvrier y est affecté',
  auChantier.skipped || (affecte.etat === 'build' && affecte.surLeChantier),
  auChantier.skipped ? 'ignoré' : `état « ${affecte.etat} »`);
check('le chantier affiche son renfort',
  auChantier.skipped || affecte.compte === 1,
  auChantier.skipped ? 'ignoré' : affecte.compte + ' ouvrier(s)');

// Et depuis le panneau d'affectation : la ligne « Chantiers » a son +/−.
await page.click('#btn-workers');
await page.waitForTimeout(200);
const avantChantier = await page.evaluate(() => window.__jeu.workerStats().build);
await page.click('[data-give="build"]');
await page.waitForTimeout(400);
const apresChantier = await page.evaluate(() => window.__jeu.workerStats().build);
check('la ligne « Chantiers » envoie du renfort', apresChantier > avantChantier,
  `${avantChantier} → ${apresChantier}`);
await page.click('[data-take="build"]');
await page.waitForTimeout(300);
const apresRetrait = await page.evaluate(() => window.__jeu.workerStats().build);
check('la ligne « Chantiers » en retire aussi', apresRetrait < apresChantier,
  `${apresChantier} → ${apresRetrait}`);
await page.click('#btn-close-workers');
await page.waitForTimeout(150);

// Les pictogrammes sont des tracés vectoriels, plus aucun emoji dans l'interface :
// un emoji se dessine différemment sur chaque téléphone.
const pictos = await page.evaluate(() => {
  const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2190}-\u{27BF}]/u;
  const fautifs = [];
  const hud = document.getElementById('hud');
  const promenade = document.createTreeWalker(hud, NodeFilter.SHOW_TEXT);
  for (let n = promenade.nextNode(); n; n = promenade.nextNode()) {
    if (emoji.test(n.textContent)) fautifs.push(n.textContent.trim().slice(0, 40));
  }
  return { traces: hud.querySelectorAll('svg.ic').length, fautifs };
});
check('l’interface est pavée d’icônes vectorielles', pictos.traces >= 10, pictos.traces + ' tracés');
check('plus aucun emoji dans le HUD', pictos.fautifs.length === 0, pictos.fautifs.join(' | '));

// Et le canvas dessine bien les pictogrammes des bâtiments.
const surCarte = await page.evaluate(() => {
  const g = window.__jeu;
  const tc = g.world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  return { icone: tc.def.icon, trace: !!g.renderer.constructor.prototype.dessinerIcone };
});
check('les bâtiments ont une icône vectorielle',
  surCarte.icone === 'towncenter' && surCarte.trace, JSON.stringify(surCarte));

// Les crédits sont accessibles depuis le menu : la licence CC BY l'exige.
await page.click('#btn-menu');
await page.waitForTimeout(250);
await page.click('text=Crédits');
await page.waitForTimeout(300);
const credits = await page.textContent('.modal-card');
check('l’écran des crédits cite la licence des icônes',
  /game-icons/.test(credits) && /CC BY 3\.0/.test(credits));
check('il cite aussi les auteurs', /Delapouite/.test(credits) && /Lorc/.test(credits));
await page.click('.modal-card [data-act="close"]');
await page.waitForTimeout(200);
await page.click('[data-act="resume"]').catch(() => {});
await page.waitForTimeout(200);
await page.evaluate(() => { window.__jeu.paused = false; window.__jeu.ui.hideModal(); });

// Le milicien porte une illustration : huit orientations, et une version
// adverse teintée. C'est aussi la garantie que l'atlas se charge.
const chevalier = await page.evaluate(async () => {
  const g = window.__jeu;
  const mod = await import('./js/sprites.js');
  const s = mod.spriteDe('militia');
  return {
    pret: !!s,
    adverse: !!(s && s.variantes && s.variantes.rouge && s.variantes.bleu),
    images: (mod.spriteDe('militia') || {}).def?.images,
    // Huit images doivent défiler sur un cycle complet, et revenir à zéro.
    cycleComplet: (() => {
      const def = (mod.spriteDe('militia') || {}).def;
      if (!def) return false;
      const vues = new Set();
      for (let d = 0; d < def.cycle; d += def.cycle / 32) vues.add(mod.imageDeMarche(def, d, true));
      return vues.size === def.images;
    })(),
    marcheSuitLaDistance: (() => {
      const def = (mod.spriteDe('militia') || {}).def;
      if (!def) return false;
      // Deux distances différentes donnent deux images différentes.
      return mod.imageDeMarche(def, 0, true) !== mod.imageDeMarche(def, def.cycle / 2, true);
    })(),
    arretPoseZero: (() => {
      const def = (mod.spriteDe('militia') || {}).def;
      return !!def && mod.imageDeMarche(def, 999, false) === 0;
    })(),
    lancier: !!mod.spriteDe('spearman'),
    lancierPixel: !!(mod.spriteDe('spearman') || {}).def?.pixel,
    lancierDeuxCamps: (() => {
      const l = mod.spriteDe('spearman');
      if (!l) return false;
      // Les deux camps doivent recevoir une image, et pas la même.
      return !!mod.imagePourJoueur(l, 0) && !!mod.imagePourJoueur(l, 1)
        && mod.imagePourJoueur(l, 0) !== mod.imagePourJoueur(l, 1);
    })(),
    // Le sud est la première case (le personnage fait face au joueur), puis on
    // tourne par l'est : on le lit à la cape, toujours dans le dos.
    sud: mod.caseDirection(Math.PI / 2, 8),
    est: mod.caseDirection(0, 8),
    nord: mod.caseDirection(-Math.PI / 2, 8),
    ouest: mod.caseDirection(Math.PI, 8),
    // Une orientation quelconque doit toujours tomber dans l'atlas.
    bornes: [...Array(36)].every((_, i) => {
      const c = mod.caseDirection((i * 10 * Math.PI) / 180 - Math.PI, 8);
      return Number.isInteger(c) && c >= 0 && c < 8;
    }),
  };
});
check('l’illustration du milicien est chargée', chevalier.pret);
check('sa version adverse est préparée', chevalier.adverse);
check('le milicien a une marche animée',
  chevalier.images === 8 && chevalier.cycleComplet,
  chevalier.images + ' images par direction');
check('l’image de marche suit la distance, pas l’horloge', chevalier.marcheSuitLaDistance);
check('une unité à l’arrêt reprend sa pose de repos', chevalier.arretPoseZero);
check('le lancier a son atlas en pixel art',
  chevalier.lancier && chevalier.lancierPixel && chevalier.lancierDeuxCamps,
  JSON.stringify({ pret: chevalier.lancier, pixel: chevalier.lancierPixel }));
// La recoloration d'équipe doit prendre le bouclier SANS emporter l'acier :
// l'armure du chevalier est un acier bleuté, qu'un échange de canaux ferait
// virer au cuivre. On compare les deux variantes pixel à pixel.
const recolor = await page.evaluate(async () => {
  const mod = await import('./js/sprites.js');
  const s = mod.spriteDe('militia');
  if (!s) return null;
  const lire = (src) => {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    return x.getImageData(0, 0, c.width, c.height).data;
  };
  const bleu = lire(mod.imagePourJoueur(s, 0));
  const rouge = lire(mod.imagePourJoueur(s, 1));
  const hsl = (r, g, b) => {
    const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
    const l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn;
    const sa = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const R = r / 255, G = g / 255, B = b / 255;
    let h;
    if (mx === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
    else if (mx === G) h = ((B - R) / d + 2) / 6;
    else h = ((R - G) / d + 4) / 6;
    return [h * 360, sa, l];
  };
  let opaques = 0, changes = 0, acier = 0, acierIntact = 0, bleusRestants = 0;
  for (let i = 0; i < bleu.length; i += 4) {
    if (bleu[i + 3] === 0) continue;
    opaques++;
    const memes = bleu[i] === rouge[i] && bleu[i + 1] === rouge[i + 1] && bleu[i + 2] === rouge[i + 2];
    if (!memes) changes++;
    const [hb, sb] = hsl(bleu[i], bleu[i + 1], bleu[i + 2]);
    // Acier : bleuté mais peu saturé — c'est lui qu'une règle trop large mange.
    if (sb <= 0.32) { acier++; if (memes) acierIntact++; }
    const [hr, sr] = hsl(rouge[i], rouge[i + 1], rouge[i + 2]);
    if (hr >= 200 && hr <= 255 && sr > 0.32) bleusRestants++;
    void hb;
  }
  return { opaques, changes, acier, acierIntact, bleusRestants };
});
check('la variante adverse repeint le bouclier',
  recolor && recolor.changes > recolor.opaques * 0.08,
  recolor && `${Math.round((recolor.changes / recolor.opaques) * 100)} % des pixels repeints`);
check('la recoloration épargne l’acier de l’armure',
  recolor && recolor.acier > 500 && recolor.acierIntact === recolor.acier,
  recolor && `${recolor.acierIntact}/${recolor.acier} pixels d’acier intacts`);
check('il ne reste aucun bleu franc côté adverse',
  recolor && recolor.bleusRestants === 0,
  recolor && recolor.bleusRestants + ' pixels bleus restants');

// Les bâtiments illustrés : chargés, déclinés pour les deux camps, et
// recolorés sans toucher la pierre blanche ni l'eau.
const batimentsIllustres = await page.evaluate(async () => {
  const mod = await import('./js/sprites.js');
  const { BUILDING_TYPES, TILE } = await import('./js/config.js');
  const lire = (src) => {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    return x.getImageData(0, 0, c.width, c.height).data;
  };
  const hsl = (r, g, b) => {
    const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
    const l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn;
    const sa = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const R = r / 255, G = g / 255, B = b / 255;
    let h;
    if (mx === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
    else if (mx === G) h = ((B - R) / d + 2) / 6;
    else h = ((R - G) / d + 4) / 6;
    return [h * 360, sa, l];
  };
  const out = {};
  for (const type of Object.keys(BUILDING_TYPES)) {
    const s = mod.spriteDe(type);
    if (!s) { out[type] = null; continue; }
    const bleu = lire(mod.imagePourJoueur(s, 0)), rouge = lire(mod.imagePourJoueur(s, 1));
    let opaques = 0, changes = 0, pierre = 0, pierreIntacte = 0, bleusRestants = 0;
    for (let i = 0; i < bleu.length; i += 4) {
      if (bleu[i + 3] === 0) continue;
      opaques++;
      const memes = bleu[i] === rouge[i] && bleu[i + 1] === rouge[i + 1] && bleu[i + 2] === rouge[i + 2];
      if (!memes) changes++;
      const [, sb, lb] = hsl(bleu[i], bleu[i + 1], bleu[i + 2]);
      if (sb <= 0.32 && lb > 0.6) { pierre++; if (memes) pierreIntacte++; }
      const [hr, sr] = hsl(rouge[i], rouge[i + 1], rouge[i + 2]);
      if (hr >= 200 && hr <= 255 && sr > 0.32) bleusRestants++;
    }
    // L'illustration déborde de l'emprise (dômes, toits) : elle doit être
    // plus large que les cases que le bâtiment occupe vraiment.
    out[type] = { largeur: s.def.largeurMonde, emprise: BUILDING_TYPES[type].size * TILE, opaques, changes, pierre, pierreIntacte, bleusRestants };
  }
  return out;
});
const NOMS = {
  towncenter: 'le Centre-Ville', barracks: 'la caserne', house: 'la maison', mill: 'le moulin', lumbercamp: 'le camp de bûcherons',
  miningcamp: 'le camp minier', farm: 'la ferme', archery: 'l’archerie', stable: 'l’écurie', siege: 'l’atelier de siège', blacksmith: 'la forge', tower: 'la tour de guet',
};
for (const [type, nom] of Object.entries(NOMS)) {
  const b = batimentsIllustres[type];
  const e = BUILDING_TYPES[type].fem ? 'e' : '';
  check(`${nom} porte son illustration`, !!b && b.largeur > b.emprise, b ? `${b.largeur} px de large pour une emprise de ${b.emprise}` : 'absente');
  check(`${nom} advers${e} est repeint${e}`, !!b && b.changes > b.opaques * 0.02, b && `${Math.round((b.changes / b.opaques) * 100)} % des pixels`);
  check(`la pierre blanche reste blanche (${type})`, !!b && b.pierre > 500 && b.pierreIntacte === b.pierre, b && `${b.pierreIntacte}/${b.pierre} pixels de pierre intacts`);
  check(`aucun bleu franc ne subsiste côté adverse (${type})`, !!b && b.bleusRestants === 0, b && b.bleusRestants + ' pixels bleus restants');
}

// Deux tronçons voisins se recouvrent de 8 px monde sur les MÊMES texels :
// leurs pixels doivent y coïncider, rivages compris — sinon une couture
// droite traverse le sol au bord du tronçon.
const coutures = await page.evaluate(() => {
  const g = window.__jeu; const r = g.renderer; const map = g.world.map; const T = 32;
  const nappes = r.nappesPour(1);
  const taille = 8 * T, rec = 8, ech = 2, cote = (taille + 2 * rec) * ech, bande = 2 * rec * ech;
  const ncx = Math.ceil(map.w / 8), ncy = Math.ceil(map.h / 8);
  const lire = (c) => c.getContext('2d').getImageData(0, 0, cote, cote).data;
  // une vingtaine de paires, réparties, en privilégiant celles qui touchent l'eau
  const paires = [];
  for (let cy = 0; cy < ncy - 1; cy += 2) for (let cx = 0; cx < ncx - 1; cx += 2) paires.push([cx, cy]);
  let pire = 0, n = 0;
  for (const [cx, cy] of paires.slice(0, 24)) {
    const a = lire(r.rendreTroncon(cx, cy, ech, nappes)), b = lire(r.rendreTroncon(cx + 1, cy, ech, nappes)), c = lire(r.rendreTroncon(cx, cy + 1, ech, nappes));
    let s = 0, k = 0;
    for (let y = 0; y < cote; y += 3) for (let x = 0; x < bande; x++) { const ia = (y * cote + cote - bande + x) * 4, ib = (y * cote + x) * 4; s += Math.abs(a[ia] - b[ib]) + Math.abs(a[ia + 1] - b[ib + 1]) + Math.abs(a[ia + 2] - b[ib + 2]); k++; }
    for (let x = 0; x < cote; x += 3) for (let y = 0; y < bande; y++) { const ia = ((cote - bande + y) * cote + x) * 4, ic = (y * cote + x) * 4; s += Math.abs(a[ia] - c[ic]) + Math.abs(a[ia + 1] - c[ic + 1]) + Math.abs(a[ia + 2] - c[ic + 2]); k++; }
    pire = Math.max(pire, s / k / 3); n++;
  }
  r.troncons.clear();
  return { paires: n, pire: Math.round(pire * 100) / 100 };
});
check('les tronçons voisins coïncident sur leur recouvrement', coutures.pire < 1.5, `écart moyen au pire ${coutures.pire} niveau(x) sur ${coutures.paires} paires`);

// Le palais se touche là où on le voit : un doigt sur les dômes, bien au-dessus
// de l'emprise, sélectionne le Centre-Ville ; sur les toits d'un palais ennemi,
// il l'attaque — et l'ordre vise le bâtiment, pas le point touché.
const tapPalais = await page.evaluate(() => {
  const g = window.__jeu; const T = 32;
  const tc = g.world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  g.setSelection([]);
  g.camera.centerOn(tc.x, tc.y);
  // Un point sur les dômes, hors tolérance de l'emprise (le sommet du palais
  // est à 37 px au-dessus du bord nord), et libre de tout autre bâtiment. Les
  // unités que la suite a laissées traîner là sont écartées : sous le doigt,
  // une unité passe avant le bâtiment, à juste titre.
  let point = null;
  for (const [ox, oy] of [[0, -30], [-20, -30], [20, -30], [0, -34]]) {
    const px = tc.x + ox, py = tc.ty * T + oy;
    const autre = g.world.entityAt(px, py, null, g.tapTolerance());
    if (!autre || autre.kind === 'unit') { point = { x: px, y: py }; break; }
  }
  if (!point) point = { x: tc.x, y: tc.ty * T - 30 };
  for (const u of g.world.units) if (!u.dead && Math.hypot(u.x - point.x, u.y - point.y) < 70) u.dead = true;
  const domes = g.camera.worldToScreen(point.x, point.y);
  g.tapAt(domes.x, domes.y, false);
  const selection = g.selection.includes(tc);
  // Un palais ennemi posé là où il reste de la place autour de la base — la
  // suite a déjà bien construit dans le coin.
  let ennemi = null;
  for (let r = 6; r <= 20 && !ennemi; r++) {
    for (let dy = -6; dy <= 6 && !ennemi; dy++) {
      for (const dx of [r, -r]) {
        if (!ennemi && g.world.canPlace(1, 'towncenter', tc.tx + dx, tc.ty + dy, true)) ennemi = g.world.spawnBuilding(1, 'towncenter', tc.tx + dx, tc.ty + dy, true);
      }
    }
  }
  if (!ennemi) return { selection, attaque: false, etat: 'aucune place libre pour poser un palais ennemi' };
  const soldat = g.world.spawnUnit(0, 'militia', ennemi.x - T * 4, ennemi.y + T * 3);
  g.world.updateFog();
  g.setSelection([soldat]);
  const toits = g.camera.worldToScreen(ennemi.x, ennemi.ty * T - 18);
  g.tapAt(toits.x, toits.y, false);
  const attaque = soldat.state === 'attack' && soldat.target === ennemi;
  const etat = `${soldat.state} → ${soldat.target ? soldat.target.type : 'rien'}`;
  g.world.killEntity(ennemi, null, true);
  soldat.dead = true;
  g.setSelection([]);
  return { selection, attaque, etat };
});
check('un doigt sur les dômes sélectionne le Centre-Ville', tapPalais.selection);
check('un doigt sur les toits ennemis ordonne l’attaque du palais', tapPalais.attaque, tapPalais.etat);

// Le sol est une nappe de texture continue : les quatre nappes sont chargées,
// et deux pixels voisins d'une case d'herbe ne sont pas de la même couleur —
// une tuile plate le serait.
const sol = await page.evaluate(async () => {
  const g = window.__jeu; const T = 32;
  const mod = await import('./js/sprites.js');
  const nappes = ['grass', 'grassDark', 'dirt', 'sand', 'water'].map((k) => !!mod.textureSol(k));
  const map = g.world.map;
  // une case explorée d'herbe près du Centre-Ville
  const tc = g.world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  let case_ = null;
  for (let r = 3; r <= 12 && !case_; r++) for (let dy = -r; dy <= r && !case_; dy++) for (let dx = -r; dx <= r; dx++) {
    const tx = tc.tx + dx, ty = tc.ty + dy;
    if (!map.inBounds(tx, ty)) continue;
    const i = ty * map.w + tx;
    if ((map.terrain[i] === 0 || map.terrain[i] === 1) && g.world.fog.explored[i] && !map.resourceAt(tx, ty)) { case_ = { tx, ty }; break; }
  }
  if (!case_) return { nappes, variance: -1 };
  g.camera.zoom = 1.5;
  g.camera.centerOn(case_.tx * T + 16, case_.ty * T + 16);
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  const c = g.renderer.canvas; const x = c.getContext('2d'); const dpr = g.renderer.dpr;
  const p = g.camera.worldToScreen(case_.tx * T + 4, case_.ty * T + 4);
  const d = x.getImageData(Math.round(p.x * dpr), Math.round(p.y * dpr), 36, 36).data;
  let somme = 0, somme2 = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; somme += l; somme2 += l * l; n++; }
  const moy = somme / n; const variance = somme2 / n - moy * moy;
  return { nappes, variance: Math.round(variance), moyenne: Math.round(moy) };
});
check('les cinq nappes de sol sont chargées, l’eau redressée comprise', sol.nappes.every(Boolean), sol.nappes.join(' '));
check('le sol est texturé, pas une couleur plate', sol.variance > 30, `variance ${sol.variance} sur 36×36 px (une tuile plate : ~0)`);

// Les lisières ne suivent plus la grille : le masque de couverture d'un
// terrain ondule le long de la frontière et se fond sur une largeur. On peint
// une frontière verticale terre/herbe sur toute la fenêtre d'un tronçon, on
// lit le masque de l'herbe, puis on rend le tronçon et on sonde ses pixels.
const lisieres = await page.evaluate(() => {
  const g = window.__jeu; const T = 32; const map = g.world.map; const r = g.renderer;
  const cx = 1, cy = 1, taille = 8 * T, rec = 8;
  const X0 = cx * taille - rec, Y0 = cy * taille - rec, cote = taille + 2 * rec, n = cote / 2;
  const tx0 = Math.floor(X0 / T) - 1, ty0 = Math.floor(Y0 / T) - 1, cols = Math.ceil(cote / T) + 3;
  const frontiere = ((tx0 + 6) * T - X0) / 2;   // en texels de masque
  const sauve = [];
  for (let ty = ty0; ty < ty0 + cols; ty++) {
    for (let tx = tx0; tx < tx0 + cols; tx++) {
      const i = ty * map.w + tx;
      sauve.push([i, map.terrain[i]]);
      map.terrain[i] = tx < tx0 + 6 ? 2 : 0;   // terre à gauche, herbe à droite
    }
  }
  const nappes = r.nappesPour(1);
  r.decorActif = false;   // les pixels lus ici sont ceux du sol, pas d'un galet
  const t0 = performance.now();
  const { presents, masques } = r.couverturesTroncon(X0, Y0, cote);
  const canvas = r.rendreTroncon(cx, cy, 2, nappes);
  r.decorActif = true;
  const scratch = document.createElement('canvas'); scratch.width = 4; scratch.height = 4;
  const sc = scratch.getContext('2d'); sc.drawImage(canvas, 0, 0, 4, 4); sc.getImageData(0, 0, 1, 1);   // force le rendu
  const ms = performance.now() - t0;

  const a = masques[presents.indexOf(2)].data;
  const alpha = (u, v) => a[(v * n + u) * 4 + 3];
  const croisements = [], largeurs = [];
  let horsLisiere = 0;
  for (let v = 4; v < n - 4; v++) {
    let c = -1, l = 0;
    for (let u = 0; u < n; u++) {
      const al = alpha(u, v);
      if (c < 0 && al >= 128) c = u;
      if (al > 25 && al < 230) l++;
      if ((u < frontiere - 16 && al !== 0) || (u > frontiere + 16 && al !== 255)) horsLisiere++;
    }
    croisements.push(c); largeurs.push(l);
  }
  const moy = croisements.reduce((s, x) => s + x, 0) / croisements.length;
  const ecart = Math.sqrt(croisements.reduce((s, x) => s + (x - moy) ** 2, 0) / croisements.length);
  const etendue = Math.max(...croisements) - Math.min(...croisements);
  const largeur = largeurs.reduce((s, x) => s + x, 0) / largeurs.length;

  // Les pixels rendus : la couleur suit le masque, sans frange ni ligne. Un
  // texel de masque couvre 2 px monde, soit 4 px du tronçon rendu à l'échelle 2.
  const px = canvas.getContext('2d'); const K = 4;
  const moyenne = (x, y) => {
    const d = px.getImageData(x - 4, y - 4, 9, 9).data; const m = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; }
    return m.map((c) => c / 81);
  };
  const sondes = [];
  for (let v = 16; v < n - 16; v += 24) {
    const c = croisements[v - 4];
    const terre = moyenne(K * (c - 22), K * v), herbe = moyenne(K * (c + 22), K * v), milieu = moyenne(K * c, K * v);
    const d = [herbe[0] - terre[0], herbe[1] - terre[1], herbe[2] - terre[2]];
    const d2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    const s = ((milieu[0] - terre[0]) * d[0] + (milieu[1] - terre[1]) * d[1] + (milieu[2] - terre[2]) * d[2]) / d2;
    sondes.push(Math.round(s * 100) / 100);
  }
  for (const [i, t] of sauve) map.terrain[i] = t;
  r.troncons.clear();
  return { frontiere, moy: Math.round(moy * 10) / 10, ecart: Math.round(ecart * 10) / 10, etendue, largeur: Math.round(largeur * 10) / 10, horsLisiere, sondes, ms: Math.round(ms * 10) / 10 };
});
check('la lisière ondule au lieu de suivre la grille', lisieres.ecart >= 1.5 && lisieres.etendue >= 5,
  `écart-type ${lisieres.ecart} texels, étendue ${lisieres.etendue} (2 px monde par texel)`);
check('la lisière passe bien entre les centres des cases', Math.abs(lisieres.moy - lisieres.frontiere) < 6, `moyenne ${lisieres.moy} pour une frontière à ${lisieres.frontiere}`);
check('le fondu a une largeur, ni nette ni floue', lisieres.largeur >= 3 && lisieres.largeur <= 10, `${lisieres.largeur} texels en moyenne`);
check('aucun îlot loin de la lisière', lisieres.horsLisiere === 0, `${lisieres.horsLisiere} texels intermédiaires à plus de 32 px`);
// Projection du pixel du croisement sur l'axe terre → herbe : ~0 ou ~1 serait
// une frontière nette. Les deux nappes étant proches en couleur (l'herbe est
// désormais calme), la mesure est bruitée : on laisse de la marge.
check('la couleur rendue suit le masque : mi-terre mi-herbe au croisement', lisieres.sondes.every((s) => s > 0.12 && s < 0.88), lisieres.sondes.join(' '));
check('un tronçon de deux terrains se rend vite', lisieres.ms < 60, `${lisieres.ms} ms, masques et rastérisation compris`);

// L'eau a des bords : une frange de sable côté terre, une écume côté eau.
// Même montage, frontière verticale terre | eau ; on lit les masques du
// rivage, puis les pixels rendus de part et d'autre de la ligne — tout se
// mesure depuis le rivage RÉEL de chaque ligne (l'eau à demi opaque), qui
// ondule autour de la frontière des cases.
const rivage = await page.evaluate(() => {
  const g = window.__jeu; const T = 32; const map = g.world.map; const r = g.renderer;
  const cx = 1, cy = 1, taille = 8 * T, rec = 8;
  const X0 = cx * taille - rec, Y0 = cy * taille - rec, cote = taille + 2 * rec, n = cote / 2;
  const tx0 = Math.floor(X0 / T) - 1, ty0 = Math.floor(Y0 / T) - 1, cols = Math.ceil(cote / T) + 3;
  const sauve = [];
  for (let ty = ty0; ty < ty0 + cols; ty++) for (let tx = tx0; tx < tx0 + cols; tx++) { const i = ty * map.w + tx; sauve.push([i, map.terrain[i]]); map.terrain[i] = tx < tx0 + 6 ? 2 : 4; }
  const nappes = r.nappesPour(1);
  r.decorActif = false;
  const { presents, masques, rivage } = r.couverturesTroncon(X0, Y0, cote);
  const canvas = r.rendreTroncon(cx, cy, 2, nappes);
  r.decorActif = true;
  const out = { present: !!rivage };
  if (rivage) {
    const lire = (img) => (u, v) => img.data[(v * n + u) * 4 + 3];
    const eau = lire(masques[presents.indexOf(4)]);
    const plage = lire(rivage.plage.img), ecume = lire(rivage.ecume.img), haut = lire(rivage.hautFond.img);
    const croisement = (v) => { for (let u = 0; u < n; u++) if (eau(u, v) >= 128) return u; return -1; };
    let plagePres = 0, plageLoin = 0, ecumeSur = 0, ecumeHors = 0, hautPres = 0, hautLoin = 0;
    for (let v = 8; v < n - 8; v++) {
      const c = croisement(v);
      for (let u = 0; u < n; u++) {
        const d = u - c;   // texels ; > 0 côté eau
        if (plage(u, v) > 0) { if (d >= -12 && d <= 3) plagePres++; else if (d < -13 || d > 4) plageLoin++; }
        if (ecume(u, v) > 0) { if (d >= -2 && d <= 8) ecumeSur++; else if (d < -3 || d > 9) ecumeHors++; }
        if (haut(u, v) > 0) { if (d >= -4 && d <= 11) hautPres++; else if (d < -5 || d > 12) hautLoin++; }
      }
    }
    Object.assign(out, { plagePres, plageLoin, ecumeSur, ecumeHors, hautPres, hautLoin });
    // pixels : luminance sur chaque ligne sondée, à 4 px de tronçon par texel
    const px = canvas.getContext('2d'); const K = 4;
    const lum = (x, y) => { const d = px.getImageData(x - 2, y - 2, 5, 5).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; return s / 25; };
    let ecumeMax = 0, eauProfonde = 0, sable = 0, terre = 0, k = 0;
    for (let v = 20; v < n - 20; v += 12) {
      const c = croisement(v);
      let m = 0; for (let u = c - 2; u <= c + 9; u++) m = Math.max(m, lum(K * u, K * v));
      ecumeMax += m; eauProfonde += lum(K * (c + 40), K * v); sable += lum(K * (c - 5), K * v); terre += lum(K * (c - 40), K * v); k++;
    }
    Object.assign(out, { ecumeMax: Math.round(ecumeMax / k), eauProfonde: Math.round(eauProfonde / k), sable: Math.round(sable / k), terre: Math.round(terre / k) });
  }
  for (const [i, t] of sauve) map.terrain[i] = t;
  r.troncons.clear();
  return out;
});
check('au bord de l’eau, les masques du rivage existent', rivage.present);
check('la plage borde l’eau côté terre, et nulle part ailleurs', rivage.plagePres > 500 && rivage.plageLoin === 0, `${rivage.plagePres} texels de plage le long du rivage, ${rivage.plageLoin} ailleurs`);
check('l’écume court le long du rivage, côté eau', rivage.ecumeSur > 200 && rivage.ecumeHors === 0, `${rivage.ecumeSur} texels d’écume sur le rivage, ${rivage.ecumeHors} ailleurs`);
check('le haut-fond éclaircit l’eau près du bord, pas au large', rivage.hautPres > 500 && rivage.hautLoin === 0, `${rivage.hautPres} texels près du bord, ${rivage.hautLoin} au large`);
check('en pixels : l’écume est plus claire que l’eau profonde, la plage plus claire que la terre',
  rivage.ecumeMax > rivage.eauProfonde + 40 && rivage.sable > rivage.terre + 12, `écume ${rivage.ecumeMax} · eau ${rivage.eauProfonde} · plage ${rivage.sable} · terre ${rivage.terre}`);

// Arbres et buissons illustrés : deux atlas de six cases, plus hauts que leur
// case — ils entrent dans l'ordre du peintre avec les unités.
const vegetation = await page.evaluate(async () => {
  const mod = await import('./js/sprites.js');
  const a = mod.spriteDe('arbres'), b = mod.spriteDe('baies'), o = mod.spriteDe('or');
  return { arbres: !!a && a.def.cases === 6 && a.def.hauteurMonde > 60, buissons: !!b && b.def.cases === 2, or: !!o && o.def.cases === 2 };
});
check('les arbres portent leur illustration (six essences, deux chevaliers de haut)', vegetation.arbres);
check('le buisson à baies porte son illustration (et son miroir)', vegetation.buissons);
check('le gisement d’or porte son illustration (et son miroir)', vegetation.or);

// Le villageois illustré : quatre orientations de marche et sept poses,
// dessinées d'un seul côté et retournées quand la cible est de l'autre.
const villageois = await page.evaluate(async () => {
  const g = window.__jeu; const T = 32; const map = g.world.map;
  const mod = await import('./js/sprites.js');
  const s = mod.spriteDe('villager');
  if (!s) return null;
  const def = s.def;
  // couleur d'équipe : l'écharpe bascule, la peau reste
  const lire = (src) => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d'); x.drawImage(src, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
  const hsl = (r, g, b) => { const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, sa = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); const R = r / 255, G = g / 255, B = b / 255; let h; if (mx === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6; else if (mx === G) h = ((B - R) / d + 2) / 6; else h = ((R - G) / d + 4) / 6; return [h * 360, sa, l]; };
  const bleu = lire(mod.imagePourJoueur(s, 0)), rouge = lire(mod.imagePourJoueur(s, 1));
  let opaques = 0, changes = 0, peau = 0, peauIntacte = 0, bleusRestants = 0;
  for (let i = 0; i < bleu.length; i += 4) {
    if (bleu[i + 3] < 128) continue;
    opaques++;
    const memes = bleu[i] === rouge[i] && bleu[i + 1] === rouge[i + 1] && bleu[i + 2] === rouge[i + 2];
    if (!memes) changes++;
    const [hb, sb, lb] = hsl(bleu[i], bleu[i + 1], bleu[i + 2]);
    if (hb >= 15 && hb <= 40 && sb > 0.3 && lb > 0.45) { peau++; if (memes) peauIntacte++; }
    const [hr, sr] = hsl(rouge[i], rouge[i + 1], rouge[i + 2]);
    if (hr >= 200 && hr <= 255 && sr > 0.32) bleusRestants++;
  }
  // les poses, sur un vrai villageois
  const r = g.renderer;
  const tc = g.world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const v = g.world.spawnUnit(0, 'villager', tc.x, tc.y + 5 * T);
  const trouve = (type) => { let best = null, bd = 1e9; for (const res of map.resources.values()) { if (res.type !== type || res.amount <= 0) continue; const d = Math.hypot(res.tx * T - v.x, res.ty * T - v.y); if (d < bd) { bd = d; best = res; } } return best; };
  const poses = {};
  const immobile = { avance: false, distance: 0 }, marche = { avance: true, distance: 20 };
  const baies = trouve('food'), arbre = trouve('wood'), or = trouve('gold');
  const nom = (c) => c ? Object.keys(def.poses).find((k) => def.poses[k] === c.pose) + (c.miroir ? '·miroir' : '') : 'marche';
  if (baies) { v.gatherAt(baies.tx, baies.ty); v.x = baies.tx * T + T / 2 - 40; v.y = baies.ty * T + T / 2; poses.baiesEst = nom(r.poseDe(v, def, immobile)); v.x = baies.tx * T + T / 2 + 40; poses.baiesOuest = nom(r.poseDe(v, def, immobile)); }
  if (arbre) { v.gatherAt(arbre.tx, arbre.ty); v.x = arbre.tx * T + T / 2 - 40; v.y = arbre.ty * T + T / 2; poses.arbreEst = nom(r.poseDe(v, def, immobile)); v.x = arbre.tx * T + T / 2 + 40; poses.arbreOuest = nom(r.poseDe(v, def, immobile)); }
  if (or) { v.gatherAt(or.tx, or.ty); v.x = or.tx * T + T / 2 + 40; v.y = or.ty * T + T / 2; poses.orOuest = nom(r.poseDe(v, def, immobile)); v.x = or.tx * T + T / 2 - 40; poses.orEst = nom(r.poseDe(v, def, immobile)); }
  // Une carcasse posée à côté : le maillet, tourné vers elle des deux côtés.
  const libre = map.findOpenTile(Math.floor(v.x / T) + 3, Math.floor(v.y / T), 6);
  const carcasse = libre && map.addResource(libre.tx, libre.ty, 'food', null, { amount: 140, gibier: 'deer' });
  if (carcasse) {
    v.gatherAt(carcasse.tx, carcasse.ty);
    v.x = carcasse.tx * T + T / 2 - 40; v.y = carcasse.ty * T + T / 2; poses.carcasseEst = nom(r.poseDe(v, def, immobile));
    v.x = carcasse.tx * T + T / 2 + 40; poses.carcasseOuest = nom(r.poseDe(v, def, immobile));
    map.clearResource(carcasse.ty * map.w + carcasse.tx);
  }
  v.stop(); poses.repos = nom(r.poseDe(v, def, immobile));
  poses.marche = nom(r.poseDe(v, def, marche));
  v.carry = { type: 'wood', amount: 8 }; v.facing = 0; poses.porteEst = nom(r.poseDe(v, def, marche)); v.facing = Math.PI; poses.porteOuest = nom(r.poseDe(v, def, marche));
  v.facing = Math.PI / 2; poses.porteSud = nom(r.poseDe(v, def, marche));
  v.carry = { type: 'gold', amount: 8 }; v.facing = 0; poses.porteOrEst = nom(r.poseDe(v, def, marche));
  poses.suitePorter = def.poses.porter.suite || null;
  v.carry = { type: null, amount: 0 };
  g.world.players[0].resources.wood = 1000;
  let site = null;
  for (let rr = 3; rr <= 12 && !site; rr++) for (let dy = -rr; dy <= rr && !site; dy++) for (let dx = -rr; dx <= rr && !site; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue; if (g.world.canPlace(0, 'house', tc.tx + dx, tc.ty + dy)) site = g.world.placeBuilding(0, 'house', tc.tx + dx, tc.ty + dy, []); }
  if (site) {
    v.buildAt(site); v.x = site.x + 60; v.y = site.y; poses.chantierOuest = nom(r.poseDe(v, def, immobile));
    v.x = site.x - 60; poses.chantierEst = nom(r.poseDe(v, def, immobile));
    g.world.cancelConstruction(site);
  }
  v.dead = true;
  return { cases: def.cases, images: def.images, lignes: def.lignes, opaques, changes, peau, peauIntacte, bleusRestants, poses };
});
check('le villageois porte son illustration : quatre orientations, 24 pas interpolés', !!villageois && villageois.cases === 4 && villageois.images === 24 && villageois.lignes.length === 4, villageois ? `${villageois.cases} orientations × ${villageois.images}` : 'absent');
check('le villageois adverse est repeint (l’écharpe)', !!villageois && villageois.changes > villageois.opaques * 0.02, villageois && `${Math.round((villageois.changes / villageois.opaques) * 100)} % des pixels`);
check('la peau du villageois reste la même', !!villageois && villageois.peau > 500 && villageois.peauIntacte === villageois.peau, villageois && `${villageois.peauIntacte}/${villageois.peau} pixels de peau intacts`);
check('aucun bleu franc ne subsiste côté adverse (villageois)', !!villageois && villageois.bleusRestants === 0, villageois && villageois.bleusRestants + ' pixels');
const P = villageois ? villageois.poses : {};
check('devant des baies, le villageois cueille, tourné vers elles', P.baiesEst === 'cueillir·miroir' && P.baiesOuest === 'cueillir', `à l’est : ${P.baiesEst} · à l’ouest : ${P.baiesOuest}`);
check('devant un arbre il abat à la hache, devant l’or il pioche, tournés vers eux des deux côtés',
  P.arbreEst === 'bois' && P.arbreOuest === 'bois·miroir' && P.orOuest === 'or' && P.orEst === 'or·miroir',
  `arbre : ${P.arbreEst} / ${P.arbreOuest} · or : ${P.orOuest} / ${P.orEst}`);
check('sur une carcasse, il travaille au maillet, tourné vers elle des deux côtés', P.carcasseEst === 'viande' && P.carcasseOuest === 'viande·miroir',
  `carcasse à l’est : ${P.carcasseEst} · à l’ouest : ${P.carcasseOuest}`);
check('chargé, il porte ; à l’arrêt, il se repose ; sinon il marche', P.porteEst === 'porter' && P.porteOuest === 'porter·miroir' && P.repos === 'repos' && P.marche === 'marche', JSON.stringify(P));
// Le rondin ne vaut que pour du bois, de profil ; et trois intercalaires ratés
// (à demi transparents : le rondin clignotait) ne sont jamais joués.
check('le rondin seulement pour du bois vu de profil : or porté, ou marche vers le sud, en marche ordinaire',
  P.porteSud === 'marche' && P.porteOrEst === 'marche', `bois vers le sud : ${P.porteSud} · or vers l’est : ${P.porteOrEst}`);
check('le port saute ses images ratées', Array.isArray(P.suitePorter) && !P.suitePorter.some((i) => i >= 2 && i <= 4), JSON.stringify(P.suitePorter));
// La planche dessine le maillet frappant vers l'ouest : c'est l'est qui se retourne.
check('sur un chantier, il construit, tourné vers lui des deux côtés', P.chantierOuest === 'construire' && P.chantierEst === 'construire·miroir',
  `chantier à l’ouest : ${P.chantierOuest} · à l’est : ${P.chantierEst}`);

// Quatre orientations : la marche du villageois prend la cardinale la plus
// proche, et chaque secteur tombe sur la bonne ligne de l'atlas.
const quatre = await page.evaluate(async () => {
  const mod = await import('./js/sprites.js');
  const def = mod.spriteDe('villager').def;
  const ligne = (facing) => mod.cadreSource(def, mod.caseDirection(facing, 4), 0).sy / def.cellH;
  return { sud: ligne(Math.PI / 2), est: ligne(0), nord: ligne(-Math.PI / 2), ouest: ligne(Math.PI), sudEst: ligne(Math.PI / 4 - 0.05), sudEstBis: ligne(Math.PI / 4 + 0.05) };
});
check('le villageois marche sur quatre orientations, la cardinale la plus proche en diagonale',
  quatre.sud === 0 && quatre.nord === 1 && quatre.ouest === 2 && quatre.est === 3 && quatre.sudEst === 3 && quatre.sudEstBis === 0, JSON.stringify(quatre));

// La planche de face n'alterne pas les pieds : une séquence par rangée remonte
// une vraie marche avec six des huit images, et l'arrêt tombe sur la neutre.
const cadenceVillageois = await page.evaluate(async () => {
  const mod = await import('./js/sprites.js');
  const def = mod.spriteDe('villager').def;
  const jouees = (ligne) => {
    const suite = [];
    const cycle = (def.cycles && def.cycles[ligne]) || def.cycle;
    for (let d = 0; d < cycle * 2; d += 0.5) {
      const i = mod.imageDeMarche(def, d, true, ligne);
      if (suite[suite.length - 1] !== i) suite.push(i);
    }
    return suite;
  };
  return {
    sud: jouees(0), nord: jouees(1), ouest: jouees(2),
    attendueSud: def.sequences[0], attendueNord: def.sequences[1], attendueOuest: def.sequences[2],
    arretSud: mod.imageDeMarche(def, 999, false, 0), arretOuest: mod.imageDeMarche(def, 999, false, 2),
    neutreSud: def.sequences[0][0],
  };
});
{
  const memes = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const deuxTours = (jouee, seq) => memes(jouee, [...seq, ...seq]);
  check('de face et de dos, le villageois joue ses dix-huit images dans l’ordre, deux tours par double cycle',
    deuxTours(cadenceVillageois.sud, cadenceVillageois.attendueSud) && deuxTours(cadenceVillageois.nord, cadenceVillageois.attendueNord),
    `sud ${cadenceVillageois.sud.join('')} · nord ${cadenceVillageois.nord.join('')}`);
  check('de profil, il joue ses vingt-quatre images interpolées dans l’ordre, deux tours par double cycle',
    deuxTours(cadenceVillageois.ouest, cadenceVillageois.attendueOuest), cadenceVillageois.ouest.join(','));
  check('à l’arrêt, la foulée neutre de la séquence, ou la première image sans séquence',
    cadenceVillageois.arretSud === cadenceVillageois.neutreSud && cadenceVillageois.arretOuest === 0,
    `sud ${cadenceVillageois.arretSud} · ouest ${cadenceVillageois.arretOuest}`);
}

// Le décor de la carte : l'atlas des pièces est chargé, le décor planté sur la
// carte, et il se voit — la même vue avec et sans décor diffère sur des
// milliers de pixels.
const decorRivage = await page.evaluate(async () => {
  const g = window.__jeu; const map = g.world.map;
  const mod = await import('./js/sprites.js');
  const s = mod.spriteDe('decor');
  const r = g.renderer;
  const decor = r.decorCarte();
  let meilleur = null, score = -1;
  for (let ty = 0; ty < map.h; ty++) for (const d of decor.debout[ty]) {
    let n = 0;
    for (let y = Math.max(0, ty - 3); y <= Math.min(map.h - 1, ty + 3); y++) for (const e of decor.debout[y]) if (Math.abs(e.tx - d.tx) <= 3) n++;
    if (n > score) { score = n; meilleur = d; }
  }
  const base = { pret: !!(s && s.pret), total: decor.total, mares: decor.mares, lacs: decor.lacs, pieces: s ? s.def.pieces.length : 0, classes: s ? [...new Set(s.def.pieces.map((p) => p.classe))].length : 0, diff: 0 };
  if (!meilleur || !base.pret) return base;
  const explored = g.world.fog.explored.slice(), visible = g.world.fog.visible.slice();
  g.world.fog.explored.fill(1); g.world.fog.visible.fill(1); g.world.fog.dirty = true;
  const zoom = g.camera.zoom, cx = g.camera.x, cy = g.camera.y;
  g.camera.zoom = 1.5; g.camera.centerOn(meilleur.x, meilleur.y);
  const lire = () => { r.render(1 / 60); return r.ctx.getImageData(0, 0, r.canvas.width, r.canvas.height).data; };
  r.decorActif = false; const sans = lire();
  r.decorActif = true; const avec = lire();
  let diff = 0;
  for (let i = 0; i < sans.length; i += 4) if (Math.abs(sans[i] - avec[i]) + Math.abs(sans[i + 1] - avec[i + 1]) + Math.abs(sans[i + 2] - avec[i + 2]) > 30) diff++;
  g.world.fog.explored.set(explored); g.world.fog.visible.set(visible); g.world.fog.dirty = true;
  g.camera.zoom = zoom; g.camera.x = cx; g.camera.y = cy;
  return { ...base, diff, autour: score };
});
check('l’atlas du décor est chargé : près de cent pièces en seize classes', decorRivage.pret && decorRivage.pieces >= 90 && decorRivage.classes === 16, `${decorRivage.pieces} pièces, ${decorRivage.classes} classes`);
check('la carte est décorée, et ça se voit', decorRivage.total > 0 && decorRivage.diff > 2000, `${decorRivage.total} pièces (${decorRivage.autour} autour du point de vue), ${decorRivage.diff} pixels changés`);

// Le troupeau : cerf et cochon illustrés, cinq rangées pour huit orientations
// (les trois de l'ouest sont celles de l'est retournées), des hardes sur la
// carte, et la chasse au doigt.
const troupeau = await page.evaluate(async () => {
  const g = window.__jeu; const w = g.world;
  const mod = await import('./js/sprites.js');
  const cerf = mod.spriteDe('deer'), cochon = mod.spriteDe('pig');
  const betes = w.units.filter((u) => u.isAnimal);
  const ouest = mod.caseDirection(Math.PI, 8), est = mod.caseDirection(0, 8);
  const v = w.units.find((u) => u.playerIndex === 0 && u.isVillager && !u.garrisonedIn && !u.dead);
  const proie = w.units.filter((u) => u.type === 'deer' && !u.dead).sort((a, b) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y))[0];
  w.fog.explored.fill(1); w.fog.visible.fill(1); w.fog.dirty = true;
  g.rallyArmed = false; g.attackMoveArmed = false; g.garrisonArmed = false;
  g.setSelection([v]);
  g.camera.centerOn(proie.x, proie.y);
  const s = g.camera.worldToScreen(proie.x, proie.y);
  const p = g.camera.screenToWorld(s.x, s.y);
  const diag = { ennemi: (w.enemyAt(p.x, p.y, 0, g.tapTolerance()) || {}).type, visible: g.renderer.isEntityVisible(proie), ecart: Math.round(Math.hypot(p.x - proie.x, p.y - proie.y)) };
  g.tapAt(s.x, s.y, false);
  const etat = v.state, cible = v.target === proie;
  g.setSelection([proie]); g.ui.refreshSelection(true);
  const panneau = (g.ui.nodes.selection.querySelector('.name') || {}).textContent || '';
  g.setSelection([]); v.stop();
  return {
    cerf: !!cerf, cochon: !!cochon, cases: cerf && cerf.def.cases, images: cerf && cerf.def.images,
    ouestMiroir: !!cerf && cerf.def.miroirs[ouest] === true && cerf.def.lignes[ouest] === cerf.def.lignes[est] && !cerf.def.miroirs[est],
    betes: betes.length, cochons: betes.filter((b) => b.type === 'pig').length, etat, cible, panneau, diag,
  };
});
check('le cerf et le cochon portent leur illustration : huit orientations, quatre foulées', troupeau.cerf && troupeau.cochon && troupeau.cases === 8 && troupeau.images === 4, `${troupeau.cases} orientations × ${troupeau.images}`);
check('l’ouest est l’est en miroir', troupeau.ouestMiroir === true);
// Le cochon en huit orientations : cinq rangées, les trois de l'ouest en
// miroir ; et ses pas remis en balancier — de face, la boucle lève un pied
// puis l'autre.
const cochon8 = await page.evaluate(async () => {
  const mod = await import('./js/sprites.js');
  const def = mod.spriteDe('pig').def;
  const so = mod.caseDirection(3 * Math.PI / 4, 8), se = mod.caseDirection(Math.PI / 4, 8), o = mod.caseDirection(Math.PI, 8), e = mod.caseDirection(0, 8), n = mod.caseDirection(-Math.PI / 2, 8);
  const suite = [];
  for (let d = 0; d < def.cycle; d += 0.5) { const i = mod.imageDeMarche(def, d, true, 0); if (suite[suite.length - 1] !== i) suite.push(i); }
  return { cases: def.cases, lignes: def.lignes.length, soCommeSe: def.lignes[so] === def.lignes[se] && def.miroirs[so] && !def.miroirs[se], oCommeE: def.lignes[o] === def.lignes[e] && def.miroirs[o], nord: def.lignes[n], face: suite, repos: mod.imageDeMarche(def, 999, false, 0) };
});
check('le cochon marche en huit orientations, les trois de l’ouest en miroir', cochon8.cases === 8 && cochon8.lignes === 8 && cochon8.soCommeSe && cochon8.oCommeE && cochon8.nord === 4, JSON.stringify(cochon8));
check('de face, il lève un pied puis l’autre, et se repose sur la foulée neutre', JSON.stringify(cochon8.face) === '[0,1,0,3]' && cochon8.repos === 0, cochon8.face.join(''));
const cerf8 = await page.evaluate(async () => {
  const mod = await import('./js/sprites.js');
  const def = mod.spriteDe('deer').def;
  const suite = [];
  for (let d = 0; d < def.cycle; d += 0.5) { const i = mod.imageDeMarche(def, d, true, 0); if (suite[suite.length - 1] !== i) suite.push(i); }
  return { cases: def.cases, face: suite, repos: mod.imageDeMarche(def, 999, false, 0), dos: def.sequences[4] };
});
check('le cerf aussi : de face neutre, gauche, neutre, droite ; de dos gauche et droite en alternance', cerf8.cases === 8 && JSON.stringify(cerf8.face) === '[1,0,1,2]' && cerf8.repos === 1 && JSON.stringify(cerf8.dos) === '[0,1,0,2]', JSON.stringify(cerf8));
check('des hardes vivent sur la carte', troupeau.betes >= 12 && troupeau.cochons >= 6, `${troupeau.betes} animaux dont ${troupeau.cochons} cochons`);
check('touché avec un villageois en main, un cerf déclenche la chasse', troupeau.etat === 'attack' && troupeau.cible, `${troupeau.etat}, cible ${troupeau.cible}, ${JSON.stringify(troupeau.diag)}`);
check('le panneau nomme le cerf sauvage', /Cerf/.test(troupeau.panneau) && /sauvage/.test(troupeau.panneau), troupeau.panneau.trim());

// L'éclaireur illustré : huit orientations × quatre foulées, planche lue du
// nord au nord-ouest et remise sur les secteurs du jeu ; la cape bascule, la
// robe du cheval reste.
const eclaireur = await page.evaluate(async () => {
  const mod = await import('./js/sprites.js');
  const s = mod.spriteDe('scout');
  if (!s) return null;
  const def = s.def;
  const lire = (src) => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d'); x.drawImage(src, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
  const hsl = (r, g, b) => { const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, sa = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); const R = r / 255, G = g / 255, B = b / 255; let h; if (mx === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6; else if (mx === G) h = ((B - R) / d + 2) / 6; else h = ((R - G) / d + 4) / 6; return [h * 360, sa, l]; };
  const bleu = lire(mod.imagePourJoueur(s, 0)), rouge = lire(mod.imagePourJoueur(s, 1));
  let opaques = 0, changes = 0, robe = 0, robeIntacte = 0, bleusRestants = 0;
  for (let i = 0; i < bleu.length; i += 4) {
    if (bleu[i + 3] < 128) continue;
    opaques++;
    const memes = bleu[i] === rouge[i] && bleu[i + 1] === rouge[i + 1] && bleu[i + 2] === rouge[i + 2];
    if (!memes) changes++;
    const [hb, sb, lb] = hsl(bleu[i], bleu[i + 1], bleu[i + 2]);
    if (hb >= 15 && hb <= 40 && sb > 0.3 && lb > 0.2 && lb < 0.6) { robe++; if (memes) robeIntacte++; }
    const [hr, sr] = hsl(rouge[i], rouge[i + 1], rouge[i + 2]);
    if (hr >= 200 && hr <= 255 && sr > 0.32) bleusRestants++;
  }
  const ligne = (facing) => mod.cadreSource(def, mod.caseDirection(facing, def.cases), 0).sy / def.cellH;
  return { cases: def.cases, images: def.images, opaques, changes, robe, robeIntacte, bleusRestants,
    lignes: { sud: ligne(Math.PI / 2), est: ligne(0), nord: ligne(-Math.PI / 2), ouest: ligne(Math.PI), sudEst: ligne(Math.PI / 4), nordOuest: ligne(-3 * Math.PI / 4) } };
});
check('l’éclaireur porte son illustration : huit orientations, quatre foulées', !!eclaireur && eclaireur.cases === 8 && eclaireur.images === 4, eclaireur ? `${eclaireur.cases} × ${eclaireur.images}` : 'absent');
check('la planche de l’éclaireur, lue du nord, retombe sur les secteurs du jeu', !!eclaireur && eclaireur.lignes.sud === 4 && eclaireur.lignes.est === 2 && eclaireur.lignes.nord === 0 && eclaireur.lignes.ouest === 6 && eclaireur.lignes.sudEst === 3 && eclaireur.lignes.nordOuest === 7, eclaireur && JSON.stringify(eclaireur.lignes));
check('l’éclaireur adverse est repeint (cape et tapis de selle)', !!eclaireur && eclaireur.changes > eclaireur.opaques * 0.05, eclaireur && `${Math.round((eclaireur.changes / eclaireur.opaques) * 100)} % des pixels`);
check('la robe du cheval reste la même', !!eclaireur && eclaireur.robe > 2000 && eclaireur.robeIntacte === eclaireur.robe, eclaireur && `${eclaireur.robeIntacte}/${eclaireur.robe} pixels de robe intacts`);
check('aucun bleu franc ne subsiste côté adverse (éclaireur)', !!eclaireur && eclaireur.bleusRestants === 0, eclaireur && eclaireur.bleusRestants + ' pixels');

check('les orientations tombent sur les bonnes cases',
  chevalier.sud === 0 && chevalier.est === 2 && chevalier.nord === 4 && chevalier.ouest === 6,
  `sud ${chevalier.sud} · est ${chevalier.est} · nord ${chevalier.nord} · ouest ${chevalier.ouest}`);
check('aucune orientation ne sort de l’atlas', chevalier.bornes);

// Sauvegarde : on joue, on recharge la page, on reprend là où on en était.
const avantRechargement = await page.evaluate(() => {
  const g = window.__jeu;
  for (let i = 0; i < 20 * 45; i++) g.world.update(1 / 20);   // 45 s de jeu
  g.saveNow();
  const p = g.world.players[0];
  return {
    time: Math.round(g.world.time),
    food: Math.round(p.resources.food),
    unites: g.world.units.filter((u) => !u.dead).length,
    batiments: g.world.buildings.filter((b) => !b.dead).length,
    sauvegarde: !!localStorage.getItem('aem.partie'),
    prochainId: g.world.nextId,
  };
});
check('la partie s’écrit dans le navigateur', avantRechargement.sauvegarde);

await page.reload({ waitUntil: 'networkidle' });
check('la carte de reprise est proposée au retour', await page.isVisible('#btn-resume'));
const resumeTexte = await page.textContent('.resume-info');
await page.click('#btn-resume');
// On fige la partie tout de suite : elle reprend à la milliseconde où on la
// relance, et quelques secondes de jeu suffiraient à fausser la comparaison.
// Ce qui naît dans les premières images (une maison que l'IA pose) ne compte
// pas : on ne recompte que les entités qui existaient à la sauvegarde.
await page.waitForFunction(() => { const g = window.__jeu; if (!g || !g.world) return false; g.paused = true; return true; }, null, { polling: 'raf' });
const apresReprise = await page.evaluate((prochainId) => {
  const g = window.__jeu;
  g.paused = true;
  const p = g.world.players[0];
  return {
    time: Math.round(g.world.time),
    food: Math.round(p.resources.food),
    unites: g.world.units.filter((u) => !u.dead && u.id < prochainId).length,
    batiments: g.world.buildings.filter((b) => !b.dead && b.id < prochainId).length,
  };
}, avantRechargement.prochainId);
check('la partie reprend au même instant',
  Math.abs(apresReprise.time - avantRechargement.time) <= 1,
  `${avantRechargement.time} s → ${apresReprise.time} s`);
check('les ressources sont conservées',
  Math.abs(apresReprise.food - avantRechargement.food) <= 10,
  `${avantRechargement.food} → ${apresReprise.food} 🍖`);
check('unités et bâtiments sont tous là',
  apresReprise.unites === avantRechargement.unites
  && apresReprise.batiments === avantRechargement.batiments,
  `${avantRechargement.unites}/${avantRechargement.batiments} → `
  + `${apresReprise.unites} unités, ${apresReprise.batiments} bâtiments`);
check('la carte de reprise résume la partie',
  /\d+:\d\d/.test(resumeTexte || ''), (resumeTexte || '').trim());

// Vitesse de jeu : le multiplicateur s'applique vraiment à la simulation.
const vitesse = await page.evaluate(async () => {
  const g = window.__jeu;
  g.paused = false;
  const mesure = async (id) => {
    g.setSpeed(id);
    const t0 = g.world.time;
    await new Promise((r) => setTimeout(r, 1200));
    return g.world.time - t0;
  };
  const normal = await mesure('normal');
  const blitz = await mesure('blitz');
  return { normal, blitz, id: g.speedId, mult: g.speed };
});
check('la vitesse Blitz double le temps de jeu écoulé',
  vitesse.blitz > vitesse.normal * 1.5,
  `${vitesse.normal.toFixed(1)} s vs ${vitesse.blitz.toFixed(1)} s pour 1,2 s réelles`);
check('la vitesse choisie est retenue', vitesse.id === 'blitz' && vitesse.mult === 2);
await page.evaluate(() => { window.__jeu.setSpeed('normal'); window.__jeu.paused = false; });

// Attaquer un ennemi au doigt, sans viser au pixel près.
const combat = await page.evaluate(async () => {
  const g = window.__jeu;
  const tc = g.world.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const soldat = g.world.spawnUnit(0, 'militia', tc.x + 96, tc.y + 96);
  const ennemi = g.world.spawnUnit(1, 'militia', tc.x + 64, tc.y + 64);
  ennemi.setStance('passive');
  g.camera.centerOn(tc.x, tc.y);
  g.setSelection([soldat]);

  // On touche à côté de l'ennemi, comme un pouce sur un petit écran.
  const p = g.camera.worldToScreen(ennemi.x + 22, ennemi.y + 14);
  g.tapAt(p.x, p.y, false);
  const ordonne = soldat.target === ennemi;

  const pvAvant = ennemi.hp;
  for (let i = 0; i < 20 * 25; i++) {
    g.world.update(1 / 20);
    if (ennemi.hp < pvAvant) break;
  }
  return { ordonne, touche: ennemi.hp < pvAvant, pv: Math.round(ennemi.hp) };
});
check('appui à côté de l’ennemi : l’ordre d’attaque part', combat.ordonne);
check('l’ennemi encaisse réellement', combat.touche, combat.pv + ' PV restants');

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

// Relecture complète (septembre) : chaque défaut d'interface corrigé garde son test.
const relecture = await page.evaluate(async () => {
  const g = window.__jeu, w = g.world, T = 32;
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  const tc = w.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const r = {};
  // La file de production s'annule encore après que le panneau s'est redessiné.
  w.players[0].resources.food = 5000;
  g.setSelection([tc]);
  const bouton = [...document.querySelectorAll('#command-panel [data-cmd]')].find((b) => b.textContent.includes('Villageois'));
  bouton.click();
  const food0 = w.players[0].resources.food, file0 = tc.queue.length;
  await attendre(2500);
  document.querySelector('#selection-panel [data-cancel]')?.click();
  await attendre(200);
  r.file = { avant: file0, apres: tc.queue.length, rembourse: w.players[0].resources.food - food0 };
  // Au plafond (deux Centres-Villes), la carte du menu de construction est grisée.
  w.players[0].resources.wood = 5000;
  let spot = null;
  for (let d = 4; d < 20 && !spot; d++) for (let dy = -d; dy <= d && !spot; dy++) for (let dx = -d; dx <= d && !spot; dx++) {
    if (w.canPlace(0, 'towncenter', tc.tx + dx, tc.ty + dy, true)) spot = { tx: tc.tx + dx, ty: tc.ty + dy };
  }
  const second = w.spawnBuilding(0, 'towncenter', spot.tx, spot.ty, true);
  g.ui.openBuildMenu();
  const carte = document.querySelector('#build-list [data-type="towncenter"]');
  r.limite = { grisee: !!carte && carte.classList.contains('disabled'), raison: carte && carte.dataset.reason };
  g.ui.closeBuildMenu();
  w.killEntity(second, null, true);
  // La charge d'un villageois : l'icône de la ressource, pas son nom.
  const v = w.units.find((u) => u.playerIndex === 0 && u.isVillager);
  v.carry = { type: 'wood', amount: 7 };
  g.setSelection([v]);
  const stats = document.querySelector('#selection-panel .stats');
  r.charge = { texte: stats.innerText.replace(/\s+/g, ' '), iconeAvant: /<\/svg>\s*7\//.test(stats.innerHTML) };
  v.carry = { type: null, amount: 0 };
  // Toucher le coin transparent de l'illustration du palais : ce n'est pas le palais.
  const coin = { x: tc.x - 80, y: (tc.ty + tc.size) * T - 150 };
  r.coin = g.batimentIllustreSous(coin.x, coin.y);
  r.coin = r.coin ? r.coin.type : null;
  r.dome = (g.batimentIllustreSous(tc.x, tc.y - T * 2) || {}).type || null;
  // Un gisement d'or épuisé : le tronçon de sol en cache est refait.
  w.fog.explored.fill(1); w.fog.visible.fill(1); w.fog.dirty = true;
  // Un gisement posé sur l'herbe : sur de la terre, il n'y aurait rien à refaire.
  let or = null;
  for (const res of w.map.resources.values()) {
    if (res.type === 'gold' && w.map.terrain[res.ty * w.map.w + res.tx] !== 2) { or = res; break; }
  }
  g.camera.centerOn(or.tx * T + T / 2, or.ty * T + T / 2);
  await attendre(300);
  const cle = `${g.camera.zoom < 0.75 ? 1 : 0}:${Math.floor(or.tx / 8)}:${Math.floor(or.ty / 8)}`;
  const avant = g.renderer.troncons.get(cle);
  const i = or.ty * w.map.w + or.tx, terrain0 = w.map.terrain[i];
  w.map.clearResource(i);
  await attendre(300);
  const apres = g.renderer.troncons.get(cle);
  r.sol = { avant: !!avant, refait: !!apres && apres !== avant, terrain: `${terrain0} → ${w.map.terrain[i]}` };
  // Une carcasse se dessine avec le profil de l'animal (la rangée « est » de
  // son atlas) : un numéro de rangée fixe désignait la vue de trois quarts.
  const mod = await import('./js/sprites.js');
  const cerf = w.units.find((u) => u.type === 'deer' && !u.dead);
  w.killEntity(cerf, null);
  const carcasse = [...w.map.resources.values()].find((res) => res.gibier === 'deer');
  const def = mod.spriteDe('deer').def;
  const ctx = g.renderer.ctx, dessiner = ctx.drawImage;
  let rangee = null;
  ctx.drawImage = function (image, sx, sy, ...reste) { if (rangee === null) rangee = sy / def.cellH; return dessiner.call(this, image, sx, sy, ...reste); };
  try { if (carcasse) g.renderer.dessinerCarcasse(carcasse); } finally { ctx.drawImage = dessiner; }
  r.carcasse = { rangee, profil: def.lignes[mod.caseDirection(0, def.cases)] };
  g.setSelection([]);
  return r;
});
check('la file de production s’annule encore après un nouveau rendu du panneau', relecture.file.avant === 1 && relecture.file.apres === 0 && relecture.file.rembourse >= 50,
  JSON.stringify(relecture.file));
check('deux Centres-Villes : leur carte est grisée dans le menu de construction', relecture.limite.grisee, JSON.stringify(relecture.limite));
check('la charge d’un villageois s’affiche avec l’icône de la ressource', !/\bwood\b/.test(relecture.charge.texte) && relecture.charge.iconeAvant,
  relecture.charge.texte);
check('le coin transparent de l’illustration du palais ne le sélectionne pas, ses dômes si', relecture.coin !== 'towncenter' && relecture.dome === 'towncenter',
  `coin : ${relecture.coin} · dômes : ${relecture.dome}`);
check('un gisement d’or épuisé refait le sol en cache', relecture.sol.avant && relecture.sol.refait, JSON.stringify(relecture.sol));
check('une carcasse se dessine avec le profil de l’animal', relecture.carcasse.rangee === relecture.carcasse.profil,
  `rangée ${relecture.carcasse.rangee}, profil ${relecture.carcasse.profil}`);

// ---------------------------------------------------------------------------
// Second passage sur le rendu et l'interface (septembre) : chaque défaut
// corrigé garde sa vérification, écrite d'après le script qui l'a montré.
// ---------------------------------------------------------------------------
const cdp = await context.newCDPSession(page);
const toucher = (type, points) => cdp.send('Input.dispatchTouchEvent', {
  type, touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })),
});
await page.evaluate(() => {
  const g = window.__jeu;
  g.speed = 0;
  window.__appuis = [];
  const orig = g.tapAt.bind(g);
  g.tapAt = (x, y, d) => { window.__appuis.push([Math.round(x), Math.round(y)]); return orig(x, y, d); };
  for (const u of g.world.units) if (u.playerIndex === 0) u.stop();
  g.focusTownCenter();
  g.setSelection(g.world.units.filter((u) => u.playerIndex === 0 && u.isVillager));
});
// Pincement : le doigt A reste immobile et se lève en dernier.
async function pincer(A) {
  const B = [A[0] + 60, A[1] + 30];
  await toucher('touchStart', [[...A, 0]]);
  await toucher('touchStart', [[...A, 0], [...B, 1]]);
  await toucher('touchMove', [[...A, 0], [B[0] + 45, B[1] + 20, 1]]);
  await toucher('touchMove', [[...A, 0], [B[0] + 90, B[1] + 40, 1]]);
  await toucher('touchEnd', [[B[0] + 90, B[1] + 40, 1]]);
  await toucher('touchEnd', []);
  await page.waitForTimeout(150);
}
await pincer([150, 300]);
const apresPincement = await page.evaluate(() => window.__appuis.splice(0));
check('le doigt resté posé après un pincement ne donne aucun ordre', apresPincement.length === 0, JSON.stringify(apresPincement));
// En mode construction, le doigt immobile au-dessus d'un emplacement libre :
// avant, son relâchement y posait la maison.
const constructible = await page.evaluate(() => {
  const g = window.__jeu, w = g.world, T = 32;
  const tc = w.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  for (let r = 3; r <= 9; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !w.canPlace(0, 'house', tc.tx + dx, tc.ty + dy)) continue;
    const e = g.camera.worldToScreen((tc.tx + dx + 1) * T, (tc.ty + dy + 1) * T);
    if (e.x > 40 && e.x < innerWidth - 160 && e.y > 180 && e.y < innerHeight - 260) return [Math.round(e.x), Math.round(e.y)];
  }
  return [120, 470];
});
const chantiers0 = await page.evaluate(() => { window.__jeu.startBuildMode('house'); return window.__jeu.world.buildings.filter((b) => b.playerIndex === 0 && !b.complete).length; });
await pincer(constructible);
const construction = await page.evaluate(() => ({
  appuis: window.__appuis.splice(0), mode: !!window.__jeu.buildMode,
  chantiers: window.__jeu.world.buildings.filter((b) => b.playerIndex === 0 && !b.complete).length,
}));
await page.evaluate(() => window.__jeu.cancelBuild());
check('ni ne pose de bâtiment en mode construction', construction.appuis.length === 0 && construction.mode && construction.chantiers === chantiers0,
  JSON.stringify({ ...construction, avant: chantiers0 }));
await toucher('touchStart', [[200, 250, 0]]);
await page.waitForTimeout(60);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
await page.waitForTimeout(150);
const annule = await page.evaluate(() => window.__appuis.splice(0));
check('un toucher annulé par le système (appel, geste de bord) ne donne aucun ordre', annule.length === 0, JSON.stringify(annule));

const interfaceRelue = await page.evaluate(async () => {
  const g = window.__jeu, w = g.world, R = g.renderer, map = w.map, T = 32;
  const attendre = (ms) => new Promise((res) => setTimeout(res, ms));
  const r = {};
  const tc = w.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  // Menu de construction ouvert pendant que le bois arrive : la carte suit.
  w.players[0].resources.wood = 20;
  g.openBuildMenu();
  await attendre(150);
  const carte = () => document.querySelector('#build-list [data-type="house"]');
  const grisee = carte().classList.contains('disabled');
  w.players[0].resources.wood = 200;
  await attendre(400);
  r.menu = { a20: grisee, a200: carte().classList.contains('disabled') };
  g.ui.closeBuildMenu();
  // Panneau d'un seul villageois : sa charge suit.
  const v = w.units.find((u) => u.playerIndex === 0 && u.isVillager && !u.dead);
  v.carry = { type: 'wood', amount: 2 };
  g.setSelection([v]);
  await attendre(250);
  const texte = () => (document.querySelector('#selection-panel .stats')?.textContent || '').replace(/\s+/g, ' ');
  const avant = texte();
  v.carry.amount = 5;
  await attendre(400);
  r.charge = { avant, apres: texte() };
  v.carry = { type: null, amount: 0 };
  g.setSelection([]);
  // Un combat hors de vue ne laisse ni éclats ni tache sous le brouillard.
  const moi = w.entities.filter((e) => e.playerIndex === 0);
  let loin = null;
  for (let ty = 5; ty < map.h - 5 && !loin; ty += 3) for (let tx = 5; tx < map.w - 5 && !loin; tx += 3) {
    if (moi.every((e) => Math.hypot(e.x / T - tx, e.y / T - ty) > 14)) loin = { tx, ty };
  }
  const i = loin.ty * map.w + loin.tx;
  w.fog.explored[i] = 1; w.fog.visible[i] = 0; w.fog.dirty = true;
  const p0 = R.particles.length;
  w.effects.push({ kind: 'death', x: loin.tx * T + 16, y: loin.ty * T + 16, life: 1.2, max: 1.2, color: '#c33' },
    { kind: 'hit', x: loin.tx * T + 16, y: loin.ty * T + 16, life: 0.3, max: 0.3 });
  R.render(1 / 60);
  const cache = R.particles.length - p0;
  const p1 = R.particles.length;
  w.effects.push({ kind: 'death', x: tc.x, y: tc.y + 60, life: 1.2, max: 1.2, color: '#c33' });
  R.render(1 / 60);
  r.brouillard = { cache, vu: R.particles.length - p1 };
  w.effects.length = 0;
  // Au bord de la carte, dans un coin inexploré : rien du sol ne déborde.
  const coinX = tc.x < map.pixelWidth / 2 ? map.pixelWidth : 0, coinY = tc.y < map.pixelHeight / 2 ? map.pixelHeight : 0;
  g.camera.zoom = 1.5;
  g.camera.centerOn(coinX, coinY);
  R.render(1 / 60);
  const px = (wx, wy) => { const s = g.camera.worldToScreen(wx, wy); return Array.from(R.ctx.getImageData(Math.round(s.x * R.dpr), Math.round(s.y * R.dpr), 1, 1).data.slice(0, 3)); };
  const pas = coinX === 0 ? 1 : -1, wy = coinY + (coinY === 0 ? 1 : -1) * 120;
  r.bord = { bande: px(coinX - pas * 4, wy), dehors: px(coinX - pas * 20, wy) };
  // Zoom minimal : la vue tient plus de 40 tronçons de sol, le cache aussi.
  let cuissons = 0;
  const cuire = R.rendreTroncon;
  R.rendreTroncon = function (...a) { cuissons++; return cuire.apply(this, a); };
  g.camera.zoom = g.camera.minZoom;
  g.camera.centerOn(map.pixelWidth / 2, map.pixelHeight / 2);
  for (let k = 0; k < 3; k++) R.render(1 / 60);
  const v2 = R.visibleTileRange(), taille = 8 * T;
  const vus = (Math.floor(Math.min(map.pixelWidth - 1, v2.right) / taille) - Math.floor(Math.max(0, v2.left) / taille) + 1)
    * (Math.floor(Math.min(map.pixelHeight - 1, v2.bottom) / taille) - Math.floor(Math.max(0, v2.top) / taille) + 1);
  cuissons = 0;
  for (let k = 0; k < 5; k++) R.render(1 / 60);
  R.rendreTroncon = cuire;
  r.cacheSol = { vus, cuissons };
  // Une ferme posée sur du décor debout : aucun rocher ni buisson dessus.
  const S = (await import('./js/config.js')).BUILDING_TYPES.farm.size;
  const decor = R.decorCarte();
  const parCase = new Map();
  for (const ligne of decor.debout) for (const d of ligne) parCase.set(d.ty * map.w + d.tx, (parCase.get(d.ty * map.w + d.tx) || 0) + 1);
  let place = null;
  for (let ty = 2; ty < map.h - 5; ty++) for (let tx = 2; tx < map.w - 5; tx++) {
    let n = 0, libre = true;
    for (let y = ty; y < ty + S; y++) for (let x = tx; x < tx + S; x++) { n += parCase.get(y * map.w + x) || 0; if (map.blocked[y * map.w + x] !== 0) libre = false; }
    if (libre && n > (place ? place.n : 1)) place = { tx, ty, n };
  }
  const ferme = w.spawnBuilding(0, 'farm', place.tx, place.ty, true);
  for (let y = ferme.ty - 3; y < ferme.ty + 6; y++) for (let x = ferme.tx - 3; x < ferme.tx + 6; x++) { w.fog.explored[y * map.w + x] = 1; w.fog.visible[y * map.w + x] = 1; }
  w.fog.dirty = true;
  g.camera.zoom = 1.6;
  g.camera.centerOn(ferme.x, ferme.y);
  let peintes = 0;
  const peindre = R.dessinerPiece;
  R.dessinerPiece = function (d, ...a) {
    if (a.length === 1 && d.tx >= ferme.tx && d.tx < ferme.tx + S && d.ty >= ferme.ty && d.ty < ferme.ty + S) peintes++;
    return peindre.call(this, d, ...a);
  };
  R.render(1 / 60);
  R.dessinerPiece = peindre;
  r.ferme = { dessous: place.n, peintes };
  w.killEntity(ferme, null, true);
  g.camera.zoom = 0.54;
  g.focusTownCenter();
  g.speed = 1;
  return r;
});
check('menu de construction ouvert : la carte de la maison se dégrise quand le bois arrive', interfaceRelue.menu.a20 && !interfaceRelue.menu.a200,
  JSON.stringify(interfaceRelue.menu));
check('le panneau d’un villageois suit la charge qu’il porte', /\b2\/\d+/.test(interfaceRelue.charge.avant) && /\b5\/\d+/.test(interfaceRelue.charge.apres),
  `${interfaceRelue.charge.avant} → ${interfaceRelue.charge.apres}`);
check('un combat hors de vue ne laisse aucun éclat sous le brouillard (un combat en vue, si)', interfaceRelue.brouillard.cache === 0 && interfaceRelue.brouillard.vu > 0,
  JSON.stringify(interfaceRelue.brouillard));
const ecartBord = interfaceRelue.bord.bande.reduce((s, c, k) => s + Math.abs(c - interfaceRelue.bord.dehors[k]), 0);
check('au bord de la carte, aucune bande de sol inexploré ne déborde', ecartBord <= 6, JSON.stringify(interfaceRelue.bord));
check('zoom minimal : le sol n’est pas recuit à chaque image', interfaceRelue.cacheSol.vus > 40 && interfaceRelue.cacheSol.cuissons === 0,
  `${interfaceRelue.cacheSol.vus} tronçons en vue, ${interfaceRelue.cacheSol.cuissons} recuits en 5 images`);
check('une ferme écarte le décor debout de son emprise', interfaceRelue.ferme.dessous > 0 && interfaceRelue.ferme.peintes === 0,
  `${interfaceRelue.ferme.dessous} pièce(s) sous la ferme, ${interfaceRelue.ferme.peintes} peinte(s) dessus`);

// Retours de la partie jouée de bout en bout (septembre).
const finsDePartie = await page.evaluate(async () => {
  const g = window.__jeu, w = g.world, T = 32;
  const attendre = (ms) => new Promise((res) => setTimeout(res, ms));
  const r = {};
  const commande = (texte) => [...document.querySelectorAll('#command-panel .cmd')].find((b) => b.querySelector('.cmd-label')?.textContent.trim() === texte);
  const tc = w.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const villageois = w.units.filter((u) => u.playerIndex === 0 && u.isVillager && !u.dead);
  // « + Or » sur un villageois chargé d'autre chose : il livre d'abord, mais
  // compte tout de suite à l'or.
  for (const v of villageois) v.stop();
  const baie = w.findNearestResource(tc.x, tc.y, 'food', 40 * T, 0);
  for (const v of villageois) { v.gatherAt(baie.tx, baie.ty); v.carry = { type: 'food', amount: 8 }; }
  const or0 = g.workerStats().gold;
  g.assignWorker('gold');
  r.plusOr = { avant: or0, apres: g.workerStats().gold };
  for (const v of villageois) v.stop();
  // « Détruire » : un premier appui arme le bouton, rien n'est rasé.
  g.setSelection([tc]);
  await attendre(150);
  commande('Détruire')?.click();
  await attendre(150);
  r.cv = { debout: !tc.dead, confirmer: !!commande('Confirmer') };
  g.setSelection([]);
  // Une maison : deux appuis la rasent.
  const maison = w.spawnBuilding(0, 'house', tc.tx + 6, tc.ty + 6, true);
  g.setSelection([maison]);
  await attendre(150);
  commande('Détruire')?.click();
  await attendre(120);
  commande('Confirmer')?.click();
  await attendre(120);
  r.maison = maison.dead;
  // Consignes de ralliement et d'attaque : effacées une fois l'ordre donné.
  const bulle = () => !document.getElementById('build-hint').classList.contains('hidden');
  g.setSelection([tc]);
  g.toggleRally();
  const ralliementAffiche = bulle();
  const ecran = g.camera.worldToScreen(tc.x + T * 4, tc.y + T * 4);
  g.tapAt(ecran.x, ecran.y, false);
  r.ralliement = { avant: ralliementAffiche, apres: bulle() };
  g.setSelection(villageois.slice(0, 2));
  g.toggleAttackMove();
  const attaqueAffiche = bulle();
  g.tapAt(ecran.x, ecran.y, false);
  r.attaque = { avant: attaqueAffiche, apres: bulle() };
  g.setSelection([]);
  return r;
});
check('« Détruire » sur le Centre-Ville : un seul appui ne rase rien, le bouton demande confirmation', finsDePartie.cv.debout && finsDePartie.cv.confirmer,
  JSON.stringify(finsDePartie.cv));
check('et « Confirmer » rase le bâtiment', finsDePartie.maison === true, `maison ${finsDePartie.maison ? 'rasée' : 'debout'}`);
check('la consigne du ralliement s’efface une fois le point posé', finsDePartie.ralliement.avant && !finsDePartie.ralliement.apres, JSON.stringify(finsDePartie.ralliement));
check('celle de l’attaque aussi, l’ordre donné', finsDePartie.attaque.avant && !finsDePartie.attaque.apres, JSON.stringify(finsDePartie.attaque));
check('« + Or » : le villageois qui livre d’abord compte déjà à l’or', finsDePartie.plusOr.apres === finsDePartie.plusOr.avant + 1,
  `or ${finsDePartie.plusOr.avant} → ${finsDePartie.plusOr.apres}`);

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

// Avant d'abandonner : les deux menus ouverts une fois (leurs boutons gardent
// des écouteurs), et le son coupé.
await page.evaluate(async () => {
  const g = window.__jeu;
  g.openBuildMenu(); g.ui.closeBuildMenu();
  g.ui.openWorkerMenu(); g.ui.closeWorkerMenu();
  if (g.audio.enabled) document.getElementById('btn-sound').click();
});
const iconeSonCoupe = await page.evaluate(() => document.getElementById('btn-sound').innerHTML);

// Écran de fin (on abandonne volontairement)
await page.evaluate(() => window.__jeu.resign());
await page.waitForTimeout(300);
const endText = await page.textContent('.modal-card');
check('écran de fin affiché', endText.includes('Défaite') && endText.includes('Ressources récoltées'));

// Une nouvelle partie n'hérite pas des écouteurs de la précédente : le bouton
// du son répondait deux fois, donc ne changeait rien.
await page.click('[data-act="again"]');
await page.waitForTimeout(1500);
const iconeNouvellePartie = await page.evaluate(() => document.getElementById('btn-sound').innerHTML);
const nouvelle = await page.evaluate(() => {
  const g = window.__jeu;
  const avant = g.audio.enabled;
  document.getElementById('btn-sound').click();
  const apres = g.audio.enabled;
  document.getElementById('btn-sound').click();
  return { avant, apres };
});
check('nouvelle partie : un appui sur le son le bascule une seule fois', nouvelle.avant !== nouvelle.apres, JSON.stringify(nouvelle));
check('son coupé dans la partie précédente : le bouton le montre encore', !nouvelle.avant && iconeNouvellePartie === iconeSonCoupe,
  `son ${nouvelle.avant ? 'actif' : 'coupé'}, icône ${iconeNouvellePartie === iconeSonCoupe ? '« coupé »' : '« actif »'}`);

// L'ancienne partie ne reste pas en mémoire : les boutons de ses menus,
// restés dans la page, retenaient toute la partie par leurs écouteurs.
async function instances(expression) {
  await cdp.send('HeapProfiler.collectGarbage');
  const { result: proto } = await cdp.send('Runtime.evaluate', { expression, objectGroup: 'fuite' });
  const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.objectId, objectGroup: 'fuite' });
  const { result } = await cdp.send('Runtime.callFunctionOn', {
    objectId: objects.objectId, returnByValue: true, objectGroup: 'fuite', functionDeclaration: 'function () { return this.length; }',
  });
  await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'fuite' });
  return result.value;
}
const rendus = await instances('Object.getPrototypeOf(window.__jeu.renderer)');
const mondes = await instances('Object.getPrototypeOf(window.__jeu.world)');
check('nouvelle partie : l’ancienne ne reste pas en mémoire', rendus === 1 && mondes === 1, `${rendus} rendu(s), ${mondes} monde(s)`);

// Petits écrans : téléphone en paysage, puis petit téléphone en portrait.
async function ouvrirPartie(viewport) {
  const ctx = await browser.newContext({ viewport, screen: viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.click('#btn-play');
  await p.waitForFunction(() => !!(window.__jeu && window.__jeu.world));
  await p.waitForTimeout(1200);
  return { ctx, p };
}
{
  const { ctx, p } = await ouvrirPartie({ width: 740, height: 360 });
  // Le panneau des ouvriers défile : sa bascule reste atteignable.
  await p.click('#btn-workers');
  await p.waitForTimeout(300);
  const avant = await p.evaluate(() => window.__jeu.autoWorkers());
  let touche = true;
  try { await p.tap('#auto-workers', { timeout: 2000 }); } catch { touche = false; }
  const apres = await p.evaluate(() => window.__jeu.autoWorkers());
  check('paysage 740×360 : la bascule du panneau des ouvriers s’atteint et répond', touche && avant !== apres, `${avant} → ${apres}`);
  await p.click('#btn-close-workers');
  // La partie vide de la barre des ouvriers laisse passer les appuis vers la carte.
  await p.evaluate(() => { const g = window.__jeu; g.setSelection(g.world.units.filter((u) => u.playerIndex === 0 && u.isVillager)); });
  await p.waitForTimeout(200);
  const sous = await p.evaluate(() => {
    const bar = document.getElementById('worker-bar').getBoundingClientRect();
    const fin = Math.max(...[...document.querySelectorAll('#worker-bar > *')].map((n) => n.getBoundingClientRect().right));
    const n = document.elementFromPoint(Math.round((fin + innerWidth - 8) / 2), Math.round(bar.top + bar.height / 2));
    return n ? (n.id || n.tagName) : '-';
  });
  check('paysage 740×360 : la partie vide de la barre des ouvriers laisse toucher la carte', sous === 'game' || sous === 'CANVAS', sous);
  await ctx.close();
}
{
  const { ctx, p } = await ouvrirPartie({ width: 360, height: 640 });
  await p.evaluate(() => {
    const g = window.__jeu; g.speed = 0;
    g.focusTownCenter();
    g.setSelection(g.world.units.filter((u) => u.playerIndex === 0 && u.isVillager));
    g.startBuildMode('house');
    document.getElementById('alerts').innerHTML = '';
  });
  const tc = await p.evaluate(() => { const g = window.__jeu; const b = g.world.buildings.find((x) => x.type === 'towncenter' && x.playerIndex === 0); return g.camera.worldToScreen(b.x, b.y); });
  await p.touchscreen.tap(tc.x, tc.y);
  await p.waitForTimeout(250);
  const m = await p.evaluate(() => {
    const rec = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const bulle = document.getElementById('build-hint');
    const hint = bulle.getBoundingClientRect();
    const t = [...document.querySelectorAll('#alerts .toast')].find((n) => n.dataset.message.startsWith('Emplacement impossible'));
    return {
      notification: t ? rec(t.getBoundingClientRect(), hint) : -1,
      minimap: rec(document.getElementById('minimap-wrap').getBoundingClientRect(), hint),
      lignes: Math.round(hint.height / parseFloat(getComputedStyle(bulle).lineHeight || 16)),
      traversable: getComputedStyle(bulle).pointerEvents === 'none',
    };
  });
  check('360×640 : la bulle de construction ne cache ni la notification ni la minimap, et laisse passer le doigt',
    m.notification === 0 && m.minimap === 0 && m.traversable, JSON.stringify(m));
  await ctx.close();
}

{
  // Écran d'accueil sur 360 px : les quatre vitesses tiennent dans l'écran.
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, screen: { width: 360, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  await p.goto(BASE, { waitUntil: 'networkidle' });
  const vitesses = await p.evaluate(() => [...document.querySelectorAll('#speed-options > *')].map((n) => Math.round(n.getBoundingClientRect().right)));
  check('360 px : les quatre vitesses de jeu tiennent dans l’écran', vitesses.length === 4 && Math.max(...vitesses) <= 360, JSON.stringify(vitesses));
  // Une partie, sauvegardée puis reprise : pas de conseil de départ.
  await p.click('#btn-play');
  await p.waitForFunction(() => !!(window.__jeu && window.__jeu.world));
  await p.waitForTimeout(800);
  const conseilNeuve = await p.evaluate(() => [...document.querySelectorAll('#alerts .toast')].some((t) => t.textContent.startsWith('Affectez')));
  // Notifications : jamais sur la minimap.
  const minimap = await p.evaluate(async () => {
    for (let i = 0; i < 4; i++) window.__jeu.ui.toast(`Essai de notification numéro ${i} assez longue pour s’étendre`);
    await new Promise((res) => setTimeout(res, 100));
    const m = document.getElementById('minimap-wrap').getBoundingClientRect();
    return [...document.querySelectorAll('#alerts .toast')].map((t) => t.getBoundingClientRect())
      .filter((t) => t.right > m.left && t.left < m.right && t.bottom > m.top && t.top < m.bottom).length;
  });
  check('360 px : les notifications laissent la minimap dégagée', minimap === 0, `${minimap} notification(s) dessus`);
  // Fin de partie serrée, au temps : les scores exacts, pas « 4,0k » contre « 4,0k ».
  const fin = await p.evaluate(() => {
    window.__jeu.ui.showGameOver({ winner: 0, victory: true, timeUp: true, time: 600, scores: [3990, 3960] });
    return document.querySelector('.modal-card').textContent;
  });
  check('fin serrée : les deux scores se lisent en entier', /3\s?990/.test(fin) && /3\s?960/.test(fin) && !/4,0k/.test(fin), (fin.match(/Score final.*$/m) || [''])[0].slice(0, 60));
  await p.evaluate(() => { window.__jeu.ui.hideModal(); window.__jeu.saveNow(); });
  await p.reload({ waitUntil: 'networkidle' });
  await p.click('#btn-resume');
  await p.waitForFunction(() => !!(window.__jeu && window.__jeu.world));
  await p.waitForTimeout(600);
  const conseilReprise = await p.evaluate(() => [...document.querySelectorAll('#alerts .toast')].some((t) => t.textContent.startsWith('Affectez')));
  check('le conseil de départ s’affiche en partie neuve, pas à la reprise', conseilNeuve && !conseilReprise,
    `neuve : ${conseilNeuve ? 'affiché' : 'absent'} · reprise : ${conseilReprise ? 'affiché' : 'absent'}`);
  await ctx.close();
}
{
  // Paysage : les notifications ne passent pas sous la barre des ouvriers.
  const { ctx, p } = await ouvrirPartie({ width: 740, height: 360 });
  const dessous = await p.evaluate(async () => {
    for (let i = 0; i < 5; i++) window.__jeu.ui.toast(`Essai ${i}`);
    await new Promise((res) => setTimeout(res, 100));
    const barre = document.getElementById('worker-bar').getBoundingClientRect();
    return [...document.querySelectorAll('#alerts .toast')].filter((t) => getComputedStyle(t).display !== 'none')
      .map((t) => t.getBoundingClientRect()).filter((t) => t.bottom > barre.top && t.left < barre.right).length;
  });
  check('paysage : aucune notification sous la barre des ouvriers', dessous === 0, `${dessous} dessous`);
  await ctx.close();
}

check('aucune erreur console', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
try { process.kill(-server.pid); } catch {}
console.log(`\n${failures === 0 ? '✅ Navigateur : tous les tests passent' : '❌ ' + failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
