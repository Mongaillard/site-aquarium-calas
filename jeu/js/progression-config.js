// ---------------------------------------------------------------------------
// Réglages de la progression : classement, ligues, saisons, coffres, fragments
// et niveaux des troupes. TOUTES les valeurs d'équilibrage sont ici, dans un
// seul objet, et nulle part ailleurs : js/progression.js n'a que des règles.
//
// Source : « Classement, ligues, coffres et niveaux des troupes » (7 octobre
// 2026). Les valeurs notées (H) y sont des hypothèses de départ, à régler ;
// celles notées (choix) ne figurent pas dans ce document : c'est la valeur la
// plus simple, à confirmer.
//
// Conventions :
//   - les probabilités sont en POUR-MILLE ENTIERS : chaque table somme à 1000
//     exactement, sans erreur d'arrondi (voir verifierProbabilites) ;
//   - les multiplicateurs de statistiques aussi (1125 = ×1,125) ;
//   - les durées en secondes, les prix en centimes d'euro ;
//   - les identifiants de troupes sont ceux de UNIT_TYPES (js/config.js) ;
//   - un tableau « par niveau » a une case par niveau, la première pour le
//     niveau 1 : elle est toujours neutre (×1000, +0, rien à poser).
// ---------------------------------------------------------------------------

// Règle générale (H) : +5 % par niveau, soit +20 % au niveau 5.
const PLUS_5_POUR_CENT = [1000, 1050, 1100, 1150, 1200];
// L'éclaireur : +2 % de vitesse par niveau.
const PLUS_2_POUR_CENT = [1000, 1020, 1040, 1060, 1080];
// L'ouvrier : +12,5 % de récolte par niveau, arrêtée à +25 % — au-delà,
// l'économie emballe toute la partie.
const RECOLTE = [1000, 1125, 1250, 1250, 1250];
/** Points de vie et dégâts : ce qui monte pour la plupart des troupes. */
const PV_ET_DEGATS = { fois: { hp: PLUS_5_POUR_CENT, attack: PLUS_5_POUR_CENT } };

/** Gèle l'objet et tout ce qu'il contient : un réglage ne change pas en cours de route. */
function figer(objet) {
  for (const valeur of Object.values(objet)) {
    if (valeur && typeof valeur === 'object' && !Object.isFrozen(valeur)) figer(valeur);
  }
  return Object.freeze(objet);
}

