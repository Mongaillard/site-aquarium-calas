// Le sol et le décor de chaque peuple : le désert des Solariens (sable doré
// autour de leur départ et sous leurs bâtiments), le décor qui suit ce sol et
// s'efface sous les bâtiments, les fleurs dessinées, les arbres du désert.
// Tout cela n'est qu'affichage : la carte et la simulation ne bougent pas, et
// la dernière partie de ce fichier le prouve (parties IA contre IA identiques
// à celles d'avant ce lot). Sans navigateur : ce sont des fonctions pures.
// Lancement : node test/da-desert.test.js

import { World } from '../js/game.js';
import { AIPlayer } from '../js/ai.js';
import { DIFFICULTIES, TICKS_PER_SECOND, TILE, BUILDING_TYPES } from '../js/config.js';
import { TERRAIN } from '../js/map.js';
import {
  planterDecor, planterCampagne, CUITES, ECHELLE_DECOR,
  SOL_SABLE_OR, SOL_CARTE, ZONE, RAYON_DESERT, COURONNE_TERRE, TERRE_MAX, RAYON_PLACE, TROU_MAX, ILOT_MAX, DELAI_COUR, CHANGE,
  solEn, solPlein, solDeBase, solApparent, largeurTerre, courBatiment, zoneImage, debordImage, releverBatiments, filtrerDecor, caseArbre, peupleDuDesert,
} from '../js/decor.js';
import { reteinterNappe } from '../js/sprites.js';
import { readFileSync } from 'node:fs';

const DT = 1 / TICKS_PER_SECOND;
let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? '  ok  ' : ' FAIL ';
  if (!condition) failures++;
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

