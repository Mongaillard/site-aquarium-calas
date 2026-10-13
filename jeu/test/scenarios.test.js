// Les scénarios (js/scenarios.js) : des parties écrites d'avance — des vagues, un monstre-chef, un but qui
// n'est pas « raser l'autre », trois buts à étoile. Le défi du jour en est un, tiré de la date.
// Lancement : node test/scenarios.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REGLES, SCENARIOS, CHAPITRES, SEMAINE_DES_DEFIS, defiDuJour, refDeScenario, scenarioDe, optionsDeScenario, formatDe, interditesDe,
  etoilesDe, butsDe, consigneDe, nomDuChef, textesATraduire,
} from '../js/scenarios.js';
import { PROGRESSION as R } from '../js/progression-config.js';
import { profilNeuf, migrerProfil, appliquerScenario, etatDeScenario, nombreDEtoiles, etoilesAcquises } from '../js/progression.js';
import { UNIT_TYPES, BUILDING_TYPES, GAME_MODES } from '../js/config.js';
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
const avancer = (monde, secondes) => { for (let i = 0; i < Math.round(secondes * 20) && !monde.gameOver; i++) monde.update(1 / 20); };
const partie = (ref, extra = {}) => new World({ ...optionsDeScenario(ref, ['atlante', 'solarien']), difficulty: 'normal', ...extra });
/** Un joueur d'après ses premiers jours : ses points de saison ne comptent plus double. */
const rode = (profil) => ({ ...profil, premierJour: '2026-01-01' });

// --- Les données ----------------------------------------------------------------------------
console.log('--- Les règles et les scénarios ---');
check('cinq règles tordues, chacune avec un nom, un résumé et un format qui existe', Object.keys(REGLES).length === 5
  && Object.values(REGLES).every((r) => r.nom.length > 3 && r.resume.length > 10 && !!GAME_MODES[r.base] && GAME_MODES[r.base].timeLimit > 0));
check('une règle n’interdit que des troupes qui existent, jamais l’ouvrier', Object.values(REGLES).every((r) => interditesDe(r).every((t) => !!UNIT_TYPES[t] && t !== 'villager')));
check('« Tous à pied » interdit toute la cavalerie, et rien qu’elle', egal(interditesDe(REGLES.aPied).sort(), Object.keys(UNIT_TYPES).filter((t) => UNIT_TYPES[t].class === 'cavalry').sort()));
check('« Mur de lances » ne laisse que ses trois troupes', (() => { const i = interditesDe(REGLES.lances); return !i.includes('spearman') && !i.includes('pavoisier') && !i.includes('sapeur') && i.includes('militia') && i.includes('archer') && i.includes('scout'); })());
check('« Tir groupé » offre une archerie : sans elle, rien ne se formerait', REGLES.tirGroupe.format.batimentsDeDepart.includes('archery') && REGLES.tirGroupe.seules.every((t) => UNIT_TYPES[t].from === 'archery'));
check('une règle sans interdit n’interdit rien', interditesDe(REGLES.fourmiliere).length === 0 && interditesDe(null).length === 0);
for (const s of Object.values(SCENARIOS)) {
  check(`${s.nom} : un format, une carte fixe, trois buts à étoile`, !!GAME_MODES[s.base] && Number.isInteger(s.graine) && s.etoiles.length === 3 && butsDe(s).every((b) => b.length > 5) && new Set(butsDe(s)).size === 3);
  check(`${s.nom} : sa consigne de départ tient en une phrase lisible`, consigneDe(s).length > 20 && !/undefined|NaN/.test(consigneDe(s)));
}
{
  const v = SCENARIOS.survie.vagues;
  check('la Survie : douze vagues, une par minute, des troupes qui existent', v.length === 12 && v.every((x, i) => x.a === 60 * (i + 1)) && v.every((x) => Object.entries(x.troupes).every(([t, n]) => !!UNIT_TYPES[t] && Number.isInteger(n) && n > 0)));
  const taille = (x) => Object.values(x.troupes).reduce((s, n) => s + n, 0);
  check('ses vagues grossissent : la dernière vaut trois fois la première, et amène l’Hydre', taille(v[11]) >= 3 * taille(v[0]) && v[11].troupes.hydra === 1 && taille(v[5]) > taille(v[0]));
  check('ses étoiles récompensent le chemin : la vague 6, la vague 9, puis toutes', egal(SCENARIOS.survie.etoiles, [{ genre: 'vague', seuil: 6 }, { genre: 'vague', seuil: 9 }, { genre: 'victoire' }]));
  const c = SCENARIOS.hydre.chef;
  check('le monstre-chef : une Hydre de 2 000 points de vie, deux phases, huit minutes', c.type === 'hydra' && c.vie === 2000 && c.phases.length === 2 && c.phases[0].sous > c.phases[1].sous && SCENARIOS.hydre.but.avant === 480 && nomDuChef(SCENARIOS.hydre) === 'Hydre');
  const vus = []; textesATraduire((objet, champ) => vus.push(objet[champ]));
  // (Un nom et un résumé par règle, par scénario et par chapitre de la campagne, le résumé du samedi, et le récit des missions — test/campagne.test.js.)
  const recits = Object.values(SCENARIOS).reduce((n, s) => n + (s.recit ? s.recit.avant.length + s.recit.apres.length : 0), 0);
  check('tous leurs textes se traduisent : noms, résumés et récits', vus.length === (Object.keys(REGLES).length + Object.keys(SCENARIOS).length + Object.keys(CHAPITRES).length) * 2 + 1 + recits && vus.every((t) => typeof t === 'string' && t.length > 3));
}

