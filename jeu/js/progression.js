// ---------------------------------------------------------------------------
// Moteur de progression : classement, ligues, coffres, fragments et niveaux
// des troupes ; boutique ; collections, blason et saisons.
//
// Rien que des fonctions PURES sur un objet « profil » ordinaire (du JSON) :
// aucun accès au stockage, à l'horloge ni à Math.random. Le hasard (`alea`),
// la date (`jour`, « AAAA-MM-JJ ») et l'heure (`maintenant`, en secondes) sont
// passés en argument. Le même fichier peut donc tourner tel quel sur un
// serveur qui fait foi, et un tirage se rejoue à l'identique avec sa graine.
//
// Aucune fonction ne modifie le profil qu'on lui donne : elle en rend un
// nouveau, avec ses « événements » — tout ce que l'écran devra montrer, dans
// l'ordre où cela s'est produit. Une demande refusée rend `{ erreur }`.
//
// Les valeurs d'équilibrage sont toutes dans js/progression-config.js.
// ---------------------------------------------------------------------------

import { PROGRESSION as R } from './progression-config.js';
import { COLLECTIONS, PIECES, GENRES, BLASON_DE_DEPART, collection as collectionDuJeu, pieceDe, composerTitre } from './collections-config.js';

export const VERSION_PROFIL = R.profil.version;

// --- Petits outils -------------------------------------------------------------

const GRAND = Number.MAX_SAFE_INTEGER;
const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const possede = (objet, cle) => Object.prototype.hasOwnProperty.call(objet, cle);
const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);

/** Un entier entre deux bornes ; `defaut` pour tout ce qui n'est pas un nombre fini. */
function entier(v, min, max, defaut) {
  if (!estNombre(v)) return defaut;
  const n = Math.floor(v);
  return n < min ? min : n > max ? max : n;
}

/** Copie d'une donnée ordinaire (nombres, textes, tableaux, objets), sans rien partager avec l'originale. */
function copier(v) {
  if (Array.isArray(v)) return v.map(copier);
  if (!estObjet(v)) return v;
  const copie = {};
  for (const cle of Object.keys(v)) copie[cle] = copier(v[cle]);
  return copie;
}

/**
 * Copie de ce qui survit à un aller-retour JSON, et rien d'autre : pas de
 * fonction, pas de nombre infini, pas d'objet sans fond. Sert à reprendre le
 * journal d'un profil dont on ne sait rien.
 */
function copieSure(v, profondeur = 4) {
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.length > 64 ? v.slice(0, 64) : v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'object' || profondeur <= 0) return null;
  if (Array.isArray(v)) return v.slice(0, 64).map((x) => copieSure(x, profondeur - 1));
  const copie = {};
  for (const cle of Object.keys(v)) {
    if (v[cle] !== undefined && typeof v[cle] !== 'function') copie[cle] = copieSure(v[cle], profondeur - 1);
  }
  return copie;
}

// --- Ce que les réglages disent, relevé une fois --------------------------------

const NB_LIGUES = R.ligues.length;
/** Les troupes qui existent dans le jeu : celles d'un profil. Une troupe « à venir » n'y figure pas. */
const EXISTANTES = Object.keys(R.troupes).filter((type) => !R.troupes[type].aVenir);
const DE_BASE = EXISTANTES.filter((type) => !R.troupes[type].gratuite);
const AVANCEES = EXISTANTES.filter((type) => R.troupes[type].gratuite);
/** Parmi elles, celles que l'ordinateur ne forme que si la partie les lui donne (voir reglagesDePartie). */
const EN_PLUS = AVANCEES.filter((type) => R.troupes[type].enPlus);
const ORIGINES = ['ligue', 'parties', 'achat'];   // d'une troupe avancée ; une troupe de base est « base »
const ORIGINES_DE_COFFRE = ['victoire', 'defaite', 'egalite', 'promotion', 'semaine', 'saison', 'route', 'bataille', 'autre'];
const ISSUES = ['victoire', 'defaite', 'egalite', 'abandon', 'abandonAdverse', 'annulee'];
const COMPTEURS = { victoire: 'victoires', defaite: 'defaites', egalite: 'egalites' };

const existe = (type) => typeof type === 'string' && possede(R.troupes, type) && !R.troupes[type].aVenir;
const ligueValide = (ligue) => entier(ligue, 1, NB_LIGUES, 1);

// Les collections (js/collections-config.js), relevées une fois.
const existePiece = (id) => typeof id === 'string' && possede(PIECES, id);
/** Ce que tout profil possède d'office. */
const PIECES_DE_DEPART = COLLECTIONS.filter((c) => c.source === 'depart').flatMap((c) => c.pieces);
/** Les autocollants que les coffres donnent, par rareté : ceux des collections « coffres ». */
const RESERVE = {};
for (const rarete of R.categories) RESERVE[rarete] = [];
for (const c of COLLECTIONS) {
  if (c.source === 'coffres') for (const id of c.emblemes) RESERVE[PIECES[id].rarete].push(id);
}
const DANS_LES_COFFRES = R.categories.flatMap((rarete) => RESERVE[rarete]);
/** Les deux voies de la route d'une saison. */
const VOIES = ['gratuit', 'passe'];
/** Les pièces du blason dont on peut se passer. */
const FACULTATIVES = ['embleme', 'epithete', 'teinture'];
/** Les pièces vendues une à une, en Éclats, à prix fixe : celles des collections « atelier ». */
const DE_L_ATELIER = COLLECTIONS.filter((c) => c.source === 'atelier').flatMap((c) => c.pieces);

// --- Dates ---------------------------------------------------------------------

const FORME_DU_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Le rang d'un jour « AAAA-MM-JJ » : nombre de jours depuis le 1er janvier
 * 1970 (calendrier grégorien, calcul en entiers), ou null si ce n'en est pas un.
 */
function rangDuJour(jour) {
  const m = typeof jour === 'string' ? FORME_DU_JOUR.exec(jour) : null;
  if (!m) return null;
  const mois = Number(m[2]), quantieme = Number(m[3]);
  if (mois < 1 || mois > 12 || quantieme < 1 || quantieme > 31) return null;
  // L'année commence en mars : le jour bissextile tombe à la fin.
  const annee = Number(m[1]) - (mois <= 2 ? 1 : 0);
  const ere = Math.floor(annee / 400);
  const anDeLEre = annee - ere * 400;
  const jourDeLAn = Math.floor((153 * (mois + (mois > 2 ? -3 : 9)) + 2) / 5) + quantieme - 1;
  const jourDeLEre = anDeLEre * 365 + Math.floor(anDeLEre / 4) - Math.floor(anDeLEre / 100) + jourDeLAn;
  return ere * 146097 + jourDeLEre - 719468;
}

/** Le numéro de la semaine d'un jour « AAAA-MM-JJ », ou null s'il n'est pas lisible : celui que porte `profil.semaine.numero`. */
export function semaineDuJour(jour) { return rangDuJour(jour) === null ? null : semaineDe(jour); }

/** Le numéro de la semaine d'un jour valide. */
function semaineDe(jour) {
  const s = R.sources.or;
  return Math.floor((rangDuJour(jour) + s.decalage) / s.joursParSemaine);
}

// --- Profil --------------------------------------------------------------------

/**
 * Le profil d'un joueur qui n'a encore rien fait. Ce n'est que des nombres,
 * des textes, des tableaux et des objets : il se range en JSON tel quel.
 *
 *   elo, ligue      : le score, et la ligue où l'on se trouve — elle ne se
 *                     déduit pas du score seul, puisqu'on ne redescend qu'avec
 *                     une marge (voir appliquerResultat)
 *   plusHauteLigue  : la plus haute atteinte, gardée au profil
 *   promotions      : les ligues dont la récompense a déjà été donnée
 *   parties…        : compteurs bruts ; un abandon compte comme une défaite,
 *                     une partie annulée ne compte pas
 *   abandonsPrecoces: parmi les défaites, celles d'avant abandon.precoceAvant
 *                     (abandon, ou bâtiment principal rasé de sa propre main) :
 *                     elles coûtent leurs points mais ne font avancer ni vers
 *                     une troupe, ni vers un coffre
 *   comptees        : identifiants des dernières parties comptées — la même
 *                     partie, reprise ailleurs, ne se compte pas deux fois
 *   coffres         : ceux qui attendent d'être ouverts, `{ type, origine }`
 *   troupes         : niveau et fragments de chaque troupe du jeu
 *   debloquees      : type → d'où vient la troupe (base, ligue, parties, achat)
 *   eclats          : la monnaie gratuite — donnée par les coffres et par les
 *                     autocollants en double ; elle n'achète que de l'apparence
 *   couronnes       : la monnaie payante (voir « Boutique », plus bas)
 *   pieces          : les pièces de collection possédées (leurs identifiants)
 *   blason          : celles que l'on porte — `embleme`, `epithete` et
 *                     `teinture` (la matière de ses troupes) peuvent manquer
 *                     (null), `cadre`, `banniere` et `grade` jamais
 *   route           : la route de la saison en cours — ses `points`, le Passe
 *                     (`passe`), les paliers déjà pris sur chaque voie (`pris`)
 *   selection       : les autocollants du jour déjà achetés à prix réduit — le
 *                     `jour` où on les a pris, et combien (`achats`)
 *   boutique        : ses offres en cours — `offreLigue` (une troupe à prix
 *                     réduit jusqu'à une heure, en secondes), `bienvenueJusqua`
 *                     (fin de l'offre de bienvenue ; 0 tant qu'elle n'est pas
 *                     ouverte), `bienvenuePrise`, et les `transactions` du
 *                     magasin d'applications déjà livrées (leurs numéros)
 *   saison, saisons : le numéro de la saison en cours, ce que furent les précédentes
 *   jour, semaine   : compteurs remis à zéro quand la date change
 *   rechercheFermeeJusqua : heure (en secondes) jusqu'à laquelle la recherche
 *                     d'adversaire est fermée ; 0 si elle est ouverte
 *   operations, journal : nombre d'opérations faites, et les dernières
 */
/** La route d'une saison qui commence. */
function routeNeuve() {
  return { points: 0, passe: false, pris: { gratuit: [], passe: [] } };
}

export function profilNeuf() {
  const troupes = {};
  const debloquees = {};
  for (const type of EXISTANTES) troupes[type] = { niveau: 1, fragments: 0 };
  for (const type of DE_BASE) debloquees[type] = 'base';
  return {
    version: VERSION_PROFIL,
    elo: R.elo.depart,
    ligue: 1,
    plusHauteLigue: 1,
    promotions: [],
    parties: 0, victoires: 0, defaites: 0, egalites: 0, abandonsPrecoces: 0,
    comptees: [],
    coffres: [],
    troupes,
    debloquees,
    eclats: 0,
    couronnes: 0,
    boutique: { offreLigue: null, bienvenueJusqua: 0, bienvenuePrise: false, transactions: [] },
    pieces: [...PIECES_DE_DEPART],
    blason: { ...BLASON_DE_DEPART },
    route: routeNeuve(),
    selection: { jour: '', achats: 0 },
    saison: 1,
    saisons: [],
    jour: { date: '', parties: 0, abandonsPrecoces: 0, victoires: 0 },
    semaine: { numero: 0, jours: 0, coffre: false },
    rechercheFermeeJusqua: 0,
    operations: 0,
    journal: [],
  };
}

