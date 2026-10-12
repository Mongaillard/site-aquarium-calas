// Deutsch. Le dictionnaire est fait de cahiers, un par partie du jeu, pour
// qu'ils se relisent : js/langues/de/*.js. Chaque cahier couvre ses fichiers
// en entier ; une phrase présente dans deux cahiers y a la même traduction
// (test/langues.test.js).
import reglages from './de/reglages.js';
import accueil from './de/accueil.js';
import fiches from './de/fiches.js';
import ecran from './de/ecran.js';
import progression from './de/progression.js';
import collections from './de/collections.js';
import partie from './de/partie.js';

/** Les cahiers, par nom (pour les essais). */
export const CAHIERS = { reglages, accueil, fiches, ecran, progression, collections, partie };

export default Object.assign({}, ...Object.values(CAHIERS));
