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
//
// Le SOL APPARENT, enfin : chaque peuple a le sien sous ses bâtiments. La carte
// (map.terrain) n'y change rien — c'est le rendu qui peint du sable doré autour
// du départ d'un peuple du désert et sous chacun de ses bâtiments ; le décor et
// les arbres suivent ce sol-là (solDeBase, solApparent, caseArbre), et ce que
// les bâtiments recouvrent n'est pas dessiné (filtrerDecor).
// ---------------------------------------------------------------------------
import { TILE } from './config.js';
import { TERRAIN } from './map.js';
import { PIECES_DECOR } from './decor-pieces.js';

export const ECHELLE_DECOR = 0.5;    // pixels monde par pixel d'atlas (atlas à 2×)
export const MARE_MAX = 40;          // cases d'eau : au-delà, c'est un lac
export const STYLE = { LAC: 0, MARE: 1 };
/**
 * Le sable doré du désert : un sol de plus que ceux de la carte (TERRAIN), qui
 * n'existe qu'à l'affichage. Autour du départ d'un peuple du désert, RAYON_DESERT
 * cases de sable, puis une bande de terre avant l'herbe, large de zéro à
 * TERRE_MAX cases selon l'endroit (une couronne de largeur égale se lisait de
 * loin comme un anneau au compas) ; les arbres, eux, restent ceux du désert
 * sur COURONNE_TERRE cases. À RAYON_PLACE cases du départ, le décor debout
 * laisse la place nette.
 * Un sol apparent ne recopie pas la carte : il vaut SOL_CARTE partout où il
 * n'a rien à dire, et la carte se lit alors telle qu'elle est à l'instant.
 */
export const SOL_SABLE_OR = 5;
export const SOL_CARTE = 255;
export const ZONE = { PRE: 0, COURONNE: 1, DESERT: 2 };
export const RAYON_DESERT = 15;
export const COURONNE_TERRE = 4;
export const TERRE_MAX = 6;
export const RAYON_PLACE = 5.5;
export const TROU_MAX = 2;           // largeur, en cases, d'une bande d'herbe comblée entre deux cours de sable
export const ILOT_MAX = 12;          // cases d'un îlot d'herbe enfermé entre des cours, comblé lui aussi
/**
 * Secondes pendant lesquelles la cour d'un bâtiment adverse reste après sa
 * sortie de la vue : une troupe en limite de portée le fait entrer et sortir
 * sans cesse, et le sol clignoterait (sept tronçons à refaire à chaque fois).
 */
export const DELAI_COUR = 1.5;
const PEUPLES_DU_DESERT = new Set(['solarien']);
/** Ce que l'image d'un bâtiment dépasse de son emprise vers le sud (la ligne de sol est à 93 % de sa hauteur). */
const DEBORD_SUD = 12;
/**
 * Les classes CUITES dans le sol : peintes une fois dans les tronçons de sol
 * mis en cache, sous tout le reste — galets, nénuphars, fleurs, touffes
 * d'herbe et couvre-sol, assez bas pour ne pas réclamer l'ordre du peintre.
 * Les autres (rochers, amas, roseaux, buissons, fougères, agaves, pampas)
 * sont DEBOUT : classées avec les unités à chaque image.
 */
export const CUITES = new Set(['galet', 'nenuphar', 'fleurBleu', 'fleurJaune', 'fleurRose', 'fleurBlanc', 'herbe', 'touffe', 'couvre']);
const FLEURS = ['fleurBleu', 'fleurJaune', 'fleurRose', 'fleurBlanc'];

const PAR_CLASSE = {};
for (const p of PIECES_DECOR) (PAR_CLASSE[p.classe] ||= []).push(p);
/**
 * Les fleurs de l'atlas (« eau-mare-59 » et ses reteintes) sont des amas de
 * quelques pixels purs, magenta, cyan, jaune : à côté d'un monde dessiné, on
 * les prend pour des défauts d'affichage. On sème à leur place les massifs
 * fleuris de la planche des ornements, de la même main que les buissons et
 * les arbres, en petit (voir ECHELLE_FLEUR) et cuits dans le sol.
 */