/** Reprend un à un les champs connus ; tout ce qui manque ou ne tient pas debout garde sa valeur de départ. */
function lireProfil(o) {
  const p = profilNeuf();
  if (!estObjet(o)) return p;
  // (Une version inconnue — plus récente, ou absente — se lit du mieux possible :
  // mieux vaut reprendre ce que l'on comprend que tout effacer. Le jour où le
  // format change, les conversions d'une version à la suivante viennent ici.)
  p.elo = entier(o.elo, R.elo.plancher, GRAND, p.elo);
  p.ligue = ligueValide(o.ligue);
  p.plusHauteLigue = Math.max(p.ligue, ligueValide(o.plusHauteLigue));
  if (Array.isArray(o.promotions)) {
    for (const ligue of R.ligues) {
      if (ligue.promotion && o.promotions.includes(ligue.numero)) p.promotions.push(ligue.numero);
    }
  }
  p.victoires = entier(o.victoires, 0, GRAND, 0);
  p.defaites = entier(o.defaites, 0, GRAND, 0);
  p.egalites = entier(o.egalites, 0, GRAND, 0);
  p.parties = Math.max(entier(o.parties, 0, GRAND, 0), p.victoires + p.defaites + p.egalites);
  p.abandonsPrecoces = entier(o.abandonsPrecoces, 0, p.defaites, 0);
  if (Array.isArray(o.comptees)) {
    p.comptees = o.comptees.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 64).slice(-R.profil.comptees);
  }
  if (Array.isArray(o.coffres)) {
    for (const coffre of o.coffres) {
      if (!estObjet(coffre) || typeof coffre.type !== 'string' || !possede(R.coffres, coffre.type)) continue;
      p.coffres.push({ type: coffre.type, origine: ORIGINES_DE_COFFRE.includes(coffre.origine) ? coffre.origine : 'autre' });
    }
  }
  if (estObjet(o.troupes)) {
    for (const type of EXISTANTES) {
      const lue = possede(o.troupes, type) ? o.troupes[type] : null;
      if (!estObjet(lue)) continue;
      p.troupes[type].niveau = entier(lue.niveau, 1, R.niveauMax, 1);
      p.troupes[type].fragments = entier(lue.fragments, 0, GRAND, 0);
    }
  }
  if (estObjet(o.debloquees)) {
    for (const type of AVANCEES) {
      const origine = possede(o.debloquees, type) ? o.debloquees[type] : null;
      if (ORIGINES.includes(origine)) p.debloquees[type] = origine;
    }
  }
  p.eclats = entier(o.eclats, 0, GRAND, 0);
  p.couronnes = entier(o.couronnes, 0, GRAND, 0);
  if (estObjet(o.boutique)) {
    const offre = o.boutique.offreLigue;
    // (Une offre sur une troupe déjà débloquée, ou sans fin lisible, n'en est plus une.)
    if (estObjet(offre) && AVANCEES.includes(offre.troupe) && !p.debloquees[offre.troupe] && estNombre(offre.jusqua) && offre.jusqua > 0) {
      p.boutique.offreLigue = { troupe: offre.troupe, jusqua: offre.jusqua };
    }
    p.boutique.bienvenueJusqua = estNombre(o.boutique.bienvenueJusqua) && o.boutique.bienvenueJusqua > 0 ? o.boutique.bienvenueJusqua : 0;
    p.boutique.bienvenuePrise = o.boutique.bienvenuePrise === true;
    if (Array.isArray(o.boutique.transactions)) p.boutique.transactions = [...new Set(o.boutique.transactions.filter(transactionLisible))].slice(-R.boutique.transactions);
  }
  if (Array.isArray(o.pieces)) {
    for (const id of o.pieces) {
      if (existePiece(id) && !p.pieces.includes(id)) p.pieces.push(id);
    }
  }
  if (estObjet(o.blason)) {
    for (const genre of GENRES) {
      const id = o.blason[genre];
      if (id === null && FACULTATIVES.includes(genre)) p.blason[genre] = null;
      else if (existePiece(id) && PIECES[id].genre === genre && p.pieces.includes(id)) p.blason[genre] = id;
    }
  }
  if (estObjet(o.route)) {
    p.route.points = entier(o.route.points, 0, R.saisons.paliers * R.saisons.pointsParPalier, 0);
    p.route.passe = o.route.passe === true;
    for (const voie of VOIES) {
      const pris = estObjet(o.route.pris) ? o.route.pris[voie] : null;
      if (!Array.isArray(pris)) continue;
      for (let palier = 1; palier <= R.saisons.paliers; palier++) {
        if (pris.includes(palier)) p.route.pris[voie].push(palier);
      }
    }
  }
  if (estObjet(o.selection) && rangDuJour(o.selection.jour) !== null) {
    p.selection = { jour: o.selection.jour, achats: entier(o.selection.achats, 0, R.collections.eclats.selection.nombre, 0) };
  }
  p.saison = entier(o.saison, 1, GRAND, 1);
  if (Array.isArray(o.saisons)) {
    for (const s of o.saisons.slice(-R.profil.saisons)) {
      if (!estObjet(s)) continue;
      p.saisons.push({ numero: entier(s.numero, 1, GRAND, 1), ligue: ligueValide(s.ligue), elo: entier(s.elo, 0, GRAND, 0) });
    }
  }
  if (estObjet(o.jour)) {
    p.jour.date = rangDuJour(o.jour.date) === null ? '' : o.jour.date;
    p.jour.parties = entier(o.jour.parties, 0, GRAND, 0);
    p.jour.abandonsPrecoces = entier(o.jour.abandonsPrecoces, 0, GRAND, 0);
    p.jour.victoires = entier(o.jour.victoires, 0, GRAND, 0);
  }
  if (estObjet(o.semaine)) {
    p.semaine.numero = entier(o.semaine.numero, -GRAND, GRAND, 0);
    p.semaine.jours = entier(o.semaine.jours, 0, R.sources.or.joursParSemaine, 0);
    p.semaine.coffre = o.semaine.coffre === true;
  }
  p.rechercheFermeeJusqua = estNombre(o.rechercheFermeeJusqua) && o.rechercheFermeeJusqua > 0 ? o.rechercheFermeeJusqua : 0;
  p.operations = entier(o.operations, 0, GRAND, 0);
  if (Array.isArray(o.journal)) {
    for (const entree of o.journal.slice(-R.profil.journal)) {
      if (estObjet(entree)) p.journal.push(copieSure(entree));
    }
  }
  return p;
}

/**
 * Rend un profil valide à partir de n'importe quoi : sauvegarde abîmée,
 * version inconnue, champs manquants, valeur qui n'est même pas un objet. Ne
 * lève jamais d'erreur et ne touche pas à ce qu'on lui donne. Un profil déjà
 * valide en ressort identique : c'est aussi la copie de travail du moteur.
 *
 * Ne fait que remettre d'aplomb : aucune promotion, aucun déblocage ici, car
 * ils ont des événements à montrer (voir regulariser).
 */
export function migrerProfil(objet) {
  try {
    return lireProfil(objet);
  } catch {
    return profilNeuf();   // un objet dont la lecture même échoue
  }
}

/** Ajoute une opération au journal, qui ne garde que les dernières. */
function noter(p, entree) {
  p.operations++;
  p.journal.push({ numero: p.operations, ...entree });
  if (p.journal.length > R.profil.journal) p.journal.splice(0, p.journal.length - R.profil.journal);
}

// --- Ligues --------------------------------------------------------------------

/** La ligue qu'ouvre un score : la plus haute dont le seuil est atteint. */
export function ligueDe(elo) {
  let numero = 1;
  for (const ligue of R.ligues) {
    if (elo >= ligue.seuil) numero = ligue.numero;
  }
  return numero;
}

/** Le niveau maximal des troupes en partie classée dans cette ligue. */
export function plafondDe(ligue) {
  return R.ligues[ligueValide(ligue) - 1].plafond;
}

function donnerCoffre(p, type, origine, evenements) {
  p.coffres.push({ type, origine });
  evenements.push({ type: 'coffre', coffre: type, origine });
}

/**
 * Le rang d'un coffre, tiré dans une table en pour-cent (R.sources.partie) :
 * les rangs dans l'ordre de R.coffres, chacun pour sa part des cent cases.
 */
/** La table des coffres d'une partie de ce format : la sienne s'il en a une, sinon celle de tous. */
export function tableDesCoffres(format) {
  const parFormat = R.sources.parFormat || {};
  return typeof format === 'string' && possede(parFormat, format) ? parFormat[format] : R.sources.partie;
}

function tirerRang(table, alea) {
  let tirage = alea();
  let caze = estNombre(tirage) && tirage >= 0 && tirage < 1 ? Math.floor(tirage * 100) : 0;
  const rangs = Object.keys(R.coffres);
  for (const rang of rangs) {
    caze -= table[rang] || 0;
    if (caze < 0) return rang;
  }
  return rangs[0];
}

/**
 * Le hasard qui tire le coffre d'une partie : celui qu'on fournit
 * (`partie.alea`, une fonction qui rend un nombre de [0, 1) — ce sera le
 * tirage du serveur), sinon un tirage qui ne dépend que de la partie et du
 * profil : la même partie, recomptée, donnerait le même coffre.
 */
function aleaDeLaPartie(partie, p, id) {
  if (typeof partie.alea === 'function') return partie.alea;
  return aleaDeGraine(`${id || ''}|${p.parties}|${p.elo}|${p.operations || 0}`);
}

/** L'ouvrier monte d'office au plafond de la plus haute ligue atteinte. */
function monterOuvrier(p, evenements) {
  const ouvrier = p.troupes[R.ouvrier];
  const plafond = plafondDe(p.plusHauteLigue);
  if (!ouvrier || ouvrier.niveau >= plafond) return;
  evenements.push({ type: 'ouvrierAuPlafond', troupe: R.ouvrier, de: ouvrier.niveau, a: plafond });
  ouvrier.niveau = plafond;
}

/**
 * Débloque les troupes avancées dont la condition gratuite est remplie : la
 * ligue, sinon le nombre de parties — les parties vraiment jouées : sans cela,
 * abandonner à la chaîne dès la première seconde débloquerait tout.
 */
function debloquerGratuites(p, evenements) {
  for (const type of AVANCEES) {
    if (p.debloquees[type]) continue;
    const { ligue, parties } = R.troupes[type].gratuite;
    const origine = p.plusHauteLigue >= ligue ? 'ligue' : p.parties - p.abandonsPrecoces >= parties ? 'parties' : null;
    if (!origine) continue;
    p.debloquees[type] = origine;
    if (p.boutique.offreLigue && p.boutique.offreLigue.troupe === type) p.boutique.offreLigue = null;
    evenements.push({ type: 'troupeDebloquee', troupe: type, origine });
  }
}

/**
 * Promotion immédiate tant que le seuil suivant est atteint ; la récompense ne
 * se donne qu'une fois. `instant` (secondes) : l'heure, quand on la connaît —
 * elle date la fin de l'offre de ligue ; sans elle, pas d'offre.
 */
function promouvoir(p, evenements, instant = null) {
  while (p.ligue < NB_LIGUES && p.elo >= R.ligues[p.ligue].seuil) {
    const de = p.ligue;
    p.ligue++;
    const ligue = R.ligues[p.ligue - 1];
    if (p.ligue > p.plusHauteLigue) p.plusHauteLigue = p.ligue;
    evenements.push({ type: 'promotion', de, a: p.ligue, nom: ligue.nom, plafond: ligue.plafond });
    if (ligue.promotion && !p.promotions.includes(p.ligue)) {
      p.promotions.push(p.ligue);
      const cadeaux = cadeauxDeLigue(ligue.promotion);
      evenements.push({ type: 'recompensePromotion', ligue: p.ligue, coffre: ligue.promotion.coffre, cadeaux });
      donnerCoffre(p, ligue.promotion.coffre, 'promotion', evenements);
      for (const id of cadeaux) donnerPiece(p, id, 'ligue', evenements);
      crediter(p, R.boutique.parLigue, 'ligue', evenements);
      ouvrirOffreDeLigue(p, instant, evenements);
    }
    monterOuvrier(p, evenements);
  }
}

/**
 * Rétrogradation : jamais sous `plancher`, et seulement quand le score passe
 * SOUS le seuil de la ligue moins la marge.
 */
function retrograder(p, evenements, plancher) {
  const { aPartirDe, marge } = R.retrogradation;
  while (p.ligue > plancher && p.ligue >= aPartirDe && p.elo < R.ligues[p.ligue - 1].seuil - marge) {
    const de = p.ligue;
    p.ligue--;
    const ligue = R.ligues[p.ligue - 1];
    evenements.push({ type: 'retrogradation', de, a: p.ligue, nom: ligue.nom, plafond: ligue.plafond });
  }
}

/** Met la ligue, l'ouvrier, les troupes gratuites et les pièces dues d'accord avec le score et les compteurs. */
function mettreAJour(p, evenements) {
  promouvoir(p, evenements);
  retrograder(p, evenements, 1);
  monterOuvrier(p, evenements);
  debloquerGratuites(p, evenements);
  rattraperLesPieces(p, evenements);
}

/**
 * Donne à un profil ce que les règles lui doivent et qu'il n'a pas encore :
 * une promotion due, une troupe dont la condition gratuite est remplie,
 * l'ouvrier au plafond, les pièces de collection des ligues déjà passées. Sans effet sur un profil à jour. À appeler après un
 * changement de réglages ou l'arrivée d'une nouvelle troupe : appliquerResultat
 * le fait de lui-même à chaque partie.
 */
export function regulariser(profil) {
  const p = migrerProfil(profil);
  const evenements = [];
  mettreAJour(p, evenements);
  return { profil: p, evenements };
}

// --- Fin de partie ---------------------------------------------------------------

