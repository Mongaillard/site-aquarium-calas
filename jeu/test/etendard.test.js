// Ce que le joueur porte se voit en partie : la bannière de son blason, plantée
// au sol près de son bâtiment principal (js/render.js, dessinerEtendard), et son
// médaillon avec son titre à la fin d'un scénario (js/defis-ecrans.js). C'est de
// l'apparence : les règles n'en savent rien.
// Lancement : node test/etendard.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIECES, BLASON_DE_DEPART, banniereDe } from '../js/collections-config.js';
import { profilNeuf, appliquerScenario } from '../js/progression.js';
import { SCENARIOS } from '../js/scenarios.js';
import { htmlFinDeScenario } from '../js/defis-ecrans.js';
import { World } from '../js/game.js';
import { TILE } from '../js/config.js';
import { Renderer } from '../js/render.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${detail ? ' — ' + detail : ''}`);
}
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

// --- La bannière du blason ---------------------------------------------------------------
console.log('--- La bannière du blason ---');
const bannieres = Object.entries(PIECES).filter(([, p]) => p.genre === 'banniere');
{
  const depart = PIECES[BLASON_DE_DEPART.banniere];
  check('un blason neuf plante la bannière du départ : son fond, son trait, son motif',
    egal(banniereDe(profilNeuf().blason), { fond: depart.fond, trait: depart.trait, motif: depart.motif }) && /^#[0-9a-f]{6}$/i.test(depart.fond));
  const nuit = PIECES['citrouilles.etendard'];
  check('la bannière qu’on porte est celle qu’on plante : l’Étendard de la Nuit, orange à damier',
    egal(banniereDe({ ...BLASON_DE_DEPART, banniere: 'citrouilles.etendard' }), { fond: nuit.fond, trait: nuit.trait, motif: 'damier' }));
  check('sans blason, ou avec une bannière inconnue ou une pièce d’un autre genre : celle du départ',
    egal(banniereDe(null), banniereDe(profilNeuf().blason)) && egal(banniereDe({ banniere: 'rien.du-tout' }), banniereDe(null))
    && egal(banniereDe({ banniere: 'depart.cadre' }), null));
  check(`chacune des ${bannieres.length} bannières du jeu donne deux couleurs à l’étendard`,
    bannieres.length >= 15 && bannieres.every(([id]) => { const b = banniereDe({ banniere: id }); return b && /^#[0-9a-f]{6}$/i.test(b.fond) && /^#[0-9a-f]{6}$/i.test(b.trait) && b.fond !== b.trait; }));
}

// --- Le dessin ---------------------------------------------------------------------------
console.log('\n--- Le dessin ---');
{
  const source = lire('js/render.js');
  const connus = [...source.matchAll(/e\.motif === '(\w+)'/g)].map((m) => m[1]);
  const motifs = [...new Set(bannieres.map(([, p]) => p.motif).filter(Boolean))];
  check(`le dessin connaît chaque motif des bannières : ${motifs.sort().join(', ')}`, motifs.every((m) => connus.includes(m)), motifs.filter((m) => !connus.includes(m)).join(', '));

  /** Une toile qui note ce qu'on y peint : chaque appel, avec la couleur de fond et de trait du moment. */
  const toileQuiNote = () => {
    const traces = [];
    const toile = new Proxy({}, {
      get: (etat, nom) => (nom in etat ? etat[nom] : (...args) => { traces.push({ nom, args, fond: etat.fillStyle, trait: etat.strokeStyle }); }),
      set: (etat, nom, valeur) => { etat[nom] = valeur; return true; },
    });
    return { toile, traces };
  };
  const peindre = (etendard) => {
    const { toile, traces } = toileQuiNote();
    const rendu = Object.create(Renderer.prototype);
    Object.assign(rendu, { ctx: toile, etendard });
    rendu.dessinerEtendard(400, 300);
    return traces;
  };
  const traces = peindre({ fond: '#8f2aa3', trait: '#ff9a1f', motif: 'etoiles' });
  const peints = (couleur) => traces.filter((t) => (t.nom === 'fill' || t.nom === 'fillRect') && t.fond === couleur).length;
  check('l’étendard se peint aux couleurs de la bannière : le fond de la toile, puis son motif', peints('#8f2aa3') === 1 && peints('#ff9a1f') >= 3, `${peints('#8f2aa3')} fond, ${peints('#ff9a1f')} motif`);
  check('… cerné d’encre, comme les troupes : la toile a son contour', traces.some((t) => t.nom === 'stroke' && t.trait === '#17120e'));
  check('… au-dessus du sol : toute la toile est plus haut que le pied de la hampe, et à sa droite',
    traces.filter((t) => t.nom === 'lineTo' || t.nom === 'moveTo').every((t) => t.args[1] <= 300 && t.args[0] >= 380));
  check('… la toile est découpée avant d’être peinte, et la découpe est refermée', traces.findIndex((t) => t.nom === 'clip') > traces.findIndex((t) => t.nom === 'save')
    && traces.filter((t) => t.nom === 'save').length === traces.filter((t) => t.nom === 'restore').length);
  for (const motif of motifs) {
    const t = peindre({ fond: '#102a43', trait: '#f6c343', motif });
    if (!t.some((x) => (x.nom === 'fill' || x.nom === 'fillRect' || x.nom === 'stroke') && (x.fond === '#f6c343' || x.trait === '#f6c343'))) check(`le motif « ${motif} » pose du trait sur la toile`, false);
  }
  check('chaque motif pose du trait sur la toile', true);
  check('une bannière sans motif : la toile unie, sans erreur', peindre({ fond: '#102a43', trait: '#f6c343' }).some((t) => t.fond === '#102a43'));
  check('sans étendard, rien n’est peint', peindre(null).length === 0);

  const rendu = Object.create(Renderer.prototype);
  const batiment = { x: 800, y: 640, size: 4 };
  const pied = rendu.piedDeLEtendard(batiment), demi = (batiment.size * TILE) / 2;
  check('il se plante au sol, à l’angle sud-est du bâtiment : hors de son emprise, jamais sur un toit',
    pied.x > batiment.x + demi && pied.y <= batiment.y + demi && pied.y > batiment.y, `${pied.x - batiment.x}, ${pied.y - batiment.y}`);
}

// --- En partie ---------------------------------------------------------------------------
console.log('\n--- En partie ---');
{
  const monde = new World({ mode: 'escarmouche', difficulty: 'normal', seed: 4242 });
  const centres = monde.buildings.filter((b) => b.type === 'towncenter');
  /** Ce que la boucle de dessin plante, pour ce monde et cette bannière : les pieds des étendards dessinés. */
  const plantes = (etendard, humain = monde.humanIndex) => {
    const rendu = Object.create(Renderer.prototype);
    const vus = [];
    const tout = { left: -1e6, right: 1e6, top: -1e6, bottom: 1e6, x0: 0, x1: -1, y0: 0, y1: -1 };
    const rien = () => {};
    Object.assign(rendu, {
      world: new Proxy(monde, { get: (m, nom) => (nom === 'humanIndex' ? humain : nom === 'entities' ? [] : m[nom]) }),
      etendard, decorActif: false, fogMasque: { connu: [] },
      visibleTileRange: () => tout, isEntityVisible: () => true, preparer3d: rien,
      dessinerEtendard: (x, y) => vus.push({ x, y }),
    });
    rendu.drawEntities();
    return vus;
  };
  const mien = centres.find((b) => b.playerIndex === monde.humanIndex);
  const vus = plantes({ fond: '#102a43', trait: '#f6c343', motif: 'bandes' });
  check('la partie plante un étendard, et un seul : au pied du bâtiment principal du joueur',
    centres.length === 2 && vus.length === 1 && egal(vus[0], Object.create(Renderer.prototype).piedDeLEtendard(mien)), `${vus.length} étendard(s) pour ${centres.length} centres`);
  check('… il suit le joueur, pas la place : assis à l’autre siège, il est devant l’autre bâtiment', egal(plantes({ fond: '#102a43', trait: '#f6c343' }, 1 - monde.humanIndex), [Object.create(Renderer.prototype).piedDeLEtendard(centres.find((b) => b.playerIndex !== monde.humanIndex))]));
  check('… pas sans bannière', plantes(null).length === 0);
  mien.complete = false;
  check('… pas devant un bâtiment principal en chantier', plantes({ fond: '#102a43', trait: '#f6c343' }).length === 0);
  mien.complete = true;
  mien.dead = true;
  check('… ni devant ses ruines', plantes({ fond: '#102a43', trait: '#f6c343' }).length === 0);
  mien.dead = false;

  const main = lire('js/main.js');
  check('la partie lit la bannière du blason à son lancement', /this\.renderer\.etendard = banniereDe\(lireProgression\(\)\.blason\)/.test(main));
  check('c’est de l’apparence : les règles, l’ordinateur et les scénarios ne connaissent ni étendard ni bannière',
    ['js/game.js', 'js/ai.js', 'js/entities.js', 'js/scenarios.js'].every((f) => !/etendard|banni[eè]re/i.test(lire(f))));
}

// --- La fin d'un scénario ----------------------------------------------------------------
console.log('\n--- La fin d’un scénario ---');
{
  const def = SCENARIOS.survie;
  const profil = { ...profilNeuf(), pieces: [...profilNeuf().pieces, 'pionnier.cadre', 'pionnier.grade'], blason: { ...profilNeuf().blason, cadre: 'pionnier.cadre', grade: 'pionnier.grade' } };
  const bilan = { victoire: true, auTemps: true, temps: 720, pertes: 4, vague: 12, centre: 80 };
  const r = appliquerScenario(profil, { scenario: 'survie', jour: '2026-10-13', jourDIci: '2026-10-13', etoiles: [true, true, true], record: 12, sens: 'haut' });
  const page = htmlFinDeScenario(def, bilan, r.evenements, r.profil);
  check('la fin d’un scénario montre le joueur d’abord : son médaillon et son titre',
    /<p class="prog-fin-joueur">[\s\S]*<b>Pionnier<\/b><\/p>/.test(page) && page.indexOf('prog-fin-joueur') < page.indexOf('defi-fin-titre'), page.slice(0, 160).replace(/\s+/g, ' '));
  check('… sans profil, la page reste ce qu’elle était', !/prog-fin-joueur/.test(htmlFinDeScenario(def, bilan, r.evenements)) && /defi-fin-titre/.test(htmlFinDeScenario(def, bilan, r.evenements)));
}

console.log(failures ? `\n${failures} test(s) en échec` : '\nTous les tests passent');
process.exit(failures ? 1 : 0);
