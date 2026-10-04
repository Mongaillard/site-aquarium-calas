// Les règles « de bord » relevées par le tour de table d'octobre : la cloche,
// un chantier sous les coups, le pas de groupe, la démolition d'un bâtiment
// occupé, les ouvriers à l'abri. Chaque vérification reprend le script qui a
// montré le défaut : elle échoue sur le code d'avant et passe après.
// Lancement : node test/reglages-bugs.test.js

import { World } from '../js/game.js';
import { AIPlayer } from '../js/ai.js';
import { TICKS_PER_SECOND, TILE, AGES, UNIT_TYPES, BUILDING_TYPES, TECHS, DIFFICULTIES } from '../js/config.js';
import { STATE, villagerTask } from '../js/entities.js';
import { serializeWorld, restoreWorld } from '../js/save.js';
import { RNG } from '../js/utils.js';

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

/** Petit bac à sable : un monde sans IA, où l'on place les unités à la main. */
function monde(seed, options = {}) {
  const w = new World({ seed, mapSize: 'small', difficulty: 'normal', ...options });
  w.ais = [];
  w.fog.explored.fill(1);
  return w;
}

const centre = (w, i = 0) => w.buildings.find((b) => b.playerIndex === i && b.type === 'towncenter');
const villageois = (w, i = 0) => w.units.filter((u) => u.playerIndex === i && u.isVillager && !u.dead);
const dehors = (w, i = 0) => villageois(w, i).filter((v) => !v.garrisonedIn);

function pas(w, secondes, stop) {
  for (let i = 0; i < secondes * TICKS_PER_SECOND; i++) {
    w.update(DT);
    if (stop && stop()) return true;
  }
  return false;
}

/** Un emplacement constructible à `d` cases au moins du Centre-Ville. */
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

/** L'arbre exploitable le plus proche d'un point. */
const arbrePres = (w, x, y) => w.findNearestResource(x, y, 'wood', 40 * TILE, 0);

/** Met tous les villageois du joueur au bois, et les laisse s'y installer. */
function auBois(w) {
  const vs = villageois(w);
  const tc = centre(w);
  const arbre = arbrePres(w, tc.x, tc.y);
  w.spreadGatherOrder(vs, arbre.tx, arbre.ty, 'wood');
  pas(w, 12);
  return vs;
}

const empreinte = (w) => [
  w.players.map((p) => [Math.round(p.resources.food), Math.round(p.resources.wood), Math.round(p.resources.gold), p.pop].join('/')).join('|'),
  w.units.filter((u) => !u.dead).map((u) => [u.id, u.x.toFixed(2), u.y.toFixed(2), u.hp.toFixed(2), u.state, u.garrisonedIn ? u.garrisonedIn.id : '-'].join(',')).sort().join(';'),
  w.buildings.filter((b) => !b.dead).map((b) => [b.id, b.hp.toFixed(3), b.complete ? 1 : 0, b.buildProgress.toFixed(3), b.garrison.length].join(',')).sort().join(';'),
].join('#');

console.log('=== Réglages : les règles de bord ===\n');

// ---------------------------------------------------------------------------
// 1. La cloche
// ---------------------------------------------------------------------------

// Des soldats déjà à l'abri : la cloche abrite les villageois, elle ne fait
// pas sortir les soldats (avant : « 2 villageois retournent au travail »).
essai('cloche, soldats à l’abri', () => {
  const w = monde(21);
  const tc = centre(w);
  const archers = [0, 1].map((i) => w.spawnUnit(0, 'archer', tc.x + TILE * (3 + i), tc.y + TILE * 3));
  for (const a of archers) tc.addToGarrison(a);
  const vs = auBois(w);
  const r1 = w.ringTownBell(0);
  check('cloche, des soldats déjà à l’abri : elle abrite les villageois',
    r1.sheltered === vs.length && r1.released === 0, `${r1.sheltered} abrités, ${r1.released} libérés`);
  check('cloche : les soldats abrités restent à l’intérieur', archers.every((a) => a.garrisonedIn === tc));
  pas(w, 30, () => vs.every((v) => v.garrisonedIn));
  check('cloche : les villageois sont entrés', vs.every((v) => v.garrisonedIn), `${dehors(w).length} dehors`);
  const r2 = w.ringTownBell(0);
  pas(w, 1);
  check('second coup : seuls ceux que la cloche a abrités ressortent, et le compte est juste',
    r2.released === vs.length && r2.sheltered === 0 && archers.every((a) => a.garrisonedIn === tc)
    && vs.every((v) => !v.garrisonedIn && v.state === STATE.GATHER),
    `${r2.released} libérés, soldats ${archers.filter((a) => a.garrisonedIn).length}/2 à l’abri, ${vs.map((v) => v.state).join(',')}`);
});

