// Les deux peuples se jouent autrement (js/config.js, CIVILISATIONS) : les Atlantes tiennent, les Solariens vont
// vite. Leurs traits, leur technologie propre, l'Hydre qui se soigne et le Sphinx qui balaie — et l'équilibre
// entre les deux, mesuré par outils/peuples.mjs.
// Lancement : node test/peuples.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CIVILISATIONS, UNIT_TYPES, BUILDING_TYPES, TECHS, TILE, troupeDe, techDe, textesDesTables } from '../js/config.js';
import { World } from '../js/game.js';
import { serializeWorld, restoreWorld } from '../js/save.js';
import { optionsDeScenario } from '../js/scenarios.js';
import { FICHES, FICHES_CIV } from '../js/fiches-troupes.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${!condition && detail ? ' — ' + detail : ''}`);
}
const proche = (a, b, marge = 1e-6) => Math.abs(a - b) <= marge;
const avancer = (monde, secondes) => { for (let i = 0; i < Math.round(secondes * 20) && !monde.gameOver; i++) monde.update(1 / 20); };
/** Une partie Express, Atlantes en place 0 et Solariens en place 1 (ou l'inverse), sans personne aux commandes. */
const partie = (civs = ['atlante', 'solarien'], extra = {}) => new World({ mode: 'express', difficulty: 'normal', seed: 4242, civs, places: ['distant', 'distant'], ...extra });

const A = CIVILISATIONS.atlante, S = CIVILISATIONS.solarien;

// --- Les données -----------------------------------------------------------------------------
console.log('--- Les traits ---');
for (const peuple of [A, S]) {
  check(`${peuple.name} : une devise, des traits lisibles, une technologie à eux`, peuple.devise.length > 5 && peuple.traits.length >= 3 && peuple.traits.every((t) => t.length > 15 && /\.$/.test(t))
    && !!TECHS[peuple.tech] && TECHS[peuple.tech].civ === peuple.id && techDe(peuple.id) === peuple.tech);
  check(`${peuple.name} : leurs réglages sont des nombres ronds`, Object.values(peuple.mods || {}).every((v) => Number.isInteger(v)) && Object.values(peuple.vitesse || {}).every((v) => Number.isInteger(v) && v % 5 === 0));
}
check('les deux devises disent deux façons de jouer', A.devise !== S.devise);
check('chaque trait écrit dit le chiffre que le jeu applique', (() => {
  const a = A.traits.join(' '), s = S.traits.join(' ');
  const pourCent = (v) => `${Math.abs(v - 100)} %`;
  return (!A.mods.vieDesBatiments || a.includes(pourCent(A.mods.vieDesBatiments))) && (!A.mods.porteeDesTours || a.includes(`${A.mods.porteeDesTours} case`))
    && a.includes(`${A.troupes.hydra.regen} points de vie par seconde`) && s.includes(pourCent(S.vitesse.villager))
    && a.includes('+10 points de vie') && s.includes('+10 % de vitesse');
})(), `${A.traits.join(' ')} / ${S.traits.join(' ')}`);
check('les prix, les âges et les bâtiments restent les mêmes pour tous : un peuple ne change que ses traits', ['cost', 'trainTime', 'hp', 'attack', 'age', 'from', 'pop'].every((champ) => Object.keys(UNIT_TYPES).every((t) => JSON.stringify(troupeDe(t, 'solarien')[champ]) === JSON.stringify(UNIT_TYPES[t][champ]) && JSON.stringify(troupeDe(t, 'atlante')[champ]) === JSON.stringify(UNIT_TYPES[t][champ]))));
{
  const vus = []; textesDesTables((objet, champ) => vus.push(objet[champ]));
  check('la devise et les traits se traduisent', [A.devise, S.devise, ...A.traits, ...S.traits].every((t) => vus.includes(t)));
}

