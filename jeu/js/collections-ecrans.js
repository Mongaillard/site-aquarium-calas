// ---------------------------------------------------------------------------
// Les écrans des collections : l'Album, la page d'une collection, le blason à
// composer, la route de la saison et son Passe — et les morceaux que les
// autres écrans leur empruntent (les autocollants d'un coffre, le rayon des
// collections à la boutique, la carte de joueur de l'accueil).
//
// Aucune règle ici : tout vient de js/progression.js, tous les nombres de
// js/progression-config.js, les pièces de js/collections-config.js. Ce module
// est branché par js/progression-ecrans.js, qui lui prête ses outils (montrer
// un écran, ranger le profil, écrire un nombre).
// ---------------------------------------------------------------------------

import { PROGRESSION as R } from './progression-config.js';
import { COLLECTIONS, PIECES, GENRES, NOMS_DES_GENRES, collection as collectionDuJeu, pieceDe } from './collections-config.js';
import {
  avancementDe, equiper, prixDePiece, acheterPiece, acheterCollection, catalogueBoutique,
  etatDeLaSaison, ouvrirLaSaison, prendrePalier, prendreTout, acheterPasse,
} from './progression.js';
import { htmlEmbleme, htmlPiece, htmlBlason, htmlMedaillon, svgBanniere, titreDuBlason, htmlSansTeinture } from './blason.js';
import { iconeSVG } from './icones.js';
import { EN_MAGASIN } from './edition.js';

/** Les outils prêtés par js/progression-ecrans.js : montrer, retenir, nombre, pluriel, couronnes, euros, jour, heure, coffre. */
let o = null;
export function brancherCollections(outils) { o = outils; }

const possede = (profil, id) => profil.pieces.includes(id);
/** Un montant en Éclats : le pictogramme, puis le nombre. */
export const eclats = (n, taille = 14) => `<span class="prog-eclats">${iconeSVG('eclat', taille, 'inline')}${o.nombre(n)}</span>`;
/** Ce que valent des Couronnes en euros, à peu près : le repère de la boutique (le premier lot). */
function environ(couronnes) {
  const lot = R.boutique.lots[0];
  return `environ ${Math.round(couronnes * lot.prixCentimes / lot.couronnes / 100)}\u00a0€`;
}
/**
 * Le prix en euros à écrire à côté d'un prix en Couronnes (« , environ 5 € ») :
 * les autorités européennes le demandent pour toute monnaie de jeu qui
 * s'achète en argent réel. Rien dans l'application des magasins tant que les
 * achats intégrés n'y sont pas ouverts : les Couronnes ne s'y achètent pas, un
 * prix en euros y serait une fausse promesse.
 */
export function enEuros(couronnes, avant = ', ', apres = '') {
  return EN_MAGASIN && !R.boutique.argentReel ? '' : `${avant}${environ(couronnes)}${apres}`;
}

const SOURCES = { coffres: 'Dans les coffres', boutique: 'À la boutique', ligues: 'Par les ligues', saison: 'Route de saison', atelier: 'En Éclats' };
/** Les genres de pièces qui s'accordent au féminin : « la Bannière », « Portée ». */
const FEMININS = ['banniere', 'teinture'];
/** La rareté d'un autocollant : « Commun », « Rare », « Épique ». */
const rarete = (p) => `<span class="prog-categorie" data-categorie="${p.rarete}">${R.collections.raretes[p.rarete]}</span>`;
/** « le titre « Fermier » », « la Bannière de la Basse-cour », « l'Étendard de la Nuit », « le Cadre d'Or » : une pièce dans une phrase. */
export function pieceEnPhrase(id) {
  const p = PIECES[id];
  if (p.genre === 'grade') return `le titre «\u00a0${p.nom}\u00a0»`;
  if (p.genre === 'epithete') return `le titre «\u00a0…\u00a0${p.nom}\u00a0»`;
  if (p.genre === 'embleme') return `l’autocollant «\u00a0${p.nom}\u00a0»`;
  return `${/^[AEÉIOU]/.test(p.nom) ? 'l’' : FEMININS.includes(p.genre) ? 'la ' : 'le '}${p.nom}`;
}
/** Une pièce derrière deux points (« Gagné : … ») : un mot de titre se dit « titre « … » », le reste par son nom. */
export function pieceEnEtiquette(id) {
  const p = PIECES[id];
  return p.genre === 'grade' ? `titre «\u00a0${p.nom}\u00a0»` : p.genre === 'epithete' ? `titre «\u00a0…\u00a0${p.nom}\u00a0»` : p.nom;
}

// --- L'Album ---------------------------------------------------------------------

/** Les collections que l'album montre à ce profil : celle de la saison en cours, celles des coffres, de la boutique et des ligues — et une saison passée dont on garde des pièces. */
function collectionsVisibles(profil, saison) {
  const visibles = COLLECTIONS.filter((c) => c.source !== 'depart'
    && (c.source !== 'saison' || c.id === saison.theme || c.pieces.some((id) => possede(profil, id))));
  // (La saison en cours d'abord.)
  return visibles.sort((a, b) => (b.id === saison.theme) - (a.id === saison.theme));
}