// Une tour plus proche que le Centre-Ville : cinq places, sept villageois.
// Les deux en trop vont au Centre-Ville au lieu de rester plantés dehors.
essai('cloche, deux abris', () => {
  const w = monde(22);
  w.players[0].age = 1;
  const tc = centre(w);
  const p = emplacement(w, 'tower', 9);
  const tour = w.spawnBuilding(0, 'tower', p.tx, p.ty, true);
  for (let i = 0; i < 7; i++) w.spawnUnit(0, 'villager', tour.x + TILE * (i - 3), tour.y + TILE * 2.5);
  const vs = villageois(w);
  pas(w, 1);
  const r = w.ringTownBell(0);
  pas(w, 45, () => dehors(w).length === 0);
  check('cloche, une tour plus proche que le Centre-Ville : personne ne reste dehors',
    dehors(w).length === 0 && tour.garrison.length === 5 && tc.garrison.length === vs.length - 5,
    `${tour.garrison.length} dans la tour, ${tc.garrison.length} au Centre-Ville, ${dehors(w).length} dehors`);
  check('cloche : le compte annoncé est celui des villageois abrités',
    r.sheltered === vs.length && r.sheltered === tour.garrison.length + tc.garrison.length,
    `${r.sheltered} annoncés, ${tour.garrison.length + tc.garrison.length} à l’intérieur`);
});

// Plus de villageois que de places : la cloche n'envoie que ceux qui auront
// une place, laisse les autres à leur travail, et le dit.
essai('cloche, abri trop petit', () => {
  const w = monde(23);
  const tc = centre(w);
  while (villageois(w).length < 18) w.spawnUnit(0, 'villager', tc.x + TILE * 4, tc.y + TILE * 4);
  const vs = auBois(w);
  const r = w.ringTownBell(0);
  pas(w, 45, () => tc.garrison.length === 15);
  const restes = dehors(w);
  check('cloche, plus de villageois que de places : le compte dit ceux qui ont une place',
    r.sheltered === 15 && r.sansPlace === 3 && tc.garrison.length === 15,
    `${r.sheltered} annoncés, ${r.sansPlace} sans place, ${tc.garrison.length} à l’intérieur`);
  check('cloche : ceux qui n’ont pas de place gardent leur travail',
    restes.length === 3 && restes.every((v) => v.state === STATE.GATHER || v.state === STATE.RETURN),
    restes.map((v) => v.state).join(','));
  const r2 = w.ringTownBell(0);
  check('cloche : le second coup libère quand même (des villageois restés dehors ne le bloquent pas)',
    r2.released === 15 && r2.sheltered === 0 && tc.garrison.length === 0, `${r2.released} libérés`);
});

// Un autre ordre pendant l'alerte : le poste noté à la cloche est oublié.
// Avant : à l'alerte suivante, « 1 villageois retourne au travail » et
// personne à l'abri — il fallait sonner deux fois.
essai('cloche, ordre pendant l’alerte', () => {
  const w = monde(24);
  const tc = centre(w);
  const vs = auBois(w);
  const v = vs[0];
  w.ringTownBell(0);
  const loin = w.map.findOpenTile(tc.tx + 1, tc.ty + 12, 8);
  v.moveTo(loin.tx * TILE + TILE / 2, loin.ty * TILE + TILE / 2);   // le joueur l'envoie ailleurs
  pas(w, 0.5);
  const r2 = w.ringTownBell(0);                                     // fin de l'alerte
  check('un ordre donné pendant l’alerte sort le villageois de la cloche : le second coup le laisse faire',
    r2.released === vs.length - 1 && v.state === STATE.MOVE, `${r2.released} libérés, lui : ${v.state}`);
  pas(w, 60, () => v.state === STATE.IDLE);
  const r3 = w.ringTownBell(0);                                     // nouvelle alerte
  check('à l’alerte suivante, la cloche abrite tout le monde du premier coup',
    r3.sheltered === vs.length && r3.released === 0, `${r3.sheltered} abrités, ${r3.released} libérés`);
});

