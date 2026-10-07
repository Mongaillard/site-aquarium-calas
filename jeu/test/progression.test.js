// Moteur de progression : classement, ligues, saisons, coffres, fragments et
// niveaux des troupes (js/progression.js, réglé par js/progression-config.js).
// Les valeurs attendues sont celles du document « Classement, ligues, coffres
// et niveaux des troupes » du 7 octobre 2026, recopiées ici : un réglage qui
// s'en écarte fait échouer le test qui le concerne. Tout se joue sous Node,
// sans navigateur ni stockage ; le hasard vient d'un générateur à graine.
// Lancement : node test/progression.test.js

import { PROGRESSION } from '../js/progression-config.js';
import {
  VERSION_PROFIL, profilNeuf, migrerProfil, regulariser, ligueDe, plafondDe,
  appliquerResultat, rechercheFermee, pauseAccordee, finDeSaison,
  aleaDeGraine, ouvrirCoffre, probabilitesDe, verifierProbabilites,
  coutAmelioration, ameliorer, niveauEffectif, definitionAuNiveau,
  debloquerParAchat, fenetreDeRecherche, apparier,
} from '../js/progression.js';
import { UNIT_TYPES } from '../js/config.js';
import { RNG } from '../js/utils.js';

let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? '  ok  ' : ' FAIL ';
  if (!condition) failures++;
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

// --- Outils ------------------------------------------------------------------

/** Égalité en profondeur de deux données ordinaires, sans regard pour l'ordre des champs. */
function egal(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const cles = Object.keys(a);
  if (cles.length !== Object.keys(b).length) return false;
  return cles.every((cle) => Object.prototype.hasOwnProperty.call(b, cle) && egal(a[cle], b[cle]));
}
/** Gèle tout : un moteur qui toucherait à ce qu'on lui donne lèverait une erreur. */
function geler(objet) {
  for (const valeur of Object.values(objet)) if (valeur && typeof valeur === 'object') geler(valeur);
  return Object.freeze(objet);
}
const proche = (a, b, marge = 1e-9) => Math.abs(a - b) <= marge;
const arrondi = (v, decimales) => Math.round(v * 10 ** decimales) / 10 ** decimales;
const somme = (liste) => liste.reduce((s, v) => s + v, 0);
const parType = (evenements, type) => evenements.filter((e) => e.type === type);
const coffresDe = (profil, type) => profil.coffres.filter((c) => c.type === type).length;

const LUNDI = Date.UTC(2026, 9, 5);   // le lundi 5 octobre 2026
/** Le jour « AAAA-MM-JJ » qui tombe `n` jours après ce lundi. */
const jourDe = (n) => new Date(LUNDI + n * 86400000).toISOString().slice(0, 10);
const partie = (issue, plus = {}) => ({ issue, duree: 600, contreOrdinateur: false, jour: jourDe(2), ...plus });

/** Joue une suite de parties (V victoire, D défaite, E égalité) ; rend le profil et tous les événements. */
function jouer(profil, suite, plus = {}) {
  const issues = { V: 'victoire', D: 'defaite', E: 'egalite' };
  let p = profil;
  const evenements = [];
  for (const lettre of suite) {
    const r = appliquerResultat(p, partie(issues[lettre], plus));
    p = r.profil;
    evenements.push(...r.evenements);
  }
  return { profil: p, evenements };
}
/** Un profil monté à ce score par les règles (promotions, troupes, ouvrier), ses coffres déjà vidés. */
function profilA(elo) {
  const p = regulariser({ ...profilNeuf(), elo }).profil;
  p.coffres = [];
  return p;
}
/** Un profil neuf où les quatre troupes avancées sont débloquées. */
function toutDebloque() {
  const p = profilNeuf();
  for (const type of ['triton', 'horseArcher', 'catapult', 'hydra']) p.debloquees[type] = 'ligue';
  return p;
}
const avecCoffre = (profil, ...types) => ({ ...profil, coffres: types.map((type) => ({ type, origine: 'victoire' })) });
/** Un hasard écrit d'avance : rend les nombres donnés, puis des zéros ; compte ses appels. */
function aleaEcrit(...nombres) {
  let rang = 0;
  const alea = () => (rang < nombres.length ? nombres[rang++] : (rang++, 0));
  alea.appels = () => rang;
  return alea;
}

const R = PROGRESSION;
const QUATORZE = ['villager', 'militia', 'spearman', 'archer', 'scout', 'knight', 'champion', 'crossbowman',
  'priest', 'ram', 'triton', 'horseArcher', 'catapult', 'hydra'];
const NOUVELLES = ['pavoisier', 'frondeur', 'sapeur'];
const COMMUNES = ['villager', 'militia', 'spearman', 'archer', 'scout'];
const RARES = ['knight', 'champion', 'crossbowman', 'priest', 'ram'];
const EPIQUES = ['triton', 'horseArcher', 'catapult', 'hydra'];

console.log('=== Moteur de progression ===\n');

// ---------------------------------------------------------------------------
// 1. Les réglages sont ceux du document
// ---------------------------------------------------------------------------
console.log('--- Les réglages ---');
{
  check('barème : +30, −15, 0 pour une égalité, jamais sous 0',
    R.elo.victoire === 30 && R.elo.defaite === -15 && R.elo.egalite === 0 && R.elo.plancher === 0 && R.elo.depart === 0);
  check('une victoire sur trois suffit à ne pas descendre', R.elo.victoire + 2 * R.elo.defaite === 0);
  check('recherche : ±60, +30 toutes les 5 s, ±400 au plus, ordinateur après 60 s, classé jusqu’à la ligue 4',
    egal(R.recherche, { fenetre: 60, pas: 30, periode: 5, fenetreMax: 400, ordinateurApres: 60, ordinateurClasseJusqua: 4 }));
  check('abandons : précoce avant 120 s, pause de 30 s, 60 s au plus par joueur, trois par jour ferment la recherche 10 min',
    egal(R.abandon, { precoceAvant: 120, pauseDeconnexion: 30, pauseMaxParJoueur: 60, precocesParJour: 3, fermetureRecherche: 600 }));
  check('saison : 56 jours, pivot 750, on garde la moitié de l’excédent',
    R.saison.jours === 56 && R.saison.pivot === 750 && R.saison.garde === 0.5 && R.saison.jamaisSousLaLigue === 5);

  const l = R.ligues;
  check('dix ligues, numérotées de 1 à 10', l.length === 10 && l.every((ligue, i) => ligue.numero === i + 1));
  check('… leurs noms', egal(l.map((x) => x.nom), ['Bois', 'Pierre', 'Bronze', 'Fer', 'Argent', 'Or', 'Cristal', 'Orichalque', 'Soleil', 'Légendes']));
  check('… leurs seuils', egal(l.map((x) => x.seuil), [0, 90, 240, 450, 750, 1150, 1650, 2300, 3100, 4000]));
  check('… leurs plafonds de niveau', egal(l.map((x) => x.plafond), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]));
  check('… la troupe offerte à l’entrée',
    egal(l.map((x) => x.troupe), [null, 'triton', 'horseArcher', 'catapult', 'hydra', 'pavoisier', 'frondeur', 'sapeur', null, null]));
  check('… le coffre de promotion : légendaire en ligues 5, 8 et 10, d’or ailleurs',
    egal(l.map((x) => x.promotion && x.promotion.coffre), [null, 'or', 'or', 'or', 'legendaire', 'or', 'or', 'legendaire', 'or', 'legendaire']));
  check('… les titres de promotion',
    egal(l.map((x) => (x.promotion ? x.promotion.cadeaux.filter((c) => c.genre === 'titre').map((c) => c.nom).join() : '')),
      ['', 'Recrue', '', '', 'Capitaine', '', 'Stratège', '', 'Empereur', 'Légende']));
  check('… le coffre de fin de saison : rien avant la ligue 5, or en 5 et 6, légendaire ensuite',
    egal(l.map((x) => x.finDeSaison && x.finDeSaison.coffre), [null, null, null, null, 'or', 'or', 'legendaire', 'legendaire', 'legendaire', 'legendaire']));
  check('rétrogradation : à partir de la ligue 5, avec 60 points de marge', egal(R.retrogradation, { aPartirDe: 5, marge: 60 }));

  check('coffre de bois : cinq par jour au plus', R.sources.bois.parJourAuPlus === 5);
  check('coffre d’argent : tous les 10 points de bataille, victoire 2, défaite et égalité 1',
    R.sources.argent.tousLes === 10 && R.sources.argent.victoire === 2 && R.sources.argent.defaite === 1 && R.sources.argent.egalite === 1);
  check('coffre d’or : trois jours joués dans la semaine', R.sources.or.joursJoues === 3 && R.sources.or.joursParSemaine === 7);

  const categorie = (nom) => Object.keys(R.troupes).filter((t) => R.troupes[t].categorie === nom);
  check('catégories : cinq communes', egal(categorie('commune'), COMMUNES));
  check('… cinq rares', egal(categorie('rare'), RARES));
  check('… les épiques : quatre troupes avancées, puis les trois nouvelles', egal(categorie('epique'), [...EPIQUES, ...NOUVELLES]));
  const formables = Object.keys(UNIT_TYPES).filter((t) => UNIT_TYPES[t].class !== 'animal').sort();
  check('les troupes du jeu sont les quatorze de js/config.js',
    egal(Object.keys(R.troupes).filter((t) => !R.troupes[t].aVenir).sort(), formables) && egal([...QUATORZE].sort(), formables),
    formables.join(', '));
  check('les trois nouvelles sont « à venir », absentes du jeu',
    NOUVELLES.every((t) => R.troupes[t].aVenir === true && !UNIT_TYPES[t]) && Object.keys(R.troupes).filter((t) => R.troupes[t].aVenir).length === 3);
  check('… avec leurs statistiques de départ',
    egal(R.troupes.pavoisier.depart, { cost: { food: 60, gold: 40 }, hp: 70, attack: 4, contact: true, speed: 0.85, pierceArmor: 6 })
    && egal(R.troupes.frondeur.depart, { cost: { food: 30, wood: 30 }, hp: 30, attack: 3, range: 4, speed: 1.05, bonusContre: { archer: 6, horseArcher: 6 } })
    && egal(R.troupes.sapeur.depart, { cost: { food: 50, gold: 40 }, hp: 35, attack: 3, contact: true, speed: 1.3, bonus: { building: 25, siege: 8 } }));

  check('coûts en fragments : 20, 60, 150, 400 — 6, 20, 50, 130 — 3, 8, 20, 50',
    egal(R.couts, { commune: [20, 60, 150, 400], rare: [6, 20, 50, 130], epique: [3, 8, 20, 50] }));
  check('… soit 630, 206 et 81 en tout, pour un niveau maximum de 5',
    somme(R.couts.commune) === 630 && somme(R.couts.rare) === 206 && somme(R.couts.epique) === 81 && R.niveauMax === 5);

  const conditions = { triton: [2, 10, 99], horseArcher: [3, 25, 199], catapult: [4, 50, 199], hydra: [5, 80, 299],
    pavoisier: [6, 130, 299], frondeur: [7, 180, 299], sapeur: [8, 250, 299] };
  check('troupes avancées : la ligue OU le nombre de parties, et le prix',
    Object.keys(conditions).every((t) => egal([R.troupes[t].gratuite.ligue, R.troupes[t].gratuite.parties, R.troupes[t].prixCentimes], conditions[t])));
  check('… et pas d’autre troupe à débloquer', Object.keys(R.troupes).filter((t) => R.troupes[t].gratuite).length === 7
    && [...COMMUNES, ...RARES].every((t) => !R.troupes[t].gratuite && R.troupes[t].prixCentimes === undefined));
  check('la troupe offerte par une ligue est celle que cette ligue débloque',
    l.every((ligue) => !ligue.troupe || R.troupes[ligue.troupe].gratuite.ligue === ligue.numero)
    && Object.keys(conditions).every((t) => l[R.troupes[t].gratuite.ligue - 1].troupe === t));

  const tables = [];
  for (const t of Object.keys(R.troupes)) {
    const a = R.troupes[t].ameliorations;
    for (const [genre, neutre] of [['fois', 1000], ['plus', 0], ['pose', null]]) {
      for (const chemin of Object.keys(a[genre] || {})) tables.push({ ou: `${t}.${chemin}`, table: a[genre][chemin], neutre });
    }
  }
  check('chaque amélioration a une valeur par niveau, neutre au niveau 1',
    tables.length > 0 && tables.every((x) => x.table.length === R.niveauMax && x.table[0] === x.neutre), `${tables.length} tables`);

  let ecrit = false;
  try { R.elo.victoire = 99; ecrit = true; } catch { /* gelé : l'écriture est refusée */ }
  try { R.ligues[0].seuil = 5; R.coffres.bois.tirages[0].table.commune = 1; } catch { /* idem */ }
  check('les réglages sont gelés : rien ne les change en cours de route',
    !ecrit && R.elo.victoire === 30 && R.ligues[0].seuil === 0 && R.coffres.bois.tirages[0].table.commune === 800);
}

