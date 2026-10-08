// Les fiches écrites des troupes (js/fiches-troupes.js), les images des coffres
// (assets/coffres) et ce que les écrans en montrent — avec la règle des chiffres
// ronds : aucun écran de la progression ne montre un chiffre à virgule.
// Lancement : node test/fiches-coffres.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNIT_TYPES, BUILDING_TYPES, GAME_SPEEDS, TECHS, CIVILISATIONS, nomDe } from '../js/config.js';
import { PROGRESSION as R } from '../js/progression-config.js';
import { profilNeuf, regulariser, appliquerResultat, ouvrirCoffre, aleaDeGraine } from '../js/progression.js';
import { FICHES, RUBRIQUES, ficheDeTroupe, nommer } from '../js/fiches-troupes.js';
import { ouvrirProgression, htmlBandeau, htmlFinDePartie, reglerPeuple, installerProgression, imageDeCoffre, ETATS_DE_COFFRE } from '../js/progression-ecrans.js';
import { PROGRESSION_KEY } from '../js/save.js';
import { resumeReglages } from '../js/ui.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${detail ? ' — ' + detail : ''}`);
}
const TROUPES = Object.keys(R.troupes);
const CIVS = Object.keys(CIVILISATIONS);

// --- Les fiches ------------------------------------------------------------------
console.log('--- Les fiches des troupes ---');
check('chaque troupe du jeu a sa fiche, et aucune fiche n’est de trop', TROUPES.every((t) => FICHES[t]) && Object.keys(FICHES).every((t) => TROUPES.includes(t)) && TROUPES.length === 17);
check('quatre rubriques : rôle, ce qu’elle bat, ce qu’elle craint, un conseil', egal(RUBRIQUES.map((r) => r[0]), ['role', 'bat', 'craint', 'conseil'])
  && TROUPES.every((t) => egal(Object.keys(FICHES[t]), ['role', 'bat', 'craint', 'conseil'])));
const tous = TROUPES.flatMap((t) => Object.values(FICHES[t]).map((texte) => [t, texte]));
check('des textes courts : de 20 à 130 caractères, qui finissent par un point',
  tous.every(([, x]) => x.length >= 20 && x.length <= 130 && /[.!]$/.test(x)), tous.filter(([, x]) => x.length > 130 || x.length < 20 || !/[.!]$/.test(x)).map(([t, x]) => `${t} (${x.length})`).join(', '));
check('aucun chiffre à virgule, aucun signe pour cent à virgule', tous.every(([, x]) => !/\d[,.]\d/.test(x)));
const jetons = [...new Set(tous.flatMap(([, x]) => [...x.matchAll(/\{([A-Za-z]+)(?::p)?\}/g)].map((m) => m[1])))];
check('les troupes citées existent toutes', jetons.length > 8 && jetons.every((j) => UNIT_TYPES[j] && TROUPES.includes(j)), jetons.filter((j) => !UNIT_TYPES[j]).join(', '));
const malAmenes = tous.filter(([, x]) => ![...x.matchAll(/(\S+) \{[A-Za-z]+(:p)?\}/g)].every((m) => m[2] === ':p' && (/(les|des|aux|tes)$/i.test(m[1]) || /[,:]$/.test(m[1]))));
check('… toujours au pluriel, derrière « les », « des », « aux » ou « tes » : jamais un article à accorder', malAmenes.length === 0, malAmenes.map(([t]) => t).join(', '));
for (const civ of CIVS) {
  const lus = TROUPES.map((t) => ficheDeTroupe(t, civ));
  check(`${CIVILISATIONS[civ].name} : chaque fiche se lit sans jeton restant, rubriques en ordre`,
    lus.every((f) => f.length === 4 && egal(f.map((r) => r.titre), ['Rôle', 'Bat', 'Craint', 'Conseil']) && f.every((r) => !/[{}]/.test(r.texte) && !/undefined|null/.test(r.texte))));
}
check('un Solarien lit les noms de son peuple : « Méharistes » là où un Atlante lit « Cavaliers »',
  ficheDeTroupe('ram', 'atlante')[2].texte.includes('les Cavaliers') && ficheDeTroupe('ram', 'solarien')[2].texte.includes('les Méharistes')
  && ficheDeTroupe('hydra', 'solarien')[3].texte.includes('Prêtres du Soleil') && nommer('{champion:p}', 'solarien') === nomDe('champion', 'solarien', 2));
