// Português (Brasil). Le dictionnaire est fait de cahiers, un par partie du jeu, pour
// qu'ils se relisent : js/langues/pt/*.js. Chaque cahier couvre ses fichiers
// en entier ; une phrase présente dans deux cahiers y a la même traduction
// (test/langues.test.js).
import reglages from './pt/reglages.js';
import accueil from './pt/accueil.js';
import fiches from './pt/fiches.js';
import ecran from './pt/ecran.js';
import progression from './pt/progression.js';
import collections from './pt/collections.js';
import partie from './pt/partie.js';

/** Les cahiers, par nom (pour les essais). */
export const CAHIERS = { reglages, accueil, fiches, ecran, progression, collections, partie };

export default Object.assign({}, ...Object.values(CAHIERS));
