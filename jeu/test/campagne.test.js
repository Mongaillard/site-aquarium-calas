// La campagne : un chapitre, trois missions qui se suivent et se racontent, sur le
// moteur de scénarios (js/scenarios.js). Ce que la table dit, ce que chaque mission
// fait dans la partie — récolter, raser un camp gardé, abattre le monstre du peuple
// d'en face —, ce que le profil en retient (js/progression.js) et ce que les écrans
// en montrent (js/defis-ecrans.js).
// Lancement : node test/campagne.test.js

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  SCENARIOS, SCENARIOS_LIBRES, CHAPITRES, missionsDe, scenarioDe, optionsDeScenario, peupleAdverseDe, recitDe, nomDuChef,
  butsDe, consigneDe, etoilesDe, textesATraduire,
} from '../js/scenarios.js';
import { PROGRESSION as R } from '../js/progression-config.js';
import { profilNeuf, migrerProfil, appliquerScenario, etatDeLaCampagne, scenarioOuvert, etatDeScenario } from '../js/progression.js';
import { UNIT_TYPES, BUILDING_TYPES, CIVILISATIONS, TILE, troupeDe } from '../js/config.js';
import { PIECES, collection, composerTitre } from '../js/collections-config.js';
import { World } from '../js/game.js';
import { serializeWorld, restoreWorld, PROGRESSION_KEY } from '../js/save.js';
import { ouvrirProgression, installerProgression, reglerPeuple, htmlBandeau } from '../js/progression-ecrans.js';
import { htmlFinDeScenario } from '../js/defis-ecrans.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${!condition && detail ? ' — ' + detail : ''}`);
}
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const avancer = (monde, secondes) => { for (let i = 0; i < Math.round(secondes * 20) && !monde.gameOver; i++) monde.update(1 / 20); };
const partie = (id, civ = 'atlante') => new World({ ...optionsDeScenario({ id }, [civ]), difficulty: 'normal' });
const JOUR = '2026-10-13';
const jouer = (profil, id, etoiles, record = 0) => appliquerScenario(profil, { scenario: id, jour: JOUR, jourDIci: JOUR, etoiles, record, sens: 'bas' });
/** Un joueur d'après ses premiers jours : ses points de saison ne comptent plus double. */
const rode = (profil) => ({ ...profil, premierJour: '2026-01-01' });

const chapitre = R.campagne.chapitres[0];
const [GRENIERS, CAMP, GARDIEN] = chapitre.missions;

// --- La table ------------------------------------------------------------------------------
console.log('--- La table ---');
{
  const missions = chapitre.missions.map((id) => SCENARIOS[id]);
  check('un chapitre, « La rive d’en face », et ses trois missions dans l’ordre', R.campagne.chapitres.length === 1 && chapitre.id === 'rive' && CHAPITRES.rive.nom === 'La rive d’en face'
    && egal(chapitre.missions, ['riveGreniers', 'riveCamp', 'riveGardien']) && egal(missions.map((m) => m.nom), ['Pied à terre', 'Le camp d’en face', 'Ce que le camp gardait']));
  check('les réglages du profil et la table des scénarios disent la même chose : chaque mission est un scénario de ce chapitre, et rien d’autre ne l’est',
    R.campagne.chapitres.every((c) => CHAPITRES[c.id] && egal(c.missions, missionsDe(c.id))) && Object.values(SCENARIOS).filter((s) => s.chapitre).every((s) => CHAPITRES[s.chapitre]));
  check('les scénarios de l’écran des défis restent les deux d’avant : la campagne a sa place à elle', egal(SCENARIOS_LIBRES, ['survie', 'hydre']));
  check('un identifiant de mission est fait de lettres seules : le profil n’en garde pas d’autre', chapitre.missions.every((id) => /^[A-Za-z]{1,24}$/.test(id) && SCENARIOS[id].id === id));
  check('la première étoile d’une mission est toujours « gagner » : c’est elle qui ouvre la suivante', missions.every((m) => m.etoiles.length === 3 && m.etoiles[0].genre === 'victoire' && m.but));
  check('trois façons de jouer : récolter, raser, abattre', egal(missions.map((m) => m.but.genre), ['recolter', 'raser', 'abattre']));
  check('chaque mission se joue avec le peuple du joueur, contre l’autre, et personne ne bâtit en face', missions.every((m) => m.civAdverse === 'autre' && m.adversaire === 'aucun'));
  check('un temps à battre se dit en minutes entières, et laisse de la marge avant la fin de la partie',
    missions.every((m) => m.etoiles.filter((e) => e.genre === 'temps').every((e) => e.sous % 60 === 0 && e.sous < m.but.avant) && m.but.avant % 60 === 0 && m.format.timeLimit === m.but.avant));
  check('ce qu’on récolte est de la nourriture : le seul but de récolte que le jeu sait dire', SCENARIOS[GRENIERS].but.quoi === 'food' && SCENARIOS[GRENIERS].but.combien === 800);
  check('chaque mission a son récit : trois phrases avant, deux après la victoire', missions.every((m) => m.recit.avant.length === 3 && m.recit.apres.length === 2 && [...m.recit.avant, ...m.recit.apres].every((t) => t.length > 20 && t.length < 90)));
  const vus = [];
  textesATraduire((objet, champ) => vus.push(objet[champ]));
  check('les dictionnaires reçoivent le chapitre, les missions et chaque phrase de leur récit', ['La rive d’en face', 'Pied à terre', ...missions.flatMap((m) => [...m.recit.avant, ...m.recit.apres])].every((t) => vus.includes(t)));
  check('le chapitre donne deux mots de titre, et rien d’autre : « Découvreur de la Rive »', egal(chapitre.pieces, { fini: 'campagne.grade', etoiles: 'campagne.epithete' })
    && PIECES['campagne.grade'].genre === 'grade' && PIECES['campagne.epithete'].genre === 'epithete' && collection('campagne').source === 'campagne'
    && composerTitre(PIECES['campagne.grade'].nom, PIECES['campagne.epithete'].nom) === 'Découvreur de la Rive');
  check('rien de la campagne ne se vend ni ne sort d’un coffre', !JSON.stringify([R.boutique, R.coffres, R.saisons.route, R.collections.atelier, R.collections.lots, R.ligues]).includes('campagne'));
}

