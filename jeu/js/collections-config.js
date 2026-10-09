// ---------------------------------------------------------------------------
// Les collections : ce qui se collectionne et se porte. Des autocollants (les
// emblèmes), des cadres, des bannières et des mots de titre — de l'apparence,
// jamais de puissance.
//
// Une collection est un thème. Elle a neuf autocollants (dix-huit pour une
// collection de saison : deux planches) et, à ses couleurs, un grade, une
// épithète, une bannière et un cadre. Les deux mots font un titre, et ils se
// mélangent d'une collection à l'autre : « Dompteur » + « du Banquet ».
//
// `source` dit d'où viennent ses pièces :
//   depart   : données à tous ;
//   coffres  : ses autocollants sortent des coffres et s'achètent en Éclats ;
//              le grade, la bannière, le cadre et l'épithète se gagnent en
//              avançant dans la collection (PROGRESSION.collections.paliers) ;
//   boutique : vendue entière, en Couronnes, contenu affiché
//              (PROGRESSION.collections.lots) ;
//   saison   : la route d'une saison (PROGRESSION.saisons) ; elle a en plus un
//              étendard et un grade de champion, pour les plus hautes ligues ;
//   ligues   : les cadeaux des promotions (PROGRESSION.ligues[…].promotion) ;
//   atelier  : ses pièces s'achètent une à une, en Éclats, chacune à son prix
//              (PROGRESSION.collections.atelier) — les teintures des troupes.
//
// Une teinture (`genre: 'teinture'`) habille les troupes du joueur d'une autre
// matière : `matiere` est sa clé dans js/teintures.js, `pastille` sa couleur
// dans les menus. Elle se porte comme le reste du blason, et ne change rien
// au combat.
//
// Les autocollants sont dessinés (par ChatGPT, d'après nos demandes) et rangés
// par planches de neuf, 3 × 3 : `rang` est la case, de gauche à droite et de
// haut en bas. Cadres et bannières sont tracés par js/blason.js d'après leurs
// réglages d'ici (forme, motif, couleurs).
//
// Ni prix, ni chances, ni seuils ici : ils sont avec les autres réglages, dans
// js/progression-config.js. Pour ajouter une collection : une planche dans
// assets/collections, une entrée ci-dessous, et son nom dans sw.js.
// ---------------------------------------------------------------------------

import { LANGUE, txt } from './langue.js';

/** Les sortes de pièces, dans l'ordre où le blason les montre. */
export const GENRES = ['embleme', 'cadre', 'banniere', 'grade', 'epithete', 'teinture'];
export const NOMS_DES_GENRES = { embleme: 'Autocollant', cadre: 'Cadre', banniere: 'Bannière', grade: 'Titre', epithete: 'Titre', teinture: 'Teinture' };

const C = 'commune', R = 'rare', E = 'epique';
const planche = (nom) => `assets/collections/${nom}.webp`;

// Les couleurs de la boîte (css/jeu.css) et celles des thèmes.
const ENCRE = '#17120e', PAPIER = '#fff4dc', BLANC = '#fffaf0', SABLE = '#ffe9b8';
const JAUNE = '#ffc93c', ROUGE = '#f0562d', BLEU = '#3aa0e8', MARINE = '#173a7a';
const PRE = '#7cc45a', ROSE = '#f29aa6', CYAN = '#5fd3e6', BOIS = '#d98b45', FER = '#9aa3ad';
const VIOLET = '#7a4fc4', JADE = '#3fbf7f', CITROUILLE = '#ff8a1f', NUIT = '#3b2a66', BRONZE = '#c9803a', CUIVRE = '#e2725b';
const GLACE = '#bfe6f5';

