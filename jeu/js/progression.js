// ---------------------------------------------------------------------------
// Moteur de progression : classement, ligues, coffres, fragments et niveaux
// des troupes.
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
const ORIGINES = ['ligue', 'parties', 'achat'];   // d'une troupe avancée ; une troupe de base est « base »
const ORIGINES_DE_COFFRE = ['victoire', 'bataille', 'promotion', 'semaine', 'saison'];
const ISSUES = ['victoire', 'defaite', 'egalite', 'abandon', 'abandonAdverse', 'annulee'];
const COMPTEURS = { victoire: 'victoires', defaite: 'defaites', egalite: 'egalites' };

const existe = (type) => typeof type === 'string' && possede(R.troupes, type) && !R.troupes[type].aVenir;
const ligueValide = (ligue) => entier(ligue, 1, NB_LIGUES, 1);

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
 *   abandonsPrecoces: parmi les défaites, les abandons d'avant
 *                     abandon.precoceAvant — ils coûtent leurs points mais ne
 *                     font avancer ni vers une troupe, ni vers un coffre
 *   pointsDeBataille: ce qui est acquis vers le prochain coffre d'argent
 *   coffres         : ceux qui attendent d'être ouverts, `{ type, origine }`
 *   troupes         : niveau et fragments de chaque troupe du jeu
 *   debloquees      : type → d'où vient la troupe (base, ligue, parties, achat)
 *   eclats          : fragments en trop, pour les apparences
 *   saison, saisons : le numéro de la saison en cours, ce que furent les précédentes
 *   jour, semaine   : compteurs remis à zéro quand la date change
 *   rechercheFermeeJusqua : heure (en secondes) jusqu'à laquelle la recherche
 *                     d'adversaire est fermée ; 0 si elle est ouverte
 *   operations, journal : nombre d'opérations faites, et les dernières
 */
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
    pointsDeBataille: 0,
    coffres: [],
    troupes,
    debloquees,
    eclats: 0,
    saison: 1,
    saisons: [],
    jour: { date: '', parties: 0, coffresBois: 0, abandonsPrecoces: 0 },
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
  p.pointsDeBataille = entier(o.pointsDeBataille, 0, R.sources.argent.tousLes - 1, 0);
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
    p.jour.coffresBois = entier(o.jour.coffresBois, 0, GRAND, 0);
    p.jour.abandonsPrecoces = entier(o.jour.abandonsPrecoces, 0, GRAND, 0);
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
    evenements.push({ type: 'troupeDebloquee', troupe: type, origine });
  }
}

