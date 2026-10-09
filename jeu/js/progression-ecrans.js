// ---------------------------------------------------------------------------
// Les écrans de la progression : le bandeau de ligue de l'accueil, la route
// des ligues, les coffres et leur ouverture, les probabilités, les troupes,
// la fiche d'une troupe, la boutique, et ce que la fin d'une partie classée
// annonce. Ceux des collections (album, blason, saison) sont dans
// js/collections-ecrans.js, branché ici.
//
// Aucune règle ici : tout vient de js/progression.js, tous les nombres de
// js/progression-config.js. Le profil se lit et se range par js/save.js. Tant
// qu'aucun serveur ne fait foi, le coffre se tire sur l'appareil.
// ---------------------------------------------------------------------------

import { PROGRESSION as R } from './progression-config.js';
import { ouvrirCoffre, ameliorer, coutAmelioration, probabilitesDe, definitionAuNiveau, semaineDuJour } from './progression.js';
import { catalogueBoutique, acheterTroupe, acheterToutesLesTroupes, prendreCouronnesDEssai, ouvrirLaSaison } from './progression.js';
import { lireProgression, ecrireProgression, effacerLesDonnees } from './save.js';
import { EN_MAGASIN, EDITEUR, nomComplet } from './edition.js';
import { LANGUES, LANGUE, txt, accord, nombreLocal, choisirLangue } from './langue.js';
import {
  ouvrirLesVentes, fermerLesVentes, ventesOuvertes, ventesSimulees, vendable, prixAffiche, achatEnCours, prixManquants, relireLesPrix,
  acheter as acheterAuGuichet, restaurer as restaurerAuGuichet,
} from './achats.js';
import { UNIT_TYPES, DEFAULT_CIV, GAME_MODES, nomDe, portraitDe } from './config.js';
import { iconeSVG, ICONES_LICENCE } from './icones.js';
import { ficheDeTroupe } from './fiches-troupes.js';
import { PIECES } from './collections-config.js';
import { htmlPiece, htmlMedaillon, titreDuBlason, reglerPeupleDesTeintures } from './blason.js';
import {
  brancherCollections, ECRANS_DES_COLLECTIONS, agirSurLesCollections, eclats, htmlJoueur, htmlBourses,
  aPrendreDansLaSaison, htmlPiecesDuCoffre, htmlRayonDesCollections, pieceEnEtiquette, resumeDesGains, enEuros,
} from './collections-ecrans.js';

/** Les troupes que le jeu sait former, dans l'ordre des réglages. */
const TROUPES = Object.keys(R.troupes).filter((type) => !R.troupes[type].aVenir && UNIT_TYPES[type]);
const ORIGINES = { victoire: txt('Victoire'), defaite: txt('Défaite'), egalite: txt('Égalité'), promotion: txt('Promotion'), semaine: txt('Semaine jouée'), saison: txt('Fin de saison'), route: txt('Route de saison'), bataille: txt('Points de bataille') };

let civ = DEFAULT_CIV;          // le peuple dont on montre les noms et les portraits
let surChangement = () => {};   // l'accueil se redessine quand le profil change
let surEssai = null;            // lance une partie d'essai (main.js) ; absent : pas de bouton
let titreMontre = '';           // l'écran affiché (son titre) ; vide : aucun

const nombre = (v, decimales = 2) => nombreLocal(v, { maximumFractionDigits: decimales });
/** Un nombre et son mot, que l'appelant accorde lui-même, en toutes lettres : c'est ainsi que le mot se recense (outils/langues.mjs). */
const compte = (n, mot) => `${nombre(n)} ${mot}`;
/** Le même, pour un mot donné de plus loin (js/collections-ecrans.js) : il s'accorde sous la clé « mot|mots ». */
const pluriel = (n, mot, mots = mot + 's') => compte(n, accord(n, mot, mots));
const part = (v) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
/** Un pourcentage tel qu'il se lit : « 20 % ». */
const pourCent = (v) => txt`${v} %`;

// --- Noms ----------------------------------------------------------------------

const ARTICLES = { Soleil: 'du ', Légendes: 'des ' };
/** « ligue de Bois », « ligue d’Or », « ligue du Soleil » : le nom d'une ligue dans une phrase. */
export function ligueEnPhrase(ligue) {
  const l = typeof ligue === 'number' ? R.ligues[ligue - 1] : ligue;
  // (L'article est un trou à part : une autre langue le laisse de côté — « {1} League ».)
  return txt`ligue ${ARTICLES[l.nom] || (/^[AEIOUYÉ]/.test(l.nom) ? 'd’' : 'de ')}${l.nom}`;
}
const nomDeLigue = (ligue) => { const p = ligueEnPhrase(ligue); return p[0].toUpperCase() + p.slice(1); };
const nomTroupe = (type) => nomDe(type, civ);

function vignette(type, classe = '') {
  const src = portraitDe(type, civ);
  return `<span class="prog-vignette ${classe}" data-categorie="${R.troupes[type].categorie}">${
    src ? `<img src="${src}" alt="" decoding="async">` : iconeSVG(UNIT_TYPES[type].icon, 30)}</span>`;
}
const ecu = (numero, classe = '') => `<span class="prog-ecu ${classe}" data-ligue="${numero}">${iconeSVG('ligue', 40)}<b>${numero}</b></span>`;

/** Ce qu'il manque à une troupe pour monter : `null` au niveau maximum. */
function versLeNiveauSuivant(profil, type) {
  const t = profil.troupes[type];
  const cout = coutAmelioration(type, t.niveau);
  return cout === null ? null : { cout, fragments: t.fragments, pret: !!profil.debloquees[type] && t.fragments >= cout };
}
const ameliorables = (profil) => TROUPES.filter((type) => { const v = versLeNiveauSuivant(profil, type); return v && v.pret; });

// --- Accueil ---------------------------------------------------------------------

// --- Boutique : ce qui s'écrit de la même façon partout --------------------------

/** L'heure, en secondes : elle date la fin des offres. */
const heure = () => Date.now() / 1000;
/** Un montant en Couronnes : le pictogramme, puis le nombre. */
export const couronnes = (n, taille = 14) => `<span class="prog-couronnes">${iconeSVG('couronne', taille, 'inline')}${nombre(n)}</span>`;
/** Un prix en euros, à partir de centimes : « 0,99 € ». */
export const euros = (centimes) => txt`${nombreLocal(centimes / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00a0€`;
/** Ce qu'il reste d'une offre, en clair : « 2 j », « 47 h », « 12 min ». */
export function resteEnClair(secondes) {
  const heures = secondes / 3600;
  if (heures >= 48) return txt`${Math.floor(heures / 24)} j`;
  if (heures >= 1) return txt`${Math.ceil(heures)} h`;
  return txt`${Math.max(1, Math.ceil(secondes / 60))} min`;
}

/**
 * Le bandeau de l'accueil : le blason du joueur et sa ligue (le titre, le
 * score, le chemin vers la suivante), ses deux bourses, puis les tuiles —
 * coffres, troupes, album, saison, boutique.
 */
