// ---------------------------------------------------------------------------
// Sprites de personnage.
//
// Certaines unités ont une vraie illustration plutôt qu'un dessin au code. Tout
// type sans sprite garde son rendu procédural, et le jeu reste jouable si une
// image ne charge pas.
//
// Les huit cases d'un atlas tournent en partant du SUD (le personnage fait face
// au joueur) puis par l'EST. Sur une illustration, le sens se lit à la cape —
// elle est toujours dans le dos.
// ---------------------------------------------------------------------------

/**
 * `natif` dit de quelle couleur d'équipe est l'illustration d'origine ; l'autre
 * camp est recoloré au chargement. `ancreY` est la ligne des pieds dans la
 * case, et `pixel` coupe le lissage : agrandir du pixel art en l'interpolant le
 * transforme en bouillie.
 */
// Fenêtre ouverte à 190° : les tuiles atlantes sont bleu pétrole (195 à 205°),
// à cheval sur l'ancienne borne de 200° — chez l'adversaire, un toit sortait
// moitié rouge, moitié bleu. Les cristaux et l'eau (180 à 187°) restent
// turquoise ; les bleus solariens (226°) étaient déjà dedans.
const batiment = (src, cellW, cellH, largeurMonde) => ({
  src, cellW, cellH, cases: 1, images: 1, largeurMonde, sol: 0.93, natif: 'bleu',
  recolorage: { teinte: [190, 255], vers: 0, satMin: 0.32 },
});

import { TILE, UNIT_TYPES, nomDe } from './config.js';
import { MODELES, modeleCuit, ALPHA_EQUIPE } from './modele3d.js';
import { PIECES_DECOR } from './decor-pieces.js';

/**
 * Plafond de mémoire des troupes cuites, en mégaoctets (voir « Mémoire des
 * troupes cuites », plus bas). Les quatorze troupes d'un camp en pèsent 160,
 * leurs copies pour l'autre camp autant : au-delà du plafond, une troupe qui
 * n'a plus d'unité en jeu est déchargée, et relue du cache quand on en reforme.
 */
export const BUDGET_TROUPES_MO = 120;
const REPOS_VARIANTE = 30;   // secondes sans être dessinée : la copie de l'autre camp est rendue
const REPOS_TROUPE = 120;    // secondes sans unité en jeu : la troupe peut être déchargée

/** Les images 0..n-1 dans l'ordre : une rangée déjà remontée et interpolée. */
function suite(n) { return Array.from({ length: n }, (_, i) => i); }