console.log('--- Les troupes d’un peuple ---');
check('une troupe que le peuple ne change pas reste celle du jeu, sans copie', troupeDe('militia', 'solarien') === UNIT_TYPES.militia && troupeDe('villager', 'atlante') === UNIT_TYPES.villager && troupeDe('archer', 'atlante') === UNIT_TYPES.archer);
check('Fellahs, Chacals dressés et Méharistes marchent plus vite, de ce que dit le trait', ['villager', 'scout', 'knight'].every((t) => proche(troupeDe(t, 'solarien').speed, (UNIT_TYPES[t].speed * S.vitesse[t]) / 100)) && S.vitesse.villager === 110);
check('la même troupe demandée deux fois est le même objet, et il ne se modifie pas', troupeDe('villager', 'solarien') === troupeDe('villager', 'solarien') && Object.isFrozen(troupeDe('villager', 'solarien')));
check('l’Hydre des Atlantes mord trois ennemis et se soigne ; le Sphinx balaie et ne se soigne pas', troupeDe('hydra', 'atlante').morsures === 3 && troupeDe('hydra', 'atlante').regen === 3 && !troupeDe('hydra', 'atlante').balayage
  && troupeDe('hydra', 'solarien').balayage === true && !(troupeDe('hydra', 'solarien').morsures > 1) && !troupeDe('hydra', 'solarien').regen);
check('un peuple inconnu joue comme les Atlantes', troupeDe('hydra', 'martien') === troupeDe('hydra', 'atlante') && techDe('martien') === 'ecailles');
check('une troupe inconnue n’a pas de définition', troupeDe('licorne', 'solarien') === undefined);

