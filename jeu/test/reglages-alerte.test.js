// Réglages « alerte » : l'alerte d'attaque dit où, la pastille « Armée », la
// croix qui lâche la sélection.
// Lancement : node test/reglages-alerte.test.js
//
// Sous node, on ne voit pas l'écran. On vérifie donc ce qui se calcule : le
// lieu porté par l'alerte (le vrai monde), la logique des foyers et de la
// pastille (js/ui.js, sans DOM), le tracé du repère sur une toile factice, le
// message et les boutons sur des éléments factices, et le câblage en relisant
// index.html et la feuille de style. Les gestes eux-mêmes — toucher le message,
// la pastille, la croix — restent à voir dans un navigateur.

import { World } from '../js/game.js';
import { TILE, TICKS_PER_SECOND } from '../js/config.js';
import { ICONES } from '../js/icones.js';
import { Camera, Renderer } from '../js/render.js';
import { UI, FoyersAttaque, DUREE_REPERE, armeeDe, coeurDe, toucherArmee } from '../js/ui.js';
import { readFileSync } from 'node:fs';

const DT = 1 / TICKS_PER_SECOND;
let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? '  ok  ' : ' FAIL ';
  if (!condition) failures++;
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

/** Un monde sans adversaire qui joue : seuls nos ordres comptent. */
function bac(seed = 7) {
  const w = new World({ seed, mapSize: 'small', difficulty: 'normal' });
  w.ais = [];
  w.drainEvents();
  return w;
}

const palais = (w, i = 0) => w.buildings.find((b) => b.playerIndex === i && b.type === 'towncenter');

function avancer(w, secondes, stop) {
  const evenements = [];
  for (let i = 0; i < Math.round(secondes * TICKS_PER_SECOND); i++) {
    w.update(DT);
    evenements.push(...w.drainEvents());
    if (stop && stop(evenements)) break;
  }
  return evenements;
}

const lire = (chemin) => readFileSync(new URL(chemin, import.meta.url), 'utf8');

console.log('=== Réglages « alerte » ===');

// ---------------------------------------------------------------------------
// 1. L'alerte porte son lieu : c'est lui que le message et la mini-carte montrent.
// ---------------------------------------------------------------------------
{
  console.log('\n— L’alerte d’attaque porte son lieu —');
  const w = bac();
  const tc = palais(w);
  const victime = w.spawnUnit(0, 'militia', tc.x + TILE * 6, tc.y + TILE * 6);
  victime.setStance('passive');   // elle encaisse sans bouger : son lieu est connu
  // Un archer tire d'où il est : pas de chemin à trouver jusqu'à la victime.
  const agresseur = w.spawnUnit(1, 'archer', victime.x + TILE * 3, victime.y);
  agresseur.attackEntity(victime);
  const alertes = avancer(w, 20, (ev) => ev.some((e) => e.type === 'underAttack'))
    .filter((e) => e.type === 'underAttack');
  check('un coup reçu par le joueur émet une alerte', alertes.length > 0);
  const a = alertes[0];
  const ecart = a ? Math.hypot(a.x - victime.x, a.y - victime.y) : Infinity;
  check('l’alerte porte le lieu du coup : là où se tient la victime', !!a && a.entity === victime && ecart < 1,
    `${ecart.toFixed(1)} px de la victime`);

  // Frapper l'adversaire n'est pas être attaqué : pas d'alerte pour ses pertes à lui.
  const w2 = bac();
  const tc2 = palais(w2);
  const tireur = w2.spawnUnit(0, 'archer', tc2.x + TILE * 6, tc2.y + TILE * 6);
  const proie = w2.spawnUnit(1, 'militia', tireur.x + TILE * 3, tireur.y);
  proie.setStance('passive');
  tireur.attackEntity(proie);
  const pv = proie.hp;
  const ev2 = avancer(w2, 8);
  check('frapper l’adversaire sans être touché ne sonne pas l’alerte',
    proie.hp < pv && !ev2.some((e) => e.type === 'underAttack'), `${pv - proie.hp} points infligés`);
}

