// L'adversaire, seconde vague de réglages : un niveau Facile qui laisse le
// temps d'apprendre (trêve, petites vagues, annonce), et la tour habitée qui ne
// paralyse plus l'IA (troupe abritée ignorée, alerte bornée, épargne maintenue,
// assaut du bâtiment qui tire). Tout se joue sans navigateur : le monde tourne,
// on regarde ce que fait l'IA — pas ce que dit son code.
// Lancement : node test/reglages-ia.test.js

import { World } from '../js/game.js';
import { serializeWorld, restoreWorld } from '../js/save.js';
import { TICKS_PER_SECOND, TILE } from '../js/config.js';

const DT = 1 / TICKS_PER_SECOND;
let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? '  ok  ' : ' FAIL ';
  if (!condition) failures++;
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

/** Un scénario : une exception y compte pour un échec, sans taire les suivants. */
function essai(nom, scenario) {
  try { scenario(); } catch (e) { check(`${nom} (exception)`, false, e.message); }
}

const mmss = (t) => (t == null ? '--' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
const centre = (w, i) => w.buildings.find((b) => b.playerIndex === i && b.type === 'towncenter' && !b.dead);
const armee = (w, i = 1) => w.units.filter((u) => !u.dead && u.playerIndex === i && !u.isVillager && !u.isAnimal);
const ouvriers = (w, i = 1) => w.units.filter((u) => !u.dead && u.playerIndex === i && u.isVillager);

/** Fait tourner le monde jusqu'à l'heure dite ; `chaque()` est appelé après chaque pas, et arrête s'il rend vrai. */
function jouer(w, heure, chaque) {
  while (w.time < heure - 1e-6 && !w.gameOver) {
    w.update(DT);
    if (chaque && chaque()) return;
  }
}

/**
 * Le relevé d'une partie contre l'IA (joueur 1), à appeler à chaque pas :
 *   annonces : les messages « L'ennemi prépare une attaque » reçus par le joueur ;
 *   vagues   : l'heure de chaque vague et ses partants — les troupes que ce pas
 *              vient de lancer vers la base du joueur ;
 *   sortie   : la première fois qu'une troupe adverse est à plus de 24 cases de
 *              son centre (elle a quitté sa base) ;
 *   coup     : le premier coup reçu par le joueur ;
 *   ages     : l'heure de chaque passage d'âge de l'IA.
 */
function releve(w) {
  const ai = w.ais[0];
  const base = { x: centre(w, 0).x, y: centre(w, 0).y };
  const camp = { x: centre(w, 1).x, y: centre(w, 1).y };
  const r = { annonces: [], vagues: [], sortie: null, coup: null, ages: [], messages: 0 };
  const partis = new Set();
  let vues = 0, age = w.players[1].age, pas = 0;
  r.pas = () => {
    pas++;
    if (ai.waveCount > vues) {
      vues = ai.waveCount;
      const partants = armee(w).filter((u) => !partis.has(u.id) && ((u.target && u.target.playerIndex === 0)
        || (u.destination && Math.hypot(u.destination.x - base.x, u.destination.y - base.y) < 30 * TILE)));
      for (const u of partants) partis.add(u.id);
      r.vagues.push({ t: w.time, partants: partants.length });
    }
    if (w.players[1].age > age) { age = w.players[1].age; r.ages.push(w.time); }
    if (r.sortie === null && pas % 10 === 0
        && armee(w).some((u) => Math.hypot(u.x - camp.x, u.y - camp.y) > 24 * TILE)) r.sortie = w.time;
    for (const e of w.drainEvents()) {
      if (e.type === 'underAttack' && r.coup === null) r.coup = w.time;
      if (e.type === 'notice' && /prépare une attaque/.test(e.text)) r.annonces.push({ t: w.time, text: e.text });
    }
  };
  return r;
}

/**
 * Un emplacement pour une tour du joueur, à `d` cases au moins du centre
 * adverse : du côté de la base du joueur (« devant », sur le chemin des
 * vagues) ou à l'opposé (« derriere »).
 */
function emplacementTour(w, d, cote) {
  const eux = centre(w, 1), moi = centre(w, 0);
  w.players[0].age = Math.max(1, w.players[0].age);   // la tour est un bâtiment de l'Âge Féodal
  let best = null, bestD = Infinity;
  for (let ty = 0; ty < w.map.h; ty++) for (let tx = 0; tx < w.map.w; tx++) {
    const cx = (tx + 1) * TILE, cy = (ty + 1) * TILE;
    const de = Math.hypot(cx - eux.x, cy - eux.y) / TILE;
    if (de < d || de > d + 1.5 || !w.canPlace(0, 'tower', tx, ty, true)) continue;
    const dm = Math.hypot(cx - moi.x, cy - moi.y) * (cote === 'derriere' ? -1 : 1);
    if (dm < bestD) { bestD = dm; best = { tx, ty }; }
  }
  if (!best) throw new Error('aucun emplacement pour la tour');
  return best;
}

/** La tour habitée du tour de table : une tour du joueur près de la base adverse, `occupants` ouvriers dedans. */
function tourHabitee(w, d, cote, occupants = 1) {
  const e = emplacementTour(w, d, cote);
  const tour = w.spawnBuilding(0, 'tower', e.tx, e.ty, true);
  for (let k = 0; k < occupants; k++) tour.addToGarrison(w.spawnUnit(0, 'villager', tour.x, tour.y + TILE * 2));
  return tour;
}

/** Des troupes de plus pour l'IA, posées à son camp, au pied de son centre. */
function renfort(w, type, n) {
  const tc = centre(w, 1);
  const troupe = [];
  for (let k = 0; k < n; k++) troupe.push(w.spawnUnit(1, type, tc.x + (k % 4 - 1.5) * TILE, tc.y + (4 + Math.floor(k / 4)) * TILE));
  return troupe;
}

console.log('=== Réglages : l’adversaire ===\n');

// ---------------------------------------------------------------------------
// 1. Un niveau Facile qui l'est vraiment
// ---------------------------------------------------------------------------

// Classique : rien avant 15:00, une première vague de 3 soldats, une annonce à
// 14:00. (Avant : première vague entre 7:32 et 11:09, de 5 soldats, sans prévenir.)
essai('Facile, Classique', () => {
  const lignes = [];
  let fin = null;
  for (const [seed, civs] of [[42, null], [7, ['solarien', 'atlante']], [2024, null]]) {
    const w = new World({ seed, mode: 'classique', difficulty: 'easy', ...(civs ? { civs } : {}) });
    const r = releve(w);
    jouer(w, 17 * 60, r.pas);
    lignes.push({ seed, r, solarien: !!civs });
    // Sur la première graine, la partie va à son terme : le joueur ne fait rien.
    if (seed === 42) { jouer(w, 26 * 60, r.pas); fin = w.gameOver ? { t: w.time, vainqueur: w.gameOver.winner } : null; }
  }
  const liste = (f) => lignes.map((l) => f(l.r)).join(', ');
  check('Facile, Classique : aucune vague avant 15:00, sur trois graines',
    lignes.every((l) => l.r.vagues.length > 0 && l.r.vagues[0].t >= 900 && l.r.vagues[0].t < 905),
    `première vague à ${liste((r) => mmss(r.vagues[0] && r.vagues[0].t))}`);
  check('… et aucune troupe adverse ne quitte sa base avant 15:00',
    lignes.every((l) => l.r.sortie !== null && l.r.sortie >= 900),
    `première troupe hors de sa base à ${liste((r) => mmss(r.sortie))}`);
  check('… le premier coup tombe après 15:00 : l’adversaire finit par attaquer',
    lignes.every((l) => l.r.coup !== null && l.r.coup > 900 && l.r.coup < 17 * 60),
    `premier coup reçu à ${liste((r) => mmss(r.coup))}`);
  check('la première vague compte 3 soldats, la suivante 5 : elles grossissent lentement',
    lignes.every((l) => l.r.vagues.length >= 2 && l.r.vagues[0].partants === 3 && l.r.vagues[1].partants === 5),
    `partants : ${liste((r) => r.vagues.map((v) => v.partants).join(' puis '))}`);
  check('une minute avant, le joueur reçoit une annonce — une seule de toute la partie',
    lignes.every((l) => l.r.annonces.length === 1 && l.r.annonces[0].t >= 840 && l.r.annonces[0].t < 842),
    `annonces à ${liste((r) => r.annonces.map((a) => mmss(a.t)).join(' et ') || 'aucune')}`);
  const textes = lignes.map((l) => (l.r.annonces[0] || {}).text);
  check('l’annonce nomme la caserne du joueur dans SA civilisation',
    lignes.every((l, i) => textes[i] === `L’ennemi prépare une attaque : formez des soldats à la ${l.solarien ? 'Cour des Gardes' : 'Caserne'}`),
    textes.join(' | '));
  check('un joueur qui ne fait rien finit par perdre, bien après la trêve',
    !!fin && fin.vainqueur === 1 && fin.t > 17 * 60,
    fin ? `défaite à ${mmss(fin.t)}` : 'partie encore en cours à 26:00');
});

// Express : rien avant 4:30, annonce à 3:30, 3 soldats.
// (Avant : première vague à 1:21, « Vous êtes attaqué ! » à 2:00.)
essai('Facile, Express', () => {
  const lignes = [];
  let fin = null;
  for (const seed of [42, 7, 2024]) {
    const w = new World({ seed, mode: 'express', difficulty: 'easy' });
    const r = releve(w);
    jouer(w, 6 * 60, r.pas);
    lignes.push(r);
    if (seed === 42) { jouer(w, 11 * 60, r.pas); fin = w.gameOver ? { t: w.time, vainqueur: w.gameOver.winner } : null; }
  }
  const liste = (f) => lignes.map(f).join(', ');
  check('Facile, Express : aucune vague avant 4:30, sur trois graines',
    lignes.every((r) => r.vagues.length > 0 && r.vagues[0].t >= 270 && r.vagues[0].t < 275 && r.sortie >= 270),
    `première vague à ${liste((r) => mmss(r.vagues[0] && r.vagues[0].t))}, première troupe hors de sa base à ${liste((r) => mmss(r.sortie))}`);
  check('… la première vague compte 3 soldats, et le premier coup tombe après 4:30',
    lignes.every((r) => r.vagues[0].partants === 3 && r.coup !== null && r.coup > 270),
    `partants : ${liste((r) => r.vagues[0].partants)} ; premier coup à ${liste((r) => mmss(r.coup))}`);
  check('… annoncée une fois, à 3:30',
    lignes.every((r) => r.annonces.length === 1 && r.annonces[0].t >= 210 && r.annonces[0].t < 212),
    `annonces à ${liste((r) => r.annonces.map((a) => mmss(a.t)).join(' et ') || 'aucune')}`);
  check('… et le joueur qui ne fait rien perd quand même la partie',
    !!fin && fin.vainqueur === 1, fin ? `défaite à ${mmss(fin.t)}` : 'pas de fin de partie');
});

// L'annonce et la trêve survivent à une sauvegarde reprise : ni annonce en
// double, ni annonce perdue, et la vague part à la même heure.
essai('Facile, reprise', () => {
  const partie = (heureSauvegarde) => {
    const w = new World({ seed: 42, mode: 'express', difficulty: 'easy' });
    const avant = releve(w);
    jouer(w, heureSauvegarde, avant.pas);
    const repris = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    const apres = releve(repris);
    jouer(repris, 290, apres.pas);
    return { avant, apres, repris };
  };
  const tot = partie(200), tard = partie(230);
  check('partie sauvegardée à 3:20 puis reprise : l’annonce tombe à 3:30, une seule fois',
    tot.avant.annonces.length === 0 && tot.apres.annonces.length === 1 && Math.floor(tot.apres.annonces[0].t) === 210,
    `${tot.avant.annonces.length} avant, ${tot.apres.annonces.length} après la reprise`);
  check('partie sauvegardée à 3:50 puis reprise : l’annonce déjà faite n’est pas répétée',
    tard.avant.annonces.length === 1 && tard.apres.annonces.length === 0,
    `${tard.avant.annonces.length} avant, ${tard.apres.annonces.length} après la reprise`);
  check('… et la trêve tient : la vague part à 4:30 dans les deux parties reprises',
    [tot, tard].every((p) => p.apres.vagues.length === 1 && p.apres.vagues[0].t >= 270 && p.apres.vagues[0].partants === 3),
    [tot, tard].map((p) => (p.apres.vagues[0] ? `${mmss(p.apres.vagues[0].t)} (${p.apres.vagues[0].partants})` : 'aucune')).join(', '));
});

// Normal et Difficile ne bougent pas : même fourchette qu'avant les réglages
// (mesuré sur six graines : Normal 9:03 à 10:18, Difficile 8:36 à 10:41, 6
// soldats ; Express 1:21 à 1:29, 3 soldats), et aucune annonce.
essai('Normal et Difficile', () => {
  const premiere = (options, limite) => {
    const w = new World(options);
    const r = releve(w);
    jouer(w, limite, () => { r.pas(); return r.vagues.length > 0; });
    return { ...(r.vagues[0] || { t: null, partants: 0 }), annonces: r.annonces.length };
  };
  const dans = (v, min, max, n) => v.t !== null && v.t >= min && v.t <= max && v.partants === n && v.annonces === 0;
  const dit = (vs) => vs.map((v) => `${mmss(v.t)} (${v.partants})`).join(', ');
  const normal = [42, 2024].map((seed) => premiere({ seed, mode: 'classique', difficulty: 'normal' }, 11 * 60));
  check('Normal, Classique : première vague entre 8:30 et 10:50, 6 soldats, comme avant',
    normal.every((v) => dans(v, 510, 650, 6)), dit(normal));
  const difficile = [premiere({ seed: 42, mode: 'classique', difficulty: 'hard' }, 11.5 * 60)];
  check('Difficile, Classique : première vague entre 8:05 et 11:15, 6 soldats, comme avant',
    difficile.every((v) => dans(v, 485, 675, 6)), dit(difficile));
  const express = ['normal', 'hard'].map((difficulty) => premiere({ seed: 42, mode: 'express', difficulty }, 2 * 60));
  check('Normal et Difficile, Express : première vague entre 1:10 et 1:45, 3 soldats, comme avant',
    express.every((v) => dans(v, 70, 105, 3)), dit(express));
});

// ---------------------------------------------------------------------------
// 2. La tour habitée
// ---------------------------------------------------------------------------

// Une troupe abritée n'est plus une menace pour findThreat.
essai('troupe abritée', () => {
  const w = new World({ seed: 42, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  const e = emplacementTour(w, 9, 'derriere');
  const tour = w.spawnBuilding(0, 'tower', e.tx, e.ty, true);
  const v = w.spawnUnit(0, 'villager', tour.x, tour.y + TILE * 2);
  ai.survey();
  check('dehors, à neuf cases du centre adverse, un ouvrier du joueur est une menace', ai.findThreat() === v);
  tour.addToGarrison(v);
  check('abrité dans la tour, il n’en est plus une', v.garrisonedIn === tour && ai.findThreat() === null);
  let alerte = 0;
  jouer(w, 60, () => { if (w.time < ai.defendUntil) alerte++; });
  check('… et l’IA ne se met pas en alerte', alerte === 0, `${(alerte * DT).toFixed(0)} s d’alerte en une minute`);
});

// Le scénario du tour de table : tour posée à 7:00 près de la base adverse, un
// ouvrier dedans, le joueur ne fait rien d'autre. (Avant, même graine : aucune
// vague en 25 minutes, alerte 100 % du temps, Âge Féodal à 20:04, 38 miliciens
// restés chez eux, tour debout.)
essai('tour habitée, la partie', () => {
  const w = new World({ seed: 99, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  const r = releve(w);
  jouer(w, 7 * 60, r.pas);
  const tour = tourHabitee(w, 11, 'devant');
  let secondes = 0, alerte = 0, enfermes = 0, rasee = null, pas = 0;
  jouer(w, 13.5 * 60, () => {
    r.pas();
    if (++pas % TICKS_PER_SECOND === 0) {
      secondes++;
      if (w.time < ai.defendUntil) alerte++;
      enfermes += ouvriers(w).filter((u) => u.garrisonedIn).length;
    }
    if (tour.dead && rasee === null) rasee = w.time;
    return rasee !== null && r.ages.length > 0 && r.vagues.length > 0;
  });
  check('tour habitée : l’IA n’est plus en alerte permanente, ses ouvriers ne restent pas enfermés',
    alerte / secondes < 0.1 && enfermes / secondes < 0.5,
    `alerte ${Math.round((100 * alerte) / secondes)} % du temps, ${(enfermes / secondes).toFixed(1)} ouvrier enfermé en moyenne`);
  check('… elle passe à l’Âge Féodal (avant 11:30)', r.ages.length > 0 && r.ages[0] < 11.5 * 60, `Âge Féodal à ${mmss(r.ages[0])}`);
  check('… elle envoie une vague (avant 11:30)', r.vagues.length > 0 && r.vagues[0].t < 11.5 * 60,
    `première vague à ${mmss(r.vagues[0] && r.vagues[0].t)}`);
  check('… et elle rase la tour (avant 13:30)', rasee !== null, rasee === null ? `tour à ${Math.round(tour.hp)}/${tour.maxHp}` : `rasée à ${mmss(rasee)}`);
});

// L'assaut du bâtiment qui tire : pas sans de quoi l'abattre, et sans s'y user.
essai('tour habitée, l’assaut', () => {
  const w = new World({ seed: 42, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  jouer(w, 60);
  const tour = tourHabitee(w, 7, 'derriere');
  const perdusAvant = w.players[1].stats.lost;
  let assauts = 0, enCours = false;
  const compter = () => { if (!!ai.assaut && !enCours) assauts++; enCours = !!ai.assaut; };
  jouer(w, 240, compter);
  ai.survey();
  check('une tour habitée à sept cases de son centre : l’IA y voit un bâtiment qui tire sur sa base',
    ai.batimentArme() === tour && ai.findThreat() === null);
  const cibleSans = ai.pickAttackTarget(ai.army);
  check('sans de quoi l’abattre, elle n’envoie personne dessus',
    assauts === 0 && tour.hp === tour.maxHp && !armee(w).some((u) => u.target === tour && !u.autoTarget),
    `${assauts} assaut en trois minutes, tour à ${Math.round(tour.hp)}/${tour.maxHp}, ${armee(w).length} soldat(s) au camp`);
  check('… et une vague ne la prendrait pas pour cible : elle viserait la base du joueur',
    !!cibleSans && cibleSans !== tour && cibleSans.type === 'towncenter', cibleSans ? cibleSans.type : 'aucune cible');
  const troupe = renfort(w, 'militia', 16);
  const depart = w.time;
  // Dix secondes après, en plein assaut, la partie est sauvegardée et reprise à part.
  jouer(w, depart + 10, compter);
  const repris = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
  const assautRepris = repris.ais[0].assaut;
  jouer(w, depart + 150, () => { compter(); return tour.dead; });
  check('avec seize miliciens au camp, elle lance l’assaut et rase la tour',
    assauts === 1 && tour.dead,
    tour.dead ? `rasée en ${Math.round(w.time - depart)} s, ${troupe.filter((u) => !u.dead).length} miliciens sur 16 en reviennent` : `tour à ${Math.round(tour.hp)}/${tour.maxHp}`);
  check('… sans que cela compte pour une vague', ai.waveCount === 0, `${ai.waveCount} vague(s)`);
  const tourReprise = repris.buildings.find((b) => b.id === tour.id);
  jouer(repris, depart + 150, () => !!tourReprise.dead);
  check('une sauvegarde reprise en plein assaut le mène au même terme',
    !!assautRepris && assautRepris.cible === tour.id && tourReprise.dead && Math.abs(repris.time - w.time) < 1e-6,
    `tour rasée à ${mmss(w.time)} d’un côté, ${tourReprise.dead ? mmss(repris.time) : 'debout'} de l’autre`);
});

// Un bâtiment qu'elle n'arrive pas à abattre : l'assaut est borné dans le
// temps, les survivants décrochent, et elle n'y retourne pas indéfiniment.
essai('tour habitée, l’assaut borné', () => {
  const w = new World({ seed: 42, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  jouer(w, 5);
  const tour = tourHabitee(w, 7, 'derriere');
  const assauts = [];          // { debut, fin }
  let dernier = null;
  const suivre = () => {
    tour.hp = tour.maxHp;      // imprenable : rien ne l'entame
    if (ai.assaut && !dernier) { dernier = { debut: w.time, fin: null }; assauts.push(dernier); }
    if (!ai.assaut && dernier) { dernier.fin = w.time; dernier = null; }
  };
  // Quatre renforts de seize miliciens, toutes les 2 min 05 : un par assaut.
  let lot = [];
  const sorts = [];
  for (let k = 0; k < 4; k++) {
    lot = renfort(w, 'militia', 16);
    jouer(w, 5 + (k + 1) * 125, suivre);
    sorts.push(lot.filter((u) => !u.dead).length);
  }
  const durees = assauts.map((a) => Math.round((a.fin === null ? w.time : a.fin) - a.debut));
  check('contre une tour imprenable, un assaut dure deux minutes au plus',
    assauts.length > 0 && durees.every((d) => d <= 121), `durées : ${durees.join(', ')} s`);
  check('… et l’IA n’en donne pas plus de trois au même âge : le quatrième renfort n’y est pas envoyé',
    w.players[1].age === 0 && assauts.length === 3 && !ai.assaut && !lot.some((u) => !u.dead && u.target === tour && !u.autoTarget),
    `${assauts.length} assauts ; miliciens en vie après chaque renfort : ${sorts.join(', ')} sur 16 ; ${lot.filter((u) => !u.dead && u.target === tour).length} du dernier sur la tour à ${mmss(w.time)}`);
});

// Une alerte sans combat ne dure pas : l'IA n'a plus d'armée, un ouvrier du
// joueur se plante à côté des siens, hors de portée de tir du centre. (Avant :
// alerte 100 % du temps, six ouvriers enfermés en moyenne jusqu'à la fin.)
essai('alerte sans combat', () => {
  const w = new World({ seed: 42, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  jouer(w, 120);
  for (const u of armee(w)) w.killEntity(u, null);
  const tc = centre(w, 1);
  const loin = ouvriers(w).sort((a, b) => Math.hypot(b.x - tc.x, b.y - tc.y) - Math.hypot(a.x - tc.x, a.y - tc.y))[0];
  const intrus = w.spawnUnit(0, 'villager', loin.x + TILE, loin.y);
  let secondes = 0, alerte = 0, enfermesMax = 0, pas = 0;
  jouer(w, 120 + 30, () => { enfermesMax = Math.max(enfermesMax, ouvriers(w).filter((u) => u.garrisonedIn).length); });
  check('un intrus dans la base : l’IA se met en alerte et abrite les ouvriers menacés',
    w.time < ai.defendUntil && enfermesMax > 0, `${enfermesMax} ouvrier(s) à l’abri`);
  jouer(w, 120 + 60, () => {});
  const dehors = ouvriers(w).filter((u) => u.garrisonedIn).length;
  check('quarante-cinq secondes sans un coup : l’alerte est levée, les ouvriers abrités ressortent',
    !intrus.dead && !(w.time < ai.defendUntil) && dehors === 0, `${dehors} ouvrier(s) encore enfermé(s) à ${mmss(w.time)}`);
  jouer(w, 7 * 60, () => {
    if (++pas % TICKS_PER_SECOND === 0) { secondes++; if (w.time < ai.defendUntil) alerte++; }
  });
  check('… et l’alerte ne tient pas toute la partie : moins de la moitié du temps',
    !intrus.dead && alerte / secondes < 0.5, `alerte ${Math.round((100 * alerte) / secondes)} % du temps de 3:00 à 7:00`);
});

// L'épargne pour l'âge suivant continue pendant une alerte. Un intrus que
// l'IA n'arrive pas à tuer la tient en alerte tout du long. (Avant : l'épargne
// sautait, tout partait en miliciens et l'Âge Féodal attendait.)
essai('épargne en alerte', () => {
  const w = new World({ seed: 42, mode: 'classique', difficulty: 'normal' });
  const ai = w.ais[0];
  jouer(w, 8 * 60);
  const tc = centre(w, 1);
  const intrus = w.spawnUnit(0, 'scout', tc.x - TILE * 9, tc.y + TILE * 9);
  intrus.stance = 'passive';
  let secondes = 0, alerte = 0, pas = 0, feodal = null;
  jouer(w, 12 * 60, () => {
    intrus.hp = intrus.maxHp;   // increvable : l'alerte ne finit pas par sa mort
    if (++pas % TICKS_PER_SECOND === 0) { secondes++; if (w.time < ai.defendUntil) alerte++; }
    if (feodal === null && w.players[1].age >= 1) feodal = w.time;
    return feodal !== null;
  });
  check('en alerte presque tout du long, l’IA passe quand même à l’Âge Féodal (avant 12:00)',
    feodal !== null && alerte / secondes > 0.8,
    `alerte ${Math.round((100 * alerte) / secondes)} % du temps, Âge Féodal à ${mmss(feodal)}, ${armee(w).length} soldats`);
});

console.log(`\n${failures === 0 ? '✅ Tous les tests passent' : '❌ ' + failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
