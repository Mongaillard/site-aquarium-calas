// La boutique : les Couronnes, ce qui s'y vend, les offres et leurs durées,
// l'écran — et ce qui ne s'y vendra jamais (coffres, fragments, niveaux).
// Lancement : node test/boutique.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROGRESSION as R } from '../js/progression-config.js';
import {
  profilNeuf, migrerProfil, regulariser, appliquerResultat, debloquerParAchat,
  catalogueBoutique, prixDeTroupe, acheterTroupe, acheterToutesLesTroupes, prendreCouronnesDEssai, crediterLot, prendreOffreDeBienvenue,
} from '../js/progression.js';
import { ouvrirProgression, htmlBandeau, htmlFinDePartie, installerProgression, reglerPeuple, euros, resteEnClair } from '../js/progression-ecrans.js';
import { PROGRESSION_KEY } from '../js/save.js';
import { ICONES } from '../js/icones.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${detail ? ' — ' + detail : ''}`);
}
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const B = R.boutique;
const T0 = 1_800_000_000;            // une heure quelconque, en secondes
const HEURE = 3600;
const AVANCEES = Object.keys(R.troupes).filter((t) => R.troupes[t].gratuite);
const riche = (n = 2000) => ({ ...profilNeuf(), couronnes: n });
const partie = (issue, instant, extra = {}) => ({ issue, duree: 600, contreOrdinateur: 'echelle', jour: '2026-10-08', instant, ...extra });

// --- Les réglages -------------------------------------------------------------------
console.log('--- Les réglages ---');
check('cinq lots de Couronnes, de 0,99 € à 49,99 €, 100 Couronnes pour 1 € au premier',
  egal(B.lots.map((l) => [l.id, l.prixCentimes, l.couronnes]), [['poignee', 99, 100], ['bourse', 499, 550], ['coffret', 999, 1200], ['tresor', 1999, 2600], ['butin', 4999, 7000]]));
check('le bonus dit à l’écran est le vrai : ce que le lot donne de plus que le premier, à l’unité près',
  B.lots.every((l) => Math.round((l.couronnes / ((l.prixCentimes + 1) / 100 * 100) - 1) * 100) === l.bonus),
  B.lots.map((l) => `${l.nom} ${Math.round((l.couronnes / ((l.prixCentimes + 1) / 100 * 100) - 1) * 100)}`).join(', '));
check('les troupes : 100, 200, 200, puis 300 — 1 700 en tout, des centaines rondes',
  egal(AVANCEES.map((t) => R.troupes[t].prix), [100, 200, 200, 300, 300, 300, 300]) && AVANCEES.reduce((s, t) => s + R.troupes[t].prix, 0) === 1700);
check('rien d’aléatoire ni de puissance à vendre : ni coffre, ni fragment, ni niveau dans les réglages de la boutique',
  !/coffre|fragment|niveau|eclat/i.test(JSON.stringify(B).replace(/"coffret"|Coffret/g, '')));
check('l’argent réel attend l’application ; d’ici là, un porte-monnaie d’essai de 500 Couronnes', B.argentReel === false && B.essai.couronnes === 500 && B.parLigue === 50);

