// Les rivaux (js/rivaux.js) : en partie classée, l'ordinateur d'en face a un nom, une phrase et un caractère.
// Sa force ne change pas (elle vient de la ligue) ; sa façon de jouer, si. Sans rival, rien ne change.
// Lancement : node test/rivaux.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RIVAUX, CARACTERES, rivalDeLaLigue, rivalConnu, caractereDuRival, ficheDuRival, textesATraduire } from '../js/rivaux.js';
import { PROGRESSION as R } from '../js/progression-config.js';
import { UNIT_TYPES, BUILDING_TYPES, DIFFICULTIES } from '../js/config.js';
import { World } from '../js/game.js';
import { serializeWorld, restoreWorld } from '../js/save.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${!condition && detail ? ' — ' + detail : ''}`);
}
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- Les données ----------------------------------------------------------------------------
console.log('--- Les rivaux ---');
check('un rival par ligue', RIVAUX.length === R.ligues.length);
check('chacun a un identifiant, un nom et une phrase à lui', new Set(RIVAUX.map((r) => r.id)).size === RIVAUX.length && new Set(RIVAUX.map((r) => r.nom)).size === RIVAUX.length
  && new Set(RIVAUX.map((r) => r.phrase)).size === RIVAUX.length && RIVAUX.every((r) => /^[a-z-]+$/.test(r.id) && r.nom.length > 3 && r.phrase.length > 10));
check('chacun a un caractère qui existe, et les trois caractères servent', RIVAUX.every((r) => !!CARACTERES[r.caractere]) && new Set(RIVAUX.map((r) => r.caractere)).size === Object.keys(CARACTERES).length);
check('deux ligues qui se suivent n’ont pas le même caractère : monter de ligue change de partie', RIVAUX.every((r, i) => i === 0 || r.caractere !== RIVAUX[i - 1].caractere));
check('le rival d’une ligue se lit par son numéro, sans sortir des bornes', rivalDeLaLigue(1) === RIVAUX[0] && rivalDeLaLigue(R.ligues.length) === RIVAUX.at(-1) && rivalDeLaLigue(0) === RIVAUX[0] && rivalDeLaLigue(99) === RIVAUX.at(-1) && rivalDeLaLigue('x') === RIVAUX[0]);
check('un identifiant inconnu n’est pas un rival', !rivalConnu('personne') && !rivalConnu(undefined) && caractereDuRival('personne') === null && ficheDuRival('personne') === null);
const fiche = ficheDuRival(RIVAUX[1].id);
check('la fiche d’un rival : son nom, son caractère, son trait, sa phrase', fiche.nom === RIVAUX[1].nom && fiche.caractere === CARACTERES[RIVAUX[1].caractere].nom && fiche.trait.length > 10 && fiche.phrase === RIVAUX[1].phrase);
{
  const vus = []; textesATraduire((objet, champ) => vus.push(objet[champ]));
  check('tous leurs textes se traduisent : noms, phrases, caractères, traits', vus.length === RIVAUX.length * 2 + Object.keys(CARACTERES).length * 2 && vus.every((t) => typeof t === 'string' && t.length > 3));
  check('aucun rival ne se fait passer pour un joueur : pas de pseudonyme à chiffres, pas d’émoticône', vus.every((t) => !/\d|[\u{1F000}-\u{1FAFF}]/u.test(t)));
}

