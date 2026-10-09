// Italiano. Le dictionnaire est fait de cahiers, un par partie du jeu, pour
// qu'ils se relisent : js/langues/it/*.js. Chaque cahier couvre ses fichiers
// en entier ; une phrase présente dans deux cahiers y a la même traduction
// (test/langues.test.js).
import reglages from './it/reglages.js';
import accueil from './it/accueil.js';
import fiches from './it/fiches.js';
import ecran from './it/ecran.js';
import progression from './it/progression.js';
import collections from './it/collections.js';
import partie from './it/partie.js';

/** Les cahiers, par nom (pour les essais). */
export const CAHIERS = { reglages, accueil, fiches, ecran, progression, collections, partie };

export default Object.assign({}, ...Object.values(CAHIERS));
