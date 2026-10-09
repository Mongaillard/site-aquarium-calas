// La langue de l'écran de jeu (js/ui.js, cahier js/langues/en/ecran.js) : le
// cahier couvre tout ce que le fichier affiche ; en français, les phrases
// regroupées pour être traduisibles se lisent comme avant, à la lettre ; en
// anglais, les mêmes écrans se lisent en anglais, sans phrase restée en route.
// La langue se lit au chargement des modules : ce fichier se relance lui-même,
// marqué `--anglais`, pour jouer les mêmes scènes dans un processus à part.
// Lancement : node test/langues-ecran.test.js

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EN_ANGLAIS = process.argv.includes('--anglais');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

if (EN_ANGLAIS) {
  globalThis.__LANGUE = 'en';
  // Tant que le cahier n'est pas assemblé dans js/langues/en.js, on y verse ici
  // ce qui manque (le dictionnaire est le même objet que celui de js/langue.js).
  const assemble = (await import('../js/langues/en.js')).default;
  const cahier = (await import('../js/langues/en/ecran.js')).default;
  for (const [cle, valeur] of Object.entries(cahier)) if (!Object.prototype.hasOwnProperty.call(assemble, cle)) assemble[cle] = valeur;
}
const { LANGUE, SANS_TRADUCTION } = await import('../js/langue.js');
const { World } = await import('../js/game.js');
const { AGES, TILE, nomDe } = await import('../js/config.js');
const { UI, texteDeConsigne } = await import('../js/ui.js');
const { clesDuCode, verifierCahier } = await import('../outils/langues.mjs');

// --- Les scènes : ce que la vraie interface écrit, sur de faux nœuds ------------------------------