export function htmlBandeau(profil) {
  const ligue = R.ligues[profil.ligue - 1], suivante = R.ligues[profil.ligue];
  const avance = suivante ? (profil.elo - ligue.seuil) / (suivante.seuil - ligue.seuil) : 1;
  const coffres = profil.coffres.length, prets = ameliorables(profil).length;
  // (La pastille de la boutique : une offre qui se paie en Couronnes court en ce moment.)
  const offres = catalogueBoutique(profil, heure(), jourLocal()).offres.filter((o) => o.id === 'ligue').length;
  // (La pastille de la saison : des paliers à prendre — ou « ! » quand le mois a tourné et qu'une saison jouée
  // attend d'être close. Un profil qui n'a jamais joué n'a rien à clore : pas de pastille pour lui.)
  const paliers = ouvrirLaSaison(profil, jourLocal()).evenements.length ? '!' : aPrendreDansLaSaison(profil);
  const tuile = (ecran, icone, nom, n) => `<button class="btn small ${n ? 'prog-attend' : ''}" data-ecran="${ecran}">${iconeSVG(icone, 16, 'inline')} ${nom}${n ? ` <b class="prog-pastille">${n}</b>` : ''}</button>`;
  return `
    <div class="prog-carte-joueur">
      ${htmlJoueur(profil)}
      <button class="prog-bandeau-ligue" data-ecran="ligues" aria-label="${txt('Voir les ligues')}">
        <span class="prog-bandeau-texte">
          <b>${titreDuBlason(profil.blason)}</b>
          <small>${nomDeLigue(ligue)} · ${nombre(profil.elo)} Elo</small>
          <span class="prog-barre"><span style="width:${part(avance)}"></span></span>
          <small class="prog-vers">${suivante ? txt`${ligueEnPhrase(suivante)} à ${nombre(suivante.seuil)}` : txt('la plus haute ligue')}</small>
        </span>
      </button>
    </div>
    ${htmlBourses(profil)}
    <div class="prog-bandeau-actions">
      ${tuile('coffres', 'coffre', txt('Coffres'), coffres)}
      ${tuile('troupes', 'militia', txt('Troupes'), prets)}
      ${tuile('album', 'album', txt('Album'), 0)}
      ${tuile('saison', 'saison', txt('Saison'), paliers)}
      ${tuile('boutique', 'couronne', txt('Boutique'), offres)}
    </div>`;
}

// --- Les écrans ------------------------------------------------------------------

const noeud = () => document.getElementById('progression');

/**
 * Affiche un écran. `surPlace` : le même écran redessiné garde sa hauteur de
 * défilement — un bouton qui demande un second toucher reste sous le doigt.
 */
function montrer(titre, corps, { retour = null, surPlace = false } = {}) {
  const n = noeud();
  if (!n) return;
  const carte = () => (n.querySelector ? n.querySelector('.prog-carte') : null);
  const hauteur = surPlace && titreMontre === titre && carte() ? carte().scrollTop : 0;
  titreMontre = titre;
  n.innerHTML = `
    <div class="modal-card wide prog-carte">
      <div class="prog-tete">
        ${retour ? `<button class="icon-btn prog-retour" data-ecran="${retour}" aria-label="${txt('Retour')}">${iconeSVG('retour', 20)}</button>` : ''}
        <h2>${titre}</h2>
        <button class="icon-btn" data-act="fermer" aria-label="${txt('Fermer')}">${iconeSVG('fermer', 20)}</button>
      </div>
      ${corps}
    </div>`;
  n.classList.remove('hidden');
  if (hauteur > 0 && carte()) carte().scrollTop = hauteur;
}

export function fermerProgression() {
  const n = noeud();
  titreMontre = '';
  if (!n) return;
  n.classList.add('hidden');
  n.innerHTML = '';
}

function ecranLigues(profil) {
  const lignes = [...R.ligues].reverse().map((l) => {
    const etat = l.numero === profil.ligue ? 'actuelle' : l.numero <= profil.plusHauteLigue ? 'atteinte' : '';
    const lots = [];
    if (l.promotion) lots.push(R.coffres[l.promotion.coffre].nom);
    if (l.troupe && UNIT_TYPES[l.troupe]) lots.push(nomTroupe(l.troupe));
    for (const cadeau of (l.promotion && l.promotion.cadeaux) || []) {
      const p = PIECES[cadeau.piece];
      if (p) lots.push(p.genre === 'grade' ? txt`titre «\u00a0${p.nom}\u00a0»` : p.nom);
    }
    if (l.promotion) lots.push(txt`${R.boutique.parLigue} Couronnes`);
    return `
      <li class="prog-ligue ${etat}">
        ${ecu(l.numero)}
        <span class="prog-ligue-texte">
          <b>${nomDeLigue(l)}</b>
          <small>${l.seuil ? txt`dès ${nombre(l.seuil)} Elo` : txt('le départ')} · ${txt`troupes jusqu’au niveau ${l.plafond}`}</small>
          ${lots.length ? `<small class="prog-lot">${etat ? txt`Reçu : ${lots.join(' · ')}` : txt`À gagner : ${lots.join(' · ')}`}</small>` : ''}
        </span>
        ${l.numero === profil.ligue ? `<span class="prog-ici">${txt('Tu es ici')}</span>` : ''}
      </li>`;
  }).join('');
  montrer(txt('Les ligues'), `
    <p class="subtitle">${txt`Une victoire classée rapporte ${R.elo.victoire} points, une défaite en coûte ${-R.elo.defaite}.`}
      ${txt('De ligue en ligue, tes troupes jouent à un niveau plus haut en partie classée.')}</p>
    <ol class="prog-ligues">${lignes}</ol>`);
  const ici = noeud().querySelector('.prog-ligue.actuelle');
  if (ici && ici.scrollIntoView) ici.scrollIntoView({ block: 'center' });
}

/** Les trois états d'un coffre, chacun avec son image (assets/coffres) : fermé, entrouvert, ouvert. */
export const ETATS_DE_COFFRE = ['ferme', 'entrouvert', 'ouvert'];
/** Le chemin de l'image d'un coffre dans un état. */
export const imageDeCoffre = (type, etat = 'ferme') => `assets/coffres/coffre-${type}-${etat}.webp`;
/** L'image d'un coffre, à cette largeur (les fichiers font 300 × 330). */
function coffre(type, etat, largeur, classe = '') {
  return `<img class="prog-coffre-img ${classe}" src="${imageDeCoffre(type, etat)}" alt="" width="${largeur}" height="${Math.round(largeur * 1.1)}" decoding="async">`;
}

// (Le français tire le rang d'un coffre de son nom. Une autre langue ne se découpe pas ainsi : elle a ses quatre mots.)
const RANGS_DE_COFFRE = LANGUE === 'fr' ? {} : { bois: txt('bois'), argent: txt('argent'), or: txt('or'), legendaire: txt('légendaire') };
/** « bois », « argent », « or », « légendaire » : le rang d'un coffre, sans le mot « coffre ». */
function nomCourtDuCoffre(type) {
  return RANGS_DE_COFFRE[type] || R.coffres[type].nom.replace('Coffre ', '').replace(/^d[e’] ?/, '');
}