// --- Le défi du jour ---------------------------------------------------------------------------
console.log('--- Le défi du jour ---');
{
  const lundi = defiDuJour('2026-10-12'), mardi = defiDuJour('2026-10-13'), samedi = defiDuJour('2026-10-17'), dimanche = defiDuJour('2026-10-18');
  check('chaque jour de la semaine a le sien : sept entrées, des règles et des scénarios qui existent', SEMAINE_DES_DEFIS.length === 7 && SEMAINE_DES_DEFIS.every((q) => !!REGLES[q] || !!SCENARIOS[q]));
  check('le lundi 12 octobre 2026, c’est « Tous à pied » ; le mardi, « Mur de lances »', lundi.regle === 'aPied' && lundi.nom === 'Tous à pied' && mardi.regle === 'lances');
  check('le samedi : la Survie en huit vagues ; le dimanche : le monstre-chef', samedi.modele === 'survie' && samedi.vagues.length === 8 && samedi.but.genre === 'tenir' && dimanche.modele === 'hydre' && dimanche.chef.vie === 2000);
  check('le même jour donne le même défi, à tous', egal(defiDuJour('2026-10-12'), lundi));
  check('la règle revient la semaine suivante, sur une autre carte', defiDuJour('2026-10-19').regle === 'aPied' && defiDuJour('2026-10-19').graine !== lundi.graine);
  check('deux jours qui se suivent n’ont ni la même règle ni la même carte', lundi.graine !== mardi.graine && lundi.nom !== mardi.nom);
  check('un défi fait d’une règle se joue contre l’ordinateur, avec trois buts : gagner, gagner net, peu de pertes', lundi.adversaire === 'ordinateur' && egal(lundi.etoiles.map((e) => e.genre), ['victoire', 'net', 'pertes']) && butsDe(lundi).length === 3);
  check('le défi ne garde pas de record : il change chaque jour', lundi.record === null && samedi.record === null && dimanche.record === null);
  check('un jour illisible n’a pas de défi', defiDuJour('hier') === null && defiDuJour('2026-13-40') === null && defiDuJour(undefined) === null);
  check('une référence se lit : un nom connu, ou le défi d’un jour', egal(refDeScenario('survie'), { id: 'survie' }) && egal(refDeScenario({ id: 'defi', jour: '2026-10-12' }), { id: 'defi', jour: '2026-10-12' })
    && refDeScenario('rien') === null && refDeScenario({ id: 'defi' }) === null && refDeScenario({ id: 'defi', jour: 'x' }) === null && refDeScenario(null) === null && refDeScenario('toString') === null);
  check('une référence mène à son scénario', scenarioDe('hydre') === SCENARIOS.hydre && scenarioDe({ id: 'defi', jour: '2026-10-12' }).regle === 'aPied' && scenarioDe('rien') === null);
  const o = optionsDeScenario({ id: 'survie' }, ['solarien', 'solarien']);
  check('les réglages d’une partie de scénario : son format, sa carte, le peuple du joueur, personne en face', o.mode === 'escarmouche' && o.seed === SCENARIOS.survie.graine && egal(o.civs, ['solarien', 'atlante']) && egal(o.places, ['local', 'distant']) && egal(o.scenario, { id: 'survie' }));
  check('un défi contre l’ordinateur garde le peuple choisi en face, et un ordinateur', (() => { const r = optionsDeScenario({ id: 'defi', jour: '2026-10-12' }, ['atlante', 'solarien']); return egal(r.civs, ['atlante', 'solarien']) && !r.places && r.mode === 'express'; })());
  check('un scénario inconnu n’a pas de réglages', optionsDeScenario('rien') === null);
  check('le format d’un scénario : celui qu’il emprunte, ce qu’il y change, et son nom', formatDe(SCENARIOS.survie).popMax === 40 && formatDe(SCENARIOS.survie).timeLimit === 0 && formatDe(SCENARIOS.survie).name === 'Tenir le Fort' && formatDe(SCENARIOS.survie).resources.food === 1000
    && GAME_MODES.escarmouche.popMax === 30 && GAME_MODES.escarmouche.name === 'Escarmouche');
}

