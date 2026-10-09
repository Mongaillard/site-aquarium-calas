// Les achats en argent réel : le guichet (simulé, App Store, Google Play), la
// livraison, l'ordre « livrer, ranger, puis clore », le rattrapage au
// lancement, la restauration — et l'écran de la boutique qui s'en sert.
// Lancement : node test/achats.test.js

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROGRESSION as R } from '../js/progression-config.js';
import { profilNeuf, migrerProfil } from '../js/progression.js';
import {
  PRODUITS, guichetSimule, guichetNatif, guichetParDefaut, ouvrirLesVentes, fermerLesVentes,
  ventesOuvertes, ventesSimulees, vendable, prixAffiche, achatEnCours, livrer, acheter, rattraper, restaurer, prixManquants, relireLesPrix,
} from '../js/achats.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${detail ? ' — ' + detail : ''}`);
}
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const B = R.boutique;
const texte = (html) => html.replace(/<[^>]*>/g, ' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');

/** Un rangement en mémoire : le profil, combien de fois il a été rangé, et un interrupteur de panne. */
function rangementEnMemoire(profil = profilNeuf()) {
  const r = { profil, ecritures: 0, enPanne: false };
  r.lire = () => r.profil;
  r.ecrire = (p) => { if (r.enPanne) return false; r.profil = migrerProfil(p); r.ecritures++; return true; };
  return r;
}
/** Des numéros de transaction prévisibles. */
const numeros = (prefixe = 't') => { let n = 0; return () => `${prefixe}-${++n}`; };

// --- Ce qui se vend -------------------------------------------------------------------
console.log('--- Ce qui se vend ---');
{
  check('six produits : les cinq lots de Couronnes, consommables, et l’offre de bienvenue, achat unique',
    PRODUITS.length === 6 && PRODUITS.filter((p) => p.genre === 'lot' && p.consommable).length === 5
    && egal(PRODUITS.filter((p) => !p.consommable).map((p) => [p.produit, p.genre, p.id]), [['offre.bienvenue', 'offre', 'bienvenue']]));
  check('leurs identifiants sont ceux des réglages, uniques, au format des deux magasins',
    egal(PRODUITS.map((p) => p.produit), [...B.lots.map((l) => l.produit), B.offres.bienvenue.produit])
    && new Set(PRODUITS.map((p) => p.produit)).size === 6 && PRODUITS.every((p) => /^[a-z0-9][a-z0-9._]{2,80}$/.test(p.produit)));
  check('rien d’aléatoire ni de puissance : ni coffre, ni fragment, ni niveau parmi les produits',
    !/coffre(?!t)|fragment|niveau/i.test(JSON.stringify(PRODUITS)));
  check('les ventes restent fermées dans l’application tant que l’interrupteur n’est pas mis', B.argentReel === false);
}

// --- Livrer ------------------------------------------------------------------------------
console.log('\n--- Livrer ---');
{
  const neuf = profilNeuf();
  const lot = livrer(neuf, { produit: 'couronnes.bourse', transaction: 'a-1' });
  check('un lot encaissé : ses Couronnes, sa transaction retenue', lot.profil.couronnes === 550 && egal(lot.profil.boutique.transactions, ['a-1']) && neuf.couronnes === 0);
  const offre = livrer(neuf, { produit: 'offre.bienvenue', transaction: 'a-2' });
  check('l’offre de bienvenue encaissée : ses deux troupes et ses 300 Couronnes',
    offre.profil.debloquees.triton === 'achat' && offre.profil.debloquees.horseArcher === 'achat' && offre.profil.couronnes === 300);
  check('une transaction déjà livrée, un produit inconnu, un achat sans numéro : rien',
    livrer(lot.profil, { produit: 'couronnes.bourse', transaction: 'a-1' }).erreur === 'dejaCredite'
    && livrer(neuf, { produit: 'couronnes.sac', transaction: 'a-3' }).erreur === 'inconnu'
    && livrer(neuf, { produit: 'couronnes.bourse' }).erreur === 'preuve' && livrer(neuf, null).erreur === 'inconnu');
}

