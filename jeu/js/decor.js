// ---------------------------------------------------------------------------
// Le décor des rivages : rochers, galets, touffes d'herbe, roseaux, nénuphars
// et fleurs posés le long de l'eau, découpés dans les planches d'eau (voir
// assets/SOURCES.md). Présentation pure : rien ici n'entre dans la simulation
// — une unité traverse un rocher —, et tout se déduit de la carte par un
// hachage de la case et de la graine : même carte, même décor, sur tous les
// appareils et après une reprise.
//
// Deux allures, selon la taille du plan d'eau : une MARE (jusqu'à MARE_MAX
// cases) se ceint de rochers serrés, de roseaux, de nénuphars et de fleurs,
// comme la planche « eau-mare » ; un LAC prend la plage de « eau-rivage » :
// rochers épars, galets et touffes sur le sable.
// ---------------------------------------------------------------------------
import { TILE } from './config.js';
import { TERRAIN } from './map.js';
import { PIECES_RIVAGE } from './rivage-pieces.js';

export const ECHELLE_RIVAGE = 0.5;   // pixels monde par pixel d'atlas (atlas à 2×)
export const MARE_MAX = 40;          // cases d'eau : au-delà, c'est un lac
export const STYLE = { LAC: 0, MARE: 1 };

const PAR_CLASSE = {};
for (const p of PIECES_RIVAGE) (PAR_CLASSE[p.classe] ||= []).push(p);

