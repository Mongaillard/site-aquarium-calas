// Les sons du jeu : la banque d'échantillons (js/audio.js), ses fichiers, la
// liste hors ligne, et le moteur lui-même joué sur un faux contexte Web Audio
// (échantillon quand il est là, synthèse sinon, écart minimal, voix comptées).
// Lancement : node test/sons.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AudioEngine, BANQUE, cheminDuSon, fichiersDeLaBanque } from '../js/audio.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${detail ? ' — ' + detail : ''}`);
}

// --- Les fichiers --------------------------------------------------------------
console.log('--- La banque et ses fichiers ---');
const demandes = fichiersDeLaBanque();
const surDisque = fs.readdirSync(path.join(RACINE, 'assets/sons')).filter((f) => f.endsWith('.mp4')).map((f) => f.slice(0, -4));
const cache = new Set([...lire('sw.js').matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]));
const sources = lire('assets/sons/SOURCES.md');
check('chaque son de la banque a son fichier', demandes.every((n) => surDisque.includes(n)), demandes.filter((n) => !surDisque.includes(n)).join(', '));
check('aucun fichier ne traîne sans servir', surDisque.every((n) => demandes.includes(n)), surDisque.filter((n) => !demandes.includes(n)).join(', '));
check('tous sont dans la liste hors ligne', demandes.every((n) => cache.has(cheminDuSon(n))), demandes.filter((n) => !cache.has(cheminDuSon(n))).join(', '));
check('… et la liste hors ligne n’en cite aucun qui manque', [...cache].filter((c) => c.startsWith('assets/sons/')).every((c) => fs.existsSync(path.join(RACINE, c))));
check('chacun a sa provenance écrite, sous licence CC0', /Creative Commons Zero/.test(sources) && demandes.every((n) => sources.includes('`' + n + '.mp4`')));
check('un fichier pèse moins de 40 Ko, le tout moins de 400 Ko',
  demandes.every((n) => fs.statSync(path.join(RACINE, cheminDuSon(n))).size < 40_000)
  && demandes.reduce((s, n) => s + fs.statSync(path.join(RACINE, cheminDuSon(n))).size, 0) < 400_000,
  `${Math.round(demandes.reduce((s, n) => s + fs.statSync(path.join(RACINE, cheminDuSon(n))).size, 0) / 1024)} Ko`);
check('ce sont des fichiers MPEG-4 (AAC), que l’iPhone lit, sous une extension que l’hébergement du jeu sert', surDisque.length === 40 && demandes.every((n) => fs.readFileSync(path.join(RACINE, cheminDuSon(n))).subarray(4, 8).toString('latin1') === 'ftyp'));
const ORIGINE = ['click', 'select', 'order', 'place', 'built', 'trained', 'melee', 'shoot', 'destroyed', 'alert', 'age', 'victory', 'defeat', 'error'];
const GESTES = ['chop', 'mine', 'pick', 'hammer'];
check('les quatorze sons d’origine y sont, plus la chute d’une troupe et les quatre gestes des ouvriers',
  [...ORIGINE, 'death', ...GESTES].every((n) => BANQUE[n]) && Object.keys(BANQUE).length === 19);
check('chaque son a un volume raisonnable et au moins un échantillon', Object.values(BANQUE).every((s) => s.fichiers.length >= 1 && s.gain > 0 && s.gain <= 1));
check('les sons répétés (combat, gestes) ont un écart minimal et une hauteur qui varie',
  ['melee', 'shoot', 'death', ...GESTES].every((n) => BANQUE[n].ecart >= 100 && BANQUE[n].hauteur > 0 && BANQUE[n].fichiers.length >= 2));
const sons = [...lire('js/main.js').matchAll(/audio\.play\('([a-z]+)'/g)].map((m) => m[1]);
check('tout son que la partie demande est dans la banque', sons.length > 20 && sons.every((n) => BANQUE[n]), [...new Set(sons.filter((n) => !BANQUE[n]))].join(', '));
check('la partie branche les gestes des ouvriers et distingue l’effondrement de la chute',
  /surGeste = \(quoi\)/.test(lire('js/main.js')) && /kind === 'building' \? 'destroyed' : 'death'/.test(lire('js/main.js')) && /this\.surGeste\(u\.state === 'build' \? 'build' : u\.carry\.type\)/.test(lire('js/render.js')));

// --- Le moteur, sur un faux contexte ----------------------------------------------
console.log('\n--- Le moteur ---');
let horloge = 1000;
const joues = [];      // ce qui est parti vers les haut-parleurs
function fauxContexte() {
  const noeud = (genre) => ({ genre, gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    playbackRate: { value: 1 }, connect(suivant) { return suivant; }, start(t) { joues.push({ genre, tampon: this.buffer && this.buffer.nom, vitesse: this.playbackRate.value, t }); }, stop() {} });
  return { currentTime: 0, sampleRate: 44100, state: 'running', destination: noeud('sortie'),
    createGain: () => noeud('gain'), createOscillator: () => noeud('onde'), createBiquadFilter: () => noeud('filtre'), createBufferSource: () => noeud('echantillon'),
    createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }), resume() {},
    decodeAudioData(octets, oui, non) { if (octets.casse) non(new Error('illisible')); else oui({ nom: octets.nom }); } };
}
const demandesReseau = [];
globalThis.window = { AudioContext: function Ctx() { return fauxContexte(); } };
globalThis.performance = { now: () => horloge };
globalThis.fetch = (url) => { demandesReseau.push(url); const nom = url.replace('assets/sons/', '').replace('.mp4', '');
  if (nom === 'erreur-1') return Promise.resolve({ ok: false, status: 404 });
  return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve({ nom, casse: nom === 'age-1' }) }); };