const DEFINITIONS = [
  {
    id: 'depart', nom: 'Le Départ', source: 'depart',
    grade: 'Villageois',
    banniere: { nom: 'Bannière de papier', fond: SABLE, trait: '#ffd98a', motif: 'bandes' },
    cadre: { nom: 'Cadre simple', forme: 'rond', couleur: BLANC, fond: PAPIER },
  },
  {
    id: 'bassecour', nom: 'La Basse-cour', source: 'coffres', planches: ['bassecour'],
    emblemes: [
      ['cochon-couronne', 'Cochon couronné', C],
      ['poule-guerriere', 'Poule guerrière', C],
      ['mouton-volant', 'Mouton volant', C],
      ['cerf-a-lunettes', 'Cerf à lunettes', C],
      ['ane-charge', 'Âne chargé d’or', C],
      ['chevre-du-rempart', 'Chèvre du rempart', R],
      ['canard-amiral', 'Canard amiral', R],
      ['cochon-chevalier', 'Cochon chevalier', R],
      ['roi-des-cochons', 'Le Roi des cochons', E],
    ],
    grade: 'Fermier', epithete: 'de la Basse-cour',
    banniere: { fond: PRE, trait: PAPIER, motif: 'pois' },
    cadre: { forme: 'fleur', dents: 8, couleur: ROSE, fond: PAPIER },
  },
  {
    id: 'maree', nom: 'La Grande Marée', source: 'coffres', planches: ['maree'],
    emblemes: [
      ['crabe-garde', 'Crabe garde du corps', C],
      ['poisson-bouffon', 'Poisson bouffon', C],
      ['meduse-lanterne', 'Méduse lanterne', C],
      ['bernard-proprietaire', 'Bernard propriétaire', C],
      ['etoile-en-vacances', 'Étoile en vacances', C],
      ['poulpe-forgeron', 'Poulpe forgeron', R],
      ['hippocampe-de-course', 'Hippocampe de course', R],
      ['tortue-forteresse', 'Tortue forteresse', R],
      ['requin-couronne', 'Requin couronné', E],
    ],
    grade: 'Amiral', epithete: 'des Sept Mers',
    banniere: { fond: BLEU, trait: MARINE, motif: 'vagues' },
    cadre: { forme: 'festons', dents: 14, couleur: CYAN, fond: BLANC },
  },
  {
    id: 'sables', nom: 'Les Sables', source: 'coffres', planches: ['sables'],
    emblemes: [
      ['dromadaire-a-lunettes', 'Dromadaire à lunettes', C],
      ['scarabee-du-soleil', 'Scarabée du soleil', C],
      ['cactus-boxeur', 'Cactus boxeur', C],
      ['momie-emmelee', 'Momie emmêlée', C],
      ['fennec-curieux', 'Fennec curieux', C],
      ['chat-pharaon', 'Chat pharaon', R],
      ['crocodile-a-bouee', 'Crocodile à bouée', R],
      ['scorpion-barbier', 'Scorpion barbier', R],
      ['sphinx-qui-baille', 'Sphinx qui bâille', E],
    ],
    grade: 'Pharaon', epithete: 'des Sables',
    banniere: { fond: JAUNE, trait: ROUGE, motif: 'rayons' },
    cadre: { forme: 'rayons', dents: 16, couleur: JAUNE, fond: SABLE },
  },
  {
    id: 'chantier', nom: 'Le Chantier', source: 'coffres', planches: ['chantier'],
    emblemes: [
      ['villageois-endormi', 'Villageois endormi', C],
      ['brouette-de-course', 'Brouette de course', C],
      ['seau-perce', 'Seau percé', C],
      ['navet-geant', 'Navet géant', C],
      ['casse-croute', 'Casse-croûte', C],
      ['arbre-tetu', 'L’Arbre têtu', R],
      ['pepite-geante', 'Pépite géante', R],
      ['maison-de-travers', 'Maison de travers', R],
      ['grand-architecte', 'Le Grand Architecte', E],
    ],
    grade: 'Contremaître', epithete: 'du Chantier',
    banniere: { fond: BOIS, trait: '#8a4b1c', motif: 'chevrons' },
    cadre: { forme: 'engrenage', dents: 10, couleur: FER, fond: PAPIER },
  },
  {
    id: 'gaffes', nom: 'Les Gaffes de guerre', source: 'coffres', planches: ['gaffes'],
    emblemes: [
      ['fleche-ventouse', 'Flèche ventouse', C],
      ['carte-a-l-envers', 'Carte à l’envers', C],
      ['bouclier-marmite', 'Bouclier marmite', C],
      ['lance-tordue', 'Lance tordue', C],
      ['drapeau-blanc', 'Drapeau blanc', C],
      ['belier-coince', 'Bélier coincé', R],
      ['chevalier-a-l-envers', 'Chevalier à l’envers', R],
      ['catapulte-a-cochon', 'Catapulte à cochon', R],
      ['general-boulette', 'Le Général Boulette', E],
    ],
    grade: 'Maladroit', epithete: 'des Gaffes',
    banniere: { fond: ROUGE, trait: PAPIER, motif: 'damier' },
    cadre: { forme: 'pointes', dents: 12, couleur: ROUGE, fond: BLANC },
  },
  {
    id: 'monstres', nom: 'Les Monstres', source: 'coffres', planches: ['monstres'],
    emblemes: [
      ['dragon-enrhume', 'Dragon enrhumé', C],
      ['cyclope-myope', 'Cyclope myope', C],
      ['kraken-tricoteur', 'Kraken tricoteur', C],
      ['griffon-facteur', 'Griffon facteur', C],
      ['minotaure-perdu', 'Minotaure perdu', C],
      ['sirene-rockeuse', 'Sirène rockeuse', R],
      ['phenix-frileux', 'Phénix frileux', R],
      ['sphinx-aux-enigmes', 'Sphinx aux énigmes', R],
      ['hydre-aux-trois-glaces', 'L’Hydre aux trois glaces', E],
    ],
    grade: 'Dompteur', epithete: 'des Monstres',
    banniere: { fond: VIOLET, trait: JADE, motif: 'ecailles' },
    cadre: { forme: 'pointes', dents: 7, couleur: JADE, fond: PAPIER },
  },
  {
    id: 'banquet', nom: 'Le Banquet', source: 'coffres', planches: ['banquet'],
    emblemes: [
      ['jambon-royal', 'Jambon royal', C],
      ['fromage-fortifie', 'Fromage fortifié', C],
      ['tarte-aux-baies', 'Tarte aux baies', C],
      ['poisson-evade', 'Poisson évadé', C],
      ['pain-bouclier', 'Pain bouclier', C],
      ['marmite-magique', 'Marmite magique', R],
      ['gateau-chateau', 'Gâteau château', R],
      ['chef-moustachu', 'Chef moustachu', R],
      ['grand-festin', 'Le Grand Festin', E],
    ],
    grade: 'Gourmand', epithete: 'du Banquet',
    banniere: { fond: BLANC, trait: ROUGE, motif: 'damier' },
    cadre: { forme: 'festons', dents: 20, couleur: BLANC, fond: SABLE },
  },
  {
    id: 'cour', nom: 'La Cour', source: 'boutique', planches: ['cour'],
    emblemes: [
      ['roi-grenouille', 'Roi grenouille', C],
      ['couronne-trop-grande', 'Couronne trop grande', C],
      ['bouffon-jongleur', 'Bouffon jongleur', C],
      ['trompette-nouee', 'Trompette nouée', C],
      ['trone-de-sable', 'Trône de sable', C],
      ['chat-du-trone', 'Le Chat du trône', R],
      ['reine-des-abeilles', 'Reine des abeilles', R],
      ['empereur-manchot', 'Empereur manchot', R],
      ['portrait-officiel', 'Le Portrait officiel', E],
    ],
    grade: 'Bouffon', epithete: 'de la Cour',
    banniere: { fond: MARINE, trait: JAUNE, motif: 'etoiles' },
    cadre: { forme: 'lauriers', couleur: JAUNE, fond: MARINE },
  },
  {
    id: 'ligues', nom: 'Les Ligues', source: 'ligues',
    pieces: [
      { id: 'recrue', genre: 'grade', nom: 'Recrue' },
      { id: 'bronze', genre: 'banniere', nom: 'Bannière de Bronze', fond: BRONZE, trait: '#8a4b1c', motif: 'bandes' },
      { id: 'fer', genre: 'banniere', nom: 'Bannière de Fer', fond: FER, trait: '#4a5560', motif: 'chevrons' },
      { id: 'capitaine', genre: 'grade', nom: 'Capitaine' },
      { id: 'or', genre: 'cadre', nom: 'Cadre d’Or', forme: 'rayons', dents: 24, couleur: JAUNE, fond: BLANC },
      { id: 'stratege', genre: 'grade', nom: 'Stratège' },
      { id: 'orichalque', genre: 'cadre', nom: 'Cadre d’Orichalque', forme: 'engrenage', dents: 14, couleur: CUIVRE, fond: SABLE },
      { id: 'empereur', genre: 'grade', nom: 'Empereur' },
      { id: 'legende', genre: 'grade', nom: 'Légende' },
      { id: 'legendes', genre: 'cadre', nom: 'Cadre des Légendes', forme: 'etoile', dents: 10, couleur: VIOLET, fond: JAUNE },
    ],
  },
  {
    id: 'teintures', nom: 'Les Teintures', source: 'atelier',
    pieces: [
      { id: 'argent', genre: 'teinture', nom: 'Teinture d’argent', matiere: 'argent', pastille: '#d5dae2' },
      { id: 'jade', genre: 'teinture', nom: 'Teinture de jade', matiere: 'jade', pastille: '#3fbf7f' },
      { id: 'obsidienne', genre: 'teinture', nom: 'Teinture d’obsidienne', matiere: 'obsidienne', pastille: '#3a3340' },
      { id: 'amethyste', genre: 'teinture', nom: 'Teinture d’améthyste', matiere: 'amethyste', pastille: '#9a5fd6' },
    ],
  },
  {
    id: 'citrouilles', nom: 'La Nuit des Citrouilles', source: 'saison', planches: ['citrouilles', 'citrouilles2'],
    emblemes: [
      ['citrouille-casquee', 'Citrouille casquée', C],
      ['fantome-du-villageois', 'Fantôme du villageois', C],
      ['chauve-souris-messagere', 'Chauve-souris messagère', C],
      ['chat-de-minuit', 'Chat de minuit', C],
      ['epouvantail-lancier', 'Épouvantail lancier', C],
      ['coffre-a-bonbons', 'Coffre à bonbons', C],
      ['araignee-au-hamac', 'Araignée au hamac', R],
      ['squelette-archer', 'Squelette archer', R],
      ['chaudron-gourmand', 'Chaudron gourmand', R],
      ['loup-garou-frileux', 'Loup-garou frileux', R],
      ['sorciere-au-belier', 'Sorcière au bélier', R],
      ['vampire-a-la-tomate', 'Vampire à la tomate', R],
      ['citrouille-catapultee', 'Citrouille catapultée', R],
      ['hibou-veilleur', 'Hibou veilleur', R],
      ['lanterne-navet', 'Lanterne navet', R],
      ['hydre-fantome', 'L’Hydre fantôme', E],
      ['pharaon-citrouille', 'Le Pharaon citrouille', E],
      ['reine-de-la-nuit', 'La Reine de la Nuit', E],
    ],
    grade: 'Croque-citrouille', epithete: 'des Citrouilles',
    banniere: { fond: NUIT, trait: CITROUILLE, motif: 'etoiles' },
    cadre: { forme: 'fleur', dents: 10, couleur: CITROUILLE, fond: NUIT },
    etendard: { nom: 'Étendard de la Nuit', fond: CITROUILLE, trait: ENCRE, motif: 'damier' },
    champion: 'Épouvantail en chef',
  },
  {
    id: 'tournoi', nom: 'Le Grand Tournoi', source: 'saison', planches: ['tournoi', 'tournoi2'],
    emblemes: [
      ['chevalier-en-pantoufles', 'Chevalier en pantoufles', C],
      ['lance-en-mousse', 'Lance en mousse', C],
      ['cheval-de-bois', 'Cheval de bois', C],
      ['ecuyer-deborde', 'Écuyer débordé', C],
      ['heaume-a-plume', 'Heaume à plume', C],
      ['bouclier-troue', 'Bouclier troué', C],
      ['jouteur-desarconne', 'Jouteur désarçonné', R],
      ['mouchoir-geant', 'Mouchoir géant', R],
      ['heraut-essouffle', 'Héraut essoufflé', R],
      ['cochon-de-joute', 'Cochon de joute', R],
      ['tribune-en-folie', 'Tribune en folie', R],
      ['trophee-trop-lourd', 'Trophée trop lourd', R],
      ['arbitre-au-sablier', 'Arbitre au sablier', R],
      ['duel-de-dromadaires', 'Duel de dromadaires', R],
      ['triton-jouteur', 'Triton jouteur', R],
      ['champion-masque', 'Le Champion masqué', E],
      ['coupe-d-orichalque', 'La Coupe d’Orichalque', E],
      ['roi-du-tournoi', 'Le Roi du Tournoi', E],
    ],
    grade: 'Jouteur', epithete: 'du Tournoi',
    banniere: { fond: ROUGE, trait: JAUNE, motif: 'chevrons' },
    cadre: { forme: 'creneaux', dents: 12, couleur: BLEU, fond: BLANC },
    etendard: { nom: 'Étendard du Tournoi', fond: MARINE, trait: JAUNE, motif: 'bandes' },
    champion: 'Roi de la joute',
  },
  {
    id: 'froid', nom: 'Le Grand Froid', source: 'saison', planches: ['froid', 'froid2'],
    emblemes: [
      ['bonhomme-de-garde', 'Bonhomme de garde', C],
      ['manchot-glisseur', 'Manchot glisseur', C],
      ['villageois-emmitoufle', 'Villageois emmitouflé', C],
      ['chocolat-chaud', 'Chocolat chaud', C],
      ['luge-de-combat', 'Luge de combat', C],
      ['moufles-geantes', 'Moufles géantes', C],
      ['sapin-de-caserne', 'Sapin de caserne', R],
      ['dromadaire-frileux', 'Dromadaire frileux', R],
      ['triton-patineur', 'Triton patineur', R],
      ['ours-calin', 'Ours câlin', R],
      ['sphinx-en-glacon', 'Sphinx en glaçon', R],
      ['yeti-timide', 'Yéti timide', R],
      ['renne-eclaireur', 'Renne éclaireur', R],
      ['igloo-fortifie', 'Igloo fortifié', R],
      ['treve-du-feu', 'La Trêve du feu', R],
      ['hydre-enrhumee', 'L’Hydre enrhumée', E],
      ['roi-des-neiges', 'Le Roi des Neiges', E],
      ['grand-traineau', 'Le Grand Traîneau', E],
    ],
    grade: 'Frileux', epithete: 'du Grand Froid',
    banniere: { fond: GLACE, trait: BLANC, motif: 'pois' },
    cadre: { forme: 'pointes', dents: 8, couleur: BLANC, fond: GLACE },
    etendard: { nom: 'Étendard du Grand Froid', fond: MARINE, trait: BLANC, motif: 'etoiles' },
    champion: 'Maître des neiges',
  },
];