// --- Les étoiles ---------------------------------------------------------------------------------
console.log('--- Les buts à étoile ---');
{
  const regle = defiDuJour('2026-10-12');
  check('gagner au temps : une étoile ; raser avant la fin : deux ; avec peu de pertes : trois', egal(etoilesDe(regle, { victoire: true, auTemps: true, pertes: 12 }), [true, false, false])
    && egal(etoilesDe(regle, { victoire: true, auTemps: false, pertes: 12 }), [true, true, false]) && egal(etoilesDe(regle, { victoire: true, auTemps: false, pertes: 7 }), [true, true, true]));
  check('une défaite ne donne aucune étoile de victoire, même sans pertes', egal(etoilesDe(regle, { victoire: false, auTemps: false, pertes: 0 }), [false, false, false]));
  check('la Survie paie le chemin : une étoile à la vague 6, même si la base tombe ensuite', egal(etoilesDe(SCENARIOS.survie, { victoire: false, vague: 7 }), [true, false, false])
    && egal(etoilesDe(SCENARIOS.survie, { victoire: false, vague: 9 }), [true, true, false]) && egal(etoilesDe(SCENARIOS.survie, { victoire: true, vague: 12 }), [true, true, true]) && egal(etoilesDe(SCENARIOS.survie, { victoire: false, vague: 5 }), [false, false, false]));
  check('le monstre-chef : l’abattre, l’abattre vite, garder son bâtiment principal', egal(etoilesDe(SCENARIOS.hydre, { victoire: true, temps: 400, centre: 30 }), [true, false, false])
    && egal(etoilesDe(SCENARIOS.hydre, { victoire: true, temps: 359, centre: 50 }), [true, true, true]) && egal(etoilesDe(SCENARIOS.hydre, { victoire: false, temps: 100, centre: 100 }), [false, false, false]));
  check('sans bilan, aucune étoile', egal(etoilesDe(SCENARIOS.hydre, null), [false, false, false]));
}