function ecranAlbum(profil) {
  const saison = etatDeLaSaison(profil, o.jour());
  const total = { reunis: 0, toutes: 0 };
  const lignes = collectionsVisibles(profil, saison).map((c) => {
    const a = avancementDe(profil, c.id);
    total.reunis += a.pieces; total.toutes += a.toutes;
    const bande = c.emblemes.map((id) => htmlEmbleme(id, { manque: !possede(profil, id) })).join('')
      || c.pieces.map((id) => htmlPiece(id, { manque: !possede(profil, id) })).join('');
    const source = c.id === saison.theme ? `Saison ${saison.numero}` : SOURCES[c.source];
    return `
      <li><button class="col-collection ${a.complete ? 'complete' : ''}" data-ecran="collection" data-arg="${c.id}">
        <span class="col-collection-tete"><b>${c.nom}</b><small>${a.pieces} sur ${a.toutes} · ${source}</small></span>
        <span class="col-bande ${c.emblemes.length ? '' : 'mots'}">${bande}</span>
        <span class="prog-barre"><span style="width:${Math.round(a.pieces / a.toutes * 100)}%"></span></span>
      </button></li>`;
  }).join('');
  o.montrer('Album', `
    <button class="col-carte-joueur" data-ecran="blason" aria-label="Composer mon blason">
      ${htmlBlason(profil.blason, { sous: 'Toucher pour composer ton blason' })}
    </button>
    <p class="col-bourses">${eclats(profil.eclats, 18)} <span>${profil.eclats > 1 ? 'Éclats' : 'Éclat'}</span> · ${o.couronnes(profil.couronnes, 18)} <span>${profil.couronnes > 1 ? 'Couronnes' : 'Couronne'}</span></p>
    <p class="subtitle">${o.pluriel(total.reunis, 'pièce')} sur ${total.toutes}. Chaque coffre contient au moins un autocollant ; un doublon devient des Éclats, qui achètent ceux qui te manquent.</p>
    <ul class="col-liste">${lignes}</ul>`);
}

// --- Une collection ----------------------------------------------------------------

/** Ce qu'on fait d'une pièce depuis la page de sa collection : la porter, l'acheter, ou savoir où elle se gagne. */
function piedDePiece(profil, id, confirmer) {
  const p = PIECES[id];
  if (possede(profil, id)) {
    const porte = profil.blason[p.genre] === id;
    return porte ? `<span class="col-porte">${FEMININS.includes(p.genre) ? 'Portée' : 'Porté'}</span>` : `<button class="btn small" data-act="porter" data-arg="${id}">Porter</button>`;
  }
  const prix = prixDePiece(profil, id, o.jour());
  if (prix === null) return `<span class="col-verrou">${iconeSVG('cadenas', 12, 'inline')}</span>`;
  if (profil.eclats < prix) return `<button class="btn small prog-cher" data-act="acheterPiece" data-arg="${id}">${eclats(prix)}</button>`;
  return confirmer === id
    ? `<button class="btn small danger" data-act="acheterPiece" data-arg="${id}" data-i="1">Encore : ${eclats(prix)}</button>`
    : `<button class="btn small primary" data-act="acheterPiece" data-arg="${id}">${eclats(prix)}</button>`;
}

/** Le bouton d'une collection vendue entière : son prix en Couronnes, en deux touchers. */
function boutonDeLot(lot, solde, confirmer) {
  if (!lot.manquantes.length) return '<span class="prog-acquis">À toi</span>';
  if (solde < lot.prix) return `<button class="btn small prog-cher" data-act="acheterCollection" data-arg="${lot.collection}">${o.couronnes(lot.prix)}</button>`;
  return confirmer === lot.collection
    ? `<button class="btn small danger" data-act="acheterCollection" data-arg="${lot.collection}" data-i="1">Toucher encore : ${o.couronnes(lot.prix)}</button>`
    : `<button class="btn small primary" data-act="acheterCollection" data-arg="${lot.collection}">${o.couronnes(lot.prix)}</button>`;
}

