// Les langues du jeu (js/langue.js) : le français est la source et ne bouge
// pas ; une autre langue cherche chaque phrase dans son dictionnaire ; les
// dictionnaires sont propres (pas de clé en double, pas de trou inventé, pas
// de traduction qui ne sert plus).
// Lancement : node test/langues.test.js

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LANGUES, LANGUE, LOCALE, txt, accord, cleDe, nombreLocal, choisirLangue, CLE_LANGUE, SANS_TRADUCTION } from '../js/langue.js';
import { UNIT_TYPES, GAME_MODES, RESOURCE_LABELS } from '../js/config.js';
import { clesDuCode, clesDeLaPage, recenser, etatDe } from '../outils/langues.mjs';

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

// --- Le français, la source --------------------------------------------------------------
console.log('--- Le français ---');
{
  const n = 3, nom = 'Caserne';
  check('sans rien demander, le jeu est en français', LANGUE === 'fr' && LOCALE === 'fr-FR' && LANGUES[0].id === 'fr' && LANGUES[0].prete === true);
  check('en français, `txt` rend le texte tel qu’il est écrit, à la lettre près',
    txt`Il te manque ${n} Couronnes pour ${nom}.` === `Il te manque ${n} Couronnes pour ${nom}.` && txt('Jouer') === 'Jouer' && txt`` === '' && txt`${n}` === '3'
    && txt`a${undefined}b${null}c${0}` === `a${undefined}b${null}c${0}` && txt`l’${'été'} : ${[1, 2]}` === `l’${'été'} : ${[1, 2]}`);
  check('… et rien n’est noté « sans traduction »', SANS_TRADUCTION.size === 0);
  check('la clé d’un gabarit : la phrase, ses trous numérotés', cleDe`Il te manque ${n} pour ${nom}.` === 'Il te manque {0} pour {1}.' && cleDe`Jouer` === 'Jouer');
  check('l’accord français : un, plusieurs', egal([accord(0, 'Couronne'), accord(1, 'Couronne'), accord(2, 'Couronne'), accord(5, 'cheval', 'chevaux')], ['Couronne', 'Couronne', 'Couronnes', 'chevaux']));
  check('les nombres s’écrivent à la française', nombreLocal(1200).replace(/\s/g, ' ') === '1 200');
  check('les tables du jeu sont en français', UNIT_TYPES.militia.name === 'Milicien' && GAME_MODES.escarmouche.name === 'Escarmouche' && RESOURCE_LABELS.gold === 'Or');
  check('une langue inconnue ne se choisit pas', choisirLangue('xx') === false && choisirLangue(undefined) === false);
}

// --- Une autre langue ------------------------------------------------------------------------
console.log('\n--- L’anglais ---');
{
  const m = ailleurs(`
    globalThis.__LANGUE = 'en';
    const L = await import('./js/langue.js');
    const C = await import('./js/config.js');
    const U = await import('./js/ui.js');
    const n = 3;
    console.log(JSON.stringify({
      langue: L.LANGUE, locale: L.LOCALE,
      simple: L.txt('Jouer'), gabarit: L.txt\`Classée · \${'x'}\`, deplace: L.txt\`carte \${'medium'}\`, deux: L.txt\`\${'A'} contre \${'B'}\`,
      inconnue: L.txt\`Phrase jamais traduite \${n}\`, inconnueSimple: L.txt('Mot jamais traduit'), manquantes: [...L.SANS_TRADUCTION],
      accord: [L.accord(1, 'Mot jamais traduit'), L.accord(2, 'Mot jamais traduit')], nombre: L.nombreLocal(1200),
      tables: [C.UNIT_TYPES.militia.name, C.BUILDING_TYPES.barracks.name, C.GAME_MODES.escarmouche.name, C.DIFFICULTIES.hard.name, C.RESOURCE_LABELS.gold, C.CIVILISATIONS.solarien.noms.knight.name, C.AGES[1].name, C.AGES[1].short, C.UNIT_TYPES.horseArcher.pluriel],
      identifiants: [C.UNIT_TYPES.militia.id, C.GAME_MODES.escarmouche.id, C.GAME_MODES.escarmouche.mapSize],
      resume: U.resumeReglages({ civAdverse: 'solarien', mode: 'express', difficulty: 'normal', mapSize: 'medium', speed: 'normal' }),
    }));`);
  check('marqué « en », le jeu parle anglais', m.langue === 'en' && m.locale === 'en-US');
  check('une phrase traduite : seule, avec un trou, avec un trou déplacé, avec deux',
    m.simple === 'Play' && m.gabarit === 'Ranked · x' && m.deplace === 'medium map' && m.deux === 'A vs B');
  check('une phrase sans traduction reste en français — jamais un trou — et elle est notée',
    m.inconnue === 'Phrase jamais traduite 3' && m.inconnueSimple === 'Mot jamais traduit' && m.manquantes.includes('Phrase jamais traduite {0}') && m.manquantes.includes('Mot jamais traduit')
    && egal(m.accord, ['Mot jamais traduit', 'Mot jamais traduits']));
  check('les nombres s’écrivent à l’anglaise', m.nombre === '1,200');
  check('les tables du jeu sont traduites : unités, bâtiments, formats, difficultés, ressources, peuples, âges, pluriels',
    egal(m.tables, ['Militiaman', 'Barracks', 'Skirmish', 'Hard', 'Gold', 'Camel Rider', 'Feudal Age', 'II', 'Horse Archers']));
  check('… pas leurs identifiants, dont les règles dépendent', egal(m.identifiants, ['militia', 'escarmouche', 'tiny']));
  check('le résumé des réglages se lit en anglais', m.resume.replace(/ /g, ' ') === 'vs Solarians · Express · Normal · medium map · speed 100 %', m.resume);
}