const MASSIFS = {
  fleurBleu: ['ornement-03', 'ornement-10', 'ornement-18'],
  fleurJaune: ['ornement-06', 'ornement-19'],
  fleurRose: ['ornement-09', 'buissons-3'],
  fleurBlanc: ['ornement-02', 'ornement-08', 'ornement-17'],
};
for (const [classe, noms] of Object.entries(MASSIFS)) {
  const massifs = noms.map((nom) => PIECES_DECOR.find((p) => p.nom === nom)).filter(Boolean);
  if (massifs.length) PAR_CLASSE[classe] = massifs.map((p) => ({ ...p, classe }));
}
const ECHELLE_FLEUR = 0.64;          // un massif de 36 px monde devient une touffe de fleurs de 23
/** Les classes des prés : rien de tout cela ne pousse sur le sable d'une cour. */
const VERTES = new Set([...FLEURS, 'herbe', 'couvre', 'buisson', 'fougere']);

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
  liste[Math.max(0, Math.min(h - 1, Math.floor(y / TILE)))].push({ x, y, piece: p, miroir, echelle, tx, ty, verte: VERTES.has(classe), cache: false });
  decor.total++;
}

/**
 * Le rivage. Chaque pièce : { x, y } monde de son pied, `piece` de l'atlas,
 * `miroir`, `echelle`, et sa case { tx, ty }. `corps` (plansDEau) peut être
 * fourni pour ne pas le recalculer ; `sol` est le sol sur lequel on plante —
 * celui de la carte, ou le sol de base d'une partie (solDeBase).
 */
export function planterRivage(map, corps = plansDEau(map), sol = map.terrain) {
  const { w, h } = map, terrain = sol;
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
      const desert = terrain[i] === SOL_SABLE_OR;
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
      // Des fleurs dans l'herbe, autour des mares (pas dans le désert).
      if (mare && !desert && r(23) < 0.25) {
        const a = -(8 + r(24) * 8), b = r(25) * 20 - 10;
        poser(decor, h, tx, ty, FLEURS[Math.floor(r(27) * FLEURS.length) % FLEURS.length], r(26), cx + nx * a + tx_ * b, cy + ny * a + ty_ * b, false, ECHELLE_FLEUR);
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
export function planterCampagne(map, sol = map.terrain) {
  const { w, h } = map, terrain = sol;
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
      const desert = t === SOL_SABLE_OR;
      // Probabilités par sol : herbe, fleurs, buisson, rocher, galets, amas,
      // couvre-sol, fougère, agave, pampa.
      let pHerbe, pFleurs, pBuisson, pRoc, pGalets, pAmas, pCouvre = 0, pFougere = 0, pAgave = 0, pPampa = 0;
      if (pre) { pHerbe = sombre ? 0.07 : 0.05; pFleurs = sombre ? 0.025 : 0.035; pBuisson = sombre ? 0.03 : 0.02; pRoc = 0.008; pGalets = 0.015; pAmas = 0.002; pCouvre = 0.012; }
      else if (t === TERRAIN.DIRT) { pHerbe = 0.06; pFleurs = 0; pBuisson = 0; pRoc = 0.06; pGalets = 0.12; pAmas = 0.006; pAgave = 0.02; pPampa = 0.015; }
      else { pHerbe = 0.04; pFleurs = 0; pBuisson = 0; pRoc = 0.03; pGalets = 0.10; pAmas = 0.003; pAgave = 0.03; pPampa = 0.025; }
      // Le désert d'un départ : moins de pampas vertes, plus de touffes sèches.
      if (desert) { pHerbe = 0.06; pPampa = 0.012; }
      // Au pied d'une forêt : fougères, couvre-sol, plus d'herbe, des buissons
      // (même sur la terre), quelques rochers ; les fleurs restent aux prés.
      // Dans le désert, rien de vert : des touffes sèches, des agaves, des rochers.
      if (foret && desert) { pHerbe += 0.08; pAgave += 0.04; pRoc += 0.02; }
      else if (foret) { pHerbe += 0.10; pBuisson += pre ? 0.05 : 0.03; pRoc += 0.02; pFougere += 0.10; pCouvre += 0.06; if (pre) pFleurs += 0.02; }
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
        // Un massif de fleurs d'une couleur, et une fois sur trois un second,
        // plus petit, à son côté.
        const couleur = FLEURS[Math.floor(r(22) * FLEURS.length) % FLEURS.length];
        const nb = r(23) < 0.34 ? 2 : 1, ox = dans(24) * 0.6, oy = dans(25) * 0.6;
        for (let k = 0; k < nb; k++) {
          const ang = r(80 + k) * Math.PI * 2, ray = k ? 9 + r(90 + k) * 4 : 0;
          poser(decor, h, tx, ty, couleur, r(100 + k), cx + ox + Math.cos(ang) * ray, cy + oy + 4 + Math.sin(ang) * ray * 0.7, r(110 + k) < 0.5, ECHELLE_FLEUR * (k ? 0.8 : 0.9 + r(120 + k) * 0.2));
        }
      }
    }
  }
  return decor;
}