function ecranCollection(id, profil, message = '', { confirmer = '' } = {}) {
  const c = collectionDuJeu(id);
  if (!c || c.source === 'depart') return ecranAlbum(profil);
  const a = avancementDe(profil, c.id);
  const saison = etatDeLaSaison(profil, o.jour());
  const autres = c.pieces.filter((x) => PIECES[x].genre !== 'embleme');
  // (Une collection à vendre se montre en couleurs : on voit ce qu'on achète. Les autres gardent leurs silhouettes.)
  const cache = (x) => !possede(profil, x) && c.source !== 'boutique';
  // (Un mot de titre s'écrit déjà sur sa vignette : dessous, on dit seulement sa place dans le titre.)
  const legende = (x) => (PIECES[x].genre === 'grade' ? 'Titre, le premier mot' : PIECES[x].genre === 'epithete' ? 'Titre, la suite' : PIECES[x].nom);
  const grille = c.emblemes.map((x) => `
    <li class="col-piece ${possede(profil, x) ? '' : 'manque'}">
      ${htmlEmbleme(x, { manque: cache(x) })}
      <b>${PIECES[x].nom}</b>
      ${rarete(PIECES[x])}
      ${piedDePiece(profil, x, confirmer)}
    </li>`).join('');
  // D'où viennent ses pièces, et ce qu'on peut y faire.
  let chapeau = '';
  let suite = '';
  if (c.source === 'coffres') {
    const manque = a.total - a.reunis;
    chapeau = manque ? `Ses autocollants sortent des coffres. Il t’en manque ${manque} : chacun s’achète aussi en Éclats.` : 'Tu as réuni tous ses autocollants.';
    const paliers = Object.entries(R.collections.paliers).map(([court, seuil]) => ({ seuil, piece: pieceDe(c.id, court) })).filter((x) => x.piece);
    const seuils = [...new Set(paliers.map((x) => x.seuil))].sort((x, y) => x - y);
    suite = `<h3>Ce que la collection donne</h3><ul class="col-paliers">${seuils.map((seuil) => {
      const pieces = paliers.filter((x) => x.seuil === seuil).map((x) => x.piece);
      return `<li class="${a.reunis >= seuil ? 'atteint' : ''}"><span class="col-seuil">${seuil}</span>
        <span class="col-palier-pieces">${pieces.map((x) => `<span class="col-lot">${htmlPiece(x, { manque: cache(x) })}<small>${legende(x)}</small>${possede(profil, x) ? piedDePiece(profil, x) : ''}</span>`).join('')}</span></li>`;
    }).join('')}</ul>
      <p class="hint">Un autocollant commun vaut ${R.collections.eclats.prix.commune} Éclats, un rare ${R.collections.eclats.prix.rare}, un épique ${R.collections.eclats.prix.epique}. Les ${R.collections.eclats.selection.nombre} autocollants du jour, à la boutique, sont à moitié prix.</p>`;
  } else {
    if (c.source === 'boutique') {
      const lot = catalogueBoutique(profil, o.heure(), o.jour()).collections.find((x) => x.collection === c.id);
      chapeau = lot && lot.manquantes.length ? `Une collection de la boutique : ses ${c.pieces.length} pièces d’un coup, pour ${o.nombre(lot.prix)} Couronnes${enEuros(lot.prix, ' (', ')')}.` : 'Cette collection est à toi.';
      if (lot && lot.manquantes.length) chapeau += `</p><div class="modal-actions">${boutonDeLot(lot, profil.couronnes, confirmer)}</div><p class="col-vide">`;
    } else if (c.source === 'saison') {
      chapeau = c.id === saison.theme ? `La collection de la saison ${saison.numero} : elle se gagne palier après palier, sur la route de la saison.`
        : 'La collection d’une autre saison.';
      if (c.id === saison.theme) chapeau += `</p><div class="modal-actions"><button class="btn primary" data-ecran="saison">${iconeSVG('saison', 16, 'inline')} Voir la route</button></div><p class="col-vide">`;
    } else if (c.source === 'atelier') {
      chapeau = 'Une teinture habille tes troupes d’une autre matière, en partie : l’or et l’acier changent, jamais le tissu de ton camp. Elle ne change rien au combat. Chacune s’achète en Éclats.';
    } else {
      chapeau = 'Les cadeaux des ligues : ils arrivent à chaque promotion.';
    }
    suite = autres.length ? `<h3>${c.emblemes.length ? 'Et avec elle' : 'Ses pièces'}</h3><ul class="col-autres">${autres.map((x) => `
      <li class="col-lot ${possede(profil, x) ? '' : 'manque'}">${htmlPiece(x, { manque: cache(x) })}<small>${legende(x)}</small>${piedDePiece(profil, x, confirmer)}</li>`).join('')}</ul>` : '';
  }
  o.montrer(c.nom, `
    <p class="subtitle">${o.pluriel(a.pieces, 'pièce')} sur ${a.toutes}. ${chapeau}</p>
    ${message ? `<p class="prog-annonce">${message}</p>` : ''}
    <p class="col-bourses">${eclats(profil.eclats, 18)} <span>${profil.eclats > 1 ? 'Éclats' : 'Éclat'}</span></p>
    ${grille ? `<ul class="col-grille">${grille}</ul>` : ''}
    ${suite}`, { retour: 'album' });
}

// --- Le blason ---------------------------------------------------------------------

const TITRES_DES_GENRES = { embleme: 'Autocollant', cadre: 'Cadre', banniere: 'Bannière', grade: 'Titre : le premier mot', epithete: 'Titre : la suite', teinture: 'Teinture des troupes' };