// --- Le guichet simulé, de bout en bout ---------------------------------------------------
console.log('\n--- Le guichet simulé ---');
{
  fermerLesVentes();
  const r0 = rangementEnMemoire();
  check('sans guichet, rien ne se vend', !ventesOuvertes() && !vendable('couronnes.bourse') && (await acheter('couronnes.bourse', r0)).etat === 'ferme' && (await restaurer(r0)).etat === 'ferme'
    && egal(await ouvrirLesVentes(null, r0), []) && !ventesOuvertes());

  const g = guichetSimule({ numero: numeros('s') });
  const r = rangementEnMemoire();
  const rattrapes = await ouvrirLesVentes(g, r);
  check('ouvert : les ventes sont dites simulées, tout produit connu s’y achète, aucun prix n’est inventé',
    ventesOuvertes() && ventesSimulees() && egal(rattrapes, []) && PRODUITS.every((p) => vendable(p.produit) && prixAffiche(p.produit) === null) && !vendable('couronnes.sac'));
  const achat = await acheter('couronnes.bourse', r);
  check('acheter un lot : encaissé, livré, rangé, clos',
    achat.etat === 'achete' && r.profil.couronnes === 550 && r.ecritures === 1 && egal(r.profil.boutique.transactions, ['s-1'])
    && achat.evenements.some((e) => e.type === 'couronnes' && e.variation === 550) && egal(await g.enSouffrance(), []) && achatEnCours() === null);
  check('… au lancement suivant, rien à rattraper', egal(await rattraper(r), []) && r.profil.couronnes === 550);
  const [un, deux] = await Promise.all([acheter('couronnes.poignee', r), acheter('couronnes.poignee', r)]);
  check('deux touchers à la fois : un seul achat part, l’autre est refusé', un.etat === 'achete' && deux.etat === 'occupe' && r.profil.couronnes === 650);
  g.reponse = 'annule';
  const annule = await acheter('couronnes.tresor', r);
  g.reponse = 'attente';
  const attente = await acheter('couronnes.tresor', r);
  g.reponse = 'achete';
  check('annulé, ou en attente du magasin : rien n’est livré, rien n’est rangé', annule.etat === 'annule' && attente.etat === 'attente' && r.profil.couronnes === 650 && r.ecritures === 2);
  check('un produit que le jeu ne vend pas ne part même pas au guichet', (await acheter('couronnes.sac', r)).etat === 'ferme');
}

// --- L'ordre : livrer, ranger, puis clore ----------------------------------------------------
console.log('\n--- Livrer, ranger, puis clore ---');
{
  // L'application s'arrête après avoir rangé, avant d'avoir clos : le magasin représente l'achat.
  const g = guichetSimule({ numero: numeros('c') });
  const clore = g.terminer.bind(g);
  let coupe = true;
  g.terminer = async (achat) => { if (coupe) throw new Error('arrêt'); return clore(achat); };
  const r = rangementEnMemoire();
  await ouvrirLesVentes(g, r);
  const achat = await acheter('couronnes.coffret', r);
  check('arrêt entre le rangement et la clôture : l’achat est livré, et reste en souffrance au magasin',
    achat.etat === 'achete' && r.profil.couronnes === 1200 && (await g.enSouffrance()).length === 1);
  coupe = false;
  const relance = await ouvrirLesVentes(g, r);
  check('… au lancement suivant il est représenté : pas compté deux fois, et clos pour de bon',
    egal(relance, []) && r.profil.couronnes === 1200 && r.ecritures === 1 && egal(await g.enSouffrance(), []));

  // L'appareil refuse d'écrire : rien n'est clos, l'achat sera livré plus tard.
  const g2 = guichetSimule({ numero: numeros('e') });
  const r2 = rangementEnMemoire();
  await ouvrirLesVentes(g2, r2);
  r2.enPanne = true;
  const rate = await acheter('couronnes.bourse', r2);
  check('sauvegarde impossible : l’achat n’est ni compté ni clos', rate.etat === 'erreur' && rate.raison === 'ecriture' && r2.profil.couronnes === 0 && (await g2.enSouffrance()).length === 1);
  r2.enPanne = false;
  const repris = await ouvrirLesVentes(g2, r2);
  check('… au lancement suivant il est livré, une fois', repris.length === 1 && repris[0].produit === 'couronnes.bourse' && r2.profil.couronnes === 550 && egal(await g2.enSouffrance(), [])
    && egal(await rattraper(r2), []) && r2.profil.couronnes === 550);
}

