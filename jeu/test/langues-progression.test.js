// La progression et la boutique en anglais (cahier js/langues/en/progression.js) :
// le cahier couvre ses fichiers, le français n'a pas bougé, la table des
// réglages se traduit sans que ses règles ni ses identifiants changent, et les
// écrans se lisent en anglais.
// Lancement : node test/langues-progression.test.js

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LANGUE, SANS_TRADUCTION } from '../js/langue.js';
import { PROGRESSION as R, textesATraduire } from '../js/progression-config.js';
import { verifierProbabilites, profilNeuf, appliquerResultat, ouvrirCoffre, aleaDeGraine } from '../js/progression.js';
import { ligueEnPhrase, euros, resteEnClair } from '../js/progression-ecrans.js';
import { verifierCahier, clesDuCode } from '../outils/langues.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${detail ? ' — ' + detail : ''}`);
}
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
/** Lance un Node neuf (la langue se lit au chargement des modules) et rend ce que le script affiche, lu comme du JSON. */
const ailleurs = (script) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 24 }));

/** Les fichiers que le cahier couvre, et la table dont il traduit les noms. */
const FICHIERS = ['js/progression-ecrans.js', 'js/progression-config.js', 'js/progression.js', 'js/achats.js', 'js/edition.js', 'js/rangement-durable.js'];
const TABLES = ['js/progression-config.js:textesATraduire'];
const HEURE = 3600;
/** La table sans ses textes : ce qui ne doit pas dépendre de la langue. */
const squelette = (table) => { const copie = JSON.parse(JSON.stringify(table)); textesATraduire((objet, champ) => { objet[champ] = ''; }, copie); return JSON.stringify(copie); };
const fige = (objet) => Object.isFrozen(objet) && Object.values(objet).every((v) => !v || typeof v !== 'object' || fige(v));
/** Une partie gagnée qui fait monter de ligue, puis son coffre ouvert : le profil qui en sort, tel qu'il se range. */
const PARTIE = { issue: 'victoire', duree: 600, contreOrdinateur: 'echelle', jour: '2026-10-08', instant: 1_800_000_000 };
const profilJoue = (P) => { const r = P.appliquerResultat({ ...P.profilNeuf(), elo: 60 }, { ...PARTIE, alea: P.aleaDeGraine(7) }); return JSON.stringify(P.ouvrirCoffre(r.profil, 0, P.aleaDeGraine(11)).profil); };

// --- Le cahier -------------------------------------------------------------------------------
console.log('--- Le cahier ---');
{
  const r = await verifierCahier('en', 'progression', FICHIERS, TABLES);
  // (Une phrase que l'assemblage aura rangée dans un autre cahier ne manque pas : elle est dans le dictionnaire.)
  const dictionnaire = (await import('../js/langues/en.js')).default;
  const manquantes = r.manquantes.filter((cle) => !Object.prototype.hasOwnProperty.call(dictionnaire, cle));
  check(`le cahier « progression » couvre ses ${FICHIERS.length} fichiers et la table des réglages : rien ne manque`, r.cles > 200 && manquantes.length === 0, `${r.cles} textes${manquantes.length ? ' · ' + manquantes.slice(0, 3).join(' | ') : ''}`);
  check('… rien en trop, rien de fautif (traduction vide, trou inventé, balises différentes)', r.enTrop.length === 0 && r.fautives.length === 0, [...r.enTrop, ...r.fautives.map(([cle, d]) => `${cle} : ${d.join(' ; ')}`)].slice(0, 3).join(' | '));
  const cahier = (await import('../js/langues/en/progression.js')).default;
  const anglaises = Object.values(cahier).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v)));
  check('l’anglais : pas d’espace avant « : », « ? », « ! », « % », pas de guillemets français, pas d’emoji',
    anglaises.every((v) => !/[   ][:?!%]/.test(v) && !/[«»]/.test(v) && !/\p{Extended_Pictographic}/u.test(v)), anglaises.filter((v) => /[   ][:?!%]/.test(v) || /[«»]/.test(v)).slice(0, 3).join(' | '));
  check('les mots qui s’accordent ont leurs deux formes', ['Couronne|Couronnes', 'Éclat|Éclats', 'fragment|fragments', 'tirage|tirages'].every((cle) => cahier[cle] && typeof cahier[cle].one === 'string' && typeof cahier[cle].other === 'string'));
}

