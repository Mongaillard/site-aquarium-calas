// ---------------------------------------------------------------------------
// Carte : génération procédurale du terrain, des ressources et du blocage.
// ---------------------------------------------------------------------------

import { TILE, RESOURCE_TILE_AMOUNT } from './config.js';
import { RNG, clamp } from './utils.js';

export const TERRAIN = { GRASS: 0, GRASS_DARK: 1, DIRT: 2, SAND: 3, WATER: 4 };

// Masques du tableau `blocked` : on garde la raison du blocage pour pouvoir
// retirer un bâtiment sans « déboucher » une forêt ou un lac.
export const BLOCK = { TERRAIN: 1, RESOURCE: 2, BUILDING: 4 };

/** Bruit de valeur lissé, sommé sur plusieurs octaves. */
function valueNoise(rng, w, h, scale, octaves = 3) {
  const out = new Float32Array(w * h);
  let amp = 1, totalAmp = 0, freq = scale;
  for (let o = 0; o < octaves; o++) {
    const gw = Math.ceil(w / freq) + 2;
    const gh = Math.ceil(h / freq) + 2;
    const grid = new Float32Array(gw * gh);
    for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
    for (let y = 0; y < h; y++) {
      const gy = y / freq, y0 = Math.floor(gy);
      let ty = gy - y0;
      ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x++) {
        const gx = x / freq, x0 = Math.floor(gx);
        let tx = gx - x0;
        tx = tx * tx * (3 - 2 * tx);
        const a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1];
        const c = grid[(y0 + 1) * gw + x0], d = grid[(y0 + 1) * gw + x0 + 1];
        const top = a + (b - a) * tx;
        const bottom = c + (d - c) * tx;
        out[y * w + x] += (top + (bottom - top) * ty) * amp;
      }
    }
    totalAmp += amp;
    amp *= 0.5;
    freq *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= totalAmp;
  return out;
}

export class GameMap {
  constructor(size, seed = 1) {
    this.w = size;
    this.h = size;
    this.seed = seed;
    this.pixelWidth = size * TILE;
    this.pixelHeight = size * TILE;
    const n = size * size;
    this.terrain = new Uint8Array(n);
    this.variant = new Uint8Array(n);
    this.blocked = new Uint8Array(n);
    /** @type {Map<number, {type:string, amount:number, max:number, variant:number, tx:number, ty:number}>} */
    this.resources = new Map();
    this.startPositions = [];
    // Cases ressource disparues depuis la génération : c'est tout ce qu'il faut
    // pour rejouer l'état d'une carte, celle-ci étant régénérable à l'identique
    // depuis sa graine (voir save.js).
    this.removed = new Set();
    // Cases dont le terrain a changé en cours de partie (un gisement d'or
    // épuisé laisse de la terre) : le rendu refait les tronçons de sol qui les
    // couvrent, puis vide la liste.
    this.terrainModifie = new Set();
    this.dirty = true; // demande un nouveau rendu du calque terrain
    this.generate();
  }

  idx(tx, ty) { return ty * this.w + tx; }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  isBlocked(tx, ty) {
    if (!this.inBounds(tx, ty)) return true;
    return this.blocked[ty * this.w + tx] !== 0;
  }
  isWalkable(tx, ty) { return !this.isBlocked(tx, ty); }

  /**
   * Une unité peut-elle se tenir en (x, y) ? Elle occupe un carré de demi-côté
   * `r` dont les quatre coins doivent tomber sur des cases libres. Le suivi de
   * chemin et la marche passent tous deux par ici : ils voient le même monde.
   */
  canStand(x, y, r) {
    const l = Math.floor((x - r) / TILE), rt = Math.floor((x + r) / TILE);
    const t = Math.floor((y - r) / TILE), b = Math.floor((y + r) / TILE);
    return !(this.isBlocked(l, t) || this.isBlocked(rt, t) || this.isBlocked(l, b) || this.isBlocked(rt, b));
  }