check('une troupe inconnue n’a pas de fiche', ficheDeTroupe('licorne', 'atlante') === null && ficheDeTroupe('constructor', 'atlante') === null);
// Les chiffres cités sont ceux des règles.
const bonusDe = (t) => [...Object.values(UNIT_TYPES[t].bonus || {}), ...Object.values(UNIT_TYPES[t].bonusType || {})];
const tousLesBonus = new Set(TROUPES.flatMap(bonusDe));
const cites = (t, cle) => [...FICHES[t][cle].matchAll(/\+(\d+)/g)].map((m) => Number(m[1]));
check('un « +N » dans « Rôle » ou « Bat » est un bonus de la troupe elle-même',
  TROUPES.every((t) => [...cites(t, 'role'), ...cites(t, 'bat')].every((n) => bonusDe(t).includes(n))),
  TROUPES.filter((t) => ![...cites(t, 'role'), ...cites(t, 'bat')].every((n) => bonusDe(t).includes(n))).join(', '));
check('… dans « Craint », c’est le bonus d’une autre troupe du jeu', TROUPES.every((t) => cites(t, 'craint').every((n) => tousLesBonus.has(n))));
check('les portées citées sont les vraies : 5 cases pour l’archer, 6 pour l’arbalétrier, 7 pour la catapulte, 4 pour le soin',
  FICHES.archer.role.includes(`${UNIT_TYPES.archer.range} cases`) && FICHES.crossbowman.role.includes(`${UNIT_TYPES.crossbowman.range} cases`)
  && FICHES.catapult.role.includes(`${UNIT_TYPES.catapult.range} cases`) && FICHES.priest.role.includes(`${UNIT_TYPES.priest.range} cases`)
  && FICHES.priest.role.includes(`${UNIT_TYPES.priest.heal} points de vie`) && UNIT_TYPES.horseArcher.range === UNIT_TYPES.archer.range);
check('l’Hydre : 3 morsures et 3 places, comme dans les règles', UNIT_TYPES.hydra.morsures === 3 && UNIT_TYPES.hydra.pop === 3
  && FICHES.hydra.role.includes('3 ennemis') && FICHES.hydra.conseil.includes('3 places'));

// --- Les images des coffres ---------------------------------------------------------
console.log('\n--- Les images des coffres ---');
const cache = new Set([...fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8').matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]));
const images = Object.keys(R.coffres).flatMap((type) => ETATS_DE_COFFRE.map((etat) => imageDeCoffre(type, etat)));
check('quatre rangs, trois états chacun : douze images', images.length === 12 && egal(ETATS_DE_COFFRE, ['ferme', 'entrouvert', 'ouvert']));
check('chacune existe, en WebP, sous 45 Ko', images.every((f) => { const c = path.join(RACINE, f); if (!fs.existsSync(c)) return false; const o = fs.readFileSync(c); return o.subarray(8, 12).toString('latin1') === 'WEBP' && o.length < 45_000; }),
  images.filter((f) => !fs.existsSync(path.join(RACINE, f))).join(', '));
check('… et figure dans la liste hors ligne, qui n’en cite pas d’autre', images.every((f) => cache.has(f)) && [...cache].filter((c) => c.startsWith('assets/coffres/')).length === 12);
check('aucun fichier ne traîne dans le dossier', fs.readdirSync(path.join(RACINE, 'assets/coffres')).filter((f) => !f.startsWith('.')).every((f) => images.includes(`assets/coffres/${f}`)));

// --- Les écrans ---------------------------------------------------------------------
console.log('\n--- Les écrans ---');
function egal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
const memoire = new Map();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); } }, configurable: true, writable: true });
const noeud = { innerHTML: '', classList: { add() {}, remove() {} }, querySelector: () => null };
let clic = null;
Object.defineProperty(globalThis, 'document', { value: { getElementById: (id) => (id === 'progression' ? noeud : null), addEventListener: (t, f) => { if (t === 'click') clic = f; } }, configurable: true, writable: true });
const ecran = (nom, arg) => { noeud.innerHTML = ''; ouvrirProgression(nom, arg); return noeud.innerHTML; };
const toucher = (dataset) => clic({ target: { closest: () => ({ dataset }) } });
installerProgression({});
// (Ce que le joueur lit : le texte, sans les balises ni leurs attributs — une largeur d'image n'est pas un chiffre lu.)
const texte = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const aVirgule = (html) => (texte(html).match(/\d+[,.]\d+/g) || []).filter((x) => !/^\d{1,3}( | | )?\d{3}$/.test(x));
let profil = regulariser({ ...profilNeuf(), elo: 1180 }).profil;
profil.coffres = [{ type: 'bois', origine: 'defaite' }, { type: 'or', origine: 'victoire' }, { type: 'legendaire', origine: 'promotion' }];
for (const t of TROUPES) { profil.troupes[t].niveau = 1 + (TROUPES.indexOf(t) % 4); profil.troupes[t].fragments = 3; }
memoire.set(PROGRESSION_KEY, JSON.stringify(profil));