/**
 * Tout le décor d'une carte : le rivage, puis la campagne, par ligne. `sol` :
 * le sol sur lequel on plante (par défaut celui de la carte).
 */
export function planterDecor(map, sol = map.terrain) {
  const corps = plansDEau(map);
  const rivage = planterRivage(map, corps, sol);
  const campagne = planterCampagne(map, sol);
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

// ---------------------------------------------------------------------------
// Le sol apparent, et ce que les bâtiments cachent du décor.
// ---------------------------------------------------------------------------

/** Ce peuple vit-il sur le sable ? */
export function peupleDuDesert(civ) { return PEUPLES_DU_DESERT.has(civ); }

/** Le sol d'une case : celui du sol apparent s'il en dit quelque chose, sinon celui de la carte. */
export function solEn(sol, map, i) {
  return sol && sol[i] !== SOL_CARTE ? sol[i] : map.terrain[i];
}

/** Un sol apparent mis à plat : un sol par case, pour planter le décor. */
export function solPlein(sol, map) {
  return Uint8Array.from(map.terrain, (t, i) => (sol[i] !== SOL_CARTE ? sol[i] : t));
}

/**
 * Le sol de base d'une partie : autour du départ de chaque peuple du désert,
 * un disque de sable doré puis une bande de terre ; partout ailleurs, la
 * carte (SOL_CARTE). Le bord du disque ondule (trois lobes et cinq, tirés de
 * la graine) : un cercle au compas se verrait. La bande de terre s'élargit et
 * se resserre le long du bord (largeurTerre), jusqu'à disparaître : par
 * endroits, l'herbe touche le sable. L'eau reste de l'eau. Rend aussi la
 * `zone` de chaque case (ZONE), que suivent les arbres : une couronne
 * régulière, elle — un sapin au ras du sable jurerait. Ne modifie pas la carte.
 */
export function solDeBase(map, joueurs) {
  const { w, h, terrain } = map;
  const sol = new Uint8Array(w * h).fill(SOL_CARTE);
  const zone = new Uint8Array(w * h);
  const graine = map.seed | 0;
  for (const j of joueurs) {
    const depart = map.startPositions[j.index];
    if (!depart || !peupleDuDesert(j.civ)) continue;
    const phase = (k) => hacher(j.index, k, graine, 7) * Math.PI * 2;
    const p1 = phase(1), p2 = phase(2), p3 = phase(3);
    const phases = [phase(4), phase(5), phase(6)];
    const portee = RAYON_DESERT + Math.max(COURONNE_TERRE, TERRE_MAX) + 4;
    for (let ty = Math.max(0, depart.ty - portee); ty <= Math.min(h - 1, depart.ty + portee); ty++) {
      for (let tx = Math.max(0, depart.tx - portee); tx <= Math.min(w - 1, depart.tx + portee); tx++) {
        const i = ty * w + tx;
        if (terrain[i] === TERRAIN.WATER) continue;
        const dx = tx - depart.tx, dy = ty - depart.ty, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
        const sable = RAYON_DESERT + 1.5 * Math.sin(3 * a + p1) + 0.9 * Math.sin(5 * a + p2);
        const couronne = sable + COURONNE_TERRE + 1.1 * Math.sin(4 * a + p3);
        if (d <= sable) { sol[i] = SOL_SABLE_OR; zone[i] = ZONE.DESERT; continue; }
        if (zone[i] === ZONE.DESERT) continue;                       // le désert d'un autre départ
        if (d <= couronne) zone[i] = ZONE.COURONNE;
        const herbe = terrain[i] === TERRAIN.GRASS || terrain[i] === TERRAIN.GRASS_DARK;
        if (herbe && d <= sable + largeurTerre(a, phases)) sol[i] = TERRAIN.DIRT;
      }
    }
  }
  return { sol, zone };
}

/**
 * La largeur de la bande de terre autour d'un désert, en cases, dans la
 * direction `a` (radians) : trois ondes de périodes différentes autour de la
 * moitié de TERRE_MAX, bornées de zéro à TERRE_MAX. Là où elle tombe à zéro,
 * l'herbe touche le sable.
 */
export function largeurTerre(a, phases) {
  const onde = 0.8 * Math.sin(2 * a + phases[0]) + 0.6 * Math.sin(5 * a + phases[1]) + 0.4 * Math.sin(9 * a + phases[2]);
  return Math.max(0, Math.min(TERRE_MAX, TERRE_MAX / 2 * (1 + onde)));
}

/**
 * Ce dont l'image d'un bâtiment déborde de son emprise à l'est et à l'ouest,
 * en pixels monde : elle est dessinée sur 172 px pour le Centre-Ville, 158
 * pour les 3×3 et 108 pour les 2×2 (sprites.js, `largeurMonde`).
 */
export function debordImage(type, size) {
  return type === 'towncenter' ? 38 : size >= 3 ? 31 : 22;
}

/** Le rectangle monde que couvre l'image d'un bâtiment posé (ou de son chantier), toits exceptés. */
export function zoneImage(b) {
  const d = debordImage(b.type, b.size);
  return { x0: b.tx * TILE - d, y0: b.ty * TILE, x1: (b.tx + b.size) * TILE + d, y1: (b.ty + b.size) * TILE + DEBORD_SUD };
}

/**
 * La cour d'un bâtiment : son emprise et les cases où son image pose quelque
 * chose au sol — une case à l'est, à l'ouest et au sud (deux pour le
 * Centre-Ville), coins du sud coupés : le socle peint est un losange, une cour
 * carrée ferait une dalle. Rien au nord : les toits n'y posent rien, et une
 * rangée de sable derrière le bâtiment grossissait la tache sur un pré.
 * `dans(tx, ty)` dit si la case en est.
 */
export function courBatiment(b) {
  const m = Math.ceil(debordImage(b.type, b.size) / TILE);
  const est = b.tx + b.size - 1, sud = b.ty + b.size - 1;
  const tx0 = b.tx - m, ty0 = b.ty, tx1 = est + m, ty1 = sud + m;
  // (De combien la case sort de l'emprise, de côté et vers le sud.)
  const dans = (tx, ty) => tx >= tx0 && tx <= tx1 && ty >= ty0 && ty <= ty1 && Math.max(0, b.tx - tx, tx - est) + Math.max(0, ty - sud) <= m;
  return { tx0, ty0, tx1, ty1, dans };
}

/**
 * Le sol apparent : le sol de base, et sous chaque bâtiment d'un peuple du
 * désert sa cour de sable doré — où qu'il soit posé, son socle peint ne fait
 * plus une galette sur un pré. `batiments` : ceux que le joueur connaît
 * ({ type, tx, ty, size, playerIndex, enVue }). La cour va avec l'image du
 * bâtiment : celui d'un adversaire sorti de la vue n'est plus dessiné, et sa
 * cour non plus (`enVue` faux) — une tache de sable sans rien dessus ferait
 * un fantôme. Entre deux cours voisines (ou une cour et le désert), une
 * bande d'herbe d'une ou deux cases est comblée, puis les îlots que cela
 * enferme (ILOT_MAX cases au plus) : un village posé sur un pré se lit comme
 * une seule cour, pas comme des pastilles autour d'un trou sombre. Un tableau
 * neuf à chaque appel, de la même forme que le sol de base (SOL_CARTE là où
 * la carte décide).
 */
export function solApparent(base, map, batiments, joueurs) {
  const { w, h, terrain } = map;
  const sol = Uint8Array.from(base.sol);
  const cours = [];
  for (const b of batiments) {
    if (b.dead || b.enVue === false || !peupleDuDesert(joueurs[b.playerIndex]?.civ)) continue;
    const c = courBatiment(b);
    cours.push(c);
    for (let ty = Math.max(0, c.ty0); ty <= Math.min(h - 1, c.ty1); ty++) {
      for (let tx = Math.max(0, c.tx0); tx <= Math.min(w - 1, c.tx1); tx++) {
        if (c.dans(tx, ty) && terrain[ty * w + tx] !== TERRAIN.WATER) sol[ty * w + tx] = SOL_SABLE_OR;
      }
    }
  }
  // Les bandes, jugées sur les cours seules (une case comblée n'en comble pas
  // une autre), puis les îlots qu'elles ont enfermés.
  const sable = (tx, ty) => tx >= 0 && ty >= 0 && tx < w && ty < h && sol[ty * w + tx] === SOL_SABLE_OR;
  const autour = (c, marge, voir) => {
    for (let ty = Math.max(0, c.ty0 - marge); ty <= Math.min(h - 1, c.ty1 + marge); ty++) {
      for (let tx = Math.max(0, c.tx0 - marge); tx <= Math.min(w - 1, c.tx1 + marge); tx++) {
        if (sol[ty * w + tx] !== SOL_SABLE_OR && terrain[ty * w + tx] !== TERRAIN.WATER) voir(tx, ty);
      }
    }
  };
  const combles = [];
  for (const c of cours) autour(c, TROU_MAX, (tx, ty) => { if (entreDeux(sable, tx, ty, 1, 0) || entreDeux(sable, tx, ty, 0, 1)) combles.push(ty * w + tx); });
  for (const i of combles) sol[i] = SOL_SABLE_OR;
  for (const c of cours) autour(c, TROU_MAX + 1, (tx, ty) => { for (const i of ilot(sol, map, tx, ty)) sol[i] = SOL_SABLE_OR; });
  return sol;
}

/**
 * L'îlot de cette case : les cases sans sable doré qui se touchent par un
 * côté, si elles sont ILOT_MAX au plus — sinon rien, ce n'est pas un îlot
 * mais le pré. L'eau en fait partie et reste de l'eau : elle n'est pas rendue.
 */
function ilot(sol, map, tx, ty) {
  const { w, h, terrain } = map;
  const vus = new Set([ty * w + tx]), file = [ty * w + tx];
  for (let k = 0; k < file.length; k++) {
    const i = file[k], x = i % w, y = (i - x) / w;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const n = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || vus.has(n) || sol[n] === SOL_SABLE_OR) continue;
      if (file.length >= ILOT_MAX) return [];
      vus.add(n); file.push(n);
    }
  }
  return file.filter((i) => terrain[i] !== TERRAIN.WATER);
}