export const PROGRESSION = figer({
  // --- Le profil -------------------------------------------------------------
  //  version  : format du profil, voir migrerProfil
  //  journal  : nombre d'opérations gardées (parties, coffres ouverts, améliorations…) (choix)
  //  saisons  : nombre de saisons passées gardées, pour l'écran du profil (choix)
  profil: { version: 1, journal: 30, saisons: 24 },

  // --- Classement --------------------------------------------------------------
  // Le gain ne dépend pas de l'écart avec l'adversaire. Une victoire sur trois
  // suffit à ne pas descendre : 30 × 1/3 = 15 × 2/3.
  //  depart   : on commence au seuil de la première ligue
  //  plancher : une défaite ne fait jamais passer sous ce score
  elo: { depart: 0, victoire: 30, defaite: -15, egalite: 0, plancher: 0 },

  // --- Recherche d'adversaire --------------------------------------------------
  //  fenetre  : écart d'Elo accepté au départ (H)
  //  pas      : ce dont elle s'élargit toutes les `periode` secondes
  //  fenetreMax : écart qu'elle ne dépasse jamais (H)
  //  ordinateurApres : sans adversaire au bout de ce délai, on propose l'ordinateur (H)
  //  ordinateurClasseJusqua : contre l'ordinateur, la partie compte pour l'Elo
  //    jusqu'à cette ligue ; au-delà, elle ne rapporte que des coffres. Tant
  //    que le jeu entre joueurs n'existe pas, mettre 10 pour que le classement
  //    se joue en entier contre l'ordinateur.
  recherche: { fenetre: 60, pas: 30, periode: 5, fenetreMax: 400, ordinateurApres: 60, ordinateurClasseJusqua: 4 },

  // --- Abandons et déconnexions ------------------------------------------------
  //  precoceAvant : avant cette durée, l'abandon ne rapporte rien à celui qui
  //    reste — sinon deux complices qui s'abandonnent à tour de rôle
  //    fabriqueraient des points (H)
  //  pauseDeconnexion  : pause accordée à chaque coupure
  //  pauseMaxParJoueur : au plus, par joueur et par partie ; au-delà, c'est un abandon
  //  precocesParJour   : à ce nombre d'abandons précoces dans la journée…
  //  fermetureRecherche: … la recherche d'adversaire se ferme pour cette durée
  abandon: { precoceAvant: 120, pauseDeconnexion: 30, pauseMaxParJoueur: 60, precocesParJour: 3, fermetureRecherche: 600 },

  // --- Saisons -----------------------------------------------------------------
  // À la fin d'une saison, on ne garde que la part `garde` de ce qui dépasse
  // `pivot` (2 350 repart à 1 550) ; le reste est arrondi à l'entier inférieur
  // (choix). Sous le pivot, rien ne bouge. La fin de saison peut faire
  // redescendre de ligue, jamais sous `jamaisSousLaLigue`.
  saison: { jours: 56, pivot: 750, garde: 0.5, jamaisSousLaLigue: 5 },

  // --- Ligues ------------------------------------------------------------------
  //  seuil    : Elo d'entrée — la promotion est immédiate dès qu'il est atteint
  //  plafond  : niveau maximal des troupes en partie classée
  //  troupe   : troupe offerte à l'entrée (voir aussi troupes[…].gratuite)
  //  promotion: récompense donnée une seule fois, à la première entrée
  //  finDeSaison : récompense de celui qui finit la saison dans cette ligue
  // Les seuils sont tous des hypothèses : rapprochés au début (ligue 2 en trois
  // victoires), écartés ensuite.
  ligues: [
    { numero: 1, nom: 'Bois', seuil: 0, plafond: 1, troupe: null, promotion: null, finDeSaison: null },
    { numero: 2, nom: 'Pierre', seuil: 90, plafond: 1, troupe: 'triton',
      promotion: { coffre: 'or', cadeaux: [{ genre: 'titre', nom: 'Recrue' }] }, finDeSaison: null },
    { numero: 3, nom: 'Bronze', seuil: 240, plafond: 2, troupe: 'horseArcher',
      promotion: { coffre: 'or', cadeaux: [{ genre: 'couleur', nom: 'Couleur du camp au choix' }] }, finDeSaison: null },
    { numero: 4, nom: 'Fer', seuil: 450, plafond: 2, troupe: 'catapult',
      promotion: { coffre: 'or', cadeaux: [{ genre: 'banniere', nom: 'Bannière' }] }, finDeSaison: null },
    { numero: 5, nom: 'Argent', seuil: 750, plafond: 3, troupe: 'hydra',
      promotion: { coffre: 'legendaire', cadeaux: [{ genre: 'titre', nom: 'Capitaine' }] },
      finDeSaison: { coffre: 'or', cadeaux: [] } },
    { numero: 6, nom: 'Or', seuil: 1150, plafond: 3, troupe: 'pavoisier',
      promotion: { coffre: 'or', cadeaux: [{ genre: 'skin', nom: 'Skin de troupe' }] },
      finDeSaison: { coffre: 'or', cadeaux: [] } },
    { numero: 7, nom: 'Cristal', seuil: 1650, plafond: 4, troupe: 'frondeur',
      promotion: { coffre: 'or', cadeaux: [{ genre: 'titre', nom: 'Stratège' }] },
      finDeSaison: { coffre: 'legendaire', cadeaux: [] } },
    { numero: 8, nom: 'Orichalque', seuil: 2300, plafond: 4, troupe: 'sapeur',
      promotion: { coffre: 'legendaire', cadeaux: [{ genre: 'capitale', nom: 'Capitale dorée' }] },
      finDeSaison: { coffre: 'legendaire', cadeaux: [] } },
    { numero: 9, nom: 'Soleil', seuil: 3100, plafond: 5, troupe: null,
      promotion: { coffre: 'or', cadeaux: [{ genre: 'titre', nom: 'Empereur' }] },
      finDeSaison: { coffre: 'legendaire', cadeaux: [{ genre: 'banniere', nom: 'Bannière de la saison' }] } },
    // « Le tout et un titre de saison » : lu comme la récompense de la ligue 9
    // plus le titre, sans coffre d'or en supplément (choix).
    { numero: 10, nom: 'Légendes', seuil: 4000, plafond: 5, troupe: null,
      promotion: { coffre: 'legendaire', cadeaux: [{ genre: 'titre', nom: 'Légende' }, { genre: 'cadre', nom: 'Cadre de profil' }] },
      finDeSaison: { coffre: 'legendaire', cadeaux: [{ genre: 'banniere', nom: 'Bannière de la saison' }, { genre: 'titre', nom: 'Titre de la saison' }] } },
  ],

  // Les ligues 1 à 4 sont des planchers. À partir de `aPartirDe`, on redescend
  // seulement quand l'Elo passe SOUS seuil − marge : quatre défaites de marge (H).
  retrogradation: { aPartirDe: 5, marge: 60 },

  // --- Coffres -----------------------------------------------------------------
  // Un coffre contient un nombre fixe de tirages. Chaque tirage choisit une
  // catégorie selon sa `table` (pour-mille), puis une troupe de cette catégorie,
  // et donne le nombre FIXE de fragments de `fragments`. Les tirages
  // « garantis » s'ajoutent aux ordinaires. Aucun coffre ne se vend.
  //
  // `categories` va de la plus basse à la plus haute : un tirage sans troupe
  // disponible passe à la catégorie du dessous, quantité comprise ; sous la
  // plus basse, ses fragments deviennent des éclats (choix : un pour un).
  categories: ['commune', 'rare', 'epique'],
  nomsDesCategories: { commune: 'Commune', rare: 'Rare', epique: 'Épique' },
  eclatsParFragment: 1,
  coffres: {
    bois: {
      nom: 'Coffre de bois',
      fragments: { commune: 5, rare: 2, epique: 1 },
      tirages: [
        { genre: 'ordinaire', nom: 'Tirages ordinaires', nombre: 3, table: { commune: 800, rare: 170, epique: 30 } },
      ],
    },
    argent: {
      nom: 'Coffre d’argent',
      fragments: { commune: 8, rare: 3, epique: 2 },
      tirages: [
        { genre: 'ordinaire', nom: 'Tirages ordinaires', nombre: 4, table: { commune: 650, rare: 280, epique: 70 } },
        { genre: 'garanti', nom: 'Tirage « rare ou mieux »', nombre: 1, table: { rare: 900, epique: 100 } },
      ],
    },
    or: {
      nom: 'Coffre d’or',
      fragments: { commune: 12, rare: 5, epique: 3 },
      tirages: [
        { genre: 'ordinaire', nom: 'Tirages ordinaires', nombre: 6, table: { commune: 500, rare: 380, epique: 120 } },
        { genre: 'garanti', nom: 'Tirage « rare ou mieux »', nombre: 1, table: { rare: 800, epique: 200 } },
        { genre: 'garanti', nom: 'Tirage épique', nombre: 1, table: { epique: 1000 } },
      ],
    },
    legendaire: {
      nom: 'Coffre légendaire',
      fragments: { commune: 16, rare: 8, epique: 4 },
      tirages: [
        { genre: 'ordinaire', nom: 'Tirages ordinaires', nombre: 8, table: { commune: 350, rare: 400, epique: 250 } },
        { genre: 'garanti', nom: 'Tirages épiques', nombre: 2, table: { epique: 1000 } },
      ],
    },
  },

  // --- D'où viennent les coffres -----------------------------------------------
  // Les coffres de promotion et de fin de saison sont dans la table des ligues.
  //  bois   : un par victoire, `parJourAuPlus` dans la journée (H)
  //  argent : un tous les `tousLes` points de bataille. Une défaite fait donc
  //    avancer vers le coffre. `abandonPrecoce` : ce que vaut un abandon avant
  //    abandon.precoceAvant — une défaite, d'après le document ; mettre 0 si
  //    des abandons en série servent à remplir le coffre.
  //  or     : un par semaine où l'on a joué `joursJoues` jours (H). La semaine
  //    court du lundi au dimanche (choix) : `decalage` est ce qu'il faut ajouter
  //    au nombre de jours depuis le 1er janvier 1970, un jeudi, pour qu'elle
  //    commence un lundi.
  sources: {
    bois: { parJourAuPlus: 5 },
    argent: { tousLes: 10, victoire: 2, defaite: 1, egalite: 1, abandonPrecoce: 1 },
    or: { joursJoues: 3, joursParSemaine: 7, decalage: 3 },
  },

  // --- Fragments et niveaux ----------------------------------------------------
  // Débloquer n'est pas améliorer : les fragments ne servent qu'à monter le
  // niveau d'une troupe déjà débloquée. `couts[catégorie][n − 1]` est le prix
  // du passage du niveau n au niveau n + 1 (totaux : 630, 206, 81).
  niveauMax: 5,
  couts: {
    commune: [20, 60, 150, 400],
    rare: [6, 20, 50, 130],
    epique: [3, 8, 20, 50],
  },

  // En partie classée, l'ouvrier joue toujours au plafond de la ligue, et il y
  // monte d'office à chaque promotion qui le relève : l'économie n'est jamais
  // inégale.
  ouvrier: 'villager',
  // Statistiques arrondies à l'entier le plus proche une fois améliorées
  // (choix) : les points de vie restent des entiers, comme partout dans le jeu.
  entiers: ['hp'],
  // Partie amicale : le niveau de tous quand les deux joueurs choisissent
  // « niveaux égaux », et ce qui vaut quand rien n'est choisi (choix).
  amical: { niveauEgal: 1, egauxParDefaut: true },

  // --- Troupes -----------------------------------------------------------------
  //  categorie : rareté, pour les coffres et le coût en fragments
  //  gratuite  : une troupe avancée s'obtient en atteignant `ligue` OU après
  //              `parties` parties jouées ; sans ce champ, c'est une troupe de
  //              base, débloquée d'office
  //  prixCentimes : ou tout de suite, en payant (H). Achetée ou gagnée, c'est
  //              la même troupe : mêmes statistiques, mêmes plafonds.
  //  ameliorations : ce qui monte avec le niveau, par statistique de la
  //              définition (js/config.js) et par niveau —
  //                fois : multiplie, en pour-mille de la valeur d'origine ;
  //                plus : ajoute ;
  //                pose : écrit un champ qui n'existe pas au niveau 1.
  //              Ni la portée, ni la cadence, ni le coût, ni le temps de
  //              formation ne changent jamais.
  //  aVenir    : la troupe n'existe pas encore dans le jeu — jamais tirée,
  //              jamais débloquée, jamais vendue tant que ce drapeau est là.
  //  depart    : ses statistiques de départ (H), en attendant sa définition
  troupes: {
    // Communes (base)
    villager: {
      categorie: 'commune',
      ameliorations: {
        fois: { 'gather.food': RECOLTE, 'gather.gold': RECOLTE, 'gather.wood': RECOLTE },
        // Les niveaux 4 et 5 donnent autre chose que de la récolte (H).
        plus: { carry: [0, 0, 0, 2, 2] },
        pose: { construction: [null, null, null, null, 1.1] },
      },
    },
    militia: { categorie: 'commune', ameliorations: PV_ET_DEGATS },
    spearman: {
      categorie: 'commune',
      ameliorations: { fois: { hp: PLUS_5_POUR_CENT }, plus: { 'bonus.cavalry': [0, 1, 2, 3, 4] } },
    },
    // La portée de l'archer ne bouge jamais.
    archer: { categorie: 'commune', ameliorations: PV_ET_DEGATS },
    scout: { categorie: 'commune', ameliorations: { fois: { hp: PLUS_5_POUR_CENT, speed: PLUS_2_POUR_CENT } } },

    // Rares (base)
    knight: { categorie: 'rare', ameliorations: PV_ET_DEGATS },
    champion: { categorie: 'rare', ameliorations: PV_ET_DEGATS },
    crossbowman: { categorie: 'rare', ameliorations: PV_ET_DEGATS },
    priest: {
      categorie: 'rare',
      ameliorations: { fois: { hp: PLUS_5_POUR_CENT }, plus: { heal: [0, 0.5, 1, 1.5, 2] } },
    },
    ram: {
      categorie: 'rare',
      ameliorations: { fois: { hp: PLUS_5_POUR_CENT }, plus: { 'bonus.building': [0, 2, 4, 6, 8] } },
    },

    // Épiques (avancées)
    triton: { categorie: 'epique', gratuite: { ligue: 2, parties: 10 }, prixCentimes: 99, ameliorations: PV_ET_DEGATS },
    horseArcher: { categorie: 'epique', gratuite: { ligue: 3, parties: 25 }, prixCentimes: 199, ameliorations: PV_ET_DEGATS },
    catapult: { categorie: 'epique', gratuite: { ligue: 4, parties: 50 }, prixCentimes: 199, ameliorations: PV_ET_DEGATS },
    hydra: { categorie: 'epique', gratuite: { ligue: 5, parties: 80 }, prixCentimes: 299, ameliorations: PV_ET_DEGATS },

    // Les trois nouvelles. `contact` : troupe de mêlée, sa portée exacte reste
    // à fixer. `bonus` se lit par classe, comme dans js/config.js ;
    // `bonusContre` par troupe, faute de classe qui dise « archers et archers
    // montés » (l'archer monté est de la cavalerie). Sans indication, elles
    // suivent la règle générale : points de vie et dégâts (choix).
    pavoisier: {
      categorie: 'epique', gratuite: { ligue: 6, parties: 130 }, prixCentimes: 299, ameliorations: PV_ET_DEGATS,
      aVenir: true, nom: 'Pavoisier',
      depart: { cost: { food: 60, gold: 40 }, hp: 70, attack: 4, contact: true, speed: 0.85, pierceArmor: 6 },
    },
    frondeur: {
      categorie: 'epique', gratuite: { ligue: 7, parties: 180 }, prixCentimes: 299, ameliorations: PV_ET_DEGATS,
      aVenir: true, nom: 'Frondeur',
      depart: { cost: { food: 30, wood: 30 }, hp: 30, attack: 3, range: 4, speed: 1.05, bonusContre: { archer: 6, horseArcher: 6 } },
    },
    sapeur: {
      categorie: 'epique', gratuite: { ligue: 8, parties: 250 }, prixCentimes: 299, ameliorations: PV_ET_DEGATS,
      aVenir: true, nom: 'Sapeur',
      depart: { cost: { food: 50, gold: 40 }, hp: 35, attack: 3, contact: true, speed: 1.3, bonus: { building: 25, siege: 8 } },
    },
  },
});