// La cloche ne libère que ce qu'elle a abrité : un villageois mis à l'abri à
// la main y reste (il sort par « Libérer »).
essai('cloche, abrité à la main', () => {
  const w = monde(25);
  const tc = centre(w);
  const vs = auBois(w);
  const manuel = vs[0];
  manuel.garrisonAt(tc);
  pas(w, 30, () => !!manuel.garrisonedIn);
  const r1 = w.ringTownBell(0);
  check('un villageois déjà abrité à la main, les autres dehors : la cloche abrite les autres',
    r1.sheltered === vs.length - 1 && r1.released === 0 && manuel.garrisonedIn === tc,
    `${r1.sheltered} abrités, ${r1.released} libérés`);
  pas(w, 30, () => dehors(w).length === 0);
  const r2 = w.ringTownBell(0);
  check('second coup : celui abrité à la main reste à l’intérieur',
    r2.released === vs.length - 1 && manuel.garrisonedIn === tc, `${r2.released} libérés`);
  // Tous les villageois à l'intérieur, aucun appelé par elle : rien à faire.
  for (const v of vs) if (!v.garrisonedIn) tc.addToGarrison(v);
  const r3 = w.ringTownBell(0);
  check('tous abrités à la main : la cloche ne fait sortir personne (ils sortent par « Libérer »)',
    r3.sheltered === 0 && r3.released === 0 && r3.abris === 1 && tc.garrison.length === vs.length,
    `${r3.sheltered} abrités, ${r3.released} libérés, ${tc.garrison.length} à l’intérieur`);
  // Un villageois appelé qu'on envoie dans un autre abri reste dans l'alerte.
  w.releaseGarrison(tc);
  w.players[0].age = 1;
  const p = emplacement(w, 'tower', 4);
  const tour = w.spawnBuilding(0, 'tower', p.tx, p.ty, true);
  const postes = auBois(w).length;
  w.ringTownBell(0);
  w.garrisonUnits([vs[1]], tour);
  pas(w, 40, () => dehors(w).length === 0);
  const dansLaTour = vs[1].garrisonedIn === tour;
  const r4 = w.ringTownBell(0);
  pas(w, 1);
  check('changer d’abri pendant l’alerte ne fait pas quitter l’alerte',
    dansLaTour && tour.garrison.length === 0 && r4.released === postes && vs[1].state === STATE.GATHER,
    `${r4.released} libérés, lui : ${vs[1].garrisonedIn ? 'encore à l’abri' : vs[1].state}`);
});

// Une sauvegarde d'avant ce correctif peut porter un poste périmé sur un
// villageois au travail : la cloche ne le prend pas pour un second coup.
essai('cloche, poste périmé', () => {
  const w = monde(26);
  const vs = auBois(w);
  vs[0].posteAvantAbri = { kind: 'aucun' };
  const r = w.ringTownBell(0);
  check('un poste périmé sur un villageois au travail ne fait pas un second coup',
    r.sheltered === vs.length && r.released === 0, `${r.sheltered} abrités, ${r.released} libérés`);
});

// ---------------------------------------------------------------------------
// 2. Un chantier sous les coups
// ---------------------------------------------------------------------------

// Une caserne en chantier, un ouvrier, huit miliciens dessus : avant, chaque
// coup était effacé au coup de marteau suivant (terminée à 797/800).
essai('chantier attaqué', () => {
  const w = monde(31);
  w.players[0].resources.wood = 2000;
  for (const u of w.units) u.setStance('passive');
  const p = emplacement(w, 'barracks', 5);
  const v = villageois(w)[0];
  const site = w.placeBuilding(0, 'barracks', p.tx, p.ty, [v]);
  pas(w, 30, () => site.buildProgress > 4);   // l'ouvrier est au travail
  for (let i = 0; i < 8; i++) {
    const m = w.spawnUnit(1, 'militia', site.x + TILE * (i - 4), site.y + TILE * 3);
    m.setStance('passive');
    m.attackEntity(site);   // ordre direct : ils ne lâchent pas le chantier
  }
  let recus = 0, avant = site.hp;
  pas(w, 150, () => {
    if (site.hp < avant) recus += avant - site.hp;
    avant = site.hp;
    return site.complete || site.dead;
  });
  check('un chantier attaqué garde les coups reçus',
    !v.dead && recus > 100 && (site.dead || site.hp <= site.maxHp - 100),
    site.dead ? 'détruit' : `terminé à ${Math.round(site.hp)}/${site.maxHp}, ouvrier ${v.dead ? 'mort' : 'vivant'}`);
  // Achevé abîmé, il libère son ouvrier : réparer est un autre ordre. Sinon
  // les coups du chantier s'effaçaient quand même, par la réparation.
  const acheve = site.hp;
  pas(w, 5);
  check('achevé abîmé, le bâtiment libère son ouvrier au lieu de se réparer tout seul',
    site.dead || (v.state === STATE.IDLE && site.hp < acheve),
    site.dead ? 'détruit' : `ouvrier ${v.state}, ${Math.round(acheve)} → ${Math.round(site.hp)} PV en 5 s`);
});

