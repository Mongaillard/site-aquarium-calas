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
  for (let r = 3; r <= 12 && !spot; r++) {
    for (let dy = -r; dy <= r && !spot; dy++) {
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
  };
});
check('la partie s’écrit dans le navigateur', avantRechargement.sauvegarde);

await page.reload({ waitUntil: 'networkidle' });
check('la carte de reprise est proposée au retour', await page.isVisible('#btn-resume'));
const resumeTexte = await page.textContent('.resume-info');
await page.click('#btn-resume');
// On fige la partie tout de suite : elle reprend à la milliseconde où on la
// relance, et quelques secondes de jeu suffiraient à fausser la comparaison.
await page.waitForTimeout(120);
const apresReprise = await page.evaluate(() => {
  const g = window.__jeu;
  g.paused = true;
  const p = g.world.players[0];
  return {
    time: Math.round(g.world.time),
    food: Math.round(p.resources.food),
    unites: g.world.units.filter((u) => !u.dead).length,
    batiments: g.world.buildings.filter((b) => !b.dead).length,
  };
});
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
