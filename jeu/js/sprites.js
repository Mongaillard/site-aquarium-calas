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
    cellW: 44, cellH: 76, cases: 8, images: 8, cycle: 40,
    ancreY: 73, hauteurMonde: 44, natif: 'bleu',
  },
  // Même unité, l'autre style : l'illustration peinte, sans marche animée.
  // Elle sert à comparer les deux partis pris sans relancer de partie.
  militiaPeint: {
    src: 'assets/chevalier.webp',
    cellW: 76, cellH: 104, cases: 8, images: 1,
    ancreY: 104, hauteurMonde: 40, natif: 'bleu',
  },
  spearman: {
    src: 'assets/lancier.png',
    cellW: 48, cellH: 48, cases: 8, images: 1,
    ancreY: 46, hauteurMonde: 44, natif: 'rouge', pixel: true,
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
 * Bleu → rouge. Sur l'illustration peinte, le bleu couvre une grande cape :
 * on échange simplement le rouge et le bleu des pixels à dominante bleue, ce
 * qui laisse l'acier et l'or intacts.
 */
function enRouge(image, l, h) {
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
 * Rouge → bleu. Sur du pixel art, le rouge du tabard voisine avec la peau du
 * visage et le cuir : une bascule large repeignait le visage en bleu. On ne
 * prend donc que les rouges francs (teinte 338°–14°), ce qui épargne la peau
 * et le cuir, dont la teinte est orangée.
 */
function enBleu(image, l, h) {
  const { canvas, ctx } = copie(image, l, h);
  try {
    const data = ctx.getImageData(0, 0, l, h);
    const p = data.data;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] === 0) continue;
      const [teinte, sat, lum] = versHSL(p[i], p[i + 1], p[i + 2]);
      const deg = teinte * 360;
      if ((deg >= 338 || deg <= 14) && sat > 0.35 && lum < 0.75) {
        const [r, g, b] = versRGB(0.60, sat, lum);
        p[i] = r; p[i + 1] = g; p[i + 2] = b;
      }
    }
    ctx.putImageData(data, 0, 0);
  } catch { /* idem */ }
  return canvas;
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
    entree.variantes = def.natif === 'bleu'
      ? { bleu: image, rouge: enRouge(image, l, h) }
      : { rouge: image, bleu: enBleu(image, l, h) };
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
