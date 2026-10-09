// ---------------------------------------------------------------------------
// Les teintures : la même troupe dans une autre matière. L'or des armures, des
// casques et des bijoux devient argent, jade, obsidienne ou améthyste.
//
// Une teinture ne change rien au combat, et elle ne touche JAMAIS au tissu à
// la couleur du camp : ces pixels-là sont marqués à la cuisson (ALPHA_EQUIPE,
// js/modele3d.js) et repris tels quels. On reconnaît donc toujours un camp à
// son bleu ou à son rouge, quelle que soit la matière de son armure.
//
// Elle s'applique à l'atlas CUIT d'une troupe — une copie de plus, fabriquée
// au premier dessin et rendue quand on ne la dessine plus (voir
// variantesEquipe, js/sprites.js) —, et seulement aux troupes du joueur.
//
// Une règle est celle de `retoucher` (js/modele3d.js) : une fenêtre de teinte
// en degrés, bornée en saturation et en clarté, et ce qu'elle y change. Les
// fenêtres disent où est l'or (OR) ; quelques modèles ont les leurs
// (FENETRES). La peau, le pelage d'une monture, le bois d'un engin et le lin
// blanc restent ce qu'ils sont : seules leurs pièces d'or changent.
//
// À éviter pour une nouvelle teinture : les teintes de 170 à 260° (le bleu et
// le turquoise des camps alliés) et les rouges et orangés (les camps adverses).
// ---------------------------------------------------------------------------

import { retoucher, ALPHA_EQUIPE } from './modele3d.js';

/**
 * Où est l'or sur un modèle cuit — mesuré sur les trente-quatre modèles :
 *   - l'or franc tient entre 36 et 64° ;
 *   - l'or dans l'ombre descend jusqu'à 30°, où il croise la peau en pleine
 *     lumière : il s'en distingue par sa couleur plus dense (saturation au-delà
 *     de 0,74 quand la peau, le pelage fauve et le bois blond restent en dessous) ;
 *   - au-delà de 0,8 de clarté, ce n'est plus de l'or mais du lin blanc ou un
 *     reflet : on n'y touche pas ; en dessous de 0,22, c'est le trait d'encre.
 */
const OR = [
  { teinte: [36, 64], satMin: 0.4, lumMin: 0.22, lumMax: 0.8, fondu: 0 },
  { teinte: [30, 36], satMin: 0.74, lumMin: 0.22, lumMax: 0.8, fondu: 0 },
];

/**
 * Les modèles dont la matière n'est pas là où elle est chez les autres, par
 * clé de MODELES : leurs fenêtres remplacent celles de l'or. Une liste vide :
 * ce modèle ne se teint pas.
 */
const FENETRES = {
  // Le Sphinx est d'or de la tête aux pattes : c'est tout son corps qui change de matière.
  solHydra: [{ teinte: [20, 64], satMin: 0.34, lumMin: 0.2, lumMax: 0.9, fondu: 0 }],
  // Béliers et catapultes : leurs ferrures sont trop menues, la teinture n'y laissait que des taches.
  ram: [], catapult: [], solRam: [], solCatapult: [],
  // Le Chacal dressé et le Mercenaire atlante : un pelage fauve, des écailles turquoise — pas d'or à changer.
  solScout: [], triton: [],
};

/**
 * Les troupes en armure de plates n'ont presque pas d'or : chez elles, c'est
 * l'ACIER qui change de matière — tout ce qui est gris (saturation sous
 * `satMax`, l'effet s'éteignant sur `fondu` au-delà), entre deux clartés. Par
 * clé de MODELES.
 */
const ACIER = { satMax: 0.2, fondu: 0.1, lumMin: 0.26, lumMax: 0.9 };
const EN_ACIER = ['militia', 'champion', 'knight'];

/**
 * Les teintures, par matière (leur nom et leur couleur dans les menus sont
 * avec les pièces, js/collections-config.js) : ce que chacune fait de l'or —
 * `vers` la teinte qui le remplace, `sat` et `lum` ce qui multiplie sa
 * saturation et sa clarté (voir retoucher, js/modele3d.js).
 */
