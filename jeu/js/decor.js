// ---------------------------------------------------------------------------
// Le décor de la carte : rochers, galets, touffes d'herbe, roseaux, nénuphars,
// fleurs, buissons, fougères, agaves, découpés dans les planches de l'auteur (voir
// assets/SOURCES.md). Présentation pure : rien ici n'entre dans la simulation
// — une unité traverse un rocher —, et tout se déduit de la carte par un
// hachage de la case et de la graine : même carte, même décor, sur tous les
// appareils et après une reprise.
//
// Deux passes. Le RIVAGE, le long de l'eau : une MARE (jusqu'à MARE_MAX cases)
// se ceint de rochers serrés, de roseaux, de nénuphars et de fleurs, comme la
// planche « eau-mare » ; un LAC prend la plage de « eau-rivage » : rochers
// épars, galets et touffes sur le sable. La CAMPAGNE, partout ailleurs, selon
// le sol : de l'herbe, des fleurs, des buissons et du couvre-sol sur les prés,
// des cailloux, des agaves, des pampas et des touffes sèches sur la terre et le
// sable, des fougères et un peu plus de tout au pied des forêts.
// ---------------------------------------------------------------------------
import { TILE } from './config.js';
import { TERRAIN } from './map.js';
import { PIECES_DECOR } from './decor-pieces.js';

export const ECHELLE_DECOR = 0.5;    // pixels monde par pixel d'atlas (atlas à 2×)
export const MARE_MAX = 40;          // cases d'eau : au-delà, c'est un lac
export const STYLE = { LAC: 0, MARE: 1 };
/**
 * Les classes CUITES dans le sol : peintes une fois dans les tronçons de sol
 * mis en cache, sous tout le reste — galets, nénuphars, fleurs, touffes
 * d'herbe et couvre-sol, assez bas pour ne pas réclamer l'ordre du peintre.
 * Les autres (rochers, amas, roseaux, buissons, fougères, agaves) sont
 * DEBOUT : classées avec les unités à chaque image.
 */
export const CUITES = new Set(['galet', 'nenuphar', 'fleurBleu', 'fleurJaune', 'fleurRose', 'fleurBlanc', 'herbe', 'touffe', 'couvre']);
const FLEURS = ['fleurBleu', 'fleurJaune', 'fleurRose', 'fleurBlanc'];

const PAR_CLASSE = {};
for (const p of PIECES_DECOR) (PAR_CLASSE[p.classe] ||= []).push(p);

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

/** Un décor vide : une liste de pièces DEBOUT et une de pièces CUITES par ligne de cases. */
function decorVide(h) {
  return { debout: Array.from({ length: h }, () => []), cuits: Array.from({ length: h }, () => []), total: 0, mares: 0, lacs: 0 };
}

/** Pose une pièce par son pied ; la ligne est celle du pied, pas de la case. */
function poser(decor, h, tx, ty, classe, u, x, y, miroir, echelle) {
  const p = piece(classe, u);
  if (!p) return;
  const liste = CUITES.has(classe) ? decor.cuits : decor.debout;
  liste[Math.max(0, Math.min(h - 1, Math.floor(y / TILE)))].push({ x, y, piece: p, miroir, echelle, tx, ty });
  decor.total++;
}

/**
 * Le rivage. Chaque pièce : { x, y } monde de son pied, `piece` de l'atlas,
 * `miroir`, `echelle`, et sa case { tx, ty }. `corps` (plansDEau) peut être
 * fourni pour ne pas le recalculer.
 */
