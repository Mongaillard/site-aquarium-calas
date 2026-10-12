// Le change : deux monnaies, deux prix. Les Couronnes s'achètent, les Éclats
// se gagnent en jouant ; tout ce qui se vend à la boutique se paie dans l'une
// ou dans l'autre, et il faut plus d'Éclats que de Couronnes.
// Lancement : node test/change.test.js

import { PROGRESSION as R } from '../js/progression-config.js';
import { PIECES } from '../js/collections-config.js';
import {
  profilNeuf, catalogueBoutique, enEclats, enCouronnes, etatDeLaSaison,
  acheterTroupe, acheterToutesLesTroupes, acheterPiece, acheterCollection, acheterPasse, prixDePiece,
} from '../js/progression.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${!condition && detail ? ' — ' + detail : ''}`);
}
const T0 = 1_800_000_000, JOUR = '2026-10-12';
const CHANGE = R.boutique.change;
const avec = (couronnes, eclats) => ({ ...profilNeuf(), couronnes, eclats });
const dernier = (profil) => profil.journal[profil.journal.length - 1];

// --- Le change ---------------------------------------------------------------------
console.log('--- Le change ---');
check(`il faut ${CHANGE} Éclats pour 1 Couronne : un nombre entier, plus grand que 1`, Number.isInteger(CHANGE) && CHANGE > 1);
check('un prix en Couronnes se dit en Éclats sans arrondi', enEclats(100) === 100 * CHANGE && enEclats(500) === 500 * CHANGE);
check('un prix en Éclats se dit en Couronnes, arrondi à la Couronne du dessus, jamais moins d’une',
  enCouronnes(CHANGE) === 1 && enCouronnes(CHANGE + 1) === 2 && enCouronnes(1) === 1 && enCouronnes(30 * CHANGE) === 30);
check('payer en Éclats ne coûte jamais moins cher qu’en Couronnes : repasser d’une monnaie à l’autre ne fait rien gagner',
  [1, 7, 15, 30, 100, 300, 900].every((e) => enEclats(enCouronnes(e)) >= e));

// --- Le catalogue dit les deux prix ---------------------------------------------------
console.log('--- Le catalogue ---');
const c = catalogueBoutique(avec(0, 0), T0, JOUR);
check('le catalogue donne le change', c.change === CHANGE);
check('chaque troupe à vendre a son prix en Couronnes et son prix en Éclats, et il faut plus d’Éclats',
  c.troupes.length > 0 && c.troupes.every((t) => t.prixEclats === t.prix * CHANGE && t.prixEclats > t.prix));
check('le lot « Toutes les troupes » aussi', c.lotTroupes && c.lotTroupes.prixEclats === c.lotTroupes.prix * CHANGE);
check('les teintures de l’atelier, dites en Éclats, ont leur prix en Couronnes : il en faut moins',
  c.atelier.length > 0 && c.atelier.every((x) => x.prixCouronnes === Math.ceil(x.prix / CHANGE) && x.prixCouronnes < x.prix));
check('les autocollants du jour aussi', c.selection.every((x) => x.prixCouronnes === Math.max(1, Math.ceil(x.prix / CHANGE))));
check('les collections vendues entières et le Passe ont leur prix en Éclats',
  c.collections.every((x) => x.prixEclats === x.prix * CHANGE) && c.passe.prixEclats === c.passe.prix * CHANGE
  && etatDeLaSaison(avec(0, 0), JOUR).prixDuPasseEnEclats === R.saisons.passe.prix * CHANGE);
check('tous les prix lus par le joueur sont des entiers',
  [...c.troupes.flatMap((t) => [t.prix, t.prixEclats]), ...c.atelier.flatMap((x) => [x.prix, x.prixCouronnes]), ...c.selection.flatMap((x) => [x.prix, x.prixCouronnes]), c.passe.prixEclats].every(Number.isInteger));