essai('chantier, la règle', () => {
  const w = monde(32);
  const p = emplacement(w, 'house', 5);
  const site = w.spawnBuilding(0, 'house', p.tx, p.ty, false);
  site.builderCount = 1;
  for (let i = 0; i < 100; i++) site.addBuildProgress(DT);
  const sain = site.hp;
  site.hp -= 50;
  site.addBuildProgress(DT);
  const gain = site.hp - (sain - 50);
  check('le coup de marteau ajoute des points de vie, il ne les recalcule pas',
    gain > 0 && gain < 2, `+${gain.toFixed(2)} PV en un pas (50 perdus juste avant)`);
  while (!site.complete) site.addBuildProgress(DT);
  check('le chantier se termine avec ses dégâts', Math.abs(site.hp - (site.maxHp - 50)) < 0.01,
    `${site.hp.toFixed(2)}/${site.maxHp}`);
});

// Une ferme achevée abîmée se cultive, et la file de chantiers se poursuit.
essai('chantier abîmé, la suite', () => {
  const w = monde(36);
  w.players[0].resources.wood = 2000;
  const tc = centre(w);
  w.spawnBuilding(0, 'mill', ...Object.values(emplacement(w, 'mill', 4)), true);
  const [fermier, macon] = villageois(w);
  const f = emplacement(w, 'farm', 5);
  const ferme = w.placeBuilding(0, 'farm', f.tx, f.ty, [fermier]);
  const m1 = emplacement(w, 'house', 6);
  const maison1 = w.placeBuilding(0, 'house', m1.tx, m1.ty, [macon]);
  const m2 = emplacement(w, 'house', 6);
  const maison2 = w.placeBuilding(0, 'house', m2.tx, m2.ty, [macon]);
  pas(w, 30, () => ferme.buildProgress > 2 && maison1.buildProgress > 2);
  ferme.takeDamage(20, null);
  maison1.takeDamage(40, null);
  pas(w, 60, () => ferme.complete && maison1.complete);
  pas(w, 0.5);
  check('une ferme achevée abîmée est cultivée par son bâtisseur',
    ferme.complete && ferme.hp < ferme.maxHp && fermier.state === STATE.GATHER && fermier.target === ferme,
    `ferme ${Math.round(ferme.hp)}/${ferme.maxHp}, ouvrier ${fermier.state}`);
  check('une maison achevée abîmée : l’ouvrier enchaîne sur le chantier suivant de sa file',
    maison1.complete && maison1.hp < maison1.maxHp && macon.state === STATE.BUILD && macon.target === maison2,
    `maison ${Math.round(maison1.hp)}/${maison1.maxHp}, ouvrier ${macon.state}`);
});

// Sans un seul coup reçu, rien ne change : terminé à 100 %, l'ouvrier libéré.
essai('chantier intact', () => {
  const w = monde(33);
  w.players[0].resources.wood = 2000;
  const p = emplacement(w, 'house', 5);
  const v = villageois(w)[0];
  const site = w.placeBuilding(0, 'house', p.tx, p.ty, [v]);
  pas(w, 60, () => site.complete);
  pas(w, 0.2);
  check('un chantier jamais frappé se termine à 100 %, ouvrier libéré',
    site.complete && site.hp === site.maxHp && v.state === STATE.IDLE,
    `${site.hp}/${site.maxHp}, ouvrier ${v.state}`);
  // Le Centre-Ville Express a moins de points de vie que sa fiche : il finit
  // quand même à son maximum, pas au-delà.
  const e = monde(34, { mode: 'express' });
  const q = emplacement(e, 'towncenter', 8);
  const tc2 = e.spawnBuilding(0, 'towncenter', q.tx, q.ty, false);
  tc2.builderCount = 1;
  while (!tc2.complete) tc2.addBuildProgress(DT);
  check('un Centre-Ville Express bâti finit à son maximum', tc2.hp === tc2.maxHp, `${tc2.hp}/${tc2.maxHp}`);
});

