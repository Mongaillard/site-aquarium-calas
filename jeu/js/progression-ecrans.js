// ---------------------------------------------------------------------------
// Les écrans de la progression : le bandeau de ligue de l'accueil, la route
// des ligues, les coffres et leur ouverture, les probabilités, la collection,
// la fiche d'une troupe, et ce que la fin d'une partie classée annonce.
//
// Aucune règle ici : tout vient de js/progression.js, tous les nombres de
// js/progression-config.js. Le profil se lit et se range par js/save.js. Tant
// qu'aucun serveur ne fait foi, le coffre se tire sur l'appareil.
// ---------------------------------------------------------------------------

import { PROGRESSION as R } from './progression-config.js';
import { ouvrirCoffre, ameliorer, coutAmelioration, probabilitesDe, definitionAuNiveau, semaineDuJour } from './progression.js';
import { lireProgression, ecrireProgression } from './save.js';
import { UNIT_TYPES, DEFAULT_CIV, nomDe, portraitDe } from './config.js';
import { iconeSVG } from './icones.js';

/** Les troupes que le jeu sait former, dans l'ordre des réglages. */
const TROUPES = Object.keys(R.troupes).filter((type) => !R.troupes[type].aVenir && UNIT_TYPES[type]);
const ORIGINES = { victoire: 'Victoire', bataille: 'Points de bataille', promotion: 'Promotion', semaine: 'Semaine jouée', saison: 'Fin de saison' };

let civ = DEFAULT_CIV;          // le peuple dont on montre les noms et les portraits
let surChangement = () => {};   // l'accueil se redessine quand le profil change

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