// ---------------------------------------------------------------------------
// 2. Une alerte par foyer d'attaque.
// ---------------------------------------------------------------------------
{
  console.log('\n— Une alerte par foyer —');
  /** Des combats (lieu, début, fin) qui frappent à chaque pas : quelles alertes sonnent ? */
  const jouer = (combats, duree) => {
    const foyers = new FoyersAttaque(), sonnees = [];
    for (let i = 0; i < Math.round(duree / DT); i++) {
      const t = i * DT;
      for (const c of combats) {
        if (t < c.debut || t >= c.fin) continue;
        if (foyers.signaler(c.x, c.y)) sonnees.push({ t, x: c.x, y: c.y });
      }
      foyers.vieillir(DT);
    }
    return sonnees;
  };
  const village = { x: 10 * TILE, y: 60 * TILE }, front = { x: 60 * TILE, y: 10 * TILE };

  const seul = jouer([{ ...village, debut: 0, fin: 60 }], 60);
  check('un combat d’une minute au même endroit : une alerte toutes les douze secondes, pas plus',
    seul.length === 5 && seul[0].t === 0, `${seul.length} alertes : ${seul.map((s) => s.t.toFixed(0)).join(', ')} s`);

  const autour = jouer([
    { ...village, debut: 0, fin: 11 },
    { x: village.x + 10 * TILE, y: village.y, debut: 1, fin: 11 },
    { x: village.x, y: village.y - 15 * TILE, debut: 2, fin: 11 },
  ], 11);
  check('les coups reçus autour d’une alerte encore chaude ne redisent rien', autour.length === 1, `${autour.length} alerte(s)`);

  // Le cas que l'ancien délai unique ratait : l'armée se bat au loin, le village est frappé.
  const deux = jouer([{ ...front, debut: 0, fin: 30 }, { ...village, debut: 1, fin: 30 }], 10);
  const auVillage = deux.find((s) => s.x === village.x);
  check('une attaque ailleurs sur la carte a son alerte, sans attendre douze secondes',
    deux.length === 2 && !!auVillage && auVillage.t <= 3.1,
    auVillage ? `village annoncé à ${auVillage.t.toFixed(2)} s` : 'village jamais annoncé');

  const alterne = jouer([{ ...front, debut: 0, fin: 24 }, { ...village, debut: 0, fin: 24 }], 24);
  check('deux combats en même temps n’inondent pas : deux alertes chacun en 24 s', alterne.length === 4, `${alterne.length} alertes`);

  const cinq = jouer([0, 1, 2, 3, 4].map((k) => ({ x: (5 + k * 20) * TILE, y: (5 + k * 20) * TILE, debut: 0, fin: 20 })), 12);
  let ecartMin = Infinity;
  for (let k = 1; k < cinq.length; k++) ecartMin = Math.min(ecartMin, cinq[k].t - cinq[k - 1].t);
  check('cinq attaques à la fois : jamais deux alertes à moins de trois secondes', cinq.length >= 4 && ecartMin > 2.9,
    `${cinq.length} alertes, ${ecartMin.toFixed(2)} s au plus serré`);

  // Le repère dure six secondes, le silence douze ; la liste reste la même (le rendu la tient).
  const foyers = new FoyersAttaque(), liste = foyers.liste;
  foyers.signaler(village.x, village.y);
  check('une alerte pose un repère de six secondes à son lieu',
    liste.length === 1 && liste[0].x === village.x && liste[0].y === village.y && liste[0].repere === DUREE_REPERE && DUREE_REPERE === 6);
  for (let i = 0; i < 6.5 / DT; i++) foyers.vieillir(DT);
  check('après six secondes le repère s’éteint, le foyer reste muet',
    liste.length === 1 && liste[0].repere <= 0 && foyers.signaler(village.x + TILE, village.y) === false);
  for (let i = 0; i < 6 / DT; i++) foyers.vieillir(DT);
  check('après douze secondes le foyer refroidit : la même attaque est redite',
    liste.length === 0 && foyers.signaler(village.x, village.y) === true && foyers.liste === liste && liste.length === 1);
}