console.log('--- Les caractères ---');
for (const c of Object.values(CARACTERES)) {
  check(`${c.nom} : ses troupes existent, âge par âge, et dans le format court`, c.troupes.length === 3 && [...c.troupes.flat(), ...c.troupesCourtes].every((t) => !!UNIT_TYPES[t]) && c.troupesCourtes.length >= 2);
  check(`${c.nom} : ses bâtiments existent, ses vagues ont des facteurs positifs`, c.batimentsCourts.every((b) => !!BUILDING_TYPES[b]) && (c.prefere === null || !!BUILDING_TYPES[c.prefere])
    && [c.vagues.depart, c.vagues.pas, c.vagues.delai].every((v) => v > 0) && Number.isInteger(c.patienceCourte) && c.patienceCourte >= 0);
  check(`${c.nom} : dans le format court, il peut former ses troupes (caserne offerte, ou bâtiment qu’il ajoute)`,
    c.troupesCourtes.every((t) => UNIT_TYPES[t].from === 'barracks' || c.batimentsCourts.includes(UNIT_TYPES[t].from)));
}
check('le Pillard attaque plus tôt et plus petit que le Bâtisseur', CARACTERES.pillard.vagues.depart < 1 && CARACTERES.pillard.vagues.delai < 1 && CARACTERES.batisseur.vagues.depart > 1 && CARACTERES.batisseur.vagues.delai > 1);

// --- Dans la partie -----------------------------------------------------------------------------
console.log('--- Dans la partie ---');
const partie = (extra = {}) => new World({ mode: 'escarmouche', difficulty: 'normal', seed: 4242, civs: ['atlante', 'solarien'], ...extra });
{
  const sans = partie();
  check('sans rival : l’adversaire s’appelle « Adversaire », et l’ordinateur n’a pas de caractère', sans.rival === null && sans.players[1].name === 'Adversaire' && sans.ais[0].caractere === null && sans.ais[0].patience === 0);
  const avec = partie({ rival: 'nefer' });
  check('avec un rival : il donne son nom à l’adversaire et son caractère à l’ordinateur', avec.rival === 'nefer' && avec.players[1].name === 'Néfer la Rapide' && avec.ais[0].caractere === CARACTERES.cavalier);
  check('un rival inconnu est ignoré', partie({ rival: 'personne' }).rival === null && partie({ rival: 42 }).rival === null);
  check('par équipes, pas de rival', new World({ mode: 'deux', difficulty: 'normal', seed: 1, rival: 'nefer' }).rival === null);
  const d = DIFFICULTIES.normal, copie = JSON.stringify(d);
  const pillard = partie({ rival: 'barbe-salee' }).ais[0], batisseur = partie({ rival: 'gontran' }).ais[0];
  check('le caractère règle la taille des vagues et le temps entre deux — en nombres entiers', pillard.difficulty.armyTrigger < d.armyTrigger && batisseur.difficulty.armyTrigger > d.armyTrigger
    && pillard.difficulty.attackDelay < d.attackDelay && batisseur.difficulty.attackDelay > d.attackDelay
    && [pillard, batisseur].every((a) => Number.isInteger(a.difficulty.armyTrigger) && Number.isInteger(a.difficulty.armyStep) && Number.isInteger(a.difficulty.attackDelay)));
  check('… mais pas la force de l’ordinateur : sa récolte, son nombre d’ouvriers, la trêve du Facile', pillard.difficulty.gatherBonus === d.gatherBonus && pillard.difficulty.maxVillagers === d.maxVillagers
    && egal(partie({ rival: 'gontran', difficulty: 'easy' }).ais[0].difficulty.treve, DIFFICULTIES.easy.treve) && partie({ rival: 'gontran', difficulty: 'easy' }).ais[0].treve === DIFFICULTIES.easy.treve.escarmouche);
  check('… et les réglages du jeu ne sont pas touchés', JSON.stringify(DIFFICULTIES.normal) === copie);
  check('la patience du Bâtisseur ne vaut que dans un format court', batisseur.patience === CARACTERES.batisseur.patienceCourte && new World({ mode: 'express', difficulty: 'normal', seed: 1, rival: 'gontran' }).ais[0].patience === 0);
}