// ---------------------------------------------------------------------------
// 3. Le pas du groupe tombe à chaque nouvel ordre
// ---------------------------------------------------------------------------

essai('pas de groupe', () => {
  const w = monde(41);
  w.players[0].resources.wood = 2000;
  const tc = centre(w);
  const vs = villageois(w);
  const propre = UNIT_TYPES.villager.speed * TILE * w.players[0].mods.villagerSpeed;
  const belier = w.spawnUnit(0, 'ram', tc.x + TILE * 3, tc.y + TILE * 4);
  const ferme = w.spawnBuilding(0, 'farm', ...Object.values(emplacement(w, 'house', 4)), true);
  const chantier = w.spawnBuilding(0, 'house', ...Object.values(emplacement(w, 'house', 6)), false);
  const arbre = arbrePres(w, tc.x, tc.y);
  const ordres = {
    'récolter': (v) => v.gatherAt(arbre.tx, arbre.ty),
    'cultiver': (v) => v.gatherFarm(ferme),
    'bâtir': (v) => v.buildAt(chantier),
    's’abriter': (v) => v.garrisonAt(tc),
  };
  Object.entries(ordres).forEach(([nom, ordre], i) => {
    const v = vs[i];
    w.formationMove([...vs, belier], tc.x + TILE * 14, tc.y + TILE * 12, false);
    pas(w, 1);
    const enGroupe = v.speedPx();
    ordre(v);   // avant l'arrivée
    check(`pas de groupe : l’ordre « ${nom} » rend sa vitesse à l’ouvrier`,
      enGroupe < propre * 0.7 && v.groupSpeed === 0 && Math.abs(v.speedPx() - propre) < 0.01,
      `${enGroupe.toFixed(1)} px/s en groupe, ${v.speedPx().toFixed(1)} après (${propre.toFixed(1)} à lui)`);
  });
});

// ---------------------------------------------------------------------------
// 4. Raser son bâtiment
// ---------------------------------------------------------------------------

essai('raser un Centre-Ville occupé et en production', () => {
  const w = monde(51);
  const joueur = w.players[0];
  joueur.age = 1;
  joueur.resources = { food: 3000, wood: 3000, gold: 3000 };
  const tc = centre(w);
  // L'Âge des Châteaux se mérite : deux bâtiments parmi quatre (réglages « équilibre »).
  for (const [type, loin] of [['archery', 8], ['stable', 13]]) {
    const p = emplacement(w, type, loin);
    w.spawnBuilding(0, type, p.tx, p.ty, true);
  }
  const archers = [0, 1, 2].map((i) => w.spawnUnit(0, 'archer', tc.x + TILE * (3 + i), tc.y + TILE * 3));
  for (const a of archers) tc.addToGarrison(a);
  for (let i = 0; i < 3; i++) w.trainUnit(tc, 'villager');
  w.researchTech(tc, 'wheelbarrow');
  w.advanceAge(tc);
  pas(w, 2);
  const depense = 3000 - joueur.resources.food;
  w.raserBatiment(tc);
  pas(w, 1);
  check('raser un abri occupé : les occupants sortent vivants',
    tc.dead && archers.every((a) => !a.dead && !a.garrisonedIn),
    `${archers.filter((a) => !a.dead).length}/3 vivants`);
  check('raser un bâtiment en production : la file, la recherche et le passage d’âge sont remboursés',
    depense === 3 * UNIT_TYPES.villager.cost.food + TECHS.wheelbarrow.cost.food + AGES[2].cost.food
    && joueur.resources.food === 3000 && joueur.resources.wood === 3000 && joueur.resources.gold === 3000,
    `nourriture ${joueur.resources.food}, bois ${joueur.resources.wood}, or ${joueur.resources.gold} (3000 au départ)`);
  pas(w, 70);
  check('raser : le passage d’âge remboursé ne se termine pas', joueur.ageProgress === null && joueur.age === 1, `âge ${joueur.age + 1}`);
});