// --- Restaurer ---------------------------------------------------------------------------
console.log('\n--- Restaurer ---');
{
  const g = guichetSimule({ numero: numeros('r') });
  const r = rangementEnMemoire();
  await ouvrirLesVentes(g, r);
  await acheter('offre.bienvenue', r);
  await acheter('couronnes.poignee', r);
  check('l’offre de bienvenue achetée : deux troupes, 300 Couronnes, plus les 100 d’un lot', r.profil.debloquees.triton === 'achat' && r.profil.couronnes === 400 && r.profil.boutique.bienvenuePrise);
  const surPlace = await restaurer(r);
  check('restaurer sur le même profil : rien à rendre, rien ne change', surPlace.etat === 'restaure' && surPlace.rendus.length === 0 && r.profil.couronnes === 400);
  r.profil = profilNeuf();   // réinstallation : le profil repart de zéro, le compte du magasin se souvient
  const rendu = await restaurer(r);
  check('après une réinstallation : les troupes de l’offre reviennent, pas les Couronnes — et le lot consommé non plus',
    rendu.etat === 'restaure' && rendu.rendus.length === 1 && r.profil.debloquees.triton === 'achat' && r.profil.debloquees.horseArcher === 'achat'
    && r.profil.couronnes === 0 && r.profil.boutique.bienvenuePrise === true);
  g.restaurer = async () => { throw new Error('hors ligne'); };
  check('le magasin ne répond pas : dit, sans rien casser', (await restaurer(r)).etat === 'erreur');
}