function ecranCoffres(profil) {
  const aujourdhui = jourLocal();
  const s = R.sources;
  const liste = profil.coffres.map((c, i) => `
    <li class="prog-coffre" data-type="${c.type}">
      <span class="prog-coffre-image">${coffre(c.type, 'ferme', 56)}</span>
      <span class="prog-coffre-texte"><b>${R.coffres[c.type].nom}</b><small>${ORIGINES[c.origine] || ''}</small></span>
      <button class="icon-btn" data-ecran="probas" data-arg="${c.type}" aria-label="${txt('Probabilités')}">${iconeSVG('info', 18)}</button>
      <button class="btn primary small" data-act="ouvrir" data-i="${i}">${txt('Ouvrir')}</button>
    </li>`).join('');
  // Les compteurs de la semaine ne valent que pour la semaine où ils ont été pris.
  const semaine = profil.semaine.numero === semaineDuJour(aujourdhui) ? profil.semaine : { jours: 0, coffre: false };
  const rangs = Object.keys(R.coffres);
  const ISSUES = [['victoire', txt('Victoire')], ['egalite', txt('Égalité')], ['defaite', txt('Défaite')]];
  const tableDesRangs = (table) => `
    <table class="scores prog-probas prog-rangs">
      <tr><th></th>${rangs.map((r) => `<th aria-label="${R.coffres[r].nom}">${coffre(r, 'ferme', 38)}</th>`).join('')}</tr>
      ${ISSUES.map(([issue, nom]) => `<tr><td>${nom}</td>${rangs.map((r) => `<td>${pourCent(table[issue][r] || 0)}</td>`).join('')}</tr>`).join('')}
    </table>`;
  // Un format plus court a sa table, moins généreuse : elle se montre aussi.
  const courts = Object.entries(s.parFormat || {}).filter(([format]) => GAME_MODES[format]).map(([format, table]) => `
    <h3>${txt`En ${GAME_MODES[format].name}`}</h3>
    <p class="subtitle">${txt`Une partie de ${Math.round(GAME_MODES[format].timeLimit / 60)} minutes, deux fois plus courte : le coffre est un cran en dessous.`}</p>
    ${tableDesRangs(table)}`).join('');
  montrer(txt('Coffres'), `
    ${liste ? `<ul class="prog-coffres">${liste}</ul>` : `<p class="prog-vide">${txt('Aucun coffre à ouvrir. Chaque partie classée en donne un.')}</p>`}
    <h3>${txt('Un coffre par partie')}</h3>
    <p class="subtitle">${txt('Chaque partie classée donne un coffre, gagnée ou perdue. Son rang est tiré au sort : la victoire a de meilleures chances.')}</p>
    ${tableDesRangs(s.partie)}
    ${courts}
    <p class="hint">${txt`Une défaite de moins de ${Math.round(R.abandon.precoceAvant / 60)} minutes, abandon compris, ne donne pas de coffre.`}</p>
    <h3>${txt('En plus')}</h3>
    <ul class="prog-prochains">
      <li><span>${txt('Coffre d’or')}</span>
        <small>${semaine.coffre ? txt('gagné cette semaine') : txt`en jouant ${s.or.joursJoues} jours dans la semaine · ${semaine.jours} sur ${s.or.joursJoues}`}</small></li>
      <li><span>${txt('Un coffre à chaque nouvelle ligue')}</span><small>${txt('voir la route des ligues')}</small></li>
    </ul>
    <h3>${txt('Contenu et chances de chaque coffre')}</h3>
    <div class="modal-actions prog-choix-coffres">
      ${rangs.map((type) => `<button class="btn small" data-ecran="probas" data-arg="${type}">${coffre(type, 'ferme', 44)}<span class="prog-coffre-nom" data-type="${type}">${nomCourtDuCoffre(type)}</span></button>`).join('')}
    </div>`);
}

function ecranProbas(type) {
  const t = probabilitesDe(type);
  if (!t) return ecranCoffres(lireProgression());
  const groupes = t.groupes.map((g) => `
    <h3>${g.nom} — ${g.nombre} ${accord(g.nombre, 'tirage')}</h3>
    <table class="scores prog-probas">
      <tr><th>${txt('Catégorie')}</th><th>${txt('Chance')}</th><th>${txt('Fragments')}</th></tr>
      ${g.lignes.map((l) => `<tr><td><span class="prog-categorie" data-categorie="${l.categorie}">${l.nom}</span></td><td>${pourCent(nombre(l.pourCent))}</td><td>${l.fragments}</td></tr>`).join('')}
      <tr class="total"><td>${txt('Total')}</td><td>${pourCent(nombre(g.total / 10))}</td><td></td></tr>
    </table>`).join('');
  montrer(t.nom, `
    <div class="prog-coffre-tete">${coffre(type, 'ferme', 96)}${coffre(type, 'ouvert', 96)}</div>
    <p class="subtitle">${txt`${compte(t.tirages, accord(t.tirages, 'tirage'))}. Sur 100 coffres, en moyenne : ${compte(t.surCent.commune, accord(t.surCent.commune, 'fragment commun', 'fragments communs'))},
      ${compte(t.surCent.rare, accord(t.surCent.rare, 'rare'))}, ${compte(t.surCent.epique, accord(t.surCent.epique, 'épique'))}.`}</p>
    ${groupes}
    ${t.pieces.nombre ? `
    <h3>${t.pieces.nombre > 1 ? txt`Autocollants — ${t.pieces.nombre} tirages` : txt('Autocollant — 1 tirage')}</h3>
    <table class="scores prog-probas">
      <tr><th>${txt('Rareté')}</th><th>${txt('Chance')}</th><th>${txt('Un doublon rend')}</th></tr>
      ${t.pieces.lignes.map((l) => `<tr><td><span class="prog-categorie" data-categorie="${l.categorie}">${l.nom}</span></td><td>${pourCent(nombre(l.pourCent))}</td><td>${eclats(l.doublon)}</td></tr>`).join('')}
      <tr class="total"><td>${txt('Total')}</td><td>${pourCent(nombre(t.pieces.total / 10))}</td><td></td></tr>
    </table>
    <p class="subtitle">${txt`Dans la rareté tirée, chaque autocollant des collections des coffres a la même chance. Et dans chaque ${t.nom.toLowerCase()} : ${eclats(t.eclats)} Éclats, toujours.`}</p>` : ''}
    <h3>${txt('Comment un tirage se fait')}</h3>
    <ol class="prog-regles">
      <li>${txt('Il choisit une catégorie selon le tableau.')}</li>
      <li>${txt('Dans cette catégorie, il choisit à chances égales une de tes troupes débloquées qui n’est pas au niveau maximum.')}</li>
      <li>${txt('Il donne le nombre de fragments indiqué, toujours le même.')}</li>
      <li>${txt('Si tu n’as aucune troupe disponible dans la catégorie, le tirage passe à une autre : celle du dessous d’abord, sinon celle du dessus.')}</li>
      <li>${txt('Si toutes tes troupes sont au niveau maximum, les fragments deviennent des Éclats.')}</li>
    </ol>
    <p class="hint">${txt('Aucun coffre ne se vend.')}</p>`, { retour: 'coffres' });
}

/** Le temps que met le coffre à s'ouvrir (voir .prog-ouverture dans la feuille de style) : les tirages attendent. */
const OUVERTURE_MS = 1000;

function ecranOuverture(resultat, profil) {
  const lignes = resultat.tirages.map((t, i) => `
    <li class="prog-tirage" style="animation-delay:${OUVERTURE_MS + i * 140}ms">
      ${t.troupe ? vignette(t.troupe) : `<span class="prog-vignette">${iconeSVG('coffre', 26)}</span>`}
      <span class="prog-tirage-texte">
        <b>${t.troupe ? nomTroupe(t.troupe) : txt('Éclats')}</b>
        <small><span class="prog-categorie" data-categorie="${t.categorie || t.tiree}">${R.nomsDesCategories[t.categorie || t.tiree] || ''}</span>${t.genre === 'garanti' ? ` · ${txt('garanti')}` : ''}</small>
      </span>
      <span class="prog-gain">+${t.fragments ? compte(t.fragments, accord(t.fragments, 'fragment')) : compte(t.eclats, accord(t.eclats, 'Éclat'))}</span>
    </li>`).join('');
  const prets = resultat.evenements.filter((e) => e.type === 'ameliorationPossible');
  // Le coffre s'ouvre en trois images, l'une après l'autre (jamais de fondu) ; ses tirages paraissent ensuite.
  montrer(R.coffres[resultat.coffre].nom, `
    <div class="prog-ouverture" data-type="${resultat.coffre}">${ETATS_DE_COFFRE.map((etat, i) => coffre(resultat.coffre, etat, 190, `e${i + 1}`)).join('')}</div>
    <ul class="prog-tirages">${lignes}${htmlPiecesDuCoffre(resultat, OUVERTURE_MS + resultat.tirages.length * 140)}</ul>
    ${prets.length ? `<p class="prog-annonce">${txt`Tu peux améliorer : ${prets.map((e) => `<button class="btn small prog-attend" data-ecran="fiche" data-arg="${e.troupe}">${nomTroupe(e.troupe)}</button>`).join(' ')}`}</p>` : ''}
    <div class="modal-actions">
      ${profil.coffres.length ? `<button class="btn primary" data-act="ouvrir" data-i="0">${txt`Coffre suivant (${profil.coffres.length})`}</button>` : ''}
      <button class="btn ${profil.coffres.length ? '' : 'primary'}" data-ecran="troupes">${txt('Mes troupes')}</button>
      <button class="btn" data-ecran="album">${txt('Mon album')}</button>
      <button class="btn" data-act="fermer">${txt('Fermer')}</button>
    </div>`);
}