/** Les pièces d'une définition, dans l'ordre : autocollants, grade, bannière, cadre, épithète, puis celles d'une saison. */
function piecesDe(d) {
  const pieces = [];
  const ajouter = (id, genre, nom, rarete, reste = {}) => pieces.push({ id: `${d.id}.${id}`, genre, nom, rarete, collection: d.id, ...reste });
  (d.emblemes || []).forEach(([id, nom, rarete], i) => ajouter(id, 'embleme', nom, rarete, { planche: planche(d.planches[Math.floor(i / 9)]), rang: i % 9 }));
  for (const p of d.pieces || []) { const { id, genre, nom, ...reste } = p; ajouter(id, genre, nom, R, reste); }
  // (« Bannière de la Basse-cour » : l'épithète sert de complément au nom.)
  const de = d.epithete ? ` ${d.epithete}` : '';
  if (d.grade) ajouter('grade', 'grade', d.grade, R);
  if (d.banniere) { const { nom, ...reste } = d.banniere; ajouter('banniere', 'banniere', nom || `Bannière${de}`, R, reste); }
  if (d.cadre) { const { nom, ...reste } = d.cadre; ajouter('cadre', 'cadre', nom || `Cadre${de}`, E, reste); }
  if (d.epithete) ajouter('epithete', 'epithete', d.epithete, E);
  if (d.etendard) { const { nom, ...reste } = d.etendard; ajouter('etendard', 'banniere', nom, E, reste); }
  if (d.champion) ajouter('champion', 'grade', d.champion, E);
  return pieces;
}