// --- Le guichet de l'App Store --------------------------------------------------------------
console.log('\n--- Le guichet de l’App Store ---');
{
  const appels = [];
  let ecoute = null;
  let reponse = () => ({ transactionId: '2000000123', productIdentifier: 'couronnes.bourse' });
  const possedes = [];
  let nonClos = [];
  const extension = {
    configure: async (o) => { appels.push(['configure', o]); },
    getUnfinishedTransactions: async () => { appels.push(['getUnfinishedTransactions']); return { transactions: nonClos }; },
    finishTransaction: async (o) => { appels.push(['finishTransaction', o]); nonClos = nonClos.filter((x) => x.transactionId !== o.transactionId); },
    isBillingSupported: async () => ({ isBillingSupported: true }),
    getProducts: async (o) => { appels.push(['getProducts', o]); return { products: [
      { identifier: 'couronnes.poignee', priceString: '0,99 €' }, { identifier: 'couronnes.bourse', priceString: 'US$4.99' },
      { identifier: 'offre.bienvenue', priceString: '2,99 €' }, { identifier: 'autre.jeu', priceString: '9 €' }, { identifier: 'couronnes.butin' }] }; },
    purchaseProduct: async (o) => { appels.push(['purchaseProduct', o]); return reponse(o); },
    getPurchases: async (o) => { appels.push(['getPurchases', o]); return { purchases: possedes }; },
    restorePurchases: async () => { appels.push(['restorePurchases']); },
    consumePurchase: async (o) => { appels.push(['consumePurchase', o]); },
    addListener: (nom, f) => { if (nom === 'transactionUpdated') ecoute = f; },
  };
  const r = rangementEnMemoire();
  const arrives = [];
  await ouvrirLesVentes(guichetNatif(extension, 'apple'), r, { quandUnAchatArrive: (x) => arrives.push(x) });
  check('ouvert : l’extension est réglée pour ne rien clore d’elle-même, puis il demande les prix des six produits, comme achats « inapp »',
    ventesOuvertes() && !ventesSimulees() && egal(appels[0], ['configure', { autoFinishTransactions: false }])
    && egal(appels[1], ['getProducts', { productIdentifiers: PRODUITS.map((p) => p.produit), productType: 'inapp' }]) && appels.some((a) => a[0] === 'getUnfinishedTransactions'));
  check('le prix affiché est celui que dit le magasin, dans la monnaie du joueur — jamais un prix du jeu',
    prixAffiche('couronnes.poignee') === '0,99 €' && prixAffiche('couronnes.bourse') === 'US$4.99' && prixAffiche('couronnes.butin') === null && prixAffiche('autre.jeu') === '9 €');
  check('ne se vend que ce dont le magasin a dit le prix', vendable('couronnes.bourse') && vendable('offre.bienvenue') && !vendable('couronnes.butin') && !vendable('couronnes.tresor') && !vendable('autre.jeu'));
  const achat = await acheter('couronnes.bourse', r);
  check('acheter : un achat « inapp », une unité ; la transaction du magasin est livrée sous son numéro',
    achat.etat === 'achete' && r.profil.couronnes === 550 && egal(r.profil.boutique.transactions, ['2000000123'])
    && egal(appels.find((a) => a[0] === 'purchaseProduct')[1], { productIdentifier: 'couronnes.bourse', productType: 'inapp', quantity: 1, isConsumable: false, autoAcknowledgePurchases: false })
    && !appels.some((a) => a[0] === 'consumePurchase'));
  check('… et c’est le jeu qui la clôt auprès de StoreKit, après l’avoir rangée', egal(appels.at(-1), ['finishTransaction', { transactionId: '2000000123' }]) && r.ecritures === 1);
  check('… la même transaction rendue une seconde fois par le magasin ne compte pas', (await acheter('couronnes.bourse', r)).etat === 'deja' && r.profil.couronnes === 550);
  reponse = () => { throw new Error('User cancelled the purchase'); };
  const annule = await acheter('couronnes.poignee', r);
  reponse = () => { throw new Error('Purchase is pending approval'); };
  const attente = await acheter('couronnes.poignee', r);
  reponse = () => { throw new Error('Network error'); };
  const erreur = await acheter('couronnes.poignee', r);
  reponse = () => ({ productIdentifier: 'couronnes.poignee' });
  const sansNumero = await acheter('couronnes.poignee', r);
  check('annulé par le joueur, en attente d’un accord, en panne, sans numéro : rien n’est livré',
    annule.etat === 'annule' && attente.etat === 'attente' && erreur.etat === 'erreur' && sansNumero.etat === 'erreur' && r.profil.couronnes === 550);
  // L'accord parental arrive plus tard : le magasin prévient.
  ecoute({ transactionId: '2000000456', productIdentifier: 'couronnes.poignee' });
  ecoute({ transactionId: '2000000789', productIdentifier: 'autre.jeu' });
  await new Promise((ok) => setTimeout(ok, 5));
  check('un achat confirmé après coup arrive tout seul, et l’écran en est prévenu ; un produit étranger est ignoré',
    r.profil.couronnes === 650 && arrives.length === 1 && arrives[0].produit === 'couronnes.poignee');
  // Au lancement : un achat payé que l'application n'avait pas eu le temps de clore, un autre remboursé depuis.
  nonClos = [{ transactionId: '2000000600', productIdentifier: 'couronnes.coffret', needsFinish: true }, { transactionId: '2000000601', productIdentifier: 'couronnes.butin', revocationDate: '2026-10-01T10:00:00Z' }];
  const repris = await rattraper(r);
  check('au lancement, StoreKit représente ce qui n’est pas clos : livré puis clos ; un achat remboursé n’est pas livré',
    repris.length === 1 && repris[0].produit === 'couronnes.coffret' && r.profil.couronnes === 1850 && egal(appels.at(-1), ['finishTransaction', { transactionId: '2000000600' }]) && nonClos.length === 1);
  nonClos = [];
  // Restaurer : le compte possède l'offre de bienvenue.
  possedes.push({ transactionId: '2000000900', productIdentifier: 'offre.bienvenue' }, { transactionId: '2000000901', productIdentifier: 'autre.jeu' });
  const rendu = await restaurer(r);
  check('restaurer : le magasin est interrogé sur ce que le compte possède, l’offre rend ses troupes sans Couronnes',
    appels.some((a) => a[0] === 'restorePurchases') && egal(appels.findLast((a) => a[0] === 'getPurchases')[1], { productType: 'inapp', onlyCurrentEntitlements: true })
    && rendu.rendus.length === 1 && r.profil.debloquees.triton === 'achat' && r.profil.couronnes === 1850);
  {
    // Hors ligne au lancement : le magasin est là, mais ne dit aucun prix. Rien ne se vend ; les prix se redemandent.
    let enLigne = false;
    const r3 = rangementEnMemoire();
    await ouvrirLesVentes(guichetNatif({ ...extension, getProducts: async (o) => { if (!enLigne) throw new Error('hors ligne'); return extension.getProducts(o); } }, 'apple'), r3);
    const avant = [ventesOuvertes(), prixManquants(), vendable('couronnes.bourse')];
    enLigne = true;
    const lus = await relireLesPrix();
    check('hors ligne au lancement : rien ne se vend sans prix ; redemandés une fois en ligne, les prix arrivent',
      egal(avant, [true, true, false]) && lus === true && !prixManquants() && vendable('couronnes.bourse') && prixAffiche('couronnes.poignee') === '0,99 €');
  }
  check('un appareil qui ne peut pas acheter laisse les ventes fermées',
    egal(await ouvrirLesVentes(guichetNatif({ ...extension, isBillingSupported: async () => ({ isBillingSupported: false }) }, 'apple'), r), []) && !ventesOuvertes()
    && egal(await ouvrirLesVentes(guichetNatif({ ...extension, isBillingSupported: async () => { throw new Error('x'); } }, 'apple'), r), []) && !ventesOuvertes());
}

