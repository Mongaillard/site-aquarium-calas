// Les collections, le blason et les saisons en anglais : le cahier
// js/langues/en/collections.js couvre ce que montrent js/collections-ecrans.js,
// js/blason.js et les tables de js/collections-config.js ; les écrans se lisent
// en anglais ; les identifiants, eux, ne bougent pas. (Le français de ces
// écrans est vérifié, à la lettre, par test/collections.test.js.)
// Lancement : node test/langues-collections.test.js

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LANGUE, SANS_TRADUCTION } from '../js/langue.js';
import { COLLECTIONS, PIECES, GENRES, NOMS_DES_GENRES, BLASON_DE_DEPART, textesATraduire, composerTitre } from '../js/collections-config.js';
import { titreDuBlason } from '../js/blason.js';
import { verifierCahier, clesDuCode } from '../outils/langues.mjs';
import cahier from '../js/langues/en/collections.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${detail ? ' — ' + detail : ''}`);
}
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
/** Lance un Node neuf (la langue se lit au chargement des modules) et rend ce que le script affiche, lu comme du JSON. */
const ailleurs = (script) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26 }));

const FICHIERS = ['js/collections-ecrans.js', 'js/blason.js', 'js/teintures.js', 'js/collections-config.js'];
const TABLES = ['js/collections-config.js:textesATraduire'];
/** L'identité d'une pièce, sans son nom : ce qu'une sauvegarde et le dessin en connaissent. */
const sansNom = (p) => { const { nom, ...reste } = p; return reste; };

// --- Le français, la source --------------------------------------------------------------
console.log('--- Le français ---');
const francais = [];
textesATraduire((objet, champ) => francais.push(objet[champ]));
{
  check('sans rien demander, les tables des collections sont en français, et rien n’est noté « sans traduction »',
    LANGUE === 'fr' && NOMS_DES_GENRES.embleme === 'Autocollant' && COLLECTIONS[1].nom === 'La Basse-cour' && PIECES['gaffes.general-boulette'].nom === 'Le Général Boulette'
    && PIECES['bassecour.banniere'].nom === 'Bannière de la Basse-cour' && PIECES['bassecour.epithete'].nom === 'de la Basse-cour' && SANS_TRADUCTION.size === 0);
  check(`les tables donnent leurs textes à traduire : ${GENRES.length} genres, ${COLLECTIONS.length} collections, ${Object.keys(PIECES).length} pièces`,
    francais.length === GENRES.length + COLLECTIONS.length + Object.keys(PIECES).length && francais.every((t) => typeof t === 'string' && t.length > 1), `${new Set(francais).size} textes différents`);
  check('le titre français : le grade, puis l’épithète', titreDuBlason({ ...BLASON_DE_DEPART, grade: 'monstres.grade', epithete: 'banquet.epithete' }) === 'Dompteur du Banquet' && titreDuBlason(null) === 'Villageois'
    && composerTitre('Dompteur', 'du Banquet') === 'Dompteur du Banquet' && composerTitre('Dompteur', null) === 'Dompteur');
}

