// La musique de fond (js/musique.js) : ses trois morceaux et leurs fichiers, la
// bascule en bataille (le veilleur), et le lecteur lui-même joué sur un faux
// contexte Web Audio — scènes, fondus, relais de la bataille, mémoire rendue.
// Lancement : node test/musique.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Musique, VeilleurDeBataille, MORCEAUX, SCENES, BATAILLE, cheminDeLaMusique, morceauVoulu, niveauDe } from '../js/musique.js';
import { AudioEngine } from '../js/audio.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${detail ? ' — ' + detail : ''}`);
}
const proche = (a, b) => Math.abs(a - b) < 1e-9;

// --- Les fichiers --------------------------------------------------------------
console.log('--- Les morceaux et leurs fichiers ---');
const noms = Object.keys(MORCEAUX);
const sources = lire('assets/musique/SOURCES.md');
const sw = lire('sw.js');
check('trois ambiances : menu, partie, bataille', noms.join() === 'menu,partie,bataille');
check('chaque morceau a son fichier, et rien ne traîne', fs.readdirSync(path.join(RACINE, 'assets/musique')).filter((f) => f.endsWith('.mp4')).sort().join() === noms.map((n) => n + '.mp4').sort().join());
check('ce sont des fichiers MPEG-4 (AAC), que l’iPhone lit, sous une extension que l’hébergement du jeu sert',
  noms.every((n) => fs.readFileSync(path.join(RACINE, cheminDeLaMusique(n))).subarray(4, 8).toString('latin1') === 'ftyp'));
