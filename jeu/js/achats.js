// ---------------------------------------------------------------------------
// Les achats en argent réel : le pont entre la boutique et le magasin
// d'applications (App Store, Google Play).
//
// Ce qui se vend en argent réel, et rien d'autre : les lots de Couronnes
// (consommables) et l'offre de bienvenue (achat unique, restaurable). Jamais
// de coffre, de fragment ni de niveau : rien d'aléatoire.
//
// Trois pièces :
//   le GUICHET   — celui qui encaisse. Dans l'application, c'est le magasin
//                  (extension native « NativePurchases » : voir guichetNatif) ;
//                  dans la page web, un guichet simulé qui n'encaisse rien et
//                  sert à essayer la chaîne entière. Tous ont la même forme.
//   la LIVRAISON — un achat encaissé devient des Couronnes ou des troupes par
//                  js/progression.js, sur preuve, une seule fois par
//                  transaction (le profil retient les numéros déjà livrés).
//   l'ORDRE      — livrer, ranger le profil, PUIS clore la transaction auprès
//                  du magasin. Si l'application s'arrête entre deux, le
//                  magasin représente la transaction au lancement suivant
//                  (rattraper), et le numéro déjà livré empêche de la compter
//                  deux fois.
//
// OUVRIR LES VENTES : passer `boutique.argentReel` à true dans
// js/progression-config.js, et créer dans App Store Connect et dans la Play
// Console les produits de PRODUITS, avec exactement ces identifiants. Tant
// que ce n'est pas fait, l'application ne montre aucun prix en argent réel.
//
// Tant qu'aucun serveur ne fait foi, la preuve d'un achat est la parole du
// magasin sur l'appareil (StoreKit vérifie la signature de ses transactions ;
// Google Play donne l'état de l'achat). Le jour où un serveur vérifie, il se
// branche dans `regler`, avant la livraison.
// ---------------------------------------------------------------------------

import { PROGRESSION as R } from './progression-config.js';
import { EN_MAGASIN } from './edition.js';
import { crediterLot, prendreOffreDeBienvenue } from './progression.js';

/**
 * Ce qui se vend en argent réel. `produit` est l'identifiant à créer tel quel
 * dans les deux magasins ; `consommable` dit s'il se rachète (les Couronnes)
 * ou s'il s'achète une fois et se restaure (l'offre de bienvenue).
 */
export const PRODUITS = Object.freeze([
  ...R.boutique.lots.map((lot) => Object.freeze({ produit: lot.produit, genre: 'lot', id: lot.id, consommable: true, prixCentimes: lot.prixCentimes })),
  Object.freeze({ produit: R.boutique.offres.bienvenue.produit, genre: 'offre', id: 'bienvenue', consommable: false, prixCentimes: R.boutique.offres.bienvenue.prixCentimes }),
]);
const PAR_PRODUIT = new Map(PRODUITS.map((p) => [p.produit, p]));

// --- Les guichets ------------------------------------------------------------------
//
// Un guichet, quel qu'il soit :
//   nom              « simule », « apple » ou « google »
//   ouvrir()         → vrai si l'appareil peut acheter
//   prix(produits)   → { produit: « 0,99 € » } : le prix dit par le magasin,
//                      dans la monnaie du joueur (absent : produit pas en vente)
//   acheter(produit) → { etat, produit, transaction } ; `etat` vaut « achete »,
//                      « annule », « attente » (le magasin confirmera plus
//                      tard) ou « erreur »
//   enSouffrance()   → les achats encaissés que le jeu n'a pas encore clos
//   terminer(achat)  → clôt l'achat auprès du magasin (consomme un consommable)
//   restaurer()      → les achats uniques que le compte du joueur possède
//   ecouter(f)       → (facultatif) appelle f(achat) quand un achat arrive
//                      hors d'un appel à `acheter` (un accord parental donné
//                      plus tard, par exemple)

/**
 * Le guichet simulé : il n'encaisse rien. `issue` fixe ce qu'il répond
 * (« achete » par défaut) ; `numero` fabrique les numéros de transaction.
 */
