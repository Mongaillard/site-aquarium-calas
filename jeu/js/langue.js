// ---------------------------------------------------------------------------
// La langue du jeu.
//
// Le jeu est écrit en français : le français EST la source. Tout texte montré
// au joueur passe par `txt`, une étiquette de gabarit :
//
//     txt`Il te manque ${n} pour cet achat.`        txt('Jouer')
//
// En français, `txt` rend le texte tel qu'il est écrit — rien ne change, à
// la lettre près. Dans une autre langue, la phrase est cherchée dans le
// dictionnaire de cette langue (js/langues/en.js, …) sous sa forme française,
// ses trous notés {0}, {1}… :
//
//     'Il te manque {0} pour cet achat.': 'You are {0} short for this purchase.'
//
// La traduction peut déplacer les trous, ou en laisser un de côté. Une phrase
// sans traduction reste en français : mieux vaut une phrase française qu'un
// trou. `npm run langues` liste ce qui manque à chaque dictionnaire.
//
// Les mots qui s'accordent avec un nombre passent par `accord` ; les nombres
// et les dates s'écrivent selon LOCALE.
//
// La langue se lit une fois, au chargement : changer de langue recharge la
// page (bien des textes sont posés dès le chargement des modules). Ordre : la
// marque `globalThis.__LANGUE` (les essais, l'enveloppe native), `?langue=en`
// dans l'adresse, le choix du joueur (CLE_LANGUE), puis la langue de
// l'appareil si le jeu la parle en entier ; à défaut, le français.
// ---------------------------------------------------------------------------

/**
 * Les langues du jeu : leur code, leur nom dans leur propre langue, le format
 * de leurs nombres et de leurs dates. `prete` : entièrement traduite — elle
 * est alors proposée d'office à l'appareil qui la parle.
 */
export const LANGUES = Object.freeze([
  Object.freeze({ id: 'fr', nom: 'Français', locale: 'fr-FR', prete: true }),
  Object.freeze({ id: 'en', nom: 'English', locale: 'en-US', prete: false }),
]);

/** Où le choix du joueur est rangé (stockage du navigateur). */
export const CLE_LANGUE = 'aem.langue';

const fiche = (id) => LANGUES.find((l) => l.id === id) || null;

function lireLangue() {
  try {
    if (typeof globalThis === 'undefined') return 'fr';
    if (fiche(globalThis.__LANGUE)) return globalThis.__LANGUE;
    const adresse = globalThis.location && globalThis.location.search ? new URLSearchParams(globalThis.location.search).get('langue') : null;
    if (fiche(adresse)) return adresse;
    const choisie = globalThis.localStorage ? globalThis.localStorage.getItem(CLE_LANGUE) : null;
    if (fiche(choisie)) return choisie;
    // Sans choix : la langue de l'appareil, si le jeu la parle en entier ; sinon l'anglais, s'il est prêt.
    // (Dans une page seulement : sous Node, les essais restent en français.)
    if (typeof window !== 'undefined' && window.navigator) {
      const appareil = window.navigator.languages && window.navigator.languages.length ? window.navigator.languages : [window.navigator.language];
      for (const code of appareil) {
        const l = fiche(String(code || '').slice(0, 2).toLowerCase());
        if (l && l.prete) return l.id;
      }
      if (fiche('en') && fiche('en').prete) return 'en';
    }
  } catch { /* stockage fermé, adresse illisible : le français */ }
  return 'fr';
}

/** La langue en cours : « fr », « en »… */
export const LANGUE = lireLangue();
/** Le format des nombres et des dates de cette langue (« fr-FR », « en-US »…). */
export const LOCALE = fiche(LANGUE).locale;

// Le dictionnaire de la langue : chargé avant tout le reste (les modules qui
// importent celui-ci attendent), pour que `txt` réponde dès leur chargement.
let dictionnaire = null;
if (LANGUE !== 'fr') {
  try { dictionnaire = (await import(`./langues/${LANGUE}.js`)).default || null; } catch { dictionnaire = null; }
}

const possede = (objet, cle) => Object.prototype.hasOwnProperty.call(objet, cle);
/** Les phrases demandées qui n'ont pas de traduction (pour la mise au point). */
export const SANS_TRADUCTION = new Set();