/** Promotion immédiate tant que le seuil suivant est atteint ; la récompense ne se donne qu'une fois. */
function promouvoir(p, evenements) {
  while (p.ligue < NB_LIGUES && p.elo >= R.ligues[p.ligue].seuil) {
    const de = p.ligue;
    p.ligue++;
    const ligue = R.ligues[p.ligue - 1];
    if (p.ligue > p.plusHauteLigue) p.plusHauteLigue = p.ligue;
    evenements.push({ type: 'promotion', de, a: p.ligue, nom: ligue.nom, plafond: ligue.plafond });
    if (ligue.promotion && !p.promotions.includes(p.ligue)) {
      p.promotions.push(p.ligue);
      evenements.push({ type: 'recompensePromotion', ligue: p.ligue, coffre: ligue.promotion.coffre, cadeaux: copier(ligue.promotion.cadeaux) });
      donnerCoffre(p, ligue.promotion.coffre, 'promotion', evenements);
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

/** Met la ligue, l'ouvrier et les troupes gratuites d'accord avec le score et les compteurs. */
function mettreAJour(p, evenements) {
  promouvoir(p, evenements);
  retrograder(p, evenements, 1);
  monterOuvrier(p, evenements);
  debloquerGratuites(p, evenements);
}

/**
 * Donne à un profil ce que les règles lui doivent et qu'il n'a pas encore :
 * une promotion due, une troupe dont la condition gratuite est remplie,
 * l'ouvrier au plafond. Sans effet sur un profil à jour. À appeler après un
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
  if (rangDuJour(jour) === null || jour <= p.jour.date) return;
  p.jour = { date: jour, parties: 0, coffresBois: 0, abandonsPrecoces: 0 };
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
 *   partieAnnulee, elo, promotion, recompensePromotion, coffre,
 *   ouvrierAuPlafond, retrogradation, troupeDebloquee, coffreDeBoisPlafonne,
 *   pointsDeBataille, rechercheFermee.
 *
 * Les règles :
 *   - un abandon est une défaite ; avant abandon.precoceAvant il coûte ses
 *     points mais ne compte ni comme une partie jouée (troupes gratuites, jour
 *     joué de la semaine) ni vers le coffre d'argent ;
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

  const precoce = !(partie.duree >= R.abandon.precoceAvant);   // une durée illisible vaut « précoce »
  const jour = rangDuJour(partie.jour) === null ? '' : partie.jour;
  changerDeJour(p, jour);

  let issue = issueDite;
  if (issue === 'abandonAdverse') issue = precoce ? 'annulee' : 'victoire';
  if (issue === 'annulee') {
    evenements.push({ type: 'partieAnnulee', raison: issueDite === 'annulee' ? 'annulee' : 'abandonAdversePrecoce' });
    noter(p, { op: 'partie', issue: 'annulee', jour, elo: p.elo, variation: 0 });
    return { profil: p, evenements };
  }
  const abandon = issue === 'abandon';
  if (abandon) issue = 'defaite';

  p.parties++;
  p[COMPTEURS[issue]]++;
  if (abandon && precoce) p.abandonsPrecoces++;

  // Le score, puis la ligue qui en découle.
  const classee = partie.contreOrdinateur !== true || p.ligue <= R.recherche.ordinateurClasseJusqua;
  const avant = p.elo;
  if (classee) p.elo = Math.max(R.elo.plancher, p.elo + R.elo[issue]);
  evenements.push({ type: 'elo', avant, apres: p.elo, variation: p.elo - avant, classee });
  promouvoir(p, evenements);
  retrograder(p, evenements, R.retrogradation.aPartirDe - 1);
  debloquerGratuites(p, evenements);

  // Les coffres : bois à chaque victoire, argent aux points de bataille, or à
  // la semaine.
  if (issue === 'victoire') {
    if (p.jour.coffresBois < R.sources.bois.parJourAuPlus) {
      p.jour.coffresBois++;
      donnerCoffre(p, 'bois', 'victoire', evenements);
    } else {
      evenements.push({ type: 'coffreDeBoisPlafonne', parJour: R.sources.bois.parJourAuPlus });
    }
  }
  const argent = R.sources.argent;
  const gagnes = abandon && precoce ? argent.abandonPrecoce : argent[issue];
  p.pointsDeBataille += gagnes;
  const coffresDArgent = Math.floor(p.pointsDeBataille / argent.tousLes);
  p.pointsDeBataille -= coffresDArgent * argent.tousLes;
  evenements.push({ type: 'pointsDeBataille', gagnes, total: p.pointsDeBataille, pour: argent.tousLes });
  for (let i = 0; i < coffresDArgent; i++) donnerCoffre(p, 'argent', 'bataille', evenements);
  if (!(abandon && precoce)) compterLeJour(p, evenements);

  // Trop d'abandons précoces dans la journée : la recherche se ferme.
  if (abandon && precoce) {
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
 * Clôt la saison : récompense selon la ligue où l'on finit, puis ce qui
 * dépasse saison.pivot est réduit (2 350 repart à 1 550) et la saison suivante
 * commence. Sous le pivot, rien ne bouge. Les récompenses déjà gagnées et la
 * plus haute ligue atteinte restent. Renvoie `{ profil, evenements }`
 * (recompenseSaison, coffre, remiseDeSaison, retrogradation, saison).
 */
export function finDeSaison(profil) {
  const p = migrerProfil(profil);
  const evenements = [];
  const finie = { numero: p.saison, ligue: p.ligue, elo: p.elo };
  const recompense = R.ligues[p.ligue - 1].finDeSaison;
  if (recompense) {
    evenements.push({ type: 'recompenseSaison', saison: p.saison, ligue: p.ligue, coffre: recompense.coffre, cadeaux: copier(recompense.cadeaux) });
    donnerCoffre(p, recompense.coffre, 'saison', evenements);
  }
  const { pivot, garde, jamaisSousLaLigue } = R.saison;
  if (p.elo > pivot) p.elo = pivot + Math.floor((p.elo - pivot) * garde);
  evenements.push({ type: 'remiseDeSaison', avant: finie.elo, apres: p.elo, variation: p.elo - finie.elo });
  retrograder(p, evenements, jamaisSousLaLigue);
  p.saisons.push(finie);
  if (p.saisons.length > R.profil.saisons) p.saisons.splice(0, p.saisons.length - R.profil.saisons);
  p.saison++;
  evenements.push({ type: 'saison', numero: p.saison });
  noter(p, { op: 'saison', numero: finie.numero, ligue: finie.ligue, elo: p.elo, variation: p.elo - finie.elo });
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
 * disponible, le tirage passe à la catégorie du dessous — quantité comprise ;
 * sous la plus basse, ses fragments deviennent des éclats. Il consomme
 * toujours deux nombres, même quand il n'y a pas le choix : la suite des
 * tirages ne dépend ainsi que de la graine.
 */
function tirer(p, regles, groupe, alea) {
  const tiree = categorieTiree(groupe.table, alea());
  const hasard = alea();
  let rang = R.categories.indexOf(tiree);
  let choix = [];
  for (; rang >= 0; rang--) {
    choix = disponibles(p, R.categories[rang]);
    if (choix.length > 0) break;
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
 * Renvoie `{ profil, coffre, tirages, evenements }`, ou `{ erreur }` ('alea',
 * 'coffre'). Chaque tirage dit son `genre` (ordinaire, garanti), la catégorie
 * `tiree`, la `categorie` où il a fini (null s'il n'a rien trouvé), la
 * `troupe`, ses `fragments`, ou les `eclats` qu'il est devenu. Les événements :
 * coffreOuvert (le total par troupe), ameliorationPossible.
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
  const evenements = [{ type: 'coffreOuvert', coffre: coffre.type, origine: coffre.origine, fragments, eclats }];
  for (const type of Object.keys(fragments)) {
    const troupe = p.troupes[type];
    if (troupe.fragments >= coutAmelioration(type, troupe.niveau)) {
      evenements.push({ type: 'ameliorationPossible', troupe: type, niveau: troupe.niveau + 1 });
    }
  }
  // Le journal garde ce que le coffre a donné, pas le détail de chaque tirage :
  // il est recopié à chaque opération, autant qu'il reste léger.
  noter(p, { op: 'coffre', coffre: coffre.type, origine: coffre.origine, fragments: { ...fragments }, eclats });
  return { profil: p, coffre: coffre.type, tirages, evenements };
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
  for (const categorie of R.categories) moyenne[categorie] = parts[categorie] / 1000;
  return { coffre: typeDeCoffre, nom: regles.nom, tirages, groupes, moyenne };
}

/**
 * Vérifie les tables de tous les coffres : des parts entières, positives, qui
 * somment à 1000 ; des catégories connues ; un nombre de fragments pour
 * chacune. Renvoie `{ valide, erreurs }`.
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
    });
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
  const { fois = {}, plus = {}, pose = {} } = R.troupes[type].ameliorations || {};
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
 * Dans les deux cas, le joueur ne forme pas les troupes qu'il n'a pas débloquées.
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
  if (!classe) return { niveaux: [niveauxDuJoueur, {}], troupesInterdites: [aDebloquer, []] };
  const adversaire = R.echelle[p.ligue - 1];
  const niveauxAdverses = {};
  if (adversaire.niveau > 1) for (const type of EXISTANTES) niveauxAdverses[type] = adversaire.niveau;
  return {
    difficulty: adversaire.difficulte,
    recolteAdverse: adversaire.recolte,
    niveaux: [niveauxDuJoueur, niveauxAdverses],
    troupesInterdites: [aDebloquer, AVANCEES.filter((type) => R.troupes[type].gratuite.ligue > p.ligue)],
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
