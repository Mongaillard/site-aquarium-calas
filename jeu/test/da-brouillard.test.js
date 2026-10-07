// Direction artistique, lot « brouillard » : la brume bleu nuit au bord fondu.
// Lancement : node test/da-brouillard.test.js
//
// Sous node, on ne voit pas l'écran. On vérifie donc ce qui se calcule : le
// masque (ses poids, son bord, sa marge), sa mise à jour par morceaux — qui
// doit donner au point près le masque refait d'un bout à l'autre —, les cases
// à montrer, le tracé sur des toiles factices, le coût, et que rien de tout
// cela ne touche à la partie : même graine, même partie, avec ou sans masque.

import { World } from '../js/game.js';
import { AIPlayer } from '../js/ai.js';
import { TILE, TICKS_PER_SECOND, DIFFICULTIES, MAP_SIZES } from '../js/config.js';
import { serializeWorld, restoreWorld } from '../js/save.js';
import {
  Camera, Renderer, BROUILLARD, poidsBrouillard, creerMasqueBrouillard, releverBrouillard, repeindreBrouillard,
} from '../js/render.js';
import { readFileSync } from 'node:fs';

const DT = 1 / TICKS_PER_SECOND;
let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? '  ok  ' : ' FAIL ';
  if (!condition) failures++;
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

const lire = (chemin) => readFileSync(new URL(chemin, import.meta.url), 'utf8');
const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;

/** Un brouillard de w × h cases : `etat(tx, ty)` rend 0 (en vue), 1 (exploré) ou 2 (jamais vu). */
function brouillard(w, h, etat) {
  const fog = { visible: new Uint8Array(w * h), explored: new Uint8Array(w * h), dirty: true };
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const e = etat(tx, ty);
      fog.visible[ty * w + tx] = e === 0 ? 1 : 0;
      fog.explored[ty * w + tx] = e <= 1 ? 1 : 0;
    }
  }
  return fog;
}

/** Le masque d'un brouillard, peint d'un coup : { masque, data }. */
function peindre(fog, w, h, ...reglages) {
  const masque = creerMasqueBrouillard(w, h, ...reglages);
  const data = new Uint8ClampedArray(masque.W * masque.H * 4);
  releverBrouillard(masque, fog);
  repeindreBrouillard(masque, data);
  return { masque, data };
}

/** L'opacité du masque au point (x, y) de la carte (en points, marge exclue). */
const opacite = ({ masque, data }, x, y) => data[((y + masque.bord) * masque.W + x + masque.bord) * 4 + 3];

/**
 * Le masque de référence, à la lettre : la carte prolongée par ses bords,
 * agrandie à k points par case, puis deux moyennes glissantes de rayon r en
 * largeur et deux en hauteur. Lent, mais sans astuce.
 */
function reference(fog, w, h, k, r, marge) {
  const etend = marge + Math.ceil((2 * r) / k) + 1;          // de quoi moyenner sans toucher le bord
  const W = (w + 2 * etend) * k, H = (h + 2 * etend) * k;
  let image = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tx = Math.min(w - 1, Math.max(0, Math.floor(x / k) - etend)), ty = Math.min(h - 1, Math.max(0, Math.floor(y / k) - etend));
      const i = ty * w + tx;
      image[y * W + x] = fog.visible[i] ? 0 : fog.explored[i] ? BROUILLARD.explore : BROUILLARD.inexplore;
    }
  }
  const moyenne = (src, dx, dy) => {
    const out = new Float64Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let d = -r; d <= r; d++) {
          const xx = Math.min(W - 1, Math.max(0, x + d * dx)), yy = Math.min(H - 1, Math.max(0, y + d * dy));
          s += src[yy * W + xx];
        }
        out[y * W + x] = s / (2 * r + 1);
      }
    }
    return out;
  };
  image = moyenne(moyenne(moyenne(moyenne(image, 1, 0), 1, 0), 0, 1), 0, 1);
  const decale = (etend - marge) * k, mw = (w + 2 * marge) * k, mh = (h + 2 * marge) * k;
  const out = new Float64Array(mw * mh);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) out[y * mw + x] = image[(y + decale) * W + x + decale];
  return out;
}

