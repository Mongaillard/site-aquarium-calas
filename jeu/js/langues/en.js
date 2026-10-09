// English. Le dictionnaire est fait de cahiers, un par partie du jeu, pour
// qu'ils se relisent : js/langues/en/*.js. Chaque cahier couvre ses fichiers
// en entier ; une phrase présente dans deux cahiers y a la même traduction
// (test/langues.test.js).
import reglages from './en/reglages.js';
import accueil from './en/accueil.js';
import fiches from './en/fiches.js';
import ecran from './en/ecran.js';
import progression from './en/progression.js';

/** Les cahiers, par nom (pour les essais). */
export const CAHIERS = { reglages, accueil, fiches, ecran, progression };

export default Object.assign({}, ...Object.values(CAHIERS));