function ecranBlason(profil, message = '') {
  const sections = GENRES.map((genre) => {
    const miennes = profil.pieces.filter((id) => PIECES[id].genre === genre);
    const porte = profil.blason[genre];
    const choix = miennes.map((id) => `
      <button class="col-choix ${porte === id ? 'porte' : ''}" data-act="porter" data-arg="${id}" data-i="b" aria-pressed="${porte === id}" aria-label="${PIECES[id].nom}">${htmlPiece(id)}</button>`);
    // (L'autocollant, la suite du titre et la teinture peuvent manquer.)
    if (genre === 'embleme' || genre === 'epithete') {
      choix.unshift(`<button class="col-choix ${porte === null ? 'porte' : ''}" data-act="retirer" data-arg="${genre}" aria-pressed="${porte === null}"><span class="piece-vignette piece-mot"><b>${genre === 'embleme' ? 'Aucun' : 'Rien'}</b></span></button>`);
    } else if (genre === 'teinture') {
      choix.unshift(`<button class="col-choix ${porte === null ? 'porte' : ''}" data-act="retirer" data-arg="teinture" aria-pressed="${porte === null}" aria-label="Sans teinture : les troupes telles qu’elles sont">${htmlSansTeinture()}</button>`);
    }
    let vide = genre === 'embleme' && !miennes.length ? '<p class="hint">Ton premier autocollant t’attend dans un coffre.</p>' : '';
    if (genre === 'teinture') {
      vide = `<p class="hint">En partie, l’or et l’acier de tes troupes changent de matière ; le tissu de ton camp ne change jamais. <button class="btn small" data-ecran="collection" data-arg="teintures">${miennes.length ? 'Les autres teintures' : 'Voir les teintures'}</button></p>`;
    }
    return `<h3>${TITRES_DES_GENRES[genre]}</h3><div class="col-choix-liste" data-genre="${genre}">${choix.join('')}</div>${vide}`;
  }).join('');
  o.montrer('Mon blason', `
    <div class="col-carte-joueur">${htmlBlason(profil.blason, { classe: 'grand' })}</div>
    ${message ? `<p class="prog-annonce">${message}</p>` : ''}
    <p class="subtitle">Ton blason se voit à l’accueil et à la fin de chaque partie classée. Il ne change rien au combat.</p>
    ${sections}`, { retour: 'album' });
}

// --- La saison -----------------------------------------------------------------------

/** Une récompense de la route, en petit : l'image, et ce que c'est. `deja` : les Éclats qu'elle rendra si on a déjà la pièce. */
function htmlRecompense(r, deja = 0) {
  if (!r) return '';
  if (r.genre === 'coffre') return `<span class="col-recompense">${o.coffre(r.coffre, 'ferme', 40)}<small>${R.coffres[r.coffre].nom}</small></span>`;
  if (r.genre === 'couronnes') return `<span class="col-recompense"><span class="col-monnaie">${iconeSVG('couronne', 24)}</span><small>${o.nombre(r.couronnes)} Couronnes</small></span>`;
  if (r.genre === 'eclats') return `<span class="col-recompense"><span class="col-monnaie eclat">${iconeSVG('eclat', 24)}</span><small>${o.nombre(r.eclats)} Éclats</small></span>`;
  const p = PIECES[r.piece];
  // (Un cadre ou une bannière portent leur genre dans leur nom ; un mot de titre, non.)
  const nom = p.genre === 'grade' ? `Titre : ${p.nom}` : p.genre === 'epithete' ? `Titre : … ${p.nom}` : p.nom;
  return `<span class="col-recompense">${htmlPiece(r.piece)}<small>${nom}</small>${deja ? `<small class="col-deja">Déjà à toi : ${eclats(deja)}</small>` : ''}</span>`;
}

/** Ce que contient la voie du Passe, compté sur la route : « 12 autocollants, la bannière… ». */
function contenuDuPasse() {
  const compte = { embleme: 0, autres: 0, couronnes: 0, eclats: 0 };
  for (const ligne of R.saisons.route) {
    const r = ligne.passe;
    if (Number.isInteger(r.embleme)) compte.embleme++;
    else if (r.piece) compte.autres++;
    else if (r.couronnes) compte.couronnes += r.couronnes;
    else if (r.eclats) compte.eclats += r.eclats;
  }
  return `${compte.embleme} autocollants, ${compte.autres} pièces de blason (bannière, cadre, deux mots de titre), ${o.nombre(compte.couronnes)} Couronnes et ${o.nombre(compte.eclats)} Éclats`;
}

function celluleDePalier(voie, palier, c) {
  let pied;
  if (c.etat === 'pris') pied = '<span class="col-pris">Pris</span>';
  else if (c.etat === 'aPrendre') pied = `<button class="btn small primary prog-attend" data-act="palier" data-arg="${voie}" data-i="${palier}">Prendre</button>`;
  else if (c.etat === 'ferme') pied = `<span class="col-verrou">${iconeSVG('cadenas', 12, 'inline')}</span>`;
  else pied = '';
  return `<span class="col-case ${c.etat}" data-voie="${voie}">${htmlRecompense(c.recompense, c.dejaLa ? c.eclats : 0)}${pied}</span>`;
}