essai('raser une tour pendant l’alerte', () => {
  const w = monde(52);
  w.players[0].age = 1;
  const tc = centre(w);
  const p = emplacement(w, 'tower', 10);
  const tour = w.spawnBuilding(0, 'tower', p.tx, p.ty, true);
  auBois(w);
  // Deux bûcherons de plus, au pied de la tour : ce sont eux qu'elle abritera.
  const arbre = arbrePres(w, tour.x, tour.y);
  const voisins = [0, 1].map((i) => w.spawnUnit(0, 'villager', tour.x + TILE * (i - 1), tour.y + TILE * 2.5));
  w.spreadGatherOrder(voisins, arbre.tx, arbre.ty, 'wood');
  pas(w, 12, () => voisins.every((v) => v.state === STATE.GATHER && !v.path));
  w.ringTownBell(0);
  pas(w, 45, () => dehors(w).length === 0);
  const dedans = tour.garrison.slice();
  w.raserBatiment(tour);
  pas(w, 1);
  check('raser une tour pendant l’alerte : ses occupants en sortent et reprennent leur poste',
    dedans.length > 0 && dedans.every((v) => !v.dead && !v.garrisonedIn && v.state === STATE.GATHER),
    `${dedans.length} occupant(s) : ${dedans.map((v) => (v.dead ? 'mort' : v.state)).join(',')}`);
  // Détruit par l'ennemi, un abri emporte toujours sa garnison (règle d'AoE).
  const abrites = tc.garrison.slice();
  w.killEntity(tc, null, false);
  check('détruit par l’ennemi, un abri emporte toujours sa garnison',
    abrites.length > 0 && abrites.every((v) => v.dead) && dedans.every((v) => !v.dead),
    `${abrites.filter((v) => v.dead).length}/${abrites.length} morts au Centre-Ville`);
});

// ---------------------------------------------------------------------------
// 5. Les ouvriers à l'abri ne sont ni comptés disponibles, ni choisis
// ---------------------------------------------------------------------------

essai('ouvriers à l’abri', () => {
  const w = monde(61);
  w.players[0].resources.wood = 2000;
  const tc = centre(w);
  const vs = auBois(w);
  w.ringTownBell(0);
  check('en route vers l’abri : comptés « à l’abri », pas « en déplacement »',
    vs.every((v) => villagerTask(v) === 'abri'), vs.map((v) => villagerTask(v)).join(','));
  pas(w, 30, () => dehors(w).length === 0);
  check('à l’abri : comptés « à l’abri », pas « sans affectation »',
    vs.every((v) => v.garrisonedIn && villagerTask(v) === 'abri'), vs.map((v) => villagerTask(v)).join(','));
  // « + Bois » sur un abrité : avant, l'ordre était accepté, le compteur
  // montait, personne ne sortait.
  const arbre = arbrePres(w, tc.x, tc.y);
  vs[0].gatherAt(arbre.tx, arbre.ty);
  w.assignVillager(vs[1], 'wood');
  check('un abrité ne prend pas de poste',
    [vs[0], vs[1]].every((v) => v.state === STATE.IDLE && !v.resourceTile && villagerTask(v) === 'abri'),
    [vs[0], vs[1]].map((v) => `${v.state}/${villagerTask(v)}`).join(' '));
  // Une maison posée pendant l'alerte : avant, « 2 ouvriers » et 0 %.
  const p = emplacement(w, 'house', 5);
  const site = w.placeBuilding(0, 'house', p.tx, p.ty, vs.slice(0, 2));
  pas(w, 1);
  check('un chantier posé pendant l’alerte ne compte pas d’abrités dans son équipe',
    w.buildersOn(site) === 0 && site.assignedBuilders === 0, `${w.buildersOn(site)} ouvrier(s) comptés`);
  // Un ordre de marche non plus : il effacerait le poste noté à la cloche.
  vs[2].moveTo(tc.x, tc.y + TILE * 6);
  vs[3].stop();
  const r = w.ringTownBell(0);
  pas(w, 1);
  check('la fin de l’alerte renvoie tout le monde à son poste, ordres reçus à l’abri ignorés',
    r.released === vs.length && vs.every((v) => !v.garrisonedIn && v.state === STATE.GATHER),
    `${r.released} libérés : ${vs.map((v) => v.state).join(',')}`);
});

// ---------------------------------------------------------------------------
// 6. Autres écarts de la même relecture
// ---------------------------------------------------------------------------