// --- Le guichet de Google Play ---------------------------------------------------------------
console.log('\n--- Le guichet de Google Play ---');
{
  const appels = [];
  const possedes = [{ orderId: 'GPA.1111', productIdentifier: 'couronnes.coffret', purchaseToken: 'jeton-ancien', purchaseState: '1' },
    { orderId: 'GPA.2222', productIdentifier: 'couronnes.tresor', purchaseToken: 'jeton-attente', purchaseState: '0' }];
  let reponse = () => ({ orderId: 'GPA.3333', purchaseToken: 'jeton-neuf', purchaseState: '1' });
  const extension = {
    isBillingSupported: async () => ({ isBillingSupported: true }),
    getProducts: async () => ({ products: PRODUITS.map((p) => ({ identifier: p.produit, priceString: 'prix' })) }),
    purchaseProduct: async () => reponse(),
    configure: async () => {},
    getUnfinishedTransactions: async () => ({ transactions: possedes }),
    getPurchases: async () => ({ purchases: possedes }),
    restorePurchases: async () => {},
    finishTransaction: async () => { throw new Error('iPhone seulement'); },
    consumePurchase: async (o) => { appels.push(['consumePurchase', o]); },
    acknowledgePurchase: async (o) => { appels.push(['acknowledgePurchase', o]); },
  };
  const r = rangementEnMemoire();
  const rattrapes = await ouvrirLesVentes(guichetNatif(extension, 'google'), r);
  check('au lancement : le lot payé et jamais consommé est livré puis consommé ; l’achat encore en attente ne l’est pas',
    rattrapes.length === 1 && r.profil.couronnes === 1200 && egal(appels, [['consumePurchase', { purchaseToken: 'jeton-ancien' }]]));
  const achat = await acheter('couronnes.poignee', r);
  check('acheter un lot : livré sous son numéro de commande, consommé seulement après',
    achat.etat === 'achete' && r.profil.couronnes === 1300 && r.profil.boutique.transactions.includes('GPA.3333') && egal(appels.at(-1), ['consumePurchase', { purchaseToken: 'jeton-neuf' }]));
  reponse = () => ({ orderId: 'GPA.4444', purchaseToken: 'jeton-offre', purchaseState: '1' });
  await acheter('offre.bienvenue', r);
  check('l’offre de bienvenue, achat unique : reconnue auprès du magasin, jamais consommée',
    r.profil.boutique.bienvenuePrise && egal(appels.at(-1), ['acknowledgePurchase', { purchaseToken: 'jeton-offre' }]));
  reponse = () => ({ orderId: 'GPA.5555', purchaseToken: 'jeton-lent', purchaseState: '0' });
  const nAvant = appels.length;
  check('un paiement différé (espèces, accord) — état « 0 » chez Google : en attente, rien de livré, rien de consommé',
    (await acheter('couronnes.bourse', r)).etat === 'attente' && r.profil.couronnes === 1600 && appels.length === nAvant);
}

