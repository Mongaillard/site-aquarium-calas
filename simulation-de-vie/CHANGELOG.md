# Changelog

Toutes les évolutions notables du projet, phase par phase (voir `PROTOCOLE.md`, section 15).

## M17 – Mode Dieu v3 et carte plein écran (2026-09-12)

- **Épreuves lourdes** : Gel précoce (18 ✦, trois jours de neige quelle que soit la saison), Sécheresse
  (20 ✦, dix jours de canicule et baies, fibres et poissons réduits de moitié à douze tuiles),
  Fièvre envoyée (10 ✦, la fièvre des eaux prend une personne, une fois), Secousse (22 ✦,
  bâtiments −50 de solidité à six tuiles, fractures pour trois personnes sur dix, sécurité −40 et
  peur à douze tuiles). La météo imposée par un miracle est un état du monde
  (`meteoForcee`), sauvegardé, qui remplace le tirage quotidien sans changer la suite du hasard.
- **Épiphanie** (30 ✦, vingt jours de recharge) : la personne gagne un niveau dans sa
  meilleure compétence, cinq jours d'humeur haute, et ceux qui sont à huit tuiles font la fête.
- **Culte** : la foi moyenne des adultes donne un niveau de culte (personne ne prie, on prie, un
  culte, la dévotion), recalculé chaque aube ; chaque niveau ajoute dix à la faveur maximale.
  **Gardien de l'autel** : qui a prié cinq fois à l'autel en porte le titre.
- **Trois leçons** : « Le ciel écoute » (deux prières exaucées ; prier vaut davantage), « Le ciel
  frappe » (témoin d'une épreuve attribuée au ciel ; prier vaut davantage), « Ne pas attendre le
  ciel » (trois prières restées trois jours sans réponse ; prier vaut moins). Le Songe les
  connaît.
- **Migration conseillée** : après cinq jours de faim ou de froid, Claude peut proposer
  `migrer:<direction>` ; toute la famille adulte prend l'ambition, explore trois fois plus loin
  dans cette direction, et, à seize tuiles du vieux foyer, bâtit un abri sur place ; l'ambition
  est accomplie quand un abri neuf existe loin de l'ancien.
- **Carte plein écran** : bouton « ⛶ » (touche `p`) ; la carte prend tout l'écran (et le vrai
  plein écran du navigateur quand il est permis), avec des commandes flottantes : « ☰ » ouvre
  toutes les commandes de la barre en menu, « ⏸ » et l'horloge restent visibles, « 📋 » ouvre le
  panneau (personnage, journal, statistiques) en volet, « ✕ » ou Échap sortent. Toucher un
  personnage ouvre le volet.

## M16 – Providence et interface mobile (2026-09-12)

- **Providence** (mode automatique de réponse aux prières) : bouton « 🙏 auto » dans la barre de
  pouvoirs, commande `providence`. Chaque heure simulée, pour chaque prière en attente, le ciel
  exerce de lui-même le premier pouvoir qui l'exauce (bienfaits seulement), s'il est payable et
  rechargé, sur la personne ou sa tuile ; une réponse par prière, journalisée comme un miracle
  « Providence ». L'état survit à la sauvegarde. Déterministe : même graine, mêmes prières,
  mêmes réponses.
- **Mobile** (écrans jusqu'à 640 px) : barre compacte (graine, « Nouveau monde » et sauvegardes
  derrière un bouton « ⋯ », vitesse en liste déroulante, boutons de 34 px) ; panneau du bas
  repliable par une poignée (replié : onglets seuls et carte presque plein écran ; normal ;
  grand), déplié automatiquement quand on touche un personnage ; prières en bandeau défilant en
  haut de la carte ; onglets défilants. La carte occupe tout ce que le panneau lui laisse.

## M15 – Sauvegarde et reprise (2026-09-12)

- **Sauvegarde complète du moteur** (`packages/core/src/sauvegarde.ts`, `Simulation.sauvegarder()`
  et `Simulation.restaurer()`) : sérialisation structurelle de tout l'état (personnages avec
  mémoire, relations et générateurs aléatoires, bâtiments, troupeaux, bétail, danger, faveur,
  question ouverte et file des conseils, compteurs, météo), avec des marqueurs pour ce que JSON
  ne dit pas (Map, Set, Infinity, Rng, flux de mémoire). Les tuiles se regénèrent de la graine ;
  seuls les gisements, les découvertes et les bâtiments de chaque morceau sont sauvés. Le
  journal garde ses trois mille derniers événements et tous ses compteurs. Un monde restauré
  continue **à l'identique** (test : mêmes soixante jours de journal après restauration, avec
  des miracles et une question ouverte). Format versionné (`format`, `version`), refusé s'il
  ne correspond pas.
- **Côté page** (mode local, mobile et page publiée) : bouton « 💾 » à côté de « Nouveau
  monde », boîte de dialogue pour sauver sous un nom, reprendre ou supprimer ; sauvegarde
  automatique « auto » au plus une fois par minute quand le monde a avancé, et dès que la page
  passe à l'arrière-plan ; au chargement, un bouton « ↩ Reprendre la partie (jour N) » propose
  la dernière sauvegarde automatique. Rangé dans IndexedDB du navigateur : quelques mégaoctets
  (4 Mo à 30 jours, 12 Mo à 300 jours, un quart de seconde à écrire) sans limite gênante, mais
  propre à l'appareil et au navigateur.
- Pas encore : une sauvegarde partagée entre appareils (base de l'artefact ou fichier),
  l'export en fichier (bloqué dans la page publiée), une sauvegarde côté serveur.

## M14 – Le mode Dieu, v2 : foi, prières, autel, réputation, trois pouvoirs, lisibilité (2026-09-12)

- **Foi** : chaque personnage a une foi de 0 à 10, née de ses valeurs (tradition ou harmonie 3,
  curiosité ou liberté 1, sinon 2), héritée à moitié des parents, nourrie par les miracles vus
  (+1 pour un bienfait, +2 pour une épreuve, +2 pour une prière exaucée) et usée d'un point par
  saison sans miracle, jamais sous la foi native des valeurs. Le témoin d'un miracle y voit la main du ciel (« Le ciel nous a fait une
  grâce ») ou une chance / un malheur selon sa foi et la **réputation** du dieu (−10..10 :
  +1 par bienfait, −2 par épreuve ; un dieu redouté voit ses grâces mises sur le compte du
  hasard, un dieu vénéré ses coups sur celui du sort). Jauge de foi dans la fiche, foi moyenne
  dans Statistiques, réputation dans la barre de pouvoirs.
- **Prières** : intention et action `prier` (adulte de foi ≥ 3, une fois par jour, jamais à la
  place d'une urgence : un moment pris entre deux tâches quand la faim, le froid, la sécurité ou
  le moral sont sous 40, que la faim ou le froid durent depuis des jours, ou qu'on est blessé ou
  malade) ; sujet tiré du besoin le plus criant (faim, froid, soin, sécurité, moral,
  protection) ; événement `priere`, souvenir, faveur +1. Une colonie ordinaire prie environ une
  fois par jour dans les périodes difficiles. Une prière reste ouverte trois jours : un bienfait qui y répond (Ondée ou
  Sève pour la faim, Braise ou Éclaircie pour le froid, Main qui guérit pour un soin, Souffle
  pour le moral…) sur la personne ou à dix tuiles l'**exauce** (foi +2, faveur +2, souvenir
  « Le ciel m'a entendu »). Les prières en attente s'affichent en mode Dieu, en haut à droite de
  la carte, avec les pouvoirs qui les exaucent ; un clic ouvre la fiche.
- **Autel** : nouveau bâtiment (quatre pierres, deux bois, travail 8), bâti par une famille
  logée dont la foi moyenne atteint 5 (un par village). On y va prier quand il est à vingt
  tuiles, et l'on y laisse une **offrande** de nourriture (faveur +2 de plus).