// --- Les deux peuples ----------------------------------------------------------------------
console.log('\n--- Les deux peuples ---');
{
  check('le peuple d’en face est l’autre : les Solariens pour un Atlante, les Atlantes pour un Solarien',
    peupleAdverseDe(SCENARIOS[GRENIERS], 'atlante') === 'solarien' && peupleAdverseDe(SCENARIOS[GRENIERS], 'solarien') === 'atlante' && peupleAdverseDe(SCENARIOS[GRENIERS], undefined) === 'solarien');
  check('… et la partie se règle ainsi, quel que soit l’adversaire choisi à l’accueil',
    egal(optionsDeScenario({ id: CAMP }, ['solarien', 'solarien']).civs, ['solarien', 'atlante']) && egal(optionsDeScenario({ id: CAMP }, ['atlante', 'atlante']).civs, ['atlante', 'solarien']));
  check('un scénario qui impose son peuple le garde ; un défi fait d’une règle laisse le choix de l’accueil',
    egal(optionsDeScenario({ id: 'hydre' }, ['atlante', 'solarien']).civs, ['atlante', 'atlante']) && egal(optionsDeScenario({ id: 'defi', jour: '2026-10-12' }, ['atlante', 'solarien']).civs, ['atlante', 'solarien']));
  check('le monstre est celui d’en face : le Sphinx pour un Atlante, l’Hydre pour un Solarien', nomDuChef(SCENARIOS[GARDIEN], 'atlante') === 'Sphinx' && nomDuChef(SCENARIOS[GARDIEN], 'solarien') === 'Hydre' && nomDuChef(SCENARIOS.hydre, 'solarien') === 'Hydre');
  const atlante = recitDe(SCENARIOS[GARDIEN], 'avant', 'atlante').join(' '), solarien = recitDe(SCENARIOS[GARDIEN], 'avant', 'solarien').join(' ');
  check('le récit nomme le peuple d’en face et son monstre', /Leur Sphinx marche sur nous, avec ce qu’il reste des Solariens\./.test(atlante) && /Leur Hydre marche sur nous, avec ce qu’il reste des Atlantes\./.test(solarien), atlante);
  check('… sans laisser un trou : pas de « {0} » dans une phrase lue', chapitre.missions.every((id) => ['avant', 'apres'].every((m) => ['atlante', 'solarien'].every((c) => !/\{\d\}|undefined/.test(recitDe(SCENARIOS[id], m, c).join(' '))))));
  check('un scénario sans récit n’en dit rien', egal(recitDe(SCENARIOS.survie, 'avant', 'atlante'), []) && egal(recitDe(SCENARIOS[GRENIERS], 'pendant', 'atlante'), []));
  check('les buts et la consigne se disent pour le peuple du joueur', butsDe(SCENARIOS[GARDIEN], 'solarien')[0] === 'Abattre le monstre : Hydre' && /Un monstre approche : Sphinx, 2[\s  ]000 points de vie\. Abats-le en moins de 9 minutes\./.test(consigneDe(SCENARIOS[GARDIEN], 'atlante'))
    && butsDe(SCENARIOS[GRENIERS], 'atlante')[0] === 'Récolter 800 de nourriture en moins de 7 minutes' && butsDe(SCENARIOS[CAMP], 'atlante')[0] === 'Raser le camp : ses 3 bâtiments'
    && consigneDe(SCENARIOS[CAMP], 'atlante') === 'Leur camp est de l’autre côté de la carte : rase ses 3 bâtiments en moins de 10 minutes.');
}

