// ---------------------------------------------------------------------------
// Les rivaux : l'ordinateur d'en face a un nom, un titre et un caractère.
//
// En partie classée, chaque ligue a son rival (état des lieux du 12/10/2026).
// Ce sont des ordinateurs, et le jeu le dit : pas de faux joueurs. Un rival,
// c'est un nom, une phrase d'avant-partie et un CARACTÈRE — une façon de
// jouer faite de valeurs que l'ordinateur connaît déjà (js/ai.js) : ses
// troupes, la taille de ses vagues, le temps qu'il laisse entre deux.
//
// Sa force, elle, ne change pas : elle vient de la ligue (R.echelle dans
// js/progression-config.js). Une partie sans rival — libre, par équipes,
// guidée — se joue comme avant, au geste près.
// ---------------------------------------------------------------------------

import { txt } from './langue.js';

/**
 * Les caractères. `vagues` : par combien se multiplient la première vague (`depart`), ce qu'elle grossit à
 * chaque fois (`pas`) et l'attente entre deux (`delai`). `troupes` : ce qu'il forme, âge par âge. Dans un
 * format court qui impose sa liste (l'Escarmouche) : `troupesCourtes`, les bâtiments qu'il y ajoute
 * (`batimentsCourts`) et les secondes qu'il laisse passer avant sa première vague (`patienceCourte`). Dans les formats
 * longs : le bâtiment militaire qu'il veut d'abord (`prefere`).
 */
export const CARACTERES = {
  pillard: {
    id: 'pillard', nom: 'le Pillard', trait: 'Il attaque tôt et souvent, par petites bandes.',
    vagues: { depart: 0.6, pas: 0.5, delai: 0.6 },
    troupes: [['militia'], ['militia', 'spearman', 'militia', 'archer'], ['champion', 'knight', 'militia', 'crossbowman', 'champion', 'ram']],
    troupesCourtes: ['militia', 'militia', 'spearman'], batimentsCourts: [], patienceCourte: 0, prefere: null,
  },
  batisseur: {
    id: 'batisseur', nom: 'le Bâtisseur', trait: 'Il prend son temps, puis attaque en force.',
    vagues: { depart: 1.6, pas: 1.5, delai: 1.4 },
    troupes: [['militia'], ['spearman', 'archer', 'spearman', 'archer'], ['crossbowman', 'champion', 'crossbowman', 'catapult', 'spearman', 'priest', 'hydra']],
    troupesCourtes: ['spearman', 'archer', 'archer'], batimentsCourts: ['archery'], patienceCourte: 90, prefere: 'archery',
  },
  cavalier: {
    id: 'cavalier', nom: 'le Cavalier', trait: 'Il mise tout sur la cavalerie.',
    vagues: { depart: 0.8, pas: 1, delai: 0.8 },
    troupes: [['militia'], ['scout', 'archer', 'scout', 'spearman'], ['knight', 'horseArcher', 'knight', 'scout', 'knight', 'ram']],
    troupesCourtes: ['scout', 'scout', 'spearman'], batimentsCourts: ['stable'], patienceCourte: 0, prefere: 'stable',
  },
};

/** Les dix rivaux, dans l'ordre des ligues : le premier attend en ligue de Bois. */
export const RIVAUX = [
  { id: 'gontran', nom: 'Gontran le Prudent', caractere: 'batisseur', phrase: 'Doucement. On a tout notre temps, non ?' },
  { id: 'barbe-salee', nom: 'Barbe-Salée', caractere: 'pillard', phrase: 'Tes ouvriers ont l’air de s’ennuyer. J’arrive.' },
  { id: 'nefer', nom: 'Néfer la Rapide', caractere: 'cavalier', phrase: 'Mes montures courent plus vite que tes flèches.' },
  { id: 'truelle', nom: 'Maître Truelle', caractere: 'batisseur', phrase: 'Une pierre après l’autre. Et ensuite, toi.' },
  { id: 'ecume', nom: 'La Capitaine Écume', caractere: 'pillard', phrase: 'Je passe en coup de vent. Souvent.' },
  { id: 'ramses', nom: 'Ramsès le Pressé', caractere: 'cavalier', phrase: 'Pas le temps de discuter : au galop !' },
  { id: 'rempart', nom: 'Dame Rempart', caractere: 'batisseur', phrase: 'Frappe la première, si tu veux. Je frapperai la dernière.' },
  { id: 'amiral', nom: 'L’Amiral des Sept Mers', caractere: 'pillard', phrase: 'Sept mers pillées. Il me manquait ta plage.' },
  { id: 'pharaon', nom: 'Le Pharaon des Sables', caractere: 'cavalier', phrase: 'Le désert avance toujours. Moi aussi.' },
  { id: 'empereur', nom: 'L’Empereur sans Sommeil', caractere: 'batisseur', phrase: 'J’ai tout mon temps : je ne dors jamais.' },
];

const PAR_ID = new Map(RIVAUX.map((r) => [r.id, r]));

/** Les textes des rivaux et des caractères, pour les dictionnaires (outils/langues.mjs). */
export function textesATraduire(visite) {
  for (const rival of RIVAUX) { visite(rival, 'nom'); visite(rival, 'phrase'); }
  for (const caractere of Object.values(CARACTERES)) { visite(caractere, 'nom'); visite(caractere, 'trait'); }
}

/** Le rival d'une ligue (1 à 10), tel qu'il est écrit : son identifiant sert aux règles, ses textes se traduisent à l'affichage. */
export function rivalDeLaLigue(ligue) {
  return RIVAUX[Math.max(1, Math.min(RIVAUX.length, Math.round(ligue) || 1)) - 1];
}

export const rivalConnu = (id) => PAR_ID.has(id);

/** Le caractère d'un rival (rien pour un identifiant inconnu) : ce que l'ordinateur lit pour jouer (js/ai.js). */
export function caractereDuRival(id) {
  const rival = PAR_ID.get(id);
  return rival ? CARACTERES[rival.caractere] : null;
}

/** Un rival dans la langue du joueur : `{ id, nom, caractere, trait, phrase }`. Rien pour un identifiant inconnu. */
export function ficheDuRival(id) {
  const rival = PAR_ID.get(id);
  if (!rival) return null;
  const c = CARACTERES[rival.caractere];
  return { id: rival.id, nom: txt(rival.nom), caractere: txt(c.nom), trait: txt(c.trait), phrase: txt(rival.phrase) };
}