const ATLAS = {
  militia: {
    src: 'assets/milicien-marche.webp',
    cellW: 51, cellH: 76, cases: 8, images: 8, cycle: 40,
    ancreY: 75, hauteurMonde: 44, natif: 'bleu',
    // L'armure est un acier bleuté : un échange de canaux la ferait virer au
    // cuivre. Seuls les bleus francs — bouclier et tabard — basculent.
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
  // Même unité, l'autre style : l'illustration peinte, sans marche animée.
  // Elle sert à comparer les deux partis pris sans relancer de partie.
  militiaPeint: {
    src: 'assets/chevalier.webp',
    cellW: 76, cellH: 104, cases: 8, images: 1,
    ancreY: 104, hauteurMonde: 40, natif: 'bleu',
    // Ici le bleu couvre une grande cape peinte, sans acier bleuté à épargner :
    // l'échange de canaux suffit et coûte moins cher qu'une conversion HSL.
    recolorage: 'echange',
  },
  // Essai de 3D, même unité : le chevalier KayKit (CC0) passé par Blender sous
  // l'angle du jeu (caméra orthographique à 35°, regard vers le nord), en huit
  // directions — une course de 16 images, le repos et le coup d'épée. Rangées
  // 0-7 la course, 8-15 le repos, 16-23 l'attaque ; la course se cale sur la
  // distance (20 px par foulée : ses jambes courtes suivent le sol sans
  // patiner). Le style « 3D en direct » rend le même modèle dans le navigateur
  // (voir rendu3d.js), avec la même caméra : les deux se superposent.
  militia3d: {
    src: 'assets/chevalier-3d.webp',
    cellW: 128, cellH: 128, cases: 8, images: 16, cycle: 20,
    ancreY: 91.6, hauteurMonde: 70, natif: 'rouge',
    // Cape et bouclier rouges ; la peau, orangée, reste hors de la fenêtre.
    recolorage: { teinte: [338, 14], vers: 216, satMin: 0.35 },
    poses8: {
      repos: { lignes: [8, 9, 10, 11, 12, 13, 14, 15], images: 8, cadence: 7.5 },
      attaque: { lignes: [16, 17, 18, 19, 20, 21, 22, 23], images: 12 },
    },
    modele3d: {
      // glTF texte (JSON, données embarquées) : tout hébergeur le sert, ce qui
      // n'est pas le cas du .glb binaire.
      src: 'assets/chevalier-3d.json',
      camera: { elevation: 35, ortho: 3.8, cibleY: 1.0 },
      clips: { marche: 'Running_B', repos: 'Idle', attaque: '1H_Melee_Attack_Chop' },
    },
  },
  // Bâtiments : une seule image, dessinée sur `largeurMonde` pixels et posée
  // sur l'emprise par sa ligne de sol (`sol`, fraction de la hauteur). Ils
  // débordent de leur emprise : un palais qui se lit de loin, un parvis qui
  // empiète sur les cases voisines — les unités marchent dessus. Le Centre-Ville
  // reste le plus grand ; les 3×3 sont dessinés sur 158 px, les 2×2 sur 108.
  // Dômes, toits et bannières sont bleu franc ; la pierre est blanche, l'eau
  // et les cristaux sont cyan (teinte < 200°) : seule la fenêtre du bleu bascule.
  towncenter: batiment('assets/centre-ville.webp', 344, 343, 172),
  barracks: batiment('assets/caserne.webp', 316, 315, 158),
  archery: batiment('assets/archerie.webp', 316, 313, 158),
  stable: batiment('assets/ecurie.webp', 316, 282, 158),
  siege: batiment('assets/atelier-siege.webp', 316, 309, 158),
  blacksmith: batiment('assets/forge.webp', 316, 306, 158),
  temple: batiment('assets/temple.webp', 316, 317, 158),
  house: batiment('assets/maison.webp', 216, 186, 108),
  mill: batiment('assets/moulin.webp', 216, 235, 108),
  lumbercamp: batiment('assets/camp-bucherons.webp', 216, 191, 108),
  miningcamp: batiment('assets/camp-mineurs.webp', 216, 187, 108),
  farm: batiment('assets/ferme.webp', 216, 176, 108),
  tower: batiment('assets/tour-guet.webp', 216, 313, 108),
  // Végétation : six arbres, sans couleur d'équipe (les six buissons fleuris
  // de la même planche sont devenus du décor, voir decor.webp). Chaque
  // case a son sprite posé au bas, centré : l'ancre est le bas de la case, et
  // la planche dicte les proportions — l'arbre le plus haut fait 95 px monde,
  // trois cases : un arbre doit dépasser une maison.
  arbres: {
    src: 'assets/arbres.webp',
    cellW: 107, cellH: 190, cases: 6, images: 1,
    ancreY: 190, hauteurMonde: 95,
  },
  // Le buisson à baies : une seule illustration et son miroir, à la taille
  // d'une case — c'est la nourriture, il faut que les baies se voient.
  baies: {
    src: 'assets/baies.webp',
    cellW: 87, cellH: 82, cases: 2, images: 1,
    ancreY: 82, hauteurMonde: 41.0,
  },
  // Le gisement d'or : une seule illustration, et son miroir en seconde case ;
  // la taille varie un peu d'une case à l'autre (voir dessinerVegetation).
  or: {
    src: 'assets/or.webp',
    cellW: 101, cellH: 74, cases: 2, images: 1,
    ancreY: 74, hauteurMonde: 37,
  },
  // Le villageois : quatre orientations de marche (sud, nord, ouest, est —
  // `lignes` donne la ligne de l'atlas pour chaque secteur, une diagonale
  // prenant la cardinale la plus proche) et sept poses, dessinées d'un seul
  // côté (`sens` : 1 vers l'est, -1 vers l'ouest) — un miroir les retourne
  // quand la cible est de l'autre (voir Renderer.poseDe). Debout, 40 px : un
  // peu moins que le chevalier.
  villager: {
    src: 'assets/villageois.webp',
    cellW: 99, cellH: 87, cases: 4, images: 24, cycle: 36,
    // Quatre marches dessinées, quatre secteurs. Une rangée nord-est demandée
    // à Gemini a été essayée puis retirée : ses huit dessins mêlaient vue de
    // face et vue de dos.
    lignes: [0, 3, 1, 2],
    // Les huit foulées de la planche n'alternent pas les pieds (de face :
    // droit, droit, puis quatre fois le gauche). Mesurées image par image,
    // on retient six poses de face et de dos dans l'ordre d'une vraie marche,
    // les huit de profil dans l'ordre le plus lisse, puis RIFE intercale deux
    // pas entre chaque paire (voir SOURCES.md, « Des pas intermédiaires ») :
    // la rangée joue ses images dans l'ordre, la première étant la foulée
    // neutre où le villageois s'arrête.
    sequences: { 0: suite(18), 1: suite(18), 2: suite(24), 3: suite(24) },
    // Les poses de travail sont dessinées d'un seul côté (`sens` : 1 vers
    // l'est, -1 vers l'ouest) et retournées quand la cible est de l'autre.
    poses: {
      repos: { ligne: 4, images: 4, cadence: 2.5 },
      cueillir: { ligne: 5, images: 4, cadence: 5, sens: -1 },
      // Le maillet frappe vers l'ouest sur la planche (image 3 : tête en bas à gauche).
      construire: { ligne: 6, images: 4, cadence: 7, sens: -1 },
      // Images 2 à 4 : des intercalaires ratés, à demi transparents — le rondin
      // clignotait. On ne joue que les neuf autres.
      porter: { ligne: 7, images: 12, sens: 1, suite: [0, 1, 5, 6, 7, 8, 9, 10, 11] },
      bois: { ligne: 8, images: 8, cadence: 11, sens: 1 },
      or: { ligne: 9, images: 12, cadence: 14, sens: -1 },
      viande: { ligne: 10, images: 9, cadence: 9, sens: 1 },
    },
    ancreY: 86, hauteurMonde: 40.5, natif: 'bleu',
    // L'écharpe est bleu franc ; peau, cuir et chemise sont orangés ou crème.
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
  // L'éclaireur : cavalier à la lance, huit orientations × quatre foulées. La
  // planche va du nord au nord-ouest dans le sens horaire ; `lignes` remet
  // chaque secteur (sud, sud-est, est…) sur sa ligne. Plus grand qu'un homme
  // à pied : 54 px de face.
  scout: {
    src: 'assets/eclaireur.webp',
    cellW: 106, cellH: 111, cases: 8, images: 4, cycle: 56,
    lignes: [4, 3, 2, 1, 0, 7, 6, 5],
    ancreY: 110, hauteurMonde: 54, natif: 'bleu',
    // Cape et tapis de selle sont bleu franc ; la robe du cheval, la peau et
    // la tunique sont brunes ou crème.
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
  // Le décor de la carte : rochers, galets, touffes, roseaux, buissons,
  // fougères, agaves, nénuphars et fleurs, pièces de tailles diverses rangées
  // dans un même atlas (voir decor-pieces.js et decor.js) ; pas de couleur
  // d'équipe.
  decor: {
    src: 'assets/decor.webp',
    pieces: PIECES_DECOR,
  },
  // Les animaux : cinq rangées (sud, sud-est, est, nord-est, nord) de quatre
  // foulées ; les trois secteurs de l'ouest reprennent celles de l'est en
  // miroir (`miroirs`). Pas de couleur d'équipe : un cochon capturé se
  // reconnaît à son socle.
  deer: {
    src: 'assets/cerf.webp',
    cellW: 82, cellH: 78, cases: 8, images: 4, cycle: 40,
    lignes: [0, 1, 2, 3, 4, 3, 2, 1], miroirs: [false, false, false, false, false, true, true, true],
    // De face, la planche lève deux fois la même jambe : neutre, gauche,
    // neutre, droite. De dos, jamais de neutre : gauche, droite, gauche,
    // droite. En trois quarts avant, un aller-retour ; le profil et les trois
    // quarts arrière se jouent tels quels.
    sequences: { 0: [1, 0, 1, 2], 1: [0, 1, 2, 3, 2, 1], 2: [0, 1, 2, 3], 3: [0, 1, 2, 3], 4: [0, 1, 0, 2] },
    ancreY: 76, hauteurMonde: 39.0,
  },
  pig: {
    src: 'assets/cochon.webp',
    cellW: 74, cellH: 63, cases: 8, images: 4, cycle: 26,
    // Cinq rangées (sud, sud-est, est, nord-est, nord) ; les trois secteurs de
    // l'ouest reprennent les rangées de l'est en miroir.
    lignes: [0, 1, 2, 3, 4, 3, 2, 1], miroirs: [false, false, false, false, false, true, true, true],
    // La planche ne fait pas alterner les pieds : mesuré au contour, de face et
    // de dos on lève surtout le même ; en trois quarts, la même jambe avant
    // reste plantée. Chaque rangée rejoue ses images dans l'ordre d'un
    // balancier — repos, un pied, repos, l'autre — sans saut.
    sequences: { 0: [0, 1, 0, 3], 1: [0, 3, 2, 3, 0, 1], 2: [0, 1, 3, 2], 3: [0, 3, 2, 1, 2, 3], 4: [0, 2, 0, 3] },
    // Rose clair sur l'herbe, c'était le dessin le plus voyant de la carte, à
    // côté d'un cerf brun : assombri et moins rose au chargement (`etalonnage`),
    // et dessiné à 0,85 fois sa taille d'origine (31,5).
    ancreY: 61, hauteurMonde: 26.8,
    etalonnage: { r: 0.82, v: 0.74, b: 0.7, contraste: 1.15 },
  },
  spearman: {
    src: 'assets/lancier.png',
    cellW: 48, cellH: 48, cases: 8, images: 1,
    ancreY: 46, hauteurMonde: 44, natif: 'rouge', pixel: true,
    // Le rouge du tabard voisine avec la peau et le cuir, dont la teinte est
    // orangée : la fenêtre s'arrête aux rouges francs.
    recolorage: { teinte: [338, 14], vers: 216, satMin: 0.35, lumMax: 0.75 },
  },
};

const PAS = Math.PI / 4;
const charges = new Map();
let horloge = 0;   // secondes ; tenue par entretenirMemoire, elle date le dernier dessin de l'autre camp

/**
 * Plusieurs styles cohabitent pour la même unité : `3d`, par défaut (les
 * modèles animés de l'auteur, faits dans l'Atelier 3D et cuits au premier
 * lancement : voir modele3d.js), `anime` (marche dessinée, huit images par
 * direction), `peint` (illustration réduite, pose unique), et les deux essais
 * de 3D du milicien sur un chevalier libre de droits, `3d-precalc` et
 * `3d-direct`. Le choix se fait en cours de partie, et l'atlas correspondant
 * n'est chargé qu'au moment où on le demande.
 */
const ALTERNATIVES = {
  militia: {
    '3d': 'militiaAtelier', anime: 'militia', peint: 'militiaPeint', '3d-precalc': 'militia3d', '3d-direct': 'militia3d',
  },
  // Le villageois n'a ni illustration peinte ni essai de 3D : sa planche sert
  // à tous les styles sauf « 3D ».
  villager: { '3d': 'villagerAtelier', anime: 'villager', peint: 'villager', '3d-precalc': 'villager', '3d-direct': 'villager' },
  // L'archer n'avait qu'un dessin au code : son modèle 3D en style « 3D »,
  // le dessin au code dans les autres styles (aucun atlas « archer »).
  archer: { '3d': 'archerAtelier', anime: 'archer', peint: 'archer', '3d-precalc': 'archer', '3d-direct': 'archer' },
  // L'homme-poisson n'existe qu'en 3D : son modèle sert à tous les styles.
  triton: { '3d': 'tritonAtelier', anime: 'tritonAtelier', peint: 'tritonAtelier', '3d-precalc': 'tritonAtelier', '3d-direct': 'tritonAtelier' },
  // Le lancier : son modèle en style « 3D », le pixel art d'origine dans les autres.
  spearman: { '3d': 'spearmanAtelier', anime: 'spearman', peint: 'spearman', '3d-precalc': 'spearman', '3d-direct': 'spearman' },
  // Le Cavalier lourd n'avait qu'un dessin au code : son modèle dans tous les styles.
  knight: { '3d': 'knightAtelier', anime: 'knightAtelier', peint: 'knightAtelier', '3d-precalc': 'knightAtelier', '3d-direct': 'knightAtelier' },
  // L'Éclaireur : son modèle en style « 3D », sa planche dessinée dans les autres.
  scout: { '3d': 'scoutAtelier', anime: 'scout', peint: 'scout', '3d-precalc': 'scout', '3d-direct': 'scout' },
  // Le Bélier : dessiné au code le temps de la cuisson, son modèle ensuite.
  ram: { '3d': 'ramAtelier', anime: 'ramAtelier', peint: 'ramAtelier', '3d-precalc': 'ramAtelier', '3d-direct': 'ramAtelier' },
  // La Catapulte n'existe qu'en 3D.
  catapult: { '3d': 'catapultAtelier', anime: 'catapultAtelier', peint: 'catapultAtelier', '3d-precalc': 'catapultAtelier', '3d-direct': 'catapultAtelier' },
  crossbowman: { '3d': 'crossbowmanAtelier', anime: 'crossbowmanAtelier', peint: 'crossbowmanAtelier', '3d-precalc': 'crossbowmanAtelier', '3d-direct': 'crossbowmanAtelier' },
  horseArcher: { '3d': 'horseArcherAtelier', anime: 'horseArcherAtelier', peint: 'horseArcherAtelier', '3d-precalc': 'horseArcherAtelier', '3d-direct': 'horseArcherAtelier' },
  // Le Champion aussi.
  champion: { '3d': 'championAtelier', anime: 'championAtelier', peint: 'championAtelier', '3d-precalc': 'championAtelier', '3d-direct': 'championAtelier' },
  // La Prêtresse n'existe qu'en 3D.
  priest: { '3d': 'priestAtelier', anime: 'priestAtelier', peint: 'priestAtelier', '3d-precalc': 'priestAtelier', '3d-direct': 'priestAtelier' },
  // L'Hydre aussi : pas de planche dessinée, son modèle dans tous les styles.
  hydra: { '3d': 'hydraAtelier', anime: 'hydraAtelier', peint: 'hydraAtelier', '3d-precalc': 'hydraAtelier', '3d-direct': 'hydraAtelier' },
};
export const STYLES = [
  { id: '3d', nom: '3D', desc: 'Tes modèles animés' },
  { id: 'anime', nom: 'Animé', desc: 'Marche dessinée' },
  { id: 'peint', nom: 'Peint', desc: 'Illustration réduite' },
  { id: '3d-precalc', nom: '3D précalculée', desc: 'Essai : chevalier rendu à l’avance' },
  { id: '3d-direct', nom: '3D en direct', desc: 'Essai : chevalier animé en jeu' },
];
let style = '3d';

/**
 * Unités cuites depuis un modèle 3D. `repli` : l'atlas dessiné, affiché le
 * temps de la cuisson, ou pour de bon si le téléphone n'a pas de WebGL. Le
 * tabard et le bouclier sont bleu franc, l'acier gris-bleu à peine saturé :
 * seule la fenêtre des bleus francs bascule, comme pour l'illustration.
 */
const EN_3D = {
  // Écharpe et braies bleu roi basculent ; la tunique blanche, la peau, le
  // cuir et l'or restent, comme le fer des outils (presque gris).
  villagerAtelier: {
    modele: 'villager', unite: 'villager', repli: 'villager', natif: 'bleu',
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
  // Cuit à la demande, la première fois qu'un Atlante paraît : pas de planche
  // dessinée pour patienter (il est dessiné au code le temps de la cuisson),
  // mais aucune attente au démarrage pour qui n'en forme pas. Bleu franc de la
  // crête et du pagne seulement : la peau turquoise (teinte < 205°) ne bascule pas.
  tritonAtelier: {
    modele: 'triton', unite: 'triton', repli: null, natif: 'bleu', aLaDemande: true,
    recolorage: { teinte: [205, 255], vers: 0, satMin: 0.45 },
  },
  // Cuit à la demande, comme l'Atlante : dessiné au code le temps de la
  // cuisson. Capuche et tunique bleu roi, pan turquoise (teinte 180 à 200°) :
  // tout le bleu bascule ; le pantalon blanc, la peau, le cuir, l'or et le
  // bois de l'arc (teinte < 45°) restent.
  archerAtelier: {
    modele: 'archer', unite: 'archer', repli: null, natif: 'bleu', aLaDemande: true,
    recolorage: { teinte: [178, 255], vers: 0, satMin: 0.32 },
  },
  // Cuite à la demande, à la première Hydre invoquée. Corps turquoise (teinte
  // 180 à 200°), crinières et nageoires bleu franc (200 à 240°) : seul le bleu
  // franc bascule, comme chez l'homme-poisson. (Quand tout basculait, l'Hydre
  // adverse était un bloc rouge vif, l'objet le plus criard de l'écran.)
  // L'or des colliers (20 à 60°) reste.
  hydraAtelier: {
    modele: 'hydra', unite: 'hydra', repli: null, natif: 'bleu', aLaDemande: true,
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.3 },
  },
  // Caparaçon, tabard et plumet bleu franc basculent ; l'acier et la robe du cheval restent.
  knightAtelier: {
    modele: 'knight', unite: 'knight', repli: null, natif: 'bleu', aLaDemande: true,
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
  // Cape, bandeau et tapis de selle bleu franc basculent. Chaque camp commence avec un
  // éclaireur : sa planche dessinée le montre le temps de la cuisson.
  scoutAtelier: {
    modele: 'scout', unite: 'scout', repli: 'scout', natif: 'bleu', aLaDemande: true,
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
  // Tuiles du toit et bannières bleu franc basculent ; bois et bronze restent.
  ramAtelier: {
    modele: 'ram', unite: 'ram', repli: null, natif: 'bleu', aLaDemande: true,
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
  // Seule la butée rembourrée est bleu franc : c'est elle qui bascule.
  catapultAtelier: {
    modele: 'catapult', unite: 'catapult', repli: null, natif: 'bleu', aLaDemande: true,
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
  // Gambison, cape turquoise (teinte 185 à 200°) et plumet : tout le bleu bascule ; l'or et le blanc restent.
  crossbowmanAtelier: {
    modele: 'crossbowman', unite: 'crossbowman', repli: null, natif: 'bleu', aLaDemande: true,
    recolorage: { teinte: [178, 255], vers: 0, satMin: 0.32 },
  },
  // Tunique, tapis de selle et crin du casque bleu franc basculent ; le cheval blanc et l'or restent.
  horseArcherAtelier: {
    modele: 'horseArcher', unite: 'horseArcher', repli: null, natif: 'bleu', aLaDemande: true,
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
  // Tabard, cape, cimier et bouclier bleu franc basculent ; l'acier reste.
  championAtelier: {
    modele: 'champion', unite: 'champion', repli: null, natif: 'bleu', aLaDemande: true,
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
  // Robe blanche, étole et ceinture bleu franc : seules celles-ci basculent.
  priestAtelier: {
    modele: 'priest', unite: 'priest', repli: null, natif: 'bleu', aLaDemande: true,
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
  // Cuit à la demande ; le pixel art du lancier sert le temps de la cuisson.
  // Tunique et cimier bleu franc basculent ; bronze, cuir et peau restent.
  spearmanAtelier: {
    modele: 'spearman', unite: 'spearman', repli: 'spearman', natif: 'bleu', aLaDemande: true,
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
  militiaAtelier: {
    modele: 'militia', unite: 'militia', repli: 'militia', natif: 'bleu',
    recolorage: { teinte: [200, 255], vers: 0, satMin: 0.32 },
  },
};

/**
 * Ce qu'une civilisation a en propre ; tout type absent garde l'image des
 * Atlantes. Bâtiments : même emprise, même ligne de sol et même règle de
 * couleur d'équipe que le bâtiment atlante du même rôle — seule l'image change
 * (chemins en toutes lettres : le test hors ligne les lit). Unités : type →
 * clé de MODELES (mêmes animations que le modèle atlante du même rôle).
 */
const IMAGES_CIV = {
  solarien: {
    batiments: {
      towncenter: 'assets/solariens/centre-ville.webp',
      barracks: 'assets/solariens/caserne.webp',
      archery: 'assets/solariens/archerie.webp',
      stable: 'assets/solariens/ecurie.webp',
      siege: 'assets/solariens/atelier-siege.webp',
      blacksmith: 'assets/solariens/forge.webp',
      temple: 'assets/solariens/temple.webp',
      house: 'assets/solariens/maison.webp',
      mill: 'assets/solariens/moulin.webp',
      lumbercamp: 'assets/solariens/camp-bucherons.webp',
      miningcamp: 'assets/solariens/camp-mineurs.webp',
      farm: 'assets/solariens/ferme.webp',
      tower: 'assets/solariens/tour-guet.webp',
    },
    unites: {
      villager: 'solVillager', militia: 'solMilitia', spearman: 'solSpearman', archer: 'solArcher',
      scout: 'solScout', knight: 'solKnight', champion: 'solChampion', priest: 'solPriest',
      ram: 'solRam', catapult: 'solCatapult',
    },
  },
};
/** civ → type → clé d'atlas. Table fixe : aucune chaîne fabriquée à chaque image dessinée. */
const CLES_CIV = {};
for (const [civ, c] of Object.entries(IMAGES_CIV)) {
  const cles = CLES_CIV[civ] = {};
  for (const [type, src] of Object.entries(c.batiments)) {
    cles[type] = `${type}@${civ}`;
    // La taille de case est lue sur l'image à son chargement (une seule case : l'image entière).
    ATLAS[cles[type]] = { ...ATLAS[type], src, civ, cellW: 0, cellH: 0 };
  }
  for (const [type, modele] of Object.entries(c.unites)) {
    if (!MODELES[modele]) continue;   // modèle pas encore livré : la troupe garde le modèle atlante
    cles[type] = `${type}@${civ}`;
    EN_3D[cles[type]] = { ...EN_3D[ALTERNATIVES[type]['3d']], modele, civ, repli: null, aLaDemande: true };
  }
}
/** La fiche propre à cette civilisation pour ce type, ou null (image atlante). Pure : sert aux tests sans navigateur. */
export function ficheCiv(type, civ) {
  const cle = CLES_CIV[civ]?.[type];
  return cle ? (ATLAS[cle] || EN_3D[cle]) : null;
}

/**
 * Les types de troupe dont l'image suit le style, dans cette civilisation :
 * ceux qui ont plusieurs images selon le style — sauf là où la civilisation a
 * son propre modèle, le même dans tous les styles. (Modèle impossible à
 * préparer — pas de WebGL, fichier illisible : la troupe retombe sur l'image
 * atlante, et le style agit de nouveau.) Sert au message du menu de pause.
 */
export function troupesSelonStyle(civ) {
  return Object.keys(ALTERNATIVES).filter((type) => {
    const propre = CLES_CIV[civ]?.[type];
    if (propre && !charges.get(propre)?.absent) return false;
    return new Set(Object.values(ALTERNATIVES[type])).size > 1;
  });
}

export function styleUnites() { return style; }

/**
 * Style « 3D en direct » : le rendu dessine le modèle 3D lui-même. En
 * attendant three.js et le modèle — ou sans WebGL —, l'atlas précalculé du
 * même modèle sert de repli : c'est lui que `spriteDe` rend dans ce style.
 */
export function rendu3dDirect() { return style === '3d-direct'; }

export function setStyleUnites(nouveau) {
  style = STYLES.some((s) => s.id === nouveau) ? nouveau : '3d';
  for (const alt of Object.values(ALTERNATIVES)) if (!EN_3D[alt[style]]?.aLaDemande) chargerAtlas(alt[style]);
}

function versHSL(r, g, b) {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const R = r / 255, G = g / 255, B = b / 255;
  let h;
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
  else if (max === G) h = ((B - R) / d + 2) / 6;
  else h = ((R - G) / d + 4) / 6;
  return [h, s, l];
}

function versRGB(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(canal(h + 1 / 3) * 255), Math.round(canal(h) * 255), Math.round(canal(h - 1 / 3) * 255)];
}

function copie(image, l, h) {
  const canvas = document.createElement('canvas');
  canvas.width = l; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  return { canvas, ctx };
}

/**
 * Étalonne une planche dessinée, une fois, à son chargement : chaque canal est
 * multiplié (`r`, `v`, `b`), puis écarté du gris moyen (`contraste`). Rend une
 * toile, ou l'image telle quelle si la toile est refusée ou illisible.
 */
function etalonner(image, l, h, e) {
  try {
    const { canvas, ctx } = copie(image, l, h);
    const data = ctx.getImageData(0, 0, l, h);
    etalonnerPixels(data.data, e);
    ctx.putImageData(data, 0, 0);
    return canvas;
  } catch {
    return image;
  }
}

/** Le calcul d'etalonner, sur des pixels (quatre octets chacun). Pure : sert aux tests. */
export function etalonnerPixels(p, e) {
  const c = e.contraste ?? 1;
  const tables = [e.r ?? 1, e.v ?? 1, e.b ?? 1].map((k) => {
    const t = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) t[v] = (v * k - 128) * c + 128;
    return t;
  });
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] === 0) continue;
    p[i] = tables[0][p[i]]; p[i + 1] = tables[1][p[i + 1]]; p[i + 2] = tables[2][p[i + 2]];
  }
}

/**
 * Échange rouge et bleu sur les pixels à dominante bleue. C'est la règle la
 * moins chère, et elle convient à une illustration où le bleu couvre une
 * grande surface peinte sans acier bleuté alentour.
 */
function echangeCanaux(image, l, h) {
  const { canvas, ctx } = copie(image, l, h);
  try {
    const data = ctx.getImageData(0, 0, l, h);
    const p = data.data;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] === 0) continue;
      if (p[i + 2] > p[i] + 18) {
        const bleu = p[i + 2];
        p[i] = Math.min(255, bleu + 30);
        p[i + 1] = Math.round(p[i + 1] * 0.55);
        p[i + 2] = Math.round(bleu * 0.28);
      }
    }
    ctx.putImageData(data, 0, 0);
  } catch { /* canvas verrouillé : le camp gardera sa couleur d'origine */ }
  return canvas;
}

/**
 * Bascule une FENÊTRE DE TEINTE vers une autre, en gardant saturation et
 * luminosité. C'est ce qu'il faut dès que la couleur d'équipe voisine une
 * matière de teinte proche : l'acier bleuté à côté d'un bouclier bleu, la peau
 * et le cuir à côté d'un tabard rouge. Un échange de canaux les emporterait
 * avec ; une fenêtre étroite les épargne.
 *
 * `teinte` est un intervalle en degrés, qui peut passer par 0 (338 → 14).
 */
function rotationTeinte(image, l, h, regle) {
  const { canvas, ctx } = copie(image, l, h);
  const [a, b] = regle.teinte;
  const cible = regle.vers / 360;
  const satMin = regle.satMin ?? 0.3;
  const lumMax = regle.lumMax ?? 1;
  const saturer = regle.saturer ?? 1;   // un bleu terne devient un rouge qui se lit
  const dedans = a <= b
    ? (d) => d >= a && d <= b
    : (d) => d >= a || d <= b;      // fenêtre à cheval sur 0°
  try {
    const data = ctx.getImageData(0, 0, l, h);
    const p = data.data;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] === 0) continue;
      const [teinte, sat, lum] = versHSL(p[i], p[i + 1], p[i + 2]);
      if (sat <= satMin || lum >= lumMax || !dedans(teinte * 360)) continue;
      const [r, g, bl] = versRGB(cible, Math.min(1, sat * saturer), lum);
      p[i] = r; p[i + 1] = g; p[i + 2] = bl;
    }
    ctx.putImageData(data, 0, 0);
  } catch { /* idem */ }
  return canvas;
}

