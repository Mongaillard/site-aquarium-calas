// Les fiches des troupes et les pictogrammes dans une autre langue
// (js/fiches-troupes.js, js/icones.js ; cahier js/langues/en/fiches.js) : le
// français ne bouge pas d'une lettre, le cahier couvre toutes les phrases, et
// chaque fiche se lit en anglais pour les deux peuples — mêmes chiffres, les
// noms que chaque peuple donne à ses troupes.
// Lancement : node test/langues-fiches.test.js

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LANGUE, SANS_TRADUCTION } from '../js/langue.js';
import { UNIT_TYPES, CIVILISATIONS } from '../js/config.js';
import { PROGRESSION as R } from '../js/progression-config.js';
import { FICHES, FICHES_CIV, RUBRIQUES, ficheDeTroupe, textesATraduire } from '../js/fiches-troupes.js';
import { ICONES, ICONES_LICENCE, iconeSVG } from '../js/icones.js';
import { clesDuCode, verifierCahier } from '../outils/langues.mjs';
import cahier from '../js/langues/en/fiches.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${detail ? ' — ' + detail : ''}`);
}
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
/** Lance un Node neuf (la langue se lit au chargement des modules) et rend ce que le script affiche, lu comme du JSON. */
const ailleurs = (script) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 24 }));
/** Le début d'un script anglais. (Tant que js/langues/en.js n'inscrit pas le cahier « fiches », on l'y verse : c'est le même objet que js/langue.js lit.) */
const EN_ANGLAIS = `
  globalThis.__LANGUE = 'en';
  const D = await import('./js/langues/en.js');
  if (!D.CAHIERS.fiches) Object.assign(D.default, (await import('./js/langues/en/fiches.js')).default);
  const L = await import('./js/langue.js');
  const C = await import('./js/config.js');
  const F = await import('./js/fiches-troupes.js');`;

const TROUPES = Object.keys(R.troupes);
const CIVS = Object.keys(CIVILISATIONS);
const CLES = RUBRIQUES.map((r) => r[0]);
/** Les chiffres d'un texte (« +10 », « 5 »), triés : une traduction peut les déplacer, pas les changer. */
const chiffres = (t) => (String(t).match(/\+?\d+/g) || []).sort();
/** Les troupes citées par jeton dans un texte, triées, sans doublon. */
const citees = (t) => [...new Set([...String(t).matchAll(/\{([A-Za-z]+)(?::p)?\}/g)].map((m) => m[1]))].sort();

// --- Le français, la source -------------------------------------------------------------
console.log('--- Le français ---');
{
  const source = lire('js/fiches-troupes.js');
  const fiches = [...Object.values(FICHES), ...Object.values(FICHES_CIV).flatMap((propres) => Object.values(propres))];
  check('sans rien demander, les fiches sont en français : leurs titres, leurs phrases',
    LANGUE === 'fr' && egal(RUBRIQUES, [['role', 'Rôle'], ['bat', 'Bat'], ['craint', 'Craint'], ['conseil', 'Conseil']])
    && FICHES.militia.bat === 'Les {spearman:p}, et les tireurs dès qu’il arrive au contact.'
    && FICHES_CIV.solarien.hydra.role === 'Un monstre qui encaisse comme une escouade et frappe 3 ennemis à la fois.');
  check('… chaque phrase est celle qui est écrite dans le module, à la lettre près',
    fiches.length === TROUPES.length + 1 && fiches.every((f) => CLES.every((cle) => source.includes(`${cle}: '${f[cle]}',`))));
  check('… et une fiche lue garde ses noms français et son espace insécable devant « : »',
    ficheDeTroupe('ram', 'solarien')[2].texte === 'Les Lanciers (+6), les Méharistes (+5) et les Sapeurs (+8)\u00a0: au contact, il est sans défense.'
    && egal(ficheDeTroupe('ram', 'atlante').map((r) => r.titre), ['Rôle', 'Bat', 'Craint', 'Conseil']));
  const visites = [];
  textesATraduire((objet, champ) => visites.push(objet[champ]));
  check('`textesATraduire` passe sur les quatre titres et sur chaque phrase des fiches, celles des peuples comprises',
    visites.length === 4 + 4 * fiches.length && visites.every((t) => typeof t === 'string' && t.length > 2)
    && egal(visites.slice(0, 4), ['Rôle', 'Bat', 'Craint', 'Conseil']) && visites.includes(FICHES.sapeur.conseil) && visites.includes(FICHES_CIV.solarien.hydra.conseil),
    `${visites.length} textes, ${new Set(visites).size} différents`);
  check('… et rien n’est noté « sans traduction »', SANS_TRADUCTION.size === 0);
}