/** Écart le plus grand entre deux masques (opacités de `a`, valeurs de `b`). */
function ecartMax(a, b) {
  let pire = 0;
  for (let i = 0; i < b.length; i++) pire = Math.max(pire, Math.abs(a[i * 4 + 3] - b[i]));
  return pire;
}

const memes = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };

console.log('=== Direction artistique : le brouillard ===');

// ---------------------------------------------------------------------------
// 1. La teinte et les trois états.
// ---------------------------------------------------------------------------
{
  console.log('\n— Teinte et opacités —');
  const [r, v, b] = BROUILLARD.teinte;
  check('la teinte est un bleu nuit (12, 24, 34), pas un noir', r === 12 && v === 24 && b === 34 && b > v && v > r);
  check('jamais vu : opaque — rien de la carte ne se devine dessous', BROUILLARD.inexplore === 255);
  check('exploré hors de vue : un voile, autour de 55 %',
    Math.abs(BROUILLARD.explore / 255 - 0.55) < 0.01, `${(100 * BROUILLARD.explore / 255).toFixed(1)} %`);
  // La limite de ce qui est en vue doit se lire aussi fort qu'avec l'ancien
  // voile, un noir (8, 10, 14) à 120 sur 255 : le même assombrissement du sol.
  // (Herbe et terre : couleurs moyennes relevées sur une capture sans voile.)
  const clarte = ([rouge, vert, bleu]) => 0.2126 * rouge + 0.7152 * vert + 0.0722 * bleu;
  const reste = (teinte, opacite, sol) => 1 - (opacite / 255) * (1 - clarte(teinte) / clarte(sol));
  for (const [nom, sol] of [['une herbe', [77, 100, 49]], ['une terre', [126, 92, 57]]]) {
    const ancien = reste([8, 10, 14], 120, sol), nouveau = reste(BROUILLARD.teinte, BROUILLARD.explore, sol);
    check(`le voile assombrit ${nom} autant que l’ancien voile noir, à deux points près`,
      Math.abs(nouveau - ancien) < 0.02, `clarté gardée : ${(100 * ancien).toFixed(1)} % avant, ${(100 * nouveau).toFixed(1)} % à présent`);
  }

  const uni = (etat) => { const p = peindre(brouillard(20, 14, () => etat), 20, 14); const vus = new Set(); for (let i = 3; i < p.data.length; i += 4) vus.add(p.data[i]); return [...vus]; };
  check('une carte entièrement en vue : aucun voile, marge comprise', memes(uni(0), [0]));
  check('une carte entièrement explorée : le même voile partout', memes(uni(1), [BROUILLARD.explore]));
  check('une carte jamais vue : opaque partout', memes(uni(2), [255]));
}

// ---------------------------------------------------------------------------
// 2. Les poids : deux moyennes glissantes, à la lettre.
// ---------------------------------------------------------------------------
{
  console.log('\n— Le masque vaut deux moyennes glissantes —');
  let sommes = true, miroir = true;
  for (const [k, rayon] of [[3, 2], [4, 3], [2, 1], [4, 2], [5, 3]]) {
    const { poids, n, somme } = poidsBrouillard(k, rayon);
    for (let p = 0; p < k; p++) {
      let s = 0;
      for (let j = 0; j < n; j++) {
        s += poids[p * n + j];
        if (poids[p * n + j] !== poids[(k - 1 - p) * n + (n - 1 - j)]) miroir = false;
      }
      if (s !== somme || somme !== (2 * rayon + 1) ** 2) sommes = false;
    }
  }
  check('chaque point pèse ses cases voisines pour un total constant', sommes);
  check('les poids sont symétriques : le fondu est le même des deux côtés d’un bord', miroir);

  // Un brouillard tourmenté, sur une carte qui ne tombe pas juste en blocs.
  const w = 29, h = 21;
  const fog = brouillard(w, h, (tx, ty) => { const d = Math.hypot(tx - 9, ty - 8); return d < 4.5 ? 0 : (d < 8 || (tx * 7 + ty * 13) % 11 === 0) ? 1 : 2; });
  let pire = 0;
  for (const [k, rayon, marge] of [[3, 2, 3], [4, 3, 3], [2, 1, 0], [3, 2, 1]]) {
    const p = peindre(fog, w, h, k, rayon, marge);
    pire = Math.max(pire, ecartMax(p.data, reference(fog, w, h, k, rayon, marge)));
  }
  check('le masque égale la référence (carte agrandie, deux moyennes en largeur, deux en hauteur) à un niveau près',
    pire <= 0.5 + 1e-9, `écart le plus grand : ${pire.toFixed(3)} sur 255`);
}