// Une technologie entrait dans une file pleine.
essai('file pleine', () => {
  const w = monde(71);
  const joueur = w.players[0];
  joueur.age = 1;
  joueur.resources = { food: 3000, wood: 3000, gold: 3000 };
  const tc = centre(w);
  for (let i = 0; i < 8; i++) w.trainUnit(tc, 'villager');
  const avant = joueur.resources.food;
  const ok = w.researchTech(tc, 'wheelbarrow');
  check('une file pleine refuse aussi une technologie',
    tc.queue.length === 8 && ok === false && joueur.resources.food === avant && w.canResearch(tc, 'wheelbarrow').reason === 'File d’attente pleine',
    `${tc.queue.length} en file, ${w.canResearch(tc, 'wheelbarrow').reason}`);
});

// Le passage d'âge allait à son terme même Centre-Ville rasé par l'ennemi.
essai('âge, Centre-Ville tombé', () => {
  const w = monde(72);
  const joueur = w.players[0];
  joueur.resources = { food: 3000, wood: 3000, gold: 3000 };
  const tc = centre(w);
  w.advanceAge(tc);
  pas(w, 5);
  w.killEntity(tc, w.units.find((u) => u.playerIndex === 1), false);
  pas(w, 60);
  check('le Centre-Ville tombe pendant le passage d’âge : le passage s’arrête',
    joueur.age === 0 && joueur.ageProgress === null, `âge ${joueur.age + 1}`);
});

// Une carcasse ne bloque pas sa case : un bâtiment se posait dessus.
essai('carcasse', () => {
  const w = monde(73);
  const p = emplacement(w, 'house', 5);
  const libre = w.canPlace(0, 'house', p.tx, p.ty, true);
  w.map.addResource(p.tx + 1, p.ty, 'food', w.rng, { amount: 140, gibier: 'deer' });
  check('on ne bâtit pas sur une carcasse', libre && !w.canPlace(0, 'house', p.tx, p.ty, true));
});

// Une fondation éclairait comme un bâtiment fini — et s'annule sans frais.
essai('fondation et brouillard', () => {
  const w = monde(74);
  w.players[0].resources.wood = 2000;
  // Le plus loin possible du Centre-Ville, en terrain connu (tout l'est ici).
  const p = emplacement(w, 'towncenter', 16);
  w.fog.explored.fill(0);
  w.updateFog();
  const connues = () => w.fog.explored.reduce((a, b) => a + b, 0);
  const avant = connues();
  const fondation = w.spawnBuilding(0, 'towncenter', p.tx, p.ty, false);
  w.updateFog();
  const gagne = connues() - avant;
  check('une fondation n’éclaire que ses abords', gagne <= 49, `${gagne} cases découvertes en posant la fondation`);
  fondation.builderCount = 1;
  while (!fondation.complete) fondation.addBuildProgress(DT);
  w.updateFog();
  check('terminé, le bâtiment éclaire à sa portée', connues() - avant > 150, `${connues() - avant} cases`);
});

// ---------------------------------------------------------------------------
// La sauvegarde : une alerte et un chantier abîmé se reprennent à l'identique
// ---------------------------------------------------------------------------

essai('reprise', () => {
  const w = monde(81);
  w.players[0].resources.wood = 2000;
  w.players[0].age = 1;
  const t = emplacement(w, 'tower', 7);
  w.spawnBuilding(0, 'tower', t.tx, t.ty, true);
  const vs = auBois(w);
  const p = emplacement(w, 'house', 5);
  const site = w.placeBuilding(0, 'house', p.tx, p.ty, [vs[0]]);
  pas(w, 12);
  site.takeDamage(40, null);
  w.ringTownBell(0);
  pas(w, 3);
  const repris = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
  check('la sauvegarde se recharge en pleine alerte', !!repris && empreinte(repris) === empreinte(w));
  const r1 = w.ringTownBell(0), r2 = repris.ringTownBell(0);
  pas(w, 40); pas(repris, 40);
  check('après reprise, le second coup de cloche et le chantier abîmé se rejouent à l’identique',
    r1.released === r2.released && r1.released === vs.length && empreinte(repris) === empreinte(w),
    `${r1.released} et ${r2.released} libérés`);
});

// ---------------------------------------------------------------------------
// Deux parties bombardées d'ordres : cloche, abris, démolitions, chantiers,
// reprises de sauvegarde, tirés au hasard (d'une graine : toujours les mêmes).
// Ce qui doit rester vrai à chaque instant est vérifié toutes les deux secondes.
// ---------------------------------------------------------------------------

