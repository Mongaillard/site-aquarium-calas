// ---------------------------------------------------------------------------
// Sprites de personnage.
//
// Certaines unités ont une vraie illustration plutôt qu'un dessin au code. Tout
// type sans sprite garde son rendu procédural, et le jeu reste jouable si une
// image ne charge pas.
//
// Les huit cases d'un atlas tournent en partant du SUD (le personnage fait face
// au joueur) puis par l'EST. Sur une illustration, le sens se lit à la cape —
// elle est toujours dans le dos.
// ---------------------------------------------------------------------------

/**
 * `natif` dit de quelle couleur d'équipe est l'illustration d'origine ; l'autre
 * camp est recoloré au chargement. `ancreY` est la ligne des pieds dans la
 * case, et `pixel` coupe le lissage : agrandir du pixel art en l'interpolant le
 * transforme en bouillie.
 */
const batiment = (src, cellW, cellH, largeurMonde) => ({
  src, cellW, cellH, cases: 1, images: 1, largeurMonde, sol: 0.93, natif: 'bleu',
  recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
});

import { PIECES_DECOR } from './decor-pieces.js';

/** Les images 0..n-1 dans l'ordre : une rangée déjà remontée et interpolée. */
function suite(n) { return Array.from({ length: n }, (_, i) => i); }

