// Le jeu en espagnol (js/langues/es.js et ses sept cahiers js/langues/es/*.js) :
// les cahiers couvrent tout ce que le jeu écrit, sans trou inventé ni balise
// changée ; les accents, les ¿ ¡ et les guillemets sont ceux de l'espagnol ;
// et une demi-douzaine d'écrans et de messages se lisent en espagnol, dans un
// Node à part marqué `--espagnol` (la langue se lit au chargement des modules) :
// les tables et le résumé des réglages, une fiche de troupe pour chaque peuple,
// la fin d'une partie, les ligues, les coffres, la boutique, l'album, une
// collection, la saison, ce que la simulation dit au joueur.
// Lancement : node test/langues-es.test.js
// (Pas inscrit dans package.json : à ajouter à « test » quand l'espagnol sera proposé d'office.)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ICI = fileURLToPath(import.meta.url);
const RACINE = path.join(path.dirname(ICI), '..');
const ESPAGNOL = process.argv.includes('--espagnol');
// (Avant tout chargement : la langue est lue une fois, quand js/langue.js se charge.)
if (ESPAGNOL) globalThis.__LANGUE = 'es';

const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Le texte d'un morceau de HTML : sans pictogrammes ni balises, espaces ramassés. */
const texte = (html) => String(html).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// ===== Le processus espagnol : les scènes ======================================================