export function guichetSimule({ issue = 'achete', numero = null } = {}) {
  let rang = 0;
  const suivant = numero || (() => `essai-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}-${++rang}`);
  let souffrance = [];
  const possedes = [];
  return {
    nom: 'simule',
    reponse: issue,
    async ouvrir() { return true; },
    async prix() { return {}; },   // (La page affiche alors le prix des réglages.)
    async acheter(produit) {
      const article = PAR_PRODUIT.get(produit);
      if (!article) return { etat: 'erreur', raison: 'inconnu', produit };
      if (this.reponse !== 'achete') return { etat: this.reponse, produit };
      const achat = { etat: 'achete', produit, transaction: suivant() };
      souffrance.push({ produit, transaction: achat.transaction });
      if (!article.consommable) possedes.push({ produit, transaction: achat.transaction });
      return achat;
    },
    async enSouffrance() { return souffrance.map((a) => ({ ...a })); },
    async terminer(achat) { souffrance = souffrance.filter((a) => a.transaction !== achat.transaction); },
    async restaurer() { return possedes.map((a) => ({ ...a })); },
  };
}

/**
 * Le guichet des magasins, par l'extension « NativePurchases »
 * (@capgo/native-purchases : StoreKit 2 sur iPhone, Play Billing sur Android).
 * `plateforme` : « apple » ou « google ».
 *
 * Sur Android, un lot de Couronnes reste « possédé » tant qu'il n'est pas
 * consommé : c'est ce qui permet de le retrouver au lancement s'il n'a pas été
 * livré. On ne le consomme donc qu'après la livraison (`terminer`).
 * Sur iPhone, StoreKit clôt la transaction à l'achat ; ce que l'on retrouve au
 * lancement, ce sont les achats uniques, et ceux que le magasin confirme après
 * coup arrivent par `ecouter`.
 */
export function guichetNatif(extension, plateforme = 'apple') {
  const GENRE = 'inapp';
  const achatDe = (t) => ({
    produit: t.productIdentifier,
    transaction: String(t.transactionId || t.orderId || t.purchaseToken || ''),
    jeton: t.purchaseToken || null,
  });
  // (Play : PURCHASED = 1, PENDING = 2 ; l'extension peut aussi le dire en toutes lettres.)
  const enAttente = (t) => /pending|^2$/i.test(String(t && t.purchaseState !== undefined ? t.purchaseState : ''));
  const connus = (liste) => (liste || []).filter((t) => t && PAR_PRODUIT.has(t.productIdentifier) && !enAttente(t)).map(achatDe).filter((a) => a.transaction);
  return {
    nom: plateforme,
    async ouvrir() {
      try { const r = await extension.isBillingSupported(); return !!(r && r.isBillingSupported); } catch { return false; }
    },
    async prix(produits) {
      const r = await extension.getProducts({ productIdentifiers: produits, productType: GENRE });
      return Object.fromEntries(((r && r.products) || []).filter((p) => p && p.identifier && p.priceString).map((p) => [p.identifier, p.priceString]));
    },
    async acheter(produit) {
      try {
        // (isConsumable: false : sur Android, c'est le jeu qui consomme, après avoir livré.)
        const t = await extension.purchaseProduct({ productIdentifier: produit, productType: GENRE, quantity: 1, isConsumable: false });
        if (!t || enAttente(t)) return { etat: 'attente', produit };
        const achat = achatDe({ productIdentifier: produit, ...t });
        return achat.transaction ? { etat: 'achete', ...achat } : { etat: 'erreur', raison: 'sansNumero', produit };
      } catch (erreur) {
        const message = String((erreur && (erreur.message || erreur.code)) || erreur || '');
        if (/cancel|annul/i.test(message)) return { etat: 'annule', produit };
        if (/pending|deferred|attente/i.test(message)) return { etat: 'attente', produit };
        return { etat: 'erreur', raison: 'magasin', produit, message };
      }
    },
    async enSouffrance() {
      const r = await extension.getPurchases({ productType: GENRE });
      return connus(r && r.purchases);
    },
    async terminer(achat) {
      const article = PAR_PRODUIT.get(achat.produit);
      if (plateforme !== 'google' || !achat.jeton) return;
      if (article && article.consommable) await extension.consumePurchase({ purchaseToken: achat.jeton });
      else if (extension.acknowledgePurchase) await extension.acknowledgePurchase({ purchaseToken: achat.jeton });
    },
    async restaurer() {
      await extension.restorePurchases();
      const r = await extension.getPurchases({ productType: GENRE });
      return connus(r && r.purchases).filter((a) => !PAR_PRODUIT.get(a.produit).consommable);
    },
    ecouter(fonction) {
      if (!extension.addListener) return;
      extension.addListener('transactionUpdated', (t) => { const [achat] = connus([t]); if (achat) fonction(achat); });
    },
  };
}

