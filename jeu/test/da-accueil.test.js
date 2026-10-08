// Direction artistique, lot « accueil et habillage » : l'accueil se choisit sur
// les capitales et tient sur un écran, l'habillage prend les couleurs du peuple
// joué, et l'interface montre les images du jeu — bâtiments au menu Construire
// et dans le panneau, troupes sur leurs boutons, capitale à l'écran de fin.
// Sans navigateur : les fonctions pures se jouent sous Node, le HTML produit
// par l'interface se lit sur de faux nœuds, la page et la feuille de style se
// relisent dans leurs fichiers. Et rien de tout cela ne touche aux règles :
// deux parties témoins se rejouent à l'identique, une sauvegarde se reprend.
// Lancement : node test/da-accueil.test.js

import { World } from '../js/game.js';
import { AIPlayer } from '../js/ai.js';
import { serializeWorld, restoreWorld, SAVE_VERSION } from '../js/save.js';
import {
  AGES, BUILDING_TYPES, UNIT_TYPES, CIVILISATIONS, DIFFICULTIES, GAME_MODES, GAME_SPEEDS, MAP_SIZES,
  TICKS_PER_SECOND, civDe, nomDe, portraitDe,
} from '../js/config.js';
import { UI, imageBatiment, illustrationDeFin, resumeReglages, toucherNouvellePartie, DELAI_EFFACER } from '../js/ui.js';
import { ficheCiv } from '../js/sprites.js';
import { readFileSync, existsSync } from 'node:fs';

const DT = 1 / TICKS_PER_SECOND;
let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? '  ok  ' : ' FAIL ';
  if (!condition) failures++;
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

/** Un scénario : une exception y compte pour un échec, sans taire les suivants. */
function essai(nom, scenario) {
  try { scenario(); } catch (e) { check(`${nom} (exception)`, false, e.message); }
}

const lire = (chemin) => readFileSync(new URL(chemin, import.meta.url), 'utf8');
const existe = (chemin) => existsSync(new URL(`../${chemin}`, import.meta.url));
const html = lire('../index.html'), css = lire('../css/jeu.css');
const main = lire('../js/main.js'), ui = lire('../js/ui.js');
const civs = Object.keys(CIVILISATIONS);

