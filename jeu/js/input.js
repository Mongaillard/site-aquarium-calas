// ---------------------------------------------------------------------------
// Entrées tactiles et souris.
//
// Grammaire des gestes (pensée pour le pouce) :
//   1 doigt qui glisse  → déplacement de la caméra
//   tap court           → sélection, ou ordre contextuel si une unité est choisie
//   double tap          → sélectionne toutes les unités du même type à l'écran
//   appui long + glisse → sélection rectangulaire
//   2 doigts            → zoom (pincement) et déplacement
// Souris : clic gauche = sélection / rectangle, clic droit = ordre, molette = zoom.
// ---------------------------------------------------------------------------

const TAP_MAX_MS = 260;
// Seuils exprimés en ÉCART au point de départ, jamais en distance cumulée :
// un doigt posé sans bouger tremble de quelques pixels à chaque événement, et
// cumuler ces micro-mouvements annulait l'appui long avant qu'il ne se déclenche.
const TAP_MAX_MOVE = 16;
const LONG_PRESS_MS = 380;
const DOUBLE_TAP_MS = 320;

export class InputController {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.camera = game.camera;
    this.pointers = new Map();
    this.mode = 'idle';        // idle | pan | box | pinch
    this.longPressTimer = null;
    this.lastTap = { time: 0, x: 0, y: 0 };
    this.keys = new Set();
    this.attach();
  }

  attach() {
    const c = this.canvas;
    // Le canvas et la fenêtre servent à toutes les parties : les écouteurs
    // s'en vont avec la partie (voir Game.destroy).
    const signal = this.game.ecouteurs?.signal;
    const opts = { passive: false, signal };
    c.addEventListener('pointerdown', (e) => this.onPointerDown(e), opts);
    c.addEventListener('pointermove', (e) => this.onPointerMove(e), opts);
    c.addEventListener('pointerup', (e) => this.onPointerUp(e), opts);
    c.addEventListener('pointercancel', (e) => this.onPointerCancel(e), opts);
    c.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      this.camera.zoomBy(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - rect.left, e.clientY - rect.top);
    }, opts);
    window.addEventListener('keydown', (e) => this.onKeyDown(e), { signal });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()), { signal });
    window.addEventListener('blur', () => this.keys.clear(), { signal });
  }

  localPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  onPointerDown(e) {
    // La capture échoue sur certains navigateurs (pointeur déjà relâché) :
    // ce n'est pas une raison pour perdre le geste.
    try { this.canvas.setPointerCapture?.(e.pointerId); } catch { /* sans importance */ }
    const p = this.localPoint(e);
    this.pointers.set(e.pointerId, {
      id: e.pointerId, startX: p.x, startY: p.y, x: p.x, y: p.y,
      time: performance.now(), moved: 0, drift: 0, button: e.button, type: e.pointerType,
    });

    // Clic droit souris : ordre immédiat.
    if (e.pointerType === 'mouse' && e.button === 2) {
      this.game.commandAt(p.x, p.y);
      return;
    }

    if (this.pointers.size === 2) {
      this.cancelLongPress();
      const [a, b] = [...this.pointers.values()];
      this.mode = 'pinch';
      this.pinchStart = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      };
      this.game.setSelectionBox(null);
      return;
    }

    if (this.pointers.size === 1) {
      this.mode = 'idle';
      if (this.game.buildMode) {
        this.game.updateGhost(p.x, p.y);
        return;
      }
      if (e.pointerType === 'mouse') {
        // À la souris, le clic gauche trace directement un rectangle.
        this.mode = 'box';
        this.boxStart = { x: p.x, y: p.y };
        return;
      }
      this.longPressTimer = setTimeout(() => {
        this.longPressTimer = null;
        const pointer = this.pointers.get(e.pointerId);
        if (!pointer || pointer.drift > TAP_MAX_MOVE) return;
        this.mode = 'box';
        this.boxStart = { x: pointer.x, y: pointer.y };
        this.game.setSelectionBox({ x0: pointer.x, y0: pointer.y, x1: pointer.x, y1: pointer.y });
        this.game.vibrate(12);
      }, LONG_PRESS_MS);
    }
  }

  onPointerMove(e) {
    const pointer = this.pointers.get(e.pointerId);
    if (!pointer) return;
    const p = this.localPoint(e);
    const dx = p.x - pointer.x, dy = p.y - pointer.y;
    pointer.moved += Math.hypot(dx, dy);
    pointer.drift = Math.hypot(p.x - pointer.startX, p.y - pointer.startY);
    pointer.x = p.x; pointer.y = p.y;

    if (this.mode === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      if (this.pinchStart.dist > 0) {
        this.camera.zoomBy(dist / this.pinchStart.dist, midX, midY);
      }
      this.camera.panByScreen(midX - this.pinchStart.midX, midY - this.pinchStart.midY);
      this.pinchStart = { dist, midX, midY };
      return;
    }

    if (this.mode === 'box') {
      this.game.setSelectionBox({ x0: this.boxStart.x, y0: this.boxStart.y, x1: p.x, y1: p.y });
      return;
    }

    if (this.game.buildMode) {
      this.game.updateGhost(p.x, p.y);
      return;
    }

    if (pointer.drift > TAP_MAX_MOVE) {
      this.cancelLongPress();
      this.mode = 'pan';
      this.camera.panByScreen(dx, dy);
    }
  }

  onPointerUp(e) {
    const pointer = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.cancelLongPress();
    if (!pointer) return;

    if (this.mode === 'pinch') {
      if (this.pointers.size < 2) this.mode = this.pointers.size === 1 ? 'pan' : 'idle';
      return;
    }
    // Le doigt resté posé après un pincement : la vue a bougé, ce n'est pas
    // un appui (sinon ordre, ou pose de bâtiment, sous ce doigt immobile).
    if (this.mode === 'pan') { this.mode = 'idle'; return; }

    if (this.mode === 'box') {
      const box = { x0: this.boxStart.x, y0: this.boxStart.y, x1: pointer.x, y1: pointer.y };
      this.game.setSelectionBox(null);
      this.mode = 'idle';
      const w = Math.abs(box.x1 - box.x0), h = Math.abs(box.y1 - box.y0);
      // Un appui long sans glisser sélectionne quand même ce qui est sous le
      // doigt : le joueur a clairement demandé une sélection.
      if (w > 8 || h > 8) { this.game.boxSelect(box); return; }
      if (pointer.type !== 'mouse') { this.game.tapAt(pointer.x, pointer.y, false); return; }
      // Rectangle dégénéré : on retombe sur un simple clic.
      if (pointer.type === 'mouse' && pointer.button === 0) { this.game.tapAt(pointer.x, pointer.y, false); return; }
    }

    const duration = performance.now() - pointer.time;
    const isTap = duration < TAP_MAX_MS * 2.2 && pointer.drift <= TAP_MAX_MOVE;
    if (!isTap) { this.mode = 'idle'; return; }

    if (this.game.buildMode) {
      this.game.confirmBuild(pointer.x, pointer.y);
      this.mode = 'idle';
      return;
    }

    const now = performance.now();
    const isDouble = now - this.lastTap.time < DOUBLE_TAP_MS
      && Math.hypot(pointer.x - this.lastTap.x, pointer.y - this.lastTap.y) < 36;
    this.lastTap = { time: now, x: pointer.x, y: pointer.y };
    this.game.tapAt(pointer.x, pointer.y, isDouble);
    this.mode = 'idle';
  }

  /**
   * Geste interrompu par le système (appel entrant, geste de bord, paume) :
   * on oublie le doigt sans rien exécuter — ni appui, ni rectangle.
   */
  onPointerCancel(e) {
    this.pointers.delete(e.pointerId);
    this.cancelLongPress();
    this.game.setSelectionBox(null);
    if (this.pointers.size < 2) this.mode = this.pointers.size === 1 ? 'pan' : 'idle';
  }

  cancelLongPress() {
    if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
  }

  onKeyDown(e) {
    const key = e.key.toLowerCase();
    this.keys.add(key);
    if (key === 'escape') { this.game.onEscape(); return; }
    if (key === 'delete' || key === 'suppr') { this.game.deleteSelected(); return; }
    if (key === '.') { this.game.focusIdleVillager(); return; }
    if (key === 'h') { this.game.focusTownCenter(); return; }
    if (key === ' ') { e.preventDefault(); this.game.togglePause(); }
  }

  /** Défilement au clavier, appelé à chaque image. */
  updateKeyboardPan(dt) {
    let dx = 0, dy = 0;
    const k = this.keys;
    if (k.has('arrowleft') || k.has('a') || k.has('q')) dx += 1;
    if (k.has('arrowright') || k.has('d')) dx -= 1;
    if (k.has('arrowup') || k.has('w') || k.has('z')) dy += 1;
    if (k.has('arrowdown') || k.has('s')) dy -= 1;
    if (dx || dy) this.camera.panByScreen(dx * 900 * dt, dy * 900 * dt);
  }
}