for (const civ of CIVS) {
  reglerPeuple(civ);
  for (const t of TROUPES) {
    const fiche = ecran('fiche', t);
    const attendu = ficheDeTroupe(t, civ);
    if (!(fiche.includes('class="prog-fiche-texte"') && attendu.every((r) => fiche.includes(`<dt>${r.titre}</dt><dd>${r.texte}</dd>`)) && aVirgule(fiche).length === 0)) {
      check(`fiche ${t} (${civ}) : ses quatre rubriques, sans chiffre à virgule`, false, aVirgule(fiche).join(' '));
    }
  }
  check(`${CIVILISATIONS[civ].name} : les dix-sept fiches montrent leurs quatre rubriques, et pas un chiffre à virgule`, true);
}
reglerPeuple('atlante');
const coffres = ecran('coffres');
check('écran des coffres : chaque coffre en attente a son image fermée, son rang et d’où il vient',
  ['bois', 'or', 'legendaire'].every((t) => coffres.includes(`src="${imageDeCoffre(t, 'ferme')}"`)) && coffres.includes('<small>Défaite</small>') && coffres.includes('<small>Victoire</small>') && coffres.includes('<small>Promotion</small>'));
check('… la règle est dite : un coffre par partie, et les chances de chaque rang selon l’issue',
  /Chaque partie classée donne un coffre, gagnée ou perdue/.test(coffres)
  && /<td>Victoire<\/td><td>20 %<\/td><td>35 %<\/td><td>35 %<\/td><td>10 %<\/td>/.test(coffres)
  && /<td>Égalité<\/td><td>45 %<\/td><td>30 %<\/td><td>20 %<\/td><td>5 %<\/td>/.test(coffres)
  && /<td>Défaite<\/td><td>65 %<\/td><td>25 %<\/td><td>10 %<\/td><td>0 %<\/td>/.test(coffres));
check('… sans point de bataille ni plafond par jour, et sans chiffre à virgule', !/bataille|aujourd/.test(coffres) && aVirgule(coffres).length === 0, aVirgule(coffres).join(' '));
for (const type of Object.keys(R.coffres)) {
  const probas = ecran('probas', type);
  if (!(probas.includes(`src="${imageDeCoffre(type, 'ferme')}"`) && probas.includes(`src="${imageDeCoffre(type, 'ouvert')}"`) && /Sur 100 coffres, en moyenne/.test(probas) && aVirgule(probas).length === 0)) {
    check(`chances du coffre ${type} : ses images, « sur 100 coffres », pas de chiffre à virgule`, false, aVirgule(probas).join(' '));
  }
}
check('chances de chaque coffre : ses images, des pour-cent ronds, « sur 100 coffres » en nombres entiers', /680 fragments communs,\s+28 rares, 2 épiques/.test(texte(ecran('probas', 'bois'))), texte(ecran('probas', 'bois')).slice(0, 160));
ecran('coffres');
const hasard = Math.random; Math.random = aleaDeGraine(11);
toucher({ act: 'ouvrir', i: '1' });
Math.random = hasard;
const ouverture = noeud.innerHTML;
check('ouvrir un coffre d’or : ses trois images dans l’ordre — fermé, entrouvert, ouvert',
  /class="prog-ouverture" data-type="or">\s*<img class="prog-coffre-img e1" src="assets\/coffres\/coffre-or-ferme\.webp"[^>]*><img class="prog-coffre-img e2" src="assets\/coffres\/coffre-or-entrouvert\.webp"[^>]*><img class="prog-coffre-img e3" src="assets\/coffres\/coffre-or-ouvert\.webp"/.test(ouverture));
