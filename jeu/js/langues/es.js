// Español. Le dictionnaire est fait de cahiers, un par partie du jeu, pour
// qu'ils se relisent : js/langues/es/*.js. Chaque cahier couvre ses fichiers
// en entier ; une phrase présente dans deux cahiers y a la même traduction
// (test/langues.test.js).
import reglages from './es/reglages.js';
import accueil from './es/accueil.js';
import fiches from './es/fiches.js';
import ecran from './es/ecran.js';
import progression from './es/progression.js';
import collections from './es/collections.js';
import partie from './es/partie.js';

/** Les cahiers, par nom (pour les essais). */
export const CAHIERS = { reglages, accueil, fiches, ecran, progression, collections, partie };

export default Object.assign({}, ...Object.values(CAHIERS));