// ---------------------------------------------------------------------------
// 2. Les tables de probabilités
// ---------------------------------------------------------------------------
console.log('\n--- Les tables de probabilités ---');
{
  const verdict = verifierProbabilites();
  check('la vérification des tables ne trouve rien à redire', verdict.valide === true && verdict.erreurs.length === 0, verdict.erreurs.join(' ; '));
  let groupes = 0;
  let toutes = true;
  for (const type of Object.keys(R.coffres)) {
    for (const groupe of R.coffres[type].tirages) {
      groupes++;
      const parts = Object.values(groupe.table);
      if (somme(parts) !== 1000 || !parts.every((v) => Number.isInteger(v) && v >= 0)) toutes = false;
    }
  }
  check('chaque table somme à 1000 pour-mille exactement, en entiers', toutes && groupes === 8, `${groupes} tables`);
  check('les quatre coffres du document', egal(Object.keys(R.coffres), ['bois', 'argent', 'or', 'legendaire']));

  const lignes = (type, rang) => probabilitesDe(type).groupes[rang].lignes.map((x) => [x.categorie, x.pourMille, x.fragments]);
  check('bois : 3 tirages — 80 % → 5, 17 % → 2, 3 % → 1',
    probabilitesDe('bois').tirages === 3 && egal(lignes('bois', 0), [['commune', 800, 5], ['rare', 170, 2], ['epique', 30, 1]]));
  check('argent : 4 tirages — 65 % → 8, 28 % → 3, 7 % → 2 ; plus un « rare ou mieux » à 90 % / 10 %',
    probabilitesDe('argent').tirages === 5 && egal(lignes('argent', 0), [['commune', 650, 8], ['rare', 280, 3], ['epique', 70, 2]])
    && egal(lignes('argent', 1), [['rare', 900, 3], ['epique', 100, 2]]));
  check('or : 6 tirages — 50 % → 12, 38 % → 5, 12 % → 3 ; un « rare ou mieux » à 80 % / 20 % ; un épique',
    probabilitesDe('or').tirages === 8 && egal(lignes('or', 0), [['commune', 500, 12], ['rare', 380, 5], ['epique', 120, 3]])
    && egal(lignes('or', 1), [['rare', 800, 5], ['epique', 200, 3]]) && egal(lignes('or', 2), [['epique', 1000, 3]]));
  check('légendaire : 8 tirages — 35 % → 16, 40 % → 8, 25 % → 4 ; deux épiques',
    probabilitesDe('legendaire').tirages === 10 && egal(lignes('legendaire', 0), [['commune', 350, 16], ['rare', 400, 8], ['epique', 250, 4]])
    && egal(lignes('legendaire', 1), [['epique', 1000, 4]]) && probabilitesDe('legendaire').groupes[1].nombre === 2);

  const t = probabilitesDe('or');
  check('le tableau affiché dit tout : nom, genre des tirages, pour-cent, total de chaque groupe',
    t.coffre === 'or' && t.nom === 'Coffre d’or' && egal(t.groupes.map((g) => [g.genre, g.nombre, g.total]), [['ordinaire', 6, 1000], ['garanti', 1, 1000], ['garanti', 1, 1000]])
    && t.groupes[0].lignes[1].pourCent === 38 && t.groupes[0].lignes[1].nom === 'Rare');
  t.groupes[0].lignes[0].pourMille = 1;
  check('… et c’est une copie : l’abîmer ne change rien au suivant', probabilitesDe('or').groupes[0].lignes[0].pourMille === 500);
  check('un coffre qui n’existe pas n’a pas de tableau',
    probabilitesDe('diamant') === null && probabilitesDe(undefined) === null && probabilitesDe('constructor') === null);
}

// ---------------------------------------------------------------------------
// 3. Le profil
// ---------------------------------------------------------------------------
console.log('\n--- Le profil ---');
{
  const p = profilNeuf();
  check('un profil neuf : version, Elo 0, ligue 1, compteurs à zéro',
    p.version === VERSION_PROFIL && p.version === 1 && p.elo === 0 && p.ligue === 1 && p.plusHauteLigue === 1
    && p.parties === 0 && p.victoires === 0 && p.defaites === 0 && p.egalites === 0 && p.pointsDeBataille === 0
    && p.eclats === 0 && p.saison === 1 && egal(p.promotions, []) && egal(p.coffres, []) && egal(p.journal, []));
  check('… les quatorze troupes au niveau 1, sans fragment',
    egal(Object.keys(p.troupes), QUATORZE) && QUATORZE.every((t) => egal(p.troupes[t], { niveau: 1, fragments: 0 })));
  check('… les dix troupes de base débloquées d’office, les avancées verrouillées',
    egal(p.debloquees, Object.fromEntries([...COMMUNES, ...RARES].map((t) => [t, 'base']))));
  check('… ses compteurs du jour : coffres de bois, abandons précoces',
    p.jour.coffresBois === 0 && p.jour.abandonsPrecoces === 0 && p.jour.date === '' && p.rechercheFermeeJusqua === 0);
  check('… aucune trace des troupes à venir', NOUVELLES.every((t) => !(t in p.troupes) && !(t in p.debloquees)));
  const autre = profilNeuf();
  autre.troupes.archer.niveau = 3; autre.coffres.push({ type: 'or', origine: 'promotion' });
  check('deux profils neufs ne partagent rien', p.troupes.archer.niveau === 1 && p.coffres.length === 0 && egal(profilNeuf(), p));

  // Une histoire complète : achat, parties, coffres, améliorations, fin de saison.
  const alea = aleaDeGraine(11);
  let riche = debloquerParAchat(profilNeuf(), 'hydra', { valide: true }).profil;
  for (let n = 0; n < 45; n++) {
    riche = appliquerResultat(riche, partie(alea() < 0.7 ? 'victoire' : 'defaite', { jour: jourDe(Math.floor(n / 3)), instant: 1000 + n })).profil;
    while (riche.coffres.length > 2) riche = ouvrirCoffre(riche, 0, alea).profil;
    for (const type of QUATORZE) { const r = ameliorer(riche, type); if (!r.erreur) riche = r.profil; }
  }
  riche = finDeSaison(riche).profil;
  const texte = JSON.stringify(riche);
  const relu = JSON.parse(texte);
  check('le profil survit à un aller-retour JSON, champ pour champ', egal(relu, riche) && JSON.stringify(relu) === texte, `${texte.length} caractères`);
  check('… relu, il est toujours valide : la migration le rend tel quel', egal(migrerProfil(relu), riche));
  const suite = (depart) => {
    const a = aleaDeGraine(5);
    let q = depart;
    for (let n = 0; n < 12; n++) {
      q = appliquerResultat(q, partie(a() < 0.5 ? 'victoire' : 'defaite', { jour: jourDe(60 + n) })).profil;
      while (q.coffres.length) q = ouvrirCoffre(q, 0, a).profil;
    }
    return q;
  };
  check('… et la partie continue de la même façon sur l’original et sur la copie relue', egal(suite(riche), suite(relu)));
  check('un profil qui a vécu reste un profil valide', egal(migrerProfil(riche), riche) && riche.parties === 45 && riche.saison === 2
    && riche.debloquees.hydra === 'achat' && riche.ligue > 1 && riche.journal.length === R.profil.journal
    && QUATORZE.some((t) => riche.troupes[t].niveau > 1) && riche.coffres.length > 0,
    `ligue ${riche.ligue}, ${riche.elo} points, ${riche.operations} opérations`);

  // N'importe quoi en entrée.
  const boucle = { elo: 300 }; boucle.moi = boucle; boucle.journal = [boucle];
  const piege = {}; Object.defineProperty(piege, 'elo', { enumerable: true, get() { throw new Error('lecture impossible'); } });
  const abimes = [undefined, null, 42, 'profil', true, [], [1, 2], () => 1, {}, { version: 99 }, { elo: NaN }, { elo: Infinity },
    { elo: -50 }, { troupes: 7, debloquees: 'tout', coffres: {}, journal: 'x', jour: 3, semaine: [], saisons: 1, promotions: 'oui' },
    { troupes: { archer: null, militia: 5 }, coffres: [null, 3, {}, { type: 'x' }] }, boucle, piege,
    new Proxy({}, { get() { throw new Error('piège'); } })];
  let leve = null;
  const rendus = [];
  for (const abime of abimes) {
    try { rendus.push(migrerProfil(abime)); } catch (e) { leve = e; }
  }
  check('migrerProfil ne lève jamais d’erreur, quoi qu’on lui donne', leve === null && rendus.length === abimes.length, `${abimes.length} entrées abîmées`);
  check('… et rend toujours un profil valide, qui tient en JSON',
    rendus.every((r) => egal(migrerProfil(r), r) && egal(JSON.parse(JSON.stringify(r)), r) && r.version === 1 && egal(Object.keys(r.troupes), QUATORZE)));
  check('… ce qui n’est pas un profil donne un profil neuf', [undefined, null, 42, 'profil', [], {}].every((x) => egal(migrerProfil(x), profilNeuf())));
  check('… un objet illisible aussi', egal(migrerProfil(piege), profilNeuf()));

  const repare = migrerProfil({
    version: 99, elo: 312.7, ligue: 99, plusHauteLigue: 2, parties: 3, victoires: 10, defaites: -4, egalites: '2',
    pointsDeBataille: 57, eclats: 12.9, saison: 0, promotions: [3, 3, 'x', 1, 77, 2],
    coffres: [{ type: 'or', origine: 'promotion' }, { type: 'diamant' }, { type: 'bois', origine: 'ailleurs' }, 'bois'],
    troupes: { archer: { niveau: 12, fragments: -3 }, knight: { niveau: 2.9, fragments: 7.5 }, pavoisier: { niveau: 4, fragments: 9 }, dragon: { niveau: 2 } },
    debloquees: { villager: null, triton: 'vol', hydra: 'achat', catapult: 'base', pavoisier: 'achat', dragon: 'achat' },
    jour: { date: '7 octobre', coffresBois: 2, abandonsPrecoces: -1 }, semaine: { numero: 'x', jours: 99, coffre: 1 },
    rechercheFermeeJusqua: -5, journal: Array.from({ length: 80 }, (_, i) => ({ numero: i, op: 'partie', f: () => 1, n: NaN, t: 'x'.repeat(500) })),
  });
  check('un profil abîmé est remis d’aplomb : nombres bornés et entiers',
    repare.version === 1 && repare.elo === 312 && repare.ligue === 10 && repare.plusHauteLigue === 10 && repare.victoires === 10
    && repare.defaites === 0 && repare.egalites === 0 && repare.parties === 10 && repare.pointsDeBataille === 9 && repare.eclats === 12 && repare.saison === 1,
    JSON.stringify({ elo: repare.elo, ligue: repare.ligue, parties: repare.parties, points: repare.pointsDeBataille }));
  check('… promotions sans doublon ni intrus, coffres inconnus écartés',
    egal(repare.promotions, [2, 3]) && egal(repare.coffres, [{ type: 'or', origine: 'promotion' }, { type: 'bois', origine: 'autre' }]));
  check('… niveaux et fragments ramenés dans leurs bornes, troupes inconnues ou à venir écartées',
    egal(repare.troupes.archer, { niveau: 5, fragments: 0 }) && egal(repare.troupes.knight, { niveau: 2, fragments: 7 })
    && egal(Object.keys(repare.troupes), QUATORZE));
  check('… une troupe de base reste débloquée, une origine invalide ne débloque rien',
    repare.debloquees.villager === 'base' && repare.debloquees.hydra === 'achat' && !('triton' in repare.debloquees)
    && !('catapult' in repare.debloquees) && !('pavoisier' in repare.debloquees) && !('dragon' in repare.debloquees));
  check('… date illisible effacée, compteurs du jour bornés', repare.jour.date === '' && repare.jour.coffresBois === 2 && repare.jour.abandonsPrecoces === 0
    && egal(repare.semaine, { numero: 0, jours: 7, coffre: false }) && repare.rechercheFermeeJusqua === 0);
  check('… journal ramené à sa taille, sans rien qui ne tienne pas en JSON',
    repare.journal.length === R.profil.journal && repare.journal[0].numero === 50 && !('f' in repare.journal[0])
    && repare.journal[0].n === null && repare.journal[0].t.length === 64);
  check('une version inconnue garde ce qui se comprend', migrerProfil({ version: 99, elo: 300, ligue: 3, victoires: 12 }).elo === 300
    && migrerProfil({ version: 99, elo: 300, ligue: 3, victoires: 12 }).victoires === 12 && migrerProfil({ elo: 90 }).version === 1);
  const donne = geler({ elo: 120, ligue: 2, troupes: { archer: { niveau: 2, fragments: 4 } }, coffres: [{ type: 'bois', origine: 'victoire' }] });
  const avant = JSON.stringify(donne);
  const sorti = migrerProfil(donne);
  sorti.troupes.archer.niveau = 5; sorti.coffres.length = 0;
  check('migrerProfil ne touche pas à ce qu’on lui donne, et ne partage rien avec lui', JSON.stringify(donne) === avant);
}

// ---------------------------------------------------------------------------
// 4. Les ligues
// ---------------------------------------------------------------------------
console.log('\n--- Les ligues ---');
{
  const seuils = [0, 90, 240, 450, 750, 1150, 1650, 2300, 3100, 4000];
  check('ligueDe : chaque seuil ouvre sa ligue', seuils.every((s, i) => ligueDe(s) === i + 1), seuils.map((s) => `${s} → ${ligueDe(s)}`).join(', '));
  check('… un point sous le seuil, on est encore dans la précédente', seuils.slice(1).every((s, i) => ligueDe(s - 1) === i + 1));
  check('… un score absurde ne fait pas sortir du tableau', ligueDe(-50) === 1 && ligueDe(1e9) === 10 && ligueDe(NaN) === 1 && ligueDe(undefined) === 1);
  check('plafondDe : 1, 1, 2, 2, 3, 3, 4, 4, 5, 5', egal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(plafondDe), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]));
  check('… une ligue hors du tableau est ramenée à la plus proche', plafondDe(0) === 1 && plafondDe(99) === 5 && plafondDe('x') === 1);
}