/** La case est-elle prise entre deux cases de sable, dans la direction donnée, à TROU_MAX cases de large au plus ? */
function entreDeux(sable, tx, ty, dx, dy) {
  for (let avant = 1; avant <= TROU_MAX; avant++) {
    if (!sable(tx - dx * avant, ty - dy * avant)) continue;
    for (let apres = 1; avant + apres - 1 <= TROU_MAX; apres++) if (sable(tx + dx * apres, ty + dy * apres)) return true;
    return false;
  }
  return false;
}

/**
 * Tient à jour les bâtiments que le joueur CONNAÎT (`connus` : identifiant →
 * { type, tx, ty, size, playerIndex, enVue }) : les siens, et ceux des autres
 * dès qu'il les voit. Un bâtiment adverse tombé reste connu tant qu'on n'a pas
 * revu l'endroit. Le sol apparent et le décor ne suivent que ceux-là : une
 * cour de sable apparue sous le brouillard trahirait un chantier adverse.
 * `enVue` : sa cour est-elle à peindre ? Les siens, toujours ; ceux d'un
 * adversaire, tant qu'on les voit et DELAI_COUR secondes encore après leur
 * sortie de la vue (`maintenant` : l'heure du rendu, en secondes).
 * `voit(b)` : ce bâtiment est-il en vue ? `debout(id)` : existe-t-il encore ?
 * Rend ce qui a changé : 0 rien, CHANGE.VUE la cour d'un bâtiment connu est à
 * peindre ou à retirer (son sol est à refaire), CHANGE.LISTE la liste même
 * (le sol, et ce que les bâtiments cachent du décor).
 */