/**
 * Variante d'équipe : l'image d'origine sert un camp, l'autre est recalculée.
 * Sans règle (végétation), les deux camps partagent l'image. Sert aussi à la
 * texture d'un modèle 3D, recolorée selon la règle de son atlas.
 */
export function recolorer(def, image, l, h) {
  if (!def.recolorage) return image;
  return def.recolorage === 'echange'
    ? echangeCanaux(image, l, h)
    : rotationTeinte(image, l, h, def.recolorage);
}

/**
 * Le portrait d'une unité ADVERSE : la même image, la fenêtre de teinte de son
 * camp basculée — la règle de son modèle 3D, celle des troupes à l'écran. Un
 * filtre de teinte sur toute l'image, lui, verdissait la peau et le bois.
 * Rend une toile, gardée pour la fois suivante, ou null (pas de règle connue,
 * image illisible) : l'appelant garde alors le filtre.
 */
const portraitsAdverses = new Map();
export function portraitAdverse(type, image) {
  // Une toile par IMAGE : le portrait d'une autre civilisation a la sienne.
  const cle = image.getAttribute('src') || type;
  if (portraitsAdverses.has(cle)) return portraitsAdverses.get(cle);
  const alt = ALTERNATIVES[type];
  const d = alt && EN_3D[alt['3d']];
  let toile = null;
  if (d && d.recolorage && d.recolorage !== 'echange' && image.naturalWidth) {
    try {
      toile = rotationTeinte(image, image.naturalWidth, image.naturalHeight, d.recolorage);
      toile.getContext('2d').getImageData(0, 0, 1, 1);   // illisible : rotationTeinte l'a rendue sans la teinter
    } catch { toile = null; }
  }
  portraitsAdverses.set(cle, toile);
  return toile;
}