// --- Le cahier ------------------------------------------------------------------------------
console.log('\n--- Le cahier anglais ---');
{
  const r = await verifierCahier('en', 'fiches', ['js/fiches-troupes.js', 'js/icones.js'], ['js/fiches-troupes.js:textesATraduire']);
  check('le cahier « fiches » couvre les deux fichiers : rien ne manque, rien en trop, rien de fautif',
    r.manquantes.length === 0 && r.enTrop.length === 0 && r.fautives.length === 0 && r.cles === Object.keys(cahier).length && r.cles >= 75,
    `${r.cles} textes${[...r.manquantes, ...r.enTrop].length ? ' ; ' + [...r.manquantes, ...r.enTrop].slice(0, 3).join(' | ') : ''}`);
  const phrases = Object.entries(cahier);
  const pires = (defaut) => phrases.filter(([fr, en]) => defaut(fr, en)).map(([fr]) => fr.slice(0, 40));
  const chiffresChanges = pires((fr, en) => !egal(chiffres(fr), chiffres(en)));
  check('une traduction garde les chiffres de sa phrase : bonus, portées, places', chiffresChanges.length === 0, chiffresChanges.join(' | '));
  const troupesChangees = pires((fr, en) => !egal(citees(fr), citees(en)));
  check('… et cite les mêmes troupes, par les mêmes jetons', troupesChangees.length === 0, troupesChangees.join(' | '));
  const jetonsFaux = pires((fr, en) => en.replace(/\{[A-Za-z]+(:p)?\}/g, '').match(/[{}]/) || citees(en).some((t) => !UNIT_TYPES[t] || !TROUPES.includes(t)));
  check('… des jetons bien formés, de troupes qui existent', jetonsFaux.length === 0, jetonsFaux.join(' | '));
  const malPonctuees = pires((fr, en) => /\s[.,:;?!%]|\u00a0|[«»]|'| {2}|[À-ÿŒœ]/.test(en) || en !== en.trim() || (fr.length > 10 && !/[.!]$/.test(en)));
  check('la ponctuation est anglaise : pas d’espace devant un signe, pas de guillemets français, l’apostrophe « ’ », un point final',
    malPonctuees.length === 0, malPonctuees.join(' | '));
  check('pas de phrase rendue en français par oubli : aucune traduction n’est égale à sa clé', phrases.every(([fr, en]) => fr !== en));
}

// --- En anglais -----------------------------------------------------------------------------
console.log('\n--- L’anglais ---');
{
  const m = ailleurs(`${EN_ANGLAIS}
    const I = await import('./js/icones.js');
    const troupes = ${JSON.stringify(TROUPES)}, civs = ${JSON.stringify(CIVS)};
    const fiches = {}, noms = {};
    for (const civ of civs) {
      fiches[civ] = Object.fromEntries(troupes.map((t) => [t, F.ficheDeTroupe(t, civ)]));
      noms[civ] = Object.fromEntries(troupes.map((t) => [t, [C.nomDe(t, civ, 1), C.nomDe(t, civ, 2), F.nommer('{' + t + '}', civ), F.nommer('{' + t + ':p}', civ)]]));
    }
    console.log(JSON.stringify({
      langue: L.LANGUE, rubriques: F.RUBRIQUES, fiches, noms, inconnue: F.ficheDeTroupe('licorne', 'atlante'),
      sans: [...L.SANS_TRADUCTION], licence: I.ICONES_LICENCE, svg: I.iconeSVG('militia', 22), noms3: [I.ICONES.triton.n, I.ICONES.militia.n],
    }));`);
  const lues = CIVS.flatMap((civ) => TROUPES.flatMap((t) => m.fiches[civ][t].map((r, i) => ({ civ, t, r, fr: ficheDeTroupe(t, civ)[i] }))));
  const ou = (liste) => [...new Set(liste.map((x) => `${x.t}.${x.r.cle} (${x.civ})`))].slice(0, 4).join(', ');
  check('marqué « en », les rubriques s’appellent Role, Beats, Fears, Tip — leurs clés ne changent pas',
    m.langue === 'en' && egal(m.rubriques, [['role', 'Role'], ['bat', 'Beats'], ['craint', 'Fears'], ['conseil', 'Tip']]) && m.inconnue === null);
  check('chaque troupe a sa fiche pour les deux peuples : quatre rubriques, dans l’ordre',
    lues.length === 4 * TROUPES.length * CIVS.length && CIVS.every((civ) => TROUPES.every((t) => egal(m.fiches[civ][t].map((r) => [r.cle, r.titre]), [['role', 'Role'], ['bat', 'Beats'], ['craint', 'Fears'], ['conseil', 'Tip']]))));
  const restes = lues.filter(({ r, fr }) => /[{}]|undefined|null|\u00a0|\s[.,:;?!]|[À-ÿŒœ]/.test(r.texte) || r.texte === fr.texte);
  check('… aucune ne garde un jeton, un mot français ou une ponctuation française', restes.length === 0, ou(restes));
  const longues = lues.filter(({ r }) => r.texte.length < 20 || r.texte.length > 130 || !/[.!]$/.test(r.texte));
  check('… des textes courts, comme en français : de 20 à 130 caractères, noms compris, un point final', longues.length === 0, ou(longues));
  const fausses = lues.filter(({ r, fr }) => !egal(chiffres(r.texte), chiffres(fr.texte)));
  check('… et les chiffres lus sont ceux de la fiche française', fausses.length === 0, ou(fausses));
  const articles = lues.filter(({ r }) => /\b[Aa] [AEIOU]|\b[Aa]n [^AEIOUaeiou]/.test(r.texte));
  check('… pas d’article qui jure avec le nom d’un peuple (« a Archer »)', articles.length === 0, ou(articles));
  check('un jeton prend le nom que le peuple donne à la troupe (js/config.js), au singulier comme au pluriel',
    CIVS.every((civ) => TROUPES.every((t) => m.noms[civ][t][2] === m.noms[civ][t][0] && m.noms[civ][t][3] === m.noms[civ][t][1])));
  const texte = (t, civ, cle) => m.fiches[civ][t].find((r) => r.cle === cle).texte;
  check('un Solarien lit les noms de son peuple : « Camel Riders » là où un Atlante lit « Knights »',
    texte('ram', 'atlante', 'craint').includes('Knights (+5) and Sappers (+8): up close, it’s defenseless.') && texte('ram', 'solarien', 'craint').includes('Camel Riders (+5) and Sappers (+8)')
    && texte('militia', 'atlante', 'conseil').endsWith('switch to Champions.') && texte('militia', 'solarien', 'conseil').endsWith('switch to Masked Guards.')
    && texte('champion', 'atlante', 'craint').endsWith('and the Hydra.') && texte('champion', 'solarien', 'craint').endsWith('and the Sphinx.'),
    texte('ram', 'solarien', 'craint'));
  check('quatre phrases, telles qu’un joueur les lit : le Cavalier, le Pavoisier, la Prêtresse, le Frondeur',
    texte('knight', 'atlante', 'bat') === 'Ranged units (+4), workers, siege engines (+5) and Shield Bearers.'
    && texte('pavoisier', 'solarien', 'bat') === 'Archers, Slingers and towers.'
    && texte('priest', 'atlante', 'role') === 'Heals your wounded troops from 4 tiles away: 8 hit points per heal.'
    && texte('frondeur', 'solarien', 'conseil') === 'Post him facing the enemy’s ranged units, behind your foot soldiers. He’s cheap: train plenty.');
  check('le Sphinx des Solariens a sa propre fiche : mêmes chiffres que l’Hydre, mais il frappe, elle mord',
    texte('hydra', 'atlante', 'role') === 'A monster that soaks up damage like a whole squad and bites 3 enemies at once.'
    && texte('hydra', 'solarien', 'role') === 'A monster that soaks up damage like a whole squad and strikes 3 enemies at once.'
    && texte('hydra', 'atlante', 'conseil') === 'Send it into the heart of the melee, with a Priestess or two behind: that’s where its bites count. It takes 3 population slots.'
    && texte('hydra', 'solarien', 'conseil') === 'Send it into the heart of the melee, with a Sun Priest or two behind: that’s where its blows count. It takes 3 population slots.'
    && texte('hydra', 'solarien', 'bat') === texte('hydra', 'atlante', 'bat') && CIVS.every((civ) => TROUPES.every((t) => !CLES.some((cle) => t !== 'hydra' && civ === 'solarien' && texte(t, civ, cle).includes('Hydra')))));
  check('rien n’est resté sans traduction dans cette partie', m.sans.length === 0, m.sans.slice(0, 3).join(' | '));

  // Les pictogrammes : rien à traduire. Leurs crédits sont des noms — une source, une licence, des auteurs.
  check('les crédits des pictogrammes sont les mêmes dans toutes les langues : la source, la licence (CC BY 3.0), les noms des auteurs',
    egal(m.licence, ICONES_LICENCE) && m.licence.licence === 'CC BY 3.0' && m.licence.source === 'game-icons.net' && m.licence.auteurs.includes('Lorc') && m.licence.auteurs.includes('Delapouite'));
  check('un pictogramme ne porte aucun texte lu ni entendu : son nom d’origine (`n`) reste une note de provenance',
    m.svg === iconeSVG('militia', 22) && /aria-hidden="true"/.test(m.svg) && !/<title|aria-label|>[^<]/.test(m.svg) && egal(m.noms3, [ICONES.triton.n, ICONES.militia.n])
    && clesDuCode(lire('js/icones.js')).length === 0);

  // (Hors de cette partie : les pluriels anglais viennent de `nomDe`, dans js/config.js.)
  const auPluriel = [...new Set(Object.values(cahier).flatMap((en) => [...en.matchAll(/\{([A-Za-z]+):p\}/g)].map((x) => x[1])))];
  const douteux = [...new Set(CIVS.flatMap((civ) => auPluriel.map((t) => m.noms[civ][t])).filter(([un, plusieurs]) => plusieurs === un || /mans$/.test(plusieurs)).map(([, plusieurs]) => plusieurs))];
  if (douteux.length) console.log(`[ note ] pluriels anglais à corriger dans js/config.js (nomDe), dont ces fiches héritent : ${douteux.join(', ')}`);
}

// --- L'écran de la fiche ---------------------------------------------------------------------
console.log('\n--- L’écran ---');
{
  const m = ailleurs(`${EN_ANGLAIS}
    const memoire = new Map();
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); } }, configurable: true, writable: true });
    const noeud = { innerHTML: '', classList: { add() {}, remove() {} }, querySelector: () => null };
    Object.defineProperty(globalThis, 'document', { value: { getElementById: (id) => (id === 'progression' ? noeud : null), addEventListener() {} }, configurable: true, writable: true });
    const P = await import('./js/progression.js');
    const E = await import('./js/progression-ecrans.js');
    const S = await import('./js/save.js');
    E.installerProgression({});
    memoire.set(S.PROGRESSION_KEY, JSON.stringify(P.regulariser({ ...P.profilNeuf(), elo: 1180 }).profil));
    const ecrans = [];
    for (const [civ, type] of [['atlante', 'knight'], ['solarien', 'knight'], ['solarien', 'hydra']]) {
      E.reglerPeuple(civ);
      noeud.innerHTML = '';
      E.ouvrirProgression('fiche', type);
      ecrans.push({ civ, type, html: noeud.innerHTML, attendu: F.ficheDeTroupe(type, civ) });
    }
    console.log(JSON.stringify(ecrans));`);
  const montre = (e) => e.html.includes('class="prog-fiche-texte"') && e.attendu.every((r) => e.html.includes(`<div data-rubrique="${r.cle}"><dt>${r.titre}</dt><dd>${r.texte}</dd></div>`));
  check('l’écran de la fiche montre les quatre rubriques en anglais, pour un Atlante comme pour un Solarien',
    m.length === 3 && m.every(montre) && m[0].html.includes('<dt>Fears</dt><dd>') && m[1].html.includes('Atlantean Mercenaries (+6).</dd>') && m[2].html.includes('<dt>Role</dt><dd>A monster that soaks up damage like a whole squad and strikes 3 enemies at once.</dd>'),
    m.filter((e) => !montre(e)).map((e) => `${e.type} (${e.civ})`).join(', '));
  check('… sans un mot de la fiche française', m.every((e) => ficheDeTroupe(e.type, e.civ).every((r) => !e.html.includes(r.texte) && !e.html.includes(`<dt>${r.titre}</dt>`))));
}

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