export const CHANGE = { VUE: 1, LISTE: 2 };
export function releverBatiments(connus, batiments, humain, voit, debout, maintenant = 0) {
  let change = 0;
  for (const b of batiments) {
    if (b.dead || connus.has(b.id) || (b.playerIndex !== humain && !voit(b))) continue;
    connus.set(b.id, { kind: 'building', id: b.id, type: b.type, tx: b.tx, ty: b.ty, size: b.size, playerIndex: b.playerIndex, enVue: true, sortie: null });
    change |= CHANGE.LISTE;
  }
  for (const c of connus.values()) {
    const vu = c.playerIndex === humain || voit(c);
    if (vu && !debout(c.id)) { connus.delete(c.id); change |= CHANGE.LISTE; continue; }
    if (vu) c.sortie = null;
    else if (c.sortie === null) c.sortie = maintenant;
    const enVue = vu || maintenant - c.sortie < DELAI_COUR;
    if (enVue !== c.enVue) { c.enVue = enVue; change |= CHANGE.VUE; }
  }
  return change;
}

/**
 * Planche des arbres : cyprès, sapin, olivier, pin parasol, saule, arbre
 * noueux. Dans le désert, trois seulement : le sapin devient cyprès, le saule
 * olivier, et le pin parasol (une ombrelle bleu-vert) arbre noueux.
 */