// ---------------------------------------------------------------------------
// 5. Le barème
// ---------------------------------------------------------------------------
console.log('\n--- Le barème ---');
{
  const neuf = geler(profilNeuf());
  const v = appliquerResultat(neuf, partie('victoire'));
  check('une victoire : +30', v.profil.elo === 30 && v.profil.parties === 1 && v.profil.victoires === 1
    && egal(parType(v.evenements, 'elo'), [{ type: 'elo', avant: 0, apres: 30, variation: 30, classee: true }]));
  check('… l’ancien profil n’est pas modifié, le nouveau est un autre objet',
    egal(neuf, profilNeuf()) && v.profil !== neuf && v.profil.troupes !== neuf.troupes && v.profil.coffres !== neuf.coffres);

  const base = geler(profilA(300));
  const d = appliquerResultat(base, partie('defaite'));
  check('une défaite : −15', d.profil.elo === 285 && d.profil.defaites === 1 && parType(d.evenements, 'elo')[0].variation === -15);
  const e = appliquerResultat(base, partie('egalite'));
  check('une égalité : 0', e.profil.elo === 300 && e.profil.egalites === 1 && e.profil.parties === 1 && parType(e.evenements, 'elo')[0].variation === 0);
  const bas = jouer({ ...profilNeuf(), elo: 10 }, 'DD');
  check('jamais sous 0 : de 10 on tombe à 0, et on y reste',
    bas.profil.elo === 0 && egal(parType(bas.evenements, 'elo').map((x) => x.variation), [-10, 0]) && bas.profil.defaites === 2);
  check('une victoire et deux défaites se compensent', jouer(base, 'VDD').profil.elo === 300 && jouer(base, 'DVD').profil.elo === 300);

  // Abandons.
  const sansJournal = (p) => ({ ...p, journal: [] });
  const a = appliquerResultat(base, partie('abandon'));
  check('un abandon est une défaite : mêmes points, mêmes compteurs, même avancée vers le coffre',
    a.profil.elo === 285 && egal(sansJournal(a.profil), sansJournal(d.profil)));
  const aTot = appliquerResultat(base, partie('abandon', { duree: 45 }));
  check('… même avant deux minutes', aTot.profil.elo === 285 && aTot.profil.defaites === 1 && aTot.profil.jour.abandonsPrecoces === 1);
  const reste = appliquerResultat(base, partie('abandonAdverse', { duree: 120 }));
  check('l’adversaire abandonne après deux minutes : victoire, +30, coffre',
    reste.profil.elo === 330 && reste.profil.victoires === 1 && coffresDe(reste.profil, 'bois') === 1 && reste.profil.pointsDeBataille === 2);
  const annulee = appliquerResultat(base, partie('abandonAdverse', { duree: 119 }));
  check('l’adversaire abandonne avant deux minutes : partie annulée, ni points ni coffre',
    annulee.profil.elo === 300 && annulee.profil.parties === 0 && annulee.profil.victoires === 0 && annulee.profil.coffres.length === 0
    && annulee.profil.pointsDeBataille === 0 && egal(annulee.evenements, [{ type: 'partieAnnulee', raison: 'abandonAdversePrecoce' }]));
  check('… une durée illisible ne donne rien non plus', appliquerResultat(base, partie('abandonAdverse', { duree: undefined })).profil.elo === 300);
  const coupee = appliquerResultat(base, partie('annulee'));
  check('une partie annulée (les deux coupés, panne du serveur) ne change ni le score ni les compteurs',
    egal({ ...coupee.profil, journal: [], operations: 0, jour: base.jour }, { ...base, journal: [], operations: 0 })
    && egal(coupee.evenements, [{ type: 'partieAnnulee', raison: 'annulee' }]));
  const inconnue = appliquerResultat(base, { issue: 'triomphe' });
  check('une issue inconnue est refusée sans rien changer', inconnue.erreur === 'issue' && egal(inconnue.profil, base) && inconnue.evenements.length === 0
    && appliquerResultat(base, null).erreur === 'issue' && appliquerResultat(base).erreur === 'issue');
  check('appliquerResultat remet d’aplomb un profil abîmé avant de compter', appliquerResultat('n’importe quoi', partie('victoire')).profil.elo === 30);
}

// ---------------------------------------------------------------------------
// 6. Promotion
// ---------------------------------------------------------------------------
console.log('\n--- Promotion ---');
{
  const deux = jouer(profilNeuf(), 'VV');
  check('deux victoires : 60 points, toujours en ligue 1', deux.profil.elo === 60 && deux.profil.ligue === 1 && parType(deux.evenements, 'promotion').length === 0);
  const trois = appliquerResultat(geler(deux.profil), partie('victoire'));
  const p = trois.profil;
  check('la troisième atteint le seuil : promotion immédiate en ligue 2',
    p.elo === 90 && p.ligue === 2 && p.plusHauteLigue === 2
    && egal(parType(trois.evenements, 'promotion'), [{ type: 'promotion', de: 1, a: 2, nom: 'Pierre', plafond: 1 }]));
  check('… avec sa récompense : coffre d’or et titre « Recrue »',
    egal(parType(trois.evenements, 'recompensePromotion'), [{ type: 'recompensePromotion', ligue: 2, coffre: 'or', cadeaux: [{ genre: 'titre', nom: 'Recrue' }] }])
    && coffresDe(p, 'or') === 1 && p.coffres.find((c) => c.type === 'or').origine === 'promotion' && egal(p.promotions, [2]));
  check('… et la troupe de la ligue : l’Atlante, débloqué par la ligue',
    p.debloquees.triton === 'ligue' && egal(parType(trois.evenements, 'troupeDebloquee'), [{ type: 'troupeDebloquee', troupe: 'triton', origine: 'ligue' }]));
  check('… les événements disent tout, dans l’ordre',
    egal(trois.evenements.map((x) => x.type), ['elo', 'promotion', 'recompensePromotion', 'coffre', 'troupeDebloquee', 'coffre', 'pointsDeBataille']),
    trois.evenements.map((x) => x.type).join(', '));
  check('… le plafond de la ligue 2 est encore 1 : l’ouvrier ne bouge pas', p.troupes.villager.niveau === 1 && parType(trois.evenements, 'ouvrierAuPlafond').length === 0);

  // L'ouvrier monte d'office quand le plafond se relève.
  const avant3 = { ...jouer(p, 'VVVV', { jour: jourDe(3) }).profil };
  avant3.troupes = { ...avant3.troupes, villager: { niveau: 1, fragments: 17 } };
  const huit = appliquerResultat(avant3, partie('victoire', { jour: jourDe(3) }));
  check('ligue 3 à 240 points : le plafond passe à 2 et l’ouvrier y monte d’office, sans dépenser ses fragments',
    huit.profil.elo === 240 && huit.profil.ligue === 3 && egal(huit.profil.troupes.villager, { niveau: 2, fragments: 17 })
    && egal(parType(huit.evenements, 'ouvrierAuPlafond'), [{ type: 'ouvrierAuPlafond', troupe: 'villager', de: 1, a: 2 }])
    && huit.profil.debloquees.horseArcher === 'ligue');
  const dejaHaut = { ...avant3, troupes: { ...avant3.troupes, villager: { niveau: 4, fragments: 0 } } };
  check('… un ouvrier déjà au-dessus du plafond n’est pas rabaissé',
    appliquerResultat(dejaHaut, partie('victoire', { jour: jourDe(3) })).profil.troupes.villager.niveau === 4);
  const montee = jouer(profilA(720), 'V');
  check('ligue 5 à 750 points : coffre légendaire, Hydre, ouvrier au niveau 3',
    montee.profil.ligue === 5 && coffresDe(montee.profil, 'legendaire') === 1 && montee.profil.debloquees.hydra === 'ligue'
    && montee.profil.troupes.villager.niveau === 3 && parType(montee.evenements, 'recompensePromotion')[0].cadeaux[0].nom === 'Capitaine');

  // La récompense ne se donne qu'une fois.
  const chute = jouer(profilA(750), 'DDDDD');
  const retour = jouer(chute.profil, 'VVV', { jour: jourDe(9) });
  check('redescendu puis remonté : la promotion est annoncée, sa récompense n’est pas redonnée',
    chute.profil.ligue === 4 && retour.profil.ligue === 5 && retour.profil.elo === 765
    && parType(retour.evenements, 'promotion').length === 1 && parType(retour.evenements, 'recompensePromotion').length === 0
    && coffresDe(retour.profil, 'legendaire') === 0 && egal(retour.profil.promotions, [2, 3, 4, 5])
    && parType(retour.evenements, 'troupeDebloquee').length === 0);

  // Un profil en retard sur les règles.
  const rattrape = regulariser(geler({ ...profilNeuf(), elo: 500 }));
  check('regulariser donne d’un coup tout ce qui est dû : trois promotions, trois coffres d’or, trois troupes, l’ouvrier',
    rattrape.profil.ligue === 4 && egal(parType(rattrape.evenements, 'promotion').map((x) => x.a), [2, 3, 4])
    && coffresDe(rattrape.profil, 'or') === 3 && egal(rattrape.profil.promotions, [2, 3, 4])
    && egal(parType(rattrape.evenements, 'troupeDebloquee').map((x) => x.troupe), ['triton', 'horseArcher', 'catapult'])
    && rattrape.profil.troupes.villager.niveau === 2);
  const encore = regulariser(rattrape.profil);
  check('… et rien de plus la fois suivante', encore.evenements.length === 0 && egal(encore.profil, rattrape.profil));
  check('… un profil neuf n’a rien à rattraper', regulariser(profilNeuf()).evenements.length === 0);
}

// ---------------------------------------------------------------------------
// 7. Rétrogradation
// ---------------------------------------------------------------------------
console.log('\n--- Rétrogradation ---');
{
  const fer = jouer(profilA(450), 'D'.repeat(40));
  check('ligues 1 à 4 : des planchers — 40 défaites en ligue 4 ramènent à 0 point sans changer de ligue',
    fer.profil.elo === 0 && fer.profil.ligue === 4 && parType(fer.evenements, 'retrogradation').length === 0 && fer.profil.plusHauteLigue === 4);
  const bronze = jouer(profilA(240), 'D'.repeat(20));
  check('… de même en ligue 3', bronze.profil.ligue === 3 && bronze.profil.elo === 0);

  const quatre = jouer(profilA(750), 'DDDD');
  check('ligue 5 : quatre défaites de marge — à 690, on y est encore',
    quatre.profil.elo === 690 && quatre.profil.ligue === 5 && parType(quatre.evenements, 'retrogradation').length === 0);
  const cinq = appliquerResultat(quatre.profil, partie('defaite'));
  check('… la cinquième passe sous seuil − 60 : rétrogradation en ligue 4',
    cinq.profil.elo === 675 && cinq.profil.ligue === 4
    && egal(parType(cinq.evenements, 'retrogradation'), [{ type: 'retrogradation', de: 5, a: 4, nom: 'Fer', plafond: 2 }]));
  check('… la plus haute ligue atteinte reste au profil, la troupe et le niveau de l’ouvrier aussi',
    cinq.profil.plusHauteLigue === 5 && cinq.profil.debloquees.hydra === 'ligue' && cinq.profil.troupes.villager.niveau === 3);
  check('… en classé, l’ouvrier joue alors au plafond de la ligue 4', niveauEffectif(cinq.profil, 'villager', { mode: 'classe' }) === 2);
  const suiteEnFer = jouer(cinq.profil, 'D'.repeat(50));
  check('… et une fois en ligue 4, on ne descend plus', suiteEnFer.profil.ligue === 4 && suiteEnFer.profil.elo === 0);

  const or = jouer(profilA(1150), 'DDDD');
  check('ligue 6 : à 1 090 on y reste, à 1 075 on redescend en ligue 5',
    or.profil.elo === 1090 && or.profil.ligue === 6 && jouer(or.profil, 'D').profil.ligue === 5 && jouer(or.profil, 'D').profil.elo === 1075);
  const yoyo = jouer(jouer(or.profil, 'D').profil, 'VV');
  check('… pour remonter, il faut repasser le seuil, pas seulement la marge',
    yoyo.profil.elo === 1135 && yoyo.profil.ligue === 5 && jouer(yoyo.profil, 'V').profil.ligue === 6);
}