// --- Une troupe ------------------------------------------------------------------------
console.log('--- Une troupe ---');
const troupe = c.troupes[0];
{
  const r = acheterTroupe(avec(0, troupe.prixEclats), troupe.type, T0, 'eclats');
  check(`une troupe à ${troupe.prix} Couronnes se paie ${troupe.prixEclats} Éclats : elle est débloquée, les Couronnes ne bougent pas`,
    !r.erreur && r.profil.debloquees[troupe.type] === 'achat' && r.profil.eclats === 0 && r.profil.couronnes === 0);
  check('… l’événement dit la monnaie payée, et le journal retient le prix et ce qui a été payé',
    r.evenements[0].type === 'eclats' && r.evenements[0].variation === -troupe.prixEclats
    && dernier(r.profil).prix === troupe.prix && dernier(r.profil).payeEn === 'eclats' && dernier(r.profil).paye === troupe.prixEclats);
  const refus = acheterTroupe(avec(9999, troupe.prixEclats - 1), troupe.type, T0, 'eclats');
  check('… un Éclat de moins : refusé, on sait ce qu’il manque et dans quelle monnaie — même la bourse pleine de Couronnes',
    refus.erreur === 'fonds' && refus.manque === 1 && refus.monnaie === 'eclats');
  const comme = acheterTroupe(avec(troupe.prix, 0), troupe.type, T0);
  check('… sans rien dire, elle se paie en Couronnes, comme avant', !comme.erreur && comme.profil.couronnes === 0 && dernier(comme.profil).payeEn === undefined);
}
{
  const lot = c.lotTroupes;
  const r = acheterToutesLesTroupes(avec(0, lot.prixEclats), 'eclats');
  check(`toutes les troupes d’un coup, en Éclats (${lot.prixEclats})`, !r.erreur && lot.troupes.every((t) => r.profil.debloquees[t] === 'achat') && r.profil.eclats === 0);
}

// --- Une pièce : un autocollant, une teinture ---------------------------------------------
console.log('--- Une pièce ---');
{
  const teinture = c.atelier[0];
  const r = acheterPiece(avec(teinture.prixCouronnes, 0), teinture.piece, JOUR, 'couronnes');
  check(`une teinture à ${teinture.prix} Éclats se paie ${teinture.prixCouronnes} Couronnes : elle est dans l’album, les Éclats ne bougent pas`,
    !r.erreur && r.profil.pieces.includes(teinture.piece) && r.profil.couronnes === 0 && r.profil.eclats === 0 && r.evenements[0].type === 'couronnes');
  check('… le journal retient son prix en Éclats et les Couronnes payées', dernier(r.profil).eclats === teinture.prix && dernier(r.profil).payeEn === 'couronnes' && dernier(r.profil).paye === teinture.prixCouronnes);
  const refus = acheterPiece(avec(teinture.prixCouronnes - 1, 9999), teinture.piece, JOUR, 'couronnes');
  check('… une Couronne de moins : refusé, rien ne change', refus.erreur === 'fonds' && refus.manque === 1 && refus.monnaie === 'couronnes');
  const jour = c.selection[0];
  if (jour) {
    const pauvre = acheterPiece(avec(jour.prixCouronnes - 1, 0), jour.piece, JOUR, 'couronnes');
    const apres = catalogueBoutique(avec(jour.prixCouronnes - 1, 0), T0, JOUR);
    check('… un autocollant du jour refusé faute de Couronnes reste au prix du jour', pauvre.erreur === 'fonds' && apres.selection.some((x) => x.piece === jour.piece && x.prix === jour.prix));
    const pris = acheterPiece(avec(jour.prixCouronnes, 0), jour.piece, JOUR, 'couronnes');
    check(`… payé ${jour.prixCouronnes} Couronnes (${jour.prix} Éclats au prix du jour) : il est acquis`, !pris.erreur && pris.profil.pieces.includes(jour.piece) && prixDePiece(pris.profil, jour.piece, JOUR) === null);
  }
  check('une pièce qui ne se vend pas ne se vend dans aucune monnaie',
    Object.keys(PIECES).filter((id) => prixDePiece(avec(0, 0), id, JOUR) === null).slice(0, 5).every((id) => acheterPiece(avec(9999, 9999), id, JOUR, 'couronnes').erreur === 'pasEnVente'));
}

// --- Une collection, le Passe ---------------------------------------------------------------
console.log('--- Une collection, le Passe ---');
{
  const lot = c.collections[0];
  const r = acheterCollection(avec(0, lot.prixEclats), lot.collection, 'eclats');
  check(`une collection à ${lot.prix} Couronnes se paie ${lot.prixEclats} Éclats : toutes ses pièces d’un coup`,
    !r.erreur && lot.pieces.every((id) => r.profil.pieces.includes(id)) && r.profil.eclats === 0 && r.profil.couronnes === 0);
  check('… pas sans les Éclats', acheterCollection(avec(9999, lot.prixEclats - 1), lot.collection, 'eclats').erreur === 'fonds');
  const prix = R.saisons.passe.prix * CHANGE;
  const passe = acheterPasse(avec(0, prix), 'eclats');
  check(`le Passe à ${R.saisons.passe.prix} Couronnes se paie ${prix} Éclats : la seconde voie est ouverte`, !passe.erreur && passe.profil.route.passe === true && passe.profil.eclats === 0);
  check('… pas sans les Éclats, et pas deux fois', acheterPasse(avec(9999, prix - 1), 'eclats').erreur === 'fonds' && acheterPasse(passe.profil, 'eclats').erreur === 'dejaPris');
}