/**
 * La règle de couleur d'équipe d'un modèle cuit, sous la forme que la cuisson
 * attend : `dedans(r, g, b)` dit si une couleur peinte est celle du camp
 * (mêmes fenêtres que rotationTeinte et echangeCanaux), `cle` la résume pour
 * le cache, `saturer` ravive ces pixels-là.
 */
function regleEquipe(d) {
  const regle = d.recolorage;
  if (!regle) return null;
  if (regle === 'echange') return { cle: 'echange', dedans: (r, g, b) => b > r + 18 };
  const [a, b] = regle.teinte;
  const satMin = regle.satMin ?? 0.3, lumMax = regle.lumMax ?? 1;
  const dans = a <= b ? (t) => t >= a && t <= b : (t) => t >= a || t <= b;
  // La teinte d'une couleur tombe entre 0 et 60° ou 300 et 360° quand son
  // rouge domine, entre 60 et 180° quand c'est son vert, entre 180 et 300°
  // quand c'est son bleu : une fenêtre de bleus écarte donc d'une comparaison
  // tout ce qui est peau, or, cuir ou herbe, sans calculer leur teinte.
  const touche = (de, vers) => (a <= b ? !(vers < a || de > b) : vers >= a || de <= b);
  const peutRouge = touche(0, 60) || touche(300, 360), peutVert = touche(60, 180), peutBleu = touche(180, 300);
  return {
    cle: [a, b, satMin, lumMax, regle.saturer ?? 1, 'acier'].join('_'),
    saturer: regle.saturer,
    // Appelée pour chaque pixel de chaque atlas, à la cuisson : le calcul de
    // versHSL, dans le même ordre (mêmes arrondis, donc mêmes pixels marqués),
    // mais sans tableau fabriqué à chaque appel.
    dedans: (r, g, bl) => {
      const haut = r > g ? (r > bl ? r : bl) : (g > bl ? g : bl);
      if (haut === r ? !peutRouge : haut === g ? !peutVert : !peutBleu) return false;
      const bas = r < g ? (r < bl ? r : bl) : (g < bl ? g : bl);
      const max = haut / 255, min = bas / 255;
      const lum = (max + min) / 2, ecart = max - min;
      const sat = lum > 0.5 ? ecart / (2 - max - min) : ecart / (max + min);
      if (!(sat > satMin && lum < lumMax)) return false;   // (un gris : saturation nulle)
      const R = r / 255, G = g / 255, B = bl / 255;
      const teinte = max === R ? ((G - B) / ecart + (G < B ? 6 : 0)) / 6 : max === G ? ((B - R) / ecart + 2) / 6 : ((R - G) / ecart + 4) / 6;
      if (!dans(teinte * 360)) return false;
      // Un acier poli tire sur le bleu pâle, et la saturation « HSL » d'un ton
      // clair s'emballe : sans ce garde-fou, la lame de l'épée passait au rose
      // dans le camp rouge. Un tissu d'équipe, même en pleine lumière, garde
      // au moins un tiers de sa couleur.
      return !(lum > 0.6 && (haut - bas) / haut < 0.3);
    },
  };
}

