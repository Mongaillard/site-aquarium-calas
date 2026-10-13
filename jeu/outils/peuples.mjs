#!/usr/bin/env node
// ---------------------------------------------------------------------------
// L'équilibre des peuples : Atlantes contre Solariens, deux ordinateurs.
//
//     npm run peuples                       → Express, 40 cartes
//     npm run peuples -- escarmouche 40     → un autre format, un autre nombre de cartes
//     npm run peuples -- express 40 "C.solarien.mods = { construction: 110 }"
//                                           → la même mesure avec un réglage retouché : `C` est
//                                             CIVILISATIONS (js/config.js), changé avant la première partie
//
// Chaque carte se joue deux fois, les peuples échangeant leurs places : la carte
// ne favorise alors personne. Sans aucun trait, le résultat est exactement
// moitié-moitié — c'est le zéro de la mesure. À 80 parties, un écart de moins de
// dix points n'est pas un écart : c'est le bruit.
//
// Les traits des peuples (js/config.js, CIVILISATIONS) se règlent ici : aucun
// peuple ne doit l'emporter nettement. C'est une mesure entre ordinateurs — elle
// dit que les règles ne penchent pas, pas que les deux peuples sont aussi
// agréables à jouer.
//
// Aucune dépendance : Node seul.
// ---------------------------------------------------------------------------

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [format = 'express', cartes = '40', retouche = ''] = process.argv.slice(2);

const { CIVILISATIONS, GAME_MODES } = await import(path.join(RACINE, 'js/config.js'));
if (!GAME_MODES[format] || GAME_MODES[format].equipes) {
  console.error(`Format inconnu, ou par équipes : ${format}`);
  process.exit(1);
}
if (retouche) new Function('C', retouche)(CIVILISATIONS);
const { World } = await import(path.join(RACINE, 'js/game.js'));

const peuples = Object.keys(CIVILISATIONS).slice(0, 2);
const gains = { [peuples[0]]: 0, [peuples[1]]: 0 }, pertes = { ...gains }, recolte = { ...gains };
let egalites = 0, nettes = 0, duree = 0;
const debut = Date.now();
for (let carte = 0; carte < Number(cartes); carte++) {
  for (const civs of [peuples, [...peuples].reverse()]) {
    const monde = new World({ mode: format, difficulty: 'normal', seed: 1000 + carte * 7919, civs, places: ['ordinateur', 'ordinateur'] });
    // (Un format sans chronomètre s'arrête de lui-même ; à défaut, au bout de 45 minutes de jeu.)
    const plafond = 20 * 60 * (GAME_MODES[format].timeLimit ? 25 : 45);
    for (let pas = 0; pas < plafond && !monde.gameOver; pas++) monde.update(1 / 20);
    const fin = monde.gameOver;
    if (!fin || fin.winner < 0) egalites++;
    else { gains[civs[fin.winner]]++; if (!fin.timeUp) nettes++; }
    duree += monde.time;
    for (const joueur of monde.players) {
      pertes[joueur.civ] += joueur.stats.lost;
      recolte[joueur.civ] += joueur.stats.gathered.food + joueur.stats.gathered.wood + joueur.stats.gathered.gold;
    }
  }
}
const parties = Number(cartes) * 2, tranchees = gains[peuples[0]] + gains[peuples[1]];
const part = (civ) => (tranchees ? Math.round((100 * gains[civ]) / tranchees) : 0);
console.log(`${GAME_MODES[format].name} — ${parties} parties entre ordinateurs${retouche ? ` (réglage retouché : ${retouche})` : ''}`);
for (const civ of peuples) {
  console.log(`  ${CIVILISATIONS[civ].name.padEnd(10)} ${String(gains[civ]).padStart(3)} victoires (${part(civ)} %) · ${pertes[civ]} unités perdues · ${Math.round(recolte[civ] / parties)} de récolte par partie`);
}
console.log(`  ${egalites} égalité(s) · ${nettes} victoire(s) avant la fin du temps · ${Math.round(duree / parties)} s de jeu en moyenne · ${Math.round((Date.now() - debut) / 1000)} s de calcul`);