// ---------------------------------------------------------------------------
// 3. Le bord : fondu sur une case et demie, sans escalier.
// ---------------------------------------------------------------------------
{
  console.log('\n— Un bord fondu, sans escalier —');
  const w = 40, h = 40;
  // Bord droit : en vue à gauche de la colonne 20, jamais vu à droite.
  const droit = peindre(brouillard(w, h, (tx) => (tx < 20 ? 0 : 2)), w, h);
  const k = droit.masque.k;
  const profil = [];
  for (let x = 0; x < w * k; x++) profil.push(opacite(droit, x, 20 * k));
  let monotone = true;
  for (let x = 1; x < profil.length; x++) if (profil[x] < profil[x - 1]) monotone = false;
  const bord = 20 * k;
  check('d’un côté à l’autre du bord, l’opacité ne fait que monter', monotone && profil[0] === 0 && profil[profil.length - 1] === 255);
  check('elle vaut la moitié au bord des cases : le fondu est centré',
    Math.abs((profil[bord - 1] + profil[bord]) / 2 - 127.5) < 1, `${profil[bord - 1]} puis ${profil[bord]}`);
  // Largeur du fondu : de 10 % à 90 % de l'opacité, en cases (positions interpolées).
  const passage = (seuil) => { for (let x = 1; x < profil.length; x++) if (profil[x] >= seuil) return x - 1 + (seuil - profil[x - 1]) / (profil[x] - profil[x - 1]); return NaN; };
  const largeur = (passage(0.9 * 255) - passage(0.1 * 255)) / k;
  check('le fondu (de 10 % à 90 %) s’étale sur une case et demie environ', largeur > 1.1 && largeur < 2.1, `${largeur.toFixed(2)} cases`);
  const debut = profil.findIndex((v) => v > 0), fin = profil.findIndex((v) => v === 255);
  check('et ne déborde pas de deux cases de part et d’autre', (bord - debut) / k <= 2 && (fin - bord) / k <= 2,
    `de ${((bord - debut) / k).toFixed(2)} case avant à ${((fin - bord) / k).toFixed(2)} case après`);

  // L'ancien masque : un point par case, étiré — la lisière en diagonale faisait
  // des marches d'une case. Ici, la ligne de mi-opacité doit rester droite.
  const escalier = peindre(brouillard(w, h, (tx, ty) => (tx + ty < 40 ? 0 : 2)), w, h);
  const ecarts = [];
  for (let y = 8 * k; y < 32 * k; y++) {
    let x = 1;
    while (x < w * k && opacite(escalier, x, y) < 127.5) x++;
    const a = opacite(escalier, x - 1, y), b = opacite(escalier, x, y);
    const xMi = x - 1 + (127.5 - a) / (b - a) + 0.5, yMi = y + 0.5;      // centres de points
    ecarts.push((xMi + yMi - 40 * k) / k / Math.SQRT2);                  // distance à la diagonale, en cases
  }
  const moyen = ecarts.reduce((s, v) => s + v, 0) / ecarts.length;
  const ondulation = Math.max(...ecarts.map((v) => Math.abs(v - moyen)));
  check('une lisière en diagonale reste droite : plus de marches d’escalier',
    ondulation < 0.08, `ondulation ${ondulation.toFixed(3)} case (des marches d’une case : 0,35)`);

  // Trois états côte à côte : le voile de l'exploré tient entre les deux fondus.
  const trois = peindre(brouillard(w, h, (tx) => (tx < 12 ? 0 : tx < 28 ? 1 : 2)), w, h);
  check('en vue, exploré, jamais vu : trois paliers francs reliés par deux fondus',
    opacite(trois, 6 * k, 20 * k) === 0 && opacite(trois, 20 * k, 20 * k) === BROUILLARD.explore && opacite(trois, 34 * k, 20 * k) === 255);
}

