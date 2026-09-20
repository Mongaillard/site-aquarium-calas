// ---------------------------------------------------------------------------
// Sprites de personnage.
//
// Certaines unités ont une vraie illustration plutôt qu'un dessin au code : le
// milicien porte les huit orientations découpées dans la planche du chevalier.
// Tout type sans sprite — c'est-à-dire tous les autres pour l'instant — garde
// son rendu procédural, et le jeu reste jouable si l'image ne charge pas.
//
// Les huit cases de l'atlas tournent en partant du SUD (le personnage fait face
// au joueur) puis par l'EST. On le lit à la cape, qui est toujours dans le dos.
// ---------------------------------------------------------------------------

const ATLAS = {
  militia: { src: 'assets/chevalier.webp', cellW: 76, cellH: 104, cases: 8, hauteurMonde: 40 },
};

const PAS = Math.PI / 4;
const charges = new Map();

/**
 * Version adverse : on échange le rouge et le bleu des seuls pixels à
 * dominante bleue. L'acier et l'or, dont les canaux sont proches, ne bougent
 * pas — c'est plus sûr qu'une rotation de teinte globale, et c'est identique
 * sur tous les navigateurs (le filtre d'un contexte 2D, lui, ne l'est pas).
 */
function versionAdverse(image, l, h) {
  const canvas = document.createElement('canvas');
  canvas.width = l; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  try {
    const data = ctx.getImageData(0, 0, l, h);
    const p = data.data;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] === 0) continue;
      if (p[i + 2] > p[i] + 18) {
        // Rouge franc plutôt qu'un simple échange : le bleu devenait rouille,
        // trop proche du bois et du sable de la carte.
        const bleu = p[i + 2];
        p[i] = Math.min(255, bleu + 30);
        p[i + 1] = Math.round(p[i + 1] * 0.55);
        p[i + 2] = Math.round(bleu * 0.28);
      }
    }
    ctx.putImageData(data, 0, 0);
  } catch { /* canvas verrouillé : l'adversaire restera bleu, sans gravité */ }
  return canvas;
}

/** Démarre le chargement des atlas. À appeler une fois, au lancement d'une partie. */
export function chargerSprites() {
  if (typeof document === 'undefined') return;
  for (const [type, def] of Object.entries(ATLAS)) {
    if (charges.has(type)) continue;
    const entree = { def, image: null, adverse: null, pret: false };
    charges.set(type, entree);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      entree.image = image;
      entree.adverse = versionAdverse(image, image.width, image.height);
      entree.pret = true;
    };
    image.onerror = () => { charges.set(type, { def, pret: false, absent: true }); };
    image.src = def.src;
  }
}

/** Sprite prêt à dessiner pour ce type d'unité, ou null. */
export function spriteDe(type) {
  const e = charges.get(type);
  return e && e.pret ? e : null;
}

/**
 * Case de l'atlas correspondant à une orientation. `facing` vaut 0 vers l'est
 * et croît vers le sud (l'axe des y descend), d'où le sens de lecture.
 */
export function caseDirection(facing, cases = 8) {
  const k = Math.round((Math.PI / 2 - facing) / PAS);
  return ((k % cases) + cases) % cases;
}