const poids = noms.reduce((s, n) => s + fs.statSync(path.join(RACINE, cheminDeLaMusique(n))).size, 0);
check('un morceau pèse moins de 2,5 Mo, les trois moins de 5 Mo', noms.every((n) => fs.statSync(path.join(RACINE, cheminDeLaMusique(n))).size < 2_500_000) && poids < 5_000_000, `${(poids / 1e6).toFixed(1)} Mo`);
check('chacun a sa provenance écrite, sous licence CC0', /Creative Commons Zero/.test(sources) && noms.every((n) => sources.includes('`' + n + '.mp4`')) && (sources.match(/opengameart\.org\/content\//g) || []).length === 3);
check('les volumes sont raisonnables : la musique reste sous les bruitages', noms.every((n) => MORCEAUX[n].gain > 0.1 && MORCEAUX[n].gain <= 0.35));
check('hors ligne : le lecteur est dans la liste, les morceaux dans un cache à part qui survit aux mises à jour',
  sw.includes("'./js/musique.js'") && /const MUSIQUE = 'aem-musique'/.test(sw) && /pathname\.includes\('\/assets\/musique\/'\)/.test(sw) && /k !== MUSIQUE/.test(sw)
  && !/'\.\/assets\/musique\//.test(sw));
check('chaque scène ne garde que ses morceaux', SCENES.menu.join() === 'menu' && SCENES.partie.join() === 'partie,bataille' && SCENES.silence.length === 0);
check('on n’entend jamais qu’un morceau', morceauVoulu('menu', false) === 'menu' && morceauVoulu('menu', true) === 'menu' && morceauVoulu('partie', false) === 'partie'
  && morceauVoulu('partie', true) === 'bataille' && morceauVoulu('silence', true) === null);

// --- Le veilleur ---------------------------------------------------------------
console.log('--- La bascule en bataille ---');
{
  const v = new VeilleurDeBataille();
  check('au repos : pas de bataille', v.bataille(0) === false);
  v.coup(10); v.coup(12); v.coup(14);
  check('trois coups en quatre secondes — une tour qui tire, un duel d’éclaireurs — ne font pas une bataille', v.bataille(14) === false);
  const w = new VeilleurDeBataille();
  for (let i = 0; i < BATAILLE.coups - 1; i++) w.coup(100 + i * 0.5);
  check(`${BATAILLE.coups - 1} coups serrés : pas encore`, w.bataille(103) === false);
  w.coup(103);
  check(`le ${BATAILLE.coups}e coup en moins de ${BATAILLE.fenetre} s la déclenche`, w.bataille(103) === true);
  check('elle dure tant que les coups tombent', (w.coup(108), w.bataille(110)) === true && (w.coup(115), w.bataille(120)) === true);
  check(`… et s’arrête ${BATAILLE.calme} s après le dernier`, w.bataille(115 + BATAILLE.calme - 0.1) === true && w.bataille(115 + BATAILLE.calme) === false);
  w.coup(200);
  check('un coup isolé ensuite ne la relance pas', w.bataille(200.5) === false);
  const lent = new VeilleurDeBataille();
  for (let i = 0; i < 20; i++) lent.coup(i * 2);
  check('des coups espacés de deux secondes, même nombreux, ne font pas une bataille', lent.bataille(40) === false);
  check('un combat ne coupe pas la musique en plein milieu : le calme dépasse la fenêtre', BATAILLE.calme > BATAILLE.fenetre && BATAILLE.sortie > BATAILLE.entree);
}

// --- Le lecteur, sur un faux contexte ---------------------------------------------
console.log('--- Le lecteur ---');
const attendre = () => new Promise((r) => setTimeout(r, 5));
let demandes = [];
function fauxContexte() {
  const ctx = {
    currentTime: 0, state: 'running', destination: {}, sources: [],
    resume() { this.state = 'running'; }, suspend() { this.state = 'suspended'; },
    createGain() {
      const gain = { value: 1, rampes: [], cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v, t) { this.rampes.push({ v, t }); } };
      return { gain, connect(x) { return x; }, disconnect() {} };
    },
    createBufferSource() {
      const s = { buffer: null, loop: false, joue: false, arretA: null, playbackRate: { value: 1 }, connect(x) { return x; }, start() { this.joue = true; }, stop(t) { this.arretA = t; } };
      ctx.sources.push(s);
      return s;
    },
    decodeAudioData(octets, oui) { oui({ morceau: octets.nom }); },
  };
  return ctx;
}
globalThis.window = { AudioContext: function () { return fauxContexte(); } };
globalThis.localStorage = { donnees: {}, getItem(k) { return k in this.donnees ? this.donnees[k] : null; }, setItem(k, v) { this.donnees[k] = String(v); } };
globalThis.fetch = (url) => { demandes.push(url); return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve({ nom: url }) }); };

function nouveau() {
  const audio = new AudioEngine();
  const m = new Musique(audio);
  audio.apresReprise = () => m.accorder();
  let t = 0;
  m.horloge = () => t;
  return { audio, m, avancer(s) { t += s; audio.ctx.currentTime += s; }, heure: () => t };
}
const musicales = (m) => [...m.voies.keys()].join();
const cible = (m, nom) => (m.voies.get(nom) ? m.voies.get(nom).cible : null);

{
  const { audio, m } = nouveau();
  demandes = [];
  m.mettre('menu');
  check('avant le premier geste, rien ne se charge ni ne joue', demandes.filter((u) => u.includes('musique')).length === 0 && m.voies.size === 0);
  audio.resume(); await attendre();
  check('au premier geste, la musique de l’accueil se charge, elle seule', demandes.filter((u) => u.includes('musique')).join() === cheminDeLaMusique('menu'));
  check('… et joue en boucle, en montant depuis le silence', musicales(m) === 'menu' && m.voies.get('menu').source.loop && m.voies.get('menu').source.joue
    && m.voies.get('menu').de === 0 && cible(m, 'menu') === MORCEAUX.menu.gain);
  check('elle passe par l’interrupteur du son : le couper coupe aussi la musique', (audio.setEnabled(false), audio.sortie.gain.value) === 0 && (audio.setEnabled(true), audio.sortie.gain.value) === 1);
  const rampes = m.voies.get('menu').volume.gain.rampes.length;
  audio.resume(); audio.resume();
  check('un geste de plus ne relance ni le morceau ni son fondu', audio.ctx.sources.filter((s) => s.buffer && s.buffer.morceau === cheminDeLaMusique('menu')).length === 1 && m.voies.get('menu').volume.gain.rampes.length === rampes);
}

{
  const { audio, m, avancer } = nouveau();
  m.mettre('menu'); audio.resume(); await attendre();
  const menu = m.voies.get('menu');
  demandes = [];
  m.mettre('partie'); await attendre();
  check('la partie commence : la musique de l’accueil s’efface et s’arrête', !m.voies.has('menu') && menu.cible === 0 && menu.source.arretA > 0);
  check('… sa mémoire est rendue, celles de la partie et de la bataille sont prises', !m.tampons.has('menu') && m.tampons.has('partie') && m.tampons.has('bataille')
    && demandes.sort().join() === [cheminDeLaMusique('bataille'), cheminDeLaMusique('partie')].join());
  check('seule la musique de la partie joue', musicales(m) === 'partie' && cible(m, 'partie') === MORCEAUX.partie.gain);

  avancer(30);
  for (let i = 0; i < 3; i++) { m.coup(); avancer(0.5); }
  m.suivre();
  check('une escarmouche : la musique ne change pas', musicales(m) === 'partie' && m.bataille === false);
  for (let i = 0; i < BATAILLE.coups; i++) { m.coup(); avancer(0.3); }
  m.suivre();
  const bataille = m.voies.get('bataille');
  check('un vrai combat : la musique de bataille entre', m.bataille === true && !!bataille && bataille.source.joue && bataille.source.loop && bataille.cible === MORCEAUX.bataille.gain && bataille.duree === BATAILLE.entree);
  const partie = m.voies.get('partie');
  check('… et celle de la partie se tait sans s’arrêter', partie.cible === 0 && partie.source.arretA === null && m.voies.has('partie'));
  avancer(BATAILLE.entree / 2);
  check('au milieu du fondu, l’une monte et l’autre descend', proche(niveauDe(bataille, audio.ctx.currentTime), MORCEAUX.bataille.gain / 2) && niveauDe(partie, audio.ctx.currentTime) > 0 && niveauDe(partie, audio.ctx.currentTime) < MORCEAUX.partie.gain);
  avancer(3); m.coup(); m.suivre(); avancer(BATAILLE.calme - 0.5); m.suivre();
  check('tant que le calme n’est pas revenu, elle reste', m.bataille === true && m.voies.has('bataille'));
  avancer(1); m.suivre();
  check('le combat fini, elle s’efface, plus lentement qu’elle n’est entrée, puis s’arrête', m.bataille === false && !m.voies.has('bataille') && bataille.cible === 0 && bataille.duree === BATAILLE.sortie
    && proche(bataille.source.arretA, audio.ctx.currentTime + BATAILLE.sortie));
  check('… et la musique de la partie revient, la même, là où elle en était', m.voies.get('partie') === partie && partie.cible === MORCEAUX.partie.gain && partie.duree === BATAILLE.sortie
    && audio.ctx.sources.filter((s) => s.buffer && s.buffer.morceau === cheminDeLaMusique('partie')).length === 1);
  for (let i = 0; i < BATAILLE.coups; i++) { m.coup(); avancer(0.3); }
  m.suivre();
  check('un second combat relance la bataille depuis le début', m.voies.has('bataille') && m.voies.get('bataille') !== bataille && m.voies.get('bataille').source.joue);

  m.mettre('silence');
  check('fin de partie : tout s’efface pour le jingle, et la mémoire est rendue', m.voies.size === 0 && m.tampons.size === 0 && partie.cible === 0 && partie.source.arretA > 0 && m.bataille === false);
  m.coup(); m.coup(); m.coup(); m.coup(); m.coup(); m.coup(); m.suivre();
  check('des coups hors partie ne déclenchent rien', m.bataille === false && m.voies.size === 0);
  m.mettre('menu'); await attendre();
  check('retour à l’accueil : sa musique revient', musicales(m) === 'menu');
}

{
  const { audio, m } = nouveau();
  m.mettre('partie'); audio.resume(); await attendre();
  m.vouloir(false);
  check('musique coupée par le joueur : plus rien ne joue, la mémoire est rendue, le choix est retenu', m.voies.size === 0 && m.tampons.size === 0 && localStorage.getItem('aem.musique') === 'non');
  const autre = new Musique(audio);
  check('… et il tient au lancement suivant', autre.voulue === false);
  m.vouloir(true); await attendre();
  check('remise : elle reprend dans la scène en cours', musicales(m) === 'partie' && localStorage.getItem('aem.musique') === 'oui');
}

{
  const { audio, m } = nouveau();
  globalThis.fetch = () => Promise.reject(new Error('hors ligne'));
  m.mettre('menu'); audio.resume(); await attendre();
  check('un morceau qui manque (hors ligne à la première visite) : pas de musique, pas d’erreur', m.voies.size === 0 && m.demandes.size === 0);
  let lents = [];
  globalThis.fetch = (url) => new Promise((oui) => { lents.push(() => oui({ ok: true, arrayBuffer: () => Promise.resolve({ nom: url }) })); });
  m.mettre('partie');
  m.mettre('menu');
  for (const f of lents) f();
  await attendre();
  check('un morceau qui arrive après un changement de scène n’est ni gardé ni joué', !m.tampons.has('partie') && !m.tampons.has('bataille') && !m.voies.has('partie'));
}

// --- Le branchement dans le jeu ---------------------------------------------------
console.log('--- Dans le jeu ---');
const main = lire('js/main.js'), game = lire('js/game.js'), ui = lire('js/ui.js');
check('l’accueil, la partie et la fin de partie mettent chacune leur scène',
  /function showStartScreen\(\) \{\n  currentGame = null;\n  musique\.mettre\('menu'\)/.test(main) && /audio\.resume\(\);\n  musique\.mettre\('partie'\)/.test(main) && /case 'gameOver':\n\s+this\.musique\.mettre\('silence'\)/.test(main));
check('la boucle de la partie fait suivre la musique', /this\.musique\.suivre\(\);/.test(main));
check('les coups portés et reçus par le joueur sont comptés — pas la chasse, pas les bêtes',
  /case 'melee': if \(mine && event\.combat\) this\.musique\.coup\(\)/.test(main) && /case 'shoot': if \(mine && event\.combat\) this\.musique\.coup\(\)/.test(main)
  && /if \(event\.combat\) this\.musique\.coup\(\)/.test(main) && /const combat = !attacker\.isAnimal && !target\.isAnimal;/.test(game)
  && /type: 'underAttack', x: entity\.x, y: entity\.y, entity, combat: !!source && !source\.isAnimal && !entity\.isAnimal/.test(game));
check('le premier geste, où qu’il tombe, lance le son ; la page à l’arrière-plan se tait', /premierGeste/.test(main) && /audio\.suspendre\(\)/.test(main));
check('le menu de pause permet de couper la musique seule, et les crédits la citent', /data-musique=/.test(ui) && /musique\.vouloir\(/.test(ui) && /Minstrel Dance/.test(ui) && /Harvest Season/.test(ui) && /Determined Pursuit/.test(ui));

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