// ---------------------------------------------------------------------------
// 4. La marge : le masque déborde de la carte, la case du bord s'y prolonge.
// ---------------------------------------------------------------------------
{
  console.log('\n— La marge autour de la carte —');
  const w = 24, h = 18;
  const p = peindre(brouillard(w, h, (tx, ty) => (ty < 6 ? 1 : tx < 10 ? 0 : 2)), w, h);
  const { masque } = p, k = masque.k;
  check('le masque déborde de la carte de trois cases de chaque côté',
    masque.marge === 3 && masque.W === (w + 6) * k && masque.H === (h + 6) * k && masque.bord === 3 * k);
  let prolonge = true;
  for (let y = 0; y < h * k; y++) {
    for (let d = 1; d <= masque.bord; d++) if (opacite(p, -d, y) !== opacite(p, 0, y) || opacite(p, w * k - 1 + d, y) !== opacite(p, w * k - 1, y)) prolonge = false;
  }
  for (let x = 0; x < w * k; x++) {
    for (let d = 1; d <= masque.bord; d++) if (opacite(p, x, -d) !== opacite(p, x, 0) || opacite(p, x, h * k - 1 + d) !== opacite(p, x, h * k - 1)) prolonge = false;
  }
  check('dans la marge, l’opacité de la case du bord se prolonge telle quelle', prolonge);
  check('en vue jusqu’au bord, la carte ne s’assombrit pas à sa limite', opacite(p, 0, 12 * k) === 0 && opacite(p, 0, h * k - 1) === 0);
}