/** Le contenu de la première règle de la feuille de style qui porte exactement ce sélecteur. */
const regle = (selecteur) => (css.match(new RegExp('(?:^|\\n)' + selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}')) || ['', ''])[1];
/** La valeur d'une variable dans une règle (« --lisere » → « #d9c9a3 »). */
const variable = (bloc, nom) => (bloc.match(new RegExp(nom + ':\\s*([^;]+);')) || ['', ''])[1].trim();

/** Un monde sans adversaire qui joue : seules les règles s'y expriment. */
function monde(options) {
  const w = new World({ difficulty: 'normal', seed: 91, mapSize: 'small', ...options });
  w.ais = [];
  w.drainEvents();
  return w;
}
const centre = (w, i = 0) => w.buildings.find((b) => !b.dead && b.playerIndex === i && b.type === 'towncenter');
/** Un bâtiment achevé, posé d'office à côté du Centre-Ville. */
function batir(w, joueur, type, rang = 0) {
  const depart = w.map.startPositions[joueur];
  return w.spawnBuilding(joueur, type, depart.tx + 4 + rang * 4, depart.ty + 5, true);
}

/** Un faux nœud : il retient le HTML qu'on lui écrit, et ne trouve jamais rien. */
const noeud = () => ({
  innerHTML: '',
  querySelector: () => null,
  querySelectorAll: () => [],
  insertAdjacentHTML(_ou, texte) { this.innerHTML += texte; },
});
/** La vraie interface sur de faux nœuds : ce que ses méthodes de rendu écrivent, sans page. */
function fausseInterface(w) {
  const faux = Object.create(UI.prototype);
  faux.world = w;
  // (Ce que les rendus demandent à la partie ; toute autre méthode répond sans rien faire.)
  faux.game = new Proxy({
    world: w, civ: w.players[w.humanIndex].civ, selection: [], audio: { play() {} },
    attackMoveArmed: false, garrisonArmed: false, rallyArmed: false,
    ouvrier: () => 'ouvrier', demolitionEnAttente: () => false, hasSpareWorker: () => true,
  }, { get: (o, k) => (k in o ? o[k] : (typeof k === 'symbol' ? undefined : () => {})) });
  faux.nodes = { selection: noeud(), commands: noeud(), buildMenu: { classList: { add() {}, remove() {} } } };
  faux.fenetre = '';
  faux.showModal = (texte, options) => { faux.fenetre = texte; faux.options = options; return { querySelector: () => ({ addEventListener() {} }), querySelectorAll: () => [] }; };
  return faux;
}
/** Le menu Construire écrit par la vraie interface, sur une fausse liste. */
function menuConstruire(civ) {
  const w = monde({ civs: [civ, 'atlante'] });
  w.players[0].age = AGES.length - 1;
  const liste = noeud();
  const faux = fausseInterface(w);
  const page = globalThis.document;
  globalThis.document = { getElementById: () => liste };
  try { faux.openBuildMenu(); } finally {
    if (page === undefined) delete globalThis.document; else globalThis.document = page;
  }
  const cartes = {};
  for (const m of liste.innerHTML.matchAll(/data-type="(\w+)">\s*<span class="bc-icon( vignette)?">([\s\S]*?)<\/span>\s*<span class="bc-body">\s*<span class="bc-name">([^<]*)</g)) {
    cartes[m[1]] = { vignette: !!m[2], image: (m[3].match(/<img[^>]*src="([^"]+)"/) || [])[1] || null, picto: m[3].includes('<svg'), nom: m[4] };
  }
  return cartes;
}

// ---------------------------------------------------------------------------
// 1. L'accueil : la page
// ---------------------------------------------------------------------------
console.log('\n--- L’accueil ---');
{
  check('le chevalier a quitté l’accueil', !html.includes('heros.webp') && !/class="hero"/.test(html) && !css.includes('.hero'));
  const ids = ['start-screen', 'resume-box', 'civ-options', 'civ-adverse-options', 'mode-options', 'difficulty-options',
    'map-options', 'speed-options', 'btn-play', 'btn-howto', 'palmares', 'howto'];
  const absents = ids.filter((id) => (html.match(new RegExp(`id="${id}"`, 'g')) || []).length !== 1);
  check('tous les identifiants dont le code se sert sont là, une fois chacun', absents.length === 0, absents.join(', '));

  const replie = (html.match(/<details id="reglages"[^>]*>([\s\S]*?)<\/details>/) || ['', ''])[1];
  const dedans = ['civ-adverse-options', 'mode-options', 'difficulty-options', 'map-options', 'speed-options'];
  check('les réglages secondaires sont repliés sous « Réglages de la partie », avec leur ligne de résumé',
    dedans.every((id) => replie.includes(`id="${id}"`)) && /<summary>[\s\S]*Réglages de la partie[\s\S]*id="reglages-resume"[\s\S]*<\/summary>/.test(replie)
    && !/<details id="reglages"[^>]* open/.test(html), dedans.filter((id) => !replie.includes(`id="${id}"`)).join(', '));
  check('… mais ni le choix du peuple, ni la reprise, ni « Jouer »',
    !['id="civ-options"', 'id="resume-box"', 'id="btn-play"', 'id="palmares"'].some((t) => replie.includes(t)));
  const rang = (id) => html.indexOf(`id="${id}"`);
  check('l’ordre de l’écran : reprise, peuple, réglages, Jouer, palmarès',
    rang('resume-box') < rang('civ-options') && rang('civ-options') < rang('reglages') && rang('reglages') < rang('btn-play') && rang('btn-play') < rang('palmares'));

  // Les tuiles de peuple, écrites par js/main.js : une image de capitale, et toujours la classe « option ».
  const tuile = (main.match(/<button class="option compact \$\{illustre \? 'peuple ' : ''\}[^>]*data-civ="\$\{c\.id\}">[\s\S]*?<\/button>/) || [''])[0];
  check('main.js : la tuile de son peuple porte l’image de sa capitale (et reste une « .option » à data-civ)',
    tuile.includes('<img src="${capitaleDe(c.id)}"') && /choixCiv\('civ-options', 'civ', true\)/.test(main)
    && /choixCiv\('civ-adverse-options', 'civAdverse', false\)/.test(main), tuile.slice(0, 80));
  const capitale = (main.match(/function capitaleDe\(civ\) \{[\s\S]*?\n\}/) || [''])[0];
  const repli = (capitale.match(/'(assets\/[\w\/-]+\.webp)'/) || [])[1];
  check('main.js : la capitale d’un peuple est son image propre, à défaut le Centre-Ville atlante — un fichier livré',
    capitale.includes("ficheCiv('towncenter', civ)") && repli === 'assets/centre-ville.webp' && existe(repli)
    && civs.filter((c) => c !== 'atlante').every((c) => ficheCiv('towncenter', c) && existe(ficheCiv('towncenter', c).src)));
  check('main.js : le résumé suit chaque réglage (peuple adverse, format, difficulté, carte, vitesse) et le retour à l’accueil',
    (main.match(/refreshReglages\(\);/g) || []).length >= 6, `${(main.match(/refreshReglages\(\);/g) || []).length} appels`);

  // « Jouer » sous le pouce, quelle que soit la hauteur de la carte.
  check('main.js : une partie dort — « Nouvelle partie », resté sous le pouce, laisse l’or à « Reprendre »',
    /play\.textContent = arme \? 'Effacer la partie en cours \?' : partieEnAttente \? 'Nouvelle partie' : 'Jouer';/.test(main)
    && /play\.classList\.toggle\('primary', !partieEnAttente\);/.test(main) && /play\.classList\.toggle\('arme', arme\);/.test(main));
  // … et il n'efface plus la partie en cours d'un seul toucher.
  const jouer = (main.match(/getElementById\('btn-play'\)\.addEventListener\('click', \(\) => \{([\s\S]*?)\n  \}\);/) || ['', ''])[1];
  check('main.js : « Jouer » passe par toucherNouvellePartie, et n’efface la sauvegarde qu’une fois le lancement décidé',
    /const toucher = toucherNouvellePartie\(partieEnAttente, effacerJusqua, performance\.now\(\)\);/.test(jouer)
    // (Entre la décision et l'effacement, seulement le décompte d'une partie classée abandonnée.)
    && /if \(!toucher\.lancer\) \{[^}]*return; \}\s*(?:\/\/[^\n]*\n\s*)?abandonnerPartieClasseeEnCours\(\);\s*clearSave\(\);\s*startGame\(/.test(jouer)
    && (jouer.match(/clearSave\(\)/g) || []).length === 1 && !/confirm\(/.test(main), jouer.replace(/\s+/g, ' ').slice(0, 90));
  const carteReprise = (main.match(/function refreshResumeCard\(\) \{[\s\S]*?\n\}/) || [''])[0];
  check('main.js : la carte de reprise dit au bouton si une partie dort, et le désarme quand elle change',
    /partieEnAttente = !!save;\s*armerNouvellePartie\(0\);/.test(carteReprise)
    && /function showStartScreen\(\) \{[\s\S]*?refreshResumeCard\(\);/.test(main));
  const T0 = 50000;
  const premier = toucherNouvellePartie(true, 0, T0);
  check('aucune partie ne dort : un toucher lance', toucherNouvellePartie(false, 0, T0).lancer === true && toucherNouvellePartie(false, T0 + 1000, T0).lancer === true);
  check('une partie dort : le premier toucher arme le bouton pour trois secondes, sans rien lancer',
    premier.lancer === false && premier.armeJusqua === T0 + DELAI_EFFACER && DELAI_EFFACER === 3000);
  const second = toucherNouvellePartie(true, premier.armeJusqua, T0 + 800);
  check('… le second, dans le délai, lance et désarme', second.lancer === true && second.armeJusqua === 0);
  const tardif = toucherNouvellePartie(true, premier.armeJusqua, T0 + DELAI_EFFACER);
  check('… passé le délai, il faut recommencer : le toucher réarme', tardif.lancer === false && tardif.armeJusqua === T0 + 2 * DELAI_EFFACER
    && toucherNouvellePartie(true, premier.armeJusqua, T0 + DELAI_EFFACER + 5000).lancer === false);
  const arme = regle('.start-actions .btn.arme');
  check('css : armé, le bouton est rouge et sa question, plus petite, ne fait pas bouger la barre',
    /border-color:\s*#e0604c/.test(arme) && /font-size:\s*14px/.test(arme) && /line-height:\s*1\.15/.test(arme));
  const actions = regle('.start-actions');
  check('css : la barre « Jouer » colle au bas de l’écran, sur un fond plein',
    /position:\s*sticky/.test(actions) && /bottom:\s*0/.test(actions) && actions.includes('var(--panel-solid)') && actions.includes('var(--safe-bottom)'));
  check('css : la marge du bas de l’accueil n’est pas un retrait du conteneur (la barre collante s’y arrêterait)',
    /padding:\s*calc\(12px \+ var\(--safe-top\)\) 12px 0;/.test(regle('.screen')) && /\.screen::after\s*\{[^}]*var\(--safe-bottom\)/.test(css));
  check('css : chaque peuple a sa tuile à ses couleurs', civs.every((c) => regle(`.option.peuple[data-civ="${c}"]`).includes('linear-gradient')),
    civs.filter((c) => !regle(`.option.peuple[data-civ="${c}"]`)).join(', '));
}

// ---------------------------------------------------------------------------
// 2. La ligne de résumé des réglages
// ---------------------------------------------------------------------------
console.log('\n--- Le résumé des réglages ---');
{
  // Ce que le joueur lit : les espaces insécables rendues à des espaces ordinaires.
  const lu = (reglages) => resumeReglages(reglages).replace(/\u00a0/g, ' ');
  const defaut = { civ: 'atlante', civAdverse: 'atlante', mode: 'classique', difficulty: 'normal', mapSize: 'medium', speed: 'normal' };
  check('les réglages par défaut', lu(defaut) === 'Atlantes en face · Classique · Normal · carte moyenne · vitesse 100 %', lu(defaut));
  const autre = lu({ civAdverse: 'solarien', mode: 'express', difficulty: 'hard', mapSize: 'small', speed: 'blitz' });
  check('un autre jeu de réglages', autre === `Solariens en face · Express · ${DIFFICULTIES.hard.name} · carte petite · vitesse 200 %`, autre);
  check('un réglage inconnu est passé, un peuple inconnu retombe sur les Atlantes',
    lu({ civAdverse: 'martien', mode: 'tournoi', difficulty: '', mapSize: 'geante', speed: 'lumiere' }) === 'Atlantes en face'
    && lu({}) === 'Atlantes en face');
  let incomplets = 0, malCoupes = 0, total = 0;
  for (const civAdverse of civs) for (const mode of Object.keys(GAME_MODES)) for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (const mapSize of Object.keys(MAP_SIZES)) for (const v of GAME_SPEEDS) {
      total++;
      const brut = resumeReglages({ civAdverse, mode, difficulty, mapSize, speed: v.id });
      const parts = brut.replace(/\u00a0/g, ' ').split(' · ');
      if (parts.length !== 5 || parts.some((p) => !p || /undefined|null/.test(p))) incomplets++;
      // Les seuls endroits où la ligne peut se replier : les espaces ordinaires. Il y en a une
      // après chaque point, aucune devant, aucune à l'intérieur d'une mention.
      const morceaux = brut.split(' ');
      if (morceaux.length !== 5 || morceaux.some((m) => m.startsWith('·')) || !morceaux.slice(0, -1).every((m) => m.endsWith('\u00a0·'))) malCoupes++;
    }
  }
  check('toutes les combinaisons donnent cinq mentions', incomplets === 0, `${total} combinaisons`);
  check('la ligne ne se replie qu’entre deux mentions, et jamais un point ne commence une ligne', malCoupes === 0, `${malCoupes} sur ${total}`);
  check('css : repliée, la ligne se partage en lignes de même longueur', /text-wrap:\s*balance/.test(regle('.reglages-resume')));
}

// ---------------------------------------------------------------------------
// 3. L'habillage par peuple
// ---------------------------------------------------------------------------
console.log('\n--- L’habillage ---');
{
  const hex = (c) => { const m = /^#([0-9a-f]{6})$/i.exec(c); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
  const lum = (c) => { const [r, g, b] = hex(c).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contraste = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
  const texte = variable(regle(':root'), '--text');
  for (const c of civs) {
    const bloc = regle(`body[data-civ="${c}"]`);
    const manquantes = ['--bg', '--panel', '--panel-solid', '--border', '--muted', '--lisere', '--lueur', '--fond-bouton'].filter((v) => !variable(bloc, v));
    check(`${CIVILISATIONS[c].name} : le thème définit fonds, liseré et texte secondaire`, manquantes.length === 0, manquantes.join(', '));
    const fond = variable(bloc, '--panel-solid'), sourd = variable(bloc, '--muted');
    const lisibles = hex(fond) && hex(sourd) && contraste(texte, fond) >= 7 && contraste(sourd, fond) >= 4.5;
    check(`${CIVILISATIONS[c].name} : le texte se lit sur son panneau (contraste d’au moins 7, et 4,5 pour le texte secondaire)`, lisibles,
      hex(fond) && hex(sourd) ? `${contraste(texte, fond).toFixed(1)} et ${contraste(sourd, fond).toFixed(1)}` : `${fond} / ${sourd}`);
    const portrait = (css.match(new RegExp(`body\\[data-civ="${c}"\\], \\.portrait\\[data-civ="${c}"\\]\\s*\\{([^}]*)\\}`)) || ['', ''])[1];
    check(`${CIVILISATIONS[c].name} : le fond des portraits suit le peuple de ce qu’ils montrent`,
      !!variable(portrait, '--fond-portrait') && !!variable(portrait, '--fond-vignette'));
  }
  const themes = civs.map((c) => variable(regle(`body[data-civ="${c}"]`), '--panel-solid') + variable(regle(`body[data-civ="${c}"]`), '--lisere'));
  check('deux peuples, deux habillages', new Set(themes).size === civs.length, themes.join(' / '));
  // (Cachée pour de bon, elle laissait un écran vide tant que les scripts n'étaient pas arrivés — et à jamais
  // devant un script d'une version d'avant, qui ne pose pas le peuple.)
  const attente = regle('body:not([data-civ]) .start-card');
  const delai = Number((attente.match(/animation:\s*attente-habillage 0s linear ([\d.]+)s both/) || [])[1]);
  check('la carte d’accueil attend ses couleurs, mais une seconde et demie au plus : elle n’est jamais cachée pour de bon',
    delai > 0 && delai <= 1.5 && !/visibility/.test(attente)
    && /@keyframes attente-habillage\s*\{\s*from\s*\{\s*visibility:\s*hidden;\s*\}\s*to\s*\{\s*visibility:\s*visible;\s*\}\s*\}/.test(css)
    && !/\.start-card[^{]*\{[^}]*visibility:\s*hidden/.test(css), `${delai} s`);
  check('la page attend le jeu pour s’habiller (pas de couleurs d’un peuple à la place d’un autre), puis porte celui que l’on joue',
    /<body>/.test(html)
    && /document\.body\.dataset\.civ = civDe\(civ\);/.test(main)
    && /function showStartScreen\(\) \{[\s\S]*?habiller\(settings\.civ\);/.test(main)
    && /currentGame = new Game\(options\);\s*habiller\(currentGame\.civ\);/.test(main)
    && /if \(illustre\) habiller\(settings\[cle\]\);/.test(main));
  check('une sauvegarde d’avant les civilisations s’habille en Atlantes', civDe(undefined) === 'atlante' && civDe('martien') === 'atlante' && civDe('solarien') === 'solarien');

  const bas = regle('#bottombar');
  check('la barre du bas a un bord franc au liseré du peuple, sur un panneau plein',
    /border-top:\s*2px solid var\(--lisere\)/.test(bas) && bas.includes('var(--panel-solid)') && !/rgba\([^)]*,\s*\.?0\)/.test(bas));
  check('plus aucune pastille en gélule', !/999px/.test(css));
  check('la mini-carte a son cadre au liseré', /border:\s*2px solid var\(--lisere\)/.test(regle('#minimap-wrap')));
  check('les titres sont en caractères de titre déjà sur le téléphone, le reste garde la police du système',
    /--titre:\s*"Palatino"[^;]*Georgia, serif;/.test(css) && /font-family:\s*system-ui/.test(regle('html, body'))
    && ['.start-card h1', '#selection-panel .name', '.sheet-head h2', '.bc-name', '.modal-card h2'].every((s) => regle(s).includes('var(--titre)'))
    && !regle('.cmd-label').includes('--titre') && !regle('.bc-desc').includes('--titre'));
  // Les cibles de toucher ne bougent pas.
  const cibles = [['.btn', /min-height:\s*48px/], ['.option', /min-height:\s*52px/], ['.cmd', /min-height:\s*62px/],
    ['#btn-lacher', /width:\s*44px;\s*height:\s*44px/], ['.reglages summary', /min-height:\s*52px/], ['.bc-icon', /min-height:\s*46px/]];
  const petites = cibles.filter(([s, r]) => !r.test(regle(s))).map(([s]) => s);
  check('les cibles de toucher gardent leur taille (44 points au moins)', petites.length === 0 && /#btn-armee\s*\{\s*min-height:\s*44px/.test(css), petites.join(', '));
  // Menu Construire : la liste est une grille qui défile ; une hauteur minimale posée sur ses cartes
  // tassait les rangées, et le texte en sortait dès l'Âge Féodal. La hauteur vient de la case de l'icône.
  const carte = regle('.build-card').replace(/\/\*[\s\S]*?\*\//g, '');
  check('menu Construire : la hauteur d’une carte suit son texte (aucune hauteur imposée à la carte ni aux rangées)',
    !/(?:^|[\s;])(?:min-|max-)?height\s*:/.test(carte) && !/grid-(?:auto|template)-rows/.test(regle('.build-list'))
    && /overflow-y:\s*auto/.test(regle('.build-list')) && /padding:\s*8px 12px 8px 8px/.test(carte), carte.replace(/\s+/g, ' ').slice(0, 80));
  // Barre du bas : les portraits ne la font pas grandir plus que nécessaire.
  const pastille = regle('.chip img.visage');
  const cote = Number((pastille.match(/height:\s*(\d+)px/) || [])[1]);
  const marges = (pastille.match(/margin:\s*(-?\d+)px 0 (-?\d+)px/) || []).slice(1).map(Number);
  check('sélection multiple : une pastille à portrait n’est pas plus haute qu’une pastille à pictogramme (17 points d’icône)',
    cote >= 20 && marges.length === 2 && cote + marges[0] + marges[1] <= 17 && /padding:\s*5px 9px/.test(regle('.chip')), `${cote} px, marges ${marges.join(' et ')}`);
  check('la barre du bas garde sa marge d’origine sous son bord franc', /padding:\s*8px calc\(8px \+ var\(--safe-right\)\)/.test(regle('#bottombar')) && /top:\s*8px/.test(regle('#btn-lacher')));
  check('rien dans la feuille de style que la page embarquée refuserait (ni « data: » ni « blob: »)', !/data:|blob:/.test(css));
  check('aucun emoji dans la page', !/\p{Extended_Pictographic}/u.test(html));
}

// ---------------------------------------------------------------------------
// 4. Les images du jeu dans l'interface
// ---------------------------------------------------------------------------
console.log('\n--- Les images du jeu dans l’interface ---');
essai('images des bâtiments', () => {
  const cache = new Set([...lire('../sw.js').matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]));
  const types = Object.keys(BUILDING_TYPES);
  const sol = types.map((t) => imageBatiment(t, 'solarien'));
  check('chaque bâtiment solarien a son illustration : celle de la carte, livrée et gardée hors ligne',
    sol.every((src, i) => src && src === ficheCiv(types[i], 'solarien').src && existe(src) && cache.has(src)) && new Set(sol).size === types.length,
    sol.filter((s) => !s || !existe(s)).join(', ') || `${sol.length} images`);
  check('une troupe, un type inconnu : pas d’illustration de bâtiment',
    imageBatiment('villager', 'solarien') === null && imageBatiment('militia', 'atlante') === null && imageBatiment('donjon', 'solarien') === null);
  check('tant que l’image atlante n’est pas chargée (ici, sans navigateur) : rien, l’appelant garde le pictogramme',
    types.every((t) => imageBatiment(t, 'atlante') === null));

  const menuSol = menuConstruire('solarien'), menuAtl = menuConstruire('atlante');
  check('menu Construire des Solariens : une carte par bâtiment, chacune avec son illustration',
    Object.keys(menuSol).length === types.length
    && types.every((t) => menuSol[t] && menuSol[t].vignette && menuSol[t].image === imageBatiment(t, 'solarien') && !menuSol[t].picto),
    types.filter((t) => !menuSol[t] || !menuSol[t].vignette).join(', '));
  check('… et toujours leurs noms solariens', menuSol.towncenter.nom === 'Palais du Soleil' && menuSol.mill.nom === 'Grenier' && menuSol.house.nom === 'Maison');
  check('menu Construire sans image chargée : le pictogramme, comme avant',
    Object.keys(menuAtl).length === types.length && types.every((t) => menuAtl[t] && !menuAtl[t].vignette && menuAtl[t].picto && !menuAtl[t].image));
});

essai('panneau de sélection', () => {
  const w = monde({ civs: ['solarien', 'atlante'] });
  w.players[0].age = AGES.length - 1;
  const faux = fausseInterface(w);
  const ecrit = (entite) => { faux.nodes.selection.innerHTML = ''; faux.renderSelectionPanel([entite]); return faux.nodes.selection.innerHTML; };

  const palais = ecrit(centre(w, 0));
  check('un bâtiment sélectionné a son illustration pour portrait, sur le sol de son peuple',
    /<div class="portrait batiment" data-civ="solarien"[^>]*><img src="assets\/solariens\/centre-ville\.webp"/.test(palais) && palais.includes('Palais du Soleil'),
    (palais.match(/<div class="portrait[^>]*>[^<]*<[^>]*>/) || [''])[0]);
  const adverse = ecrit(centre(w, 1));
  check('un bâtiment sans image chargée garde son pictogramme, sans cadre de bâtiment',
    /<div class="portrait" data-civ="atlante"[^>]*><svg/.test(adverse) && adverse.includes('(ennemi)'));
  const fellah = ecrit(w.units.find((u) => u.playerIndex === 0 && u.isVillager));
  check('une troupe garde son portrait, sur la couleur de son peuple',
    /<div class="portrait illustre" data-civ="solarien"[^>]*><img src="assets\/portrait-sol-fellah\.webp"/.test(fellah));

  // Les boutons de formation : le portrait de la troupe dans le peuple du joueur, à défaut son pictogramme.
  const caserne = batir(w, 0, 'barracks');
  faux.renderCommands([caserne]);
  const boutons = [...faux.nodes.commands.innerHTML.matchAll(/<span class="cmd-icon">([\s\S]*?)<\/span>\s*<span class="cmd-label">([^<]*)</g)]
    .map((m) => ({ nom: m[2], image: (m[1].match(/<img class="visage" src="([^"]+)"/) || [])[1] || null, picto: m[1].includes('<svg') }));
  const former = BUILDING_TYPES.barracks.trains.map((t) => ({ t, b: boutons.find((b) => b.nom === nomDe(t, 'solarien')) }));
  check('boutons de formation : chaque troupe y montre son portrait solarien — ou son pictogramme, faute de portrait',
    former.every(({ t, b }) => b && (portraitDe(t, 'solarien') ? b.image === portraitDe(t, 'solarien') && !b.picto : b.picto && !b.image))
    && former.some(({ b }) => b.image) && former.some(({ b }) => b.picto),
    former.map(({ t, b }) => `${t} : ${b ? b.image || 'pictogramme' : 'absent'}`).join(' · '));
  check('… les autres boutons gardent leur pictogramme', boutons.filter((b) => !former.some((f) => f.b === b)).every((b) => b.picto && !b.image)
    && boutons.some((b) => b.nom === 'Ralliement'));

  // La file de production et la sélection multiple.
  caserne.queue.push({ id: 'militia', timeLeft: 5, total: 10 }, { id: 'forging', timeLeft: 5, total: 10 });
  const file = faux.renderQueue(caserne);
  check('file de production : le portrait pour une troupe, le pictogramme pour une technologie',
    file.includes(`<img class="visage" src="${portraitDe('militia', 'solarien')}"`) && (file.match(/<svg/g) || []).length === 1
    && (file.match(/data-cancel=/g) || []).length === 2);
  caserne.queue.length = 0;
  faux.nodes.selection.innerHTML = '';
  faux.renderSelectionPanel(w.units.filter((u) => u.playerIndex === 0 && !u.isAnimal));
  check('sélection multiple : une pastille par type, à son portrait',
    faux.nodes.selection.innerHTML.includes(`data-filter="villager"><img class="visage" src="${portraitDe('villager', 'solarien')}"`)
    && /unités sélectionnées/.test(faux.nodes.selection.innerHTML));

  // Les mêmes boutons côté Atlantes : leurs portraits à eux.
  const wa = monde({ civs: ['atlante', 'solarien'] });
  wa.players[0].age = AGES.length - 1;
  const fauxA = fausseInterface(wa);
  fauxA.renderCommands([batir(wa, 0, 'stable')]);
  check('chez les Atlantes, les portraits atlantes',
    BUILDING_TYPES.stable.trains.every((t) => !portraitDe(t, 'atlante') || fauxA.nodes.commands.innerHTML.includes(`src="${portraitDe(t, 'atlante')}"`))
    && !fauxA.nodes.commands.innerHTML.includes('portrait-sol-'));
  check('chaque portrait cité par le jeu est livré',
    Object.keys(UNIT_TYPES).every((t) => civs.every((c) => !portraitDe(t, c) || existe(portraitDe(t, c)))));
});

essai('écran de fin', () => {
  const victoire = { winner: 0, victory: true, time: 754 }, defaite = { winner: 1, victory: false, time: 754 };
  const palais = ficheCiv('towncenter', 'solarien').src;
  check('victoire : la capitale du joueur, debout', JSON.stringify(illustrationDeFin(victoire, 'solarien')) === JSON.stringify({ src: palais, classe: 'debout' }));
  check('défaite : la même, éteinte', JSON.stringify(illustrationDeFin(defaite, 'solarien')) === JSON.stringify({ src: palais, classe: 'tombe' }));
  check('égalité, ou image pas encore chargée : pas d’illustration',
    illustrationDeFin({ winner: -1, victory: false, time: 600 }, 'solarien') === null && illustrationDeFin(victoire, 'atlante') === null && illustrationDeFin(null, 'solarien') === null);
  const w = monde({ civs: ['solarien', 'atlante'] });
  const faux = fausseInterface(w);
  faux.showGameOver(victoire, null);
  const gagne = faux.fenetre;
  faux.showGameOver(defaite, null);
  check('l’écran de fin des Solariens a enfin son image, celle de leur Palais',
    gagne.includes(`<img class="fin-illustration debout" src="${palais}"`) && gagne.includes('Victoire !')
    && faux.fenetre.includes(`<img class="fin-illustration tombe" src="${palais}"`) && faux.fenetre.includes('Défaite'));
  check('le chevalier a quitté les écrans de fin, pour les deux peuples',
    !/heros\.webp|defaite\.webp|'heros'|'defaite'/.test(ui) && !/heros|defaite\.webp/.test(gagne + faux.fenetre));
  check('l’écran de fin se déclare tel à sa fenêtre', !!faux.options && faux.options.fin === true && faux.options.wide === true);
  const vraie = Object.create(UI.prototype);
  vraie.nodes = { modal: { innerHTML: '', classList: { add() {}, remove() {} } } };
  vraie.showModal('<p>fin</p>', { wide: true, fin: true });
  const carteFin = vraie.nodes.modal.innerHTML;
  vraie.showModal('<p>pause</p>');
  check('… qui porte alors la classe « fin » — et elle seule : pause, aide et crédits gardent leur défilement',
    /^<div class="modal-card wide fin">/.test(carteFin) && /^<div class="modal-card ">/.test(vraie.nodes.modal.innerHTML)
    && (ui.match(/fin: true/g) || []).length === 1);
  const collants = regle('.modal-card.fin .modal-actions');
  check('css : « Nouvelle partie » et « Menu principal » collent au bas de la carte de fin, sur son fond',
    /position:\s*sticky/.test(collants) && /bottom:\s*0/.test(collants) && collants.includes('var(--panel-solid)')
    && /padding-bottom:\s*0/.test(regle('.modal-card.fin')));
  const court = (css.match(/@media \(max-height: (\d+)px\) \{ \.fin-illustration \{ height: (\d+)px; \} \}/) || []).slice(1).map(Number);
  check('css : sur un écran court, la capitale laisse la place au tableau des scores', court.length === 2 && court[0] >= 667 && court[1] < 132 && court[1] >= 60, court.join(' / '));
  check('css : debout elle est dorée, tombée elle est éteinte',
    /drop-shadow\(0 0 20px rgba\(232, 182, 76/.test(regle('.fin-illustration.debout')) && /grayscale/.test(regle('.fin-illustration.tombe')));
});

// ---------------------------------------------------------------------------
// 5. Rien n'a changé aux règles : deux parties témoins, et une sauvegarde
// ---------------------------------------------------------------------------
console.log('\n--- Les règles n’ont pas bougé ---');

/** L'état visible d'une partie (la même empreinte que test/simulation.test.js), condensé en huit chiffres. */
function empreinte(world) {
  const n = (v) => Math.round(v * 100) / 100;
  const texte = [
    't' + n(world.time),
    'r' + world.players.map((p) => [p.age, n(p.resources.food), n(p.resources.wood), n(p.resources.gold),
      p.pop, p.popCap, [...p.techs].sort().join('+')].join('/')).join('|'),
    'g' + world.map.resources.size,
    'u' + world.units.filter((u) => !u.dead)
      .map((u) => [u.id, u.type, n(u.x), n(u.y), n(u.hp), u.state, n(u.carry.amount)].join(','))
      .sort().join(';'),
    'b' + world.buildings.filter((b) => !b.dead)
      .map((b) => [b.id, b.type, n(b.hp), b.complete ? 1 : 0, n(b.buildProgress), b.queue.length].join(','))
      .sort().join(';'),
  ].join('#');
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) { h ^= texte.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
/** Deux IA s'affrontent sur une graine, le temps donné. */
function partie(options, secondes) {
  const w = new World({ difficulty: 'normal', ...options });
  w.players[0].autoWorkers = true;
  w.ais.push(new AIPlayer(w, 0, DIFFICULTIES.normal));
  for (let i = 0; i < secondes * TICKS_PER_SECOND; i++) w.update(DT);
  return w;
}
essai('parties témoins', () => {
  // Empreintes relevées sur le jeu d'avant ce lot (commit 08481a4), par ce même calcul.
  const classique = partie({ seed: 808, mapSize: 'small', mode: 'classique', civs: ['atlante', 'solarien'] }, 240);
  check('la partie Classique témoin (graine 808, quatre minutes) se rejoue à l’identique', empreinte(classique) === 'e3871281', empreinte(classique));
  const express = partie({ seed: 4242, mapSize: 'small', mode: 'express', civs: ['solarien', 'atlante'] }, 180);
  check('la partie Express témoin (graine 4242, trois minutes) aussi', empreinte(express) === 'bdedb461', empreinte(express));

  const instantane = JSON.parse(JSON.stringify(serializeWorld(classique)));
  const repris = restoreWorld(instantane);
  check('la sauvegarde garde sa version et se reprend dans le même état', SAVE_VERSION === 1 && instantane.version === 1 && !!repris && empreinte(repris) === empreinte(classique));
  for (let i = 0; i < 30 * TICKS_PER_SECOND; i++) { classique.update(DT); repris.update(DT); }
  check('… et la partie reprise continue comme l’autre', empreinte(repris) === empreinte(classique));
  for (const p of instantane.players) delete p.civ;
  const vieille = restoreWorld(instantane);
  check('une sauvegarde d’avant les civilisations se reprend, habillée en Atlantes', !!vieille && vieille.players.every((p) => civDe(p.civ) === 'atlante'));
});

console.log(`\n${failures === 0 ? '✅ Tous les tests passent' : '❌ ' + failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
