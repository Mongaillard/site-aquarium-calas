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
import { lireProgression, ecrireProgression } from './save.js';
import { UNIT_TYPES, DEFAULT_CIV, GAME_MODES, nomDe, portraitDe } from './config.js';
import { iconeSVG } from './icones.js';
import { ficheDeTroupe } from './fiches-troupes.js';
import { PIECES } from './collections-config.js';
import { htmlPiece, htmlMedaillon, titreDuBlason, reglerPeupleDesTeintures } from './blason.js';
import {
  brancherCollections, ECRANS_DES_COLLECTIONS, agirSurLesCollections, eclats, htmlJoueur, htmlBourses,
  aPrendreDansLaSaison, htmlPiecesDuCoffre, htmlRayonDesCollections, pieceEnEtiquette, resumeDesGains,
} from './collections-ecrans.js';

/** Les troupes que le jeu sait former, dans l'ordre des réglages. */
const TROUPES = Object.keys(R.troupes).filter((type) => !R.troupes[type].aVenir && UNIT_TYPES[type]);
const ORIGINES = { victoire: 'Victoire', defaite: 'Défaite', egalite: 'Égalité', promotion: 'Promotion', semaine: 'Semaine jouée', saison: 'Fin de saison', route: 'Route de saison', bataille: 'Points de bataille' };

let civ = DEFAULT_CIV;          // le peuple dont on montre les noms et les portraits
let surChangement = () => {};   // l'accueil se redessine quand le profil change
let surEssai = null;            // lance une partie d'essai (main.js) ; absent : pas de bouton

const nombre = (v, decimales = 2) => Number(v).toLocaleString('fr-FR', { maximumFractionDigits: decimales });
const pluriel = (n, mot, mots = mot + 's') => `${nombre(n)} ${n > 1 ? mots : mot}`;
const part = (v) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

// --- Noms ----------------------------------------------------------------------