essai('parties bombardées d’ordres', () => {
  const ecarts = [];
  let cloches = 0, rases = 0;
  for (const seed of [11, 222]) {
    let w = new World({ seed, mapSize: 'small', difficulty: 'normal', mode: seed % 2 ? 'express' : 'classique' });
    w.ais.push(new AIPlayer(w, 0, DIFFICULTIES.normal));
    const hasard = new RNG(seed * 7 + 1);
    const miens = () => w.units.filter((u) => !u.dead && u.playerIndex === 0 && !u.isAnimal);
    const note = (t) => { if (ecarts.length < 8) ecarts.push(`graine ${seed}, ${Math.round(w.time)} s : ${t}`); else ecarts.length++; };
    for (let t = 0; t < TICKS_PER_SECOND * 60 * 6 && !w.gameOver; t++) {
      w.update(DT);
      if (t % 40 !== 0) continue;
      const a = hasard.next();
      const groupe = miens().filter(() => hasard.next() < 0.4);
      if (a < 0.2) { w.ringTownBell(0); cloches++; }
      else if (a < 0.45) w.commandUnits(groupe, hasard.next() * w.map.pixelWidth, hasard.next() * w.map.pixelHeight);
      else if (a < 0.55) {
        const abri = w.buildings.find((b) => b.playerIndex === 0 && b.def.garrison && b.complete);
        if (abri) w.garrisonUnits(groupe, abri);
      } else if (a < 0.62) for (const u of groupe) u.stop();
      else if (a < 0.72) {
        const types = Object.keys(BUILDING_TYPES);
        const v = miens().find((u) => u.isVillager);
        if (v) w.placeBuilding(0, types[Math.floor(hasard.next() * types.length)], Math.floor(v.x / TILE) + 3, Math.floor(v.y / TILE) + 3, groupe);
      } else if (a < 0.78) {
        const bs = w.buildings.filter((b) => b.playerIndex === 0 && b.type !== 'towncenter');
        const b = bs[Math.floor(hasard.next() * bs.length)];
        if (b) { rases++; if (b.complete) w.raserBatiment(b); else w.cancelConstruction(b); }
      } else if (a < 0.84) {
        const tc = centre(w);
        if (tc) { w.trainUnit(tc, 'villager'); w.advanceAge(tc); }
      } else if (a < 0.9) w = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
      else if (a < 0.95) for (const b of w.buildings) if (b.playerIndex === 0 && b.garrison.length) w.releaseGarrison(b);
      w.drainEvents();

      for (const p of w.players) for (const k of ['food', 'wood', 'gold']) if (!(p.resources[k] >= 0)) note(`${k} à ${p.resources[k]}`);
      for (const b of w.buildings) {
        if (b.def.garrison && b.garrison.length > b.def.garrison.capacity) note(`abri à ${b.garrison.length} occupants`);
        if (b.garrison.some((u) => u.dead || u.garrisonedIn !== b)) note('occupant incohérent');
        if (!(b.hp > 0) || b.hp > b.maxHp) note(`bâtiment à ${b.hp}/${b.maxHp} PV`);
      }
      for (const u of w.units) {
        if (u.garrisonedIn && (u.garrisonedIn.dead || !u.garrisonedIn.garrison.includes(u))) note('abrité sans abri');
        if (u.garrisonedIn && u.state !== STATE.IDLE) note(`abrité avec un ordre (${u.state})`);
        if (u.posteAvantAbri && !u.isVillager) note('poste noté sur un soldat');
      }
      const pop = [0, 0];
      for (const u of w.units) if (!u.dead && !u.isAnimal) pop[u.playerIndex] += u.def.pop || 1;
      w.players.forEach((p, i) => { if (p.pop !== pop[i]) note(`population ${p.pop} pour ${pop[i]} comptés`); });
    }
    // Un dernier « second coup » : plus personne ne garde de poste noté.
    if (!w.gameOver && w.units.some((u) => u.playerIndex === 0 && u.posteAvantAbri)) {
      w.ringTownBell(0);
      pas(w, 2);
      const restes = w.units.filter((u) => u.playerIndex === 0 && u.posteAvantAbri).length;
      if (restes) note(`${restes} poste(s) encore notés après le second coup`);
    }
  }
  check('deux parties bombardées d’ordres : abris, ressources et population restent cohérents',
    ecarts.length === 0 && cloches > 20 && rases > 5,
    ecarts.length ? ecarts.join(' | ') : `${cloches} coups de cloche, ${rases} démolitions`);
});

console.log(`\n${failures === 0 ? '✅ Tous les tests passent' : '❌ ' + failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