// ---------------------------------------------------------------------------
// 5. La mise à jour par morceaux égale le masque refait en entier.
// ---------------------------------------------------------------------------
{
  console.log('\n— Ne repeindre que ce qui a changé —');
  const w = 53, h = 47;      // ni l'un ni l'autre multiple d'un bloc
  // Deux éclaireurs qui se promènent, dont un le long des bords et dans un coin.
  const fog = brouillard(w, h, () => 2);
  const voir = (cx, cy, r) => {
    for (let ty = cy - r; ty <= cy + r; ty++) for (let tx = cx - r; tx <= cx + r; tx++) {
      if (tx < 0 || ty < 0 || tx >= w || ty >= h || (tx - cx) ** 2 + (ty - cy) ** 2 > r * r) continue;
      fog.visible[ty * w + tx] = 1; fog.explored[ty * w + tx] = 1;
    }
  };
  const masque = creerMasqueBrouillard(w, h);
  const data = new Uint8ClampedArray(masque.W * masque.H * 4);
  let pareil = true, dansLeRectangle = true, releves = 0, blocs = 0, connuJuste = true;
  for (let pas = 0; pas < 90; pas++) {
    fog.visible.fill(0);
    voir(Math.round(10 + pas * 0.45), Math.round(8 + pas * 0.3), 6);
    voir(pas < 45 ? pas : 45 - (pas - 45), pas < 45 ? 0 : (pas - 45), 5);
    const avant = data.slice();
    releverBrouillard(masque, fog);
    blocs += masque.aRepeindre;
    const rect = repeindreBrouillard(masque, data);
    releves++;
    // Tout ce qui a changé tient dans le rectangle rendu.
    for (let y = 0; y < masque.H && dansLeRectangle; y++) {
      for (let x = 0; x < masque.W; x++) {
        const o = (y * masque.W + x) * 4 + 3;
        if (data[o] !== avant[o] && (!rect || x < rect.x || x >= rect.x + rect.w || y < rect.y || y >= rect.y + rect.h)) { dansLeRectangle = false; break; }
      }
    }
    if (pas % 6 === 0 || pas === 89) {
      if (!memes(data, peindre(fog, w, h).data)) pareil = false;
      for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
        let pres = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = tx + dx, y = ty + dy;
          if (x >= 0 && y >= 0 && x < w && y < h && fog.explored[y * w + x]) pres = 1;
        }
        if (masque.connu[ty * w + tx] !== pres) connuJuste = false;
      }
    }
  }
  const total = masque.bw * masque.bh;
  check('repeint par morceaux, le masque est au point près celui qu’on referait en entier', pareil);
  check('le rectangle rendu couvre tout ce qui a été réécrit', dansLeRectangle);
  check('un relevé ne repeint qu’une part du masque', blocs / releves < total * 0.5,
    `${(blocs / releves).toFixed(1)} blocs sur ${total} en moyenne`);
  check('les cases à montrer : l’exploré, élargi d’une case (le fondu laisse voir jusque-là)', connuJuste);

  // Rien n'a bougé : rien à repeindre.
  const fige = data.slice();
  const change = releverBrouillard(masque, fog);
  check('un brouillard inchangé ne coûte qu’une relecture : rien à repeindre',
    change === false && masque.aRepeindre === 0 && repeindreBrouillard(masque, data) === null && memes(data, fige));

  // Au plus `max` blocs par appel : le reste attend, et le résultat est le même.
  const tout = brouillard(w, h, (tx, ty) => ((tx * 3 + ty * 5) % 7 < 3 ? 0 : (tx + ty) % 2 ? 1 : 2));
  releverBrouillard(masque, tout);
  const aFaire = masque.aRepeindre;
  let appels = 0, maxParAppel = 0;
  while (masque.aRepeindre > 0 && appels < 100) {
    const reste = masque.aRepeindre;
    repeindreBrouillard(masque, data, 10);
    maxParAppel = Math.max(maxParAppel, reste - masque.aRepeindre);
    appels++;
  }
  check('plafonné à dix blocs par appel, le masque se complète en plusieurs fois, à l’identique',
    aFaire === total && maxParAppel === 10 && appels === Math.ceil(total / 10) && memes(data, peindre(tout, w, h).data),
    `${aFaire} blocs en ${appels} appels`);

  // Une case explorée qui ne l'est plus (un essai, une partie relue).
  const moins = brouillard(w, h, (tx, ty) => (tx < 5 && ty < 5 ? 1 : 2));
  releverBrouillard(masque, moins);
  repeindreBrouillard(masque, data);
  let n = 0;
  for (let i = 0; i < w * h; i++) n += masque.connu[i];
  check('si l’exploré recule, les cases à montrer reculent avec lui', n === 36 && memes(data, peindre(moins, w, h).data), `${n} cases à montrer`);
}