// --- Ce qui ne change pas ----------------------------------------------------------------
console.log('--- Ce qui ne change pas ---');
check('les lots de Couronnes et l’offre de bienvenue ne se paient qu’en argent réel : pas de prix en Éclats',
  c.lots.every((l) => l.prixEclats === undefined) && R.boutique.lots.every((l) => l.prixCentimes > 0) && R.boutique.offres.bienvenue.prixCentimes > 0);
check('une monnaie inconnue ne passe pas : l’article se paie dans la sienne', (() => {
  const r = acheterTroupe(avec(troupe.prix, 0), troupe.type, T0, 'or');
  return !r.erreur && r.profil.couronnes === 0;
})());

// --- Les écrans : deux boutons par article ---------------------------------------------------
console.log('--- Les écrans ---');
{
  const { ouvrirProgression, installerProgression, reglerPeuple } = await import('../js/progression-ecrans.js');
  const { PROGRESSION_KEY } = await import('../js/save.js');
  const { saisonDuJour } = await import('../js/progression.js');
  const memoire = new Map();
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); } }, configurable: true, writable: true });
  const noeud = { innerHTML: '', classList: { add() {}, remove() {} }, querySelector: () => null };
  let clic = null;
  Object.defineProperty(globalThis, 'document', { value: { getElementById: (id) => (id === 'progression' ? noeud : null), addEventListener: (t, f) => { if (t === 'click') clic = f; } }, configurable: true, writable: true });
  const toucher = (dataset) => clic({ target: { closest: () => ({ dataset }) } });
  const texte = (html) => html.replace(/<[^>]*>/g, ' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
  const lu = () => JSON.parse(memoire.get(PROGRESSION_KEY));
  const poser = (profil) => memoire.set(PROGRESSION_KEY, JSON.stringify(profil));
  installerProgression({});
  reglerPeuple('atlante');
  const maintenant = new Date();
  const aujourdhui = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}-${String(maintenant.getDate()).padStart(2, '0')}`;
  const neuf = (couronnes, eclats) => ({ ...profilNeuf(), saison: saisonDuJour(aujourdhui), couronnes, eclats });
  const aVendre = c.troupes.length;

  poser(neuf(0, troupe.prixEclats));
  ouvrirProgression('boutique');
  let page = noeud.innerHTML;
  check('à la boutique, chaque troupe a deux boutons : son prix en Couronnes, et dessous le même achat en Éclats',
    (page.match(/data-act="acheter" data-arg="\w+"(?! data-m)/g) || []).length === aVendre && (page.match(/data-act="acheter" data-arg="\w+" data-m="1"/g) || []).length === aVendre
    && (page.match(/class="prog-deux-prix"/g) || []).length >= aVendre);
  check('… le lot « Toutes les troupes », les teintures et les autocollants du jour aussi',
    /data-act="acheterTout" data-arg="tout" data-m="1"/.test(page) && (page.match(/data-act="acheterPiece" data-arg="teintures\.\w+" data-m="1"/g) || []).length === c.atelier.length
    && (page.match(/data-act="acheterPiece" data-arg="(?!teintures)[\w.-]+" data-m="1"/g) || []).length === (page.match(/data-act="acheterPiece" data-arg="(?!teintures)[\w.-]+"(?! data-m)/g) || []).length);
  check(`… et la règle est dite en une phrase : il faut ${CHANGE} Éclats pour 1 Couronne`, new RegExp(`il faut ${CHANGE} Éclats pour 1 Couronne`).test(texte(page)));
  check('… rien d’étrange à l’écran : ni « undefined », ni « NaN »', !/undefined|NaN|\[object/.test(page));

  toucher({ act: 'acheter', arg: troupe.type, i: '', m: '1' });
  page = noeud.innerHTML;
  check('toucher le prix en Éclats d’une troupe : ce bouton-là demande confirmation, pas celui en Couronnes',
    new RegExp(`data-act="acheter" data-arg="${troupe.type}" data-m="1" data-i="1">`).test(page) && !new RegExp(`data-act="acheter" data-arg="${troupe.type}" data-i="1"`).test(page) && lu().eclats === troupe.prixEclats);
  toucher({ act: 'acheter', arg: troupe.type, i: '1', m: '1' });
  check('… second toucher : la troupe est débloquée, payée en Éclats, les Couronnes n’ont pas bougé',
    lu().debloquees[troupe.type] === 'achat' && lu().eclats === 0 && lu().couronnes === 0 && /c’est débloqué/.test(texte(noeud.innerHTML)));

  poser(neuf(5000, troupe.prixEclats - 1));
  ouvrirProgression('boutique');
  toucher({ act: 'acheter', arg: troupe.type, i: '', m: '1' });
  check('pas assez d’Éclats : l’écran dit ce qu’il manque, et rien n’est pris — même avec des Couronnes plein la bourse',
    /Il te manque 1 pour cet achat/.test(texte(noeud.innerHTML)) && !lu().debloquees[troupe.type] && lu().couronnes === 5000);
  toucher({ act: 'acheter', arg: troupe.type });
  toucher({ act: 'acheter', arg: troupe.type, i: '1' });
  check('… et le bouton en Couronnes marche comme avant', lu().debloquees[troupe.type] === 'achat' && lu().couronnes === 5000 - troupe.prix && lu().eclats === troupe.prixEclats - 1);

  const teinture = c.atelier[0];
  poser(neuf(teinture.prixCouronnes, 0));
  ouvrirProgression('boutique');
  toucher({ act: 'acheterPiece', arg: teinture.piece, i: 's', m: '1' });
  check('une teinture en Couronnes, depuis la boutique : confirmation sur ce bouton, sans quitter la boutique',
    new RegExp(`data-arg="${teinture.piece.replace('.', '\\.')}" data-m="1" data-i="s1">`).test(noeud.innerHTML) && /<h2>Boutique<\/h2>/.test(noeud.innerHTML));
  toucher({ act: 'acheterPiece', arg: teinture.piece, i: 's1', m: '1' });
  check(`… achetée ${teinture.prixCouronnes} Couronnes au lieu de ${teinture.prix} Éclats`, lu().pieces.includes(teinture.piece) && lu().couronnes === 0 && lu().eclats === 0);

  const lot = c.collections[0];
  poser(neuf(0, lot.prixEclats));
  ouvrirProgression('collection', lot.collection);
  check('la page d’une collection à vendre montre ses deux prix', new RegExp(`data-act="acheterCollection" data-arg="${lot.collection}" data-m="1"`).test(noeud.innerHTML));
  toucher({ act: 'acheterCollection', arg: lot.collection, i: '', m: '1' });
  toucher({ act: 'acheterCollection', arg: lot.collection, i: '1', m: '1' });
  check('… achetée en Éclats, en deux touchers', lot.pieces.every((id) => lu().pieces.includes(id)) && lu().eclats === 0);

  const prixDuPasse = R.saisons.passe.prix * CHANGE;
  poser(neuf(0, prixDuPasse));
  ouvrirProgression('saison');
  check('la route de la saison propose le Passe dans les deux monnaies', /data-act="passe">/.test(noeud.innerHTML) && /data-act="passe" data-arg="" data-m="1"/.test(noeud.innerHTML));
  toucher({ act: 'passe', arg: '', i: '', m: '1' });
  check('toucher le prix en Éclats du Passe : c’est ce bouton qui demande confirmation', /data-act="passe" data-arg="" data-m="1" data-i="1">/.test(noeud.innerHTML) && !/data-act="passe" data-i="1"/.test(noeud.innerHTML) && lu().route.passe === false);
  toucher({ act: 'passe', arg: '', i: '1', m: '1' });
  check(`… second toucher : le Passe est pris pour ${prixDuPasse} Éclats`, lu().route.passe === true && lu().eclats === 0 && /Le Passe de saison est à toi/.test(texte(noeud.innerHTML)));
  poser(neuf(0, prixDuPasse - 1));
  ouvrirProgression('saison');
  toucher({ act: 'passe', arg: '', i: '', m: '1' });
  check('… un Éclat de moins : l’écran dit ce qu’il manque', /Il te manque 1 pour le Passe/.test(texte(noeud.innerHTML)) && lu().route.passe === false);
}

console.log(failures ? `\n${failures} essai(s) en échec` : '\nTout est bon.');
process.exit(failures ? 1 : 0);