// --- Le porte-monnaie ---------------------------------------------------------------
console.log('\n--- Le porte-monnaie ---');
{
  const neuf = profilNeuf();
  check('un profil neuf : 0 Couronne, aucune offre', neuf.couronnes === 0 && egal(neuf.boutique, { offreLigue: null, bienvenueJusqua: 0, bienvenuePrise: false }));
  check('un profil d’avant la boutique se lit sans rien perdre, avec un porte-monnaie vide',
    (() => { const ancien = { ...profilNeuf(), elo: 300, ligue: 3, plusHauteLigue: 3 }; delete ancien.couronnes; delete ancien.boutique; const lu = migrerProfil(ancien); return lu.couronnes === 0 && lu.boutique.offreLigue === null && lu.elo === 300; })());
  check('un porte-monnaie abîmé repart de zéro, jamais en négatif',
    [-50, 'mille', null, 12.5, NaN].every((v) => { const c = migrerProfil({ ...profilNeuf(), couronnes: v }).couronnes; return Number.isInteger(c) && c >= 0; }));
  check('une offre de ligue illisible, ou sur une troupe déjà débloquée, est écartée',
    migrerProfil({ ...profilNeuf(), boutique: { offreLigue: { troupe: 'dragon', jusqua: T0 } } }).boutique.offreLigue === null
    && migrerProfil({ ...profilNeuf(), boutique: { offreLigue: { troupe: 'triton', jusqua: 'demain' } } }).boutique.offreLigue === null
    && migrerProfil({ ...profilNeuf(), debloquees: { triton: 'ligue' }, boutique: { offreLigue: { troupe: 'triton', jusqua: T0 } } }).boutique.offreLigue === null
    && egal(migrerProfil({ ...profilNeuf(), boutique: { offreLigue: { troupe: 'triton', jusqua: T0 } } }).boutique.offreLigue, { troupe: 'triton', jusqua: T0 }));
  const essai = prendreCouronnesDEssai(neuf);
  check('le porte-monnaie d’essai ajoute 500 Couronnes, et le journal le note',
    essai.profil.couronnes === 500 && egal(essai.evenements, [{ type: 'couronnes', variation: 500, origine: 'essai', total: 500 }])
    && essai.profil.journal.at(-1).op === 'boutique' && essai.profil.journal.at(-1).article === 'essai' && neuf.couronnes === 0);
}

// --- Acheter une troupe --------------------------------------------------------------
console.log('\n--- Acheter une troupe ---');
{
  const p = riche(250);
  const a = acheterTroupe(p, 'horseArcher', T0);
  check('200 Couronnes : l’Archer monté est débloqué, par achat, et le porte-monnaie descend à 50',
    a.profil.couronnes === 50 && a.profil.debloquees.horseArcher === 'achat'
    && egal(a.evenements, [{ type: 'couronnes', variation: -200, origine: 'troupe', total: 50 }, { type: 'troupeDebloquee', troupe: 'horseArcher', origine: 'achat' }])
    && p.couronnes === 250 && !p.debloquees.horseArcher);
  check('… c’est la même troupe que celle de la preuve d’achat d’avant : même origine',
    debloquerParAchat(profilNeuf(), 'horseArcher', { valide: true }).profil.debloquees.horseArcher === a.profil.debloquees.horseArcher);
  check('pas assez de Couronnes : rien ne change, et l’on sait ce qu’il manque', egal(acheterTroupe(a.profil, 'hydra', T0), { erreur: 'fonds', manque: 250 }));
  check('déjà débloquée, inconnue, de base : refusé',
    acheterTroupe(a.profil, 'horseArcher', T0).erreur === 'dejaDebloquee' && acheterTroupe(p, 'dragon', T0).erreur === 'inconnue'
    && acheterTroupe(p, 'militia', T0).erreur === 'pasEnVente' && acheterTroupe(p, null, T0).erreur === 'inconnue');
  check('l’achat est noté au journal avec son prix', a.profil.journal.at(-1).op === 'boutique' && a.profil.journal.at(-1).troupe === 'horseArcher' && a.profil.journal.at(-1).prix === 200);
  const plusTard = appliquerResultat({ ...a.profil, elo: 220, ligue: 2, plusHauteLigue: 2 }, partie('victoire', T0));
  check('atteindre ensuite sa ligue ne la débloque pas une seconde fois',
    plusTard.profil.ligue === 3 && plusTard.profil.debloquees.horseArcher === 'achat' && !plusTard.evenements.some((e) => e.type === 'troupeDebloquee' && e.troupe === 'horseArcher'));
}