// --- Le choix de la langue ----------------------------------------------------------------------
console.log('\n--- Le choix ---');
{
  const lue = (avant) => ailleurs(`${avant}; const L = await import('./js/langue.js'); console.log(JSON.stringify(L.LANGUE));`);
  const stockage = (valeur) => `globalThis.localStorage = { getItem: (k) => (k === '${CLE_LANGUE}' ? ${JSON.stringify(valeur)} : null), setItem() {} }`;
  check('la langue vient, dans l’ordre : de la marque, de l’adresse, du choix du joueur',
    lue(`globalThis.__LANGUE = 'en'; ${stockage('fr')}`) === 'en' && lue(`globalThis.location = { search: '?langue=en' }; ${stockage('fr')}`) === 'en' && lue(stockage('en')) === 'en' && lue(stockage('fr')) === 'fr');
  check('une langue inconnue, où qu’elle soit écrite, laisse le français', lue(`globalThis.__LANGUE = 'xx'`) === 'fr' && lue(`globalThis.location = { search: '?langue=zz' }`) === 'fr' && lue(stockage('tlh')) === 'fr');
  const pasPrete = LANGUES.find((l) => !l.prete);
  check('une langue pas encore entièrement traduite n’est jamais prise d’office à l’appareil : il faut la choisir',
    !pasPrete || lue(`globalThis.window = { navigator: { languages: ['${pasPrete.id}-XX'], language: '${pasPrete.id}' } }`) === 'fr');
  const m = ailleurs(`
    const coffre = new Map(); globalThis.localStorage = { getItem: (k) => coffre.get(k) ?? null, setItem: (k, v) => coffre.set(k, v) };
    const L = await import('./js/langue.js');
    console.log(JSON.stringify({ ok: L.choisirLangue('en'), range: coffre.get(L.CLE_LANGUE), encore: L.LANGUE }));`);
  check('choisir une langue la range ; elle vaut au chargement suivant', m.ok === true && m.range === 'en' && m.encore === 'fr');
}

// --- La page ---------------------------------------------------------------------------------------
console.log('\n--- La page ---');
{
  const m = ailleurs(`
    globalThis.__LANGUE = 'en';
    const L = await import('./js/langue.js');
    const noeud = (html, attributs = {}) => ({ innerHTML: html, dataset: { txtAttr: attributs.attr || '' }, getAttribute: (a) => attributs[a] ?? null, setAttribute(a, v) { attributs[a] = v; }, attributs });
    const titre = noeud('  Votre\\n   civilisation '), aide = noeud('<b>Glisser</b> : déplacer la vue · <b>pincer</b> : zoomer'), inconnu = noeud('Texte sans traduction');
    const bouton = noeud('', { attr: 'aria-label', 'aria-label': 'Son' });
    const page = { documentElement: { lang: 'fr' }, querySelectorAll: (s) => (s === '[data-txt]' ? [titre, aide, inconnu] : [bouton]) };
    L.traduireLaPage(page);
    console.log(JSON.stringify({ lang: page.documentElement.lang, titre: titre.innerHTML, aide: aide.innerHTML, inconnu: inconnu.innerHTML, bouton: bouton.attributs['aria-label'] }));`);
  check('la page dit sa langue, ses textes en dur sont traduits (espaces ramassés, balises gardées), ses étiquettes aussi',
    m.lang === 'en' && m.titre === 'Your civilization' && m.aide === '<b>Drag</b>: move the view · <b>pinch</b>: zoom' && m.bouton === 'Sound' && m.inconnu === 'Texte sans traduction');
  const html = lire('index.html'), main = lire('js/main.js');
  check('index.html marque ses textes ; main.js les traduit avant d’y poser quoi que ce soit',
    (html.match(/\sdata-txt(?=[\s>])/g) || []).length >= 20 && (html.match(/data-txt-attr="aria-label"/g) || []).length >= 8
    && main.indexOf('traduireLaPage();') > 0 && main.indexOf('traduireLaPage();') < main.indexOf('const DT ='));
  check('l’accueil a son bouton de langue, lisible sans connaître la langue de l’écran', /<button id="btn-langue"[^>]*data-ecran="langue"[^>]*>Langue · Language<\/button>/.test(html));
}