/** Le bandeau de l'accueil : la ligue, le score, le chemin vers la suivante, les coffres et les troupes. */
export function htmlBandeau(profil) {
  const ligue = R.ligues[profil.ligue - 1], suivante = R.ligues[profil.ligue];
  const avance = suivante ? (profil.elo - ligue.seuil) / (suivante.seuil - ligue.seuil) : 1;
  const coffres = profil.coffres.length, prets = ameliorables(profil).length;
  return `
    <button class="prog-bandeau-ligue" data-ecran="ligues" aria-label="Voir les ligues">
      ${ecu(ligue.numero)}
      <span class="prog-bandeau-texte">
        <b>${nomDeLigue(ligue)}</b>
        <span class="prog-barre"><span style="width:${part(avance)}"></span></span>
        <small>${nombre(profil.elo)} Elo${suivante ? ` · ${ligueEnPhrase(suivante)} à ${nombre(suivante.seuil)}` : ''}</small>
      </span>
    </button>
    <div class="prog-bandeau-actions">
      <button class="btn small ${coffres ? 'prog-attend' : ''}" data-ecran="coffres">${iconeSVG('coffre', 16, 'inline')} Coffres${coffres ? ` <b class="prog-pastille">${coffres}</b>` : ''}</button>
      <button class="btn small ${prets ? 'prog-attend' : ''}" data-ecran="troupes">${iconeSVG('militia', 16, 'inline')} Troupes${prets ? ` <b class="prog-pastille">${prets}</b>` : ''}</button>
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

function ecranCoffres(profil) {
  const aujourdhui = jourLocal();
  const s = R.sources;
  const liste = profil.coffres.map((c, i) => `
    <li class="prog-coffre" data-type="${c.type}">
      <span class="prog-coffre-image">${iconeSVG('coffre', 34)}</span>
      <span class="prog-coffre-texte"><b>${R.coffres[c.type].nom}</b><small>${ORIGINES[c.origine] || ''}</small></span>
      <button class="icon-btn" data-ecran="probas" data-arg="${c.type}" aria-label="Probabilités">${iconeSVG('info', 18)}</button>
      <button class="btn primary small" data-act="ouvrir" data-i="${i}">Ouvrir</button>
    </li>`).join('');
  const bois = profil.jour.date === aujourdhui ? profil.jour.coffresBois : 0;
  // Les compteurs de la semaine ne valent que pour la semaine où ils ont été pris.
  const semaine = profil.semaine.numero === semaineDuJour(aujourdhui) ? profil.semaine : { jours: 0, coffre: false };
  montrer('Coffres', `
    ${liste ? `<ul class="prog-coffres">${liste}</ul>` : '<p class="prog-vide">Aucun coffre à ouvrir. Une victoire classée donne un coffre de bois.</p>'}
    <h3>Les prochains</h3>
    <ul class="prog-prochains">
      <li><span>Coffre de bois</span><small>à chaque victoire classée · ${bois} sur ${s.bois.parJourAuPlus} aujourd’hui</small></li>
      <li><span>Coffre d’argent</span>
        <span class="prog-barre"><span style="width:${part(profil.pointsDeBataille / s.argent.tousLes)}"></span></span>
        <small>${profil.pointsDeBataille} sur ${s.argent.tousLes} points de bataille · une victoire en vaut ${s.argent.victoire}, une défaite ${s.argent.defaite}</small></li>
      <li><span>Coffre d’or</span>
        <small>${semaine.coffre ? 'gagné cette semaine' : `en jouant ${s.or.joursJoues} jours dans la semaine · ${semaine.jours} sur ${s.or.joursJoues}`} · et à chaque nouvelle ligue</small></li>
    </ul>
    <h3>Contenu et chances de chaque coffre</h3>
    <div class="modal-actions prog-choix-coffres">
      ${Object.keys(R.coffres).map((type) => `<button class="btn small" data-ecran="probas" data-arg="${type}"><span class="prog-coffre-nom" data-type="${type}">${iconeSVG('coffre', 16, 'inline')}</span> ${R.coffres[type].nom.replace('Coffre ', '').replace(/^d[e’] ?/, '')}</button>`).join('')}
    </div>`);
}

function ecranProbas(type) {
  const t = probabilitesDe(type);
  if (!t) return ecranCoffres(lireProgression());
  const groupes = t.groupes.map((g) => `
    <h3>${g.nom} — ${g.nombre} ${g.nombre > 1 ? 'tirages' : 'tirage'}</h3>
    <table class="scores prog-probas">
      <tr><th>Catégorie</th><th>Chance</th><th>Fragments</th></tr>
      ${g.lignes.map((l) => `<tr><td><span class="prog-categorie" data-categorie="${l.categorie}">${l.nom}</span></td><td>${nombre(l.pourCent, 1)} %</td><td>${l.fragments}</td></tr>`).join('')}
      <tr class="total"><td>Total</td><td>${nombre(g.total / 10, 1)} %</td><td></td></tr>
    </table>`).join('');
  montrer(t.nom, `
    <p class="subtitle">${pluriel(t.tirages, 'tirage')}. En moyenne : ${nombre(t.moyenne.commune, 1)} fragments communs,
      ${nombre(t.moyenne.rare, 1)} rares, ${nombre(t.moyenne.epique, 1)} épiques.</p>
    ${groupes}
    <h3>Comment un tirage se fait</h3>
    <ol class="prog-regles">
      <li>Il choisit une catégorie selon le tableau.</li>
      <li>Dans cette catégorie, il choisit à chances égales une de tes troupes débloquées qui n’est pas au niveau maximum.</li>
      <li>Il donne le nombre de fragments indiqué, toujours le même.</li>
      <li>Si tu n’as aucune troupe disponible dans la catégorie, le tirage passe à une autre : celle du dessous d’abord, sinon celle du dessus.</li>
      <li>Si toutes tes troupes sont au niveau maximum, les fragments deviennent des éclats.</li>
    </ol>
    <p class="hint">Aucun coffre ne se vend.</p>`, { retour: 'coffres' });
}

function ecranOuverture(resultat, profil) {
  const lignes = resultat.tirages.map((t, i) => `
    <li class="prog-tirage" style="animation-delay:${i * 140}ms">
      ${t.troupe ? vignette(t.troupe) : `<span class="prog-vignette">${iconeSVG('coffre', 26)}</span>`}
      <span class="prog-tirage-texte">
        <b>${t.troupe ? nomTroupe(t.troupe) : 'Éclats'}</b>
        <small><span class="prog-categorie" data-categorie="${t.categorie || t.tiree}">${R.nomsDesCategories[t.categorie || t.tiree] || ''}</span>${t.genre === 'garanti' ? ' · garanti' : ''}</small>
      </span>
      <span class="prog-gain">+${t.fragments ? pluriel(t.fragments, 'fragment') : pluriel(t.eclats, 'éclat')}</span>
    </li>`).join('');
  const prets = resultat.evenements.filter((e) => e.type === 'ameliorationPossible');
  montrer(R.coffres[resultat.coffre].nom, `
    <ul class="prog-tirages">${lignes}</ul>
    ${prets.length ? `<p class="prog-annonce">Tu peux améliorer : ${prets.map((e) => `<button class="btn small prog-attend" data-ecran="fiche" data-arg="${e.troupe}">${nomTroupe(e.troupe)}</button>`).join(' ')}</p>` : ''}
    <div class="modal-actions">
      ${profil.coffres.length ? `<button class="btn primary" data-act="ouvrir" data-i="0">Coffre suivant (${profil.coffres.length})</button>` : ''}
      <button class="btn ${profil.coffres.length ? '' : 'primary'}" data-ecran="troupes">Mes troupes</button>
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
  ['Vitesse', (d) => d.speed],
  ['Nourriture ou or par 10 s', (d) => (d.gather ? d.gather.food * 10 : null)],
  ['Bois par 10 s', (d) => (d.gather ? d.gather.wood * 10 : null)],
  ['Chargement', (d) => d.carry || null],
  ['Vitesse de chantier', (d) => (d.gather ? (d.construction || 1) * 100 : null), ' %'],
  ['Contre la cavalerie', (d) => (d.bonus && d.bonus.cavalry) || null, '', '+'],
  ['Contre les bâtiments', (d) => (d.bonus && d.bonus.building) || null, '', '+'],
];