function ecranSaison(profil, message = '', { confirmer = false } = {}) {
  const s = etatDeLaSaison(profil, o.jour());
  const theme = collectionDuJeu(s.theme);
  const lignes = s.route.map((l) => `
    <li class="col-palier ${l.atteint ? 'atteint' : ''} ${l.palier === s.palier + 1 ? 'suivant' : ''}">
      ${celluleDePalier('gratuit', l.palier, l.gratuit)}
      <span class="col-numero">${l.palier}</span>
      ${celluleDePalier('passe', l.palier, l.passe)}
    </li>`).join('');
  const p = R.saisons.points;
  // (Un thème qui revient : ce que le Passe donnerait de pièces déjà possédées, et ce qu'elles rendraient.)
  const doublons = s.route.filter((l) => l.passe.dejaLa);
  const dejaLa = doublons.length, eclatsRendus = doublons.reduce((somme, l) => somme + l.passe.eclats, 0);
  let passe;
  if (s.passe) {
    passe = '<p class="col-passe pris"><b>Passe de saison : à toi.</b> Les deux voies sont ouvertes.</p>';
  } else {
    const bouton = profil.couronnes < s.prixDuPasse
      ? `<button class="btn prog-cher" data-act="passe">${o.couronnes(s.prixDuPasse)}</button>`
      : confirmer
        ? `<button class="btn danger" data-act="passe" data-i="1">Toucher encore : ${o.couronnes(s.prixDuPasse)}</button>`
        : `<button class="btn primary" data-act="passe">${o.couronnes(s.prixDuPasse)}</button>`;
    passe = `
      <div class="col-passe">
        <p><b>Le Passe de saison</b> ouvre la voie de droite : ${contenuDuPasse()}. Ni coffre, ni fragment, ni niveau.</p>
        ${dejaLa ? `<p class="col-deja-passe">Cette collection est déjà passée par ici : tu as ${dejaLa} de ces pièces. Celles-là te rendront des Éclats à la place (${eclats(eclatsRendus)} en tout).</p>` : ''}
        <div class="modal-actions">${bouton}</div>
        <p class="hint">${o.nombre(s.prixDuPasse)} Couronnes${enEuros(s.prixDuPasse)}. Acheté en cours de saison, il donne aussi les paliers déjà atteints.</p>
      </div>`;
  }
  o.montrer(`Saison ${s.numero}`, `
    <div class="col-saison-tete">${svgBanniere(pieceDe(theme.id, 'banniere'))}
      <span class="col-saison-texte"><b>${theme.nom}</b>
        <small>${s.joursRestants === null ? '' : s.joursRestants > 1 ? `Il reste ${s.joursRestants} jours` : 'Dernier jour'}</small></span>
    </div>
    <div class="prog-cout">
      <span class="prog-barre"><span style="width:${s.palier >= s.paliers ? 100 : Math.round(s.versLeSuivant / s.parPalier * 100)}%"></span></span>
      <small>Palier ${s.palier} sur ${s.paliers}${s.palier >= s.paliers ? ' : la route est finie' : ` · ${o.pluriel(s.versLeSuivant, 'point')} sur ${s.parPalier} vers le suivant`}</small>
    </div>
    ${message ? `<p class="prog-annonce">${message}</p>` : ''}
    <p class="subtitle">Une partie classée : ${p.partie} points. Une victoire : ${p.victoire} de plus. La première victoire du jour : encore ${p.premiereVictoireDuJour}.</p>
    ${s.aPrendre > 1 ? `<div class="modal-actions"><button class="btn primary prog-attend" data-act="toutPrendre">Tout prendre (${s.aPrendre})</button></div>` : ''}
    ${passe}
    <div class="col-voies"><b>Pour tous</b><span></span><b>${iconeSVG('couronne', 14, 'inline')} Passe</b></div>
    <ol class="col-route">${lignes}</ol>
    <p class="hint">À la fin du mois, les paliers atteints et pas encore pris te sont donnés, puis la saison suivante commence.</p>`);
  const n = document.getElementById('progression');
  const ici = n && n.querySelector('.col-palier.suivant');
  if (ici && ici.scrollIntoView && !message && !confirmer && s.palier > 2) ici.scrollIntoView({ block: 'center' });
}

/** Ce que des événements ont donné, en une phrase : « 20 Éclats, l'autocollant « Citrouille casquée » ». */
export function resumeDesGains(evenements) {
  const gains = [];
  let nEclats = 0, nCouronnes = 0;
  for (const e of evenements) {
    if (e.type === 'eclats' && e.variation > 0) nEclats += e.variation;
    else if (e.type === 'couronnes' && e.variation > 0) nCouronnes += e.variation;
    else if (e.type === 'coffre') gains.push(`un ${R.coffres[e.coffre].nom.toLowerCase()}`);
    else if (e.type === 'piece' && !e.doublon) gains.push(pieceEnPhrase(e.piece));
    else if (e.type === 'piece') nEclats += e.eclats;
  }
  if (nCouronnes) gains.unshift(`${o.nombre(nCouronnes)} Couronnes`);
  if (nEclats) gains.unshift(`${o.nombre(nEclats)} Éclats`);
  return gains.join(', ');
}

// --- Ce que les autres écrans empruntent ---------------------------------------------

/** À l'accueil : le médaillon du joueur (il ouvre le blason) et son titre. */
export function htmlJoueur(profil) {
  return `<button class="prog-joueur" data-ecran="blason" aria-label="Mon blason : ${titreDuBlason(profil.blason)}">${htmlMedaillon(profil.blason)}</button>`;
}