// --- Dans la partie ---------------------------------------------------------------------------------
console.log('--- Dans la partie ---');
{
  const w = partie();
  const [atlante, solarien] = w.players;
  check('chaque camp reçoit les traits de son peuple au départ', atlante.mods.porteeDesTours === (A.mods.porteeDesTours || 0) && atlante.mods.vieDesBatiments === (A.mods.vieDesBatiments || 100) && atlante.mods.construction === 100
    && solarien.mods.construction === 100 && solarien.mods.porteeDesTours === 0 && solarien.mods.vieDesBatiments === 100);
  const fellah = w.units.find((u) => u.playerIndex === 1 && u.isVillager), villageois = w.units.find((u) => u.playerIndex === 0 && u.isVillager);
  check('un Fellah marche 10 % plus vite qu’un Villageois', proche(fellah.speedPx(), villageois.speedPx() * 1.1, 1e-9) && fellah.def !== villageois.def);
  const centres = w.buildings.filter((b) => b.type === 'towncenter');
  const vieDeBase = Math.round(BUILDING_TYPES.towncenter.hp * w.mode.townCenterHp);
  check('les bâtiments des Atlantes ont les points de vie que dit leur trait ; ceux des Solariens, ceux du jeu', centres[0].maxHp === Math.round((vieDeBase * atlante.mods.vieDesBatiments) / 100) && centres[0].hp === centres[0].maxHp && centres[1].maxHp === vieDeBase);
  const tourA = w.spawnBuilding(0, 'tower', centres[0].tx + 6, centres[0].ty, true), tourS = w.spawnBuilding(1, 'tower', centres[1].tx - 6, centres[1].ty, true);
  check('une tour atlante tire plus loin, pas leur bâtiment principal', proche(tourA.rangePx(), tourS.rangePx() + (A.mods.porteeDesTours || 0) * TILE) && proche(centres[0].rangePx(), centres[1].rangePx()));
  // Deux chantiers pareils, un bâtisseur chacun : aujourd'hui aucun peuple ne bâtit plus vite — le réglage existe
  // (`construction`, en pour cent), et il a été écarté : à 120, les Solariens gagnaient 70 % des parties.
  const chantierA = w.spawnBuilding(0, 'house', centres[0].tx + 6, centres[0].ty + 5, false), chantierS = w.spawnBuilding(1, 'house', centres[1].tx - 6, centres[1].ty + 5, false);
  for (const c of [chantierA, chantierS]) { c.builderCount = 1; for (let i = 0; i < 100; i++) c.addBuildProgress(1 / 20); }
  check('les deux peuples bâtissent à la même vitesse', proche(chantierS.buildProgress, chantierA.buildProgress, 1e-9) && chantierA.buildProgress > 0 && !S.mods);
  solarien.mods.construction = 120;
  const avant = chantierS.buildProgress;
  for (let i = 0; i < 100; i++) chantierS.addBuildProgress(1 / 20);
  check('le réglage de vitesse des chantiers fait ce qu’il dit (en pour cent)', proche(chantierS.buildProgress - avant, avant * 1.2, 1e-9));
  solarien.mods.construction = 100;
  check('une maison atlante en chantier part de 5 % de sa vie, comme les autres', (() => { const c = w.spawnBuilding(0, 'house', centres[0].tx + 9, centres[0].ty + 5, false); return proche(c.hp, c.maxHp * 0.05, 1e-9); })());
}
{
  // L'Hydre se soigne hors du combat ; le Sphinx, non.
  const w = partie();
  const c0 = w.buildings.find((b) => b.type === 'towncenter' && b.playerIndex === 0), c1 = w.buildings.find((b) => b.type === 'towncenter' && b.playerIndex === 1);
  const hydre = w.spawnUnit(0, 'hydra', c0.x + 96, c0.y), sphinx = w.spawnUnit(1, 'hydra', c1.x - 96, c1.y);
  for (const m of [hydre, sphinx]) { m.hp = 100; m.lastHitAt = w.time; }
  avancer(w, 4);
  check('blessée, l’Hydre attend d’être hors du combat : rien pendant cinq secondes', hydre.hp === 100 && sphinx.hp === 100);
  avancer(w, 4);
  check('… puis elle se soigne de 3 points de vie par seconde ; le Sphinx reste comme il est', hydre.hp > 105 && hydre.hp < 112 && sphinx.hp === 100, `${hydre.hp}`);
  hydre.hp = hydre.maxHp - 1;
  avancer(w, 2);
  check('elle ne dépasse jamais ses points de vie', hydre.hp === hydre.maxHp);
  const copie = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
  check('une partie reprise garde les traits des deux camps', copie.players[0].mods.vieDesBatiments === w.players[0].mods.vieDesBatiments && copie.players[1].mods.construction === 100
    && copie.units.find((u) => u.id === hydre.id).def.regen === 3 && copie.units.find((u) => u.id === sphinx.id).def.balayage === true);
}
{
  // Le coup du Sphinx touche tous les ennemis devant lui ; l'Hydre, trois au plus.
  const frapper = (civs, moi) => {
    const w = partie(civs);
    const monstre = w.spawnUnit(moi, 'hydra', 800, 800);
    monstre.x = 800; monstre.y = 800;
    const devant = [];
    for (let i = 0; i < 5; i++) { const u = w.spawnUnit(1 - moi, 'militia', 800, 800); u.x = 824 + (i % 2) * 6; u.y = 776 + i * 12; devant.push(u); }
    const derriere = w.spawnUnit(1 - moi, 'militia', 800, 800); derriere.x = 772; derriere.y = 800;
    w.rebuildGrid();
    w.performAttack(monstre, devant[2]);
    return { w, touches: devant.filter((u) => u.hp < u.maxHp).length, dos: derriere.hp < derriere.maxHp, effets: w.effects.filter((e) => e.kind === 'balayage').length };
  };
  const sphinx = frapper(['atlante', 'solarien'], 1), hydre = frapper(['atlante', 'solarien'], 0);
  check('le Sphinx frappe les cinq ennemis devant lui, pas celui qui est dans son dos', sphinx.touches === 5 && sphinx.dos === false && sphinx.effets === 1);
  check('l’Hydre en mord trois, pas plus', hydre.touches === 3 && hydre.dos === false && hydre.effets === 0);
  check('le monstre-chef d’un scénario n’a ni soin ni balayage : c’est la troupe du jeu', (() => { const w = new World({ ...optionsDeScenario({ id: 'hydre' }, ['solarien', 'atlante']), difficulty: 'normal' }); avancer(w, 91); const m = w.scenario.monstre(); return !!m && !m.def.regen && !m.def.balayage && m.def.morsures === 3; })());
}