/** Un faux nœud : il retient ce qu'on lui écrit, et rend un autre faux nœud à chaque recherche. */
function noeud() {
  const trouves = new Map();
  return {
    innerHTML: '', textContent: '', dataset: {}, disabled: false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelector(s) { if (!trouves.has(s)) trouves.set(s, noeud()); return trouves.get(s); },
    querySelectorAll: () => [],
    insertAdjacentHTML(_ou, html) { this.innerHTML += html; },
    addEventListener() {},
  };
}
/** Un monde sans adversaire qui joue. */
function monde(options) {
  const w = new World({ difficulty: 'normal', seed: 91, mapSize: 'small', ...options });
  w.ais = [];
  w.drainEvents();
  return w;
}
const centre = (w, i = 0) => w.buildings.find((b) => !b.dead && b.playerIndex === i && b.type === 'towncenter');
function batir(w, joueur, type, rang, fini = true) {
  const depart = w.map.startPositions[joueur];
  return w.spawnBuilding(joueur, type, depart.tx + 4 + rang * 4, depart.ty + 5, fini);
}
/** La vraie interface, réduite à ce que ses rendus consultent. */
function interfaceDe(w, partie = {}) {
  const faux = Object.create(UI.prototype);
  const civ = w.players[w.humanIndex].civ;
  faux.world = w;
  faux.game = new Proxy({
    civ, selection: [], paused: false, audio: { play() {} },
    attackMoveArmed: false, garrisonArmed: false, rallyArmed: false,
    ouvrier: (n = 1) => nomDe('villager', civ, n).toLowerCase(),
    demolitionEnAttente: () => false, hasSpareWorker: () => false,
    speedId: 'normal', styleUnites: () => '3d', finesse: 'fine', musique: { voulue: true },
    renderer: { dpr: 2, dprForce: false, cadence: null },
    mesures: () => ({ ips: 58.6, mo: 123.4, troupes: 3, dpr: 2, incidents: [] }),
    workerStats: () => ({}), constructionSites: () => [], allieOrdinateur: () => ({}),
    ...partie,
  }, { get: (o, k) => (k in o ? o[k] : (typeof k === 'symbol' ? undefined : () => {})) });
  faux.nodes = { selection: noeud(), commands: noeud(), workerList: noeud(), lacher: noeud(), bottombar: noeud() };
  faux.fenetre = '';
  faux.showModal = (html) => { faux.fenetre = html; return noeud(); };
  faux.hideModal = () => {};
  return faux;
}
/** Le texte d'un morceau de HTML : sans balises, espaces ramassés. */
const texte = (html) => String(html).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function scenes() {
  const s = {};
  // Les consignes à l'allié.
  const ia = (n, chezLui = false) => ({ attaqueChezLui: chezLui, disponibles: () => Array(n).fill(0) });
  s.consignes = [texteDeConsigne(null, 'attaquer'), texteDeConsigne(ia(3, true), 'attaquer'), texteDeConsigne(ia(0), 'defendre'), texteDeConsigne(ia(1), 'defendre'), texteDeConsigne(ia(4), 'attaquer')];

  // Une partie Express, Atlantes contre Solariens.
  const w = monde({ mode: 'express', civs: ['atlante', 'solarien'] });
  w.players[0].age = AGES.length - 1;
  const faux = interfaceDe(w);

  // Le panneau des ouvriers : ses lignes, puis ce qui bouge.
  s.ouvriers = [[0, {}], [1, { move: 2 }], [3, { move: 1, abri: 5 }]].map(([chantiers, postes]) => {
    const f = interfaceDe(w, { workerStats: () => postes, constructionSites: () => Array(chantiers).fill(0) });
    f.renderWorkerRows(true);
    return { noms: texte(f.nodes.workerList.innerHTML), chantiers: f.workerRows.build.hint.textContent, enRoute: f.workerMoving.textContent };
  });

  // Le panneau de sélection et les commandes.
  const panneau = (entites) => { faux.nodes.selection = noeud(); faux.renderSelectionPanel(entites); return texte(faux.nodes.selection.innerHTML); };
  const commandes = (entites) => { faux.renderCommands(entites); return faux.commandButtons.map((b) => [b.label, b.check ? b.check().reason || '' : '']); };
  faux.selectionSignature = 'autre';
  faux.refreshSelection(true);
  s.rienEnMain = texte(faux.nodes.selection.innerHTML);
  const chantier = batir(w, 0, 'barracks', 0, false);
  chantier.buildProgress = chantier.def.buildTime * 0.37;
  s.chantier = panneau([chantier]);
  s.commandesDuChantier = commandes([chantier]);
  const dAvant = w.buildersOn;
  w.buildersOn = () => 3;
  s.chantierServi = panneau([chantier]);
  w.buildersOn = dAvant;
  const depart = w.map.startPositions[0];
  s.cochon = panneau([w.spawnAnimal('pig', depart.tx * TILE + 200, depart.ty * TILE + 200)]);
  s.ennemi = panneau([w.units.find((u) => u.playerIndex === 1 && u.isVillager)]);
  s.plusieurs = panneau(w.units.filter((u) => u.playerIndex === 0 && u.isVillager));
  s.commandesDuCentre = commandes([centre(w, 0)]);
  const caserne = batir(w, 0, 'barracks', 1);
  w.players[0].interdites = new Set(['spearman']);
  s.cadenas = commandes([caserne]).find(([, raison]) => raison)[1];
  w.players[0].interdites = new Set();

  // Pourquoi on ne peut pas construire.
  const { BUILDING_TYPES } = configuration;
  w.players[0].resources = { food: 0, wood: 0, gold: 0 };
  s.tropCher = faux.raisonConstruction(BUILDING_TYPES.house);
  w.players[0].resources = { food: 9999, wood: 9999, gold: 9999 };
  s.sansMoulin = faux.raisonConstruction(BUILDING_TYPES.farm);

  // Le menu de pause : la finesse affichée, les mesures, la fenêtre.
  globalThis.window = { devicePixelRatio: 3 };
  try {
    const finesse = (dpr, plus = {}) => { Object.assign(faux.game, { finesse: 'fine', ...plus, renderer: { dpr, dprForce: false, cadence: null, ...(plus.renderer || {}) } }); return faux.texteFinesse(); };
    s.finesse = [finesse(3), finesse(2.63), finesse(1.5, { finesse: 'legere' }), finesse(1, { renderer: { dprForce: true } }), finesse(2, { renderer: { cadence: { fige: true } } })];
    s.mesures = faux.texteMesures();
    const h = new Date(2026, 8, 30, 14, 5).getTime();
    faux.game.mesures = () => ({ ips: 0, mo: 80, troupes: 1, dpr: 1.5, incidents: [{ h, genre: 'coupee', min: 3, mo: 9, unites: 2 }, { h, genre: 'rechargee', min: 5, mo: 99, unites: 12 }] });
    s.mesuresApresIncident = faux.texteMesures();
    faux.showPause();
    s.pause = texte(faux.fenetre);
  } finally { delete globalThis.window; }

  // L'aide, les consignes, les crédits.
  faux.showHelp();
  s.aide = texte(faux.fenetre);
  faux.showConsignes();
  s.fenetreDesConsignes = texte(faux.fenetre);
  faux.showCredits();
  s.credits = texte(faux.fenetre);
  s.creditsBruts = faux.fenetre;

  // La fin de partie.
  const palmares = { ligne: { victoires: 2, defaites: 1 }, temps: null, score: { record: true, valeur: 3990, ancien: 1250 } };
  const detail = [{ recolte: 1500, debout: 2100, abattu: 390, total: 3990 }, { recolte: 1200, debout: 2400, abattu: 360, total: 3960 }];
  faux.showGameOver({ winner: 0, victory: true, timeUp: true, time: 600, scores: [3990, 3960], detail }, palmares);
  s.fin = texte(faux.fenetre);
  s.raisons = [
    faux.raisonDeFin({ winner: 0, victory: true, time: 505 }), faux.raisonDeFin({ winner: 1, victory: false, time: 505 }),
    faux.raisonDeFin({ winner: 1, victory: false, resigned: true, time: 300 }), faux.raisonDeFin({ winner: -1, victory: false, time: 600 }),
  ];
  const classique = interfaceDe(monde({ mode: 'classique', civs: ['atlante', 'solarien'] }));
  s.raisonsEnClassique = [classique.raisonDeFin({ winner: 0, victory: true, time: 1025 }), classique.raisonDeFin({ winner: 1, victory: false, time: 1025 })];
  const positions = interfaceDe(monde({ mode: 'positions' }));
  s.raisonsEnPositions = [positions.raisonDeFin({ winner: 0, victory: true, positions: true, time: 512 }), positions.raisonDeFin({ winner: 1, victory: false, timeUp: true, time: 900 })];
  positions.showHelp();
  s.aideDesPositions = texte(positions.fenetre);
  const equipes = monde({ mode: 'deux', civs: ['atlante', 'solarien', 'solarien', 'atlante'] });
  const deux = interfaceDe(equipes);
  s.raisonsParEquipes = [deux.raisonDeFin({ winner: 0, victory: true, time: 754 }), deux.raisonDeFin({ winner: 1, victory: false, timeUp: true, time: 1200 })];
  equipes.players[3].defeated = true;
  deux.showGameOver({ winner: 0, victory: true, timeUp: true, time: 1200, scores: [900, 800, 700, 600], scoresEquipes: [1700, 1300] }, { ligne: { victoires: 1, defaites: 0 }, temps: null, score: null });
  s.finParEquipes = texte(deux.fenetre);

  // Ce que js/ui.js a demandé à la langue sans obtenir de traduction.
  const miennes = new Set(clesDuCode(lire('js/ui.js')));
  s.sansTraduction = [...SANS_TRADUCTION].filter((cle) => miennes.has(cle));
  s.langue = LANGUE;
  return s;
}
const configuration = await import('../js/config.js');