// --- Le français, inchangé ---------------------------------------------------------------------
console.log('\n--- Le français ---');
const tableFrancaise = squelette(R);
{
  check('sans rien demander, la table est en français, et figée jusqu’au fond',
    LANGUE === 'fr' && egal(R.ligues.map((l) => l.nom), ['Bois', 'Pierre', 'Bronze', 'Fer', 'Argent', 'Or', 'Cristal', 'Orichalque', 'Soleil', 'Légendes'])
    && R.coffres.or.nom === 'Coffre d’or' && R.coffres.or.tirages[1].nom === 'Tirage « rare ou mieux »' && R.boutique.lots[4].nom === 'Butin royal'
    && egal(R.nomsDesCategories, { commune: 'Commune', rare: 'Rare', epique: 'Épique' }) && egal(R.collections.raretes, { commune: 'Commun', rare: 'Rare', epique: 'Épique' }) && fige(R));
  const vus = [];
  textesATraduire((objet, champ) => vus.push([champ, objet[champ]]));
  check('`textesATraduire` visite les noms des ligues, des catégories, des raretés, des coffres, de leurs tirages et des lots — et rien d’autre',
    vus.length === 10 + 3 + 3 + 4 + 6 + 5 && vus.every(([champ, texte]) => typeof texte === 'string' && /[A-Za-zÀ-ÿ]{2,}/.test(texte) && (champ === 'nom' || R.categories.includes(champ))),
    `${vus.length} textes`);
  check('… jamais un identifiant : ni `id`, ni `produit`, ni une clé de coffre ou de catégorie',
    !vus.some(([champ, texte]) => champ === 'id' || champ === 'produit' || R.boutique.lots.some((l) => texte === l.id || texte === l.produit) || Object.keys(R.coffres).includes(texte)));
  check('le nom d’une ligue dans une phrase : « de », « d’ », « du », « des »',
    egal(R.ligues.map((l) => ligueEnPhrase(l)), ['ligue de Bois', 'ligue de Pierre', 'ligue de Bronze', 'ligue de Fer', 'ligue d’Argent', 'ligue d’Or', 'ligue de Cristal', 'ligue d’Orichalque', 'ligue du Soleil', 'ligue des Légendes'])
    && ligueEnPhrase(6) === 'ligue d’Or');
  check('les prix et les durées s’écrivent à la française', euros(99) === '0,99 €' && euros(4999) === '49,99 €'
    && egal([resteEnClair(72 * HEURE), resteEnClair(47.2 * HEURE), resteEnClair(59 * 60)], ['3 j', '48 h', '59 min']));
  check('… et rien n’est noté « sans traduction »', SANS_TRADUCTION.size === 0);
}