const ATLAS = {
  militia: {
    src: 'assets/milicien-marche.webp',
    cellW: 51, cellH: 76, cases: 8, images: 8, cycle: 40,
    ancreY: 75, hauteurMonde: 44, natif: 'bleu',
    // L'armure est un acier bleuté : un échange de canaux la ferait virer au
    // cuivre. Seuls les bleus francs — bouclier et tabard — basculent.
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
  // Même unité, l'autre style : l'illustration peinte, sans marche animée.
  // Elle sert à comparer les deux partis pris sans relancer de partie.
  militiaPeint: {
    src: 'assets/chevalier.webp',
    cellW: 76, cellH: 104, cases: 8, images: 1,
    ancreY: 104, hauteurMonde: 40, natif: 'bleu',
    // Ici le bleu couvre une grande cape peinte, sans acier bleuté à épargner :
    // l'échange de canaux suffit et coûte moins cher qu'une conversion HSL.
    recolorage: 'echange',
  },
  // Bâtiments : une seule image, dessinée sur `largeurMonde` pixels et posée
  // sur l'emprise par sa ligne de sol (`sol`, fraction de la hauteur). Ils
  // débordent de leur emprise : un palais qui se lit de loin, un parvis qui
  // empiète sur les cases voisines — les unités marchent dessus. Le Centre-Ville
  // reste le plus grand ; les 3×3 sont dessinés sur 158 px, les 2×2 sur 108.
  // Dômes, toits et bannières sont bleu franc ; la pierre est blanche, l'eau
  // et les cristaux sont cyan (teinte < 200°) : seule la fenêtre du bleu bascule.
  towncenter: batiment('assets/centre-ville.webp', 344, 343, 172),
  barracks: batiment('assets/caserne.webp', 316, 315, 158),
  archery: batiment('assets/archerie.webp', 316, 313, 158),
  stable: batiment('assets/ecurie.webp', 316, 282, 158),
  siege: batiment('assets/atelier-siege.webp', 316, 309, 158),
  blacksmith: batiment('assets/forge.webp', 316, 306, 158),
  house: batiment('assets/maison.webp', 216, 186, 108),
  mill: batiment('assets/moulin.webp', 216, 235, 108),
  lumbercamp: batiment('assets/camp-bucherons.webp', 216, 191, 108),
  miningcamp: batiment('assets/camp-mineurs.webp', 216, 187, 108),
  farm: batiment('assets/ferme.webp', 216, 176, 108),
  tower: batiment('assets/tour-guet.webp', 216, 313, 108),
  // Végétation : six arbres et six buissons, sans couleur d'équipe. Chaque
  // case a son sprite posé au bas, centré : l'ancre est le bas de la case, et
  // la planche dicte les proportions — l'arbre le plus haut fait 95 px monde,
  // trois cases : un arbre doit dépasser une maison.
  arbres: {
    src: 'assets/arbres.webp',
    cellW: 107, cellH: 190, cases: 6, images: 1,
    ancreY: 190, hauteurMonde: 95,
  },
  // Le buisson à baies : une seule illustration et son miroir, à la taille
  // d'une case — c'est la nourriture, il faut que les baies se voient.
  baies: {
    src: 'assets/baies.webp',
    cellW: 87, cellH: 82, cases: 2, images: 1,
    ancreY: 82, hauteurMonde: 41.0,
  },
  // Le gisement d'or : une seule illustration, et son miroir en seconde case ;
  // la taille varie un peu d'une case à l'autre (voir dessinerVegetation).
  or: {
    src: 'assets/or.webp',
    cellW: 101, cellH: 74, cases: 2, images: 1,
    ancreY: 74, hauteurMonde: 37,
  },
  // Le villageois : quatre orientations de marche (sud, nord, ouest, est —
  // `lignes` donne la ligne de l'atlas pour chaque secteur) et quatre poses
  // de travail, dessinées d'un seul côté (`sens` : 1 vers l'est, -1 vers
  // l'ouest) — un miroir les retourne quand la cible est de l'autre (voir
  // Renderer.poseDe). Debout, 40 px : un peu moins que le chevalier.
  villager: {
    src: 'assets/villageois.webp',
    cellW: 56, cellH: 86, cases: 4, images: 24, cycle: 36,
    lignes: [0, 3, 1, 2],
    // Les huit foulées de la planche n'alternent pas les pieds (de face :
    // droit, droit, puis quatre fois le gauche) et l'une d'elles, de profil,
    // est un fantôme du matting. Mesurées image par image, on retient six à
    // huit poses par rangée dans l'ordre d'une vraie marche, puis RIFE
    // intercale deux pas entre chaque paire (voir SOURCES.md, « Des pas
    // intermédiaires ») : la rangée joue ses images dans l'ordre, la
    // première étant la foulée neutre où le villageois s'arrête.
    sequences: { 0: suite(18), 1: suite(18), 2: suite(24), 3: suite(21) },
    poses: {
      repos: { ligne: 4, images: 4, cadence: 2.5 },
      cueillir: { ligne: 5, images: 4, cadence: 5, sens: -1 },
      construire: { ligne: 6, images: 4, cadence: 7, sens: 1 },
      porter: { ligne: 7, images: 12, sens: 1 },
    },
    ancreY: 85, hauteurMonde: 40, natif: 'bleu',
    // L'écharpe est bleu franc ; peau, cuir et chemise sont orangés ou crème.
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
  // L'éclaireur : cavalier à la lance, huit orientations × quatre foulées. La
  // planche va du nord au nord-ouest dans le sens horaire ; `lignes` remet
  // chaque secteur (sud, sud-est, est…) sur sa ligne. Plus grand qu'un homme
  // à pied : 54 px de face.
  scout: {
    src: 'assets/eclaireur.webp',
    cellW: 106, cellH: 111, cases: 8, images: 4, cycle: 56,
    lignes: [4, 3, 2, 1, 0, 7, 6, 5],
    ancreY: 110, hauteurMonde: 54, natif: 'bleu',
    // Cape et tapis de selle sont bleu franc ; la robe du cheval, la peau et
    // la tunique sont brunes ou crème.
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
  // Le décor de la carte : rochers, galets, touffes, roseaux, buissons,
  // fougères, agaves, nénuphars et fleurs, pièces de tailles diverses rangées
  // dans un même atlas (voir decor-pieces.js et decor.js) ; pas de couleur
  // d'équipe.
  decor: {
    src: 'assets/decor.webp',
    pieces: PIECES_DECOR,
  },
  // Les animaux : trois rangées (sud, est, nord) de quatre foulées ; l'ouest
  // est l'est en miroir (`miroirs`). Pas de couleur d'équipe : un cochon
  // capturé se reconnaît à son socle.
  deer: {
    src: 'assets/cerf.webp',
    cellW: 82, cellH: 78, cases: 8, images: 4, cycle: 40,
    lignes: [0, 1, 2, 3, 4, 3, 2, 1], miroirs: [false, false, false, false, false, true, true, true],
    // De face, la planche lève deux fois la même jambe : neutre, gauche,
    // neutre, droite. De dos, jamais de neutre : gauche, droite, gauche,
    // droite. Le profil et les trois quarts se jouent tels quels.
    sequences: { 0: [1, 0, 1, 2], 1: [0, 1, 2, 3, 2, 1], 2: [0, 1, 2, 3], 3: [0, 1, 2, 3], 4: [0, 1, 0, 2] },
    ancreY: 76, hauteurMonde: 39.0,
  },
  pig: {
    src: 'assets/cochon.webp',
    cellW: 74, cellH: 63, cases: 8, images: 4, cycle: 26,
    // Cinq rangées (sud, sud-est, est, nord-est, nord) ; les trois secteurs de
    // l'ouest reprennent les rangées de l'est en miroir.
    lignes: [0, 1, 2, 3, 4, 3, 2, 1], miroirs: [false, false, false, false, false, true, true, true],
    // La planche ne fait pas alterner les pieds : mesuré au contour, de face et
    // de dos on lève surtout le même ; en trois quarts, la même jambe avant
    // reste plantée. Chaque rangée rejoue ses images dans l'ordre d'un
    // balancier — repos, un pied, repos, l'autre — sans saut.
    sequences: { 0: [0, 1, 0, 3], 1: [0, 3, 2, 3, 0, 1], 2: [0, 1, 3, 2], 3: [0, 3, 2, 1, 2, 3], 4: [0, 2, 0, 3] },
    ancreY: 61, hauteurMonde: 31.5,
  },
  spearman: {
    src: 'assets/lancier.png',
    cellW: 48, cellH: 48, cases: 8, images: 1,
    ancreY: 46, hauteurMonde: 44, natif: 'rouge', pixel: true,
    // Le rouge du tabard voisine avec la peau et le cuir, dont la teinte est
    // orangée : la fenêtre s'arrête aux rouges francs.
    recolorage: { teinte: [338, 14], vers: 216, satMin: 0.35, lumMax: 0.75 },
  },
};

const PAS = Math.PI / 4;
const charges = new Map();

/**
 * Deux styles cohabitent pour la même unité : `anime` (marche dessinée, huit
 * images par direction) et `peint` (illustration réduite, pose unique). Le
 * choix se fait en cours de partie, et l'atlas correspondant n'est téléchargé
 * qu'au moment où on le demande.
 */
const ALTERNATIVES = { militia: { anime: 'militia', peint: 'militiaPeint' } };
export const STYLES = [
  { id: 'anime', nom: 'Animé', desc: 'Marche dessinée' },
  { id: 'peint', nom: 'Peint', desc: 'Illustration réduite' },
];
let style = 'anime';

export function styleUnites() { return style; }

export function setStyleUnites(nouveau) {
  style = STYLES.some((s) => s.id === nouveau) ? nouveau : 'anime';
  for (const alt of Object.values(ALTERNATIVES)) chargerAtlas(alt[style]);
}

function versHSL(r, g, b) {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const R = r / 255, G = g / 255, B = b / 255;
  let h;
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
  else if (max === G) h = ((B - R) / d + 2) / 6;
  else h = ((R - G) / d + 4) / 6;
  return [h, s, l];
}

function versRGB(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(canal(h + 1 / 3) * 255), Math.round(canal(h) * 255), Math.round(canal(h - 1 / 3) * 255)];
}

function copie(image, l, h) {
  const canvas = document.createElement('canvas');
  canvas.width = l; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  return { canvas, ctx };
}

/**
 * Échange rouge et bleu sur les pixels à dominante bleue. C'est la règle la
 * moins chère, et elle convient à une illustration où le bleu couvre une
 * grande surface peinte sans acier bleuté alentour.
 */
function echangeCanaux(image, l, h) {
  const { canvas, ctx } = copie(image, l, h);
  try {
    const data = ctx.getImageData(0, 0, l, h);
    const p = data.data;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] === 0) continue;
      if (p[i + 2] > p[i] + 18) {
        const bleu = p[i + 2];
        p[i] = Math.min(255, bleu + 30);
        p[i + 1] = Math.round(p[i + 1] * 0.55);
        p[i + 2] = Math.round(bleu * 0.28);
      }
    }
    ctx.putImageData(data, 0, 0);
  } catch { /* canvas verrouillé : le camp gardera sa couleur d'origine */ }
  return canvas;
}