/** La règle de couleur d'équipe du modèle 3D de ce type de troupe atlante, ou null. Pure : sert aux tests. */
export function regleEquipeDe(type) {
  const d = EN_3D[ALTERNATIVES[type]?.['3d']];
  return d ? regleEquipe(d) : null;
}

/**
 * L'atlas cuit de l'autre camp : seuls les pixels marqués à la cuisson
 * (ALPHA_EQUIPE) changent de teinte. L'étalonnage a pu raviver un acier
 * bleuté voisin : il n'était pas marqué, il ne bouge pas.
 */
function teinterEquipe(d, canvas) {
  const regle = d.recolorage;
  const l = canvas.width, h = canvas.height;
  let toile = null;
  try {
    // Safari peut refuser une toile de plus quand son budget est plein
    // (getContext rend alors null) : tout se passe dans le try.
    const c = copie(canvas, l, h);
    toile = c.canvas;
    const data = c.ctx.getImageData(0, 0, l, h);
    const p = data.data;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] !== ALPHA_EQUIPE) continue;
      if (regle === 'echange') {
        const bleu = p[i + 2];
        p[i] = Math.min(255, bleu + 30);
        p[i + 1] = Math.round(p[i + 1] * 0.55);
        p[i + 2] = Math.round(bleu * 0.28);
      } else {
        const [, sat, lum] = versHSL(p[i], p[i + 1], p[i + 2]);
        const [r, g, b] = versRGB(regle.vers / 360, sat, lum);
        p[i] = r; p[i + 1] = g; p[i + 2] = b;
      }
    }
    c.ctx.putImageData(data, 0, 0);
    return toile;
  } catch {
    // Toile refusée ou illisible : ce camp garde l'atlas d'origine (le socle
    // de couleur, sous l'unité, dit toujours à qui elle est).
    if (toile) toile.width = toile.height = 0;
    return canvas;
  }
}

/**
 * Les deux camps d'un atlas cuit. Celui d'origine est l'atlas lui-même ;
 * l'autre ne se fabrique qu'au premier dessin d'une unité de ce camp — une
 * partie où seul le joueur forme des Hydres ne garde pas en mémoire des
 * Hydres rouges que personne ne verra.
 */
function variantesEquipe(d, canvas) {
  if (!d.recolorage) return { bleu: canvas, rouge: canvas };
  let autre = null, vu = 0;
  // Fabriqué au premier dessin, donc PENDANT le rendu : rien ne doit en sortir
  // qui arrêterait la boucle du jeu. L'échec est retenu (pas de nouvel essai
  // à chaque image).
  const faire = () => {
    vu = horloge;
    if (!autre) {
      try { autre = teinterEquipe(d, canvas); } catch { autre = canvas; }
    }
    return autre;
  };
  // Rend la copie de l'autre camp si elle n'a pas été dessinée depuis `avant` :
  // elle se refera au dessin suivant. JAMAIS la toile d'origine — celle que
  // teinterEquipe rend quand la reteinte est refusée : on l'oublie seulement,
  // et le prochain dessin retentera.
  const rendre = (avant = Infinity) => {
    if (!autre || vu > avant) return;
    if (autre !== canvas) autre.width = autre.height = 0;
    autre = null;
  };
  const poids = () => (autre && autre !== canvas ? octetsDe(autre) : 0);
  return d.natif === 'bleu'
    ? { bleu: canvas, get rouge() { return faire(); }, rendre, poids }
    : { rouge: canvas, get bleu() { return faire(); }, rendre, poids };
}

