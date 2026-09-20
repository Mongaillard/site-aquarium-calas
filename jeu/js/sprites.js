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
  // sur l'emprise par sa ligne de sol (`sol`, fraction de la hauteur). Le
  // Centre-Ville déborde de son emprise 3×3 : un palais qui se lit de loin, et
  // un parvis qui empiète sur les cases voisines — les unités marchent dessus.
  towncenter: {
    src: 'assets/centre-ville.webp',
    cellW: 288, cellH: 287, cases: 1, images: 1,
    largeurMonde: 144, sol: 0.93, natif: 'bleu',
    // Dômes et bannières sont bleu franc ; la pierre est blanche, l'eau et les
    // cristaux sont cyan (teinte < 200°) : seule la fenêtre du bleu bascule.
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
  // La caserne : même cité, même vue, un peu moins large que le palais — le
  // Centre-Ville doit rester le plus grand bâtiment de la base.
  barracks: {
    src: 'assets/caserne.webp',
    cellW: 264, cellH: 264, cases: 1, images: 1,
    largeurMonde: 132, sol: 0.93, natif: 'bleu',
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
  // Végétation : six arbres et six buissons, sans couleur d'équipe. Chaque
  // case a son sprite posé au bas, centré : l'ancre est le bas de la case, et
  // la planche dicte les proportions — l'arbre le plus haut fait 73 px monde.
  arbres: {
    src: 'assets/arbres.webp',
    cellW: 82, cellH: 146, cases: 6, images: 1,
    ancreY: 146, hauteurMonde: 73,
  },
  buissons: {
    src: 'assets/buissons.webp',
    cellW: 72, cellH: 77, cases: 6, images: 1,
    ancreY: 77, hauteurMonde: 38.5,
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
  return multi
    ? { sx: image * def.cellW, sy: direction * def.cellH }
    : { sx: direction * def.cellW, sy: 0 };
}

/**
 * Image de la marche, choisie sur la DISTANCE parcourue et non sur l'horloge :
 * les jambes suivent le sol, une unité lente marche lentement, et une unité
 * arrêtée reprend sa pose de repos.
 */
export function imageDeMarche(def, distance, enMouvement) {
  const n = def.images || 1;
  if (n <= 1 || !enMouvement) return 0;
  const cycle = def.cycle || 40;
  return Math.floor((distance / cycle) * n) % n;
}

/**
 * Case de l'atlas correspondant à une orientation. `facing` vaut 0 vers l'est
 * et croît vers le sud (l'axe des y descend), d'où le sens de lecture.
 */
export function caseDirection(facing, cases = 8) {
  const k = Math.round((Math.PI / 2 - facing) / PAS);
  return ((k % cases) + cases) % cases;
}
