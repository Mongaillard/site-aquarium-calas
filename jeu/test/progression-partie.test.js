// Les niveaux des troupes dans la partie : chaque camp reçoit ses niveaux à la
// création du monde (options.niveaux), ses troupes en portent les statistiques,
// et la sauvegarde les garde. La garantie qui compte : sans niveaux, ou avec
// tout au niveau 1, la partie est exactement celle d'avant.
// Lancement : node test/progression-partie.test.js

import { World } from '../js/game.js';
import { AIPlayer } from '../js/ai.js';
import { serializeWorld, restoreWorld } from '../js/save.js';
import { DIFFICULTIES, TICKS_PER_SECOND, UNIT_TYPES } from '../js/config.js';
import { PROGRESSION } from '../js/progression-config.js';
import { definitionAuNiveau } from '../js/progression.js';

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
/** Une case libre pour ce bâtiment, à `d` cases au moins du bâtiment principal. */
function emplacement(w, type, d) {
  const tc = centre(w);
  for (let r = d; r <= d + 10; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (w.canPlace(0, type, tc.tx + dx, tc.ty + dy, true)) return { tx: tc.tx + dx, ty: tc.ty + dy };
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
  check('au niveau maximum, ni la portée, ni la cadence, ni le coût, ni l’armure ne bougent', touches.length === 0 && Object.keys(tout).length === 14, touches.join(', '));
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

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
