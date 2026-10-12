// La partie guidée (js/guide.js) : une vraie partie, sans adversaire qui joue,
// où le guide n'avance que quand la chose demandée est faite. On joue ici ses
// quatorze étapes sans écran, avec les vraies règles du monde.
// Lancement : node test/guide.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../js/game.js';
import { TICKS_PER_SECOND, TILE, GAME_MODES } from '../js/config.js';
import { villagerTask } from '../js/entities.js';
import { Guide, ETAPES, partieGuidee, voixDuGuide, cheminDeLaVoix, arbreLePlusPres, placeLibre, RENFORTS, VIE_DE_LA_CIBLE, LANGUES_DITES } from '../js/guide.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1 / TICKS_PER_SECOND;
let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${!condition && detail ? ' — ' + detail : ''}`);
}

// --- La partie ---------------------------------------------------------------
console.log('--- La partie guidée ---');
const monde = new World(partieGuidee(['atlante', 'solarien']));
const moi = monde.humanIndex;
const avancer = (secondes) => { for (let i = 0; i < secondes * TICKS_PER_SECOND; i++) { monde.update(DT); monde.drainEvents(); } };
const ouvriers = () => monde.units.filter((u) => !u.dead && u.playerIndex === moi && u.isVillager);
const soldats = () => monde.units.filter((u) => !u.dead && u.playerIndex === moi && !u.isVillager && !u.isAnimal);
const caserne = monde.buildings.find((b) => b.playerIndex === moi && b.type === 'barracks');
const centre = monde.buildings.find((b) => b.playerIndex === moi && b.type === 'towncenter');

check('personne ne joue en face : aucun ordinateur dans la partie', monde.ais.length === 0);
check('la partie guidée n’a pas de chronomètre, et le format lui-même garde le sien', !monde.mode.timeLimit && GAME_MODES.escarmouche.timeLimit > 0);
check('la caserne est déjà bâtie, les ouvriers sont là', !!caserne && caserne.complete && ouvriers().length >= 4);
const arbre = arbreLePlusPres(monde, centre);
check('un arbre est à portée du centre', !!arbre && Math.hypot(arbre.x - centre.x, arbre.y - centre.y) < TILE * 14, arbre ? `${(Math.hypot(arbre.x - centre.x, arbre.y - centre.y) / TILE).toFixed(1)} cases` : 'aucun');
check('il y a de la place pour une maison près du centre', !!placeLibre(monde, moi, 'house', centre, { de: 3 }));
avancer(20);
check('vingt secondes sans rien faire : la partie continue, personne n’attaque', !monde.gameOver && ouvriers().length >= 4);

// --- Le guide, étape par étape -------------------------------------------------
console.log('--- Les étapes ---');
const menus = { ouvriers: false, construire: false };
const jeu = {
  world: monde, civ: monde.players[moi].civ, selection: [], buildMode: null,
  camera: { x: centre.x, y: centre.y, zoom: 1 },
  setSelection(liste) { this.selection = liste.filter((e) => e && !e.dead); },
  menuOuvert: (nom) => menus[nom],
  montrer(x, y) { this.camera.x = x; this.camera.y = y; },
};
const vues = [];
const guide = new Guide(jeu, { surEtape: (etape) => vues.push(etape.id) });
guide.demarrer();
const etape = () => guide.etape.id;
const bloque = () => { const avant = guide.numero; guide.suivre(); return guide.numero === avant; };

check('quatorze étapes, et une consigne à chacune', ETAPES.length === 14 && ETAPES.every((e) => typeof e.texte === 'function'));
check('le guide commence par l’accueil, et attend son bouton', etape() === 'bienvenue' && bloque() && guide.texte().length > 10);
guide.continuer();

check('la carte : tant que la vue ne bouge pas, on n’avance pas', etape() === 'carte' && bloque() && guide.cible().geste === 'glisser');
jeu.camera.x += TILE * 3;
check('… la vue a glissé de trois cases : étape faite', !bloque() && etape() === 'choisir');

check('choisir : le doigt montre un ouvrier', bloque() && !!guide.cible().monde && ouvriers().some((u) => Math.hypot(u.x - guide.cible().monde.x, u.y - guide.cible().monde.y) < 1));
jeu.setSelection([ouvriers()[0]]);
check('… un ouvrier en main : étape faite', !bloque() && etape() === 'semblables');

jeu.setSelection(ouvriers());
check('ses semblables : les avoir tous en main ne suffit pas, il faut le double toucher', bloque() && guide.cible().geste === 'double');
guide.noter('double');
check('… double toucher : étape faite', !bloque() && etape() === 'rectangle');

check('le rectangle : la sélection est lâchée, le doigt trace d’un coin à l’autre', jeu.selection.length === 0 && bloque() && guide.cible().geste === 'rectangle' && guide.cible().vers.x > guide.cible().monde.x);
jeu.setSelection(ouvriers()); guide.noter('rectangle');
check('… rectangle tracé : étape faite', !bloque() && etape() === 'ordres');

jeu.setSelection([]);
check('les ordres : sans ouvrier en main, le doigt en montre un', bloque() && guide.texte().includes('ouvrier') && !!guide.cible().monde);
jeu.setSelection(ouvriers().slice(0, 2));
const versLArbre = guide.cible().monde;
check('… avec des ouvriers en main, le doigt montre l’arbre le plus proche', !!monde.map.resourceAt(Math.floor(versLArbre.x / TILE), Math.floor(versLArbre.y / TILE)));
monde.commandUnits(jeu.selection, versLArbre.x, versLArbre.y, { tolerance: 20 }); guide.noter('ordre');
avancer(1);
check('… ils partent au bois : étape faite', ouvriers().some((u) => villagerTask(u) === 'wood') && !bloque() && etape() === 'barre', etape());

check('la barre des ouvriers : le doigt montre son bouton', bloque() && guide.cible().element === '#btn-workers');
menus.ouvriers = true;
check('… panneau ouvert : étape faite, et la suivante attend qu’on le ferme', !bloque() && etape() === 'postes' && bloque() && guide.cible().element === '#btn-close-workers');
menus.ouvriers = false;
check('… panneau fermé : étape faite', !bloque() && etape() === 'batir');

check('bâtir : d’abord un ouvrier', bloque() && !!guide.cible().monde);
jeu.setSelection([ouvriers()[2]]);
check('… puis le bouton « Construire »', bloque() && typeof guide.cible().commande === 'function' && guide.cible().commande({ icon: 'chantier' }));
menus.construire = true;
check('… puis la maison dans la liste', bloque() && guide.cible().element.includes('data-type="house"'));
menus.construire = false; jeu.buildMode = { type: 'house' };
const place = guide.cible().monde;
check('… puis une place libre sur le terrain', bloque() && !!place);
const tx = Math.round(place.x / TILE - 1), ty = Math.round(place.y / TILE - 1);
const chantier = monde.placeBuilding(moi, 'house', tx, ty, jeu.selection);
jeu.buildMode = null;
check('… maison posée : étape faite', !!chantier && !bloque() && etape() === 'former', etape());

check('former : le doigt montre la caserne', bloque() && Math.hypot(guide.cible().monde.x - caserne.x, guide.cible().monde.y - caserne.y) < 1);
jeu.setSelection([caserne]);
check('… puis le bouton du soldat', bloque() && guide.cible().commande({ troupe: 'militia' }) && !guide.cible().commande({ troupe: 'spearman' }));
monde.trainUnit(caserne, 'militia'); guide.noter('formation');
const avantRenforts = soldats().length;
check('… formation lancée : étape faite', caserne.queue.length === 1 && !bloque() && etape() === 'attaquer');

const cible = monde.byId.get(guide.memo.cible);
check(`l’assaut : un bâtiment ennemi presque en ruine est posé à portée de vue (${cible ? cible.hp : '?'} points de vie)`,
  !!cible && cible.playerIndex !== moi && cible.hp <= VIE_DE_LA_CIBLE && Math.hypot(cible.x - caserne.x, cible.y - caserne.y) < TILE * 12);
check(`… et ${RENFORTS} soldats de renfort attendent`, soldats().length === avantRenforts + RENFORTS);
check('… sans soldat en main, le doigt montre le bouton « Armée »', bloque() && guide.cible().element === '#btn-armee');
jeu.setSelection(soldats());
check('… soldats en main : le doigt montre la cible', bloque() && Math.hypot(guide.cible().monde.x - cible.x, guide.cible().monde.y - cible.y) < 1);
monde.commandUnits(jeu.selection, cible.x, cible.y, { tolerance: 20, cible });
let secondes = 0;
while (!cible.dead && secondes < 90) { avancer(1); secondes++; }
check(`… la cible tombe en ${secondes} s : étape faite, et la partie n’est pas finie pour autant`, cible.dead && secondes <= 45 && !bloque() && etape() === 'express' && !monde.gameOver);

guide.continuer();
check('deux étapes à lire, chacune son bouton', etape() === 'sauvegarde' && bloque());
guide.continuer();
check('la fin : « À toi de jouer », et le guide ne va pas plus loin', etape() === 'fin' && guide.etape.fin && bloque());
check('chaque étape a été annoncée une fois, dans l’ordre', vues.join() === ETAPES.map((e) => e.id).join());

// --- Les voix --------------------------------------------------------------------
console.log('--- Les voix ---');
const voix = voixDuGuide();
check('onze phrases dites, une par étape parlée', voix.length === 11 && new Set(voix).size === 11);
const absentes = voix.filter((v) => !fs.existsSync(path.join(RACINE, cheminDeLaVoix('fr', v))));
check('chaque phrase a son fichier en français', absentes.length === 0, absentes.join(', '));
check('le guide ne parle que dans les langues qui ont leurs fichiers', LANGUES_DITES.every((l) => voix.every((v) => fs.existsSync(path.join(RACINE, cheminDeLaVoix(l, v))))));
const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
check('le jeu hors ligne garde le guide : modules, style, doigt et voix', ['js/guide.js', 'js/guide-ecran.js', 'css/guide.css', 'assets/guide/doigt.webp', ...voix.map((v) => cheminDeLaVoix('fr', v))].every((f) => sw.includes(`'./${f}'`)));
check('le doigt est là', fs.existsSync(path.join(RACINE, 'assets/guide/doigt.webp')));

console.log(failures ? `\n${failures} essai(s) en échec` : '\nTout est bon.');
process.exit(failures ? 1 : 0);