// --- Dans la partie : les vagues -----------------------------------------------------------------
console.log('--- Dans la partie : les vagues ---');
{
  const ordinaire = new World({ mode: 'escarmouche', difficulty: 'normal', seed: 4242 });
  check('sans scénario, la partie n’en a pas, et son format est celui du jeu', ordinaire.scenario === null && ordinaire.mode === GAME_MODES.escarmouche);
  const w = partie({ id: 'survie' });
  check('la Survie : personne ne bâtit en face — ni bâtiment, ni troupe, ni ordinateur', w.buildings.every((b) => b.playerIndex === 0) && w.units.every((u) => u.playerIndex <= 0) && w.ais.length === 0 && w.places[1].controle === 'distant');
  check('le joueur a sa base d’Escarmouche, son bâtiment principal entier, et de la place pour 40', w.buildings.some((b) => b.type === 'barracks') && w.buildings.find((b) => b.type === 'towncenter').maxHp === Math.round(BUILDING_TYPES.towncenter.hp * 1.2) && w.popMax === 40 && w.players[0].resources.food === 1000);
  check('pas de rival dans un scénario', partie({ id: 'survie' }, { rival: 'nefer' }).rival === null);
  check('les vagues entrent par trois portes au plus, toutes sur la carte', w.scenario.portes.length >= 1 && w.scenario.portes.length <= 3 && w.scenario.portes.every((p) => p.x > 0 && p.y > 0 && p.x < w.map.pixelWidth && p.y < w.map.pixelHeight));
  check('avant la première minute, rien n’est entré ; l’écran dit « vague 0 sur 12 » et le temps qu’il reste', (() => { avancer(w, 30); const a = w.scenario.affichage(); return w.scenario.vague === 0 && a.vague === 0 && a.vagues === 12 && a.dans === 30 && w.scenario.troupes().length === 0; })());
  w.drainEvents();
  avancer(w, 31);
  const annonce = w.drainEvents().find((e) => e.type === 'vague');
  check('à une minute, la première vague entre : trois miliciens, et la partie le dit', w.scenario.vague === 1 && w.scenario.troupes().length === 3 && w.scenario.troupes().every((u) => u.type === 'militia') && !!annonce && annonce.numero === 1 && annonce.total === 12);
  check('elle marche sur la base du joueur', w.scenario.troupes().every((u) => u.destination || u.target || u.path));
  avancer(w, 60);
  check('à deux minutes, la deuxième', w.scenario.vague === 2);
  // Un joueur qui ne fait rien : sa base finit par tomber.
  avancer(w, 600);
  check('un joueur qui ne fait rien perd sa base : défaite, et le scénario dit pourquoi', !!w.gameOver && w.gameOver.victory === false && w.gameOver.winner === 1 && w.gameOver.scenario.id === 'survie' && w.gameOver.scenario.raison === 'centre');
  const bilan = w.scenario.bilan(w.gameOver);
  check('son bilan : pas de victoire, la vague atteinte, plus de bâtiment principal', bilan.victoire === false && bilan.vague === w.scenario.vague && bilan.vague >= 3 && bilan.centre === 0 && bilan.temps === Math.floor(w.time));
  check('le résultat ne porte pas de score : un scénario à but ne se joue pas aux points', !('scores' in w.gameOver));
}
{
  // Toutes les vagues repoussées : on les fait tomber une à une.
  const w = partie({ id: 'defi', jour: '2026-10-17' });
  let pas = 0;
  while (!w.gameOver && pas++ < 20 * 600) {
    w.update(1 / 20);
    for (const u of w.scenario.troupes()) w.killEntity(u, w.units.find((x) => x.playerIndex === 0));
  }
  check('toutes les vagues repoussées : victoire, « tenu »', !!w.gameOver && w.gameOver.victory === true && w.gameOver.scenario.raison === 'tenu' && w.scenario.vague === 8 && Math.round(w.time) === 480);
  check('le défi du samedi donne alors ses trois étoiles', egal(etoilesDe(w.scenario.def, w.scenario.bilan(w.gameOver)), [true, true, true]));
  check('la sauvegarde d’un défi garde son jour', (() => { const s = serializeWorld(partie({ id: 'defi', jour: '2026-10-17' })); return s.scenario.id === 'defi' && s.scenario.jour === '2026-10-17'; })());
}