// --- Les technologies propres -----------------------------------------------------------------------
console.log('--- Les technologies propres ---');
{
  const w = partie();
  const [atlante, solarien] = w.players;
  for (const p of w.players) p.resources = { food: 2000, wood: 2000, gold: 2000 };
  const c0 = w.buildings.find((b) => b.type === 'towncenter' && b.playerIndex === 0), c1 = w.buildings.find((b) => b.type === 'towncenter' && b.playerIndex === 1);
  const forgeA = w.spawnBuilding(0, 'blacksmith', c0.tx + 6, c0.ty, true), forgeS = w.spawnBuilding(1, 'blacksmith', c1.tx - 6, c1.ty, true);
  check('chaque peuple recherche la sienne, pas celle de l’autre', w.canResearch(forgeA, 'ecailles').ok && !w.canResearch(forgeA, 'marche').ok && w.canResearch(forgeS, 'marche').ok && !w.canResearch(forgeS, 'ecailles').ok);
  check('la Forge les propose toutes les deux ; l’écran ne montre que celle du peuple', BUILDING_TYPES.blacksmith.techs.includes('ecailles') && BUILDING_TYPES.blacksmith.techs.includes('marche') && /if \(tech\.civ && tech\.civ !== this\.game\.civ\) continue;/.test(lire('js/ui.js')));
  const milicien = w.spawnUnit(0, 'militia', c0.x + 96, c0.y), archer = w.spawnUnit(0, 'archer', c0.x + 96, c0.y + 32);
  const vie = milicien.maxHp;
  w.applyTech(atlante, 'ecailles');
  check('Écailles profondes : l’infanterie déjà là gagne 10 points de vie, pas les tireurs', milicien.maxHp === vie + 10 && milicien.hp === vie + 10 && archer.maxHp === UNIT_TYPES.archer.hp && atlante.mods.vieInfanterie === 10);
  const recrue = w.spawnUnit(0, 'spearman', c0.x + 96, c0.y - 32);
  check('… et celle qui vient après aussi', recrue.maxHp === UNIT_TYPES.spearman.hp + 10 && recrue.hp === recrue.maxHp);
  w.applyTech(atlante, 'ecailles');
  check('une technologie ne s’applique qu’une fois', milicien.maxHp === vie + 10 && atlante.mods.vieInfanterie === 10);
  const garde = w.spawnUnit(1, 'militia', c1.x - 96, c1.y), fellah = w.units.find((u) => u.playerIndex === 1 && u.isVillager);
  const pas = garde.speedPx(), pasDuFellah = fellah.speedPx();
  w.applyTech(solarien, 'marche');
  check('Marche du Soleil : toute l’armée marche 10 % plus vite, pas les ouvriers', proche(garde.speedPx(), pas * 1.1, 1e-9) && proche(fellah.speedPx(), pasDuFellah) && solarien.mods.vitesseArmee === 110 && proche(milicien.speedPx(), pas));
  milicien.hp -= 7;
  const repris = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
  const m2 = repris.units.find((u) => u.id === milicien.id), g2 = repris.units.find((u) => u.id === garde.id);
  check('une partie reprise garde les deux technologies et leurs effets', m2.maxHp === vie + 10 && m2.hp === milicien.hp && proche(g2.speedPx(), garde.speedPx()) && repris.players[0].techs.has('ecailles') && repris.players[1].techs.has('marche'));
  check('l’ordinateur recherche la technologie de son peuple après les trois autres', /for \(const tech of \['forging', 'fletching', 'scaleArmor', techDe\(player\.civ\)\]\)/.test(lire('js/ai.js')));
  check('chaque technologie a son icône dessinée pour le jeu', ['ecailles', 'marche'].every((id) => lire('js/icones.js').includes(`  ${TECHS[id].icon}: { n: '`)));
}