/**
 * Le guichet de cette édition : le simulé dans la page web ; dans
 * l'application, celui du magasin si les ventes sont ouvertes et l'extension
 * présente — sinon aucun, et la boutique ne montre aucun prix en argent réel.
 * (`ouvertes` et `hote` ne se donnent que dans les essais.)
 */
export function guichetParDefaut({ ouvertes = R.boutique.argentReel === true, hote = typeof globalThis !== 'undefined' ? globalThis.Capacitor : null } = {}) {
  if (!EN_MAGASIN) return guichetSimule();
  if (!ouvertes) return null;
  const extension = hote && hote.Plugins ? hote.Plugins.NativePurchases : null;
  if (!extension) return null;
  return guichetNatif(extension, hote.getPlatform && hote.getPlatform() === 'android' ? 'google' : 'apple');
}

// --- L'état des ventes ---------------------------------------------------------------

let guichet = null;      // celui qui encaisse ; null : ventes fermées
let ouvert = false;      // il a répondu présent
let affiches = {};       // les prix dits par le magasin, par produit
let enCours = null;      // le produit dont l'achat est en route

/** Vrai quand quelque chose peut s'acheter ici (pour de vrai, ou en simulation). */
export const ventesOuvertes = () => !!guichet && ouvert;
/** Vrai quand le guichet est le simulé : rien n'est encaissé. */
export const ventesSimulees = () => ventesOuvertes() && guichet.nom === 'simule';
/** Le produit dont l'achat est en route, ou null. */
export const achatEnCours = () => enCours;
/** Le prix dit par le magasin pour ce produit (« 0,99 € », dans la monnaie du joueur), ou null. */
export const prixAffiche = (produit) => (typeof affiches[produit] === 'string' ? affiches[produit] : null);
/** Vrai si ce produit s'achète ici, maintenant : au guichet simulé, tous ; au magasin, ceux dont il a dit le prix. */
export const vendable = (produit) => ventesOuvertes() && PAR_PRODUIT.has(produit) && (guichet.nom === 'simule' || prixAffiche(produit) !== null);

/**
 * Redemande ses prix au magasin (au lancement ; puis à l'ouverture de la
 * boutique s'il n'avait pas répondu — l'appareil était hors ligne). Renvoie
 * vrai si au moins un produit a maintenant son prix.
 */
export async function relireLesPrix() {
  if (!ventesOuvertes()) return false;
  const mien = guichet;
  let lus = {};
  try { lus = (await mien.prix(PRODUITS.map((p) => p.produit))) || {}; } catch { lus = {}; }
  if (guichet !== mien) return false;
  if (Object.keys(lus).length || !Object.keys(affiches).length) affiches = lus;
  return PRODUITS.some((p) => prixAffiche(p.produit) !== null);
}
/** Vrai quand le magasin est ouvert mais n'a dit aucun prix : il faudra les lui redemander. */
export const prixManquants = () => ventesOuvertes() && guichet.nom !== 'simule' && !PRODUITS.some((p) => prixAffiche(p.produit) !== null);

/** Ferme les ventes (les essais ; un changement de guichet). */
export function fermerLesVentes() { guichet = null; ouvert = false; affiches = {}; enCours = null; }

/**
 * Ouvre les ventes avec ce guichet : lui demande s'il peut vendre, relève ses
 * prix, livre ce qui restait en souffrance, et écoute les achats qui
 * arriveront plus tard. `rangement` : `{ lire, ecrire }` — lire le profil, le
 * ranger (ecrire renvoie false si l'appareil refuse). `quandUnAchatArrive(r)`
 * est appelé pour chaque achat livré hors d'un appel à `acheter`.
 * Renvoie les achats rattrapés (souvent aucun).
 */
export async function ouvrirLesVentes(nouveau, rangement, { quandUnAchatArrive = null } = {}) {
  fermerLesVentes();
  if (!nouveau) return [];
  try { if (!(await nouveau.ouvrir())) return []; } catch { return []; }
  guichet = nouveau;
  ouvert = true;
  await relireLesPrix();
  if (guichet.ecouter) {
    const mien = guichet;
    try {
      guichet.ecouter((achat) => {
        if (guichet !== mien) return;
        regler(achat, rangement).then((r) => { if (r.etat === 'achete' && quandUnAchatArrive) quandUnAchatArrive(r); }).catch(() => {});
      });
    } catch { /* sans écoute : le rattrapage du lancement suffit */ }
  }
  return rattraper(rangement);
}