/** À l'accueil : les deux bourses, qui ouvrent la boutique. */
export function htmlBourses(profil) {
  return `<button class="prog-bourses" data-ecran="boutique" aria-label="${profil.eclats} Éclats, ${profil.couronnes} Couronnes : ouvrir la boutique">${eclats(profil.eclats)}${o.couronnes(profil.couronnes)}</button>`;
}

/** Le nombre de choses qui attendent dans la saison : les paliers à prendre. */
export const aPrendreDansLaSaison = (profil) => etatDeLaSaison(profil, o.jour()).aPrendre;

/** À l'ouverture d'un coffre : ses autocollants, ce qu'une collection avancée donne alors, et ses Éclats. */
export function htmlPiecesDuCoffre(resultat, delai) {
  const lignes = [];
  let rang = 0;
  const ligne = (image, titre, sous, gain) => lignes.push(`
    <li class="prog-tirage col-tirage" style="animation-delay:${delai + rang++ * 140}ms">
      ${image}
      <span class="prog-tirage-texte"><b>${titre}</b><small>${sous}</small></span>
      <span class="prog-gain">${gain}</span>
    </li>`);
  for (const t of resultat.pieces) {
    const p = PIECES[t.piece];
    ligne(`<span class="prog-vignette col-vignette">${htmlEmbleme(t.piece)}</span>`, p.nom,
      `${rarete(p)} · ${collectionDuJeu(p.collection).nom}`, t.doublon ? `Doublon : +${eclats(t.eclats)}` : '<span class="col-nouveau">Nouveau</span>');
  }
  for (const e of resultat.evenements) {
    if (e.type !== 'piece' || e.origine !== 'collection') continue;
    const p = PIECES[e.piece];
    // (Un mot de titre n'a pas d'image : des guillemets en tiennent lieu.)
    const image = p.genre === 'grade' || p.genre === 'epithete' ? '<b class="col-guillemets" aria-hidden="true">«\u00a0»</b>' : htmlPiece(e.piece);
    ligne(`<span class="prog-vignette col-vignette">${image}</span>`, p.genre === 'epithete' ? `… ${p.nom}` : p.nom,
      `${NOMS_DES_GENRES[p.genre]} · ${collectionDuJeu(p.collection).nom}`, '<span class="col-nouveau">Gagné</span>');
  }
  const fixes = R.collections.eclats.parCoffre[resultat.coffre] || 0;
  if (fixes) ligne(`<span class="prog-vignette col-monnaie eclat">${iconeSVG('eclat', 26)}</span>`, 'Éclats', 'dans chaque coffre', `+${eclats(fixes)}`);
  return lignes.join('');
}

/** Ce que la boutique dit des autocollants du jour : combien il en reste, ou pourquoi il n'y en a plus. */
function texteDeLaSelection(c) {
  const n = c.selection.length, max = R.collections.eclats.selection.nombre;
  const regle = `${max} par jour, à moitié prix, en Éclats`;
  if (n === 0) return c.selectionPrise ? `Tu as pris tes autocollants du jour. D’autres demain : ${regle}.` : 'Il ne te manque aucun autocollant des coffres.';
  const debut = n === 1 ? 'Un autocollant qui te manque' : `${['', '', 'Deux', 'Trois'][n] || n} autocollants qui te manquent`;
  return `${debut} : ${regle}. Un autocollant acheté n’est pas remplacé avant demain.`;
}