// --- Le recensement ----------------------------------------------------------------------------------
console.log('\n--- Le recensement ---');
{
  const code = [
    'const a = txt`Bonjour ${nom}, il reste ${n > 1 ? `${n} tours` : \'un tour\'}.`;',
    'const b = txt(\'L\\u2019été\'); const c = txt("Deux mots"); const d = txt(variable); const e = montxt(\'non\'); x.txt(\'non plus\');',
    'const f = accord(n, \'Couronne\'); const g = accord(liste.length + f(1, 2), \'cheval\', \'chevaux\');',
    '// txt(\'en commentaire\') : recensé aussi, sans gravité',
    'const h = txt`${a}${b}`; const i = txt`Fin\\u00a0: ${x}`;',
  ].join('\n');
  const cles = clesDuCode(code);
  check('le code : gabarits (trous imbriqués compris), chaînes, accords ; pas les appels dont le texte n’est pas écrit',
    egal(cles, ['Bonjour {0}, il reste {1}.', 'L’été', 'Deux mots', 'Couronne|Couronnes', 'cheval|chevaux', 'en commentaire', '{0}{1}', 'Fin : {0}']), JSON.stringify(cles));
  check('la page : contenus marqués (espaces ramassés) et attributs nommés',
    egal(clesDeLaPage('<h2 data-txt>Votre\n  civilisation</h2><p class="x" data-txt><b>Glisser</b> : zoomer</p><button aria-label="Son" data-txt-attr="aria-label"></button><p>ailleurs</p>'),
      ['Votre civilisation', '<b>Glisser</b> : zoomer', 'Son']));
  const source = await recenser();
  check('le jeu : les textes du code, de la page et des tables sont recensés',
    source.has('Jouer') && source.has('Classée · {0}') && source.has('Milicien') && source.has('Votre civilisation') && source.has('Or') && !source.has('II'), `${source.size} textes`);

  // Chaque dictionnaire.
  for (const langue of LANGUES.filter((l) => l.id !== 'fr')) {
    const e = await etatDe(langue.id, source);
    const { CAHIERS, default: dictionnaire } = await import(`../js/langues/${langue.id}.js`);
    const toutes = Object.values(CAHIERS).flatMap((cahier) => Object.keys(cahier));
    const doubles = toutes.filter((cle, i) => toutes.indexOf(cle) !== i);
    check(`${langue.nom} : aucune phrase traduite deux fois d’un cahier à l’autre`, doubles.length === 0, doubles.slice(0, 3).join(' | '));
    check(`${langue.nom} : aucune traduction qui ne sert plus`, e.orphelines.length === 0, e.orphelines.slice(0, 3).join(' | '));
    const trous = (t) => [...String(t).matchAll(/\{(\d+)\}/g)].map((x) => x[1]).sort().join(',');
    const balises = (t) => [...String(t).matchAll(/<\/?[a-z]+/g)].map((x) => x[0]).sort().join(',');
    const fautives = Object.entries(dictionnaire).filter(([cle, v]) => (typeof v === 'string'
      ? (!v.trim() || [...v.matchAll(/\{(\d+)\}/g)].some((x) => !cle.includes(`{${x[1]}}`)) || balises(v) !== balises(cle))
      : (!v || typeof v.other !== 'string' || !cle.includes('|'))));
    check(`${langue.nom} : pas de traduction vide, pas de trou inventé, les mêmes balises que la phrase française ; un accord a sa forme « other »`,
      fautives.length === 0, fautives.slice(0, 2).map(([cle]) => cle).join(' | ') + (trous('') ? '' : ''));
    check(`${langue.nom} : ${e.traduites} textes traduits sur ${e.total}${langue.prete ? ' — langue proposée d’office : rien ne doit manquer' : ' (traduction en cours)'}`,
      langue.prete ? e.manquantes.length === 0 : e.traduites > 0, e.manquantes.slice(0, 3).join(' | '));
    const sw = lire('sw.js');
    const fichiers = [`js/langues/${langue.id}.js`, ...Object.keys(CAHIERS).map((c) => `js/langues/${langue.id}/${c}.js`)];
    check(`${langue.nom} : chaque cahier existe et le jeu le garde pour le hors-ligne`, fichiers.every((f) => fs.existsSync(path.join(RACINE, f)) && sw.includes(`'./${f}'`)) && sw.includes('\'./js/langue.js\''));
  }
  check('le script des essais lance aussi celui-ci, et `npm run langues` existe',
    (() => { const p = JSON.parse(lire('package.json')); return p.scripts.test.includes('test/langues.test.js') && p.scripts.langues === 'node outils/langues.mjs'; })());
}

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