async function scenes() {
  const L = await import('../js/langue.js');
  const C = await import('../js/config.js');
  const { World } = await import('../js/game.js');
  const { UI, texteDeConsigne, resumeReglages } = await import('../js/ui.js');
  const F = await import('../js/fiches-troupes.js');
  const S = await import('../js/save.js');
  const P = await import('../js/progression.js');
  const X = await import('../js/progression-ecrans.js');
  const K = await import('../js/collections-config.js');
  const B = await import('../js/blason.js');
  const CE = await import('../js/collections-ecrans.js');
  const ED = await import('../js/edition.js');
  const { TILE, nomDe } = C;
  const m = { langue: L.LANGUE, titre: ED.nomComplet() };

  // 1. Les tables du jeu, les noms qui se comptent, le résumé des réglages, des phrases à trous.
  m.tables = [C.UNIT_TYPES.militia.name, C.BUILDING_TYPES.barracks.name, C.BUILDING_TYPES.towncenter.name, C.GAME_MODES.escarmouche.name, C.GAME_MODES.positions.name,
    C.DIFFICULTIES.hard.name, C.RESOURCE_LABELS.gold, C.CIVILISATIONS.solarien.noms.knight.name, C.CIVILISATIONS.solarien.name, C.AGES[2].name, C.STANCES.standGround.name];
  m.pluriels = [nomDe('militia', 'atlante', 3), nomDe('horseArcher', 'atlante', 2), nomDe('villager', 'solarien', 2), nomDe('triton', 'solarien', 2), nomDe('hydra', 'solarien', 2), nomDe('knight', 'solarien', 3), nomDe('priest', 'solarien', 1), nomDe('deer', 'atlante', 2)];
  m.resume = resumeReglages({ civAdverse: 'solarien', mode: 'express', difficulty: 'normal', mapSize: 'medium', speed: 'normal' }).replace(/ /g, ' ');
  m.phrases = [L.txt('Jouer'), L.txt`Classée · ${'x'}`, L.txt`${'A'} contre ${'B'}`, L.txt`carte ${'grande'}`, L.accord(1, 'Couronne'), L.accord(2, 'Couronne'), L.accord(1, 'soldat'), L.accord(3, 'soldat'),
    L.accord(1, 'Prêtresse', 'Prêtresses'), L.accord(1, 'Cerf', 'Cerfs'), L.nombreLocal(1200)];

  // 2. Une fiche de troupe pour chaque peuple.
  m.fiches = {};
  for (const [civ, type] of [['atlante', 'priest'], ['solarien', 'ram'], ['solarien', 'hydra'], ['atlante', 'hydra'], ['solarien', 'champion']]) m.fiches[`${civ}.${type}`] = F.ficheDeTroupe(type, civ);
  m.rubriques = F.RUBRIQUES;

  // 3. L'écran de jeu : la consigne à l'allié, la fin d'une partie.
  const monde = (o = {}) => { const w = new World({ difficulty: 'normal', seed: 91, mapSize: 'small', ...o }); w.ais = []; w.drainEvents(); return w; };
  const ui = (w) => Object.assign(Object.create(UI.prototype), { world: w });
  const ia = (n, chezLui = false) => ({ attaqueChezLui: chezLui, disponibles: () => Array(n).fill(0) });
  m.consignes = [texteDeConsigne(null, 'attaquer'), texteDeConsigne(ia(3, true), 'attaquer'), texteDeConsigne(ia(1), 'defendre'), texteDeConsigne(ia(4), 'attaquer')];
  const express = ui(monde({ mode: 'express', civs: ['atlante', 'solarien'] }));
  const classique = ui(monde({ mode: 'classique', civs: ['solarien', 'atlante'] }));
  m.fin = [express.raisonDeFin({ winner: 0, victory: true, time: 505 }), express.raisonDeFin({ winner: 1, victory: false, time: 505 }), express.raisonDeFin({ winner: 1, victory: false, resigned: true, time: 300 }),
    classique.raisonDeFin({ winner: 0, victory: true, time: 1025 }), classique.raisonDeFin({ winner: 1, victory: false, time: 1025 })];

  // 4. Ce que la simulation dit au joueur, le palmarès, les incidents.
  {
    const w = monde({ seed: 91, mode: 'classique', mapSize: 'medium', difficulty: 'easy', civs: ['atlante', 'solarien'] });
    const tc = w.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter'), d = w.map.startPositions[0];
    w.players[0].resources = { food: 9999, wood: 9999, gold: 9999 };
    m.refus = [w.canAdvanceAge(tc).reason];
    w.spawnBuilding(0, 'barracks', d.tx + 4, d.ty + 5, false);
    m.refus.push(w.canAdvanceAge(tc).reason);
    w.players[0].resources = { food: 0, wood: 0, gold: 0 };
    m.refus.push(w.canTrain(tc, 'villager').reason, w.canResearch(tc, 'inconnue').reason);
    w.drainEvents();
    w.notifyPopBlocked(0);
    w.placeBuilding(0, 'house', -5, -5);
    w.onAnimalCaptured(w.spawnAnimal('pig', tc.x, tc.y + TILE * 4, 0));
    m.avis = w.drainEvents().filter((e) => e.type === 'notice').map((e) => e.text);
    const s = monde({ civs: ['solarien', 'atlante'], mode: 'classique' }), ds = s.map.startPositions[0];
    s.spawnBuilding(0, 'barracks', ds.tx + 4, ds.ty + 5, true);
    s.drainEvents();
    s.killEntity(s.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter'), null);
    m.centrePerdu = s.drainEvents().filter((e) => e.type === 'notice').map((e) => e.text);
  }
  m.palmares = [S.resumePalmares({ victoires: 3, defaites: 1, temps: 1122, score: 12500 }), S.resumePalmares({ victoires: 1, defaites: 0, temps: null, score: 0 })].map((t) => t.replace(/\s/g, ' '));
  m.incident = S.phraseIncident({ genre: 'rechargee', min: 12.4, mo: 180, unites: 64 });

  // 5. La progression et les collections : un faux écran, un faux stockage, une date fixe (le 9 octobre 2026 : saison 1).
  {
    const VraieDate = Date, midi = new VraieDate(2026, 9, 9, 12).getTime();
    globalThis.Date = class extends VraieDate { constructor(...a) { super(...(a.length ? a : [midi])); } static now() { return midi; } };
    const memoire = new Map();
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); } }, configurable: true, writable: true });
    const noeud = { innerHTML: '', classList: { add() {}, remove() {} }, querySelector: () => null };
    let clic = null;
    Object.defineProperty(globalThis, 'document', { value: { getElementById: (id) => (id === 'progression' ? noeud : null), addEventListener: (t, f) => { if (t === 'click') clic = f; } }, configurable: true, writable: true });
    const toucher = (dataset) => { clic({ target: { closest: () => ({ dataset }) } }); return noeud.innerHTML; };
    const poser = (profil) => memoire.set(S.PROGRESSION_KEY, JSON.stringify(profil));
    const ecran = (nom, arg) => { X.ouvrirProgression(nom, arg); return noeud.innerHTML; };
    X.installerProgression({ quandOnEssaie: () => 'confirmer' });
    X.reglerPeuple('atlante');
    const neuf = { ...P.profilNeuf(), saison: P.saisonDuJour('2026-10-09') };
    const maintenant = Date.now() / 1000, HEURE = 3600;
    const joueur = P.migrerProfil({ ...neuf, elo: 300, ligue: 3, plusHauteLigue: 3, parties: 31, couronnes: 250, eclats: 145,
      debloquees: { ...neuf.debloquees, triton: 'ligue', horseArcher: 'ligue' }, coffres: [{ type: 'bois', origine: 'victoire' }, { type: 'or', origine: 'semaine' }],
      boutique: { offreLigue: { troupe: 'catapult', jusqua: maintenant + 30 * HEURE }, bienvenueJusqua: maintenant + 60 * HEURE, bienvenuePrise: false, transactions: [] } });
    poser(joueur);
    m.bandeau = texte(X.htmlBandeau(joueur));
    m.ligues = texte(ecran('ligues'));
    m.coffres = texte(ecran('coffres'));
    m.probas = texte(ecran('probas', 'or'));
    m.fiche = texte(ecran('fiche', 'hydra'));
    m.boutique = texte(ecran('boutique'));
    m.manque = (/Te faltan[^.]*\./.exec(texte(toucher({ act: 'acheter', arg: 'hydra' }))) || [''])[0];
    m.confidentialite = texte(ecran('confidentialite'));

    const base = { ...neuf, eclats: 400, couronnes: 520, pieces: [...neuf.pieces, 'bassecour.cochon-couronne', 'bassecour.poule-guerriere', 'ligues.recrue', 'ligues.bronze'],
      blason: { ...neuf.blason, embleme: 'bassecour.cochon-couronne', banniere: 'ligues.bronze' }, route: { points: 450, passe: false, pris: { gratuit: [1], passe: [] } } };
    poser(base);
    m.genres = K.NOMS_DES_GENRES;
    m.titres = [B.titreDuBlason(null), B.titreDuBlason({ ...K.BLASON_DE_DEPART, grade: 'monstres.grade', epithete: 'banquet.epithete' }), B.titreDuBlason({ ...K.BLASON_DE_DEPART, grade: 'citrouilles.champion', epithete: 'maree.epithete' }),
      B.titreDuBlason({ ...K.BLASON_DE_DEPART, grade: 'froid.grade', epithete: 'sables.epithete' })];
    m.pieces = ['bassecour.banniere', 'ligues.or', 'citrouilles.etendard', 'monstres.grade', 'citrouilles.epithete', 'gaffes.general-boulette', 'teintures.argent'].map((id) => CE.pieceEnPhrase(id));
    m.gains = CE.resumeDesGains([{ type: 'eclats', variation: 20 }, { type: 'couronnes', variation: 50 }, { type: 'piece', piece: 'citrouilles.citrouille-casquee', doublon: false }, { type: 'piece', piece: 'citrouilles.grade', doublon: false }]);
    m.album = texte(ecran('album'));
    m.collection = texte(ecran('collection', 'bassecour'));
    m.porte = texte(toucher({ act: 'porter', arg: 'bassecour.poule-guerriere' }));
    m.blason = texte(ecran('blason'));
    m.saison = texte(ecran('saison'));
    m.passe = texte(toucher({ act: 'passe', i: '1' }));
    m.coffreOuvert = (() => { poser({ ...neuf, coffres: [{ type: 'argent', origine: 'victoire' }] }); return texte(toucher({ act: 'ouvrir', i: '0' })); })();
  }

  m.sansTraduction = [...L.SANS_TRADUCTION];
  return m;
}