// --- Dans la partie : le monstre-chef --------------------------------------------------------------
console.log('--- Dans la partie : le monstre-chef ---');
{
  const w = partie({ id: 'hydre' });
  check('avant son heure, le monstre n’est pas là ; l’écran dit dans combien de temps', (() => { avancer(w, 60); const a = w.scenario.affichage(); return w.scenario.monstre() === null && a.chef.nom === 'Hydre' && a.chef.vie === 2000 && a.chef.dans === 30; })());
  w.drainEvents();
  avancer(w, 31);
  const m = w.scenario.monstre();
  check('à son heure il entre, avec ses 2 000 points de vie', !!m && m.type === 'hydra' && m.maxHp === 2000 && m.hp === 2000 && m.chef === true && m.playerIndex === 1 && w.drainEvents().some((e) => e.type === 'chef' && e.etape === 'entre' && e.nom === 'Hydre'));
  check('les autres Hydres du jeu gardent leurs 280 points de vie, et le monstre n’a pas le soin de celle des Atlantes', UNIT_TYPES.hydra.hp === 280 && m.def === UNIT_TYPES.hydra && !m.def.regen);
  m.hp = 1300;
  avancer(w, 1);
  const renforts = w.scenario.troupes().filter((u) => u.type === 'militia');
  check('sous les deux tiers de sa vie, il appelle quatre soldats, une fois', w.scenario.phase === 1 && renforts.length === 4 && w.drainEvents().some((e) => e.type === 'chef' && e.etape === 'renforts'));
  avancer(w, 5);
  check('… et pas une seconde fois', w.scenario.troupes().filter((u) => u.type === 'militia').length <= 4 && w.scenario.phase === 1);
  m.hp = 600;
  avancer(w, 1);
  check('sous le tiers, il enrage : il frappe plus vite, lui seul', w.scenario.phase === 2 && m.def.attackSpeed === 1.5 && m.def !== UNIT_TYPES.hydra && UNIT_TYPES.hydra.attackSpeed === 2.0 && w.drainEvents().some((e) => e.type === 'chef' && e.etape === 'rage'));
  // La sauvegarde : le monstre garde sa vie, ses phases jouées et ce qu'elles ont changé.
  const copie = JSON.parse(JSON.stringify(serializeWorld(w)));
  const repris = restoreWorld(copie);
  const m2 = repris.scenario.monstre();
  check('une partie reprise retrouve son monstre : sa vie, ses phases, sa rage', !!m2 && m2.id === m.id && m2.maxHp === 2000 && Math.round(m2.hp) === Math.round(m.hp) && repris.scenario.phase === 2 && m2.def.attackSpeed === 1.5 && m2.chef === true && repris.scenario.chefEntre === true);
  check('… et son format : le chronomètre, la place pour 40, personne en face', repris.mode.timeLimit === 480 && repris.popMax === 40 && repris.ais.length === 0 && repris.mode.name === 'Le réveil de l’Hydre');
  avancer(w, 20); avancer(repris, 20);
  const empreinte = (monde) => monde.units.map((u) => `${u.id}:${Math.round(u.x)}:${Math.round(u.y)}:${Math.round(u.hp)}`).join('|');
  check('reprise ou non, la partie continue du même pas', empreinte(w) === empreinte(repris) && w.scenario.phase === repris.scenario.phase);
  w.killEntity(m, w.units.find((u) => u.playerIndex === 0));
  avancer(w, 1);
  check('le monstre abattu : victoire, « abattu »', !!w.gameOver && w.gameOver.victory === true && w.gameOver.scenario.raison === 'abattu');
  check('à l’écran, sa vie est à zéro', w.scenario.affichage().chef.vie === 0);
  const lent = partie({ id: 'hydre' });
  // (Un monstre qui ne frappe pas : le joueur ne perd pas sa base, mais le temps passe.)
  avancer(lent, 95);
  lent.scenario.monstre().def = { ...UNIT_TYPES.hydra, attack: 0, bonus: {}, speed: 0 };
  lent.scenario.monstre().stop();
  avancer(lent, 400);
  check('huit minutes sans l’abattre : défaite, « temps »', !!lent.gameOver && lent.gameOver.victory === false && lent.gameOver.scenario.raison === 'temps' && Math.round(lent.time) === 480);
  check('une sauvegarde de scénario inconnu ne se reprend pas à moitié', restoreWorld({ ...copie, scenario: { id: 'rien' } }) === null);
  check('une partie ordinaire ne porte pas le champ', !('scenario' in serializeWorld(new World({ mode: 'escarmouche', difficulty: 'normal', seed: 7 }))));
}