export const TEINTURES = Object.freeze({
  argent: { sat: 0.08, lum: 1.1 },
  jade: { vers: 150, sat: 0.72, lum: 0.9 },
  obsidienne: { vers: 278, sat: 0.22, lum: 0.44 },
  amethyste: { vers: 280, sat: 0.8, lum: 0.92 },
});

/** Ce que chaque teinture fait de l'acier : sa teinte, sa saturation (posée, l'acier n'en a pas), sa clarté. L'argent le laisse tel quel. */
const SUR_L_ACIER = Object.freeze({
  jade: { vers: 150, sat: 0.4, lum: 0.9 },
  obsidienne: { vers: 278, sat: 0.2, lum: 0.46 },
  amethyste: { vers: 280, sat: 0.46, lum: 0.9 },
});

/** Ce qu'une teinture fait de l'acier de ce modèle : `{ vers, sat, lum, satMax, fondu, lumMin, lumMax }`, ou null. */
export function acierDeTeinture(id, modele) {
  const t = Object.prototype.hasOwnProperty.call(SUR_L_ACIER, id) ? SUR_L_ACIER[id] : null;
  return t && EN_ACIER.includes(modele) ? { ...ACIER, ...t } : null;
}

/** Les règles d'une teinture pour un modèle (clé de MODELES) : ses fenêtres, ou celles de l'or, et ce que la teinture y change. [] : rien à teindre. */
export function reglesDeTeinture(id, modele) {
  const t = Object.prototype.hasOwnProperty.call(TEINTURES, id) ? TEINTURES[id] : null;
  if (!t) return [];
  const fenetres = Object.prototype.hasOwnProperty.call(FENETRES, modele) ? FENETRES[modele] : OR;
  return fenetres.map((f) => ({ ...f, ...t }));
}

/** Une couleur TSL (teinte en degrés, saturation et clarté de 0 à 1) en trois octets. */
function versRVB(teinte, sat, lum) {
  const q = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat, m = 2 * lum - q;
  const canal = (t) => {
    t = ((t % 6) + 6) % 6;
    return t < 1 ? m + (q - m) * t : t < 3 ? q : t < 4 ? m + (q - m) * (4 - t) : m;
  };
  const t = teinte / 60;
  return [Math.round(canal(t + 2) * 255), Math.round(canal(t) * 255), Math.round(canal(t - 2) * 255)];
}

/**
 * Teint les pixels d'un atlas cuit, en place (`p` : quatre octets par pixel) :
 * l'or selon `regles` (celles de reglesDeTeinture), puis l'acier selon `acier`
 * (acierDeTeinture) s'il y en a. Le tissu du camp (alpha ALPHA_EQUIPE) et les
 * pixels vides ne bougent pas. Rend le nombre de pixels changés. Pure : sert
 * aux tests.
 */
export function teindrePixels(p, regles, acier = null) {
  if ((!regles || !regles.length) && !acier) return 0;
  const avant = p.slice();
  if (regles && regles.length) retoucher(p, regles);
  let changes = 0;
  for (let i = 0; i < p.length; i += 4) {
    const a = avant[i + 3];
    const r = avant[i], g = avant[i + 1], b = avant[i + 2];
    if (a === ALPHA_EQUIPE || a === 0) {
      p[i] = r; p[i + 1] = g; p[i + 2] = b;
      continue;
    }
    if (acier) {
      // Un gris : sa clarté seule compte. Il prend la teinte et la saturation de la matière.
      const max = r > g ? (r > b ? r : b) : (g > b ? g : b), min = r < g ? (r < b ? r : b) : (g < b ? g : b);
      const somme = max + min, l = somme / 510;
      const sat = max === min ? 0 : somme > 255 ? (max - min) / (510 - somme) : (max - min) / somme;
      if (sat < acier.satMax + acier.fondu && l >= acier.lumMin && l <= acier.lumMax) {
        const poids = sat <= acier.satMax ? 1 : 1 - (sat - acier.satMax) / acier.fondu;
        const [r2, g2, b2] = versRVB(acier.vers, acier.sat, Math.min(1, l * acier.lum));
        p[i] = Math.round(r + (r2 - r) * poids); p[i + 1] = Math.round(g + (g2 - g) * poids); p[i + 2] = Math.round(b + (b2 - b) * poids);
      }
    }
    if (p[i] !== r || p[i + 1] !== g || p[i + 2] !== b) changes++;
  }
  return changes;
}
