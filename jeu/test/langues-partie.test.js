// La partie en anglais (js/langues/en/partie.js) : le déroulement de la partie
// (js/main.js), ce que la simulation dit au joueur (js/game.js, js/ai.js), le
// palmarès et les incidents (js/save.js), les styles des personnages et leurs
// modèles 3D (js/sprites.js, js/modele3d.js).
//
// Les mêmes scènes sont jouées deux fois : ici, en français — rien n'a bougé
// d'une lettre —, et dans un Node à part marqué `__LANGUE = 'en'` (la langue se
// lit au chargement des modules). La simulation, elle, donne la même partie
// dans les deux langues.
// Lancement : node test/langues-partie.test.js

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ICI = fileURLToPath(import.meta.url);
const RACINE = path.join(path.dirname(ICI), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const possede = (objet, cle) => Object.prototype.hasOwnProperty.call(objet, cle);
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Les fichiers de la partie (ceux qui portent du texte, et ceux qui n'en montrent pas au joueur), et leurs tables. */
const FICHIERS = ['js/main.js', 'js/game.js', 'js/save.js', 'js/ai.js', 'js/sprites.js', 'js/modele3d.js', 'js/ordres.js', 'js/render.js', 'js/rendu3d.js'];
const TABLES = ['js/sprites.js:textesATraduire'];

/**
 * Ce que le joueur lirait, dans la langue du processus. Les modules du jeu ne
 * sont chargés qu'ici : l'autre processus doit avoir posé sa langue avant.
 */
async function scenes() {
  const L = await import('../js/langue.js');
  const C = await import('../js/config.js');
  const { World } = await import('../js/game.js');
  const S = await import('../js/save.js');
  const SP = await import('../js/sprites.js');
  const U = await import('../js/utils.js');
  const E = await import('../js/entities.js');
  const { TILE, TICKS_PER_SECOND } = C;
  const DT = 1 / TICKS_PER_SECOND;
  const monde = (o = {}) => new World({ seed: 91, mode: 'classique', mapSize: 'medium', difficulty: 'easy', civs: ['atlante', 'solarien'], ...o });
  const avis = (w) => w.drainEvents().filter((e) => e.type === 'notice').map((e) => e.text);
  const centre = (w) => w.buildings.find((b) => b.playerIndex === 0 && b.type === 'towncenter');
  const m = { langue: L.LANGUE };

  // 1. La simulation : les camps, ce qu'un bouton refuse, les avis.
  {
    const w = monde(), tc = centre(w), joueur = w.players[0], d = w.map.startPositions[0];
    m.camps = [w.players.map((p) => p.name), monde({ mode: 'deux' }).players.map((p) => p.name)];
    joueur.resources = { food: 9999, wood: 9999, gold: 9999 };
    m.refus = [w.canTrain(tc, 'knight').reason, w.canAdvanceAge(tc).reason];
    w.spawnBuilding(0, 'barracks', d.tx + 4, d.ty + 5, false);
    m.refus.push(w.canAdvanceAge(tc).reason);
    w.spawnBuilding(0, 'mill', d.tx + 8, d.ty + 5, false);
    m.refus.push(w.canAdvanceAge(tc).reason);
    for (const b of w.buildings) if (b.playerIndex === 0) b.complete = true;
    joueur.age = 1;
    m.refus.push(w.canAdvanceAge(tc).reason);
    w.spawnBuilding(0, 'archery', d.tx + 12, d.ty + 5, true);
    m.refus.push(w.canAdvanceAge(tc).reason);
    joueur.resources = { food: 0, wood: 0, gold: 0 };
    m.refus.push(w.canTrain(tc, 'villager').reason, w.canResearch(tc, 'inconnue').reason);
    w.drainEvents();
    w.notifyPopBlocked(0);
    w.placeBuilding(0, 'house', -5, -5);
    w.onAnimalCaptured(w.spawnAnimal('pig', tc.x, tc.y + TILE * 4, 0));
    m.avis = avis(w);
  }
  {
    // Le dernier Palais tombé, une Cour des Gardes debout ; puis l'attaque annoncée (Facile).
    const w = monde({ civs: ['solarien', 'atlante'] }), d = w.map.startPositions[0];
    w.spawnBuilding(0, 'barracks', d.tx + 4, d.ty + 5, true);
    w.drainEvents();
    w.killEntity(centre(w), null);
    m.centrePerdu = avis(w);
    const f = monde({ civs: ['solarien', 'atlante'] }), ia = f.ais[0];
    f.drainEvents();
    f.time = ia.treve - 30;
    ia.annoncerAttaque();
    m.annonce = avis(f);
  }

  // 2. Le palmarès et les incidents (js/save.js).
  m.palmares = [S.resumePalmares({ victoires: 3, defaites: 1, temps: 1122, score: 12500 }), S.resumePalmares({ victoires: 1, defaites: 0, temps: null, score: 0 })]
    .map((t) => t.replace(/\s/g, ' '));
  m.incidents = [
    S.phraseIncident({ genre: 'rechargee', min: 12.4, mo: 180, unites: 64 }),
    S.phraseIncident({ genre: 'coupee', min: 0.4, mo: 20, unites: 1 }),
    S.phraseIncident({ genre: 'rechargee', min: 3, mo: 20, unites: 1 }, true),
    S.phraseIncident({ genre: 'coupee', min: 3, mo: 20, unites: 1 }, true),
  ];

  // 3. Les styles des personnages (js/sprites.js) : leurs identifiants ne se traduisent pas.
  m.styles = SP.STYLES.map((s) => [s.id, s.nom, s.desc]);

  // 4. Le jeu. js/main.js ne se charge pas sous Node (écrans, toile, son) : sa
  // classe est lue dans sa source et jouée sur un faux écran, un vrai monde
  // derrière. Tout ce qu'elle prend au module et que la scène ne nomme pas vaut
  // « rien » (le `with` ci-dessous) : seul ce qui est joué a besoin d'exister.
  {
    const source = lire('js/main.js');
    const bloc = (debut) => {
      const i = source.indexOf(debut);
      if (i < 0) throw new Error(`js/main.js : « ${debut} » introuvable`);
      let j = source.indexOf('{', i) + 1;
      for (let ouvertes = 1; ouvertes > 0 && j < source.length; j++) { if (source[j] === '{') ouvertes++; else if (source[j] === '}') ouvertes--; }
      return source.slice(i, j);
    };
    const style = { id: '3d' };
    const portee = {
      ...C, txt: L.txt, accord: L.accord, clamp: U.clamp, dist2: U.dist2, villagerTask: E.villagerTask,
      setStyleUnites: (id) => { style.id = id; }, styleUnites: () => style.id, troupesSelonStyle: SP.troupesSelonStyle, webglDisponible: () => false,
      localStorage: { setItem() {} }, performance: { now: () => 0 }, STYLE_KEY: 'style',
    };
    const tout = new Proxy(portee, {
      has: (o, k) => typeof k === 'string' && (k in o || !(k in globalThis)),
      get: (o, k) => (typeof k === 'symbol' ? undefined : o[k]),
    });
    const Game = new Function('portee', `with (portee) { return ${bloc('class Game {')}; }`)(tout);
    m.jeu = {};
    for (const civs of [['atlante', 'solarien'], ['solarien', 'atlante']]) {
      const w = monde({ civs }), tc = centre(w), d = w.map.startPositions[0], dits = [];
      const g = Object.assign(Object.create(Game.prototype), {
        world: w, selection: [], idleNoticeCooldown: 0, demolitionArmee: null, options: {},
        ui: { toast: (texte) => dits.push(texte), setBuildHint: (texte) => dits.push(texte), refreshSelection() {} },
        audio: { play() {} }, musique: { coup() {} }, foyers: { signaler: () => true }, camera: { zoom: 1 },
        vibrate() {}, pingOrder() {}, setSelection() {},
      });
      const caserne = w.spawnBuilding(0, 'barracks', d.tx + 4, d.ty + 5, true);
      w.drainEvents();
      // Ce qui arrive : un bâtiment fini (au féminin, au masculin), des ouvriers sans ordres, un âge, une position.
      const arrive = [
        { type: 'built', building: caserne }, { type: 'built', building: tc }, { type: 'idleWorker' },
        { type: 'age', player: 0, age: 1 }, { type: 'age', player: 1, age: 2 }, { type: 'position', camp: 1, ancien: 0, x: 0, y: 0 },
      ];
      for (const evenement of arrive) { w.events.push(evenement); g.idleNoticeCooldown = 0; g.processEvents(); }
      // Les ordres : la récolte, la cloche (aller et retour), la destruction en deux appuis, un abri à désigner.
      const ouvriers = w.units.filter((u) => u.playerIndex === 0 && u.isVillager);
      g.selection = ouvriers.slice();
      const arbre = w.findNearestResource(tc.x, tc.y, 'wood', 60 * TILE, 0);
      g.issueOrder(arbre.tx * TILE + TILE / 2, arbre.ty * TILE + TILE / 2);
      for (const u of ouvriers) u.stop();
      g.ringTownBell();
      for (let i = 0; i < 400; i++) w.update(DT);
      g.ringTownBell();
      g.demolish(caserne);
      w.trainUnit(caserne, 'militia');
      g.demolish(caserne);
      g.toggleGarrison();
      for (const id of ['3d', '3d-precalc', '3d-direct']) g.setStyleUnites(id);
      m.jeu[civs[0]] = {
        dits, ouvrier: [g.ouvrier(), g.ouvrier(2)],
        // (Le conseil d'une partie d'essai, tel que le constructeur du jeu le compose.)
        essai: L.txt`Partie d’essai : ${3} ${C.nomDe('knight', civs[0], 3)} t’attendent près de ton centre.`,
      };
    }
  }

  // 5. La simulation ne dépend pas de la langue : la même partie, à l'unité près.
  {
    const w = new World({ seed: 4242, mode: 'express', difficulty: 'hard', civs: ['atlante', 'solarien'] });
    for (let i = 0; i < TICKS_PER_SECOND * 120 && !w.gameOver; i++) { w.update(DT); w.drainEvents(); }
    const etat = S.serializeWorld(w);
    delete etat.savedAt;
    m.empreinte = createHash('sha1').update(JSON.stringify(etat)).digest('hex');
  }

  // 6. Les modèles 3D qui ne peuvent pas se préparer (ni toile ni fichier) : le
  // jeu dit lesquels et pourquoi. (En dernier : leur échec reste retenu pour la
  // suite du processus.)
  {
    const garde = { document: globalThis.document, fetch: globalThis.fetch, Image: globalThis.Image, warn: console.warn };
    const rendre = (nom) => { if (garde[nom] === undefined) delete globalThis[nom]; else globalThis[nom] = garde[nom]; };
    globalThis.document = { createElement: () => ({ getContext: () => null }) };
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    globalThis.Image = class { set src(adresse) { this.adresse = adresse; } };
    console.warn = () => {};
    try {
      for (const type of Object.keys(C.UNIT_TYPES)) SP.prevoirTroupe(type, 'atlante');
      SP.prevoirTroupe('villager', 'solarien');
      for (let i = 0; i < 300 && !String(SP.etatModeles3d().raison).includes('sol-fellah'); i++) await new Promise((suite) => setTimeout(suite, 10));
    } finally {
      rendre('document'); rendre('fetch'); rendre('Image');
      console.warn = garde.warn;
    }
    const e = SP.etatModeles3d();
    m.modeles = { etat: e.etat, raison: e.raison || '' };
  }

  m.sansTraduction = [...L.SANS_TRADUCTION];
  return m;
}

// --- L'autre processus : la partie en anglais ---------------------------------------------
if (process.argv[2] === '--langue') {
  globalThis.__LANGUE = process.argv[3];
  // (Tant que le cahier n'est pas inscrit dans js/langues/en.js, il y est versé
  // ici — le dictionnaire du jeu est ce même objet ; ensuite, cela ne change rien.)
  const dictionnaire = (await import(`../js/langues/${process.argv[3]}.js`)).default;
  Object.assign(dictionnaire, (await import(`../js/langues/${process.argv[3]}/partie.js`)).default);
  console.log(JSON.stringify(await scenes()));
  process.exit(0);
}

let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${detail ? ' — ' + detail : ''}`);
}
/** Lance un Node neuf dans la langue dite, et rend ce que les scènes y montrent. */
const ailleurs = (langue) => JSON.parse(execFileSync(process.execPath, [ICI, '--langue', langue], { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 24 }));

// --- Le cahier ------------------------------------------------------------------------------
console.log('--- Le cahier ---');
const { verifierCahier, clesDuCode } = await import('../outils/langues.mjs');
const { default: dictionnaire, CAHIERS } = await import('../js/langues/en.js');
const cahier = (await import('../js/langues/en/partie.js')).default;
{
  const r = await verifierCahier('en', 'partie', FICHIERS, TABLES);
  // (Une phrase que le dictionnaire tient déjà d'un autre cahier — l'accueil — peut ne pas être redite ici.)
  const manquantes = r.manquantes.filter((cle) => !possede(dictionnaire, cle));
  check(`le cahier couvre ses fichiers : ${r.cles} textes, rien ne manque`, r.cles >= 180 && manquantes.length === 0, manquantes.slice(0, 3).join(' | '));
  check('… rien en trop : chaque phrase du cahier se trouve dans le code ou dans une table', r.enTrop.length === 0, r.enTrop.slice(0, 3).join(' | '));
  check('… rien de fautif : pas de traduction vide, pas de trou inventé, les mêmes balises, un accord a sa forme « other »',
    r.fautives.length === 0, r.fautives.slice(0, 2).map(([cle, d]) => `${cle} (${d.join(', ')})`).join(' | '));
  const desaccords = Object.entries(CAHIERS).filter(([nom]) => nom !== 'partie')
    .flatMap(([nom, autre]) => Object.keys(cahier).filter((cle) => possede(autre, cle) && !egal(autre[cle], cahier[cle])).map((cle) => `${cle} (${nom})`));
  check('une phrase que porte aussi un autre cahier y a la même traduction', desaccords.length === 0, desaccords.slice(0, 3).join(' | '));
  const anglais = Object.entries(cahier).flatMap(([, v]) => (typeof v === 'string' ? [v] : Object.values(v)));
  check('l’anglais du cahier : ni espace avant « : », « ? », « ! », ni guillemets français, ni apostrophe droite',
    anglais.every((t) => !/\s[:?!]|[«»]|'/.test(t)), anglais.filter((t) => /\s[:?!]|[«»]|'/.test(t)).slice(0, 3).join(' | '));

  // Les tables de js/sprites.js : les styles et les noms courants des modèles.
  const SP = await import('../js/sprites.js');
  const vus = [];
  SP.textesATraduire((objet, champ) => vus.push(objet[champ]));
  check('js/sprites.js donne ses tables à traduire (styles, modèles) : 26 textes, « 3D » n’en est pas un, tous traduits',
    vus.length === 26 && !vus.includes('3D') && vus.includes('Animé') && vus.includes('archer monté') && vus.every((t) => typeof t === 'string' && (possede(cahier, t) || possede(dictionnaire, t))),
    `${vus.length} textes`);
}

// --- Le code ----------------------------------------------------------------------------------
console.log('\n--- Le code ---');
{
  const main = lire('js/main.js'), game = lire('js/game.js'), ia = lire('js/ai.js'), sauvegarde = lire('js/save.js');
  // Un message écrit en toutes lettres commence par une apostrophe ou un accent grave : il passe par `txt`
  // (seul « 3 Miliciens », un nombre et un nom déjà traduit, n'est pas une phrase).
  const nus = [...main.matchAll(/\.(?:toast|setBuildHint)\(\s*(['`])(?!\1)[^\n]*/g)].map((x) => x[0]);
  check('js/main.js : aucun message ni consigne en toutes lettres hors de `txt`', nus.length === 1 && nus[0].includes('nomDe(entity.type'), nus.join(' | ').slice(0, 200));
  check('js/game.js, js/ai.js : aucun avis ni refus en toutes lettres hors de `txt`',
    !/\b(?:text|reason): ['`]/.test(game) && !/\btext: ['`]/.test(ia) && /reason: txt\('Ressources insuffisantes'\)/.test(game) && /text: txt`L’ennemi prépare une attaque/.test(ia));
  check('les nombres s’écrivent selon la langue : plus de « fr-FR » en dur', FICHIERS.every((f) => !lire(f).includes('fr-FR')) && /toLocaleString\(LOCALE\)/.test(sauvegarde));
  check('« villageois », « fellahs » : le nom de l’ouvrier vient de `nomDe`, qui l’accorde au nombre dans la langue du joueur',
    /ouvrier\(n = 1\) \{ return nomDe\('villager', this\.civ, n\)\.toLowerCase\(\); \}/.test(main));
  // Ce qui ne se montre pas au joueur reste tel quel : les refus d'un ordre transmis, les pannes de dessin.
  check('js/ordres.js, js/render.js, js/rendu3d.js : rien n’y est montré au joueur, rien n’y passe par `txt`',
    ['js/ordres.js', 'js/render.js', 'js/rendu3d.js'].every((f) => clesDuCode(lire(f)).length === 0));
}