const delais = [...ouverture.matchAll(/class="prog-tirage" style="animation-delay:(\d+)ms"/g)].map((m) => Number(m[1]));
check('… ses cinq tirages paraissent après l’ouverture, l’un après l’autre', delais.length === 5 && delais[0] >= 1000 && delais.every((d, i) => i === 0 || d > delais[i - 1]) && aVirgule(ouverture).length === 0);
check('… le coffre ouvert a quitté la réserve', JSON.parse(memoire.get(PROGRESSION_KEY)).coffres.length === 2);
const feuille = fs.readFileSync(path.join(RACINE, 'css/progression.css'), 'utf8');
check('la feuille de style enchaîne les trois images sans fondu : chacune paraît d’un coup',
  /@keyframes coffre-entrouvert \{ 0%, 45% \{ opacity: 0; \} 45\.01%, 72% \{ opacity: 1; \} 72\.01%, 100% \{ opacity: 0; \} \}/.test(feuille) && /prefers-reduced-motion: reduce\) \{ \.prog-ouverture img/.test(feuille));
// La fin d'une partie classée.
const gagnee = appliquerResultat(profilNeuf(), { issue: 'victoire', duree: 600, contreOrdinateur: 'echelle', jour: '2026-10-08', alea: () => 0.95 });
const fin = htmlFinDePartie(gagnee.evenements, gagnee.profil);
check('fin de partie : le coffre gagné avec son image, son rang et « Victoire »',
  fin.includes(`src="${imageDeCoffre('legendaire', 'ferme')}"`) && fin.includes('Coffre légendaire') && fin.includes('<small>Victoire</small>') && !/bataille/.test(fin) && aVirgule(fin).length === 0);
const perdue = appliquerResultat(profilNeuf(), { issue: 'defaite', duree: 600, contreOrdinateur: 'echelle', jour: '2026-10-08', alea: () => 0.95 });
check('… une défaite montre aussi le sien', htmlFinDePartie(perdue.evenements, perdue.profil).includes(`src="${imageDeCoffre('or', 'ferme')}"`) && htmlFinDePartie(perdue.evenements, perdue.profil).includes('<small>Défaite</small>'));
const eclair = appliquerResultat(profilNeuf(), { issue: 'abandon', duree: 20, contreOrdinateur: 'echelle', jour: '2026-10-08' });
check('… un abandon de vingt secondes n’en montre aucun', !/prog-fin-coffre/.test(htmlFinDePartie(eclair.evenements, eclair.profil)));
check('les autres écrans ne montrent pas de chiffre à virgule non plus : ligues, collection, bandeau',
  [ecran('ligues'), ecran('troupes'), htmlBandeau(profil)].every((h) => aVirgule(h).length === 0));

// --- Les autres chiffres que le joueur lit ---------------------------------------------
console.log('\n--- Les chiffres ronds, ailleurs dans le jeu ---');
check('vitesses de jeu : 75 %, 100 %, 150 %, 200 %', egal(GAME_SPEEDS.map((v) => v.short), ['75 %', '100 %', '150 %', '200 %']) && GAME_SPEEDS.every((v) => Math.round(v.mult * 100) === parseInt(v.short, 10)));
check('… et le résumé des réglages les dit ainsi', resumeReglages({ civAdverse: 'atlante', mode: 'classique', difficulty: 'normal', mapSize: 'medium', speed: 'rapide' }).replace(/ /g, ' ').endsWith('vitesse 150 %'));
const descriptions = [...Object.values(UNIT_TYPES), ...Object.values(BUILDING_TYPES), ...Object.values(TECHS)].map((d) => d.desc || '');
check('aucune description de troupe, de bâtiment ou de technologie ne porte de chiffre à virgule', descriptions.length > 30 && descriptions.every((d) => !/\d,\d/.test(d)), descriptions.filter((d) => /\d,\d/.test(d)).join(' | '));
const lus = [];
for (const d of [...Object.values(UNIT_TYPES), ...Object.values(BUILDING_TYPES)]) {
  lus.push(d.hp, d.attack || 0, d.meleeArmor || 0, d.pierceArmor || 0, d.heal || 0, ...Object.values(d.cost || {}));
  if (d.range > 1.5) lus.push(d.range);
}
check('ce que le panneau de sélection montre — vie, attaque, armures, soin, portée des tireurs, coûts — est entier pour toute troupe et tout bâtiment',
  lus.every(Number.isInteger), [...new Set(lus.filter((v) => !Number.isInteger(v)))].join(' '));

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