// ---------------------------------------------------------------------------
// 8. Troupes avancées : la ligue OU le nombre de parties
// ---------------------------------------------------------------------------
console.log('\n--- Troupes avancées gratuites ---');
{
  const neuf = jouer(profilNeuf(), 'D'.repeat(9));
  const dix = appliquerResultat(neuf.profil, partie('defaite'));
  check('dix parties sans une victoire : l’Atlante se débloque par le nombre de parties',
    !neuf.profil.debloquees.triton && dix.profil.ligue === 1 && dix.profil.debloquees.triton === 'parties'
    && egal(parType(dix.evenements, 'troupeDebloquee'), [{ type: 'troupeDebloquee', troupe: 'triton', origine: 'parties' }]));
  const longue = jouer(dix.profil, 'D'.repeat(70), { jour: jourDe(4) });
  const jalons = parType(longue.evenements, 'troupeDebloquee').map((x) => x.troupe);
  check('… puis l’Archer monté à 25, la Catapulte à 50, l’Hydre à 80',
    egal(jalons, ['horseArcher', 'catapult', 'hydra']) && longue.profil.parties === 80 && longue.profil.ligue === 1
    && ['horseArcher', 'catapult', 'hydra'].every((t) => longue.profil.debloquees[t] === 'parties'));
  const a24 = jouer(dix.profil, 'D'.repeat(14)).profil;
  check('… pas une partie plus tôt', a24.parties === 24 && !a24.debloquees.horseArcher && jouer(a24, 'D').profil.debloquees.horseArcher === 'parties');
  check('quand la ligue arrive d’abord, c’est elle qui débloque', jouer(profilNeuf(), 'VVV').profil.debloquees.triton === 'ligue');
  const gagnee = jouer(dix.profil, 'VVV');
  check('une troupe déjà débloquée ne l’est pas une seconde fois',
    gagnee.profil.ligue === 2 && gagnee.profil.debloquees.triton === 'parties' && parType(gagnee.evenements, 'troupeDebloquee').length === 0);

  const sommet = regulariser({ ...profilNeuf(), elo: 4200, parties: 600, victoires: 400, defaites: 200 });
  check('les trois nouvelles ne se débloquent jamais tant qu’elles sont « à venir » : ni en ligue 10, ni après 600 parties',
    sommet.profil.ligue === 10 && egal(Object.keys(sommet.profil.debloquees).sort(), [...QUATORZE].sort())
    && NOUVELLES.every((t) => !(t in sommet.profil.debloquees) && !(t in sommet.profil.troupes))
    && parType(sommet.evenements, 'troupeDebloquee').every((x) => QUATORZE.includes(x.troupe)));
  check('… les ligues 6, 7 et 8 donnent quand même leur coffre', coffresDe(sommet.profil, 'or') === 6 && coffresDe(sommet.profil, 'legendaire') === 3);
}

// ---------------------------------------------------------------------------
// 9. Les coffres gagnés en jouant
// ---------------------------------------------------------------------------
console.log('\n--- Coffres : bois, argent, or ---');
{
  // Bois : chaque victoire, cinq par jour au plus.
  const cinq = jouer(profilNeuf(), 'VVVVV');
  check('une victoire, un coffre de bois', coffresDe(jouer(profilNeuf(), 'V').profil, 'bois') === 1 && coffresDe(cinq.profil, 'bois') === 5);
  const six = appliquerResultat(cinq.profil, partie('victoire'));
  check('la sixième victoire du jour n’en donne pas, et l’écran le sait',
    coffresDe(six.profil, 'bois') === 5 && egal(parType(six.evenements, 'coffreDeBoisPlafonne'), [{ type: 'coffreDeBoisPlafonne', parJour: 5 }])
    && !six.evenements.some((x) => x.type === 'coffre' && x.coffre === 'bois') && six.profil.elo === 180);
  const lendemain = appliquerResultat(six.profil, partie('victoire', { jour: jourDe(3) }));
  check('le lendemain, le compteur repart', coffresDe(lendemain.profil, 'bois') === 6 && lendemain.profil.jour.coffresBois === 1 && lendemain.profil.jour.date === jourDe(3));
  const recule = appliquerResultat(six.profil, partie('victoire', { jour: jourDe(1) }));
  check('reculer l’horloge ne le remet pas à zéro', coffresDe(recule.profil, 'bois') === 5 && recule.profil.jour.date === jourDe(2));
  check('une défaite ou une égalité ne donne pas de coffre de bois', coffresDe(jouer(profilNeuf(), 'DDEE').profil, 'bois') === 0);

  // Argent : tous les dix points de bataille.
  const neuf = jouer(profilNeuf(), 'DDDDEEEEE');
  check('défaite et égalité valent 1 point de bataille : neuf parties, neuf points, pas encore de coffre',
    neuf.profil.pointsDeBataille === 9 && coffresDe(neuf.profil, 'argent') === 0);
  const dixieme = appliquerResultat(neuf.profil, partie('defaite'));
  check('au dixième point, un coffre d’argent : une défaite fait avancer vers le coffre',
    coffresDe(dixieme.profil, 'argent') === 1 && dixieme.profil.pointsDeBataille === 0
    && egal(parType(dixieme.evenements, 'pointsDeBataille'), [{ type: 'pointsDeBataille', gagnes: 1, total: 0, pour: 10 }])
    && dixieme.profil.coffres.find((c) => c.type === 'argent').origine === 'bataille');
  const deborde = appliquerResultat(neuf.profil, partie('victoire'));
  check('une victoire en vaut 2 : de 9 on passe à 11, un coffre et 1 point d’avance',
    coffresDe(deborde.profil, 'argent') === 1 && deborde.profil.pointsDeBataille === 1 && parType(deborde.evenements, 'pointsDeBataille')[0].gagnes === 2);
  check('cinq victoires font un coffre d’argent', coffresDe(cinq.profil, 'argent') === 1 && cinq.profil.pointsDeBataille === 0);

  // Or : trois jours joués dans la semaine (du lundi au dimanche).
  check('le 5 octobre 2026 est bien un lundi', new Date(LUNDI).getUTCDay() === 1 && jourDe(0) === '2026-10-05' && jourDe(7) === '2026-10-12');
  let p = profilNeuf();
  const semaine = [];
  for (const n of [0, 0, 0, 1, 2, 2, 3, 6]) {
    const r = appliquerResultat(p, partie('defaite', { jour: jourDe(n) }));
    p = r.profil;
    semaine.push(r.evenements.filter((x) => x.type === 'coffre' && x.origine === 'semaine').length);
  }
  check('trois parties le même jour ne font pas trois jours ; le coffre d’or arrive au troisième jour joué',
    egal(semaine, [0, 0, 0, 0, 1, 0, 0, 0]) && coffresDe(p, 'or') === 1 && p.coffres.find((c) => c.type === 'or').origine === 'semaine',
    semaine.join(' '));
  check('… un seul par semaine, même en jouant cinq jours', p.semaine.jours === 5 && p.semaine.coffre === true);
  for (const n of [7, 8]) p = appliquerResultat(p, partie('defaite', { jour: jourDe(n) })).profil;
  const troisieme = appliquerResultat(p, partie('defaite', { jour: jourDe(13) }));
  check('la semaine suivante repart de zéro : lundi, mardi, puis dimanche — un second coffre',
    coffresDe(p, 'or') === 1 && coffresDe(troisieme.profil, 'or') === 2 && troisieme.profil.semaine.jours === 3);
  const cheval = jouer(jouer(jouer(profilNeuf(), 'D', { jour: jourDe(5) }).profil, 'D', { jour: jourDe(6) }).profil, 'D', { jour: jourDe(7) });
  check('samedi, dimanche, lundi : trois jours de suite mais deux semaines, pas de coffre', coffresDe(cheval.profil, 'or') === 0 && cheval.profil.semaine.jours === 1);
  let annulees = profilNeuf();
  for (const n of [0, 1, 2, 3]) annulees = appliquerResultat(annulees, partie('annulee', { jour: jourDe(n) })).profil;
  check('une partie annulée ne compte pas comme un jour joué', coffresDe(annulees, 'or') === 0 && annulees.semaine.jours === 0);
  const bissextile = jouer(jouer(jouer(profilNeuf(), 'D', { jour: '2028-02-28' }).profil, 'D', { jour: '2028-02-29' }).profil, 'D', { jour: '2028-03-01' });
  check('le calendrier tient les années bissextiles : lundi 28 février, mardi 29, mercredi 1er mars 2028',
    new Date(Date.UTC(2028, 1, 28)).getUTCDay() === 1 && coffresDe(bissextile.profil, 'or') === 1);
}

// ---------------------------------------------------------------------------
// 10. Contre l'ordinateur
// ---------------------------------------------------------------------------
console.log('\n--- Contre l’ordinateur ---');
{
  const fer = appliquerResultat(profilA(720), partie('victoire', { contreOrdinateur: true }));
  check('jusqu’à la ligue 4, la partie contre l’ordinateur compte normalement — promotion comprise',
    fer.profil.elo === 750 && fer.profil.ligue === 5 && parType(fer.evenements, 'elo')[0].classee === true);
  const perdue = appliquerResultat(profilA(300), partie('defaite', { contreOrdinateur: true }));
  check('… une défaite y coûte ses 15 points', perdue.profil.elo === 285);
  const argent = appliquerResultat(profilA(780), partie('victoire', { contreOrdinateur: true }));
  check('à partir de la ligue 5, elle ne rapporte que des coffres : l’Elo ne bouge pas',
    argent.profil.elo === 780 && egal(parType(argent.evenements, 'elo'), [{ type: 'elo', avant: 780, apres: 780, variation: 0, classee: false }])
    && coffresDe(argent.profil, 'bois') === 1 && argent.profil.pointsDeBataille === 2 && argent.profil.parties === 1 && argent.profil.victoires === 1);
  const revers = appliquerResultat(profilA(780), partie('defaite', { contreOrdinateur: true }));
  check('… une défaite n’y coûte rien et avance quand même vers le coffre d’argent', revers.profil.elo === 780 && revers.profil.pointsDeBataille === 1);
  check('… contre un joueur, la même partie compte', appliquerResultat(profilA(780), partie('victoire')).profil.elo === 810);
}

// ---------------------------------------------------------------------------
// 11. Abandons précoces et déconnexions
// ---------------------------------------------------------------------------
console.log('\n--- Abandons précoces, déconnexions ---');
{
  const tot = (instant) => partie('abandon', { duree: 30, instant });
  let p = profilA(300);
  const fermetures = [];
  for (const instant of [1000, 1100, 1200]) {
    const r = appliquerResultat(p, tot(instant));
    p = r.profil;
    fermetures.push(parType(r.evenements, 'rechercheFermee'));
  }
  check('deux abandons avant deux minutes ne ferment rien', fermetures[0].length === 0 && fermetures[1].length === 0);
  check('le troisième de la journée ferme la recherche dix minutes',
    egal(fermetures[2], [{ type: 'rechercheFermee', secondes: 600, jusqua: 1800 }]) && p.rechercheFermeeJusqua === 1800 && p.jour.abandonsPrecoces === 3);
  check('… chacun a coûté ses 15 points', p.elo === 255 && p.defaites === 3);
  check('rechercheFermee dit le temps qui reste, puis 0',
    rechercheFermee(p, 1200) === 600 && rechercheFermee(p, 1500) === 300 && rechercheFermee(p, 1800) === 0 && rechercheFermee(p, 5000) === 0
    && rechercheFermee(profilNeuf(), 1200) === 0);
  const sansHeure = appliquerResultat(appliquerResultat(appliquerResultat(profilA(300), tot()).profil, tot()).profil, tot());
  check('sans heure, l’événement suffit : dix minutes, à dater par celui qui a l’horloge',
    egal(parType(sansHeure.evenements, 'rechercheFermee'), [{ type: 'rechercheFermee', secondes: 600, jusqua: null }]) && sansHeure.profil.rechercheFermeeJusqua === 0);
  let tardifs = profilA(300);
  for (let i = 0; i < 4; i++) tardifs = appliquerResultat(tardifs, partie('abandon', { duree: 120, instant: 50 })).profil;
  check('un abandon après deux minutes n’est pas précoce', tardifs.jour.abandonsPrecoces === 0 && tardifs.rechercheFermeeJusqua === 0 && tardifs.elo === 240);
  const demain = appliquerResultat(p, partie('abandon', { duree: 30, instant: 90000, jour: jourDe(3) }));
  check('le lendemain, le compteur d’abandons repart', demain.profil.jour.abandonsPrecoces === 1 && parType(demain.evenements, 'rechercheFermee').length === 0);

  check('déconnexion : 30 secondes de pause, 60 au plus par joueur ; au-delà, c’est un abandon',
    pauseAccordee(0) === 30 && pauseAccordee(30) === 30 && pauseAccordee(45) === 15 && pauseAccordee(60) === 0 && pauseAccordee(90) === 0
    && pauseAccordee(undefined) === 30);
}