function ecranFiche(type, profil, message = '') {
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
    pied = `<p class="prog-annonce">${iconeSVG('cadenas', 14, 'inline')} Offerte en ${ligueEnPhrase(g.ligue)}, ou après ${g.parties} parties classées jouées
      (tu en as joué ${profil.parties - profil.abandonsPrecoces}).</p>`;
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
    <table class="scores prog-stats">
      <tr><th></th><th>${debloquee ? `Niveau ${t.niveau}` : 'Niveau 1'}</th>${ensuite ? `<th>Niveau ${t.niveau + 1}</th>` : ''}</tr>
      ${lignes}
    </table>
    ${debloquee && t.niveau > plafond ? `<p class="hint">En partie classée, elle joue au niveau ${plafond} tant que tu es en ${ligueEnPhrase(profil.ligue)}. Contre l’ordinateur en partie libre, elle joue à son niveau réel.</p>` : ''}
    ${pied}`, { retour: 'troupes' });
}

// --- Ouvrir un écran, agir ----------------------------------------------------------

const ECRANS = {
  ligues: (p) => ecranLigues(p),
  coffres: (p) => ecranCoffres(p),
  troupes: (p) => ecranTroupes(p),
  probas: (p, arg) => ecranProbas(arg),
  fiche: (p, arg) => ecranFiche(arg, p),
};

/** Ouvre un écran de la progression : « ligues », « coffres », « troupes », « probas » (un type de coffre), « fiche » (une troupe). */
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
  if (act === 'ouvrir') {
    const r = ouvrirCoffre(profil, Number(i) || 0, Math.random);
    if (r.erreur) return ecranCoffres(profil);
    retenir(r.profil);
    return ecranOuverture(r, r.profil);
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

/** Le peuple dont les écrans montrent les noms et les portraits. */
export function reglerPeuple(nouveau) { civ = nouveau || DEFAULT_CIV; }

/**
 * À appeler une fois : pose les écouteurs. Tout bouton qui porte `data-ecran`
 * (dans l'accueil, l'écran de fin ou les écrans eux-mêmes) ouvre cet écran.
 */
export function installerProgression({ quandLeProfilChange = () => {} } = {}) {
  surChangement = quandLeProfilChange;
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
  const lignes = [];
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
  const coffres = de('coffre');
  if (coffres.length) lignes.push(`<p>${coffres.length > 1 ? 'Coffres gagnés' : 'Coffre gagné'} : ${coffres.map((c) => `<span class="prog-coffre-nom" data-type="${c.coffre}">${R.coffres[c.coffre].nom}</span>`).join(', ')}</p>`);
  if (de('coffreDeBoisPlafonne').length) lignes.push(`<p class="hint">Les ${R.sources.bois.parJourAuPlus} coffres de bois du jour sont déjà gagnés.</p>`);
  const points = de('pointsDeBataille')[0];
  if (points) {
    lignes.push(`<p class="prog-fin-points"><span>Coffre d’argent</span>
      <span class="prog-barre"><span style="width:${part(points.total / points.pour)}"></span></span>
      <small>${points.total} / ${points.pour}</small></p>`);
  }
  const attente = profil.coffres.length;
  return `
    <div class="prog-fin">
      ${lignes.join('')}
      ${attente ? `<button class="btn small prog-attend" data-ecran="coffres">${iconeSVG('coffre', 16, 'inline')} Ouvrir ${attente > 1 ? `mes ${attente} coffres` : 'mon coffre'}</button>` : ''}
    </div>`;
}