// --- Mission 1 : récolter ------------------------------------------------------------------
console.log('\n--- Mission 1 : récolter ---');
{
  const w = partie(GRENIERS);
  const moi = w.players[w.humanIndex];
  check('personne en face : ni bâtiment, ni troupe, ni ordinateur ; le joueur a son départ d’Express', w.buildings.every((b) => b.playerIndex === w.humanIndex) && w.units.every((u) => u.playerIndex <= 0)
    && w.ais.length === 0 && w.units.filter((u) => u.isVillager).length === 7 && w.mode.timeLimit === 420);
  check('l’écran compte la nourriture récoltée, pas les vagues des maraudeurs', egal(w.scenario.affichage(), { recolte: { quoi: 'food', fait: 0, but: 800 } }));
  avancer(w, 5);
  check('ce qui est en réserve au départ ne compte pas : seul compte ce qu’on récolte', moi.resources.food >= 400 && w.scenario.recolte() === 0 && !w.gameOver);
  moi.stats.gathered.food = 799.6;
  avancer(w, 1);
  check('à 799, la partie continue', !w.gameOver && w.scenario.affichage().recolte.fait === 799);
  moi.stats.gathered.food = 800;
  avancer(w, 0.1);
  check('à 800, c’est gagné : « greniers pleins »', !!w.gameOver && w.gameOver.victory === true && w.gameOver.scenario.raison === 'recolte' && w.gameOver.scenario.id === GRENIERS);
  check('… avec ses trois étoiles pour qui a fait vite et sans pertes', egal(etoilesDe(SCENARIOS[GRENIERS], w.scenario.bilan(w.gameOver)), [true, true, true]));

  const lent = partie(GRENIERS);
  const evenements = [];
  while (!lent.gameOver && lent.time < 430) { lent.update(1 / 20); evenements.push(...lent.drainEvents().filter((e) => e.type === 'vague')); }
  check('sans rien récolter, le temps tranche à 7 minutes : perdu', !!lent.gameOver && lent.gameOver.victory === false && lent.gameOver.scenario.raison === 'temps' && Math.abs(lent.time - 420) < 0.2, `${lent.time}`);
  check('les maraudeurs sont passés trois fois, et s’annoncent comme tels', evenements.length === 3 && evenements.every((e) => e.maraudeurs === true) && lent.players[1 - lent.humanIndex].stats.trained === 0);
  check('une étoile de temps ou de pertes ne vaut que sur une victoire', egal(etoilesDe(SCENARIOS[GRENIERS], lent.scenario.bilan(lent.gameOver)), [false, false, false]));
  const survie = new World({ ...optionsDeScenario({ id: 'survie' }, ['atlante']), difficulty: 'normal' });
  avancer(survie, 61);
  check('les vagues d’un autre scénario se comptent toujours, et s’annoncent comme des vagues', survie.scenario.affichage().vague === 1 && survie.scenario.affichage().vagues === 12 && survie.drainEvents().some((e) => e.type === 'vague' && e.maraudeurs === false));
}

// --- Mission 2 : raser le camp -------------------------------------------------------------
console.log('\n--- Mission 2 : raser le camp ---');
{
  const w = partie(CAMP);
  const e = w.scenario.ennemi, place = w.map.startPositions[e];
  const camp = w.scenario.batimentsDuCamp(), gardes = w.scenario.troupes();
  check('le camp est posé autour de la place d’en face : une caserne, une archerie, une tour, achevées', egal(camp.map((b) => b.type), ['barracks', 'archery', 'tower']) && camp.every((b) => b.complete && b.playerIndex === e)
    && camp[0].tx === place.tx - 1 && camp[0].ty === place.ty - 1 && camp.every((b) => Math.hypot(b.tx - place.tx, b.ty - place.ty) < 13));
  check('un camp de fortune : ses bâtiments tiennent la moitié de leurs points de vie', egal(camp.map((b) => b.maxHp), [BUILDING_TYPES.barracks.hp / 2, BUILDING_TYPES.archery.hp / 2, BUILDING_TYPES.tower.hp / 2]) && camp.every((b) => b.hp === b.maxHp));
  const atlante = partie(CAMP, 'solarien');
  check('… et le trait de son peuple s’y ajoute : un camp atlante tient un cinquième de plus', egal(atlante.scenario.batimentsDuCamp().map((b) => b.maxHp), [480, 480, 420]) && atlante.players[atlante.scenario.ennemi].civ === 'atlante');
  check('six gardes devant lui, en attitude défensive ; pas de bâtiment principal, pas d’ordinateur', gardes.length === 6 && gardes.every((u) => u.stance === 'defensive') && !w.buildings.some((b) => b.playerIndex === e && b.type === 'towncenter') && w.ais.length === 0);
  check('l’écran compte les bâtiments du camp encore debout', egal(w.scenario.affichage(), { camp: { reste: 3, total: 3 } }));
  const postes = gardes.map((u) => ({ x: u.x, y: u.y }));
  avancer(w, 95);
  check('la garde tient son poste : après une minute et demie, aucun garde n’a quitté le camp', gardes.every((u, i) => !u.dead && Math.hypot(u.x - postes[i].x, u.y - postes[i].y) < TILE * 2));
  avancer(w, 40);
  const sortis = w.scenario.troupes().filter((u) => !gardes.includes(u));
  const moi = w.buildings.find((b) => b.playerIndex === w.humanIndex && b.type === 'towncenter');
  check('les maraudeurs, eux, sortent du camp et marchent sur le joueur', sortis.length === 3 && sortis.every((u) => u.stance === 'aggressive' && Math.hypot(u.x - moi.x, u.y - moi.y) < Math.hypot(place.tx * TILE - moi.x, place.ty * TILE - moi.y)));

  // La sauvegarde : le camp, ses points de vie et sa garde reviennent tels quels.
  camp[1].hp = 123;
  const copie = JSON.parse(JSON.stringify(serializeWorld(w)));
  const repris = restoreWorld(copie);
  const campRepris = repris.scenario.batimentsDuCamp();
  check('une partie reprise retrouve son camp : les mêmes bâtiments, les mêmes points de vie, pas un de plus',
    egal(campRepris.map((b) => [b.type, b.tx, b.ty, b.hp, b.maxHp]), camp.map((b) => [b.type, b.tx, b.ty, b.hp, b.maxHp])) && repris.buildings.length === w.buildings.length);
  check('… et sa garde, toujours à son poste', repris.scenario.troupes().filter((u) => u.stance === 'defensive').length === 6 && repris.scenario.troupes().length === w.scenario.troupes().length);

  camp[0].hp = 0; camp[0].dead = true;
  avancer(w, 0.1);
  check('un bâtiment rasé : il en reste deux, la partie continue', !w.gameOver && w.scenario.affichage().camp.reste === 2);
  for (const b of camp) { b.hp = 0; b.dead = true; }
  avancer(w, 0.1);
  check('les trois rasés : c’est gagné, même si la garde vit encore', !!w.gameOver && w.gameOver.victory === true && w.gameOver.scenario.raison === 'rase' && w.scenario.troupes().length > 0);

  // (Un joueur qui ne fait rien perd son bâtiment principal aux maraudeurs avant la fin : l'horloge est donc avancée à la main.)
  const lent = partie(CAMP);
  lent.time = 599.5;
  avancer(lent, 0.4);
  const avantLaFin = !lent.gameOver;
  avancer(lent, 0.2);
  check('le camp debout au bout de dix minutes : perdu', avantLaFin && !!lent.gameOver && lent.gameOver.victory === false && lent.gameOver.scenario.raison === 'temps');
  const passif = partie(CAMP);
  avancer(passif, 600);
  check('… et qui ne fait rien n’attend pas jusque-là : les maraudeurs rasent son bâtiment principal', !!passif.gameOver && passif.gameOver.victory === false && passif.gameOver.scenario.raison === 'centre' && passif.time < 600);
  const tombe = partie(CAMP);
  const centre = tombe.scenario.centre();
  centre.hp = 0; centre.dead = true;
  avancer(tombe, 0.1);
  check('le bâtiment principal du joueur qui tombe : perdu, comme dans tout scénario', !!tombe.gameOver && tombe.gameOver.victory === false && tombe.gameOver.scenario.raison === 'centre');
}