// ---------------------------------------------------------------------------
// 12. Ouvrir un coffre : la procédure
// ---------------------------------------------------------------------------
console.log('\n--- Ouvrir un coffre ---');
{
  // Bois : commune sous 800, rare sous 970, épique au-delà.
  const depart = geler(avecCoffre(profilNeuf(), 'bois'));
  const alea = aleaEcrit(0.1, 0, 0.9, 0.99, 0.99, 0.5);
  const o = ouvrirCoffre(depart, 0, alea);
  check('un coffre de bois : trois tirages, deux nombres de hasard chacun', o.coffre === 'bois' && o.tirages.length === 3 && alea.appels() === 6);
  check('… la catégorie vient de la table, la troupe du second nombre, la quantité est fixe',
    egal(o.tirages[0], { genre: 'ordinaire', tiree: 'commune', categorie: 'commune', troupe: 'villager', fragments: 5, eclats: 0 })
    && egal(o.tirages[1], { genre: 'ordinaire', tiree: 'rare', categorie: 'rare', troupe: 'ram', fragments: 2, eclats: 0 }),
    JSON.stringify(o.tirages.map((t) => [t.tiree, t.troupe, t.fragments])));
  check('… épique sans troupe épique débloquée : le tirage passe à la catégorie du dessous, quantité comprise',
    egal(o.tirages[2], { genre: 'ordinaire', tiree: 'epique', categorie: 'rare', troupe: 'crossbowman', fragments: 2, eclats: 0 }));
  check('… les fragments sont au profil, le coffre n’y est plus, l’ancien profil n’a pas bougé',
    o.profil.troupes.villager.fragments === 5 && o.profil.troupes.ram.fragments === 2 && o.profil.troupes.crossbowman.fragments === 2
    && o.profil.coffres.length === 0 && depart.coffres.length === 1 && depart.troupes.villager.fragments === 0);
  check('… l’événement résume ce que le coffre a donné',
    egal(o.evenements[0], { type: 'coffreOuvert', coffre: 'bois', origine: 'victoire', fragments: { villager: 5, ram: 2, crossbowman: 2 }, eclats: 0 }));
  const limites = ouvrirCoffre(avecCoffre(toutDebloque(), 'bois', 'bois'), 0, aleaEcrit(0.7995, 0, 0.8005, 0, 0.9695, 0));
  const hautes = ouvrirCoffre(avecCoffre(toutDebloque(), 'bois'), 0, aleaEcrit(0.9705, 0, 0.9999, 0.9999, 0, 0));
  check('les bornes de la table : 799 commune, 800 et 969 rare, 970 et 999 épique, 0 commune',
    egal(limites.tirages.map((t) => t.tiree), ['commune', 'rare', 'rare']) && egal(hautes.tirages.map((t) => t.tiree), ['epique', 'epique', 'commune']));
  check('… avec une troupe épique débloquée, l’épique donne 1 fragment d’épique',
    hautes.tirages[0].troupe === 'triton' && hautes.tirages[0].fragments === 1 && hautes.tirages[1].troupe === 'hydra');
  check('… on ouvre le coffre désigné, les autres attendent', limites.profil.coffres.length === 1
    && ouvrirCoffre(avecCoffre(profilNeuf(), 'bois', 'or', 'argent'), 1, aleaEcrit()).coffre === 'or'
    && egal(ouvrirCoffre(avecCoffre(profilNeuf(), 'bois', 'or', 'argent'), 1, aleaEcrit()).profil.coffres.map((c) => c.type), ['bois', 'argent']));

  // À chances égales, parmi les troupes débloquées qui ne sont pas au maximum.
  const choix = (profil, nombre) => ouvrirCoffre(avecCoffre(profil, 'bois'), 0, aleaEcrit(0.1, nombre)).tirages[0].troupe;
  check('à chances égales : le second nombre partage la catégorie en parts égales',
    egal([0, 0.19, 0.2, 0.45, 0.6, 0.85, 0.999].map((n) => choix(profilNeuf(), n)), ['villager', 'villager', 'militia', 'spearman', 'archer', 'scout', 'scout']));
  const milicienMax = profilNeuf();
  milicienMax.troupes.militia.niveau = 5;
  check('une troupe au niveau maximum n’est plus tirée',
    egal([0, 0.25, 0.5, 0.75].map((n) => choix(milicienMax, n)), ['villager', 'spearman', 'archer', 'scout']));
  const uneEpique = profilNeuf();
  uneEpique.debloquees.hydra = 'achat';
  check('une troupe verrouillée non plus : seule l’Hydre débloquée, tout tirage épique est pour elle',
    [0, 0.5, 0.99].every((n) => ouvrirCoffre(avecCoffre(uneEpique, 'bois'), 0, aleaEcrit(0.99, n)).tirages[0].troupe === 'hydra'));

  // Repli, puis éclats.
  const raresMax = profilNeuf();
  for (const t of RARES) raresMax.troupes[t].niveau = 5;
  const repli = ouvrirCoffre(avecCoffre(raresMax, 'legendaire'), 0, aleaEcrit(0.5, 0)).tirages[0];
  check('toutes les rares au maximum : le tirage rare passe aux communes, avec la quantité des communes',
    egal(repli, { genre: 'ordinaire', tiree: 'rare', categorie: 'commune', troupe: 'villager', fragments: 16, eclats: 0 }));
  const communesMax = toutDebloque();
  for (const t of COMMUNES) communesMax.troupes[t].niveau = 5;
  const perdu = ouvrirCoffre(avecCoffre(communesMax, 'bois'), 0, aleaEcrit(0.1, 0, 0.9, 0, 0.99, 0));
  check('toutes les communes au maximum : rien en dessous, les fragments deviennent des éclats',
    egal(perdu.tirages[0], { genre: 'ordinaire', tiree: 'commune', categorie: null, troupe: null, fragments: 0, eclats: 5 })
    && perdu.tirages[1].troupe === 'knight' && perdu.tirages[2].troupe === 'triton' && perdu.profil.eclats === 5
    && perdu.evenements[0].eclats === 5);
  const toutMax = toutDebloque();
  for (const t of QUATORZE) toutMax.troupes[t].niveau = 5;
  const eclats = ouvrirCoffre(avecCoffre(toutMax, 'legendaire'), 0, aleaDeGraine(4));
  check('tout au maximum : le coffre entier devient des éclats, aucun fragment',
    eclats.tirages.length === 10 && eclats.tirages.every((t) => t.troupe === null && t.fragments === 0 && t.eclats === 16)
    && eclats.profil.eclats === 160 && QUATORZE.every((t) => eclats.profil.troupes[t].fragments === 0));

  // Tirages garantis.
  const or = ouvrirCoffre(avecCoffre(toutDebloque(), 'or'), 0, aleaEcrit(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0));
  check('coffre d’or : six tirages ordinaires, puis les deux garantis',
    egal(or.tirages.map((t) => t.genre), ['ordinaire', 'ordinaire', 'ordinaire', 'ordinaire', 'ordinaire', 'ordinaire', 'garanti', 'garanti']));
  check('… avec le pire hasard, le « rare ou mieux » donne une rare et l’épique une épique',
    egal(or.tirages.map((t) => t.tiree), ['commune', 'commune', 'commune', 'commune', 'commune', 'commune', 'rare', 'epique'])
    && or.tirages[6].fragments === 5 && or.tirages[7].fragments === 3 && or.profil.troupes.villager.fragments === 72);
  check('… l’ouvrier a ses 20 fragments, l’Atlante ses 3 : l’écran est prévenu qu’ils peuvent monter — pas le cavalier, à 5 sur 6',
    egal(parType(or.evenements, 'ameliorationPossible'), [{ type: 'ameliorationPossible', troupe: 'villager', niveau: 2 },
      { type: 'ameliorationPossible', troupe: 'triton', niveau: 2 }]) && or.profil.troupes.knight.fragments === 5);
  let garantis = 0, fautes = 0;
  const graine = aleaDeGraine(77);
  const riche = avecCoffre(toutDebloque(), 'argent', 'or', 'legendaire');
  for (let i = 0; i < 1500; i++) {
    for (const rang of [0, 1, 2]) {
      const r = ouvrirCoffre(riche, rang, graine);
      for (const t of r.tirages.filter((x) => x.genre === 'garanti')) {
        garantis++;
        if (t.tiree === 'commune' || t.categorie === 'commune') fautes++;
        if (r.coffre === 'legendaire' && t.tiree !== 'epique') fautes++;
      }
    }
  }
  check('sur 1 500 coffres de chaque sorte, aucun tirage garanti ne donne de commune', fautes === 0 && garantis === 1500 * 5, `${garantis} tirages garantis`);

  // Refus.
  const p = avecCoffre(profilNeuf(), 'bois');
  check('sans générateur de hasard, rien ne s’ouvre : le moteur ne tire jamais au sort de lui-même',
    ouvrirCoffre(p, 0).erreur === 'alea' && ouvrirCoffre(p, 0, 0.5).erreur === 'alea');
  check('un coffre qui n’existe pas ne s’ouvre pas',
    [-1, 1, 0.5, '0', undefined, NaN].every((i) => ouvrirCoffre(p, i, aleaEcrit()).erreur === 'coffre') && ouvrirCoffre(profilNeuf(), 0, aleaEcrit()).erreur === 'coffre');
  const fautif = ouvrirCoffre(p, 0, () => 1.5);
  const absurde = ouvrirCoffre(p, 0, () => NaN);
  check('un générateur fautif (1,5, NaN) ne fait sortir ni de la table ni de la liste des troupes',
    fautif.tirages.every((t) => t.tiree === 'epique' && t.troupe === 'ram') && absurde.tirages.every((t) => t.troupe === 'villager'));

  // Même graine, mêmes tirages.
  const serie = (g) => {
    const a = aleaDeGraine(g);
    let q = avecCoffre(toutDebloque(), 'bois', 'argent', 'or', 'legendaire', 'bois', 'or');
    const sortis = [];
    while (q.coffres.length) { const r = ouvrirCoffre(q, 0, a); q = r.profil; sortis.push(r.tirages); }
    return { sortis, profil: q };
  };
  check('même graine, mêmes tirages', egal(serie(2026), serie(2026)) && egal(serie('coffre-42'), serie('coffre-42')));
  check('… une autre graine, d’autres tirages', !egal(serie(2026).sortis, serie(2027).sortis) && !egal(serie('coffre-42').sortis, serie('coffre-43').sortis));
  const a = aleaDeGraine(42), reference = new RNG(42);
  const nombres = Array.from({ length: 2000 }, () => a());
  check('le générateur à graine rend des nombres dans [0, 1), les mêmes que celui du jeu',
    nombres.every((n) => n >= 0 && n < 1) && nombres.every((n) => n === reference.next())
    && proche(somme(nombres) / nombres.length, 0.5, 0.03));
  const journal = serie(9).profil.journal;
  check('le journal garde les dernières ouvertures', journal.length === 6 && journal.every((x) => x.op === 'coffre')
    && journal[2].coffre === 'or' && somme(Object.values(journal[2].fragments)) > 0);
}

// ---------------------------------------------------------------------------
// 13. 20 000 coffres de chaque sorte
// ---------------------------------------------------------------------------
console.log('\n--- 20 000 coffres par type ---');
{
  // Le tableau « Ce qu'un coffre donne en moyenne », avec le nombre de
  // décimales auquel le document l'arrondit.
  const MOYENNES = {
    bois: { tirages: 3, commune: [12, 0], rare: [1, 0], epique: [0.1, 1] },
    argent: { tirages: 5, commune: [21, 0], rare: [6, 0], epique: [0.8, 1] },
    or: { tirages: 8, commune: [36, 0], rare: [15, 0], epique: [5.8, 1] },
    legendaire: { tirages: 10, commune: [45, 0], rare: [26, 0], epique: [16, 0] },
  };
  const N = 20000;
  const base = toutDebloque();
  const sortis = new Set();
  const partsDesTroupes = { commune: {}, rare: {}, epique: {} };
  for (const type of Object.keys(MOYENNES)) {
    const alea = aleaDeGraine(`vingt-mille-${type}`);
    const profil = avecCoffre(base, type);
    const tirees = { commune: 0, rare: 0, epique: 0 };
    const garanties = { commune: 0, rare: 0, epique: 0 };
    const fragments = { commune: 0, rare: 0, epique: 0 };
    let ordinaires = 0, garantis = 0, tirages = 0;
    for (let i = 0; i < N; i++) {
      const r = ouvrirCoffre(profil, 0, alea);
      tirages += r.tirages.length;
      for (const t of r.tirages) {
        if (t.genre === 'ordinaire') { ordinaires++; tirees[t.tiree]++; } else { garantis++; garanties[t.tiree]++; }
        fragments[t.categorie] += t.fragments;
        sortis.add(t.troupe);
        partsDesTroupes[t.categorie][t.troupe] = (partsDesTroupes[t.categorie][t.troupe] || 0) + 1;
      }
    }
    const attendu = MOYENNES[type];
    const table = R.coffres[type].tirages[0].table;
    const frequences = ['commune', 'rare', 'epique'].map((c) => tirees[c] / ordinaires);
    check(`${type} : ${attendu.tirages} tirages par coffre, et les fréquences de la table à un point près`,
      tirages === N * attendu.tirages && ['commune', 'rare', 'epique'].every((c, i) => proche(frequences[i], table[c] / 1000, 0.01)),
      frequences.map((f) => `${(f * 100).toFixed(1)} %`).join(' / '));
    const exacte = probabilitesDe(type).moyenne;
    const mesuree = { commune: fragments.commune / N, rare: fragments.rare / N, epique: fragments.epique / N };
    check(`${type} : les moyennes du tableau — ${attendu.commune[0]} communs, ${attendu.rare[0]} rares, ${attendu.epique[0]} épiques`,
      ['commune', 'rare', 'epique'].every((c) => arrondi(exacte[c], attendu[c][1]) === attendu[c][0]
        && proche(mesuree[c], exacte[c], Math.max(0.03 * exacte[c], 0.01))),
      `mesuré ${mesuree.commune.toFixed(2)} / ${mesuree.rare.toFixed(2)} / ${mesuree.epique.toFixed(2)}, calculé ${exacte.commune} / ${exacte.rare} / ${exacte.epique}`);
    const garanti = R.coffres[type].tirages[1];
    if (garanti && garanti.table.rare) {
      check(`${type} : le « rare ou mieux » donne une rare ${garanti.table.rare / 10} fois sur cent`,
        garanties.commune === 0 && proche(garanties.rare / N, garanti.table.rare / 1000, 0.015) && garantis === N * (attendu.tirages - R.coffres[type].tirages[0].nombre),
        `${(garanties.rare / N * 100).toFixed(1)} %`);
    }
  }
  check('seules les quatorze troupes du jeu sortent des coffres — jamais une troupe à venir',
    sortis.size === 14 && QUATORZE.every((t) => sortis.has(t)) && NOUVELLES.every((t) => !sortis.has(t)));
  const ecartMax = (categorie) => {
    const parts = Object.values(partsDesTroupes[categorie]);
    const total = somme(parts);
    return Math.max(...parts.map((n) => Math.abs(n / total - 1 / parts.length)));
  };
  check('dans une catégorie, chaque troupe a la même chance (à un point près)',
    Object.keys(partsDesTroupes.commune).length === 5 && Object.keys(partsDesTroupes.rare).length === 5 && Object.keys(partsDesTroupes.epique).length === 4
    && ecartMax('commune') < 0.01 && ecartMax('rare') < 0.01 && ecartMax('epique') < 0.01,
    `écarts ${(ecartMax('commune') * 100).toFixed(2)} / ${(ecartMax('rare') * 100).toFixed(2)} / ${(ecartMax('epique') * 100).toFixed(2)} points`);
}