// --- Le cahier ----------------------------------------------------------------------------
console.log('\n--- Le cahier ---');
{
  const r = await verifierCahier('en', 'collections', FICHIERS, TABLES);
  check(`le cahier couvre les écrans et les tables : ${r.cles} textes, rien ne manque`, r.manquantes.length === 0, r.manquantes.slice(0, 3).join(' | '));
  // (Les mots passés à l'outil `pluriel` de js/progression-ecrans.js, qui les accorde par `accord` : leurs formes sont dans ce
  // cahier. Un vérificateur qui ne lit pas encore `o.pluriel(…)` les dit « en trop » : ce sont les seules clés qu'on lui passe.)
  const mots = FICHIERS.flatMap((f) => [...lire(f).matchAll(/\bo\.pluriel\(\s*[^,()]+,\s*'([^']+)'(?:\s*,\s*'([^']+)')?\s*\)/g)].map((m) => `${m[1]}|${m[2] || `${m[1]}s`}`));
  const enTrop = r.enTrop.filter((cle) => !mots.includes(cle));
  check('… rien en trop', enTrop.length === 0, enTrop.slice(0, 3).join(' | '));
  check('… rien de fautif : pas de traduction vide, pas de trou inventé, les mêmes balises', r.fautives.length === 0, r.fautives.slice(0, 3).map(([cle, d]) => `${cle} (${d.join(', ')})`).join(' | '));
  check(`les mots que ces écrans passent à « pluriel » ont leurs formes accordées dans le cahier : ${[...new Set(mots)].join(', ')}`,
    mots.length >= 3 && mots.every((cle) => cahier[cle] && typeof cahier[cle].one === 'string' && typeof cahier[cle].other === 'string'));
  check('les mots accordés ont une forme pour un et une pour plusieurs', Object.entries(cahier).filter(([cle]) => cle.includes('|')).every(([, v]) => v && typeof v.one === 'string' && typeof v.other === 'string'));
  const noms = [...new Set(francais)];
  check('chaque nom des tables a un nom anglais, différent du français, sans emoji ni chiffre',
    noms.every((t) => typeof cahier[t] === 'string' && cahier[t] !== t && !/\p{Extended_Pictographic}|\d/u.test(cahier[t])), noms.filter((t) => cahier[t] === t).slice(0, 3).join(' | '));
  const autocollants = Object.values(PIECES).filter((p) => p.genre === 'embleme').map((p) => cahier[p.nom]);
  check(`deux autocollants ne portent jamais le même nom anglais (${autocollants.length} autocollants)`, new Set(autocollants).size === autocollants.length);
  check('l’anglais du cahier : pas d’espace avant « : », « ? », « ! » ; pas de guillemets français',
    Object.values(cahier).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v))).every((v) => !/[\u00a0\u202f ][:?!;]/.test(v) && !/[«»]/.test(v)));
  check('ces fichiers ne posent plus de texte sans passer par la langue : chaque écran prend ses phrases à `txt`',
    clesDuCode(lire('js/collections-ecrans.js')).length > 120 && /import \{ txt, txtDe, accord \} from '\.\/langue\.js';/.test(lire('js/collections-ecrans.js')) && /import \{ txt \} from '\.\/langue\.js';/.test(lire('js/blason.js')));
}