const attendre = () => new Promise((ok) => setTimeout(ok, 20));

const moteur = new AudioEngine();
moteur.play('click');
check('avant le premier geste du joueur, rien ne joue et rien n’est demandé', joues.length === 0 && demandesReseau.length === 0);
moteur.resume();
moteur.play('click');
check('au premier geste, la synthèse répond tout de suite (les échantillons arrivent)', joues.length === 1 && joues[0].genre === 'onde');
moteur.resume(); moteur.resume();
await attendre();
check('les échantillons sont demandés une seule fois, chacun', demandesReseau.length === demandes.length && new Set(demandesReseau).size === demandes.length);
check('un fichier introuvable ou illisible ne casse rien : les autres sont là', moteur.tampons.size === demandes.length - 2 && !moteur.tampons.has('erreur-1') && !moteur.tampons.has('age-1'));
joues.length = 0;
moteur.play('click');
check('l’échantillon arrivé, c’est lui qui joue', joues.length === 1 && joues[0].genre === 'echantillon' && /^clic-/.test(joues[0].tampon));
joues.length = 0;
moteur.play('error'); moteur.play('age');
check('… et le son dont le fichier manque garde sa synthèse', joues.length >= 2 && joues.every((j) => j.genre === 'onde'));
joues.length = 0;
moteur.play('destroyed');
check('un bâtiment qui s’effondre : deux échantillons, le second un instant après',
  joues.length === 2 && joues[0].tampon === 'effondrement-1' && joues[1].tampon === 'effondrement-2' && joues[1].t > joues[0].t);
joues.length = 0;
for (let i = 0; i < 30; i++) moteur.play('melee');
check('trente coups d’épée au même instant : un seul s’entend', joues.length === 1);
horloge += 111; moteur.play('melee');
check('… le suivant passe après l’écart minimal', joues.length === 2);
joues.length = 0;
const tires = new Set(); const vitesses = new Set();
for (let i = 0; i < 60; i++) { horloge += 300; moteur.voix = 0; moteur.play('chop'); }
for (const j of joues) { tires.add(j.tampon); vitesses.add(j.vitesse); }
check('la hache : ses trois échantillons tournent, à des hauteurs qui varient (jamais de plus de 10 %)',
  tires.size === 3 && vitesses.size > 20 && [...vitesses].every((v) => v >= 0.9 && v <= 1.1));
joues.length = 0; moteur.voix = 0;
for (let i = 0; i < 40; i++) { horloge += 500; moteur.play('pick'); }
check('jamais plus de quatorze échantillons à la fois', joues.length === 14 && moteur.voix === 14);
moteur.voix = 0; joues.length = 0;
moteur.play('licorne'); moteur.play('hammer');
check('un son inconnu ne fait rien ; un geste d’ouvrier joue son échantillon', joues.length === 1 && /^marteau-/.test(joues[0].tampon));
moteur.setEnabled(false); joues.length = 0; horloge += 1000;
moteur.play('click'); moteur.play('melee');
check('son coupé : plus rien ne part', joues.length === 0 && moteur.sortie.gain.value === 0);
moteur.setEnabled(true); moteur.play('click');
check('son rétabli : il repart', joues.length === 1 && moteur.sortie.gain.value === 1);
const sansFichiers = new AudioEngine();
globalThis.fetch = () => Promise.reject(new Error('hors ligne'));
sansFichiers.resume(); await attendre(); joues.length = 0;
for (const n of ORIGINE) { horloge += 1000; sansFichiers.play(n); }
check('hors ligne à la première visite : les quatorze sons d’origine sortent en synthèse', sansFichiers.tampons.size === 0 && joues.length >= 14 && joues.every((j) => j.genre !== 'echantillon' || !j.tampon));
joues.length = 0;
for (const n of [...GESTES, 'death']) { horloge += 1000; sansFichiers.play(n); }
check('… les gestes des ouvriers, eux, se taisent', joues.length === 0);

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
