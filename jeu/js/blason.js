// ---------------------------------------------------------------------------
// Le dessin des pièces de collection : l'autocollant (une case de sa planche),
// le cadre (un médaillon tracé), la bannière (un motif tracé), et le blason
// qu'ils composent avec le titre.
//
// Rien que du texte HTML et SVG, sans accès à la page : ces fonctions se
// vérifient hors du navigateur. Les couleurs et les formes viennent de
// js/collections-config.js ; l'encre est celle de la boîte (css/jeu.css).
// ---------------------------------------------------------------------------

import { PIECES, BLASON_DE_DEPART, piece as pieceDuJeu } from './collections-config.js';

const ENCRE = '#17120e';
const n = (v) => Math.round(v * 100) / 100;

/** Le peuple dont les teintures montrent le soldat (voir reglerPeupleDesTeintures). */
let peuple = 'atlante';
/** Les peuples qui ont leurs images de teinture (assets/teintures). */
const PEUPLES_TEINTS = ['atlante', 'solarien'];
/** Dit de quel peuple montrer le soldat sur les vignettes des teintures. */
export function reglerPeupleDesTeintures(civ) { peuple = PEUPLES_TEINTS.includes(civ) ? civ : 'atlante'; }
/** L'image d'une matière (clé de js/teintures.js, ou « origine ») sur le soldat du peuple choisi. */
export const imageDeTeinture = (matiere) => `assets/teintures/${matiere}-${peuple}.webp`;
/** La vignette des troupes telles qu'elles sont peintes : le choix « sans teinture ». */
export const htmlSansTeinture = () => `<span class="piece-vignette piece-teinture"><img src="${imageDeTeinture('origine')}" alt="" decoding="async"></span>`;

// --- L'autocollant ---------------------------------------------------------------

/**
 * Un autocollant : une case de sa planche 3 × 3, montrée par son fond (la
 * feuille de style fixe la taille de `.piece-embleme`). `manque` : on ne l'a
 * pas — il se montre en silhouette.
 */
export function htmlEmbleme(id, { manque = false, classe = '' } = {}) {
  const p = pieceDuJeu(id);
  if (!p || p.genre !== 'embleme') return `<span class="piece-embleme vide ${classe}"></span>`;
  const x = (p.rang % 3) * 50, y = Math.floor(p.rang / 3) * 50;
  return `<span class="piece-embleme ${manque ? 'manque' : ''} ${classe}" role="img" aria-label="${p.nom}" style="background-image:url(${p.planche});background-position:${x}% ${y}%"></span>`;
}

// --- Le cadre --------------------------------------------------------------------

/** Les formes de cadre que l'on sait tracer. */
export const FORMES = ['rond', 'fleur', 'festons', 'rayons', 'pointes', 'creneaux', 'engrenage', 'etoile', 'lauriers'];

/** Un point du cercle de rayon `r`, à l'angle `a` (en tours : 0 en haut, dans le sens des aiguilles). */
const sur = (r, a) => `${n(50 + r * Math.sin(a * 2 * Math.PI))} ${n(50 - r * Math.cos(a * 2 * Math.PI))}`;

/** Le contour d'un cadre dans un carré de 100 : un tracé SVG fermé. */
function contour(forme, dents) {
  const d = Math.max(3, dents || 12);
  const morceaux = [];
  if (forme === 'fleur' || forme === 'festons') {
    // Des arcs bombés vers l'extérieur, d'un creux au suivant.
    const creux = forme === 'fleur' ? 40 : 43, bosse = (2 * Math.PI * creux) / d / 2 * (forme === 'fleur' ? 1.25 : 1.1);
    morceaux.push(`M${sur(creux, 0)}`);
    for (let i = 1; i <= d; i++) morceaux.push(`A${n(bosse)} ${n(bosse)} 0 0 1 ${sur(creux, i / d)}`);
  } else if (forme === 'rayons' || forme === 'pointes' || forme === 'etoile') {
    // Des pointes : un sommet, un creux, un sommet.
    const haut = 48, bas = forme === 'rayons' ? 40 : forme === 'pointes' ? 37 : 30;
    for (let i = 0; i < d; i++) morceaux.push(`${i ? 'L' : 'M'}${sur(haut, i / d)}`, `L${sur(bas, (i + 0.5) / d)}`);
  } else if (forme === 'creneaux' || forme === 'engrenage') {
    // Des dents à sommet plat ; celles de l'engrenage sont plus étroites en haut.
    const haut = 48, bas = 40, large = forme === 'creneaux' ? 0.25 : 0.17, pied = 0.25;
    for (let i = 0; i < d; i++) {
      const c = i / d, pas = 1 / d;
      morceaux.push(`${i ? 'L' : 'M'}${sur(bas, c - pas * pied)}`, `L${sur(haut, c - pas * large)}`, `L${sur(haut, c + pas * large)}`, `L${sur(bas, c + pas * pied)}`);
    }
  } else {
    return null;   // « rond » et « lauriers » : un disque
  }
  return `${morceaux.join('')}Z`;
}