function carteTroupe(profil, type) {
  const t = profil.troupes[type], debloquee = !!profil.debloquees[type];
  const v = versLeNiveauSuivant(profil, type);
  let pied;
  if (!debloquee) pied = `<small class="prog-verrou">${iconeSVG('cadenas', 12, 'inline')} ${nomDeLigue(R.troupes[type].gratuite.ligue)}</small>`;
  else if (!v) pied = `<small>${txt('niveau maximum')}</small>`;
  else pied = `<span class="prog-barre"><span style="width:${part(v.fragments / v.cout)}"></span></span><small>${v.fragments} / ${v.cout}</small>`;
  return `
    <button class="prog-troupe ${debloquee ? '' : 'verrouillee'} ${v && v.pret ? 'prete' : ''}" data-ecran="fiche" data-arg="${type}">
      ${vignette(type)}
      <b>${nomTroupe(type)}</b>
      ${debloquee ? `<span class="prog-niveau">${txt`Niv. ${t.niveau}`}</span>` : ''}
      ${pied}
    </button>`;
}

function ecranTroupes(profil) {
  const plafond = R.ligues[profil.ligue - 1].plafond;
  const sections = R.categories.map((categorie) => {
    const types = TROUPES.filter((type) => R.troupes[type].categorie === categorie);
    return `<h3><span class="prog-categorie" data-categorie="${categorie}">${R.nomsDesCategories[categorie]}</span></h3>
      <div class="prog-grille">${types.map((type) => carteTroupe(profil, type)).join('')}</div>`;
  }).join('');
  montrer(txt('Mes troupes'), `
    <p class="subtitle">${txt`Les fragments des coffres montent le niveau d’une troupe. En partie classée, ta ${ligueEnPhrase(profil.ligue)} fait jouer les troupes jusqu’au niveau ${plafond}.`}</p>
    ${sections}`);
}

/** Les statistiques qu'une fiche montre : celles qui existent pour la troupe. Chacune : son nom, où la lire, et comment l'écrire si ce n'est pas le nombre seul. */
const STATISTIQUES = [
  [txt('Points de vie'), (d) => d.hp],
  [txt('Dégâts'), (d) => d.attack || null],
  [txt('Soin par geste'), (d) => d.heal || null],
  [txt('Vue, en cases'), (d) => d.los],
  // (Par minute : c'est l'unité où la récolte est un chiffre rond à chaque niveau. L'arrondi n'ôte que le bruit du calcul en virgule flottante.)
  [txt('Vivres ou or par minute'), (d) => (d.gather ? Math.round(d.gather.food * 60 * 1e6) / 1e6 : null)],
  [txt('Bois par minute'), (d) => (d.gather ? Math.round(d.gather.wood * 60 * 1e6) / 1e6 : null)],
  [txt('Chargement'), (d) => d.carry || null],
  [txt('Vitesse de chantier'), (d) => (d.gather ? (d.construction || 1) * 100 : null), pourCent],
  [txt('Contre la cavalerie'), (d) => (d.bonus && d.bonus.cavalry) || null, (v) => `+${v}`],
  [txt('Contre les bâtiments'), (d) => (d.bonus && d.bonus.building) || null, (v) => `+${v}`],
];

/** La fiche écrite d'une troupe : son rôle, ce qu'elle bat, ce qu'elle craint, un conseil (js/fiches-troupes.js). */
function texteDeFiche(type) {
  const fiche = ficheDeTroupe(type, civ);
  if (!fiche) return '';
  return `<dl class="prog-fiche-texte">${fiche.map((r) => `<div data-rubrique="${r.cle}"><dt>${r.titre}</dt><dd>${r.texte}</dd></div>`).join('')}</dl>`;
}

function ecranFiche(type, profil, message = '', { confirmerEssai = false } = {}) {
  if (!TROUPES.includes(type)) return ecranTroupes(profil);
  const t = profil.troupes[type], reglage = R.troupes[type], debloquee = !!profil.debloquees[type];
  const v = versLeNiveauSuivant(profil, type);
  const plafond = R.ligues[profil.ligue - 1].plafond;
  const maintenant = definitionAuNiveau(UNIT_TYPES[type], type, t.niveau);
  const ensuite = v ? definitionAuNiveau(UNIT_TYPES[type], type, t.niveau + 1) : null;
  // Seulement ce qu'un niveau change pour cette troupe, du premier au dernier.
  const base = UNIT_TYPES[type], sommet = definitionAuNiveau(base, type, R.niveauMax);
  const lignes = STATISTIQUES.map(([nom, lire, ecrire = (v) => v]) => {
    const a = lire(maintenant);
    if (a === null || a === undefined || lire(base) === lire(sommet)) return '';
    const b = ensuite ? lire(ensuite) : null;
    const monte = b !== null && b !== a;
    return `<tr><td>${nom}</td><td>${ecrire(nombre(a))}</td>${ensuite ? `<td class="${monte ? 'prog-monte' : ''}">${monte ? ecrire(nombre(b)) : '—'}</td>` : ''}</tr>`;
  }).join('');
  let pied;
  if (!debloquee) {
    const g = reglage.gratuite;
    // L'essai : une partie libre où trois exemplaires attendent près du centre.
    // Une partie qui dort serait effacée : il faut alors toucher deux fois.
    const essai = !surEssai ? '' : `
      <div class="modal-actions">
        <button class="btn ${confirmerEssai ? 'danger' : ''}" data-act="essayer" data-arg="${type}" ${confirmerEssai ? 'data-i="1"' : ''}>${confirmerEssai
    ? txt('Toucher encore : la partie en cours sera effacée') : txt('Essayer en partie libre')}</button>
      </div>
      <p class="hint">${txt('Trois t’attendent près de ton centre. Une partie d’essai ne compte ni au classement ni au palmarès.')}</p>`;
    // La boutique la donne tout de suite, au prix de cette heure (l'offre de ligue le baisse).
    const article = catalogueBoutique(profil, heure()).troupes.find((x) => x.type === type && !x.debloquee);
    const boutique = !article ? '' : `
      <div class="modal-actions">
        <button class="btn" data-ecran="boutique">${txt`Tout de suite à la boutique : ${couronnes(article.prix)}`}</button>
      </div>`;
    pied = `<p class="prog-annonce">${iconeSVG('cadenas', 14, 'inline')} ${txt`Offerte en ${ligueEnPhrase(g.ligue)}, ou après ${g.parties} parties classées jouées
      (tu en as joué ${profil.parties - profil.abandonsPrecoces}).`}</p>${boutique}${essai}`;
  } else if (!v) {
    pied = `<p class="prog-annonce">${txt('Niveau maximum atteint.')}</p>`;
  } else {
    pied = `
      <div class="prog-cout">
        <span class="prog-barre"><span style="width:${part(v.fragments / v.cout)}"></span></span>
        <small>${txt`${compte(v.fragments, accord(v.fragments, 'fragment'))} sur ${v.cout}`}</small>
      </div>
      <div class="modal-actions">
        <button class="btn primary" data-act="ameliorer" data-arg="${type}" ${v.pret ? '' : 'disabled'}>${txt`Passer au niveau ${t.niveau + 1}`}</button>
      </div>`;
  }
  montrer(nomTroupe(type), `
    <div class="prog-fiche-tete">
      ${vignette(type, 'grande')}
      <p><span class="prog-categorie" data-categorie="${reglage.categorie}">${R.nomsDesCategories[reglage.categorie]}</span>
        ${debloquee ? txt`<b>Niveau ${t.niveau}</b> sur ${R.niveauMax}` : `<b>${txt('À débloquer')}</b>`}</p>
    </div>
    ${message ? `<p class="prog-annonce">${message}</p>` : ''}
    ${texteDeFiche(type)}
    <table class="scores prog-stats">
      <tr><th></th><th>${txt`Niveau ${debloquee ? t.niveau : 1}`}</th>${ensuite ? `<th>${txt`Niveau ${t.niveau + 1}`}</th>` : ''}</tr>
      ${lignes}
    </table>
    ${debloquee && t.niveau > plafond ? `<p class="hint">${txt`En partie classée, elle joue au niveau ${plafond} tant que tu es en ${ligueEnPhrase(profil.ligue)}. Contre l’ordinateur en partie libre, elle joue à son niveau réel.`}</p>` : ''}
    ${pied}`, { retour: 'troupes' });
}