/** Les compteurs du jour repartent de zéro quand la date avance — pas quand l'horloge recule. */
function changerDeJour(p, jour) {
  const rang = rangDuJour(jour);
  if (rang === null || jour === p.jour.date) return;
  // La date recule d'un jour : un voyage, un fuseau — on garde les compteurs.
  // Elle recule de davantage : l'horloge était en avance et vient d'être
  // corrigée ; sans cela plus aucun coffre jusqu'à la fausse date.
  const avant = rangDuJour(p.jour.date);
  if (avant !== null && rang < avant && avant - rang <= 1) return;
  p.jour = { date: jour, parties: 0, abandonsPrecoces: 0, victoires: 0 };
}

/** Une partie de plus aujourd'hui ; la première de la journée compte pour le coffre d'or de la semaine. */
function compterLeJour(p, evenements) {
  p.jour.parties++;
  if (p.jour.parties !== 1 || !p.jour.date) return;
  const numero = semaineDe(p.jour.date);
  if (numero !== p.semaine.numero) p.semaine = { numero, jours: 0, coffre: false };
  p.semaine.jours++;
  if (!p.semaine.coffre && p.semaine.jours >= R.sources.or.joursJoues) {
    p.semaine.coffre = true;
    donnerCoffre(p, 'or', 'semaine', evenements);
  }
}

/**
 * Applique le résultat d'une partie classée.
 *
 * `partie` = {
 *   issue : 'victoire' | 'defaite' | 'egalite' | 'abandon' (le joueur est
 *           parti) | 'abandonAdverse' (l'autre est parti) | 'annulee',
 *   duree : en secondes,
 *   contreOrdinateur : l'adversaire était l'ordinateur,
 *   jour  : « AAAA-MM-JJ »,
 *   instant : facultatif, l'heure de fin en secondes — sert à dater la
 *           fermeture de la recherche après trop d'abandons précoces,
 * }
 *
 * Renvoie `{ profil, evenements }`. Les événements, par leur `type` :
 *   partieAnnulee, elo, promotion, recompensePromotion, coffre, piece,
 *   ouvrierAuPlafond, retrogradation, troupeDebloquee, rechercheFermee,
 *   pointsDeSaison — et ceux d'un changement de saison, si le mois a tourné
 *   depuis la dernière partie (voir ouvrirLaSaison).
 *
 * Les règles :
 *   - un abandon est une défaite ; avant abandon.precoceAvant, une défaite —
 *     abandon ou non — coûte ses points mais ne compte ni comme une partie
 *     jouée (troupes gratuites, jour joué de la semaine) et ne donne pas de
 *     coffre ;
 *   - toute autre partie donne UN coffre, gagnée ou perdue : son rang se tire
 *     au sort (R.sources.partie — ou la table de `partie.format`, s'il en a
 *     une dans R.sources.parFormat), avec `partie.alea` s'il est fourni ;
 *   - `partie.id`, s'il est donné, empêche de compter deux fois la même partie ;
 *   - l'abandon de l'adversaire est une victoire, sauf avant
 *     abandon.precoceAvant : la partie est alors annulée pour celui qui
 *     reste, ni points ni coffre ;
 *   - contre l'ordinateur venu remplacer un adversaire introuvable
 *     (`contreOrdinateur: true`), la partie ne compte pour l'Elo que jusqu'à la
 *     ligue recherche.ordinateurClasseJusqua ; au-delà, elle ne rapporte que
 *     des coffres. Tant que le jeu entre joueurs n'existe pas, le classement se
 *     joue contre l'ordinateur : c'est alors `contreOrdinateur: 'echelle'`, et
 *     la partie compte à toutes les ligues ;
 *   - la promotion est immédiate au seuil, sa récompense ne se donne qu'une fois ;
 *   - pas de rétrogradation dans les premières ligues, puis seulement sous
 *     seuil − marge ;
 *   - une troupe avancée se débloque par la ligue OU par le nombre de parties.
 */
export function appliquerResultat(profil, partie) {
  const p = migrerProfil(profil);
  const evenements = [];
  const issueDite = estObjet(partie) ? partie.issue : undefined;
  if (!ISSUES.includes(issueDite)) return { profil: p, evenements, erreur: 'issue' };

  // La même partie, reprise dans un autre onglet ou d'une sauvegarde gardée
  // en mémoire, ne se compte qu'une fois.
  const id = typeof partie.id === 'string' && partie.id.length > 0 && partie.id.length <= 64 ? partie.id : null;
  if (id && p.comptees.includes(id)) {
    evenements.push({ type: 'partieAnnulee', raison: 'dejaComptee' });
    return { profil: p, evenements };
  }
  if (id) { p.comptees.push(id); p.comptees = p.comptees.slice(-R.profil.comptees); }

  const precoce = !(partie.duree >= R.abandon.precoceAvant);   // une durée illisible vaut « précoce »
  const jour = rangDuJour(partie.jour) === null ? '' : partie.jour;
  changerDeJour(p, jour);
  changerDeSaison(p, jour, evenements);

  let issue = issueDite;
  if (issue === 'abandonAdverse') issue = precoce ? 'annulee' : 'victoire';
  if (issue === 'annulee') {
    evenements.push({ type: 'partieAnnulee', raison: issueDite === 'annulee' ? 'annulee' : 'abandonAdversePrecoce' });
    noter(p, { op: 'partie', issue: 'annulee', jour, elo: p.elo, variation: 0 });
    return { profil: p, evenements };
  }
  const abandon = issue === 'abandon';
  if (abandon) issue = 'defaite';
  // Une défaite d'avant precoceAvant ne vaut rien d'autre que ses points
  // perdus, abandon ou non : raser son propre bâtiment principal finit la
  // partie aussi vite qu'abandonner.
  const sansValeur = issue === 'defaite' && precoce;

  p.parties++;
  p[COMPTEURS[issue]]++;
  if (sansValeur) p.abandonsPrecoces++;
  ouvrirOffreDeBienvenue(p, partie.instant, evenements);

  // Le score, puis la ligue qui en découle.
  const classee = partie.contreOrdinateur !== true || p.ligue <= R.recherche.ordinateurClasseJusqua;
  const avant = p.elo;
  if (classee) p.elo = Math.max(R.elo.plancher, p.elo + R.elo[issue]);
  evenements.push({ type: 'elo', avant, apres: p.elo, variation: p.elo - avant, classee });
  promouvoir(p, evenements, estNombre(partie.instant) ? partie.instant : null);
  retrograder(p, evenements, R.retrogradation.aPartirDe - 1);
  debloquerGratuites(p, evenements);

  // Le coffre de la partie : un par partie, gagnée ou perdue. Son rang se tire
  // au sort, et la victoire a de meilleures chances d'un rang élevé. Puis le
  // coffre d'or de la semaine.
  if (!sansValeur) {
    donnerCoffre(p, tirerRang(tableDesCoffres(partie.format)[issue], aleaDeLaPartie(partie, p, id)), issue, evenements);
    compterLeJour(p, evenements);
    compterLaSaison(p, issue, evenements);
  }

  // Trop de défaites précoces dans la journée : la recherche se ferme.
  if (sansValeur) {
    p.jour.abandonsPrecoces++;
    if (p.jour.abandonsPrecoces >= R.abandon.precocesParJour) {
      const secondes = R.abandon.fermetureRecherche;
      if (estNombre(partie.instant)) p.rechercheFermeeJusqua = Math.max(p.rechercheFermeeJusqua, partie.instant + secondes);
      evenements.push({ type: 'rechercheFermee', secondes, jusqua: estNombre(partie.instant) ? p.rechercheFermeeJusqua : null });
    }
  }

  noter(p, { op: 'partie', issue: issueDite, jour, elo: p.elo, variation: p.elo - avant });
  return { profil: p, evenements };
}

/** Le temps (en secondes) pendant lequel la recherche d'adversaire reste fermée à ce joueur ; 0 si elle est ouverte. */
export function rechercheFermee(profil, maintenant) {
  const jusqua = migrerProfil(profil).rechercheFermeeJusqua;
  return estNombre(maintenant) && jusqua > maintenant ? jusqua - maintenant : 0;
}

/**
 * La pause accordée à un joueur qui se déconnecte, selon ce qu'il a déjà pris
 * dans cette partie (en secondes). 0 : il n'a plus droit à rien, c'est un abandon.
 */
export function pauseAccordee(dejaPrise) {
  const reste = R.abandon.pauseMaxParJoueur - (estNombre(dejaPrise) && dejaPrise > 0 ? dejaPrise : 0);
  return reste <= 0 ? 0 : Math.min(R.abandon.pauseDeconnexion, reste);
}

// --- Fin de saison ---------------------------------------------------------------

/**
 * Clôt la saison du profil : ce que sa route lui devait encore, la récompense
 * de la ligue où il finit, le classement resserré au-dessus du pivot, puis la
 * saison `suivante` commence avec une route neuve.
 */
function clore(p, evenements, suivante = p.saison + 1) {
  prendreCeQuiEstDu(p, evenements);
  const finie = { numero: p.saison, ligue: p.ligue, elo: p.elo };
  const recompense = R.ligues[p.ligue - 1].finDeSaison;
  if (recompense) {
    const cadeaux = cadeauxDeLigue(recompense, p.saison);
    evenements.push({ type: 'recompenseSaison', saison: p.saison, ligue: p.ligue, coffre: recompense.coffre, cadeaux });
    donnerCoffre(p, recompense.coffre, 'saison', evenements);
    for (const id of cadeaux) donnerPiece(p, id, 'saison', evenements);
  }
  const { pivot, garde, jamaisSousLaLigue } = R.saison;
  if (p.elo > pivot) p.elo = pivot + Math.floor((p.elo - pivot) * garde);
  evenements.push({ type: 'remiseDeSaison', avant: finie.elo, apres: p.elo, variation: p.elo - finie.elo });
  retrograder(p, evenements, jamaisSousLaLigue);
  p.saisons.push(finie);
  if (p.saisons.length > R.profil.saisons) p.saisons.splice(0, p.saisons.length - R.profil.saisons);
  p.saison = suivante;
  p.route = routeNeuve();
  evenements.push({ type: 'saison', numero: p.saison });
  noter(p, { op: 'saison', saison: finie.numero, ligue: finie.ligue, elo: p.elo, variation: p.elo - finie.elo });
}

/**
 * Clôt la saison : les paliers de la route atteints et pas encore pris sont
 * donnés, puis la récompense selon la ligue où l'on finit ; ce qui dépasse
 * saison.pivot est réduit (2 350 repart à 1 550) et la saison suivante
 * commence. Sous le pivot, rien ne bouge. Les récompenses déjà gagnées et la
 * plus haute ligue atteinte restent. Renvoie `{ profil, evenements }`
 * (palierPris, recompenseSaison, coffre, piece, remiseDeSaison,
 * retrogradation, saison).
 *
 * C'est le calendrier qui décide du moment : voir ouvrirLaSaison.
 */
export function finDeSaison(profil) {
  const p = migrerProfil(profil);
  const evenements = [];
  clore(p, evenements);
  return { profil: p, evenements };
}

// --- Coffres ---------------------------------------------------------------------

/**
 * Un générateur de nombres dans [0, 1) qui ne dépend que de sa graine (un
 * entier ou un texte) : même graine, mêmes tirages, sur tout appareil. C'est
 * mulberry32, comme RNG dans js/utils.js.
 */
