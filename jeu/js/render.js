// ---------------------------------------------------------------------------
// Rendu Canvas 2D : terrain, ressources, entités, brouillard, minimap.
// Le sol, les bâtiments, les unités, la végétation et le décor viennent des
// atlas d'illustrations (voir sprites.js) ; une unité sans illustration, ou
// dont l'atlas n'est pas encore là, garde un dessin au code. Les pictogrammes
// sont des tracés vectoriels (voir icones.js).
// ---------------------------------------------------------------------------

import { TILE, BUILDING_TYPES, UNIT_TYPES } from './config.js';
import { iconePath, ICON_BOX } from './icones.js';
import {
  chargerSprites, chargerTextures, textureSol, spriteDe, imagePourJoueur, caseDirection, cadreSource, imageDeMarche, poseSource,
  rendu3dDirect, etatModeles3d,
} from './sprites.js';
import { Rendu3D } from './rendu3d.js';
import { TERRAIN } from './map.js';
import { planterDecor, ECHELLE_DECOR, SOL_SABLE_OR, solEn, solPlein, solDeBase, solApparent, releverBatiments, filtrerDecor, caseArbre } from './decor.js';
import { STATE, villagerTask } from './entities.js';
import { clamp, dist, bruitPeriodique } from './utils.js';

// Essai de direction artistique, par l'adresse de la page (sans effet sinon) :
// `omb` = force de l'ombre portée sous les troupes (0 à 0,5), `soc=anneau` =
// le socle de camp réduit à un anneau.
const ESSAI_RENDU = { ombre: 0, socle: 'disque' };
if (typeof location !== 'undefined' && location.search) {
  const q = new URLSearchParams(location.search);
  if (q.has('omb') && Number.isFinite(parseFloat(q.get('omb')))) ESSAI_RENDU.ombre = Math.max(0, Math.min(0.6, parseFloat(q.get('omb'))));
  if (q.get('soc') === 'anneau') ESSAI_RENDU.socle = 'anneau';
}

// Variantes volontairement proches : un écart trop marqué transforme la
// prairie en damier et fatigue l'œil sur un petit écran.
// Couleurs moyennes des nappes de sol (assets/sol-*.webp) : la tuile de
// secours, affichée le temps du chargement, et la minimap leur ressemblent.
const TERRAIN_COLORS = {
  [TERRAIN.GRASS]: ['#4a6217', '#4c6419', '#486015'],
  [TERRAIN.GRASS_DARK]: ['#5c6123', '#5e6325', '#5a5f21'],
  [TERRAIN.DIRT]: ['#805a3a', '#835d3d', '#7d5737'],
  [TERRAIN.SAND]: ['#a17954', '#a47c57', '#9e7651'],
  [TERRAIN.WATER]: ['#0f6584', '#116886', '#0d6282'],
  [SOL_SABLE_OR]: ['#d2a557', '#d4a759', '#d0a355'],
};

// Nappe de sol par terrain, et priorité : là où deux terrains se rencontrent,
// le plus prioritaire se pose par-dessus (l'herbe sur la terre, l'eau sur tout).
// Le sol peint est le sol APPARENT (decor.js) : celui de la carte, plus le
// sable doré des peuples du désert, un sol que la carte ne connaît pas. Il
// passe SOUS tous les autres (priorité -1) : les cinq sols de la carte gardent
// leur rang, et l'herbe revient sur le bord d'une cour comme sur la terre.
const NAPPES = {
  [TERRAIN.GRASS]: 'grass', [TERRAIN.GRASS_DARK]: 'grassDark',
  [TERRAIN.DIRT]: 'dirt', [TERRAIN.SAND]: 'sand', [TERRAIN.WATER]: 'water',
  [SOL_SABLE_OR]: 'sandOr',
};
const PRIORITE = {
  [SOL_SABLE_OR]: -1, [TERRAIN.DIRT]: 0, [TERRAIN.SAND]: 1, [TERRAIN.GRASS]: 2, [TERRAIN.GRASS_DARK]: 3, [TERRAIN.WATER]: 4,
};
const PRIORITE_MIN = -1, PRIORITE_MAX = 4;
const TERRAIN_PAR_PRIORITE = {
  [-1]: SOL_SABLE_OR, 0: TERRAIN.DIRT, 1: TERRAIN.SAND, 2: TERRAIN.GRASS, 3: TERRAIN.GRASS_DARK, 4: TERRAIN.WATER,
};
// Les lisières entre terrains : la frontière n'est pas le bord des cases mais
// une courbe qui passe entre leurs centres, ondulée par un bruit et fondue sur
// FONDU pixels monde (voir couverturesTroncon).
const FONDU = 10;                  // largeur du fondu, en pixels monde
const ONDULATION = 0.28;           // amplitude de l'ondulation, en cases
const RES_MASQUE = 2;              // pixels monde par texel de masque
const BRUIT_N = 80;                // côté du bruit d'ondulation, en texels (160 px monde)
// Les bords de l'eau, en cases depuis la ligne de rivage (négatif : côté terre),
// modelés par la même ondulation que la lisière : une frange de sable côté
// terre, un haut-fond clair et une ligne d'écume côté eau. Chaque bande monte
// entre ses deux premières bornes et redescend entre les deux dernières.
const RIVAGE = {
  plage: [-0.55, -0.3, 0.05, 0.15],
  hautFond: [-0.2, 0, 0.1, 0.45],
  ecume: [0, 0.06, 0.12, 0.2],
};
const TEINTE_HAUT_FOND = 'rgba(150, 225, 225, 0.42)';
const TEINTE_ECUME = 'rgba(240, 252, 255, 0.9)';
const TRONCON = 8;                 // cases de côté d'un tronçon de sol pré-rendu
const TRONCONS_MAX = 40;           // tronçons gardés en cache (≈ 1,1 Mo chacun en fin)
// Tronçons PÉRIMÉS (le sol a changé dessous) refaits dans une même image :
// les autres restent affichés tels quels et attendent leur tour.
const RECUISSONS_PAR_IMAGE = 1;
// Recouvrement entre tronçons voisins, en pixels monde : à zoom fractionnaire,
// deux images posées bord à bord laissent une couture anticrénelée ; en les
// faisant se chevaucher sur les MÊMES texels, il n'y a plus de bord à voir.
const RECOUVREMENT = 8;

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

/**
 * Position dans une animation cuite au temps `t` (secondes), en images et
 * fraction d'image. Une boucle répartit ses images sur un tour et recommence ;
 * un geste va de la première à la dernière, puis y reste.
 */
function positionImage(clip, t) {
  if (clip.boucle) return ((((t / clip.duree) % 1) + 1) % 1) * clip.images;
  return clamp(t / clip.duree, 0, 1) * (clip.images - 1);
}

/** Rampe douce de 0 (x ≤ a) à 1 (x ≥ b). */
function lisse(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Distance de chaque texel au plus proche texel marqué (chanfrein 3-4, en
 * texels) : deux balayages, l'un vers le bas et la droite, l'autre en retour.
 */
function distances(marque, w, h, out) {
  for (let i = 0; i < w * h; i++) out[i] = marque[i] ? 0 : 1e9;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = out[i];
      if (x > 0 && out[i - 1] + 3 < v) v = out[i - 1] + 3;
      if (y > 0) {
        if (out[i - w] + 3 < v) v = out[i - w] + 3;
        if (x > 0 && out[i - w - 1] + 4 < v) v = out[i - w - 1] + 4;
        if (x < w - 1 && out[i - w + 1] + 4 < v) v = out[i - w + 1] + 4;
      }
      out[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = out[i];
      if (x < w - 1 && out[i + 1] + 3 < v) v = out[i + 1] + 3;
      if (y < h - 1) {
        if (out[i + w] + 3 < v) v = out[i + w] + 3;
        if (x < w - 1 && out[i + w + 1] + 4 < v) v = out[i + w + 1] + 4;
        if (x > 0 && out[i + w - 1] + 4 < v) v = out[i + w - 1] + 4;
      }
      out[i] = v;
    }
  }
  for (let i = 0; i < w * h; i++) out[i] /= 3;
  return out;
}

/** Élargit le rectangle e au texel (u, v). */
function etendre(e, u, v) {
  if (u < e.u0) e.u0 = u;
  if (u > e.u1) e.u1 = u;
  if (v < e.v0) e.v0 = v;
  if (v > e.v1) e.v1 = v;
}