/**
 * Cuit un modèle 3D, une seule fois. Chaque animation devient un atlas à part
 * (ses colonnes par direction, son ancre : voir recadrer dans modele3d.js),
 * recoloré pour l'autre camp comme une illustration. La fiche de la marche
 * reste au premier niveau pour ce qui ne demande que « animé ou non » et la
 * hauteur ; SEUL Renderer.poserImage3D sait lire ces atlas — cadreSource et
 * imageDeMarche valent pour les planches dessinées, pas pour eux.
 */
function chargerModele(cle) {
  const d = EN_3D[cle];
  // `vu` : la dernière fois qu'une unité de cette troupe était en jeu (voir entretenirMemoire).
  const entree = { def: null, pret: false, vu: horloge };
  const retour = decharges.has(cle);   // déchargée plus tôt : elle revient du cache
  charges.set(cle, entree);
  chargerAtlas(d.repli);
  const unite = UNIT_TYPES[d.unite];
  modeleCuit(d.modele, unite ? unite.speed * TILE : 32, regleEquipe(d))
    .then((cuit) => {
      const { cycle, clips, allege } = cuit;
      entree.cuit = cuit;   // `cuit.enCache` : ses atlas sont rangés dans le cache
      entree.allege = allege || 0;
      for (const c of Object.values(clips)) c.variantes = variantesEquipe(d, c.canvas);
      const { marche } = clips;
      // `poses` : les gestes de travail sous les noms de Renderer.poseDe.
      const poses = {};
      for (const nom of ['repos', 'cueillir', 'construire', 'porter', 'bois', 'or', 'viande']) if (clips[nom]) poses[nom] = clips[nom];
      entree.def = {
        cuit3d: true, src: MODELES[d.modele].src, cellW: marche.cellW, cellH: marche.cellH, cases: 8, images: marche.images, cycle,
        ancreY: marche.ancreY, hauteurMonde: marche.hauteurMonde, natif: d.natif, clips,
        poses: Object.keys(poses).length > 1 ? poses : null,
      };
      entree.variantes = marche.variantes;
      entree.pret = true;
      annoncerModeles3d(retour && !entree.allege);
    })
    .catch((erreur) => {
      entree.absent = true;
      // Un message de GLTFLoader peut citer tout un fichier : on n'en garde que le début.
      entree.raison = String((erreur && erreur.message) || erreur).slice(0, 140);
      console.warn('Modèle 3D indisponible, l’illustration dessinée le remplace :', erreur);
      annoncerModeles3d();
    });
}

/**
 * Prévient le jeu qu'une cuisson vient de finir (ou d'échouer) : voir
 * etatModeles3d. `retour` : ce n'est qu'une troupe déchargée qui revient du
 * cache — rien à annoncer au joueur.
 */
function annoncerModeles3d(retour = false) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('modeles3d', { detail: { retour } }));
}

/**
 * Où en sont les unités du style « 3D » : `attente` (pas encore demandées),
 * `cuisson` (le premier lancement les prépare ; les planches dessinées servent
 * en attendant), `pret`, ou `absent` avec sa raison (pas de WebGL, fichier
 * introuvable…).
 */
export function etatModeles3d() {
  // (Les modèles des Atlantes dans leur ordre habituel, puis ceux, cuits à la demande, des autres civilisations.)
  const cles = [...Object.values(ALTERNATIVES).map((a) => a['3d']).filter((c) => EN_3D[c]), ...Object.keys(EN_3D).filter((c) => EN_3D[c].civ)]
    .filter((c) => !EN_3D[c].aLaDemande || charges.has(c));
  const noms = { villager: 'ouvrier', militia: 'chevalier', triton: 'homme-poisson', archer: 'archer', hydra: 'hydre', spearman: 'lancier', priest: 'prêtresse', knight: 'cavalier', scout: 'éclaireur', champion: 'champion', ram: 'bélier', catapult: 'catapulte', crossbowman: 'arbalétrier', horseArcher: 'archer monté' };
  // « ouvrier », « fellah solarien » : le modèle d'une autre civilisation porte le nom qu'elle lui donne.
  const nom = (c) => (EN_3D[c].civ
    ? `${nomDe(EN_3D[c].unite, EN_3D[c].civ).toLowerCase()} ${EN_3D[c].civ}`
    : noms[EN_3D[c].unite] || EN_3D[c].unite);
  const entrees = cles.map((c) => charges.get(c));
  if (entrees.some((e) => !e)) return { etat: 'attente' };
  const echecs = cles.filter((c) => charges.get(c).absent);
  if (echecs.length) {
    // Qui a échoué, et pourquoi : « ouvrier : … », pour qu'on puisse le dire.
    return { etat: 'absent', raison: echecs.map((c) => `${nom(c)} : ${charges.get(c).raison}`).join(' ; ') };
  }
  // `alleges` : les troupes cuites faute de mieux à finesse réduite (mémoire
  // graphique insuffisante) — elles paraissent plus floues que les autres.
  if (entrees.every((e) => e.pret)) {
    return { etat: 'pret', alleges: cles.filter((c) => charges.get(c).allege).map(nom) };
  }
  return { etat: 'cuisson', faits: entrees.filter((e) => e.pret).length, total: entrees.length };
}

// ---------------------------------------------------------------------------
// Mémoire des troupes cuites.
//
// Les atlas d'une troupe pèsent une dizaine de mégaoctets (largeur × hauteur
// × 4 octets par toile), autant pour la copie de l'autre camp, et rien n'en
// était jamais rendu tant que la page restait ouverte. C'est le premier
// suspect quand un iPhone coupe la page : on le compte, pour le dire (témoin
// de coupure, menu de pause), et on le borne.
//
// - La copie de l'autre camp est rendue quand elle n'a pas été dessinée
//   depuis REPOS_VARIANTE secondes ; elle se refait au dessin suivant.
// - Au-delà de BUDGET_TROUPES_MO, une troupe sans unité en jeu depuis
//   REPOS_TROUPE secondes est déchargée ; elle revient du cache, sans
//   recuisson, dès qu'une unité de ce type est en formation ou en jeu.
// ---------------------------------------------------------------------------

/** Troupes déchargées au moins une fois : elles reviendront du cache. */
const decharges = new Set();

function octetsDe(toile) { return toile ? toile.width * toile.height * 4 : 0; }

/** Une troupe cuite en mémoire : ses atlas, et les copies de l'autre camp déjà fabriquées. */
function poidsTroupe(entree) {
  let octets = 0;
  for (const c of Object.values(entree.def.clips)) octets += octetsDe(c.canvas) + (c.variantes.poids ? c.variantes.poids() : 0);
  return octets;
}

/** Ce que pèsent les troupes cuites : `{ octets, mo, troupes }` (leur nombre en mémoire). */
export function memoireTroupes() {
  let octets = 0, troupes = 0;
  for (const [cle, e] of charges) {
    if (!EN_3D[cle] || !e.pret) continue;
    octets += poidsTroupe(e);
    troupes++;
  }
  return { octets, mo: octets / 1048576, troupes };
}

/**
 * Les troupes à décharger pour repasser sous le budget (en octets), les plus
 * anciennement inutiles d'abord. `troupes` : `[{ cle, octets, vu, relisible }]`,
 * `vu` étant la dernière seconde où une de leurs unités était en jeu. On ne
 * touche ni à une troupe en jeu (ou qui l'était il y a moins de `repos`
 * secondes), ni à une troupe qui ne reviendrait pas du cache (`relisible`
 * faux). Sous le budget, rien ne sort. Pure : sert aux tests sans navigateur.
 */
export function troupesADecharger(troupes, maintenant, budget, repos = REPOS_TROUPE) {
  let total = 0;
  for (const t of troupes) total += t.octets;
  const sorties = [];
  const candidates = troupes
    .filter((t) => t.relisible && maintenant - t.vu >= repos)
    .sort((a, b) => a.vu - b.vu || b.octets - a.octets || (a.cle < b.cle ? -1 : 1));
  for (const t of candidates) {
    if (total <= budget) break;
    sorties.push(t.cle);
    total -= t.octets;
  }
  return sorties;
}