// ---------------------------------------------------------------------------
// 14. Améliorer une troupe
// ---------------------------------------------------------------------------
console.log('\n--- Améliorer ---');
{
  const avec = (type, fragments, niveau = 1, base = profilNeuf()) => {
    const p = migrerProfil(base);
    p.troupes[type] = { niveau, fragments };
    return p;
  };
  check('une troupe non débloquée ne s’améliore pas, même avec ses fragments',
    ameliorer(avec('triton', 50), 'triton').erreur === 'verrouillee' && ameliorer(avec('hydra', 50), 'hydra').erreur === 'verrouillee');
  check('une troupe inconnue ou à venir non plus',
    ['dragon', 'pavoisier', 'constructor', '__proto__', undefined, 3].every((t) => ameliorer(profilNeuf(), t).erreur === 'inconnue'));
  const court = ameliorer(avec('archer', 19), 'archer');
  check('il manque un fragment : refus, avec ce qu’il manque', egal(court, { erreur: 'fragments', cout: 20, fragments: 19, manque: 1 }));
  const depart = geler(avec('archer', 25));
  const monte = ameliorer(depart, 'archer');
  check('assez de fragments : niveau 2, le coût est dépensé, le reste est gardé',
    egal(monte.profil.troupes.archer, { niveau: 2, fragments: 5 })
    && egal(monte.evenements, [{ type: 'amelioration', troupe: 'archer', niveau: 2, cout: 20, fragments: 5, plafond: 1 }]));
  check('… l’ancien profil n’est pas modifié', egal(depart.troupes.archer, { niveau: 1, fragments: 25 }) && monte.profil.journal[0].op === 'amelioration');
  check('… le plafond de la ligue n’empêche pas d’améliorer : il borne le niveau joué en classé',
    niveauEffectif(monte.profil, 'archer', { mode: 'classe' }) === 1 && niveauEffectif(monte.profil, 'archer', { mode: 'ordinateur' }) === 2);

  const escalier = (type, total, base) => {
    let p = avec(type, total, 1, base);
    const couts = [];
    for (;;) { const r = ameliorer(p, type); if (r.erreur) return { p, couts, erreur: r.erreur }; p = r.profil; couts.push(r.evenements[0].cout); }
  };
  const commune = escalier('militia', 630);
  check('commune : 20, 60, 150, 400 — 630 fragments mènent au niveau 5, pas un de moins',
    egal(commune.couts, [20, 60, 150, 400]) && egal(commune.p.troupes.militia, { niveau: 5, fragments: 0 }) && commune.erreur === 'niveauMax'
    && escalier('militia', 629).p.troupes.militia.niveau === 4);
  const rare = escalier('knight', 206);
  check('rare : 6, 20, 50, 130 — 206 en tout', egal(rare.couts, [6, 20, 50, 130]) && egal(rare.p.troupes.knight, { niveau: 5, fragments: 0 }));
  const epique = escalier('catapult', 81, toutDebloque());
  check('épique : 3, 8, 20, 50 — 81 en tout', egal(epique.couts, [3, 8, 20, 50]) && egal(epique.p.troupes.catapult, { niveau: 5, fragments: 0 }));
  check('au niveau maximum, on ne monte plus', ameliorer(avec('archer', 9999, 5), 'archer').erreur === 'niveauMax');
  check('coutAmelioration : le prix du niveau suivant, rien au niveau maximum',
    coutAmelioration('archer', 1) === 20 && coutAmelioration('ram', 3) === 50 && coutAmelioration('hydra', 4) === 50
    && coutAmelioration('archer', 5) === null && coutAmelioration('dragon', 1) === null && coutAmelioration('pavoisier', 1) === null);
}

// ---------------------------------------------------------------------------
// 15. Le niveau joué
// ---------------------------------------------------------------------------
console.log('\n--- Niveau effectif ---');
{
  const p = profilA(800);   // ligue 5, plafond 3
  p.troupes.archer.niveau = 4;
  p.troupes.knight.niveau = 2;
  p.troupes.villager.niveau = 5;
  check('classé : le niveau du joueur, dans la limite du plafond de sa ligue',
    p.ligue === 5 && niveauEffectif(p, 'archer', { mode: 'classe' }) === 3 && niveauEffectif(p, 'knight', { mode: 'classe' }) === 2
    && niveauEffectif(p, 'militia', { mode: 'classe' }) === 1);
  check('… ou de la ligue qu’on lui dit', niveauEffectif(p, 'archer', { mode: 'classe', ligue: 9 }) === 4
    && niveauEffectif(p, 'archer', { mode: 'classe', ligue: 7 }) === 4 && niveauEffectif(p, 'archer', { mode: 'classe', ligue: 3 }) === 2
    && niveauEffectif(p, 'archer', { mode: 'classe', ligue: 1 }) === 1);
  check('… l’ouvrier y joue toujours au plafond : l’économie n’est jamais inégale',
    niveauEffectif(p, 'villager', { mode: 'classe' }) === 3 && niveauEffectif(profilNeuf(), 'villager', { mode: 'classe', ligue: 9 }) === 5
    && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every((l) => niveauEffectif(p, 'villager', { mode: 'classe', ligue: l }) === plafondDe(l)));
  check('contre l’ordinateur : le niveau réel, sans plafond',
    niveauEffectif(p, 'archer', { mode: 'ordinateur' }) === 4 && niveauEffectif(p, 'villager', { mode: 'ordinateur' }) === 5
    && niveauEffectif(p, 'archer') === 4);
  check('amical « niveaux égaux » : tout le monde au niveau 1',
    niveauEffectif(p, 'archer', { mode: 'amical', egaux: true }) === 1 && niveauEffectif(p, 'villager', { mode: 'amical', egaux: true }) === 1
    && niveauEffectif(p, 'archer', { mode: 'amical' }) === 1);
  check('amical « niveaux réels » : le niveau réel', niveauEffectif(p, 'archer', { mode: 'amical', egaux: false }) === 4
    && niveauEffectif(p, 'villager', { mode: 'amical', egaux: false }) === 5);
  check('une troupe que le profil ne connaît pas joue au niveau 1',
    niveauEffectif(p, 'deer') === 1 && niveauEffectif(p, 'pavoisier', { mode: 'classe' }) === 1 && niveauEffectif(p, 'constructor') === 1);
}

// ---------------------------------------------------------------------------
// 16. La définition d'une troupe à son niveau
// ---------------------------------------------------------------------------
console.log('\n--- Définition au niveau ---');
{
  const origine = JSON.stringify(UNIT_TYPES);
  const au = (type, niveau) => definitionAuNiveau(UNIT_TYPES[type], type, niveau);
  const identiques = QUATORZE.filter((t) => egal(au(t, 1), UNIT_TYPES[t]) && JSON.stringify(au(t, 1)) === JSON.stringify(UNIT_TYPES[t]));
  check('au niveau 1, les quatorze troupes sont identiques à UNIT_TYPES, champ par champ', identiques.length === 14,
    `${identiques.length} sur 14`);
  check('… sans champ ajouté ni retiré', QUATORZE.every((t) => egal(Object.keys(au(t, 1)), Object.keys(UNIT_TYPES[t]))));
  check('… et c’est une NOUVELLE définition, qui ne partage rien avec l’originale',
    QUATORZE.every((t) => au(t, 1) !== UNIT_TYPES[t] && au(t, 1).cost !== UNIT_TYPES[t].cost)
    && au('villager', 1).gather !== UNIT_TYPES.villager.gather && au('spearman', 3).bonus !== UNIT_TYPES.spearman.bonus);
  check('… les animaux, qui n’ont pas de niveau, ressortent tels quels', egal(au('deer', 1), UNIT_TYPES.deer) && egal(au('pig', 4), UNIT_TYPES.pig));

  // L'ouvrier.
  const o = [1, 2, 3, 4, 5].map((n) => au('villager', n));
  check('ouvrier : récolte ×1, ×1,125, ×1,25, puis inchangée',
    egal(o[0].gather, { wood: 0.55, gold: 0.5, food: 0.5 })
    && proche(o[1].gather.food, 0.5625) && proche(o[1].gather.gold, 0.5625) && proche(o[1].gather.wood, 0.61875)
    && proche(o[2].gather.food, 0.625) && proche(o[2].gather.gold, 0.625) && proche(o[2].gather.wood, 0.6875)
    && egal(o[3].gather, o[2].gather) && egal(o[4].gather, o[2].gather),
    o.map((d) => `${d.gather.food}/${d.gather.wood}`).join('  '));
  check('… soit, par 10 secondes, 5 – 5,6 – 6,25 de nourriture et 5,5 – 6,2 – 6,9 de bois',
    egal(o.slice(0, 3).map((d) => arrondi(d.gather.food * 10, 2)), [5, 5.63, 6.25]) && egal(o.slice(0, 3).map((d) => arrondi(d.gather.wood * 10, 1)), [5.5, 6.2, 6.9]));
  check('… chargement de 10, puis 12 aux niveaux 4 et 5', egal(o.map((d) => d.carry), [10, 10, 10, 12, 12]));
  check('… `construction: 1.1` au niveau 5, et à ce niveau seulement',
    o[4].construction === 1.1 && o.slice(0, 4).every((d) => !('construction' in d)));
  check('… ni ses points de vie ni son attaque ne montent', o.every((d) => d.hp === 45 && d.attack === 3 && d.speed === 1.15));

  // Le tableau « Les autres troupes » : niveau 1 et niveau 5.
  const cinq = (type) => au(type, 5);
  check('milicien : 45 PV et 5 dégâts → 54 et 6', au('militia', 1).hp === 45 && au('militia', 1).attack === 5 && cinq('militia').hp === 54 && cinq('militia').attack === 6);
  check('lancier : 45 PV, +10 contre la cavalerie → 54 et +14 ; son attaque et son bonus contre les engins ne bougent pas',
    cinq('spearman').hp === 54 && cinq('spearman').bonus.cavalry === 14 && cinq('spearman').attack === 4 && cinq('spearman').bonus.siege === 6
    && egal([1, 2, 3, 4, 5].map((n) => au('spearman', n).bonus.cavalry), [10, 11, 12, 13, 14]));
  check('archer : 30 PV et 4 dégâts → 36 et 4,8 ; la portée ne bouge jamais',
    cinq('archer').hp === 36 && proche(cinq('archer').attack, 4.8) && [1, 2, 3, 4, 5].every((n) => au('archer', n).range === 5));
  check('éclaireur : 45 PV, vitesse 1,75 → 54 et 1,89 (+2 % par niveau)',
    cinq('scout').hp === 54 && proche(cinq('scout').speed, 1.89) && cinq('scout').attack === 3
    && [1, 2, 3, 4, 5].every((n) => proche(au('scout', n).speed, 1.75 * (1 + 0.02 * (n - 1)))));
  check('cavalier : 100 PV et 10 dégâts → 120 et 12', cinq('knight').hp === 120 && cinq('knight').attack === 12);
  check('champion : 85 PV et 9 dégâts → 102 et 10,8', cinq('champion').hp === 102 && proche(cinq('champion').attack, 10.8));
  check('arbalétrier : 40 PV et 9 dégâts → 48 et 10,8', cinq('crossbowman').hp === 48 && proche(cinq('crossbowman').attack, 10.8));
  check('prêtresse : 30 PV, soigne 8 → 36 et 10 (+0,5 par niveau)',
    cinq('priest').hp === 36 && cinq('priest').heal === 10 && cinq('priest').attack === 0 && egal([1, 2, 3, 4, 5].map((n) => au('priest', n).heal), [8, 8.5, 9, 9.5, 10]));
  check('bélier : 200 PV, +35 contre les bâtiments → 240 et +43 (+2 par niveau)',
    cinq('ram').hp === 240 && cinq('ram').bonus.building === 43 && cinq('ram').attack === 4 && egal([1, 2, 3, 4, 5].map((n) => au('ram', n).bonus.building), [35, 37, 39, 41, 43]));
  check('Atlante : 60 PV et 6 dégâts → 72 et 7,2', cinq('triton').hp === 72 && proche(cinq('triton').attack, 7.2) && cinq('triton').bonus.cavalry === 6);
  check('archer monté : 60 PV et 5 dégâts → 72 et 6', cinq('horseArcher').hp === 72 && cinq('horseArcher').attack === 6);
  check('catapulte : 70 PV et 26 dégâts → 84 et 31,2', cinq('catapult').hp === 84 && proche(cinq('catapult').attack, 31.2) && cinq('catapult').bonus.building === 34);
  check('Hydre : 280 PV et 11 dégâts → 336 et 13,2', cinq('hydra').hp === 336 && proche(cinq('hydra').attack, 13.2) && cinq('hydra').morsures === 3);

  check('règle générale : +5 % de dégâts par niveau',
    egal([1, 2, 3, 4, 5].map((n) => au('militia', n).attack), [5, 5.25, 5.5, 5.75, 6])
    && ['knight', 'champion', 'crossbowman', 'triton', 'horseArcher', 'catapult', 'hydra', 'archer'].every((t) =>
      [1, 2, 3, 4, 5].every((n) => proche(au(t, n).attack, UNIT_TYPES[t].attack * (1 + 0.05 * (n - 1))))));
  const militaires = QUATORZE.filter((t) => t !== 'villager');
  check('… +5 % de points de vie par niveau, arrondis à l’entier : ils restent des entiers',
    egal([1, 2, 3, 4, 5].map((n) => au('militia', n).hp), [45, 47, 50, 52, 54])
    && militaires.every((t) => [1, 2, 3, 4, 5].every((n) => Number.isInteger(au(t, n).hp) && Math.abs(au(t, n).hp - UNIT_TYPES[t].hp * (1 + 0.05 * (n - 1))) <= 0.5)));
  const fixes = ['range', 'attackSpeed', 'cost', 'trainTime', 'meleeArmor', 'pierceArmor', 'los', 'radius', 'class', 'attackType', 'from', 'age', 'pop', 'splash', 'morsures', 'name', 'id'];
  check('ni la portée, ni la cadence, ni le coût, ni le temps de formation ne changent, pour aucune troupe à aucun niveau',
    QUATORZE.every((t) => [1, 2, 3, 4, 5].every((n) => fixes.every((champ) => egal(au(t, n)[champ], UNIT_TYPES[t][champ])))));
  const monte = (type, lire) => [2, 3, 4, 5].every((n) => lire(au(type, n)) >= lire(au(type, n - 1)));
  check('une troupe ne perd jamais rien en montant de niveau',
    QUATORZE.every((t) => monte(t, (d) => d.hp) && monte(t, (d) => d.attack) && monte(t, (d) => d.speed)));
  check('un niveau hors bornes est ramené dans les bornes',
    egal(au('militia', 99), au('militia', 5)) && egal(au('militia', 0), au('militia', 1)) && egal(au('militia', -3), au('militia', 1))
    && egal(au('militia', 2.9), au('militia', 2)) && egal(au('militia', undefined), au('militia', 1)) && egal(au('militia', '4'), au('militia', 1)));
  check('une troupe inconnue des réglages ressort telle quelle, à tout niveau',
    egal(definitionAuNiveau(UNIT_TYPES.militia, 'dragon', 5), UNIT_TYPES.militia) && egal(definitionAuNiveau(UNIT_TYPES.deer, 'deer', 5), UNIT_TYPES.deer));
  check('le même calcul donne deux fois le même résultat, au bit près',
    QUATORZE.every((t) => [1, 2, 3, 4, 5].every((n) => JSON.stringify(au(t, n)) === JSON.stringify(au(t, n)))));
  check('le jour où elles existeront, les nouvelles troupes suivront la règle générale',
    definitionAuNiveau(R.troupes.pavoisier.depart, 'pavoisier', 5).hp === 84 && proche(definitionAuNiveau(R.troupes.sapeur.depart, 'sapeur', 5).attack, 3.6));
  check('UNIT_TYPES n’a pas été modifié', JSON.stringify(UNIT_TYPES) === origine);
}