// --- Mission 3 : abattre le monstre ---------------------------------------------------------
console.log('\n--- Mission 3 : abattre le monstre ---');
{
  const w = partie(GARDIEN);
  avancer(w, 121);
  const sphinx = w.scenario.monstre();
  check('contre un Atlante, le monstre est le Sphinx des Solariens : 2 000 points de vie, et il balaie', !!sphinx && sphinx.maxHp === 2000 && sphinx.hp === 2000 && sphinx.chef === true
    && sphinx.def === troupeDe('hydra', 'solarien') && sphinx.def.balayage === true && w.players[w.scenario.ennemi].civ === 'solarien');
  const s = partie(GARDIEN, 'solarien');
  avancer(s, 121);
  const hydre = s.scenario.monstre();
  check('contre un Solarien, c’est l’Hydre des Atlantes : elle se soigne hors du combat', !!hydre && hydre.def === troupeDe('hydra', 'atlante') && hydre.def.regen === 3 && !hydre.def.balayage);
  const ancien = new World({ ...optionsDeScenario({ id: 'hydre' }, ['atlante']), difficulty: 'normal' });
  avancer(ancien, 91);
  check('« Le réveil de l’Hydre », lui, n’a pas changé : son monstre reste la troupe de base', ancien.scenario.monstre().def === UNIT_TYPES.hydra);
  sphinx.hp = 2000 * 0.69;
  avancer(w, 0.1);
  check('sous 70 % de sa vie, il appelle trois lanciers', w.scenario.phase === 1 && w.scenario.troupes().filter((u) => u.type === 'spearman').length === 3);
  sphinx.hp = 2000 * 0.19;
  avancer(w, 0.1);
  check('sous 20 %, la rage — sans perdre ce que son peuple lui donne', w.scenario.phase === 3 && sphinx.def.attackSpeed === 1.5 && sphinx.def.balayage === true && sphinx.def !== troupeDe('hydra', 'solarien'));
  const repris = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
  const m = repris.scenario.monstre();
  check('une partie reprise retrouve le monstre, sa vie, sa rage et son balayage', !!m && m.maxHp === 2000 && Math.abs(m.hp - sphinx.hp) < 1 && m.def.attackSpeed === 1.5 && m.def.balayage === true && repris.scenario.phase === 3);
  sphinx.hp = 0; sphinx.dead = true;
  avancer(w, 0.1);
  check('le monstre abattu : c’est gagné, quoi qu’il reste de son escorte', !!w.gameOver && w.gameOver.victory === true && w.gameOver.scenario.raison === 'abattu');

  // Les images des troupes qui entrent toutes faites se préparent à l'avance (main.js, veiller).
  const neuf = partie(GARDIEN);
  check('au départ de la mission 3, rien n’est encore attendu : le monstre entre dans deux minutes', egal(neuf.scenario.aVenir(), []));
  avancer(neuf, 91);
  check('trente secondes avant son entrée, le monstre et ceux qu’il appellera sont annoncés', egal(neuf.scenario.aVenir().sort(), ['archer', 'hydra', 'spearman']) && !neuf.scenario.chefEntre);
  avancer(neuf, 85);
  check('… puis la vague qui approche, et le monstre déjà là reste annoncé tant qu’il vit', egal(neuf.scenario.aVenir().sort(), ['archer', 'hydra', 'militia', 'spearman']) && neuf.scenario.chefEntre);
  check('la garde d’un camp est annoncée dès le départ : le joueur ne l’a pas encore vue', egal(partie(CAMP).scenario.aVenir().sort(), ['archer', 'spearman']));
  const main = lire('js/main.js');
  check('l’écran prépare ces images chaque seconde, et le ménage de la mémoire n’y touche pas',
    /for \(const type of this\.scenario\.aVenir\(\)\) prevoirTroupe\(type, civ\);/.test(main) && /for \(const type of this\.scenario\.aVenir\(\)\) couples\.set\(/.test(main));
}

// --- Le profil --------------------------------------------------------------------------------
console.log('\n--- Le profil ---');
{
  const neuf = rode(profilNeuf());
  const etat = etatDeLaCampagne(neuf)[0];
  check('au départ : le chapitre est ouvert, sa première mission aussi, les deux autres fermées', etat.id === 'rive' && etat.ouvert && !etat.fini && etat.etoiles === 0 && etat.total === 9
    && egal(etat.missions.map((m) => [m.id, m.rang, m.ouverte, m.gagnee]), [[GRENIERS, 1, true, false], [CAMP, 2, false, false], [GARDIEN, 3, false, false]]));
  check('… et un scénario qui n’est pas de la campagne est toujours ouvert', scenarioOuvert(neuf, 'survie') && scenarioOuvert(neuf, 'defi') && scenarioOuvert(neuf, GRENIERS) && !scenarioOuvert(neuf, CAMP) && !scenarioOuvert(neuf, GARDIEN));
  const refus = jouer(neuf, CAMP, [true, true, true]);
  check('une mission fermée ne compte pas : ni étoile, ni point, ni partie', refus.erreur === 'fermee' && refus.evenements.length === 0 && egal(refus.profil.scenarios, {}) && refus.profil.route.points === neuf.route.points);
  const perdue = jouer(neuf, GRENIERS, [false, false, false]);
  check('une mission perdue n’ouvre rien', !scenarioOuvert(perdue.profil, CAMP) && perdue.profil.scenarios[GRENIERS].parties === 1 && perdue.evenements[0].points === 0);
  const un = jouer(neuf, GRENIERS, [true, false, false], 372);
  check('la première gagnée : 20 points de saison, son record, et la deuxième s’ouvre', un.evenements[0].points === 20 && un.evenements.some((x) => x.type === 'record' && x.valeur === 372) && scenarioOuvert(un.profil, CAMP) && !scenarioOuvert(un.profil, GARDIEN));
  const deux = jouer(un.profil, CAMP, [true, true, false]);
  const trois = jouer(deux.profil, GARDIEN, [true, false, false]);
  const fini = etatDeLaCampagne(trois.profil)[0];
  check('les trois gagnées : le chapitre est fini, et donne le titre « Découvreur » — une fois', fini.fini && fini.etoiles === 4 && trois.evenements.filter((x) => x.type === 'piece').length === 1
    && egal(trois.evenements.find((x) => x.type === 'piece'), { type: 'piece', piece: 'campagne.grade', origine: 'campagne', doublon: false, eclats: 0 }) && fini.pieces.fini.acquise && !fini.pieces.etoiles.acquise);
  const encore = jouer(trois.profil, GARDIEN, [true, false, false]);
  check('… rejouer une mission gagnée ne redonne ni points ni titre', encore.evenements[0].points === 0 && !encore.evenements.some((x) => x.type === 'piece') && encore.profil.pieces.length === trois.profil.pieces.length);
  let p = encore.profil;
  for (const id of chapitre.missions) p = jouer(p, id, [true, true, true]).profil;
  const neufEtoiles = etatDeLaCampagne(p)[0];
  check('les neuf étoiles : la suite du titre, « de la Rive »', neufEtoiles.etoiles === 9 && neufEtoiles.pieces.etoiles.acquise && p.pieces.includes('campagne.epithete'));
  check('la campagne ne donne jamais d’Éclats ni de Couronnes : des points de saison, et de l’apparence', p.eclats === neuf.eclats && p.couronnes === neuf.couronnes && p.route.points === neuf.route.points + 9 * R.defis.points.etoile);
  check('le profil garde tout cela, et se relit tel quel', egal(migrerProfil(JSON.parse(JSON.stringify(p))), p) && etatDeScenario(p, GRENIERS).record === 372);
}

// --- Les écrans ---------------------------------------------------------------------------------
console.log('\n--- Les écrans ---');
{
  const memoire = new Map();
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); } }, configurable: true, writable: true });
  const noeud = { innerHTML: '', classList: { add() {}, remove() {} }, querySelector: () => null };
  let clic = null;
  Object.defineProperty(globalThis, 'document', { value: { getElementById: (id) => (id === 'progression' ? noeud : null), addEventListener: (t, f) => { if (t === 'click') clic = f; } }, configurable: true, writable: true });
  const toucher = (dataset) => clic({ target: { closest: () => ({ dataset }) } });
  const texte = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const poser = (profil) => memoire.set(PROGRESSION_KEY, JSON.stringify(profil));
  const propre = (html) => !/\p{Extended_Pictographic}/u.test(html) && !/undefined|NaN|\[object|\{\d\}/.test(html);
  const lances = [];
  installerProgression({ quandOnJoueUnScenario: (ref, sur) => { lances.push([ref, sur]); return 'lancee'; } });
  reglerPeuple('atlante');
  const neuf = rode(profilNeuf());
  poser(neuf);

  check('la tuile de l’accueil annonce la mission à jouer', /<b>Campagne et défis<\/b><small>Mission 1 : Pied à terre<\/small>/.test(htmlBandeau(neuf)) && /data-ecran="defis"/.test(htmlBandeau(neuf)));
  ouvrirProgression('defis');
  let page = noeud.innerHTML, t = texte(page);
  check('l’écran « Campagne et défis » : la campagne d’abord, puis le défi du jour et les deux scénarios',
    /<h2>Campagne et défis<\/h2>/.test(page) && page.indexOf('class="defi-carte campagne"') < page.indexOf('Défi du jour') && page.indexOf('Défi du jour') < page.indexOf('Tenir le Fort') && (page.match(/class="defi-carte/g) || []).length === 4 && propre(page));
  check('… le chapitre : son nom, ce qu’il raconte, ses étoiles sur neuf', /Chapitre 1 · La rive d’en face/.test(t) && /Ton peuple traverse\. En face, la terre est bonne — et déjà prise\./.test(t) && /class="campagne-compte">[\s\S]*?<\/svg> 0\/9<\/span>/.test(page));
  check('… la première mission se touche ; les deux autres portent un cadenas et disent ce qu’il faut gagner',
    (page.match(/data-ecran="mission"/g) || []).length === 1 && /data-ecran="mission" data-arg="riveGreniers"/.test(page) && (page.match(/class="mission fermee"/g) || []).length === 2
    && /Le camp d’en face Gagne d’abord la mission 1/.test(t) && /Ce que le camp gardait Gagne d’abord la mission 2/.test(t));
  check('… et ce que le chapitre donne', /Chapitre fini : le titre « Découvreur »/.test(t) && /Ses 9 étoiles : le titre « … de la Rive »/.test(t));

  ouvrirProgression('mission', GRENIERS);
  page = noeud.innerHTML; t = texte(page);
  check('l’écran d’une mission : la prêtresse raconte, puis les trois buts et « Jouer »',
    /<h2>Mission 1 · Pied à terre<\/h2>/.test(page) && /class="recit-portrait" src="assets\/portrait-pretresse\.webp"/.test(page) && /<b>Prêtresse<\/b><p>Nous avons traversé de nuit, et la terre d’en face est bonne\. Mais nos greniers sont vides, et les Solariens rôdent déjà\. Remplis-les avant qu’ils ne reviennent en nombre\.<\/p>/.test(page)
    && /Récolter 800 de nourriture en moins de 7 minutes \+20 Gagner en moins de 6 minutes \+20 Gagner en perdant moins de 2 unités \+20/.test(t) && /data-act="jouerScenario" data-arg="riveGreniers" >Jouer</.test(page) && /data-ecran="defis"/.test(page) && propre(page));
  reglerPeuple('solarien');
  ouvrirProgression('mission', GRENIERS);
  check('… chez les Solariens, c’est leur prêtre qui raconte, et les Atlantes qui rôdent', /src="assets\/portrait-sol-pretre\.webp"/.test(noeud.innerHTML) && new RegExp(`<b>${CIVILISATIONS.solarien.noms.priest.name}</b>`).test(noeud.innerHTML) && /les Atlantes rôdent déjà/.test(noeud.innerHTML));
  reglerPeuple('atlante');
  ouvrirProgression('mission', CAMP);
  check('une mission fermée ne s’ouvre pas : on retombe sur la campagne', /<h2>Campagne et défis<\/h2>/.test(noeud.innerHTML));
  ouvrirProgression('mission', GRENIERS);
  toucher({ act: 'jouerScenario', arg: GRENIERS });
  check('« Jouer » lance la mission', egal(lances, [[{ id: GRENIERS }, false]]));

  // Une victoire : la suite de l'histoire, et la mission suivante sous le doigt.
  const w = partie(GRENIERS);
  w.players[w.humanIndex].stats.gathered.food = 800;
  avancer(w, 0.1);
  const bilan = w.scenario.bilan(w.gameOver);
  let r = jouer(neuf, GRENIERS, etoilesDe(SCENARIOS[GRENIERS], bilan), bilan.temps);
  let fin = htmlFinDeScenario(SCENARIOS[GRENIERS], bilan, r.evenements, r.profil, 'atlante');
  check('la fin d’une mission gagnée : la prêtresse reprend la parole, puis la mission suivante',
    /<p class="recit-apres">Les greniers sont pleins : nous restons\. Les Solariens, eux, n’ont pas dit leur dernier mot\.<\/p>/.test(fin)
    && /<button class="btn primary campagne-suite" data-ecran="mission" data-arg="riveCamp">Mission 2 : Le camp d’en face<\/button>/.test(fin) && fin.indexOf('recit-apres') < fin.indexOf('campagne-suite') && fin.indexOf('campagne-suite') < fin.indexOf('defi-buts') && propre(fin));
  const perdu = { ...bilan, victoire: false };
  const rPerdu = jouer(neuf, GRENIERS, [false, false, false]);
  const finPerdue = htmlFinDeScenario(SCENARIOS[GRENIERS], perdu, rPerdu.evenements, rPerdu.profil, 'atlante');
  check('… perdue : ni suite de l’histoire, ni mission suivante', !/recit-apres|campagne-suite/.test(finPerdue) && /defi-fin-titre/.test(finPerdue));
  let p = jouer(r.profil, CAMP, [true, false, false]).profil;
  r = jouer(p, GARDIEN, [true, false, false]);
  fin = htmlFinDeScenario(SCENARIOS[GARDIEN], { ...bilan, victoire: true }, r.evenements, r.profil, 'atlante');
  check('la fin du chapitre : le titre gagné est annoncé, et il n’y a plus de mission suivante',
    /Tu gagnes le titre « Découvreur »\. À porter depuis ton blason\./.test(texte(fin)) && !/campagne-suite/.test(fin) && /Le monstre est à terre, et la rive est à nous\. Les Solariens parlent déjà de revanche : c’est une autre histoire\./.test(fin));
  poser(r.profil);
  ouvrirProgression('defis');
  page = noeud.innerHTML;
  check('la campagne finie : trois missions à rejouer, le titre coché, et la tuile revient au défi du jour',
    (page.match(/class="mission gagnee"/g) || []).length === 3 && /<li class="fait"><i class="pleine">[\s\S]*?Chapitre fini/.test(page) && /class="campagne-compte">[\s\S]*?<\/svg> 5\/9<\/span>/.test(page)
    && /<b>Campagne et défis<\/b><small>Aujourd’hui : /.test(htmlBandeau(r.profil)));
  ouvrirProgression('collection', 'campagne');
  check('la collection « La Campagne » dit d’où viennent ses pièces, et renvoie à la campagne', /Les pièces de la campagne : un chapitre fini donne un mot de titre, toutes ses étoiles donnent sa suite\./.test(texte(noeud.innerHTML)) && /data-ecran="defis"/.test(noeud.innerHTML));
}

// --- Dans les autres langues ------------------------------------------------------------------------
console.log('\n--- Dans les autres langues ---');
{
  /** Lance un Node neuf dans cette langue (elle se lit au chargement des modules) et rend ce que la campagne y montre. */
  const ailleurs = (langue) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    globalThis.__LANGUE = '${langue}';
    const memoire = new Map();
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); } }, configurable: true, writable: true });
    const noeud = { innerHTML: '', classList: { add() {}, remove() {} }, querySelector: () => null };
    Object.defineProperty(globalThis, 'document', { value: { getElementById: (id) => (id === 'progression' ? noeud : null), addEventListener() {} }, configurable: true, writable: true });
    const L = await import('./js/langue.js');
    const S = await import('./js/scenarios.js');
    const P = await import('./js/progression.js');
    const E = await import('./js/progression-ecrans.js');
    const D = await import('./js/defis-ecrans.js');
    const { PROGRESSION_KEY } = await import('./js/save.js');
    const texte = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim();
    const ids = ${JSON.stringify(chapitre.missions)};
    E.installerProgression({});
    E.reglerPeuple('atlante');
    const neuf = { ...P.profilNeuf(), premierJour: '2026-01-01' };
    memoire.set(PROGRESSION_KEY, JSON.stringify(neuf));
    const r = { langue: L.LANGUE };
    E.ouvrirProgression('defis'); r.defis = texte(noeud.innerHTML);
    E.ouvrirProgression('mission', ids[0]); r.mission = texte(noeud.innerHTML);
    r.tuile = texte(E.htmlBandeau(neuf));
    r.buts = ids.map((id) => S.butsDe(S.SCENARIOS[id], 'atlante')[0]);
    r.consignes = ids.map((id) => S.consigneDe(S.SCENARIOS[id], 'atlante'));
    r.recits = ids.flatMap((id) => ['avant', 'apres'].flatMap((m) => ['atlante', 'solarien'].flatMap((c) => S.recitDe(S.SCENARIOS[id], m, c))));
    let p = neuf;
    r.fins = ids.map((id) => {
      const x = P.appliquerScenario(p, { scenario: id, jour: '${JOUR}', jourDIci: '${JOUR}', etoiles: [true, false, false] });
      p = x.profil;
      return texte(D.htmlFinDeScenario(S.SCENARIOS[id], { victoire: true }, x.evenements, x.profil, 'atlante'));
    });
    memoire.set(PROGRESSION_KEY, JSON.stringify(p));
    E.ouvrirProgression('collection', 'campagne'); r.collection = texte(noeud.innerHTML);
    r.sans = [...L.SANS_TRADUCTION];
    console.log(JSON.stringify(r));`], { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26 }));
  const francais = /Chapitre|Mission \d+ : |Gagne d’abord|Récolte|Raser|greniers|maraudeurs|Prêtresse|Solariens|Découvreur|de la Rive|Tu gagnes/;

  const en = ailleurs('en');
  check('en anglais : l’écran, le chapitre, ses missions et ce qu’il donne', en.langue === 'en' && /^Campaign and challenges /.test(en.defis) && en.defis.includes('Chapter 1 · The Far Shore') && en.defis.includes('Landfall The granaries are empty. Fill them despite the raiders.')
    && en.defis.includes('The Camp Across the Way Win mission 1 first') && en.defis.includes('What the Camp Was Guarding Win mission 2 first')
    && en.defis.includes('Chapter complete: the title “Pathfinder”') && en.defis.includes('All 9 stars: the title “Far Shore …”'), en.defis.slice(0, 500));
  check('… la tuile de l’accueil et l’écran d’une mission : la prêtresse raconte, en anglais', en.tuile.includes('Campaign and challenges Mission 1: Landfall')
    && /^Mission 1 · Landfall Priestess We crossed by night, and the land on the far shore is good\. But our granaries are empty, and the Solarians are already prowling\. Fill them before they come back in force\./.test(en.mission), en.mission.slice(0, 300));
  check('… les buts et les consignes', egal(en.buts, ['Gather 800 food in under 7 minutes', 'Raze the camp: all 3 of its buildings', 'Slay the monster: Sphinx'])
    && en.consignes[0] === 'Gather 800 food in under 7 minutes. Raiders are prowling.' && en.consignes[1] === 'Their camp is on the other side of the map: raze its 3 buildings in under 10 minutes.', en.consignes.join(' | '));
  check('… le récit nomme les deux peuples et leurs monstres', en.recits.includes('Their Sphinx is marching on us, with what’s left of the Solarians.') && en.recits.includes('Their Hydra is marching on us, with what’s left of the Atlanteans.')
    && en.recits.includes('The camp of the Atlanteans is nothing but a heap of stones.') && en.recits.every((t) => !/\{\d\}|undefined/.test(t)));
  check('… la fin d’une mission, la suivante, et le titre du chapitre fini', en.fins[0].includes('The granaries are full: we’re staying. As for the Solarians, they haven’t had their last word. Mission 2: The Camp Across the Way')
    && en.fins[2].includes('You earn the title “Pathfinder”. Equip it from your crest.') && !en.fins[2].includes('Mission 4') && en.collection.includes('Campaign pieces: finishing a chapter gives a title word, and earning all its stars gives its front part. See the campaign'), en.fins[2]);
  check('… rien n’est resté en français, rien sans traduction', ![en.defis, en.mission, en.tuile, ...en.buts, ...en.consignes, ...en.recits, ...en.fins].some((t) => francais.test(t)) && en.sans.length === 0, en.sans.slice(0, 3).join(' | '));

  const es = ailleurs('es');
  check('en espagnol : l’écran, le chapitre, ses missions et ce qu’il donne', es.langue === 'es' && /^Campaña y desafíos /.test(es.defis) && es.defis.includes('Capítulo 1 · La orilla de enfrente') && es.defis.includes('Pie a tierra Los graneros están vacíos. Llénalos a pesar de los saqueadores.')
    && es.defis.includes('El campamento de enfrente Gana primero la misión 1') && es.defis.includes('Capítulo terminado: el título «Descubridor»') && es.defis.includes('Sus 9 estrellas: el título «… de la Orilla»'), es.defis.slice(0, 500));
  check('… la tuile de l’accueil et l’écran d’une mission', es.tuile.includes('Campaña y desafíos Misión 1: Pie a tierra')
    && /^Misión 1 · Pie a tierra Sacerdotisa Cruzamos de noche, y la tierra de enfrente es buena\. Pero nuestros graneros están vacíos, y los Solarianos ya rondan\. Llénalos antes de que vuelvan en gran número\./.test(es.mission), es.mission.slice(0, 300));
  check('… les buts, les consignes et le récit', egal(es.buts, ['Recolectar 800 de comida en menos de 7 minutos', 'Arrasar el campamento: sus 3 edificios', 'Abatir al monstruo: Sphinx'])
    && es.consignes[1] === 'Su campamento está al otro lado del mapa: arrasa sus 3 edificios en menos de 10 minutos.' && es.recits.includes('Su Hidra marcha hacia nosotros, con lo que queda de los Atlantes.') && es.recits.every((t) => !/\{\d\}|undefined/.test(t)), es.buts.join(' | '));
  check('… la fin d’une mission, la suivante, et le titre du chapitre fini', es.fins[0].includes('Los graneros están llenos: nos quedamos. Los Solarianos, por su parte, no han dicho su última palabra. Misión 2: El campamento de enfrente')
    && es.fins[2].includes('Ganas el título «Descubridor». Se equipa desde tu blasón.') && es.collection.includes('Ver la campaña'), es.fins[2]);
  check('… rien n’est resté en français, rien sans traduction', ![es.defis, es.mission, es.tuile, ...es.buts, ...es.consignes, ...es.recits, ...es.fins].some((t) => francais.test(t)) && es.sans.length === 0, es.sans.slice(0, 3).join(' | '));
}

// --- Le branchement ---------------------------------------------------------------------------------
console.log('\n--- Le branchement ---');
{
  const main = lire('js/main.js'), ui = lire('js/ui.js'), jeu = lire('js/game.js');
  check('la partie pose le camp à sa mise en place, et seulement là : une reprise le retrouve dans la sauvegarde', /if \(scenario\.camp\) this\.scenario\.poserLeCamp\(\);/.test(jeu) && (jeu.match(/poserLeCamp/g) || []).length === 1);
  check('on ne lance pas une mission fermée', /if \(!scenarioOuvert\(lireProgression\(\), ref\.id\)\) return 'refus';/.test(main));
  check('la partie annonce les maraudeurs sans les compter', /event\.maraudeurs \? txt\('Des maraudeurs approchent ! Touchez pour voir où'\)/.test(main));
  check('l’écran de partie compte la nourriture et les bâtiments du camp, et dit ce qui a tranché', /txt`Nourriture \$\{formatNumber\(a\.recolte\.fait\)\}\/\$\{formatNumber\(a\.recolte\.but\)\}`/.test(ui) && /txt`Camp : \$\{a\.camp\.reste\} sur \$\{a\.camp\.total\}`/.test(ui)
    && /raison === 'recolte'/.test(ui) && /raison === 'rase'/.test(ui) && /raison === 'temps' && a\.recolte/.test(ui) && /raison === 'temps' && a\.camp/.test(ui));
  check('la fin de partie sait avec quel peuple elle s’est jouée', /htmlFinDeScenario\(def, bilan, r\.evenements, r\.profil, this\.world\.players\[this\.world\.humanIndex\]\.civ\)/.test(main));
  check('les portraits des narrateurs sont gardés hors ligne, et le script des essais lance celui-ci', ["'./assets/portrait-pretresse.webp'", "'./assets/portrait-sol-pretre.webp'"].every((f) => lire('sw.js').includes(f)) && lire('package.json').includes('node test/campagne.test.js'));
}

console.log(failures ? `\n${failures} essai(s) en échec` : '\nTout est bon.');
process.exit(failures ? 1 : 0);