// --- La boutique ---------------------------------------------------------------------

/**
 * Le bouton d'un achat en Couronnes : son prix. Deux touchers — le premier
 * demande confirmation, comme « Essayer ». Trop cher pour le porte-monnaie,
 * il reste touchable, en plus pâle : il dit alors ce qu'il manque.
 */
function boutonAcheter(act, arg, prix, solde, confirmer) {
  if (solde < prix) return `<button class="btn small prog-cher" data-act="${act}" data-arg="${arg}">${couronnes(prix)}</button>`;
  return confirmer
    ? `<button class="btn small danger" data-act="${act}" data-arg="${arg}" data-i="1">${txt`Toucher encore : ${couronnes(prix)}`}</button>`
    : `<button class="btn small primary" data-act="${act}" data-arg="${arg}">${couronnes(prix)}</button>`;
}

/**
 * Le bouton d'un article qui se paie en argent réel : son prix, tel que le
 * magasin le dit (à défaut, celui des réglages). Au guichet simulé, `confirmer`
 * demande le second toucher ; le vrai magasin a sa propre feuille de paiement.
 */
function boutonArgent(act, arg, produit, centimes, confirmer) {
  const prix = prixAffiche(produit) || euros(centimes);
  if (achatEnCours()) return `<button class="btn small" disabled>${achatEnCours() === produit ? txt('En cours…') : prix}</button>`;
  return confirmer
    ? `<button class="btn small danger" data-act="${act}" data-arg="${arg}" data-i="1">${txt('Toucher encore')}</button>`
    : `<button class="btn small primary" data-act="${act}" data-arg="${arg}">${prix}</button>`;
}

/**
 * La boutique : le porte-monnaie, les offres qui courent, les troupes à
 * débloquer, les lots de Couronnes. `confirmer` : l'article dont on attend le
 * second toucher (un type de troupe, « tout », ou « argent:… » pour ce qui se
 * paie en argent réel). `surPlace` : l'écran se redessine sans remonter.
 */
function ecranBoutique(profil, message = '', { confirmer = '', surPlace = false } = {}) {
  const c = catalogueBoutique(profil, heure(), jourLocal());
  // Dans l'application des magasins, rien ne s'annonce « bientôt » : ce qui se paie en argent réel
  // ne se montre que le jour où il s'achète (Apple 2.1 ; voir js/edition.js), au prix que dit le magasin.
  const ventes = ventesOuvertes();
  const seVend = (produit) => (EN_MAGASIN ? vendable(produit) : true);
  const montrerLArgentReel = c.lots.some((l) => seVend(l.produit));
  const bienvenue = R.boutique.offres.bienvenue.produit;
  const offres = c.offres.filter((o) => o.id === 'ligue' || seVend(bienvenue)).map((o) => {
    if (o.id === 'ligue') {
      return `
        <li class="prog-offre">
          ${vignette(o.troupe)}
          <span class="prog-offre-texte">
            <b>${txt`Offre de ligue : ${nomTroupe(o.troupe)} à moitié prix`}</b>
            <small>${txt`${couronnes(o.prix)} au lieu de <s>${nombre(o.prixPlein)}</s> · encore ${resteEnClair(o.reste)}`}</small>
          </span>
          ${boutonAcheter('acheter', o.troupe, o.prix, c.couronnes, confirmer === o.troupe)}
        </li>`;
    }
    const contenu = [...o.troupes.map(nomTroupe), txt`${nombre(o.couronnes)} Couronnes`].join(' + ');
    return `
      <li class="prog-offre">
        <span class="prog-vignette">${iconeSVG('couronne', 30)}</span>
        <span class="prog-offre-texte">
          <b>${txt`Offre de bienvenue : ${contenu}`}</b>
          <small>${confirmer === 'argent:bienvenue' ? txt('Achat simulé : aucun paiement.') : txt`${prixAffiche(bienvenue) || euros(o.prixCentimes)}, une seule fois · encore ${resteEnClair(o.reste)}`}</small>
        </span>
        ${vendable(bienvenue) ? boutonArgent('acheterOffre', 'bienvenue', bienvenue, o.prixCentimes, confirmer === 'argent:bienvenue') : `<button class="btn small" disabled>${txt('Bientôt')}</button>`}
      </li>`;
  }).join('');
  const troupes = c.troupes.map((t) => {
    const g = R.troupes[t.type].gratuite;
    const droite = t.debloquee
      ? `<span class="prog-acquis">${txt('Débloquée')}</span>`
      : boutonAcheter('acheter', t.type, t.prix, c.couronnes, confirmer === t.type);
    return `
      <li class="prog-article ${t.debloquee ? 'acquis' : ''}">
        <button class="prog-article-fiche" data-ecran="fiche" data-arg="${t.type}" aria-label="${txt`Voir la fiche : ${nomTroupe(t.type)}`}">${vignette(t.type)}</button>
        <span class="prog-offre-texte">
          <b>${nomTroupe(t.type)}</b>
          <small>${t.debloquee ? txt('Déjà à toi.') : `${t.offre ? `<s>${nombre(t.prixPlein)}</s> · ` : ''}${txt`Sinon offerte en ${ligueEnPhrase(g.ligue)}`}${enEuros(t.prix, ' · ')}`}</small>
        </span>
        ${droite}
      </li>`;
  }).join('');
  const lot = c.lotTroupes;
  const lots = c.lots.filter((l) => seVend(l.produit)).map((l) => `
    <li class="prog-article">
      <span class="prog-vignette">${iconeSVG('couronne', 30)}</span>
      <span class="prog-offre-texte">
        <b>${txt`${l.nom} : ${nombre(l.couronnes)} Couronnes`}</b>
        <small>${confirmer === `argent:${l.id}` ? txt('Achat simulé : aucun paiement.') : l.bonus ? txt`${l.bonus} % de plus que le premier lot` : txt('Le premier lot')}</small>
      </span>
      ${vendable(l.produit) ? boutonArgent('acheterLot', l.id, l.produit, l.prixCentimes, confirmer === `argent:${l.id}`) : `<button class="btn small" disabled>${euros(l.prixCentimes)}</button>`}
    </li>`).join('');
  const rayonDesCouronnes = !montrerLArgentReel ? `
    <h3>${txt('Couronnes')}</h3>
    <p class="subtitle">${txt`Elles se gagnent en jouant : ${R.boutique.parLigue} à chaque nouvelle ligue, et sur la route de la saison.`}</p>` : `
    <h3>${txt('Couronnes')}</h3>
    <p class="subtitle">${!ventes ? txt`L’achat de Couronnes arrivera avec l’application. D’ici là, elles se gagnent : ${R.boutique.parLigue} à chaque nouvelle ligue, et sur la route de la saison.`
    : ventesSimulees() ? txt('L’achat de Couronnes arrivera avec l’application. Ici, toucher un lot simule son achat : aucun paiement n’est demandé.')
    : txt('Les Couronnes servent ici, et seulement ici. Le paiement passe par le magasin d’applications.')}</p>
    <ul class="prog-articles">${lots}</ul>
    ${ventes ? `
    <div class="modal-actions">
      <button class="btn ghost" data-act="restaurerAchats"${achatEnCours() ? ' disabled' : ''}>${txt('Restaurer mes achats')}</button>
    </div>` : ''}
    ${c.essai ? `
    <div class="modal-actions">
      <button class="btn" data-act="essaiCouronnes">${txt`Porte-monnaie d’essai : +${nombre(c.essai.couronnes)} Couronnes`}</button>
    </div>
    <p class="hint">${txt('Version d’essai : ce bouton sert à essayer la boutique, il disparaîtra avec l’arrivée des vrais achats.')}</p>` : ''}`;
  montrer(txt('Boutique'), `
    <p class="prog-bourse">${couronnes(c.couronnes, 22)} <span>${accord(c.couronnes, 'Couronne')}</span>
      <span class="prog-bourse-eclats">${eclats(c.eclats, 22)} <span>${accord(c.eclats, 'Éclat')}</span></span></p>
    <p class="hint prog-monnaies">${montrerLArgentReel ? txt('Les Couronnes s’achètent.') : txt('Les Couronnes se gagnent aux ligues et sur la route de la saison.')} ${txt('Les Éclats se gagnent en jouant : dans chaque coffre, et pour chaque autocollant en double.')}</p>
    ${message ? `<p class="prog-annonce">${message}</p>` : ''}
    ${offres ? `<h3>${txt('Offres du moment')}</h3><ul class="prog-articles">${offres}</ul>` : ''}
    ${htmlRayonDesCollections(profil, c, confirmer)}
    <h3>${txt('Troupes')}</h3>
    <p class="subtitle">${txt('Une troupe avancée s’obtient gratuitement par sa ligue. Ici, tu l’as tout de suite : c’est la même troupe.')}</p>
    <ul class="prog-articles">
      ${troupes}
      ${lot ? `
      <li class="prog-article prog-lot-troupes">
        <span class="prog-vignette">${iconeSVG('militia', 30)}</span>
        <span class="prog-offre-texte">
          <b>${txt`Toutes les troupes (${lot.troupes.length})`}</b>
          <small>${txt`au lieu de <s>${nombre(lot.prixPlein)}</s>`}${enEuros(lot.prix, ' · ')}</small>
        </span>
        ${boutonAcheter('acheterTout', 'tout', lot.prix, c.couronnes, confirmer === 'tout')}
      </li>` : ''}
    </ul>
    ${rayonDesCouronnes}
    <p class="hint">${txt('Rien d’aléatoire ne se vend ici : ni coffre, ni fragment, ni niveau.')}</p>`, { surPlace: surPlace || !!confirmer });
}