export function planterRivage(map, corps = plansDEau(map)) {
  const { w, h, terrain } = map;
  const graine = map.seed | 0;
  const decor = decorVide(h);
  decor.corps = corps;
  const eau = (x, y) => x >= 0 && y >= 0 && x < w && y < h && terrain[y * w + x] === TERRAIN.WATER;

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
        poser(decor, h, tx, ty, 'nenuphar', r(15), cx - nx * a + tx_ * b, cy - ny * a + ty_ * b + 6, r(16) < 0.5, 0.8 + r(17) * 0.35);
        continue;
      }
      if (n === 0 && !taille) continue;              // pas une case de rivage
      if (map.resources.has(i)) continue;            // un arbre, un buisson : déjà occupé
      const mare = taille <= MARE_MAX;
      if (mare) decor.mares++; else decor.lacs++;
      const pRoc = mare ? 0.66 : 0.58, pAmas = mare ? 0.16 : 0.06;
      const pHerbe = mare ? 0.55 : 0.45, pRoseau = mare ? 0.6 : 0;
      const pre = terrain[i] === TERRAIN.GRASS || terrain[i] === TERRAIN.GRASS_DARK;
      // Autour d'une mare, des fougères côté terre ; sur une plage, une pampa.
      if (mare && pre && r(28) < 0.14) poser(decor, h, tx, ty, 'fougere', r(29), cx - nx * (8 + r(80) * 8) + tx_ * (r(81) * 20 - 10), cy - ny * (8 + r(80) * 8) + ty_ * (r(81) * 20 - 10), r(82) < 0.5, 0.85 + r(83) * 0.3);
      else if (!mare && !pre && r(28) < 0.08) poser(decor, h, tx, ty, 'pampa', r(29), cx - nx * (6 + r(80) * 8) + tx_ * (r(81) * 20 - 10), cy - ny * (6 + r(80) * 8) + ty_ * (r(81) * 20 - 10), r(82) < 0.5, 0.85 + r(83) * 0.3);
      // Un rocher (ou un amas) au bord de l'eau, sur le sable.
      if (r(1) < pRoc) {
        const a = r(8) * 9, b = r(9) * 20 - 10;   // du centre de la case au sable, près de l'eau
        poser(decor, h, tx, ty, r(2) < pAmas ? 'amas' : 'roche', r(3), cx + nx * a + tx_ * b, cy + ny * a + ty_ * b, r(4) < 0.5, 0.85 + r(18) * 0.3);
      }
      // De l'herbe côté terre — verte sur les prés, sèche sur la plage — ou
      // des roseaux les pieds dans l'eau.
      if (r(5) < pHerbe) {
        const roseau = r(6) < pRoseau;
        const a = roseau ? 2 + r(10) * 8 : -(6 + r(10) * 10), b = r(11) * 20 - 10;
        poser(decor, h, tx, ty, roseau ? 'roseau' : pre ? 'herbe' : 'touffe', r(19), cx + nx * a + tx_ * b, cy + ny * a + ty_ * b, r(20) < 0.5, 0.85 + r(21) * 0.3);
      }
      // Des galets épars, à plat.
      if (r(7) < 0.5) {
        const nb = 1 + Math.floor(r(22) * 3);
        for (let k = 0; k < nb; k++) {
          poser(decor, h, tx, ty, 'galet', r(30 + k), cx + r(40 + k) * 24 - 12 + nx * 2, cy + r(50 + k) * 24 - 12 + ny * 2, r(60 + k) < 0.5, 0.8 + r(70 + k) * 0.4);
        }
      }
      // Une fleur dans l'herbe, autour des mares.
      if (mare && r(23) < 0.25) {
        const a = -(8 + r(24) * 8), b = r(25) * 20 - 10;
        poser(decor, h, tx, ty, FLEURS[Math.floor(r(27) * FLEURS.length) % FLEURS.length], r(26), cx + nx * a + tx_ * b, cy + ny * a + ty_ * b, false, 1);
      }
    }
  }
  return decor;
}

/**
 * La campagne : les cases de terre qui ne sont ni au bord de l'eau ni
 * occupées par une ressource. Probabilités par case selon le sol ; au pied
 * d'une forêt (une case voisine porte un arbre) tout est un peu plus dense.
 */