function figer(objet) {
  for (const valeur of Object.values(objet)) {
    if (valeur && typeof valeur === 'object' && !Object.isFrozen(valeur)) figer(valeur);
  }
  return Object.freeze(objet);
}

const toutes = {};
const collections = DEFINITIONS.map((d) => {
  const pieces = piecesDe(d);
  for (const p of pieces) toutes[p.id] = p;
  return {
    id: d.id, nom: d.nom, source: d.source,
    planches: (d.planches || []).map(planche),
    pieces: pieces.map((p) => p.id),
    emblemes: pieces.filter((p) => p.genre === 'embleme').map((p) => p.id),
  };
});

// --- La langue -----------------------------------------------------------------
// Les noms ci-dessus sont écrits en français, la langue source. Dans une autre
// langue, ils sont remplacés ici, une fois, par leur traduction (js/langue.js)
// — avant que les tables soient figées ; en français, rien ne bouge. Les
// identifiants (des collections, des pièces, des genres) ne se traduisent pas :
// les sauvegardes les contiennent.

/**
 * Passe sur chaque texte de ces tables : `visite(objet, champ)`. Sert à
 * traduire (ci-dessous) et à recenser ce qui est à traduire
 * (outils/langues.mjs) : le nom des genres, des collections et des pièces —
 * « Bannière de la Basse-cour » est un nom entier, pas un mot suivi d'une
 * épithète.
 */