/** À la boutique : le Passe, la sélection du jour (en Éclats), les collections vendues entières (en Couronnes). */
export function htmlRayonDesCollections(profil, c, confirmer) {
  const saison = etatDeLaSaison(profil, o.jour());
  const theme = collectionDuJeu(saison.theme);
  const passe = `
    <h3>Saison ${saison.numero} : ${theme.nom}</h3>
    <ul class="prog-articles">
      <li class="prog-article ${c.passe.pris ? 'acquis' : ''}">
        <span class="prog-vignette col-vignette">${htmlEmbleme(theme.emblemes[theme.emblemes.length - 1])}</span>
        <span class="prog-offre-texte">
          <b>Passe de saison</b>
          <small>${c.passe.pris ? 'Les deux voies sont ouvertes.' : `${o.nombre(c.passe.prix)} Couronnes${enEuros(c.passe.prix)} · ni coffre, ni fragment, ni niveau`}</small>
        </span>
        <button class="btn small ${c.passe.pris ? '' : 'primary'}" data-ecran="saison">${c.passe.pris ? 'La route' : 'Voir'}</button>
      </li>
    </ul>`;
  const selection = c.selection.map((x) => {
    const p = PIECES[x.piece];
    const bouton = c.eclats < x.prix
      ? `<button class="btn small prog-cher" data-act="acheterPiece" data-arg="${x.piece}" data-i="s">${eclats(x.prix)}</button>`
      : confirmer === x.piece
        ? `<button class="btn small danger" data-act="acheterPiece" data-arg="${x.piece}" data-i="s1">Encore : ${eclats(x.prix)}</button>`
        : `<button class="btn small primary" data-act="acheterPiece" data-arg="${x.piece}" data-i="s">${eclats(x.prix)}</button>`;
    return `
      <li class="prog-article">
        <span class="prog-vignette col-vignette">${htmlEmbleme(x.piece)}</span>
        <span class="prog-offre-texte">
          <b>${p.nom}</b>
          <small>${rarete(p)} · ${collectionDuJeu(p.collection).nom} · <s>${o.nombre(x.prixPlein)}</s></small>
        </span>
        ${bouton}
      </li>`;
  }).join('');
  const teintures = c.atelier.map((x) => {
    const p = PIECES[x.piece];
    const bouton = x.possedee ? '<span class="prog-acquis">À toi</span>'
      : c.eclats < x.prix ? `<button class="btn small prog-cher" data-act="acheterPiece" data-arg="${x.piece}" data-i="s">${eclats(x.prix)}</button>`
        : confirmer === x.piece ? `<button class="btn small danger" data-act="acheterPiece" data-arg="${x.piece}" data-i="s1">Encore : ${eclats(x.prix)}</button>`
          : `<button class="btn small primary" data-act="acheterPiece" data-arg="${x.piece}" data-i="s">${eclats(x.prix)}</button>`;
    return `
      <li class="prog-article ${x.possedee ? 'acquis' : ''}">
        <span class="prog-vignette col-vignette">${htmlPiece(x.piece)}</span>
        <span class="prog-offre-texte"><b>${p.nom}</b><small>${x.possedee ? 'À porter depuis ton blason.' : 'Pour toutes tes troupes'}</small></span>
        ${bouton}
      </li>`;
  }).join('');
  const lots = c.collections.map((lot) => {
    const col = collectionDuJeu(lot.collection);
    return `
      <li class="prog-article col-article-lot ${lot.manquantes.length ? '' : 'acquis'}">
        <button class="col-bande" data-ecran="collection" data-arg="${col.id}" aria-label="Voir la collection : ${col.nom}">${col.emblemes.map((id) => htmlEmbleme(id)).join('')}</button>
        <span class="prog-offre-texte">
          <b>${col.nom}</b>
          <small>${col.emblemes.length} autocollants, sa bannière, son cadre et ses deux mots de titre${lot.manquantes.length ? enEuros(lot.prix, ' · ') : ''}</small>
        </span>
        ${lot.manquantes.length
    ? `<button class="btn small ${c.couronnes < lot.prix ? 'prog-cher' : 'primary'}" data-ecran="collection" data-arg="${col.id}">${o.couronnes(lot.prix)}</button>`
    : '<span class="prog-acquis">À toi</span>'}
      </li>`;
  }).join('');
  return `
    ${passe}
    <h3>Autocollants du jour</h3>
    <p class="subtitle">${texteDeLaSelection(c)}</p>
    ${selection ? `<ul class="prog-articles">${selection}</ul>` : ''}
    ${teintures ? `<h3>Teintures des troupes</h3><p class="subtitle">L’or et l’acier de tes troupes dans une autre matière. En Éclats.</p><ul class="prog-articles">${teintures}</ul>` : ''}
    ${lots ? `<h3>Collections</h3><p class="subtitle">Une collection entière d’un coup. Tout son contenu est affiché : rien n’y est tiré au sort.</p><ul class="prog-articles">${lots}</ul>` : ''}`;
}

// --- Ouvrir un écran, agir ------------------------------------------------------------

/** Les écrans de ce module, à ajouter à ceux de la progression. */
export const ECRANS_DES_COLLECTIONS = {
  album: (p) => ecranAlbum(p),
  collection: (p, arg) => ecranCollection(arg, p),
  blason: (p) => ecranBlason(p),
  // (L'écran de la saison met d'abord le profil à la saison du jour.)
  saison: (p) => ecranSaison(...aLaSaisonDuJour(p)),
};

/**
 * Met le profil à la saison du jour, le range s'il a changé, et rend
 * `[profil, message]` : le message dit ce que la fin de la saison passée a
 * donné, et ce qu'elle a repris au classement. Sans message quand rien n'a été clos.
 */
function aLaSaisonDuJour(profil) {
  const r = ouvrirLaSaison(profil, o.jour());
  if (r.profil.saison !== profil.saison) o.retenir(r.profil);
  if (!r.evenements.length) return [r.profil, ''];
  const remise = r.evenements.find((e) => e.type === 'remiseDeSaison');
  const chute = r.evenements.filter((e) => e.type === 'retrogradation').pop();
  const gains = resumeDesGains(r.evenements);
  const phrases = ['La saison passée est finie, une nouvelle commence.'];
  if (remise && remise.variation < 0) phrases.push(`Au-dessus de ${o.nombre(R.saison.pivot)} points, le classement se resserre : ton score repart de ${o.nombre(remise.apres)}${chute ? `, en ${o.ligueEnPhrase(chute.a)}` : ''}.`);
  if (gains) phrases.push(`Tu reçois : ${gains}.`);
  return [r.profil, phrases.join(' ')];
}