// --- Dans la partie : les règles tordues -------------------------------------------------------------
console.log('--- Dans la partie : les règles tordues ---');
{
  const lundi = partie({ id: 'defi', jour: '2026-10-12' });
  check('« Tous à pied » : la cavalerie est interdite aux deux camps, et personne n’a d’éclaireur', lundi.players.every((j) => j.interdites.has('scout') && j.interdites.has('knight') && j.interdites.has('horseArcher') && !j.interdites.has('militia'))
    && lundi.units.every((u) => u.type !== 'scout') && lundi.ais.length === 1);
  check('… ajoutée à ce que le joueur n’a pas débloqué', (() => { const w = partie({ id: 'defi', jour: '2026-10-12' }, { troupesInterdites: [['champion'], []] }); return w.players[0].interdites.has('champion') && w.players[0].interdites.has('scout') && !w.players[1].interdites.has('champion'); })());
  const refus = lundi.canTrain(lundi.spawnBuilding(0, 'stable', 16, 30, true), 'scout');
  check('une troupe interdite ne se forme pas, et le jeu dit que c’est la règle — pas une troupe à débloquer', refus.ok === false && refus.reason === 'La règle du défi l’interdit'
    && /la règle du défi l’interdit/.test(lire('js/ui.js')));
  check('hors scénario, rien n’est interdit par une règle', new World({ mode: 'escarmouche', difficulty: 'normal', seed: 7 }).interditesParLaRegle.size === 0);
  check('ce défi-là se juge comme une partie ordinaire : pas de but à lui', lundi.scenario.juge === false && lundi.mode.timeLimit === 600 && lundi.mode.name === 'Tous à pied');
  const fourmis = partie({ id: 'defi', jour: '2026-10-14' });
  check('« Fourmilière » : quinze ouvriers par camp, et de la place pour 60', fourmis.units.filter((u) => u.playerIndex === 0 && u.isVillager).length === 15 && fourmis.units.filter((u) => u.playerIndex === 1 && u.isVillager).length === 15 && fourmis.popMax === 60 && fourmis.players[0].popCap >= 16);
  const papier = partie({ id: 'defi', jour: '2026-10-16' });
  // (Le quart de 1 400 : 350 pour le Solarien d'en face ; 420 pour le joueur atlante, dont les bâtiments ont 20 % de vie en plus.)
  check('« Palais de papier » : les bâtiments principaux n’ont que le quart de leur vie', papier.buildings.filter((b) => b.type === 'towncenter').map((b) => b.maxHp).join() === '420,350');
  const tir = partie({ id: 'defi', jour: '2026-10-15' });
  check('« Tir groupé » : une archerie au départ pour chacun, pas de caserne', tir.buildings.filter((b) => b.type === 'archery').length === 2 && !tir.buildings.some((b) => b.type === 'barracks'));
  // Une partie de règle finit comme une autre, et se reprend.
  const repris = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(tir))));
  check('une partie de règle reprise garde sa règle', repris.scenario.def.regle === 'tirGroupe' && repris.players[0].interdites.has('militia') && repris.mode.name === 'Tir groupé');
  avancer(tir, 301);
  check('elle finit comme une Escarmouche — au temps ou bâtiment principal rasé —, avec ses scores', !!tir.gameOver && Array.isArray(tir.gameOver.scores) && !tir.gameOver.scenario && tir.time <= 300.1);
  check('son bilan dit si elle s’est finie au temps : c’est ce qui sépare « gagner » de « gagner net »', tir.scenario.bilan({ victory: true, timeUp: true }).auTemps === true && tir.scenario.bilan({ victory: true }).auTemps === false
    && tir.scenario.bilan(tir.gameOver).auTemps === !!tir.gameOver.timeUp);
}