- **Trois pouvoirs** : Troupeau offert (16 ✦, dix jours : quatre mouflons paissent sur la tuile,
  à chasser ou apprivoiser), Idée soufflée (12 ✦ : l'invention qui manque devient une idée),
  Loups au bord du halo (12 ✦, épreuve : une meute affamée arrive et devient la menace du
  soir, prise en charge par le directeur de danger ; refusée si une menace est déjà ouverte).
  Touches 1 à 9 puis 0 ; les deux derniers pouvoirs se choisissent au clic.
- **Lisibilité** : une pastille « ❓ Inès demande conseil » dans la barre ouvre d'un clic la
  fiche du demandeur ; la fiche montre la question telle que le moteur l'a posée (motifs en
  clair, options proposées) puis la réponse de Claude (option choisie, pensée, but) ou la raison
  d'une question sans suite ; le dernier conseil reste visible. Les lignes du Journal sont
  cliquables (fiche de la personne concernée). L'aide de la barre de pouvoirs explique la
  faveur ; le Journal dit ce qu'une prière demande et quelle prière un miracle a exaucée.
- **Vitesses** ×128 et ×256 (la liaison locale plafonne à 480 ticks par seconde, le serveur à
  256 par pas).
- Calibration : la prière est une action de plus dans la journée des croyants, et les
  trajectoires changent (mêmes graines, autres histoires). Sur cinq graines et 450 jours, sans
  aucune intervention : 18, 16, 17, 28 et 15 vivants (graines 7, 42, 11, 2024, 99), soit la
  même moyenne qu'en M12 (19), sans effondrement : le monde de la graine 42, qui tombait à 6,
  tient à 16 ; les graines 7, 11 et 99 perdent quelques vivants dans des hivers de famine.
- Pas encore (v3) : les épreuves lourdes (gel précoce, sécheresse, fièvre envoyée, secousse),
  l'Épiphanie, les niveaux de culte et le gardien de l'autel, les leçons « le ciel écoute » /
  « le ciel frappe » / « ne pas attendre le ciel », la migration conseillée.

## M13 – Le mode Dieu et le conseil de Claude (2026-09-12)

Deux façons d'influencer sans jamais commander : l'observateur exerce des pouvoirs sur le
monde (les personnages interprètent, ils n'obéissent pas), et un personnage à court d'idées
peut demander conseil à Claude, qui choisit dans un catalogue fermé que le moteur applique.

- **Faveur** : l'observateur dispose d'une faveur (✦, 20 au départ, plafonnée à 40) qui monte
  d'un point par jour simulé et quand la colonie prospère (naissance +3, union +2, invention
  +4, leçon +2, bâtiment terminé +1). Chaque pouvoir a un coût et une recharge en jours.
- **Neuf pouvoirs** (`packages/core/src/monde/divin.ts`, catalogue `FICHES_POUVOIR` dans le
  protocole) : Ondée (6 ✦, pluie du jour, baies et fibres regarnies à huit tuiles, champs
  poussés d'un stade), Éclaircie (8 ✦, ciel dégagé), Sève (12 ✦, gisements et souches
  regarnis à six tuiles), Souffle (4 ✦, sur une personne : moral +15 trois jours, fatigue
  effacée), Main qui guérit (14 ✦, plaies fermées, maladies guéries avec immunité, santé +30),
  Braise (5 ✦, sur un feu : rallumé avec vingt bûches ; sur un autre bâtiment : solidité +30),
  Foudre (15 ✦, épreuve : bâtiment −40 de solidité ou feu embrasé, brûlure de gravité 2 à une
  tuile, sécurité −30 et peur à huit tuiles, l'orage arrive), Songe (10 ✦, une personne
  apprend en rêve la leçon qui lui manque le plus), Regard (2 ✦, sans recharge : le brouillard
  se lève à douze tuiles, sans que la colonie le sache). Un miracle ne touche que le monde
  déjà généré, refuse une cible vide ou sans effet (rien n'est payé), et le témoin éveillé le
  plus proche s'en souvient (« Le ciel nous a fait une grâce… » / « Le ciel nous a
  frappés… ») avec une humeur de trois jours. Événement `divin` (pouvoir, effet, témoin,
  réaction) ; même graine, mêmes miracles aux mêmes ticks, même monde.
- **Demander à Claude** (`packages/core/src/cerveau/conseil.ts`) : le soir, après la
  réflexion, un adulte dont les motifs mesurables pèsent assez entre dans la file (quatre au
  plus) : besoin ressenti sans idée trois soirs de suite (2), inconfort chronique — trois
  jours de faim ou de froid, quatre de moral bas — (3), quatre échecs de suite (3), aucun
  projet ni bâtiment nécessaire (1) ; seuil 2. Une seule question ouverte à la fois, quatre
  par jour au plus (`brain.conseilsParJour`), cinq jours de silence par personne, expiration
  au bout d'un jour. La question porte un contexte compact construit par le moteur (identité,
  besoins, inconfort, village, savoirs, souvenirs) et un catalogue fermé de neuf options au
  plus : `invention:<id>` (besoin ressenti), `batiment:<type>` (prérequis vérifiés),
  `lecon:<id>` (les plus utiles), `priorite:<provisions|chaleur|social|soin|explorer>`,
  `explorer:<direction>` (là où il reste à découvrir).
- **Application déterministe** : une invention devient une idée (force 0,6, origine
  « Claude »), une leçon est retenue, un bâtiment passe devant dans les besoins de
  construction (le site, l'approvisionnement et la fondation restent ceux du moteur), une
  priorité vaut +0,35 sur les candidats concernés du cerveau à règles, une direction oriente
  l'exploration (la direction voulue et ses voisines, deux fois plus loin). Chaque conseil
  pose une **ambition** (but, pensée, échéance de 3 à 20 jours) suivie chaque aube :
  accomplie (prototype réussi, bâtiment achevé, douze lieux découverts, échéance tenue) ou
  abandonnée ; événements `conseil` (question, réponse appliquée ou non, raison) et
  `ambition`, souvenirs et humeur. Un choix hors catalogue ne change rien et ferme la question.
- **Le bouton de l'observateur** : « Demander conseil » dans la fiche fait poser sa question
  tout de suite (une par jour et par personne), en passant devant une question ouverte par le
  moteur.
- Protocole : `POUVOIRS`, `FICHES_POUVOIR`, `FaveurEtat`, `QuestionConseil` (contexte et
  options), `MessageEtat.faveur` et `.questions`, `MessageFiche.ambition` et
  `.conseilPossible`, `Statistiques.ambitions` et `.miracles` ; commandes `pouvoir`,
  `conseil`, `demander_conseil` validées et bornées. Le paquet `@sdv/core` dépend désormais de
  `@sdv/protocole` (le catalogue des pouvoirs est le contrat commun).
- Viewer : bouton « ✨ Dieu » (touche `g`) qui ouvre une barre de pouvoirs flottante en bas de
  la carte (jauge de faveur, pastilles avec coût, recharge grisée, touches 1 à 9) ; un pouvoir
  armé se pose d'un clic sur une tuile connue, une personne ou un bâtiment (halo de visée
  tireté, rouge sur l'inconnu ; clic droit ou Échap désarment) ; sur écran tactile, un toucher
  pose le réticule et le bouton « ✓ Ici » (ou un appui long) applique ; refus signalé par une
  secousse. Effets dessinés une seconde (pluie, éclair et flash, anneaux, pousses, braise,
  lune), coupés sous `prefers-reduced-motion`. Bouton « 💬 Conseils » à côté de « 🧠 Claude »
  (sur claude.ai) : quand une question s'ouvre, la page la met en mots, Claude répond en JSON
  strict, une seule relance en cas de choix hors catalogue, puis fermeture propre ; badge du
  nombre de questions en attente, « ? » au-dessus de la tête du demandeur. Fiche : bloc
  « Ambition » (but, échéance, issue) et bouton « Demander conseil » ; Statistiques : « Où ils
  vont » (ambitions en cours, cliquables), miracles et faveur ; Journal : miracles, conseils,
  ambitions.
- Sans intervention de l'observateur ni de Claude, les mondes sont ceux de M12 (mêmes
  trajectoires sur les graines 7 et 42 à 450 jours) : les questions s'ouvrent et expirent sans
  rien changer.
