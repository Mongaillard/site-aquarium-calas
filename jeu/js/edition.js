// ---------------------------------------------------------------------------
// L'édition du jeu, son nom et son éditeur : ce que les magasins d'applications
// regardent en premier.
//
// Deux éditions :
//   « web »     — la page (et l'artefact) : tout s'y montre, y compris ce qui
//                 sert à essayer (porte-monnaie d'essai, articles « bientôt »,
//                 réglages de mise au point de la pause) ;
//   « magasin » — l'application de l'App Store et de Google Play. Une version
//                 soumise doit être finie : pas de bouton d'essai, pas
//                 d'article annoncé « bientôt », pas d'option de mise au point
//                 (Apple, articles 2.1, 2.2 et 2.3.1). Tant que les achats
//                 intégrés ne sont pas branchés, elle ne montre donc aucun
//                 prix en argent réel.
//
// L'édition « magasin » se reconnaît à l'enveloppe native (Capacitor pose
// `window.Capacitor`) ou à la marque que pose `npm run magasin` dans la page
// (`window.__EDITION`). Pour la voir dans un navigateur : `?edition=magasin`.
//
// AVANT DE SOUMETTRE : remplir EDITEUR, et changer NOM_DU_JEU — « Âge des
// Empires » est une marque de Microsoft, et un jeu officiel « Age of Empires
// Mobile » existe sur les deux magasins (Apple 4.1(c) et 5.2.1 ; Google,
// « Impersonation »). `npm run magasin` refuse de préparer l'application tant
// que ce n'est pas fait.
// ---------------------------------------------------------------------------

function lireEdition() {
  try {
    if (typeof globalThis === 'undefined') return 'web';
    if (globalThis.__EDITION === 'magasin' || globalThis.Capacitor) return 'magasin';
    if (globalThis.location && new URLSearchParams(globalThis.location.search).get('edition') === 'magasin') return 'magasin';
  } catch { /* pas de page : les essais sous Node */ }
  return 'web';
}

/** L'édition en cours : « web » ou « magasin ». */
export const EDITION = lireEdition();
/** Vrai dans l'application des magasins. */
export const EN_MAGASIN = EDITION === 'magasin';

/** Le nom du jeu : son titre, et le mot posé dessous sur le couvercle. À changer ici, dans index.html et dans manifest.webmanifest. */
export const NOM_DU_JEU = Object.freeze({ titre: 'Âge des Empires', suite: 'Mobile' });
/** Le nom en une ligne. */
export const nomComplet = () => `${NOM_DU_JEU.titre}${NOM_DU_JEU.suite ? ` ${NOM_DU_JEU.suite}` : ''}`;

/**
 * L'éditeur du jeu, tel qu'il doit paraître dans l'écran « Confidentialité »
 * et sur la page de la politique de confidentialité : son nom (ou sa raison
 * sociale), une adresse de courriel où lui écrire, et — pour une société —
 * ses mentions légales (forme, siège, numéro d'immatriculation).
 * VIDE : à remplir par l'éditeur avant toute soumission.
 */
export const EDITEUR = Object.freeze({ nom: '', courriel: '', mentions: '' });

/** Ce qui manque encore pour soumettre aux magasins : une liste de phrases, vide quand tout y est. */
export function manquesAvantMagasin(nom = NOM_DU_JEU, editeur = EDITEUR) {
  const manques = [];
  if (/empires?/i.test(`${nom.titre} ${nom.suite}`) && /[âa]ge/i.test(nom.titre)) manques.push('Le nom du jeu reprend une marque de Microsoft (« Age of Empires ») : il faut en changer.');
  if (!editeur.nom.trim()) manques.push('Le nom de l’éditeur est vide.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(editeur.courriel.trim())) manques.push('L’adresse de courriel de l’éditeur est vide ou illisible.');
  return manques;
}