// --- Ce que les étoiles rapportent --------------------------------------------------------------------
console.log('--- Les étoiles au profil ---');
{
  const point = R.defis.points.etoile;
  check('une étoile rapporte un nombre rond de points de saison, et jamais d’Éclats', Number.isInteger(point) && point > 0 && point % 10 === 0 && egal(Object.keys(R.defis.points), ['etoile']));
  check('un profil neuf n’a ni étoile ni record', egal(profilNeuf().defi, { jour: '', acquis: 0, reussis: 0 }) && egal(profilNeuf().scenarios, {}));
  check('les étoiles se comptent : 0, 1, 2, 3', nombreDEtoiles(0) === 0 && nombreDEtoiles(1) === 1 && nombreDEtoiles(5) === 2 && nombreDEtoiles(7) === 3 && egal(etoilesAcquises(5), [true, false, true]));
  let p = rode(profilNeuf());
  let r = appliquerScenario(p, { scenario: 'survie', jour: '2026-10-13', etoiles: [true, false, false], record: 7, sens: 'haut' });
  check('une première étoile paie ses points, et entre au profil avec le record', r.profil.route.points === point && r.profil.scenarios.survie.acquis === 1 && r.profil.scenarios.survie.record === 7 && r.profil.scenarios.survie.parties === 1
    && r.evenements[0].type === 'etoiles' && r.evenements[0].nouvelles === 1 && r.evenements[0].points === point && r.evenements.some((e) => e.type === 'record' && e.valeur === 7 && e.ancien === 0));
  check('les Éclats et les coffres ne bougent pas', r.profil.eclats === 0 && r.profil.coffres.length === 0 && r.profil.couronnes === 0);
  const avant = r.profil.route.points;
  r = appliquerScenario(r.profil, { scenario: 'survie', jour: '2026-10-13', etoiles: [true, false, false], record: 6, sens: 'haut' });
  check('la même étoile ne se paie pas deux fois, et un record moins bon ne remplace rien', r.profil.route.points === avant && r.evenements[0].nouvelles === 0 && r.evenements[0].points === 0 && !r.evenements.some((e) => e.type === 'record') && r.profil.scenarios.survie.record === 7 && r.profil.scenarios.survie.parties === 2);
  r = appliquerScenario(r.profil, { scenario: 'survie', jour: '2026-10-14', etoiles: [true, true, true], record: 12, sens: 'haut' });
  check('les deux étoiles qui manquaient se paient, le record monte', r.profil.route.points === 3 * point && r.evenements[0].nouvelles === 2 && egal(r.evenements[0].acquis, [true, true, true]) && r.profil.scenarios.survie.record === 12);
  r = appliquerScenario(r.profil, { scenario: 'hydre', jour: '2026-10-14', etoiles: [true, false, true], record: 437, sens: 'bas' });
  r = appliquerScenario(r.profil, { scenario: 'hydre', jour: '2026-10-14', etoiles: [true, false, false], record: 462, sens: 'bas' });
  check('un record de temps : le plus court tient', r.profil.scenarios.hydre.record === 437 && r.profil.scenarios.hydre.acquis === 5);
  r = appliquerScenario(r.profil, { scenario: 'hydre', jour: '2026-10-14', etoiles: [true, true, false], record: 350, sens: 'bas' });
  check('… et un temps plus court le bat', r.profil.scenarios.hydre.record === 350 && r.evenements.some((e) => e.type === 'record' && e.ancien === 437) && r.profil.scenarios.hydre.acquis === 7);
  check('une défaite ne laisse pas de record de temps', appliquerScenario(rode(profilNeuf()), { scenario: 'hydre', jour: '2026-10-14', etoiles: [false, false, false], record: 0, sens: 'bas' }).profil.scenarios.hydre.record === 0);

  // Le défi du jour : une fois par jour.
  r = appliquerScenario(rode(profilNeuf()), { scenario: 'defi', jour: '2026-10-13', etoiles: [true, false, false] });
  check('le défi du jour paie ses étoiles le jour même', r.profil.route.points === point && egal(r.profil.defi, { jour: '2026-10-13', acquis: 1, reussis: 1 }) && r.evenements[0].payees === true);
  r = appliquerScenario(r.profil, { scenario: 'defi', jour: '2026-10-13', etoiles: [true, true, false] });
  check('rejoué le même jour, il ne paie que l’étoile neuve', r.profil.route.points === 2 * point && r.profil.defi.acquis === 3 && r.profil.defi.reussis === 1);
  r = appliquerScenario(r.profil, { scenario: 'defi', jour: '2026-10-14', etoiles: [true, false, false] });
  check('le lendemain, ses étoiles repartent de zéro et se paient de nouveau', r.profil.route.points === 3 * point && egal(r.profil.defi, { jour: '2026-10-14', acquis: 1, reussis: 2 }));
  const hier = appliquerScenario(r.profil, { scenario: 'defi', jour: '2026-10-13', jourDIci: '2026-10-14', etoiles: [true, true, true] });
  check('le défi d’hier, fini aujourd’hui, ne paie plus rien et ne touche pas à celui du jour', hier.profil.route.points === r.profil.route.points && egal(hier.profil.defi, r.profil.defi) && hier.evenements[0].payees === false && hier.evenements[0].points === 0);
  check('l’état d’un scénario se lit : ses étoiles, leur nombre, son record', (() => { const e = etatDeScenario(r.profil, 'defi', '2026-10-14'); const f = etatDeScenario(r.profil, 'defi', '2026-10-15'); const s = etatDeScenario(r.profil, 'survie');
    return egal(e.acquis, [true, false, false]) && e.etoiles === 1 && f.etoiles === 0 && s.etoiles === 0 && s.record === 0; })());
  const double = appliquerScenario({ ...profilNeuf(), premierJour: '2026-10-10' }, { scenario: 'defi', jour: '2026-10-13', etoiles: [true, false, false] });
  check('les sept premiers jours d’un joueur, ses étoiles comptent double, comme le reste', double.profil.route.points === point * R.saisons.premiersJours.facteur);
  check('sans scénario lisible, rien ne change', appliquerScenario(profilNeuf(), { scenario: 'pas un nom !' }).erreur === 'scenario' && appliquerScenario(profilNeuf(), null).erreur === 'scenario');
  const range = migrerProfil(JSON.parse(JSON.stringify(r.profil)));
  check('le profil rangé puis relu garde ses étoiles', egal(range.defi, r.profil.defi) && egal(range.scenarios, r.profil.scenarios));
  check('un profil abîmé retrouve des valeurs saines', (() => { const m = migrerProfil({ defi: { jour: 'x', acquis: 99, reussis: -3 }, scenarios: { survie: { acquis: 99, record: -1 }, 'pas bon': { acquis: 1 } } });
    return egal(m.defi, { jour: '', acquis: 0, reussis: 0 }) && egal(m.scenarios, { survie: { acquis: 7, record: 0, parties: 0 } }); })());
  check('le mois qui tourne ferme la saison avant de payer', (() => { const q = appliquerScenario({ ...rode(profilNeuf()), parties: 3, saison: 1, route: { points: 100, passe: false, pris: { gratuit: [], passe: [] } } }, { scenario: 'survie', jour: '2026-11-02', etoiles: [true, false, false] });
    return q.profil.saison === 2 && q.profil.route.points === point && q.evenements.some((e) => e.type === 'saison'); })());
}

