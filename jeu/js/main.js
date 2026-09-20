// ---------------------------------------------------------------------------
// Point d'entrée : écrans, boucle de jeu à pas fixe, sélection et ordres.
// ---------------------------------------------------------------------------

import { TILE, TICKS_PER_SECOND, AGES, DIFFICULTIES, MAP_SIZES, BUILDING_TYPES } from './config.js';
import { World } from './game.js';
import { Camera, Renderer } from './render.js';
import { InputController } from './input.js';
import { UI } from './ui.js';
import { AudioEngine } from './audio.js';
import { villagerTask } from './entities.js';
import { dist2, clamp } from './utils.js';

const DT = 1 / TICKS_PER_SECOND;
const MAX_CATCHUP = 5;

const audio = new AudioEngine();

// Préférence « réaffectation automatique » : conservée d'une partie à l'autre.
const AUTO_WORKERS_KEY = 'aem.autoWorkers';

function loadAutoWorkers() {
  try { return localStorage.getItem(AUTO_WORKERS_KEY) === '1'; } catch { return false; }
}

function saveAutoWorkers(on) {
  try { localStorage.setItem(AUTO_WORKERS_KEY, on ? '1' : '0'); } catch { /* stockage indisponible */ }
}

class Game {
  constructor(options) {
    this.options = options;
    this.world = new World(options);
    this.canvas = document.getElementById('game');
    this.camera = new Camera(this.world);
    this.renderer = new Renderer(this.canvas, this.world, this.camera);
    this.renderer.initMinimap(document.getElementById('minimap'));
    this.audio = audio;
    this.ui = new UI(this);
    this.input = new InputController(this.canvas, this);
    this.selection = [];
    this.buildMode = null;
    this.attackMoveArmed = false;
    this.rallyArmed = false;
    this.garrisonArmed = false;
    this.paused = false;
    this.speed = 1;
    this.accumulator = 0;
    this.lastFrame = performance.now();
    this.alertCooldown = 0;
    this.idleNoticeCooldown = 0;
    this.running = true;
    this.world.players[this.world.humanIndex].autoWorkers = loadAutoWorkers();

    const home = this.world.buildings.find(
      (b) => b.playerIndex === this.world.humanIndex && b.type === 'towncenter');
    if (home) this.camera.centerOn(home.x, home.y);
    this.camera.zoom = clamp(this.camera.viewWidth / (24 * TILE), this.camera.minZoom, 1.1);

    window.addEventListener('resize', () => this.renderer.resize());
    this.ui.toast('Affectez vos villageois : touchez-les, puis touchez un arbre, un buisson ou un filon.');
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // --- Boucle ---------------------------------------------------------------

  loop(now) {
    if (!this.running) return;
    const realDt = Math.min(0.25, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    if (!this.paused && !this.world.gameOver) {
      this.accumulator += realDt * this.speed;
      let steps = 0;
      while (this.accumulator >= DT && steps < MAX_CATCHUP) {
        this.world.update(DT);
        this.accumulator -= DT;
        steps++;
      }
      if (steps === MAX_CATCHUP) this.accumulator = 0;   // on ne rattrape pas l'irrattrapable
    }

    this.input.updateKeyboardPan(realDt);
    if (this.idleNoticeCooldown > 0) this.idleNoticeCooldown -= realDt;
    this.processEvents();
    this.pruneSelection();
    this.renderer.render();
    this.renderer.drawMinimap();
    this.ui.update(realDt);
    if (this.alertCooldown > 0) this.alertCooldown -= realDt;
    requestAnimationFrame(this.loop);
  }

  processEvents() {
    for (const event of this.world.drainEvents()) {
      const mine = event.player === this.world.humanIndex;
      switch (event.type) {
        case 'built':
          if (event.building.playerIndex === this.world.humanIndex) {
            this.audio.play('built');
            this.ui.toast(`${event.building.def.name} terminé${event.building.def.fem ? 'e' : ''}`);
          }
          break;
        case 'trained': if (mine) this.audio.play('trained'); break;
        case 'melee': if (this.world.isVisible(event.x, event.y)) this.audio.play('melee'); break;
        case 'shoot': if (this.world.isVisible(event.x, event.y)) this.audio.play('shoot'); break;
        case 'destroyed': if (this.world.isVisible(event.x, event.y)) this.audio.play('destroyed'); break;
        case 'notice': this.ui.toast(event.text, 'warn'); break;
        case 'idleWorker':
          // On prévient sans harceler : le compteur 💤 reste la source de vérité.
          if (this.idleNoticeCooldown <= 0) {
            this.idleNoticeCooldown = 15;
            const count = this.idleVillagers().length;
            this.ui.toast(count > 1
              ? `${count} villageois attendent vos ordres`
              : 'Un villageois attend vos ordres', 'warn');
          }
          break;
        case 'tech':
          if (mine) this.ui.toast('Technologie terminée', 'good');
          break;
        case 'age':
          if (mine) {
            this.audio.play('age');
            this.ui.toast(`Bienvenue dans l'${AGES[event.age].name} !`, 'good');
          } else {
            this.ui.toast(`L'adversaire atteint l'${AGES[event.age].name}`, 'warn');
          }
          break;
        case 'underAttack':
          if (this.alertCooldown <= 0) {
            this.alertCooldown = 12;
            this.audio.play('alert');
            this.ui.toast('Vous êtes attaqué !', 'error');
            this.lastAttackPoint = { x: event.x, y: event.y };
            this.vibrate([18, 60, 18]);
          }
          break;
        case 'gameOver':
          this.audio.play(event.result.victory ? 'victory' : 'defeat');
          this.ui.showGameOver(event.result);
          break;
      }
    }
  }

  pruneSelection() {
    if (this.selection.some((e) => e.dead)) {
      this.selection = this.selection.filter((e) => !e.dead);
      this.ui.refreshSelection(true);
    }
  }

  // --- Sélection ------------------------------------------------------------

  setSelection(entities) {
    for (const e of this.selection) e.selected = false;
    this.selection = entities.filter((e) => e && !e.dead);
    for (const e of this.selection) e.selected = true;
    this.ui.refreshSelection(true);
  }

  setSelectionBox(box) { this.renderer.selectionBox = box; }

  tapAt(screenX, screenY, isDouble) {
    const p = this.camera.screenToWorld(screenX, screenY);
    this.audio.resume();

    if (this.rallyArmed && this.selection.length === 1 && this.selection[0].kind === 'building') {
      this.world.setRally(this.selection[0], p.x, p.y);
      this.rallyArmed = false;
      this.audio.play('order');
      this.ui.toast('Point de ralliement défini');
      this.ui.refreshSelection(true);
      return;
    }

    const ownUnits = this.selection.filter(
      (e) => e.kind === 'unit' && e.playerIndex === this.world.humanIndex);

    if (this.attackMoveArmed && ownUnits.length > 0) {
      this.attackMoveArmed = false;
      this.world.formationMove(ownUnits, p.x, p.y, true);
      this.pingOrder(p.x, p.y, '#ff9b6b');
      this.audio.play('order');
      this.ui.refreshSelection(true);
      return;
    }

    // Mode « abriter » armé : le prochain appui désigne le refuge.
    if (this.garrisonArmed) {
      this.garrisonArmed = false;
      this.ui.setBuildHint('');
      const shelter = this.world.entityAt(p.x, p.y, this.world.humanIndex);
      if (shelter && shelter.kind === 'building' && shelter.def.garrison && ownUnits.length) {
        const sent = this.world.garrisonUnits(ownUnits, shelter);
        if (sent > 0) {
          this.ui.toast(`${sent} unité(s) se mettent à l'abri`);
          this.audio.play('order');
          this.vibrate(10);
        }
      } else {
        this.ui.toast('Touchez un Centre-Ville ou une tour', 'error');
        this.audio.play('error');
      }
      this.ui.refreshSelection(true);
      return;
    }

    const entity = this.world.entityAt(p.x, p.y);
    const isMine = entity && entity.playerIndex === this.world.humanIndex;
    const visible = entity && (isMine || this.renderer.isEntityVisible(entity));

    if (entity && isMine) {
      // Des soldats qui touchent un abri allié n'ont qu'une intention possible :
      // s'y réfugier. Pour les villageois on reste sur la sélection, qui sert
      // aussi à produire ou à passer un âge (l'abri a son bouton dédié).
      if (entity.kind === 'building' && entity.def.garrison && ownUnits.length > 0
          && ownUnits.every((u) => !u.isVillager && entity.canGarrison(u))) {
        const sent = this.world.garrisonUnits(ownUnits, entity);
        if (sent > 0) {
          this.ui.toast(`${sent} unité(s) se mettent à l'abri`);
          this.audio.play('order');
          this.pingOrder(entity.x, entity.y, '#c39bf6');
          this.ui.refreshSelection(true);
          return;
        }
      }
      if (isDouble && entity.kind === 'unit') {
        this.selectSameTypeOnScreen(entity);
      } else {
        this.setSelection([entity]);
      }
      this.audio.play('select');
      this.vibrate(8);
      return;
    }

    if (ownUnits.length > 0) { this.issueOrder(p.x, p.y); return; }

    if (entity && visible) { this.setSelection([entity]); this.audio.play('select'); return; }
    this.setSelection([]);
  }

  commandAt(screenX, screenY) {
    const ownUnits = this.selection.filter(
      (e) => e.kind === 'unit' && e.playerIndex === this.world.humanIndex);
    if (ownUnits.length === 0) return;
    const p = this.camera.screenToWorld(screenX, screenY);
    this.issueOrder(p.x, p.y);
  }

  issueOrder(worldX, worldY) {
    const units = this.selection.filter(
      (e) => e.kind === 'unit' && e.playerIndex === this.world.humanIndex);
    if (units.length === 0) return;
    const result = this.world.commandUnits(units, worldX, worldY);
    const colors = {
      attack: '#ff6b6b', gather: '#ffd166', build: '#8ecae6',
      repair: '#8ecae6', garrison: '#c39bf6', move: '#9bf6a0',
    };
    this.pingOrder(worldX, worldY, colors[result ? result.kind : 'move'] || '#9bf6a0');
    this.audio.play('order');
    this.vibrate(8);
  }

  pingOrder(x, y, color) {
    this.world.effects.push({ kind: 'ping', x, y, life: 0.6, max: 0.6, color });
  }

  boxSelect(box) {
    const a = this.camera.screenToWorld(box.x0, box.y0);
    const b = this.camera.screenToWorld(box.x1, box.y1);
    const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
    const inBox = (e) => e.x >= minX && e.x <= maxX && e.y >= minY && e.y <= maxY;
    const mine = this.world.humanIndex;
    let picked = this.world.units.filter((u) => !u.dead && u.playerIndex === mine && inBox(u));
    // Priorité aux unités militaires : on ne veut pas embarquer les villageois
    // au travail quand on rassemble une armée.
    const military = picked.filter((u) => !u.isVillager);
    if (military.length > 0 && military.length !== picked.length) picked = military;
    if (picked.length === 0) {
      picked = this.world.buildings.filter((b) => !b.dead && b.playerIndex === mine && inBox(b)).slice(0, 1);
    }
    this.setSelection(picked);
    if (picked.length > 0) { this.audio.play('select'); this.vibrate(10); }
  }

  selectSameTypeOnScreen(entity) {
    const view = this.renderer.visibleTileRange();
    const same = this.world.units.filter((u) => !u.dead
      && u.playerIndex === entity.playerIndex && u.type === entity.type
      && u.x >= view.left && u.x <= view.right && u.y >= view.top && u.y <= view.bottom);
    this.setSelection(same.length ? same : [entity]);
    this.ui.toast(`${same.length} ${entity.def.name}${same.length > 1 ? 's' : ''}`);
  }

  filterSelection(type) {
    const filtered = this.selection.filter((e) => e.type === type);
    if (filtered.length) this.setSelection(filtered);
  }

  /** Applique une attitude à toute la sélection. */
  setStance(stanceId) {
    const units = this.selection.filter(
      (e) => e.kind === 'unit' && e.playerIndex === this.world.humanIndex);
    if (units.length === 0) return;
    this.world.setStance(units, stanceId);
    this.audio.play('click');
    this.ui.refreshSelection(true);
  }

  /** Cloche du village : tout le monde à l'abri, ou tout le monde dehors. */
  ringTownBell() {
    const result = this.world.ringTownBell(this.world.humanIndex);
    if (result.sheltered > 0) {
      this.ui.toast(`🔔 ${result.sheltered} villageois à l'abri`, 'warn');
      this.audio.play('alert');
      this.vibrate([12, 40, 12]);
    } else if (result.released > 0) {
      this.ui.toast(`🔔 ${result.released} villageois retournent au travail`);
      this.audio.play('order');
    } else {
      this.ui.toast('Aucun abri disponible', 'error');
      this.audio.play('error');
    }
    this.ui.refreshSelection(true);
  }

  releaseGarrison(building) {
    const released = this.world.releaseGarrison(building);
    if (released.length === 0) this.audio.play('error');
    else this.audio.play('order');
    this.ui.refreshSelection(true);
  }

  stopSelection() {
    for (const e of this.selection) if (e.kind === 'unit') e.stop();
    this.attackMoveArmed = false;
    this.ui.refreshSelection(true);
  }

  toggleAttackMove() {
    this.attackMoveArmed = !this.attackMoveArmed;
    this.rallyArmed = false;
    this.garrisonArmed = false;
    this.ui.setBuildHint(this.attackMoveArmed ? 'Touchez la zone à attaquer' : '');
    this.ui.refreshSelection(true);
  }

  toggleRally() {
    this.rallyArmed = !this.rallyArmed;
    this.attackMoveArmed = false;
    this.garrisonArmed = false;
    this.ui.setBuildHint(this.rallyArmed ? 'Touchez le point de ralliement' : '');
    this.ui.refreshSelection(true);
  }

  toggleGarrison() {
    this.garrisonArmed = !this.garrisonArmed;
    this.attackMoveArmed = false;
    this.rallyArmed = false;
    this.ui.setBuildHint(this.garrisonArmed ? 'Touchez le Centre-Ville ou la tour où s’abriter' : '');
    this.ui.refreshSelection(true);
  }

  // --- Construction ---------------------------------------------------------

  openBuildMenu() { this.ui.openBuildMenu(); }

  startBuildMode(type) {
    this.buildMode = { type, tx: 0, ty: 0, valid: false };
    this.ui.closeBuildMenu();
    this.ui.setBuildHint(`${BUILDING_TYPES[type].name} : touchez l'emplacement (2 doigts pour déplacer la vue)`);
    const center = this.camera.screenToWorld(this.camera.viewWidth / 2, this.camera.viewHeight / 2);
    this.updateGhostWorld(center.x, center.y);
  }

  updateGhost(screenX, screenY) {
    const p = this.camera.screenToWorld(screenX, screenY);
    this.updateGhostWorld(p.x, p.y);
  }

  updateGhostWorld(worldX, worldY) {
    if (!this.buildMode) return;
    const def = BUILDING_TYPES[this.buildMode.type];
    const tx = Math.round(worldX / TILE - def.size / 2);
    const ty = Math.round(worldY / TILE - def.size / 2);
    this.buildMode.tx = clamp(tx, 0, this.world.map.w - def.size);
    this.buildMode.ty = clamp(ty, 0, this.world.map.h - def.size);
    this.buildMode.valid = this.world.canPlace(
      this.world.humanIndex, this.buildMode.type, this.buildMode.tx, this.buildMode.ty);
    this.renderer.ghost = this.buildMode;
  }

  confirmBuild(screenX, screenY) {
    if (!this.buildMode) return;
    if (screenX !== undefined) this.updateGhost(screenX, screenY);
    const { type, tx, ty, valid } = this.buildMode;
    if (!valid) {
      this.ui.toast('Emplacement impossible ici', 'error');
      this.audio.play('error');
      return;
    }
    const builders = this.selection.filter((e) => e.kind === 'unit' && e.isVillager);
    const crew = builders.length ? builders : this.pickNearestVillagers(tx, ty, 2);
    const site = this.world.placeBuilding(this.world.humanIndex, type, tx, ty, crew);
    if (site) {
      this.audio.play('place');
      this.vibrate(14);
      this.cancelBuild();
    }
  }

  pickNearestVillagers(tx, ty, count) {
    const x = tx * TILE, y = ty * TILE;
    return this.world.units
      .filter((u) => !u.dead && u.playerIndex === this.world.humanIndex && u.isVillager)
      .sort((a, b) => dist2(a.x, a.y, x, y) - dist2(b.x, b.y, x, y))
      .slice(0, count);
  }

  cancelBuild() {
    this.buildMode = null;
    this.renderer.ghost = null;
    this.ui.closeBuildMenu();
    this.ui.setBuildHint('');
  }

  cancelConstruction(building) {
    if (this.world.cancelConstruction(building)) {
      this.ui.toast('Chantier annulé, ressources rendues');
      this.setSelection([]);
    }
  }

  demolish(building) {
    this.world.killEntity(building, null, false);
    this.ui.toast(`${building.def.name} détruit`);
    this.setSelection([]);
  }

  trainUnit(building, unitType) { this.world.trainUnit(building, unitType); }
  researchTech(building, techId) { this.world.researchTech(building, techId); }
  advanceAge(building) {
    if (this.world.advanceAge(building)) this.ui.toast('Passage à l’âge suivant lancé…', 'good');
  }

  // --- Ouvriers : c'est le joueur qui affecte -------------------------------

  humanVillagers() {
    return this.world.units.filter(
      (u) => !u.dead && u.playerIndex === this.world.humanIndex && u.isVillager);
  }

  /** Répartition des villageois par métier, pour la barre et le panneau. */
  workerStats() {
    const stats = { food: 0, wood: 0, gold: 0, build: 0, move: 0, idle: 0, total: 0 };
    for (const v of this.humanVillagers()) {
      const task = villagerTask(v);
      if (stats[task] === undefined) stats[task] = 0;
      stats[task]++;
      stats.total++;
    }
    return stats;
  }

  villagersWithTask(task) {
    return this.humanVillagers().filter((v) => villagerTask(v) === task);
  }

  selectWorkerGroup(task) {
    const group = this.villagersWithTask(task);
    if (group.length === 0) { this.ui.toast('Aucun villageois à ce poste'); return; }
    this.setSelection(group);
    this.camera.centerOn(group[0].x, group[0].y);
    this.audio.play('select');
  }

  /**
   * Envoie un villageois de plus sur une ressource. On puise d'abord dans les
   * inactifs, puis dans le métier le plus fourni — jamais chez les bâtisseurs,
   * pour ne pas abandonner un chantier en cours.
   */
  assignWorker(type) {
    let pool = this.villagersWithTask('idle');
    if (pool.length === 0) pool = this.villagersWithTask('move');
    if (pool.length === 0) {
      const stats = this.workerStats();
      const from = ['food', 'wood', 'gold']
        .filter((t) => t !== type && stats[t] > 0)
        .sort((a, b) => stats[b] - stats[a])[0];
      if (from) pool = this.villagersWithTask(from);
    }
    if (pool.length === 0) { this.ui.toast('Aucun villageois disponible'); this.audio.play('error'); return false; }

    // On prend celui qui a le moins de chemin à faire.
    let best = null, bestD = Infinity;
    for (const v of pool) {
      const res = this.world.findNearestResource(v.x, v.y, type, 40 * TILE, this.world.humanIndex);
      if (!res) continue;
      const rx = res.kind === 'building' ? res.x : res.tx * TILE + TILE / 2;
      const ry = res.kind === 'building' ? res.y : res.ty * TILE + TILE / 2;
      const d = dist2(v.x, v.y, rx, ry);
      if (d < bestD) { bestD = d; best = v; }
    }
    if (!best || !this.world.assignVillager(best, type)) {
      const labels = { food: 'nourriture', wood: 'bois', gold: 'or' };
      this.ui.toast(`Plus de ${labels[type]} à portée — construisez une ferme ou explorez`, 'warn');
      this.audio.play('error');
      return false;
    }
    this.audio.play('order');
    this.vibrate(8);
    return true;
  }

  /** Retire un villageois d'un poste : il redevient disponible. */
  unassignWorker(type) {
    const group = this.villagersWithTask(type);
    if (group.length === 0) return false;
    // On libère en priorité quelqu'un qui n'a rien dans les bras.
    const target = group.find((v) => v.carry.amount < 1) || group[0];
    target.stop();
    this.audio.play('click');
    return true;
  }

  autoWorkers() { return this.world.players[this.world.humanIndex].autoWorkers; }

  setAutoWorkers(on) {
    this.world.players[this.world.humanIndex].autoWorkers = !!on;
    saveAutoWorkers(!!on);
    this.ui.toast(on
      ? 'Réaffectation automatique activée'
      : 'Réaffectation manuelle : vos villageois attendront vos ordres');
  }

  // --- Confort --------------------------------------------------------------

  idleVillagers() {
    return this.world.units.filter(
      (u) => !u.dead && u.playerIndex === this.world.humanIndex && u.isVillager && u.state === 'idle');
  }

  focusIdleVillager() {
    const idle = this.idleVillagers();
    if (idle.length === 0) { this.ui.toast('Aucun villageois inactif'); return; }
    this.idleIndex = ((this.idleIndex || 0) + 1) % idle.length;
    const villager = idle[this.idleIndex];
    this.setSelection([villager]);
    this.camera.centerOn(villager.x, villager.y);
    this.audio.play('select');
  }

  focusTownCenter() {
    const tc = this.world.buildings.find(
      (b) => !b.dead && b.playerIndex === this.world.humanIndex && b.type === 'towncenter');
    if (tc) { this.camera.centerOn(tc.x, tc.y); this.setSelection([tc]); }
  }

  minimapJump(nx, ny) {
    const map = this.world.map;
    this.camera.centerOn(clamp(nx, 0, 1) * map.pixelWidth, clamp(ny, 0, 1) * map.pixelHeight);
  }

  deleteSelected() {
    const mine = this.selection.filter((e) => e.playerIndex === this.world.humanIndex);
    for (const e of mine) {
      if (e.kind === 'building' && !e.complete) this.world.cancelConstruction(e);
      else this.world.killEntity(e, null, false);
    }
    this.setSelection([]);
  }

  onEscape() {
    if (!document.getElementById('worker-menu').classList.contains('hidden')) {
      this.ui.closeWorkerMenu();
      return;
    }
    if (this.buildMode) { this.cancelBuild(); return; }
    if (this.attackMoveArmed || this.rallyArmed || this.garrisonArmed) {
      this.attackMoveArmed = false; this.rallyArmed = false; this.garrisonArmed = false;
      this.ui.setBuildHint('');
      this.ui.refreshSelection(true);
      return;
    }
    if (this.selection.length) { this.setSelection([]); return; }
    this.togglePause();
  }

  togglePause() {
    if (this.world.gameOver) return;
    this.paused = !this.paused;
    if (this.paused) this.ui.showPause(); else this.ui.hideModal();
  }

  toggleSound() {
    const on = !this.audio.enabled;
    this.audio.setEnabled(on);
    document.getElementById('btn-sound').textContent = on ? '🔊' : '🔇';
    if (on) { this.audio.resume(); this.audio.play('click'); }
  }

  vibrate(pattern) {
    if (navigator.vibrate && this.options.haptics !== false) navigator.vibrate(pattern);
  }

  resign() {
    this.paused = false;
    this.ui.hideModal();
    this.world.resign();
  }

  restart() {
    this.destroy();
    startGame(this.options);
  }

  quitToMenu() {
    this.destroy();
    showStartScreen();
  }

  destroy() {
    this.running = false;
    this.ui.hideModal();
    this.ui.closeBuildMenu();
    this.ui.closeWorkerMenu();
    document.getElementById('hud').classList.add('hidden');
  }
}

// ---------------------------------------------------------------------------
// Écrans
// ---------------------------------------------------------------------------

let currentGame = null;
const settings = { difficulty: 'normal', mapSize: 'medium' };

function showStartScreen() {
  currentGame = null;
  document.getElementById('start-screen').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');
}

function startGame(options) {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  audio.resume();
  currentGame = new Game(options);
  window.__jeu = currentGame;   // pratique pour déboguer depuis la console
}

function setupStartScreen() {
  const difficultyBox = document.getElementById('difficulty-options');
  difficultyBox.innerHTML = Object.values(DIFFICULTIES).map((d) => `
    <button class="option ${d.id === settings.difficulty ? 'active' : ''}" data-difficulty="${d.id}">
      <span class="option-name">${d.name}</span>
      <span class="option-desc">${d.desc}</span>
    </button>`).join('');

  const mapBox = document.getElementById('map-options');
  mapBox.innerHTML = Object.values(MAP_SIZES).map((m) => `
    <button class="option compact ${m.id === settings.mapSize ? 'active' : ''}" data-map="${m.id}">
      <span class="option-name">${m.name}</span>
      <span class="option-desc">${m.tiles}×${m.tiles}</span>
    </button>`).join('');

  difficultyBox.querySelectorAll('[data-difficulty]').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.difficulty = btn.dataset.difficulty;
      difficultyBox.querySelectorAll('.option').forEach((b) => b.classList.toggle('active', b === btn));
      audio.resume(); audio.play('click');
    });
  });
  mapBox.querySelectorAll('[data-map]').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.mapSize = btn.dataset.map;
      mapBox.querySelectorAll('.option').forEach((b) => b.classList.toggle('active', b === btn));
      audio.resume(); audio.play('click');
    });
  });

  document.getElementById('btn-play').addEventListener('click', () => {
    startGame({ difficulty: settings.difficulty, mapSize: settings.mapSize, seed: Math.floor(Math.random() * 1e9) });
  });
  document.getElementById('btn-howto').addEventListener('click', () => {
    document.getElementById('howto').classList.toggle('hidden');
  });
}

setupStartScreen();
showStartScreen();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* hors-ligne indisponible, sans gravité */ });
  });
}