// ---------------------------------------------------------------------------
// 3. Le repère rouge sur la mini-carte (toile factice : on relit ce qui est tracé).
// ---------------------------------------------------------------------------
{
  console.log('\n— Le repère sur la mini-carte —');
  const w = bac();
  w.map.dirty = false;
  const traces = [];
  const toile = new Proxy({}, {
    get: (etat, nom) => (nom in etat ? etat[nom]
      : (...args) => { traces.push({ nom, args, trait: etat.strokeStyle, fond: etat.fillStyle }); }),
    set: (etat, nom, valeur) => { etat[nom] = valeur; return true; },
  });
  const rendu = Object.create(Renderer.prototype);
  Object.assign(rendu, {
    world: w, camera: new Camera(w), width: 390, height: 700,
    minimapCtx: toile, minimapCanvas: { width: 160, height: 160 }, minimapTerrain: {}, minimapDirty: false,
    fogCanvas: {}, alertes: [],
  });
  const dessiner = () => { traces.length = 0; rendu.drawMinimap(); return traces.filter((c) => c.nom === 'arc'); };

  check('sans alerte, la mini-carte ne porte aucun repère', dessiner().length === 0 && traces.some((c) => c.nom === 'strokeRect'));

  const foyers = new FoyersAttaque();
  rendu.alertes = foyers.liste;
  const lieu = { x: 20.5 * TILE, y: 40.5 * TILE }, echelle = 160 / w.map.w;
  foyers.signaler(lieu.x, lieu.y);
  foyers.vieillir(0.25);
  const tot = dessiner();
  check('une alerte trace son repère au lieu de l’attaque',
    tot.length === 2 && tot.every((c) => Math.abs(c.args[0] - 20.5 * echelle) < 1e-9 && Math.abs(c.args[1] - 40.5 * echelle) < 1e-9),
    tot.length ? `(${tot[0].args[0].toFixed(1)}, ${tot[0].args[1].toFixed(1)}) sur 160` : 'rien de tracé');
  check('le repère est rouge : une onde et un point',
    tot.length === 2 && /^rgba\(255,59,48,/.test(tot[0].trait) && tot[1].fond === '#ff3b30', tot.map((c) => c.trait).join(' · '));
  const cadre = traces.findIndex((c) => c.nom === 'strokeRect'), premier = traces.findIndex((c) => c.nom === 'arc');
  check('il est tracé par-dessus le cadre de la vue', cadre >= 0 && premier > cadre);

  foyers.vieillir(0.5);
  const tard = dessiner();
  const opacite = (c) => Number(c.trait.match(/,([\d.]+)\)$/)[1]);
  check('il pulse : l’onde s’élargit et s’efface',
    tard.length === 2 && tard[0].args[2] > tot[0].args[2] + 5 && opacite(tard[0]) < opacite(tot[0]) - 0.3,
    `rayon ${tot[0].args[2].toFixed(1)} → ${tard[0].args[2].toFixed(1)}, opacité ${opacite(tot[0]).toFixed(2)} → ${opacite(tard[0]).toFixed(2)}`);

  foyers.vieillir(5.5);
  check('six secondes plus tard, le repère a disparu', dessiner().length === 0 && foyers.liste.length === 1);
}