const REFUS = 'Sauvegarde impossible sur cet appareil : ce ne sera pas retenu.';

/**
 * Une action d'un de ces écrans. Renvoie true si elle était pour lui.
 * `revenir(profil, message, confirmer)` : pour un autocollant acheté depuis
 * la boutique, redessine la boutique.
 */
export function agirSurLesCollections(act, arg, i, profil, revenir) {
  if (act === 'porter' || act === 'retirer') {
    if (act === 'porter' && !PIECES[arg]) { ecranAlbum(profil); return true; }
    const genre = act === 'retirer' ? arg : PIECES[arg].genre;
    const r = equiper(profil, genre, act === 'retirer' ? null : arg);
    const suite = r.erreur ? profil : r.profil;
    if (!r.erreur) o.retenir(r.profil);
    // (Depuis le blason, on y reste ; depuis une collection aussi.)
    if (act === 'retirer' || i === 'b') ecranBlason(suite);
    else ecranCollection(PIECES[arg].collection, suite, r.erreur ? '' : `${PIECES[arg].nom} : c’est sur ton blason.`);
    return true;
  }
  if (act === 'acheterPiece') {
    const p = PIECES[arg];
    const boutique = typeof i === 'string' && i[0] === 's';
    const montrer = (prof, message, confirmer) => (boutique ? revenir(prof, message, confirmer) : ecranCollection(p ? p.collection : '', prof, message, { confirmer }));
    const prix = prixDePiece(profil, arg, o.jour());
    if (prix === null) { montrer(profil, ''); return true; }
    if (profil.eclats < prix) { montrer(profil, `Il te manque ${eclats(prix - profil.eclats)} pour ${p.genre === 'teinture' ? 'cette teinture' : 'cet autocollant'}.`); return true; }
    if (i !== '1' && i !== 's1') { montrer(profil, '', arg); return true; }
    const r = acheterPiece(profil, arg, o.jour());
    if (r.erreur) { montrer(profil, ''); return true; }
    const ok = o.retenir(r.profil);
    const enPlus = r.evenements.filter((e) => e.type === 'piece' && e.origine === 'collection').map((e) => pieceEnPhrase(e.piece));
    const suite = p.genre === 'teinture' ? ' Porte-la depuis ton blason pour la voir en partie.' : enPlus.length ? ` La collection te donne ${enPlus.join(' et ')}.` : '';
    montrer(r.profil, ok ? `${p.nom} : dans ton album.${suite}` : REFUS);
    return true;
  }
  if (act === 'acheterCollection') {
    const c = collectionDuJeu(arg);
    const lot = catalogueBoutique(profil, o.heure(), o.jour()).collections.find((x) => x.collection === arg);
    // (L'achat se fait sur la page de la collection : tout son contenu y est sous les yeux.)
    const montrer = (prof, message, confirmer) => ecranCollection(arg, prof, message, { confirmer });
    if (!c || !lot || !lot.manquantes.length) { montrer(profil, ''); return true; }
    if (profil.couronnes < lot.prix) { montrer(profil, `Il te manque ${o.couronnes(lot.prix - profil.couronnes)} pour cette collection.`); return true; }
    if (i !== '1') { montrer(profil, '', arg); return true; }
    const r = acheterCollection(profil, arg);
    if (r.erreur) { montrer(profil, ''); return true; }
    const ok = o.retenir(r.profil);
    ecranCollection(arg, r.profil, ok ? `${c.nom} : toute la collection est à toi.` : REFUS);
    return true;
  }
  if (act === 'palier' || act === 'toutPrendre' || act === 'passe') {
    // (L'écran est resté ouvert pendant que le mois tournait : on ouvre d'abord la nouvelle saison, sans rien prendre ni vendre.)
    const [aJour, message] = aLaSaisonDuJour(profil);
    if (aJour.saison !== profil.saison) { ecranSaison(aJour, message); return true; }
  }
  if (act === 'palier' || act === 'toutPrendre') {
    const r = act === 'palier' ? prendrePalier(profil, arg, Number(i)) : prendreTout(profil);
    if (r.erreur) { ecranSaison(profil); return true; }
    const ok = o.retenir(r.profil);
    ecranSaison(r.profil, ok ? `Tu reçois : ${resumeDesGains(r.evenements)}.` : REFUS);
    return true;
  }
  if (act === 'passe') {
    const s = etatDeLaSaison(profil, o.jour());
    if (s.passe) { ecranSaison(profil); return true; }
    if (profil.couronnes < s.prixDuPasse) {
      ecranSaison(profil, `Il te manque ${o.couronnes(s.prixDuPasse - profil.couronnes)} pour le Passe. <button class="btn small" data-ecran="boutique">Boutique</button>`);
      return true;
    }
    if (i !== '1') { ecranSaison(profil, '', { confirmer: true }); return true; }
    const r = acheterPasse(profil);
    if (r.erreur) { ecranSaison(profil); return true; }
    const ok = o.retenir(r.profil);
    ecranSaison(r.profil, ok ? 'Le Passe de saison est à toi : la voie de droite est ouverte.' : REFUS);
    return true;
  }
  return false;
}