// --- Le branchement ------------------------------------------------------------------------------------
console.log('--- Le branchement ---');
{
  const main = lire('js/main.js'), ecrans = lire('js/progression-ecrans.js'), defis = lire('js/defis-ecrans.js'), ui = lire('js/ui.js');
  check('l’accueil porte la tuile « Défis », qui ouvre l’écran', /htmlTuileDesDefis\(profil, jourLocal\(\)\)/.test(ecrans) && /data-ecran="defis"/.test(defis) && /\.\.\.ECRANS_DES_DEFIS/.test(ecrans));
  check('« Jouer » lance le scénario, et demande un second toucher quand une partie dort', /quandOnJoueUnScenario: lancerScenario/.test(main) && /if \(loadSave\(\) && !sur\) return 'confirmer';/.test(main) && /data-act="jouerScenario"/.test(defis));
  check('contre des vagues, les troupes du joueur jouent à leur niveau ; contre l’ordinateur, il a la force de la ligue', /reglagesDePartie\(lireProgression\(\), def\.adversaire === 'aucun' \? 'libre' : 'classe'\)/.test(main));
  check('une partie de scénario ne compte ni au classement ni au palmarès : elle a ses étoiles', /if \(this\.scenario\) this\.ui\.showGameOver\(event\.result, null, this\.compterScenario\(event\.result\)\);/.test(main) && /classee: false, partieId: null/.test(main));
  check('la partie annonce chaque vague et chaque humeur du monstre', /case 'vague':/.test(main) && /txt`Vague \$\{event\.numero\} sur \$\{event\.total\} en approche`/.test(main) && /case 'chef':/.test(main));
  check('« Rejouer » relance le même scénario', /if \(this\.scenario\) \{ startGame\(partieDeScenario\(this\.scenario\.ref\)\); return; \}/.test(main));
  check('l’écran de partie montre les vagues et la vie du monstre', /majScenario\(a\)/.test(ui) && lire('index.html').includes('id="scenario-box"') && lire('index.html').includes('id="chef-box"'));
  check('les étoiles sont une icône du jeu, pas un caractère', lire('js/icones.js').includes("etoile: { n: 'étoile (dessin original)'") && !/[★☆⭐]/.test(defis + lire('js/scenarios.js') + ui));
  check('le jeu hors ligne garde les modules et leur feuille, et le script des essais lance celui-ci', ["'./js/scenarios.js'", "'./js/defis-ecrans.js'", "'./css/defis.css'"].every((f) => lire('sw.js').includes(f)) && lire('package.json').includes('node test/scenarios.test.js') && lire('index.html').includes('css/defis.css'));
}

console.log(failures ? `\n${failures} essai(s) en échec` : '\nTout est bon.');
process.exit(failures ? 1 : 0);