export function aleaDeGraine(graine) {
  let etat = 0;
  if (typeof graine === 'string') {
    etat = 2166136261;
    for (let i = 0; i < graine.length; i++) etat = Math.imul(etat ^ graine.charCodeAt(i), 16777619);
  } else if (estNombre(graine)) {
    etat = Math.floor(graine);
  }
  etat = etat >>> 0 || 1;
  return function alea() {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Un rang dans [0, n) tiré d'un nombre de [0, 1) ; un générateur fautif ne fait pas sortir du tableau. */
function rangAuHasard(nombre, n) {
  const rang = Math.floor(nombre * n);
  return rang >= 0 && rang < n ? rang : rang >= n ? n - 1 : 0;
}

/** La catégorie que désigne un nombre de [0, 1) dans une table en pour-mille. */
function categorieTiree(table, nombre) {
  const point = rangAuHasard(nombre, 1000);
  let cumul = 0;
  let derniere = null;
  for (const categorie of R.categories) {
    if (!possede(table, categorie)) continue;
    derniere = categorie;
    cumul += table[categorie];
    if (point < cumul) return categorie;
  }
  return derniere;
}

/** Les troupes d'une catégorie que le joueur a débloquées et qui ne sont pas au niveau maximum. */
function disponibles(p, categorie) {
  return EXISTANTES.filter((type) => R.troupes[type].categorie === categorie
    && p.debloquees[type] && p.troupes[type].niveau < R.niveauMax);
}

/**
 * Un tirage : la catégorie selon la table, puis une troupe à chances égales
 * parmi les disponibles, et le nombre fixe de fragments. Sans troupe
 * disponible, le tirage passe à une autre catégorie, quantité comprise : celle
 * du dessous d'abord, de proche en proche, puis celles du dessus. Ses
 * fragments ne deviennent des éclats que si TOUT est au niveau maximum. Il
 * consomme toujours deux nombres, même quand il n'y a pas le choix : la suite
 * des tirages ne dépend ainsi que de la graine.
 */
function tirer(p, regles, groupe, alea) {
  const tiree = categorieTiree(groupe.table, alea());
  const hasard = alea();
  const depart = R.categories.indexOf(tiree);
  // L'ordre d'essai : la catégorie tirée, celles du dessous, puis celles du dessus.
  const ordre = [];
  for (let r = depart; r >= 0; r--) ordre.push(r);
  for (let r = depart + 1; r < R.categories.length; r++) ordre.push(r);
  let rang = -1;
  let choix = [];
  for (const r of ordre) {
    choix = disponibles(p, R.categories[r]);
    if (choix.length > 0) { rang = r; break; }
  }
  const tirage = { genre: groupe.genre, tiree, categorie: null, troupe: null, fragments: 0, eclats: 0 };
  if (rang < 0) {
    tirage.eclats = regles.fragments[R.categories[0]] * R.eclatsParFragment;
    p.eclats += tirage.eclats;
    return tirage;
  }
  tirage.categorie = R.categories[rang];
  tirage.troupe = choix[rangAuHasard(hasard, choix.length)];
  tirage.fragments = regles.fragments[tirage.categorie];
  p.troupes[tirage.troupe].fragments += tirage.fragments;
  return tirage;
}

/**
 * Ouvre le coffre en attente de rang `indice`. `alea()` rend un nombre dans
 * [0, 1) : c'est tout le hasard de l'ouverture.
 *
 * Renvoie `{ profil, coffre, tirages, pieces, eclats, evenements }`, ou
 * `{ erreur }` ('alea', 'coffre'). Chaque tirage dit son `genre` (ordinaire,
 * garanti), la catégorie `tiree`, la `categorie` où il a fini (null s'il n'a
 * rien trouvé), la `troupe`, ses `fragments`, ou les `eclats` qu'il est
 * devenu. `pieces` : les autocollants du coffre, chacun avec sa `rarete`, et
 * `doublon` et ses `eclats` quand on l'avait déjà. `eclats` : ce que le coffre
 * a donné d'Éclats en tout — sa part fixe, les doublons, les fragments en trop.
 *
 * Les autocollants se tirent APRÈS les fragments : la suite des fragments ne
 * dépend pas d'eux. Les événements : coffreOuvert (le total par troupe, les
 * Éclats, les pièces nouvelles), piece (une par pièce reçue, celles qu'une
 * collection avancée donne comprises), ameliorationPossible.
 */
export function ouvrirCoffre(profil, indice, alea) {
  if (typeof alea !== 'function') return { erreur: 'alea' };
  const p = migrerProfil(profil);
  if (!Number.isInteger(indice) || indice < 0 || indice >= p.coffres.length) return { erreur: 'coffre' };
  const [coffre] = p.coffres.splice(indice, 1);
  const regles = R.coffres[coffre.type];

  const tirages = [];
  for (const groupe of regles.tirages) {
    for (let i = 0; i < groupe.nombre; i++) tirages.push(tirer(p, regles, groupe, alea));
  }

  const fragments = {};
  let eclats = 0;
  for (const t of tirages) {
    if (t.troupe) fragments[t.troupe] = (fragments[t.troupe] || 0) + t.fragments;
    eclats += t.eclats;
  }

  // Les autocollants, puis la part fixe d'Éclats.
  const recues = [];
  const pieces = [];
  const regle = R.collections.tirages[coffre.type];
  for (let i = 0; regle && i < regle.nombre; i++) {
    const id = autocollantTire(regle.table, alea);
    if (!id) continue;
    const nouvelle = donnerPiece(p, id, 'coffre', recues);
    const rendu = nouvelle ? 0 : R.collections.eclats.doublon[PIECES[id].rarete] || 0;
    pieces.push({ piece: id, rarete: PIECES[id].rarete, doublon: !nouvelle, eclats: rendu });
    eclats += rendu;
  }
  const fixes = R.collections.eclats.parCoffre[coffre.type] || 0;
  p.eclats += fixes;
  eclats += fixes;

  const nouvelles = recues.filter((e) => !e.doublon).map((e) => e.piece);
  const evenements = [{ type: 'coffreOuvert', coffre: coffre.type, origine: coffre.origine, fragments, eclats, pieces: nouvelles }, ...recues];
  for (const type of Object.keys(fragments)) {
    const troupe = p.troupes[type];
    if (troupe.fragments >= coutAmelioration(type, troupe.niveau)) {
      evenements.push({ type: 'ameliorationPossible', troupe: type, niveau: troupe.niveau + 1 });
    }
  }
  // Le journal garde ce que le coffre a donné, pas le détail de chaque tirage :
  // il est recopié à chaque opération, autant qu'il reste léger.
  noter(p, { op: 'coffre', coffre: coffre.type, origine: coffre.origine, fragments: { ...fragments }, eclats, pieces: nouvelles });
  return { profil: p, coffre: coffre.type, tirages, pieces, eclats, evenements };
}

/**
 * Un autocollant de coffre : sa rareté selon la table, puis un autocollant de
 * cette rareté à chances égales parmi ceux des collections « coffres » — qu'on
 * l'ait déjà ou non : un doublon devient des Éclats (voir donnerPiece). Une
 * rareté sans autocollant passe à celle du dessous, puis à celles du dessus.
 * Consomme toujours deux nombres. null si aucune collection n'est dans les coffres.
 */
function autocollantTire(table, alea) {
  const tiree = categorieTiree(table, alea());
  const hasard = alea();
  const depart = R.categories.indexOf(tiree);
  const ordre = [];
  for (let r = depart; r >= 0; r--) ordre.push(r);
  for (let r = depart + 1; r < R.categories.length; r++) ordre.push(r);
  for (const r of ordre) {
    const reserve = RESERVE[R.categories[r]];
    if (reserve.length > 0) return reserve[rangAuHasard(hasard, reserve.length)];
  }
  return null;
}

/**
 * Le tableau d'un coffre, tel qu'on l'affiche au joueur avant l'ouverture :
 * par groupe de tirages, la part de chaque catégorie (en pour-mille et en
 * pour-cent) et les fragments qu'elle donne ; puis ce que le coffre donne en
 * moyenne. `null` pour un coffre qui n'existe pas.
 */
export function probabilitesDe(typeDeCoffre) {
  if (typeof typeDeCoffre !== 'string' || !possede(R.coffres, typeDeCoffre)) return null;
  const regles = R.coffres[typeDeCoffre];
  const parts = {};   // fragments × pour-mille, en entiers : la division vient à la fin
  for (const categorie of R.categories) parts[categorie] = 0;
  let tirages = 0;
  const groupes = regles.tirages.map((groupe) => {
    tirages += groupe.nombre;
    const lignes = [];
    let total = 0;
    for (const categorie of R.categories) {
      if (!possede(groupe.table, categorie)) continue;
      const pourMille = groupe.table[categorie];
      total += pourMille;
      parts[categorie] += groupe.nombre * pourMille * regles.fragments[categorie];
      lignes.push({
        categorie, nom: R.nomsDesCategories[categorie],
        pourMille, pourCent: pourMille / 10, fragments: regles.fragments[categorie],
      });
    }
    return { genre: groupe.genre, nom: groupe.nom, nombre: groupe.nombre, lignes, total };
  });
  const moyenne = {};
  // `surCent` : ce que cent coffres donnent en moyenne — un nombre entier dès
  // que les tables sont en pour-cent ronds, là où la moyenne d'un seul coffre
  // est presque toujours un chiffre à virgule.
  const surCent = {};
  for (const categorie of R.categories) {
    moyenne[categorie] = parts[categorie] / 1000;
    surCent[categorie] = parts[categorie] / 10;
  }
  // Les autocollants : leurs chances par rareté, et ce que rend un doublon.
  const regle = R.collections.tirages[typeDeCoffre];
  const pieces = { nombre: regle ? regle.nombre : 0, lignes: [], total: 0 };
  for (const categorie of R.categories) {
    if (!regle || !possede(regle.table, categorie)) continue;
    const pourMille = regle.table[categorie];
    pieces.total += pourMille;
    pieces.lignes.push({
      categorie, nom: R.collections.raretes[categorie], pourMille, pourCent: pourMille / 10,
      autocollants: RESERVE[categorie].length, doublon: R.collections.eclats.doublon[categorie],
    });
  }
  return { coffre: typeDeCoffre, nom: regles.nom, tirages, groupes, moyenne, surCent, pieces, eclats: R.collections.eclats.parCoffre[typeDeCoffre] || 0 };
}

/**
 * Vérifie les tables de tous les coffres : des parts entières, positives, en
 * pour-cent ronds, qui somment à 1000 ; des catégories connues ; un nombre de
 * fragments pour chacune. Et les tables du coffre d'une partie, par issue :
 * des pour-cent entiers qui somment à 100. Et les tables des autocollants,
 * aux mêmes conditions. Renvoie `{ valide, erreurs }`.
 */
export function verifierProbabilites() {
  const erreurs = [];
  for (const type of Object.keys(R.coffres)) {
    const regles = R.coffres[type];
    for (const categorie of R.categories) {
      if (!Number.isInteger(regles.fragments[categorie]) || regles.fragments[categorie] <= 0) {
        erreurs.push(`${type} : pas de nombre de fragments pour « ${categorie} »`);
      }
    }
    regles.tirages.forEach((groupe, rang) => {
      const ou = `${type}, groupe ${rang + 1}`;
      if (!Number.isInteger(groupe.nombre) || groupe.nombre <= 0) erreurs.push(`${ou} : nombre de tirages invalide`);
      let total = 0;
      for (const categorie of Object.keys(groupe.table)) {
        const part = groupe.table[categorie];
        if (!R.categories.includes(categorie)) erreurs.push(`${ou} : catégorie inconnue « ${categorie} »`);
        if (!Number.isInteger(part) || part < 0) erreurs.push(`${ou} : part invalide pour « ${categorie} »`);
        total += part;
      }
      if (total !== 1000) erreurs.push(`${ou} : la table somme à ${total}, pas à 1000`);
      // Le joueur lit ces chances en pour-cent : jamais de chiffre à virgule.
      for (const categorie of Object.keys(groupe.table)) {
        if (groupe.table[categorie] % 10 !== 0) erreurs.push(`${ou} : la part de « ${categorie} » n'est pas un pour-cent rond`);
      }
    });
  }
  // Le coffre d'une partie : une table par issue, en pour-cent, sur les rangs connus.
  // (Celle de tous les formats, puis celle de chaque format qui a la sienne.)
  const tables = [['', R.sources.partie], ...Object.entries(R.sources.parFormat || {}).map(([format, t]) => [` (${format})`, t])];
  for (const [format, parIssue] of tables) {
    for (const issue of ['victoire', 'egalite', 'defaite']) {
      const table = estObjet(parIssue) ? parIssue[issue] : null;
      const ou = `coffre d'une ${issue}${format}`;
      if (!estObjet(table)) { erreurs.push(`${ou} : pas de table`); continue; }
      let total = 0;
      for (const rang of Object.keys(table)) {
        if (!possede(R.coffres, rang)) erreurs.push(`${ou} : rang inconnu « ${rang} »`);
        if (!Number.isInteger(table[rang]) || table[rang] < 0) erreurs.push(`${ou} : part invalide pour « ${rang} »`);
        total += table[rang];
      }
      if (total !== 100) erreurs.push(`${ou} : la table somme à ${total}, pas à 100`);
    }
  }
  // Les autocollants : une table par rang de coffre, des pour-cent ronds, des raretés qui ont de quoi donner.
  for (const type of Object.keys(R.coffres)) {
    const regle = R.collections.tirages[type];
    const ou = `autocollants du coffre « ${type} »`;
    if (!estObjet(regle)) { erreurs.push(`${ou} : pas de table`); continue; }
    if (!Number.isInteger(regle.nombre) || regle.nombre <= 0) erreurs.push(`${ou} : nombre de tirages invalide`);
    let total = 0;
    for (const rarete of Object.keys(regle.table)) {
      const part = regle.table[rarete];
      if (!R.categories.includes(rarete)) erreurs.push(`${ou} : rareté inconnue « ${rarete} »`);
      else if (part > 0 && RESERVE[rarete].length === 0) erreurs.push(`${ou} : aucun autocollant « ${rarete} » à donner`);
      if (!Number.isInteger(part) || part < 0) erreurs.push(`${ou} : part invalide pour « ${rarete} »`);
      if (part % 10 !== 0) erreurs.push(`${ou} : la part de « ${rarete} » n'est pas un pour-cent rond`);
      total += part;
    }
    if (total !== 1000) erreurs.push(`${ou} : la table somme à ${total}, pas à 1000`);
  }
  return { valide: erreurs.length === 0, erreurs };
}

// --- Niveaux des troupes ---------------------------------------------------------

/** Le prix en fragments du passage de `niveau` à `niveau + 1` ; null au niveau maximum ou pour une troupe inconnue. */
export function coutAmelioration(type, niveau) {
  if (!existe(type) || !Number.isInteger(niveau) || niveau < 1 || niveau >= R.niveauMax) return null;
  return R.couts[R.troupes[type].categorie][niveau - 1];
}

/**
 * Monte une troupe d'un niveau contre ses fragments. Le plafond de la ligue
 * n'empêche pas d'améliorer : il borne seulement le niveau joué en classé.
 * Renvoie `{ profil, evenements }` (amelioration), ou `{ erreur }` :
 * 'inconnue', 'verrouillee', 'niveauMax', 'fragments' (avec `cout` et `manque`).
 */
export function ameliorer(profil, type) {
  if (!existe(type)) return { erreur: 'inconnue' };
  const p = migrerProfil(profil);
  if (!p.debloquees[type]) return { erreur: 'verrouillee' };
  const troupe = p.troupes[type];
  if (troupe.niveau >= R.niveauMax) return { erreur: 'niveauMax' };
  const cout = coutAmelioration(type, troupe.niveau);
  if (troupe.fragments < cout) return { erreur: 'fragments', cout, fragments: troupe.fragments, manque: cout - troupe.fragments };
  troupe.fragments -= cout;
  troupe.niveau++;
  noter(p, { op: 'amelioration', troupe: type, niveau: troupe.niveau, cout });
  return {
    profil: p,
    evenements: [{ type: 'amelioration', troupe: type, niveau: troupe.niveau, cout, fragments: troupe.fragments, plafond: plafondDe(p.ligue) }],
  };
}

/**
 * Le niveau auquel une troupe joue vraiment :
 *   mode 'classe'     : son niveau, dans la limite du plafond de la ligue
 *                       (`ligue`, par défaut celle du profil) ; l'ouvrier y
 *                       joue toujours au plafond ;
 *   mode 'ordinateur' : son niveau réel, sans plafond (c'est le mode par défaut) ;
 *   mode 'amical'     : 1 si les joueurs ont choisi « niveaux égaux » (`egaux`),
 *                       son niveau réel sinon.
 * Une troupe inconnue du profil joue au niveau 1.
 */
export function niveauEffectif(profil, type, { mode = 'ordinateur', ligue, egaux } = {}) {
  const p = migrerProfil(profil);
  const reel = existe(type) ? p.troupes[type].niveau : 1;
  if (mode === 'amical') {
    return (egaux === undefined ? R.amical.egauxParDefaut : egaux === true) ? R.amical.niveauEgal : reel;
  }
  if (mode === 'classe') {
    const plafond = plafondDe(ligue === undefined ? p.ligue : ligue);
    return type === R.ouvrier ? plafond : Math.min(reel, plafond);
  }
  return reel;
}

/** Applique `calcul` au nombre que désigne `chemin` (« hp », « bonus.cavalry ») ; sans lui, ne fait rien. */
function modifier(def, chemin, calcul) {
  const cles = chemin.split('.');
  const derniere = cles.pop();
  let objet = def;
  for (const cle of cles) {
    if (!estObjet(objet) || !possede(objet, cle)) return;
    objet = objet[cle];
  }
  if (estObjet(objet) && estNombre(objet[derniere])) objet[derniere] = calcul(objet[derniere]);
}

/**
 * La définition d'une troupe à un niveau donné. Part d'une définition de
 * js/config.js (UNIT_TYPES[type]) et rend une NOUVELLE définition, qui ne
 * partage rien avec l'originale. Au niveau 1, elle lui est égale champ par
 * champ : rien n'est calculé.
 *
 * Seules des additions, des multiplications, des divisions et des arrondis :
 * le résultat est le même sur tous les appareils, la simulation reste
 * reproductible.
 */
export function definitionAuNiveau(def, type, niveau) {
  const copie = copier(def);
  const rang = entier(niveau, 1, R.niveauMax, 1) - 1;
  if (rang === 0 || !estObjet(copie) || typeof type !== 'string' || !possede(R.troupes, type)) return copie;
  const { fois = {}, plus = {}, pose = {}, vaut = {} } = R.troupes[type].ameliorations || {};
  for (const chemin of Object.keys(vaut)) {
    if (vaut[chemin][rang] !== null) modifier(copie, chemin, () => vaut[chemin][rang]);
  }
  for (const chemin of Object.keys(fois)) {
    const pourMille = fois[chemin][rang];
    if (pourMille === 1000) continue;
    const arrondir = R.entiers.includes(chemin);
    modifier(copie, chemin, (valeur) => (arrondir ? Math.round(valeur * pourMille / 1000) : valeur * pourMille / 1000));
  }
  for (const chemin of Object.keys(plus)) {
    const ajout = plus[chemin][rang];
    if (ajout !== 0) modifier(copie, chemin, (valeur) => valeur + ajout);
  }
  for (const champ of Object.keys(pose)) {
    if (pose[champ][rang] !== null) copie[champ] = pose[champ][rang];
  }
  return copie;
}

// --- Achat -----------------------------------------------------------------------

/**
 * Débloque une troupe avancée achetée. N'accorde rien sans une preuve dont
 * `valide` vaut exactement true : ce sera la réponse du serveur, qui aura
 * vérifié l'achat. Achetée ou gagnée, c'est la même troupe — seule son origine
 * diffère. Renvoie `{ profil, evenements }` (troupeDebloquee), ou `{ erreur }` :
 * 'inconnue', 'aVenir', 'pasEnVente', 'dejaDebloquee', 'preuve'.
 */
export function debloquerParAchat(profil, type, preuve) {
  if (typeof type !== 'string' || !possede(R.troupes, type)) return { erreur: 'inconnue' };
  if (R.troupes[type].aVenir) return { erreur: 'aVenir' };
  if (!R.troupes[type].gratuite) return { erreur: 'pasEnVente' };
  const p = migrerProfil(profil);
  if (p.debloquees[type]) return { erreur: 'dejaDebloquee' };
  // (Une preuve qui nomme une autre troupe ne vaut pas pour celle-ci.)
  if (!estObjet(preuve) || preuve.valide !== true || (preuve.type !== undefined && preuve.type !== type)) return { erreur: 'preuve' };
  p.debloquees[type] = 'achat';
  noter(p, { op: 'achat', troupe: type });
  return { profil: p, evenements: [{ type: 'troupeDebloquee', troupe: type, origine: 'achat' }] };
}

// --- Boutique ------------------------------------------------------------------
//
// Les Couronnes s'achètent en argent réel et se dépensent ici. Tout ce qui
// touche à l'argent réel demande une preuve dont `valide` vaut exactement
// true — ce sera la réponse du serveur, qui aura vérifié l'achat auprès du
// magasin d'applications. Dépenser des Couronnes n'en demande pas : le profil
// les a, ou ne les a pas. Les heures sont en secondes, données par l'appelant.

const HEURE = 3600;

/** Le numéro d'une transaction du magasin d'applications, tel qu'il se retient. */
function transactionLisible(t) { return typeof t === 'string' && t.length > 0 && t.length <= 128; }
/**
 * Une preuve d'achat en argent réel recevable : `valide` vaut exactement true,
 * et elle porte le numéro de sa `transaction`. Sans numéro, rien : c'est lui
 * qui empêche de livrer deux fois le même achat quand le magasin le représente.
 */
const preuveRecevable = (preuve) => estObjet(preuve) && preuve.valide === true && transactionLisible(preuve.transaction);
/** Retient qu'une transaction est livrée (les dernières seulement : voir boutique.transactions). */
function retenirTransaction(p, transaction) {
  p.boutique.transactions = [...p.boutique.transactions, transaction].slice(-R.boutique.transactions);
}

/** Ajoute des Couronnes au profil et le dit. */
function crediter(p, couronnes, origine, evenements) {
  if (!(couronnes > 0)) return;
  p.couronnes += couronnes;
  evenements.push({ type: 'couronnes', variation: couronnes, origine, total: p.couronnes });
}

/** Une ligue atteinte pour la première fois ouvre l'offre sur la troupe de la suivante, si elle reste à débloquer. */
function ouvrirOffreDeLigue(p, instant, evenements) {
  if (!estNombre(instant)) return;
  const troupe = AVANCEES.find((type) => R.troupes[type].gratuite.ligue === p.ligue + 1 && R.troupes[type].prix);
  if (!troupe || p.debloquees[troupe]) return;
  p.boutique.offreLigue = { troupe, jusqua: instant + R.boutique.offres.ligue.heures * HEURE };
  evenements.push({ type: 'offreOuverte', offre: 'ligue', troupe, jusqua: p.boutique.offreLigue.jusqua });
}

/** La première partie comptée ouvre l'offre de bienvenue, une fois pour toutes. */
function ouvrirOffreDeBienvenue(p, instant, evenements) {
  if (!estNombre(instant) || p.boutique.bienvenueJusqua > 0 || p.boutique.bienvenuePrise) return;
  p.boutique.bienvenueJusqua = instant + R.boutique.offres.bienvenue.heures * HEURE;
  evenements.push({ type: 'offreOuverte', offre: 'bienvenue', jusqua: p.boutique.bienvenueJusqua });
}

/** L'offre de ligue de ce profil si elle court encore à cette heure, sinon null. */
function offreDeLigue(p, maintenant) {
  const offre = p.boutique.offreLigue;
  if (!offre || p.debloquees[offre.troupe] || !estNombre(maintenant) || maintenant >= offre.jusqua) return null;
  return offre;
}

/** Les troupes avancées qui restent à débloquer et que la boutique vend. */
const aVendre = (p) => AVANCEES.filter((type) => !p.debloquees[type] && R.troupes[type].prix > 0);

/**
 * Le prix d'une troupe en Couronnes, à cette heure : son prix, ou le prix de
 * l'offre de ligue si elle porte sur elle. null si elle ne se vend pas.
 */
export function prixDeTroupe(profil, type, maintenant) {
  if (typeof type !== 'string' || !AVANCEES.includes(type) || !(R.troupes[type].prix > 0)) return null;
  const p = migrerProfil(profil);
  const plein = R.troupes[type].prix;
  const offre = offreDeLigue(p, maintenant);
  return offre && offre.troupe === type ? Math.round(plein * R.boutique.offres.ligue.part / 100) : plein;
}

/** Le lot « Toutes les troupes » : ce qui reste, son prix et la somme qu'il remplace ; null s'il en reste trop peu. */
function lotDeTroupes(p) {
  const { part, arrondi, minimum } = R.boutique.toutesLesTroupes;
  const troupes = aVendre(p);
  if (troupes.length < minimum) return null;
  const prixPlein = troupes.reduce((somme, type) => somme + R.troupes[type].prix, 0);
  return { troupes, prixPlein, prix: Math.round(prixPlein * part / 100 / arrondi) * arrondi };
}

/**
 * Ce que la boutique montre à ce profil, à cette heure (secondes) :
 *   couronnes : son porte-monnaie ;
 *   troupes   : chaque troupe avancée — `debloquee` (son origine), sinon son
 *               `prix`, son `prixPlein`, et `offre: true` quand l'offre de
 *               ligue porte sur elle ;
 *   lotTroupes: tout ce qui reste, moins cher que pièce par pièce — ou null ;
 *   offres    : celles qui courent, avec leur fin (`jusqua`) et ce qu'il en
 *               `reste` — « ligue » se paie en Couronnes, « bienvenue » en
 *               argent réel (`disponible` dit si on peut l'acheter ici) ;
 *   lots      : les lots de Couronnes, et s'ils sont `disponible`s ;
 *   essai     : le porte-monnaie d'essai, ou null ;
 *   eclats    : sa monnaie gratuite ;
 *   atelier   : les pièces vendues une à une, en Éclats (les teintures) —
 *               leur `prix`, et `possedee` ;
 *   selection : les autocollants du jour (`jour`, « AAAA-MM-JJ »), en Éclats —
 *               chacun son `prix` et son `prixPlein` ; `selectionPrise` : ceux
 *               déjà achetés à prix réduit ce jour-là ;
 *   collections : celles qui se vendent entières, en Couronnes — leur `prix`,
 *               leurs `pieces`, celles qui lui manquent (`manquantes`) ;
 *   passe     : celui de la saison en cours — son `prix`, et s'il est `pris`.
 */
export function catalogueBoutique(profil, maintenant, jour) {
  const p = migrerProfil(profil);
  const t = estNombre(maintenant) ? maintenant : null;
  const offre = offreDeLigue(p, t);
  const reel = R.boutique.argentReel === true;
  const offres = [];
  if (offre) {
    offres.push({ id: 'ligue', troupe: offre.troupe, prix: prixDeTroupe(p, offre.troupe, t), prixPlein: R.troupes[offre.troupe].prix, jusqua: offre.jusqua, reste: offre.jusqua - t });
  }
  const b = R.boutique.offres.bienvenue;
  if (t !== null && !p.boutique.bienvenuePrise && p.boutique.bienvenueJusqua > t) {
    offres.push({ id: 'bienvenue', prixCentimes: b.prixCentimes, troupes: b.troupes.filter((type) => !p.debloquees[type]), couronnes: b.couronnes,
      jusqua: p.boutique.bienvenueJusqua, reste: p.boutique.bienvenueJusqua - t, disponible: reel });
  }
  return {
    couronnes: p.couronnes,
    troupes: AVANCEES.filter((type) => R.troupes[type].prix > 0).map((type) => (p.debloquees[type]
      ? { type, debloquee: p.debloquees[type] }
      : { type, debloquee: null, prix: prixDeTroupe(p, type, t), prixPlein: R.troupes[type].prix, offre: !!offre && offre.troupe === type })),
    lotTroupes: lotDeTroupes(p),
    offres,
    lots: R.boutique.lots.map((lot) => ({ ...lot, disponible: reel })),
    essai: R.boutique.essai ? { couronnes: R.boutique.essai.couronnes } : null,
    eclats: p.eclats,
    selection: selectionDuJour(p, jour).map((id) => ({ piece: id, prix: prixDePiece(p, id, jour), prixPlein: R.collections.eclats.prix[PIECES[id].rarete] })),
    selectionPrise: p.selection.jour === jour ? p.selection.achats : 0,
    atelier: DE_L_ATELIER.filter((id) => possede(R.collections.atelier, id)).map((id) => ({ piece: id, prix: R.collections.atelier[id], possedee: p.pieces.includes(id) })),
    collections: COLLECTIONS.map((c) => lotDeCollection(p, c.id)).filter(Boolean),
    passe: { saison: p.saison, prix: R.saisons.passe.prix, pris: p.route.passe },
  };
}

/**
 * Achète une troupe avancée avec des Couronnes, au prix de cette heure.
 * Renvoie `{ profil, evenements }` (couronnes, troupeDebloquee), ou `{ erreur }` :
 * 'inconnue', 'pasEnVente', 'dejaDebloquee', 'fonds' (avec `manque`).
 */
export function acheterTroupe(profil, type, maintenant) {
  if (typeof type !== 'string' || !possede(R.troupes, type) || R.troupes[type].aVenir) return { erreur: 'inconnue' };
  if (!AVANCEES.includes(type) || !(R.troupes[type].prix > 0)) return { erreur: 'pasEnVente' };
  const p = migrerProfil(profil);
  if (p.debloquees[type]) return { erreur: 'dejaDebloquee' };
  const prix = prixDeTroupe(p, type, maintenant);
  if (p.couronnes < prix) return { erreur: 'fonds', manque: prix - p.couronnes };
  p.couronnes -= prix;
  p.debloquees[type] = 'achat';
  if (p.boutique.offreLigue && p.boutique.offreLigue.troupe === type) p.boutique.offreLigue = null;
  noter(p, { op: 'boutique', article: 'troupe', troupe: type, prix });
  return { profil: p, evenements: [
    { type: 'couronnes', variation: -prix, origine: 'troupe', total: p.couronnes },
    { type: 'troupeDebloquee', troupe: type, origine: 'achat' },
  ] };
}

/**
 * Achète d'un coup toutes les troupes qui restent, au prix du lot.
 * Renvoie `{ profil, evenements }`, ou `{ erreur }` : 'pasEnVente' (il en reste trop peu), 'fonds' (avec `manque`).
 */
export function acheterToutesLesTroupes(profil) {
  const p = migrerProfil(profil);
  const lot = lotDeTroupes(p);
  if (!lot) return { erreur: 'pasEnVente' };
  if (p.couronnes < lot.prix) return { erreur: 'fonds', manque: lot.prix - p.couronnes };
  p.couronnes -= lot.prix;
  const evenements = [{ type: 'couronnes', variation: -lot.prix, origine: 'lotTroupes', total: p.couronnes }];
  for (const type of lot.troupes) {
    p.debloquees[type] = 'achat';
    evenements.push({ type: 'troupeDebloquee', troupe: type, origine: 'achat' });
  }
  p.boutique.offreLigue = null;
  noter(p, { op: 'boutique', article: 'lotTroupes', troupes: lot.troupes.length, prix: lot.prix });
  return { profil: p, evenements };
}

/**
 * Le porte-monnaie d'essai : ajoute les Couronnes d'essai, tant que les
 * réglages le permettent (voir boutique.essai). `{ erreur: 'ferme' }` sinon.
 */
export function prendreCouronnesDEssai(profil) {
  if (!R.boutique.essai || !(R.boutique.essai.couronnes > 0)) return { erreur: 'ferme' };
  const p = migrerProfil(profil);
  const evenements = [];
  crediter(p, R.boutique.essai.couronnes, 'essai', evenements);
  noter(p, { op: 'boutique', article: 'essai', couronnes: R.boutique.essai.couronnes });
  return { profil: p, evenements };
}

/**
 * Crédite un lot de Couronnes acheté en argent réel. N'accorde rien sans une
 * preuve recevable qui nomme ce lot, et jamais deux fois pour la même
 * transaction. `{ erreur }` : 'inconnu', 'preuve', 'dejaCredite'.
 */
export function crediterLot(profil, lotId, preuve) {
  const lot = R.boutique.lots.find((l) => l.id === lotId);
  if (!lot) return { erreur: 'inconnu' };
  if (!preuveRecevable(preuve) || preuve.lot !== lotId) return { erreur: 'preuve' };
  const p = migrerProfil(profil);
  if (p.boutique.transactions.includes(preuve.transaction)) return { erreur: 'dejaCredite' };
  const evenements = [];
  crediter(p, lot.couronnes, 'lot', evenements);
  retenirTransaction(p, preuve.transaction);
  noter(p, { op: 'boutique', article: 'lot', lot: lotId, couronnes: lot.couronnes });
  return { profil: p, evenements };
}

/**
 * Donne l'offre de bienvenue achetée en argent réel : ses troupes (celles qui
 * restent à débloquer) et ses Couronnes. Une seule fois, sur preuve recevable.
 *
 * Ce qui est payé est dû : la fin de l'offre ferme sa vitrine (voir
 * catalogueBoutique), pas sa livraison. Un achat que le magasin ne confirme
 * qu'après coup (accord parental, paiement différé) est livré quand même.
 *
 * Une preuve de `restauration` (l'achat retrouvé après une réinstallation, ou
 * sur un autre appareil) rend les troupes, pas les Couronnes : elles ont déjà
 * été données, et dépensées peut-être.
 *
 * `{ erreur }` : 'preuve', 'dejaCredite' (cette transaction est déjà livrée),
 * 'fermee' (l'offre a déjà été prise).
 */
export function prendreOffreDeBienvenue(profil, preuve) {
  if (!preuveRecevable(preuve) || preuve.offre !== 'bienvenue') return { erreur: 'preuve' };
  const p = migrerProfil(profil);
  if (p.boutique.transactions.includes(preuve.transaction)) return { erreur: 'dejaCredite' };
  if (p.boutique.bienvenuePrise) return { erreur: 'fermee' };
  const b = R.boutique.offres.bienvenue;
  const evenements = [];
  p.boutique.bienvenuePrise = true;
  for (const type of b.troupes) {
    if (!AVANCEES.includes(type) || p.debloquees[type]) continue;
    p.debloquees[type] = 'achat';
    evenements.push({ type: 'troupeDebloquee', troupe: type, origine: 'achat' });
  }
  if (preuve.restauration !== true) crediter(p, b.couronnes, 'bienvenue', evenements);
  retenirTransaction(p, preuve.transaction);
  noter(p, { op: 'boutique', article: 'bienvenue', ...(preuve.restauration === true ? { restauration: true } : {}) });
  return { profil: p, evenements };
}

// --- Collections et blason -------------------------------------------------------
//
// Deux monnaies. Les Couronnes s'achètent ; les Éclats se gagnent en jouant
// (les coffres, les autocollants en double, la route de saison) et n'achètent
// que de l'apparence. Une pièce de collection ne change rien à une partie.

/** Ajoute des Éclats au profil et le dit. */
function donnerEclats(p, eclats, origine, evenements) {
  if (!(eclats > 0)) return;
  p.eclats += eclats;
  evenements.push({ type: 'eclats', variation: eclats, origine, total: p.eclats });
}

/**
 * Donne une pièce de collection. Déjà possédée, elle devient des Éclats (selon
 * sa rareté) : renvoie alors false. Le tout premier autocollant reçu se porte
 * d'office. Une pièce de plus peut en amener d'autres : celles que sa
 * collection donne à qui avance (voir completer).
 */
function donnerPiece(p, id, origine, evenements) {
  const piece = PIECES[id];
  if (!piece) return false;
  if (p.pieces.includes(id)) {
    const eclats = R.collections.eclats.doublon[piece.rarete] || 0;
    p.eclats += eclats;
    evenements.push({ type: 'piece', piece: id, origine, doublon: true, eclats });
    return false;
  }
  // (Le tout premier autocollant se porte d'office ; ensuite, « aucun » est un choix qu'on respecte.)
  const premier = piece.genre === 'embleme' && !p.blason.embleme && !p.pieces.some((x) => PIECES[x].genre === 'embleme');
  p.pieces.push(id);
  if (premier) p.blason.embleme = id;
  evenements.push({ type: 'piece', piece: id, origine, doublon: false, eclats: 0 });
  completer(p, piece.collection, evenements);
  return true;
}

/** Les pièces qu'une collection des coffres doit à qui a réuni assez de ses autocollants : grade, bannière, cadre, épithète. */
function completer(p, collectionId, evenements) {
  const c = collectionDuJeu(collectionId);
  if (!c || c.source !== 'coffres') return;
  const reunis = c.emblemes.filter((id) => p.pieces.includes(id)).length;
  for (const court of Object.keys(R.collections.paliers)) {
    const id = pieceDe(c.id, court);
    if (!id || reunis < R.collections.paliers[court] || p.pieces.includes(id)) continue;
    p.pieces.push(id);
    evenements.push({ type: 'piece', piece: id, origine: 'collection', doublon: false, eclats: 0 });
  }
}

/**
 * Les cadeaux d'une récompense de ligue, en identifiants de pièces : ceux
 * qu'elle nomme (`piece`), et ceux de la collection de la saison `numero`
 * (`saison` : « etendard », « champion »).
 */
function cadeauxDeLigue(recompense, numero) {
  const ids = [];
  for (const cadeau of (recompense && recompense.cadeaux) || []) {
    const id = cadeau.piece || (cadeau.saison && Number.isInteger(numero) ? pieceDe(themeDeSaison(numero), cadeau.saison) : null);
    if (existePiece(id)) ids.push(id);
  }
  return ids;
}

/** Ce qu'un profil aurait dû recevoir et n'a pas : les cadeaux des promotions déjà passées, les pièces d'une collection déjà avancée. */
function rattraperLesPieces(p, evenements) {
  for (const numero of p.promotions) {
    for (const id of cadeauxDeLigue(R.ligues[numero - 1].promotion)) {
      if (!p.pieces.includes(id)) donnerPiece(p, id, 'ligue', evenements);
    }
  }
  for (const c of COLLECTIONS) completer(p, c.id, evenements);
}

/** Où en est une collection pour ce profil : `reunis` autocollants sur `total`, et `complete`. null si elle n'existe pas. */
export function avancementDe(profil, collectionId) {
  const c = collectionDuJeu(collectionId);
  if (!c) return null;
  const p = migrerProfil(profil);
  const reunis = c.emblemes.filter((id) => p.pieces.includes(id)).length;
  const pieces = c.pieces.filter((id) => p.pieces.includes(id)).length;
  return { reunis, total: c.emblemes.length, pieces, toutes: c.pieces.length, complete: pieces === c.pieces.length };
}

/** Le titre que porte ce profil : son grade, puis son épithète s'il en a une — « Dompteur du Banquet ». */
export function titreDe(profil) {
  const b = migrerProfil(profil).blason;
  // (L'ordre des deux mots est affaire de langue : voir composerTitre.)
  return composerTitre(PIECES[b.grade].nom, b.epithete ? PIECES[b.epithete].nom : null);
}

/**
 * Porte une pièce possédée à la place de celle du même genre (`embleme`,
 * `cadre`, `banniere`, `grade`, `epithete`, `teinture`) ; `null` retire
 * l'autocollant, l'épithète ou la teinture. Renvoie `{ profil, evenements }` (blason), ou `{ erreur }` :
 * 'genre', 'obligatoire', 'pasPossedee'.
 */
export function equiper(profil, genre, id) {
  if (!GENRES.includes(genre)) return { erreur: 'genre' };
  const p = migrerProfil(profil);
  if (id === null) {
    if (!FACULTATIVES.includes(genre)) return { erreur: 'obligatoire' };
  } else {
    if (!existePiece(id) || PIECES[id].genre !== genre) return { erreur: 'genre' };
    if (!p.pieces.includes(id)) return { erreur: 'pasPossedee' };
  }
  p.blason[genre] = id;
  // (Une opération comme les autres : c'est ce compteur qui dit au second rangement qu'il y a du neuf.)
  noter(p, { op: 'blason', genre, piece: id });
  return { profil: p, evenements: [{ type: 'blason', genre, piece: id }] };
}

/** Le rang que le jour donne à une pièce dans la sélection : un nombre de [0, 1) qui ne dépend que du jour et d'elle. */
const rangDuJourPour = (jour, id) => aleaDeGraine(`selection|${jour}|${id}`)();

/** Ce que ce profil peut encore acheter à prix réduit ce jour-là : `selection.nombre`, moins ce qu'il y a déjà pris. */
function resteDeLaSelection(p, jour) {
  return R.collections.eclats.selection.nombre - (p.selection.jour === jour ? p.selection.achats : 0);
}

/**
 * La sélection du jour : parmi les autocollants des coffres qui manquent à ce
 * profil, ceux que ce jour met en avant, à prix réduit. La même pour tous ceux
 * à qui il manque les mêmes ; vide sans jour lisible, ou quand il ne manque
 * rien. Un autocollant acheté n'est pas remplacé : `selection.nombre` par jour,
 * pas un de plus — sans quoi tout s'achèterait à prix réduit le même jour.
 */
function selectionDuJour(p, jour) {
  if (rangDuJour(jour) === null) return [];
  return DANS_LES_COFFRES.filter((id) => !p.pieces.includes(id))
    .map((id) => [rangDuJourPour(jour, id), id])
    .sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1))
    .slice(0, Math.max(0, resteDeLaSelection(p, jour)))
    .map(([, id]) => id);
}