// --- Le français ----------------------------------------------------------------------------
console.log('\n--- En français : rien n’a bougé ---');
const fr = await scenes();
{
  check('sans rien demander, la partie est en français, et rien n’y est noté « sans traduction »', fr.langue === 'fr' && fr.sansTraduction.length === 0);
  check('les camps : « Vous », « Adversaire » ; par équipes, « Allié », « Adversaire 1 », « Adversaire 2 »',
    egal(fr.camps, [['Vous', 'Adversaire'], ['Vous', 'Allié', 'Adversaire 1', 'Adversaire 2']]), JSON.stringify(fr.camps));
  check('ce qu’un bouton refuse : l’âge, les bâtiments exigés (avec leur article), le chantier, le prix',
    egal(fr.refus, [
      'Âge requis : Âge des Châteaux', 'Il faut une Caserne et un Moulin', 'Il faut un Moulin', 'Chantier à terminer d’abord : Caserne, Moulin',
      'Il faut 2 bâtiments parmi : Archerie, Écurie, Forge, Temple de l’Hydre', 'Il faut encore un bâtiment parmi : Écurie, Forge, Temple de l’Hydre',
      'Ressources insuffisantes', 'Indisponible',
    ]), JSON.stringify(fr.refus));
  check('les avis de la partie : population, emplacement, cochon capturé',
    egal(fr.avis, ['Population maximale atteinte — construisez des maisons.', 'Emplacement impossible ici.', 'Cochon capturé : menez-le au village, un villageois l’abattra.']), JSON.stringify(fr.avis));
  check('le dernier Palais tombé, l’attaque annoncée : accordés au peuple du joueur',
    egal(fr.centrePerdu, ['Palais du Soleil perdu ! Rebâtissez un Palais du Soleil : il ne vous reste que vos bâtiments militaires.'])
    && egal(fr.annonce, ['L’ennemi prépare une attaque : formez des soldats à la Cour des Gardes']), JSON.stringify([fr.centrePerdu, fr.annonce]));
  check('le palmarès et les incidents',
    egal(fr.palmares, ['3 victoires · meilleur temps 18:42 · meilleur score 12 500', '1 victoire'])
    && egal(fr.incidents, [
      'La page a été rechargée en pleine partie, après 12 min — 180 Mo d’images, 64 unités',
      'La dernière partie s’est interrompue après moins d’une minute — 20 Mo d’images, 1 unité',
      'Le jeu s’est relancé en pleine partie : elle t’attend.', 'La dernière partie s’est interrompue : elle t’attend.',
    ]), JSON.stringify([fr.palmares, fr.incidents]));
  check('les styles des personnages',
    egal(fr.styles, [
      ['3d', '3D', 'Tes modèles animés'], ['anime', 'Animé', 'Marche dessinée'], ['peint', 'Peint', 'Illustration réduite'],
      ['3d-precalc', '3D précalculée', 'Essai : chevalier rendu à l’avance'], ['3d-direct', '3D en direct', 'Essai : chevalier animé en jeu'],
    ]), JSON.stringify(fr.styles));
  check('le jeu, chez les Atlantes : ce qui arrive, les ordres, la destruction, le style',
    egal(fr.jeu.atlante.dits, [
      'Caserne terminée', 'Centre-Ville terminé', '4 villageois attendent vos ordres', 'Bienvenue dans l\'Âge Féodal !', 'L\'adversaire atteint l\'Âge des Châteaux',
      'Position perdue ! Touchez pour voir où',
      '4 villageois répartis sur 4 arbres', '4 villageois à l\'abri', '4 villageois retournent au travail',
      'Touchez « Confirmer » pour raser : Caserne.', 'Caserne détruite — file remboursée', 'Touchez le Centre-Ville ou la tour où s’abriter',
      'Personnages : tes modèles 3D animés', 'Milicien : chevalier d’essai rendu à l’avance', '3D en direct : WebGL indisponible ici — le rendu précalculé le remplace',
    ]), JSON.stringify(fr.jeu.atlante.dits));
  check('… chez les Solariens : les noms et les accords de leur peuple',
    egal(fr.jeu.solarien.dits, [
      'Cour des Gardes terminée', 'Palais du Soleil terminé', '4 fellahs attendent vos ordres', 'Bienvenue dans l\'Âge Féodal !', 'L\'adversaire atteint l\'Âge des Châteaux',
      'Position perdue ! Touchez pour voir où',
      '4 fellahs répartis sur 4 arbres', '4 fellahs à l\'abri', '4 fellahs retournent au travail',
      'Touchez « Confirmer » pour raser : Cour des Gardes.', 'Cour des Gardes détruite — file remboursée', 'Touchez le Palais du Soleil ou la tour où s’abriter',
      'Style : seules les troupes des Atlantes changent, les tiennes n’ont que leur modèle 3D', 'Style : seules les troupes des Atlantes changent, les tiennes n’ont que leur modèle 3D',
      'Style : seules les troupes des Atlantes changent, les tiennes n’ont que leur modèle 3D',
    ]), JSON.stringify(fr.jeu.solarien.dits));
  check('l’ouvrier, au singulier et au pluriel ; le conseil d’une partie d’essai',
    egal(fr.jeu.atlante.ouvrier, ['villageois', 'villageois']) && egal(fr.jeu.solarien.ouvrier, ['fellah', 'fellahs'])
    && fr.jeu.atlante.essai === 'Partie d’essai : 3 Cavaliers t’attendent près de ton centre.'
    && fr.jeu.solarien.essai === 'Partie d’essai : 3 Méharistes t’attendent près de ton centre.', JSON.stringify([fr.jeu.atlante, fr.jeu.solarien].map((j) => [j.ouvrier, j.essai])));
  check('les modèles 3D impossibles à préparer : chacun est nommé, avec sa raison',
    fr.modeles.etat === 'absent' && fr.modeles.raison.startsWith('chevalier : assets/modeles/milicien.json : 404 ; ouvrier : assets/modeles/villageois.json : 404 ; ')
    && fr.modeles.raison.includes(' ; archer monté : ') && fr.modeles.raison.endsWith(' ; fellah solarien : assets/modeles/sol-fellah.json : 404'), fr.modeles.raison.slice(0, 120));
}