// ---------------------------------------------------------------------------
// 6. Le rendu, sur des toiles factices : ce qui est tracé, et quand.
// ---------------------------------------------------------------------------
{
  console.log('\n— Le rendu (toiles factices) —');
  const w = new World({ seed: 7, mapSize: 'large', difficulty: 'normal' });
  const map = w.map;
  const traces = [];
  const toile = () => new Proxy({}, {
    get: (etat, nom) => (nom in etat ? etat[nom] : (...args) => { traces.push({ nom, args, lisse: etat.imageSmoothingEnabled }); }),
    set: (etat, nom, valeur) => { etat[nom] = valeur; return true; },
  });
  const masque = creerMasqueBrouillard(map.w, map.h);
  const rendu = Object.create(Renderer.prototype);
  const fogCanvas = { width: masque.W, height: masque.H };
  Object.assign(rendu, {
    world: w, camera: new Camera(w), width: 430, height: 932, ctx: toile(), versToile: { echelle: 2, x: 10, y: 20 },
    fogMasque: masque, fogCanvas, fogCtx: toile(), fogImage: { data: new Uint8ClampedArray(masque.W * masque.H * 4) },
    minimapCtx: toile(), minimapCanvas: { width: 160, height: 160 }, minimapTerrain: {}, minimapDirty: false, alertes: [],
  });
  map.dirty = false;
  const poses = () => traces.filter((c) => c.nom === 'putImageData');

  w.fog.dirty = true;
  rendu.majBrouillard();
  check('le premier masque est peint d’un coup, et le brouillard du monde est noté comme lu',
    poses().length === 1 && masque.aRepeindre === 0 && w.fog.dirty === false);
  traces.length = 0;
  rendu.majBrouillard();
  rendu.majBrouillard();
  check('tant que le monde ne relève pas son brouillard, rien n’est recalculé ni reposé', poses().length === 0);
  w.fog.dirty = true;
  rendu.majBrouillard();
  check('un relevé sans changement ne repose rien non plus', poses().length === 0 && w.fog.dirty === false);

  // Une troupe avance d'une case : une pose, limitée à ses abords.
  const palais = w.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const eclaireur = w.spawnUnit(0, 'scout', palais.x + TILE * 12, palais.y);
  w.updateFog();
  rendu.majBrouillard();
  const pose = poses()[0];
  check('une troupe qui avance ne fait reposer qu’un morceau du masque',
    poses().length === 1 && !!pose && pose.args[5] * pose.args[6] < masque.W * masque.H / 8,
    pose ? `${pose.args[5]} × ${pose.args[6]} points sur ${masque.W} × ${masque.H}` : 'aucune pose');

  // Toute la carte change d'un coup : jamais plus de 64 blocs dans une image.
  traces.length = 0;
  w.fog.explored.fill(1);
  w.fog.dirty = true;
  const total = masque.bw * masque.bh;
  let images = 0, pire = 0;
  do {
    const avant = images === 0 ? total : masque.aRepeindre;
    rendu.majBrouillard();
    pire = Math.max(pire, avant - masque.aRepeindre);
    images++;
  } while (masque.aRepeindre > 0 && images < 50);
  check('toute la carte qui change d’un coup : 64 blocs au plus par image, le reste aux suivantes',
    pire === 64 && images === Math.ceil(total / 64) && poses().length === images, `${total} blocs en ${images} images`);
  const attendu = peindre(w.fog, map.w, map.h).data;
  check('et le masque final est le bon', memes(rendu.fogImage.data, attendu));

  // Ce qui est à l'écran passe d'abord, tout entier, quel que soit le plafond.
  w.fog.explored.fill(0);
  w.fog.visible.fill(0);
  w.fog.dirty = true;
  const vue = { x0: map.w - 30, y0: map.h - 60, x1: map.w - 1, y1: map.h - 1 };     // le coin bas-droit, donc la fin du masque
  rendu.majBrouillard(vue);
  const pret = peindre(w.fog, map.w, map.h).data;
  let aJour = true;
  for (let y = (vue.y0 + masque.marge) * masque.k; y < masque.H && aJour; y++) {
    for (let x = (vue.x0 + masque.marge) * masque.k; x < masque.W; x++) if (rendu.fogImage.data[(y * masque.W + x) * 4 + 3] !== pret[(y * masque.W + x) * 4 + 3]) { aJour = false; break; }
  }
  check('ce qui est à l’écran est repeint dans l’image même, marge comprise ; le reste suit',
    aJour && masque.aRepeindre > 0 && masque.aRepeindre < total, `${total - masque.aRepeindre} blocs repeints, ${masque.aRepeindre} en attente`);
  while (masque.aRepeindre) rendu.majBrouillard(vue);
  check('et là encore le masque final est le bon', memes(rendu.fogImage.data, pret));

  // Sur la carte : le masque est posé avec sa marge, lissé.
  traces.length = 0;
  rendu.drawFog();
  const sur = traces.find((c) => c.nom === 'drawImage');
  const marge = masque.marge * TILE;
  check('sur la carte, le masque est étiré avec sa marge autour, et lissé',
    !!sur && sur.args[0] === fogCanvas && sur.args[1] === -marge && sur.args[2] === -marge
      && sur.args[3] === map.pixelWidth + 2 * marge && sur.args[4] === map.pixelHeight + 2 * marge && sur.lisse === true);
  check('aucun filtre de toile : ctx.filter n’est pas fiable sur un iPhone', !('filter' in rendu.ctx) && !/\.filter\s*=/.test(lire('../js/render.js')));

  // Sur la mini-carte : le même masque, sans sa marge.
  traces.length = 0;
  rendu.drawMinimap();
  const mini = traces.filter((c) => c.nom === 'drawImage');
  const voile = mini.find((c) => c.args[0] === fogCanvas);
  check('la mini-carte porte le même masque, sans sa marge, lissé — le terrain, lui, reste net',
    !!voile && voile.args[1] === masque.bord && voile.args[2] === masque.bord && voile.args[3] === map.w * masque.k && voile.args[4] === map.h * masque.k
      && voile.args[7] === 160 && voile.args[8] === 160 && voile.lisse === true && mini[0].args[0] === rendu.minimapTerrain && mini[0].lisse === false);
  void eclaireur;

  const source = lire('../js/render.js');
  check('hors de la carte, la teinte du brouillard : plus de second vide d’une autre couleur',
    !/#1b2430/i.test(source) && /const FOND_HORS_CARTE = `rgb\(\$\{BROUILLARD\.teinte\.join\(','\)\}\)`/.test(source)
      && /ctx\.fillStyle = FOND_HORS_CARTE;/.test(source));
}