/**
 * Le prix d'une pièce en Éclats, ce jour-là. Un autocollant des coffres : son
 * prix selon sa rareté, réduit s'il est dans la sélection du jour. Une pièce
 * de l'atelier (une teinture) : son prix fixe. null si elle ne se vend pas, ou
 * qu'on l'a déjà.
 */
export function prixDePiece(profil, id, jour) {
  const fixe = DE_L_ATELIER.includes(id) && possede(R.collections.atelier, id) ? R.collections.atelier[id] : null;
  if (fixe === null && !DANS_LES_COFFRES.includes(id)) return null;
  const p = migrerProfil(profil);
  if (p.pieces.includes(id)) return null;
  if (fixe !== null) return fixe;
  const plein = R.collections.eclats.prix[PIECES[id].rarete];
  return selectionDuJour(p, jour).includes(id) ? Math.round(plein * R.collections.eclats.selection.part / 100) : plein;
}

/**
 * Achète une pièce choisie (un autocollant des coffres, une teinture de
 * l'atelier) avec des Éclats, au prix de ce jour. Renvoie
 * `{ profil, evenements }` (eclats, piece — et les pièces que sa collection
 * donne alors), ou `{ erreur }` : 'pasEnVente', 'fonds' (avec `manque`).
 */
export function acheterPiece(profil, id, jour) {
  const p = migrerProfil(profil);
  const prix = prixDePiece(p, id, jour);
  if (prix === null) return { erreur: 'pasEnVente' };
  if (p.eclats < prix) return { erreur: 'fonds', manque: prix - p.eclats };
  // (Pris dans la sélection du jour : un de moins à prix réduit aujourd'hui.)
  if (selectionDuJour(p, jour).includes(id)) p.selection = { jour, achats: (p.selection.jour === jour ? p.selection.achats : 0) + 1 };
  p.eclats -= prix;
  const evenements = [{ type: 'eclats', variation: -prix, origine: 'piece', total: p.eclats }];
  donnerPiece(p, id, 'achat', evenements);
  noter(p, { op: 'boutique', article: 'piece', piece: id, eclats: prix });
  return { profil: p, evenements };
}