// --- Simulé : chaque caractère se reconnaît -------------------------------------------------------------
console.log('--- Simulé (Escarmouche, deux minutes et demie) ---');
function simuler(rival, secondes = 150) {
  const w = partie(rival ? { rival } : {});
  const formees = {}; let premiere = null;
  for (let i = 0; i < 20 * secondes && !w.gameOver; i++) {
    w.update(1 / 20);
    if (i % 20 === 0) for (const u of w.units) if (!u.dead && u.playerIndex === 1 && !u.isVillager && !u.isAnimal && !u.vu) { u.vu = true; formees[u.type] = (formees[u.type] || 0) + 1; }
    if (premiere === null && w.ais[0].waveCount > 0) premiere = w.time;
  }
  return { formees, premiere, vagues: w.ais[0].waveCount, batiments: new Set(w.buildings.filter((b) => b.playerIndex === 1).map((b) => b.type)) };
}
{
  const pillard = simuler('barbe-salee'), batisseur = simuler('gontran'), cavalier = simuler('nefer');
  check('le Pillard : ni archerie ni archers, tout va aux fantassins, et il attaque dès la première minute', !pillard.batiments.has('archery') && !pillard.formees.archer && pillard.formees.militia > 0 && pillard.premiere < 60, JSON.stringify(pillard.formees));
  check('le Bâtisseur : lanciers et archers, et aucune vague avant sa patience', batisseur.formees.spearman > 0 && batisseur.formees.archer > 0 && batisseur.premiere >= CARACTERES.batisseur.patienceCourte, `première vague à ${Math.round(batisseur.premiere)} s`);
  check('le Cavalier : une écurie à la place de l’archerie, et des éclaireurs', cavalier.batiments.has('stable') && !cavalier.batiments.has('archery') && cavalier.formees.scout >= 3, JSON.stringify(cavalier.formees));
  check('le Pillard lance plus de vagues que le Bâtisseur', pillard.vagues > batisseur.vagues, `${pillard.vagues} contre ${batisseur.vagues}`);
  const a = simuler('nefer', 60), b = simuler('nefer', 60);
  check('la même partie se rejoue à l’identique : le caractère n’ajoute aucun hasard', egal(a.formees, b.formees) && a.premiere === b.premiere && a.vagues === b.vagues);
}

// --- La sauvegarde et le branchement ------------------------------------------------------------------
console.log('--- La sauvegarde, le branchement ---');
{
  const w = partie({ rival: 'ecume' });
  for (let i = 0; i < 200; i++) w.update(1 / 20);
  const repris = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
  check('une partie reprise garde son rival : son nom et son caractère', repris.rival === 'ecume' && repris.players[1].name === 'La Capitaine Écume' && repris.ais[0].caractere === CARACTERES.pillard);
  check('une sauvegarde sans rival n’en invente pas, et ne porte pas le champ', (() => { const s = serializeWorld(partie()); return !('rival' in s) && restoreWorld(JSON.parse(JSON.stringify(s))).rival === null; })());
  const main = lire('js/main.js');
  check('une partie classée affronte le rival de la ligue du joueur ; une partie libre, personne', /\.\.\.\(classee \? \{ rival: rivalDeLaLigue\(lireProgression\(\)\.ligue\)\.id \} : \{\}\),/.test(main));
  check('il se présente au début, et le jeu dit que c’est un ordinateur', /txt`En face : \$\{nomDuRival\(this\.world\.rival\)\} \(ordinateur\)\. « \$\{r\.phrase\} »`/.test(main));
  check('la fin de partie le nomme : battu, vainqueur ou à égalité', /txt`Tu as battu \$\{rival\}\.`/.test(main) && /txt`\$\{rival\} l’emporte cette fois\.`/.test(main) && /txt`Égalité contre \$\{rival\}\.`/.test(main));
  check('l’accueil dit qui attend en face, et comment il joue', /txt`En face : \$\{rival\.nom\}, \$\{rival\.caractere\} \(ordinateur\)\. \$\{rival\.trait\}`/.test(main));
  check('le jeu hors ligne garde le module, et le script des essais lance celui-ci', lire('sw.js').includes("'./js/rivaux.js'") && lire('package.json').includes('node test/rivaux.test.js'));
}

console.log(failures ? `\n${failures} essai(s) en échec` : '\nTout est bon.');
process.exit(failures ? 1 : 0);