  /**
   * Le segment (x0,y0)→(x1,y1) est-il franchissable par un corps de demi-côté
   * `r` ? Échantillonné tous les `r` pixels au plus : une case fait 32 px,
   * rien ne peut passer entre deux échantillons.
   */
  segmentClear(x0, y0, x1, y1, r) {
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(4, r)));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (!this.canStand(x0 + dx * t, y0 + dy * t, r)) return false;
    }
    return true;
  }

  block(tx, ty, mask) {
    if (this.inBounds(tx, ty)) this.blocked[ty * this.w + tx] |= mask;
  }
  unblock(tx, ty, mask) {
    if (this.inBounds(tx, ty)) this.blocked[ty * this.w + tx] &= ~mask;
  }

  /** Au moins une des 8 cases voisines est-elle libre ? (cible atteignable) */
  hasFreeNeighbour(tx, ty) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (this.inBounds(tx + dx, ty + dy) && !this.isBlocked(tx + dx, ty + dy)) return true;
      }
    }
    return false;
  }

  /** Nombre de cases voisines libres (0 à 8). */
  freeNeighbours(tx, ty) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (this.inBounds(tx + dx, ty + dy) && !this.isBlocked(tx + dx, ty + dy)) n++;
      }
    }
    return n;
  }

  /**
   * Case libre et « ouverte » : au moins trois voisines libres. Une poche de
   * une ou deux cases au cœur d'une forêt passe le test « voisin libre » mais
   * reste inaccessible — ce critère l'écarte.
   */
  isOpenTile(tx, ty) {
    if (!this.inBounds(tx, ty) || this.isBlocked(tx, ty)) return false;
    return this.freeNeighbours(tx, ty) >= 3;
  }

  /** Le gisement est-il bordé par une case ouverte, donc exploitable ? */
  hasOpenNeighbour(tx, ty) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (this.isOpenTile(tx + dx, ty + dy)) return true;
      }
    }
    return false;
  }

  resourceAt(tx, ty) {
    return this.resources.get(ty * this.w + tx);
  }

  /** Retire `amount` d'une case ressource ; renvoie la quantité réellement prise. */
  harvest(tx, ty, amount) {
    const i = ty * this.w + tx;
    const res = this.resources.get(i);
    if (!res) return 0;
    const taken = Math.min(res.amount, amount);
    res.amount -= taken;
    if (res.amount <= 0.001) this.clearResource(i);
    return taken;
  }

  /**
   * Fait disparaître une case ressource : gisement épuisé en jeu, ou remise en
   * état d'une carte rechargée depuis une sauvegarde.
   */
  clearResource(i) {
    const res = this.resources.get(i);
    if (!res) return;
    this.resources.delete(i);
    this.blocked[i] &= ~BLOCK.RESOURCE;
    if (res.type === 'gold' && this.terrain[i] !== TERRAIN.DIRT) {
      this.terrain[i] = TERRAIN.DIRT;
      this.terrainModifie.add(i);
    }
    this.removed.add(i);
    this.dirty = true;
  }

  /**
   * @param {object} [options] `amount` (sinon la quantité du type), `gibier`
   *   (le type d'animal dont c'est la carcasse : elle ne bloque pas le passage).
   * @returns la case créée, ou null.
   */
  addResource(tx, ty, type, rng, options = {}) {
    if (!this.inBounds(tx, ty)) return null;
    const i = this.idx(tx, ty);
    if (this.blocked[i] || this.resources.has(i)) return null;
    const max = options.amount ?? RESOURCE_TILE_AMOUNT[type];
    const res = { type, amount: max, max, tx, ty, variant: rng ? rng.int(0, 255) : 0 };
    if (options.gibier) { res.gibier = options.gibier; res.passable = true; }
    this.resources.set(i, res);
    if (!res.passable) this.blocked[i] |= BLOCK.RESOURCE;
    return res;
  }

  // --- Génération -----------------------------------------------------------

  generate() {
    const rng = new RNG(this.seed);
    const { w, h } = this;
    const elevation = valueNoise(rng, w, h, 18, 3);
    const moisture = valueNoise(rng, w, h, 12, 2);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const e = elevation[i];
        const m = moisture[i];
        let t;
        if (e < 0.30) t = TERRAIN.WATER;
        else if (e < 0.35) t = TERRAIN.SAND;
        else if (m > 0.62) t = TERRAIN.GRASS_DARK;
        else if (m < 0.34) t = TERRAIN.DIRT;
        else t = TERRAIN.GRASS;
        this.terrain[i] = t;
        this.variant[i] = rng.int(0, 255);
        if (t === TERRAIN.WATER) this.blocked[i] |= BLOCK.TERRAIN;
      }
    }

    // Positions de départ : deux coins opposés.
    const margin = Math.round(w * 0.16);
    this.startPositions = [
      { tx: margin, ty: h - margin },
      { tx: w - margin, ty: margin },
    ];
    for (const p of this.startPositions) this.clearArea(p.tx, p.ty, 8);

    this.scatterForests(rng, moisture);
    this.scatterGold(rng, elevation);
    this.scatterBushes(rng);

    // Ressources garanties près de chaque base : personne ne démarre à sec.
    for (const p of this.startPositions) {
      this.plantCluster(rng, p.tx - 7, p.ty - 7, 'wood', 34, 5);
      this.plantCluster(rng, p.tx + 6, p.ty + 5, 'wood', 26, 4);
      this.plantCluster(rng, p.tx + 7, p.ty - 6, 'gold', 7, 2);
      this.plantCluster(rng, p.tx - 6, p.ty + 6, 'gold', 6, 2);
      this.plantCluster(rng, p.tx - 2, p.ty - 8, 'food', 6, 2);
      this.plantCluster(rng, p.tx + 8, p.ty + 1, 'food', 6, 2);
      this.clearArea(p.tx, p.ty, 4);
    }

    this.ensureConnectivity();
    this.dirty = true;
  }

  clearArea(cx, cy, radius) {
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (!this.inBounds(x, y)) continue;
        const i = this.idx(x, y);
        if (this.terrain[i] === TERRAIN.WATER) this.terrain[i] = TERRAIN.GRASS;
        this.resources.delete(i);
        this.blocked[i] = 0;
      }
    }
  }

  plantCluster(rng, cx, cy, type, count, radius) {
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 12) {
      tries++;
      const angle = rng.next() * Math.PI * 2;
      const r = Math.sqrt(rng.next()) * radius;
      const x = Math.round(cx + Math.cos(angle) * r);
      const y = Math.round(cy + Math.sin(angle) * r);
      if (!this.inBounds(x, y)) continue;
      const i = this.idx(x, y);
      if (this.blocked[i] || this.terrain[i] === TERRAIN.WATER) continue;
      this.addResource(x, y, type, rng);
      placed++;
    }
  }

  scatterForests(rng, moisture) {
    const { w, h } = this;
    const count = Math.round((w * h) / 380);
    for (let c = 0; c < count; c++) {
      const cx = rng.int(2, w - 3);
      const cy = rng.int(2, h - 3);
      if (moisture[cy * w + cx] < 0.42) continue;
      if (this.nearStart(cx, cy, 9)) continue;
      this.plantCluster(rng, cx, cy, 'wood', rng.int(18, 46), rng.int(3, 6));
    }
  }

  scatterGold(rng, elevation) {
    const { w, h } = this;
    const count = Math.round((w * h) / 1400);
    for (let c = 0; c < count; c++) {
      const cx = rng.int(3, w - 4);
      const cy = rng.int(3, h - 4);
      if (elevation[cy * w + cx] < 0.40) continue;
      if (this.nearStart(cx, cy, 11)) continue;
      this.plantCluster(rng, cx, cy, 'gold', rng.int(4, 8), 2);
    }
  }

  scatterBushes(rng) {
    const { w, h } = this;
    const count = Math.round((w * h) / 1600);
    for (let c = 0; c < count; c++) {
      const cx = rng.int(2, w - 3);
      const cy = rng.int(2, h - 3);
      if (this.nearStart(cx, cy, 11)) continue;
      this.plantCluster(rng, cx, cy, 'food', rng.int(4, 7), 2);
    }
  }

  nearStart(tx, ty, radius) {
    return this.startPositions.some(
      (p) => Math.abs(p.tx - tx) < radius && Math.abs(p.ty - ty) < radius,
    );
  }

  /**
   * Vérifie qu'on peut aller d'une base à l'autre ; sinon creuse un couloir.
   * Sans ça, une carte peut être coupée en deux par un lac et la partie bloque.
   */
  ensureConnectivity() {
    const [a, b] = this.startPositions;
    if (!a || !b) return;
    if (this.floodReaches(a, b)) return;
    // Couloir rectiligne de 3 cases de large entre les deux bases.
    let x = a.tx, y = a.ty;
    const steps = Math.abs(b.tx - a.tx) + Math.abs(b.ty - a.ty);
    const sx = Math.sign(b.tx - a.tx), sy = Math.sign(b.ty - a.ty);
    for (let s = 0; s <= steps; s++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const px = x + ox, py = y + oy;
          if (!this.inBounds(px, py)) continue;
          const i = this.idx(px, py);
          if (this.terrain[i] === TERRAIN.WATER) this.terrain[i] = TERRAIN.SAND;
          this.resources.delete(i);
          this.blocked[i] = 0;
        }
      }
      if (x !== b.tx && (s % 2 === 0 || y === b.ty)) x += sx;
      else if (y !== b.ty) y += sy;
      else if (x !== b.tx) x += sx;
      else break;
    }
  }

  floodReaches(from, to) {
    const { w, h } = this;
    const seen = new Uint8Array(w * h);
    const queue = [from.ty * w + from.tx];
    seen[queue[0]] = 1;
    const targetIdx = to.ty * w + to.tx;
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      if (cur === targetIdx) return true;
      const cx = cur % w, cy = (cur / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (seen[ni] || this.blocked[ni]) continue;
          // Même règle que l'A* : pas de passage en diagonale entre deux
          // obstacles, sinon la carte est jugée connexe là où les unités
          // ne passent pas.
          if (dx !== 0 && dy !== 0
            && (this.blocked[cy * w + nx] || this.blocked[ny * w + cx])) continue;
          seen[ni] = 1;
          queue.push(ni);
        }
      }
    }
    return false;
  }

  /**
   * Case libre la plus proche de (tx, ty) qui DÉBOUCHE : depuis laquelle un
   * remplissage atteint au moins `seuil` cases. Une poche d'une ou deux cases
   * au cœur d'une forêt est libre, parfois bordée de plusieurs cases libres,
   * mais sans issue ; ce critère-là ne s'y trompe pas. À défaut, la case libre
   * la plus proche.
   */
  findOpenTile(tx, ty, maxRadius = 8, seuil = 40) {
    tx = clamp(tx, 0, this.w - 1);
    ty = clamp(ty, 0, this.h - 1);
    for (let r = 0; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = tx + dx, ny = ty + dy;
          if (this.inBounds(nx, ny) && !this.isBlocked(nx, ny) && this.floodSize(nx, ny, seuil) >= seuil) return { tx: nx, ty: ny };
        }
      }
    }
    return this.findFreeTile(tx, ty, maxRadius);
  }

  /** Nombre de cases atteignables depuis (tx, ty), compté jusqu'à `limite`. */
  floodSize(tx, ty, limite) {
    const { w, h } = this;
    const vus = new Set([ty * w + tx]);
    const file = [ty * w + tx];
    for (let tete = 0; tete < file.length && vus.size < limite; tete++) {
      const cur = file[tete], cx = cur % w, cy = (cur / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (vus.has(ni) || this.blocked[ni]) continue;
          if (dx && dy && (this.blocked[cy * w + nx] || this.blocked[ny * w + cx])) continue;
          vus.add(ni); file.push(ni);
          if (vus.size >= limite) return vus.size;
        }
      }
    }
    return vus.size;
  }

  /**
   * Les cases libres données sont-elles toutes reliées entre elles ? Celles
   * qui ne donnent que sur un cul-de-sac (moins de 40 cases) ne comptent pas.
   * Parcours depuis l'une d'elles, arrêté dès qu'il les a toutes vues, ou au
   * bout de `plafond` cases : un détour plus long vaut une coupure.
   */
  relies(cases, plafond = 4000) {
    const ouvertes = cases.filter(({ tx, ty }) => !this.isBlocked(tx, ty) && this.floodSize(tx, ty, 40) >= 40);
    if (ouvertes.length < 2) return true;
    const { w, h } = this;
    const cibles = new Set(ouvertes.map(({ tx, ty }) => ty * w + tx));
    const depart = ouvertes[0].ty * w + ouvertes[0].tx;
    const vus = new Set([depart]);
    const file = [depart];
    cibles.delete(depart);
    for (let tete = 0; tete < file.length && vus.size < plafond; tete++) {
      const cur = file[tete], cx = cur % w, cy = (cur / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (vus.has(ni) || this.blocked[ni]) continue;
          if (dx && dy && (this.blocked[cy * w + nx] || this.blocked[ny * w + cx])) continue;
          vus.add(ni); file.push(ni);
          if (cibles.delete(ni) && cibles.size === 0) return true;
        }
      }
    }
    return cibles.size === 0;
  }

  /** Case libre la plus proche de (tx, ty), en spirale. */
  findFreeTile(tx, ty, maxRadius = 12) {
    tx = clamp(tx, 0, this.w - 1);
    ty = clamp(ty, 0, this.h - 1);
    if (!this.isBlocked(tx, ty)) return { tx, ty };
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = tx + dx, ny = ty + dy;
          if (this.inBounds(nx, ny) && !this.isBlocked(nx, ny)) return { tx: nx, ty: ny };
        }
      }
    }
    return null;
  }
}