/**
 * Bascule une FENÊTRE DE TEINTE vers une autre, en gardant saturation et
 * luminosité. C'est ce qu'il faut dès que la couleur d'équipe voisine une
 * matière de teinte proche : l'acier bleuté à côté d'un bouclier bleu, la peau
 * et le cuir à côté d'un tabard rouge. Un échange de canaux les emporterait
 * avec ; une fenêtre étroite les épargne.
 *
 * `teinte` est un intervalle en degrés, qui peut passer par 0 (338 → 14).
 */
function rotationTeinte(image, l, h, regle) {
  const { canvas, ctx } = copie(image, l, h);
  const [a, b] = regle.teinte;
  const cible = regle.vers / 360;
  const satMin = regle.satMin ?? 0.3;
  const lumMax = regle.lumMax ?? 1;
  const dedans = a <= b
    ? (d) => d >= a && d <= b
    : (d) => d >= a || d <= b;      // fenêtre à cheval sur 0°
  try {
    const data = ctx.getImageData(0, 0, l, h);
    const p = data.data;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] === 0) continue;
      const [teinte, sat, lum] = versHSL(p[i], p[i + 1], p[i + 2]);
      if (sat <= satMin || lum >= lumMax || !dedans(teinte * 360)) continue;
      const [r, g, bl] = versRGB(cible, sat, lum);
      p[i] = r; p[i + 1] = g; p[i + 2] = bl;
    }
    ctx.putImageData(data, 0, 0);
  } catch { /* idem */ }
  return canvas;
}

