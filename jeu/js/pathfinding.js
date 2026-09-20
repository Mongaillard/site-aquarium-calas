// ---------------------------------------------------------------------------
// Recherche de chemin A* sur grille (8 directions), avec budget de nœuds,
// repli « case la plus proche » et lissage du chemin — optionnel : les unités
// ne le demandent plus, elles lissent elles-mêmes à chaque pas, depuis leur
// position réelle et avec leur gabarit (voir Unit.followPath).
// ---------------------------------------------------------------------------

import { MinHeap } from './utils.js';
import { TILE } from './config.js';

const STRAIGHT = 10;
const DIAGONAL = 14;

export class PathFinder {
  constructor(map) {
    this.map = map;
    const n = map.w * map.h;
    this.gScore = new Int32Array(n);
    this.fScore = new Int32Array(n);
    this.cameFrom = new Int32Array(n);
    this.stamp = new Int32Array(n);   // marque de visite (évite de tout réinitialiser)
    this.closed = new Uint8Array(n);
    this.generation = 0;
    this.heap = new MinHeap();
    this.searches = 0;                // statistique : chemins calculés
  }

  heuristic(ax, ay, bx, by) {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return STRAIGHT * (dx + dy) + (DIAGONAL - 2 * STRAIGHT) * Math.min(dx, dy);
  }

  /**
   * @param {number} sx,sy case de départ
   * @param {number} gx,gy case d'arrivée
   * @param {{adjacent?:boolean, budget?:number, smooth?:boolean, passable?:(i:number)=>boolean}} opts
   *   adjacent : s'arrêter dès qu'on touche la case cible (cible bloquée : arbre, bâtiment…)
   *   smooth : false pour obtenir la suite complète des cases, sans lissage
   * @returns {{tx:number,ty:number}[] | null}
   */
  find(sx, sy, gx, gy, opts = {}) {
    const map = this.map;
    const { w, h } = map;
    if (!map.inBounds(sx, sy) || !map.inBounds(gx, gy)) return null;
    const adjacent = !!opts.adjacent;
    const budget = opts.budget || 6000;
    const passable = opts.passable || ((i) => map.blocked[i] === 0);
    const smooth = opts.smooth !== false;

    const start = sy * w + sx;
    const goal = gy * w + gx;
    if (start === goal) return [];
    if (!adjacent && !passable(goal)) return null;

    this.generation++;
    const gen = this.generation;
    const { gScore, fScore, cameFrom, stamp, closed, heap } = this;
    heap.clear();

    stamp[start] = gen;
    gScore[start] = 0;
    fScore[start] = this.heuristic(sx, sy, gx, gy);
    cameFrom[start] = -1;
    closed[start] = 0;
    heap.push(start, fScore[start]);

    let best = start;
    let bestH = fScore[start];
    let expanded = 0;

    while (heap.size > 0 && expanded < budget) {
      const current = heap.pop();
      if (closed[current] === 1 && stamp[current] === gen) continue;
      closed[current] = 1;
      stamp[current] = gen;
      expanded++;

      const cx = current % w;
      const cy = (current / w) | 0;

      const dx = Math.abs(cx - gx), dy = Math.abs(cy - gy);
      const reached = adjacent ? (dx <= 1 && dy <= 1) : current === goal;
      if (reached) return this.buildPath(current, start, smooth);

      const hCur = this.heuristic(cx, cy, gx, gy);
      if (hCur < bestH) { bestH = hCur; best = current; }

      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nx = cx + ox, ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          // En mode « adjacent », la case cible est souvent bloquée (arbre,
          // bâtiment) : on ne cherche jamais à y entrer, on s'arrête à côté.
          if (!passable(ni)) continue;
          const diagonal = ox !== 0 && oy !== 0;
          if (diagonal) {
            // interdiction de couper un angle entre deux obstacles
            if (!passable(cy * w + nx) || !passable(ny * w + cx)) continue;
          }
          const tentative = gScore[current] + (diagonal ? DIAGONAL : STRAIGHT);
          const seen = stamp[ni] === gen;
          if (seen && closed[ni] === 1) continue;
          if (!seen || tentative < gScore[ni]) {
            stamp[ni] = gen;
            closed[ni] = 0;
            gScore[ni] = tentative;
            cameFrom[ni] = current;
            const f = tentative + this.heuristic(nx, ny, gx, gy);
            fScore[ni] = f;
            heap.push(ni, f);
          }
        }
      }
    }

    this.searches++;
    // Cible inatteignable : on s'approche au maximum plutôt que de ne rien faire.
    if (best !== start) return this.buildPath(best, start, smooth);
    return null;
  }

  buildPath(end, start, smooth = true) {
    this.searches++;
    const w = this.map.w;
    const path = [];
    let cur = end;
    let guard = 0;
    while (cur !== start && cur !== -1 && guard++ < 100000) {
      path.push({ tx: cur % w, ty: (cur / w) | 0 });
      cur = this.cameFrom[cur];
    }
    path.reverse();
    return smooth ? this.smooth(path, start % w, (start / w) | 0) : path;
  }

  /**
   * Supprime les points intermédiaires quand la ligne droite est dégagée.
   * Le premier point est toujours conservé : l'unité n'est pas forcément au
   * centre de sa case, et partir en diagonale depuis le bord d'une case fait
   * accrocher les angles.
   */
  smooth(path, sx, sy) {
    if (path.length < 3) return path;
    const out = [path[0]];
    let curX = path[0].tx, curY = path[0].ty;
    let i = 1;
    while (i < path.length) {
      let furthest = i;
      for (let j = path.length - 1; j > i; j--) {
        if (this.lineClear(curX, curY, path[j].tx, path[j].ty)) { furthest = j; break; }
      }
      out.push(path[furthest]);
      curX = path[furthest].tx;
      curY = path[furthest].ty;
      i = furthest + 1;
    }
    return out;
  }

  /** Tracé de Bresenham : toutes les cases traversées doivent être libres. */
  lineClear(x0, y0, x1, y1) {
    const map = this.map;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let x = x0, y = y0, err = dx - dy, guard = 0;
    while (guard++ < 512) {
      if (map.isBlocked(x, y)) return false;
      if (x === x1 && y === y1) return true;
      const e2 = 2 * err;
      // Pas diagonal : les deux cases de l'angle doivent être libres aussi.
      if (e2 > -dy && e2 < dx && (map.isBlocked(x + sx, y) || map.isBlocked(x, y + sy))) return false;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return false;
  }
}

/** Convertit une case en coordonnées monde (centre de case). */
export function tileToWorld(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

export function worldToTile(x, y) {
  return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) };
}