// ---------------------------------------------------------------------------
// 4. La pastille « Armée ».
// ---------------------------------------------------------------------------
{
  console.log('\n— La pastille « Armée » —');
  const w = bac();
  const tc = palais(w);
  const depart = armeeDe(w, 0);
  check('au départ, l’armée, c’est l’éclaireur', depart.length === 1 && depart[0].type === 'scout', depart.map((u) => u.type).join(', '));

  const pres = [0, 1, 2].map((i) => w.spawnUnit(0, 'militia', tc.x + TILE * (4 + i), tc.y + TILE * 5));
  const loin = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => w.spawnUnit(0, i % 2 ? 'archer' : 'spearman',
    tc.x + TILE * (30 + (i % 4)), tc.y - TILE * (30 + (i >> 2))));
  const pretresse = w.spawnUnit(0, 'priest', tc.x + TILE * 4, tc.y + TILE * 6);
  w.spawnUnit(0, 'villager', tc.x + TILE * 5, tc.y + TILE * 6);
  w.spawnAnimal('pig', tc.x + TILE * 6, tc.y + TILE * 6, 0);          // un cochon capturé : à nous, mais pas un soldat
  w.spawnUnit(1, 'militia', tc.x + TILE * 8, tc.y + TILE * 8);
  const armee = armeeDe(w, 0);
  check('l’armée compte tous les soldats, pas les ouvriers, ni les animaux, ni l’adversaire',
    armee.length === 13 && armee.every((u) => u.playerIndex === 0 && !u.isVillager && !u.isAnimal)
      && [...pres, ...loin, pretresse].every((u) => armee.includes(u)),
    `${armee.length} soldats pour ${w.units.filter((u) => u.playerIndex === 0).length} unités du joueur`);

  // Premier toucher : toute l'armée, où qu'elle soit — quelle que soit la sélection d'avant.
  const premier = toucherArmee(w, 0, [pres[0]]);
  check('un toucher prend toute l’armée, où qu’elle soit sur la carte',
    !!premier && !!premier.prendre && premier.prendre.length === 13 && loin.every((u) => premier.prendre.includes(u)) && !premier.voir);
  // Second toucher : elle est en main, la vue va sur le gros de la troupe.
  const second = toucherArmee(w, 0, premier.prendre.slice());
  check('un second toucher, armée déjà en main, amène la vue sur elle',
    !!second && !!second.voir && !second.prendre && armee.includes(second.voir));
  check('… sur le gros de la troupe (huit au loin contre cinq au village)', !!second.voir && loin.includes(second.voir),
    second.voir ? second.voir.type : '');
  // Un soldat de plus : l'armée n'est plus toute en main, le toucher la reprend.
  const recrue = w.spawnUnit(0, 'militia', tc.x + TILE * 5, tc.y + TILE * 7);
  const troisieme = toucherArmee(w, 0, premier.prendre.slice());
  check('une recrue arrive : le toucher reprend toute l’armée, elle comprise',
    !!troisieme.prendre && troisieme.prendre.length === 14 && troisieme.prendre.includes(recrue));
  // Un mort ne compte plus.
  w.killEntity(recrue, null, true);
  check('un soldat tombé ne compte plus', armeeDe(w, 0).length === 13 && !armeeDe(w, 0).includes(recrue));

  // Le cœur d'une armée : jamais un point en rase campagne.
  const A = { x: 0, y: 0 }, B = { x: 1000, y: 0 };
  check('le cœur d’une armée coupée en deux moitiés est l’un de ses soldats', [A, B].includes(coeurDe([A, B])));
  check('le cœur d’une armée vide n’existe pas', coeurDe([]) === null);

  // Des soldats à l'abri : comptés, mais on ne les commande pas.
  const w2 = bac();
  const tc2 = palais(w2);
  for (const u of armeeDe(w2, 0)) w2.killEntity(u, null, true);   // l'éclaireur ne s'abrite pas
  check('sans soldat, la pastille n’a rien à prendre', toucherArmee(w2, 0, []) === null);
  const gardes = [0, 1].map((i) => w2.spawnUnit(0, 'militia', tc2.x + TILE * (3 + i), tc2.y + TILE * 3));
  const dehors = w2.spawnUnit(0, 'militia', tc2.x + TILE * 6, tc2.y + TILE * 6);
  w2.garrisonUnits(gardes, tc2);
  avancer(w2, 20, () => gardes.every((u) => u.garrisonedIn));
  const mixte = toucherArmee(w2, 0, []);
  check('les soldats abrités restent comptés, mais le toucher ne prend que ceux du dehors',
    gardes.every((u) => u.garrisonedIn === tc2) && armeeDe(w2, 0).length === 3
      && !!mixte.prendre && mixte.prendre.length === 1 && mixte.prendre[0] === dehors,
    `${armeeDe(w2, 0).length} soldats, ${mixte.prendre ? mixte.prendre.length : 0} dehors`);
  w2.killEntity(dehors, null, true);
  const abrites = toucherArmee(w2, 0, []);
  check('toute l’armée à l’abri : le toucher montre l’abri', !!abrites && abrites.abri === tc2 && !abrites.prendre);
}