/** Les deux rameaux d'un cadre « lauriers » : des feuilles le long du disque, de bas en haut. */
function rameaux(couleur) {
  const feuilles = [];
  for (const cote of [1, -1]) {
    for (let i = 0; i < 7; i++) {
      const a = cote * (0.44 - i * 0.058);
      const [x, y] = sur(44, a).split(' ').map(Number);
      const tourne = a * 360 + cote * 38;
      feuilles.push(`<ellipse cx="${x}" cy="${y}" rx="5.4" ry="10.5" transform="rotate(${n(tourne)} ${x} ${y})" fill="${couleur}" stroke="${ENCRE}" stroke-width="2.4"/>`);
    }
  }
  return feuilles.join('');
}

/**
 * Le médaillon d'un cadre, en SVG (carré de 100) : sa forme à sa couleur, le
 * disque du milieu à sa couleur de fond, le tout cerné d'encre. L'autocollant
 * se pose par-dessus (voir htmlMedaillon).
 */
export function svgCadre(id) {
  const p = pieceDuJeu(id) || PIECES[BLASON_DE_DEPART.cadre];
  const trace = contour(p.forme, p.dents);
  const dehors = p.forme === 'lauriers'
    ? `<circle cx="50" cy="50" r="40" fill="${p.fond}" stroke="${ENCRE}" stroke-width="4"/>${rameaux(p.couleur)}`
    : trace
      ? `<path d="${trace}" fill="${p.couleur}" stroke="${ENCRE}" stroke-width="4" stroke-linejoin="round"/>`
      : `<circle cx="50" cy="50" r="46" fill="${p.couleur}" stroke="${ENCRE}" stroke-width="4"/>`;
  const dedans = p.forme === 'lauriers' ? '' : `<circle cx="50" cy="50" r="${p.forme === 'etoile' ? 27 : 34}" fill="${p.fond}" stroke="${ENCRE}" stroke-width="3"/>`;
  return `<svg class="piece-cadre" viewBox="0 0 100 100" aria-hidden="true">${dehors}${dedans}</svg>`;
}

// --- La bannière -----------------------------------------------------------------

/** Les motifs de bannière que l'on sait tracer. */
export const MOTIFS = ['uni', 'bandes', 'pois', 'vagues', 'rayons', 'chevrons', 'damier', 'ecailles', 'etoiles'];

/** Une étoile à cinq branches, centrée, de rayon `r`. */
function etoile(cx, cy, r) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const rayon = i % 2 ? r * 0.45 : r, a = (i / 10) * 2 * Math.PI;
    points.push(`${n(cx + rayon * Math.sin(a))},${n(cy - rayon * Math.cos(a))}`);
  }
  return `<polygon points="${points.join(' ')}"/>`;
}