// --- L'ordinateur et les fiches -------------------------------------------------------------------------
console.log('--- L’ordinateur, les fiches, l’accueil ---');
{
  check('l’ordinateur solarien forme les mêmes troupes aux deux premiers âges, et mise sur ses montures au troisième', JSON.stringify(S.armee[1]) === JSON.stringify(['archer', 'spearman', 'archer']) && S.armee[2].filter((t) => t === 'knight').length >= 3 && S.armee.flat().every((t) => !!UNIT_TYPES[t]) && !A.armee);
  check('la fiche du Sphinx dit ce qu’il fait : il frappe tous les ennemis devant lui et ne se soigne pas', /tous les ennemis devant lui/.test(FICHES_CIV.solarien.hydra.role) && /ne se soigne pas/.test(FICHES_CIV.solarien.hydra.craint) && !/3 ennemis/.test(FICHES_CIV.solarien.hydra.role));
  check('celle de l’Hydre dit qu’elle mord trois ennemis et se soigne seule', /mord 3 ennemis/.test(FICHES.hydra.role) && /se soigne seule/.test(FICHES.hydra.conseil));
  check('le nom et la description du Sphinx suivent', /frappe tous les ennemis devant lui/.test(S.noms.hydra.desc));
  const main = lire('js/main.js');
  check('l’accueil montre la devise du peuple choisi, ses traits repliés dessous, et suit le choix', /function refreshTraits\(\)/.test(main) && /if \(illustre\) refreshTraits\(\);/.test(main) && lire('index.html').includes('<details id="civ-traits" class="civ-traits">'));
  check('l’aide de la partie rappelle les traits du peuple joué', /peuple\.devise\} \$\{peuple\.traits\.join\(' '\)\}/.test(lire('js/ui.js')));
  check('l’outil de mesure est livré avec le jeu, et le script des essais lance celui-ci', fs.existsSync(path.join(RACINE, 'outils/peuples.mjs')) && lire('package.json').includes('"peuples": "node outils/peuples.mjs"') && lire('package.json').includes('node test/peuples.test.js'));
}

// --- L'équilibre : un coup d'œil ---------------------------------------------------------------------------
// (La vraie mesure se fait par `npm run peuples`, sur 80 parties. Ici, quelques parties seulement : le garde-fou
// qui aurait attrapé un peuple incapable de gagner — l'ordinateur solarien perdait tout quand il formait des
// éclaireurs au deuxième âge.)
console.log('--- L’équilibre ---');
{
  const gains = { atlante: 0, solarien: 0 };
  for (let carte = 0; carte < 4; carte++) {
    for (const civs of [['atlante', 'solarien'], ['solarien', 'atlante']]) {
      const w = new World({ mode: 'escarmouche', difficulty: 'normal', seed: 1000 + carte * 7919, civs, places: ['ordinateur', 'ordinateur'] });
      avancer(w, 301);
      if (w.gameOver && w.gameOver.winner >= 0) gains[civs[w.gameOver.winner]]++;
    }
  }
  check(`sur huit Escarmouches entre ordinateurs, chaque peuple en gagne au moins deux (${gains.atlante} à ${gains.solarien})`, gains.atlante >= 2 && gains.solarien >= 2);
}

console.log(failures ? `\n${failures} essai(s) en échec` : '\nTout est bon.');
process.exit(failures ? 1 : 0);
