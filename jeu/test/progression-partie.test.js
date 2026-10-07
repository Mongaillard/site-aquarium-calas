// Les niveaux des troupes dans la partie : chaque camp reçoit ses niveaux à la
// création du monde (options.niveaux), ses troupes en portent les statistiques,
// et la sauvegarde les garde. La garantie qui compte : sans niveaux, ou avec
// tout au niveau 1, la partie est exactement celle d'avant. De même sans
// troupes interdites ni troupes en plus (voir aussi test/troupes-nouvelles.test.js).
// Lancement : node test/progression-partie.test.js

import { World } from '../js/game.js';
import { AIPlayer } from '../js/ai.js';
import { serializeWorld, restoreWorld, PROGRESSION_KEY, lireProgression, ecrireProgression } from '../js/save.js';
import { DIFFICULTIES, TICKS_PER_SECOND, UNIT_TYPES } from '../js/config.js';
import { PROGRESSION } from '../js/progression-config.js';
import { definitionAuNiveau, profilNeuf, regulariser, appliquerResultat, reglagesDePartie, issueDePartie } from '../js/progression.js';

const DT = 1 / TICKS_PER_SECOND;
let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? '  ok  ' : ' FAIL ';
  if (!condition) failures++;
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

/** L'état sauvegardé, sans l'heure de la sauvegarde (la seule chose qui diffère d'une fois à l'autre). */
const etat = (w) => JSON.stringify({ ...serializeWorld(w), savedAt: 0 });
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pas = (w, secondes, jusqua = () => false) => {
  for (let i = 0; i < Math.round(secondes * TICKS_PER_SECOND) && !jusqua(); i++) w.update(DT);
};
const centre = (w, i = 0) => w.buildings.find((b) => !b.dead && b.playerIndex === i && b.type === 'towncenter');
const villageois = (w, i = 0) => w.units.filter((u) => !u.dead && u.playerIndex === i && u.type === 'villager');
/** Une partie qui se joue seule : l'ordinateur tient les deux camps. */
function partie(options, minutes) {
  const w = new World({ difficulty: 'normal', mapSize: 'medium', ...options });
  w.players[0].autoWorkers = true;
  w.ais.push(new AIPlayer(w, 0, DIFFICULTIES.normal));
  pas(w, minutes * 60, () => !!w.gameOver);
  return w;
}
/** Une case libre pour ce bâtiment, à `d` cases au moins du bâtiment principal du camp. */
function emplacement(w, type, d, joueur = 0) {
  const tc = centre(w, joueur);
  for (let r = d; r <= d + 10; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (w.canPlace(joueur, type, tc.tx + dx, tc.ty + dy, true)) return { tx: tc.tx + dx, ty: tc.ty + dy };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. Au niveau 1, rien ne change
// ---------------------------------------------------------------------------
console.log('=== Niveaux des troupes dans la partie ===\n--- Au niveau 1, la partie est celle d’avant ---');
{
  for (const [nom, options, minutes] of [
    ['Classique, carte moyenne', { seed: 4242, mode: 'classique' }, 5],
    ['Express, petite carte', { seed: 808, mode: 'express', mapSize: 'small' }, 4],
  ]) {
    const reference = etat(partie(options, minutes));
    const variantes = {
      'deux camps sans niveaux': [{}, {}],
      'tout dit au niveau 1': [{ villager: 1, militia: 1, knight: 1 }, { hydra: 1 }],
      'niveaux illisibles': [null, { villager: 'beaucoup', licorne: 4, militia: 0, archer: -3, scout: NaN }],
      'pas un tableau': 'niveau 5 partout',
    };
    const autres = {
      'aucune troupe interdite': { troupesInterdites: [[], []] },
      'interdites illisibles': { troupesInterdites: [['licorne', 'villager'], 'toutes'], recolteAdverse: 'vite' },
      'aucune troupe en plus': { troupesEnPlus: [[], []] },
      'en plus illisibles': { troupesEnPlus: [['licorne', 'villager', 'deer', 'constructor'], 'toutes'] },
    };
    for (const [quoi, plus] of Object.entries(autres)) {
      check(`${nom} — ${quoi} : même partie, au caractère près`, etat(partie({ ...options, ...plus }, minutes)) === reference);
    }
    check(`${nom} — la sauvegarde ne parle pas de troupes interdites`, !reference.includes('interdites'));
    check(`${nom} — … ni de troupes en plus`, !reference.includes('enPlus'));
    for (const [quoi, niveaux] of Object.entries(variantes)) {
      check(`${nom} — ${quoi} : même partie, au caractère près`, etat(partie({ ...options, niveaux }, minutes)) === reference);
    }
    check(`${nom} — la sauvegarde ne parle pas de niveaux`, !reference.includes('niveaux'));
  }
  const w = new World({ seed: 7 });
  check('au niveau 1, la troupe porte la définition de config.js elle-même',
    w.units.every((u) => u.def === UNIT_TYPES[u.type]) && w.defTroupe('villager', 0) === UNIT_TYPES.villager);
}

// ---------------------------------------------------------------------------
// 2. Ce qu'un niveau change, et pour qui
// ---------------------------------------------------------------------------
console.log('\n--- Ce qu’un niveau change, et pour qui ---');
{
  const w = new World({ seed: 7, niveaux: [{ villager: 3, militia: 5, scout: 5, priest: 5, ram: 5, spearman: 5 }, {}] });
  const ouvrier = w.defTroupe('villager', 0);
  check('ouvrier de niveau 3 : +25 % de récolte, le reste inchangé',
    ouvrier.gather.food === 0.625 && ouvrier.gather.gold === 0.625 && Math.abs(ouvrier.gather.wood - 0.6875) < 1e-12
    && ouvrier.carry === 10 && ouvrier.hp === 45 && ouvrier.construction === undefined,
    JSON.stringify(ouvrier.gather));
  check('… ses ouvriers de départ en portent la définition', villageois(w, 0).length > 0 && villageois(w, 0).every((u) => u.def === ouvrier));
  check('… ceux de l’adversaire gardent celle de config.js',
    villageois(w, 1).length > 0 && villageois(w, 1).every((u) => u.def === UNIT_TYPES.villager) && w.defTroupe('villager', 1) === UNIT_TYPES.villager);
  check('… les animaux aussi', w.units.filter((u) => u.isAnimal).every((u) => u.def === UNIT_TYPES[u.type]));

  const tc = centre(w);
  const mien = w.spawnUnit(0, 'militia', tc.x + 80, tc.y + 80);
  const sien = w.spawnUnit(1, 'militia', tc.x + 120, tc.y + 80);
  check('milicien de niveau 5 : 54 points de vie et 6 de dégâts', mien.hp === 54 && mien.maxHp === 54 && mien.def.attack === 6, `${mien.hp} PV, ${mien.def.attack} dégâts`);
  check('… celui de l’adversaire : 45 et 5', sien.hp === 45 && sien.maxHp === 45 && sien.def.attack === 5);
  check('éclaireur de niveau 5 : +8 % de vitesse', Math.abs(w.defTroupe('scout', 0).speed - 1.75 * 1.08) < 1e-12);
  check('prêtresse de niveau 5 : soigne 10', w.defTroupe('priest', 0).heal === 10);
  check('bélier de niveau 5 : +43 contre les bâtiments', w.defTroupe('ram', 0).bonus.building === 43);
  check('lancier de niveau 5 : +14 contre la cavalerie', w.defTroupe('spearman', 0).bonus.cavalry === 14);
  check('une troupe sans niveau donné reste celle de config.js', w.defTroupe('archer', 0) === UNIT_TYPES.archer);
  check('la définition d’un niveau n’est calculée qu’une fois par camp', w.defTroupe('militia', 0) === w.defTroupe('militia', 0));
  check('elle est celle du moteur de progression', egal(w.defTroupe('militia', 0), definitionAuNiveau(UNIT_TYPES.militia, 'militia', 5)));

  // Ce qu'un niveau ne touche jamais : portée, cadence, coût, temps de formation.
  const tout = Object.fromEntries(Object.keys(PROGRESSION.troupes).filter((t) => UNIT_TYPES[t]).map((t) => [t, PROGRESSION.niveauMax]));
  const max = new World({ seed: 7, niveaux: [tout, tout] });
  const intacts = ['range', 'attackSpeed', 'cost', 'trainTime', 'pop', 'los', 'radius', 'meleeArmor', 'pierceArmor', 'class', 'attackType', 'from', 'age'];
  const touches = Object.keys(tout).filter((t) => intacts.some((c) => !egal(max.defTroupe(t, 0)[c], UNIT_TYPES[t][c])));
  check('au niveau maximum, ni la portée, ni la cadence, ni le coût, ni l’armure ne bougent', touches.length === 0 && Object.keys(tout).length === 17, touches.join(', '));
  check('au-delà du maximum, le niveau est ramené au maximum', new World({ seed: 7, niveaux: [{ militia: 99 }] }).players[0].niveaux.militia === PROGRESSION.niveauMax);
}

// ---------------------------------------------------------------------------
// 3. Dans une vraie partie
// ---------------------------------------------------------------------------
console.log('\n--- Dans une vraie partie ---');
{
  const recolte = (w, i) => { const g = w.players[i].stats.gathered; return g.food + g.wood + g.gold; };
  const options = { seed: 4242, mode: 'classique' };
  const sans = partie(options, 5);
  const avec = partie({ ...options, niveaux: [{ villager: 3 }, {}] }, 5);
  const gain = recolte(avec, 0) / recolte(sans, 0);
  // Moins que les +25 % de la fiche : le niveau accélère la récolte, pas la
  // marche jusqu'au dépôt, ni la formation des ouvriers.
  check('des ouvriers de niveau 3 récoltent plus en cinq minutes, sans emballer la partie', gain > 1.04 && gain < 1.3, `×${gain.toFixed(3)}`);
  const encore = partie({ ...options, niveaux: [{ villager: 3 }, {}] }, 5);
  check('même graine, mêmes niveaux : même partie', etat(encore) === etat(avec));

  // Un ouvrier de niveau 5 bâtit une maison 10 % plus vite.
  const duree = (niveau) => {
    const w = new World({ seed: 33, niveaux: [{ villager: niveau }, {}] });
    w.ais = [];
    w.players[0].resources.wood = 2000;
    const p = emplacement(w, 'house', 5);
    const site = w.placeBuilding(0, 'house', p.tx, p.ty, [villageois(w)[0]]);
    pas(w, 30, () => site.buildProgress > 0);
    const debut = w.time;
    pas(w, 120, () => site.complete);
    return site.complete ? w.time - debut : Infinity;
  };
  const d1 = duree(1), d4 = duree(4), d5 = duree(5);
  check('ouvrier de niveau 4 : même temps de chantier qu’au niveau 1', d4 === d1, `${d1.toFixed(2)} s`);
  check('ouvrier de niveau 5 : chantier 10 % plus court', Math.abs(d5 / d1 - 1 / 1.1) < 0.02, `${d1.toFixed(2)} s puis ${d5.toFixed(2)} s`);
  const porteur = new World({ seed: 33, niveaux: [{ villager: 4 }, {}] });
  check('ouvrier de niveau 4 : il porte 12', villageois(porteur)[0].def.carry === 12);
}

// ---------------------------------------------------------------------------
// 4. La sauvegarde
// ---------------------------------------------------------------------------
console.log('\n--- La sauvegarde ---');
{
  const niveaux = [{ villager: 3, militia: 5 }, { knight: 2 }];
  const w = partie({ seed: 808, mode: 'express', mapSize: 'small', niveaux }, 3);
  const image = JSON.parse(JSON.stringify(serializeWorld(w)));
  check('la sauvegarde garde les niveaux de chaque camp', egal(image.players[0].niveaux, niveaux[0]) && egal(image.players[1].niveaux, niveaux[1]));
  const repris = restoreWorld(image);
  check('la partie reprise les retrouve', !!repris && egal(repris.players[0].niveaux, niveaux[0]) && egal(repris.players[1].niveaux, niveaux[1]));
  check('… ses troupes en portent les statistiques',
    villageois(repris, 0).length > 0 && villageois(repris, 0).every((u) => u.def.gather.food === 0.625)
    && repris.units.filter((u) => u.type === 'militia' && u.playerIndex === 0).every((u) => u.maxHp === 54));
  check('… et elle se sauvegarde à l’identique', etat(repris) === JSON.stringify({ ...image, savedAt: 0 }));
  repris.players[0].autoWorkers = true;
  if (!repris.ais.some((ia) => ia.player.index === 0)) repris.ais.push(new AIPlayer(repris, 0, DIFFICULTIES.normal));
  pas(repris, 20);
  check('la partie reprise continue sans erreur', repris.time > w.time + 19);
  const ancienne = JSON.parse(JSON.stringify(serializeWorld(partie({ seed: 808, mode: 'express', mapSize: 'small' }, 1))));
  const relue = restoreWorld(ancienne);
  check('une sauvegarde sans niveaux se reprend au niveau 1', !!relue && egal(relue.players[0].niveaux, {}) && relue.units.every((u) => u.def === UNIT_TYPES[u.type]));
}

// ---------------------------------------------------------------------------
// 5. Les troupes à débloquer
// ---------------------------------------------------------------------------
console.log('\n--- Les troupes à débloquer ---');
// Les quatre que l'ordinateur forme de lui-même, et qu'on lui interdit ; les
// trois des ligues 6 à 8, qu'il ne forme que si la partie les lui donne.
const AVANCEES = ['triton', 'horseArcher', 'catapult', 'hydra'];
const NOUVELLES = ['pavoisier', 'frondeur', 'sapeur'];
const SEPT = [...AVANCEES, ...NOUVELLES];
{
  /** Un camp à l'Âge des Châteaux, riche, logé, avec tous ses bâtiments militaires debout. */
  function equiper(w, joueur) {
    const p = w.players[joueur];
    p.age = 2;
    Object.assign(p.resources, { food: 20000, wood: 20000, gold: 20000 });
    const poses = {};
    for (const type of ['house', 'house', 'house', 'house', 'house', 'house', 'barracks', 'archery', 'stable', 'siege', 'temple']) {
      const e = emplacement(w, type, 5, joueur);
      poses[type] = w.spawnBuilding(joueur, type, e.tx, e.ty, true);
    }
    return poses;
  }
  const w = new World({ seed: 51, troupesInterdites: [AVANCEES, []] });
  w.ais = [];
  const b = equiper(w, 0);
  const refus = { triton: b.barracks, horseArcher: b.archery, catapult: b.siege, hydra: b.temple };
  check('le joueur ne peut former aucune troupe à débloquer',
    Object.entries(refus).every(([type, bat]) => { const r = w.canTrain(bat, type); return !r.ok && r.reason === 'Troupe à débloquer'; }));
  check('… et l’ordre de formation est refusé sans rien dépenser',
    w.trainUnit(b.temple, 'hydra') === false && b.temple.queue.length === 0 && w.players[0].resources.gold === 20000);
  check('… les troupes de base se forment toujours',
    ['militia', 'spearman', 'champion'].every((t) => w.canTrain(b.barracks, t).ok) && w.canTrain(b.archery, 'archer').ok
    && w.canTrain(b.stable, 'knight').ok && w.canTrain(b.siege, 'ram').ok && w.canTrain(b.temple, 'priest').ok);
  const adverse = equiper(w, 1);
  check('… l’adversaire, lui, n’est pas concerné', w.canTrain(adverse.temple, 'hydra').ok && w.canTrain(adverse.siege, 'catapult').ok);
  check('l’ouvrier ne s’interdit jamais', new World({ seed: 51, troupesInterdites: [['villager', 'deer', 'licorne']] }).players[0].interdites.size === 0);

  // La sauvegarde.
  const image = JSON.parse(JSON.stringify(serializeWorld(w)));
  const repris = restoreWorld(image);
  check('la sauvegarde garde les troupes interdites',
    egal(image.players[0].interdites, AVANCEES) && image.players[1].interdites === undefined
    && !!repris && egal([...repris.players[0].interdites], AVANCEES) && repris.players[1].interdites.size === 0);
  const temple = repris.buildings.find((x) => x.playerIndex === 0 && x.type === 'temple');
  check('… la partie reprise refuse toujours l’Hydre', !repris.canTrain(temple, 'hydra').ok && repris.canTrain(temple, 'priest').ok);

  // L'ordinateur : à l'Âge des Châteaux, riche, il forme ce que sa liste lui laisse.
  const forme = (interdites) => {
    const m = new World({ seed: 51, difficulty: 'hard', troupesInterdites: [[], interdites] });
    equiper(m, 1);
    for (const u of m.units) if (u.playerIndex === 0 && u.setStance) u.setStance('passive');
    const vus = new Set();
    pas(m, 150, () => {
      for (const bat of m.buildings) if (bat.playerIndex === 1) for (const q of bat.queue) if (q.kind === 'unit') vus.add(q.id);
      return false;
    });
    return vus;
  };
  const libre = forme([]), bride = forme(AVANCEES);
  check('sans interdit, l’ordinateur forme des troupes avancées', AVANCEES.some((t) => libre.has(t)), [...libre].join(' '));
  check('… mais aucune des trois nouvelles : elles ne sont pas dans son ordinaire', NOUVELLES.every((t) => !libre.has(t)));
  check('avec les quatre interdites, il n’en forme aucune — et forme le reste', AVANCEES.every((t) => !bride.has(t)) && bride.has('knight'), [...bride].join(' '));
  const sansCatapulte = forme(['catapult']);
  check('sans catapulte, ses engins sont des béliers', !sansCatapulte.has('catapult') && sansCatapulte.has('ram'), [...sansCatapulte].join(' '));

  check('la récolte de l’adversaire peut être donnée à part de sa difficulté',
    new World({ seed: 51, difficulty: 'hard', recolteAdverse: 1.45 }).players[1].mods.gatherRate === 1.45
    && new World({ seed: 51, difficulty: 'hard' }).players[1].mods.gatherRate === DIFFICULTIES.hard.gatherBonus);
}

// ---------------------------------------------------------------------------
// 6. Du profil à la partie, et retour
// ---------------------------------------------------------------------------
console.log('\n--- Du profil à la partie, et retour ---');
{
  const neuf = reglagesDePartie(profilNeuf());
  check('profil neuf, partie classée : ordinateur facile, tout au niveau 1, aucune troupe avancée de part et d’autre',
    egal(neuf, { difficulty: 'easy', recolteAdverse: 0.8, niveaux: [{}, {}], troupesInterdites: [SEPT, SEPT], troupesEnPlus: [[], []] }), JSON.stringify(neuf));

  // Ligue 5 (Argent, plafond 3), un milicien poussé au niveau 5.
  const argent = regulariser({ ...profilNeuf(), elo: 780 }).profil;
  argent.troupes.militia.niveau = 5;
  const classe = reglagesDePartie(argent, 'classe'), libre = reglagesDePartie(argent, 'libre');
  check('ligue 5, partie classée : le milicien de niveau 5 joue au plafond, 3', classe.niveaux[0].militia === 3);
  check('… l’ouvrier est au plafond, monté d’office', classe.niveaux[0].villager === 3 && argent.troupes.villager.niveau === 3);
  check('… l’ordinateur est difficile, récolte à 1,25, toutes ses troupes au niveau 3',
    classe.difficulty === 'hard' && classe.recolteAdverse === 1.25
    && Object.keys(classe.niveaux[1]).length === 17 && Object.values(classe.niveaux[1]).every((n) => n === 3));
  check('… et les quatre troupes avancées de la ligue sont permises aux deux camps — pas les trois des ligues 6 à 8',
    egal(classe.troupesInterdites, [NOUVELLES, NOUVELLES]) && egal(classe.troupesEnPlus, [[], []]));
  check('ligue 5, partie libre : le milicien joue à son niveau réel, l’adversaire n’est pas touché',
    libre.niveaux[0].militia === 5 && egal(libre.niveaux[1], {}) && libre.difficulty === undefined && libre.recolteAdverse === undefined);
  check('profil neuf, partie libre : ce que le joueur n’a pas débloqué, l’ordinateur ne le forme pas non plus',
    egal(reglagesDePartie(profilNeuf(), 'libre'), { niveaux: [{}, {}], troupesInterdites: [SEPT, SEPT], troupesEnPlus: [[], []] }));
  const bronze = reglagesDePartie(regulariser({ ...profilNeuf(), elo: 300 }).profil);
  check('ligue 3 : le joueur a l’Atlante et l’Archer monté, l’ordinateur aussi, pas la Catapulte ni l’Hydre',
    egal(bronze.troupesInterdites, [['catapult', 'hydra', ...NOUVELLES], ['catapult', 'hydra', ...NOUVELLES]]) && bronze.difficulty === 'normal');
  const achat = regulariser({ ...profilNeuf(), elo: 300 }).profil;
  achat.debloquees.hydra = 'achat';
  check('une troupe achetée se forme avant sa ligue ; l’ordinateur, lui, attend la ligue',
    egal(reglagesDePartie(achat).troupesInterdites, [['catapult', ...NOUVELLES], ['catapult', 'hydra', ...NOUVELLES]]));
  // Les trois nouvelles : interdites tant que la ligue ne les offre pas, puis
  // données EN PLUS à l'ordinateur, qui ne les forme pas de lui-même.
  const orichalque = reglagesDePartie(regulariser({ ...profilNeuf(), elo: 2400 }).profil);
  check('ligue 8 : plus rien d’interdit, et l’ordinateur reçoit les trois nouvelles en plus',
    egal(orichalque.troupesInterdites, [[], []]) && egal(orichalque.troupesEnPlus, [[], NOUVELLES]));
  check('les réglages comptent une ligne par ligue, de plus en plus forte',
    PROGRESSION.echelle.length === PROGRESSION.ligues.length
    && PROGRESSION.echelle.every((e, i) => DIFFICULTIES[e.difficulte] && e.niveau === PROGRESSION.ligues[i].plafond && (i === 0 || e.recolte > PROGRESSION.echelle[i - 1].recolte)));

  // Le monde reçoit ces réglages tels quels.
  const w = new World({ seed: 51, mode: 'express', ...classe });
  check('le monde créé avec ces réglages porte la ligue du joueur',
    w.difficultyId === 'hard' && w.players[1].mods.gatherRate === 1.25 && w.players[0].niveaux.militia === 3
    && w.players[1].niveaux.knight === 3 && villageois(w, 0).every((u) => u.def.gather.food === 0.625) && villageois(w, 1).every((u) => u.def.gather.food === 0.625));

  // Le résultat d'une partie, dans les mots du moteur.
  check('issue d’une partie : victoire, défaite, égalité, abandon',
    issueDePartie({ victory: true, winner: 0 }) === 'victoire' && issueDePartie({ victory: false, winner: 1 }) === 'defaite'
    && issueDePartie({ victory: false, winner: -1, timeUp: true }) === 'egalite' && issueDePartie({ victory: false, winner: 1, resigned: true }) === 'abandon'
    && issueDePartie(null) === 'annulee');
  const apres = appliquerResultat(profilNeuf(), { issue: issueDePartie({ victory: true, winner: 0 }), duree: 600, contreOrdinateur: 'echelle', jour: '2026-10-07' });
  check('une victoire classée contre l’ordinateur : +30 et un coffre de bois', apres.profil.elo === 30 && apres.profil.coffres.some((c) => c.type === 'bois'));

  // Le profil rangé dans le navigateur.
  const m = new Map();
  const store = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
  check('sans rien de rangé, on lit un profil neuf', egal(lireProgression(), profilNeuf()));
  check('le profil se range et se relit', ecrireProgression(apres.profil) === true && m.has(PROGRESSION_KEY) && egal(lireProgression(), apres.profil));
  m.set(PROGRESSION_KEY, '{"elo": "beaucoup", "troupes": 12');
  check('un profil illisible donne un profil neuf, sans erreur', egal(lireProgression(), profilNeuf()));
  m.set(PROGRESSION_KEY, JSON.stringify({ ...profilNeuf(), elo: 780 }));
  check('un profil dont le score a monté reçoit sa ligue à la lecture', lireProgression().ligue === 5);
  store.setItem = () => { throw new Error('quota'); };
  check('un navigateur qui refuse d’écrire : rien n’est retenu, sans erreur', ecrireProgression(apres.profil) === false);
  Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true, writable: true });
  check('sans stockage du tout : profil neuf à la lecture, refus à l’écriture', egal(lireProgression(), profilNeuf()) && ecrireProgression(apres.profil) === false);
}

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