/** Les formes d'un motif sur une bande de 300 × 80, à peindre de la couleur du trait. */
function formes(motif) {
  const f = [];
  if (motif === 'bandes') {
    for (let x = -80; x < 320; x += 48) f.push(`<polygon points="${x},80 ${x + 24},80 ${x + 104},0 ${x + 80},0"/>`);
  } else if (motif === 'pois') {
    for (let l = 0; l < 4; l++) for (let x = l % 2 ? 20 : 0; x <= 300; x += 40) f.push(`<circle cx="${x}" cy="${10 + l * 20}" r="6.5"/>`);
  } else if (motif === 'vagues') {
    for (let l = 0; l < 3; l++) {
      let d = `M-20 ${22 + l * 26}`;
      for (let x = -20; x < 320; x += 40) d += `q10 -14 20 0t20 0`;
      f.push(`<path d="${d}" fill="none" stroke-width="7" stroke-linecap="round"/>`);
    }
  } else if (motif === 'rayons') {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 2 * Math.PI, b = ((i + 0.5) / 12) * 2 * Math.PI;
      f.push(`<polygon points="150,40 ${n(150 + 340 * Math.cos(a))},${n(40 + 340 * Math.sin(a))} ${n(150 + 340 * Math.cos(b))},${n(40 + 340 * Math.sin(b))}"/>`);
    }
  } else if (motif === 'chevrons') {
    for (let x = -40; x < 320; x += 44) f.push(`<polygon points="${x},0 ${x + 20},0 ${x + 60},40 ${x + 20},80 ${x},80 ${x + 40},40"/>`);
  } else if (motif === 'damier') {
    for (let l = 0; l < 4; l++) for (let x = l % 2 ? 20 : 0; x < 300; x += 40) f.push(`<rect x="${x}" y="${l * 20}" width="20" height="20"/>`);
  } else if (motif === 'ecailles') {
    for (let l = 0; l < 5; l++) for (let x = l % 2 ? 0 : -20; x <= 300; x += 40) f.push(`<path d="M${x} ${l * 20 - 4}a20 20 0 0 0 40 0" fill="none" stroke-width="5"/>`);
  } else if (motif === 'etoiles') {
    for (let l = 0; l < 3; l++) for (let x = l % 2 ? 50 : 20; x <= 300; x += 60) f.push(etoile(x, 14 + l * 26, l % 2 ? 9 : 6.5));
  }
  return f.join('');
}

/** Une bannière, en SVG (300 × 80, recadrée par ce qui la contient) : son fond, son motif. */
export function svgBanniere(id) {
  const p = pieceDuJeu(id) || PIECES[BLASON_DE_DEPART.banniere];
  return `<svg class="piece-banniere" viewBox="0 0 300 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="300" height="80" fill="${p.fond}"/><g fill="${p.trait}" stroke="${p.trait}" stroke-width="0">${formes(p.motif)}</g></svg>`;
}

// --- Le blason -------------------------------------------------------------------

/** Le médaillon : le cadre, et l'autocollant posé dessus. */
export function htmlMedaillon(blason, classe = '') {
  const b = blason || BLASON_DE_DEPART;
  // (Sans autocollant : un point d'interrogation, qui invite à en poser un.)
  return `<span class="blason-medaillon ${classe}">${svgCadre(b.cadre)}${b.embleme ? htmlEmbleme(b.embleme) : '<b class="blason-vide" aria-hidden="true">?</b>'}</span>`;
}

/** Le titre d'un blason : son grade, puis son épithète. */
export function titreDuBlason(blason) {
  const b = blason || BLASON_DE_DEPART;
  const grade = pieceDuJeu(b.grade) || PIECES[BLASON_DE_DEPART.grade];
  const epithete = pieceDuJeu(b.epithete);
  return `${grade.nom}${epithete ? ` ${epithete.nom}` : ''}`;
}

/** La carte de joueur : la bannière en fond, le médaillon, le titre, et une ligne en dessous (`sous`, du HTML). */
export function htmlBlason(blason, { sous = '', classe = '' } = {}) {
  const b = blason || BLASON_DE_DEPART;
  return `<span class="blason ${classe}">${svgBanniere(b.banniere)}${htmlMedaillon(b)}<span class="blason-texte"><b>${titreDuBlason(b)}</b>${sous ? `<small>${sous}</small>` : ''}</span></span>`;
}

/** Une pièce seule, pour une liste : l'autocollant, le cadre vide, un morceau de bannière, le soldat d'une teinture, ou le mot d'un titre. */
export function htmlPiece(id, { manque = false } = {}) {
  const p = pieceDuJeu(id);
  if (!p) return '';
  if (p.genre === 'embleme') return htmlEmbleme(id, { manque });
  if (p.genre === 'cadre') return `<span class="piece-vignette ${manque ? 'manque' : ''}">${svgCadre(id)}</span>`;
  if (p.genre === 'banniere') return `<span class="piece-vignette piece-fanion ${manque ? 'manque' : ''}">${svgBanniere(id)}</span>`;
  // (Une teinture se montre toujours en couleurs : on voit ce qu'on achète.)
  if (p.genre === 'teinture') return `<span class="piece-vignette piece-teinture" style="--pastille:${p.pastille}"><img src="${imageDeTeinture(p.matiere)}" alt="" decoding="async"></span>`;
  return `<span class="piece-vignette piece-mot ${manque ? 'manque' : ''}"><b>${p.genre === 'grade' ? p.nom : `… ${p.nom}`}</b></span>`;
}