export function textesATraduire(visite) {
  for (const genre of Object.keys(NOMS_DES_GENRES)) visite(NOMS_DES_GENRES, genre);
  for (const c of collections) visite(c, 'nom');
  for (const p of Object.values(toutes)) visite(p, 'nom');
}

if (LANGUE !== 'fr') textesATraduire((objet, champ) => { objet[champ] = txt(objet[champ]); });

/** Toutes les pièces du jeu, par identifiant (« bassecour.cochon-couronne ») : `genre`, `nom`, `rarete`, `collection`, et de quoi les dessiner. */
export const PIECES = figer(toutes);
/** Les collections, dans l'ordre de l'album : `id`, `nom`, `source`, `planches`, `pieces` et `emblemes` (des identifiants). */
export const COLLECTIONS = figer(collections);

const parId = {};
for (const c of COLLECTIONS) parId[c.id] = c;
/** Une collection par son identifiant, ou null. */
export const collection = (id) => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(parId, id) ? parId[id] : null);
/** Une pièce par son identifiant, ou null. */
export const piece = (id) => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(PIECES, id) ? PIECES[id] : null);
/** L'identifiant de la pièce d'une collection qui porte ce nom court (« grade », « cadre », « etendard »…), ou null. */
export const pieceDe = (collectionId, court) => (piece(`${collectionId}.${court}`) ? `${collectionId}.${court}` : null);

/**
 * Le titre que font un grade et une épithète (leurs noms) : « Dompteur du Banquet ». Sans épithète : le grade seul.
 * L'ordre des deux mots est affaire de langue : le français met le grade d'abord ; une autre langue les range à sa
 * façon, par sa traduction de « {grade} {épithète} » (l'anglais dit « Banquet Tamer »).
 */
export function composerTitre(grade, epithete) {
  if (!epithete) return grade;
  return txt('{grade} {épithète}').replace('{grade}', () => grade).replace('{épithète}', () => epithete);
}

/** Ce que tout joueur porte au départ : son blason avant d'avoir rien gagné. */
export const BLASON_DE_DEPART = Object.freeze({ embleme: null, cadre: 'depart.cadre', banniere: 'depart.banniere', grade: 'depart.grade', epithete: null, teinture: null });

/** La matière (clé de js/teintures.js) de la teinture que porte ce blason, ou null : les troupes telles qu'elles sont peintes. */
export function matiereDe(blason) {
  const p = blason ? piece(blason.teinture) : null;
  return p && p.genre === 'teinture' ? p.matiere : null;
}