// ---------------------------------------------------------------------------
// 7. Le coût, sur la plus grande carte.
// ---------------------------------------------------------------------------
{
  console.log('\n— Le coût (carte « Grande ») —');
  const cote = MAP_SIZES.large.tiles;
  const w = new World({ seed: 11, mapSize: 'large', difficulty: 'normal' });
  const stats = (durees) => { const t = [...durees].sort((a, b) => a - b); return { min: t[0], mediane: t[t.length >> 1], haut: t[Math.floor(t.length * 0.95)], max: t[t.length - 1] }; };

  // Le premier masque, et le pire : aucune case comme sa voisine.
  const damier = brouillard(cote, cote, (tx, ty) => ((tx + ty) % 3 === 0 ? 0 : (tx * 7 + ty) % 5 < 3 ? 1 : 2));
  const premiers = [], pires = [];
  for (let i = 0; i < 40; i++) {
    let t0 = process.hrtime.bigint();
    peindre(w.fog, cote, cote);
    premiers.push(ms(t0));
    t0 = process.hrtime.bigint();
    peindre(damier, cote, cote);
    pires.push(ms(t0));
  }
  // En jeu : trois minutes, les troupes du joueur envoyées aux quatre coins.
  const masque = creerMasqueBrouillard(cote, cote);
  const data = new Uint8ClampedArray(masque.W * masque.H * 4);
  releverBrouillard(masque, w.fog); repeindreBrouillard(masque, data); w.fog.dirty = false;
  const miens = w.entities.filter((e) => e.kind === 'unit' && e.playerIndex === 0);
  const coins = [[0.5, 0.5], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9], [0.1, 0.1]];
  const enJeu = [], inchanges = [];
  let blocs = 0;
  for (let i = 0; i < TICKS_PER_SECOND * 180; i++) {
    if (i % 400 === 0) miens.forEach((u, n) => { const c = coins[(i / 400 + n) % coins.length]; if (!u.dead) u.moveTo(c[0] * w.map.pixelWidth, c[1] * w.map.pixelHeight); });
    w.update(DT); w.drainEvents();
    if (!w.fog.dirty) continue;
    w.fog.dirty = false;
    const t0 = process.hrtime.bigint();
    const change = releverBrouillard(masque, w.fog);
    blocs += masque.aRepeindre;
    repeindreBrouillard(masque, data, 64);
    (change ? enJeu : inchanges).push(ms(t0));
  }
  const a = stats(premiers.slice(5)), b = stats(pires.slice(5)), c = stats(enJeu);
  console.log(`         masque de ${masque.W} × ${masque.H} points, ${masque.bw * masque.bh} blocs`);
  console.log(`         premier masque : ${a.mediane.toFixed(2)} ms (médiane) · pire brouillard possible : ${b.mediane.toFixed(2)} ms (médiane), ${b.min.toFixed(2)} ms (au mieux)`);
  console.log(`         en jeu, ${enJeu.length} relevés qui changent : ${c.mediane.toFixed(3)} ms (médiane), ${c.haut.toFixed(3)} ms (95 %), ${c.max.toFixed(3)} ms (pire) · ${(blocs / enJeu.length).toFixed(1)} blocs par relevé`);
  if (inchanges.length) console.log(`         ${inchanges.length} relevés sans changement : ${stats(inchanges).mediane.toFixed(3)} ms (médiane)`);
  // Bornes larges : ce Mac est lent quand il est chargé. Un téléphone met deux à trois fois plus.
  // Pour le pire brouillard, on retient le meilleur des essais : la charge de
  // la machine ne fait qu'allonger une mesure, et par rafales (une médiane a
  // déjà quintuplé pendant qu'un autre programme tournait).
  check('en jeu, la mise à jour du masque reste loin sous la milliseconde (médiane), sur la plus grande carte', c.mediane < 0.8, `${c.mediane.toFixed(3)} ms`);
  check('même le pire brouillard possible se repeint en quelques millisecondes', b.min < 8, `${b.min.toFixed(2)} ms au mieux, ${b.mediane.toFixed(2)} ms en médiane`);
  check('le masque garde le souvenir de la partie : il a bien suivi trois minutes de jeu', memes(data, (() => { releverBrouillard(masque, w.fog); while (masque.aRepeindre) repeindreBrouillard(masque, data); return peindre(w.fog, cote, cote).data; })()));
}