// --- Toutes les troupes --------------------------------------------------------------
console.log('\n--- Le lot « Toutes les troupes » ---');
{
  const c = catalogueBoutique(riche(), T0);
  check('les sept d’un coup : 1 200 au lieu de 1 700', c.lotTroupes.troupes.length === 7 && c.lotTroupes.prixPlein === 1700 && c.lotTroupes.prix === 1200);
  const tout = acheterToutesLesTroupes(riche(1200));
  check('… achetées : sept troupes débloquées, porte-monnaie à zéro', tout.profil.couronnes === 0 && AVANCEES.every((t) => tout.profil.debloquees[t] === 'achat')
    && tout.evenements.filter((e) => e.type === 'troupeDebloquee').length === 7 && catalogueBoutique(tout.profil, T0).lotTroupes === null);
  const reste = acheterTroupe(riche(), 'triton', T0).profil;
  check('il suit ce qui reste : six troupes, 1 100 au lieu de 1 600 — toujours 70 % arrondis à 50',
    egal([catalogueBoutique(reste, T0).lotTroupes.prix, catalogueBoutique(reste, T0).lotTroupes.prixPlein], [1100, 1600]));
  let presque = riche(5000);
  for (const t of AVANCEES.slice(0, 6)) presque = acheterTroupe(presque, t, T0).profil;
  check('une seule troupe à débloquer : plus de lot', catalogueBoutique(presque, T0).lotTroupes === null && acheterToutesLesTroupes(presque).erreur === 'pasEnVente');
  check('pas assez de Couronnes pour le lot : refusé, avec ce qu’il manque', egal(acheterToutesLesTroupes(riche(1000)), { erreur: 'fonds', manque: 200 }));
  const prix = [...Array(128).keys()].map((masque) => { let p = riche(9000); AVANCEES.forEach((t, i) => { if (masque & (1 << i)) p = acheterTroupe(p, t, T0).profil; }); return catalogueBoutique(p, T0).lotTroupes; }).filter(Boolean);
  check('quoi qu’il reste, le lot est un chiffre rond et coûte moins que pièce par pièce', prix.length > 100 && prix.every((l) => l.prix % 50 === 0 && l.prix < l.prixPlein && l.prix > 0));
}

// --- Les Couronnes d'une nouvelle ligue, l'offre de ligue -----------------------------
console.log('\n--- Une nouvelle ligue ---');
{
  const avant = { ...profilNeuf(), elo: 60 };
  const r = appliquerResultat(avant, partie('victoire', T0));
  const offre = r.profil.boutique.offreLigue;
  check('première fois en ligue de Pierre : 50 Couronnes', r.profil.ligue === 2 && r.profil.couronnes === 50
    && egal(r.evenements.filter((e) => e.type === 'couronnes'), [{ type: 'couronnes', variation: 50, origine: 'ligue', total: 50 }]));
  check('… et l’offre de ligue s’ouvre pour 48 h sur la troupe de la ligue suivante : l’Archer monté à moitié prix',
    egal(offre, { troupe: 'horseArcher', jusqua: T0 + 48 * HEURE }) && prixDeTroupe(r.profil, 'horseArcher', T0 + HEURE) === 100
    && r.evenements.some((e) => e.type === 'offreOuverte' && e.offre === 'ligue' && e.troupe === 'horseArcher' && e.jusqua === T0 + 48 * HEURE));
  check('… les autres troupes gardent leur prix', prixDeTroupe(r.profil, 'catapult', T0 + HEURE) === 200 && prixDeTroupe(r.profil, 'hydra', T0 + HEURE) === 300);
  const c = catalogueBoutique(r.profil, T0 + 10 * HEURE);
  check('la boutique la montre, avec ce qu’il reste : 38 h', c.offres.some((o) => o.id === 'ligue' && o.troupe === 'horseArcher' && o.prix === 100 && o.prixPlein === 200 && o.reste === 38 * HEURE)
    && c.troupes.find((t) => t.type === 'horseArcher').offre === true && c.troupes.find((t) => t.type === 'horseArcher').prix === 100);
  check('à la 48e heure pile elle est finie : le prix revient à 200',
    prixDeTroupe(r.profil, 'horseArcher', T0 + 48 * HEURE) === 200 && !catalogueBoutique(r.profil, T0 + 48 * HEURE).offres.some((o) => o.id === 'ligue')
    && prixDeTroupe(r.profil, 'horseArcher', T0 + 48 * HEURE - 1) === 100);
  const achete = acheterTroupe({ ...r.profil, couronnes: 100 }, 'horseArcher', T0 + HEURE);
  check('achetée pendant l’offre : 100 Couronnes, et l’offre se referme', achete.profil.couronnes === 0 && achete.profil.debloquees.horseArcher === 'achat' && achete.profil.boutique.offreLigue === null);
  check('achetée après : il faut les 200', acheterTroupe({ ...r.profil, couronnes: 100 }, 'horseArcher', T0 + 49 * HEURE).erreur === 'fonds');
  const redescendu = appliquerResultat({ ...r.profil, elo: 90, ligue: 1 }, partie('victoire', T0 + 100 * HEURE));
  check('redescendre puis remonter dans la même ligue ne redonne ni Couronnes ni offre',
    redescendu.profil.ligue === 2 && redescendu.profil.couronnes === 50 && !redescendu.evenements.some((e) => e.type === 'couronnes' || (e.type === 'offreOuverte' && e.offre === 'ligue')));
  const sansHeure = appliquerResultat(avant, { issue: 'victoire', duree: 600, contreOrdinateur: 'echelle', jour: '2026-10-08' });
  check('sans heure connue : les Couronnes sont données, mais pas d’offre (elle n’aurait pas de fin)', sansHeure.profil.couronnes === 50 && sansHeure.profil.boutique.offreLigue === null);
  const due = regulariser({ ...profilNeuf(), elo: 500 });
  check('une promotion due, donnée d’un coup (trois ligues) : 150 Couronnes', due.profil.ligue === 4 && due.profil.couronnes === 150);
  const sommet = appliquerResultat({ ...profilNeuf(), elo: R.ligues.at(-1).seuil - 10, ligue: R.ligues.length - 1, plusHauteLigue: R.ligues.length - 1 }, partie('victoire', T0));
  check('à la dernière ligue, plus de troupe à offrir : des Couronnes, pas d’offre', sommet.profil.ligue === R.ligues.length && sommet.profil.boutique.offreLigue === null && sommet.profil.couronnes === 50);
}