const monde = (seed, civs, mapSize = 'medium') => new World({ seed, mode: 'classique', mapSize, difficulty: 'normal', civs });
const somme = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t[i], 16777619) >>> 0; return h; };
const pre = (t) => t === TERRAIN.GRASS || t === TERRAIN.GRASS_DARK;
const toutes = (decor) => [...decor.debout.flat(), ...decor.cuits.flat()];
const cle = (p) => [p.tx, p.ty, p.piece.nom, Math.round(p.x * 100), Math.round(p.y * 100), p.miroir, Math.round(p.echelle * 1000)].join(':');
/** Écart de couleur CIE76 entre deux couleurs RVB : ce que l'œil sépare (vers 2, à peine ; au-delà de 40, d'un coup d'œil). */
const ecartCouleur = (a, b) => {
  const lab = (rvb) => {
    const [r, v, bl] = rvb.map((c) => { const u = c / 255; return u > 0.04045 ? ((u + 0.055) / 1.055) ** 2.4 : u / 12.92; });
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((0.4124 * r + 0.3576 * v + 0.1805 * bl) / 0.95047), y = f(0.2126 * r + 0.7152 * v + 0.0722 * bl), z = f((0.0193 * r + 0.1192 * v + 0.9505 * bl) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const p = lab(a), q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

console.log('=== Le sol et le décor de chaque peuple ===\n');

// ---------------------------------------------------------------------------
// 1. Le sol de base : le désert autour d'un départ solarien
// ---------------------------------------------------------------------------
console.log('--- Le sol de base ---');
{
  const w = monde(4101, ['solarien', 'atlante']);
  const map = w.map, n = map.w * map.h;
  const avant = somme(map.terrain);
  const base = solDeBase(map, w.players);
  const plein = solPlein(base.sol, map);     // un sol par case : celui du sol de base, sinon celui de la carte
  const [moi, lui] = map.startPositions;
  const dist = (i, p) => Math.hypot((i % map.w) - p.tx, Math.floor(i / map.w) - p.ty);
  check('la carte n’est pas modifiée', somme(map.terrain) === avant);
  check('seuls les Solariens vivent sur le sable', peupleDuDesert('solarien') && !peupleDuDesert('atlante') && !peupleDuDesert(undefined));

  // Le sable va jusqu'à RAYON_DESERT + 2,4 cases, la terre TERRE_MAX plus loin, les arbres du désert COURONNE_TERRE + 1,1.
  const portee = RAYON_DESERT + Math.max(COURONNE_TERRE, TERRE_MAX) + 4;
  const voisines = (i) => [i - 1, i + 1, i - map.w, i + map.w].filter((v) => v >= 0 && v < n);
  const casesDeSable = [];
  for (let i = 0; i < n; i++) if (plein[i] === SOL_SABLE_OR) casesDeSable.push(i);
  const auSable = (i) => casesDeSable.reduce((m, j) => Math.min(m, Math.hypot((i % map.w) - (j % map.w), Math.floor(i / map.w) - Math.floor(j / map.w))), Infinity);
  let coeur = true, eau = true, loin = true, bande = true, sable = 0, terre = 0, couronne = 0, zones = true, touche = 0, large = 0;
  for (let i = 0; i < n; i++) {
    const t = map.terrain[i], s = plein[i], d = dist(i, moi);
    if (t === TERRAIN.WATER && (s !== TERRAIN.WATER || base.zone[i] !== ZONE.PRE)) eau = false;
    if (t !== TERRAIN.WATER && d <= RAYON_DESERT - 2.5 && s !== SOL_SABLE_OR) coeur = false;
    if (d > portee && (base.sol[i] !== SOL_CARTE || base.zone[i] !== ZONE.PRE)) loin = false;
    if ((s === SOL_SABLE_OR) !== (base.zone[i] === ZONE.DESERT)) zones = false;
    if (s === SOL_SABLE_OR) sable++;
    if (base.zone[i] === ZONE.COURONNE) couronne++;
    if (base.sol[i] === TERRAIN.DIRT) {
      // La terre que le sol de base ajoute : sur de l'herbe seulement, à TERRE_MAX cases du sable au plus
      // (une de plus pour l'arrondi aux cases).
      const ecart = auSable(i);
      terre++;
      if (!pre(t) || ecart > TERRE_MAX + 1) bande = false;
      if (ecart >= TERRE_MAX - 2) large++;
    }
    if (pre(s) && voisines(i).some((v) => plein[v] === SOL_SABLE_OR)) touche++;
  }
  check('autour du départ solarien, tout est sable', coeur);
  check('l’eau reste de l’eau', eau);
  check('au-delà du désert et de sa bande, le sol est celui de la carte — le départ atlante compris', loin && base.zone[lui.ty * map.w + lui.tx] === ZONE.PRE,
    `rien au-delà de ${portee} cases`);
  // (Le sol apparent ne recopie pas la carte : un gisement épuisé y laisse de la terre, et cela se voit aussitôt.)
  const ailleurs = base.sol.findIndex((s, i) => s === SOL_CARTE && map.terrain[i] === TERRAIN.GRASS);
  map.terrain[ailleurs] = TERRAIN.DIRT;
  check('là où il ne dit rien, la carte se lit telle qu’elle est à l’instant', solEn(base.sol, map, ailleurs) === TERRAIN.DIRT && solEn(null, map, ailleurs) === TERRAIN.DIRT);
  map.terrain[ailleurs] = TERRAIN.GRASS;
  check('une bande de terre borde le sable, sur l’herbe seulement, à TERRE_MAX cases au plus', bande && terre > 60, terre + ' cases de terre ajoutées');
  check('elle n’est pas un anneau au compas : par endroits l’herbe touche le sable, ailleurs elle va presque au bout', touche >= 3 && large >= 3,
    `${touche} cases d’herbe au ras du sable, ${large} cases de terre à ${TERRE_MAX - 2} cases du sable ou plus`);
  check('le sable doré et la zone « désert » sont les mêmes cases', zones);
  check('les arbres du désert vont un peu au-delà du sable (la couronne)', couronne > 100, couronne + ' cases');
  // La largeur de la bande : de zéro à TERRE_MAX, la même à un tour près, et les deux bouts sont atteints.
  let bornee = true, mini = Infinity, maxi = 0, periode = true;
  for (const phases of [[0, 0, 0], [1.3, 4.1, 2.2], [5.9, 0.4, 3.3]]) {
    for (let k = 0; k < 720; k++) {
      const a = (k / 720) * Math.PI * 2 - Math.PI, l = largeurTerre(a, phases);
      if (!(l >= 0 && l <= TERRE_MAX)) bornee = false;
      if (Math.abs(largeurTerre(a + Math.PI * 2, phases) - l) > 1e-9) periode = false;
      mini = Math.min(mini, l); maxi = Math.max(maxi, l);
    }
  }
  check('largeur de la bande : entre zéro et TERRE_MAX, la même à un tour près', bornee && periode);
  check('elle tombe à zéro par endroits et approche TERRE_MAX ailleurs', mini === 0 && maxi > TERRE_MAX * 0.85, `de ${mini} à ${maxi.toFixed(2)} cases`);
  const aire = Math.PI * RAYON_DESERT * RAYON_DESERT;
  check('une quinzaine de cases de rayon', sable > aire * 0.55 && sable < aire * 1.15, `${sable} cases de sable (un disque plein en ferait ${Math.round(aire)})`);
  const encore = solDeBase(map, w.players);
  check('même carte, mêmes joueurs : même sol', somme(encore.sol) === somme(base.sol) && somme(encore.zone) === somme(base.zone));

  const atlantes = solDeBase(monde(4101, ['atlante', 'atlante']).map, monde(4101, ['atlante', 'atlante']).players);
  check('deux peuples de la mer : le pré tel quel', atlantes.sol.every((s) => s === SOL_CARTE) && atlantes.zone.every((z) => z === ZONE.PRE));
  const deux = monde(4101, ['solarien', 'solarien']);
  const baseDeux = solDeBase(deux.map, deux.players);
  check('deux peuples du désert : deux déserts', baseDeux.sol[lui.ty * map.w + lui.tx] === SOL_SABLE_OR && baseDeux.sol[moi.ty * map.w + moi.tx] === SOL_SABLE_OR
    && baseDeux.zone[lui.ty * map.w + lui.tx] === ZONE.DESERT);
  const petit = monde(9, ['solarien', 'solarien'], 'small');
  const basePetit = solDeBase(petit.map, petit.players);
  check('sur une petite carte, le désert s’arrête au bord sans rien écrire au-delà', basePetit.sol.length === petit.map.w * petit.map.h
    && basePetit.sol.every((s) => s === SOL_CARTE || s === SOL_SABLE_OR || s === TERRAIN.DIRT));
}

// ---------------------------------------------------------------------------
// 2. Le sol apparent : une cour de sable sous chaque bâtiment solarien
// ---------------------------------------------------------------------------
console.log('\n--- Les cours ---');
{
  const w = monde(77, ['solarien', 'atlante']);
  const map = w.map;
  const base = solDeBase(map, w.players);
  const plein = solPlein(base.sol, map);
  // Une case d'herbe loin des deux déserts, avec de la place autour.
  let place = null;
  for (let ty = 8; ty < map.h - 8 && !place; ty++) {
    for (let tx = 8; tx < map.w - 8 && !place; tx++) {
      let bon = true;
      for (let y = ty - 3; y <= ty + 5 && bon; y++) for (let x = tx - 3; x <= tx + 5; x++) { const i = y * map.w + x; if (!pre(plein[i]) || base.zone[i] !== ZONE.PRE) { bon = false; break; } }
      if (bon) place = { tx, ty };
    }
  }
  const maison = { id: 9001, type: 'house', tx: place.tx, ty: place.ty, size: BUILDING_TYPES.house.size, playerIndex: 0 };
  const caserne = { id: 9002, type: 'barracks', tx: place.tx, ty: place.ty, size: BUILDING_TYPES.barracks.size, playerIndex: 0 };
  const avant = somme(map.terrain);
  const sol = solApparent(base, map, [maison], w.players);
  const cour = courBatiment(maison);
  let emprise = true, dehors = true, nord = true, cases = 0;
  for (let ty = cour.ty0 - 3; ty <= cour.ty1 + 2; ty++) {
    for (let tx = cour.tx0 - 2; tx <= cour.tx1 + 2; tx++) {
      const s = sol[ty * map.w + tx];
      const dedans = tx >= maison.tx && tx < maison.tx + 2 && ty >= maison.ty && ty < maison.ty + 2;
      if (dedans && s !== SOL_SABLE_OR) emprise = false;
      if (!cour.dans(tx, ty) && s === SOL_SABLE_OR) dehors = false;
      if (ty < maison.ty && s === SOL_SABLE_OR) nord = false;
      if (s === SOL_SABLE_OR) cases++;
    }
  }
  const { tx: mx, ty: my } = maison;
  check('sous une maison solarienne posée sur l’herbe : du sable', emprise);
  check('la cour : l’emprise, une case à l’est, à l’ouest et au sud', dehors && cases === 10 && cour.dans(mx - 1, my) && cour.dans(mx + 2, my + 1) && cour.dans(mx, my + 2) && cour.dans(mx + 1, my + 2),
    cases + ' cases de sable');
  check('rien au nord (les toits ne posent rien au sol), et les coins du sud sont coupés', nord && cour.ty0 === my && !cour.dans(mx, my - 1) && !cour.dans(mx - 1, my + 2) && !cour.dans(mx + 2, my + 2));
  check('ni la carte ni le sol de base ne sont modifiés', somme(map.terrain) === avant && somme(solDeBase(map, w.players).sol) === somme(base.sol));
  check('le bâtiment tombé, le pré revient', somme(solApparent(base, map, [], w.players)) === somme(base.sol)
    && somme(solApparent(base, map, [{ ...maison, dead: true }], w.players)) === somme(base.sol));
  check('un bâtiment atlante ne change pas le sol', somme(solApparent(base, map, [{ ...maison, playerIndex: 1 }], w.players)) === somme(base.sol));
  const solCaserne = solApparent(base, map, [caserne], w.players);
  check('un bâtiment de trois cases : dix-huit cases de cour', [...solCaserne].filter((s, i) => s === SOL_SABLE_OR && base.sol[i] !== SOL_SABLE_OR).length === 18);
  const palais = courBatiment({ type: 'towncenter', tx: 10, ty: 10, size: 3 });
  let casesPalais = 0;
  for (let ty = 6; ty <= 16; ty++) for (let tx = 6; tx <= 16; tx++) if (palais.dans(tx, ty)) casesPalais++;
  check('le Centre-Ville, dessiné plus large, prend deux cases de cour', palais.tx0 === 8 && palais.tx1 === 14 && palais.ty0 === 10 && palais.ty1 === 14 && casesPalais === 29
    && palais.dans(8, 10) && palais.dans(8, 12) && !palais.dans(10, 9) && !palais.dans(8, 13) && palais.dans(9, 13) && palais.dans(10, 14) && !palais.dans(9, 14));

  // Un village sur le pré : les bandes d'herbe d'une ou deux cases entre deux cours sont comblées, et l'îlot qu'elles enferment.
  const { tx: px, ty: py } = place;
  const dessus = (liste, tx, ty) => solApparent(base, map, liste, w.players)[ty * map.w + tx];
  const m1 = { id: 9010, type: 'house', tx: px, ty: py, size: 2, playerIndex: 0 };
  const voisin = (ecart) => ({ id: 9011, type: 'house', tx: px + 2 + 2 + ecart, ty: py, size: 2, playerIndex: 0 });   // `ecart` cases d'herbe entre les deux cours
  check('une case d’herbe entre deux cours : comblée', dessus([m1, voisin(1)], px + 3, py) === SOL_SABLE_OR && dessus([m1], px + 3, py) === SOL_CARTE);
  check(`${TROU_MAX} cases : comblées`, [0, 1].every((k) => dessus([m1, voisin(TROU_MAX)], px + 3 + k, py) === SOL_SABLE_OR));
  check(`${TROU_MAX + 1} cases : le pré reste entre les deux`, [0, 1, 2].every((k) => dessus([m1, voisin(TROU_MAX + 1)], px + 3 + k, py) === SOL_CARTE));
  check('la bande ne déborde pas au nord des cours', dessus([m1, voisin(1)], px + 3, py - 1) === SOL_CARTE);
  // Quatre bâtiments en carré autour d'un îlot de trois cases de côté.
  const carre = [
    { id: 9020, type: 'house', tx: px - 2, ty: py - 2, size: 2, playerIndex: 0 }, { id: 9021, type: 'tower', tx: px + 3, ty: py - 2, size: 2, playerIndex: 0 },
    { id: 9022, type: 'farm', tx: px - 2, ty: py + 3, size: 2, playerIndex: 0 }, { id: 9023, type: 'house', tx: px + 3, ty: py + 3, size: 2, playerIndex: 0 },
  ];
  const solCarre = solApparent(base, map, carre, w.players);
  let ilot = 0, ilotComble = 0;
  for (let ty = py + 1; ty <= py + 2; ty++) for (let tx = px; tx <= px + 2; tx++) { ilot++; if (solCarre[ty * map.w + tx] === SOL_SABLE_OR) ilotComble++; }
  check('l’îlot d’herbe enfermé entre quatre cours est comblé', ilot === 6 && ilotComble === 6 && ilot <= ILOT_MAX);
  check('une cour de moins : l’îlot n’est plus enfermé, le pré y revient', solApparent(base, map, carre.slice(0, 3), w.players)[(py + 2) * map.w + px + 2] === SOL_CARTE);
  check('la carte n’y est pour rien : toujours la même', somme(map.terrain) === avant);
  check('la cour d’un bâtiment adverse sorti de la vue n’est plus peinte', somme(solApparent(base, map, [{ ...maison, enVue: false }], w.players)) === somme(base.sol)
    && somme(solApparent(base, map, [{ ...maison, enVue: true }], w.players)) === somme(sol));
  // L'eau reste de l'eau, même sous une cour (un bâtiment au bord d'un lac).
  // (Une case d'eau avec la terre ferme à l'est : la maison s'y pose, sa cour mord sur l'eau.)
  const ferme = (i) => map.terrain[i] !== TERRAIN.WATER;
  const rive = [...map.terrain].findIndex((t, i) => t === TERRAIN.WATER && i % map.w > 4 && i % map.w < map.w - 6 && i > 4 * map.w && i < map.terrain.length - 6 * map.w
    && [1, 2, map.w + 1, map.w + 2].every((k) => ferme(i + k)));
  const auBord = { id: 9003, type: 'house', tx: (rive % map.w) + 1, ty: Math.floor(rive / map.w), size: 2, playerIndex: 0 };
  const solRive = solApparent(base, map, [auBord], w.players);
  check('l’eau reste de l’eau au bord d’une cour', solEn(solRive, map, rive) === TERRAIN.WATER && solRive.every((s, i) => s !== SOL_SABLE_OR || map.terrain[i] !== TERRAIN.WATER)
    && solRive.some((s, i) => s === SOL_SABLE_OR && base.sol[i] !== SOL_SABLE_OR));

  // Les marges du dessin, tenues en double : elles doivent suivre sprites.js.
  const source = readFileSync(new URL('../js/sprites.js', import.meta.url), 'utf8');
  let accord = true, lus = 0;
  for (const [, type, largeur] of source.matchAll(/^\s*(\w+): batiment\('[^']+', \d+, \d+, (\d+)\)/gm)) {
    const size = BUILDING_TYPES[type].size;
    lus++;
    if ((Number(largeur) - size * TILE) / 2 !== debordImage(type, size)) accord = false;
  }
  check('les marges du décor sont celles du dessin des bâtiments (sprites.js)', accord && lus === 13, lus + ' bâtiments relus');
  const z = zoneImage({ type: 'house', tx: 10, ty: 10, size: 2 });
  check('la zone d’une image : l’emprise, 22 px de chaque côté, 12 px au sud', z.x0 === 298 && z.x1 === 406 && z.y0 === 320 && z.y1 === 396);
}

// ---------------------------------------------------------------------------
// 3. Ce que le joueur connaît : pas de cour qui trahit un chantier sous le brouillard
// ---------------------------------------------------------------------------
console.log('\n--- Les bâtiments connus ---');
{
  const connus = new Map();
  const mien = { id: 1, type: 'house', tx: 5, ty: 5, size: 2, playerIndex: 0 };
  const sien = { id: 2, type: 'tower', tx: 30, ty: 30, size: 2, playerIndex: 1 };
  let enVue = new Set();
  let debout = new Set([1, 2]);
  const relever = (liste, heure) => releverBatiments(connus, liste, 0, (b) => enVue.has(b.id), (id) => debout.has(id), heure);
  check('mes bâtiments sont connus d’emblée, pas ceux de l’adversaire hors de vue', relever([mien, sien], 0) === CHANGE.LISTE && connus.has(1) && !connus.has(2));
  check('rien ne change : rien à refaire', relever([mien, sien], 1) === 0);
  enVue = new Set([2]);
  check('un bâtiment adverse entre dans la vue : il est connu, sa cour est à peindre', relever([mien, sien], 10) === CHANGE.LISTE && connus.has(2) && connus.get(2).tx === 30 && connus.get(2).enVue === true);
  enVue = new Set();
  check('sorti de la vue, il reste connu et sa cour reste un instant', relever([mien, sien], 20) === 0 && connus.has(2) && connus.get(2).enVue === true);
  enVue = new Set([2]);
  check('revenu avant le délai (une troupe en limite de portée) : rien à refaire', relever([mien, sien], 20 + DELAI_COUR / 2) === 0 && connus.get(2).enVue === true);
  enVue = new Set();
  check('ressorti : le délai repart de là', relever([mien, sien], 21) === 0 && relever([mien, sien], 21 + DELAI_COUR - 0.1) === 0 && connus.get(2).enVue === true);
  check('le délai passé, sa cour est à retirer — lui reste connu', relever([mien, sien], 21 + DELAI_COUR) === CHANGE.VUE && connus.has(2) && connus.get(2).enVue === false);
  check('les miens ne sortent jamais de la vue', connus.get(1).enVue === true && relever([mien, sien], 99) === 0);
  enVue = new Set([2]);
  check('revu : sa cour revient', relever([mien, sien], 100) === CHANGE.VUE && connus.get(2).enVue === true);
  enVue = new Set();
  debout = new Set([1]);
  check('tombé hors de vue, il reste connu : on ne l’a pas vu tomber', relever([mien], 110) === 0 && relever([mien], 110 + DELAI_COUR) === CHANGE.VUE && connus.has(2));
  enVue = new Set([2]);
  check('l’endroit revu, il est oublié', relever([mien], 120) === CHANGE.LISTE && !connus.has(2));
  debout = new Set();
  check('un des miens tombe : oublié aussitôt', relever([], 121) === CHANGE.LISTE && connus.size === 0);
  // Sans heure (les essais sans rendu) : la cour d'un bâtiment sorti de la vue reste.
  const sansHeure = new Map();
  enVue = new Set([2]); debout = new Set([2]);
  releverBatiments(sansHeure, [sien], 0, (b) => enVue.has(b.id), (id) => debout.has(id));
  enVue = new Set();
  check('sans heure donnée, rien ne clignote', releverBatiments(sansHeure, [sien], 0, (b) => enVue.has(b.id), (id) => debout.has(id)) === 0 && sansHeure.get(2).enVue === true);
}

// ---------------------------------------------------------------------------
// 4. Le décor suit le sol, et s'efface sous les bâtiments
// ---------------------------------------------------------------------------
console.log('\n--- Le décor ---');
{
  const w = monde(4101, ['solarien', 'atlante']);
  const map = w.map;
  const base = solDeBase(map, w.players);
  const plein = solPlein(base.sol, map);
  const brut = planterDecor(map), decor = planterDecor(map, plein);
  const sol = (d) => plein[d.ty * map.w + d.tx];
  const vertes = new Set(['herbe', 'couvre', 'buisson', 'fougere']);
  const surSable = toutes(decor).filter((d) => sol(d) === SOL_SABLE_OR);
  check('dans le désert : ni herbe verte, ni fleurs, ni buissons, ni fougères', surSable.length > 50
    && surSable.every((d) => !vertes.has(d.piece.classe) && !d.piece.classe.startsWith('fleur')), surSable.length + ' pièces sur le sable');
  const classes = (c) => surSable.filter((d) => d.piece.classe === c).length;
  check('mais des galets, des touffes sèches et des agaves', classes('galet') > 10 && classes('touffe') > 5 && classes('agave') > 3,
    `${classes('galet')} galets, ${classes('touffe')} touffes, ${classes('agave')} agaves, ${classes('pampa')} pampas, ${classes('roche')} rochers`);
  const ailleurs = (liste) => toutes(liste).filter((d) => plein[d.ty * map.w + d.tx] === map.terrain[d.ty * map.w + d.tx]).map(cle).join('|');
  check('hors du désert et de sa couronne, le décor est le même qu’avant', ailleurs(decor) === ailleurs(brut));
  check('sans peuple du désert, rien ne change', toutes(planterDecor(map, solPlein(solDeBase(map, monde(4101, ['atlante', 'atlante']).players).sol, map))).map(cle).join('|') === toutes(brut).map(cle).join('|'));

  // Les fleurs : plus d'amas de pixels purs, des massifs dessinés, en petit, cuits dans le sol.
  const fleurs = toutes(brut).filter((d) => d.piece.classe.startsWith('fleur'));
  check('les fleurs sont des massifs dessinés, pas les amas de pixels de l’atlas', fleurs.length > 30
    && fleurs.every((d) => /^(ornement|buissons)-/.test(d.piece.nom)) && toutes(brut).every((d) => !/^eau-mare-(59|60|61)/.test(d.piece.nom)), fleurs.length + ' massifs');
  const largeurs = fleurs.map((d) => d.piece.w * ECHELLE_DECOR * d.echelle);
  check('en petit (moins d’une case de large : des touffes, pas des buissons), et cuits dans le sol', Math.max(...largeurs) < 28 && Math.min(...largeurs) > 8 && fleurs.every((d) => CUITES.has(d.piece.classe))
    && brut.cuits.flat().filter((d) => d.piece.classe.startsWith('fleur')).length === fleurs.length, `de ${Math.min(...largeurs).toFixed(1)} à ${Math.max(...largeurs).toFixed(1)} px monde`);
  check('les fleurs poussent toujours sur les prés', planterCampagne(map).cuits.flat().filter((d) => d.piece.classe.startsWith('fleur')).every((d) => pre(map.terrain[d.ty * map.w + d.tx])));

  // Le filtre. Au départ : la place nette, rien sous le Centre-Ville.
  const depart = map.startPositions[0];
  const tout = toutes(decor);
  check('avant tout filtre, rien n’est caché', tout.every((d) => d.cache === false));
  const solDepart = solApparent(base, map, w.buildings, w.players);
  const piedSurSable = (d) => solDepart[Math.floor(d.y / TILE) * map.w + Math.floor(d.x / TILE)] === SOL_SABLE_OR;
  const filtrer = (batiments) => filtrerDecor(decor, batiments, map.startPositions, solApparent(base, map, batiments, w.players));
  const changes = filtrer(w.buildings);
  const px = depart.tx * TILE + TILE / 2, py = depart.ty * TILE + TILE / 2;
  const pres = (d) => Math.hypot(d.x - px, d.y - py) <= RAYON_PLACE * TILE;
  const debout = decor.debout.flat(), cuits = decor.cuits.flat();
  check('la place du départ : aucune pièce debout à moins de cinq cases', debout.filter(pres).every((d) => d.cache), debout.filter(pres).length + ' pièces écartées');
  const auLoin = debout.filter((d) => Math.hypot(d.x - px, d.y - py) > (RAYON_PLACE + 6) * TILE && Math.hypot(d.x - map.startPositions[1].tx * TILE, d.y - map.startPositions[1].ty * TILE) > (RAYON_PLACE + 6) * TILE);
  check('au-delà, le décor debout reste — sauf le vert dont le pied touche le sable, au bord du désert', auLoin.every((d) => d.cache === (d.verte && piedSurSable(d))) && auLoin.filter((d) => !d.cache).length > 100,
    `${auLoin.filter((d) => !d.cache).length} pièces debout, ${auLoin.filter((d) => d.cache).length} verte(s) écartée(s) du sable`);
  check('rien de vert n’est dessiné le pied sur le sable doré', tout.every((d) => !(d.verte && piedSurSable(d)) || d.cache));
  const centre = w.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const zc = zoneImage(centre);
  const sousLeCentre = (d) => d.x > zc.x0 && d.x < zc.x1 && d.y > zc.y0 && d.y < zc.y1;
  check('rien sous l’image du Centre-Ville, pas même un galet', tout.filter(sousLeCentre).every((d) => d.cache));
  check('les pièces cuites qui changent sont rendues (leur sol est à refaire)', changes.length === cuits.filter((d) => d.cache).length && changes.every((d) => d.cache && CUITES.has(d.piece.classe)));
  check('le sol de la place garde ses galets et ses touffes', cuits.filter((d) => pres(d) && !d.cache).length > 0, cuits.filter((d) => pres(d) && !d.cache).length + ' pièces à plat sur la place');

  // Un bâtiment posé sur du décor, loin du départ : dessous, tout s'efface ; il tombe, tout revient.
  let cible = null;
  for (const d of debout) {
    if (d.cache || d.tx < 6 || d.ty < 6 || d.tx > map.w - 8 || d.ty > map.h - 8) continue;
    if (base.zone[d.ty * map.w + d.tx] === ZONE.PRE && pre(plein[d.ty * map.w + d.tx]) && d.piece.classe === 'buisson') { cible = d; break; }
  }
  const avant = tout.map((d) => d.cache);
  for (const fini of [true, false]) {
    const ferme = { id: 9100, type: 'farm', tx: cible.tx - 1, ty: cible.ty - 1, size: 2, playerIndex: 1, complete: fini };
    const c1 = filtrer([...w.buildings, ferme]);
    const dessous = tout.filter((d) => d.tx >= ferme.tx && d.tx < ferme.tx + 2 && d.ty >= ferme.ty && d.ty < ferme.ty + 2);
    check(`${fini ? 'un bâtiment' : 'un chantier'} posé sur un buisson : plus rien dessous`, cible.cache && dessous.length > 0 && dessous.every((d) => d.cache), dessous.length + ' pièce(s) sous l’emprise');
    const c2 = filtrer(w.buildings);
    check('il tombe : le décor revient, à l’identique', !cible.cache && tout.every((d, i) => d.cache === avant[i]) && c1.length === c2.length);
  }
  check('rien à refaire quand rien n’a changé', filtrer(w.buildings).length === 0);
  // Un gros rocher devant un parvis : son pied est hors de l'emprise, son corps la recouvre.
  const amas = debout.find((d) => d.piece.classe === 'amas' && !d.cache && d.tx > 8 && d.ty > 8 && d.tx < map.w - 8 && d.ty < map.h - 8);
  if (amas) {
    const devant = { id: 9101, type: 'barracks', tx: amas.tx - 1, ty: amas.ty - 4, size: 3, playerIndex: 1 };
    filtrer([...w.buildings, devant]);
    check('un rocher planté sur le parvis d’un bâtiment n’est pas dessiné', amas.cache && amas.ty > devant.ty + 2);
    filtrer(w.buildings);
  }
  // Une cour de sable sur un pré : plus d'herbe ni de fleurs dedans, les galets restent.
  const pres2 = planterDecor(map);     // (planté sur le pré : comme un bâtiment solarien posé hors de son désert)
  const fleur = pres2.cuits.flat().find((d) => d.piece.classe.startsWith('fleur') && base.zone[d.ty * map.w + d.tx] === ZONE.PRE && d.tx > 6 && d.ty > 6 && d.tx < map.w - 8 && d.ty < map.h - 8);
  const voisine = { id: 9102, type: 'house', tx: fleur.tx + 1, ty: Math.floor(fleur.y / TILE) - 1, size: 2, playerIndex: 0 };
  const fx = Math.floor(fleur.x / TILE), fy = Math.floor(fleur.y / TILE);
  const surPre = (liste) => filtrerDecor(pres2, liste, [], solApparent(base, map, liste, w.players));
  surPre([]);
  const auRepos = toutes(pres2).map((d) => d.cache);     // (planté sur le pré, ce décor a du vert dans le désert : écarté d'emblée)
  if (courBatiment(voisine).dans(fx, fy)) {
    surPre([voisine]);
    check('dans la cour d’une maison solarienne, les fleurs des prés s’effacent', fleur.cache);
    surPre([{ ...voisine, enVue: false }]);
    check('la maison sortie de la vue, sa cour retirée : elles reviennent (hors de l’image)', !fleur.cache || (fleur.x + 4 > zoneImage(voisine).x0));
    surPre([{ ...voisine, playerIndex: 1 }]);
    check('dans celle d’une maison atlante, elles restent (hors de l’image)', !fleur.cache || (fleur.x + 4 > zoneImage(voisine).x0));
    // Une bande comblée entre deux cours est du sable aussi : rien de vert n'y reste. (Une touffe témoin y est
    // plantée : le hasard de la carte n'en met pas toujours une.)
    const seconde = { id: 9103, type: 'house', tx: voisine.tx - 2 - 2 - TROU_MAX, ty: voisine.ty, size: 2, playerIndex: 0 };
    const solDeux = solApparent(base, map, [voisine, seconde], w.players);
    const seule = [solApparent(base, map, [voisine], w.players), solApparent(base, map, [seconde], w.players)];
    const bande = [...solDeux.keys()].filter((i) => solDeux[i] === SOL_SABLE_OR && seule.every((sol) => sol[i] !== SOL_SABLE_OR));
    const bx = bande[0] % map.w, by = Math.floor(bande[0] / map.w);
    const temoin = { x: (bx + 0.5) * TILE, y: (by + 0.5) * TILE, piece: fleur.piece, miroir: false, echelle: 0.5, tx: bx, ty: by, verte: true, cache: false };
    pres2.cuits[by].push(temoin);
    surPre([voisine, seconde]);
    const verts = toutes(pres2).filter((d) => d.verte && bande.includes(Math.floor(d.y / TILE) * map.w + Math.floor(d.x / TILE)));
    check('dans la bande comblée entre deux cours non plus', bande.length === TROU_MAX * 2 && temoin.cache && verts.every((d) => d.cache),
      `${bande.length} cases comblées, ${verts.length} pièce(s) verte(s) écartée(s)`);
    surPre([voisine]);
    check('une des deux maisons tombe : la bande redevient pré, le vert y revient', !temoin.cache);
    pres2.cuits[by].pop();
    surPre([]);
    check('tout retiré, tout revient', toutes(pres2).every((d, i) => d.cache === auRepos[i]));
  }
}

// ---------------------------------------------------------------------------
// 5. Les arbres du désert, la nappe de sable doré
// ---------------------------------------------------------------------------
console.log('\n--- Arbres et sable ---');
{
  const CYPRES = 0, OLIVIER = 2, NOUEUX = 5;
  const DU_DESERT = [CYPRES, OLIVIER, NOUEUX];
  let pres = true, desert = true, vus = new Set();
  for (let v = 0; v < 256; v++) {
    if (caseArbre(v, ZONE.PRE) !== v % 6) pres = false;
    for (const zone of [ZONE.COURONNE, ZONE.DESERT]) {
      const c = caseArbre(v, zone);
      vus.add(c);
      if (!DU_DESERT.includes(c)) desert = false;
      if (DU_DESERT.includes(v % 6) && c !== v % 6) desert = false;   // ces trois-là gardent leur image
    }
  }
  check('sur le pré, chaque arbre garde son image', pres);
  check('près d’un départ du désert : cyprès, olivier et arbre noueux seulement', desert && [...vus].sort().join() === '0,2,5');
  check('une autre planche (deux cases) n’est pas touchée', caseArbre(7, ZONE.DESERT, 2) === 1);
  const w = monde(4101, ['solarien', 'atlante']);
  const variantes = somme([...w.map.resources.values()].map((r) => r.variant));
  solDeBase(w.map, w.players);
  check('la ressource ne change pas : seule l’image', somme([...w.map.resources.values()].map((r) => r.variant)) === variantes);

  // La nappe : une « photo » de sable brun, avec son grain.
  const n = 64 * 64, pixels = new Uint8ClampedArray(n * 4);
  let g = 12345;
  const alea = () => { g = (Math.imul(g, 1103515245) + 12345) >>> 0; return g / 4294967296; };
  for (let i = 0; i < n; i++) {
    const grain = (alea() - 0.5) * 60;
    pixels[i * 4] = 161 + grain; pixels[i * 4 + 1] = 121 + grain * 0.8; pixels[i * 4 + 2] = 83 + grain * 0.6; pixels[i * 4 + 3] = 255;
  }
  const stats = (p) => { const m = [0, 0, 0]; let e = 0; for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) m[c] += p[i * 4 + c] / n; for (let i = 0; i < n; i++) e += (p[i * 4] - m[0]) ** 2 / n; return { m, e: Math.sqrt(e) }; };
  const brun = stats(pixels);
  const vers = [210, 165, 87];
  reteinterNappe(pixels, vers, 0.7);
  const dore = stats(pixels);
  check('la nappe reteintée a la couleur visée, en moyenne', dore.m.every((v, c) => Math.abs(v - vers[c]) < 1.5), dore.m.map((v) => Math.round(v)).join(', '));
  check('son grain est resserré, pas grossi par l’éclaircissement', dore.e < brun.e * (vers[0] / brun.m[0]) * 0.75 && dore.e > 0, `${brun.e.toFixed(1)} → ${dore.e.toFixed(1)}`);
  check('l’opacité n’est pas touchée', pixels.every((v, i) => i % 4 !== 3 || v === 255));
  const source = readFileSync(new URL('../js/sprites.js', import.meta.url), 'utf8');
  check('le sable doré est tiré de la nappe de sable : aucune image nouvelle', /sandOr: \{ de: 'sand'/.test(source) && !/sol-sable-or|sol-desert/.test(source));

  // La mini-carte : le point d'or doit se voir sur le désert comme sur les sols de la carte (couleurs relues dans render.js).
  const rendu = readFileSync(new URL('../js/render.js', import.meta.url), 'utf8');
  const palette = rendu.slice(rendu.indexOf('renderMinimapTerrain() {'), rendu.indexOf('drawMinimap() {'));
  const couleur = (motif) => { const m = palette.match(motif); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
  const sableMini = couleur(/\[SOL_SABLE_OR\]: \[(\d+), (\d+), (\d+)\]/), or = couleur(/'gold' \? \[(\d+), (\d+), (\d+)\]/);
  const sols = { herbe: couleur(/\[TERRAIN\.GRASS\]: \[(\d+), (\d+), (\d+)\]/), terre: couleur(/\[TERRAIN\.DIRT\]: \[(\d+), (\d+), (\d+)\]/), sable: couleur(/\[TERRAIN\.SAND\]: \[(\d+), (\d+), (\d+)\]/) };
  check('mini-carte : le désert et le point d’or ont leur couleur', !!sableMini && !!or && Object.values(sols).every(Boolean));
  if (sableMini && or) {
    check('mini-carte : l’or se voit d’un coup d’œil sur le désert comme sur les sols de la carte', ecartCouleur(or, sableMini) >= 40 && Object.values(sols).every((c) => ecartCouleur(or, c) >= 40),
      `écart ${ecartCouleur(or, sableMini).toFixed(1)} sur le désert, ${ecartCouleur(or, sols.sable).toFixed(1)} sur le sable, ${ecartCouleur(or, sols.herbe).toFixed(1)} sur l’herbe`);
    check('mini-carte : le désert ne se confond ni avec la terre ni avec l’herbe', ecartCouleur(sableMini, sols.terre) >= 20 && ecartCouleur(sableMini, sols.herbe) >= 30,
      `écart ${ecartCouleur(sableMini, sols.terre).toFixed(1)} avec la terre, ${ecartCouleur(sableMini, sols.herbe).toFixed(1)} avec l’herbe`);
  }
}

// ---------------------------------------------------------------------------
// 6. Non-régression : la simulation se déroule à l'identique
// ---------------------------------------------------------------------------
// Trois parties IA contre IA de dix minutes, relevées AVANT ce lot (branche du
// jeu, commit 08481a4) : âges, scores, ressources, nombre d'entités, et un
// hachage de toutes les positions et de tous les points de vie. Si une règle
// change un jour à dessein, ces valeurs se relèvent avec la fonction empreinte.
console.log('\n--- La simulation, à l’identique ---');
{
  const hacher = (h, v) => Math.imul(h ^ (v | 0), 16777619) >>> 0;
  const empreinte = (w) => {
    let h = 2166136261;
    for (const e of w.entities) {
      h = hacher(h, e.id); h = hacher(h, Math.round(e.x * 100)); h = hacher(h, Math.round(e.y * 100)); h = hacher(h, Math.round((e.hp || 0) * 100));
    }
    for (const i of w.map.removed) h = hacher(h, i);
    return {
      temps: Math.round(w.time * 100) / 100, ages: w.players.map((p) => p.age), scores: w.players.map((p) => w.score(p)),
      entites: w.entities.length, positions: h, terrain: somme(w.map.terrain),
      ressources: w.players.map((p) => Object.values(p.resources).map((v) => Math.round(v))),
    };
  };
  const AVANT = [
    { seed: 4101, civs: ['solarien', 'atlante'], temps: 600, ages: [1, 1], scores: [4678, 4698], entites: 136, positions: 1080594078, terrain: 4156755414, ressources: [[93, 161, 316], [151, 119, 343]] },
    { seed: 77, civs: ['atlante', 'solarien'], temps: 600, ages: [0, 0], scores: [3968, 4234], entites: 121, positions: 354925785, terrain: 1086135328, ressources: [[271, 308, 403], [389, 373, 377]] },
    { seed: 2024, civs: ['solarien', 'solarien'], temps: 600, ages: [1, 1], scores: [4438, 5148], entites: 130, positions: 2956986616, terrain: 1239323807, ressources: [[35, 171, 400], [187, 53, 420]] },
  ];
  /** Une partie IA contre IA ; `afficher` : tout ce que le rendu calcule désormais, refait toutes les cinq secondes de jeu. */
  const partie = ({ seed, civs }, afficher) => {
    const w = monde(seed, civs);
    w.players[0].autoWorkers = true;
    w.ais.push(new AIPlayer(w, 0, DIFFICULTIES.normal));
    let base = null, decor = null, connus = new Map(), pas = 0;
    while (!w.gameOver && w.time < 600) {
      w.update(DT); w.drainEvents();
      if (!afficher || ++pas % (5 * TICKS_PER_SECOND)) continue;
      base = solDeBase(w.map, w.players);
      decor ||= planterDecor(w.map, solPlein(base.sol, w.map));
      releverBatiments(connus, w.buildings, 0, () => true, (id) => { const b = w.byId.get(id); return !!b && !b.dead; }, w.time);
      const sol = solApparent(base, w.map, [...connus.values()], w.players);
      filtrerDecor(decor, [...connus.values()], w.map.startPositions, sol);
      for (const r of w.map.resources.values()) if (r.type === 'wood') caseArbre(r.variant, base.zone[r.ty * w.map.w + r.tx]);
    }
    return empreinte(w);
  };
  for (const attendu of AVANT) {
    const { seed, civs, ...valeurs } = attendu;
    const nue = partie(attendu, false), affichee = partie(attendu, true);
    check(`graine ${seed} (${civs.join(' contre ')}) : dix minutes identiques à celles d’avant le lot`, JSON.stringify(nue) === JSON.stringify(valeurs),
      `âges ${nue.ages.join('/')}, scores ${nue.scores.join('/')}, ${nue.entites} entités, positions ${nue.positions}`);
    check(`graine ${seed} : calculer le sol et le décor en cours de partie n’y change rien`, JSON.stringify(affichee) === JSON.stringify(valeurs));
  }
}

console.log(`\n${failures === 0 ? '✅ Tous les tests passent' : '❌ ' + failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