// ---------------------------------------------------------------------------
// 8. Rien ne change à la partie : même graine, même partie, avec ou sans masque.
// ---------------------------------------------------------------------------
{
  console.log('\n— La simulation ne voit pas le masque —');
  /** Deux minutes de partie entre deux IA ; `suivre` : le rendu lit le brouillard à chaque image. */
  const partie = (suivre) => {
    const w = new World({ seed: 4242, mapSize: 'small', difficulty: 'normal' });
    w.players[0].autoWorkers = true;
    w.ais.push(new AIPlayer(w, 0, DIFFICULTIES.normal));
    const masque = suivre ? creerMasqueBrouillard(w.map.w, w.map.h) : null;
    const data = suivre ? new Uint8ClampedArray(masque.W * masque.H * 4) : null;
    let releves = 0;
    for (let i = 0; i < TICKS_PER_SECOND * 120; i++) {
      w.update(DT);
      w.drainEvents();
      if (suivre && w.fog.dirty) { w.fog.dirty = false; if (releverBrouillard(masque, w.fog)) releves++; repeindreBrouillard(masque, data, 64); }
    }
    const etat = serializeWorld(w);
    delete etat.savedAt;
    return { w, etat: JSON.stringify(etat), releves, masque, data };
  };
  const sans = partie(false), avec = partie(true);
  check('deux minutes de partie sur la même graine : le même état, que le masque suive ou non',
    sans.etat === avec.etat && avec.releves > 50, `${avec.releves} relevés qui changent, ${sans.etat.length} caractères d’état`);
  check('le masque ne fait que lire le brouillard du monde',
    memes(sans.w.fog.explored, avec.w.fog.explored) && memes(sans.w.fog.visible, avec.w.fog.visible));

  // Une sauvegarde se reprend : le brouillard relu donne le même masque. (La
  // reprise relève aussitôt ce qui est en vue : on en fait autant ici.)
  const repris = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(avec.w))));
  const m = avec.masque;
  avec.w.updateFog();
  releverBrouillard(m, avec.w.fog);
  while (m.aRepeindre) repeindreBrouillard(m, avec.data);
  check('une partie sauvegardée puis reprise retrouve le même brouillard, donc le même masque',
    !!repris && memes(repris.fog.explored, avec.w.fog.explored) && memes(repris.fog.visible, avec.w.fog.visible)
      && memes(peindre(repris.fog, repris.map.w, repris.map.h).data, avec.data));
  let n = 0;
  for (let i = 0; i < m.connu.length; i++) n += m.connu[i] - avec.w.fog.explored[i];
  const regles = lire('../js/game.js');
  check('les règles lisent toujours l’exploré, pas les cases à montrer (une de plus, pour l’œil seulement)',
    n > 0 && /this\.fog\.explored\[i\]\) return false/.test(regles) && !/fogMasque|\.connu\b/.test(regles), `${n} cases montrées en plus de l’exploré`);
}

console.log(`\n${failures === 0 ? '✅ Tous les tests passent' : '❌ ' + failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