/**
 * Les troupes cuites dont se sert une unité de ce type dans cette
 * civilisation : la sienne, et celle des Atlantes tant que la sienne n'est pas
 * prête (elle la remplace : voir spriteDe).
 */
function clesCuites(type, civ) {
  const propre = CLES_CIV[civ]?.[type], atlante = ALTERNATIVES[type]?.[style];
  const cles = [];
  if (EN_3D[propre]) cles.push(propre);
  if (EN_3D[atlante] && !(cles.length && charges.get(propre)?.pret)) cles.push(atlante);
  return cles;
}

/**
 * Rend les copies de l'autre camp qui n'ont pas été dessinées depuis `avant`
 * (seconde de l'horloge d'entretenirMemoire) — toutes, par défaut : page
 * masquée, partie quittée. Elles se refont au dessin suivant.
 */
export function rendreVariantes(avant = Infinity) {
  for (const [cle, e] of charges) {
    if (!EN_3D[cle] || !e.pret) continue;
    for (const c of Object.values(e.def.clips)) if (c.variantes.rendre) c.variantes.rendre(avant);
  }
}

/**
 * Décharge une troupe cuite : ses toiles sont vidées (Safari compte leur
 * mémoire tant qu'elles ne le sont pas) et son entrée oubliée — spriteDe la
 * redemandera, et elle reviendra du cache.
 */
function decharger(cle) {
  const e = charges.get(cle);
  if (!e || !e.pret) return;
  charges.delete(cle);
  decharges.add(cle);
  for (const c of Object.values(e.def.clips)) {
    if (c.variantes.rendre) c.variantes.rendre();
    c.canvas.width = c.canvas.height = 0;
  }
}

/**
 * Le ménage, à appeler une fois par seconde hors du dessin. `maintenant` : des
 * secondes d'horloge réelle. `enJeu` : les couples `[type, civilisation]` des
 * unités en vie ou en formation, ou dont le corps est encore à terre, quel que
 * soit le camp, vues ou non.
 * 1. Leurs troupes sont marquées « en jeu » ; une troupe déchargée est relue
 *    du cache sans attendre qu'on la dessine (le temps d'une formation suffit).
 * 2. Les copies de l'autre camp restées sans dessin sont rendues.
 * 3. Au-delà du budget, les troupes sans unité depuis deux minutes sortent —
 *    sauf celles qu'il faudrait recuire : une cuisson allégée n'est jamais
 *    rangée dans le cache, et une cuisson fraîche ne l'est qu'après coup.
 *    Ouvrier et milicien atlantes, cuits au lancement, restent : ils servent
 *    de repli aux autres.
 */
export function entretenirMemoire(maintenant, enJeu = [], budgetMo = BUDGET_TROUPES_MO) {
  horloge = maintenant;
  for (const [type, civ] of enJeu) {
    const cles = clesCuites(type, civ);
    for (const cle of cles) { const e = charges.get(cle); if (e) e.vu = maintenant; }
    if (cles.length && !charges.has(cles[0]) && decharges.has(cles[0])) chargerAtlas(cles[0]);
  }
  rendreVariantes(maintenant - REPOS_VARIANTE);
  const troupes = [];
  for (const [cle, e] of charges) {
    if (!EN_3D[cle] || !e.pret) continue;
    troupes.push({
      cle, octets: poidsTroupe(e), vu: e.vu,
      relisible: !!(EN_3D[cle].aLaDemande && e.cuit && e.cuit.enCache && !e.allege),
    });
  }
  for (const cle of troupesADecharger(troupes, maintenant, budgetMo * 1048576)) decharger(cle);
}

/** Charge un atlas donné, une seule fois. */
function chargerAtlas(cle) {
  if (EN_3D[cle]) {
    if (!charges.has(cle) && typeof document !== 'undefined') chargerModele(cle);
    return;
  }
  const def = ATLAS[cle];
  if (!def || charges.has(cle) || typeof document === 'undefined') return;
  const entree = { def, pret: false, variantes: null };
  charges.set(cle, entree);
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    const l = image.width, h = image.height;
    if (!def.cellW) { def.cellW = l; def.cellH = h; }   // bâtiment d'une civilisation : une seule case, l'image entière
    const source = def.etalonnage ? etalonner(image, l, h, def.etalonnage) : image;
    const autre = recolorer(def, source, l, h);
    entree.variantes = def.natif === 'bleu'
      ? { bleu: source, rouge: autre }
      : { rouge: source, bleu: autre };
    entree.pret = true;
  };
  image.onerror = () => { charges.set(cle, { def, pret: false, absent: true }); };
  image.src = def.src;
}

/**
 * Démarre le chargement des atlas nécessaires. Les variantes de style, elles,
 * n'arrivent que si on les demande : inutile de télécharger les deux.
 */
export function chargerSprites() {
  if (typeof document === 'undefined') return;
  const variantes = new Set(Object.values(ALTERNATIVES).flatMap((a) => Object.values(a)));
  for (const cle of Object.keys(ATLAS)) {
    if (ATLAS[cle].civ) continue;   // images d'une civilisation : chargerCivilisation
    if (!variantes.has(cle) || ALTERNATIVES[cle]) chargerAtlas(cle);
  }
  for (const alt of Object.values(ALTERNATIVES)) if (!EN_3D[alt[style]]?.aLaDemande) chargerAtlas(alt[style]);
}

// ---------------------------------------------------------------------------
// Textures de sol.
//
// Une nappe CONTINUE par type de terrain, échantillonnée aux coordonnées monde :
// deux cases voisines d'herbe montrent deux morceaux contigus de la même
// nappe, pas deux copies d'une tuile — rien ne trahit la grille. La nappe se
// répète toutes les `n × TEXEL` unités monde ; elle est raccordée bord à bord
// à la fabrication (assets/SOURCES.md).
//
// Chaque nappe est recopiée dans un canvas avec une MARGE repliée tout autour,
// pour qu'un échantillon qui déborde de la période (les débordements de
// lisière) reste dans l'image. Une version demi-taille sert au zoom arrière :
// sans elle, réduire 384 texels sur 96 pixels scintille au défilement.
//
// Le « sable doré » du désert (sandOr) n'a pas d'image à lui : c'est la nappe
// de sable, reteintée une fois au chargement vers l'or des socles peints sous
// les bâtiments solariens (voir DERIVEES). Le sable des rivages reste brun.
// ---------------------------------------------------------------------------

export const TEXEL = 0.5;          // pixels monde par texel, à zoom 1
const MARGE = 128;                 // texels repliés autour de la nappe
const TEXTURES = {
  grass: 'assets/sol-herbe.webp',
  grassDark: 'assets/sol-herbe-sombre.webp',
  dirt: 'assets/sol-terre.webp',
  sand: 'assets/sol-sable.webp',
  water: 'assets/sol-eau.webp',
};
/**
 * Nappes tirées d'une autre. Le sable doré : la nappe de sable est brune
 * (161, 121, 83 en moyenne) ; le bord des socles solariens, mesuré sur les
 * treize images de assets/solariens, est à (225, 172, 78) en médiane, son
 * sable nu à (244, 191, 100). On vise un peu en dessous — le sol reste plus
 * calme que les bâtiments, et le socle s'y fond quand même (essayé de 200 à
 * 214 de rouge : plus sombre, le socle refait une tache claire) — et on
 * resserre le contraste : un grain de photo éclairci d'un tiers crierait.
 */
const DERIVEES = {
  sandOr: { de: 'sand', vers: [210, 165, 87], contraste: 0.7 },
};
const nappes = new Map();

/**
 * Reteinte les pixels RGBA d'une nappe, sur place : la couleur moyenne devient
 * `vers`, et chaque pixel garde son écart à la moyenne, mis à l'échelle de la
 * nouvelle couleur puis resserré de `contraste`. Pure : se teste sans navigateur.
 */
