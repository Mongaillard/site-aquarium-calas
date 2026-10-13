#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Les scénarios, joués par un ordinateur assis à la place du joueur.
//
//     npm run missions                               → les missions de la campagne
//     npm run missions -- riveCamp survie hydre      → ceux-là
//     npm run missions -- --peuple solarien riveGardien
//     npm run missions -- --niveau hard riveGreniers
//     npm run missions -- --ouvriers 80,15,5 riveGreniers
//         → ses ouvriers à 80 % sur la nourriture, 15 % sur le bois, 5 % sur l'or
//     npm run missions -- --assaut 14 riveCamp
//         → dès qu'il a 14 soldats, ils partent tous ensemble sur le camp : la garde d'abord,
//           puis bâtiment après bâtiment (ce qu'un joueur ferait)
//     npm run missions -- --retouche "S.riveGardien.chef.vie = 2200" riveGardien
//         → la même mesure avec un réglage retouché : `S` est SCENARIOS (js/scenarios.js)
//
// Un repère pour régler une mission, pas une mesure de sa difficulté : un
// ordinateur ne joue pas comme un joueur. Il partage sa récolte entre les trois
// ressources (un joueur à qui on demande de la nourriture y met tous ses
// ouvriers), et il ne sait pas attaquer ce qui tire. Ce que l'outil dit bien :
// si une mission est gagnable sans rien d'exceptionnel, combien de temps elle
// laisse, et à quels moments elle presse.
//
// Chaque ligne du journal : ce qui arrive, à quelle seconde, avec combien de
// soldats et quel état du bâtiment principal. Aucune dépendance : Node seul.
// ---------------------------------------------------------------------------

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arguments_ = process.argv.slice(2);
const option = (nom, parDefaut) => {
  const i = arguments_.indexOf(`--${nom}`);
  if (i < 0) return parDefaut;
  const [, valeur] = arguments_.splice(i, 2);
  return valeur;
};
const peuple = option('peuple', 'atlante');
const niveau = option('niveau', 'normal');
const parts = option('ouvriers', '');
const repartition = parts ? (([food, wood, gold]) => ({ food: food / 100, wood: wood / 100, gold: gold / 100 }))(parts.split(',').map(Number)) : null;
const assaut = Number(option('assaut', 0));
const retouche = option('retouche', '');

const { World } = await import(path.join(RACINE, 'js/game.js'));
const { DIFFICULTIES } = await import(path.join(RACINE, 'js/config.js'));
const { AIPlayer } = await import(path.join(RACINE, 'js/ai.js'));
const { SCENARIOS, optionsDeScenario, scenarioDe, etoilesDe, butsDe } = await import(path.join(RACINE, 'js/scenarios.js'));

if (retouche) new Function('S', retouche)(SCENARIOS);
const choisis = arguments_.length ? arguments_ : Object.keys(SCENARIOS).filter((id) => SCENARIOS[id].chapitre);
const horloge = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

for (const id of choisis) {
  const def = scenarioDe({ id });
  if (!def) { console.error(`Scénario inconnu : ${id}`); process.exitCode = 1; continue; }
  const monde = new World({ ...optionsDeScenario({ id }, [peuple]), difficulty: niveau });
  const moi = monde.humanIndex, joueur = monde.players[moi];
  // (Avec `--assaut`, l'ordinateur ne lance plus ses petites vagues de lui-même : il garde ses soldats pour l'assaut groupé.)
  const ordinateur = new AIPlayer(monde, moi, assaut ? { ...DIFFICULTIES[niveau], armyTrigger: 99 } : DIFFICULTIES[niveau]);
  ordinateur.repartition = repartition;
  monde.ais.push(ordinateur);
  joueur.autoWorkers = true;
  const soldats = () => monde.units.filter((u) => !u.dead && u.playerIndex === moi && !u.isVillager && !u.isAnimal).length;
  const centre = () => { const b = monde.scenario.centre(); return b ? Math.round((100 * b.hp) / b.maxHp) : 0; };
  const journal = [];
  const noter = (quoi) => journal.push(`${horloge(monde.time).padStart(5)}  ${quoi} — ${soldats()} soldats, bâtiment principal à ${centre()} %`);
  let pas = 0, minute = 0, parti = false;
  while (!monde.gameOver && pas < 20 * 60 * 20) {
    monde.update(1 / 20);
    pas++;
    // L'assaut groupé : une fois le nombre atteint, tous les soldats frappent le bâtiment du camp le plus
    // proche d'eux, et les renforts les rejoignent — redit toutes les deux secondes, par-dessus l'ordinateur.
    if (assaut && pas % 40 === 0) {
      const armee = monde.units.filter((u) => !u.dead && u.playerIndex === moi && !u.isVillager && !u.isAnimal);
      if (!parti && armee.length >= assaut) { parti = true; noter(`assaut : ${armee.length} soldats partent`); }
      const cibles = monde.scenario.batimentsDuCamp();
      if (parti && cibles.length && armee.length) {
        const cx = armee.reduce((somme, u) => somme + u.x, 0) / armee.length, cy = armee.reduce((somme, u) => somme + u.y, 0) / armee.length;
        const plusPres = (liste) => liste.reduce((a, b) => (Math.hypot(a.x - cx, a.y - cy) <= Math.hypot(b.x - cx, b.y - cy) ? a : b));
        // (La garde d'abord, quand elle est à portée de vue : un joueur ne laisse pas des archers dans son dos.)
        const gardes = monde.scenario.troupes().filter((g) => Math.hypot(g.x - cx, g.y - cy) < 9 * 32);
        const cible = gardes.length ? plusPres(gardes) : plusPres(cibles);
        for (const u of armee) if (!u.target || u.target.dead || (u.target.kind !== 'unit' && gardes.length) || u.target.kind !== 'unit') u.attackEntity(cible);
      }
    }
    for (const e of monde.drainEvents()) {
      if (e.type === 'vague') noter(`vague ${e.numero} sur ${e.total}`);
      else if (e.type === 'chef') noter(`monstre : ${e.etape}`);
    }
    if (monde.time >= (minute + 1) * 60) {
      minute++;
      const a = monde.scenario.affichage();
      const ou = a.recolte ? `${a.recolte.fait} sur ${a.recolte.but} récoltés` : a.camp ? `camp : ${a.camp.reste} sur ${a.camp.total} debout` : a.chef ? `monstre : ${a.chef.vie} sur ${a.chef.max}` : '';
      if (ou) noter(ou);
    }
  }
  const fin = monde.gameOver, bilan = monde.scenario.bilan(fin);
  const etoiles = etoilesDe(def, bilan), buts = butsDe(def, peuple);
  console.log(`\n${def.nom} (${id}) — ${peuple}, ordinateur ${niveau}${parts ? `, ouvriers ${parts}` : ''}${assaut ? `, assaut à ${assaut} soldats` : ''}${retouche ? ` (réglage retouché : ${retouche})` : ''}`);
  console.log(`  ${fin ? `${fin.victory ? 'VICTOIRE' : 'défaite'} (${fin.scenario ? fin.scenario.raison : '?'})` : 'pas finie en 20 minutes'} à ${horloge(monde.time)} · ${bilan.pertes} pertes · bâtiment principal à ${bilan.centre} % · récolte ${Math.round(joueur.stats.gathered.food)} / ${Math.round(joueur.stats.gathered.wood)} / ${Math.round(joueur.stats.gathered.gold)}`);
  buts.forEach((but, i) => console.log(`  ${etoiles[i] ? '★' : '☆'} ${but}`));
  for (const ligne of journal) console.log(`  ${ligne}`);
}