/**
 * Variante d'équipe : l'image d'origine sert un camp, l'autre est recalculée.
 * Sans règle (végétation), les deux camps partagent l'image.
 */
function recolorer(def, image, l, h) {
  if (!def.recolorage) return image;
  return def.recolorage === 'echange'
    ? echangeCanaux(image, l, h)
    : rotationTeinte(image, l, h, def.recolorage);
}

/** Charge un atlas donné, une seule fois. */
function chargerAtlas(cle) {
  const def = ATLAS[cle];
  if (!def || charges.has(cle) || typeof document === 'undefined') return;
  const entree = { def, pret: false, variantes: null };
  charges.set(cle, entree);
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    const l = image.width, h = image.height;
    const autre = recolorer(def, image, l, h);
    entree.variantes = def.natif === 'bleu'
      ? { bleu: image, rouge: autre }
      : { rouge: image, bleu: autre };
    entree.pret = true;
  };
  image.onerror = () => { charges.set(cle, { def, pret: false, absent: true }); };
  image.src = def.src;
}

/**
 * Démarre le chargement des atlas nécessaires. Les variantes de style, elles,
 * n'arrivent que si on les demande : inutile de télécharger les deux.
 */
export function chargerSprites() {
  if (typeof document === 'undefined') return;
  const variantes = new Set(Object.values(ALTERNATIVES).flatMap((a) => Object.values(a)));
  for (const cle of Object.keys(ATLAS)) {
    if (!variantes.has(cle) || ALTERNATIVES[cle]) chargerAtlas(cle);
  }
  for (const alt of Object.values(ALTERNATIVES)) chargerAtlas(alt[style]);
}

// ---------------------------------------------------------------------------
// Textures de sol.
//
// Une nappe CONTINUE par type de terrain, échantillonnée aux coordonnées monde :
// deux cases voisines d'herbe montrent deux morceaux contigus de la même
// nappe, pas deux copies d'une tuile — rien ne trahit la grille. La nappe se
// répète toutes les `n × TEXEL` unités monde ; elle est raccordée bord à bord
// à la fabrication (assets/SOURCES.md).
//
// Chaque nappe est recopiée dans un canvas avec une MARGE repliée tout autour,
// pour qu'un échantillon qui déborde de la période (les débordements de
// lisière) reste dans l'image. Une version demi-taille sert au zoom arrière :
// sans elle, réduire 384 texels sur 96 pixels scintille au défilement.
// ---------------------------------------------------------------------------

export const TEXEL = 0.5;          // pixels monde par texel, à zoom 1
const MARGE = 128;                 // texels repliés autour de la nappe
const TEXTURES = {
  grass: 'assets/sol-herbe.webp',
  grassDark: 'assets/sol-herbe-sombre.webp',
  dirt: 'assets/sol-terre.webp',
  sand: 'assets/sol-sable.webp',
  water: 'assets/sol-eau.webp',
};
const nappes = new Map();

