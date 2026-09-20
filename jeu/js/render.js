// ---------------------------------------------------------------------------
// Rendu Canvas 2D : terrain, ressources, entités, brouillard, minimap.
// Aucune image externe : tout est dessiné au code (atlas de tuiles généré au
// démarrage), ce qui garde le jeu léger et instantané à charger.
// ---------------------------------------------------------------------------

import { TILE, BUILDING_TYPES } from './config.js';
import { TERRAIN } from './map.js';
import { clamp } from './utils.js';

// Variantes volontairement proches : un écart trop marqué transforme la
// prairie en damier et fatigue l'œil sur un petit écran.
const TERRAIN_COLORS = {
  [TERRAIN.GRASS]: ['#5d8b41', '#608e44', '#5a883f'],
  [TERRAIN.GRASS_DARK]: ['#4d7a3c', '#507d3f', '#4a763a'],
  [TERRAIN.DIRT]: ['#8a7146', '#8d7449', '#877044'],
  [TERRAIN.SAND]: ['#c9b07a', '#ccb37e', '#c6ad77'],
  [TERRAIN.WATER]: ['#2f6d9e', '#32709f', '#2c6a9a'],
};

const BUILDING_SKINS = {
  towncenter: { wall: '#d9c9a3', roof: '#a8452f', accent: '#8b6f47' },
  house: { wall: '#e0d2b0', roof: '#b4573a', accent: '#8b6f47' },
  mill: { wall: '#ddcda6', roof: '#9c7b3f', accent: '#7a6236' },
  lumbercamp: { wall: '#b08a5c', roof: '#7d5a33', accent: '#6b4c2b' },
  miningcamp: { wall: '#b3a894', roof: '#6f6a60', accent: '#5b564d' },
  farm: { wall: '#c9a44c', roof: '#a5842f', accent: '#7f6624' },
  barracks: { wall: '#cbbfa5', roof: '#8c4a3c', accent: '#6f5a3e' },
  archery: { wall: '#c7bda8', roof: '#6f7f52', accent: '#5d6b45' },
  stable: { wall: '#cdbb9a', roof: '#7a5a3a', accent: '#63482e' },
  siege: { wall: '#b9ad95', roof: '#5f5c50', accent: '#4d4a41' },
  blacksmith: { wall: '#bfb5a4', roof: '#4f4b45', accent: '#3d3a35' },
  tower: { wall: '#cfc6b2', roof: '#7c5a45', accent: '#5f4634' },
};

export class Camera {
  constructor(world) {
    this.world = world;
    this.x = 0;
    this.y = 0;
    this.zoom = 0.7;
    this.minZoom = 0.35;
    this.maxZoom = 1.7;
    this.viewWidth = 1;
    this.viewHeight = 1;
  }

  setViewport(width, height) {
    this.viewWidth = width;
    this.viewHeight = height;
    const fitZoom = width / (34 * TILE);
    this.minZoom = clamp(Math.min(fitZoom, 0.55), 0.18, 0.55);
    this.clampPosition();
  }

  centerOn(x, y) { this.x = x; this.y = y; this.clampPosition(); }

  zoomBy(factor, anchorScreenX, anchorScreenY) {
    const before = this.screenToWorld(anchorScreenX, anchorScreenY);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.screenToWorld(anchorScreenX, anchorScreenY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clampPosition();
  }

  panByScreen(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clampPosition();
  }

  clampPosition() {
    const map = this.world.map;
    const halfW = this.viewWidth / (2 * this.zoom);
    const halfH = this.viewHeight / (2 * this.zoom);
    const margin = TILE * 4;
    const minX = Math.min(halfW - margin, map.pixelWidth / 2);
    const maxX = Math.max(map.pixelWidth - halfW + margin, map.pixelWidth / 2);
    const minY = Math.min(halfH - margin, map.pixelHeight / 2);
    const maxY = Math.max(map.pixelHeight - halfH + margin, map.pixelHeight / 2);
    this.x = clamp(this.x, minX, maxX);
    this.y = clamp(this.y, minY, maxY);
  }

  worldToScreen(x, y) {
    return {
      x: (x - this.x) * this.zoom + this.viewWidth / 2,
      y: (y - this.y) * this.zoom + this.viewHeight / 2,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.viewWidth / 2) / this.zoom + this.x,
      y: (sy - this.viewHeight / 2) / this.zoom + this.y,
    };
  }
}