// ---------------------------------------------------------------------------
// 17. Fin de saison
// ---------------------------------------------------------------------------
console.log('\n--- Fin de saison ---');
{
  const haut = geler(profilA(2350));
  const f = finDeSaison(haut);
  check('ce qui dépasse 750 est réduit de moitié : 2 350 repart à 1 550',
    f.profil.elo === 1550 && egal(parType(f.evenements, 'remiseDeSaison'), [{ type: 'remiseDeSaison', avant: 2350, apres: 1550, variation: -800 }]));
  check('… la saison suivante commence', haut.saison === 1 && f.profil.saison === 2 && egal(parType(f.evenements, 'saison'), [{ type: 'saison', numero: 2 }])
    && egal(f.profil.saisons, [{ numero: 1, ligue: 8, elo: 2350 }]));
  check('… la récompense est celle de la ligue où l’on finit : en ligue 8, un coffre légendaire',
    haut.ligue === 8 && coffresDe(f.profil, 'legendaire') === 1 && f.profil.coffres[0].origine === 'saison'
    && egal(parType(f.evenements, 'recompenseSaison'), [{ type: 'recompenseSaison', saison: 1, ligue: 8, coffre: 'legendaire', cadeaux: [] }]));
  check('… on redescend à la ligue de son nouveau score, la plus haute atteinte reste au profil',
    f.profil.ligue === 6 && f.profil.plusHauteLigue === 8 && egal(parType(f.evenements, 'retrogradation').map((x) => x.a), [7, 6]));
  check('… les récompenses déjà gagnées restent : remonter ne les redonne pas',
    egal(f.profil.promotions, haut.promotions) && f.profil.debloquees.hydra === 'ligue'
    && parType(jouer({ ...f.profil, elo: 1640 }, 'V').evenements, 'recompensePromotion').length === 0);
  check('… l’ancien profil n’est pas modifié', haut.elo === 2350 && haut.saison === 1 && haut.coffres.length === 0);

  const bas = finDeSaison(profilA(600));
  check('sous 750, rien ne bouge — et pas de récompense avant la ligue 5',
    bas.profil.elo === 600 && bas.profil.ligue === 4 && bas.profil.coffres.length === 0 && bas.profil.saison === 2
    && parType(bas.evenements, 'recompenseSaison').length === 0);
  const pile = finDeSaison(profilA(750));
  check('à 750 tout juste : rien ne bouge, ligue 5, coffre d’or', pile.profil.elo === 750 && pile.profil.ligue === 5 && coffresDe(pile.profil, 'or') === 1);
  check('un excédent impair est arrondi à l’entier inférieur : 765 repart à 757', finDeSaison(profilA(765)).profil.elo === 757);
  const marge = finDeSaison(jouer(profilA(750), 'DDD').profil);
  check('en ligue 5 sous le seuil mais dans la marge : on y reste, avec son coffre', marge.profil.elo === 705 && marge.profil.ligue === 5 && coffresDe(marge.profil, 'or') === 1);

  const recompense = (elo) => {
    const r = finDeSaison(profilA(elo));
    const e = parType(r.evenements, 'recompenseSaison')[0];
    return e ? [e.coffre, ...e.cadeaux.map((c) => c.genre)].join('+') : '';
  };
  check('récompenses : rien en ligues 1 à 4, or en 5 et 6, légendaire en 7 et 8, bannière en plus en 9, titre de saison en plus en 10',
    egal([0, 90, 240, 450, 750, 1150, 1650, 2300, 3100, 4000].map(recompense),
      ['', '', '', '', 'or', 'or', 'legendaire', 'legendaire', 'legendaire+banniere', 'legendaire+banniere+titre']));
  const legende = finDeSaison(profilA(4100));
  check('une Légende à 4 100 repart à 2 425, en ligue 8', legende.profil.elo === 2425 && legende.profil.ligue === 8 && legende.profil.plusHauteLigue === 10);
  const tous = [750, 800, 1150, 1200, 1650, 2300, 3100, 4000, 9000].map((elo) => finDeSaison(profilA(elo)).profil);
  check('la fin de saison ne fait jamais redescendre sous la ligue 5', tous.every((p) => p.ligue >= 5 && p.elo >= 750), tous.map((p) => `${p.elo} → ligue ${p.ligue}`).join(', '));
  let ancien = profilA(900);
  for (let i = 0; i < 30; i++) ancien = finDeSaison(ancien).profil;
  check('trente saisons plus tard : saison 31, l’historique ne garde que les dernières',
    ancien.saison === 31 && ancien.saisons.length === R.profil.saisons && ancien.saisons[ancien.saisons.length - 1].numero === 30 && ancien.elo === 750);
}

// ---------------------------------------------------------------------------
// 18. Recherche d'adversaire
// ---------------------------------------------------------------------------
console.log('\n--- Recherche d’adversaire ---');
{
  check('la fenêtre : ±60 au départ, +30 toutes les 5 secondes',
    egal([0, 4.9, 5, 9.9, 10, 30, 55].map(fenetreDeRecherche), [60, 60, 90, 90, 120, 240, 390]));
  check('… ±400 au plus', egal([60, 61, 600, 1e9, Infinity].map(fenetreDeRecherche), [400, 400, 400, 400, 400]));
  check('… une attente absurde vaut zéro', egal([-3, NaN, undefined, 'x'].map(fenetreDeRecherche), [60, 60, 60, 60]));

  const ids = (resultat) => resultat.paires.map((x) => [x.a, x.b].sort().join('-'));
  const j = (id, elo, depuis = 100, dernierAdversaire = null) => ({ id, elo, depuis, dernierAdversaire });
  const proches = apparier([j('a', 1000), j('b', 1010), j('c', 1050), j('d', 1055)], 100);
  check('le score le plus proche d’abord', egal(ids(proches), ['c-d', 'a-b']) && egal(proches.paires.map((x) => x.ecart), [5, 10]),
    JSON.stringify(proches.paires));
  const trio = apparier([j('a', 1000), j('b', 1040), j('c', 1050)], 100);
  check('… le troisième attend', egal(ids(trio), ['b-c']) && egal(trio.enAttente, ['a']) && trio.ordinateur.length === 0);

  // La fenêtre de CHACUN.
  const patient = [j('vieux', 1000, 60), j('neuf', 1100, 100)];
  check('la fenêtre de chacun est respectée : 100 points d’écart, l’un attend depuis 40 s, l’autre arrive — pas de partie',
    apparier(patient, 100).paires.length === 0 && egal(apparier(patient, 100).enAttente, ['vieux', 'neuf']));
  check('… dix secondes plus tard, la fenêtre du second (±120) l’admet', egal(ids(apparier(patient, 110)), ['neuf-vieux']));
  check('… à 60 points d’écart, la partie se fait tout de suite ; à 61, non',
    apparier([j('a', 1000), j('b', 1060)], 100).paires.length === 1 && apparier([j('a', 1000), j('b', 1061)], 100).paires.length === 0);
  check('… jamais au-delà de ±400, même après une heure',
    apparier([j('a', 1000, 0), j('b', 1401, 0)], 3600).paires.length === 0 && apparier([j('a', 1000, 0), j('b', 1400, 0)], 3600).paires.length === 1);

  // Jamais deux fois de suite le même adversaire.
  check('jamais deux fois de suite le même adversaire',
    apparier([j('a', 1000, 100, 'b'), j('b', 1000, 100, 'a')], 100).paires.length === 0
    && apparier([j('a', 1000, 100, 'b'), j('b', 1000)], 100).paires.length === 0 && apparier([j('a', 1000), j('b', 1000, 100, 'a')], 100).paires.length === 0);
  check('… chacun trouve alors quelqu’un d’autre', egal(ids(apparier([j('a', 1000, 100, 'b'), j('b', 1000, 100, 'a'), j('c', 1020), j('d', 980)], 100)).sort(), ['a-c', 'b-d']));
  check('… un adversaire plus ancien que le dernier est de nouveau permis', apparier([j('a', 1000, 100, 'z'), j('b', 1000, 100, 'y')], 100).paires.length === 1);

  const egaux = apparier([j('p', 1000, 80), j('q', 1020, 80), j('s', 1040, 50)], 100);
  check('à écart égal, celui qui attend depuis le plus longtemps passe d’abord', egal(ids(egaux), ['q-s']) && egaux.paires[0].a === 's' && egal(egaux.enAttente, ['p']));

  // L'ordinateur.
  // (Quatre joueurs trop éloignés les uns des autres pour s'affronter.)
  const longue = apparier([j('pierre', 200, 0), j('or', 1200, 39), j('recent', 2000, 50), { ...j('retro', 700, 0), ligue: 5 }], 100);
  check('au bout de 60 secondes sans adversaire, on propose l’ordinateur',
    longue.paires.length === 0 && egal(longue.ordinateur.map((x) => x.id), ['pierre', 'or', 'retro']) && egal(longue.enAttente, ['recent']));
  check('… la partie compte jusqu’à la ligue 4, pas au-delà (la ligue du joueur prime sur son score)',
    egal(longue.ordinateur.map((x) => x.classee), [true, false, false]));
  check('… à 59 secondes, on attend encore', apparier([j('a', 300, 41)], 100).ordinateur.length === 0 && apparier([j('a', 300, 40)], 100).ordinateur.length === 1);

  // Tenue générale.
  const alea = aleaDeGraine(31);
  const foule = Array.from({ length: 200 }, (_, i) => j(`j${i}`, Math.floor(alea() * 4500), Math.floor(alea() * 90), alea() < 0.2 ? `j${Math.floor(alea() * 200)}` : null));
  const fige = JSON.stringify(foule);
  const r = apparier(foule, 100);
  const parId = Object.fromEntries(foule.map((x) => [x.id, x]));
  const places = [...r.paires.flatMap((x) => [x.a, x.b]), ...r.ordinateur.map((x) => x.id), ...r.enAttente];
  check('200 joueurs : chacun est placé une fois et une seule', places.length === 200 && new Set(places).size === 200, `${r.paires.length} parties, ${r.ordinateur.length} contre l’ordinateur, ${r.enAttente.length} en attente`);
  check('… toutes les paires respectent les deux fenêtres et l’interdit du dernier adversaire',
    r.paires.length > 20 && r.paires.every((x) => {
      const a = parId[x.a], b = parId[x.b];
      const ecart = Math.abs(a.elo - b.elo);
      return ecart === x.ecart && ecart <= fenetreDeRecherche(100 - a.depuis) && ecart <= fenetreDeRecherche(100 - b.depuis)
        && a.dernierAdversaire !== b.id && b.dernierAdversaire !== a.id;
    }));
  check('… les écarts vont croissant', r.paires.every((x, i) => i === 0 || x.ecart >= r.paires[i - 1].ecart));
  const restants = [...r.ordinateur.map((x) => x.id), ...r.enAttente].map((id) => parId[id]);
  const oubli = restants.some((a) => restants.some((b) => a !== b && Math.abs(a.elo - b.elo) <= fenetreDeRecherche(100 - a.depuis)
    && Math.abs(a.elo - b.elo) <= fenetreDeRecherche(100 - b.depuis) && a.dernierAdversaire !== b.id && b.dernierAdversaire !== a.id));
  check('… il ne reste aucune paire possible parmi ceux qui attendent', !oubli);
  check('… la file n’est pas modifiée, et le résultat ne dépend que d’elle', JSON.stringify(foule) === fige && egal(apparier(foule, 100), r));
  check('une file vide ou illisible ne forme rien',
    egal(apparier([], 0), { paires: [], ordinateur: [], enAttente: [] }) && egal(apparier(null, 0), { paires: [], ordinateur: [], enAttente: [] })
    && egal(apparier([null, 3, {}, { id: 'a' }, { id: 'b', elo: NaN }, j('c', 500), j('c', 500), j('d', 510)], 100).paires.map((x) => x.ecart), [10]));
}