// --- Livrer ------------------------------------------------------------------------------

/**
 * Ce qu'un achat encaissé donne au profil — sans rien ranger. Renvoie
 * `{ profil, evenements }`, ou `{ erreur }` : 'inconnu' (produit que le jeu ne
 * vend pas), 'preuve', 'dejaCredite', 'fermee'.
 */
export function livrer(profil, achat, { restauration = false } = {}) {
  const article = achat ? PAR_PRODUIT.get(achat.produit) : null;
  if (!article) return { erreur: 'inconnu' };
  const preuve = { valide: true, transaction: achat.transaction };
  if (article.genre === 'lot') return crediterLot(profil, article.id, { ...preuve, lot: article.id });
  return prendreOffreDeBienvenue(profil, { ...preuve, offre: article.id, ...(restauration ? { restauration: true } : {}) });
}

/** Livre, range, puis clôt. Jamais clos sans être rangé : le magasin représentera l'achat. */
async function regler(achat, { lire, ecrire }, options = {}) {
  const r = livrer(lire(), achat, options);
  if (r.erreur === 'dejaCredite' || r.erreur === 'fermee') {
    try { await guichet.terminer(achat); } catch { /* il sera clos une autre fois */ }
    return { etat: 'deja', produit: achat.produit };
  }
  if (r.erreur) return { etat: 'erreur', raison: r.erreur, produit: achat.produit };
  if (!ecrire(r.profil)) return { etat: 'erreur', raison: 'ecriture', produit: achat.produit };
  try { await guichet.terminer(achat); } catch { /* livré et rangé : le numéro retenu empêchera de le recompter */ }
  return { etat: 'achete', produit: achat.produit, profil: r.profil, evenements: r.evenements };
}

/**
 * Achète un produit : le guichet encaisse, puis l'achat est livré, rangé et
 * clos. Renvoie `{ etat, produit }` — « achete » (avec `profil` et
 * `evenements`), « annule », « attente », « deja », « erreur » (avec `raison`),
 * « ferme » (rien ne se vend ici) ou « occupe » (un achat est déjà en route).
 */
export async function acheter(produit, rangement) {
  if (!vendable(produit)) return { etat: 'ferme', produit };
  if (enCours) return { etat: 'occupe', produit };
  enCours = produit;
  try {
    const achat = await guichet.acheter(produit);
    if (!achat || achat.etat !== 'achete') return achat || { etat: 'erreur', raison: 'magasin', produit };
    return await regler(achat, rangement);
  } catch {
    return { etat: 'erreur', raison: 'magasin', produit };
  } finally {
    enCours = null;
  }
}

/**
 * Livre ce que le magasin a encaissé et que le jeu n'a pas clos (au lancement).
 * Renvoie ce qui a été livré. Un achat unique que le compte possède y revient à
 * chaque lancement : le numéro retenu par le profil fait qu'il n'est livré
 * qu'une fois — et en entier, car on ne peut pas le distinguer d'un achat payé
 * dont la livraison a été interrompue.
 */
export async function rattraper(rangement) {
  if (!ventesOuvertes()) return [];
  let liste = [];
  try { liste = await guichet.enSouffrance(); } catch { return []; }
  const livres = [];
  for (const achat of liste) {
    const r = await regler(achat, rangement);
    if (r.etat === 'achete') livres.push(r);
  }
  return livres;
}

/**
 * « Restaurer mes achats » : rend les achats uniques que le compte du joueur
 * possède (l'offre de bienvenue : ses troupes). Renvoie `{ etat, rendus }` —
 * « restaure » avec ce qui a été rendu (peut-être rien), « ferme », « erreur ».
 */
export async function restaurer(rangement) {
  if (!ventesOuvertes()) return { etat: 'ferme', rendus: [] };
  let liste = [];
  try { liste = await guichet.restaurer(); } catch { return { etat: 'erreur', rendus: [] }; }
  const rendus = [];
  for (const achat of liste) {
    const r = await regler(achat, rangement, { restauration: true });
    if (r.etat === 'achete') rendus.push(r);
  }
  return { etat: 'restaure', rendus };
}