// --- L'offre de bienvenue --------------------------------------------------------------
console.log('\n--- L’offre de bienvenue ---');
{
  const o = B.offres.bienvenue;
  check('deux troupes et 300 Couronnes pour 2,99 €, pendant 3 jours', egal([o.prixCentimes, o.troupes, o.couronnes, o.heures], [299, ['triton', 'horseArcher'], 300, 72]));
  const premiere = appliquerResultat(profilNeuf(), partie('defaite', T0));
  check('la première partie comptée l’ouvre pour 72 h', premiere.profil.boutique.bienvenueJusqua === T0 + 72 * HEURE
    && premiere.evenements.some((e) => e.type === 'offreOuverte' && e.offre === 'bienvenue'));
  const seconde = appliquerResultat(premiere.profil, partie('defaite', T0 + 5 * HEURE, { id: 'b' }));
  check('… les suivantes ne la prolongent pas', seconde.profil.boutique.bienvenueJusqua === T0 + 72 * HEURE && !seconde.evenements.some((e) => e.type === 'offreOuverte' && e.offre === 'bienvenue'));
  const vue = catalogueBoutique(premiere.profil, T0 + 24 * HEURE).offres.find((x) => x.id === 'bienvenue');
  check('la boutique la montre avec ce qu’il reste, et dit qu’elle n’est pas encore achetable ici',
    !!vue && vue.reste === 48 * HEURE && vue.prixCentimes === 299 && vue.couronnes === 300 && egal(vue.troupes, ['triton', 'horseArcher']) && vue.disponible === false);
  check('… passé les 3 jours, elle a disparu', !catalogueBoutique(premiere.profil, T0 + 72 * HEURE).offres.some((x) => x.id === 'bienvenue'));
  check('sans preuve valide du serveur, rien n’est donné',
    [undefined, {}, { valide: 'true', offre: 'bienvenue' }, { valide: true }, { valide: true, offre: 'ligue' }].every((preuve) => prendreOffreDeBienvenue(premiere.profil, preuve, T0 + HEURE).erreur === 'preuve'));
  const prise = prendreOffreDeBienvenue(premiere.profil, { valide: true, offre: 'bienvenue' }, T0 + HEURE);
  check('avec la preuve : le Mercenaire, l’Archer monté et 300 Couronnes',
    prise.profil.debloquees.triton === 'achat' && prise.profil.debloquees.horseArcher === 'achat' && prise.profil.couronnes === 300 && prise.profil.boutique.bienvenuePrise === true);
  check('… une seule fois, et jamais après sa fin',
    prendreOffreDeBienvenue(prise.profil, { valide: true, offre: 'bienvenue' }, T0 + 2 * HEURE).erreur === 'fermee'
    && prendreOffreDeBienvenue(premiere.profil, { valide: true, offre: 'bienvenue' }, T0 + 72 * HEURE).erreur === 'fermee'
    && prendreOffreDeBienvenue(profilNeuf(), { valide: true, offre: 'bienvenue' }, T0).erreur === 'fermee');
}