const ARTICLES = { Soleil: 'du ', Légendes: 'des ' };
/** « ligue de Bois », « ligue d’Or », « ligue du Soleil » : le nom d'une ligue dans une phrase. */
export function ligueEnPhrase(ligue) {
  const l = typeof ligue === 'number' ? R.ligues[ligue - 1] : ligue;
  return `ligue ${ARTICLES[l.nom] || (/^[AEIOUYÉ]/.test(l.nom) ? 'd’' : 'de ')}${l.nom}`;
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
export const euros = (centimes) => `${(centimes / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00a0€`;
/** Ce qu'il reste d'une offre, en clair : « 2 j », « 47 h », « 12 min ». */
export function resteEnClair(secondes) {
  const heures = secondes / 3600;
  if (heures >= 48) return `${Math.floor(heures / 24)} j`;
  if (heures >= 1) return `${Math.ceil(heures)} h`;
  return `${Math.max(1, Math.ceil(secondes / 60))} min`;
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
      <button class="prog-bandeau-ligue" data-ecran="ligues" aria-label="Voir les ligues">
        <span class="prog-bandeau-texte">
          <b>${titreDuBlason(profil.blason)}</b>
          <small>${nomDeLigue(ligue)} · ${nombre(profil.elo)} Elo</small>
          <span class="prog-barre"><span style="width:${part(avance)}"></span></span>
          <small class="prog-vers">${suivante ? `${ligueEnPhrase(suivante)} à ${nombre(suivante.seuil)}` : 'la plus haute ligue'}</small>
        </span>
      </button>
    </div>
    ${htmlBourses(profil)}
    <div class="prog-bandeau-actions">
      ${tuile('coffres', 'coffre', 'Coffres', coffres)}
      ${tuile('troupes', 'militia', 'Troupes', prets)}
      ${tuile('album', 'album', 'Album', 0)}
      ${tuile('saison', 'saison', 'Saison', paliers)}
      ${tuile('boutique', 'couronne', 'Boutique', offres)}
    </div>`;
}

// --- Les écrans ------------------------------------------------------------------

const noeud = () => document.getElementById('progression');

function montrer(titre, corps, { retour = null } = {}) {
  const n = noeud();
  if (!n) return;
  n.innerHTML = `
    <div class="modal-card wide prog-carte">
      <div class="prog-tete">
        ${retour ? `<button class="icon-btn prog-retour" data-ecran="${retour}" aria-label="Retour">${iconeSVG('retour', 20)}</button>` : ''}
        <h2>${titre}</h2>
        <button class="icon-btn" data-act="fermer" aria-label="Fermer">${iconeSVG('fermer', 20)}</button>
      </div>
      ${corps}
    </div>`;
  n.classList.remove('hidden');
}

export function fermerProgression() {
  const n = noeud();
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
      if (p) lots.push(p.genre === 'grade' ? `titre «\u00a0${p.nom}\u00a0»` : p.nom);
    }
    if (l.promotion) lots.push(`${R.boutique.parLigue} Couronnes`);
    return `
      <li class="prog-ligue ${etat}">
        ${ecu(l.numero)}
        <span class="prog-ligue-texte">
          <b>${nomDeLigue(l)}</b>
          <small>${l.seuil ? `dès ${nombre(l.seuil)} Elo` : 'le départ'} · troupes jusqu’au niveau ${l.plafond}</small>
          ${lots.length ? `<small class="prog-lot">${etat ? 'Reçu' : 'À gagner'} : ${lots.join(' · ')}</small>` : ''}
        </span>
        ${l.numero === profil.ligue ? '<span class="prog-ici">Tu es ici</span>' : ''}
      </li>`;
  }).join('');
  montrer('Les ligues', `
    <p class="subtitle">Une victoire classée rapporte ${R.elo.victoire} points, une défaite en coûte ${-R.elo.defaite}.
      De ligue en ligue, tes troupes jouent à un niveau plus haut en partie classée.</p>
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

/** « bois », « argent », « or », « légendaire » : le rang d'un coffre, sans le mot « coffre ». */
function nomCourtDuCoffre(type) {
  return R.coffres[type].nom.replace('Coffre ', '').replace(/^d[e’] ?/, '');
}

function ecranCoffres(profil) {
  const aujourdhui = jourLocal();
  const s = R.sources;
  const liste = profil.coffres.map((c, i) => `
    <li class="prog-coffre" data-type="${c.type}">
      <span class="prog-coffre-image">${coffre(c.type, 'ferme', 56)}</span>
      <span class="prog-coffre-texte"><b>${R.coffres[c.type].nom}</b><small>${ORIGINES[c.origine] || ''}</small></span>
      <button class="icon-btn" data-ecran="probas" data-arg="${c.type}" aria-label="Probabilités">${iconeSVG('info', 18)}</button>
      <button class="btn primary small" data-act="ouvrir" data-i="${i}">Ouvrir</button>
    </li>`).join('');
  // Les compteurs de la semaine ne valent que pour la semaine où ils ont été pris.
  const semaine = profil.semaine.numero === semaineDuJour(aujourdhui) ? profil.semaine : { jours: 0, coffre: false };
  const rangs = Object.keys(R.coffres);
  const ISSUES = [['victoire', 'Victoire'], ['egalite', 'Égalité'], ['defaite', 'Défaite']];
  const tableDesRangs = (table) => `
    <table class="scores prog-probas prog-rangs">
      <tr><th></th>${rangs.map((r) => `<th aria-label="${R.coffres[r].nom}">${coffre(r, 'ferme', 38)}</th>`).join('')}</tr>
      ${ISSUES.map(([issue, nom]) => `<tr><td>${nom}</td>${rangs.map((r) => `<td>${table[issue][r] || 0} %</td>`).join('')}</tr>`).join('')}
    </table>`;
  // Un format plus court a sa table, moins généreuse : elle se montre aussi.
  const courts = Object.entries(s.parFormat || {}).filter(([format]) => GAME_MODES[format]).map(([format, table]) => `
    <h3>En ${GAME_MODES[format].name}</h3>
    <p class="subtitle">Une partie de ${Math.round(GAME_MODES[format].timeLimit / 60)} minutes, deux fois plus courte : le coffre est un cran en dessous.</p>
    ${tableDesRangs(table)}`).join('');
  montrer('Coffres', `
    ${liste ? `<ul class="prog-coffres">${liste}</ul>` : '<p class="prog-vide">Aucun coffre à ouvrir. Chaque partie classée en donne un.</p>'}
    <h3>Un coffre par partie</h3>
    <p class="subtitle">Chaque partie classée donne un coffre, gagnée ou perdue. Son rang est tiré au sort : la victoire a de meilleures chances.</p>
    ${tableDesRangs(s.partie)}
    ${courts}
    <p class="hint">Une défaite de moins de ${Math.round(R.abandon.precoceAvant / 60)} minutes, abandon compris, ne donne pas de coffre.</p>
    <h3>En plus</h3>
    <ul class="prog-prochains">
      <li><span>Coffre d’or</span>
        <small>${semaine.coffre ? 'gagné cette semaine' : `en jouant ${s.or.joursJoues} jours dans la semaine · ${semaine.jours} sur ${s.or.joursJoues}`}</small></li>
      <li><span>Un coffre à chaque nouvelle ligue</span><small>voir la route des ligues</small></li>
    </ul>
    <h3>Contenu et chances de chaque coffre</h3>
    <div class="modal-actions prog-choix-coffres">
      ${rangs.map((type) => `<button class="btn small" data-ecran="probas" data-arg="${type}">${coffre(type, 'ferme', 44)}<span class="prog-coffre-nom" data-type="${type}">${nomCourtDuCoffre(type)}</span></button>`).join('')}
    </div>`);
}

function ecranProbas(type) {
  const t = probabilitesDe(type);
  if (!t) return ecranCoffres(lireProgression());
  const groupes = t.groupes.map((g) => `
    <h3>${g.nom} — ${g.nombre} ${g.nombre > 1 ? 'tirages' : 'tirage'}</h3>
    <table class="scores prog-probas">
      <tr><th>Catégorie</th><th>Chance</th><th>Fragments</th></tr>
      ${g.lignes.map((l) => `<tr><td><span class="prog-categorie" data-categorie="${l.categorie}">${l.nom}</span></td><td>${nombre(l.pourCent)} %</td><td>${l.fragments}</td></tr>`).join('')}
      <tr class="total"><td>Total</td><td>${nombre(g.total / 10)} %</td><td></td></tr>
    </table>`).join('');
  montrer(t.nom, `
    <div class="prog-coffre-tete">${coffre(type, 'ferme', 96)}${coffre(type, 'ouvert', 96)}</div>
    <p class="subtitle">${pluriel(t.tirages, 'tirage')}. Sur 100 coffres, en moyenne : ${pluriel(t.surCent.commune, 'fragment commun', 'fragments communs')},
      ${pluriel(t.surCent.rare, 'rare')}, ${pluriel(t.surCent.epique, 'épique')}.</p>
    ${groupes}
    ${t.pieces.nombre ? `
    <h3>${t.pieces.nombre > 1 ? `Autocollants — ${t.pieces.nombre} tirages` : 'Autocollant — 1 tirage'}</h3>
    <table class="scores prog-probas">
      <tr><th>Rareté</th><th>Chance</th><th>Un doublon rend</th></tr>
      ${t.pieces.lignes.map((l) => `<tr><td><span class="prog-categorie" data-categorie="${l.categorie}">${l.nom}</span></td><td>${nombre(l.pourCent)} %</td><td>${eclats(l.doublon)}</td></tr>`).join('')}
      <tr class="total"><td>Total</td><td>${nombre(t.pieces.total / 10)} %</td><td></td></tr>
    </table>
    <p class="subtitle">Dans la rareté tirée, chaque autocollant des collections des coffres a la même chance. Et dans chaque ${t.nom.toLowerCase()} : ${eclats(t.eclats)} Éclats, toujours.</p>` : ''}
    <h3>Comment un tirage se fait</h3>
    <ol class="prog-regles">
      <li>Il choisit une catégorie selon le tableau.</li>
      <li>Dans cette catégorie, il choisit à chances égales une de tes troupes débloquées qui n’est pas au niveau maximum.</li>
      <li>Il donne le nombre de fragments indiqué, toujours le même.</li>
      <li>Si tu n’as aucune troupe disponible dans la catégorie, le tirage passe à une autre : celle du dessous d’abord, sinon celle du dessus.</li>
      <li>Si toutes tes troupes sont au niveau maximum, les fragments deviennent des Éclats.</li>
    </ol>
    <p class="hint">Aucun coffre ne se vend.</p>`, { retour: 'coffres' });
}

/** Le temps que met le coffre à s'ouvrir (voir .prog-ouverture dans la feuille de style) : les tirages attendent. */
const OUVERTURE_MS = 1000;

function ecranOuverture(resultat, profil) {
  const lignes = resultat.tirages.map((t, i) => `
    <li class="prog-tirage" style="animation-delay:${OUVERTURE_MS + i * 140}ms">
      ${t.troupe ? vignette(t.troupe) : `<span class="prog-vignette">${iconeSVG('coffre', 26)}</span>`}
      <span class="prog-tirage-texte">
        <b>${t.troupe ? nomTroupe(t.troupe) : 'Éclats'}</b>
        <small><span class="prog-categorie" data-categorie="${t.categorie || t.tiree}">${R.nomsDesCategories[t.categorie || t.tiree] || ''}</span>${t.genre === 'garanti' ? ' · garanti' : ''}</small>
      </span>
      <span class="prog-gain">+${t.fragments ? pluriel(t.fragments, 'fragment') : pluriel(t.eclats, 'Éclat')}</span>
    </li>`).join('');
  const prets = resultat.evenements.filter((e) => e.type === 'ameliorationPossible');
  // Le coffre s'ouvre en trois images, l'une après l'autre (jamais de fondu) ; ses tirages paraissent ensuite.
  montrer(R.coffres[resultat.coffre].nom, `
    <div class="prog-ouverture" data-type="${resultat.coffre}">${ETATS_DE_COFFRE.map((etat, i) => coffre(resultat.coffre, etat, 190, `e${i + 1}`)).join('')}</div>
    <ul class="prog-tirages">${lignes}${htmlPiecesDuCoffre(resultat, OUVERTURE_MS + resultat.tirages.length * 140)}</ul>
    ${prets.length ? `<p class="prog-annonce">Tu peux améliorer : ${prets.map((e) => `<button class="btn small prog-attend" data-ecran="fiche" data-arg="${e.troupe}">${nomTroupe(e.troupe)}</button>`).join(' ')}</p>` : ''}
    <div class="modal-actions">
      ${profil.coffres.length ? `<button class="btn primary" data-act="ouvrir" data-i="0">Coffre suivant (${profil.coffres.length})</button>` : ''}
      <button class="btn ${profil.coffres.length ? '' : 'primary'}" data-ecran="troupes">Mes troupes</button>
      <button class="btn" data-ecran="album">Mon album</button>
      <button class="btn" data-act="fermer">Fermer</button>
    </div>`);
}

function carteTroupe(profil, type) {
  const t = profil.troupes[type], debloquee = !!profil.debloquees[type];
  const v = versLeNiveauSuivant(profil, type);
  let pied;
  if (!debloquee) pied = `<small class="prog-verrou">${iconeSVG('cadenas', 12, 'inline')} ${nomDeLigue(R.troupes[type].gratuite.ligue)}</small>`;
  else if (!v) pied = '<small>niveau maximum</small>';
  else pied = `<span class="prog-barre"><span style="width:${part(v.fragments / v.cout)}"></span></span><small>${v.fragments} / ${v.cout}</small>`;
  return `
    <button class="prog-troupe ${debloquee ? '' : 'verrouillee'} ${v && v.pret ? 'prete' : ''}" data-ecran="fiche" data-arg="${type}">
      ${vignette(type)}
      <b>${nomTroupe(type)}</b>
      ${debloquee ? `<span class="prog-niveau">Niv. ${t.niveau}</span>` : ''}
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
  montrer('Mes troupes', `
    <p class="subtitle">Les fragments des coffres montent le niveau d’une troupe. En partie classée, ta ${ligueEnPhrase(profil.ligue)} fait jouer les troupes jusqu’au niveau ${plafond}.</p>
    ${sections}`);
}

/** Les statistiques qu'une fiche montre : celles qui existent pour la troupe. */
const STATISTIQUES = [
  ['Points de vie', (d) => d.hp],
  ['Dégâts', (d) => d.attack || null],
  ['Soin par geste', (d) => d.heal || null],
  ['Vue, en cases', (d) => d.los],
  // (Par minute : c'est l'unité où la récolte est un chiffre rond à chaque niveau. L'arrondi n'ôte que le bruit du calcul en virgule flottante.)
  ['Vivres ou or par minute', (d) => (d.gather ? Math.round(d.gather.food * 60 * 1e6) / 1e6 : null)],
  ['Bois par minute', (d) => (d.gather ? Math.round(d.gather.wood * 60 * 1e6) / 1e6 : null)],
  ['Chargement', (d) => d.carry || null],
  ['Vitesse de chantier', (d) => (d.gather ? (d.construction || 1) * 100 : null), ' %'],
  ['Contre la cavalerie', (d) => (d.bonus && d.bonus.cavalry) || null, '', '+'],
  ['Contre les bâtiments', (d) => (d.bonus && d.bonus.building) || null, '', '+'],
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
  const lignes = STATISTIQUES.map(([nom, lire, apres = '', avant = '']) => {
    const a = lire(maintenant);
    if (a === null || a === undefined || lire(base) === lire(sommet)) return '';
    const b = ensuite ? lire(ensuite) : null;
    const monte = b !== null && b !== a;
    return `<tr><td>${nom}</td><td>${avant}${nombre(a)}${apres}</td>${ensuite ? `<td class="${monte ? 'prog-monte' : ''}">${monte ? `${avant}${nombre(b)}${apres}` : '—'}</td>` : ''}</tr>`;
  }).join('');
  let pied;
  if (!debloquee) {
    const g = reglage.gratuite;
    // L'essai : une partie libre où trois exemplaires attendent près du centre.
    // Une partie qui dort serait effacée : il faut alors toucher deux fois.
    const essai = !surEssai ? '' : `
      <div class="modal-actions">
        <button class="btn ${confirmerEssai ? 'danger' : ''}" data-act="essayer" data-arg="${type}" ${confirmerEssai ? 'data-i="1"' : ''}>${confirmerEssai
    ? 'Toucher encore : la partie en cours sera effacée' : 'Essayer en partie libre'}</button>
      </div>
      <p class="hint">Trois t’attendent près de ton centre. Une partie d’essai ne compte ni au classement ni au palmarès.</p>`;
    // La boutique la donne tout de suite, au prix de cette heure (l'offre de ligue le baisse).
    const article = catalogueBoutique(profil, heure()).troupes.find((x) => x.type === type && !x.debloquee);
    const boutique = !article ? '' : `
      <div class="modal-actions">
        <button class="btn" data-ecran="boutique">Tout de suite à la boutique : ${couronnes(article.prix)}</button>
      </div>`;
    pied = `<p class="prog-annonce">${iconeSVG('cadenas', 14, 'inline')} Offerte en ${ligueEnPhrase(g.ligue)}, ou après ${g.parties} parties classées jouées
      (tu en as joué ${profil.parties - profil.abandonsPrecoces}).</p>${boutique}${essai}`;
  } else if (!v) {
    pied = '<p class="prog-annonce">Niveau maximum atteint.</p>';
  } else {
    pied = `
      <div class="prog-cout">
        <span class="prog-barre"><span style="width:${part(v.fragments / v.cout)}"></span></span>
        <small>${pluriel(v.fragments, 'fragment')} sur ${v.cout}</small>
      </div>
      <div class="modal-actions">
        <button class="btn primary" data-act="ameliorer" data-arg="${type}" ${v.pret ? '' : 'disabled'}>Passer au niveau ${t.niveau + 1}</button>
      </div>`;
  }
  montrer(nomTroupe(type), `
    <div class="prog-fiche-tete">
      ${vignette(type, 'grande')}
      <p><span class="prog-categorie" data-categorie="${reglage.categorie}">${R.nomsDesCategories[reglage.categorie]}</span>
        ${debloquee ? `<b>Niveau ${t.niveau}</b> sur ${R.niveauMax}` : '<b>À débloquer</b>'}</p>
    </div>
    ${message ? `<p class="prog-annonce">${message}</p>` : ''}
    ${texteDeFiche(type)}
    <table class="scores prog-stats">
      <tr><th></th><th>${debloquee ? `Niveau ${t.niveau}` : 'Niveau 1'}</th>${ensuite ? `<th>Niveau ${t.niveau + 1}</th>` : ''}</tr>
      ${lignes}
    </table>
    ${debloquee && t.niveau > plafond ? `<p class="hint">En partie classée, elle joue au niveau ${plafond} tant que tu es en ${ligueEnPhrase(profil.ligue)}. Contre l’ordinateur en partie libre, elle joue à son niveau réel.</p>` : ''}
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
    ? `<button class="btn small danger" data-act="${act}" data-arg="${arg}" data-i="1">Toucher encore : ${couronnes(prix)}</button>`
    : `<button class="btn small primary" data-act="${act}" data-arg="${arg}">${couronnes(prix)}</button>`;
}

/**
 * La boutique : le porte-monnaie, les offres qui courent, les troupes à
 * débloquer, les lots de Couronnes. `confirmer` : l'article dont on attend le
 * second toucher (un type de troupe, ou « tout »).
 */
function ecranBoutique(profil, message = '', { confirmer = '' } = {}) {
  const c = catalogueBoutique(profil, heure(), jourLocal());
  const offres = c.offres.map((o) => {
    if (o.id === 'ligue') {
      return `
        <li class="prog-offre">
          ${vignette(o.troupe)}
          <span class="prog-offre-texte">
            <b>Offre de ligue : ${nomTroupe(o.troupe)} à moitié prix</b>
            <small>${couronnes(o.prix)} au lieu de <s>${nombre(o.prixPlein)}</s> · encore ${resteEnClair(o.reste)}</small>
          </span>
          ${boutonAcheter('acheter', o.troupe, o.prix, c.couronnes, confirmer === o.troupe)}
        </li>`;
    }
    const contenu = [...o.troupes.map(nomTroupe), `${nombre(o.couronnes)} Couronnes`].join(' + ');
    return `
      <li class="prog-offre">
        <span class="prog-vignette">${iconeSVG('couronne', 30)}</span>
        <span class="prog-offre-texte">
          <b>Offre de bienvenue : ${contenu}</b>
          <small>${euros(o.prixCentimes)}, une seule fois · encore ${resteEnClair(o.reste)}</small>
        </span>
        <button class="btn small" disabled>${o.disponible ? euros(o.prixCentimes) : 'Bientôt'}</button>
      </li>`;
  }).join('');
  const troupes = c.troupes.map((t) => {
    const g = R.troupes[t.type].gratuite;
    const droite = t.debloquee
      ? '<span class="prog-acquis">Débloquée</span>'
      : boutonAcheter('acheter', t.type, t.prix, c.couronnes, confirmer === t.type);
    return `
      <li class="prog-article ${t.debloquee ? 'acquis' : ''}">
        <button class="prog-article-fiche" data-ecran="fiche" data-arg="${t.type}" aria-label="Voir la fiche : ${nomTroupe(t.type)}">${vignette(t.type)}</button>
        <span class="prog-offre-texte">
          <b>${nomTroupe(t.type)}</b>
          <small>${t.debloquee ? 'Déjà à toi.' : `${t.offre ? `<s>${nombre(t.prixPlein)}</s> · ` : ''}Sinon offerte en ${ligueEnPhrase(g.ligue)}`}</small>
        </span>
        ${droite}
      </li>`;
  }).join('');
  const lot = c.lotTroupes;
  const lots = c.lots.map((l) => `
    <li class="prog-article">
      <span class="prog-vignette">${iconeSVG('couronne', 30)}</span>
      <span class="prog-offre-texte">
        <b>${l.nom} : ${nombre(l.couronnes)} Couronnes</b>
        <small>${l.bonus ? `${l.bonus} % de plus que le premier lot` : 'Le premier lot'}</small>
      </span>
      <button class="btn small" disabled>${euros(l.prixCentimes)}</button>
    </li>`).join('');
  montrer('Boutique', `
    <p class="prog-bourse">${couronnes(c.couronnes, 22)} <span>${c.couronnes > 1 ? 'Couronnes' : 'Couronne'}</span>
      <span class="prog-bourse-eclats">${eclats(c.eclats, 22)} <span>${c.eclats > 1 ? 'Éclats' : 'Éclat'}</span></span></p>
    <p class="hint prog-monnaies">Les Couronnes s’achètent. Les Éclats se gagnent en jouant : dans chaque coffre, et pour chaque autocollant en double.</p>
    ${message ? `<p class="prog-annonce">${message}</p>` : ''}
    ${offres ? `<h3>Offres du moment</h3><ul class="prog-articles">${offres}</ul>` : ''}
    ${htmlRayonDesCollections(profil, c, confirmer)}
    <h3>Troupes</h3>
    <p class="subtitle">Une troupe avancée s’obtient gratuitement par sa ligue. Ici, tu l’as tout de suite : c’est la même troupe.</p>
    <ul class="prog-articles">
      ${troupes}
      ${lot ? `
      <li class="prog-article prog-lot-troupes">
        <span class="prog-vignette">${iconeSVG('militia', 30)}</span>
        <span class="prog-offre-texte">
          <b>Toutes les troupes (${lot.troupes.length})</b>
          <small>au lieu de <s>${nombre(lot.prixPlein)}</s></small>
        </span>
        ${boutonAcheter('acheterTout', 'tout', lot.prix, c.couronnes, confirmer === 'tout')}
      </li>` : ''}
    </ul>
    <h3>Couronnes</h3>
    <p class="subtitle">${c.lots.some((l) => l.disponible) ? 'Les Couronnes servent ici, et seulement ici.' : `L’achat de Couronnes arrivera avec l’application. D’ici là, elles se gagnent : ${R.boutique.parLigue} à chaque nouvelle ligue, et sur la route de la saison.`}</p>
    <ul class="prog-articles">${lots}</ul>
    ${c.essai ? `
    <div class="modal-actions">
      <button class="btn" data-act="essaiCouronnes">Porte-monnaie d’essai : +${nombre(c.essai.couronnes)} Couronnes</button>
    </div>
    <p class="hint">Version d’essai : ce bouton sert à essayer la boutique, il disparaîtra avec l’arrivée des vrais achats.</p>` : ''}
    <p class="hint">Rien d’aléatoire ne se vend ici : ni coffre, ni fragment, ni niveau.</p>`);
}

// --- Ouvrir un écran, agir ----------------------------------------------------------

const ECRANS = {
  ligues: (p) => ecranLigues(p),
  coffres: (p) => ecranCoffres(p),
  troupes: (p) => ecranTroupes(p),
  probas: (p, arg) => ecranProbas(arg),
  fiche: (p, arg) => ecranFiche(arg, p),
  boutique: (p) => ecranBoutique(p),
  ...ECRANS_DES_COLLECTIONS,
};

/**
 * Ouvre un écran de la progression : « ligues », « coffres », « troupes »,
 * « probas » (un type de coffre), « fiche » (une troupe), « boutique »,
 * « album », « collection » (son identifiant), « blason », « saison ».
 */
export function ouvrirProgression(ecran, arg) {
  if (ECRANS[ecran]) ECRANS[ecran](lireProgression(), arg);
}

/** Range le profil et prévient l'accueil ; renvoie false si l'appareil refuse d'écrire. */
function retenir(profil) {
  const ok = ecrireProgression(profil);
  surChangement(profil);
  return ok;
}

function agir(act, arg, i) {
  if (act === 'fermer') return fermerProgression();
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
    if (c.couronnes < prix) return ecranBoutique(profil, `Il te manque ${couronnes(prix - c.couronnes)} pour cet achat.`);
    if (i !== '1') return ecranBoutique(profil, '', { confirmer: arg });
    const r = act === 'acheter' ? acheterTroupe(profil, arg, heure()) : acheterToutesLesTroupes(profil);
    if (r.erreur) return ecranBoutique(profil);
    const ok = retenir(r.profil);
    const acquises = r.evenements.filter((e) => e.type === 'troupeDebloquee').map((e) => nomTroupe(e.troupe));
    // (Sans « il » ni « elle » : le Sphinx et l'Hydre portent le même article.)
    return ecranBoutique(r.profil, ok ? `${acquises.join(', ')} : c’est débloqué. À former dès ta prochaine partie.`
      : 'Sauvegarde impossible sur cet appareil : cet achat ne sera pas retenu.');
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
    return ecranFiche(arg, r.profil, ok ? `${nomTroupe(arg)} passe au niveau ${e ? e.niveau : ''}.` : 'Sauvegarde impossible sur cet appareil : ce niveau ne sera pas retenu.');
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
export function installerProgression({ quandLeProfilChange = () => {}, quandOnEssaie = null } = {}) {
  surChangement = quandLeProfilChange;
  surEssai = quandOnEssaie;
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
      ? 'Cette partie a déjà été comptée au classement.' : 'Partie annulée : elle ne compte pas au classement.'}</p></div>`;
  }
  // (Le joueur d'abord : son médaillon et son titre.)
  const lignes = [`<p class="prog-fin-joueur">${htmlMedaillon(profil.blason)}<b>${titreDuBlason(profil.blason)}</b></p>`];
  const elo = de('elo')[0];
  if (elo) {
    const signe = elo.variation > 0 ? '+' : elo.variation < 0 ? '−' : '';
    lignes.push(`<p class="prog-fin-elo ${elo.variation > 0 ? 'monte' : elo.variation < 0 ? 'descend' : ''}">
      <b>${signe}${Math.abs(elo.variation)}</b> <span>${nombre(elo.apres)} Elo · ${nomDeLigue(profil.ligue)}</span></p>`);
  }
  for (const e of de('promotion')) lignes.push(`<p class="prog-fin-promotion">${ecu(e.a, 'petit')} Promotion en <b>${ligueEnPhrase(e.a)}</b> : tes troupes y jouent jusqu’au niveau ${e.plafond}.</p>`);
  for (const e of de('retrogradation')) lignes.push(`<p>Retour en ${ligueEnPhrase(e.a)}.</p>`);
  for (const e of de('troupeDebloquee')) lignes.push(`<p class="prog-fin-troupe">${vignette(e.troupe, 'petite')} Nouvelle troupe : <b>${nomTroupe(e.troupe)}</b></p>`);
  for (const e of de('ouvrierAuPlafond')) lignes.push(`<p>${nomTroupe(e.troupe)} monte au niveau ${e.a}, comme la ligue.</p>`);
  for (const e of de('couronnes')) if (e.variation > 0 && e.origine === 'ligue') lignes.push(`<p class="prog-fin-couronnes">+${couronnes(e.variation)} Couronnes pour ta nouvelle ligue.</p>`);
  for (const e of de('piece')) {
    // (Les pièces des paliers de la saison passée sont dites plus bas, avec le reste de ce qu'elle donne.)
    if (e.doublon || e.origine === 'route') continue;
    lignes.push(`<p class="prog-fin-piece">${htmlPiece(e.piece)} <span>${e.origine === 'ligue' ? 'Cadeau de ligue' : 'Gagné'} : <b>${pieceEnEtiquette(e.piece)}</b></span></p>`);
  }
  // Le mois a tourné : ce que la saison passée devait encore (ses paliers atteints, sa récompense de ligue).
  if (de('saison').length) {
    const fin = evenements.findIndex((e) => e.type === 'saison');
    const gains = resumeDesGains(evenements.slice(0, fin).filter((e) => e.type !== 'coffre' && (e.type !== 'piece' || e.origine === 'route')));
    if (gains) lignes.push(`<p class="prog-fin-saison">La saison passée te donne encore : ${gains}.</p>`);
  }
  for (const e of de('remiseDeSaison')) {
    lignes.push(`<p class="prog-fin-saison">La saison est finie${e.variation < 0 ? ` : au-dessus de ${nombre(R.saison.pivot)}, le score se resserre, et le tien repart de ${nombre(e.apres)}` : ''}.</p>`);
  }
  for (const e of de('saison')) lignes.push(`<p class="prog-fin-saison">La saison ${e.numero} commence : une nouvelle route t’attend.</p>`);
  for (const e of de('pointsDeSaison')) {
    if (!(e.variation > 0)) continue;
    lignes.push(`<p class="prog-fin-saison">${iconeSVG('saison', 16, 'inline')} <b>+${e.variation}</b> points de saison${e.premiereVictoireDuJour ? ' (première victoire du jour)' : ''}${e.paliersGagnes > 0 ? ` : <button class="btn small prog-attend" data-ecran="saison">palier ${e.palier} à prendre</button>` : ''}</p>`);
  }
  for (const e of de('offreOuverte')) {
    if (e.offre === 'ligue') lignes.push(`<p class="prog-fin-offre"><button class="btn small prog-attend" data-ecran="boutique">${iconeSVG('couronne', 16, 'inline')} Offre de ligue : ${nomTroupe(e.troupe)} à moitié prix, ${R.boutique.offres.ligue.heures} h</button></p>`);
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
      ${attente ? `<button class="btn small prog-attend" data-ecran="coffres">${iconeSVG('coffre', 16, 'inline')} Ouvrir ${attente > 1 ? `mes ${attente} coffres` : 'mon coffre'}</button>` : ''}
    </div>`;
}
