// Les collections, le blason et les saisons : le catalogue des pièces, les
// autocollants des coffres, les deux monnaies (Couronnes payantes, Éclats
// gratuits), la route d'une saison et son Passe — et la règle qui tient le
// tout : la voie payante ne contient que de l'apparence.
// Lancement : node test/collections.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROGRESSION as R } from '../js/progression-config.js';
import { COLLECTIONS, PIECES, GENRES, BLASON_DE_DEPART, collection, piece, pieceDe } from '../js/collections-config.js';
import {
  profilNeuf, migrerProfil, regulariser, appliquerResultat, finDeSaison, aleaDeGraine, ouvrirCoffre, probabilitesDe, verifierProbabilites,
  catalogueBoutique, avancementDe, titreDe, equiper, prixDePiece, acheterPiece, acheterCollection,
  saisonDuJour, themeDeSaison, joursRestants, recompenseDePalier, ouvrirLaSaison, etatDeLaSaison, prendrePalier, prendreTout, acheterPasse,
} from '../js/progression.js';
import { FORMES, MOTIFS, htmlEmbleme, svgCadre, svgBanniere, htmlBlason, htmlPiece, titreDuBlason } from '../js/blason.js';
import { ouvrirProgression, htmlBandeau, htmlFinDePartie, installerProgression, reglerPeuple } from '../js/progression-ecrans.js';
import { pieceEnPhrase } from '../js/collections-ecrans.js';
import { PROGRESSION_KEY } from '../js/save.js';
import { ICONES } from '../js/icones.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${detail ? ' — ' + detail : ''}`);
}
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const somme = (liste) => liste.reduce((s, v) => s + v, 0);
const C = R.collections, S = R.saisons;
const DES_COFFRES = COLLECTIONS.filter((c) => c.source === 'coffres');
const DE_SAISON = COLLECTIONS.filter((c) => c.source === 'saison');
const parType = (evenements, type) => evenements.filter((e) => e.type === type);
/** Un hasard écrit d'avance ; au-delà, 0. */
function aleaEcrit(...nombres) {
  let rang = 0;
  const alea = () => (rang < nombres.length ? nombres[rang++] : (rang++, 0));
  alea.appels = () => rang;
  return alea;
}
const avecCoffre = (profil, ...types) => ({ ...profil, coffres: types.map((type) => ({ type, origine: 'victoire' })) });
const avecPieces = (profil, ...ids) => ({ ...profil, pieces: [...profil.pieces, ...ids] });
const partie = (issue, jour, extra = {}) => ({ issue, duree: 600, contreOrdinateur: 'echelle', jour, alea: () => 0, ...extra });
/** Un profil qui a `points` points sur la route de la saison 1. */
const enRoute = (points, extra = {}) => ({ ...profilNeuf(), route: { points, passe: false, pris: { gratuit: [], passe: [] } }, ...extra });