// ---------------------------------------------------------------------------
// 5. L'interface, sur des éléments factices : le message qui se touche, le
//    compteur de la pastille, la croix qui suit la sélection.
// ---------------------------------------------------------------------------
{
  console.log('\n— Message, pastille et croix (éléments factices) —');
  /** Un élément de page réduit à ce que l'interface lui demande ; le reste ne fait rien. */
  const faux = () => {
    const classes = new Set(), ecouteurs = {};
    const noeud = {
      dataset: {}, enfants: [], parent: null, attributs: {}, classes, offsetHeight: 0,
      classList: {
        add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
        toggle: (c, oui = !classes.has(c)) => { if (oui) classes.add(c); else classes.delete(c); return oui; },
      },
      set className(v) { classes.clear(); for (const c of String(v).split(/\s+/).filter(Boolean)) classes.add(c); },
      appendChild(n) { n.parent = moi; noeud.enfants.push(n); return n; },
      remove() { const p = noeud.parent; if (p) p.enfants.splice(p.enfants.indexOf(moi), 1); noeud.parent = null; },
      get children() { return noeud.enfants; },
      get firstChild() { return noeud.enfants[0] || null; },
      get lastElementChild() { return noeud.enfants[noeud.enfants.length - 1] || null; },
      addEventListener(type, f) { (ecouteurs[type] ||= []).push(f); },
      setAttribute(k, v) { noeud.attributs[k] = v; },
      querySelector: () => null,
      querySelectorAll: () => [],
      insertAdjacentHTML() {},
      toucher() { for (const f of ecouteurs.click || []) f(); },
    };
    const moi = new Proxy(noeud, { get: (o, k) => (k in o ? o[k] : (typeof k === 'symbol' ? undefined : () => {})) });
    return moi;
  };

  // --- Le message d'alerte se touche, et reste six secondes ---
  const ui = Object.create(UI.prototype);
  ui.game = {};
  ui.nodes = { alerts: faux() };
  const minuteries = [];
  const vrais = { setTimeout: globalThis.setTimeout, document: globalThis.document };
  globalThis.setTimeout = (f, ms) => { minuteries.push(ms); return 0; };
  globalThis.document = { createElement: () => faux() };
  let allers = 0;
  try {
    ui.toast('Maison terminée');
    const simple = ui.nodes.alerts.lastElementChild;
    check('un message ordinaire ne se touche pas et part en 2,6 s',
      !simple.classes.has('touchable') && minuteries[0] === 2600, `${minuteries[0]} ms`);
    ui.toast('Vous êtes attaqué !', 'error', () => { allers++; });
    const alerte = ui.nodes.alerts.lastElementChild;
    check('le message d’alerte se touche et reste le temps du repère',
      alerte !== simple && alerte.classes.has('touchable') && alerte.classes.has('error') && minuteries[1] === DUREE_REPERE * 1000,
      `${minuteries[1]} ms`);
    ui.toast('Vous êtes attaqué !', 'error', () => { allers += 100; });
    check('une seconde alerte pendant la première ne l’empile pas',
      ui.nodes.alerts.children.length === 2 && String(alerte.innerHTML).includes('×2'));
    alerte.toucher();
    check('le toucher mène à l’attaque, une fois, et le message s’en va',
      allers === 1 && ui.nodes.alerts.children.length === 1 && ui.nodes.alerts.lastElementChild === simple, `${allers} aller(s)`);
  } catch (erreur) {
    check('le message d’alerte s’affiche sans erreur', false, erreur.message);
  } finally {
    globalThis.setTimeout = vrais.setTimeout;
    if (vrais.document === undefined) delete globalThis.document; else globalThis.document = vrais.document;
  }

  // --- Le compteur de la pastille, grisé à zéro ---
  const w = bac();
  const barre = Object.create(UI.prototype);
  barre.world = w;
  barre.lastValues = {};
  barre.game = { workerStats: () => ({ food: 0, wood: 0, gold: 0, build: 0, idle: 0 }) };
  barre.nodes = {
    workerCounts: { food: faux(), wood: faux(), gold: faux(), build: faux(), idle: faux() },
    workerBar: { querySelector: () => faux() }, armee: faux(), btnArmee: faux(),
  };
  try {
    w.spawnUnit(0, 'militia', palais(w).x + TILE * 4, palais(w).y + TILE * 4);
    barre.refreshWorkerBar();
    check('la pastille affiche le nombre de soldats',
      barre.nodes.armee.textContent === '2' && !barre.nodes.btnArmee.classes.has('vide'), `« ${barre.nodes.armee.textContent} »`);
    for (const u of armeeDe(w, 0)) w.killEntity(u, null, true);
    barre.refreshWorkerBar();
    check('sans soldat elle affiche 0 et se grise',
      barre.nodes.armee.textContent === '0' && barre.nodes.btnArmee.classes.has('vide'), `« ${barre.nodes.armee.textContent} »`);
  } catch (erreur) {
    check('la barre se rafraîchit sans erreur', false, erreur.message);
  }

  // --- La croix « lâcher » n'existe qu'avec une sélection ---
  const w3 = bac();
  const panneau = Object.create(UI.prototype);
  const partie = {
    selection: [], world: w3, civ: w3.players[0].civ, audio: { play() {} },
    attackMoveArmed: false, garrisonArmed: false, rallyArmed: false,
    ouvrier: () => 'villageois', demolitionEnAttente: () => false, hasSpareWorker: () => true,
  };
  Object.assign(panneau, {
    game: partie, world: w3, selectionSignature: '', commandsSignature: '',
    nodes: { selection: faux(), commands: faux(), lacher: faux(), bottombar: faux() },
  });
  panneau.nodes.lacher.classList.add('hidden');
  const cachee = () => panneau.nodes.lacher.classes.has('hidden');
  try {
    panneau.refreshSelection();
    const sansRien = cachee();
    partie.selection = [w3.units.find((u) => u.playerIndex === 0 && u.isVillager)];
    panneau.refreshSelection();
    const uneUnite = !cachee();
    partie.selection = w3.units.filter((u) => u.playerIndex === 0);
    panneau.refreshSelection();
    const plusieurs = !cachee();
    partie.selection = [palais(w3, 1)];
    panneau.refreshSelection();
    const ennemi = !cachee();
    partie.selection = [];
    panneau.refreshSelection();
    check('la croix est cachée sans sélection, visible dès qu’il y en a une (une unité, plusieurs, un bâtiment adverse)',
      sansRien && uneUnite && plusieurs && ennemi && cachee(),
      JSON.stringify({ sansRien, uneUnite, plusieurs, ennemi, puisRien: cachee() }));
  } catch (erreur) {
    check('le panneau de sélection se rafraîchit sans erreur', false, erreur.message);
  }
}