// --- Le code -----------------------------------------------------------------------------------
console.log('\n--- Le code ---');
{
  const ecrans = lire('js/progression-ecrans.js');
  check('plus de « fr-FR » écrit en dur : les nombres passent par `nombreLocal`, les mots accordés par `accord`',
    FICHIERS.every((f) => !lire(f).includes('fr-FR')) && /const nombre = \(v, decimales = 2\) => nombreLocal\(/.test(ecrans) && /const pluriel = \(n, mot, mots = mot \+ 's'\) => compte\(n, accord\(n, mot, mots\)\)/.test(ecrans));
  check('le titre de la boutique se compare traduit, partout où il se compare',
    (ecrans.match(/titreMontre === txt\('Boutique'\)/g) || []).length === 4 && !/titreMontre === '/.test(ecrans) && /montrer\(txt\('Boutique'\)/.test(ecrans));
  check('les écrans des collections reçoivent les mêmes aides, sous les mêmes noms',
    /brancherCollections\(\{ montrer, retenir, nombre, pluriel, couronnes, euros, coffre, heure, ligueEnPhrase, jour: \(\) => jourLocal\(\) \}\)/.test(ecrans));
  check('le moteur de règles, les achats, l’édition et le rangement durable ne fabriquent aucun texte pour le joueur : rien à y traduire',
    ['js/progression.js', 'js/achats.js', 'js/edition.js', 'js/rangement-durable.js'].every((f) => clesDuCode(lire(f)).length === 0));
}

// --- L'anglais -----------------------------------------------------------------------------------
console.log('\n--- L’anglais ---');
{
  const m = ailleurs(`
    globalThis.__LANGUE = 'en';
    // (Tant que le cahier n'est pas dans js/langues/en.js, on l'y verse : le dictionnaire est un objet ordinaire.)
    Object.assign((await import('./js/langues/en.js')).default, (await import('./js/langues/en/progression.js')).default);
    const memoire = new Map();
    globalThis.localStorage = { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); } };
    const noeud = { innerHTML: '', classList: { add() {}, remove() {} }, querySelector: () => null };
    let clic = null;
    globalThis.document = { getElementById: (id) => (id === 'progression' ? noeud : null), addEventListener: (t, f) => { if (t === 'click') clic = f; } };
    const L = await import('./js/langue.js');
    const { PROGRESSION: R, textesATraduire } = await import('./js/progression-config.js');
    const P = await import('./js/progression.js');
    const X = await import('./js/progression-ecrans.js');
    const A = await import('./js/achats.js');
    const S = await import('./js/save.js');
    const O = await import('./outils/langues.mjs');
    const fs = await import('node:fs');
    const texte = (html) => html.replace(/<svg[\\s\\S]*?<\\/svg>/g, '').replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim();
    const toucher = (dataset) => clic({ target: { closest: () => ({ dataset }) } });
    const poser = (profil) => memoire.set(S.PROGRESSION_KEY, JSON.stringify(profil));
    const attendre = () => new Promise((r) => setTimeout(r, 20));
    const fige = (objet) => Object.isFrozen(objet) && Object.values(objet).every((v) => !v || typeof v !== 'object' || fige(v));
    const copie = JSON.parse(JSON.stringify(R)); textesATraduire((objet, champ) => { objet[champ] = ''; }, copie);
    const maintenant = Date.now() / 1000, HEURE = 3600;
    const joueur = P.migrerProfil({ ...P.profilNeuf(), elo: 300, ligue: 3, plusHauteLigue: 3, parties: 31, couronnes: 250, eclats: 145,
      debloquees: { ...P.profilNeuf().debloquees, triton: 'ligue', horseArcher: 'ligue' }, coffres: [{ type: 'bois', origine: 'victoire' }, { type: 'or', origine: 'semaine' }],
      boutique: { offreLigue: { troupe: 'catapult', jusqua: maintenant + 30 * HEURE }, bienvenueJusqua: maintenant + 60 * HEURE, bienvenuePrise: false, transactions: [] } });
    const vu = {};
    X.installerProgression({ quandOnEssaie: () => 'confirmer' });
    poser(joueur);
    vu.bandeau = texte(X.htmlBandeau(joueur));
    for (const [ecran, arg] of [['ligues'], ['coffres'], ['probas', 'or'], ['troupes'], ['fiche', 'hydra'], ['fiche', 'villager'], ['boutique'], ['confidentialite']]) {
      X.ouvrirProgression(ecran, arg);
      vu[arg || ecran] = { titre: (/<h2>(.*?)<\\/h2>/.exec(noeud.innerHTML) || [])[1], texte: texte(noeud.innerHTML), etiquettes: [...noeud.innerHTML.matchAll(/aria-label="([^"]*)"/g)].map((x) => x[1]) };
    }
    // Acheter en Couronnes : ce qu'il manque, puis les deux touchers.
    X.ouvrirProgression('boutique');
    toucher({ act: 'acheter', arg: 'hydra' }); vu.manque = texte(noeud.innerHTML);
    toucher({ act: 'acheter', arg: 'catapult' }); vu.confirmer = /data-act="acheter" data-arg="catapult" data-i="1">Tap again: /.test(noeud.innerHTML);
    toucher({ act: 'acheter', arg: 'catapult', i: '1' }); vu.achete = texte(noeud.innerHTML);
    toucher({ act: 'ouvrir', i: '0' }); vu.ouverture = { titre: (/<h2>(.*?)<\\/h2>/.exec(noeud.innerHTML) || [])[1], texte: texte(noeud.innerHTML) };
    toucher({ act: 'essayer', arg: 'hydra' }); vu.essai = texte(noeud.innerHTML);
    toucher({ act: 'effacerDonnees' }); vu.effacer = texte(noeud.innerHTML);
    // Acheter en argent réel, au guichet simulé : la boutique ne se redessine que si son titre, traduit, est reconnu.
    poser(joueur);
    X.installerProgression({ guichet: A.guichetSimule() });
    await attendre();
    X.ouvrirProgression('boutique');
    toucher({ act: 'acheterLot', arg: 'bourse' }); vu.simule = texte(noeud.innerHTML);
    toucher({ act: 'acheterLot', arg: 'bourse', i: '1' }); vu.enCours = texte(noeud.innerHTML);
    await attendre(); vu.livre = texte(noeud.innerHTML);
    toucher({ act: 'restaurerAchats' }); await attendre(); vu.restaure = texte(noeud.innerHTML);
    // La fin d'une partie classée : une promotion.
    const promue = P.appliquerResultat({ ...P.profilNeuf(), elo: 60 }, { issue: 'victoire', duree: 600, contreOrdinateur: 'echelle', jour: X.jourLocal(), instant: maintenant });
    vu.fin = texte(X.htmlFinDePartie(promue.evenements, promue.profil));
    vu.annulee = texte(X.htmlFinDePartie([{ type: 'partieAnnulee', raison: 'annulee' }], P.profilNeuf()));
    // Ce que mes fichiers ont demandé sans le trouver.
    const miennes = new Set(${JSON.stringify(FICHIERS)}.flatMap((f) => O.clesDuCode(fs.readFileSync(f, 'utf8'))));
    console.log(JSON.stringify({
      langue: L.LANGUE, vu,
      ligues: R.ligues.map((l) => l.nom), coffres: Object.values(R.coffres).map((c) => c.nom), tirages: R.coffres.or.tirages.map((t) => t.nom), lots: R.boutique.lots.map((l) => l.nom),
      categories: [R.nomsDesCategories, R.collections.raretes], identifiants: [R.boutique.lots.map((l) => [l.id, l.produit]), Object.keys(R.coffres), R.categories, R.boutique.offres.bienvenue.produit],
      fige: fige(R), squelette: JSON.stringify(copie), erreurs: P.verifierProbabilites(), produits: A.PRODUITS.map((p) => p.produit),
      phrases: [...R.ligues.map((l) => X.ligueEnPhrase(l)), X.ligueEnPhrase(6)], euros: [X.euros(99), X.euros(4999), X.euros(123456)],
      reste: [X.resteEnClair(72 * HEURE), X.resteEnClair(47.2 * HEURE), X.resteEnClair(59 * 60)],
      sansTraduction: [...L.SANS_TRADUCTION].filter((cle) => miennes.has(cle)),
      profil: (${profilJoue.toString().replace('PARTIE', JSON.stringify(PARTIE))})(P),
    }));`);
  const v = m.vu;

  check('marqué « en », la table est traduite : ligues, coffres, tirages, lots, catégories et raretés',
    m.langue === 'en' && egal(m.ligues, ['Wood', 'Stone', 'Bronze', 'Iron', 'Silver', 'Gold', 'Crystal', 'Orichalcum', 'Sun', 'Legends'])
    && egal(m.coffres, ['Wooden Chest', 'Silver Chest', 'Golden Chest', 'Legendary Chest']) && egal(m.tirages, ['Standard draws', '“Rare or better” draw'])
    && egal(m.lots, ['Handful', 'Pouch', 'Strongbox', 'Treasure', 'Royal Hoard'])
    && egal(m.categories, [{ commune: 'Common', rare: 'Rare', epique: 'Epic' }, { commune: 'Common', rare: 'Rare', epique: 'Epic' }]), JSON.stringify([m.ligues, m.coffres, m.lots]));
  check('… pas ses identifiants, que les règles et les deux magasins attendent tels quels',
    egal(m.identifiants, [R.boutique.lots.map((l) => [l.id, l.produit]), Object.keys(R.coffres), R.categories, R.boutique.offres.bienvenue.produit])
    && egal(m.produits, ['couronnes.poignee', 'couronnes.bourse', 'couronnes.coffret', 'couronnes.tresor', 'couronnes.butin', 'offre.bienvenue']));
  check('… ni aucun réglage : hors de ses textes, la table anglaise est la table française, figée elle aussi, et ses probabilités tombent juste',
    m.squelette === tableFrancaise && m.fige === true && egal(m.erreurs, verifierProbabilites()) && m.erreurs.valide === true && m.erreurs.erreurs.length === 0);
  check('… et le profil qui se range ne dépend pas de la langue : la même partie, le même coffre, le même profil au caractère près',
    m.profil === profilJoue({ profilNeuf, appliquerResultat, ouvrirCoffre, aleaDeGraine }) && JSON.parse(m.profil).ligue === 2 && !/Stone|Pierre|Chest|Coffre/.test(m.profil));
  check('le nom d’une ligue dans une phrase, les prix et les durées s’écrivent à l’anglaise',
    egal(m.phrases, ['Wood League', 'Stone League', 'Bronze League', 'Iron League', 'Silver League', 'Gold League', 'Crystal League', 'Orichalcum League', 'Sun League', 'Legends League', 'Gold League'])
    && egal(m.euros, ['€0.99', '€49.99', '€1,234.56']) && egal(m.reste, ['3 d', '48 h', '59 min']), JSON.stringify([m.euros, m.reste]));

  check('l’accueil : la ligue du joueur, la suivante, les tuiles', /Bronze League · 300 Elo/.test(v.bandeau) && /Iron League at 450/.test(v.bandeau)
    && ['Chests 2', 'Troops', 'Album', 'Season', 'Shop 1'].every((x) => v.bandeau.includes(x)), v.bandeau);
  check('les ligues : la règle, les seuils (« 1,150 »), ce qu’on y gagne, « You are here »',
    v.ligues.titre === 'Leagues' && v.ligues.texte.includes('A ranked win earns 30 points, a loss costs 15.') && v.ligues.texte.includes('from 1,150 Elo · troops up to level 3')
    && /To win: Golden Chest · .* · 50 Crowns/.test(v.ligues.texte) && /Received: Golden Chest/.test(v.ligues.texte) && v.ligues.texte.includes('You are here') && v.ligues.texte.includes('the start · troops up to level 1')
    && egal(v.ligues.etiquettes, ['Close']));
  check('les coffres : d’où ils viennent, la table des rangs en pour-cent sans espace, le format court, les quatre rangs',
    v.coffres.titre === 'Chests' && /Wooden Chest Victory .* Golden Chest Week played/.test(v.coffres.texte) && v.coffres.texte.includes('Victory 20% 35% 35% 10% Tie 45% 30% 20% 5% Defeat 65% 25% 10% 0%')
    && v.coffres.texte.includes('In Skirmish A 5-minute game, half as long: the chest is one notch lower.') && v.coffres.texte.includes('for playing 3 days in a week · 0 of 3')
    && / wooden silver golden legendary$/.test(v.coffres.texte) && v.coffres.etiquettes.includes('Odds') && v.coffres.etiquettes.includes('Golden Chest'), v.coffres.texte.slice(-160));
  check('les probabilités d’un coffre : la phrase entière, ses mots accordés, ses tableaux',
    v.or.titre === 'Golden Chest' && v.or.texte.includes('5 draws. Per 100 chests, on average: 1,680 common fragments, 570 rare, 70 epic.')
    && v.or.texte.includes('Standard draws — 4 draws Category Chance Fragments Common 60% 7 Rare 30% 3 Epic 10% 1 Total 100%') && v.or.texte.includes('“Rare or better” draw — 1 draw')
    && v.or.texte.includes('Sticker — 1 draw Rarity Chance A duplicate gives') && /And in every golden chest: \d+ Shards, always\./.test(v.or.texte) && v.or.texte.includes('No chest is ever sold.')
    && egal(v.or.etiquettes, ['Back', 'Close']), v.or.texte.slice(0, 200));
  check('les troupes et la fiche d’une troupe : niveaux, statistiques, comment la débloquer',
    v.troupes.titre === 'My troops' && v.troupes.texte.includes('In ranked games, Bronze League lets troops play up to level 2.') && /Lv\. 1 0 \/ 20/.test(v.troupes.texte) && v.troupes.texte.includes('Silver League')
    && v.hydra.texte.includes('Epic Locked') && v.hydra.texte.includes('Level 1 Level 2 Hit points 280 294 Damage 11 12')
    && v.hydra.texte.includes('Free in Silver League, or after 80 ranked games played (you have played 31).') && /Right now in the shop: 300/.test(v.hydra.texte) && v.hydra.texte.includes('Try it in free play')
    && v.villager.texte.includes('Level 2 of 5') && v.villager.texte.includes('Food or gold per minute 34 37 Wood per minute 37 41') && v.villager.texte.includes('Build speed 100% —') && v.villager.texte.includes('0 fragments out of 60 Upgrade to level 3'),
    v.villager.texte.slice(-220));
  check('la boutique : les bourses, l’offre de ligue, les troupes, les lots et leurs prix',
    v.boutique.titre === 'Shop' && /^Shop 250 Crowns 145 Shards /.test(v.boutique.texte) && v.boutique.texte.includes('League offer: Catapult at half price 100 instead of 200 · 30 h left')
    && /Welcome offer: 300 Crowns €2\.99, one time only · \d d left Soon/.test(v.boutique.texte) && v.boutique.texte.includes('Horse Archer Already yours. Unlocked') && v.boutique.texte.includes('Otherwise free in Silver League')
    && /All troops \(5\) instead of 1,400/.test(v.boutique.texte) && v.boutique.texte.includes('Handful: 100 Crowns The first pack €0.99 Pouch: 550 Crowns 10% more than the first pack €4.99')
    && v.boutique.texte.includes('Trial wallet: +500 Crowns') && v.boutique.texte.includes('Nothing random is sold here: no chests, no fragments, no levels.') && v.boutique.etiquettes.includes('View details: Hydra'),
    v.boutique.texte.slice(0, 160));
  check('acheter en Couronnes : ce qu’il manque, « Tap again », puis la troupe débloquée',
    /You are 50 short for this purchase\./.test(v.manque) && v.confirmer === true && v.achete.includes('Catapult: unlocked. Ready to train in your next game.'), v.manque.slice(0, 120));
  check('ouvrir un coffre, essayer une troupe, effacer ses données : les boutons parlent anglais',
    v.ouverture.titre === 'Wooden Chest' && /\+4 fragments/.test(v.ouverture.texte) && /Next chest \(1\) My troops My album Close$/.test(v.ouverture.texte)
    && v.essai.includes('Tap again: the game in progress will be erased') && v.effacer.includes('Tap again: erase everything, for good'), v.ouverture.texte.slice(-80));
  check('acheter au guichet simulé : la boutique reconnaît son titre traduit et dit ce qu’il en est',
    v.simule.includes('Trial version: this purchase is simulated, no payment is requested.') && v.simule.includes('Simulated purchase: no payment. Tap again')
    && v.enCours.includes('Purchase in progress…') && v.enCours.includes('In progress…') && v.livre.includes('550 Crowns more in your purse.') && /^Shop 800 Crowns/.test(v.livre)
    && v.restaure.includes('Nothing to restore: everything you bought is already here.') && v.restaure.includes('Restore my purchases'), v.livre.slice(0, 120));
  check('la confidentialité : ce que le jeu garde, ce qu’il ne fait pas, son éditeur, ses licences',
    v.confidentialite.titre === 'Privacy' && v.confidentialite.texte.includes('are kept on this device .') && v.confidentialite.texte.includes('No ads, no trackers, no analytics.')
    && v.confidentialite.texte.includes('Erase all my data') && /Rule of Thumb is published by \S/.test(v.confidentialite.texte) && v.confidentialite.texte.includes('3D rendering: three.js, MIT license.'));
  check('la fin d’une partie classée : la promotion, les Couronnes, l’offre qui s’ouvre, les coffres',
    /\+30 30 Elo|\+30 90 Elo · Stone League/.test(v.fin) && v.fin.includes('Promoted to Stone League : your troops play up to level 1 there.') && /New troop: \S/.test(v.fin)
    && /\+ ?50 Crowns for your new league\./.test(v.fin) && /League offer: Horse Archer at half price, 48 h/.test(v.fin) && /Golden Chest Promotion/.test(v.fin) && /Open my 2 chests$/.test(v.fin)
    && v.annulee === 'Game canceled: it does not count for ranking.', v.fin);
  check('aucune phrase de la progression n’est restée sans traduction', m.sansTraduction.length === 0, m.sansTraduction.slice(0, 3).join(' | '));
}

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