// --- L'anglais --------------------------------------------------------------------------------
console.log('\n--- En anglais ---');
{
  const en = ailleurs('en');
  const miennes = new Set(FICHIERS.flatMap((f) => clesDuCode(lire(f))));
  const oubliees = en.sansTraduction.filter((cle) => miennes.has(cle));
  check('marquée « en », la partie parle anglais, et aucune de ses phrases ne reste sans traduction', en.langue === 'en' && oubliees.length === 0, oubliees.slice(0, 3).join(' | '));
  check('les camps : « You », « Opponent » ; par équipes, « Ally », « Opponent 1 », « Opponent 2 »',
    egal(en.camps, [['You', 'Opponent'], ['You', 'Ally', 'Opponent 1', 'Opponent 2']]), JSON.stringify(en.camps));
  check('ce qu’un bouton refuse : une phrase entière par cas, sans article à accorder',
    egal(en.refus, [
      'Requires the Castle Age', 'Requires Barracks and Mill', 'Requires Mill', 'Site to finish first: Barracks, Mill',
      'Requires 2 buildings from: Archery Range, Stable, Blacksmith, Temple of the Hydra', 'Requires one more building from: Stable, Blacksmith, Temple of the Hydra',
      'Not enough resources', 'Unavailable',
    ]), JSON.stringify(en.refus));
  check('les avis de la partie',
    egal(en.avis, ['Population limit reached — build houses.', 'Can’t build here.', 'Pig captured: lead it to the village, and a villager will slaughter it.'])
    && egal(en.centrePerdu, ['Palace of the Sun lost! Rebuild one: only your military buildings are left.'])
    && egal(en.annonce, ['The enemy is preparing an attack: train soldiers at the Guards’ Courtyard']), JSON.stringify([en.avis, en.centrePerdu, en.annonce]));
  check('le palmarès et les incidents : les mots s’accordent au nombre, les nombres s’écrivent à l’anglaise',
    egal(en.palmares, ['3 wins · best time 18:42 · best score 12,500', '1 win'])
    && egal(en.incidents, [
      'The page reloaded mid-game, after 12 min — 180 MB of images, 64 units',
      'Your last game was interrupted after less than a minute — 20 MB of images, 1 unit',
      'The game restarted mid-game: your game is waiting for you.', 'Your last game was interrupted: it’s waiting for you.',
    ]), JSON.stringify([en.palmares, en.incidents]));
  check('les styles des personnages : leurs noms et leurs descriptions, pas leurs identifiants',
    egal(en.styles, [
      ['3d', '3D', 'Your animated models'], ['anime', 'Animated', 'Hand-drawn walk'], ['peint', 'Painted', 'Scaled-down illustration'],
      ['3d-precalc', 'Pre-rendered 3D', 'Test: pre-rendered knight'], ['3d-direct', 'Live 3D', 'Test: knight animated in-game'],
    ]), JSON.stringify(en.styles));
  check('le jeu, chez les Atlantes : ce qui arrive, les ordres, la destruction, le style',
    egal(en.jeu.atlante.dits, [
      'Barracks complete', 'Town Center complete', '4 villagers are waiting for your orders', 'Welcome to the Feudal Age!', 'The opponent has reached the Castle Age',
      'Point lost! Tap to see where',
      '4 villagers spread over 4 trees', '4 villagers sheltered', '4 villagers go back to work',
      'Tap “Confirm” to raze: Barracks.', 'Barracks destroyed — queue refunded', 'Tap the Town Center or the tower to shelter in',
      'Characters: your animated 3D models', 'Militiaman: test knight, pre-rendered', 'Live 3D: WebGL unavailable here — the pre-rendered version takes over',
    ]), JSON.stringify(en.jeu.atlante.dits));
  check('… chez les Solariens',
    egal(en.jeu.solarien.dits, [
      'Guards’ Courtyard complete', 'Palace of the Sun complete', '4 fellahs are waiting for your orders', 'Welcome to the Feudal Age!', 'The opponent has reached the Castle Age',
      'Point lost! Tap to see where',
      '4 fellahs spread over 4 trees', '4 fellahs sheltered', '4 fellahs go back to work',
      'Tap “Confirm” to raze: Guards’ Courtyard.', 'Guards’ Courtyard destroyed — queue refunded', 'Tap the Palace of the Sun or the tower to shelter in',
      'Style: only the troops of the Atlanteans change, yours only have their 3D model', 'Style: only the troops of the Atlanteans change, yours only have their 3D model',
      'Style: only the troops of the Atlanteans change, yours only have their 3D model',
    ]), JSON.stringify(en.jeu.solarien.dits));
  // (Le pluriel des noms est l'affaire de `nomDe`, js/config.js : seuls des noms au pluriel régulier sont lus ici.)
  check('l’ouvrier, au singulier et au pluriel ; le conseil d’une partie d’essai',
    egal(en.jeu.atlante.ouvrier, ['villager', 'villagers']) && egal(en.jeu.solarien.ouvrier, ['fellah', 'fellahs'])
    && en.jeu.atlante.essai === 'Trial game: 3 Knights are waiting for you near your main building.'
    && en.jeu.solarien.essai === 'Trial game: 3 Camel Riders are waiting for you near your main building.', JSON.stringify([en.jeu.atlante, en.jeu.solarien].map((j) => [j.ouvrier, j.essai])));
  check('les modèles 3D impossibles à préparer : nommés et expliqués en anglais, l’adjectif du peuple à sa place',
    en.modeles.etat === 'absent' && en.modeles.raison.startsWith('foot knight: assets/modeles/milicien.json: 404; worker: assets/modeles/villageois.json: 404; ')
    && en.modeles.raison.includes('; horse archer: ') && en.modeles.raison.endsWith('; Solarian fellah: assets/modeles/sol-fellah.json: 404'), en.modeles.raison.slice(0, 120));
  check('la simulation ne dépend pas de la langue : la même partie Express, à l’unité près, en français et en anglais',
    /^[0-9a-f]{40}$/.test(fr.empreinte) && en.empreinte === fr.empreinte, `${fr.empreinte.slice(0, 10)} / ${en.empreinte.slice(0, 10)}`);
}

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