if (EN_ANGLAIS) {
  // (On attend que tout soit écrit avant de sortir : le tuyau ne prend pas tout d'un coup.)
  await new Promise((fin) => process.stdout.write(JSON.stringify(scenes()), fin));
  process.exit(0);
}

// --- Les essais ---------------------------------------------------------------------------------------

let failures = 0;
/** (Le détail — souvent un écran entier — ne s'affiche que si l'essai échoue.) */
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${!condition && detail ? ' — ' + detail : ''}`);
}
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('--- Le cahier ---');
{
  const r = await verifierCahier('en', 'ecran', ['js/ui.js']);
  // (Une phrase que l'assemblage aura confiée à un autre cahier ne manque pas : le dictionnaire entier la porte.)
  const assemble = (await import('../js/langues/en.js')).default;
  const manquantes = r.manquantes.filter((cle) => !Object.prototype.hasOwnProperty.call(assemble, cle));
  check(`le cahier « ecran » couvre js/ui.js : ${r.cles} textes, rien ne manque`, r.cles >= 170 && manquantes.length === 0, manquantes.slice(0, 3).join(' | '));
  check('… rien en trop, rien de fautif (trou inventé, balises différentes, accord sans « other »)', r.enTrop.length === 0 && r.fautives.length === 0,
    [...r.enTrop, ...r.fautives.map(([cle]) => cle)].slice(0, 3).join(' | '));
  const cahier = (await import('../js/langues/en/ecran.js')).default;
  const { CAHIERS } = await import('../js/langues/en.js');
  const autrement = Object.entries(CAHIERS).filter(([nom]) => nom !== 'ecran')
    .flatMap(([nom, autre]) => Object.keys(cahier).filter((cle) => Object.prototype.hasOwnProperty.call(autre, cle) && !egal(autre[cle], cahier[cle])).map((cle) => `${nom} : ${cle}`));
  check('une phrase qu’un autre cahier porte aussi y a la même traduction', autrement.length === 0, autrement.slice(0, 3).join(' | '));
  const ponctuation = Object.entries(cahier).filter(([, v]) => typeof v === 'string' && (/\s[:;?!%]/.test(v) || /[«»]/.test(v)));
  check('l’anglais du cahier a sa ponctuation : pas d’espace avant « : ; ? ! % », pas de guillemets français', ponctuation.length === 0, ponctuation.slice(0, 2).map(([cle]) => cle).join(' | '));
  const ui = lire('js/ui.js');
  check('js/ui.js ne porte plus de format de nombre ni de date écrit en dur', !/'fr-FR'/.test(ui) && /toLocaleString\(LOCALE/.test(ui) && !/replace\('\.', ','\)/.test(ui));
  check('… et chaque ligne de l’aide et des crédits est une phrase entière confiée à la langue', !/<li>(?!\$\{txt`)/.test(ui) && (ui.match(/<li>\$\{txt`/g) || []).length >= 27);
}

console.log('\n--- En français, rien ne bouge ---');
{
  const f = scenes();
  check('sans rien demander, les scènes se jouent en français', f.langue === 'fr' && f.sansTraduction.length === 0);
  check('les consignes à l’allié : hors de combat, attaqué chez lui, sans soldat, un soldat, plusieurs', egal(f.consignes, [
    'Votre allié est hors de combat', 'Votre allié est attaqué chez lui : il repousse d’abord l’ennemi',
    'Votre allié n’a aucun soldat au camp : il attend d’en avoir, 2 minutes au plus', 'Votre allié envoie 1 soldat vous défendre', 'Votre allié envoie 4 soldats à l’attaque']), f.consignes.join(' | '));
  check('le panneau des ouvriers : les postes, les chantiers ouverts accordés, ceux qui marchent et ceux à l’abri',
    f.ouvriers[0].noms.startsWith('Nourriture buissons et fermes − 0 + Bois forêts − 0 + Or filons − 0 + Chantiers aucun chantier ouvert − 0 + Sans affectation en attente d’ordres 0')
    && egal(f.ouvriers.map((o) => [o.chantiers, o.enRoute]), [['aucun chantier ouvert', ''], ['1 chantier ouvert', '2 en déplacement'], ['3 chantiers ouverts', '1 en déplacement · 5 à l’abri']]),
    JSON.stringify(f.ouvriers.map((o) => [o.chantiers, o.enRoute])));
  check('le panneau de sélection : rien en main, un chantier sans ouvrier puis servi, une bête, un ennemi, plusieurs unités',
    f.rienEnMain === 'Touchez une unité pour la sélectionner · appui long pour un rectangle'
    && f.chantier.endsWith('37 % · aucun ouvrier — touchez le chantier avec des villageois') && f.chantierServi.endsWith('37 % · 3 ouvriers')
    && f.cochon.startsWith('Cochon (sauvage)') && f.cochon.endsWith('100 de nourriture · sauvage — approchez un villageois')
    && f.ennemi.startsWith('Fellah (ennemi)') && /^\d+ unités sélectionnées/.test(f.plusieurs), [f.chantier, f.chantierServi, f.cochon, f.ennemi, f.plusieurs].join(' | '));
  check('les commandes : un chantier, le bâtiment principal, une troupe sous cadenas',
    egal(f.commandesDuChantier, [['+1 ouvrier', 'Aucun villageois disponible'], ['Annuler', '']])
    && ['Cloche', 'Libérer (0)', 'Ralliement', 'Détruire'].every((l) => f.commandesDuCentre.some(([label]) => label === l))
    && f.commandesDuCentre.some(([label, raison]) => label === 'Libérer (0)' && raison === 'Personne à l’intérieur')
    && f.cadenas === 'Lancier : troupe à débloquer — vois « Troupes » à l’accueil', JSON.stringify([f.commandesDuChantier, f.cadenas]));
  check('le menu Construire dit pourquoi on ne peut pas', f.tropCher === 'Ressources insuffisantes' && f.sansMoulin === 'Nécessite : Moulin', `${f.tropCher} | ${f.sansMoulin}`);
  check('la finesse affichée : pleine, réduite sans cause, par le réglage, par l’adresse, par le garde-fou — une phrase entière chaque fois', egal(f.finesse, [
    'Affichée : 3 pixels par point, toute la finesse de cet écran.',
    'Affichée : 2,63 pixels par point au lieu de 3.',
    'Affichée : 1,5 pixel par point au lieu de 3 — c’est ton réglage « Légère ».',
    'Affichée : 1 pixel par point au lieu de 3 — imposée par « ?dpr= » dans l’adresse.',
    'Affichée : 2 pixels par point au lieu de 3 — réduite automatiquement, le jeu ralentissait.']), f.finesse.join(' | '));
  check('les mesures : la cadence, le poids des images, la finesse — puis la dernière coupure',
    f.mesures === 'Mesures : 59 images par seconde · 123 Mo d’images de troupes (3 troupes en mémoire) · 2 pixels par point.'
    && f.mesuresApresIncident.startsWith('Mesures : cadence pas encore mesurée · 80 Mo d’images de troupes (1 troupe en mémoire) · 1,5 pixel par point. Dernier rechargement en pleine partie : le 30 sept.')
    && /14:05, après 5 min — 99 Mo d’images, 12 unités \(2 incidents en tout\)\.$/.test(f.mesuresApresIncident), f.mesuresApresIncident);
  check('le menu de pause', /^Partie en pause La partie est sauvegardée : vous pouvez fermer l'onglet et la reprendre plus tard\. Vitesse de jeu /.test(f.pause)
    && f.pause.includes('Finesse de l’image Fine Tous les pixels de l’écran Légère Si le jeu rame ou chauffe')
    && f.pause.includes('Musique Oui Elle change quand un combat commence Non Les bruitages seuls')
    && f.pause.endsWith('Reprendre Comment jouer Crédits Confidentialité Abandonner'));
  check('l’aide nomme les ouvriers et les bâtiments de chaque peuple, et la règle du format',
    f.aide.startsWith('Comment jouer Glisser : déplacer la vue · pincer : zoomer') && f.aide.includes('Les villageois récoltent nourriture, bois et or ; il faut des maisons pour agrandir la population')
    && f.aide.includes('ni Palais du Soleil ni bâtiment militaire (Cour des Gardes, Champ de tir, Enclos des montures, Atelier des engins, Temple du Soleil), achevé ou en chantier')
    && f.aide.includes('Passez les âges depuis le Centre-Ville') && f.aide.endsWith('le vôtre, puis celui de l\'adversaire J\'ai compris')
    && f.aideDesPositions.includes('Positions : 3 monuments sur la ligne du milieu') && f.aideDesPositions.includes('rapporte 1 point toutes les 5 secondes ; le premier à 200 points gagne'));
  check('la fenêtre des consignes', f.fenetreDesConsignes === 'Votre allié Il joue seul. Une consigne lui dit quoi faire de ses soldats, une fois ; ensuite il reprend sa conduite. '
    + 'Attaque ici Touchez ensuite l\'endroit sur la carte : ses soldats y marchent. Défends-moi Ses soldats viennent tenir votre Centre-Ville 3 minutes. À toi de voir Il rappelle ses soldats et fait comme il l\'entend. Fermer', f.fenetreDesConsignes);
  check('les crédits : les mêmes liens, les mêmes phrases',
    f.creditsBruts.includes('<li><b>Icônes</b> — <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a>,\n          sous licence <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>.\n          <small class="credits-auteurs">Lorc · ')
    && f.creditsBruts.includes('cuits par\n          <a href="https://threejs.org" target="_blank" rel="noopener">three.js</a> (licence MIT).</li>')
    && (f.creditsBruts.match(/<a href="[^"]+" target="_blank" rel="noopener">/g) || []).length === 8
    && f.credits.includes('Musique — « Minstrel Dance » et « Harvest Season » de RandomMind, « Determined Pursuit » d\'Emma_MA, publiés sur OpenGameArt , domaine public (CC0).')
    && f.credits.endsWith('Jeu — inspiré des classiques de la stratégie en temps réel, sans en reprendre aucun contenu. Fermer'));
  check('ce qui a tranché : le bâtiment principal tombé (l’article et l’accord sont dans la phrase), l’abandon, l’égalité, la conquête, les positions, les équipes',
    egal(f.raisons, ['Le Palais du Soleil adverse est tombé en 8:25', 'Votre Centre-Ville est tombé — durée de la partie : 8:25', 'Vous avez abandonné après 5:00', 'Durée de la partie : 10:00'])
    && egal(f.raisonsEnClassique, ['L’adversaire n’a plus ni Palais du Soleil ni bâtiment militaire — durée de la partie : 17:05', 'Vous n’avez plus ni Centre-Ville ni bâtiment militaire — durée de la partie : 17:05'])
    && egal(f.raisonsEnPositions, ['Vous tenez les positions : 200 points atteints en 8:32', 'Temps écoulé après 15:00 — les points des positions départagent'])
    && egal(f.raisonsParEquipes, ['Les deux bâtiments principaux adverses sont tombés en 12:34', 'Temps écoulé après 20:00 — la somme des scores de chaque équipe départage']),
    [...f.raisons, ...f.raisonsEnClassique, ...f.raisonsEnPositions, ...f.raisonsParEquipes].join(' | '));
  const sansEspaces = (t) => t.replace(/[  ]/g, ' ');
  check('l’écran de fin : le titre, la raison, le record, le compte des parties, le tableau, la règle du score',
    sansEspaces(f.fin).startsWith('Victoire ! Temps écoulé après 10:00 — le score départage Nouveau record ! 3 990 points — le précédent était de 1 250 Express · Normal : 2 victoires, 1 défaite Vous Adversaire Ressources récoltées ')
    && sansEspaces(f.fin).includes('Points de récolte 1 500 1 200 Troupes et bâtiments debout 2 100 2 400 Ennemis abattus 390 360 Score final 3 990 3 960 Score : la moitié des ressources récoltées')
    && f.fin.endsWith('Nouvelle partie Menu principal'), f.fin.slice(0, 200));
  check('… par équipes : une colonne par place, l’adversaire abrégé, la somme de chaque bord',
    sansEspaces(f.finParEquipes).includes('2 contre 2 · Normal : 1 victoire, 0 défaite Vous Allié Adv. 1 Adv. 2 Bâtiment principal debout debout debout tombé Unités formées')
    && sansEspaces(f.finParEquipes).includes('Score 900 800 700 600 Par équipe 1 700 1 300 Au bout du temps, la somme des scores de chaque équipe départage.'), f.finParEquipes.slice(0, 260));
}

console.log('\n--- En anglais, les mêmes écrans ---');
{
  const a = JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--anglais'], { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26 }));
  check('marquées « en », les scènes se jouent en anglais, et aucune phrase de js/ui.js ne reste sans traduction', a.langue === 'en' && a.sansTraduction.length === 0, a.sansTraduction.slice(0, 3).join(' | '));
  check('les consignes à l’allié, accordées au nombre de soldats', egal(a.consignes, [
    'Your ally is out of the fight', 'Your ally is under attack at home and is pushing the enemy back first',
    'Your ally has no soldiers in camp: waiting for some, 2 minutes at most', 'Your ally is sending 1 soldier to defend you', 'Your ally is sending 4 soldiers to attack']), a.consignes.join(' | '));
  check('le panneau des ouvriers', a.ouvriers[0].noms.includes('Construction sites no site open') && a.ouvriers[0].noms.includes('Unassigned awaiting orders')
    && egal(a.ouvriers.map((o) => [o.chantiers, o.enRoute]), [['no site open', ''], ['1 site open', '2 on the move'], ['3 sites open', '1 on the move · 5 sheltered']]),
    JSON.stringify(a.ouvriers.map((o) => [o.chantiers, o.enRoute])));
  check('le panneau de sélection : le pourcentage à l’anglaise, les ouvriers accordés, la bête, l’ennemi',
    a.rienEnMain === 'Tap a unit to select it · long press for a box'
    && a.chantier.endsWith('37% · no worker — select villagers and tap the site') && a.chantierServi.endsWith('37% · 3 workers')
    && a.cochon.startsWith('Pig (wild)') && a.cochon.endsWith('100 food · wild — bring a villager close')
    && a.ennemi.startsWith('Fellah (enemy)') && /^\d+ units selected/.test(a.plusieurs), [a.chantier, a.chantierServi, a.cochon, a.ennemi, a.plusieurs].join(' | '));
  check('les commandes et leurs refus', egal(a.commandesDuChantier.map(([label, raison]) => [label, raison]).slice(0, 1), [['+1 worker', 'No villager available']])
    && ['Bell', 'Release (0)', 'Rally point'].every((l) => a.commandesDuCentre.some(([label]) => label === l))
    && a.commandesDuCentre.some(([label, raison]) => label === 'Release (0)' && raison === 'Nobody inside')
    && a.cadenas === 'Spearman: troop to unlock — see “Troops” on the home screen'
    && a.tropCher === 'Not enough resources' && a.sansMoulin === 'Requires: Mill', JSON.stringify([a.commandesDuChantier, a.cadenas, a.tropCher, a.sansMoulin]));
  check('la finesse et les mesures : les nombres à l’anglaise (2.63), la date à l’anglaise', egal(a.finesse, [
    'Displayed: 3 px per point, the full sharpness of this screen.',
    'Displayed: 2.63 px per point instead of 3.',
    'Displayed: 1.5 px per point instead of 3 — that’s your “Light” setting.',
    'Displayed: 1 px per point instead of 3 — forced by “?dpr=” in the address.',
    'Displayed: 2 px per point instead of 3 — lowered automatically, the game was slowing down.'])
    && a.mesures === 'Stats: 59 frames per second · 123 MB of troop images (3 troops in memory) · 2 px per point.'
    && /^Stats: frame rate not measured yet · 80 MB of troop images \(1 troop in memory\) · 1\.5 px per point\. Last reload in mid-game: Sep 30.*02:05\sPM, .* \(2 incidents in all\)\.$/.test(a.mesuresApresIncident),
    [...a.finesse, a.mesures, a.mesuresApresIncident].join(' | '));
  check('le menu de pause', a.pause.startsWith('Game paused The game is saved: you can close the tab and pick it up later.')
    && a.pause.includes('Image sharpness Sharp Every pixel of the screen Light If the game lags or runs hot')
    && a.pause.includes('It changes when a fight starts') && a.pause.includes('Sound effects only') && a.pause.includes('How to play'), a.pause.slice(0, 160));
  // (Des mots que seul le français emploie : il n'en reste pas un dans ces écrans.)
  const francais = /(?:^|[\s(«])(vous|votre|vos|les|des|une|est|sur|pour|avec|dans|qui|puis|ou|et)(?=[\s,.;:)»]|$)/i;
  const restes = [a.aide, a.aideDesPositions, a.fenetreDesConsignes, a.credits, a.fin, ...a.raisons, ...a.raisonsEnClassique, ...a.raisonsEnPositions, ...a.raisonsParEquipes].map((t) => (t.match(francais) || [])[0]).filter(Boolean);
  check('l’aide, les consignes, les crédits et la fin de partie : plus un mot de français', restes.length === 0, restes.join(' | '));
  check('l’aide nomme les ouvriers et les bâtiments du peuple, en anglais', a.aide.startsWith('How to play Drag : move the view · pinch : zoom')
    && a.aide.includes('Your villagers gather food, wood and gold; you need houses to raise the population')
    && a.aide.includes('neither a Palace of the Sun nor a military building (Guards’ Courtyard, Shooting Range, Mount Pen, Engine Workshop, Temple of the Sun), finished or under construction')
    && a.aide.includes('Advance through the ages from the Town Center') && a.aide.endsWith('Got it')
    && a.aideDesPositions.includes('Capture points : 3 monuments on the middle line') && a.aideDesPositions.includes('earns 1 point every 5 seconds ; the first to 200 points wins'), a.aide.slice(0, 120));
  check('la fenêtre des consignes', a.fenetreDesConsignes.startsWith('Your ally Your ally plays on its own.') && a.fenetreDesConsignes.includes('Defend me Its soldiers come and hold your Town Center for 3 minutes.')
    && a.fenetreDesConsignes.includes('Your call'), a.fenetreDesConsignes);
  check('les crédits : les mêmes liens qu’en français, les licences nommées',
    (a.creditsBruts.match(/<a href="[^"]+" target="_blank" rel="noopener">/g) || []).length === 8
    && ['https://game-icons.net', 'https://creativecommons.org/licenses/by/3.0/', 'https://threejs.org', 'https://www.kaylousberg.com', 'https://kenney.nl', 'https://opengameart.org', 'https://openfontlicense.org'].every((adresse) => a.creditsBruts.includes(`<a href="${adresse}"`))
    && a.credits.startsWith('Credits Icons — game-icons.net , under the CC BY 3.0 license. Lorc · ')
    && a.credits.includes('Music — “Minstrel Dance” and “Harvest Season” by RandomMind, “Determined Pursuit” by Emma_MA, published on OpenGameArt , public domain (CC0).')
    && a.credits.includes('baked by three.js (MIT license).') && a.credits.includes('under the SIL Open Font License 1.1 .'), a.credits.slice(0, 120));
  check('ce qui a tranché, en anglais : la phrase laisse de côté l’article et l’accord français',
    egal(a.raisons, ['The enemy Palace of the Sun fell in 8:25', 'Your Town Center fell — game length: 8:25', 'You resigned after 5:00', 'Game length: 10:00'])
    && egal(a.raisonsEnClassique, ['The opponent has neither a Palace of the Sun nor a military building left — game length: 17:05', 'You have neither a Town Center nor a military building left — game length: 17:05'])
    && egal(a.raisonsEnPositions, ['You hold the capture points: 200 points reached in 8:32', 'Time’s up after 15:00 — the capture point scores decide'])
    && egal(a.raisonsParEquipes, ['Both enemy main buildings fell in 12:34', 'Time’s up after 20:00 — each team’s total score decides']),
    [...a.raisons, ...a.raisonsEnClassique, ...a.raisonsEnPositions, ...a.raisonsParEquipes].join(' | '));
  check('l’écran de fin : les nombres à l’anglaise (3,990), les victoires et les défaites accordées',
    a.fin.startsWith('Victory! Time’s up after 10:00 — the score decides New record! 3,990 points — the previous one was 1,250 Express · Normal: 2 wins, 1 loss You Opponent Resources gathered ')
    && a.fin.includes('Gathering points 1,500 1,200 Troops and buildings standing 2,100 2,400 Enemies taken down 390 360 Final score 3,990 3,960 Score: half the resources gathered')
    && a.fin.includes('New game'), a.fin.slice(0, 200));
  check('… par équipes : les lignes du tableau et la somme de chaque bord',
    a.finParEquipes.includes('2 vs 2 · Normal: 1 win, 0 losses You ') && a.finParEquipes.includes('Main building standing standing standing fallen Units trained')
    && a.finParEquipes.includes('Per team 1,700 1,300 When time runs out, each team’s total score decides.'), a.finParEquipes.slice(0, 260));
}

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
