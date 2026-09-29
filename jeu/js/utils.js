// ---------------------------------------------------------------------------
// Boîte à outils : maths, aléatoire déterministe, tas binaire, grille spatiale.
// ---------------------------------------------------------------------------

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** Générateur pseudo-aléatoire déterministe (mulberry32) : même graine, même carte. */
export class RNG {
  constructor(seed = 1) { this.s = seed >>> 0 || 1; }
  next() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min, max) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
}

/** Tas binaire minimal, utilisé par l'A*. */
export class MinHeap {
  constructor() { this.items = []; this.scores = []; }
  get size() { return this.items.length; }
  clear() { this.items.length = 0; this.scores.length = 0; }
  push(item, score) {
    const items = this.items, scores = this.scores;
    let i = items.length;
    items.push(item); scores.push(score);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (scores[parent] <= scores[i]) break;
      this._swap(parent, i);
      i = parent;
    }
  }
  pop() {
    const items = this.items, scores = this.scores;
    const top = items[0];
    const lastItem = items.pop(), lastScore = scores.pop();
    if (items.length > 0) {
      items[0] = lastItem; scores[0] = lastScore;
      let i = 0;
      const n = items.length;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let smallest = i;
        if (l < n && scores[l] < scores[smallest]) smallest = l;
        if (r < n && scores[r] < scores[smallest]) smallest = r;
        if (smallest === i) break;
        this._swap(smallest, i);
        i = smallest;
      }
    }
    return top;
  }
  _swap(a, b) {
    const it = this.items, sc = this.scores;
    const ti = it[a]; it[a] = it[b]; it[b] = ti;
    const ts = sc[a]; sc[a] = sc[b]; sc[b] = ts;
  }
}

/**
 * Grille spatiale : accélère « qui se trouve autour de ce point ? ».
 * Reconstruite à chaque tick de simulation (c'est bien assez rapide
 * pour quelques centaines d'entités et ça évite tout désynchronisation).
 */
export class SpatialGrid {
  constructor(width, height, cellSize = 64) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
  }
  clear() {
    for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0;
  }
  insert(entity) {
    const cx = clamp(Math.floor(entity.x / this.cellSize), 0, this.cols - 1);
    const cy = clamp(Math.floor(entity.y / this.cellSize), 0, this.rows - 1);
    this.cells[cy * this.cols + cx].push(entity);
  }
  /** Appelle fn(entity) pour toute entité dans le carré de rayon `radius` autour de (x, y). */
  forEachNear(x, y, radius, fn) {
    const minX = clamp(Math.floor((x - radius) / this.cellSize), 0, this.cols - 1);
    const maxX = clamp(Math.floor((x + radius) / this.cellSize), 0, this.cols - 1);
    const minY = clamp(Math.floor((y - radius) / this.cellSize), 0, this.rows - 1);
    const maxY = clamp(Math.floor((y + radius) / this.cellSize), 0, this.rows - 1);
    for (let cy = minY; cy <= maxY; cy++) {
      const row = cy * this.cols;
      for (let cx = minX; cx <= maxX; cx++) {
        const cell = this.cells[row + cx];
        for (let i = 0; i < cell.length; i++) fn(cell[i]);
      }
    }
  }
}

/**
 * Bruit de valeur périodique : n × n valeurs dans [-1, 1], somme d'octaves
 * interpolées en douceur sur un réseau qui se referme sur lui-même — le bord
 * droit continue le bord gauche. Déterministe (graine fixe), donc identique
 * d'une partie à l'autre ; purement cosmétique, la simulation l'ignore.
 * @param {number} n côté, en valeurs
 * @param {{cellules:number, poids:number}[]} octaves cellules du réseau (divise n) et poids
 * @param {number} graine
 */
export function bruitPeriodique(n, octaves, graine = 1) {
  const out = new Float32Array(n * n);
  const hash = (i, j, k) => {
    let h = (i * 374761393 + j * 668265263 + k * 1274126177 + graine * 97) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  octaves.forEach(({ cellules, poids }, o) => {
    const pas = n / cellules;
    for (let y = 0; y < n; y++) {
      const gy = Math.floor(y / pas), fy = (y - gy * pas) / pas, sy = fy * fy * (3 - 2 * fy);
      const gy1 = (gy + 1) % cellules;
      for (let x = 0; x < n; x++) {
        const gx = Math.floor(x / pas), fx = (x - gx * pas) / pas, sx = fx * fx * (3 - 2 * fx);
        const gx1 = (gx + 1) % cellules;
        const v00 = hash(gx, gy, o), v10 = hash(gx1, gy, o), v01 = hash(gx, gy1, o), v11 = hash(gx1, gy1, o);
        const v = (v00 + (v10 - v00) * sx) * (1 - sy) + (v01 + (v11 - v01) * sx) * sy;
        out[y * n + x] += (v * 2 - 1) * poids;
      }
    }
  });
  return out;
}

/** Formate 123.7 en "123" et 1234 en "1,2k" pour les petits écrans. */
export function formatNumber(n) {
  n = Math.floor(n);
  if (n >= 10000) return (n / 1000).toFixed(0) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + 'k';
  return String(n);
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
}

/** Addition/soustraction de coûts ({food, wood, gold}). */
export function canAfford(stock, cost) {
  if (!cost) return true;
  for (const key in cost) if ((stock[key] || 0) < cost[key]) return false;
  return true;
}

export function payCost(stock, cost) {
  if (!cost) return;
  for (const key in cost) stock[key] -= cost[key];
}

export function refundCost(stock, cost, ratio = 1) {
  if (!cost) return;
  for (const key in cost) stock[key] += Math.floor(cost[key] * ratio);
}

/**
 * Coût d'un bâtiment ou d'une unité, sous forme de balises. Les pictogrammes
 * sont posés par l'interface (voir `icones.js`) : ce module reste sans
 * dépendance, il sert aussi à la simulation.
 */
export function costLabel(cost) {
  if (!cost) return '';
  return Object.keys(cost).map((k) => `<i data-cout="${k}"></i>${cost[k]}`).join(' ');
}