function nappeRepliee(image, n, marge) {
  const c = document.createElement('canvas');
  c.width = n + 2 * marge; c.height = n + 2 * marge;
  const g = c.getContext('2d');
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) g.drawImage(image, 0, 0, image.width, image.height, marge + ox * n, marge + oy * n, n, n);
  }
  return c;
}

function chargerTexture(cle) {
  if (nappes.has(cle) || typeof document === 'undefined') return;
  const entree = { pret: false, niveaux: null };
  nappes.set(cle, entree);
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    const n = image.width;
    entree.niveaux = [
      { canvas: nappeRepliee(image, n, MARGE), n, marge: MARGE, texel: TEXEL },
      { canvas: nappeRepliee(image, n / 2, MARGE / 2), n: n / 2, marge: MARGE / 2, texel: TEXEL * 2 },
    ];
    entree.pret = true;
  };
  image.onerror = () => { nappes.set(cle, { pret: false, absent: true }); };
  image.src = TEXTURES[cle];
}

export function chargerTextures() {
  if (typeof document === 'undefined') return;
  for (const cle of Object.keys(TEXTURES)) chargerTexture(cle);
}

/**
 * Niveau de nappe à utiliser pour ce zoom (0 : pleine, 1 : demi-taille), ou
 * null si la texture n'est pas prête — le rendu garde alors sa tuile de
 * couleur.
 */
export function textureSol(cle, zoom = 1) {
  const e = nappes.get(cle);
  if (!e || !e.pret) return null;
  return e.niveaux[zoom < 0.7 ? 1 : 0];
}

/** Sprite prêt à dessiner pour ce type d'unité, ou null. */
export function spriteDe(type) {
  const alt = ALTERNATIVES[type];
  const e = charges.get(alt ? alt[style] : type);
  return e && e.pret ? e : null;
}

/** Le joueur 0 est bleu, le joueur 1 rouge (voir PLAYER_COLORS). */
export function imagePourJoueur(sprite, playerIndex) {
  return playerIndex === 0 ? sprite.variantes.bleu : sprite.variantes.rouge;
}

/**
 * Position de la case dans l'atlas.
 * - Une seule image par orientation : les huit directions se suivent en ligne.
 * - Une marche animée : les colonnes sont les images, les lignes les directions.
 */
export function cadreSource(def, direction, image) {
  const multi = (def.images || 1) > 1;
  const ligne = def.lignes ? def.lignes[direction] : direction;
  return multi
    ? { sx: image * def.cellW, sy: ligne * def.cellH }
    : { sx: direction * def.cellW, sy: 0 };
}

/** Position d'une image d'une pose (repos, cueillir, construire, porter). */
export function poseSource(def, pose, image) {
  return { sx: image * def.cellW, sy: pose.ligne * def.cellH };
}

/**
 * Image de la marche, choisie sur la DISTANCE parcourue et non sur l'horloge :
 * les jambes suivent le sol, une unité lente marche lentement, et une unité
 * arrêtée reprend sa pose de repos.
 */
export function imageDeMarche(def, distance, enMouvement, ligne = 0) {
  // Une planche mal cadencée (deux fois le même pied, images en double) se
  // remonte sans la redessiner : `sequences[ligne]` donne l'ordre des images
  // à jouer, la première étant la foulée neutre où l'unité s'arrête.
  const seq = def.sequences && def.sequences[ligne];
  const n = seq ? seq.length : (def.images || 1);
  if (n <= 1 || !enMouvement) return seq ? seq[0] : 0;
  const cycle = def.cycle || 40;
  const i = Math.floor((distance / cycle) * n) % n;
  return seq ? seq[i] : i;
}

/**
 * Case de l'atlas correspondant à une orientation. `facing` vaut 0 vers l'est
 * et croît vers le sud (l'axe des y descend), d'où le sens de lecture.
 */
export function caseDirection(facing, cases = 8) {
  const pas = (2 * Math.PI) / cases;
  const k = Math.round((Math.PI / 2 - facing) / pas);
  return ((k % cases) + cases) % cases;
}