// --- Confidentialité, données et mentions ------------------------------------------------
//
// Les deux magasins demandent que la politique de confidentialité se lise DANS
// le jeu, en plus de sa page publique (Apple 5.1.1 ; Google, « User Data »), et
// que le joueur puisse effacer ce qui le concerne. Le jeu ne collecte rien :
// l'écran le dit, et dit ce qu'il garde sur l'appareil.

function ecranConfidentialite(message = '', { confirmer = false } = {}) {
  const l = ICONES_LICENCE;
  const editeur = EDITEUR.nom.trim()
    ? `<p>${txt`${nomComplet()} est édité par <b>${EDITEUR.nom}</b>.`}${EDITEUR.courriel ? ` ${txt`Pour toute question : ${`<span class="prog-selection">${EDITEUR.courriel}</span>`}.`}` : ''}${EDITEUR.mentions ? `<br><small>${EDITEUR.mentions}</small>` : ''}</p>`
    : '';
  montrer(txt('Confidentialité'), `
    ${message ? `<p class="prog-annonce">${message}</p>` : ''}
    <h3>${txt('Ce que le jeu garde')}</h3>
    <p>${txt('Ta progression (classement, coffres, troupes, collections), ta partie en cours et tes réglages sont gardés <b>sur cet appareil</b>.')}${EN_MAGASIN ? '' : ` ${txt('Sur cette page web, ta progression est aussi rangée avec ton compte, là où la page le permet, pour la retrouver si le navigateur l’efface.')}`}</p>
    <h3>${txt('Ce que le jeu ne fait pas')}</h3>
    <ul class="prog-regles">
      <li>${txt('Aucun compte à créer, aucune donnée personnelle demandée.')}</li>
      <li>${txt('Aucune publicité, aucun traceur, aucune mesure d’audience.')}</li>
      <li>${EN_MAGASIN ? txt('Aucune donnée ne quitte ton appareil : le jeu fonctionne sans connexion.') : txt('Rien n’est envoyé à un serveur de jeu : une fois chargé, le jeu fonctionne sans connexion.')}</li>
    </ul>
    <h3>${txt('Effacer mes données')}</h3>
    <p class="subtitle">${txt('Tout repart de zéro : classement, coffres, troupes, collections, monnaies, partie en cours, réglages. C’est définitif.')}</p>
    <div class="modal-actions">
      <button class="btn ${confirmer ? 'danger' : ''}" data-act="effacerDonnees" ${confirmer ? 'data-i="1"' : ''}>${confirmer ? txt('Toucher encore : tout effacer, pour de bon') : txt('Effacer toutes mes données')}</button>
    </div>
    ${editeur ? `<h3>${txt('Éditeur')}</h3>${editeur}` : ''}
    <h3>${txt('Licences')}</h3>
    <ul class="prog-regles">
      <li>${txt`Pictogrammes : ${l.source}, licence ${l.licence}.`} <small>${l.auteurs.join(' · ')}</small></li>
      <li>${txt('Caractères « Lilita One » (Juan Montoreano) et « Nunito » (The Nunito Project Authors) : licence SIL OFL 1.1.')}</li>
      <li>${txt('Rendu 3D : three.js, licence MIT.')}</li>
      <li>${txt('Bruitages (Kenney) et musiques (RandomMind, Emma_MA) : domaine public, CC0.')}</li>
      <li>${txt('Illustrations, modèles et autocollants : créés pour le jeu par son auteur.')}</li>
    </ul>`);
}

// --- Ouvrir un écran, agir ----------------------------------------------------------

/**
 * La langue du jeu : chaque langue sous son propre nom, pour qui ne lit pas
 * celle de l'écran. En choisir une autre recharge la page (js/langue.js).
 */
function ecranLangue(message = '') {
  const langues = LANGUES.map((l) => `
    <li class="prog-article ${l.id === LANGUE ? 'acquis' : ''}">
      <span class="prog-offre-texte">
        <b lang="${l.id}">${l.nom}</b>
        ${l.prete ? '' : `<small>${txt('Traduction en cours : certains écrans sont encore en français.')}</small>`}
      </span>
      ${l.id === LANGUE ? `<span class="prog-acquis">${txt('Choisie')}</span>` : `<button class="btn small primary" data-act="langue" data-arg="${l.id}" lang="${l.id}">${l.nom}</button>`}
    </li>`).join('');
  montrer(txt('Langue'), `
    ${message ? `<p class="prog-annonce">${message}</p>` : ''}
    <ul class="prog-articles">${langues}</ul>
    <p class="hint">${txt('Le jeu redémarre pour changer de langue. Ta partie en cours est gardée.')}</p>`);
}

const ECRANS = {
  langue: () => ecranLangue(),
  ligues: (p) => ecranLigues(p),
  coffres: (p) => ecranCoffres(p),
  troupes: (p) => ecranTroupes(p),
  probas: (p, arg) => ecranProbas(arg),
  fiche: (p, arg) => ecranFiche(arg, p),
  boutique: (p) => ecranBoutique(p),
  confidentialite: () => ecranConfidentialite(),
  ...ECRANS_DES_COLLECTIONS,
};

/**
 * Ouvre un écran de la progression : « ligues », « coffres », « troupes »,
 * « probas » (un type de coffre), « fiche » (une troupe), « boutique »,
 * « album », « collection » (son identifiant), « blason », « saison »,
 * « confidentialite ».
 */
export function ouvrirProgression(ecran, arg) {
  if (ECRANS[ecran]) ECRANS[ecran](lireProgression(), arg);
  // (Le magasin n'avait pas dit ses prix au lancement — hors ligne, sans doute : on les lui redemande.)
  if (ecran === 'boutique' && prixManquants()) {
    relireLesPrix().then((lus) => { if (lus && titreMontre === txt('Boutique')) ecranBoutique(lireProgression(), '', { surPlace: true }); }).catch(() => {});
  }
}