export class Renderer {
  constructor(canvas, world, camera) {
    this.decorActif = true;      // le décor de la carte (decor.js) ; débrayable pour les mesures
    this.canvas = canvas;
    this.troncons = new Map();
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.world = world;
    this.camera = camera;
    // Trois pixels de toile par point sur un téléphone qui en a trois : à deux,
    // toute l'image était étirée une fois et demie par le navigateur, donc
    // floue. Si la cadence ne suit pas, on redescend à deux (surveillerCadence).
    // « ?dpr=2 » ou « ?dpr=3 » dans l'adresse impose la valeur, pour un essai.
    this.dprForce = 0;
    try { this.dprForce = Math.min(3, Number(new URLSearchParams(location.search).get('dpr')) || 0); } catch { /* pas d'adresse */ }
    this.dpr = this.dprForce || Math.min(window.devicePixelRatio || 1, 3);
    this.cadence = { n: 0, duree: 0, suite: 0, temoin: 0, haut: 0, attente: 0, echecs: 0, souillee: false, fige: this.dprForce > 0 };
    this.ghost = null;
    this.selectionBox = null;
    this.alertes = [];           // foyers d'attaque à signaler sur la mini-carte (posés par Game)
    this.showGrid = false;
    this.frame = 0;
    // Particules décoratives : elles vivent dans le rendu, jamais dans la
    // simulation. Une partie rejouée à la même graine reste donc identique.
    this.particles = [];
    this.effetsVus = new WeakSet();
    chargerSprites();
    chargerTextures();
    this.buildTileAtlas();
    this.bruitLisiere = bruitPeriodique(BRUIT_N, [{ cellules: 8, poids: 0.65 }, { cellules: 16, poids: 0.35 }], 3);
    this.bruitEcume = bruitPeriodique(BRUIT_N, [{ cellules: 20, poids: 0.6 }, { cellules: 40, poids: 0.4 }], 5);   // strie l'écume
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

  /**
   * Plafond de pixels de toile par point : 3 (« Fine ») ou 2 (« Légère »,
   * choisie au menu de pause). Remet le garde-fou à zéro ; à 2, il n'a plus
   * rien à surveiller.
   */
  reglerFinesse(plafond) {
    const voulu = this.dprForce || Math.min(window.devicePixelRatio || 1, plafond);
    this.cadence = { n: 0, duree: 0, suite: 0, temoin: 0, haut: 0, attente: 0, echecs: 0, souillee: false, fige: this.dprForce > 0 || plafond < 3 };
    if (voulu !== this.dpr) { this.dpr = voulu; this.resize(); }
  }

  /** Une cuisson de modèle vient de finir : la fenêtre de mesure en cours ne vaut rien. */
  cuissonVue() { this.cadence.souillee = true; }

  /**
   * Garde-fou de la toile à trois pixels par point, par fenêtres de cent vingt
   * images. Deux fenêtres de suite sous quarante-cinq images par seconde : on
   * passe à deux pixels par point pour UNE fenêtre témoin. Si elle est
   * nettement plus rapide (un cinquième de mieux), c'est bien la toile qui
   * pesait : on y reste pour la partie, et le zoom de départ se recale
   * (surToileReduite). Sinon — un téléphone en économie d'énergie tourne à
   * trente images par seconde quoi qu'on dessine — on remonte à trois et on
   * ne réessaiera que si le jeu ralentit encore d'un cinquième par rapport à
   * cette mesure. Une fenêtre où un modèle se cuisait, ou
   * qui contient un retour d'arrière-plan, est écartée. Rien n'est retenu
   * d'une partie à l'autre.
   */
  surveillerCadence(dt) {
    const c = this.cadence;
    if (c.fige || (this.dpr <= 2 && !c.temoin)) return;
    // L'attente d'abord : l'à-coup du sol qui se recuit après un changement de
    // toile ne doit pas souiller la fenêtre qui suit.
    if (c.attente > 0) { if (--c.attente === 0) c.souillee = false; return; }
    if (dt >= 0.2) { c.souillee = true; return; }
    c.n++; c.duree += dt;
    // (La fenêtre témoin est courte : pendant qu'elle dure, toute l'image est plus douce.)
    if (c.n < (c.temoin ? 40 : 120)) return;
    const moyenne = c.duree / c.n;
    const ecartee = c.souillee || etatModeles3d().etat === 'cuisson';
    c.n = 0; c.duree = 0; c.souillee = false;
    if (ecartee) {
      // Un témoin écarté (une troupe se cuisait) ne laisse pas la toile réduite.
      if (c.temoin) { this.dpr = c.haut; this.resize(); c.temoin = 0; c.attente = 12; }
      c.suite = 0; return;
    }
    if (c.temoin) {
      if (moyenne < c.temoin * 0.8) {
        c.fige = true;
        if (this.surToileReduite) this.surToileReduite();
      } else {
        this.dpr = c.haut; this.resize();
        // La toile réduite n'a rien gagné : ce n'est pas elle qui borne la
        // cadence (économie d'énergie, écran à trente images par seconde).
        // On retient la cadence mesurée à trois pixels par point, et on ne
        // réessaiera que si le jeu devient nettement plus lent qu'elle — le
        // garde-fou reste armé, sans retomber dans le flou à intervalles.
        c.seuil = c.temoin * 1.2;
        c.attente = 1800 * 2 ** c.echecs; c.echecs++;
      }
      c.temoin = 0; c.suite = 0;
      return;
    }
    c.suite = moyenne > Math.max(1 / 45, c.seuil || 0) ? c.suite + 1 : 0;
    if (c.suite >= 2) {
      c.temoin = moyenne; c.haut = this.dpr;
      this.dpr = 2; this.resize();
      c.attente = 12;   // le temps que le sol se recuise à l'autre niveau
    }
  }

  // --- Boucle de rendu ------------------------------------------------------

  render(dt = 1 / 60) {
    this.horloge = (this.horloge || 0) + dt;   // cadence des poses de travail
    const ctx = this.ctx;
    this.frame++;
    this.surveillerCadence(dt);
    this.dt = Math.min(0.05, dt);
    this.suivreEffets();
    this.majParticules(this.dt);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;   // un dessin interrompu à l'image d'avant ne voile pas celle-ci
    ctx.fillStyle = '#1b2430';
    ctx.fillRect(0, 0, this.width, this.height);

    const cam = this.camera;
    // Du monde à la toile : pixel de toile = monde × echelle + origine, et
    // l'origine est un pixel ENTIER. Au zoom de départ (echelle 2), tronçons
    // de sol, bâtiments et troupes — tous à deux pixels par pixel monde —
    // sont alors recopiés pixel pour pixel ; la caméra glisse par pas d'un
    // pixel d'écran. calerX / calerY posent une image sur un pixel entier.
    this.versToile = {
      echelle: cam.zoom * this.dpr,
      x: Math.round((this.width / 2 - cam.x * cam.zoom) * this.dpr),
      y: Math.round((this.height / 2 - cam.y * cam.zoom) * this.dpr),
    };
    ctx.save();
    ctx.setTransform(this.versToile.echelle, 0, 0, this.versToile.echelle, this.versToile.x, this.versToile.y);

    const view = this.visibleTileRange();
    this.drawTerrain(view);
    this.drawResources(view);
    this.drawRubble();
    this.dessinerCadavres();
    this.drawEntities();
    this.drawProjectiles();
    this.drawEffects();
    this.drawParticules();
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

  /** Les nappes de sol au niveau de ce zoom, ou null tant qu'une manque. */
  nappesPour(zoom) {
    const nappes = {};
    for (const t of Object.keys(NAPPES)) {
      nappes[t] = textureSol(NAPPES[t], zoom);
      if (!nappes[t]) return null;
    }
    return nappes;
  }

  drawTerrain(view) {
    // Les tronçons cuits avant l'arrivée de l'atlas du décor n'en ont pas :
    // dès qu'il est là (ou que le décor bascule), on repart de zéro.
    const atlas = spriteDe('decor');
    const decorPret = !!(atlas && atlas.pret && this.decorActif);
    if (decorPret !== this.decorCuit) { this.decorCuit = decorPret; this.troncons.clear(); }
    this.suivreSol();
    this.oublierTronconsModifies();
    this.cuissons = 0;   // tronçons cuits dans cette image (voir troncon)
    const zoom = this.camera.zoom;
    // Le niveau fin (2 px par pixel monde) sert dès le zoom 0,75, comme
    // toujours — et dès 0,5 sur une toile à trois pixels par point, sinon le
    // sol y serait étiré deux fois. Et la nappe est celle DU NIVEAU, pas celle
    // du zoom : un tronçon fin peint avec la nappe demi-taille coûterait quatre
    // fois la mémoire pour une herbe aussi floue.
    const niveau = (this.solFinRefuse || zoom < Math.min(0.75, 1.5 / this.dpr)) ? 1 : 0;
    const nappes = this.nappesPour(niveau === 0 ? 1 : 0.5);
    if (!nappes) { this.drawTerrainTuiles(view); return; }

    // Le sol est pré-rendu par TRONÇONS de TRONCON × TRONCON cases, mis en
    // cache : le terrain ne change presque jamais (voir oublierTronconsModifies),
    // et le brouillard se peint par-dessus.
    // Une image affiche une dizaine de tronçons, là où le rendu case par case
    // coûtait des centaines d'opérations. Deux résolutions : fine (2 px par
    // pixel monde) pour le jeu, grossière au zoom arrière — réduire une nappe
    // de trop scintille au défilement.
    const taille = TRONCON * TILE;
    const cx0 = Math.floor(Math.max(0, view.left) / taille), cx1 = Math.floor(Math.min(this.world.map.pixelWidth - 1, view.right) / taille);
    const cy0 = Math.floor(Math.max(0, view.top) / taille), cy1 = Math.floor(Math.min(this.world.map.pixelHeight - 1, view.bottom) / taille);
    const r = RECOUVREMENT;
    // Le cache doit tenir au moins la vue entière : au zoom minimal d'un
    // téléphone en portrait, elle dépasse 40 tronçons, et un LRU parcouru en
    // boucle sur plus qu'il n'en tient rate chaque accès — tout était recuit
    // à chaque image.
    this.tronconsMax = Math.max(TRONCONS_MAX, (cx1 - cx0 + 1) * (cy1 - cy0 + 1) + 4);
    // Le recouvrement s'arrête au bord de la carte : au-delà, aucun brouillard
    // ne le couvre, et une bande du terrain inexploré restait visible.
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(0, 0, this.world.map.pixelWidth, this.world.map.pixelHeight);
    this.ctx.clip();
    let manque = false;
    for (let cy = cy0; cy <= cy1 && !manque; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const t = this.troncon(cx, cy, niveau, nappes);
        if (!t) { manque = true; break; }
        this.ctx.drawImage(t, cx * taille - r, cy * taille - r, taille + 2 * r, taille + 2 * r);
      }
    }
    this.ctx.restore();
    // Une toile refusée (mémoire graphique pleine) : le niveau fin est
    // abandonné pour la partie ; si même le grossier manque, des tuiles de
    // couleur, sans aucune toile — jamais un écran noir.
    if (manque) {
      // Les tronçons fins déjà cuits ne serviront plus : leur mémoire est
      // rendue tout de suite, c'est elle qui permet au niveau grossier de passer.
      if (niveau === 0) { this.solFinRefuse = true; this.viderTroncons('0:'); }
      this.drawTerrainTuiles(view);
    }
  }

  /**
   * Le terrain change rarement — un gisement d'or épuisé laisse de la terre —,
   * mais un tronçon en cache garderait l'ancien sol. Les tronçons qui couvrent
   * la case, à deux cases près (fondu et ondulation des lisières, décor voisin),
   * sont périmés aux deux niveaux : ils seront refaits, un par image.
   */
  oublierTronconsModifies() {
    const map = this.world.map;
    const modifies = map.terrainModifie;
    if (!modifies || modifies.size === 0) return;
    for (const i of modifies) {
      const tx = i % map.w, ty = Math.floor(i / map.w);
      this.perimerTroncons((tx - 2) * TILE, (ty - 2) * TILE, (tx + 3) * TILE, (ty + 3) * TILE);
    }
    modifies.clear();
  }

  /**
   * Périme, aux deux niveaux, les tronçons de sol qui touchent ce rectangle
   * monde. Un tronçon périmé n'est pas oublié : il reste affiché tel quel
   * jusqu'à ce que son tour vienne d'être refait (voir troncon) — un bâtiment
   * posé à cheval sur quatre tronçons les faisait tous recuire dans la même
   * image, et cela se sentait. Sa cour arrive une à trois images plus tard.
   */
  perimerTroncons(x0, y0, x1, y1) {
    const taille = TRONCON * TILE, r = RECOUVREMENT;
    for (let cy = Math.floor((y0 - r) / taille); cy <= Math.floor((y1 + r) / taille); cy++) {
      for (let cx = Math.floor((x0 - r) / taille); cx <= Math.floor((x1 + r) / taille); cx++) {
        for (let niveau = 0; niveau < 2; niveau++) {
          const toile = this.troncons.get(`${niveau}:${cx}:${cy}`);
          if (toile) toile.perime = true;
        }
      }
    }
  }

  /**
   * Le sol apparent et le filtre du décor (decor.js) suivent les bâtiments que
   * le joueur CONNAÎT : les siens, et ceux de l'adversaire qu'il voit ou qu'il
   * a vus — un sol qui changerait sous le brouillard trahirait un chantier.
   * À chaque image, deux signatures (quelques opérations par bâtiment) : les
   * bâtiments du monde, et ceux de l'adversaire que l'on voit à l'instant. Le
   * reste n'est refait que lorsqu'un bâtiment est posé, tombe, entre dans la
   * vue ou en sort, et seuls les tronçons de sol touchés sont périmés. (La
   * seconde signature suffit à suivre le brouillard ; le test de `fog.dirty`
   * et le filet de vingt images, plus bas, ne sont plus qu'une ceinture.)
   * La carte n'est pas modifiée.
   */
  suivreSol() {
    const world = this.world, map = world.map;
    const neuve = this.solCarte !== map;
    const vues = this.signatureVues();
    if (vues !== this.vuesRelevees) { this.vuesRelevees = vues; this.signatureBatiments = null; }   // comme un bâtiment posé ou tombé
    let signature = world.buildings.length;
    for (const b of world.buildings) signature = (Math.imul(signature, 31) + b.id) | 0;
    // (Le brouillard vient de bouger, ou un tiers de seconde a passé : un
    // bâtiment adverse a pu entrer dans la vue.)
    if (!neuve && signature === this.signatureBatiments && !world.fog.dirty && this.frame % 20) return;
    this.signatureBatiments = signature;
    if (neuve) { this.solCarte = map; this.connus = new Map(); this.sol = null; this.decor = null; this.solBase = solDeBase(map, world.players); }
    const debout = (id) => { const b = world.byId.get(id); return !!b && !b.dead; };
    const change = releverBatiments(this.connus, world.buildings, world.humanIndex, (b) => this.isEntityVisible(b), debout);
    if (!change && !neuve) return;
    const batiments = [...this.connus.values()];
    // Connus mais tombés hors de vue : oubliés quand on reverra l'endroit (voir signatureVues).
    this.tombes = batiments.filter((c) => !debout(c.id));
    const avant = this.sol;
    this.sol = solApparent(this.solBase, map, batiments, world.players);
    if (avant) {
      for (let i = 0; i < avant.length; i++) {
        if (avant[i] === this.sol[i]) continue;
        const tx = i % map.w, ty = (i - tx) / map.w;
        this.perimerTroncons((tx - 2) * TILE, (ty - 2) * TILE, (tx + 3) * TILE, (ty + 3) * TILE);
        this.minimapDirty = true;
      }
    } else this.minimapDirty = true;
    // Une pièce cuite que le filtre vient de cacher ou de rendre : son tronçon est à refaire.
    for (const d of filtrerDecor(this.decorCarte(), batiments, world.players, map.startPositions)) {
      if (!neuve) this.perimerTroncons(d.x - 2 * TILE, d.y - 3 * TILE, d.x + 2 * TILE, d.y + TILE);
    }
  }

  /**
   * Ce que l'on voit, à l'instant, des bâtiments adverses — et de la place de
   * ceux qui sont tombés hors de vue : un nombre, qui change dès que l'un
   * d'eux entre dans la vue ou en sort.
   */
  signatureVues() {
    const humain = this.world.humanIndex;
    let s = 0;
    for (const b of this.world.buildings) {
      if (b.playerIndex !== humain && this.isEntityVisible(b)) s = (Math.imul(s, 31) + b.id + 1) | 0;
    }
    if (this.tombes) for (const c of this.tombes) if (this.isEntityVisible(c)) s = (Math.imul(s, 31) - c.id) | 0;
    return s;
  }

  /** Rend la mémoire des tronçons de sol en cache (tous, ou ceux d'un niveau : « 0: », « 1: »). */
  viderTroncons(prefixe = '') {
    // Le tampon de travail aussi (tamponTroncon le recrée à la demande).
    if (this.tampon) { this.tampon.width = this.tampon.height = 0; this.tampon = null; }
    if (!this.troncons) return;
    for (const [cle, toile] of [...this.troncons]) {
      if (!cle.startsWith(prefixe)) continue;
      if (toile) toile.width = toile.height = 0;
      this.troncons.delete(cle);
    }
  }

  /** Le tronçon (cx, cy) au niveau demandé, rendu à la première demande. */
  troncon(cx, cy, niveau, nappes) {
    const cle = `${niveau}:${cx}:${cy}`;
    if (!this.troncons) this.troncons = new Map();
    const cache = this.troncons;
    let c = cache.get(cle);
    // Périmé : refait sur une toile neuve si l'image n'a encore rien cuit,
    // sinon affiché tel quel — son tour viendra à l'image suivante.
    if (c && c.perime && this.cuissons < RECUISSONS_PAR_IMAGE) {
      const vieux = c;
      this.cuissons++;
      try { c = this.rendreTroncon(cx, cy, niveau === 0 ? 2 : 1, nappes); } catch { return null; }
      cache.delete(cle); cache.set(cle, c);
      vieux.width = vieux.height = 0;
      return c;
    }
    if (c) { cache.delete(cle); cache.set(cle, c); return c; }   // le plus récent en dernier
    if (cache.size >= (this.tronconsMax || TRONCONS_MAX)) {
      // Le plus ancien sort, et sa toile est rendue tout de suite (Safari
      // compte la mémoire des toiles tant qu'elles ne sont pas vidées).
      const cleVieux = cache.keys().next().value;
      const vieux = cache.get(cleVieux);
      cache.delete(cleVieux);
      if (vieux) vieux.width = vieux.height = 0;
    }
    try { c = this.rendreTroncon(cx, cy, niveau === 0 ? 2 : 1, nappes); } catch { return null; }
    this.cuissons++;
    cache.set(cle, c);
    return c;
  }

  /**
   * Un tronçon : le terrain de base sur toute la surface, puis chaque terrain
   * plus prioritaire à travers son masque de couverture. Le tronçon déborde
   * d'un recouvrement tout autour ; les masques, calculés en coordonnées
   * monde, y sont les mêmes que chez le voisin.
   */
  rendreTroncon(cx, cy, echelle, nappes) {
    const toile = { c: null };
    try {
      return this.peindreTroncon(cx, cy, echelle, nappes, toile);
    } catch (erreur) {
      if (toile.c) toile.c.width = toile.c.height = 0;   // à moitié peinte : sa mémoire tout de suite
      throw erreur;
    }
  }

  peindreTroncon(cx, cy, echelle, nappes, toile) {
    const taille = TRONCON * TILE, r = RECOUVREMENT;
    const X0 = cx * taille - r, Y0 = cy * taille - r, cote = taille + 2 * r;
    const canvas = document.createElement('canvas');
    toile.c = canvas;
    canvas.width = cote * echelle; canvas.height = cote * echelle;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('mémoire graphique saturée (tronçon de sol refusé)');
    ctx.setTransform(echelle, 0, 0, echelle, -X0 * echelle, -Y0 * echelle);

    const { presents, masques, etendues, rivage } = this.couverturesTroncon(X0, Y0, cote);
    this.dessinerNappe(ctx, nappes[TERRAIN_PAR_PRIORITE[presents[0]]], X0, Y0, cote, cote);
    if (presents.length === 1) { this.cuireDecor(ctx, X0, Y0, cote); return canvas; }

    // Chaque couche, sur le rectangle où son masque n'est pas nul : son contenu
    // sur un tampon, passé par le masque (agrandi avec lissage : 2 px monde par
    // texel suffisent à un fondu de 10), puis posé sur le tronçon.
    const tampon = this.tamponTroncon(canvas.width);
    const g = tampon.getContext('2d');
    const n = cote / RES_MASQUE;
    const composer = (img, e, peindre) => {
      if (e.u1 < e.u0) return;   // présent dans la couronne, mais n'entre pas
      const x = X0 + e.u0 * RES_MASQUE, y = Y0 + e.v0 * RES_MASQUE;
      const w = (e.u1 - e.u0 + 1) * RES_MASQUE, h = (e.v1 - e.v0 + 1) * RES_MASQUE;
      g.setTransform(echelle, 0, 0, echelle, -X0 * echelle, -Y0 * echelle);
      g.clearRect(x, y, w, h);
      peindre(x, y, w, h);
      // Le masque passe par un canvas neuf à chaque fois : petit (136 px de
      // côté), et jamais réutilisé — un canvas réécrit par putImageData puis
      // redessiné aussitôt a déjà valu des instantanés périmés sur WebKit.
      const masque = document.createElement('canvas');
      masque.width = n; masque.height = n;
      masque.getContext('2d').putImageData(img, 0, 0);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(masque, e.u0, e.v0, w / RES_MASQUE, h / RES_MASQUE, x, y, w, h);
      g.globalCompositeOperation = 'source-over';
      const sx = (x - X0) * echelle, sy = (y - Y0) * echelle, sw = w * echelle, sh = h * echelle;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(tampon, sx, sy, sw, sh, sx, sy, sw, sh);
      ctx.setTransform(echelle, 0, 0, echelle, -X0 * echelle, -Y0 * echelle);
    };
    const nappe = (cle) => (x, y, w, h) => this.dessinerNappe(g, nappes[cle], x, y, w, h);
    const teinte = (couleur) => (x, y, w, h) => { g.fillStyle = couleur; g.fillRect(x, y, w, h); };
    for (let l = 1; l < presents.length; l++) {
      const terrain = TERRAIN_PAR_PRIORITE[presents[l]];
      // Sous l'eau, sa plage ; sur l'eau, son haut-fond et son écume.
      if (terrain === TERRAIN.WATER) composer(rivage.plage.img, rivage.plage.e, nappe(TERRAIN.SAND));
      composer(masques[l], etendues[l], nappe(terrain));
      if (terrain === TERRAIN.WATER) {
        composer(rivage.hautFond.img, rivage.hautFond.e, teinte(TEINTE_HAUT_FOND));
        composer(rivage.ecume.img, rivage.ecume.e, teinte(TEINTE_ECUME));
      }
    }
    this.cuireDecor(ctx, X0, Y0, cote);
    return canvas;
  }

  /**
   * Masques de couverture du carré monde (X0, Y0, cote) : les priorités
   * présentes, croissantes, et pour chacune sauf la première l'opacité de sa
   * nappe texel par texel (une ImageData de RES_MASQUE pixels monde par texel).
   *
   * Le champ « ce terrain, ou un plus prioritaire » vaut 1 au centre de ses
   * cases, 0 au centre des autres, et s'interpole entre : sa ligne de niveau
   * 0,5 passe par le milieu des bords de case et coupe les angles en
   * diagonale — plus d'escalier. Un bruit périodique l'ondule, puis un seuil
   * doux large de FONDU pixels donne l'opacité. Les champs sont emboîtés
   * (l'herbe sombre est aussi « herbe ou plus ») : posée sous les couches du
   * dessus, chaque nappe ne garde que sa part, et à une lisière herbe/terre
   * aucun sable ne transparaît.
   */
  couverturesTroncon(X0, Y0, cote) {
    const map = this.world.map, sol = this.sol;
    const n = cote / RES_MASQUE;
    // Les cases dont les centres encadrent le carré, une couronne de plus ; le
    // bord de la carte se prolonge.
    const tx0 = Math.floor(X0 / TILE) - 2, ty0 = Math.floor(Y0 / TILE) - 2;
    const cols = Math.ceil(cote / TILE) + 5;   // deux couronnes : le rivage regarde 32 px au-delà
    const prio = new Int8Array(cols * cols);
    let vus = 0;
    for (let j = 0; j < cols; j++) {
      const ty = clamp(ty0 + j, 0, map.h - 1);
      for (let i = 0; i < cols; i++) {
        const tx = clamp(tx0 + i, 0, map.w - 1);
        const p = PRIORITE[solEn(sol, map, ty * map.w + tx)];
        prio[j * cols + i] = p;
        vus |= 1 << (p - PRIORITE_MIN);
      }
    }
    const presents = [];
    for (let p = PRIORITE_MIN; p <= PRIORITE_MAX; p++) if (vus & (1 << (p - PRIORITE_MIN))) presents.push(p);
    const masques = [null], etendues = [null];
    if (presents.length === 1) return { presents, masques, etendues, rivage: null };
    // Un ImageData neuf par masque : WebKit a déjà servi des pixels périmés
    // quand le même objet était réécrit puis redessiné d'un tronçon à l'autre.
    const image = () => new ImageData(n, n);
    for (let l = 1; l < presents.length; l++) {
      masques.push(image(l));
      etendues.push({ u0: n, v0: n, u1: -1, v1: -1 });   // rectangle des texels non nuls
    }
    const eau = presents.indexOf(PRIORITE[TERRAIN.WATER]);

    const k = presents.length;
    const M = new Float32Array(k);
    const bruit = this.bruitLisiere, nb = BRUIT_N;
    const fondu = FONDU / TILE;
    const u0 = X0 / RES_MASQUE, v0 = Y0 / RES_MASQUE;   // texels monde, entiers
    for (let v = 0; v < n; v++) {
      const wy = Y0 + (v + 0.5) * RES_MASQUE;
      const fy = wy / TILE - 0.5, jy = Math.floor(fy), sy = fy - jy;
      const r0 = (jy - ty0) * cols, r1 = r0 + cols;
      const by = ((((v0 + v) % nb) + nb) % nb) * nb;
      for (let u = 0; u < n; u++) {
        const wx = X0 + (u + 0.5) * RES_MASQUE;
        const fx = wx / TILE - 0.5, ix = Math.floor(fx), sx = fx - ix;
        const i0 = ix - tx0;
        const p00 = prio[r0 + i0], p10 = prio[r0 + i0 + 1], p01 = prio[r1 + i0], p11 = prio[r1 + i0 + 1];
        const ond = bruit[by + (((u0 + u) % nb) + nb) % nb] * ONDULATION;
        for (let l = 1; l < k; l++) {
          const p = presents[l];
          const c = ((p00 >= p) * (1 - sx) + (p10 >= p) * sx) * (1 - sy) + ((p01 >= p) * (1 - sx) + (p11 >= p) * sx) * sy;
          const t = clamp((c + ond - 0.5) / fondu + 0.5, 0, 1);
          M[l] = t * t * (3 - 2 * t);
        }
        // De haut en bas : sous les couches du dessus, une nappe ne garde que sa part.
        let dessus = 0;
        const o = (v * n + u) * 4 + 3;
        for (let l = k - 1; l >= 1; l--) {
          const a = dessus >= 1 ? 0 : ((M[l] - dessus) / (1 - dessus)) * 255;
          masques[l].data[o] = a;
          if (a > 0) etendre(etendues[l], u, v);
          dessus = M[l];
        }
      }
    }
    const rivage = eau > 0 ? this.masquesRivage(X0, Y0, n, prio, cols, tx0, ty0, image) : null;
    return { presents, masques, etendues, rivage };
  }

  /**
   * Les bords de l'eau : trois masques sur la DISTANCE au rivage. Le champ
   * interpolé ne convient pas — il sature à une demi-case du bord, si bien
   * qu'au large l'ondulation seule ferait des taches. On classe donc les
   * texels (eau si le champ ondulé passe 0,5, la même ligne que la couche
   * d'eau), sur une fenêtre élargie de MARGE texels pour voir les rivages
   * voisins, puis une transformée de distance donne, en cases, la distance
   * signée au rivage : négative sur la terre. Les bandes en découlent.
   */
  masquesRivage(X0, Y0, n, prio, cols, tx0, ty0, image) {
    const MARGE = 16, ne = n + 2 * MARGE;
    const bruit = this.bruitLisiere, nb = BRUIT_N;
    const u0 = X0 / RES_MASQUE - MARGE, v0 = Y0 / RES_MASQUE - MARGE;
    const pEau = PRIORITE[TERRAIN.WATER];
    const dansEau = new Uint8Array(ne * ne), horsEau = new Uint8Array(ne * ne);
    for (let v = 0; v < ne; v++) {
      const wy = (v0 + v + 0.5) * RES_MASQUE;
      const fy = wy / TILE - 0.5, jy = Math.floor(fy), sy = fy - jy;
      const r0 = (jy - ty0) * cols, r1 = r0 + cols;
      const by = ((((v0 + v) % nb) + nb) % nb) * nb;
      for (let u = 0; u < ne; u++) {
        const wx = (u0 + u + 0.5) * RES_MASQUE;
        const fx = wx / TILE - 0.5, ix = Math.floor(fx), sx = fx - ix;
        const i0 = ix - tx0;
        const c = ((prio[r0 + i0] >= pEau) * (1 - sx) + (prio[r0 + i0 + 1] >= pEau) * sx) * (1 - sy)
          + ((prio[r1 + i0] >= pEau) * (1 - sx) + (prio[r1 + i0 + 1] >= pEau) * sx) * sy;
        const eau = c + bruit[by + (((u0 + u) % nb) + nb) % nb] * ONDULATION >= 0.5;
        dansEau[v * ne + u] = eau ? 1 : 0;
        horsEau[v * ne + u] = eau ? 0 : 1;
      }
    }
    if (!this.distancesRivage || this.distancesRivage[0].length !== ne * ne) this.distancesRivage = [new Float32Array(ne * ne), new Float32Array(ne * ne)];
    const versEau = distances(dansEau, ne, ne, this.distancesRivage[0]);
    const versTerre = distances(horsEau, ne, ne, this.distancesRivage[1]);
    const rivage = {
      plage: { img: image('plage'), e: { u0: n, v0: n, u1: -1, v1: -1 } },
      hautFond: { img: image('hautFond'), e: { u0: n, v0: n, u1: -1, v1: -1 } },
      ecume: { img: image('ecume'), e: { u0: n, v0: n, u1: -1, v1: -1 } },
    };
    const bande = ([a, b, c, d], x) => lisse(a, b, x) * (1 - lisse(c, d, x));
    const enCases = RES_MASQUE / TILE;
    for (let v = 0; v < n; v++) {
      const by = ((((v0 + MARGE + v) % nb) + nb) % nb) * nb;
      for (let u = 0; u < n; u++) {
        const i = (v + MARGE) * ne + u + MARGE;
        const d = (dansEau[i] ? versTerre[i] : -versEau[i]) * enCases;
        const strie = clamp((this.bruitEcume[by + (((u0 + MARGE + u) % nb) + nb) % nb] + 0.25) * 1.6, 0, 1);
        const o = (v * n + u) * 4 + 3;
        for (const [cle, valeur] of [['plage', bande(RIVAGE.plage, d)], ['hautFond', bande(RIVAGE.hautFond, d)], ['ecume', bande(RIVAGE.ecume, d) * strie]]) {
          const a = valeur * 255;
          rivage[cle].img.data[o] = a;
          if (a > 0) etendre(rivage[cle].e, u, v);
        }
      }
    }
    return rivage;
  }

  tamponTroncon(px) {
    if (!this.tampon || this.tampon.width !== px) {
      this.tampon = document.createElement('canvas');
      this.tampon.width = px; this.tampon.height = px;
    }
    return this.tampon;
  }

  /** Le rectangle monde (x, y, w, h) couvert par la nappe, période par période. */
  dessinerNappe(ctx, nappe, x, y, w, h) {
    const periode = nappe.n * nappe.texel;
    for (let py = y; py < y + h;) {
      const hy = Math.min(y + h, (Math.floor(py / periode) + 1) * periode) - py;
      for (let px = x; px < x + w;) {
        const wx = Math.min(x + w, (Math.floor(px / periode) + 1) * periode) - px;
        this.dessinerPlage(ctx, nappe, px, py, wx, hy);
        px += wx;
      }
      py += hy;
    }
  }

  /** Morceau de nappe couvrant le rectangle monde (x, y, w, h), dans une période. */
  dessinerPlage(ctx, nappe, x, y, w, h) {
    const { canvas, n, marge, texel } = nappe;
    const sx = marge + (((x / texel) % n) + n) % n;
    const sy = marge + (((y / texel) % n) + n) % n;
    ctx.drawImage(canvas, sx, sy, w / texel, h / texel, x, y, w, h);
  }

  /** Le sol en tuiles de couleur : le temps que les nappes arrivent. */
  drawTerrainTuiles(view) {
    const ctx = this.ctx;
    const map = this.world.map;
    for (let ty = view.y0; ty <= view.y1; ty++) {
      const row = ty * map.w;
      for (let tx = view.x0; tx <= view.x1; tx++) {
        const i = row + tx;
        if (!this.world.fog.explored[i]) continue;
        const variants = this.atlas[solEn(this.sol, map, i)];
        const img = variants[map.variant[i] % variants.length];
        ctx.drawImage(img, tx * TILE, ty * TILE);
      }
    }
  }

  /**
   * Les ressources posées à plat : les carcasses, et le dessin au code des
   * arbres, buissons et gisements dont l'atlas manque. Illustrés, ils sont plus
   * hauts que leur case et entrent dans l'ordre du peintre avec les unités et
   * les bâtiments (voir drawEntities).
   */
  drawResources(view) {
    const map = this.world.map;
    const arbres = spriteDe('arbres'), buissons = spriteDe('baies'), or = spriteDe('or');
    for (const res of map.resources.values()) {
      if (res.tx < view.x0 || res.tx > view.x1 || res.ty < view.y0 || res.ty > view.y1) continue;
      if (!this.world.fog.explored[res.ty * map.w + res.tx]) continue;
      const x = res.tx * TILE, y = res.ty * TILE;
      if (res.gibier) { this.dessinerCarcasse(res); continue; }
      if (res.type === 'gold' && !or) this.drawGold(x, y, res);
      else if (res.type === 'wood' && !arbres) this.drawTree(x, y, res);
      else if (res.type === 'food' && !buissons) this.drawBush(x, y, res);
    }
  }

  /**
   * Le décor cuit dans un tronçon de sol : galets, fleurs, nénuphars, herbe —
   * tout ce qui est assez bas pour vivre sous les unités. Peint une fois par
   * tronçon, puis gardé avec lui : rien à payer à chaque image. Une pièce à
   * cheval sur deux tronçons est peinte dans les deux, aux mêmes coordonnées
   * monde — les recouvrements restent identiques.
   */
  cuireDecor(ctx, X0, Y0, cote) {
    const atlas = this.decorActif ? spriteDe('decor') : null;
    if (!atlas || !atlas.pret) return;
    const map = this.world.map, decor = this.decorCarte();
    const y0 = Math.max(0, Math.floor(Y0 / TILE) - 2), y1 = Math.min(map.h - 1, Math.floor((Y0 + cote) / TILE) + 1);
    for (let ty = y0; ty <= y1; ty++) {
      for (const d of decor.cuits[ty]) {
        if (d.cache) continue;   // sous un bâtiment, ou de l'herbe dans une cour de sable (filtrerDecor)
        const w = d.piece.w * ECHELLE_DECOR * d.echelle, h = d.piece.h * ECHELLE_DECOR * d.echelle;
        if (d.x + w / 2 < X0 || d.x - w / 2 > X0 + cote || d.y < Y0 || d.y - h > Y0 + cote) continue;
        this.dessinerPiece(d, atlas, ctx);
      }
    }
  }

  /**
   * Le décor de la carte — rivages et campagne — se déduit de la carte et du
   * sol de base de la partie (decor.js) : dans le désert d'un départ solarien,
   * galets, agaves et touffes sèches au lieu des fleurs des prés. Il est planté
   * une fois par carte et gardé ; ce que les bâtiments en cachent est tenu à
   * jour par suivreSol.
   */
  decorCarte() {
    const map = this.world.map;
    if (this.solCarte !== map) this.suivreSol();   // (qui plante le décor)
    if (!this.decor || this.decor.carte !== map) {
      this.decor = planterDecor(map, solPlein(this.solBase.sol, map));
      this.decor.carte = map;
    }
    return this.decor;
  }

  /** Une pièce du décor, posée par son pied ; en miroir une fois sur deux. */
  dessinerPiece(d, sprite, ctx = this.ctx) {
    const p = d.piece;
    const w = p.w * ECHELLE_DECOR * d.echelle, h = p.h * ECHELLE_DECOR * d.echelle;
    if (d.miroir) {
      ctx.save();
      ctx.translate(d.x * 2, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite.variantes.bleu, p.x, p.y, p.w, p.h, d.x - w / 2, d.y - h, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(sprite.variantes.bleu, p.x, p.y, p.w, p.h, d.x - w / 2, d.y - h, w, h);
    }
  }

  /**
   * Une carcasse : l'animal de profil, couché sur le flanc, qui rapetisse à
   * mesure qu'on la dépèce.
   */
  dessinerCarcasse(res) {
    const ctx = this.ctx;
    const cx = res.tx * TILE + TILE / 2, cy = res.ty * TILE + TILE / 2;
    const sprite = spriteDe(res.gibier);
    const ratio = res.max ? res.amount / res.max : 1;
    if (!sprite) {
      ctx.fillStyle = '#7a4a3a';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 11 * (0.6 + 0.4 * ratio), 6, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const { cellW, cellH, hauteurMonde } = sprite.def;
    const h = hauteurMonde * (0.7 + 0.3 * ratio), w = (cellW / cellH) * h;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(res.variant % 2 ? Math.PI / 2 : -Math.PI / 2);
    ctx.globalAlpha = 0.92;
    // Le profil, lu dans la table des rangées de l'atlas (secteur est) : un
    // numéro de rangée fixe désignait la vue de trois quarts depuis que les
    // planches des animaux ont cinq rangées.
    const ligne = sprite.def.lignes ? sprite.def.lignes[caseDirection(0, sprite.def.cases)] : 1;
    ctx.drawImage(sprite.variantes.bleu, 0, ligne * cellH, cellW, cellH, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  /**
   * Un arbre ou un buisson illustré, posé au bas de sa case. Le gisement qui
   * s'épuise rapetisse un peu : de loin, on voit ce qu'il reste à prendre.
   */
  dessinerVegetation(res, sprite) {
    const { cellW, cellH, hauteurMonde } = sprite.def;
    const ratio = res.max ? res.amount / res.max : 1;
    // Une pointe de variation de taille par case, figée par la variante : sept
    // rochers d'or identiques côte à côte feraient une frise.
    const jitter = 0.92 + 0.16 * ((res.variant * 37) % 8) / 7;
    const k = (0.8 + 0.2 * Math.min(1, ratio)) * jitter;
    const h = hauteurMonde * k, w = (cellW / cellH) * h;
    const cx = res.tx * TILE + TILE / 2, base = (res.ty + 1) * TILE + 3;
    // Un arbre du désert solarien : ni sapin ni saule (caseArbre). Seule l'image change.
    const zone = res.type === 'wood' && this.solBase ? this.solBase.zone[res.ty * this.world.map.w + res.tx] : 0;
    const colonne = res.type === 'wood' ? caseArbre(res.variant, zone, sprite.def.cases) : res.variant % sprite.def.cases;
    this.ctx.drawImage(sprite.variantes.bleu, colonne * cellW, 0, cellW, cellH, cx - w / 2, base - h, w, h);
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
      if (e.dead || e.garrisonedIn) continue;   // à l'abri : invisible sur la carte
      const pad = e.kind === 'building' ? e.size * TILE : TILE * 2;
      if (e.x < view.left - pad || e.x > view.right + pad
          || e.y < view.top - pad || e.y > view.bottom + pad) continue;
      if (e.playerIndex !== this.world.humanIndex && !this.isEntityVisible(e)) continue;
      list.push(e);
    }
    // Arbres et buissons illustrés : plus hauts que leur case, ils se classent
    // avec le reste — une unité qui passe derrière un arbre passe derrière.
    const arbres = spriteDe('arbres'), buissons = spriteDe('baies'), or = spriteDe('or');
    if (arbres || buissons || or) {
      const map = this.world.map;
      const explored = this.world.fog.explored;
      for (const res of map.resources.values()) {
        if (res.tx < view.x0 - 1 || res.tx > view.x1 + 1 || res.ty < view.y0 - 2 || res.ty > view.y1 + 1) continue;
        if (!explored[res.ty * map.w + res.tx] || res.gibier) continue;
        const sprite = res.type === 'wood' ? arbres : res.type === 'food' ? buissons : res.type === 'gold' ? or : null;
        if (sprite) list.push({ kind: 'vegetation', res, sprite, ty: res.ty });
      }
    }
    // Le décor debout (rochers, touffes, roseaux, buissons) : classé au pied
    // de chaque pièce, comme un arbre — une unité qui passe derrière un rocher
    // passe derrière. Un roseau de deux cases de haut oblige à regarder
    // quelques lignes sous le bord bas de l'écran.
    const atlas = this.decorActif ? spriteDe('decor') : null;
    if (atlas && atlas.pret) {
      const map = this.world.map, explored = this.world.fog.explored;
      const decor = this.decorCarte();
      // Rien sur un bâtiment, une ferme, un chantier ni leur parvis, et la
      // place du départ reste nette : le drapeau `cache` de chaque pièce est
      // tenu par suivreSol (filtrerDecor), pas recalculé ici.
      for (let ty = Math.max(0, view.y0 - 1); ty <= Math.min(map.h - 1, view.y1 + 3); ty++) {
        for (const d of decor.debout[ty]) {
          if (d.cache || d.tx < view.x0 - 3 || d.tx > view.x1 + 3) continue;
          if (!explored[d.ty * map.w + d.tx]) continue;
          list.push({ kind: 'decor', d, sprite: atlas });
        }
      }
    }
    // Ordre du peintre. Un bâtiment est classé à son bord NORD, pas à son
    // centre : son illustration déborde de l'emprise, et une unité qui longe
    // le mur doit passer devant, jamais dessous. Ce qui est derrière (plus au
    // nord) reste caché par les toits — c'est l'effet voulu.
    // Un arbre se classe au pied de sa case, un peu avant une unité qui s'y
    // tiendrait devant : celle-ci est dessinée par-dessus le tronc.
    this.preparer3d(list);
    const rang = (e) => (e.kind === 'building' ? e.ty * TILE + 8 : e.kind === 'vegetation' ? (e.ty + 1) * TILE - 6 : e.kind === 'decor' ? e.d.y - 1 : e.y);
    list.sort((a, b) => rang(a) - rang(b));
    for (const e of list) {
      if (e.kind === 'building') this.drawBuilding(e);
      else if (e.kind === 'vegetation') this.dessinerVegetation(e.res, e.sprite);
      else if (e.kind === 'decor') this.dessinerPiece(e.d, e.sprite);
      else this.drawUnit(e);
    }
  }

  /**
   * Style « 3D en direct » : les unités au modèle 3D sont toutes rendues d'un
   * coup, avant l'ordre du peintre — chacune dans sa case d'un canevas WebGL
   * hors écran —, puis chacune y reprend sa case au moment d'être dessinée.
   * Leur état d'animation est calculé ici une fois pour l'image (il avance
   * la foulée) et gardé pour drawUnit.
   */
  preparer3d(list) {
    if (!rendu3dDirect()) {
      if (this.rendu3d) { this.rendu3d.liberer(); this.rendu3d = null; }
      return;
    }
    const unites = [];
    let def = null;
    for (const e of list) {
      if (e.kind !== 'unit') continue;
      const sprite = spriteDe(e.type, e.player.civ);
      if (!sprite || !sprite.def.modele3d) continue;
      def = sprite.def;
      unites.push(e);
    }
    if (!def) return;
    if (!this.rendu3d) this.rendu3d = new Rendu3D(def);
    if (!this.rendu3d.pret) return;   // en attendant : l'atlas précalculé du même modèle
    const anims = unites.map((u) => {
      const anim = this.unitAnim(u);
      u._anim3d = { image: this.frame, anim };
      return anim;
    });
    const taille = Math.max(32, Math.min(256, Math.round((def.hauteurMonde * this.camera.zoom * this.dpr) / 8) * 8));
    this.rendu3d.preparer(unites, anims, taille, this.horloge);
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

    const sprite = spriteDe(b.type, b.player.civ);
    if (sprite) {
      const haut = this.dessinerBatimentSprite(b, sprite, w, x, y);
      this.decorerBatiment(b, w, x, y, color, haut);
      return;
    }

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
      this.dessinerIcone(b.def.icon, b.x, b.y + 2, w * 0.46, 'rgba(28,36,48,0.85)');
    }
    ctx.globalAlpha = 1;
    this.decorerBatiment(b, w, x, y, color);
  }

  /**
   * Bâtiment illustré : l'image, dessinée sur `largeurMonde` pixels, est posée
   * sur l'emprise par sa ligne de sol — le bas du parvis sur le bord sud — et
   * monte au-dessus ; le tri du peintre fait le reste. En chantier, elle sort
   * de terre : on ne la révèle que jusqu'à la hauteur atteinte.
   */
  dessinerBatimentSprite(b, sprite, w, x, y) {
    const ctx = this.ctx;
    const { cellW, cellH, largeurMonde, sol } = sprite.def;
    const source = imagePourJoueur(sprite, b.playerIndex);
    const dw = largeurMonde;
    const dh = (cellH / cellW) * dw;
    const dx = this.calerX(b.x - dw / 2);
    const dy = this.calerY(y + w - dh * (sol ?? 1));
    if (!b.complete) {
      const part = Math.max(0.12, b.progressRatio);
      ctx.save();
      ctx.beginPath();
      ctx.rect(dx, dy + dh * (1 - part), dw, dh * part);
      ctx.clip();
      ctx.globalAlpha = 0.85;
      ctx.drawImage(source, 0, 0, cellW, cellH, dx, dy, dw, dh);
      ctx.restore();
      ctx.globalAlpha = 1;
      return dy + dh * (1 - part);
    }
    ctx.drawImage(source, 0, 0, cellW, cellH, dx, dy, dw, dh);
    return dy;   // le haut de l'image : la barre de vie se pose au-dessus des toits
  }

  /**
   * Ce que tout bâtiment porte, illustré ou non : chantier, vie, garnison,
   * sélection. `haut` est le sommet dessiné — celui de l'emprise pour un
   * bâtiment tracé au code, celui des toits pour une illustration.
   */
  decorerBatiment(b, w, x, y, color, haut = y) {
    const ctx = this.ctx;
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
      // Nombre d'ouvriers sur le chantier : sans ça, on ne voit pas qu'on
      // peut en mettre plusieurs pour aller plus vite.
      const ouvriers = b.assignedBuilders || b.builderCount;
      if (ouvriers > 0 && this.camera.zoom > 0.45) {
        ctx.fillStyle = 'rgba(12,18,26,0.8)';
        ctx.beginPath();
        ctx.arc(x + w - 6, y + w + 4, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = color.light;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(ouvriers), x + w - 6, y + w + 4);
      }
    } else if (b.hp < b.maxHp) {
      this.drawHealthBar(b.x, haut - 6, w * 0.8, b.hp / b.maxHp);
      if (b.hp / b.maxHp < 0.4) {
        ctx.fillStyle = 'rgba(30,30,30,0.35)';
        ctx.beginPath();
        ctx.arc(b.x + Math.sin(this.frame / 22) * 4, haut - 12, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Garnison : un fanion indique combien d'unités sont à l'abri.
    if (b.garrison && b.garrison.length > 0 && this.camera.zoom > 0.4) {
      const bx = x + w - 9, by = y + 2;
      ctx.fillStyle = 'rgba(12,18,26,0.85)';
      ctx.beginPath();
      ctx.arc(bx, by + 6, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color.light;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(b.garrison.length), bx, by + 6);
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
    // Le corps monte à chaque appui et se balance ; l'ombre, elle, reste au sol.
    // (Une unité rendue en 3D a déjà son état pour cette image : voir preparer3d.)
    const anim = u._anim3d && u._anim3d.image === this.frame ? u._anim3d.anim : this.unitAnim(u);
    const x = u.x + anim.marche * r * 0.09;
    const y = u.y - Math.abs(anim.marche) * r * 0.18;

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(u.x, u.y + r * 0.55, r * 0.75, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    if (u.selected) {
      ctx.strokeStyle = u.playerIndex === this.world.humanIndex ? '#ffffff' : '#ff8080';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(u.x, u.y + r * 0.5, r * 0.95, r * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Le bélier dessiné au code ne sert plus qu'en attendant son modèle 3D (ou sans WebGL).
    if (u.type === 'ram' && !spriteDe('ram', u.player.civ)) {
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

    // Illustration de personnage, si cette unité en a une. Elle remplace le
    // corps dessiné au code, mais pas le reste : ombre, cercle de sélection,
    // barre de vie et particules valent pour tout le monde.
    const sprite = spriteDe(u.type, u.player.civ);
    if (sprite) {
      // Une marche dessinée a son propre balancement : y ajouter le nôtre
      // donnerait deux rythmes superposés.
      const anime = (sprite.def.images || 1) > 1;
      this.dessinerSprite(u, sprite, anime ? u.x : x, anime ? u.y : y, anim);
      // Une troupe cuite est deux fois plus haute que les anciennes : la
      // pastille de charge et la barre de vie lui barraient le torse. Elles
      // passent au-dessus de sa tête, sans le balancement de la marche codée.
      let sommet = null;
      if (sprite.def.cuit3d) {
        const c = sprite.def.clips.repos;
        sommet = u.y + r * 0.45 - c.hauteurMonde * (c.ancreY / c.cellH);
      }
      if (u.isVillager && u.carry.amount > 0.5) {
        if (sommet === null) this.dessinerCharge(u, x, y, r);
        else this.dessinerCharge(u, this.calerX(u.x), this.calerY(sommet) + 2 + r * 1.1, r);
      }
      if (u.hp < u.maxHp) this.drawHealthBar(u.x, sommet === null ? u.y - r * 2.6 : sommet - 5, r * 1.7, u.hp / u.maxHp);
      this.eclatsDeTravail(u, x, y, r);
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

    // Arme : elle indique la direction au repos, et s'abat pendant le coup.
    // Le geste part en arrière puis balaie vers l'avant — à vingt pixels, c'est
    // ce mouvement-là qu'on lit, pas le détail de la lame.
    const frappe = anim.coup >= 0;
    const elan = frappe ? -0.95 + 1.75 * (1 - (1 - anim.coup) ** 2) : 0;
    const armeAngle = u.facing + elan;
    const fx = Math.cos(u.facing), fy = Math.sin(u.facing);
    const ax = Math.cos(armeAngle), ay = Math.sin(armeAngle);
    const portee = r * (frappe ? 1.45 : 1.25);
    ctx.strokeStyle = u.isVillager ? '#c9a441' : '#e8e8e8';
    ctx.lineWidth = frappe ? 2.6 : 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + ax * r * 0.5, y + ay * r * 0.5 - r * 0.2);
    ctx.lineTo(x + ax * portee, y + ay * portee - r * 0.2);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Traînée du coup, sur la première moitié du geste seulement.
    if (frappe && anim.coup < 0.55) {
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - anim.coup / 0.55)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - r * 0.2, portee, armeAngle - 0.9, armeAngle + 0.15);
      ctx.stroke();
    }

    if (u.def.projectile && !u.def.splash) {   // tout tireur à flèches, à pied ou monté
      ctx.strokeStyle = '#d9c9a3';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x + fx * r * 0.9, y + fy * r * 0.9 - r * 0.2, r * 0.5, u.facing - 1.1, u.facing + 1.1);
      ctx.stroke();
    }

    if (u.isVillager && u.carry.amount > 0.5) this.dessinerCharge(u, x, y, r);
    this.eclatsDeTravail(u, x, y, r);
    if (u.hp < u.maxHp) this.drawHealthBar(x, y - r * 1.9, r * 1.7, u.hp / u.maxHp);
  }

  /**
   * Personnage illustré : une case de l'atlas selon l'orientation, posée sur
   * ses pieds. Le sprite est dessiné plus grand que l'emprise de l'unité,
   * comme dans AoE — sinon un chevalier de dix-huit pixels ne se lirait pas.
   */
  dessinerSprite(u, sprite, x, y, anim) {
    if (sprite.def.cuit3d) { this.dessinerModele3D(u, sprite, x, y, anim); return; }
    const ctx = this.ctx;
    const { cellW, cellH, cases, hauteurMonde, ancreY, pixel } = sprite.def;
    let source = imagePourJoueur(sprite, u.playerIndex);
    let sx, sy, miroir = false;
    let largeurSource = cellW, hauteurSource = cellH;
    const case3d = sprite.def.modele3d && this.rendu3d ? this.rendu3d.cellule(u) : null;
    const choix = case3d ? null
      : sprite.def.poses && u.isVillager ? this.poseDe(u, sprite.def, anim)
        : sprite.def.poses8 ? this.pose8De(u, sprite.def, anim) : null;
    if (case3d) {
      // Rendue en 3D pour cette image : même cadrage qu'une case de l'atlas.
      source = this.rendu3d.canvas;
      sx = case3d.sx; sy = case3d.sy;
      largeurSource = hauteurSource = case3d.taille;
    } else if (choix && choix.pose.lignes) {
      // Pose dessinée dans les huit directions (un modèle 3D rendu à l'avance) :
      // la rangée suit la direction, pas de miroir ; le coup suit la frappe.
      const { pose } = choix;
      const k = choix.parCoup
        ? Math.min(pose.images - 1, Math.floor(anim.coup * pose.images))
        : Math.floor(this.horloge * pose.cadence + (u.id % 7) * 0.53) % pose.images;
      sx = k * cellW;
      sy = pose.lignes[caseDirection(u.facing, cases)] * cellH;
    } else if (choix) {
      const { pose } = choix;
      // Une pose de travail se cadence sur l'horloge, décalée par unité pour
      // que dix bûcherons ne frappent pas en chœur ; le port suit la distance.
      // `suite` : les images jouées, quand certaines de la rangée sont à écarter.
      const n = pose.suite ? pose.suite.length : pose.images;
      const k = choix.parDistance
        ? Math.floor(((anim.distance || 0) / (sprite.def.cycle || 40)) * n) % n
        : Math.floor(this.horloge * pose.cadence + (u.id % 7) * 0.53) % n;
      const image = pose.suite ? pose.suite[k] : k;
      ({ sx, sy } = poseSource(sprite.def, pose, image));
      miroir = choix.miroir;
    } else {
      const k = caseDirection(u.facing, cases);
      const ligne = sprite.def.lignes ? sprite.def.lignes[k] : k;
      const image = imageDeMarche(sprite.def, anim.distance || 0, anim.avance, ligne);
      ({ sx, sy } = cadreSource(sprite.def, k, image));
      miroir = !!(sprite.def.miroirs && sprite.def.miroirs[k]);   // l'ouest est l'est retourné
    }
    this.dessinerSocle(u, x, y);

    const h = hauteurMonde;
    const w = (cellW / cellH) * h;
    // Le coup se lit par une fente en avant : l'épée est peinte dans l'image,
    // on ne peut pas la faire tourner, mais le corps, lui, peut avancer. Un
    // modèle 3D a son propre coup d'épée : ni fente ni traînée en plus.
    const coupDessine = !!(sprite.def.poses8 && sprite.def.poses8.attaque);
    const fente = anim.coup >= 0 && !coupDessine ? Math.sin(anim.coup * Math.PI) * h * 0.14 : 0;
    const px = x + Math.cos(u.facing) * fente;
    const py = y + Math.sin(u.facing) * fente;
    // L'ancre est la ligne des pieds dans la case, pas son bas : certaines
    // illustrations laissent du vide dessous.
    const pieds = (ancreY || cellH) / cellH;
    if (pixel) ctx.imageSmoothingEnabled = false;   // du pixel art ne s'interpole pas
    if (miroir) { ctx.save(); ctx.translate(px * 2, 0); ctx.scale(-1, 1); }   // x devient 2·px − x : même place, retourné
    ctx.drawImage(source, sx, sy, largeurSource, hauteurSource,
      px - w / 2, py + u.radius * 0.45 - h * pieds, w, h);
    if (miroir) ctx.restore();
    if (pixel) ctx.imageSmoothingEnabled = true;

    if (anim.coup >= 0 && anim.coup < 0.55 && !coupDessine) {
      const p = anim.coup / 0.55;
      ctx.strokeStyle = `rgba(255,255,255,${0.45 * (1 - p)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py - u.radius * 0.4, u.radius * 1.6, u.facing - 0.9, u.facing + 0.3);
      ctx.stroke();
    }
  }

  /**
   * Pose d'un soldat dont l'atlas porte ses poses dans les huit directions (un
   * modèle 3D rendu à l'avance) : le coup d'épée pendant la frappe, le repos à
   * l'arrêt, la marche sinon (null).
   */
  pose8De(u, def, anim) {
    const P = def.poses8;
    if (anim.coup >= 0 && P.attaque) return { pose: P.attaque, parCoup: true };
    if (anim.avance || !P.repos) return null;
    return { pose: P.repos };
  }

  /**
   * Socle aux couleurs du joueur : de loin, une armure reste une tache
   * sombre, et l'appartenance doit se lire d'un coup d'œil. C'est la
   * solution d'AoE, et elle vaut mieux qu'un personnage repeint en entier.
   * Un animal sauvage n'a pas de camp : pas de socle.
   */
  dessinerSocle(u, x, y) {
    const ctx = this.ctx;
    const sol = y + u.radius * 0.45;
    if (ESSAI_RENDU.ombre > 0) {
      // Ombre portée, du même côté que celle des bâtiments dessinés (en bas à droite).
      const r = u.radius;
      const cx = x + r * 0.3, cy = sol + r * 0.02;
      const d = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.05);
      d.addColorStop(0, `rgba(10, 16, 8, ${ESSAI_RENDU.ombre})`);
      d.addColorStop(0.6, `rgba(10, 16, 8, ${ESSAI_RENDU.ombre * 0.8})`);
      d.addColorStop(1, 'rgba(10, 16, 8, 0)');
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(1, 0.42); ctx.translate(-cx, -cy);
      ctx.fillStyle = d;
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (u.isAnimal && u.playerIndex < 0) return;
    if (ESSAI_RENDU.socle === 'anneau') {
      ctx.strokeStyle = u.player.color.main;
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(x, sol - 1, u.radius * 0.78, u.radius * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = u.player.color.main;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(x, sol - 1, u.radius * 0.78, u.radius * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = u.player.color.light;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  /**
   * Personnage cuit depuis son modèle 3D (voir modele3d.js) : une animation
   * par état, chacune dans son atlas, en huit directions — un geste de travail
   * se tourne vers sa cible au lieu d'être retourné en miroir. L'attaque passe
   * avant tout ; en chemin, la marche (le fagot sur l'épaule si l'on rapporte
   * du bois) ; au travail, le geste de la tâche ; à l'arrêt, un coup encaissé
   * fait broncher, sinon la garde ou le repos. L'arme bouge vraiment : ni
   * fente simulée ni traînée.
   */
  dessinerModele3D(u, sprite, x, y, anim) {
    const { clips } = sprite.def;
    // `image` est une position dans l'animation, fraction d'image comprise :
    // poserImage3D en dessine l'image la plus proche.
    let clip = null, image = 0, angle = u.facing;
    const cible = this.cibleDe(u);
    const versCible = () => (cible ? Math.atan2(cible.y - u.y, cible.x - u.x) : u.facing);
    const parHorloge = (c) => positionImage(c, this.horloge + (u.id % 7) * 0.37 * c.duree);
    const parDistance = (c) => (((anim.distance || 0) / (c.cycle || sprite.def.cycle || 40)) % 1) * c.images;
    // L'attaque tient dans l'intervalle entre deux coups, jamais au-delà.
    const dureeCoup = Math.min(clips.attaque.duree, (u.def.attackSpeed || 2) * 0.9);
    // Un tir à l'arc a son instant de lâcher (`lacher`, en secondes) : c'est
    // là que le jeu lance la flèche. L'archer bande donc pendant la fin de sa
    // recharge, lâche avec le jeu, puis finit son geste.
    let tCoup = -1;
    const { lacher } = clips.attaque;
    if (lacher != null) {
      const cadence = u.def.attackSpeed || 2;
      if (anim.depuisCoup >= 0 && anim.depuisCoup < clips.attaque.duree - lacher) tCoup = lacher + anim.depuisCoup;
      else if (u.state === STATE.ATTACK && cible && anim.depuisCoup >= 0 && cadence - anim.depuisCoup <= lacher) {
        tCoup = lacher - (cadence - anim.depuisCoup);
      }
    } else if (anim.depuisCoup >= 0 && anim.depuisCoup < dureeCoup) {
      tCoup = (anim.depuisCoup / dureeCoup) * clips.attaque.duree;
    }
    if (tCoup >= 0) {
      clip = clips.attaque;
      image = positionImage(clip, tCoup);
      angle = versCible();
    } else if (anim.avance) {
      clip = clips.porter && u.isVillager && u.carry.amount > 0.5 && u.carry.type === 'wood' ? clips.porter : clips.marche;
      image = parDistance(clip);
    } else if (sprite.def.poses && u.isVillager && u.state !== STATE.ATTACK) {
      // Entre deux coups de poing, pas de marteau : la garde, tournée vers l'adversaire.
      const choix = this.poseDe(u, sprite.def, anim);
      if (choix && choix.pose !== clips.repos) {
        clip = choix.pose;
        image = choix.parDistance ? parDistance(clip) : parHorloge(clip);
        if (clip !== clips.porter) angle = versCible();
      }
    }
    if (!clip) {
      if (u.state === STATE.ATTACK && cible) angle = versCible();
      const recu = this.world.time + (this.sousPas || 0) - u.lastHitAt;
      if (recu >= 0 && recu < clips.touche.duree) {
        clip = clips.touche;
        image = positionImage(clip, recu);
      } else {
        // Décalé par unité : dix soldats au repos ne respirent pas en chœur.
        clip = clips.repos;
        image = parHorloge(clip);
      }
    }
    this.dessinerSocle(u, x, y);
    this.poserImage3D(clip, u.playerIndex, this.vueDe(u, angle), image, x, y + u.radius * 0.45);
  }

  /**
   * La vue (0 à 7) sous laquelle montrer une troupe dont le cap est `angle`.
   * Le cap de la simulation est recalculé vingt fois par seconde, poussée des
   * voisines comprise, sans lissage : près de la limite entre deux vues, une
   * troupe en groupe sautait de l'une à l'autre à chaque pas — deux
   * silhouettes à 45° d'écart que l'œil fondait en une image double. On
   * lisse donc le cap AFFICHÉ (un dixième de seconde), et l'on ne change de
   * vue que s'il a franchi la limite d'une dizaine de degrés. Une troupe
   * restée hors champ repart de son cap du moment.
   */
  vueDe(u, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const vue = u._vue3d;
    if (!vue || this.horloge - vue.t > 0.25) {
      const k = caseDirection(angle, 8);
      u._vue3d = { x: c, y: s, k, t: this.horloge };
      return k;
    }
    const a = 1 - Math.exp(-Math.max(0, this.horloge - vue.t) / 0.09);
    vue.x += (c - vue.x) * a; vue.y += (s - vue.y) * a; vue.t = this.horloge;
    // Demi-tour : la moyenne de deux caps opposés ne pointe nulle part. On
    // repart alors du cap du moment — sans quoi le lissage, en se relevant,
    // repassait par une diagonale déjà quittée.
    if (Math.hypot(vue.x, vue.y) <= 0.2) { vue.x = c; vue.y = s; }
    const lisse = Math.atan2(vue.y, vue.x);
    let k = caseDirection(lisse, 8);
    if (k !== vue.k) {
      const centre = Math.PI / 2 - vue.k * (Math.PI / 4);
      const ecart = Math.abs(Math.atan2(Math.sin(lisse - centre), Math.cos(lisse - centre)));
      if (ecart < Math.PI / 8 + 0.16) k = vue.k;
    }
    vue.k = k;
    return k;
  }

  /** L'abscisse (l'ordonnée) monde la plus proche qui tombe sur un pixel entier de la toile. */
  calerX(x) { const t = this.versToile; return (Math.round(x * t.echelle + t.x) - t.x) / t.echelle; }
  calerY(y) { const t = this.versToile; return (Math.round(y * t.echelle + t.y) - t.y) / t.echelle; }

  /** Ce vers quoi l'unité travaille ou frappe : le gisement, sinon sa cible. */
  cibleDe(u) {
    if (u.resourceTile) return { x: u.resourceTile.tx * TILE + TILE / 2, y: u.resourceTile.ty * TILE + TILE / 2 };
    return u.target && !u.target.dead ? u.target : null;
  }

  /**
   * Une image d'un atlas cuit, posée par sa ligne des pieds en (x, sol).
   * `image` porte une fraction ; on dessine UNE image, la plus proche. (Un
   * temps, la suivante était fondue par-dessus : le personnage était alors
   * en permanence la superposition de deux poses — bras et jambes dédoublés
   * en marche, contour adouci même au repos. Sur un téléphone, ce voile se
   * voyait plus que le pas d'une image à l'autre.) Une boucle enchaîne sa
   * dernière image sur la première ; un geste (coup, chute) s'arrête sur la
   * dernière.
   */
  poserImage3D(clip, joueur, k, image, x, sol) {
    const { cellH, ancreY, hauteurMonde, images, colonnes } = clip;
    // (e vaut exactement un demi en cuisson normale : deux pixels d'atlas par pixel monde.)
    const h = hauteurMonde, e = h / cellH;
    const source = joueur === 0 ? clip.variantes.bleu : clip.variantes.rouge;
    const ctx = this.ctx;
    // Cinq directions cuites : nord-ouest, ouest et sud-ouest sont le miroir
    // du nord-est, de l'est et du sud-est, retournées autour de l'ancre.
    const miroir = k >= (clip.directions || 8);
    if (miroir) k = 8 - k;
    // L'atlas a une colonne par direction, chacune à sa largeur (voir
    // recadrer). C'est l'ANCRE qu'on pose sur un pixel entier de la toile :
    // au zoom de départ une case d'atlas couvre exactement ses pixels d'écran,
    // rien n'est rééchantillonné, et les pieds ne bougent pas quand la troupe
    // change de direction.
    const col = colonnes[k];
    const axe = this.calerX(x);
    const dx = axe - col.ancre * e, dy = this.calerY(sol - h * (ancreY / cellH));
    let i = Math.round(image);
    if (clip.boucle) i = ((i % images) + images) % images;
    else i = clamp(i, 0, images - 1);
    if (miroir) {
      ctx.save();
      ctx.translate(axe, 0); ctx.scale(-1, 1); ctx.translate(-axe, 0);
    }
    ctx.drawImage(source, col.x, i * cellH, col.l, cellH, dx, dy, col.l * e, h);
    if (miroir) ctx.restore();
  }

  /**
   * Les morts des unités en 3D : la chute, puis le corps à terre qui
   * s'efface. Sous les vivants — on marche à côté, pas dessous.
   */
  dessinerCadavres() {
    const ctx = this.ctx;
    for (const fx of this.world.effects) {
      if (fx.kind !== 'cadavre' || !this.world.isVisible(fx.x, fx.y)) continue;
      const sprite = spriteDe(fx.type, this.world.players[fx.joueur]?.civ);
      if (!sprite || !sprite.def.cuit3d) continue;
      const clip = sprite.def.clips.mort;
      const ecoule = fx.max - fx.life + (this.sousPas || 0);
      const image = positionImage(clip, ecoule);
      ctx.globalAlpha = Math.min(1, fx.life / 1.5);
      // Le corps tombe dans la vue où la troupe était montrée (voir vueDe), pas un quart de tour à côté.
      this.poserImage3D(clip, fx.joueur, fx.vue >= 0 ? fx.vue : caseDirection(fx.facing, 8), image, fx.x, fx.y + (UNIT_TYPES[fx.type]?.radius || 9) * 0.45);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * La pose d'un villageois illustré, ou null pour la marche ordinaire. Au
   * travail il cueille (nourriture) ou frappe (bois, or, chantier, combat),
   * tourné vers sa cible ; en chemin avec sa charge il la porte ; à l'arrêt il
   * se repose. Les poses sont dessinées d'un seul côté (`sens`) : `miroir`
   * les retourne quand la cible est de l'autre.
   */
  poseDe(u, def, anim) {
    const P = def.poses;
    const charge = u.carry.amount > 0.5;
    const cote = (dx) => (dx >= 0 ? 1 : -1);
    // Le port montre un rondin, de profil : seulement pour du bois, et en
    // allant vers l'est ou l'ouest (le même secteur que la marche à quatre
    // orientations). De l'or ou des vivres, ou une marche vers le nord ou le
    // sud : la marche ordinaire, et la pastille de la charge.
    const porter = () => (u.carry.type === 'wood' && Math.abs(Math.cos(u.facing)) >= Math.SQRT1_2
      ? { pose: P.porter, parDistance: true, miroir: cote(Math.cos(u.facing)) !== P.porter.sens }
      : null);
    if (anim.avance) return charge ? porter() : null;
    let cible = u.target;
    if (u.resourceTile) cible = { x: u.resourceTile.tx * TILE + TILE / 2, y: u.resourceTile.ty * TILE + TILE / 2 };
    const dx = cible ? cible.x - u.x : Math.cos(u.facing);
    if (u.state === STATE.GATHER && cible) {
      // L'outil suit le gisement : hache au bois, pioche à l'or, maillet sur
      // une carcasse, et la cueillette pour les baies et les fermes.
      const tache = villagerTask(u);
      const res = u.resourceTile ? this.world.map.resourceAt(u.resourceTile.tx, u.resourceTile.ty) : null;
      const pose = tache === 'wood' ? (P.bois || P.construire)
        : tache === 'gold' ? (P.or || P.construire)
        : tache === 'food' ? (res && res.gibier && P.viande ? P.viande : P.cueillir)
        : P.construire;
      return { pose, miroir: cote(dx) !== pose.sens };
    }
    if ((u.state === STATE.BUILD || u.state === STATE.ATTACK) && cible) return { pose: P.construire, miroir: cote(dx) !== P.construire.sens };
    return (charge && porter()) || { pose: P.repos, miroir: false };
  }

  /** Pastille de la ressource portée par un villageois. */
  dessinerCharge(u, x, y, r) {
    const ctx = this.ctx;
    const teintes = { food: '#e06a5b', wood: '#a0703f', gold: '#f2c14e' };
    ctx.fillStyle = teintes[u.carry.type] || '#fff';
    ctx.beginPath();
    ctx.arc(x + r * 0.7, y - r * 1.1, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /**
   * Éclats de travail : copeaux bruns sous la hache, poussière grise sur un
   * chantier, paillettes sur un filon. C'est ce qui donne le sentiment que
   * quelque chose se passe, bien plus qu'un personnage détaillé.
   *
   * `gatherAnim` est remis à 0,4 à CHAQUE tick de récolte : il ne redescend
   * jamais, et guetter son front montant ne produisait qu'une seule volée de
   * copeaux, au tout premier coup de hache. On bat donc la mesure nous-mêmes.
   */
  eclatsDeTravail(u, x, y, r) {
    if (u.gatherAnim <= 0.05) { u._fxTimer = 0; return; }
    u._fxTimer = (u._fxTimer || 0) - (this.dt || 1 / 60);
    if (u._fxTimer > 0) return;
    u._fxTimer = 0.32;
    const teintes = { wood: '#b07a42', gold: '#f2c14e', food: '#d8695c' };
    const couleur = u.state === 'build' ? '#cbbfae' : (teintes[u.carry.type] || '#d8d2c4');
    const fx = Math.cos(u.facing), fy = Math.sin(u.facing);
    this.semerParticules(x + fx * r * 1.25, y + fy * r * 1.25 - r * 0.3, 3, {
      color: couleur, angle: u.facing + Math.PI, spread: 1.5, speed: 30, life: 0.42, size: 1.7,
    });
  }

  drawHealthBar(cx, y, width, ratio) {
    const ctx = this.ctx;
    // Calée sur les pixels de la toile, comme les troupes : des bords francs,
    // qui ne glissent pas au sous-pixel sur un personnage posé au pixel.
    const e = this.versToile.echelle;
    const entier = (v) => Math.max(1, Math.round(v * e)) / e;
    const l = entier(width), h = entier(3.5);
    const x0 = this.calerX(cx - l / 2), y0 = this.calerY(y);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x0, y0, l, h);
    ctx.fillStyle = ratio > 0.55 ? '#63c363' : ratio > 0.28 ? '#e0b93c' : '#d9534f';
    ctx.fillRect(x0, y0, Math.round(l * clamp(ratio, 0, 1) * e) / e, h);
  }

  drawProjectiles() {
    const ctx = this.ctx;
    ctx.strokeStyle = '#f5e6c8';
    ctx.lineWidth = 2;
    for (const p of this.world.projectiles) {
      if (!this.world.isVisible(p.x, p.y)) continue;
      if (p.sol) {
        // Un boulet : son ombre court au sol, lui monte en cloche au-dessus.
        const total = Math.max(1, dist(p.startX, p.startY, p.sol.x, p.sol.y));
        const t = clamp(p.travel / total, 0, 1);
        const haut = Math.sin(t * Math.PI) * Math.min(70, total * 0.32);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.ellipse(p.x, p.y, 4.5, 2.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5d564c';
        ctx.beginPath(); ctx.arc(p.x, p.y - 6 - haut, 4.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8d8578';
        ctx.beginPath(); ctx.arc(p.x - 1.2, p.y - 7.2 - haut, 1.6, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      const a = p.angle || 0;
      ctx.beginPath();
      ctx.moveTo(p.x - Math.cos(a) * 7, p.y - Math.sin(a) * 7);
      ctx.lineTo(p.x + Math.cos(a) * 5, p.y + Math.sin(a) * 5);
      ctx.stroke();
    }
  }

  /**
   * Pictogramme vectoriel centré sur (cx, cy). Les icônes sont dessinées dans
   * un carré de 512 unités : on ramène ce carré à la taille demandée.
   */
  dessinerIcone(cle, cx, cy, taille, couleur) {
    const path = iconePath(cle);
    if (!path) return;
    const ctx = this.ctx;
    const k = taille / ICON_BOX;
    ctx.save();
    ctx.translate(cx - taille / 2, cy - taille / 2);
    ctx.scale(k, k);
    ctx.fillStyle = couleur;
    ctx.fill(path);
    ctx.restore();
  }

  // --- Animation et particules ----------------------------------------------

  /**
   * Cadence d'une unité.
   * - La marche suit la DISTANCE parcourue, pas l'horloge : une unité lente
   *   balance lentement, et une unité bloquée contre un obstacle ne pédale pas
   *   sur place.
   * - Le coup suit le rechargement de l'arme : il part à la frappe et occupe
   *   le premier tiers du cycle, ce qui le rend lisible même à vingt pixels.
   */
  unitAnim(u) {
    const dt = this.dt || 1 / 60;
    // Une troupe qui n'a pas été dessinée depuis un moment (hors champ, sous le
    // brouillard, à l'abri) repart de sa position du moment : sinon tout le
    // trajet fait sans nous compte pour une seule image, et elle pédale sur place.
    if (u._animT === undefined || this.horloge - u._animT > 0.3) { u._ax = u.x; u._ay = u.y; u._vitesse = 0; u._avance = false; }
    u._animT = this.horloge;
    const px = u._ax === undefined ? u.x : u._ax;
    const py = u._ay === undefined ? u.y : u._ay;
    const pas = Math.hypot(u.x - px, u.y - py);
    u._ax = u.x; u._ay = u.y;

    // Vitesse LISSÉE, et non distance brute d'une image à l'autre : la
    // simulation avance vingt fois par seconde quand l'écran en affiche
    // soixante, si bien que deux images sur trois voient un déplacement nul,
    // suivi d'un bond. Cadencer la marche là-dessus faisait trembler les
    // personnages. La moyenne glissante rend le pas régulier, et l'amplitude
    // s'éteint d'elle-même quand l'unité ralentit.
    const instantanee = pas / dt;
    // (Lissage en temps, non en images : le même à trente images par seconde.)
    u._vitesse = (u._vitesse || 0) + (instantanee - (u._vitesse || 0)) * (1 - Math.exp(-dt / 0.11));
    // En marche au-delà de 13 px/s, à l'arrêt en deçà de 4 : une troupe arrêtée
    // que ses voisines repoussent (jusqu'à 12 px/s) ne passe plus du repos à
    // la marche et retour plusieurs fois par seconde — deux poses, parfois
    // deux directions, qui se mélangeaient à l'œil. L'engin le plus lent
    // avance à 17 px/s. (Vitesses de jeu ; à l'écran, elles suivent la vitesse
    // de la partie — Tranquille ×0,75, Blitz ×2.)
    const allure = this.vitesseJeu || 1;
    u._avance = u._vitesse > (u._avance ? 4 : 13) * allure;
    const force = clamp(u._vitesse / (u.def.speed * TILE * 0.5), 0, 1);
    const foulee = Math.max(2.5, u.radius * 0.5);
    u._walk = ((u._walk || 0) + (u._vitesse * dt) / foulee) % (Math.PI * 2);
    // Distance cumulée : c'est elle qui choisit l'image d'une marche animée.
    u._distance = (u._distance || 0) + u._vitesse * dt;

    const cadence = u.def.attackSpeed || 2;
    // Le rechargement n'avance qu'à chaque pas de simulation : on y ajoute le
    // temps écoulé depuis (`sousPas`), sinon le coup se joue à vingt images par seconde.
    const ecoule = cadence - u.attackCooldown + (u.attackCooldown > 0 ? this.sousPas || 0 : 0);
    const enCoup = u.attackCooldown > 0 && ecoule >= 0 && ecoule < cadence * 0.34;
    return {
      marche: Math.sin(u._walk) * force,
      coup: enCoup ? ecoule / (cadence * 0.34) : -1,
      // Secondes depuis le dernier coup porté (-1 : aucun en cours) — le
      // modèle 3D joue son attaque entière, plus longue que la fente.
      depuisCoup: u.attackCooldown > 0 && ecoule >= 0 ? ecoule : -1,
      distance: u._distance,
      avance: u._avance,
    };
  }

  /** Quelques éclats qui retombent : copeaux, poussière, étincelles. */
  semerParticules(x, y, n, opts = {}) {
    const { color = '#ddd', speed = 32, life = 0.5, gravity = 90, size = 1.5,
      spread = Math.PI * 2, angle = 0 } = opts;
    for (let i = 0; i < n; i++) {
      // `Math.random` est ici sans conséquence : rien de tout cela n'entre dans
      // la simulation, qui possède son propre générateur graine par graine.
      const a = angle + (Math.random() - 0.5) * spread;
      const v = speed * (0.45 + Math.random() * 0.9);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.35,
        life, max: life, color, gravity, size,
      });
    }
    // Plafond : sur une grande bataille, mieux vaut perdre les plus anciennes
    // que de faire tomber la fréquence d'images.
    if (this.particles.length > 320) this.particles.splice(0, this.particles.length - 320);
  }

  majParticules(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
    }
  }

  drawParticules() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const t = p.life / p.max;
      ctx.globalAlpha = Math.min(1, t * 1.6);
      ctx.fillStyle = p.color;
      const s = p.size * (0.6 + t * 0.6);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  /** Un mort ou un coup encaissé projette de la matière : on le voit de loin. */
  suivreEffets() {
    for (const fx of this.world.effects) {
      if (this.effetsVus.has(fx)) continue;
      this.effetsVus.add(fx);
      // Hors de vue, pas d'éclats : sous le brouillard ils trahiraient un combat.
      if (fx.kind !== 'ping' && !this.world.isVisible(fx.x, fx.y)) continue;
      if (fx.kind === 'death') {
        this.semerParticules(fx.x, fx.y - 4, 7, { color: fx.color || '#777', speed: 46, life: 0.75, size: 2 });
      } else if (fx.kind === 'hit') {
        this.semerParticules(fx.x, fx.y, 3, { color: '#ffe08a', speed: 40, life: 0.3, gravity: 30 });
      } else if (fx.kind === 'impact') {
        this.semerParticules(fx.x, fx.y, 14, { color: '#b9a98a', speed: 70, life: 0.6, size: 2.2 });
      } else if (fx.kind === 'soin') {
        this.semerParticules(fx.x, fx.y, 5, { color: '#8ff0c0', speed: 22, life: 0.7, gravity: -40, size: 1.8 });
      }
    }
  }

  drawEffects() {
    const ctx = this.ctx;
    for (const fx of this.world.effects) {
      // Comme les projectiles et les sons : un combat hors de vue ne se montre pas.
      if ((fx.kind === 'hit' || fx.kind === 'death' || fx.kind === 'impact' || fx.kind === 'soin') && !this.world.isVisible(fx.x, fx.y)) continue;
      const t = 1 - fx.life / fx.max;
      if (fx.kind === 'hit') {
        ctx.strokeStyle = `rgba(255,220,120,${1 - t})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 4 + t * 10, 0, Math.PI * 2);
        ctx.stroke();
      } else if (fx.kind === 'impact') {
        // Le boulet d'une catapulte : l'onde de son rayon, qui s'efface.
        ctx.strokeStyle = `rgba(230,200,150,${(1 - t) * 0.9})`;
        ctx.lineWidth = 3 * (1 - t) + 1;
        ctx.beginPath();
        ctx.ellipse(fx.x, fx.y, fx.rayon * (0.35 + t * 0.65), fx.rayon * (0.35 + t * 0.65) * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (fx.kind === 'soin') {
        // Un soin : une croix claire qui monte au-dessus du patient.
        const y = fx.y - 10 - t * 14;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = '#8ff0c0';
        ctx.fillRect(fx.x - 1.5, y - 5, 3, 10);
        ctx.fillRect(fx.x - 5, y - 1.5, 10, 3);
        ctx.globalAlpha = 1;
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
    this.dessinerIcone(def.icon, x + w / 2, y + w / 2, w * 0.5, 'rgba(20,28,38,0.85)');
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
    const t = this.versToile;   // la même transformation que le monde : le brouillard reste aligné
    ctx.save();
    ctx.setTransform(t.echelle, 0, 0, t.echelle, t.x, t.y);
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
      [TERRAIN.GRASS]: [74, 98, 23], [TERRAIN.GRASS_DARK]: [92, 97, 35],
      [TERRAIN.DIRT]: [128, 90, 58], [TERRAIN.SAND]: [161, 121, 84],
      [TERRAIN.WATER]: [15, 101, 132], [SOL_SABLE_OR]: [210, 165, 87],
    };
    for (let i = 0; i < map.w * map.h; i++) {
      const c = palette[solEn(this.sol, map, i)] || [90, 130, 70];   // le sol apparent : le désert d'un départ solarien s'y lit
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
      if (e.dead || e.garrisonedIn || (e.isAnimal && e.playerIndex < 0)) continue;
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
    this.reperesAlerte(ctx, scale);
  }

  /**
   * Alerte d'attaque : un repère rouge qui pulse sur la mini-carte là où l'on
   * est frappé, le temps de le trouver des yeux (`repere`, en secondes ; voir
   * FoyersAttaque, js/ui.js). Par-dessus tout le reste, cadre de la vue compris.
   */
  reperesAlerte(ctx, scale) {
    for (const a of this.alertes) {
      if (a.repere <= 0) continue;
      const x = a.x / TILE * scale, y = a.y / TILE * scale;
      const t = 1 - (a.repere % 1);          // une onde par seconde, qui s'élargit en s'effaçant
      ctx.strokeStyle = `rgba(255,59,48,${1 - t})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 5 + t * 13, 0, Math.PI * 2);
      ctx.stroke();
      // Le point lui-même, cerclé de blanc : ceux de l'adversaire sont rouges aussi.
      ctx.fillStyle = '#ff3b30';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
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