- Pas encore (phases suivantes du mode Dieu) : la foi des personnages et l'attribution du
  miracle au ciel ou au hasard, les prières et l'autel, la réputation du dieu, les épreuves
  lourdes (gel précoce, sécheresse, fièvre envoyée), le troupeau offert, l'idée soufflée, la
  migration conseillée.

## M12 – Le village apprivoise (jalon 5 de la feuille de route) (2026-09-12)

- **Capture et apprivoisement** : après une chasse réussie, avec une corde en poche, un jeune
  d'une espèce docile peut être ramené vivant (mouflon 0,7, aurochs 0,4, lièvre 0,3, sanglier
  0,2 ; le cerf et le loup jamais ; chance = docilité × 0,8, la corde est consommée). La bête
  (`Bete` : espèce, famille, maître, docilité, faim d'hiver, née en captivité) suit son maître
  à deux tuiles tant qu'il n'y a pas d'enclos, et une bête peu docile finit par s'échapper.
  Événements `capture` et `betail` (naissance, lait, laine, famine, fuite).
- **Enclos et élevage** : nouveau bâtiment `enclos` (six bois, quatre fibres, stock de douze),
  bâti dès qu'une famille a une bête ; les bêtes y restent ; un mouflon ou un aurochs adulte
  donne du lait tous les deux jours (nouvelle nourriture, 20, qui tourne en deux jours), un
  mouflon donne six fibres de laine au printemps, deux adultes de la même espèce font un petit
  au dixième jour du printemps une fois sur deux (né docile), et l'hiver les bêtes broutent les
  fibres à six tuiles de l'enclos, ou son stock, ou dépérissent en dix jours. Quand la faim
  presse et qu'on ne connaît rien d'autre à manger, on **abat** une bête de la famille
  (intention `abattre`, sa viande et son cuir).
- **Semis, champs, sols** : les baies donnent parfois des graines (une fois sur dix) ; à la belle
  saison, une famille qui en a quatre bâtit un `champ` (les graines sont les matériaux, le
  champ achevé est semé) ; la culture pousse d'un stade tous les douze jours (semé, levée,
  pousse, épis, mûr) ; mûr, la tuile devient un gisement de baies cultivées (24, plus 8 % par
  niveau d'agriculture), récolté comme les autres, ce qui forme le paysan ; le gel du premier
  jour d'hiver emporte ce qui n'est pas mûr ; un troupeau qui passe piétine un stade ; deux
  récoltes de suite épuisent la terre (rendement −30 % par récolte) et une année sans semis la
  rend ; au printemps, un champ vide est ressemé avec les graines du stock familial.
  Événements `semis` et `champ` (levée, mûr, gel, ravage, jachère).
- **Métiers** : un titre tiré de la pratique (« pêcheuse », « chasseur », « bâtisseuse »,
  « guérisseur », « paysanne »…) dès le niveau 3 de la compétence la plus pratiquée, la
  cueillette comptant moitié ; affiché dans la fiche et la liste de la population.
- Viewer : enclos et champs dessinés (les sillons changent de couleur avec le stade), bêtes
  apprivoisées sur la carte, fiche du champ (stade, récoltes de suite) et de l'enclos,
  compteurs de bêtes et de champs dans Statistiques, événements du bétail et des champs dans le
  Journal.
- Pas encore : le fromage, le bœuf qui tire le traîneau, les chaînes de production (cuir
  tanné, pot cuit, tissu, cuivre), la rouille des compétences et le maître-apprenti, la propriété
  commune et l'emprunt, le troc.
- Sur cinq graines et 450 jours : 20 à 24 vivants sur quatre mondes (trois à six champs
  par monde, six à onze semis, six à huit récoltes mûres, des greniers de graines) ; le monde
  de la graine 42, le plus pauvre en baies et en poisson, subit une famine au deuxième hiver
  (six vivants) : c'est le prochain chantier d'équilibrage. Les captures restent rares (la
  corde manque), deux sur la graine 42.

## M11 – Le temps compte (jalon 4 de la feuille de route) (2026-09-12)

- **Périssabilité** : chaque pile de nourriture a un âge (moyenne pondérée quand on mélange,
  emporté quand on transfère). À l'air libre : baies six jours, poisson quinze, gibier cinq,
  repas cuit douze, poisson fumé quatre-vingt-dix, grain trois cents. Une pile a un âge moyen ; passé la moitié de sa
  durée de vie, le plus vieux se gâte chaque jour (un `vie`-ième de la pile, ce qu'on a rentré
  il y a `vie` jours ; événement `pourriture`) : une réserve renouvelée se maintient au lieu de
  disparaître d'un coup. L'entrepôt conserve deux fois plus longtemps,
  l'automne deux fois et demie, l'hiver quatre fois : les provisions d'automne tiennent l'hiver,
  celles de l'été non. Voir son poisson se gâter donne l'idée du fumoir. Manger gâté donne le
  mal des ventres trois fois sur dix.
- **Bois de chauffe** : un feu a une réserve (vingt bûches au plus) ; à la belle saison il couve
  sans rien consommer, en saison froide il brûle une bûche par jour, deux sous la neige ; à sec, il s'éteint
  (`feu_eteint` « plus de bois »). La famille l'alimente dès que la réserve passe sous quatre
  bûches en saison froide (à la belle saison, seulement s'il est éteint) ; un feu éteint qui a encore des bûches se rallume sans
  rien apporter, et le feu familial éteint pèse lourd dans le choix de construire. La fiche du
  feu montre la réserve.
- **Usure et réparation** : un outil ébréché (solidité sous 25) se répare deux fois, avec une
  bûche et trois ticks (intention `reparer`, événement `reparation`).
- **Eau souillée** : une tombe à moins de quatre tuiles d'un point d'eau le souille ; boire
  une eau souillée donne la fièvre des eaux trois fois sur cent ; un puits n'est jamais
  souillé ; on enterre désormais à l'écart de l'eau quand on le peut, et mourir de la fièvre
  des eaux enseigne « un puits près du village ».
- **Maladies** : quatre au catalogue. Refroidissement (une journée à grelotter : 10 %, quatre
  jours, 2 de santé par jour), fièvre des eaux (huit jours, 4 par jour, immunisante), mal des
  ventres (quatre jours, 2 par jour, faim ×1,3), toux grise (douze jours, 3 par jour,
  contagieuse à deux tuiles à 2 % par heure, immunisante). Un enfant ou un ancien perd une fois
  et demie plus ; la durée dépend de l'immunité innée ; un cataplasme retire trois jours. Le
  malade se repose, les autres évitent de lui parler (quarantaine instinctive). Une épidémie de
  toux grise au plus tous les deux ans, à partir du deuxième hiver (événement `epidemie`). La
  cause de décès nomme la maladie.
- Viewer : teint pâle des malades, maladies et jours restants dans la fiche, réserve de bois
  dans la fiche du feu, compteur de malades dans Statistiques, événements de pourriture, de
  maladie, de guérison, d'épidémie et de réparation dans le Journal.
- Pas encore : le calque de salubrité, la fosse et le nettoyage, les ruines, les caches
  d'expédition et le coût des distances.
- Équilibrage : la première version tuait la colonie au premier hiver (poisson gâté en trois
  jours, feux voraces, fièvre des eaux en spirale autour des tombes) ; corrigée par la
  conservation par le froid, des feux moins gourmands, le rallumage sans bois, les tombes
  loin de l'eau et la première épidémie repoussée au deuxième hiver.
  Sur cinq graines et 450 jours : 15 à 24 vivants, un à cinq décès par monde (couches, berceau,
  infection, une faim) ; 900 à 1 500 bûches livrées aux feux par monde, quelques feux éteints
  faute de bois, 60 à 90 réparations d'outils, une épidémie de toux grise par monde au
  deuxième hiver, sans mort.

## M10 – La nuit menace (jalon 3 de la feuille de route) (2026-09-12)

- Le premier danger extérieur : les meutes de loups s'en prennent au village, et la colonie
  apprend à répondre. Un **directeur de danger** tient un budget d'une menace par saison,
  une à la fois, et laisse trente jours de grâce à la colonie qui s'installe. Une meute
  affamée à moins de quarante tuiles du village devient une menace : un humain éveillé qui
  passe à quinze tuiles relève des **traces** (événement `menace`), la meute rôde à une douzaine
  de tuiles le jour, puis, au crépuscule suivant (au moins une demi-journée de préavis), elle
  choisit sa **proie** : l'enfant, l'isolé, le dormeur à la belle étoile ; jamais un groupe de
  trois, jamais à moins de quatre tuiles d'un feu allumé, jamais quelqu'un à l'abri ou derrière
  une enceinte ; à l'aube, elle renonce et un répit de deux jours s'ouvre. Quand le gibier a
  disparu à trente tuiles à la ronde et qu'aucune meute ne rôde, la chasse en attire une la
  nuit (événement `faune` « arrivée »).
- **Alarme, fuite, entraide** : quiconque est éveillé et voit la meute (à la portée de vue de
  la nuit, un veilleur au feu un peu plus loin) crie l'alarme, qui porte à douze tuiles
  (événement `alarme`, un « ! » au-dessus des têtes). Les enfants et les adultes sans arme
  courent à l'abri, sinon près d'un feu, sinon vers l'adulte le plus proche (intention `fuir`) ;
  les adultes armés (lance, arc, hache) vont se placer auprès de la personne visée
  (intention `defendre`, action de garde de douze ticks).
- **Combat déterministe** (`combattre`) : six rounds au plus ; deux loups engagés sur une
  personne seule, trois face à un groupe, chacun mordant à 30 % (moins face à plusieurs
  défenseurs) ; morsure légère six fois sur dix, moyenne sinon, grave trois fois sur cent, un
  cran de moins sous un vêtement de cuir ; les défenseurs (la cible et les adultes éveillés à
  deux tuiles) frappent à 25 % + 20 % avec une lance, 12 % à l'arc, 10 % à la hache, + 3 % par
  niveau de chasse, et un coup tue le loup quatre fois sur dix ; la meute renonce dès deux
  loups tués ou trois blessés ; la proie se dérobe sous 40 de santé ou, mordue, au sixième
  round. Un seul événement `combat` résume tout (issue repoussés / fuite / mort). Après le
  combat, la meute fuit, se méfie et, si elle a tué, mange cinq jours.
- **Défenses passives** : la palissade bloque enfin les bêtes (aucun animal ne passe une tuile
  bâtie) ; une position est **enclose** si l'on ne peut s'en éloigner de six tuiles sans
  franchir un bâtiment terminé, de l'eau ou une montagne ; deux **leçons** nouvelles, tirées
  d'une mort par les loups ou des suites d'une morsure (« des murs contre les loups »,
  « un veilleur de nuit », plus « les enfants d'abord ») ; qui a retenu la première bâtit une
  **enceinte** de pieux à trois tuiles autour de l'abri familial (palissade : deux bois, quatre
  de travail ; l'eau et la montagne ferment d'elles-mêmes). Qui a retenu la seconde **veille**
  la nuit près du feu, lance en main, quand personne d'autre ne veille (intention `veiller`).
- Les blessures gardent leur contexte (« sous les crocs des loups ») ; l'infection d'une
  morsure passe de 25 à 15 % par jour, sinon les morsures emportaient trop de monde.
- Viewer : « ! » au-dessus des personnes en alerte, yeux jaunes sur la meute qui rôde la nuit,
  événements `menace`, `alarme`, `combat` et arrivée d'une meute dans le Journal, compteur
  d'attaques dans Statistiques, souvenirs des traces, de l'alarme et des combats.
- Pas encore : l'ours, les portes et la tour de guet, le bouclier et l'armure, le chien.
  Sur cinq graines et 450 jours : 22 à 28 vivants ; de zéro à quatorze menaces par monde selon
  la proximité des meutes, un à cinq combats, aucune mort sous les crocs, deux morts des suites
  d'une morsure (infection) ; les enceintes de pieux apparaissent d'elles-mêmes après la
  première leçon (16 à 86 pans de palissade par monde).

## M9 – La faune vit (jalon 2 de la feuille de route) (2026-09-12)

- Le gibier immobile disparaît des gisements : le monde est peuplé de troupeaux mobiles
  (cerfs, sangliers, mouflons, lièvres, aurochs) et de meutes de loups. Chaque morceau du monde
  est peuplé à sa génération d'après ses biomes, avec un flux aléatoire propre au morceau
  (même graine, même faune). Un troupeau a un gîte, une pâture (rayon 10 à 24 tuiles selon
  l'espèce, élargie à l'automne, le rut), rentre au gîte la nuit, fuit l'humain qui approche
  (de près quand il n'a jamais été chassé, de loin quand il est méfiant) et se fige quand aucun
  humain n'est à moins de 48 tuiles.
- Chasse : les bêtes aperçues deviennent des lieux de gibier dans la mémoire des lieux ; une
  lance (recette désormais sans niveau requis), un arc ou un piège permettent de chasser.
  Nouvelle action `chasser` : on s'approche à portée (trois tuiles, six à l'arc), puis on tente
  sa chance. Seul, on réussit deux à quatre fois sur dix selon l'espèce ; chaque rabatteur à
  moins de six tuiles ajoute deux dixièmes ; l'arc ajoute un dixième et demi et rapporte
  parfois deux bêtes ; la méfiance du troupeau retire jusqu'à trois dixièmes. Réussie ou non,
  la chasse fait fuir le troupeau et le rend méfiant ; un sanglier ou un aurochs acculé mord le
  chasseur qui le rate. Une bête donne sa viande et son cuir (un cerf : quatre gibiers, deux
  cuirs ; un aurochs : huit et trois ; un lièvre : un et rien). Le cerveau à règles chasse
  quand il voit des bêtes, d'autant plus qu'il a faim, qu'il manque de cuir ou que d'autres
  rabattent déjà, et ne compte plus sur le gibier pour manger tout de suite.
- Forêt durable : un arbre abattu laisse une souche qui ne repousse qu'après 180 jours.
- Pêche durable : les bancs de poissons croissent par bassin (carré de 8 × 8 tuiles) suivant
  une loi logistique (croissance 0,2 par jour à mi-charge), un bassin presque vide se repeuple
  d'un poisson par jour depuis les bassins voisins.
- Calendrier : mises bas au dixième jour du printemps (25 à 80 % selon l'espèce, freinées par
  la densité), mortalité d'hiver par bête, migration des herbivores vers la forêt au premier
  jour de l'hiver et retour au printemps, rut à l'automne.
- Démographie : scission des grands troupeaux, disparition des troupeaux vidés ; une meute
  affamée prélève une bête sur une proie à moins de six tuiles puis se repose trois jours, et
  perd un loup après vingt jours sans proie. Les proies sentent la meute à six tuiles et fuient.
  Sur cinq graines et 450 jours, les loups s'éteignent souvent (les proies leur échappent) :
  les prédateurs seront revus avec le jalon « la nuit menace ».
- Viewer : les bêtes sont dessinées sur les tuiles connues (une à trois silhouettes, le nombre
  au-delà), interpolées entre deux états ; tableau « Faune » et bilan des chasses dans
  Statistiques ; événements `chasse` et `faune` (naissances, scission, migration, retour,
  hiver, disparition, meute) dans le Journal ; les souvenirs racontent les chasses.
- Sur cinq graines et 450 jours : 22 à 28 vivants, huit décès nommés (quatre en couches, deux
  au berceau, une faim, une soif) ; 15 à 89 chasses réussies par monde, 2 à 16 battues à
  plusieurs ; les troupeaux prospèrent ou s'épuisent selon la pression de chasse.

## M8 – Le corps (jalon 1 de la feuille de route) (2026-09-12)

- Un personnage peut être diminué sans être mort. Le corps porte un état (`EtatCorps`) :
  blessures, fatigue, carence, handicaps, cicatrices, derniers repas. La santé ne bouge plus que
  par des sources de dégâts nommées (soif, froid, faim, hémorragie, infection, carence), et la
  cause de décès est la source dominante. Quatre capacités dérivées (mobilité, manipulation,
  vue, vigueur) sont lues par la vitesse, la récolte et la vision ; elles déclinent avec l'âge
  (vue et vigueur après 40 ans, mobilité après 50).
- Blessures : coupures au bois (0,5 % par récolte), morsures à la chasse (3 %),
  fractures en montagne sous l'orage ; gravité 1 à 3, saignement (4, 8 ou 15 points de santé par
  jour, une plaie légère s'arrête seule en un jour, une moyenne en trois, une grave jamais),
  infection (10 % par jour, 25 % pour une morsure, trois fois moins sous bandage) avec huit
  jours de fièvre, guérison en 4 jours par degré de gravité (30 pour une fracture), cicatrice
  dès la gravité 2, séquelle possible (boiterie, main raide) sur une fracture non immobilisée.
  Compétence « soin » : elle accélère la guérison et divise les accidents par deux au niveau 5.
- Soins : le bandage (déjà au catalogue, enfin utile) arrête le saignement ; le cataplasme
  (deux herbes, nouvelle ressource des prairies et forêts) ramène la fièvre à deux jours ;
  l'attelle (bois + corde) immobilise une fracture. Deux nouvelles intentions : `soigner`
  (soi-même ou un blessé à portée) et `se_reposer` (à l'abri de préférence) ; la convalescence
  ne répare qu'au repos, au chaud, sans saigner (5 points par jour, 2 sinon, 0 en saignant).
  Le cerveau à règles bande d'abord ce qui saigne (urgence), fabrique ce qui manque, soigne un
  voisin qu'il voit souffrir, et garde un bandage sur lui quand il a retenu la leçon.
- Fatigue : une dette d'effort distincte du sommeil ; une journée de travail ajoute 25 à 45
  points selon l'endurance et la charge, une nuit de sommeil (les nuits sont courtes, 25 à 35
  ticks) en efface 60 à 80 ; au-delà de 60 la manipulation
  et la mobilité baissent, au-delà de 85 c'est l'épuisement (accidents triplés, sommeil forcé la
  nuit, humeur −8).
- Nutrition : quatre familles d'aliments (baies, poisson, viande, cuit) ; vingt repas d'une
  seule famille (neuf repas sur dix) donnent une carence bénigne mais visible (gencives pour le
  poisson : 1 point de santé par jour ; ventre creux pour les baies : faim ×1,15), qui ne
  s'efface qu'une fois le régime revenu sous sept repas sur dix.
- Humeur : le moral cible additionne des modificateurs datés (blessure, fièvre, séquelle,
  carence, épuisement, guérison, deuil, naissance), bornés à ±40, qui s'effacent sur leur
  dernier quart.
- Naissances : 3 % de mortalité maternelle (×2 en mauvaise santé ou après 40 ans, ÷2 avec une
  accoucheuse à portée, ÷10 si elle a retenu la leçon « accoucheuse »), nouveau-né à 60 de
  santé, mort au berceau rare avant deux ans (modulée par l'immunité). Événement
  `accouchement` avec l'accoucheuse et le risque.
- Deux leçons de plus au catalogue : « soigner les blessés » (mort d'hémorragie ou
  d'infection) et « accoucheuse » (mort en couches).
- Les tombes se creusent sur la tuile libre la plus proche, un mort à l'abri n'y est plus
  enterré sans tombe.
- Viewer : bandeau rouge sur les personnages blessés ; sections « Corps » (fatigue, blessures
  et leur état, handicaps, carence, cicatrices, capacités diminuées) et « Humeur » dans la
  fiche ; huit nouveaux événements dans le Journal ; les herbes dessinées sur la carte.
- Équilibrage : première version trop dure (tout le monde épuisé au vingtième jour, personne
  ne récoltait plus) ; corrigée en calibrant l'effort par tick, la récupération graduée
  (sommeil, repos, calme) et en ne laissant pas le repos passer avant la faim.
  Sur cinq graines et 450 jours (quatre hivers) : 21 à 27 vivants, neuf décès en tout, tous
  nommés : cinq en couches, trois au berceau, un de carence ; trois à dix blessures par monde,
  toutes soignées ou guéries, aucune séquelle encore.

## M7c – Dix inventions et les hivers suivants (2026-09-12)

- Équilibrage : l'ancienne version s'effondrait au deuxième hiver, quand la colonie avait grandi.
  Causes trouvées en rejouant 450 jours : les entrepôts s'usaient et disparaissaient avec les
  provisions ; les enfants héritaient de pierres qui remplissaient leur sac et ne pouvaient plus
  recevoir à manger ; les naissances dépassaient ce que dix adultes pouvaient nourrir. Désormais
  l'usure des bâtiments est deux fois plus lente (0,5 par jour, 3 sous l'orage) et la réparation
  prioritaire, le stock d'un bâtiment effondré passe au stock familial le plus proche, la
  nourriture offerte à quelqu'un dont le sac est plein se mange sur place, un enfant n'hérite
  que de quoi manger, les enfants mangent moins (×0,7), une femme n'a pas plus d'un enfant par
  an (délai de 120 jours, probabilité 0,15). Trois graines sur 450 jours, soit quatre hivers :
  un décès au total.
- Six inventions de plus (dix au catalogue) : l'arc (gibier doublé, remplace la lance), le
  fumoir (bâtiment ; le poisson fumé nourrit 50 au lieu de 35 ; l'idée suffit à lancer le
  chantier et le bâtiment achevé vaut prototype réussi), la couche de fibres (sommeil
  réparateur et moins de froid à l'abri), le traîneau (six places de plus dans le sac), la
  flûte (veillée qui remonte moral et lien social) et le vêtement de cuir (le gibier donne
  désormais du cuir, la recette passe au niveau 1). Nouvelle leçon « des vêtements chauds »
  quand on meurt de froid sans cuir sur le dos, qui pousse à chasser pour le cuir.
- Viewer : fumoir dessiné avec sa fumée, poisson fumé et cuir nommés, veillées à la flûte dans
  le Journal.
- Sur deux graines et 450 jours : les dix inventions apparaissent, trois fumoirs bâtis par
  monde, 125 à 195 parties et veillées.

## M5 – Cerveau Claude, dans la page (2026-09-12)

- Principe : Claude n'appelle aucune API payante. La page publiée sur claude.ai demande à Claude
  sur le compte de la personne qui la regarde (capacité `sample` de la page : consentement au
  premier appel, usage compté sur l'abonnement, aucune clé ni facture à part). Hors de
  claude.ai, le bouton n'apparaît pas et le mode règles continue seul.
- Ce que Claude écrit, et seulement cela : la pensée intérieure du personnage sélectionné (dans
  sa voix, à partir de sa fiche : besoins, intention, famille, savoirs, derniers souvenirs),
  l'épitaphe d'un défunt avec la leçon du catalogue qu'il juge la plus juste, le récit d'une
  invention réussie. Le moteur reste déterministe : il reçoit une commande `inspiration` (texte,
  et pour une épitaphe un identifiant de leçon), l'applique (`Simulation.inspirer`) et la
  journalise sous le type `claude` pour le rejeu.
- Sobriété : un appel à la fois, jamais en boucle ni au fil du temps ; un décès ou une invention
  déclenche un appel, la pensée du personnage sélectionné est rafraîchie au plus toutes les
  minutes et seulement si son intention a changé (sinon toutes les trois minutes). Refus ou
  indisponibilité désactivent le bouton, une saturation attend cinq minutes.
- Viewer : bouton « 🧠 Claude » dans la barre (page publiée seulement), pensée marquée 🧠 dans
  la fiche, événements « 🧠 … » dans le Journal, compteur « appels IA » dans les Statistiques.
  Le serveur accepte aussi la commande `inspiration`.
- Tests : 183 au total (+6) : inspirations côté moteur (pensée, récit, épitaphe avec leçon,
  leçon inconnue ignorée), cerveau côté page avec un faux Claude (épitaphe et leçon à un décès,
  pensée du personnage sélectionné sans enchaîner les appels, désactivation hors claude.ai).

## M7b – Savoirs : leçons et inventions (2026-09-12)

- Leçons tirées des décès : à chaque mort, le moteur fait l'autopsie de la situation (cause,
  saison, besoins, abri à portée, stocks des autres familles, puits) et en déduit une ou deux
  morales parmi cinq : provisions avant l'hiver, rentrer quand on gèle, les enfants d'abord,
  partager en hiver, un puits au village. La famille, le partenaire, les amis et les témoins
  proches les retiennent (souvenir d'importance 8, événement `lecon`), une tombe est dressée
  sur place avec la morale gravée en épitaphe.
- Les savoirs changent les décisions : seuil de froid relevé et retour à l'abri plus tôt,
  provisions dès l'été et avec plus d'ardeur, dons de nourriture aux autres familles en saison
  froide et aux enfants d'abord, construction d'un puits.
- Inventions : quatre inventions dans un catalogue fermé que le moteur sait appliquer. Le filet
  (pêche doublée), le piège (gibier sans lance), la pirogue (traverser l'eau profonde, donc
  atteindre d'autres rivages du monde sans limite) et les osselets (partie entre deux personnes
  qui remonte le moral). Un besoin ressenti et de la curiosité donnent une idée le soir
  (événement `idee`), puis un prototype qui peut rater (`prototype_rate`) avant de réussir
  (`invention`, importance 9) ; une idée jamais réalisée s'efface en vingt jours ; on réinvente
  rarement ce qu'un autre sait déjà.
- Transmission : un savoir passe par le dialogue (« Depuis la mort de Timéo, on le sait… »,
  « Tu sais quoi ? … »), avec son origine, et les adolescents héritent des savoirs de leurs
  parents. Sur quatre mondes et 220 jours : les quatre inventions apparaissent, une vingtaine de
  porteurs chacune, 15 à 28 parties d'osselets.
- Protocole, serveur, viewer : fiche « Savoirs » (📜 leçons, 💡 inventions, idées en cours,
  origine au survol), tableau « Savoirs du village » dans les Statistiques, épitaphe sur la
  carte d'une tombe, nouveaux événements dans le Journal.
- Tests : 177 au total (+7) : autopsie, tombe et apprentissage familial, effet d'une leçon sur
  l'urgence, transmission par le dialogue, idée → prototype → invention partagée, outils de
  remplacement, pirogue.

## M7a – Monde sans limite (2026-09-12)

- Moteur : la grille n'a plus de bords. Le monde est découpé en morceaux de 32 × 32 tuiles
  générés à la demande, dès qu'un personnage ou un calcul de chemin s'en approche, et chaque
  morceau ne dépend que de la graine et de ses coordonnées (l'ordre d'exploration ne change
  rien, coordonnées négatives comprises). Un bruit lent dessine continents et mers, un bruit
  plus fin le relief, et un « berceau » garantit à l'origine de la terre ferme avec un rivage
  à quelques tuiles (eau, poisson, argile). Empreinte de carte calculée sur les morceaux dans
  un ordre fixe ; rendu ASCII d'une zone au choix ; A* sur des clés de position sans limite.
- Configuration : `monde.largeur` et `monde.hauteur` disparaissent au profit de
  `monde.echelleRelief`, `monde.echelleContinents` et `monde.berceau` ; la CLI prend `--rayon`
  pour la carte affichée autour du berceau.
- Comportement : la colonie connaît d'emblée les environs du berceau (rayon 14) ; l'exploration
  se fait autour du foyer (36 tuiles, jamais au-delà de 54) au lieu de dériver à l'infini ;
  on va se réchauffer à un abri jusqu'à 80 tuiles ; quand on gèle et qu'une chaleur est à
  portée, on rentre avant de chercher à manger (sauf nourriture en poche) ; un enfant qui a
  froid ou que la nuit surprend va se mettre au chaud ; un inventaire plein n'empêche plus de
  prendre à manger dans un stock (on y dépose d'abord ce qui encombre) ; la canne à pêche se
  fabrique sans niveau d'artisanat. Sur cinq graines et 160 jours : aucun décès, 63 naissances.
- Protocole et serveur : `init` ne porte plus la carte ; l'état transmet les tuiles
  nouvellement découvertes avec leur biome (triplets x, y, biome), et les statistiques comptent
  tuiles découvertes, tuiles générées et morceaux.
- Viewer : la carte se construit au fil des découvertes, fond pré-rendu par morceau, brouillard
  et caméra sur la zone connue, berceau au centre au premier instant. Statistiques : tuiles
  découvertes et morceaux du monde.
- Tests : 170 au total (+2) : reproductibilité par morceau et indépendance de l'ordre de
  génération, absence de limite, berceau sur la terre ferme pour plusieurs graines, magasin
  par morceaux côté viewer. Le test de naissance passe à un horizon de 80 jours.

## M6 ter – Brouillard d'exploration (2026-09-12)

- Moteur : la grille retient les tuiles déjà vues par au moins un personnage (`decouvrir`,
  `estDecouverte`, `nombreDecouvertes`) ; `observer` les marque à chaque tick et le voisinage
  de départ est connu dès la création du monde.
- Protocole : l'état porte les tuiles nouvellement découvertes (différentiel par client, complet
  au premier envoi) et le rayon de vision courant ; les statistiques comptent la part du monde
  découverte.
- Viewer : brouillard d'exploration dessiné sur la carte. L'inconnu reste noir, ce qui a déjà
  été vu mais n'est plus sous les yeux est voilé, un halo de vision entoure chaque personnage
  (plus étroit la nuit et par mauvais temps). Bords adoucis, calque reconstruit seulement quand
  une tuile nouvelle apparaît. Touche `b` ou case dans la légende pour l'ôter ; tuile « monde
  découvert » dans les Statistiques ; la caméra cadre d'abord la zone connue. Le mode local
  démarre désormais avec 5 jours d'avance (au lieu de 20) pour assister à l'exploration.
- Tests : 168 au total (+4) : découverte côté moteur, différentiel côté serveur, magasin et
  cadrage côté viewer.

## M6 bis – Mode local et mobile (2026-09-12)

- Mode local : la simulation tourne dans la page elle-même (`LiaisonLocale`, mêmes messages
  que le serveur), sans serveur ni WebSocket. Activé par `?local` dans l'URL ou par la
  construction `pnpm --filter @sdv/viewer build:local` (fichiers relatifs dans `dist-local/`,
  publiables tels quels). Paramètres `?seed=` et `?jours=` (jours pré-simulés avant
  l'affichage, 20 par défaut), champ de graine et bouton « Nouveau monde » dans la barre.
  La pré-simulation se fait jour par jour sans bloquer l'affichage (« préparation du
  monde : jour x/y »). Le paquet `@sdv/server` expose son module d'instantanés
  (`@sdv/server/instantane`) pour cet usage.
- Tactile et petits écrans : déplacement à un doigt, zoom à deux doigts, toucher pour
  inspecter ; disposition en deux étages (carte puis panneaux) sous 900 px, en-tête compact
  sous 520 px, légende repliée derrière un bouton « ? », caméra cadrée sur le village au
  démarrage sur écran étroit.
- Robustesse : la fiche demandée après un état est diffusée au pas suivant (jamais de façon
  synchrone), et les listes lourdes (journal, population) ne sont redessinées qu'une fois
  par seconde, pour que les touchers atteignent bien leur cible.
- Tests : 164 au total (+1) : liaison locale de bout en bout (init, état, tick, pause, fiche,
  reprise, fermeture).

## M6 – Viewer (2026-09-12)

- Nouveau paquet `@sdv/protocole` : types des messages serveur ↔ viewer (`init`, `etat`,
  `fiche`, commandes) et petites fonctions pures (teinte de famille, voile nocturne, découpage
  des transcriptions).
- Nouveau paquet `@sdv/server` (`sim-serve`) : boucle temps réel à vitesse réglable
  (×1, ×4, ×16, ×64, pause, tick, saut à l'aube), diffusion de l'état par WebSocket (≤ 10 fois
  par seconde, gisements en différentiel, événements depuis le dernier envoi), fiche détaillée
  d'un personnage à la demande, pensée intérieure en mode règles, bilan des naissances et
  décès par saison, service statique du viewer construit.
- Nouveau paquet `@sdv/viewer` (Vite, TypeScript, canvas 2D, sans framework, aucune image
  externe) : rendu illustré dessiné en vectoriel. Fond pré-rendu avec biomes texturés, arbres,
  rochers, herbes, fleurs, vagues ; gisements en icônes (buissons de baies, bûches, arbres,
  rochers, poissons, gibier, touffes de fibres, argile) ; bâtiments dessinés (huttes, maisons
  aux fenêtres éclairées la nuit, entrepôts, fours, puits, palissades, tombes, feux qui
  vacillent avec halo nocturne, chantiers en pointillé avec barre d'avancement, fissures des
  bâtiments abîmés) ; personnages en petits bonshommes (vêtement à la couleur de la famille,
  contour selon le moral, teint et cheveux de l'identité, taille selon l'âge, animation de
  marche, sommeil allongé, grossesse), déplacements interpolés entre deux états pour un
  mouvement fluide ; prénoms au zoom, voile jour / nuit, bulles de dialogue, zoom à la
  molette, déplacement à la souris, survol des personnages et des bâtiments, clic pour
  inspecter un personnage ou un bâtiment (famille, propriétaire, solidité, stock, présents,
  avancement du chantier), mode « suivre ce personnage ».
- Panneaux : Personnage (pensée, intention, action, plan, besoins en jauges, famille cliquable,
  relations, inventaire, compétences, identité et personnalité, souvenirs marquants et
  récents), Journal filtrable par type, par personnage et par importance, Conversations avec
  transcriptions complètes, Statistiques (population, naissances, unions, générations,
  bâtiments, stocks, par saison, appels et coût IA), Population.
- Raccourcis clavier : espace (pause), → (tick), a (aube), + / − (vitesse), s (suivre),
  échap (fermer), f (recadrer).
- Scripts : `pnpm serve -- --seed 42 --jours 30` (construit le viewer puis lance le
  serveur sur http://localhost:8080), `pnpm viewer:dev` (Vite avec rechargement à chaud,
  proxy WebSocket vers le serveur).
- Dialogues : « à l'est » et « à l'ouest » plutôt que « au est ».
- Tests : 163 au total (+19) : protocole, instantanés, serveur WebSocket de bout en bout,
  caméra et formats du viewer.

## M4 – Vie et reproduction (2026-09-12)

- Couples : éligibilité (adultes de sexes opposés, non apparentés, libres sauf trait
  « volage », écart d'âge ≤ 15 ans), attirance qui croît au fil des conversations cordiales
  entre personnes éligibles, action `Courtiser` (acceptation selon attirance, affinité,
  compatibilité), union après trois cours réussies ; un partenaire est apparenté et accède
  aux bâtiments de l'autre.
- Reproduction : action `SeReproduire` (couple, abri, forme, femme féconde), probabilité de
  grossesse configurable réduite par la faim et la santé, le planificateur amène les deux
  partenaires à l'abri ; grossesse de 30 jours (faim ×1,3, vitesse réduite au dernier tiers,
  fausse couche possible si santé basse), délai post-partum de 20 jours.
- Naissance : enfant avec génome hérité (un allèle de chaque parent, mutation 5 %), prénom
  inédit, nom selon la coutume (père par défaut), liens parent / enfant / fratrie, souvenir
  d'importance 10 pour les deux parents.
- Enfance : les enfants ne récoltent ni ne construisent, suivent un parent, demandent à
  manger (un parent refuse rarement) ou se servent au stock familial ; les parents nourrissent
  leurs enfants en priorité et vont chercher des baies pour eux ; apprentissage par
  observation (récolte, artisanat, construction) ; à l'adolescence la personnalité se fixe
  (génétique × 0,6 + entourage × 0,4).
- Vieillesse : stades mis à jour chaque jour (événement `stade`), espérance de vie génétique
  (55 à 85 ans), probabilité journalière de mort naturelle croissante après 55 ans.
- Décès : héritage des biens et bâtiments (partenaire, puis aîné, puis famille), deuil des
  proches (moral, souvenir d'importance 10 même à distance), rupture de l'union, adoption des
  orphelins par l'adulte qui les aime le plus.
- Généalogie : arbre exportable (`sim run --genealogie <fichier>`), générations et
  descendants.
- Poursuite : parler ou courtiser suit un interlocuteur qui s'éloigne (jusqu'à 8 tuiles) au
  lieu d'échouer.
- CLI : compteurs de vie (cours, unions, grossesses, naissances, décès, adoptions), stade et
  grossesse dans le tableau d'état, naissances dans le résumé quotidien.
- Équilibrage de l'hiver (découvert en faisant tourner 120 jours : toute la colonie mourait de
  froid) : intention et action « se réchauffer » (abri d'abord, surtout avec un feu à côté,
  sinon le feu), feu plus chaud qui coupe le vent, abris et maisons plus chauds, les enfants
  ne comptent pas dans la capacité des abris ; fabrication d'une canne à pêche dès qu'un banc
  de poissons est connu et pêche comme nourriture principale ; provisions d'automne
  déposées au stock familial et consommées l'hiver ; exploration réduite en hiver.
  Résultat : sur quatre graines, 19 à 22 personnes vivantes au jour 150 (été de l'an 2),
  7 à 10 naissances, au plus deux décès.
- Performance : la perception complète n'est construite qu'au moment de décider (les
  réflexes d'urgence utilisent une perception légère), recherche de nourriture en une passe ;
  150 jours passent de 40 s à 13 s.
- Tests : 144 au total (+21) dont « ≥ 1 naissance en 60 jours » et « la colonie passe
  l'hiver (120 jours) ».
- Non couvert (M7) : maladies, tombes choisies par le cerveau à règles, vêtements de cuir
  (lance, chasse, cuir), agriculture, monnaie.

## M3 – Mémoire et relations (2026-09-12)

- Flux de mémoire par personnage : souvenirs horodatés (observation, action, dialogue,
  réflexion) avec importance 1..10, récupération par récence (demi-vie d'un jour) ×
  importance × pertinence (sujets, proximité), oubli par compression des souvenirs banals non
  consultés depuis 30 jours.
- Mise en mots des événements à la première personne (acteur) ou en tiers (témoins à portée de
  vue) ; l'interlocuteur d'un dialogue, d'un don ou d'une demande s'en souvient aussi.
- Relations : lien (inconnu, connaissance, ami, partenaire, parent, enfant, fratrie, rival,
  ennemi), affinité, confiance, attirance, dette, compteur d'interactions ; ajustements
  amplifiés par le névrosisme et colorés par la compatibilité de personnalité ; les familles
  initiales sont reliées en fratrie.
- Dialogues à gabarits : salutations accordées au lien (tutoiement / vouvoiement), échange de
  lieux utiles dans les deux sens (les personnages se transmettent des positions de
  ressources), entraide (don à un affamé), invitation d'un proche sans abri, dispute entre
  personnes qui se détestent ; effets sur les relations, le moral et le besoin social.
- Échanges : `Offrir` (dette), `Demander` (probabilité d'accord selon agréabilité, affinité,
  famille, persuasion, réputation, dette ; refus journalisé), `Voler` dans un stock d'autrui
  (témoins : affinité et confiance en chute, réputation du voleur en baisse).
- Réflexion du soir (21 h) en mode règles : proche fiable (confiance +5), rareté des
  ressources, faim vécue, froid subi, dette morale ; chaque réflexion devient un souvenir
  important et un drapeau qui oriente les décisions des jours suivants.
- `RuleBrain` : parler (besoin social, extraversion, affinité, pas deux fois de suite avec la
  même personne), offrir, demander, voler (dernier recours des affamés peu scrupuleux),
  influence des drapeaux de réflexion.
- Besoin social rééquilibré : la présence rassure lentement, le dialogue nourrit vraiment.
- CLI : `--inspect <id>` (identité, relations, souvenirs marquants et récents),
  `--journal <fichier>` (export NDJSON), compteurs sociaux.
- Boucle principale : une urgence dont la planification échoue (aucun point d'eau connu…)
  est mise en sommeil deux heures de jeu pour laisser l'exploration de repli agir ; ce cas
  provoquait une mort par immobilité.
- Tests : 123 au total (+30) dont l'intégration « en 30 jours, dialogues, transmissions de
  lieux et réflexions » et le test de non-régression ci-dessus ; 12/12 survivants à 30 jours
  vérifiés sur six graines.
- Non couvert (M4+) : généalogie réelle (la famille reste définie par le nom), couples et
  attirance, groupes au-delà de la famille, évolution des traits.

## M2 – Construire et fabriquer (2026-09-12)

- Objets et recettes : hache de pierre, pioche, lance, canne à pêche, filet, corde,
  vêtement de cuir, pot d'argile, repas cuit, bandage ; niveaux requis, ateliers (feu,
  four), durabilité des outils (un outil cassé disparaît, événement journalisé).
- Le bois mort (sans outil) apparaît en forêt et en prairie pour permettre la première
  hache ; les arbres (hache requise) rendent le double.
- Bâtiments : feu de camp, abri, maison, entrepôt, four, puits, palissade, tombe. Chantier
  fondé par un personnage, matériaux livrés par n'importe quel membre autorisé, travail
  cumulable à plusieurs, propriété (fondateur, famille, invités), usure quotidienne, effondrement
  à zéro, réparation. Feux allumés à la fin du chantier, éteints par l'orage, rallumés avec
  une bûche.
- Stockage : maisons et entrepôts ont un stock ; actions `Deposer` / `Prendre` réservées aux
  autorisés ; le planificateur puise dans le stock familial pour manger ou s'approvisionner.
- Météo tirée par jour et par saison (clair, pluie, orage, neige, canicule) avec effets sur le
  froid, la vitesse, la vision, la soif et la repousse des baies ; saisons avec froid de base
  jour / nuit et repousse des baies (aucune en hiver).
- Nouveau modèle de chaleur : pertes saison × météo, atténuées par l'abri et le vêtement de
  cuir, compensées par l'abri, la maison ou un feu à portée.
- Planificateur : projets de construction (rejoindre le chantier familial ou fonder, livrer,
  s'approvisionner par récolte, stock ou fabrication, travailler), fabrication avec
  approvisionnement, rallumage, réparation, stockage du surplus, sommeil à l'abri ou près du
  feu, repas depuis le stock.
- `RuleBrain` : candidats construire (priorité abri → feu → entrepôt → maison), fabriquer une
  hache, cuisiner, stocker ; réflexe de froid.
- CLI : météo du jour, bâtiments et chantiers sur la carte, tableau des bâtiments.
- Boucle principale : une urgence vitale (soif, faim) prime sur le sommeil forcé par
  l'épuisement ; un inventaire plein est vidé (dépôt ou abandon) avant une récolte vitale ou
  un approvisionnement. Ces deux cas provoquaient des morts par boucle sans issue.
- Tests : 93 au total (+23) dont l'intégration « ≥ 3 abris en 30 jours, chantiers partagés »
  et deux tests de non-régression sur les boucles ci-dessus ; 12/12 survivants à 30 jours
  vérifiés sur six graines.
- Non couvert (M3+) : dialogue et relations explicites (la famille est encore définie par le nom),
  agriculture, puits et four ne sont pas encore choisis par le cerveau à règles.

## M1 – Corps et survie (2026-09-12)

- Personnages : identité complète (prénom, famille, sexe, Big Five dérivé d'un génome à
  12 gènes, valeurs, traits, biographie et motto modèles), corps (santé, âge, stade,
  position, inventaire à capacité limitée), compétences avec progression par la pratique.
- Besoins sur 0..100 (faim, soif, sommeil, chaleur, sécurité, social, moral) avec les
  taux de décroissance du protocole, récupération en dormant / en compagnie, dégâts de
  santé et régénération. Mort par soif, faim ou froid, journalisée avec sa cause.
- Population initiale : 12 adultes de 2 à 3 familles placés autour d'une tuile
  constructible proche du centre.
- Pathfinding A* 8 directions avec coût par biome (file de priorité déterministe).
- Actions atomiques `Deplacer`, `Recolter`, `Boire`, `Manger`, `Dormir`, `Attendre` avec
  préconditions, durées et effets ; planificateur intention → plan ; intention `Explorer`.
- Perception : rayon jour / nuit, mise à jour de la connaissance des gisements et points
  d'eau (préfigure la mémoire de M3), personnes visibles.
- `RuleBrain` : scores d'utilité pondérés par la personnalité, bruit seedé de ±10 %,
  réflexes d'urgence (soif, faim) qui interrompent le plan.
- Journal d'événements avec importance, compteurs, empreinte et export NDJSON.
- Régénération des gisements renouvelables ; les gisements non renouvelables épuisés
  disparaissent.
- CLI : résumé quotidien, personnages sur la carte, tableau d'état, `--population`,
  `--verbose`.
- Tests : 70 au total (+40) dont l'intégration « 12 personnages, 10 jours, ≥ 10
  survivants » et le déterminisme du journal sur deux exécutions.
- Non couvert en M1 (prévu M2) : outils (bois, poisson, gibier, pierre de montagne
  restent inaccessibles), abris, météo.

## M0 – Squelette (2026-09-12)

- Workspace pnpm avec deux paquets : `@sdv/core` (moteur déterministe, sans dépendance
  réseau) et `@sdv/cli` (ligne de commande `sim`).
- Outillage : TypeScript strict (`noUncheckedIndexedAccess`, aucun `any`), ESLint
  type-checked, Prettier, Vitest.
- `Rng` : générateur xoshiro128** seedé, avec `fork(label)` pour des flux indépendants et
  reproductibles, sérialisation d'état pour les snapshots.
- `Horloge` : ticks → minute, heure, jour, saison, année ; jour/nuit selon la saison.
- Monde : bruit simplex 2D seedé avec fBm, génération procédurale (altitude, humidité,
  adoucissement insulaire), huit biomes, gisements de ressources par biome, grille avec
  voisinage et distance, empreinte FNV-1a de la grille, rendu ASCII.
- Configuration (`SimConfig`) avec valeurs par défaut du protocole, fusion et validation.
- `Simulation.creer()` et avance de l'horloge (les corps, cerveaux et actions arrivent en M1).
- CLI : `sim run --seed 42 --days 30 [--largeur --hauteur --ressources --sans-carte]`.
- Tests : 30 tests (RNG, horloge, bruit, biomes, génération reproductible, gisements,
  simulation).
