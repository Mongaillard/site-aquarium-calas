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

// Règle générale (H) : +5 % par niveau, soit +20 % au niveau 5 — arrondi à
// l'entier pour les points de vie et les dégâts (`entiers`) : le joueur ne lit
// que des chiffres ronds, et c'est le chiffre rond qui joue.
const PLUS_5_POUR_CENT = [1000, 1050, 1100, 1150, 1200];
// L'ouvrier : sa récolte monte aux niveaux 2 et 3, puis s'arrête — au-delà,
// l'économie emballe toute la partie.
/** Une récolte donnée par minute, telle que le joueur la lit, en unités par seconde (celles de js/config.js). */
const PAR_MINUTE = (parMinute) => parMinute.map((v) => v / 60);
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
  //  comptees : nombre d'identifiants de parties gardés, pour ne pas en compter une deux fois (choix)
  profil: { version: 1, journal: 30, saisons: 24, comptees: 40 },

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
  // Une saison dure un mois de calendrier (voir `saisons`, plus bas : la route
  // et le Passe). À sa fin, on ne garde que la part `garde` de ce qui dépasse
  // `pivot` (2 350 repart à 1 550) ; le reste est arrondi à l'entier inférieur
  // (choix). Sous le pivot, rien ne bouge. La fin de saison peut faire
  // redescendre de ligue, jamais sous `jamaisSousLaLigue`.
  saison: { pivot: 750, garde: 0.5, jamaisSousLaLigue: 5 },

  // --- Ligues ------------------------------------------------------------------
  //  seuil    : Elo d'entrée — la promotion est immédiate dès qu'il est atteint
  //  plafond  : niveau maximal des troupes en partie classée
  //  troupe   : troupe offerte à l'entrée (voir aussi troupes[…].gratuite)
  //  promotion: récompense donnée une seule fois, à la première entrée — un
  //             coffre et des `cadeaux`, chacun une pièce de la collection
  //             « Les Ligues » (`piece`, voir js/collections-config.js)
  //  finDeSaison : récompense de celui qui finit la saison dans cette ligue —
  //             ses cadeaux sont des pièces de la collection de la saison
  //             (`saison` : « etendard », « champion »)
  // Les seuils sont tous des hypothèses : rapprochés au début (ligue 2 en trois
  // victoires), écartés ensuite.
  ligues: [
    { numero: 1, nom: 'Bois', seuil: 0, plafond: 1, troupe: null, promotion: null, finDeSaison: null },
    { numero: 2, nom: 'Pierre', seuil: 90, plafond: 1, troupe: 'triton',
      promotion: { coffre: 'or', cadeaux: [{ piece: 'ligues.recrue' }] }, finDeSaison: null },
    { numero: 3, nom: 'Bronze', seuil: 240, plafond: 2, troupe: 'horseArcher',
      promotion: { coffre: 'or', cadeaux: [{ piece: 'ligues.bronze' }] }, finDeSaison: null },
    { numero: 4, nom: 'Fer', seuil: 450, plafond: 2, troupe: 'catapult',
      promotion: { coffre: 'or', cadeaux: [{ piece: 'ligues.fer' }] }, finDeSaison: null },
    { numero: 5, nom: 'Argent', seuil: 750, plafond: 3, troupe: 'hydra',
      promotion: { coffre: 'legendaire', cadeaux: [{ piece: 'ligues.capitaine' }] },
      finDeSaison: { coffre: 'or', cadeaux: [] } },
    { numero: 6, nom: 'Or', seuil: 1150, plafond: 3, troupe: 'pavoisier',
      promotion: { coffre: 'or', cadeaux: [{ piece: 'ligues.or' }] },
      finDeSaison: { coffre: 'or', cadeaux: [] } },
    { numero: 7, nom: 'Cristal', seuil: 1650, plafond: 4, troupe: 'frondeur',
      promotion: { coffre: 'or', cadeaux: [{ piece: 'ligues.stratege' }] },
      finDeSaison: { coffre: 'legendaire', cadeaux: [] } },
    { numero: 8, nom: 'Orichalque', seuil: 2300, plafond: 4, troupe: 'sapeur',
      promotion: { coffre: 'legendaire', cadeaux: [{ piece: 'ligues.orichalque' }] },
      finDeSaison: { coffre: 'legendaire', cadeaux: [] } },
    { numero: 9, nom: 'Soleil', seuil: 3100, plafond: 5, troupe: null,
      promotion: { coffre: 'or', cadeaux: [{ piece: 'ligues.empereur' }] },
      finDeSaison: { coffre: 'legendaire', cadeaux: [{ saison: 'etendard' }] } },
    // « Le tout et un titre de saison » : lu comme la récompense de la ligue 9
    // plus le titre, sans coffre d'or en supplément (choix).
    { numero: 10, nom: 'Légendes', seuil: 4000, plafond: 5, troupe: null,
      promotion: { coffre: 'legendaire', cadeaux: [{ piece: 'ligues.legende' }, { piece: 'ligues.legendes' }] },
      finDeSaison: { coffre: 'legendaire', cadeaux: [{ saison: 'etendard' }, { saison: 'champion' }] } },
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
      fragments: { commune: 4, rare: 1, epique: 1 },
      tirages: [
        { genre: 'ordinaire', nom: 'Tirages ordinaires', nombre: 2, table: { commune: 850, rare: 140, epique: 10 } },
      ],
    },
    argent: {
      nom: 'Coffre d’argent',
      fragments: { commune: 5, rare: 2, epique: 1 },
      tirages: [
        { genre: 'ordinaire', nom: 'Tirages ordinaires', nombre: 3, table: { commune: 750, rare: 200, epique: 50 } },
      ],
    },
    or: {
      nom: 'Coffre d’or',
      fragments: { commune: 7, rare: 3, epique: 1 },
      tirages: [
        { genre: 'ordinaire', nom: 'Tirages ordinaires', nombre: 4, table: { commune: 600, rare: 300, epique: 100 } },
        { genre: 'garanti', nom: 'Tirage « rare ou mieux »', nombre: 1, table: { rare: 700, epique: 300 } },
      ],
    },
    legendaire: {
      nom: 'Coffre légendaire',
      fragments: { commune: 10, rare: 5, epique: 2 },
      tirages: [
        { genre: 'ordinaire', nom: 'Tirages ordinaires', nombre: 6, table: { commune: 400, rare: 400, epique: 200 } },
        { genre: 'garanti', nom: 'Tirages épiques', nombre: 2, table: { epique: 1000 } },
      ],
    },
  },

  // --- D'où viennent les coffres -----------------------------------------------
  // Les coffres de promotion et de fin de saison sont dans la table des ligues.
  //  partie : CHAQUE partie classée donne un coffre, gagnée ou perdue. Son rang
  //    se tire au sort dans la table de l'issue, en pour-cent (total 100) : la
  //    victoire a de meilleures chances d'un rang élevé. Une défaite d'avant
  //    abandon.precoceAvant — abandon ou non — n'en donne pas : sinon il
  //    suffirait d'abandonner à la chaîne pour remplir sa réserve.
  //    Les taux de la victoire et de la défaite sont ceux que l'auteur a
  //    donnés ; l'égalité est entre les deux. Ce qui règle la vitesse de la
  //    progression, c'est le CONTENU des coffres ci-dessus, allégé d'autant
  //    (un coffre par partie au lieu d'un toutes les deux ou trois) : à six
  //    victoires sur dix, une partie rapporte en moyenne 11,7 fragments
  //    communs, 2,6 rares et 0,6 épique (contre 11,5 – 2,0 – 0,3 avec
  //    l'ancienne règle : un coffre de bois par victoire, d'argent aux dix
  //    points de bataille) — soit, par ces seuls coffres, environ 270 parties
  //    pour monter toutes les communes, 390 pour les rares, 900 pour les
  //    épiques ; les coffres de la semaine et des ligues raccourcissent cela.
  //  or     : en plus, un par semaine où l'on a joué `joursJoues` jours (H). La
  //    semaine court du lundi au dimanche (choix) : `decalage` est ce qu'il faut
  //    ajouter au nombre de jours depuis le 1er janvier 1970, un jeudi, pour
  //    qu'elle commence un lundi.
  sources: {
    partie: {
      victoire: { bois: 20, argent: 35, or: 35, legendaire: 10 },
      egalite: { bois: 45, argent: 30, or: 20, legendaire: 5 },
      defaite: { bois: 65, argent: 25, or: 10, legendaire: 0 },
    },
    // Un format plus court a sa table, un cran en dessous : une Escarmouche dure
    // deux fois moins qu'une partie Express, et un coffre aussi bon pour deux
    // fois moins de temps en ferait le seul format joué. (Proposé à l'auteur et
    // accepté le 08/10/2026.)
    parFormat: {
      escarmouche: {
        victoire: { bois: 35, argent: 40, or: 20, legendaire: 5 },
        egalite: { bois: 55, argent: 30, or: 15, legendaire: 0 },
        defaite: { bois: 75, argent: 20, or: 5, legendaire: 0 },
      },
    },
    or: { joursJoues: 3, joursParSemaine: 7, decalage: 3 },
  },

  // --- L'ordinateur de chaque ligue ----------------------------------------------
  // Tant que le jeu entre joueurs n'existe pas, la partie classée se joue
  // contre l'ordinateur, et sa force suit la ligue du joueur (H) — une ligne
  // par ligue, dans l'ordre :
  //  difficulte : celle de DIFFICULTIES (js/config.js) — sa façon d'attaquer
  //  recolte    : sa vitesse de récolte, à la place de celle de la difficulté
  //  niveau     : le niveau de toutes ses troupes — le plafond de la ligue
  // Il ne forme que les troupes avancées que la ligue du joueur offre.
  echelle: [
    { difficulte: 'easy', recolte: 0.8, niveau: 1 },
    { difficulte: 'easy', recolte: 0.9, niveau: 1 },
    { difficulte: 'normal', recolte: 1, niveau: 2 },
    { difficulte: 'normal', recolte: 1.1, niveau: 2 },
    { difficulte: 'hard', recolte: 1.25, niveau: 3 },
    { difficulte: 'hard', recolte: 1.35, niveau: 3 },
    { difficulte: 'hard', recolte: 1.45, niveau: 4 },
    { difficulte: 'hard', recolte: 1.55, niveau: 4 },
    { difficulte: 'hard', recolte: 1.7, niveau: 5 },
    { difficulte: 'hard', recolte: 1.85, niveau: 5 },
  ],

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
  entiers: ['hp', 'attack'],
  // Partie amicale : le niveau de tous quand les deux joueurs choisissent
  // « niveaux égaux », et ce qui vaut quand rien n'est choisi (choix).
  amical: { niveauEgal: 1, egauxParDefaut: true },

  // --- Troupes -----------------------------------------------------------------
  //  categorie : rareté, pour les coffres et le coût en fragments
  //  gratuite  : une troupe avancée s'obtient en atteignant `ligue` OU après
  //              `parties` parties jouées ; sans ce champ, c'est une troupe de
  //              base, débloquée d'office
  //  prix      : ou tout de suite, à la boutique, en Couronnes (voir boutique).
  //              Achetée ou gagnée, c'est la même troupe : mêmes statistiques,
  //              mêmes plafonds.
  //  ameliorations : ce qui monte avec le niveau, par statistique de la
  //              définition (js/config.js) et par niveau —
  //                fois : multiplie, en pour-mille de la valeur d'origine ;
  //                plus : ajoute ;
  //                vaut : remplace la valeur (null : celle d'origine) — pour une
  //                       statistique qui doit rester un chiffre rond à chaque niveau ;
  //                pose : écrit un champ qui n'existe pas au niveau 1.
  //              Ni la portée, ni la cadence, ni le coût, ni le temps de
  //              formation ne changent jamais.
  //  enPlus    : l'ordinateur ne forme pas cette troupe de lui-même ; la
  //              partie la lui donne, quand la ligue du joueur l'offre ou que
  //              le joueur l'a débloquée (World, option `troupesEnPlus`, voir
  //              reglagesDePartie). Les quatre premières troupes avancées,
  //              elles, sont dans son ordinaire : on les lui interdit.
  //  aVenir    : la troupe n'existe pas encore dans le jeu — jamais tirée,
  //              jamais débloquée, jamais vendue tant que ce drapeau est là.
  //              Aucune ne le porte aujourd'hui.
  troupes: {
    // Communes (base)
    villager: {
      categorie: 'commune',
      ameliorations: {
        // Ce que le joueur lit est un chiffre rond : la récolte se compte par minute, en
        // entiers (bois 33, 37, 41 ; vivres et or 30, 34, 37), et c'est cette valeur-là
        // qui joue. Le plafond reste sous les +25 % validés (+24 % et +23 %).
        vaut: { 'gather.wood': PAR_MINUTE([33, 37, 41, 41, 41]), 'gather.food': PAR_MINUTE([30, 34, 37, 37, 37]), 'gather.gold': PAR_MINUTE([30, 34, 37, 37, 37]) },
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
    // (Sa vitesse ne monte plus : +2 % par niveau ne donnait que des chiffres à virgule. Il voit plus loin.)
    scout: { categorie: 'commune', ameliorations: { fois: { hp: PLUS_5_POUR_CENT }, plus: { los: [0, 1, 1, 2, 2] } } },

    // Rares (base)
    knight: { categorie: 'rare', ameliorations: PV_ET_DEGATS },
    champion: { categorie: 'rare', ameliorations: PV_ET_DEGATS },
    crossbowman: { categorie: 'rare', ameliorations: PV_ET_DEGATS },
    priest: {
      categorie: 'rare',
      ameliorations: { fois: { hp: PLUS_5_POUR_CENT }, plus: { heal: [0, 1, 1, 2, 2] } },
    },
    ram: {
      categorie: 'rare',
      ameliorations: { fois: { hp: PLUS_5_POUR_CENT }, plus: { 'bonus.building': [0, 2, 4, 6, 8] } },
    },

    // Épiques (avancées)
    triton: { categorie: 'epique', gratuite: { ligue: 2, parties: 10 }, prix: 100, ameliorations: PV_ET_DEGATS },
    horseArcher: { categorie: 'epique', gratuite: { ligue: 3, parties: 25 }, prix: 200, ameliorations: PV_ET_DEGATS },
    catapult: { categorie: 'epique', gratuite: { ligue: 4, parties: 50 }, prix: 200, ameliorations: PV_ET_DEGATS },
    hydra: { categorie: 'epique', gratuite: { ligue: 5, parties: 80 }, prix: 300, ameliorations: PV_ET_DEGATS },

    // Les trois des ligues 6 à 8. Leurs statistiques sont dans js/config.js,
    // comme celles des autres (Pavoisier : le mur contre les flèches ;
    // Frondeur : le tireur qui chasse les tireurs ; Sapeur : bâtiments et
    // engins). Sans indication, elles suivent la règle générale : points de
    // vie et dégâts (choix).
    pavoisier: { categorie: 'epique', gratuite: { ligue: 6, parties: 130 }, prix: 300, ameliorations: PV_ET_DEGATS, enPlus: true },
    frondeur: { categorie: 'epique', gratuite: { ligue: 7, parties: 180 }, prix: 300, ameliorations: PV_ET_DEGATS, enPlus: true },
    sapeur: { categorie: 'epique', gratuite: { ligue: 8, parties: 250 }, prix: 300, ameliorations: PV_ET_DEGATS, enPlus: true },
  },

  // --- Boutique ----------------------------------------------------------------
  // La monnaie payante : les Couronnes. On les achète en argent réel (les
  // lots), on les dépense à la boutique. Repère : 100 Couronnes pour 1 €.
  // (La monnaie gratuite, les Éclats, est avec les collections, plus bas.)
  //
  // Ce qui s'y vend a toujours un contenu connu d'avance : une troupe avancée
  // tout de suite (sinon gratuite par la ligue — c'est du temps gagné) et, plus
  // tard, de l'apparence. Jamais un coffre, jamais un fragment, jamais un
  // niveau : rien d'aléatoire, et pas de puissance — le classement doit garder
  // son sens.
  //
  //  argentReel : les achats en argent réel attendent l'application (achat
  //               intégré, vérifié par un serveur). Tant que c'est false, les
  //               lots et l'offre de bienvenue s'affichent « bientôt ».
  //  essai      : d'ici là, un porte-monnaie d'essai — un bouton ajoute ces
  //               Couronnes, pour essayer la boutique. À retirer (null) le jour
  //               où l'argent réel arrive.
  //  parLigue   : Couronnes offertes à chaque ligue atteinte pour la première fois.
  //  lots       : prix en centimes d'euro → Couronnes ; `bonus` est ce que le lot
  //               donne de plus que le premier, en pour-cent, dit à l'écran.
  //  toutesLesTroupes : le lot de ce qui reste à débloquer, à `part` pour-cent
  //               de la somme, arrondi à `arrondi` ; proposé s'il en reste au
  //               moins `minimum`.
  //  offres     : à contenu fixe, et leur fin est une vraie date —
  //    bienvenue : une seule fois, `heures` après la première partie comptée ;
  //    ligue     : à chaque ligue atteinte pour la première fois, la troupe de
  //                la ligue suivante à `part` pour-cent de son prix.
  boutique: {
    argentReel: false,
    essai: { couronnes: 500 },
    parLigue: 50,
    lots: [
      { id: 'poignee', nom: 'Poignée', prixCentimes: 99, couronnes: 100, bonus: 0 },
      { id: 'bourse', nom: 'Bourse', prixCentimes: 499, couronnes: 550, bonus: 10 },
      { id: 'coffret', nom: 'Coffret', prixCentimes: 999, couronnes: 1200, bonus: 20 },
      { id: 'tresor', nom: 'Trésor', prixCentimes: 1999, couronnes: 2600, bonus: 30 },
      { id: 'butin', nom: 'Butin royal', prixCentimes: 4999, couronnes: 7000, bonus: 40 },
    ],
    toutesLesTroupes: { part: 70, arrondi: 50, minimum: 2 },
    offres: {
      bienvenue: { prixCentimes: 299, troupes: ['triton', 'horseArcher'], couronnes: 300, heures: 72 },
      ligue: { part: 50, heures: 48 },
    },
  },

  // --- Collections -------------------------------------------------------------
  // Le jeu a deux monnaies. Les COURONNES s'achètent (boutique, ci-dessus) ;
  // les ÉCLATS se gagnent en jouant, et seulement en jouant : chaque coffre en
  // donne, un autocollant en double en devient. Les Éclats n'achètent que de
  // l'apparence — les autocollants qui manquent à une collection.
  //
  // Les pièces elles-mêmes (noms, dessins, couleurs) sont dans
  // js/collections-config.js. Leurs raretés sont les `categories` des troupes.
  //
  //  eclats.parCoffre : ce que chaque coffre donne d'office, selon son rang
  //  eclats.doublon   : ce que devient un autocollant déjà possédé
  //  eclats.prix      : un autocollant choisi, dans une collection des coffres
  //  eclats.selection : chaque jour, `nombre` autocollants qui manquent au
  //                     joueur sont proposés à `part` pour-cent de leur prix ;
  //                     un autocollant acheté n'est pas remplacé avant le lendemain
  //  tirages   : les autocollants d'un coffre — `nombre` tirages dans la
  //              `table` (pour-mille, total 1000), puis un autocollant de
  //              cette rareté à chances égales parmi ceux des collections
  //              « coffres ». Les coffres sont gratuits : ce hasard-là ne se
  //              vend pas.
  //  paliers   : dans une collection des coffres, le nombre d'autocollants qui
  //              donne chacune de ses autres pièces (elle en a neuf)
  //  lots      : les collections vendues entières à la boutique, en Couronnes.
  //              Leur contenu est affiché pièce par pièce avant l'achat.
  //  raretes   : le nom d'une rareté pour un autocollant (« commun », là où une
  //              troupe est « commune »)
  //  atelier   : les pièces qui s'achètent une à une, en Éclats, chacune à son
  //              prix — les teintures des troupes (js/teintures.js). De
  //              l'apparence : elles ne changent rien au combat.
  collections: {
    raretes: { commune: 'Commun', rare: 'Rare', epique: 'Épique' },
    atelier: { 'teintures.argent': 300, 'teintures.jade': 600, 'teintures.obsidienne': 600, 'teintures.amethyste': 900 },
    eclats: {
      parCoffre: { bois: 5, argent: 10, or: 20, legendaire: 50 },
      doublon: { commune: 5, rare: 15, epique: 50 },
      prix: { commune: 30, rare: 100, epique: 300 },
      selection: { nombre: 3, part: 50 },
    },
    tirages: {
      bois: { nombre: 1, table: { commune: 900, rare: 100 } },
      argent: { nombre: 1, table: { commune: 750, rare: 220, epique: 30 } },
      or: { nombre: 1, table: { commune: 500, rare: 400, epique: 100 } },
      legendaire: { nombre: 2, table: { rare: 600, epique: 400 } },
    },
    paliers: { grade: 3, banniere: 6, cadre: 9, epithete: 9 },
    lots: { cour: { prix: 300 } },
  },

  // --- Saisons : la route et le Passe ---------------------------------------------
  // Une saison par mois de calendrier, du premier au dernier jour. Chacune a
  // sa collection (`themes`, dans l'ordre ; arrivé au bout, on recommence) et
  // une route de `paliers` paliers à deux voies.
  //
  //  premiere : le mois de la saison 1, « AAAA-MM »
  //  points   : ce que rapporte une partie classée comptée — toute partie,
  //             plus un supplément pour une victoire, plus un autre pour la
  //             première victoire du jour. Trois parties par jour dont deux
  //             gagnées : 140 points ; la route se finit en trois semaines.
  //  passe.prix : en Couronnes. Il ouvre la seconde voie de la saison en cours.
  //  route    : une ligne par palier, `gratuit` et `passe`. Une récompense est
  //             un coffre (son rang), des `couronnes`, des `eclats`, un
  //             autocollant de la collection de la saison (`embleme` : son rang
  //             dans la collection, de 0 à 17) ou une autre de ses pièces
  //             (`piece` : « grade », « banniere », « cadre », « epithete »).
  //
  // LA RÈGLE : la voie du Passe ne contient que de l'apparence, des Couronnes
  // et des Éclats (qui n'achètent que de l'apparence). Jamais un coffre,
  // jamais un fragment, jamais un niveau : un Passe payant qui contient des
  // coffres revient à vendre des coffres. Les essais le vérifient.
  saisons: {
    premiere: '2026-10',
    themes: ['citrouilles', 'tournoi', 'froid'],
    paliers: 30,
    pointsParPalier: 100,
    points: { partie: 20, victoire: 20, premiereVictoireDuJour: 40 },
    passe: { prix: 500 },
    route: [
      { gratuit: { eclats: 20 }, passe: { embleme: 6 } },
      { gratuit: { coffre: 'bois' }, passe: { eclats: 40 } },
      { gratuit: { embleme: 0 }, passe: { couronnes: 100 } },
      { gratuit: { eclats: 20 }, passe: { embleme: 7 } },
      { gratuit: { coffre: 'argent' }, passe: { piece: 'banniere' } },
      { gratuit: { couronnes: 50 }, passe: { eclats: 40 } },
      { gratuit: { embleme: 1 }, passe: { embleme: 8 } },
      { gratuit: { eclats: 20 }, passe: { eclats: 40 } },
      { gratuit: { coffre: 'argent' }, passe: { embleme: 9 } },
      { gratuit: { eclats: 20 }, passe: { piece: 'grade' } },
      { gratuit: { eclats: 20 }, passe: { couronnes: 100 } },
      { gratuit: { embleme: 2 }, passe: { embleme: 10 } },
      { gratuit: { eclats: 20 }, passe: { eclats: 40 } },
      { gratuit: { coffre: 'or' }, passe: { embleme: 11 } },
      { gratuit: { couronnes: 50 }, passe: { piece: 'epithete' } },
      { gratuit: { embleme: 3 }, passe: { eclats: 40 } },
      { gratuit: { eclats: 20 }, passe: { embleme: 12 } },
      { gratuit: { coffre: 'argent' }, passe: { couronnes: 100 } },
      { gratuit: { eclats: 20 }, passe: { embleme: 13 } },
      { gratuit: { eclats: 20 }, passe: { piece: 'cadre' } },
      { gratuit: { embleme: 4 }, passe: { eclats: 40 } },
      { gratuit: { eclats: 20 }, passe: { embleme: 14 } },
      { gratuit: { coffre: 'or' }, passe: { eclats: 40 } },
      { gratuit: { couronnes: 50 }, passe: { embleme: 15 } },
      { gratuit: { embleme: 5 }, passe: { eclats: 40 } },
      { gratuit: { eclats: 20 }, passe: { couronnes: 100 } },
      { gratuit: { coffre: 'or' }, passe: { embleme: 16 } },
      { gratuit: { eclats: 20 }, passe: { eclats: 40 } },
      { gratuit: { eclats: 20 }, passe: { eclats: 40 } },
      { gratuit: { coffre: 'legendaire' }, passe: { embleme: 17 } },
    ],
  },
});