if (ESPAGNOL) {
  // (On attend que tout soit écrit avant de sortir : le tuyau ne prend pas tout d'un coup.)
  const vues = JSON.stringify(await scenes());
  await new Promise((fin) => process.stdout.write(vues, fin));
  process.exit(0);
}

// ===== Les essais =============================================================================

const { verifierCahier, etatDe, recenser } = await import('../outils/langues.mjs');
const { PIECES } = await import('../js/collections-config.js');
let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${!condition && detail ? ' — ' + detail : ''}`);
}

// --- Les cahiers ------------------------------------------------------------------------------
console.log('--- Les cahiers ---');
const CAHIERS = {
  ecran: [['js/ui.js'], []],
  fiches: [['js/fiches-troupes.js', 'js/icones.js'], ['js/fiches-troupes.js:textesATraduire']],
  progression: [['js/progression-ecrans.js', 'js/progression-config.js', 'js/progression.js', 'js/achats.js', 'js/edition.js', 'js/rangement-durable.js'], ['js/progression-config.js:textesATraduire']],
  collections: [['js/collections-ecrans.js', 'js/blason.js', 'js/teintures.js', 'js/collections-config.js'], ['js/collections-config.js:textesATraduire']],
  partie: [['js/main.js', 'js/game.js', 'js/save.js', 'js/ai.js', 'js/sprites.js', 'js/modele3d.js', 'js/ordres.js', 'js/render.js', 'js/rendu3d.js', 'js/guide.js', 'js/guide-ecran.js', 'js/rappels.js'], ['js/sprites.js:textesATraduire']],
};
for (const [nom, [fichiers, tables]] of Object.entries(CAHIERS)) {
  const r = await verifierCahier('es', nom, fichiers, tables);
  check(`le cahier « ${nom} » couvre ses fichiers : ${r.cles} textes, rien ne manque, rien en trop, rien de fautif`,
    r.manquantes.length === 0 && r.enTrop.length === 0 && r.fautives.length === 0, [...r.manquantes, ...r.enTrop, ...r.fautives.map(([cle]) => cle)].slice(0, 3).join(' | '));
}
const source = await recenser();
const etat = await etatDe('es', source);
check(`tout le jeu est traduit : ${etat.traduites} textes sur ${etat.total}, et aucune traduction ne reste sans emploi`, etat.manquantes.length === 0 && etat.orphelines.length === 0 && etat.total >= 1190,
  [...etat.manquantes, ...etat.orphelines].slice(0, 3).join(' | '));
const { CAHIERS: cahiers, default: dictionnaire } = await import('../js/langues/es.js');
check('les sept cahiers sont assemblés', egal(Object.keys(cahiers), ['reglages', 'accueil', 'fiches', 'ecran', 'progression', 'collections', 'partie']));

const traductions = Object.entries(dictionnaire).flatMap(([cle, v]) => (typeof v === 'string' ? [[cle, v]] : Object.values(v).map((forme) => [cle, forme])));
const sansHtml = (t) => t.replace(/<[^>]+>/g, '');
const mal = (defaut) => traductions.filter(([cle, v]) => defaut(cle, v)).map(([cle]) => cle.slice(0, 40));
const ponctuation = mal((cle, v) => /[   ][:;?!%]/.test(sansHtml(v)) || /« | »|« | »/.test(v) || /[“”„]/.test(v));
check('la ponctuation est espagnole : pas d’espace avant « : ; ? ! % », des guillemets « » sans espace, pas de guillemets anglais ou allemands', ponctuation.length === 0, ponctuation.slice(0, 3).join(' | '));
const inversees = mal((cle, v) => !/dpr=/.test(cle) && ((/\?/.test(v) && !/¿/.test(v)) || (/!/.test(v) && !/¡/.test(v)) || /¿[^?]*$/.test(v) || /¡[^!]*$/.test(v)));
check('chaque ? et chaque ! est ouvert par ¿ et ¡ (sauf l’adresse « ?dpr= »)', inversees.length === 0, inversees.slice(0, 3).join(' | '));
const restesFrancais = mal((cle, v) => /[ÀÂÇÈÊËÎÏÔÙÛÜŒœ]|[èêçùûîô]/.test(sansHtml(v).replace(/\{[^}]*\}/g, '')));
check('aucune lettre française dans une traduction (è ê ç ù û î ô œ)', restesFrancais.length === 0, restesFrancais.slice(0, 3).join(' | '));
const anglais = mal((cle, v) => /\b(the|and|your|you|of|with|for|is|are)\b/i.test(sansHtml(v).replace(/\{[^}]*\}/g, '')) && !/Lilita|Nunito|Project|KayKit|Minstrel|Harvest|Determined|Pursuit/.test(v));
check('aucun mot anglais resté au milieu d’une traduction', anglais.length === 0, anglais.slice(0, 3).join(' | '));
const vous = mal((cle, v) => /\b(vosotros|vuestr[oa]s?|usted(es)?|vos)\b/i.test(sansHtml(v)));
check('on tutoie le joueur (tú) : ni « vosotros », ni « vuestro », ni « usted »', vous.length === 0, vous.slice(0, 3).join(' | '));
const identiques = traductions.filter(([cle, v]) => cle === v && !/^(Atlantes|Fellah|Sphinx|Normal|Blitz|Grande|Atlante|Libre|Libre · \{0\}|Adv\.|\{0\} €|\{0\} h|\{0\} min|Cristal|En \{0\}|Total|Niv\. \{0\}|\{grade\} \{épithète\}|… \{0\}|« »)$/.test(cle)).map(([cle]) => cle);
check('pas de phrase restée en français par oubli : une traduction n’est jamais égale à sa clé (sauf les noms qui ne changent pas)', identiques.length === 0, identiques.slice(0, 3).join(' | '));
const autocollants = Object.values(PIECES).filter((p) => p.genre === 'embleme').map((p) => dictionnaire[p.nom]);
check(`deux autocollants ne portent jamais le même nom espagnol (${autocollants.length} autocollants)`, new Set(autocollants).size === autocollants.length);
const noms = Object.values(PIECES).map((p) => dictionnaire[p.nom]);
check(`… ni deux pièces d’un même genre (${noms.length} pièces en tout)`, Object.values(PIECES).every((p, i, tout) => tout.every((q, j) => i === j || p.genre !== q.genre || dictionnaire[p.nom] !== dictionnaire[q.nom])));
check('le titre du joueur garde l’ordre du français : le grade, puis l’épithète (« Domador del Banquete »)', dictionnaire['{grade} {épithète}'] === '{grade} {épithète}');
check('le titre du jeu ne se traduit jamais : il n’est dans aucune traduction, sous aucune forme', traductions.every(([, v]) => !/doigt|Au doigt/i.test(v)) && !Object.keys(dictionnaire).some((cle) => /^Au doigt et à l/.test(cle)));
check('les mots accordés ont une forme pour un et une pour plusieurs', Object.entries(dictionnaire).filter(([cle]) => cle.includes('|')).every(([, v]) => v && typeof v.one === 'string' && typeof v.other === 'string'));

// --- L'espagnol, dans un jeu neuf ---------------------------------------------------------------
console.log('\n--- L’espagnol ---');
const m = JSON.parse(execFileSync(process.execPath, [ICI, '--espagnol'], { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26 }));

check('marqué « es », le jeu parle espagnol et s’appelle « Rule of Thumb »', m.langue === 'es' && m.titre === 'Rule of Thumb');
check('les tables du jeu sont traduites : unités, bâtiments, formats, difficultés, ressources, peuples, âges, postures',
  egal(m.tables, ['Miliciano', 'Cuartel', 'Centro urbano', 'Escaramuza', 'Toma de posiciones', 'Difícil', 'Oro', 'Jinete de camello', 'Solarianos', 'Edad de los Castillos', 'Mantener posición']), m.tables.join(', '));
check('les noms qui se comptent ont leur pluriel espagnol, écrit',
  egal(m.pluriels, ['Milicianos', 'Arqueros a caballo', 'Fellahs', 'Mercenarios atlantes', 'Sphinx', 'Jinetes de camello', 'Sacerdote del Sol', 'Ciervos']), m.pluriels.join(', '));
check('le résumé des réglages et les phrases à trous se lisent en espagnol',
  m.resume === 'vs Solarianos · Exprés · Normal · mapa mediano · velocidad 100%'
  && egal(m.phrases, ['Jugar', 'Clasificatoria · x', 'A vs B', 'mapa grande', 'Corona', 'Coronas', 'soldado', 'soldados', 'Sacerdotisa', 'Ciervo', '1200']),
  `${m.resume} / ${m.phrases.join(' | ')}`);
check('les rubriques d’une fiche s’appellent Función, Fuerte contra, Débil contra, Consejo — leurs clés ne changent pas',
  egal(m.rubriques, [['role', 'Función'], ['bat', 'Fuerte contra'], ['craint', 'Débil contra'], ['conseil', 'Consejo']]));
const fiche = (cle, rubrique) => (m.fiches[cle].find((r) => r.cle === rubrique) || {}).texte;
check('une fiche prend les noms du peuple du joueur : « Jinetes de camello » là où un Atlante lit « Caballeros »',
  fiche('solarien.ram', 'craint') === 'Lanceros (+6), Jinetes de camello (+5) y Zapadores (+8): en el cuerpo a cuerpo, está indefenso.'
  && fiche('solarien.champion', 'craint').startsWith('Sphinx, Ballesteros (+8 contra la infantería)') && fiche('atlante.hydra', 'craint').startsWith('Muchos tiradores'), fiche('solarien.ram', 'craint'));
check('… la Hidra des Atlantes se fait féminine, le Sphinx des Solariens masculin — et le Sphinx a sa propre fiche',
  fiche('atlante.hydra', 'conseil') === 'Lánzala al corazón de la refriega, con Sacerdotisas detrás: ahí es donde cuentan sus mordiscos. Ocupa 3 plazas.'
  && fiche('solarien.hydra', 'conseil') === 'Lánzalo al corazón de la refriega, con Sacerdotes del Sol detrás: ahí es donde cuentan sus golpes. Ocupa 3 plazas.'
  && fiche('atlante.priest', 'role') === 'Cura a tus tropas heridas, a 4 casillas: 8 puntos de vida por cada curación.');
check('l’écran de jeu : la consigne à l’allié et la fin de partie se lisent, avec le Palais du Soleil ou le Centro urbano selon le peuple',
  egal(m.consignes, ['Tu aliado está fuera de combate', 'Tu aliado está siendo atacado en casa: primero rechaza al enemigo', 'Tu aliado envía 1 soldado a defenderte', 'Tu aliado envía 4 soldados al ataque'])
  && egal(m.fin, ['El Palacio del Sol del adversario ha caído en 8:25', 'Tu Centro urbano ha caído — duración de la partida: 8:25', 'Has abandonado tras 5:00',
    'El adversario ya no tiene ni el Centro urbano ni ningún edificio militar — duración de la partida: 17:05', 'Ya no tienes ni el Palacio del Sol ni ningún edificio militar — duración de la partida: 17:05']), m.fin.join(' | '));
check('la simulation parle espagnol : ce qu’un bouton refuse, les avis, le Palais perdu, le palmarès, les incidents',
  egal(m.refus, ['Requiere Cuartel y Molino', 'Requiere Molino', 'Recursos insuficientes', 'No disponible'])
  && egal(m.avis, ['Población máxima alcanzada — construye casas.', 'No se puede construir aquí.', 'Cerdo capturado: llévalo a la aldea y un aldeano lo sacrificará.'])
  && egal(m.centrePerdu, ['¡Palacio del Sol perdido! Reconstruye uno: solo te quedan tus edificios militares.'])
  && egal(m.palmares, ['3 victorias · mejor tiempo 18:42 · mejor puntuación 12.500', '1 victoria'])
  && m.incident === 'La página se recargó en plena partida, tras 12 min — 180 MB de imágenes, 64 unidades', m.refus.join(' | '));
check('le bandeau de l’accueil, les ligues, les coffres, leurs probabilités',
  m.bandeau.includes('Liga Bronce · 300 Elo liga Hierro desde 450')
  && m.ligues.includes('Una victoria clasificatoria da 30 puntos y una derrota cuesta 15.') && m.ligues.includes('Por ganar: Cofre legendario · título «Leyenda» · Marco de las Leyendas · 50 Coronas')
  && m.coffres.includes('Un cofre por partida') && m.coffres.includes('madera plata oro legendario')
  && m.probas.includes('5 tiradas. En 100 cofres, en promedio: 1680 fragmentos comunes, 570 raros, 70 épicos.') && m.probas.includes('Y en cada cofre de oro: 20 Esquirlas, siempre.'), m.bandeau);
check('… la fiche d’une troupe, la boutique, un achat refusé, la confidentialité',
  m.fiche.includes('Gratis en la liga Plata, o tras jugar 80 partidas clasificatorias (llevas 31).') && m.fiche.includes('Tres te esperan cerca de tu centro.')
  && m.boutique.includes('Oferta de liga: Catapulta a mitad de precio') && m.boutique.includes('Pase de temporada 500 Coronas')
  && m.manque === 'Te faltan 50 para esta compra.' && m.confidentialite.includes('Rule of Thumb está publicado por'), m.manque);
check('les collections : les genres, le titre du joueur (grade puis épithète), les pièces dans une phrase, les gains',
  egal(m.genres, { embleme: 'Pegatina', cadre: 'Marco', banniere: 'Estandarte', grade: 'Título', epithete: 'Título', teinture: 'Tinte' })
  && egal(m.titres, ['Aldeano', 'Domador del Banquete', 'Espantapájaros en jefe de los Siete Mares', 'Friolero de las Arenas'])
  && egal(m.pieces, ['el Estandarte del Corral', 'el Marco de Oro', 'el Gallardete de la Noche', 'el título «Domador»', 'el título «… de las Calabazas»', 'la pegatina «El General Metepatas»', 'el Tinte de plata'])
  && m.gains === '20 Esquirlas, 50 Coronas, la pegatina «Calabaza con casco», el título «Zampacalabazas»', m.titres.join(' | '));
check('… l’album, une collection, le blason, la saison et son Pase, un coffre ouvert',
  m.album.includes('Cada cofre contiene al menos una pegatina') && m.album.includes('La Noche de las Calabazas 0 de 24 · Temporada 1')
  && m.collection.includes('Sus pegatinas salen de los cofres.') && m.collection.includes('Una pegatina común vale 30 Esquirlas, una rara 100 y una épica 300.')
  && m.porte.includes('Gallina guerrera: ya está en tu blasón.') && m.blason.includes('Título: la primera palabra') && m.blason.includes('Tinte de las tropas')
  && m.saison.includes('Hito 2 de 30') && m.saison.includes('El Pase de temporada abre la vía de la derecha') && m.passe.includes('Pase de temporada: es tuyo.')
  && m.coffreOuvert.includes('Cofre de plata') && m.coffreOuvert.includes('Mis tropas') && m.coffreOuvert.includes('Mi álbum'), m.saison.slice(0, 120));
check('rien n’est resté sans traduction dans toutes ces scènes', m.sansTraduction.length === 0, m.sansTraduction.slice(0, 3).join(' | '));
check('aucun écran ne montre « undefined », « NaN » ou un trou « {0} » resté dans le texte',
  [m.bandeau, m.ligues, m.coffres, m.probas, m.fiche, m.boutique, m.confidentialite, m.album, m.collection, m.blason, m.saison, m.passe].every((t) => !/undefined|NaN|\[object|\{\d\}/.test(t)));

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