export function planterCampagne(map) {
  const { w, h, terrain } = map;
  const graine = map.seed | 0;
  const decor = decorVide(h);
  const eau = (x, y) => x >= 0 && y >= 0 && x < w && y < h && terrain[y * w + x] === TERRAIN.WATER;
  const arbre = (x, y) => { const r = map.resources.get(y * w + x); return !!r && r.type === 'wood'; };

  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const i = ty * w + tx;
      const t = terrain[i];
      if (t === TERRAIN.WATER || map.resources.has(i)) continue;
      let rivage = false, foret = false;
      for (let dy = -1; dy <= 1 && !(rivage && foret); dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (eau(tx + dx, ty + dy)) rivage = true;
          if (arbre(tx + dx, ty + dy)) foret = true;
        }
      }
      if (rivage) continue;                          // le rivage a son propre décor
      const r = (k) => hacher(tx, ty, graine ^ 0x5bd1e995, k);
      const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
      const pre = t === TERRAIN.GRASS || t === TERRAIN.GRASS_DARK;
      const sombre = t === TERRAIN.GRASS_DARK;
      // Probabilités par sol : herbe, fleurs, buisson, rocher, galets, amas,
      // couvre-sol, fougère, agave, pampa.
      let pHerbe, pFleurs, pBuisson, pRoc, pGalets, pAmas, pCouvre = 0, pFougere = 0, pAgave = 0, pPampa = 0;
      if (pre) { pHerbe = sombre ? 0.07 : 0.05; pFleurs = sombre ? 0.025 : 0.035; pBuisson = sombre ? 0.03 : 0.02; pRoc = 0.008; pGalets = 0.015; pAmas = 0.002; pCouvre = 0.012; }
      else if (t === TERRAIN.DIRT) { pHerbe = 0.06; pFleurs = 0; pBuisson = 0; pRoc = 0.06; pGalets = 0.12; pAmas = 0.006; pAgave = 0.02; pPampa = 0.015; }
      else { pHerbe = 0.04; pFleurs = 0; pBuisson = 0; pRoc = 0.03; pGalets = 0.10; pAmas = 0.003; pAgave = 0.03; pPampa = 0.025; }
      // Au pied d'une forêt : fougères, couvre-sol, plus d'herbe, des buissons
      // (même sur la terre), quelques rochers ; les fleurs restent aux prés.
      if (foret) { pHerbe += 0.10; pBuisson += pre ? 0.05 : 0.03; pRoc += 0.02; pFougere += 0.10; pCouvre += 0.06; if (pre) pFleurs += 0.02; }
      const dans = (k) => r(k) * 22 - 11;          // une position dans la case, à l'écart des bords

      if (r(1) < pHerbe) poser(decor, h, tx, ty, pre ? 'herbe' : 'touffe', r(2), cx + dans(3), cy + dans(4) + 4, r(5) < 0.5, 0.8 + r(6) * 0.35);
      // Une seule pièce « de volume » par case : buisson, fougère, agave ou pampa.
      const u = r(7);
      if (u < pBuisson) poser(decor, h, tx, ty, 'buisson', r(8), cx + dans(9) * 0.5, cy + dans(10) * 0.5 + 6, r(11) < 0.5, 0.85 + r(12) * 0.3);
      else if (u < pBuisson + pFougere) poser(decor, h, tx, ty, 'fougere', r(8), cx + dans(9) * 0.5, cy + dans(10) * 0.5 + 6, r(11) < 0.5, 0.85 + r(12) * 0.3);
      else if (u < pBuisson + pFougere + pAgave) poser(decor, h, tx, ty, 'agave', r(8), cx + dans(9) * 0.5, cy + dans(10) * 0.5 + 6, r(11) < 0.5, 0.8 + r(12) * 0.35);
      else if (u < pBuisson + pFougere + pAgave + pPampa) poser(decor, h, tx, ty, 'pampa', r(8), cx + dans(9) * 0.5, cy + dans(10) * 0.5 + 6, r(11) < 0.5, 0.85 + r(12) * 0.3);
      if (r(27) < pCouvre) poser(decor, h, tx, ty, 'couvre', r(28), cx + dans(29) * 0.6, cy + dans(30) * 0.6 + 6, r(31) < 0.5, 0.85 + r(32) * 0.3);
      if (r(13) < pRoc + pAmas) poser(decor, h, tx, ty, r(13) < pAmas ? 'amas' : 'roche', r(14), cx + dans(15), cy + dans(16) + 4, r(17) < 0.5, 0.8 + r(18) * 0.35);
      if (r(19) < pGalets) {
        const nb = 1 + Math.floor(r(20) * 3);
        for (let k = 0; k < nb; k++) poser(decor, h, tx, ty, 'galet', r(30 + k), cx + dans(40 + k), cy + dans(50 + k), r(60 + k) < 0.5, 0.8 + r(70 + k) * 0.4);
      }
      if (r(21) < pFleurs) {
        // Un bouquet : deux à quatre fleurs d'une même couleur, serrées.
        const couleur = FLEURS[Math.floor(r(22) * FLEURS.length) % FLEURS.length];
        const nb = 2 + Math.floor(r(23) * 3), ox = dans(24) * 0.6, oy = dans(25) * 0.6;
        for (let k = 0; k < nb; k++) {
          const ang = r(80 + k) * Math.PI * 2, ray = 3 + r(90 + k) * 8;
          poser(decor, h, tx, ty, couleur, r(100 + k), cx + ox + Math.cos(ang) * ray, cy + oy + Math.sin(ang) * ray * 0.7, r(110 + k) < 0.5, 0.85 + r(120 + k) * 0.3);
        }
      }
    }
  }
  return decor;
}

/** Tout le décor d'une carte : le rivage, puis la campagne, par ligne. */
export function planterDecor(map) {
  const corps = plansDEau(map);
  const rivage = planterRivage(map, corps);
  const campagne = planterCampagne(map);
  const decor = decorVide(map.h);
  for (let ty = 0; ty < map.h; ty++) {
    decor.debout[ty] = rivage.debout[ty].concat(campagne.debout[ty]);
    decor.cuits[ty] = rivage.cuits[ty].concat(campagne.cuits[ty]);
  }
  decor.total = rivage.total + campagne.total;
  decor.rivage = rivage.total; decor.campagne = campagne.total;
  decor.mares = rivage.mares; decor.lacs = rivage.lacs; decor.corps = corps;
  return decor;
}