export function reteinterNappe(data, vers, contraste = 1) {
  const n = data.length / 4, moyenne = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) { moyenne[0] += data[i]; moyenne[1] += data[i + 1]; moyenne[2] += data[i + 2]; }
  for (let c = 0; c < 3; c++) {
    const m = moyenne[c] / n || 1, gain = (vers[c] / m) * contraste;
    for (let i = c; i < data.length; i += 4) data[i] = Math.max(0, Math.min(255, Math.round(vers[c] + (data[i] - m) * gain)));
  }
  return data;
}

/** L'image d'une nappe dérivée : la nappe d'origine recopiée, puis reteintée. */
function nappeDerivee(image, { vers, contraste }) {
  const c = document.createElement('canvas');
  c.width = image.width; c.height = image.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0);
  const pixels = g.getImageData(0, 0, c.width, c.height);
  reteinterNappe(pixels.data, vers, contraste);
  // Sur un canvas neuf, écrit une seule fois : c'est lui que les niveaux recopient.
  const sortie = document.createElement('canvas');
  sortie.width = c.width; sortie.height = c.height;
  sortie.getContext('2d').putImageData(pixels, 0, 0);
  c.width = c.height = 0;
  return sortie;
}

function niveauxNappe(image) {
  const n = image.width;
  return [
    { canvas: nappeRepliee(image, n, MARGE), n, marge: MARGE, texel: TEXEL },
    { canvas: nappeRepliee(image, n / 2, MARGE / 2), n: n / 2, marge: MARGE / 2, texel: TEXEL * 2 },
  ];
}

function nappeRepliee(image, n, marge) {
  const c = document.createElement('canvas');
  c.width = n + 2 * marge; c.height = n + 2 * marge;
  const g = c.getContext('2d');
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) g.drawImage(image, 0, 0, image.width, image.height, marge + ox * n, marge + oy * n, n, n);
  }
  return c;
}

function chargerTexture(cle) {
  if (nappes.has(cle) || typeof document === 'undefined') return;
  const entree = { pret: false, niveaux: null };
  nappes.set(cle, entree);
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    entree.niveaux = niveauxNappe(image);
    entree.pret = true;
    for (const [derivee, regle] of Object.entries(DERIVEES)) {
      if (regle.de !== cle) continue;
      // Lecture des pixels refusée (rare) : le désert garde le sable d'origine.
      let teinte = image;
      try { teinte = nappeDerivee(image, regle); } catch { /* nappe d'origine */ }
      nappes.set(derivee, { pret: true, niveaux: niveauxNappe(teinte) });
    }
  };
  image.onerror = () => { nappes.set(cle, { pret: false, absent: true }); };
  image.src = TEXTURES[cle];
}

export function chargerTextures() {
  if (typeof document === 'undefined') return;
  for (const cle of Object.keys(TEXTURES)) chargerTexture(cle);
}

/**
 * Niveau de nappe à utiliser pour ce zoom (0 : pleine, 1 : demi-taille), ou
 * null si la texture n'est pas prête — le rendu garde alors sa tuile de
 * couleur.
 */
export function textureSol(cle, zoom = 1) {
  const e = nappes.get(cle);
  if (!e || !e.pret) return null;
  return e.niveaux[zoom < 0.7 ? 1 : 0];
}

/**
 * Les images propres à une civilisation en jeu : ses bâtiments, et les troupes
 * présentes dès la première image (l'ouvrier, l'éclaireur). Les autres se
 * cuisent quand on les commande (prevoirTroupe) ou à leur première apparition :
 * dix modèles cuits d'avance pèseraient une centaine de mégaoctets pour des
 * troupes que la partie ne verra peut-être jamais. Sans effet pour les
 * Atlantes ou une valeur inconnue.
 */
const DES_LE_DEPART = ['villager', 'scout'];
export function chargerCivilisation(civ) {
  const cles = CLES_CIV[civ];
  if (!cles || typeof document === 'undefined') return;
  for (const type of Object.keys(cles)) if (ATLAS[cles[type]]) chargerAtlas(cles[type]);
  for (const type of DES_LE_DEPART) if (EN_3D[cles[type]]) chargerAtlas(cles[type]);
}

/**
 * Une troupe vient d'être commandée : son modèle se cuit pendant sa formation,
 * et elle sort de son bâtiment sous sa vraie allure.
 */
export function prevoirTroupe(type, civ) {
  if (typeof document === 'undefined') return;
  const propre = CLES_CIV[civ]?.[type];
  if (propre) { chargerAtlas(propre); return; }
  const alt = ALTERNATIVES[type];
  if (alt && EN_3D[alt[style]]) chargerAtlas(alt[style]);
}

/**
 * Sprite prêt à dessiner pour ce type dans cette civilisation — à défaut celui
 * des Atlantes —, ou null. Sans civilisation (décor, gibier, nature) : l'image
 * commune.
 */
export function spriteDe(type, civ) {
  const propre = CLES_CIV[civ]?.[type];
  if (propre) {
    let e = charges.get(propre);
    if (e && e.pret) return e;
    if (!e) { chargerAtlas(propre); e = charges.get(propre); }
    // En route : l'image atlante si elle est déjà là, sans la faire cuire pour rien.
    if (e && !e.absent) return spriteAtlante(type, false);
  }
  return spriteAtlante(type, true);   // pas d'image propre, fichier manquant, pas de WebGL
}

function spriteAtlante(type, demander) {
  const alt = ALTERNATIVES[type];
  const cle = alt ? alt[style] : type;
  const e = charges.get(cle);
  if (e && e.pret) return e;
  if (demander && !e && EN_3D[cle]?.aLaDemande) chargerAtlas(cle);   // premier Atlante à l'écran
  // Un modèle 3D encore en cuisson (ou impossible à cuire) : son illustration.
  const repli = EN_3D[cle] && charges.get(EN_3D[cle].repli);
  return repli && repli.pret ? repli : null;
}

/** Le joueur 0 est bleu, le joueur 1 rouge (voir PLAYER_COLORS). */
export function imagePourJoueur(sprite, playerIndex) {
  return playerIndex === 0 ? sprite.variantes.bleu : sprite.variantes.rouge;
}

/**
 * Position de la case dans l'atlas.
 * - Une seule image par orientation : les huit directions se suivent en ligne.
 * - Une marche animée : les colonnes sont les images, les lignes les directions.
 */
export function cadreSource(def, direction, image) {
  const multi = (def.images || 1) > 1;
  const ligne = def.lignes ? def.lignes[direction] : direction;
  return multi
    ? { sx: image * def.cellW, sy: ligne * def.cellH }
    : { sx: direction * def.cellW, sy: 0 };
}

/** Position d'une image d'une pose (repos, cueillir, construire, porter, bois, or, viande). */
export function poseSource(def, pose, image) {
  return { sx: image * def.cellW, sy: pose.ligne * def.cellH };
}

/**
 * Image de la marche, choisie sur la DISTANCE parcourue et non sur l'horloge :
 * les jambes suivent le sol, une unité lente marche lentement, et une unité
 * arrêtée reprend sa pose de repos.
 */
export function imageDeMarche(def, distance, enMouvement, ligne = 0) {
  // Une planche mal cadencée (deux fois le même pied, images en double) se
  // remonte sans la redessiner : `sequences[ligne]` donne l'ordre des images
  // à jouer, la première étant la foulée neutre où l'unité s'arrête.
  const seq = def.sequences && def.sequences[ligne];
  const n = seq ? seq.length : (def.images || 1);
  if (n <= 1 || !enMouvement) return seq ? seq[0] : 0;
  // Une rangée qui dessine plus d'un cycle de marche annonce sa propre distance.
  const cycle = (def.cycles && def.cycles[ligne]) || def.cycle || 40;
  const i = Math.floor((distance / cycle) * n) % n;
  return seq ? seq[i] : i;
}

/**
 * Case de l'atlas correspondant à une orientation. `facing` vaut 0 vers l'est
 * et croît vers le sud (l'axe des y descend), d'où le sens de lecture.
 */
export function caseDirection(facing, cases = 8) {
  const pas = (2 * Math.PI) / cases;
  const k = Math.round((Math.PI / 2 - facing) / pas);
  return ((k % cases) + cases) % cases;
}