// --- L'anglais, dans un jeu neuf ------------------------------------------------------------
console.log('\n--- L’anglais ---');
{
  const m = ailleurs(`
    globalThis.__LANGUE = 'en';
    // (Tant que js/langues/en.js ne liste pas ce cahier, on l'y ajoute — avant tout chargement : les tables se traduisent en se chargeant.)
    const dico = (await import('./js/langues/en.js')).default;
    const cahier = (await import('./js/langues/en/collections.js')).default;
    for (const [cle, v] of Object.entries(cahier)) if (!Object.prototype.hasOwnProperty.call(dico, cle)) dico[cle] = v;
    // Une horloge fixe (le 9 octobre 2026 : saison 1, « La Nuit des Citrouilles »), un stockage, une page.
    const VraieDate = Date, midi = new VraieDate(2026, 9, 9, 12).getTime();
    globalThis.Date = class extends VraieDate { constructor(...a) { super(...(a.length ? a : [midi])); } static now() { return midi; } };
    const memoire = new Map();
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); } }, configurable: true, writable: true });
    const noeud = { innerHTML: '', classList: { add() {}, remove() {} }, querySelector: () => null };
    let clic = null;
    Object.defineProperty(globalThis, 'document', { value: { getElementById: (id) => (id === 'progression' ? noeud : null), addEventListener: (t, f) => { if (t === 'click') clic = f; } }, configurable: true, writable: true });
    const L = await import('./js/langue.js');
    const K = await import('./js/collections-config.js');
    const P = await import('./js/progression.js');
    const B = await import('./js/blason.js');
    const E = await import('./js/progression-ecrans.js');
    const CE = await import('./js/collections-ecrans.js');
    const { PROGRESSION_KEY } = await import('./js/save.js');
    const toucher = (dataset) => clic({ target: { closest: () => ({ dataset }) } });
    const poser = (profil) => memoire.set(PROGRESSION_KEY, JSON.stringify(profil));
    const lu = () => JSON.parse(memoire.get(PROGRESSION_KEY));
    const ecran = (nom, arg) => { E.ouvrirProgression(nom, arg); return noeud.innerHTML; };
    const geste = (dataset) => { toucher(dataset); return noeud.innerHTML; };
    E.installerProgression({});
    E.reglerPeuple('atlante');
    const saison = P.saisonDuJour('2026-10-09');
    const neuf = { ...P.profilNeuf(), saison };
    const base = { ...neuf, eclats: 400, couronnes: 520, pieces: [...neuf.pieces, 'bassecour.cochon-couronne', 'bassecour.poule-guerriere', 'ligues.recrue', 'ligues.bronze'],
      blason: { ...neuf.blason, embleme: 'bassecour.cochon-couronne', banniere: 'ligues.bronze' }, route: { points: 250, passe: false, pris: { gratuit: [1], passe: [] } } };
    const r = {};
    r.langue = L.LANGUE;
    r.genres = K.NOMS_DES_GENRES;
    r.collections = K.COLLECTIONS.map((c) => c.nom);
    r.pieces = Object.values(K.PIECES).map((p) => { const { nom, ...reste } = p; return reste; });
    r.rangement = K.COLLECTIONS.map((c) => [c.id, c.source, c.planches, c.pieces, c.emblemes]);
    r.figees = Object.isFrozen(K.PIECES) && Object.isFrozen(K.COLLECTIONS) && Object.values(K.PIECES).every(Object.isFrozen) && K.COLLECTIONS.every(Object.isFrozen);
    r.depart = K.BLASON_DE_DEPART;
    r.noms = ['depart.grade', 'gaffes.general-boulette', 'bassecour.banniere', 'bassecour.cadre', 'bassecour.epithete', 'citrouilles.etendard', 'teintures.jade', 'froid.ours-calin', 'ligues.or'].map((id) => K.PIECES[id].nom);
    r.titres = [B.titreDuBlason(null), B.titreDuBlason({ ...K.BLASON_DE_DEPART, grade: 'monstres.grade', epithete: 'banquet.epithete' }), B.titreDuBlason({ ...K.BLASON_DE_DEPART, grade: 'citrouilles.champion', epithete: 'maree.epithete' }), K.composerTitre(K.PIECES['cour.grade'].nom, K.PIECES['cour.epithete'].nom)];
    r.mots = [B.htmlPiece('monstres.grade'), B.htmlPiece('banquet.epithete')];
    r.phrases = ['bassecour.banniere', 'ligues.or', 'citrouilles.etendard', 'monstres.grade', 'citrouilles.epithete', 'gaffes.general-boulette', 'teintures.argent'].map((id) => CE.pieceEnPhrase(id));
    r.etiquettes = ['monstres.grade', 'citrouilles.epithete', 'ligues.or'].map((id) => CE.pieceEnEtiquette(id));
    r.gains = CE.resumeDesGains([{ type: 'eclats', variation: 20 }, { type: 'couronnes', variation: 50 }, { type: 'piece', piece: 'citrouilles.citrouille-casquee', doublon: false }, { type: 'piece', piece: 'citrouilles.grade', doublon: false }, { type: 'piece', piece: 'froid.cadre', doublon: true, eclats: 50 }]);
    r.euros = CE.enEuros(500);
    poser(base);
    r.joueur = CE.htmlJoueur(P.migrerProfil(base)) + CE.htmlBourses(P.migrerProfil(base));
    r.album = ecran('album');
    r.collection = ecran('collection', 'bassecour');
    geste({ act: 'acheterPiece', arg: 'bassecour.mouton-volant' });
    r.achat = geste({ act: 'acheterPiece', arg: 'bassecour.mouton-volant', i: '1' });
    r.porte = geste({ act: 'porter', arg: 'bassecour.poule-guerriere' });
    poser({ ...lu(), eclats: 3 });
    r.tropCher = geste({ act: 'acheterPiece', arg: 'bassecour.cerf-a-lunettes' });
    poser(base);
    r.cour = ecran('collection', 'cour');
    r.teintures = ecran('collection', 'teintures');
    r.ligues = ecran('collection', 'ligues');
    r.blason = ecran('blason');
    r.saison = ecran('saison');
    r.palier = geste({ act: 'palier', arg: 'gratuit', i: '2' });
    r.confirmer = geste({ act: 'passe' });
    r.passe = geste({ act: 'passe', i: '1' });
    poser({ ...base, couronnes: 0 });
    r.sansLeSou = geste({ act: 'passe' });
    poser({ ...neuf, route: { points: 3000, passe: false, pris: { gratuit: [], passe: [] } }, pieces: [...neuf.pieces, ...K.collection('citrouilles').pieces] });
    r.finie = ecran('saison');
    poser({ ...neuf, eclats: 2000, couronnes: 350 });
    r.boutique = ecran('boutique');
    const duJour = (r.boutique.match(/data-act="acheterPiece" data-arg="([\\w.-]+)" data-i="s"/) || [])[1];
    geste({ act: 'acheterPiece', arg: duJour, i: 's' });
    r.resteDeux = geste({ act: 'acheterPiece', arg: duJour, i: 's1' });
    poser({ ...neuf, coffres: [{ type: 'argent', origine: 'victoire' }] });
    r.coffre = geste({ act: 'ouvrir', i: '0' });
    // Le mois a tourné : ce que la saison passée a donné, et repris au classement.
    const novembre = new VraieDate(2026, 10, 2, 12).getTime();
    globalThis.Date = class extends VraieDate { constructor(...a) { super(...(a.length ? a : [novembre])); } static now() { return novembre; } };
    poser({ ...neuf, parties: 40, victoires: 30, defaites: 10, elo: 2350, ligue: 8, plusHauteLigue: 8, promotions: [2, 3, 4, 5, 6, 7, 8], route: { points: 250, passe: false, pris: { gratuit: [1], passe: [] } } });
    r.moisSuivant = ecran('saison');
    r.sansTraduction = [...L.SANS_TRADUCTION];
    console.log(JSON.stringify(r));`);
  const texte = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const annonce = (html) => texte((html.match(/<p class="prog-annonce">([\s\S]*?)<\/p>/) || ['', ''])[1]).trim();
  const propre = (html) => !/\p{Extended_Pictographic}/u.test(html) && !/undefined|NaN|\[object/.test(html);
  // (Les mots que seuls ces écrans écrivent : aucun ne doit rester sur une page anglaise.)
  const restes = (html) => texte(html).match(/autocollant|blason|Bannière|Cadre |Titre|Teinture|Saison|Palier|Éclat|Porté|Prendre|Pris\b|Aucun|Rien\b|Dernier jour|Il reste|Tu reçois|Il te manque|Toucher|Encore|À toi|environ/gi) || [];

  check('marqué « en », le jeu parle anglais', m.langue === 'en');
  check('les tables sont traduites : les genres, les collections',
    egal(m.genres, { embleme: 'Sticker', cadre: 'Frame', banniere: 'Banner', grade: 'Title', epithete: 'Title', teinture: 'Dye' })
    && egal(m.collections, ['The Start', 'The Barnyard', 'The High Tide', 'The Sands', 'The Construction Site', 'War Bloopers', 'The Monsters', 'The Banquet', 'The Court', 'The Leagues', 'The Dyes', 'Night of the Pumpkins', 'The Grand Tournament', 'The Big Freeze']), m.collections.join(', '));
  check('… les pièces : un grade, un autocollant, une bannière et un cadre nommés d’après leur collection, une épithète, un étendard, une teinture',
    egal(m.noms, ['Villager', 'Major Blunder', 'Barnyard Banner', 'Barnyard Frame', 'Barnyard', 'Night Pennant', 'Jade Dye', 'Bear Hug', 'Gold Frame']), m.noms.join(', '));
  check('… pas les identifiants, que les sauvegardes contiennent : les pièces, leur genre, leur rareté, leur dessin ; les collections et leur rangement ; le blason de départ',
    egal(m.pieces, Object.values(PIECES).map(sansNom)) && egal(m.rangement, COLLECTIONS.map((c) => [c.id, c.source, c.planches, c.pieces, c.emblemes])) && egal(m.depart, BLASON_DE_DEPART));
  check('… et les tables traduites sont figées comme les françaises', m.figees === true);

  check('le titre se compose à l’anglaise, l’épithète devant : « Banquet Tamer », « Court Jester »',
    egal(m.titres, ['Villager', 'Banquet Tamer', 'Seven Seas Scarecrow-in-Chief', 'Court Jester']), m.titres.join(' | '));
  check('… un mot de titre sur sa vignette : le grade tel quel, l’épithète devant ses points', /<b>Tamer<\/b>/.test(m.mots[0]) && /<b>Banquet …<\/b>/.test(m.mots[1]));
  check('une pièce dans une phrase : « the », jamais « le », « la » ni « l’ »',
    egal(m.phrases, ['the Barnyard Banner', 'the Gold Frame', 'the Night Pennant', 'the title “Tamer”', 'the title “Pumpkin …”', 'the sticker “Major Blunder”', 'the Silver Dye']), m.phrases.join(' | '));
  check('… et derrière deux points', egal(m.etiquettes, ['title “Tamer”', 'title “Pumpkin …”', 'Gold Frame']), m.etiquettes.join(' | '));
  check('ce que des gains ont donné, en une phrase', /^70 Shards, 50 Crowns, the sticker “Helmeted Pumpkin”, the title “Gourd Gobbler”$/.test(m.gains), m.gains);
  check('le prix en euros d’un prix en Couronnes', m.euros === ', about €5', m.euros);
  check('à l’accueil, les étiquettes du médaillon et des bourses', /aria-label="My crest: Villager"/.test(m.joueur) && /aria-label="400 Shards, 520 Crowns: open the shop"/.test(m.joueur));

  let t = texte(m.album);
  check('l’Album : son titre, la carte de joueur, les bourses, le compte, la règle des doublons',
    /<h2>Album<\/h2>/.test(m.album) && /aria-label="Customize my crest"/.test(m.album) && /Tap to customize your crest/.test(t) && /<span>Shards<\/span> · [\s\S]*<span>Crowns<\/span>/.test(m.album)
    && /\d+ \S+ out of \d+\. Every chest holds at least one sticker; a duplicate turns into Shards, which buy the ones you’re missing\./.test(t) && propre(m.album), t.slice(0, 200));
  check('… la saison en cours d’abord, puis chaque collection et d’où elle vient',
    /Night of the Pumpkins 0 of 24 · Season 1 The Barnyard 2 of 13 · In chests/.test(t) && /The Court 0 of 13 · In the shop/.test(t) && /The Leagues 2 of 10 · From leagues/.test(t) && /The Dyes 0 of 4 · For Shards/.test(t)
    && /aria-label="Major Blunder"/.test(m.album) && restes(m.album).length === 0, restes(m.album).join(' | '));

  t = texte(m.collection);
  check('la page d’une collection : ce qu’il manque, ce qu’on porte, ce qu’elle donne, les prix',
    /<h2>The Barnyard<\/h2>/.test(m.collection) && /Its stickers come from chests\. You’re missing 7: each can also be bought with Shards\./.test(t) && /class="col-porte">Equipped</.test(m.collection) && /data-act="porter" data-arg="bassecour.poule-guerriere">Equip</.test(m.collection)
    && /What the collection gives/.test(t) && /Farmer Title, main part/.test(t) && /Barnyard … Title, front part/.test(t)
    && /A common sticker costs 30 Shards, a rare one 100, an epic one 300\. The 3 stickers of the day, in the shop, are half price\./.test(t) && restes(m.collection).length === 0 && propre(m.collection), restes(m.collection).join(' | '));
  check('acheter un autocollant : l’écran le dit, et ce que la collection donne avec', annonce(m.achat) === 'Flying Sheep: in your album. The collection gives you the title “Farmer”.', annonce(m.achat));
  check('porter un autocollant ; trop cher : ce qu’il manque', annonce(m.porte) === 'Warrior Hen: it’s on your crest.' && /^You’re \d+ short for this sticker\.$/.test(annonce(m.tropCher)), `${annonce(m.porte)} | ${annonce(m.tropCher)}`);
  check('la collection de la boutique, celle des teintures, celle des ligues',
    /A shop collection: all 13 pieces at once, for 300 Crowns \(about €3\)\./.test(texte(m.cour)) && /And with it/.test(texte(m.cour))
    && /A dye dresses your troops in another material during games: gold and steel change, never your side’s cloth\. It changes nothing in combat\. Each one is bought with Shards\./.test(texte(m.teintures)) && /Its pieces Silver Dye/.test(texte(m.teintures))
    && /League gifts: they arrive with each promotion\./.test(texte(m.ligues)) && /class="col-porte">Equipped</.test(m.ligues) && [m.cour, m.teintures, m.ligues].every((p) => restes(p).length === 0));

  check('le blason à composer : son titre, ses six rayons, ce qu’on peut retirer',
    /<h2>My crest<\/h2>/.test(m.blason) && egal([...m.blason.matchAll(/<h3>([^<]*)<\/h3>/g)].map((x) => x[1]), ['Sticker', 'Frame', 'Banner', 'Title: main part', 'Title: front part', 'Troop dye'])
    && (m.blason.match(/<b>None<\/b>/g) || []).length === 2 && /aria-label="No dye: the troops as they are"/.test(m.blason) && /aria-label="Bronze Banner"/.test(m.blason)
    && /Your crest shows on the home screen and at the end of every ranked game\. It changes nothing in combat\./.test(texte(m.blason)) && /See the dyes/.test(texte(m.blason)) && restes(m.blason).length === 0 && propre(m.blason), restes(m.blason).join(' | '));

  t = texte(m.saison);
  check('l’écran de la saison : son numéro, son thème, ce qu’il reste, le palier, la règle des points',
    /<h2>Season 1<\/h2>/.test(m.saison) && /Night of the Pumpkins 23 days left Tier 2 of 30 · 50 \S+ out of 100 toward the next/.test(t)
    && /A ranked game: 20 points\. A win: 20 more\. The first win of the day: another 40\./.test(t) && propre(m.saison), t.slice(0, 200));
  check('… le Passe : ce qu’il contient, ce qu’il ne contient pas, son prix et son équivalent en euros',
    /<b>The Season Pass<\/b> opens the right-hand track: 12 stickers, 4 crest pieces \(banner, frame, two title words\), 400 Crowns and 400 Shards\. No chests, no fragments, no levels\./.test(m.saison)
    && /500 Crowns, about €5\. Bought mid-season, it also gives you the tiers you’ve already reached\./.test(t));
  check('… la route : les deux voies, ce qui est pris, ce qui est à prendre, les récompenses',
    /<b>For everyone<\/b>/.test(m.saison) && /<b>[\s\S]{0,400}?<\/svg> Pass<\/b>/.test(m.saison) && /class="col-pris">Claimed</.test(m.saison) && /data-i="2">Claim</.test(m.saison)
    && /<small>20 Shards<\/small>/.test(m.saison) && /<small>100 Crowns<\/small>/.test(m.saison) && /<small>Title: Gourd Gobbler<\/small>/.test(m.saison) && /<small>Title: Pumpkin …<\/small>/.test(m.saison)
    && /At the end of the month, tiers you’ve reached but not yet claimed are given to you, then the next season begins\./.test(t) && restes(m.saison).length === 0, restes(m.saison).join(' | '));
  check('prendre un palier ; le Passe en deux touchers ; sans les Couronnes, ce qu’il manque et la boutique',
    /^You get: a [^.]+\.$/.test(annonce(m.palier)) && /data-act="passe" data-i="1">Tap again: /.test(m.confirmer) && annonce(m.passe) === 'The Season Pass is yours: the right-hand track is open.'
    && /<b>Season Pass: yours\.<\/b> Both tracks are open\./.test(m.passe) && /Claim all \(2\)/.test(m.passe) && /^You’re \d+ short for the Pass\. Shop$/.test(annonce(m.sansLeSou)), `${annonce(m.palier)} | ${annonce(m.sansLeSou)}`);
  check('une route finie, une collection déjà possédée : l’écran le dit',
    /Tier 30 of 30: the road is complete/.test(texte(m.finie)) && /This collection has come around before: you have 16 of these pieces\. Those will give you Shards instead \(\s*\d+ in all\)\./.test(texte(m.finie))
    && (m.finie.match(/class="col-deja">Already yours: /g) || []).length === 22 && restes(m.finie).length === 0);

  t = texte(m.boutique);
  check('le rayon des collections, à la boutique : le Passe, les autocollants du jour, les teintures, la collection à vendre',
    /<h3>Season 1: Night of the Pumpkins<\/h3>/.test(m.boutique) && /<b>Season Pass<\/b>/.test(m.boutique) && /500 Crowns, about €5 · no chests, no fragments, no levels/.test(t) && /data-ecran="saison">View</.test(m.boutique)
    && /<h3>Stickers of the day<\/h3>/.test(m.boutique) && /Three stickers you’re missing: 3 a day, half price, for Shards\. A sticker you buy isn’t replaced until tomorrow\./.test(t)
    && /<h3>Troop dyes<\/h3>/.test(m.boutique) && /Your troops’ gold and steel in another material\. For Shards\./.test(t) && /Jade Dye For all your troops/.test(t)
    && /<h3>Collections<\/h3>/.test(m.boutique) && /A whole collection at once\. Everything in it is shown: nothing is drawn at random\./.test(t)
    && /aria-label="View the collection: The Court"/.test(m.boutique) && /The Court 9 stickers, its banner, its frame and its two title words · about €3/.test(t), t.slice(0, 300));
  check('… un autocollant du jour acheté : il en reste deux, et le texte le dit', /: in your album\.$/.test(annonce(m.resteDeux)) && /Two stickers you’re missing: 3 a day, half price, for Shards\./.test(texte(m.resteDeux)));
  check('ouvrir un coffre : son autocollant (« New ») et ses Éclats', /class="col-nouveau">New</.test(m.coffre) && /<b>Shards<\/b><small>in every chest<\/small>/.test(m.coffre));
  check('le mois suivant : ce que la saison passée a donné, et repris au classement',
    /<h2>Season 2<\/h2>/.test(m.moisSuivant) && /^Last season is over; a new one begins\. Above 750 points, the ranking tightens: your score restarts at [\d.,\s]+, in the [^.]+\. You get: a [^.]+\.$/.test(annonce(m.moisSuivant)), annonce(m.moisSuivant));

  // Rien de ces écrans n'est resté sans traduction.
  const cles = new Set(FICHIERS.flatMap((f) => clesDuCode(lire(f))).concat(francais));
  const oubliees = m.sansTraduction.filter((cle) => cles.has(cle));
  check('aucune phrase de ces écrans n’a été demandée sans avoir de traduction', oubliees.length === 0, oubliees.slice(0, 3).join(' | '));
}

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