/** Range le profil et prévient l'accueil ; renvoie false si l'appareil refuse d'écrire. */
function retenir(profil) {
  const ok = ecrireProgression(profil);
  surChangement(profil);
  return ok;
}

/** Où les achats en argent réel lisent et rangent le profil (js/achats.js). */
const RANGEMENT = { lire: () => lireProgression(), ecrire: (profil) => retenir(profil) };

/** Ce que l'écran dit d'un achat en argent réel, une fois le guichet revenu. Rien pour un achat annulé. */
function phraseDAchat(r) {
  if (r.etat === 'achete') {
    const gagnees = r.evenements.filter((e) => e.type === 'couronnes').reduce((n, e) => n + e.variation, 0);
    const troupes = r.evenements.filter((e) => e.type === 'troupeDebloquee').map((e) => nomTroupe(e.troupe));
    return [troupes.length ? txt`${troupes.join(', ')} : c’est débloqué.` : '', gagnees > 0 ? txt`${compte(gagnees, accord(gagnees, 'Couronne'))} de plus dans ta bourse.` : ''].filter(Boolean).join(' ') || txt('C’est livré.');
  }
  if (r.etat === 'annule') return '';
  if (r.etat === 'attente') return txt('Achat en attente : il sera livré dès que le magasin l’aura confirmé.');
  if (r.etat === 'deja') return txt('Cet achat t’avait déjà été livré.');
  if (r.etat === 'occupe') return txt('Un achat est déjà en cours.');
  if (r.etat === 'erreur' && r.raison === 'ecriture') return txt('Sauvegarde impossible sur cet appareil : l’achat sera livré au prochain lancement.');
  return txt('L’achat n’a pas abouti. Si un paiement est parti, il sera livré au prochain lancement.');
}

/** Le guichet est revenu : la boutique, si elle est encore à l'écran, dit ce qu'il en est. */
function apresAchat(r) {
  if (titreMontre === txt('Boutique')) ecranBoutique(lireProgression(), phraseDAchat(r));
  return r;
}

function agir(act, arg, i) {
  if (act === 'fermer') return fermerProgression();
  if (act === 'langue') {
    if (arg === LANGUE) return fermerProgression();
    if (!choisirLangue(arg)) return ecranLangue(txt('Changement impossible sur cet appareil : le stockage est fermé.'));
    try { if (typeof location !== 'undefined' && location.reload) location.reload(); } catch { /* sans page : rien à recharger */ }
    return undefined;
  }
  if (act === 'effacerDonnees') {
    // Deux touchers, comme tout ce qui ne se rattrape pas ; puis la page repart de zéro.
    if (i !== '1') return ecranConfidentialite('', { confirmer: true });
    if (!effacerLesDonnees()) return ecranConfidentialite(txt('Effacement impossible sur cet appareil : le stockage est fermé.'));
    surChangement(lireProgression());
    ecranConfidentialite(txt('Tes données sont effacées. Le jeu repart de zéro.'));
    try { if (typeof location !== 'undefined' && location.reload) setTimeout(() => location.reload(), 1200); } catch { /* sans page : rien à recharger */ }
    return undefined;
  }
  const profil = lireProgression();
  if (agirSurLesCollections(act, arg, i, profil, (p, message, confirmer) => ecranBoutique(p, message, { confirmer }))) return undefined;
  if (act === 'ouvrir') {
    const r = ouvrirCoffre(profil, Number(i) || 0, Math.random);
    if (r.erreur) return ecranCoffres(profil);
    retenir(r.profil);
    return ecranOuverture(r, r.profil);
  }
  if (act === 'essayer') {
    if (!surEssai || profil.debloquees[arg]) return ecranFiche(arg, profil);
    // (main.js répond « confirmer » quand une partie dort : second toucher demandé.)
    if (surEssai(arg, i === '1') === 'confirmer') return ecranFiche(arg, profil, '', { confirmerEssai: true });
    return fermerProgression();
  }
  if (act === 'acheter' || act === 'acheterTout') {
    // Premier toucher : le bouton demande confirmation — ou dit ce qu'il manque. Second : l'achat.
    const c = catalogueBoutique(profil, heure(), jourLocal());
    const prix = act === 'acheter' ? (c.troupes.find((t) => t.type === arg && !t.debloquee) || {}).prix : c.lotTroupes && c.lotTroupes.prix;
    if (!(prix > 0)) return ecranBoutique(profil);
    if (c.couronnes < prix) return ecranBoutique(profil, txt`Il te manque ${couronnes(prix - c.couronnes)} pour cet achat.`);
    if (i !== '1') return ecranBoutique(profil, '', { confirmer: arg });
    const r = act === 'acheter' ? acheterTroupe(profil, arg, heure()) : acheterToutesLesTroupes(profil);
    if (r.erreur) return ecranBoutique(profil);
    const ok = retenir(r.profil);
    const acquises = r.evenements.filter((e) => e.type === 'troupeDebloquee').map((e) => nomTroupe(e.troupe));
    // (Sans « il » ni « elle » : le Sphinx et l'Hydre portent le même article.)
    return ecranBoutique(r.profil, ok ? txt`${acquises.join(', ')} : c’est débloqué. À former dès ta prochaine partie.`
      : txt('Sauvegarde impossible sur cet appareil : cet achat ne sera pas retenu.'));
  }
  if (act === 'acheterLot' || act === 'acheterOffre') {
    const article = act === 'acheterLot' ? R.boutique.lots.find((l) => l.id === arg) : arg === 'bienvenue' ? R.boutique.offres.bienvenue : null;
    if (!article || !vendable(article.produit)) return ecranBoutique(profil);
    if (achatEnCours()) return ecranBoutique(profil, txt('Un achat est déjà en cours.'));
    // Au guichet simulé : deux touchers, et l'écran dit que rien n'est payé. Le vrai magasin demande lui-même confirmation.
    if (ventesSimulees() && i !== '1') return ecranBoutique(profil, txt('Version d’essai : cet achat est simulé, aucun paiement n’est demandé.'), { confirmer: `argent:${arg}` });
    const suite = acheterAuGuichet(article.produit, RANGEMENT).then(apresAchat);
    ecranBoutique(profil, txt('Achat en cours…'), { surPlace: true });
    return suite;
  }
  if (act === 'restaurerAchats') {
    if (!ventesOuvertes() || achatEnCours()) return ecranBoutique(profil);
    const suite = restaurerAuGuichet(RANGEMENT).then((r) => {
      const rendues = r.rendus.flatMap((x) => x.evenements.filter((e) => e.type === 'troupeDebloquee').map((e) => nomTroupe(e.troupe)));
      const phrase = r.etat !== 'restaure' ? txt('Le magasin n’a pas répondu. Réessaie dans un moment.')
        : rendues.length ? txt`${rendues.join(', ')} : c’est de nouveau à toi.` : txt('Rien à restaurer : tout ce que tu as acheté est déjà là.');
      if (titreMontre === txt('Boutique')) ecranBoutique(lireProgression(), phrase);
      return r;
    });
    ecranBoutique(profil, txt('Recherche de tes achats…'), { surPlace: true });
    return suite;
  }
  if (act === 'essaiCouronnes') {
    const r = prendreCouronnesDEssai(profil);
    if (r.erreur) return ecranBoutique(profil);
    retenir(r.profil);
    return ecranBoutique(r.profil);
  }
  if (act === 'ameliorer') {
    const r = ameliorer(profil, arg);
    if (r.erreur) return ecranFiche(arg, profil);
    const ok = retenir(r.profil);
    const e = r.evenements.find((x) => x.type === 'amelioration');
    return ecranFiche(arg, r.profil, ok ? txt`${nomTroupe(arg)} passe au niveau ${e ? e.niveau : ''}.` : txt('Sauvegarde impossible sur cet appareil : ce niveau ne sera pas retenu.'));
  }
  return undefined;
}