/** Une collection vendue entière : son prix, ses pièces, et celles que ce profil n'a pas encore. null si elle ne se vend pas. */
function lotDeCollection(p, collectionId) {
  const c = collectionDuJeu(collectionId);
  const lot = c && c.source === 'boutique' && possede(R.collections.lots, c.id) ? R.collections.lots[c.id] : null;
  if (!lot) return null;
  return { collection: c.id, prix: lot.prix, pieces: [...c.pieces], manquantes: c.pieces.filter((id) => !p.pieces.includes(id)) };
}

/**
 * Achète une collection de la boutique avec des Couronnes : toutes ses pièces,
 * d'un coup. Renvoie `{ profil, evenements }`, ou `{ erreur }` : 'pasEnVente',
 * 'dejaPossedee', 'fonds' (avec `manque`).
 */
export function acheterCollection(profil, collectionId) {
  const p = migrerProfil(profil);
  const lot = lotDeCollection(p, collectionId);
  if (!lot) return { erreur: 'pasEnVente' };
  if (lot.manquantes.length === 0) return { erreur: 'dejaPossedee' };
  if (p.couronnes < lot.prix) return { erreur: 'fonds', manque: lot.prix - p.couronnes };
  p.couronnes -= lot.prix;
  const evenements = [{ type: 'couronnes', variation: -lot.prix, origine: 'collection', total: p.couronnes }];
  for (const id of lot.manquantes) donnerPiece(p, id, 'achat', evenements);
  noter(p, { op: 'boutique', article: 'collection', collection: lot.collection, prix: lot.prix });
  return { profil: p, evenements };
}