// ---------------------------------------------------------------------------
// 19. Débloquer par achat
// ---------------------------------------------------------------------------
console.log('\n--- Achat ---');
{
  const neuf = geler(profilNeuf());
  check('sans preuve valide, rien n’est accordé',
    [undefined, null, {}, { valide: false }, { valide: 'true' }, { valide: 1 }, true, 'valide', []].every((preuve) => debloquerParAchat(neuf, 'hydra', preuve).erreur === 'preuve'));
  check('… ni avec la preuve d’une autre troupe', debloquerParAchat(neuf, 'hydra', { valide: true, type: 'triton' }).erreur === 'preuve'
    && !debloquerParAchat(neuf, 'hydra', { valide: true, type: 'hydra' }).erreur);
  const a = debloquerParAchat(neuf, 'hydra', { valide: true });
  check('avec `valide: true`, la troupe est débloquée, d’origine « achat »',
    a.profil.debloquees.hydra === 'achat' && egal(a.evenements, [{ type: 'troupeDebloquee', troupe: 'hydra', origine: 'achat' }])
    && !('hydra' in neuf.debloquees) && a.profil.journal[0].op === 'achat');
  check('une troupe déjà débloquée ne s’achète pas', debloquerParAchat(a.profil, 'hydra', { valide: true }).erreur === 'dejaDebloquee'
    && debloquerParAchat(profilA(800), 'hydra', { valide: true }).erreur === 'dejaDebloquee');
  check('une troupe de base n’est pas en vente, une troupe à venir pas encore, une inconnue jamais',
    debloquerParAchat(neuf, 'archer', { valide: true }).erreur === 'pasEnVente' && debloquerParAchat(neuf, 'sapeur', { valide: true }).erreur === 'aVenir'
    && debloquerParAchat(neuf, 'dragon', { valide: true }).erreur === 'inconnue' && debloquerParAchat(neuf, 'constructor', { valide: true }).erreur === 'inconnue');

  // Achetée ou gagnée : la même troupe.
  const achetee = migrerProfil(a.profil);
  const gagnee = profilNeuf();
  gagnee.debloquees.hydra = 'ligue';
  for (const p of [achetee, gagnee]) p.troupes.hydra = { niveau: 3, fragments: 20 };
  const modes = [{ mode: 'classe' }, { mode: 'classe', ligue: 5 }, { mode: 'classe', ligue: 9 }, { mode: 'ordinateur' }, { mode: 'amical', egaux: true }, { mode: 'amical', egaux: false }];
  check('achetée ou gagnée, c’est la même troupe : même niveau joué dans chaque mode, mêmes plafonds',
    modes.every((m) => niveauEffectif(achetee, 'hydra', m) === niveauEffectif(gagnee, 'hydra', m))
    && egal(modes.map((m) => niveauEffectif(achetee, 'hydra', m)), [1, 3, 3, 3, 1, 3]));
  check('… mêmes statistiques au même niveau',
    egal(definitionAuNiveau(UNIT_TYPES.hydra, 'hydra', niveauEffectif(achetee, 'hydra')), definitionAuNiveau(UNIT_TYPES.hydra, 'hydra', niveauEffectif(gagnee, 'hydra'))));
  const tirage = (p) => ouvrirCoffre(avecCoffre(p, 'legendaire'), 0, aleaDeGraine(8));
  check('… mêmes fragments dans les coffres, même prix pour l’améliorer',
    egal(tirage(achetee).tirages, tirage(gagnee).tirages) && tirage(achetee).profil.troupes.hydra.fragments > 20
    && egal(ameliorer(achetee, 'hydra').profil.troupes.hydra, ameliorer(gagnee, 'hydra').profil.troupes.hydra)
    && egal(ameliorer(achetee, 'hydra').profil.troupes.hydra, { niveau: 4, fragments: 0 }));
  const plusTard = jouer({ ...a.profil, elo: 720, ligue: 4, plusHauteLigue: 4 }, 'V');
  check('… atteindre ensuite sa ligue ne la débloque pas une seconde fois',
    plusTard.profil.ligue === 5 && plusTard.profil.debloquees.hydra === 'achat' && !parType(plusTard.evenements, 'troupeDebloquee').some((x) => x.troupe === 'hydra'));
  const cumul = Object.keys(R.troupes).filter((t) => R.troupes[t].prixCentimes).map((t) => R.troupes[t].prixCentimes);
  check('les prix : 0,99 €, 1,99 €, 1,99 €, puis 2,99 € — en centimes entiers', egal(cumul, [99, 199, 199, 299, 299, 299, 299]));
}

// ---------------------------------------------------------------------------
// 20. Le journal
// ---------------------------------------------------------------------------
console.log('\n--- Le journal ---');
{
  const alea = aleaDeGraine(3);
  let p = profilNeuf();
  for (let n = 0; n < 40; n++) {
    p = appliquerResultat(p, partie(n % 2 ? 'victoire' : 'defaite', { jour: jourDe(n) })).profil;
    while (p.coffres.length) p = ouvrirCoffre(p, 0, alea).profil;
  }
  check('le journal est borné : il ne garde que les dernières opérations',
    p.journal.length === R.profil.journal && p.operations > 60 && p.journal[p.journal.length - 1].numero === p.operations,
    `${p.operations} opérations, ${p.journal.length} gardées`);
  check('… numérotées à la suite', p.journal.every((x, i) => i === 0 || x.numero === p.journal[i - 1].numero + 1));
  check('… parties et coffres ouverts', p.journal.some((x) => x.op === 'partie' && x.variation === 30) && p.journal.some((x) => x.op === 'coffre' && x.coffre === 'bois'));
}

// ---------------------------------------------------------------------------
// 21. Une petite simulation : 400 parties
// ---------------------------------------------------------------------------
// Le tableau de la section 6 du document (« Ce que donne la simulation ») :
// 65 % de victoires sur les 30 premières parties, puis 50 % ; deux parties par
// jour (60 parties le premier mois) ; le joueur ouvre ses coffres et améliore
// dès qu'il le peut ; pas de fin de saison, comme dans le tableau.
console.log('\n--- Simulation : 400 parties ---');
{
  const TABLEAU = {   // parties → ligue, niveau moyen des communes, des rares, des épiques
    60: [4, 3.1, 2.9, 2.8],
    120: [5, 4.0, 3.5, 3.0],
    240: [7, 4.6, 4.0, 3.3],
    400: [9, 5.0, 5.0, 3.6],
  };
  const JOUEURS = 60;
  const alea = aleaDeGraine(600);
  const releves = {};
  for (const jalon of Object.keys(TABLEAU)) releves[jalon] = { ligue: 0, commune: 0, rare: 0, epique: 0 };
  const niveauMoyen = (p, types) => {
    const debloquees = types.filter((t) => p.debloquees[t]);
    return somme(debloquees.map((t) => p.troupes[t].niveau)) / debloquees.length;
  };
  let valides = 0, plafonnes = 0, ouvriersSousPlafond = 0;
  const finaux = [];
  for (let joueur = 0; joueur < JOUEURS; joueur++) {
    let p = profilNeuf();
    for (let n = 1; n <= 400; n++) {
      const issue = alea() < (n <= 30 ? 0.65 : 0.5) ? 'victoire' : 'defaite';
      const r = appliquerResultat(p, partie(issue, { jour: jourDe(Math.floor((n - 1) / 2)) }));
      p = r.profil;
      plafonnes += parType(r.evenements, 'coffreDeBoisPlafonne').length;
      while (p.coffres.length) {
        const o = ouvrirCoffre(p, 0, alea);
        p = o.profil;
        for (const possible of parType(o.evenements, 'ameliorationPossible')) {
          for (let a = ameliorer(p, possible.troupe); !a.erreur; a = ameliorer(p, possible.troupe)) p = a.profil;
        }
      }
      if (p.troupes.villager.niveau < plafondDe(p.ligue)) ouvriersSousPlafond++;
      if (releves[n]) {
        releves[n].ligue += p.ligue / JOUEURS;
        releves[n].commune += niveauMoyen(p, COMMUNES) / JOUEURS;
        releves[n].rare += niveauMoyen(p, RARES) / JOUEURS;
        releves[n].epique += niveauMoyen(p, EPIQUES) / JOUEURS;
      }
    }
    if (egal(migrerProfil(p), p) && p.parties === 400 && p.victoires + p.defaites === 400) valides++;
    finaux.push(p);
  }
  for (const jalon of Object.keys(TABLEAU)) {
    const [ligue, commune, rare] = TABLEAU[jalon];
    const m = releves[jalon];
    check(`${jalon} parties : ligue ${ligue}, communes au niveau ${commune}, rares au niveau ${rare}`,
      proche(m.ligue, ligue, 0.8) && proche(m.commune, commune, 0.35) && proche(m.rare, rare, 0.35),
      `ligue ${m.ligue.toFixed(2)}, communes ${m.commune.toFixed(2)}, rares ${m.rare.toFixed(2)}`);
  }
  // Le tableau compte sept épiques, dont les trois nouvelles ; le jeu n'en a
  // encore que quatre, qui se partagent les mêmes fragments : elles montent un
  // peu plus vite, d'où la marge plus large.
  check('… les épiques dans l’ordre de grandeur du tableau : 2,8 – 3,0 – 3,3 – 3,6 (à un niveau près, pour quatre troupes au lieu de sept)',
    Object.keys(TABLEAU).every((jalon) => proche(releves[jalon].epique, TABLEAU[jalon][3], 1)),
    Object.keys(TABLEAU).map((jalon) => releves[jalon].epique.toFixed(2)).join(' – '));
  check('… la progression ne recule jamais d’un jalon au suivant',
    ['ligue', 'commune', 'rare', 'epique'].every((c) => releves[60][c] <= releves[120][c] && releves[120][c] <= releves[240][c] && releves[240][c] <= releves[400][c]));
  check('… à deux parties par jour, le plafond des coffres de bois ne joue jamais', plafonnes === 0);
  check('… l’ouvrier n’est jamais sous le plafond de sa ligue', ouvriersSousPlafond === 0);
  check('… les troupes de base finissent au niveau maximum ; ce qui déborde ensuite devient des éclats',
    finaux.every((p) => [...COMMUNES, ...RARES].every((t) => p.troupes[t].niveau === 5) && p.eclats > 0 && NOUVELLES.every((t) => !(t in p.debloquees))),
    `éclats en fin de parcours : ${Math.round(somme(finaux.map((p) => p.eclats)) / JOUEURS)} en moyenne`);
  check(`… les ${JOUEURS} profils sont encore valides au bout de 400 parties`, valides === JOUEURS);
}

// ---------------------------------------------------------------------------
// 22. Le barème sur la durée
// ---------------------------------------------------------------------------
console.log('\n--- Le barème sur la durée ---');
{
  /** Variation moyenne d'Elo par partie, loin du plancher, pour un taux de victoires donné. */
  function pente(taux, joueurs, parties, graine) {
    const alea = aleaDeGraine(graine);
    let total = 0;
    for (let j = 0; j < joueurs; j++) {
      let p = { ...profilNeuf(), elo: 6000, ligue: 10, plusHauteLigue: 10 };
      for (let n = 0; n < parties; n++) {
        p = appliquerResultat(p, { issue: alea() < taux ? 'victoire' : 'defaite', duree: 600, contreOrdinateur: false, jour: '' }).profil;
        p.coffres = [];   // jamais ouverts ici : inutile de les porter
      }
      total += p.elo - 6000;
    }
    return total / (joueurs * parties);
  }
  const tiers = pente(1 / 3, 400, 200, 2026);
  check('à une victoire sur trois, l’Elo moyen ne monte ni ne descend', Math.abs(tiers) < 0.3, `${tiers >= 0 ? '+' : ''}${tiers.toFixed(3)} point par partie`);
  const moitie = pente(1 / 2, 200, 200, 2027);
  check('à une victoire sur deux, il monte de 7,5 points par partie', proche(moitie, 7.5, 0.4), `+${moitie.toFixed(3)}`);
}

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