// ---------------------------------------------------------------------------
// 6. Le câblage, relu dans les fichiers : ce que le code attend de la page.
// ---------------------------------------------------------------------------
{
  console.log('\n— Câblage de la page —');
  const page = lire('../index.html'), style = lire('../css/jeu.css');
  const principal = lire('../js/main.js'), interfaceJeu = lire('../js/ui.js');
  const barre = (page.match(/<div id="worker-bar">[\s\S]*?<\/div>/) || [''])[0];
  const pastille = (barre.match(/<button id="btn-armee"[^>]*>.*?<\/button>/) || [''])[0];
  check('la pastille « Armée » est dans la barre des ouvriers, avec son compteur',
    pastille.includes('id="wk-armee"') && pastille.includes('worker-chip'), pastille.slice(0, 70));
  check('… sans « data-task » : sinon elle serait prise pour un métier d’ouvrier', !!pastille && !pastille.includes('data-task'));
  const croix = (page.match(/<button id="btn-lacher"[^>]*>/) || [''])[0];
  const icones = [...(pastille + croix).matchAll(/data-icone="([^"]+)"/g)].map((m) => m[1]);
  check('ses icônes existent : une épée pour l’armée, la croix pour lâcher',
    icones.join() === 'forging,fermer' && icones.every((c) => !!ICONES[c]) && ICONES.forging.n === 'broadsword',
    icones.join(', '));
  check('la croix « lâcher » précède le panneau de sélection, dans la barre du bas, cachée au départ',
    /<footer id="bottombar">\s*<button id="btn-lacher" class="icon-btn hidden"[^>]*><\/button>\s*<div id="selection-panel">/.test(page));
  check('aucun emoji dans ce qui est ajouté à la page', !/\p{Extended_Pictographic}/u.test(pastille + barre));

  const regle = (selecteur) => (style.match(new RegExp(selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}')) || ['', ''])[1];
  check('le message d’alerte arrête le doigt (le reste des notifications le laisse passer)',
    /pointer-events:\s*auto/.test(regle('.toast.touchable')) && /pointer-events:\s*none/.test(regle('#alerts')));
  check('la croix fait 44 px', /width:\s*44px/.test(regle('#btn-lacher')) && /height:\s*44px/.test(regle('#btn-lacher')));
  check('la pastille fait 44 px de haut, téléphone debout', /#btn-armee\s*\{\s*min-height:\s*44px/.test(style));

  check('main.js : l’alerte passe par les foyers, son message mène à l’attaque',
    /this\.foyers\.signaler\(event\.x, event\.y\)/.test(principal) && /\(\) => this\.voirAttaque\(\)/.test(principal)
      && /this\.renderer\.alertes = this\.foyers\.liste/.test(principal) && /this\.foyers\.vieillir\(realDt\)/.test(principal));
  check('ui.js : la pastille et la croix sont branchées',
    /btnArmee\.addEventListener\('click', \(\) => this\.game\.selectArmy\(\)/.test(interfaceJeu)
      && /this\.game\.lacherSelection\(\)/.test(interfaceJeu)
      && /selectArmy\(\)\s*\{/.test(principal) && /lacherSelection\(\)\s*\{/.test(principal));
}

console.log(`\n${failures === 0 ? '✅ Tous les tests passent' : '❌ ' + failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
