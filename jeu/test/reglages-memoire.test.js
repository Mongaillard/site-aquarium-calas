// Réglages « mémoire » : le témoin de coupure, le plafond de mémoire des
// troupes cuites et l'empreinte retenue des modèles. Rien de tout cela ne se
// voit sous Node ; on en vérifie la logique, avec un faux stockage et de
// fausses toiles (des dimensions, sans un seul pixel).
// Lancement : node jeu/test/reglages-memoire.test.js

import { readFileSync } from 'node:fs';
import { World } from '../js/game.js';
import { TICKS_PER_SECOND } from '../js/config.js';
import {
  TEMOIN_KEY, etatTemoin, lireTemoin, ecrireTemoin, fermerTemoin, incidentDe, releverTemoin,
  incidentNonLu, marquerIncidentsLus, resumeIncident, phraseIncident,
} from '../js/save.js';

const DT = 1 / TICKS_PER_SECOND;
let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? '  ok  ' : ' FAIL ';
  if (!condition) failures++;
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

/** Un stockage local de poche : ce que le témoin attend de `localStorage`. */
function fauxStockage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    ecritures: () => m.size,
  };
}

console.log('=== Réglages mémoire ===\n');

// ---------------------------------------------------------------------------
// Le témoin de coupure.
// ---------------------------------------------------------------------------
console.log('--- Témoin de coupure ---');
{
  const etat = (h, plus = {}) => ({ h, min: 12.3, unites: 64, mo: 180, troupes: 9, dpr: 3, visible: true, ...plus });
  const T0 = 1_760_000_000_000;

  // L'état relevé sur une vraie partie.
  {
    const w = new World({ seed: 7, mapSize: 'small', difficulty: 'normal' });
    for (let i = 0; i < 90 * TICKS_PER_SECOND; i++) w.update(DT);
    const vivants = w.units.filter((u) => !u.dead && !u.isAnimal).length;
    const e = etatTemoin(w, { mo: 96.4, troupes: 7, dpr: 3, visible: true, heure: T0 });
    check('l’état relevé : heure, minutes de jeu, unités, Mo d’images, pixels par point, page visible',
      e.h === T0 && e.min === 1.5 && e.unites === vivants && vivants > 0 && e.mo === 96 && e.troupes === 7 && e.dpr === 3 && e.visible === true,
      JSON.stringify(e));
    check('les animaux sauvages ne comptent pas parmi les unités', w.units.some((u) => u.isAnimal) && e.unites < w.units.length,
      `${e.unites} unités pour ${w.units.length} entités`);
    check('sans mesure, l’état reste complet', (() => { const v = etatTemoin(w); return v.mo === 0 && v.dpr === 1 && v.visible === true && v.h > 0; })());
  }

  // Une marque tenue à jour, puis plus rien : la page a été coupée.
  {
    const s = fauxStockage();
    check('rien à relever au premier lancement', releverTemoin(T0, s) === null && lireTemoin(s).incidents.length === 0);
    ecrireTemoin(etat(T0), s);
    ecrireTemoin(etat(T0 + 5000, { min: 12.4 }), s);
    const lu = lireTemoin(s);
    check('la marque se tient à jour sous la clé « aem.temoin.v1 »',
      TEMOIN_KEY === 'aem.temoin.v1' && !!s.getItem(TEMOIN_KEY) && lu.dernier.h === T0 + 5000 && lu.dernier.min === 12.4 && !lu.dernier.ferme);
    const incident = releverTemoin(T0 + 60_000, s);
    check('marque restée ouverte, page visible : une coupure est relevée',
      !!incident && incident.genre === 'coupure' && incident.mo === 180 && incident.unites === 64 && incident.dpr === 3, JSON.stringify(incident));
    check('elle rejoint la liste des incidents, et la marque est effacée',
      lireTemoin(s).incidents.length === 1 && lireTemoin(s).dernier === null);
    check('relancer la page une seconde fois ne la compte pas deux fois',
      releverTemoin(T0 + 61_000, s) === null && lireTemoin(s).incidents.length === 1);
    check('la ligne de l’accueil : durée, mémoire, unités',
      phraseIncident(incident) === 'La dernière partie s’est interrompue après 12 min — 180 Mo d’images, 64 unités', phraseIncident(incident));
  }

  // Les sorties normales ne sont pas des incidents.
  for (const raison of ['fin', 'accueil', 'masquee']) {
    const s = fauxStockage();
    ecrireTemoin(etat(T0), s);
    fermerTemoin(raison, raison === 'masquee' ? etat(T0 + 1000, { visible: false }) : null, s);
    check(`marque fermée (« ${raison} ») : aucun incident`,
      lireTemoin(s).dernier.ferme === raison && releverTemoin(T0 + 5000, s) === null && lireTemoin(s).incidents.length === 0);
  }
  {
    const s = fauxStockage();
    ecrireTemoin(etat(T0, { visible: false }), s);
    check('marque ouverte mais page masquée : aucun incident', releverTemoin(T0 + 5000, s) === null);
  }

  // Page quittée alors qu'elle était visible, et relancée aussitôt : un rechargement.
  {
    const s = fauxStockage();
    ecrireTemoin(etat(T0), s);
    fermerTemoin('quittee', etat(T0 + 3000, { min: 0.4, unites: 1, mo: 1 }), s);
    fermerTemoin('masquee', etat(T0 + 3010, { visible: false }), s);   // l'ordre d'un rechargement : quittée, PUIS masquée
    check('la première raison de fermeture l’emporte', lireTemoin(s).dernier.ferme === 'quittee' && lireTemoin(s).dernier.h === T0 + 3000);
    const i = incidentDe(lireTemoin(s).dernier, T0 + 6000);
    check('quittée en pleine partie et relancée dans la foulée : un rechargement', !!i && i.genre === 'rechargee', JSON.stringify(i));
    check('… dit comme tel, au singulier et sous la minute',
      phraseIncident(i) === 'La page a été rechargée en pleine partie, après moins d’une minute — 1 Mo d’images, 1 unité', phraseIncident(i));
    check('quittée, puis relancée le lendemain : rien à signaler', incidentDe(lireTemoin(s).dernier, T0 + 86_400_000) === null);
  }

  // Masquée, puis de retour : la marque se rouvre, et une coupure se voit de nouveau.
  {
    const s = fauxStockage();
    ecrireTemoin(etat(T0), s);
    fermerTemoin('masquee', etat(T0 + 1000, { visible: false }), s);
    ecrireTemoin(etat(T0 + 9000), s);
    check('au retour de la page, la marque se rouvre', !lireTemoin(s).dernier.ferme && lireTemoin(s).dernier.visible === true);
    check('… et une coupure après le retour est relevée', (releverTemoin(T0 + 20_000, s) || {}).genre === 'coupure');
  }

  // Partie finie, puis retour au menu : « fin » reste ; fermer sans marque ni état ne crée rien.
  {
    const s = fauxStockage();
    check('fermer sans marque ni état n’écrit rien', fermerTemoin('accueil', null, s) === false && s.getItem(TEMOIN_KEY) === null);
    ecrireTemoin(etat(T0), s);
    fermerTemoin('fin', null, s);
    fermerTemoin('accueil', null, s);
    check('une marque fermée garde ses derniers chiffres', lireTemoin(s).dernier.ferme === 'fin' && lireTemoin(s).dernier.unites === 64);
  }

  // Les cinq derniers incidents, du plus ancien au plus récent.
  {
    const s = fauxStockage();
    for (let k = 0; k < 7; k++) {
      ecrireTemoin(etat(T0 + k * 100_000, { unites: k }), s);
      releverTemoin(T0 + k * 100_000 + 50_000, s);
    }
    const { incidents } = lireTemoin(s);
    check('la liste garde les cinq derniers incidents', incidents.length === 5 && incidents[0].unites === 2 && incidents[4].unites === 6,
      incidents.map((i) => i.unites).join(','));
    check('le résumé d’un incident se lit seul', resumeIncident(incidents[4]) === 'après 12 min — 180 Mo d’images, 6 unités', resumeIncident(incidents[4]));
  }

  // La ligne de l'accueil tient jusqu'à la prochaine partie lancée, pas le temps d'un seul chargement.
  {
    const s = fauxStockage();
    const accueil = (maintenant) => releverTemoin(maintenant, s) || incidentNonLu(s);   // ce que fait js/main.js au chargement
    check('aucun incident : rien à redire, rien à marquer, rien d’écrit',
      incidentNonLu(s) === null && marquerIncidentsLus(s) === false && s.getItem(TEMOIN_KEY) === null);
    ecrireTemoin(etat(T0), s);
    const premier = accueil(T0 + 2000);
    const second = accueil(T0 + 60_000);     // la page est relancée avant que personne ait lu la ligne
    check('page relancée une seconde fois avant d’être lue : l’accueil redit la coupure',
      !!premier && !!second && phraseIncident(second) === phraseIncident(premier)
        && phraseIncident(second) === 'La dernière partie s’est interrompue après 12 min — 180 Mo d’images, 64 unités',
      second ? phraseIncident(second) : 'aucune ligne');
    check('… et une troisième fois, le lendemain, sans la compter deux fois',
      !!accueil(T0 + 86_400_000) && lireTemoin(s).incidents.length === 1);
    check('une partie est lancée : l’accueil ne la redit plus', marquerIncidentsLus(s) === true && incidentNonLu(s) === null && accueil(T0 + 86_500_000) === null);
    check('… mais elle reste dans la liste, pour le menu de pause',
      lireTemoin(s).incidents.length === 1 && resumeIncident(lireTemoin(s).incidents[0]) === 'après 12 min — 180 Mo d’images, 64 unités');
    check('rien de neuf à marquer : aucune écriture de plus', marquerIncidentsLus(s) === false);
    // La partie lancée tient sa marque, puis se ferme proprement : toujours rien à redire.
    ecrireTemoin(etat(T0 + 86_600_000), s);
    fermerTemoin('accueil', null, s);
    check('partie suivante quittée normalement : toujours rien à l’accueil', accueil(T0 + 86_700_000) === null && lireTemoin(s).incidents.length === 1);
    // Une nouvelle coupure se dit à son tour, et tient elle aussi.
    ecrireTemoin(etat(T0 + 90_000_000, { unites: 7 }), s);
    const suivante = accueil(T0 + 90_050_000);
    check('une nouvelle coupure se dit à son tour, et tient au chargement suivant',
      !!suivante && suivante.unites === 7 && (accueil(T0 + 90_100_000) || {}).unites === 7 && lireTemoin(s).incidents.length === 2,
      JSON.stringify(lireTemoin(s).incidents.map((i) => [i.unites, !!i.lu])));
    // Un rechargement en pleine partie tient de la même façon.
    marquerIncidentsLus(s);
    ecrireTemoin(etat(T0 + 95_000_000), s);
    fermerTemoin('quittee', etat(T0 + 95_001_000, { min: 3, unites: 12, mo: 60 }), s);
    const recharge = [accueil(T0 + 95_004_000), accueil(T0 + 95_900_000)];
    check('un rechargement en pleine partie se redit lui aussi au chargement suivant',
      recharge.every((i) => i && phraseIncident(i) === 'La page a été rechargée en pleine partie, après 3 min — 60 Mo d’images, 12 unités'),
      recharge.map((i) => i && i.genre).join(', '));
    // Une liste rangée avant ce champ (sans « lu ») : son dernier incident se dit une fois, sans erreur.
    const ancien = fauxStockage();
    ancien.setItem(TEMOIN_KEY, '{"dernier":null,"incidents":[{"genre":"coupure","h":1,"min":2,"mo":5,"unites":3,"troupes":1,"dpr":2}]}');
    check('incident rangé sans le champ « lu » : dit à l’accueil, puis marqué',
      (incidentNonLu(ancien) || {}).mo === 5 && marquerIncidentsLus(ancien) === true && incidentNonLu(ancien) === null);
    // Stockage refusé ou plein : aucune erreur ; plein, la ligne reviendra simplement au chargement suivant.
    const refus = { getItem() { throw new Error('refusé'); }, setItem() { throw new Error('refusé'); }, removeItem() { throw new Error('refusé'); } };
    let erreur = null, rendus = null;
    try { rendus = [incidentNonLu(refus), marquerIncidentsLus(refus), incidentNonLu(null), marquerIncidentsLus(null)]; } catch (e) { erreur = e; }
    check('stockage refusé ou absent : rien à redire, rien ne casse',
      !erreur && rendus[0] === null && rendus[1] === false && rendus[2] === null && rendus[3] === false, erreur ? erreur.message : JSON.stringify(rendus));
    const plein = fauxStockage();
    ecrireTemoin(etat(T0), plein);
    releverTemoin(T0 + 2000, plein);
    plein.setItem = () => { throw new Error('quota'); };
    check('stockage plein au lancement d’une partie : pas d’erreur, la ligne reviendra', marquerIncidentsLus(plein) === false && !!incidentNonLu(plein));
    // Le câblage de js/main.js, qui ne se charge pas sous Node : c'est là qu'était le défaut.
    const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
    const lancer = main.slice(main.indexOf('function startGame('), main.indexOf('function setupStartScreen('));
    check('js/main.js : à l’accueil, la marque relevée ou, à défaut, le dernier incident non lu',
      /let incidentAccueil = releverTemoin\(\) \|\| incidentNonLu\(\);/.test(main));
    check('js/main.js : lancer une partie marque les incidents lus, avant de créer la partie',
      /marquerIncidentsLus\(\)[\s\S]*new Game\(/.test(lancer), lancer.slice(0, 80));
  }

  // Stockage refusé, plein ou abîmé : aucun effet, aucune erreur.
  {
    const refus = { getItem() { throw new Error('refusé'); }, setItem() { throw new Error('refusé'); }, removeItem() { throw new Error('refusé'); } };
    let erreur = null, rendus = null;
    try {
      rendus = [ecrireTemoin(etat(T0), refus), fermerTemoin('fin', etat(T0), refus), releverTemoin(T0, refus), lireTemoin(refus).incidents.length];
    } catch (e) { erreur = e; }
    check('stockage refusé : rien ne se passe, rien ne casse', !erreur && rendus[0] === false && rendus[1] === false && rendus[2] === null && rendus[3] === 0,
      erreur ? erreur.message : JSON.stringify(rendus));
    const plein = fauxStockage();
    plein.setItem = () => { throw new Error('quota'); };
    check('stockage plein : l’écriture échoue sans erreur', ecrireTemoin(etat(T0), plein) === false);
    check('sans stockage du tout (Node, navigation privée) : rien', ecrireTemoin(etat(T0), null) === false && releverTemoin(T0, null) === null && lireTemoin(null).dernier === null);
    for (const abime of ['{', '"texte"', '42', '{"dernier":7,"incidents":"non"}', '{"incidents":[null,3,{"genre":"coupure","min":2,"mo":5,"unites":3}]}']) {
      const s = fauxStockage();
      s.setItem(TEMOIN_KEY, abime);
      const lu = lireTemoin(s);
      check(`témoin abîmé (${abime.slice(0, 24)}) : relu sans erreur`, lu.dernier === null && Array.isArray(lu.incidents) && lu.incidents.every((i) => i && typeof i === 'object')
        && releverTemoin(T0, s) === null && ecrireTemoin(etat(T0), s) === true);
    }
    check('une marque aux chiffres abîmés donne un incident aux chiffres nuls, pas « undefined »',
      phraseIncident(incidentDe({ visible: true, h: 'x', mo: null }, T0)) === 'La dernière partie s’est interrompue après moins d’une minute — 0 Mo d’images, 0 unité');
  }
}

// ---------------------------------------------------------------------------
// Le plafond de mémoire : qui sort, qui reste.
// ---------------------------------------------------------------------------
console.log('\n--- Plafond de mémoire des troupes ---');
const sprites = await import('../js/sprites.js');
{
  const { troupesADecharger, BUDGET_TROUPES_MO } = sprites;
  const MO = 1048576;
  const t = (cle, mo, vu, relisible = true) => ({ cle, octets: mo * MO, vu, relisible });
  const maintenant = 1000;
  check('le budget proposé : 120 Mo', BUDGET_TROUPES_MO === 120);
  check('sous le budget, rien ne sort, même inutile depuis longtemps',
    troupesADecharger([t('a', 50, 0), t('b', 60, 0)], maintenant, 120 * MO).length === 0);
  check('au-delà, une troupe en jeu ne sort jamais',
    troupesADecharger([t('a', 80, maintenant), t('b', 80, maintenant - 1)], maintenant, 120 * MO).length === 0);
  check('ni une troupe sans unité depuis moins de deux minutes',
    troupesADecharger([t('a', 80, maintenant), t('b', 80, maintenant - 119)], maintenant, 120 * MO).length === 0);
  check('sans unité depuis deux minutes : elle sort',
    troupesADecharger([t('a', 80, maintenant), t('b', 80, maintenant - 120)], maintenant, 120 * MO).join() === 'b');
  check('une troupe qui ne reviendrait pas du cache reste (cuisson allégée, cache indisponible)',
    troupesADecharger([t('a', 80, maintenant), t('b', 80, 0, false)], maintenant, 120 * MO).length === 0);
  const sorties = troupesADecharger(
    [t('recente', 40, maintenant - 130), t('enJeu', 60, maintenant), t('ancienne', 40, maintenant - 900), t('moyenne', 40, maintenant - 400)],
    maintenant, 120 * MO);
  check('les plus anciennement inutiles d’abord, et pas une de plus qu’il n’en faut', sorties.join() === 'ancienne,moyenne', sorties.join());
  check('tout ce qui peut sortir sort si le budget reste dépassé',
    troupesADecharger([t('enJeu', 200, maintenant), t('x', 10, 0), t('y', 10, 5)], maintenant, 120 * MO).join() === 'x,y');
  check('le délai se règle', troupesADecharger([t('a', 80, maintenant), t('b', 80, maintenant - 30)], maintenant, 120 * MO, 30).join() === 'b');
}

// ---------------------------------------------------------------------------
// La même chose de bout en bout, avec de fausses toiles : une troupe « cuite »
// (relue d'un faux cache), sa copie pour l'autre camp, puis le ménage.
// ---------------------------------------------------------------------------
console.log('\n--- Ménage de bout en bout (fausses toiles) ---');
{
  const toiles = [];
  const fausseToile = () => {
    const ctx = {
      imageSmoothingEnabled: true,
      drawImage() {}, putImageData() {},
      getImageData: () => ({ data: new Uint8ClampedArray(0) }),
    };
    const toile = { width: 0, height: 0, getContext: () => ctx };
    toiles.push(toile);
    return toile;
  };
  const requetes = [];
  const evenements = [];
  // Cinq atlas de 4000 × 2000 : 30,5 Mo pièce, soit 152,6 Mo par troupe — au-dessus du budget à elle seule.
  const CLIPS = ['marche', 'repos', 'attaque', 'touche', 'mort'];
  const meta = () => ({
    cycle: 40,
    clips: Object.fromEntries(CLIPS.map((etat) => [etat, {
      cellW: 800, cellH: 125, ancreY: 100, hauteurMonde: 62.5, images: 16, directions: 5,
      colonnes: [0, 1, 2, 3, 4].map((k) => ({ x: k * 800, l: 800, ancre: 400 })), duree: 1, boucle: etat === 'marche' || etat === 'repos',
    }])),
  });
  const reponse = (corps) => ({ ok: true, status: 200, headers: new Headers({ etag: '"v1"' }), ...corps });
  globalThis.location = { href: 'http://jeu.test/index.html' };
  globalThis.document = { createElement: () => fausseToile() };
  globalThis.Image = class { set src(v) { /* jamais chargée : les troupes de l'essai n'ont pas de dessin de repli */ } };
  globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
  globalThis.window = { dispatchEvent: (ev) => { evenements.push(ev); return true; } };
  globalThis.createImageBitmap = async () => ({ width: 4000, height: 2000, close() {} });
  globalThis.fetch = async (src, options = {}) => {
    requetes.push(`${options.method || 'GET'} ${src}`);
    return reponse({ arrayBuffer: async () => new TextEncoder().encode(`modele ${src} `.repeat(8)).buffer });
  };
  // Un cache qui a tout : chaque cuisson demandée y est déjà rangée.
  globalThis.caches = {
    open: async () => ({
      match: async (cle) => (String(cle).includes('&clip=') ? { blob: async () => ({}) } : { json: async () => meta() }),
      put: async () => {}, keys: async () => [], delete: async () => true,
    }),
  };
  const attendre = async (pret, tours = 200) => { for (let i = 0; i < tours && !pret(); i++) await new Promise((r) => setTimeout(r, 0)); return pret(); };
  const { spriteDe, memoireTroupes, entretenirMemoire, rendreVariantes, imagePourJoueur } = sprites;
  const MO_TROUPE = (5 * 4000 * 2000 * 4) / 1048576;
  const mo = () => Math.round(memoireTroupes().mo * 10) / 10;

  check('rien en mémoire avant la première troupe', memoireTroupes().troupes === 0 && memoireTroupes().octets === 0);
  entretenirMemoire(10, [['knight', 'atlante']]);
  check('le ménage ne fait rien cuire : une troupe jamais vue attend son premier dessin', requetes.length === 0 && memoireTroupes().troupes === 0);
  check('au premier dessin elle est demandée ; en attendant, pas d’image', spriteDe('knight', 'atlante') === null);
  await attendre(() => spriteDe('knight', 'atlante'));
  check('son modèle n’est lu qu’une fois', requetes.join() === 'GET assets/modeles/cavalier.json', requetes.join(', '));
  const cavalier = spriteDe('knight', 'atlante');
  check('une troupe relue du cache est prête, et comptée', !!cavalier && cavalier.def.cuit3d && memoireTroupes().troupes === 1 && Math.abs(memoireTroupes().mo - MO_TROUPE) < 0.01,
    `${mo()} Mo`);
  const origine = cavalier.def.clips.marche.canvas;
  check('le camp d’origine dessine l’atlas lui-même', imagePourJoueur(cavalier, 0) === origine);
  const rouge = imagePourJoueur(cavalier, 1);
  check('la copie de l’autre camp se fabrique au premier dessin, et pèse', rouge !== origine && rouge.width === 4000 && Math.abs(memoireTroupes().mo - MO_TROUPE * 1.2) < 0.01,
    `${mo()} Mo`);

  // (a) La copie de l'autre camp : rendue après trente secondes sans dessin.
  entretenirMemoire(20, [['knight', 'atlante']]);
  imagePourJoueur(cavalier, 1);                       // dessinée à la seconde 20
  entretenirMemoire(49, [['knight', 'atlante']]);
  check('dessinée il y a moins de trente secondes : la copie reste', rouge.width === 4000 && imagePourJoueur(cavalier, 1) === rouge);
  entretenirMemoire(60, [['knight', 'atlante']]);     // dessinée pour la dernière fois à la seconde 49
  check('… onze secondes plus tard aussi', rouge.width === 4000);
  entretenirMemoire(79.5, [['knight', 'atlante']]);
  check('sans dessin depuis trente secondes : la copie est rendue, la toile d’origine jamais',
    rouge.width === 0 && rouge.height === 0 && origine.width === 4000 && Math.abs(memoireTroupes().mo - MO_TROUPE) < 0.01, `${mo()} Mo`);
  const refaite = imagePourJoueur(cavalier, 1);
  check('elle se refait toute seule au dessin suivant', refaite !== rouge && refaite !== origine && refaite.width === 4000);
  rendreVariantes();
  check('page masquée, partie quittée : toutes les copies sont rendues d’un coup', refaite.width === 0 && origine.width === 4000);

  // (b) Le budget : une seconde troupe, puis plus aucune unité de la première.
  spriteDe('hydra', 'atlante');
  await attendre(() => spriteDe('hydra', 'atlante'));
  const hydre = spriteDe('hydra', 'atlante');
  const toilesHydre = Object.values(hydre.def.clips).map((c) => c.canvas);
  const copieHydre = imagePourJoueur(hydre, 1);
  check('deux troupes : le double en mémoire, bien au-dessus du budget', memoireTroupes().troupes === 2 && memoireTroupes().mo > 300, `${mo()} Mo`);
  entretenirMemoire(100, [['knight', 'atlante'], ['hydra', 'atlante']]);
  check('tant que leurs unités sont en jeu, rien ne sort — même au-dessus du budget', memoireTroupes().troupes === 2);
  entretenirMemoire(215, [['knight', 'atlante']]);
  check('plus d’Hydre depuis moins de deux minutes : elle reste', memoireTroupes().troupes === 2 && toilesHydre.every((c) => c.width === 4000));
  const avant = evenements.length;
  entretenirMemoire(221, [['knight', 'atlante']]);
  check('plus d’Hydre depuis deux minutes : elle est déchargée, toiles vidées, copie comprise',
    memoireTroupes().troupes === 1 && toilesHydre.every((c) => c.width === 0 && c.height === 0) && copieHydre.width === 0, `${mo()} Mo`);
  check('la troupe en jeu, elle, garde toutes ses toiles', Object.values(cavalier.def.clips).every((c) => c.canvas.width === 4000) && spriteDe('knight', 'atlante') === cavalier);
  // Ouvrier et milicien atlantes servent de repli : jamais déchargés, même sans unité.
  spriteDe('villager', 'atlante'); sprites.setStyleUnites('3d');
  await attendre(() => { const s = spriteDe('villager', 'atlante'); return s && s.def.cuit3d; });
  entretenirMemoire(230, [['knight', 'atlante']]);
  entretenirMemoire(900, [['knight', 'atlante']]);
  check('l’ouvrier et le milicien atlantes, cuits au lancement, ne sont jamais déchargés',
    !!spriteDe('villager', 'atlante').def.cuit3d && !!spriteDe('militia', 'atlante').def.cuit3d, `${memoireTroupes().troupes} troupes`);

  // Le retour : une Hydre en formation suffit à la faire relire, sans rien annoncer au joueur.
  const troupesAvant = memoireTroupes().troupes;
  entretenirMemoire(901, [['knight', 'atlante'], ['hydra', 'atlante'], ['wheelbarrow', 'atlante']]);   // (une technologie en file : ignorée)
  await attendre(() => memoireTroupes().troupes === troupesAvant + 1);
  check('une Hydre en formation : la troupe est relue sans attendre son premier dessin', memoireTroupes().troupes === troupesAvant + 1);
  const revenue = spriteDe('hydra', 'atlante');
  check('elle revient du cache, prête, avec des toiles neuves', !!revenue && revenue !== hydre && Object.values(revenue.def.clips).every((c) => c.canvas.width === 4000));
  const annonces = evenements.slice(avant);
  check('son retour est signalé comme tel (pas d’annonce « prêts » au joueur)',
    annonces.length >= 1 && annonces[annonces.length - 1].detail && annonces[annonces.length - 1].detail.retour === true,
    JSON.stringify(annonces.map((e) => e.detail)));
  check('la première venue d’une troupe, elle, s’annonce', evenements[0].detail.retour === false);
  entretenirMemoire(902, [['knight', 'atlante'], ['hydra', 'atlante']]);
  entretenirMemoire(1100, [['knight', 'atlante'], ['hydra', 'atlante']]);
  check('revenue et de nouveau en jeu, elle n’est plus déchargée', spriteDe('hydra', 'atlante') === revenue && revenue.def.clips.marche.canvas.width === 4000);

  // Un budget large : plus rien ne sort.
  entretenirMemoire(2000, [], 4000);
  check('sous un budget large, aucune troupe ne sort, même sans unité', !!spriteDe('hydra', 'atlante') && !!spriteDe('knight', 'atlante'));
  // Les Solariens : leurs troupes aussi se déchargent et reviennent.
  spriteDe('spearman', 'solarien');
  await attendre(() => { const s = spriteDe('spearman', 'solarien'); return s && s.def.src && s.def.src.includes('sol-lancier'); });
  const lancierSol = spriteDe('spearman', 'solarien');
  check('une troupe solarienne est cuite sous sa propre clé', !!lancierSol && lancierSol.def.src.includes('sol-lancier'));
  entretenirMemoire(2010, [['spearman', 'solarien'], ['knight', 'atlante'], ['hydra', 'atlante']]);
  entretenirMemoire(2200, [['knight', 'atlante'], ['hydra', 'atlante']]);
  check('sans lancier solarien depuis deux minutes : déchargé à son tour', lancierSol.def.clips.marche.canvas.width === 0);
}

// ---------------------------------------------------------------------------
// L'empreinte retenue : le modèle n'est plus relu à chaque lancement.
// (Chaque « lancement » est une instance neuve du module, le stockage local reste.)
// ---------------------------------------------------------------------------
console.log('\n--- Empreinte des modèles retenue d’un lancement à l’autre ---');
{
  const { marqueFichier } = await import('../js/modele3d.js');
  check('la marque d’un fichier : son ETag (faible ou fort, c’est le même) et sa date',
    marqueFichier(new Headers({ etag: 'W/"abc"', 'last-modified': 'hier' })) === marqueFichier(new Headers({ etag: '"abc"', 'last-modified': 'hier' }))
    && marqueFichier(new Headers({ etag: '"abc"' })) !== marqueFichier(new Headers({ etag: '"abd"' }))
    && marqueFichier(new Headers({ 'last-modified': 'hier' })) !== '' && marqueFichier(new Headers({ 'content-length': '12' })) === '');

  const SRC = 'assets/modeles/cavalier.json';
  const stockage = fauxStockage();
  globalThis.localStorage = stockage;
  let serveur = { etag: '"v1"', corps: 'modele un '.repeat(40), entetes: true, head: 'ok' };
  let requetes = [], cles = [], cacheVide = false;
  globalThis.fetch = (src, options = {}) => {
    const methode = options.method || 'GET';
    requetes.push(methode);
    const entetes = new Headers(serveur.entetes ? { etag: serveur.etag, 'last-modified': 'Sun, 04 Oct 2026 10:00:00 GMT' } : {});
    if (methode === 'HEAD') {
      if (serveur.head === 'panne') return Promise.reject(new TypeError('hors ligne'));
      // (Un réseau à la peine : la réponse ne vient jamais ; seul l'abandon de la demande y met fin.)
      if (serveur.head === 'muet') return new Promise((_, echec) => options.signal.addEventListener('abort', () => echec(new Error('abandon'))));
      return Promise.resolve({ ok: serveur.head === 'ok', status: serveur.head === 'ok' ? 200 : 405, headers: entetes });
    }
    return Promise.resolve({ ok: true, status: 200, headers: entetes, arrayBuffer: async () => new TextEncoder().encode(serveur.corps).buffer });
  };
  globalThis.caches = {
    open: async () => ({
      match: async (cle) => {
        if (String(cle).includes('&clip=')) return { blob: async () => ({}) };
        cles.push(String(cle));
        return cacheVide ? undefined : { json: async () => ({ cycle: 40, clips: {} }) };
      },
      put: async () => {}, keys: async () => [], delete: async () => true,
    }),
  };
  let n = 0;
  const lancement = async () => (await import(`../js/modele3d.js?lancement=${++n}`)).modeleCuit;
  const essai = async (modeleCuit) => { requetes = []; cles = []; return modeleCuit('knight', 32, null); };

  let modeleCuit = await lancement();
  let cuit = await essai(modeleCuit);
  const cle1 = cles[0];
  check('premier lancement : le modèle est lu une fois, son empreinte retenue', requetes.join() === 'GET' && cuit.enCache === true
    && JSON.parse(stockage.getItem('aem.empreintes.v1'))[SRC].empreinte.length > 0, requetes.join());
  await essai(modeleCuit);
  check('même page (une troupe déchargée qui revient) : plus aucune requête, même clé de cache', requetes.length === 0 && cles[0] === cle1, requetes.join());

  modeleCuit = await lancement();
  cuit = await essai(modeleCuit);
  check('lancement suivant, fichier inchangé : les en-têtes seulement, pas le fichier', requetes.join() === 'HEAD' && cles[0] === cle1 && cuit.enCache === true, requetes.join());

  serveur = { ...serveur, etag: '"v2"', corps: 'modele deux '.repeat(40) };
  modeleCuit = await lancement();
  await essai(modeleCuit);
  const cle2 = cles[0];
  check('fichier changé sur le serveur : il est relu, et la clé de cache change', requetes.join() === 'HEAD,GET' && cle2 !== cle1, requetes.join());
  modeleCuit = await lancement();
  await essai(modeleCuit);
  check('… puis de nouveau les en-têtes seulement, sous la nouvelle clé', requetes.join() === 'HEAD' && cles[0] === cle2, requetes.join());

  for (const [panne, libelle] of [['panne', 'hors ligne'], ['refus', 'demande d’en-têtes refusée par le serveur']]) {
    serveur = { ...serveur, head: panne };
    modeleCuit = await lancement();
    await essai(modeleCuit);
    check(`${libelle} : on relit le fichier, comme avant`, requetes.join() === 'HEAD,GET' && cles[0] === cle2, requetes.join());
  }
  serveur = { ...serveur, head: 'muet' };
  modeleCuit = await lancement();
  const debut = Date.now();
  await essai(modeleCuit);
  check('réseau à la peine : deux secondes d’attente au plus, puis le fichier', requetes.join() === 'HEAD,GET' && cles[0] === cle2 && Date.now() - debut < 3500,
    `${Date.now() - debut} ms`);

  serveur = { ...serveur, head: 'ok', entetes: false };
  modeleCuit = await lancement();
  await essai(modeleCuit);
  check('un serveur qui ne dit plus rien du fichier : relu, et plus rien n’est retenu',
    requetes.join() === 'HEAD,GET' && JSON.parse(stockage.getItem('aem.empreintes.v1'))[SRC] === undefined, requetes.join());
  modeleCuit = await lancement();
  await essai(modeleCuit);
  check('… donc relu à chaque lancement, sans demande inutile', requetes.join() === 'GET', requetes.join());

  globalThis.localStorage = { getItem() { throw new Error('refusé'); }, setItem() { throw new Error('refusé'); } };
  serveur = { ...serveur, entetes: true };
  modeleCuit = await lancement();
  cuit = await essai(modeleCuit).catch((e) => e);
  check('stockage refusé : le fichier est lu, rien ne casse', requetes.join() === 'GET' && cuit.enCache === true, requetes.join());

  // Empreinte retenue, mais atlas absents du cache : il faut le fichier pour cuire (la cuisson, elle, n'existe pas sous Node).
  globalThis.localStorage = stockage;
  await essai(await lancement());          // retient l'empreinte
  cacheVide = true;
  const avertir = console.warn; console.warn = () => {};
  modeleCuit = await lancement();
  const issue = await essai(modeleCuit).then(() => 'cuit', () => 'cuisson impossible');
  console.warn = avertir;
  check('empreinte retenue mais atlas absents du cache : le fichier est relu pour cuire', requetes.join() === 'HEAD,GET' && issue === 'cuisson impossible', `${requetes.join()} → ${issue}`);
}

console.log(`\n${failures === 0 ? '✅ Tous les tests passent' : `❌ ${failures} test(s) en échec`}`);
process.exit(failures === 0 ? 0 : 1);