/** La phrase française d'un gabarit, ses trous notés {0}, {1}… : la clé du dictionnaire. */
export function cleDe(morceaux) {
  let cle = morceaux[0];
  for (let i = 1; i < morceaux.length; i++) cle += `{${i - 1}}${morceaux[i]}`;
  return cle;
}

function traduction(cle) {
  if (!dictionnaire) return null;
  if (possede(dictionnaire, cle) && typeof dictionnaire[cle] === 'string') return dictionnaire[cle];
  SANS_TRADUCTION.add(cle);
  return null;
}

/**
 * Un texte pour le joueur, dans sa langue. S'emploie en étiquette de gabarit
 * (txt`… ${valeur} …`) ou sur une chaîne (txt('Jouer')). En français : le
 * texte tel quel.
 */
export function txt(morceaux, ...valeurs) {
  if (typeof morceaux === 'string') {
    const traduite = traduction(morceaux);
    return traduite === null ? morceaux : traduite;
  }
  const traduite = dictionnaire ? traduction(cleDe(morceaux)) : null;
  if (traduite === null) {
    let texte = morceaux[0];
    for (let i = 1; i < morceaux.length; i++) texte += String(valeurs[i - 1]) + morceaux[i];
    return texte;
  }
  return traduite.replace(/\{(\d+)\}/g, (trou, i) => (Number(i) < valeurs.length ? String(valeurs[Number(i)]) : trou));
}

const regles = (() => { try { return new Intl.PluralRules(LOCALE); } catch { return null; } })();

/**
 * Le mot accordé avec un nombre : accord(3, 'Couronne', 'Couronnes') →
 * « Couronnes ». Dans une autre langue, le dictionnaire donne les formes sous
 * la clé « Couronne|Couronnes » : { one: 'Crown', other: 'Crowns' } (les
 * catégories sont celles d'Intl.PluralRules ; « other » sert de secours).
 */
export function accord(n, un, plusieurs = `${un}s`) {
  if (dictionnaire) {
    const cle = `${un}|${plusieurs}`;
    const formes = possede(dictionnaire, cle) ? dictionnaire[cle] : null;
    if (formes && typeof formes === 'object') {
      const categorie = regles ? regles.select(Math.abs(Number(n)) || 0) : (Number(n) === 1 ? 'one' : 'other');
      if (typeof formes[categorie] === 'string') return formes[categorie];
      if (typeof formes.other === 'string') return formes.other;
    }
    SANS_TRADUCTION.add(cle);
  }
  return n > 1 ? plusieurs : un;
}

/** Un nombre écrit à la manière de la langue (« 1 200 », « 1,200 »). */
export const nombreLocal = (v, options) => Number(v).toLocaleString(LOCALE, options);

/**
 * Traduit ce que la page porte en dur : tout élément marqué `data-txt` (son
 * contenu est la phrase française), et les attributs nommés par
 * `data-txt-attr` (« aria-label », « title »…, séparés par des espaces). En
 * français, ne touche à rien d'autre qu'à la langue déclarée de la page.
 */
export function traduireLaPage(racine = typeof document === 'undefined' ? null : document) {
  if (!racine || !racine.querySelectorAll) return;
  if (racine.documentElement) racine.documentElement.lang = LANGUE;
  if (!dictionnaire) return;
  const ramassee = (texte) => String(texte).replace(/\s+/g, ' ').trim();
  for (const noeud of racine.querySelectorAll('[data-txt]')) {
    const cle = ramassee(noeud.innerHTML);
    const traduite = traduction(cle);
    if (traduite !== null) noeud.innerHTML = traduite;
  }
  for (const noeud of racine.querySelectorAll('[data-txt-attr]')) {
    for (const attribut of noeud.dataset.txtAttr.split(/\s+/).filter(Boolean)) {
      const traduite = traduction(ramassee(noeud.getAttribute(attribut) || ''));
      if (traduite !== null) noeud.setAttribute(attribut, traduite);
    }
  }
}

/**
 * Retient la langue choisie par le joueur. Renvoie false si elle n'existe pas
 * ou si l'appareil refuse d'écrire. Elle s'applique au prochain chargement de
 * la page : à l'appelant de recharger.
 */
export function choisirLangue(id) {
  if (!fiche(id)) return false;
  try { globalThis.localStorage.setItem(CLE_LANGUE, id); return true; } catch { return false; }
}