/** Hachage d'une case et d'un rang → [0, 1), identique partout. */
export function hacher(x, y, graine, k) {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(graine | 0, 1274126177) ^ Math.imul(k + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function piece(classe, u) {
  const liste = PAR_CLASSE[classe];
  if (!liste || !liste.length) return null;
  return liste[Math.min(liste.length - 1, Math.floor(u * liste.length))];
}

/**
 * Taille du plan d'eau de chaque case d'eau (composantes à quatre voisins) :
 * c'est elle qui décide de l'allure du rivage.
 */
export function plansDEau(map) {
  const { w, h, terrain } = map;
  const corps = new Int32Array(w * h);
  const file = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (terrain[i] !== TERRAIN.WATER || corps[i]) continue;
    let tete = 0, fin = 0;
    file[fin++] = i; corps[i] = -1;
    while (tete < fin) {
      const c = file[tete++], cx = c % w, cy = (c / w) | 0;
      if (cx > 0 && terrain[c - 1] === TERRAIN.WATER && !corps[c - 1]) { corps[c - 1] = -1; file[fin++] = c - 1; }
      if (cx < w - 1 && terrain[c + 1] === TERRAIN.WATER && !corps[c + 1]) { corps[c + 1] = -1; file[fin++] = c + 1; }
      if (cy > 0 && terrain[c - w] === TERRAIN.WATER && !corps[c - w]) { corps[c - w] = -1; file[fin++] = c - w; }
      if (cy < h - 1 && terrain[c + w] === TERRAIN.WATER && !corps[c + w]) { corps[c + w] = -1; file[fin++] = c + w; }
    }
    for (let k = 0; k < fin; k++) corps[file[k]] = fin;
  }
  return corps;
}

/**
 * Plante le décor d'une carte. Rend, par ligne de cases, les pièces DEBOUT
 * (rochers, amas, touffes, roseaux : elles entrent dans l'ordre du peintre
 * avec les unités) et les pièces PLATES (galets, nénuphars, fleurs : peintes
 * sous tout le reste). Chaque pièce : { x, y } monde de son pied, `piece`
 * de l'atlas, `miroir`, `echelle`, et sa case { tx, ty }.
 */
export function planterRivage(map) {
  const { w, h, terrain } = map;
  const graine = map.seed | 0;
  const corps = plansDEau(map);
  const debout = Array.from({ length: h }, () => []);
  const plats = Array.from({ length: h }, () => []);
  let total = 0, mares = 0, lacs = 0;
  const eau = (x, y) => x >= 0 && y >= 0 && x < w && y < h && terrain[y * w + x] === TERRAIN.WATER;
  const poser = (liste, tx, ty, classe, u, x, y, miroir, echelle) => {
    const p = piece(classe, u);
    if (!p) return;
    liste[Math.max(0, Math.min(h - 1, Math.floor(y / TILE)))].push({ x, y, piece: p, miroir, echelle, tx, ty });
    total++;
  };

  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const i = ty * w + tx;
      // Direction de l'eau (ou de la terre) : somme des voisins, pondérée.
      let nx = 0, ny = 0, taille = 0;
      const cible = terrain[i] === TERRAIN.WATER ? (x, y) => !eau(x, y) && x >= 0 && y >= 0 && x < w && y < h : eau;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy || !cible(tx + dx, ty + dy)) continue;
          const p = dx && dy ? Math.SQRT1_2 : 1;
          nx += dx * p; ny += dy * p;
          if (terrain[i] !== TERRAIN.WATER) taille = Math.max(taille, corps[(ty + dy) * w + tx + dx]);
        }
      }
      const n = Math.hypot(nx, ny);
      if (n > 0) { nx /= n; ny /= n; }
      const r = (k) => hacher(tx, ty, graine, k);
      const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
      const tx_ = -ny, ty_ = nx;   // le long du rivage

      if (terrain[i] === TERRAIN.WATER) {
        // Case d'eau bordée de terre : un nénuphar, dans les mares seulement.
        if (n === 0 || corps[i] > MARE_MAX || r(12) > 0.35) continue;
        const a = r(13) * 6, b = r(14) * 16 - 8;   // vers le large, et le long du bord
        poser(plats, tx, ty, 'nenuphar', r(15), cx - nx * a + tx_ * b, cy - ny * a + ty_ * b + 6, r(16) < 0.5, 0.8 + r(17) * 0.35);
        continue;
      }
      if (n === 0 && !taille) continue;              // pas une case de rivage
      if (map.resources.has(i)) continue;            // un arbre, un buisson : déjà occupé
      const mare = taille <= MARE_MAX;
      if (mare) mares++; else lacs++;
      const pRoc = mare ? 0.66 : 0.58, pAmas = mare ? 0.16 : 0.06;
      const pHerbe = mare ? 0.55 : 0.45, pRoseau = mare ? 0.6 : 0;
      // Un rocher (ou un amas) au bord de l'eau, sur le sable.
      if (r(1) < pRoc) {
        const a = r(8) * 9, b = r(9) * 20 - 10;   // du centre de la case au sable, près de l'eau
        poser(debout, tx, ty, r(2) < pAmas ? 'amas' : 'roche', r(3), cx + nx * a + tx_ * b, cy + ny * a + ty_ * b, r(4) < 0.5, 0.85 + r(18) * 0.3);
      }
      // De l'herbe côté terre — ou des roseaux les pieds dans l'eau.
      if (r(5) < pHerbe) {
        const roseau = r(6) < pRoseau;
        const a = roseau ? 2 + r(10) * 8 : -(6 + r(10) * 10), b = r(11) * 20 - 10;
        poser(debout, tx, ty, roseau ? 'roseau' : 'touffe', r(19), cx + nx * a + tx_ * b, cy + ny * a + ty_ * b, r(20) < 0.5, 0.85 + r(21) * 0.3);
      }
      // Des galets épars, à plat.
      if (r(7) < 0.5) {
        const nb = 1 + Math.floor(r(22) * 3);
        for (let k = 0; k < nb; k++) {
          poser(plats, tx, ty, 'galet', r(30 + k), cx + r(40 + k) * 24 - 12 + nx * 2, cy + r(50 + k) * 24 - 12 + ny * 2, r(60 + k) < 0.5, 0.8 + r(70 + k) * 0.4);
        }
      }
      // Une fleur dans l'herbe, autour des mares.
      if (mare && r(23) < 0.25) {
        const a = -(8 + r(24) * 8), b = r(25) * 20 - 10;
        poser(plats, tx, ty, 'fleur', r(26), cx + nx * a + tx_ * b, cy + ny * a + ty_ * b, false, 1);
      }
    }
  }
  return { debout, plats, total, mares, lacs, corps };
}