// --- Le catalogue ---------------------------------------------------------------------
console.log('--- Le catalogue ---');
{
  const ids = Object.keys(PIECES);
  check('chaque pièce a un identifiant unique, de la forme « collection.nom », un genre connu, un nom et une rareté',
    ids.length === somme(COLLECTIONS.map((c) => c.pieces.length))
    && ids.every((id) => { const p = PIECES[id]; return p.id === id && id.startsWith(`${p.collection}.`) && GENRES.includes(p.genre) && p.nom && R.categories.includes(p.rarete) && collection(p.collection).pieces.includes(id); }));
  check(`${DES_COFFRES.length} collections sortent des coffres, 1 se vend entière, ${DE_SAISON.length} sont de saison, 1 vient des ligues — ${ids.length} pièces en tout`,
    DES_COFFRES.length === 7 && COLLECTIONS.filter((c) => c.source === 'boutique').length === 1 && DE_SAISON.length === 3
    && COLLECTIONS.filter((c) => c.source === 'ligues').length === 1 && COLLECTIONS.filter((c) => c.source === 'depart').length === 1,
    COLLECTIONS.map((c) => `${c.id} ${c.pieces.length}`).join(', '));
  const themes = COLLECTIONS.filter((c) => c.emblemes.length);
  check('une collection à thème : neuf autocollants (cinq communs, trois rares, un épique), un grade, une bannière, un cadre, une épithète',
    themes.filter((c) => c.source !== 'saison').every((c) => c.emblemes.length === 9
      && egal(c.emblemes.map((id) => PIECES[id].rarete[0]).join(''), 'cccccrrre')
      && ['grade', 'banniere', 'cadre', 'epithete'].every((court) => pieceDe(c.id, court)) && c.pieces.length === 13));
  check('une collection de saison : dix-huit autocollants sur deux planches, et en plus un étendard et un grade de champion',
    DE_SAISON.every((c) => c.emblemes.length === 18 && c.planches.length === 2 && c.pieces.length === 24
      && PIECES[pieceDe(c.id, 'etendard')].genre === 'banniere' && PIECES[pieceDe(c.id, 'champion')].genre === 'grade'));
  check('chaque autocollant a sa planche et sa case, de 0 à 8 ; deux autocollants ne partagent jamais une case',
    themes.every((c) => new Set(c.emblemes.map((id) => `${PIECES[id].planche}#${PIECES[id].rang}`)).size === c.emblemes.length
      && c.emblemes.every((id) => c.planches.includes(PIECES[id].planche) && Number.isInteger(PIECES[id].rang) && PIECES[id].rang >= 0 && PIECES[id].rang < 9)));
  const planches = [...new Set(COLLECTIONS.flatMap((c) => c.planches))];
  const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
  check(`les ${planches.length} planches sont livrées avec le jeu, et gardées pour le hors-ligne`,
    planches.length === 14 && planches.every((p) => fs.existsSync(path.join(RACINE, p)) && sw.includes(`'./${p}'`)),
    planches.filter((p) => !fs.existsSync(path.join(RACINE, p))).join(', '));
  check('chaque cadre a une forme que l’on sait tracer, chaque bannière un motif — et leurs couleurs',
    ids.every((id) => { const p = PIECES[id]; return p.genre === 'cadre' ? FORMES.includes(p.forme) && /^#/.test(p.couleur) && /^#/.test(p.fond) : p.genre === 'banniere' ? MOTIFS.includes(p.motif) && /^#/.test(p.fond) && /^#/.test(p.trait) : true; }));
  check('aucun nom de pièce ne porte d’emoji ni de chiffre', ids.every((id) => !/\p{Extended_Pictographic}|\d/u.test(PIECES[id].nom)));
  check('les grades et les épithètes font des titres : 20 premiers mots, 11 suites',
    ids.filter((id) => PIECES[id].genre === 'grade').length === 20 && ids.filter((id) => PIECES[id].genre === 'epithete').length === 11
    && ids.filter((id) => PIECES[id].genre === 'epithete').every((id) => /^(de la|des|du|de l’) /.test(PIECES[id].nom)));
  // Les ligues donnent des pièces qui existent.
  const cadeaux = R.ligues.flatMap((l) => (l.promotion ? l.promotion.cadeaux.map((c) => c.piece) : []));
  check('chaque cadeau de promotion est une pièce de la collection des ligues, et chaque pièce des ligues est donnée par une ligue, une seule',
    egal([...cadeaux].sort(), [...collection('ligues').pieces].sort()) && new Set(cadeaux).size === cadeaux.length);
  check('toute ligue promue donne quelque chose à porter : un titre, une bannière ou un cadre',
    R.ligues.filter((l) => l.promotion).every((l) => l.promotion.cadeaux.length >= 1 && l.promotion.cadeaux.every((c) => piece(c.piece))));
  check('les cadeaux de fin de saison des ligues 9 et 10 existent pour chaque saison : son étendard, son grade de champion',
    R.ligues.filter((l) => l.finDeSaison).every((l) => l.finDeSaison.cadeaux.every((c) => DE_SAISON.every((s) => pieceDe(s.id, c.saison)))));
  check('les thèmes des saisons sont des collections de saison, toutes différentes ; la collection vendue est une collection de la boutique',
    egal(S.themes, DE_SAISON.map((c) => c.id)) && Object.keys(C.lots).every((id) => collection(id).source === 'boutique'));
}

// --- Le profil ---------------------------------------------------------------------------
console.log('\n--- Le profil ---');
{
  const p = profilNeuf();
  check('un profil neuf : les trois pièces de départ, le blason de départ, zéro Éclat, une route vide',
    egal(p.pieces, ['depart.grade', 'depart.banniere', 'depart.cadre']) && egal(p.blason, BLASON_DE_DEPART) && p.eclats === 0
    && egal(p.route, { points: 0, passe: false, pris: { gratuit: [], passe: [] } }) && egal(p.selection, { jour: '', achats: 0 }) && titreDe(p) === 'Villageois');
  check('il survit tel quel à un aller-retour', egal(migrerProfil(JSON.parse(JSON.stringify(p))), p));
  const plein = { ...p, pieces: [...p.pieces, 'maree.requin-couronne', 'ligues.recrue', 'sables.cadre'], blason: { embleme: 'maree.requin-couronne', cadre: 'sables.cadre', banniere: 'depart.banniere', grade: 'ligues.recrue', epithete: null },
    route: { points: 450, passe: true, pris: { gratuit: [1, 2], passe: [1] } } };
  check('… un profil garni aussi', egal(migrerProfil(JSON.parse(JSON.stringify(plein))), plein));
  const ancien = { ...profilNeuf(), elo: 300, ligue: 3, plusHauteLigue: 3, promotions: [2, 3] };
  delete ancien.pieces; delete ancien.blason; delete ancien.route;
  const lu = migrerProfil(ancien);
  check('un profil d’avant les collections se lit sans rien perdre, avec ses pièces de départ', lu.elo === 300 && egal(lu.pieces, p.pieces) && egal(lu.blason, BLASON_DE_DEPART) && lu.route.points === 0);
  const du = regulariser(ancien);
  check('… et reçoit les cadeaux des ligues qu’il a déjà passées : le titre « Recrue », la Bannière de Bronze',
    du.profil.pieces.includes('ligues.recrue') && du.profil.pieces.includes('ligues.bronze') && !du.profil.pieces.includes('ligues.fer')
    && parType(du.evenements, 'piece').length === 2 && regulariser(du.profil).evenements.length === 0);
  const abime = migrerProfil({ ...p, pieces: ['dragon.dore', 42, null, 'maree.crabe-garde', 'maree.crabe-garde'], blason: { embleme: 'sables.chat-pharaon', cadre: 'maree.crabe-garde', banniere: null, grade: 'inconnu', epithete: 'depart.grade' },
    route: { points: -5, passe: 'oui', pris: { gratuit: [3, 3, 99, 'x', 1], passe: null } } });
  check('des pièces inconnues ou en double sont écartées ; un blason qui porte ce qu’on n’a pas, ou une pièce d’un autre genre, reprend celui de départ',
    egal(abime.pieces, [...p.pieces, 'maree.crabe-garde']) && egal(abime.blason, BLASON_DE_DEPART));
  check('… une route abîmée repart d’aplomb : des points entiers, des paliers connus, sans doublon, rangés',
    egal(abime.route, { points: 0, passe: false, pris: { gratuit: [1, 3], passe: [] } }));
  check('… les points de la route ne dépassent jamais la route entière', migrerProfil({ ...p, route: { points: 999999 } }).route.points === S.paliers * S.pointsParPalier);
}

// --- Les autocollants des coffres ----------------------------------------------------------
console.log('\n--- Les autocollants des coffres ---');
{
  check('les tables des coffres sont valides, autocollants compris', verifierProbabilites().valide, verifierProbabilites().erreurs.join(' ; '));
  check('un autocollant par coffre de bois, d’argent ou d’or ; deux dans un légendaire, rares ou mieux',
    egal(Object.keys(R.coffres).map((t) => C.tirages[t].nombre), [1, 1, 1, 2]) && !('commune' in C.tirages.legendaire.table));
  check('chaque coffre donne des Éclats, de plus en plus : 5, 10, 20, 50', egal(Object.keys(R.coffres).map((t) => C.eclats.parCoffre[t]), [5, 10, 20, 50]));
  // Bois : deux tirages de fragments (quatre nombres), puis l'autocollant (deux nombres) : commune sous 900, rare au-delà.
  const depart = avecCoffre(profilNeuf(), 'bois');
  const alea = aleaEcrit(0, 0, 0, 0, 0.5, 0);
  const o = ouvrirCoffre(depart, 0, alea);
  const premiere = DES_COFFRES[0].emblemes[0];
  check('un coffre de bois : après ses fragments, deux nombres de hasard pour son autocollant', alea.appels() === 6 && o.pieces.length === 1);
  check('… la rareté vient de la table, l’autocollant du second nombre : le premier commun de la première collection',
    egal(o.pieces, [{ piece: premiere, rarete: 'commune', doublon: false, eclats: 0 }]) && o.profil.pieces.includes(premiere));
  check('… le premier autocollant reçu se porte d’office', o.profil.blason.embleme === premiere && depart.blason.embleme === null);
  check('… les Éclats du coffre : sa part fixe, 5', o.eclats === 5 && o.profil.eclats === 5);
  check('… les événements : le coffre (ses Éclats, sa pièce nouvelle), puis la pièce',
    egal(o.evenements[0], { type: 'coffreOuvert', coffre: 'bois', origine: 'victoire', fragments: o.evenements[0].fragments, eclats: 5, pieces: [premiere] })
    && egal(parType(o.evenements, 'piece'), [{ type: 'piece', piece: premiere, origine: 'coffre', doublon: false, eclats: 0 }]));
  // Le même autocollant, une seconde fois.
  const encore = ouvrirCoffre(avecCoffre(o.profil, 'bois'), 0, aleaEcrit(0, 0, 0, 0, 0.5, 0));
  check('un autocollant en double devient des Éclats : 5 pour un commun, en plus des 5 du coffre',
    egal(encore.pieces, [{ piece: premiere, rarete: 'commune', doublon: true, eclats: 5 }]) && encore.eclats === 10 && encore.profil.eclats === 15
    && encore.profil.pieces.filter((id) => id === premiere).length === 1 && egal(encore.evenements[0].pieces, []));
  const bornes = (table, n) => ouvrirCoffre(avecCoffre(profilNeuf(), table), 0, aleaEcrit(...Array(R.coffres[table].tirages.reduce((s, g) => s + g.nombre * 2, 0)).fill(0), n, 0)).pieces[0].rarete;
  check('les bornes des tables : bois 899 commune, 900 rare ; argent 749 commune, 750 et 969 rare, 970 épique ; or 499 commune, 500 rare, 900 épique',
    egal([bornes('bois', 0.8995), bornes('bois', 0.9005), bornes('argent', 0.7495), bornes('argent', 0.7505), bornes('argent', 0.9695), bornes('argent', 0.9705), bornes('or', 0.4995), bornes('or', 0.5005), bornes('or', 0.9005)],
      ['commune', 'rare', 'commune', 'rare', 'rare', 'epique', 'commune', 'rare', 'epique']));
  const leg = ouvrirCoffre(avecCoffre(profilNeuf(), 'legendaire'), 0, aleaDeGraine(12));
  check('un coffre légendaire : deux autocollants, rares ou épiques, et 50 Éclats', leg.pieces.length === 2 && leg.pieces.every((x) => x.rarete !== 'commune') && leg.eclats >= 50);
  // Les seuils d'une collection des coffres.
  const col = DES_COFFRES[0];
  const deux = avecPieces(profilNeuf(), col.emblemes[1], col.emblemes[2]);
  const trois = ouvrirCoffre(avecCoffre(deux, 'bois'), 0, aleaEcrit(0, 0, 0, 0, 0.5, 0));
  check('le troisième autocollant d’une collection donne son grade', trois.profil.pieces.includes(`${col.id}.grade`)
    && egal(parType(trois.evenements, 'piece').map((e) => [e.piece, e.origine]), [[col.emblemes[0], 'coffre'], [`${col.id}.grade`, 'collection']]));
  const cinq = avecPieces(profilNeuf(), ...col.emblemes.slice(1, 6));
  const six = ouvrirCoffre(avecCoffre(cinq, 'bois'), 0, aleaEcrit(0, 0, 0, 0, 0.5, 0));
  check('le sixième donne sa bannière (et le grade, s’il manquait)', six.profil.pieces.includes(`${col.id}.banniere`) && six.profil.pieces.includes(`${col.id}.grade`) && !six.profil.pieces.includes(`${col.id}.cadre`));
  const huit = avecPieces(profilNeuf(), ...col.emblemes.slice(1));
  const neuf = ouvrirCoffre(avecCoffre(huit, 'bois'), 0, aleaEcrit(0, 0, 0, 0, 0.5, 0));
  check('le neuvième finit la collection : son cadre et son épithète', ['grade', 'banniere', 'cadre', 'epithete'].every((court) => neuf.profil.pieces.includes(`${col.id}.${court}`))
    && avancementDe(neuf.profil, col.id).complete && egal(avancementDe(neuf.profil, col.id), { reunis: 9, total: 9, pieces: 13, toutes: 13, complete: true }));
  check('… ces pièces ne se donnent qu’une fois', regulariser(neuf.profil).evenements.length === 0);
  // Ce qui sort des coffres : les collections des coffres, et rien d'autre.
  let p = profilNeuf();
  const hasard = aleaDeGraine(2026);
  const sorties = new Set();
  let ouverts = 0;
  for (let i = 0; i < 1500; i++) {
    const r = ouvrirCoffre(avecCoffre(p, ['bois', 'argent', 'or', 'legendaire'][i % 4]), 0, hasard);
    for (const x of r.pieces) sorties.add(x.piece);
    p = r.profil; ouverts++;
  }
  const reserve = DES_COFFRES.flatMap((c) => c.emblemes);
  check(`${ouverts} coffres : tous les autocollants des coffres finissent par sortir, et jamais une pièce de la boutique, d’une saison ou des ligues`,
    reserve.every((id) => sorties.has(id)) && [...sorties].every((id) => reserve.includes(id)), `${sorties.size} sur ${reserve.length}`);
  check('… toutes les collections des coffres sont alors finies, les autres intactes',
    DES_COFFRES.every((c) => avancementDe(p, c.id).complete) && COLLECTIONS.filter((c) => !['coffres', 'depart'].includes(c.source)).every((c) => avancementDe(p, c.id).pieces === 0));
  // L'affichage des chances.
  const t = probabilitesDe('argent');
  check('les chances affichées d’un coffre d’argent : son autocollant (75 %, 22 %, 3 %), ce que rend un doublon, ses 10 Éclats',
    t.pieces.nombre === 1 && t.pieces.total === 1000 && egal(t.pieces.lignes.map((l) => [l.categorie, l.pourCent, l.doublon]), [['commune', 75, 5], ['rare', 22, 15], ['epique', 3, 50]]) && t.eclats === 10);
  check('… des pour-cent ronds pour tous les coffres', Object.keys(R.coffres).every((type) => probabilitesDe(type).pieces.lignes.every((l) => Number.isInteger(l.pourCent))));
}

// --- Les Éclats achètent ce qui manque --------------------------------------------------------
console.log('\n--- Les Éclats ---');
{
  const JOUR = '2026-10-09';
  const commune = DES_COFFRES[0].emblemes[0], rare = DES_COFFRES[0].emblemes[5], epique = DES_COFFRES[0].emblemes[8];
  const riche = { ...profilNeuf(), eclats: 1000 };
  const choix = catalogueBoutique(riche, 0, JOUR).selection;
  const hors = (id) => !choix.some((x) => x.piece === id);
  check('un autocollant des coffres vaut 30, 100 ou 300 Éclats selon sa rareté',
    [commune, rare, epique].filter(hors).every((id) => prixDePiece(riche, id, JOUR) === C.eclats.prix[PIECES[id].rarete]) && egal(C.eclats.prix, { commune: 30, rare: 100, epique: 300 }));
  check('la sélection du jour : trois autocollants qui manquent, à moitié prix, en chiffres ronds',
    choix.length === 3 && choix.every((x) => !riche.pieces.includes(x.piece) && x.prix * 2 === x.prixPlein && prixDePiece(riche, x.piece, JOUR) === x.prix));
  check('… la même toute la journée, une autre le lendemain',
    egal(catalogueBoutique(riche, 99, JOUR).selection, choix) && !egal(catalogueBoutique(riche, 0, '2026-10-10').selection, choix));
  const unDeMoins = acheterPiece(riche, choix[0].piece, JOUR).profil;
  check('… un autocollant acheté en sort, et aucun autre ne prend sa place : il en reste deux, les mêmes',
    egal(catalogueBoutique(unDeMoins, 0, JOUR).selection.map((x) => x.piece), [choix[1].piece, choix[2].piece]) && catalogueBoutique(unDeMoins, 0, JOUR).selectionPrise === 1);
  let vide = riche, payes = 0;
  for (const x of choix) { payes += x.prix; vide = acheterPiece(vide, x.piece, JOUR).profil; }
  check('… les trois pris, la sélection est vide jusqu’au lendemain, et tout autre autocollant est à son prix',
    catalogueBoutique(vide, 0, JOUR).selection.length === 0 && catalogueBoutique(vide, 0, JOUR).selectionPrise === 3 && vide.eclats === 1000 - payes
    && DES_COFFRES.flatMap((c) => c.emblemes).filter((id) => !vide.pieces.includes(id)).every((id) => prixDePiece(vide, id, JOUR) === C.eclats.prix[PIECES[id].rarete])
    && catalogueBoutique(vide, 0, '2026-10-10').selection.length === 3);
  check('… en une journée, on n’achète jamais plus de trois autocollants à prix réduit',
    (() => { let p = { ...profilNeuf(), eclats: 99999 }, reduits = 0; for (const id of DES_COFFRES.flatMap((c) => c.emblemes)) { const prix = prixDePiece(p, id, JOUR); if (prix === null) continue; if (prix < C.eclats.prix[PIECES[id].rarete]) reduits++; p = acheterPiece(p, id, JOUR).profil; } return reduits === 3 && DES_COFFRES.every((c) => avancementDe(p, c.id).complete); })());
  check('… un autocollant acheté à son prix, hors sélection, n’entame pas la sélection',
    (() => { const hors = DES_COFFRES.flatMap((c) => c.emblemes).find((id) => !choix.some((x) => x.piece === id)); const p = acheterPiece(riche, hors, JOUR).profil; return catalogueBoutique(p, 0, JOUR).selection.length === 3 && catalogueBoutique(p, 0, JOUR).selectionPrise === 0; })());
  check('… le compte des achats du jour survit à un aller-retour, et un compte abîmé repart de zéro',
    egal(migrerProfil(JSON.parse(JSON.stringify(unDeMoins))).selection, { jour: JOUR, achats: 1 })
    && [{ jour: 'hier', achats: 2 }, { jour: JOUR, achats: -4 }, 'trois', null].every((v) => { const s = migrerProfil({ ...profilNeuf(), selection: v }).selection; return s.achats === 0 || (s.jour === JOUR && s.achats >= 0); }));
  check('… sans jour lisible, pas de sélection : chacun à son prix', catalogueBoutique(riche, 0).selection.length === 0 && prixDePiece(riche, choix[0].piece) === choix[0].prixPlein);
  const achat = acheterPiece(riche, choix[0].piece, JOUR);
  check('acheter un autocollant : les Éclats partent, la pièce arrive',
    achat.profil.eclats === 1000 - choix[0].prix && achat.profil.pieces.includes(choix[0].piece)
    && egal(achat.evenements.slice(0, 2).map((e) => e.type), ['eclats', 'piece']) && achat.profil.journal.at(-1).piece === choix[0].piece);
  check('… pas deux fois, pas sans les Éclats, et jamais une pièce qui ne sort pas des coffres',
    acheterPiece(achat.profil, choix[0].piece, JOUR).erreur === 'pasEnVente'
    && egal(acheterPiece({ ...profilNeuf(), eclats: 4 }, commune, '2026-01-01'), { erreur: 'fonds', manque: prixDePiece(profilNeuf(), commune, '2026-01-01') - 4 })
    && ['cour.roi-grenouille', 'citrouilles.citrouille-casquee', 'ligues.recrue', `${DES_COFFRES[0].id}.cadre`, 'depart.cadre', 'rien'].every((id) => prixDePiece(riche, id, JOUR) === null && acheterPiece(riche, id, JOUR).erreur === 'pasEnVente'));
  // Les Couronnes n'achètent pas d'Éclats, les Éclats pas de Couronnes : deux bourses séparées.
  check('acheter un autocollant ne touche pas aux Couronnes', acheterPiece({ ...riche, couronnes: 70 }, commune, '2026-01-01').profil.couronnes === 70);
}

// --- Une collection vendue entière ---------------------------------------------------------------
console.log('\n--- La collection de la boutique ---');
{
  const lot = catalogueBoutique(profilNeuf(), 0, '2026-10-09').collections;
  check('la boutique vend une collection entière : La Cour, 300 Couronnes, ses treize pièces affichées',
    lot.length === 1 && lot[0].collection === 'cour' && lot[0].prix === 300 && lot[0].pieces.length === 13 && lot[0].manquantes.length === 13);
  const achat = acheterCollection({ ...profilNeuf(), couronnes: 350 }, 'cour');
  check('l’acheter : 300 Couronnes, les neuf autocollants, le grade, la bannière, le cadre et l’épithète d’un coup',
    achat.profil.couronnes === 50 && collection('cour').pieces.every((id) => achat.profil.pieces.includes(id)) && avancementDe(achat.profil, 'cour').complete
    && parType(achat.evenements, 'piece').length === 13 && achat.evenements[0].type === 'couronnes');
  check('… rien d’aléatoire : deux achats donnent exactement les mêmes pièces',
    egal(acheterCollection({ ...profilNeuf(), couronnes: 300 }, 'cour').profil.pieces, achat.profil.pieces));
  check('… pas deux fois, pas sans les Couronnes, et seulement une collection de la boutique',
    acheterCollection(achat.profil, 'cour').erreur === 'dejaPossedee' && egal(acheterCollection({ ...profilNeuf(), couronnes: 299 }, 'cour'), { erreur: 'fonds', manque: 1 })
    && ['bassecour', 'citrouilles', 'ligues', 'depart', 'rien'].every((id) => acheterCollection({ ...profilNeuf(), couronnes: 9999 }, id).erreur === 'pasEnVente'));
  check('… et elle ne touche pas aux Éclats', achat.profil.eclats === 0);
}

// --- Le blason ---------------------------------------------------------------------------------
console.log('\n--- Le blason ---');
{
  const p = avecPieces(profilNeuf(), 'monstres.grade', 'banquet.epithete', 'sables.cadre', 'maree.banniere', 'gaffes.general-boulette');
  let b = p;
  for (const [genre, id] of [['grade', 'monstres.grade'], ['epithete', 'banquet.epithete'], ['cadre', 'sables.cadre'], ['banniere', 'maree.banniere'], ['embleme', 'gaffes.general-boulette']]) b = equiper(b, genre, id).profil;
  check('porter ses pièces : le titre se compose de deux mots — « Dompteur du Banquet »', titreDe(b) === 'Dompteur du Banquet' && titreDuBlason(b.blason) === 'Dompteur du Banquet'
    && egal(b.blason, { embleme: 'gaffes.general-boulette', cadre: 'sables.cadre', banniere: 'maree.banniere', grade: 'monstres.grade', epithete: 'banquet.epithete' }));
  check('… on peut retirer l’autocollant et la suite du titre, jamais le cadre, la bannière ni le premier mot',
    equiper(b, 'embleme', null).profil.blason.embleme === null && titreDe(equiper(b, 'epithete', null).profil) === 'Dompteur'
    && ['cadre', 'banniere', 'grade'].every((genre) => equiper(b, genre, null).erreur === 'obligatoire'));
  check('… on ne porte ni ce qu’on n’a pas, ni une pièce à la place d’une autre',
    equiper(p, 'embleme', 'maree.requin-couronne').erreur === 'pasPossedee' && equiper(p, 'cadre', 'maree.banniere').erreur === 'genre'
    && equiper(p, 'chapeau', 'sables.cadre').erreur === 'genre' && equiper(p, 'grade', 'rien').erreur === 'genre');
  const sansRien = equiper(b, 'embleme', null).profil;
  const apresCoffre = ouvrirCoffre(avecCoffre(sansRien, 'bois'), 0, aleaEcrit(0, 0, 0, 0, 0.5, 0)).profil;
  check('« aucun autocollant » est un choix qu’on respecte : le suivant ne se pose pas tout seul', apresCoffre.pieces.length === sansRien.pieces.length + 1 && apresCoffre.blason.embleme === null);
  check('porter une pièce compte comme une opération : c’est ce qui la fait recopier dans le rangement durable',
    equiper(p, 'cadre', 'sables.cadre').profil.operations === (p.operations || 0) + 1 && equiper(p, 'cadre', 'sables.cadre').profil.journal.at(-1).op === 'blason');
  check('le blason ne change rien à une partie : il n’est dans aucun réglage de partie', !/blason|pieces/.test(fs.readFileSync(path.join(RACINE, 'js/game.js'), 'utf8')));
  // Le dessin.
  const embleme = htmlEmbleme('bassecour.roi-des-cochons');
  check('un autocollant est une case de sa planche : la neuvième, en bas à droite', /background-image:url\(assets\/collections\/bassecour\.webp\);background-position:100% 100%/.test(embleme) && /aria-label="Le Roi des cochons"/.test(embleme));
  check('… celui qu’on n’a pas se montre en silhouette', /class="piece-embleme manque/.test(htmlEmbleme('bassecour.roi-des-cochons', { manque: true })));
  const cadres = Object.keys(PIECES).filter((id) => PIECES[id].genre === 'cadre');
  const bannieres = Object.keys(PIECES).filter((id) => PIECES[id].genre === 'banniere');
  check(`les ${cadres.length} cadres se tracent : un dessin cerné d’encre, sans nombre illisible`,
    cadres.every((id) => { const s = svgCadre(id); return /^<svg class="piece-cadre" viewBox="0 0 100 100"/.test(s) && s.includes('#17120e') && !/NaN|undefined|Infinity/.test(s); }));
  check(`les ${bannieres.length} bannières aussi, chacune à ses deux couleurs`,
    bannieres.every((id) => { const s = svgBanniere(id); return s.includes(PIECES[id].fond) && s.includes(PIECES[id].trait) && !/NaN|undefined|Infinity/.test(s); }));
  check('deux cadres de formes différentes ne donnent pas le même dessin', new Set(FORMES.map((forme) => svgCadre(cadres.find((id) => PIECES[id].forme === forme)))).size === FORMES.length,
    FORMES.filter((forme) => !cadres.some((id) => PIECES[id].forme === forme)).join(', '));
  const carte = htmlBlason(b.blason, { sous: 'Ligue de Bois' });
  check('la carte de joueur : la bannière, le médaillon, l’autocollant, le titre', /piece-banniere/.test(carte) && /blason-medaillon/.test(carte) && /gaffes\.webp/.test(carte) && /<b>Dompteur du Banquet<\/b><small>Ligue de Bois<\/small>/.test(carte));
  check('une pièce inconnue ne casse rien : le cadre et la bannière de départ, pas d’autocollant',
    svgCadre('rien') === svgCadre('depart.cadre') && svgBanniere(null) === svgBanniere('depart.banniere') && htmlPiece('rien') === '' && /blason-vide/.test(htmlBlason(null)));
}

// --- Le calendrier des saisons ---------------------------------------------------------------------
console.log('\n--- Le calendrier ---');
{
  check('une saison par mois : octobre 2026 est la saison 1, novembre la 2, octobre 2027 la 13',
    egal(['2026-10-01', '2026-10-31', '2026-11-01', '2026-12-31', '2027-01-01', '2027-10-15'].map(saisonDuJour), [1, 1, 2, 3, 4, 13]) && S.premiere === '2026-10');
  check('… avant la première, c’est encore la saison 1 ; un jour illisible n’a pas de saison', saisonDuJour('2026-09-30') === 1 && saisonDuJour('demain') === null && saisonDuJour('2026-13-01') === null);
  check('ce qu’il reste d’une saison, ce jour compris : 23 jours le 9 octobre, 1 le dernier jour, 29 le 1er février 2028',
    egal(['2026-10-09', '2026-10-31', '2026-12-31', '2028-02-01', '2027-02-01'].map(joursRestants), [23, 1, 1, 29, 28]) && joursRestants('hier') === null);
  check('les thèmes se suivent, puis recommencent : Citrouilles, Tournoi, Grand Froid, Citrouilles', egal([1, 2, 3, 4, 5].map(themeDeSaison), ['citrouilles', 'tournoi', 'froid', 'citrouilles', 'tournoi']));
}

// --- La route ----------------------------------------------------------------------------------------
console.log('\n--- La route ---');
{
  const route = S.route;
  const compte = (voie, cle) => route.filter((l) => l[voie][cle] !== undefined).length;
  check('trente paliers de cent points, deux voies pleines', route.length === 30 && S.paliers === 30 && S.pointsParPalier === 100 && route.every((l) => Object.keys(l.gratuit).length === 1 && Object.keys(l.passe).length === 1));
  check('LA RÈGLE : la voie du Passe ne contient ni coffre, ni fragment, ni niveau — que des pièces, des Couronnes et des Éclats',
    route.every((l) => ['embleme', 'piece', 'couronnes', 'eclats'].includes(Object.keys(l.passe)[0])) && !/coffre|fragment|niveau/.test(JSON.stringify(route.map((l) => l.passe))));
  check('la voie gratuite : 8 coffres, 150 Couronnes, 6 autocollants, des Éclats',
    compte('gratuit', 'coffre') === 8 && somme(route.map((l) => l.gratuit.couronnes || 0)) === 150 && compte('gratuit', 'embleme') === 6 && compte('gratuit', 'eclats') === 13);
  check('la voie du Passe : 12 autocollants, la bannière, le cadre, le grade et l’épithète de la saison, 400 Couronnes, des Éclats',
    compte('passe', 'embleme') === 12 && egal(route.map((l) => l.passe.piece).filter(Boolean).sort(), ['banniere', 'cadre', 'epithete', 'grade'])
    && somme(route.map((l) => l.passe.couronnes || 0)) === 400 && compte('passe', 'eclats') === 10);
  const rangs = route.flatMap((l) => [l.gratuit.embleme, l.passe.embleme]).filter((x) => x !== undefined).sort((a, b) => a - b);
  check('les dix-huit autocollants de la saison sont sur la route, chacun une fois ; le dernier palier du Passe donne le plus rare',
    egal(rangs, [...Array(18).keys()]) && route[29].passe.embleme === 17 && DE_SAISON.every((c) => PIECES[c.emblemes[17]].rarete === 'epique'));
  check('le Passe : 500 Couronnes, dont 400 reviennent à qui finit la route', S.passe.prix === 500);
  check('toute récompense de la route existe, pour chaque saison, sur les deux voies',
    [1, 2, 3].every((n) => route.every((l, i) => ['gratuit', 'passe'].every((voie) => { const r = recompenseDePalier(n, voie, i + 1); return r && (r.genre !== 'piece' || PIECES[r.piece].collection === themeDeSaison(n)); }))));
  check('… une récompense : un coffre, des Couronnes, des Éclats ou une pièce de la collection de la saison',
    egal(recompenseDePalier(1, 'gratuit', 2), { genre: 'coffre', coffre: 'bois' }) && egal(recompenseDePalier(1, 'gratuit', 3), { genre: 'piece', piece: 'citrouilles.citrouille-casquee' })
    && egal(recompenseDePalier(2, 'passe', 5), { genre: 'piece', piece: 'tournoi.banniere' }) && egal(recompenseDePalier(1, 'passe', 3), { genre: 'couronnes', couronnes: 100 })
    && recompenseDePalier(1, 'gratuit', 31) === null && recompenseDePalier(1, 'autre', 1) === null);

  // Les points.
  const J = '2026-10-09';
  const v1 = appliquerResultat(profilNeuf(), partie('victoire', J));
  check('une victoire, la première du jour : 20 + 20 + 40 = 80 points de saison',
    v1.profil.route.points === 80 && egal(parType(v1.evenements, 'pointsDeSaison'), [{ type: 'pointsDeSaison', variation: 80, total: 80, palier: 0, paliersGagnes: 0, premiereVictoireDuJour: true }]));
  const v2 = appliquerResultat(v1.profil, partie('victoire', J));
  check('la seconde victoire du jour : 40, et le premier palier s’ouvre', v2.profil.route.points === 120 && parType(v2.evenements, 'pointsDeSaison')[0].paliersGagnes === 1 && parType(v2.evenements, 'pointsDeSaison')[0].palier === 1);
  const d = appliquerResultat(v2.profil, partie('defaite', J));
  check('une défaite jouée jusqu’au bout : 20 points', d.profil.route.points === 140);
  check('une défaite d’avant deux minutes : rien', appliquerResultat(v2.profil, partie('defaite', J, { duree: 60 })).profil.route.points === 120);
  const lendemain = appliquerResultat(d.profil, partie('victoire', '2026-10-10'));
  check('le lendemain, la première victoire rapporte de nouveau son supplément', lendemain.profil.route.points === 220);
  check('une égalité : 20 points, sans entamer la première victoire du jour',
    appliquerResultat(profilNeuf(), partie('egalite', J)).profil.route.points === 20 && appliquerResultat(appliquerResultat(profilNeuf(), partie('egalite', J)).profil, partie('victoire', J)).profil.route.points === 100);
  const plein = appliquerResultat(enRoute(2990), partie('victoire', J));
  check('au bout de la route, les points s’arrêtent', plein.profil.route.points === 3000 && parType(plein.evenements, 'pointsDeSaison')[0].variation === 10
    && appliquerResultat(plein.profil, partie('victoire', '2026-10-11')).profil.route.points === 3000);
  check('des chiffres ronds partout : les points, les prix, les Éclats', [...Object.values(S.points), S.pointsParPalier, S.passe.prix, ...Object.values(C.eclats.parCoffre), ...Object.values(C.eclats.doublon), ...Object.values(C.eclats.prix)].every((n) => Number.isInteger(n) && n % 5 === 0));

  // Prendre.
  const p = enRoute(350);
  check('350 points : trois paliers ouverts', etatDeLaSaison(p, J).palier === 3 && etatDeLaSaison(p, J).versLeSuivant === 50 && etatDeLaSaison(p, J).aPrendre === 3);
  const un = prendrePalier(p, 'gratuit', 1);
  check('prendre le palier 1 : 20 Éclats', un.profil.eclats === 20 && egal(un.profil.route.pris.gratuit, [1]) && egal(un.evenements.map((e) => e.type), ['palierPris', 'eclats']));
  const deux = prendrePalier(un.profil, 'gratuit', 2);
  check('… le palier 2 : un coffre de bois, venu de la route', deux.profil.coffres.length === 1 && egal(deux.profil.coffres[0], { type: 'bois', origine: 'route' }));
  const trois = prendrePalier(deux.profil, 'gratuit', 3);
  check('… le palier 3 : l’autocollant « Citrouille casquée », aussitôt porté', trois.profil.pieces.includes('citrouilles.citrouille-casquee') && trois.profil.blason.embleme === 'citrouilles.citrouille-casquee');
  check('… pas deux fois, pas avant d’y être, pas un palier qui n’existe pas',
    prendrePalier(un.profil, 'gratuit', 1).erreur === 'dejaPris' && prendrePalier(p, 'gratuit', 4).erreur === 'pasAtteint'
    && [0, 31, 1.5, '1'].every((n) => prendrePalier(p, 'gratuit', n).erreur === 'palier') && prendrePalier(p, 'or', 1).erreur === 'palier');
  check('… la voie du Passe est fermée sans le Passe', prendrePalier(p, 'passe', 1).erreur === 'passe' && etatDeLaSaison(p, J).route[0].passe.etat === 'ferme');
  const tout = prendreTout(p);
  check('« Tout prendre » : les trois paliers gratuits d’un coup', egal(tout.profil.route.pris, { gratuit: [1, 2, 3], passe: [] }) && tout.profil.eclats === 20 && tout.profil.coffres.length === 1
    && prendreTout(tout.profil).erreur === 'rien');

  // Le Passe.
  check('le Passe se paie en Couronnes : sans 500, on ne l’a pas', egal(acheterPasse({ ...p, couronnes: 499 }), { erreur: 'fonds', manque: 1 }));
  const passe = acheterPasse({ ...tout.profil, couronnes: 520 });
  check('… avec : 500 Couronnes en moins, la seconde voie ouverte', passe.profil.couronnes === 20 && passe.profil.route.passe === true
    && egal(passe.evenements, [{ type: 'couronnes', variation: -500, origine: 'passe', total: 20 }, { type: 'passe', saison: 1 }]) && acheterPasse(passe.profil).erreur === 'dejaPris');
  check('… acheté en cours de route, il donne les paliers déjà atteints : trois à prendre', etatDeLaSaison(passe.profil, J).aPrendre === 3
    && etatDeLaSaison(passe.profil, J).route.slice(0, 4).map((l) => l.passe.etat).join() === 'aPrendre,aPrendre,aPrendre,aVenir');
  const pris = prendreTout(passe.profil);
  check('… un autocollant, 40 Éclats, 100 Couronnes', pris.profil.pieces.includes('citrouilles.araignee-au-hamac') && pris.profil.eclats === 60 && pris.profil.couronnes === 120);
  // Toute la route, les deux voies.
  const bout = prendreTout(acheterPasse({ ...enRoute(3000), couronnes: 500 }).profil);
  check('la route entière avec le Passe : toute la collection de la saison sauf son étendard et son grade de champion, 550 Couronnes, 660 Éclats, 8 coffres',
    collection('citrouilles').pieces.filter((id) => !bout.profil.pieces.includes(id)).join() === 'citrouilles.etendard,citrouilles.champion'
    && bout.profil.couronnes === 550 && bout.profil.eclats === 660 && bout.profil.coffres.length === 8, `${bout.profil.couronnes} Couronnes, ${bout.profil.eclats} Éclats, ${bout.profil.coffres.length} coffres`);
  check('… sans le Passe : 6 autocollants, 150 Couronnes, 260 Éclats, 8 coffres — et aucune pièce de la voie payante',
    (() => { const g = prendreTout(enRoute(3000)).profil; return g.pieces.filter((id) => PIECES[id].collection === 'citrouilles').length === 6 && g.couronnes === 150 && g.eclats === 260 && g.coffres.length === 8; })());
}

// --- D'une saison à l'autre ------------------------------------------------------------------------
console.log('\n--- D’une saison à l’autre ---');
{
  const p = { ...enRoute(450), elo: 950, ligue: 5, plusHauteLigue: 5, promotions: [2, 3, 4, 5] };
  check('dans le mois de sa saison, rien ne bouge', ouvrirLaSaison(p, '2026-10-31').evenements.length === 0 && egal(ouvrirLaSaison(p, '2026-10-31').profil, migrerProfil(p)));
  const r = ouvrirLaSaison(p, '2026-11-01');
  check('le mois tourne : la saison 2 commence, la route repart de zéro, le Passe est à reprendre',
    r.profil.saison === 2 && egal(r.profil.route, { points: 0, passe: false, pris: { gratuit: [], passe: [] } }) && etatDeLaSaison(r.profil, '2026-11-01').theme === 'tournoi');
  check('… les paliers atteints et pas pris sont donnés : quatre, sur la voie gratuite',
    parType(r.evenements, 'palierPris').length === 4 && parType(r.evenements, 'palierPris').every((e) => e.voie === 'gratuit' && e.saison === 1) && r.profil.pieces.includes('citrouilles.citrouille-casquee'));
  check('… puis la récompense de la ligue (un coffre d’or en ligue 5) et le classement resserré : 950 repart à 850',
    r.profil.coffres.some((c) => c.type === 'or' && c.origine === 'saison') && r.profil.elo === 850 && egal(r.profil.saisons, [{ numero: 1, ligue: 5, elo: 950 }]));
  check('… les événements, dans l’ordre : les paliers, la récompense, la remise, la saison',
    egal([...new Set(r.evenements.map((e) => e.type))], ['palierPris', 'eclats', 'coffre', 'piece', 'recompenseSaison', 'remiseDeSaison', 'saison']), [...new Set(r.evenements.map((e) => e.type))].join(', '));
  check('… une seule fois : rouvrir le même jour ne redonne rien', ouvrirLaSaison(r.profil, '2026-11-01').evenements.length === 0);
  const loin = ouvrirLaSaison(p, '2027-03-15');
  check('trois mois d’absence : une seule remise, et l’on reprend à la saison du jour', loin.profil.saison === 6 && loin.profil.elo === 850 && loin.profil.saisons.length === 1 && parType(loin.evenements, 'remiseDeSaison').length === 1);
  check('une horloge qui recule ne ramène pas à la saison d’avant', ouvrirLaSaison(r.profil, '2026-10-15').profil.saison === 2 && ouvrirLaSaison(r.profil, 'n’importe quoi').evenements.length === 0);
  const nouveau = appliquerResultat(profilNeuf(), partie('victoire', '2026-11-03'));
  check('un joueur arrivé en novembre n’a pas de saison à finir : il rejoint la saison 2 sans annonce ni saison fantôme',
    nouveau.profil.saison === 2 && nouveau.profil.saisons.length === 0 && !nouveau.evenements.some((e) => ['saison', 'remiseDeSaison', 'recompenseSaison'].includes(e.type))
    && nouveau.profil.route.points === 80);
  const arrive = ouvrirLaSaison(profilNeuf(), '2026-12-05');
  check('… pareil à l’ouverture du jeu : la saison du jour, aucun événement', arrive.profil.saison === 3 && arrive.evenements.length === 0 && arrive.profil.journal.length === 0);
  check('… mais qui a joué, même une seule partie, a bien une saison à clore', ouvrirLaSaison(nouveau.profil, '2026-12-05').evenements.some((e) => e.type === 'saison'));
  check('au journal, la fin de saison garde son numéro d’opération et dit la saison finie',
    (() => { const e = r.profil.journal.at(-1); return e.op === 'saison' && e.saison === 1 && e.numero === r.profil.operations; })());
  const jouee = appliquerResultat(p, partie('victoire', '2026-11-02'));
  check('une partie jouée le mois suivant ferme d’abord la saison, puis compte pour la nouvelle',
    jouee.profil.saison === 2 && jouee.profil.route.points === 80 && jouee.profil.elo === 880 && jouee.evenements.findIndex((e) => e.type === 'saison') < jouee.evenements.findIndex((e) => e.type === 'elo'));
  const avecPasse = ouvrirLaSaison({ ...p, route: { points: 450, passe: true, pris: { gratuit: [1, 2, 3, 4], passe: [1] } } }, '2026-11-01');
  check('avec le Passe : ses paliers atteints sont donnés aussi, et le Passe ne vaut que pour sa saison',
    parType(avecPasse.evenements, 'palierPris').map((e) => `${e.voie}${e.palier}`).join() === 'passe2,passe3,passe4' && avecPasse.profil.route.passe === false);
  // Les plus hautes ligues.
  const haut = finDeSaison({ ...profilNeuf(), elo: 3200, ligue: 9, plusHauteLigue: 9 });
  check('finir en ligue 9 : l’étendard de la saison', haut.profil.pieces.includes('citrouilles.etendard') && !haut.profil.pieces.includes('citrouilles.champion')
    && egal(parType(haut.evenements, 'recompenseSaison')[0].cadeaux, ['citrouilles.etendard']));
  const legende = finDeSaison({ ...profilNeuf(), saison: 2, elo: 4100, ligue: 10, plusHauteLigue: 10 });
  check('finir en ligue 10, saison 2 : l’étendard du Tournoi et le grade « Roi de la joute »', ['tournoi.etendard', 'tournoi.champion'].every((id) => legende.profil.pieces.includes(id)) && PIECES['tournoi.champion'].nom === 'Roi de la joute');
  // Un thème qui revient : la route dit d'avance ce qu'on a déjà.
  const collectionneur = { ...enRoute(0), saison: 4, pieces: [...profilNeuf().pieces, ...collection('citrouilles').pieces] };
  const revenue = etatDeLaSaison(collectionneur, '2027-01-05');
  check('quand le thème d’une saison revient, chaque pièce déjà possédée est signalée sur la route, avec les Éclats qu’elle rendra',
    revenue.theme === 'citrouilles' && revenue.route.every((l) => ['gratuit', 'passe'].every((v) => (l[v].recompense.genre === 'piece') === l[v].dejaLa && (l[v].dejaLa ? l[v].eclats > 0 : l[v].eclats === 0)))
    && revenue.route.filter((l) => l.passe.dejaLa).length === 16 && etatDeLaSaison(enRoute(0), '2026-10-09').route.every((l) => !l.gratuit.dejaLa && !l.passe.dejaLa));
  const redite = finDeSaison({ ...haut.profil, saison: 4, elo: 3200, ligue: 9 });
  check('la même collection, trois saisons plus tard : une pièce déjà gagnée devient des Éclats', parType(redite.evenements, 'piece').some((e) => e.piece === 'citrouilles.etendard' && e.doublon && e.eclats === C.eclats.doublon.epique)
    && redite.profil.eclats === haut.profil.eclats + C.eclats.doublon.epique);
}

// --- Les écrans ---------------------------------------------------------------------------------------
console.log('\n--- Les écrans ---');
{
  const memoire = new Map();
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); } }, configurable: true, writable: true });
  const noeud = { innerHTML: '', classList: { add() {}, remove() {} }, querySelector: () => null };
  let clic = null;
  Object.defineProperty(globalThis, 'document', { value: { getElementById: (id) => (id === 'progression' ? noeud : null), addEventListener: (t, f) => { if (t === 'click') clic = f; } }, configurable: true, writable: true });
  const toucher = (dataset) => clic({ target: { closest: () => ({ dataset }) } });
  const texte = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const lu = () => JSON.parse(memoire.get(PROGRESSION_KEY));
  const poser = (profil) => memoire.set(PROGRESSION_KEY, JSON.stringify(profil));
  const propre = (html) => !/\p{Extended_Pictographic}/u.test(html) && !/undefined|NaN|\[object/.test(html) && !/\d[,.]\d/.test(texte(html));
  installerProgression({});
  reglerPeuple('atlante');
  const mois = new Date();
  const aujourdhui = `${mois.getFullYear()}-${String(mois.getMonth() + 1).padStart(2, '0')}-${String(mois.getDate()).padStart(2, '0')}`;
  const saison = saisonDuJour(aujourdhui), theme = collection(themeDeSaison(saison));
  const col = DES_COFFRES[0];
  const base = { ...profilNeuf(), saison, eclats: 400, couronnes: 520, pieces: [...profilNeuf().pieces, col.emblemes[0], col.emblemes[1], 'ligues.recrue'], route: { points: 250, passe: false, pris: { gratuit: [1], passe: [] } } };
  base.blason = { ...base.blason, embleme: col.emblemes[0] };
  poser(base);

  // L'accueil.
  const bandeau = htmlBandeau(migrerProfil(base));
  check('l’accueil : le médaillon du joueur ouvre son blason, son titre est sur la pastille de la ligue, les deux bourses ouvrent la boutique',
    /class="prog-joueur" data-ecran="blason"/.test(bandeau) && /<b>Villageois<\/b>\s*<small>Ligue de Bois · 0 Elo<\/small>/.test(bandeau)
    && /class="prog-bourses" data-ecran="boutique"[^>]*>[\s\S]*400[\s\S]*520/.test(bandeau) && propre(bandeau));
  check('… cinq tuiles dans le bandeau (la sixième, « Aide », est dans la page) : Coffres, Troupes, Album, Saison, Boutique',
    egal([...bandeau.matchAll(/class="btn small[^"]*" data-ecran="(\w+)"/g)].map((m) => m[1]), ['coffres', 'troupes', 'album', 'saison', 'boutique']));
  check('… la tuile de la saison compte les paliers à prendre : un', /data-ecran="saison">[\s\S]*?Saison <b class="prog-pastille">1<\/b>/.test(bandeau));
  check('… et signale d’un « ! » une saison qui attend d’être ouverte', /Saison <b class="prog-pastille">!<\/b>/.test(htmlBandeau(migrerProfil({ ...base, saison: saison - 1 || 0 }))) || saison === 1);

  // L'Album.
  ouvrirProgression('album');
  let page = noeud.innerHTML, t = texte(page);
  const visibles = [...page.matchAll(/data-ecran="collection" data-arg="(\w+)"/g)].map((m) => m[1]);
  check('l’Album : la carte de joueur, les deux bourses, la saison en cours d’abord, puis les collections — sans celle de départ ni les saisons à venir',
    /<h2>Album<\/h2>/.test(page) && /class="col-carte-joueur" data-ecran="blason"/.test(page) && visibles[0] === theme.id && !visibles.includes('depart')
    && DES_COFFRES.every((c) => visibles.includes(c.id)) && visibles.includes('cour') && visibles.includes('ligues') && visibles.filter((id) => collection(id).source === 'saison').length === 1, visibles.join(' '));
  check('… ce qu’on a en couleurs, ce qui manque en silhouette', (page.match(/piece-embleme manque/g) || []).length > 80 && new RegExp(`class="piece-embleme  " role="img" aria-label="${PIECES[col.emblemes[0]].nom}"`).test(page) && propre(page));
  check('… et le compte : 3 pièces (celles de départ ne se collectionnent pas)', /3 pièces sur \d+/.test(t), t.match(/\d+ pièces? sur \d+/)?.[0]);

  // Une collection des coffres.
  ouvrirProgression('collection', col.id);
  page = noeud.innerHTML; t = texte(page);
  const manquante = col.emblemes[2];
  check('la page d’une collection : ses neuf autocollants, celui qu’on porte, ceux qu’on peut porter, et le prix en Éclats de ceux qui manquent',
    (page.match(/class="col-piece/g) || []).length === 9 && /class="col-porte">Porté/.test(page) && new RegExp(`data-act="porter" data-arg="${col.emblemes[1]}"`).test(page)
    && new RegExp(`data-act="acheterPiece" data-arg="${manquante}"`).test(page) && propre(page));
  check('… ce que la collection donne : à 3, à 6, à 9', /Ce que la collection donne/.test(t) && egal([...page.matchAll(/class="col-seuil">(\d)</g)].map((m) => m[1]), ['3', '6', '9']));
  toucher({ act: 'acheterPiece', arg: manquante });
  check('acheter un autocollant : le premier toucher demande confirmation, rien n’est dépensé', new RegExp(`data-arg="${manquante}" data-i="1">Encore`).test(noeud.innerHTML) && lu().eclats === 400);
  toucher({ act: 'acheterPiece', arg: manquante, i: '1' });
  check('… le second l’achète : c’est le troisième de la collection, elle donne son grade, et l’écran le dit',
    lu().pieces.includes(manquante) && lu().pieces.includes(`${col.id}.grade`) && lu().eclats < 400 && /dans ton album\. La collection te donne le titre « /.test(texte(noeud.innerHTML).replace(/\u00a0/g, ' ')));
  toucher({ act: 'porter', arg: col.emblemes[1] });
  check('porter un autocollant depuis sa collection', lu().blason.embleme === col.emblemes[1] && /c’est sur ton blason/.test(texte(noeud.innerHTML)));
  poser({ ...lu(), eclats: 3 });
  toucher({ act: 'acheterPiece', arg: col.emblemes[3] });
  check('trop cher : l’écran dit ce qu’il manque, sans rien dépenser', /Il te manque\s+\d+\s+pour cet autocollant/.test(texte(noeud.innerHTML)) && lu().eclats === 3 && !lu().pieces.includes(col.emblemes[3]));

  // Le blason.
  ouvrirProgression('blason');
  page = noeud.innerHTML;
  check('le blason à composer : cinq rayons — autocollant, cadre, bannière, les deux mots du titre — et seulement ce qu’on possède',
    egal([...page.matchAll(/class="col-choix-liste" data-genre="(\w+)"/g)].map((m) => m[1]), GENRES) && (page.match(/data-act="porter"/g) || []).length === lu().pieces.length && propre(page));
  toucher({ act: 'porter', arg: `${col.id}.grade`, i: 'b' });
  check('… choisir un titre : il s’écrit sur la carte', lu().blason.grade === `${col.id}.grade` && new RegExp(`<b>${PIECES[`${col.id}.grade`].nom}</b>`).test(noeud.innerHTML) && /<h2>Mon blason<\/h2>/.test(noeud.innerHTML));
  toucher({ act: 'retirer', arg: 'embleme' });
  check('… retirer l’autocollant', lu().blason.embleme === null && /blason-vide/.test(noeud.innerHTML));

  // La saison.
  poser({ ...lu(), eclats: 0 });
  ouvrirProgression('saison');
  page = noeud.innerHTML; t = texte(page);
  check(`l’écran de la saison : son numéro, sa collection (${theme.nom}), ce qu’il reste, le palier, la règle des points`,
    new RegExp(`<h2>Saison ${saison}</h2>`).test(page) && t.includes(theme.nom) && /Il reste \d+ jours|Dernier jour/.test(t) && /Palier 2 sur 30 · 50 points sur 100/.test(t) && /Une partie classée : 20 points/.test(t));
  check('… la route : trente paliers, deux voies ; le premier est pris, le deuxième à prendre, la voie du Passe est fermée',
    (page.match(/class="col-palier /g) || []).length === 30 && /class="col-case pris" data-voie="gratuit"/.test(page) && /data-act="palier" data-arg="gratuit" data-i="2"/.test(page)
    && (page.match(/class="col-case ferme" data-voie="passe"/g) || []).length === 30 && propre(page));
  check('… le Passe dit son prix, son équivalent en euros et ce qu’il contient — et ce qu’il ne contient pas',
    /500 Couronnes, environ 5 €/.test(t.replace(/\u00a0/g, ' ')) && /12 autocollants, 4 pièces de blason/.test(t) && /400 Couronnes et 400 Éclats/.test(t) && /Ni coffre, ni fragment, ni niveau/.test(t));
  toucher({ act: 'palier', arg: 'gratuit', i: '2' });
  check('prendre un palier : la récompense arrive, l’écran la nomme', egal(lu().route.pris.gratuit, [1, 2]) && lu().coffres.length === 1 && /Tu reçois : un coffre de bois\./.test(texte(noeud.innerHTML)));
  toucher({ act: 'passe' });
  check('le Passe : premier toucher, confirmation', /data-act="passe" data-i="1">Toucher encore/.test(noeud.innerHTML) && lu().route.passe === false && lu().couronnes === 520);
  toucher({ act: 'passe', i: '1' });
  check('… second toucher : acheté, 500 Couronnes en moins, la voie de droite s’ouvre', lu().route.passe === true && lu().couronnes === 20 && /Le Passe de saison est à toi/.test(texte(noeud.innerHTML))
    && /data-act="palier" data-arg="passe" data-i="1"/.test(noeud.innerHTML) && /data-act="toutPrendre">Tout prendre \(2\)/.test(noeud.innerHTML));
  toucher({ act: 'toutPrendre' });
  check('… « Tout prendre » : les deux paliers du Passe', egal(lu().route.pris.passe, [1, 2]) && lu().pieces.includes(theme.emblemes[6]) && lu().eclats === 40);
  poser({ ...lu(), couronnes: 0, route: { points: 0, passe: false, pris: { gratuit: [], passe: [] } } });
  toucher({ act: 'passe' });
  check('… sans les Couronnes : l’écran dit ce qu’il manque et montre la boutique', /Il te manque\s+500\s+pour le Passe/.test(texte(noeud.innerHTML)) && /data-ecran="boutique">Boutique/.test(noeud.innerHTML) && lu().route.passe === false);

  // La boutique : le rayon des collections.
  poser({ ...lu(), eclats: 400, couronnes: 350 });
  ouvrirProgression('boutique');
  page = noeud.innerHTML; t = texte(page);
  check('la boutique : le Passe de la saison, trois autocollants du jour en Éclats, la collection à vendre en Couronnes',
    /<b>Passe de saison<\/b>/.test(page) && (page.match(/data-act="acheterPiece"/g) || []).length === 3 && /data-ecran="collection" data-arg="cour">/.test(page) && /environ 3 €/.test(t.replace(/\u00a0/g, ' ')) && propre(page.replace(/\d,99/g, '')));
  check('… les deux monnaies sont expliquées en une phrase', /Les Couronnes s’achètent\. Les Éclats se gagnent en jouant/.test(t));
  const duJour = page.match(/data-act="acheterPiece" data-arg="([\w.-]+)" data-i="s"/)[1];
  toucher({ act: 'acheterPiece', arg: duJour, i: 's' });
  check('acheter un autocollant du jour depuis la boutique : confirmation, sans quitter la boutique', /<h2>Boutique<\/h2>/.test(noeud.innerHTML) && new RegExp(`data-arg="${duJour}" data-i="s1">Encore`).test(noeud.innerHTML));
  toucher({ act: 'acheterPiece', arg: duJour, i: 's1' });
  check('… acheté à moitié prix, et la boutique le dit', lu().pieces.includes(duJour) && lu().eclats === 400 - C.eclats.prix[PIECES[duJour].rarete] / 2 && /dans ton album/.test(texte(noeud.innerHTML)) && /<h2>Boutique<\/h2>/.test(noeud.innerHTML));
  ouvrirProgression('collection', 'cour');
  check('la collection de la boutique : tout son contenu sous les yeux avant l’achat, son prix, son équivalent en euros',
    (noeud.innerHTML.match(/class="col-piece/g) || []).length === 9 && /13 pièces d’un coup, pour 300 Couronnes \(environ 3 €\)/.test(texte(noeud.innerHTML).replace(/\u00a0/g, ' ')) && /data-act="acheterCollection" data-arg="cour"/.test(noeud.innerHTML));
  toucher({ act: 'acheterCollection', arg: 'cour' });
  toucher({ act: 'acheterCollection', arg: 'cour', i: '1' });
  check('… deux touchers : toute la collection est à toi', lu().couronnes === 50 && collection('cour').pieces.every((id) => lu().pieces.includes(id)) && /toute la collection est à toi/.test(texte(noeud.innerHTML)));

  // Un coffre, les ligues, la fin de partie.
  poser(avecCoffre(profilNeuf(), 'argent'));
  toucher({ act: 'ouvrir', i: '0' });
  page = noeud.innerHTML; t = texte(page);
  check('ouvrir un coffre : après les fragments, son autocollant (« Nouveau ») et ses Éclats', /class="col-nouveau">Nouveau/.test(page) && /Éclats dans chaque coffre \+\s*10/.test(t) && lu().pieces.length === 4 && lu().eclats === 10 && propre(page));
  ouvrirProgression('probas', 'or');
  check('les chances d’un coffre disent celles de son autocollant et ce que rend un doublon', /Autocollant — 1 tirage/.test(texte(noeud.innerHTML)) && /Un doublon rend/.test(texte(noeud.innerHTML)) && /50 %/.test(texte(noeud.innerHTML)));
  ouvrirProgression('ligues');
  t = texte(noeud.innerHTML).replace(/\u00a0/g, ' ');
  check('la route des ligues nomme ses cadeaux : titre « Recrue », Bannière de Bronze, Cadre d’Or, 50 Couronnes',
    /titre « Recrue »/.test(t) && /Bannière de Bronze/.test(t) && /Cadre d’Or/.test(t) && /Cadre des Légendes/.test(t) && /50 Couronnes/.test(t));
  const promue = appliquerResultat({ ...profilNeuf(), elo: 60 }, partie('victoire', aujourdhui, { instant: Date.now() / 1000 }));
  const fin = texte(htmlFinDePartie(promue.evenements, promue.profil)).replace(/\u00a0/g, ' ');
  check('fin de partie : le cadeau de la ligue et les points de saison', /Cadeau de ligue : titre « Recrue »/.test(fin) && /\+80 points de saison \(première victoire du jour\)/.test(fin), fin.slice(0, 200));
  const palier = appliquerResultat({ ...enRoute(90), saison }, partie('defaite', aujourdhui));
  check('… un palier atteint se propose aussitôt', /data-ecran="saison">palier 1 à prendre/.test(htmlFinDePartie(palier.evenements, palier.profil)));
  check('… une épithète gagnée se dit comme un titre, pas comme un bout de phrase',
    /Gagné : titre « … des Citrouilles »/.test(texte(htmlFinDePartie([{ type: 'piece', piece: 'citrouilles.epithete', origine: 'saison', doublon: false, eclats: 0 }], profilNeuf())).replace(/\u00a0/g, ' ')));

  // Le français des phrases.
  check('une pièce dans une phrase porte son article : la Bannière, le Cadre, l’Étendard',
    egal(['bassecour.banniere', 'ligues.or', 'citrouilles.etendard', 'monstres.grade'].map((id) => pieceEnPhrase(id).replace(/\u00a0/g, ' ')),
      ['la Bannière de la Basse-cour', 'le Cadre d’Or', 'l’Étendard de la Nuit', 'le titre « Dompteur »']));
  poser({ ...avecPieces(profilNeuf(), 'ligues.bronze', 'ligues.or'), saison, blason: { ...BLASON_DE_DEPART, banniere: 'ligues.bronze', cadre: 'ligues.or' } });
  ouvrirProgression('collection', 'ligues');
  check('une bannière est « Portée », un cadre « Porté »', (noeud.innerHTML.match(/class="col-porte">Portée</g) || []).length === 1 && (noeud.innerHTML.match(/class="col-porte">Porté</g) || []).length === 1);
  ouvrirProgression('saison');
  check('« 0 point », pas « 0 points »', /Palier 0 sur 30 · 0 point sur 100/.test(texte(noeud.innerHTML)));
  check('un autocollant est « Commun », pas « Commune »', (() => { ouvrirProgression('collection', col.id); return />Commun</.test(noeud.innerHTML) && !/>Commune</.test(noeud.innerHTML); })());

  // Les autocollants du jour : la boutique dit combien il en reste.
  poser({ ...profilNeuf(), saison, eclats: 2000 });
  ouvrirProgression('boutique');
  check('la boutique annonce la règle : trois par jour, et pas de remplaçant avant demain', /Trois autocollants qui te manquent : 3 par jour, à moitié prix, en Éclats\. Un autocollant acheté n’est pas remplacé avant demain\./.test(texte(noeud.innerHTML)));
  for (let k = 0; k < 3; k++) {
    const id = noeud.innerHTML.match(/data-act="acheterPiece" data-arg="([\w.-]+)" data-i="s"/)[1];
    toucher({ act: 'acheterPiece', arg: id, i: 's' });
    toucher({ act: 'acheterPiece', arg: id, i: 's1' });
    if (k === 0) check('… un acheté : il en reste deux, et le texte le dit', (noeud.innerHTML.match(/data-act="acheterPiece"/g) || []).length === 2 && /Deux autocollants qui te manquent/.test(texte(noeud.innerHTML)));
  }
  check('… les trois achetés : plus de bouton, « d’autres demain »', !/data-act="acheterPiece"/.test(noeud.innerHTML) && /Tu as pris tes autocollants du jour\. D’autres demain/.test(texte(noeud.innerHTML)) && lu().pieces.length === 6);

  // Un thème qui revient : l'écran de la saison dit ce qu'on a déjà, Passe compris.
  poser({ ...profilNeuf(), saison, pieces: [...profilNeuf().pieces, ...theme.pieces] });
  ouvrirProgression('saison');
  page = noeud.innerHTML; t = texte(page);
  check('une saison dont on a déjà la collection : chaque pièce de la route est dite « Déjà à toi », avec ses Éclats',
    (page.match(/class="col-deja">Déjà à toi/g) || []).length === 22 && /tu as 16 de ces pièces\. Celles-là te rendront des Éclats à la place/.test(t) && propre(page));
  poser({ ...profilNeuf(), saison });
  ouvrirProgression('saison');
  check('… et rien de tel quand la collection est neuve', !/Déjà à toi/.test(noeud.innerHTML) && !/déjà passée par ici/.test(noeud.innerHTML));

  // Le mois a tourné pendant que le jeu dormait : la tuile, l'écran, et ce qu'il dit.
  const VraieDate = Date;
  const leDeux = new VraieDate(mois.getFullYear(), mois.getMonth() + 1, 2, 12).getTime();   // le 2 du mois suivant, à midi
  globalThis.Date = class extends VraieDate { constructor(...a) { super(...(a.length ? a : [leDeux])); } static now() { return leDeux; } };
  try {
    const joue = { ...profilNeuf(), saison, parties: 40, victoires: 30, defaites: 10, elo: 2350, ligue: 8, plusHauteLigue: 8, promotions: [2, 3, 4, 5, 6, 7, 8],
      couronnes: 600, route: { points: 250, passe: false, pris: { gratuit: [1], passe: [] } } };
    check('le mois suivant, la tuile de la saison porte un « ! » pour qui a joué — pas pour un profil neuf',
      /Saison <b class="prog-pastille">!<\/b>/.test(htmlBandeau(migrerProfil(joue))) && !/prog-pastille">!/.test(htmlBandeau(profilNeuf())));
    poser(joue);
    toucher({ act: 'passe', i: '1' });
    check('l’écran resté ouvert pendant que le mois tournait : on n’achète pas le Passe d’une saison finie — la nouvelle s’ouvre d’abord',
      lu().saison === saison + 1 && lu().route.passe === false && lu().couronnes === 600 && new RegExp(`<h2>Saison ${saison + 1}</h2>`).test(noeud.innerHTML));
    poser(joue);
    ouvrirProgression('saison');
    const dit = texte(noeud.innerHTML).replace(/[\u00a0\u202f]/g, ' ');
    check('ouvrir la saison le mois suivant : l’écran dit ce qu’elle donne ET ce qu’elle reprend au classement',
      lu().saison === saison + 1 && lu().elo === 1550 && lu().ligue === 6 && /La saison passée est finie, une nouvelle commence\./.test(dit)
      && /ton score repart de 1 550, en ligue d’Or\./.test(dit) && /Tu reçois : un coffre de bois, un coffre légendaire\./.test(dit), dit.slice(0, 320));
    poser(profilNeuf());
    ouvrirProgression('saison');
    check('… un profil neuf, lui, arrive dans la saison du jour sans annonce, et le profil est rangé à la bonne saison',
      lu().saison === saison + 1 && !/saison passée/.test(noeud.innerHTML) && lu().saisons.length === 0);
  } finally {
    globalThis.Date = VraieDate;
  }
}

// --- La page -----------------------------------------------------------------------------------------
console.log('\n--- La page ---');
{
  const css = fs.readFileSync(path.join(RACINE, 'css/collections.css'), 'utf8');
  const page = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
  check('la feuille des collections est dans la page, après celle de la boîte, et gardée pour le hors-ligne avec les trois modules',
    page.indexOf('css/collections.css') > page.indexOf('css/boite.css') && ['./css/collections.css', './js/collections-config.js', './js/collections-ecrans.js', './js/blason.js'].every((f) => sw.includes(`'${f}'`)));
  check('un autocollant est une case de planche 3 × 3 ; celui qui manque, une silhouette', /\.piece-embleme \{[^}]*background-size: 300% 300%/.test(css) && /\.piece-embleme\.manque \{ filter: brightness\(0\)/.test(css));
  check('direction « Boîte de jeu » : aucun dégradé, aucun flou, les couleurs de la boîte', !/gradient|blur\(/.test(css) && /var\(--b-encre\)/.test(css) && /var\(--b-eclat\)/.test(css)
    && /--b-eclat:/.test(fs.readFileSync(path.join(RACINE, 'css/jeu.css'), 'utf8')));
  check('six tuiles à l’accueil, trois par rangée', /#start-screen #btn-howto \{ grid-column: span 4;/.test(css));
  check('trois pictogrammes dessinés pour le jeu : l’éclat, l’album, le fanion de la saison', ['eclat', 'album', 'saison'].every((cle) => ICONES[cle] && /dessin original/.test(ICONES[cle].n)));
  check('le script des essais lance aussi celui-ci', JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8')).scripts.test.includes('test/collections.test.js'));
}

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