// --- Saisons : le calendrier, la route, le Passe ----------------------------------
//
// Une saison par mois de calendrier. Chaque partie classée comptée rapporte
// des points ; tous les `pointsParPalier`, un palier de la route s'ouvre sur
// les deux voies. La voie gratuite se prend toujours, celle du Passe quand on
// l'a acheté — à n'importe quel moment de la saison : les paliers déjà
// atteints se prennent alors d'un coup.

const FORME_DU_MOIS = /^(\d{4})-(\d{2})$/;
const moisDe = (annee, mois) => annee * 12 + mois - 1;

/** Le numéro de la saison d'un jour « AAAA-MM-JJ » : 1 pour le mois `saisons.premiere` (et avant), un de plus chaque mois. null si le jour est illisible. */
export function saisonDuJour(jour) {
  if (rangDuJour(jour) === null) return null;
  const premiere = FORME_DU_MOIS.exec(R.saisons.premiere);
  const ecart = moisDe(Number(jour.slice(0, 4)), Number(jour.slice(5, 7))) - moisDe(Number(premiere[1]), Number(premiere[2]));
  return Math.max(1, ecart + 1);
}

/** La collection d'une saison : les thèmes dans l'ordre, puis on recommence. */
export function themeDeSaison(numero) {
  const themes = R.saisons.themes;
  return themes[(entier(numero, 1, GRAND, 1) - 1) % themes.length];
}

/** Les jours qu'il reste à la saison, celui-ci compris ; null si le jour est illisible. */
export function joursRestants(jour) {
  const rang = rangDuJour(jour);
  if (rang === null) return null;
  const annee = Number(jour.slice(0, 4)), mois = Number(jour.slice(5, 7));
  const deux = (n) => String(n).padStart(2, '0');
  const suivant = mois === 12 ? `${annee + 1}-01-01` : `${annee}-${deux(mois + 1)}-01`;
  return rangDuJour(suivant) - rang;
}

/** Le dernier palier que ces points ouvrent. */
const palierAtteint = (points) => Math.min(R.saisons.paliers, Math.floor(points / R.saisons.pointsParPalier));

/**
 * La récompense d'un palier, sur une voie, pour la saison `numero` :
 *   { genre: 'coffre', coffre } · { genre: 'couronnes', couronnes } ·
 *   { genre: 'eclats', eclats } · { genre: 'piece', piece }
 * null si le palier n'existe pas.
 */
export function recompenseDePalier(numero, voie, palier) {
  const ligne = Number.isInteger(palier) ? R.saisons.route[palier - 1] : null;
  const brute = ligne && VOIES.includes(voie) ? ligne[voie] : null;
  if (!brute) return null;
  if (brute.coffre) return { genre: 'coffre', coffre: brute.coffre };
  if (brute.couronnes) return { genre: 'couronnes', couronnes: brute.couronnes };
  if (brute.eclats) return { genre: 'eclats', eclats: brute.eclats };
  const theme = collectionDuJeu(themeDeSaison(numero));
  const id = Number.isInteger(brute.embleme) ? theme.emblemes[brute.embleme] : pieceDe(theme.id, brute.piece);
  return existePiece(id) ? { genre: 'piece', piece: id } : null;
}

/** Prend un palier : le marque, et donne sa récompense. */
function prendre(p, voie, palier, evenements) {
  p.route.pris[voie].push(palier);
  p.route.pris[voie].sort((a, b) => a - b);
  const r = recompenseDePalier(p.saison, voie, palier);
  evenements.push({ type: 'palierPris', saison: p.saison, voie, palier, recompense: r });
  if (!r) return;
  if (r.genre === 'coffre') donnerCoffre(p, r.coffre, 'route', evenements);
  else if (r.genre === 'couronnes') crediter(p, r.couronnes, 'route', evenements);
  else if (r.genre === 'eclats') donnerEclats(p, r.eclats, 'route', evenements);
  else donnerPiece(p, r.piece, 'route', evenements);
}

/** Les paliers atteints et pas encore pris, voie par voie (celle du Passe seulement si on l'a). */
function dus(p) {
  const atteint = palierAtteint(p.route.points);
  const liste = [];
  for (let palier = 1; palier <= atteint; palier++) {
    for (const voie of VOIES) {
      if (voie === 'passe' && !p.route.passe) continue;
      if (!p.route.pris[voie].includes(palier)) liste.push({ voie, palier });
    }
  }
  return liste;
}

function prendreCeQuiEstDu(p, evenements) {
  const liste = dus(p);
  for (const { voie, palier } of liste) prendre(p, voie, palier, evenements);
  return liste.length;
}

/** Les points de saison d'une partie classée comptée. */
function compterLaSaison(p, issue, evenements) {
  const s = R.saisons.points;
  let points = s.partie;
  let premiere = false;
  if (issue === 'victoire') {
    points += s.victoire;
    premiere = p.jour.victoires === 0;
    if (premiere) points += s.premiereVictoireDuJour;
    p.jour.victoires++;
  }
  const avant = palierAtteint(p.route.points);
  const plein = R.saisons.paliers * R.saisons.pointsParPalier;
  const gagnes = Math.min(points, plein - p.route.points);
  p.route.points += gagnes;
  const palier = palierAtteint(p.route.points);
  evenements.push({ type: 'pointsDeSaison', variation: gagnes, total: p.route.points, palier, paliersGagnes: palier - avant, premiereVictoireDuJour: premiere });
}

/**
 * Fait passer le profil à la saison de ce jour s'il en est resté à une
 * précédente : la saison qu'il jouait est close (voir clore), une seule fois
 * quel que soit le nombre de mois passés, et la route repart de zéro. Sans
 * effet quand le profil est à jour, que le jour est illisible ou que
 * l'horloge a reculé. Renvoie true quand une saison a été close.
 */
function changerDeSaison(p, jour, evenements) {
  const numero = saisonDuJour(jour);
  if (numero === null || numero <= p.saison) return false;
  // Qui n'a encore rien joué n'a pas de saison à finir : il rejoint celle du
  // jour, sans annonce. (Un joueur arrivé en décembre n'a pas « fini » octobre.)
  if (p.parties === 0 && p.route.points === 0 && !p.route.passe) {
    p.saison = numero;
    return false;
  }
  clore(p, evenements, numero);
  return true;
}