// --- Le guichet de chaque édition -------------------------------------------------------------
console.log('\n--- Le guichet de chaque édition ---');
{
  check('dans la page web : le guichet simulé', guichetParDefaut().nom === 'simule');
  const script = `
    globalThis.__EDITION = 'magasin';
    const A = await import('./js/achats.js');
    const extension = { isBillingSupported: async () => ({ isBillingSupported: true }) };
    console.log(JSON.stringify({
      ferme: A.guichetParDefaut(),
      sansExtension: A.guichetParDefaut({ ouvertes: true, hote: { Plugins: {} } }),
      apple: A.guichetParDefaut({ ouvertes: true, hote: { Plugins: { NativePurchases: extension }, getPlatform: () => 'ios' } }).nom,
      google: A.guichetParDefaut({ ouvertes: true, hote: { Plugins: { NativePurchases: extension }, getPlatform: () => 'android' } }).nom,
    }));`;
  const m = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: RACINE, encoding: 'utf8' }));
  check('dans l’application : aucun tant que les ventes sont fermées — jamais le simulé', m.ferme === null && m.sansExtension === null);
  check('… ventes ouvertes : celui de l’App Store sur iPhone, de Google Play sur Android', m.apple === 'apple' && m.google === 'google');
}

// --- L'écran de la boutique ---------------------------------------------------------------------
console.log('\n--- L’écran ---');
{
  const memoire = new Map();
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); } }, configurable: true, writable: true });
  const noeud = { innerHTML: '', classList: { add() {}, remove() {} }, querySelector: () => null };
  let clic = null;
  Object.defineProperty(globalThis, 'document', { value: { getElementById: (id) => (id === 'progression' ? noeud : null), addEventListener: (t, f) => { if (t === 'click') clic = f; } }, configurable: true, writable: true });
  const { installerProgression, ouvrirProgression, fermerProgression, euros } = await import('../js/progression-ecrans.js');
  const { PROGRESSION_KEY } = await import('../js/save.js');
  const toucher = (dataset) => clic({ target: { closest: () => ({ dataset }) } });
  const lu = () => JSON.parse(memoire.get(PROGRESSION_KEY));
  const attendre = () => new Promise((ok) => setTimeout(ok, 5));
  const maintenant = Date.now() / 1000;
  memoire.set(PROGRESSION_KEY, JSON.stringify({ ...profilNeuf(), boutique: { offreLigue: null, bienvenueJusqua: maintenant + 3600, bienvenuePrise: false } }));

  // Sans guichet : comme avant, rien ne s'achète en argent réel.
  installerProgression({});
  ouvrirProgression('boutique');
  check('sans guichet : les lots montrent leur prix sans s’acheter, et aucun bouton « Restaurer »',
    B.lots.every((l) => noeud.innerHTML.includes(`<button class="btn small" disabled>${euros(l.prixCentimes)}</button>`)) && !/data-act="acheterLot"|restaurerAchats/.test(noeud.innerHTML));

  // Au guichet simulé (la page web).
  installerProgression({ guichet: guichetSimule({ numero: numeros('p') }) });
  await attendre();
  let page = noeud.innerHTML, t = texte(page);
  check('le guichet ouvert, la boutique affichée se redessine : chaque lot a son bouton, à son prix',
    B.lots.every((l) => page.includes(`<button class="btn small primary" data-act="acheterLot" data-arg="${l.id}">${euros(l.prixCentimes)}</button>`)));
  check('… elle dit que rien n’est payé ici, et propose de restaurer ses achats',
    /toucher un lot simule son achat : aucun paiement n’est demandé/.test(t) && /data-act="restaurerAchats">Restaurer mes achats</.test(page));
  check('… l’offre de bienvenue s’achète aussi, à son prix', page.includes(`<button class="btn small primary" data-act="acheterOffre" data-arg="bienvenue">${euros(B.offres.bienvenue.prixCentimes)}</button>`));
  toucher({ act: 'acheterLot', arg: 'bourse' });
  check('premier toucher : confirmation demandée, « aucun paiement » dit en tête et sur la ligne du lot, rien n’est encore crédité',
    /data-act="acheterLot" data-arg="bourse" data-i="1">Toucher encore</.test(noeud.innerHTML) && /cet achat est simulé, aucun paiement n’est demandé/.test(texte(noeud.innerHTML))
    && /Bourse : 550 Couronnes<\/b>\s*<small>Achat simulé : aucun paiement\.<\/small>/.test(noeud.innerHTML) && lu().couronnes === 0);
  toucher({ act: 'acheterLot', arg: 'bourse', i: '1' });
  check('second toucher : « Achat en cours… », les boutons se figent', /Achat en cours…/.test(texte(noeud.innerHTML)) && /<button class="btn small" disabled>En cours…<\/button>/.test(noeud.innerHTML) && !/data-act="acheterLot"/.test(noeud.innerHTML));
  await attendre();
  check('… puis les 550 Couronnes sont là, rangées, et l’écran le dit', lu().couronnes === 550 && /550 Couronnes de plus dans ta bourse\./.test(texte(noeud.innerHTML)) && /data-act="acheterLot" data-arg="bourse">/.test(noeud.innerHTML));
  toucher({ act: 'acheterOffre', arg: 'bienvenue' });
  toucher({ act: 'acheterOffre', arg: 'bienvenue', i: '1' });
  await attendre();
  check('l’offre de bienvenue : ses deux troupes et 300 Couronnes, et elle quitte la vitrine',
    lu().couronnes === 850 && lu().debloquees.triton === 'achat' && lu().debloquees.horseArcher === 'achat' && /c’est débloqué\. 300 Couronnes de plus/.test(texte(noeud.innerHTML)) && !/Offre de bienvenue/.test(texte(noeud.innerHTML)));
  toucher({ act: 'restaurerAchats' });
  await attendre();
  check('« Restaurer mes achats » : rien à rendre quand tout est déjà là', /Rien à restaurer : tout ce que tu as acheté est déjà là\./.test(texte(noeud.innerHTML)) && lu().couronnes === 850);
  toucher({ act: 'acheterLot', arg: 'sac' });
  check('un lot inconnu ne fait rien', lu().couronnes === 850 && !/Achat en cours/.test(texte(noeud.innerHTML)));
  toucher({ act: 'acheterLot', arg: 'poignee' });
  toucher({ act: 'acheterLot', arg: 'poignee', i: '1' });
  fermerProgression();
  await attendre();
  check('la boutique fermée pendant l’achat : il est livré quand même, et l’écran ne se rouvre pas', lu().couronnes === 950 && noeud.innerHTML === '');
  check('aucun emoji dans la boutique', (() => { ouvrirProgression('boutique'); return !/\p{Extended_Pictographic}/u.test(noeud.innerHTML); })());
  installerProgression({});
  check('sans guichet de nouveau : les ventes se referment', !ventesOuvertes());
}