export class Renderer {
  constructor(canvas, world, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.world = world;
    this.camera = camera;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.ghost = null;
    this.selectionBox = null;
    this.showGrid = false;
    this.frame = 0;
    this.buildTileAtlas();
    this.initFogCanvas();
    this.resize();
  }

  // --- Atlas de tuiles ------------------------------------------------------

  buildTileAtlas() {
    this.atlas = {};
    for (const terrain of Object.keys(TERRAIN_COLORS)) {
      const variants = [];
      for (let v = 0; v < 3; v++) {
        const c = document.createElement('canvas');
        c.width = TILE; c.height = TILE;
        const g = c.getContext('2d');
        const colors = TERRAIN_COLORS[terrain];
        g.fillStyle = colors[v % colors.length];
        g.fillRect(0, 0, TILE, TILE);
        // Grain : quelques touches plus claires/sombres, figées une fois pour toutes.
        const seedBase = Number(terrain) * 97 + v * 31;
        for (let i = 0; i < 9; i++) {
          const r = ((seedBase + i * 53) % 97) / 97;
          const r2 = ((seedBase + i * 29) % 89) / 89;
          const r3 = ((seedBase + i * 17) % 71) / 71;
          g.fillStyle = r3 > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
          const size = 2 + r3 * 4;
          g.fillRect(r * TILE, r2 * TILE, size, size);
        }
        if (Number(terrain) === TERRAIN.WATER) {
          g.strokeStyle = 'rgba(255,255,255,0.13)';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(2, 10 + v * 3); g.lineTo(TILE - 2, 8 + v * 4);
          g.moveTo(2, 22 + v * 2); g.lineTo(TILE - 2, 24 - v * 2);
          g.stroke();
        }
        variants.push(c);
      }
      this.atlas[terrain] = variants;
    }
  }

  initFogCanvas() {
    const map = this.world.map;
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = map.w;
    this.fogCanvas.height = map.h;
    this.fogCtx = this.fogCanvas.getContext('2d');
    this.fogImage = this.fogCtx.createImageData(map.w, map.h);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.width = w;
    this.height = h;
    this.camera.setViewport(w, h);
  }

  // --- Boucle de rendu ------------------------------------------------------

  render(interpolation = 0) {
    const ctx = this.ctx;
    this.frame++;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#1b2430';
    ctx.fillRect(0, 0, this.width, this.height);

    const cam = this.camera;
    ctx.save();
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const view = this.visibleTileRange();
    this.drawTerrain(view);
    this.drawResources(view);
    this.drawRubble();
    this.drawEntities();
    this.drawProjectiles();
    this.drawEffects();
    this.drawGhost();
    ctx.restore();

    this.drawFog();
    this.drawSelectionBox();
  }

  visibleTileRange() {
    const cam = this.camera;
    const halfW = this.width / (2 * cam.zoom);
    const halfH = this.height / (2 * cam.zoom);
    const map = this.world.map;
    return {
      x0: clamp(Math.floor((cam.x - halfW) / TILE) - 1, 0, map.w - 1),
      x1: clamp(Math.ceil((cam.x + halfW) / TILE) + 1, 0, map.w - 1),
      y0: clamp(Math.floor((cam.y - halfH) / TILE) - 1, 0, map.h - 1),
      y1: clamp(Math.ceil((cam.y + halfH) / TILE) + 1, 0, map.h - 1),
      left: cam.x - halfW, right: cam.x + halfW,
      top: cam.y - halfH, bottom: cam.y + halfH,
    };
  }

