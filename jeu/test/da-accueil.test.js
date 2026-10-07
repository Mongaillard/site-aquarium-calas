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
import { UI, imageBatiment, illustrationDeFin, resumeReglages } from '../js/ui.js';
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
  faux.showModal = (texte) => { faux.fenetre = texte; return { querySelector: () => ({ addEventListener() {} }), querySelectorAll: () => [] }; };
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
    /play\.textContent = 'Nouvelle partie'; play\.classList\.remove\('primary'\);/.test(main)
    && /play\.textContent = 'Jouer'; play\.classList\.add\('primary'\);/.test(main));
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
  const defaut = { civ: 'atlante', civAdverse: 'atlante', mode: 'classique', difficulty: 'normal', mapSize: 'medium', speed: 'normal' };
  check('les réglages par défaut', resumeReglages(defaut) === 'Atlantes en face · Classique · Normal · carte moyenne · ×1', resumeReglages(defaut));
  const autre = resumeReglages({ civAdverse: 'solarien', mode: 'express', difficulty: 'hard', mapSize: 'small', speed: 'blitz' });
  check('un autre jeu de réglages', autre === `Solariens en face · Express · ${DIFFICULTIES.hard.name} · carte petite · ×2`, autre);
  check('un réglage inconnu est passé, un peuple inconnu retombe sur les Atlantes',
    resumeReglages({ civAdverse: 'martien', mode: 'tournoi', difficulty: '', mapSize: 'geante', speed: 'lumiere' }) === 'Atlantes en face'
    && resumeReglages({}) === 'Atlantes en face');
  let incomplets = 0, total = 0;
  for (const civAdverse of civs) for (const mode of Object.keys(GAME_MODES)) for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (const mapSize of Object.keys(MAP_SIZES)) for (const v of GAME_SPEEDS) {
      total++;
      const parts = resumeReglages({ civAdverse, mode, difficulty, mapSize, speed: v.id }).split(' · ');
      if (parts.length !== 5 || parts.some((p) => !p || /undefined|null/.test(p))) incomplets++;
    }
  }
  check('toutes les combinaisons donnent cinq mentions', incomplets === 0, `${total} combinaisons`);
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
  check('la page attend le jeu pour s’habiller (pas de couleurs d’un peuple à la place d’un autre), puis porte celui que l’on joue',
    /<body>/.test(html) && /body:not\(\[data-civ\]\) \.start-card\s*\{\s*visibility:\s*hidden/.test(css)
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
    ['#btn-lacher', /width:\s*44px;\s*height:\s*44px/], ['.reglages summary', /min-height:\s*52px/], ['.build-card', /min-height:\s*62px/]];
  const petites = cibles.filter(([s, r]) => !r.test(regle(s))).map(([s]) => s);
  check('les cibles de toucher gardent leur taille (44 points au moins)', petites.length === 0 && /#btn-armee\s*\{\s*min-height:\s*44px/.test(css), petites.join(', '));
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