// --- L'application, ventes ouvertes ----------------------------------------------------------------
console.log('\n--- L’application, ventes ouvertes ---');
{
  const script = `
    globalThis.__EDITION = 'magasin';
    const memoire = new Map();
    globalThis.localStorage = { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); } };
    const noeud = { innerHTML: '', classList: { add() {}, remove() {} }, querySelector: () => null };
    let clic = null;
    globalThis.document = { getElementById: (id) => (id === 'progression' ? noeud : null), addEventListener: (t, f) => { if (t === 'click') clic = f; } };
    const P = await import('./js/progression.js');
    const S = await import('./js/save.js');
    const A = await import('./js/achats.js');
    const X = await import('./js/progression-ecrans.js');
    const extension = {
      isBillingSupported: async () => ({ isBillingSupported: true }),
      getProducts: async () => ({ products: [{ identifier: 'couronnes.poignee', priceString: 'CHF 1.00' }, { identifier: 'couronnes.bourse', priceString: 'CHF 5.00' }, { identifier: 'offre.bienvenue', priceString: 'CHF 3.00' }] }),
      purchaseProduct: async (o) => ({ transactionId: 'app-1', productIdentifier: o.productIdentifier }),
      configure: async () => {}, getUnfinishedTransactions: async () => ({ transactions: [] }), finishTransaction: async () => {},
      getPurchases: async () => ({ purchases: [] }), restorePurchases: async () => {},
    };
    const maintenant = Date.now() / 1000;
    memoire.set(S.PROGRESSION_KEY, JSON.stringify({ ...P.profilNeuf(), boutique: { offreLigue: null, bienvenueJusqua: maintenant + 7200, bienvenuePrise: false } }));
    X.installerProgression({ guichet: A.guichetNatif(extension, 'apple') });
    await new Promise((ok) => setTimeout(ok, 5));
    X.ouvrirProgression('boutique'); const boutique = noeud.innerHTML;
    clic({ target: { closest: () => ({ dataset: { act: 'acheterLot', arg: 'bourse' } }) } });
    await new Promise((ok) => setTimeout(ok, 5));
    const apres = noeud.innerHTML;
    X.installerProgression({ guichet: A.guichetNatif({ ...extension, getProducts: async () => { throw new Error('hors ligne'); } }, 'apple') });
    await new Promise((ok) => setTimeout(ok, 5));
    X.ouvrirProgression('boutique'); const muette = noeud.innerHTML;
    await new Promise((ok) => setTimeout(ok, 5));
    console.log(JSON.stringify({ boutique, apres, muette, couronnes: JSON.parse(memoire.get(S.PROGRESSION_KEY)).couronnes }));`;
  const m = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 24 }));
  const b = texte(m.boutique);
  check('seuls les produits dont le magasin a dit le prix se montrent, à ce prix-là — pas de prix du jeu en euros sur un bouton',
    /data-act="acheterLot" data-arg="poignee">CHF 1\.00</.test(m.boutique) && /data-act="acheterLot" data-arg="bourse">CHF 5\.00</.test(m.boutique)
    && !/Coffret|Trésor|Butin royal/.test(b) && !/<button[^>]*>[^<]*€/.test(m.boutique));
  check('… l’offre de bienvenue à son prix du magasin ; rien n’est annoncé « bientôt », aucun bouton d’essai', /CHF 3\.00, une seule fois/.test(b) && /data-act="acheterOffre" data-arg="bienvenue">CHF 3\.00</.test(m.boutique) && !/Bientôt|arrivera|essai|simul/i.test(b));
  check('… le paiement est dit passer par le magasin, et « Restaurer mes achats » est là', /Le paiement passe par le magasin d’applications/.test(b) && /Restaurer mes achats/.test(b));
  check('un seul toucher suffit : la feuille de paiement du magasin fait la confirmation', m.couronnes === 550 && /550 Couronnes de plus dans ta bourse/.test(texte(m.apres)));
  check('le magasin ouvert mais muet sur ses prix (hors ligne) : la boutique ne montre aucun rayon vide, et redevient celle où tout se gagne',
    /Elles se gagnent en jouant/.test(texte(m.muette)) && !/Restaurer mes achats|CHF|€|disabled/.test(m.muette) && !/Offre de bienvenue/.test(texte(m.muette)));
}

// --- La page ---------------------------------------------------------------------------------
console.log('\n--- Le dépôt ---');
{
  check('le script des essais lance aussi celui-ci', JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8')).scripts.test.includes('test/achats.test.js'));
  check('le jeu ouvre son guichet au démarrage', /installerProgression\(\{[^}]*guichet: guichetParDefaut\(\)/.test(fs.readFileSync(path.join(RACINE, 'js/main.js'), 'utf8')));
  check('le service worker garde le module des achats pour le hors-ligne', /js\/achats\.js/.test(fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8')));
}

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
