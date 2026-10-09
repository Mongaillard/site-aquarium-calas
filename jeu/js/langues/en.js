// English. Le dictionnaire est fait de cahiers, un par partie du jeu, pour
// qu'ils se relisent : js/langues/en/*.js. Une phrase y a une seule
// traduction ; la même clé dans deux cahiers est une erreur (test/langues.test.js).
import reglages from './en/reglages.js';
import accueil from './en/accueil.js';

/** Les cahiers, par nom (pour les essais). */
export const CAHIERS = { reglages, accueil };

export default Object.assign({}, ...Object.values(CAHIERS));