  drawTerrain(view) {
    const ctx = this.ctx;
    const map = this.world.map;
    for (let ty = view.y0; ty <= view.y1; ty++) {
      const row = ty * map.w;
      for (let tx = view.x0; tx <= view.x1; tx++) {
        const i = row + tx;
        if (!this.world.fog.explored[i]) continue;
        const variants = this.atlas[map.terrain[i]];
        const img = variants[map.variant[i] % variants.length];
        ctx.drawImage(img, tx * TILE, ty * TILE);
      }
    }
  }

  drawResources(view) {
    const map = this.world.map;
    for (const res of map.resources.values()) {
      if (res.tx < view.x0 || res.tx > view.x1 || res.ty < view.y0 || res.ty > view.y1) continue;
      if (!this.world.fog.explored[res.ty * map.w + res.tx]) continue;
      const x = res.tx * TILE, y = res.ty * TILE;
      if (res.type === 'wood') this.drawTree(x, y, res);
      else if (res.type === 'gold') this.drawGold(x, y, res);
      else this.drawBush(x, y, res);
    }
  }

  drawTree(x, y, res) {
    const ctx = this.ctx;
    const cx = x + TILE / 2, cy = y + TILE / 2;
    const v = res.variant;
    const scale = 0.72 + (v % 5) * 0.06;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx + 2, cy + 9, 10 * scale, 4.5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(cx - 2, cy - 1, 4, 11);
    const green = ['#2f6b34', '#35773a', '#2a5e2f', '#3c8040'][v % 4];
    ctx.fillStyle = green;
    ctx.beginPath();
    ctx.arc(cx, cy - 6, 10 * scale, 0, Math.PI * 2);
    ctx.arc(cx - 6 * scale, cy - 1, 7 * scale, 0, Math.PI * 2);
    ctx.arc(cx + 6 * scale, cy - 2, 7.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 9, 4 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  drawGold(x, y, res) {
    const ctx = this.ctx;
    const cx = x + TILE / 2, cy = y + TILE / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx + 1, cy + 8, 11, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8d8574';
    ctx.beginPath();
    ctx.moveTo(cx - 11, cy + 8);
    ctx.lineTo(cx - 6, cy - 7);
    ctx.lineTo(cx + 3, cy - 9);
    ctx.lineTo(cx + 11, cy + 2);
    ctx.lineTo(cx + 7, cy + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a49b88';
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 7);
    ctx.lineTo(cx + 3, cy - 9);
    ctx.lineTo(cx + 2, cy - 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f2c14e';
    const v = res.variant;
    for (let i = 0; i < 4; i++) {
      const ox = ((v + i * 37) % 13) - 6;
      const oy = ((v + i * 53) % 11) - 5;
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBush(x, y, res) {
    const ctx = this.ctx;
    const cx = x + TILE / 2, cy = y + TILE / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 7, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3f7a3a';
    ctx.beginPath();
    ctx.arc(cx - 4, cy + 1, 7, 0, Math.PI * 2);
    ctx.arc(cx + 4, cy + 1, 7, 0, Math.PI * 2);
    ctx.arc(cx, cy - 4, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d1434a';
    const v = res.variant;
    for (let i = 0; i < 5; i++) {
      const ox = ((v + i * 41) % 15) - 7;
      const oy = ((v + i * 23) % 13) - 7;
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawRubble() {
    const ctx = this.ctx;
    for (const fx of this.world.effects) {
      if (fx.kind !== 'rubble') continue;
      const alpha = clamp(fx.life / fx.max, 0, 1);
      ctx.globalAlpha = 0.35 + alpha * 0.4;
      ctx.fillStyle = '#4a423a';
      const s = fx.size * TILE * 0.5;
      for (let i = 0; i < 5; i++) {
        const ox = Math.cos(i * 2.1) * s * 0.55;
        const oy = Math.sin(i * 1.7) * s * 0.4;
        ctx.beginPath();
        ctx.ellipse(fx.x + ox, fx.y + oy, s * 0.28, s * 0.18, i, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Entités triées par ordonnée : illusion de profondeur. */
  drawEntities() {
    const view = this.visibleTileRange();
    const list = [];
    for (const e of this.world.entities) {
      if (e.dead) continue;
      const pad = e.kind === 'building' ? e.size * TILE : TILE * 2;
      if (e.x < view.left - pad || e.x > view.right + pad
          || e.y < view.top - pad || e.y > view.bottom + pad) continue;
      if (e.playerIndex !== this.world.humanIndex && !this.isEntityVisible(e)) continue;
      list.push(e);
    }
    list.sort((a, b) => a.y - b.y);
    for (const e of list) {
      if (e.kind === 'building') this.drawBuilding(e);
      else this.drawUnit(e);
    }
  }

  isEntityVisible(e) {
    const map = this.world.map;
    if (e.kind === 'building') {
      for (let y = e.ty; y < e.ty + e.size; y++) {
        for (let x = e.tx; x < e.tx + e.size; x++) {
          if (map.inBounds(x, y) && this.world.fog.visible[y * map.w + x]) return true;
        }
      }
      return false;
    }
    return this.world.isVisible(e.x, e.y);
  }

  drawBuilding(b) {
    const ctx = this.ctx;
    const skin = BUILDING_SKINS[b.type] || BUILDING_SKINS.house;
    const color = b.player.color;
    const w = b.size * TILE;
    const x = b.tx * TILE, y = b.ty * TILE;
    const height = b.size === 3 ? 26 : 18;

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(b.x + 3, y + w - 4, w * 0.48, w * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    const alpha = b.complete ? 1 : 0.55;
    ctx.globalAlpha = alpha;

    if (b.type === 'farm') {
      // Champ labouré : sillons + clôture.
      ctx.fillStyle = '#8a6a3c';
      ctx.fillRect(x + 1, y + 1, w - 2, w - 2);
      ctx.strokeStyle = '#a5854a';
      ctx.lineWidth = 2;
      const ratio = b.foodLeft / (b.def.farmFood || 1);
      ctx.beginPath();
      for (let i = 1; i < 5; i++) {
        ctx.moveTo(x + 3, y + (w / 5) * i);
        ctx.lineTo(x + w - 3, y + (w / 5) * i);
      }
      ctx.stroke();
      ctx.fillStyle = '#c9a441';
      ctx.fillRect(x + 2, y + w - 3 - (w - 6) * ratio, 3, (w - 6) * ratio);
      ctx.strokeStyle = color.dark;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 1, y + 1, w - 2, w - 2);
      ctx.globalAlpha = 1;
      if (b.selected) this.drawBuildingSelection(b, w, x, y);
      return;
    }

    // Corps
    ctx.fillStyle = skin.wall;
    this.roundRect(x + 3, y + height * 0.35, w - 6, w - height * 0.35 - 3, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x + 3, y + w - 8, w - 6, 5);

    // Toit
    ctx.fillStyle = skin.roof;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + height * 0.55);
    ctx.lineTo(b.x, y - 2);
    ctx.lineTo(x + w - 1, y + height * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(x + 1, y + height * 0.55);
    ctx.lineTo(b.x, y - 2);
    ctx.lineTo(b.x, y + height * 0.55);
    ctx.closePath();
    ctx.fill();

    // Bandeau aux couleurs du joueur
    ctx.fillStyle = color.main;
    ctx.fillRect(x + 3, y + height * 0.55, w - 6, 4);

    if (b.type === 'tower') {
      ctx.fillStyle = skin.wall;
      ctx.fillRect(b.x - 7, y - 12, 14, 20);
      ctx.fillStyle = color.main;
      ctx.fillRect(b.x - 7, y - 14, 14, 4);
    }

    // Pictogramme
    if (this.camera.zoom > 0.45) {
      ctx.globalAlpha = alpha * 0.92;
      ctx.font = `${Math.round(w * 0.36)}px system-ui, "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.def.icon, b.x, b.y + 4);
    }
    ctx.globalAlpha = 1;

    if (!b.complete) {
      // Échafaudage + barre de progression
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x + 2, y + 2, w - 4, w - 4);
      ctx.setLineDash([]);
      const pw = w - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x + 4, y + w + 2, pw, 4);
      ctx.fillStyle = '#7ad17a';
      ctx.fillRect(x + 4, y + w + 2, pw * b.progressRatio, 4);
    } else if (b.hp < b.maxHp) {
      this.drawHealthBar(b.x, y - 6, w * 0.8, b.hp / b.maxHp);
      if (b.hp / b.maxHp < 0.4) {
        ctx.fillStyle = 'rgba(30,30,30,0.35)';
        ctx.beginPath();
        ctx.arc(b.x + Math.sin(this.frame / 22) * 4, y - 12, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (b.selected) this.drawBuildingSelection(b, w, x, y);
  }

  drawBuildingSelection(b, w, x, y) {
    const ctx = this.ctx;
    ctx.strokeStyle = b.playerIndex === this.world.humanIndex ? '#ffffff' : '#ff8080';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, w);
    ctx.setLineDash([]);
    if (b.rally && b.playerIndex === this.world.humanIndex) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.rally.x, b.rally.y);
      ctx.stroke();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(b.rally.x, b.rally.y - 14);
      ctx.lineTo(b.rally.x + 10, b.rally.y - 10);
      ctx.lineTo(b.rally.x, b.rally.y - 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(b.rally.x, b.rally.y - 14);
      ctx.lineTo(b.rally.x, b.rally.y);
      ctx.stroke();
    }
  }

  drawUnit(u) {
    const ctx = this.ctx;
    const color = u.player.color;
    const r = u.radius;
    const bob = u.state === 'move' || u.state === 'attackMove' ? Math.sin(this.frame / 4 + u.id) * 0.8 : 0;
    const x = u.x, y = u.y + bob;

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x, u.y + r * 0.55, r * 0.75, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    if (u.selected) {
      ctx.strokeStyle = u.playerIndex === this.world.humanIndex ? '#ffffff' : '#ff8080';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, u.y + r * 0.5, r * 0.95, r * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (u.type === 'ram') {
      ctx.fillStyle = '#6b4a2a';
      ctx.save();
      ctx.translate(x, y - 2);
      ctx.rotate(u.facing);
      ctx.fillRect(-r, -r * 0.55, r * 2, r * 1.1);
      ctx.fillStyle = '#8c6239';
      ctx.fillRect(-r * 0.9, -r * 0.3, r * 1.9, r * 0.6);
      ctx.fillStyle = color.main;
      ctx.fillRect(-r * 0.2, -r * 0.75, r * 0.4, r * 1.5);
      ctx.restore();
      if (u.hp < u.maxHp) this.drawHealthBar(x, y - r - 6, r * 1.8, u.hp / u.maxHp);
      return;
    }

    const isCavalry = u.def.class === 'cavalry';
    if (isCavalry) {
      ctx.fillStyle = '#6a5240';
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(u.facing);
      ctx.beginPath();
      ctx.ellipse(0, 1, r * 1.05, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Corps — cerclé de noir pour ressortir sur l'herbe comme sur le sable.
    const bodyR = r * (isCavalry ? 0.68 : 0.86);
    const bodyY = y - (isCavalry ? r * 0.55 : 0);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(x, bodyY, bodyR + 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color.main;
    ctx.beginPath();
    ctx.arc(x, bodyY, bodyR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color.light;
    ctx.beginPath();
    ctx.arc(x - bodyR * 0.3, bodyY - bodyR * 0.35, bodyR * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // Tête
    const headY = y - r * (isCavalry ? 1.2 : 0.78);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(x, headY, r * 0.42 + 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2d3ad';
    ctx.beginPath();
    ctx.arc(x, headY, r * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // Marqueur de direction / arme
    const fx = Math.cos(u.facing), fy = Math.sin(u.facing);
    ctx.strokeStyle = u.isVillager ? '#c9a441' : '#e8e8e8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + fx * r * 0.5, y + fy * r * 0.5 - r * 0.2);
    ctx.lineTo(x + fx * r * 1.25, y + fy * r * 1.25 - r * 0.2);
    ctx.stroke();

    if (u.def.class === 'archer') {
      ctx.strokeStyle = '#d9c9a3';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x + fx * r * 0.9, y + fy * r * 0.9 - r * 0.2, r * 0.5, u.facing - 1.1, u.facing + 1.1);
      ctx.stroke();
    }

    // Ressource portée
    if (u.isVillager && u.carry.amount > 0.5) {
      const carryColors = { food: '#e06a5b', wood: '#a0703f', gold: '#f2c14e' };
      ctx.fillStyle = carryColors[u.carry.type] || '#fff';
      ctx.beginPath();
      ctx.arc(x + r * 0.7, y - r * 1.1, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Étincelles de travail
    if (u.gatherAnim > 0 && this.frame % 8 < 4) {
      ctx.fillStyle = 'rgba(255,255,220,0.8)';
      ctx.beginPath();
      ctx.arc(x + fx * r * 1.5, y + fy * r * 1.5 - r * 0.3, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (u.hp < u.maxHp) this.drawHealthBar(x, y - r * 1.9, r * 1.7, u.hp / u.maxHp);
  }

  drawHealthBar(cx, y, width, ratio) {
    const ctx = this.ctx;
    const h = 3.5;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(cx - width / 2, y, width, h);
    ctx.fillStyle = ratio > 0.55 ? '#63c363' : ratio > 0.28 ? '#e0b93c' : '#d9534f';
    ctx.fillRect(cx - width / 2, y, width * clamp(ratio, 0, 1), h);
  }

  drawProjectiles() {
    const ctx = this.ctx;
    ctx.strokeStyle = '#f5e6c8';
    ctx.lineWidth = 2;
    for (const p of this.world.projectiles) {
      if (!this.world.isVisible(p.x, p.y)) continue;
      const a = p.angle || 0;
      ctx.beginPath();
      ctx.moveTo(p.x - Math.cos(a) * 7, p.y - Math.sin(a) * 7);
      ctx.lineTo(p.x + Math.cos(a) * 5, p.y + Math.sin(a) * 5);
      ctx.stroke();
    }
  }

  drawEffects() {
    const ctx = this.ctx;
    for (const fx of this.world.effects) {
      const t = 1 - fx.life / fx.max;
      if (fx.kind === 'hit') {
        ctx.strokeStyle = `rgba(255,220,120,${1 - t})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 4 + t * 10, 0, Math.PI * 2);
        ctx.stroke();
      } else if (fx.kind === 'ping') {
        // Retour visuel d'un ordre donné au doigt.
        ctx.strokeStyle = fx.color || '#9bf6a0';
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 1 - t;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 6 + t * 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (fx.kind === 'death') {
        ctx.globalAlpha = (1 - t) * 0.7;
        ctx.fillStyle = fx.color || '#555';
        ctx.beginPath();
        ctx.ellipse(fx.x, fx.y + t * 4, 9 * (1 - t * 0.4), 5 * (1 - t * 0.4), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  drawGhost() {
    if (!this.ghost) return;
    const ctx = this.ctx;
    const def = BUILDING_TYPES[this.ghost.type];
    const w = def.size * TILE;
    const x = this.ghost.tx * TILE, y = this.ghost.ty * TILE;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = this.ghost.valid ? '#7ad17a' : '#e06a5b';
    ctx.fillRect(x, y, w, w);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.ghost.valid ? '#ffffff' : '#ff4d4d';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, w);
    ctx.font = `${Math.round(w * 0.4)}px system-ui, "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.icon, x + w / 2, y + w / 2);
  }

  // --- Brouillard -----------------------------------------------------------

  drawFog() {
    const world = this.world;
    const map = world.map;
    if (world.fog.dirty) {
      const data = this.fogImage.data;
      for (let i = 0; i < map.w * map.h; i++) {
        const o = i * 4;
        data[o] = 8; data[o + 1] = 10; data[o + 2] = 14;
        data[o + 3] = world.fog.visible[i] ? 0 : world.fog.explored[i] ? 120 : 255;
      }
      this.fogCtx.putImageData(this.fogImage, 0, 0);
      world.fog.dirty = false;
    }
    const ctx = this.ctx;
    const cam = this.camera;
    ctx.save();
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fogCanvas, 0, 0, map.pixelWidth, map.pixelHeight);
    ctx.restore();
  }

  drawSelectionBox() {
    if (!this.selectionBox) return;
    const ctx = this.ctx;
    const b = this.selectionBox;
    const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1);
    const w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0);
    ctx.fillStyle = 'rgba(120,200,255,0.16)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(190,230,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
  }

  // --- Minimap --------------------------------------------------------------

  initMinimap(canvas) {
    this.minimapCanvas = canvas;
    this.minimapCtx = canvas.getContext('2d');
    const map = this.world.map;
    this.minimapTerrain = document.createElement('canvas');
    this.minimapTerrain.width = map.w;
    this.minimapTerrain.height = map.h;
    this.minimapTerrainCtx = this.minimapTerrain.getContext('2d');
    this.minimapDirty = true;
  }

  renderMinimapTerrain() {
    const map = this.world.map;
    const ctx = this.minimapTerrainCtx;
    const img = ctx.createImageData(map.w, map.h);
    const data = img.data;
    const palette = {
      [TERRAIN.GRASS]: [93, 139, 65], [TERRAIN.GRASS_DARK]: [72, 116, 58],
      [TERRAIN.DIRT]: [138, 113, 70], [TERRAIN.SAND]: [201, 176, 122],
      [TERRAIN.WATER]: [47, 109, 158],
    };
    for (let i = 0; i < map.w * map.h; i++) {
      const c = palette[map.terrain[i]] || [90, 130, 70];
      const o = i * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
    }
    for (const res of map.resources.values()) {
      const o = (res.ty * map.w + res.tx) * 4;
      const c = res.type === 'wood' ? [42, 94, 47] : res.type === 'gold' ? [242, 193, 78] : [209, 67, 74];
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2];
    }
    ctx.putImageData(img, 0, 0);
    this.minimapDirty = false;
  }

  drawMinimap() {
    if (!this.minimapCtx) return;
    const map = this.world.map;
    const canvas = this.minimapCanvas;
    const ctx = this.minimapCtx;
    if (this.minimapDirty || map.dirty) { this.renderMinimapTerrain(); map.dirty = false; }
    const size = canvas.width;
    const scale = size / map.w;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.minimapTerrain, 0, 0, size, size);

    // Voile sur ce qui n'est pas exploré
    ctx.drawImage(this.fogCanvas, 0, 0, size, size);

    for (const e of this.world.entities) {
      if (e.dead) continue;
      if (e.playerIndex !== this.world.humanIndex && !this.isEntityVisible(e)) continue;
      ctx.fillStyle = e.player.color.main;
      const s = e.kind === 'building' ? Math.max(3, e.size * scale) : Math.max(2, scale * 1.2);
      ctx.fillRect(e.x / TILE * scale - s / 2, e.y / TILE * scale - s / 2, s, s);
    }

    // Cadre de la vue courante
    const cam = this.camera;
    const halfW = this.width / (2 * cam.zoom) / TILE * scale;
    const halfH = this.height / (2 * cam.zoom) / TILE * scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cam.x / TILE * scale - halfW, cam.y / TILE * scale - halfH, halfW * 2, halfH * 2);
  }

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