// --- Les lots, en argent réel -----------------------------------------------------------
console.log('\n--- Les lots de Couronnes ---');
{
  check('sans preuve valide qui nomme le lot, aucun crédit',
    [undefined, { valide: true }, { valide: true, lot: 'butin' }, { valide: 1, lot: 'bourse' }].every((preuve) => crediterLot(profilNeuf(), 'bourse', preuve).erreur === 'preuve')
    && crediterLot(profilNeuf(), 'sac', { valide: true, lot: 'sac' }).erreur === 'inconnu');
  const credit = crediterLot(profilNeuf(), 'bourse', { valide: true, lot: 'bourse' });
  check('avec la preuve : 550 Couronnes, notées au journal', credit.profil.couronnes === 550 && credit.profil.journal.at(-1).lot === 'bourse');
  check('tant que l’argent réel n’est pas ouvert, aucun lot n’est « disponible » dans la boutique', catalogueBoutique(profilNeuf(), T0).lots.length === 5 && catalogueBoutique(profilNeuf(), T0).lots.every((l) => l.disponible === false));
}

// --- L'écran ------------------------------------------------------------------------------
console.log('\n--- L’écran ---');
{
  const memoire = new Map();
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); } }, configurable: true, writable: true });
  const noeud = { innerHTML: '', classList: { add() {}, remove() {} }, querySelector: () => null };
  let clic = null;
  Object.defineProperty(globalThis, 'document', { value: { getElementById: (id) => (id === 'progression' ? noeud : null), addEventListener: (t, f) => { if (t === 'click') clic = f; } }, configurable: true, writable: true });
  const toucher = (dataset) => clic({ target: { closest: () => ({ dataset }) } });
  const texte = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const lu = () => JSON.parse(memoire.get(PROGRESSION_KEY));
  installerProgression({});
  reglerPeuple('solarien');
  const maintenant = Date.now() / 1000;
  memoire.set(PROGRESSION_KEY, JSON.stringify({ ...profilNeuf(), ligue: 2, plusHauteLigue: 2, elo: 100, debloquees: { ...profilNeuf().debloquees, triton: 'ligue' },
    couronnes: 250, boutique: { offreLigue: { troupe: 'horseArcher', jusqua: maintenant + 30 * HEURE }, bienvenueJusqua: maintenant + 60 * HEURE, bienvenuePrise: false } }));
  ouvrirProgression('boutique');
  let page = noeud.innerHTML, t = texte(page);
  check('la boutique s’ouvre : les deux bourses, les offres du moment, les autocollants du jour, les collections, les troupes, les lots',
    /<h2>Boutique<\/h2>/.test(page) && /class="prog-bourse">[\s\S]*250/.test(page) && /class="prog-bourse-eclats"/.test(page)
    && ['Offres du moment', 'Autocollants du jour', 'Collections', 'Troupes', 'Couronnes'].every((titre) => page.includes(`<h3>${titre}</h3>`)) && !page.includes('<h3>Apparence</h3>'));
  check('l’offre de ligue : la troupe, son prix barré, ce qu’il reste', /Offre de ligue : Archer monté à moitié prix/.test(t) && /100 au lieu de 200 · encore 30 h/.test(t));
  check('l’offre de bienvenue : son contenu, son prix, « Bientôt »', /Offre de bienvenue : Archer monté \+ 300 Couronnes/.test(t) && /2,99 €, une seule fois · encore 2 j/.test(t) && /<button class="btn small" disabled>Bientôt<\/button>/.test(page));
  check('les noms sont ceux du peuple du joueur : le Sphinx, pas l’Hydre', t.includes('Sphinx') && !/Hydre(?! aux trois glaces| fantôme)/.test(t) && t.includes('Mercenaire atlante'));
  check('une troupe déjà gagnée est dite « Débloquée », sans bouton', /Mercenaire atlante<\/b>\s*<small>Déjà à toi\.<\/small>\s*<\/span>\s*<span class="prog-acquis">Débloquée<\/span>/.test(page));
  check('les lots montrent leur prix en euros, pas encore achetables', B.lots.every((l) => page.includes(`<button class="btn small" disabled>${euros(l.prixCentimes)}</button>`)) && /arrivera avec l’application/.test(t));
  check('la règle est dite : rien d’aléatoire ne se vend ici', /Rien d’aléatoire ne se vend ici : ni coffre, ni fragment, ni niveau\./.test(t));
  check('aucun emoji, et pas d’autre chiffre à virgule que les prix en euros',
    !/\p{Extended_Pictographic}/u.test(page) && (t.match(/\d+[,.]\d+/g) || []).every((x) => /^\d+,99$/.test(x)), (t.match(/\d+[,.]\d+/g) || []).join(' '));
  // Acheter : deux touchers.
  toucher({ act: 'acheter', arg: 'horseArcher' });
  check('premier toucher : le bouton demande confirmation, rien n’est dépensé',
    /data-act="acheter" data-arg="horseArcher" data-i="1">Toucher encore/.test(noeud.innerHTML) && lu().couronnes === 250 && !lu().debloquees.horseArcher);
  toucher({ act: 'acheter', arg: 'horseArcher', i: '1' });
  check('second toucher : l’Archer monté est débloqué au prix de l’offre, le porte-monnaie est à 150, l’écran le dit',
    lu().couronnes === 150 && lu().debloquees.horseArcher === 'achat' && /Archer monté : c’est débloqué/.test(texte(noeud.innerHTML)) && !/Offre de ligue/.test(texte(noeud.innerHTML)));
  toucher({ act: 'acheter', arg: 'hydra' });
  check('trop cher : le bouton reste touchable et dit ce qu’il manque, sans rien dépenser', /Il te manque\s+150\s+pour cet achat/.test(texte(noeud.innerHTML)) && lu().couronnes === 150 && !lu().debloquees.hydra);
  toucher({ act: 'essaiCouronnes' });
  toucher({ act: 'essaiCouronnes' });
  check('le porte-monnaie d’essai : deux touchers, 1 000 Couronnes de plus', lu().couronnes === 1150);
  toucher({ act: 'acheterTout', arg: 'tout' });
  toucher({ act: 'acheterTout', arg: 'tout', i: '1' });
  check('« Toutes les troupes » : les cinq qui restent, 1 000 au lieu de 1 400', lu().couronnes === 150 && AVANCEES.every((x) => lu().debloquees[x]) && !/Toutes les troupes/.test(texte(noeud.innerHTML)));
  // L'accueil et la fin de partie.
  const bandeau = htmlBandeau({ ...profilNeuf(), boutique: { offreLigue: { troupe: 'horseArcher', jusqua: maintenant + HEURE }, bienvenueJusqua: 0, bienvenuePrise: false } });
  check('l’accueil a sa tuile « Boutique », avec une pastille quand une offre en Couronnes court',
    /data-ecran="boutique">[\s\S]*Boutique <b class="prog-pastille">1<\/b><\/button>/.test(bandeau) && /data-ecran="boutique">[^<]*<svg[\s\S]*?<\/svg> Boutique<\/button>/.test(htmlBandeau(profilNeuf())));
  const promue = appliquerResultat({ ...profilNeuf(), elo: 60 }, partie('victoire', maintenant));
  const fin = texte(htmlFinDePartie(promue.evenements, promue.profil));
  check('fin de partie : les 50 Couronnes de la nouvelle ligue et l’offre qui s’ouvre', /\+\s*50\s+Couronnes pour ta nouvelle ligue/.test(fin) && /Offre de ligue : Archer monté à moitié prix, 48 h/.test(fin));
  check('ce qu’il reste d’une offre se lit en chiffres ronds', egal([resteEnClair(72 * HEURE), resteEnClair(48 * HEURE), resteEnClair(47.2 * HEURE), resteEnClair(HEURE), resteEnClair(59 * 60), resteEnClair(20)], ['3 j', '2 j', '48 h', '1 h', '59 min', '1 min']));
}

// --- La page ---------------------------------------------------------------------------------
console.log('\n--- La page ---');
{
  const boite = fs.readFileSync(path.join(RACINE, 'css/boite.css'), 'utf8');
  check('la monnaie a son pictogramme, dessiné pour le jeu', !!ICONES.couronne && /dessin original/.test(ICONES.couronne.n));
  check('la boutique est habillée dans la feuille des menus : porte-monnaie, articles, offres',
    ['#progression .prog-bourse', '#progression .prog-articles', '#progression .prog-offre', '#progression .prog-couronnes svg', '#progression .btn.small.prog-cher'].every((s) => boite.includes(s)));
}

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