const ARBRES_DU_DESERT = [0, 0, 2, 5, 2, 5];
/**
 * La case de la planche des arbres pour cette variante. Près d'un départ du
 * désert (zone non nulle) : cyprès, olivier ou arbre noueux. La ressource,
 * elle, ne change pas — seule l'image.
 */
export function caseArbre(variante, zone, cases = 6) {
  const c = variante % cases;
  return zone && cases === ARBRES_DU_DESERT.length ? ARBRES_DU_DESERT[c] : c;
}

/**
 * Ce que les bâtiments cachent du décor (drapeau `cache` de chaque pièce) :
 *  - rien sous l'image d'un bâtiment ou d'un chantier (zoneImage) : une pièce
 *    dont le corps y entre n'est pas dessinée, un rocher devant un parvis
 *    compris ;
 *  - rien de vert (herbe, fleurs, buissons) sur le sable d'une cour : `sol`
 *    est le sol apparent du moment (solApparent), cours et trous comblés ;
 *  - aucune pièce debout à moins de RAYON_PLACE cases d'un départ : la place
 *    reste nette.
 * Le décor n'est qu'affichage (les unités le traversent) : c'est un filtre, à
 * refaire quand un bâtiment est posé ou tombe, jamais à chaque image. Rend
 * les pièces cuites dont le drapeau a changé — leurs tronçons de sol sont à
 * refaire.
 */
export function filtrerDecor(decor, batiments, departs, sol = null) {
  const h = decor.debout.length, w = sol ? sol.length / h : 0;
  const parLigne = Array.from({ length: h }, () => []);
  for (const b of batiments) {
    if (b.dead) continue;
    const z = zoneImage(b);
    z.tx0 = b.tx; z.ty0 = b.ty; z.tx1 = b.tx + b.size - 1; z.ty1 = b.ty + b.size - 1;   // l'emprise, en cases
    // (Une ligne de plus de chaque côté : une pièce plantée au bord de sa case peut avoir le pied dans la voisine.)
    for (let ty = Math.max(0, Math.floor(z.y0 / TILE) - 1); ty <= Math.min(h - 1, Math.floor(z.y1 / TILE) + 1); ty++) parLigne[ty].push(z);
  }
  // Le pied d'une pièce verte est-il sur le sable doré ? (Dans le désert d'un départ, rien de vert n'est planté.)
  const surSable = (d) => {
    const tx = Math.floor(d.x / TILE), ty = Math.floor(d.y / TILE);
    return tx >= 0 && ty >= 0 && tx < w && ty < h && sol[ty * w + tx] === SOL_SABLE_OR;
  };
  const places = departs.map((p) => ({ x: p.tx * TILE + TILE / 2, y: p.ty * TILE + TILE / 2 }));
  const rayon = RAYON_PLACE * TILE;
  const changes = [];
  const passer = (lignes, debout) => {
    for (let ty = 0; ty < h; ty++) {
      for (const d of lignes[ty]) {
        // Le corps de la pièce : les trois quarts de sa largeur, le bas de sa
        // hauteur — les coins et le sommet d'une case d'atlas sont vides.
        const l = d.piece.w * ECHELLE_DECOR * d.echelle * 0.36, ht = d.piece.h * ECHELLE_DECOR * d.echelle * 0.7;
        let cache = d.verte && sol !== null && surSable(d);
        if (debout && !cache) for (const p of places) if (Math.hypot(d.x - p.x, d.y - p.y) <= rayon) { cache = true; break; }
        for (let ly = Math.max(0, Math.floor((d.y - ht) / TILE)); ly <= ty && !cache; ly++) {
          for (const z of parLigne[ly]) {
            if (d.x + l > z.x0 && d.x - l < z.x1 && d.y > z.y0 && d.y - ht < z.y1) { cache = true; break; }
            if (d.tx >= z.tx0 && d.tx <= z.tx1 && d.ty >= z.ty0 && d.ty <= z.ty1) { cache = true; break; }   // sa case est sous l'emprise
          }
        }
        if (cache !== d.cache) { d.cache = cache; if (!debout) changes.push(d); }
      }
    }
  };
  passer(decor.debout, true);
  passer(decor.cuits, false);
  return changes;
}