/** Le jour d'ici, « AAAA-MM-JJ » : c'est lui qui borne les coffres du jour et la semaine jouée. */
export function jourLocal(date = new Date()) {
  const deux = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}`;
}

brancherCollections({ montrer, retenir, nombre, pluriel, couronnes, euros, coffre, heure, ligueEnPhrase, jour: () => jourLocal() });

/** Le peuple dont les écrans montrent les noms et les portraits. */
export function reglerPeuple(nouveau) { civ = nouveau || DEFAULT_CIV; reglerPeupleDesTeintures(civ); }

/**
 * À appeler une fois : pose les écouteurs. Tout bouton qui porte `data-ecran`
 * (dans l'accueil, l'écran de fin ou les écrans eux-mêmes) ouvre cet écran.
 */
export function installerProgression({ quandLeProfilChange = () => {}, quandOnEssaie = null, guichet = null } = {}) {
  surChangement = quandLeProfilChange;
  surEssai = quandOnEssaie;
  // Les ventes en argent réel : par le guichet donné (js/achats.js). Sans guichet, rien ne s'achète ainsi.
  if (guichet) {
    ouvrirLesVentes(guichet, RANGEMENT, { quandUnAchatArrive: apresAchat })
      .then(() => { if (titreMontre === txt('Boutique')) ecranBoutique(lireProgression()); }).catch(() => {});
  } else fermerLesVentes();
  document.addEventListener('click', (ev) => {
    const cible = ev.target.closest ? ev.target.closest('[data-ecran], #progression [data-act]') : null;
    if (!cible) {
      if (ev.target === noeud()) fermerProgression();   // un toucher à côté de la carte la ferme
      return;
    }
    if (cible.dataset.ecran) ouvrirProgression(cible.dataset.ecran, cible.dataset.arg);
    else agir(cible.dataset.act, cible.dataset.arg, cible.dataset.i);
  });
}

// --- Fin de partie ---------------------------------------------------------------

/** Ce qu'une partie classée a changé, pour l'écran de fin : le score, la ligue, les coffres, les troupes. */
export function htmlFinDePartie(evenements, profil) {
  if (!evenements || !profil) return '';
  const de = (type) => evenements.filter((e) => e.type === type);
  const annulee = de('partieAnnulee')[0];
  if (annulee) {
    return `<div class="prog-fin"><p>${annulee.raison === 'dejaComptee'
      ? txt('Cette partie a déjà été comptée au classement.') : txt('Partie annulée : elle ne compte pas au classement.')}</p></div>`;
  }
  // (Le joueur d'abord : son médaillon et son titre.)
  const lignes = [`<p class="prog-fin-joueur">${htmlMedaillon(profil.blason)}<b>${titreDuBlason(profil.blason)}</b></p>`];
  const elo = de('elo')[0];
  if (elo) {
    const signe = elo.variation > 0 ? '+' : elo.variation < 0 ? '−' : '';
    lignes.push(`<p class="prog-fin-elo ${elo.variation > 0 ? 'monte' : elo.variation < 0 ? 'descend' : ''}">
      <b>${signe}${Math.abs(elo.variation)}</b> <span>${nombre(elo.apres)} Elo · ${nomDeLigue(profil.ligue)}</span></p>`);
  }
  for (const e of de('promotion')) lignes.push(`<p class="prog-fin-promotion">${ecu(e.a, 'petit')} ${txt`Promotion en <b>${ligueEnPhrase(e.a)}</b> : tes troupes y jouent jusqu’au niveau ${e.plafond}.`}</p>`);
  for (const e of de('retrogradation')) lignes.push(`<p>${txt`Retour en ${ligueEnPhrase(e.a)}.`}</p>`);
  for (const e of de('troupeDebloquee')) lignes.push(`<p class="prog-fin-troupe">${vignette(e.troupe, 'petite')} ${txt`Nouvelle troupe : <b>${nomTroupe(e.troupe)}</b>`}</p>`);
  for (const e of de('ouvrierAuPlafond')) lignes.push(`<p>${txt`${nomTroupe(e.troupe)} monte au niveau ${e.a}, comme la ligue.`}</p>`);
  for (const e of de('couronnes')) if (e.variation > 0 && e.origine === 'ligue') lignes.push(`<p class="prog-fin-couronnes">${txt`+${couronnes(e.variation)} Couronnes pour ta nouvelle ligue.`}</p>`);
  for (const e of de('piece')) {
    // (Les pièces des paliers de la saison passée sont dites plus bas, avec le reste de ce qu'elle donne.)
    if (e.doublon || e.origine === 'route') continue;
    lignes.push(`<p class="prog-fin-piece">${htmlPiece(e.piece)} <span>${e.origine === 'ligue' ? txt`Cadeau de ligue : <b>${pieceEnEtiquette(e.piece)}</b>` : txt`Gagné : <b>${pieceEnEtiquette(e.piece)}</b>`}</span></p>`);
  }
  // Le mois a tourné : ce que la saison passée devait encore (ses paliers atteints, sa récompense de ligue).
  if (de('saison').length) {
    const fin = evenements.findIndex((e) => e.type === 'saison');
    const gains = resumeDesGains(evenements.slice(0, fin).filter((e) => e.type !== 'coffre' && (e.type !== 'piece' || e.origine === 'route')));
    if (gains) lignes.push(`<p class="prog-fin-saison">${txt`La saison passée te donne encore : ${gains}.`}</p>`);
  }
  for (const e of de('remiseDeSaison')) {
    lignes.push(`<p class="prog-fin-saison">${e.variation < 0 ? txt`La saison est finie : au-dessus de ${nombre(R.saison.pivot)}, le score se resserre, et le tien repart de ${nombre(e.apres)}.` : txt('La saison est finie.')}</p>`);
  }
  for (const e of de('saison')) lignes.push(`<p class="prog-fin-saison">${txt`La saison ${e.numero} commence : une nouvelle route t’attend.`}</p>`);
  for (const e of de('pointsDeSaison')) {
    if (!(e.variation > 0)) continue;
    // (La parenthèse et le bouton sont des trous : la phrase reste entière, avec ou sans eux.)
    const premiere = e.premiereVictoireDuJour ? ` ${txt('(première victoire du jour)')}` : '';
    const aPrendre = `<button class="btn small prog-attend" data-ecran="saison">${txt`palier ${e.palier} à prendre`}</button>`;
    lignes.push(`<p class="prog-fin-saison">${iconeSVG('saison', 16, 'inline')} ${e.paliersGagnes > 0 ? txt`<b>+${e.variation}</b> points de saison${premiere} : ${aPrendre}` : txt`<b>+${e.variation}</b> points de saison${premiere}`}</p>`);
  }
  for (const e of de('offreOuverte')) {
    if (e.offre === 'ligue') lignes.push(`<p class="prog-fin-offre"><button class="btn small prog-attend" data-ecran="boutique">${iconeSVG('couronne', 16, 'inline')} ${txt`Offre de ligue : ${nomTroupe(e.troupe)} à moitié prix, ${R.boutique.offres.ligue.heures} h`}</button></p>`);
  }
  const coffres = de('coffre');
  if (coffres.length) {
    lignes.push(`<p class="prog-fin-coffres">${coffres.map((c) => `<span class="prog-fin-coffre">${coffre(c.coffre, 'ferme', 60)}
      <span class="prog-coffre-nom" data-type="${c.coffre}">${R.coffres[c.coffre].nom}</span><small>${ORIGINES[c.origine] || ''}</small></span>`).join('')}</p>`);
  }
  const attente = profil.coffres.length;
  return `
    <div class="prog-fin">
      ${lignes.join('')}
      ${attente ? `<button class="btn small prog-attend" data-ecran="coffres">${iconeSVG('coffre', 16, 'inline')} ${attente > 1 ? txt`Ouvrir mes ${attente} coffres` : txt('Ouvrir mon coffre')}</button>` : ''}
    </div>`;
}