/**
 * À appeler à l'ouverture du jeu et de l'écran de la saison : met le profil à
 * la saison de ce jour. Renvoie `{ profil, evenements }` — sans événement
 * quand rien n'a changé, ni quand un profil qui n'a jamais joué rejoint la
 * saison du jour (son `saison` change alors : à ranger quand même) ; sinon
 * ceux de la fin de la saison passée
 * (palierPris, recompenseSaison, coffre, piece, remiseDeSaison,
 * retrogradation, saison).
 */
export function ouvrirLaSaison(profil, jour) {
  const p = migrerProfil(profil);
  const evenements = [];
  changerDeSaison(p, jour, evenements);
  return { profil: p, evenements };
}

/**
 * Ce que l'écran de la saison montre : son `numero`, sa collection (`theme`),
 * les `points`, le `palier` atteint et les points `versLeSuivant`, le Passe
 * (`passe`, `prixDuPasse`), les `joursRestants`, le nombre de paliers
 * `aPrendre`, et la `route` — par palier, chaque voie avec sa `recompense`,
 * son `etat` ('pris', 'aPrendre', 'aVenir', ou 'ferme' : voie du Passe sans
 * le Passe), et `dejaLa` quand sa pièce est déjà possédée : elle rendra alors
 * `eclats` Éclats.
 */
export function etatDeLaSaison(profil, jour) {
  const p = migrerProfil(profil);
  const atteint = palierAtteint(p.route.points);
  const route = R.saisons.route.map((ligne, i) => {
    const palier = i + 1;
    const voies = {};
    for (const voie of VOIES) {
      const pris = p.route.pris[voie].includes(palier);
      const etat = pris ? 'pris' : voie === 'passe' && !p.route.passe ? 'ferme' : palier <= atteint ? 'aPrendre' : 'aVenir';
      const recompense = recompenseDePalier(p.saison, voie, palier);
      // (Une saison dont le thème revient : la pièce qu'on a déjà rendra des Éclats, et la route le dit d'avance.)
      const dejaLa = !pris && !!recompense && recompense.genre === 'piece' && p.pieces.includes(recompense.piece);
      voies[voie] = { recompense, etat, dejaLa, eclats: dejaLa ? R.collections.eclats.doublon[PIECES[recompense.piece].rarete] : 0 };
    }
    return { palier, atteint: palier <= atteint, ...voies };
  });
  return {
    numero: p.saison,
    theme: themeDeSaison(p.saison),
    points: p.route.points,
    palier: atteint,
    paliers: R.saisons.paliers,
    parPalier: R.saisons.pointsParPalier,
    versLeSuivant: atteint >= R.saisons.paliers ? 0 : p.route.points - atteint * R.saisons.pointsParPalier,
    passe: p.route.passe,
    prixDuPasse: R.saisons.passe.prix,
    joursRestants: joursRestants(jour),
    aPrendre: dus(p).length,
    route,
  };
}

/**
 * Prend la récompense d'un palier atteint. Renvoie `{ profil, evenements }`
 * (palierPris, puis coffre, couronnes, eclats ou piece), ou `{ erreur }` :
 * 'palier', 'pasAtteint', 'passe' (voie du Passe sans le Passe), 'dejaPris'.
 */
export function prendrePalier(profil, voie, palier) {
  if (!VOIES.includes(voie) || !Number.isInteger(palier) || palier < 1 || palier > R.saisons.paliers) return { erreur: 'palier' };
  const p = migrerProfil(profil);
  if (palier > palierAtteint(p.route.points)) return { erreur: 'pasAtteint' };
  if (voie === 'passe' && !p.route.passe) return { erreur: 'passe' };
  if (p.route.pris[voie].includes(palier)) return { erreur: 'dejaPris' };
  const evenements = [];
  prendre(p, voie, palier, evenements);
  noter(p, { op: 'route', saison: p.saison, voie, palier });
  return { profil: p, evenements };
}

/** Prend d'un coup tout ce que la route doit. `{ erreur: 'rien' }` s'il n'y a rien à prendre. */
export function prendreTout(profil) {
  const p = migrerProfil(profil);
  const evenements = [];
  const nombre = prendreCeQuiEstDu(p, evenements);
  if (!nombre) return { erreur: 'rien' };
  noter(p, { op: 'route', saison: p.saison, paliers: nombre });
  return { profil: p, evenements };
}

/**
 * Achète le Passe de la saison en cours, en Couronnes : il ouvre la seconde
 * voie, paliers déjà atteints compris. Renvoie `{ profil, evenements }`
 * (couronnes, passe), ou `{ erreur }` : 'dejaPris', 'fonds' (avec `manque`).
 */
export function acheterPasse(profil) {
  const p = migrerProfil(profil);
  if (p.route.passe) return { erreur: 'dejaPris' };
  const prix = R.saisons.passe.prix;
  if (p.couronnes < prix) return { erreur: 'fonds', manque: prix - p.couronnes };
  p.couronnes -= prix;
  p.route.passe = true;
  noter(p, { op: 'boutique', article: 'passe', saison: p.saison, prix });
  return { profil: p, evenements: [
    { type: 'couronnes', variation: -prix, origine: 'passe', total: p.couronnes },
    { type: 'passe', saison: p.saison },
  ] };
}

// --- La partie ---------------------------------------------------------------

/**
 * Ce qu'une partie doit savoir de la progression du joueur, à passer tel quel
 * à World (js/game.js) :
 *   - `classe` : la partie classée. Ses troupes jouent à leur niveau, plafonné
 *     par la ligue ; l'ordinateur, tant qu'il tient lieu d'adversaire, a la
 *     force de la ligue (PROGRESSION.echelle) et ne forme que les troupes
 *     avancées que cette ligue offre ;
 *   - `libre` : la partie libre contre l'ordinateur. Ses troupes jouent à leur
 *     niveau réel, l'adversaire reste celui que le joueur a réglé.
 * Dans les deux cas, le joueur ne forme pas les troupes qu'il n'a pas
 * débloquées, et l'ordinateur ne lui oppose pas une troupe hors de sa portée.
 *
 * Deux listes le disent, une par camp chacune. `troupesInterdites` : ce qu'un
 * camp ne peut pas former. `troupesEnPlus` : les troupes `enPlus` des réglages
 * (celles des ligues 6 à 8), que l'ordinateur ne forme jamais de lui-même —
 * il les reçoit ici, celles de la ligue en partie classée, celles que le
 * joueur a débloquées en partie libre. Rien pour le joueur : il forme ce qu'il
 * veut de ce qui ne lui est pas interdit.
 */
export function reglagesDePartie(profil, mode = 'classe') {
  const p = migrerProfil(profil);
  const classe = mode === 'classe';
  const niveauxDuJoueur = {};
  for (const type of EXISTANTES) {
    const niveau = niveauEffectif(p, type, { mode: classe ? 'classe' : 'ordinateur', ligue: p.ligue });
    if (niveau > 1) niveauxDuJoueur[type] = niveau;
  }
  const aDebloquer = AVANCEES.filter((type) => !p.debloquees[type]);
  // (En partie libre, ce que le joueur n'a pas débloqué, l'ordinateur ne le forme pas non plus.)
  if (!classe) {
    return {
      niveaux: [niveauxDuJoueur, {}],
      troupesInterdites: [aDebloquer, aDebloquer],
      troupesEnPlus: [[], EN_PLUS.filter((type) => p.debloquees[type])],
    };
  }
  const adversaire = R.echelle[p.ligue - 1];
  const niveauxAdverses = {};
  if (adversaire.niveau > 1) for (const type of EXISTANTES) niveauxAdverses[type] = adversaire.niveau;
  const offerte = (type) => R.troupes[type].gratuite.ligue <= p.ligue;
  return {
    difficulty: adversaire.difficulte,
    recolteAdverse: adversaire.recolte,
    niveaux: [niveauxDuJoueur, niveauxAdverses],
    troupesInterdites: [aDebloquer, AVANCEES.filter((type) => !offerte(type))],
    troupesEnPlus: [[], EN_PLUS.filter(offerte)],
  };
}

/**
 * L'issue d'une partie finie, dans les mots d'appliquerResultat, à partir du
 * résultat que rend World (`gameOver`) : une victoire, une égalité (personne
 * ne l'emporte au temps), un abandon, sinon une défaite.
 */
export function issueDePartie(resultat) {
  if (!estObjet(resultat)) return 'annulee';
  if (resultat.victory === true) return 'victoire';
  if (resultat.winner === -1) return 'egalite';
  return resultat.resigned ? 'abandon' : 'defaite';
}

// --- Recherche d'adversaire ------------------------------------------------------

/** L'écart d'Elo accepté après `secondes` d'attente : il s'élargit par paliers, jusqu'à un maximum. */
export function fenetreDeRecherche(secondes) {
  const r = R.recherche;
  const attente = typeof secondes === 'number' && secondes > 0 ? secondes : 0;
  const fenetre = r.fenetre + r.pas * Math.floor(attente / r.periode);
  return fenetre < r.fenetreMax ? fenetre : r.fenetreMax;
}

/**
 * Forme les parties à partir de la file d'attente.
 *
 * `file` = [{ id, elo, depuis, dernierAdversaire }] : `depuis` est l'heure
 * d'entrée dans la file, `maintenant` l'heure qu'il est, en secondes toutes les
 * deux ; `dernierAdversaire` l'identifiant du dernier joueur affronté (`ligue`,
 * facultatif, dit la ligue du joueur quand elle ne se déduit pas de son score).
 *
 * Deux joueurs peuvent s'affronter si leur écart tient dans la fenêtre de
 * CHACUN et s'ils ne viennent pas de jouer ensemble. Les paires se forment de
 * l'écart le plus petit au plus grand ; à écart égal, celui qui attend depuis
 * le plus longtemps passe d'abord. Le résultat ne dépend que de la file.
 *
 * Renvoie {
 *   paires     : [{ a, b, ecart }] — deux identifiants et leur écart d'Elo,
 *   ordinateur : [{ id, classee }] — ceux qui ont attendu assez pour qu'on
 *                leur propose l'ordinateur ; `classee` dit si cette partie
 *                comptera pour l'Elo (voir recherche.ordinateurClasseJusqua),
 *   enAttente  : [id] — ceux qui cherchent encore,
 * }
 */
export function apparier(file, maintenant) {
  const r = R.recherche;
  const joueurs = [];
  const vus = new Set();
  const liste = Array.isArray(file) ? file : [];
  for (let rang = 0; rang < liste.length; rang++) {
    const j = liste[rang];
    if (!estObjet(j) || !estNombre(j.elo) || vus.has(j.id)) continue;
    if (typeof j.id !== 'string' && typeof j.id !== 'number') continue;
    vus.add(j.id);
    const attente = estNombre(j.depuis) && maintenant > j.depuis ? maintenant - j.depuis : 0;
    joueurs.push({
      id: j.id, elo: j.elo, rang, attente, fenetre: fenetreDeRecherche(attente),
      dernier: j.dernierAdversaire, ligue: j.ligue === undefined ? ligueDe(j.elo) : ligueValide(j.ligue), pris: false,
    });
  }

  // Les paires possibles : rangés par score, on ne compare que des voisins.
  const parScore = [...joueurs].sort((x, y) => x.elo - y.elo || x.rang - y.rang);
  const possibles = [];
  for (let i = 0; i < parScore.length; i++) {
    for (let k = i + 1; k < parScore.length; k++) {
      const x = parScore[i], y = parScore[k];
      const ecart = y.elo - x.elo;
      if (ecart > r.fenetreMax) break;
      if (ecart > x.fenetre || ecart > y.fenetre) continue;
      if (x.dernier === y.id || y.dernier === x.id) continue;
      const [a, b] = x.attente > y.attente || (x.attente === y.attente && x.rang < y.rang) ? [x, y] : [y, x];
      possibles.push({ a, b, ecart });
    }
  }
  possibles.sort((x, y) => x.ecart - y.ecart || y.a.attente - x.a.attente || x.a.rang - y.a.rang || x.b.rang - y.b.rang);

  const paires = [];
  for (const { a, b, ecart } of possibles) {
    if (a.pris || b.pris) continue;
    a.pris = b.pris = true;
    paires.push({ a: a.id, b: b.id, ecart });
  }
  const ordinateur = [];
  const enAttente = [];
  for (const j of joueurs) {
    if (j.pris) continue;
    if (j.attente >= r.ordinateurApres) ordinateur.push({ id: j.id, classee: j.ligue <= r.ordinateurClasseJusqua });
    else enAttente.push(j.id);
  }
  return { paires, ordinateur, enAttente };
}
