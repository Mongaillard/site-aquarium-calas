# Changelog

Toutes les évolutions notables du projet, phase par phase (voir `PROTOCOLE.md`, section 15).

## M32 – La guerre se voit : batailles tick par tick, animées (2026-09-16)

Une bataille entre villages se résolvait d'un coup à l'aube, hors écran : on la lisait dans le
journal. Désormais elle dure, se joue sur la carte, et l'on peut la regarder.

- **Moteur** (`monde/bataille.ts`) : à l'aube d'une guerre déclarée, le village le plus fort
  (au hasard près) **lève une troupe** — jusqu'à douze adultes valides, les plus forts —
  qui **marche** sur le village ennemi (intention `combattre`, longue marche partagée avec la
  migration). À six tuiles, **l'assaut** : l'alarme lève les adultes du village défenseur à
  quarante tuiles, les plus proches d'abord, une fois et demie la troupe au plus, et les
  retardataires prennent les armes en arrivant. Sur le **champ de bataille** (huit tuiles
  autour du centre), chacun rejoint l'adversaire le plus proche par deux pas et **frappe** à
  sa cadence (trois ticks) : la chance de toucher tient à l'arme (lance, hache de cuivre,
  arc, hache), à l'expérience de chasse, au cuir de l'autre et à la palissade ; un coup fait
  une **blessure** de M8 (8, 20 ou 30 de santé), rarement la mort. Sous quarante de santé, on
  **se retire et on fuit**. Fin : un camp vidé ou **en déroute** (au quart de sa force) perd ;
  vingt-quatre ticks sans contact, le camp resté sur le champ l'emporte ; une demi-journée
  de contact, **trêve** ; un village désert est **pris**. L'issue rejoue M21 (butin, bâtiments
  ébranlés, peur, attitude, compte des batailles, prix du sang) ; sans troupe possible, la
  paix. Les non-combattants à douze tuiles fuient. Les **coups** sont consignés (`frappes`).
- **Protocole** : `villages.batailles` (camps, phase, lieu, rayon, ticks, issue, frappes),
  événements `village` de genre `marche`, `assaut`, `bataille` (avec `issue`, `duree`).
- **Viewer** : le **champ de bataille** en cercle rouge pointillé, un **anneau de camp** sous
  chaque combattant (rouge attaquant, bleu défenseur), une **barre de vie** au-dessus de la
  tête, les coups animés (**élan** du sprite vers l'adversaire, **éclat** à l'impact, le
  **chiffre des dégâts** qui monte, ☠ pour un coup mortel), et une **jauge de bataille** en
  haut de la carte (les deux camps, leur force restante, les morts ; cliquer y mène). Le fil
  raconte la levée, l'assaut, l'issue.
- Mode local : `?guerre` (avec `peuples=2`) déclare la guerre entre les deux premiers
  villages et fait partir la troupe sur-le-champ, pour voir une bataille tout de suite.
- Tests : levée, marche, assaut, conclusion ; déterminisme ; sauvegarde en cours de bataille ;
  côté viewer, les coups animés une seule fois, pas de rattrapage, les camps.

## M31 – Bâtiments et personnages en sprites (2026-09-16)

Le fond avait ses tuiles (M27) ; bâtiments et personnages restaient des dessins vectoriels.
Deux planches CC0 de Kenney de plus, fournies par l'auteur du projet, les remplacent.

- **Sept bâtiments passent en sprites Medieval RTS** : tente → abri, deux maisons (haute ou
  basse selon la position), grange → entrepôt, four, fumoir (sa fumée animée reste, sur la
  cheminée), puits, sanctuaire → autel ; chacun ancré au sol avec son ombre. Tombe, stèle,
  enclos, champ, palissade, feu de camp, port et chantiers restent en vectoriel (ils animent ou
  n'ont pas d'équivalent).
- **Les personnages se composent en couches Roguelike Characters** (16 px) : corps par teint
  (le teint foncé assombrit le corps brun), tunique blanche **teintée à la couleur de la
  famille** (multiplication), cheveux dans la couleur du moteur (six blocs) et une coiffure
  tirée de l'identifiant (trois courtes pour les hommes, trois longues pour les femmes), et
  **l'outil en main** : hache, pioche (pierre ou cuivre), lance, arc, canne, marteau. Malade :
  corps pâli ; banni : silhouette éteinte. Enfants et adolescents à l'échelle. Couchés quand ils
  dorment ; en marche, un balancement et un léger roulis. Bandeau rouge, « ! » et étoile
  restent. Les bandes ennemies portent la lance, en gris.
- **`PersonnageEtat.outil`** (protocole) : déduit dans `instantane.ts` de l'intention et de
  l'inventaire (`outilEnMain`) — récolter du bois avec une hache, pierre, minerai ou cuivre avec
  une pioche, pêcher avec une canne ou un filet, chasser, abattre, défendre ou veiller avec un
  arc ou une lance, construire ou réparer avec un marteau.
- Les sprites composés sont mis en cache par apparence ; pixels nets dès quatorze pixels par
  tuile, lissés de plus loin. Sans planche décodée, le dessin vectoriel reste. La page publiée
  reste un fichier unique (les deux planches en URL `data:`, +105 ko).

## M30 – L'eau : gués, pirogue, port (2026-09-16)

Les personnages marchaient sur l'eau : l'eau peu profonde était un gué partout, et chaque lac en
est ceinturé. Désormais il faut apprendre à traverser.

- **L'eau peu profonde ne se passe plus à pied.** Elle se traverse à gué, en pirogue, ou de port
  à port. Un nouveau biome **gué** naît à la génération : sur un rang tiré de la graine (un sur
  douze par axe), un banc d'eau peu profonde de trois tuiles au plus entre deux rives de terre
  devient une ligne de gué, rive à rive ; rare et visible (des pierres qui affleurent).
- **La pirogue** (idée, recette et objet existaient) fait traverser toute eau à son porteur,
  peu profonde comprise.
- **Le port**, nouveau bâtiment (bois 20, pierre 6, corde 4 ; 60 de travail), se bâtit sur la
  rive par qui maîtrise la pirogue et connaît bien l'eau (vingt-cinq lieux d'eau), un par
  village ; **entre deux ports achevés, tout le monde traverse** en barque, pirogue ou non :
  l'A\* relie chaque port à tout autre au prix de l'eau en pirogue, l'exécuteur paie le saut à la
  distance. Le conseil propose le port ; la fiche et la carte le montrent (un ponton, une
  barque).
- **Boire cherche la rive atteignable la plus proche** (`trouverCheminVers`, une recherche en
  largeur pondérée depuis la personne jusqu'à une rive d'eau connue ou d'un puits) au lieu des
  trois tuiles d'eau les plus proches à vol d'oiseau, dont la rive était parfois un îlot ou
  l'autre berge : sans cela, quatre morts de soif sur la graine 7 en deux cent quarante jours.
- **La pêche se lance à deux tuiles** de la rive (`porteeRecolte`), la récolte des autres
  gisements reste à une ; boire et récolter sautent les tuiles d'eau sans rive à portée avant
  de compter leurs essais.
- Calibration (graine 7, 240 jours, sans conteur) : douze vivants et plus, comme avant ; le
  poisson pêché baisse d'un quart (les bancs au large attendent la pirogue).

## M29 – L'interface refaite, ordi et téléphone (2026-09-16)

L'en-tête faisait deux rangées de quinze commandes, le fil d'événements masquait un coin de
carte, et sur téléphone l'en-tête mangeait un tiers de l'écran avec quatre cartes du fil par-dessus
tout le reste. Moins, mais mieux.

- **La carte prend tout l'écran**, sur toutes les tailles ; l'ancien mode « plein écran » de la
  page devient l'unique disposition, et le bouton ⛶ ne fait plus que demander le plein écran du
  navigateur.
- **Une seule barre en haut** (`#hud`) : ☰ menu, pause, vitesse, une pastille date · météo · vivants,
  la pastille du conteur, ✨ Dieu, 📋 volet. Le titre, la graine, le formulaire « Nouveau monde »,
  💾 Sauvegardes, +1 tick, → aube, les vitesses ×1…×256, ⚖️ Lois et ⛶ passent dans le **menu ☰**,
  un panneau flottant à gauche.
- **Le volet 📋** à droite (420 px) porte les huit onglets sur une rangée qui défile, avec ✕ ;
  une sélection sur la carte l'ouvre, Échap le ferme ; menu et volet ne s'ouvrent jamais ensemble.
- **Le fil** des grands événements tient sur deux lignes (une sur téléphone) ; **la légende**
  attend derrière « ? » sur toutes les tailles.
- **Téléphone** (≤ 900 px) : une barre de navigation en bas (Carte, Personnage, Journal, Village,
  Plus) ouvre un onglet à la fois en plein écran ; la pastille d'état passe sur deux lignes ; la
  barre de pouvoirs du mode Dieu tient en deux rangées qui défilent (pouvoirs, puis outils).
- Retiré : le panneau repliable à poignée, les boutons flottants doublons (`flot-*`), les
  dispositions à deux colonnes et à en-tête ; `panneaux.ts` écrit le compte de vivants dans la
  barre et lit les onglets partout dans la page (volet et barre du bas).

## M28 – Demander conseil sans Claude (2026-09-16)

Chaque question posée à Claude (bouton 💬 Conseils, pensées, épitaphes, récits) coûtait du
crédit sur le compte de la personne qui regarde la page ; à l'usage, ça en consommait trop.

- **Plus aucun appel à Claude** : `claude.ts` (cerveau Claude, boutons 🧠 Claude et 💬 Conseils)
  est retiré du viewer. Les pensées, épitaphes et récits automatiques disparaissent avec lui ;
  chaque personnage garde sa pensée par défaut, écrite par le moteur (inchangée).
- **Demander conseil se répond au hasard** (`nouveau fichier conseilLocal.ts`) : dès qu'une
  question s'ouvre, une option du catalogue que le moteur a proposé est tirée au sort (ou
  « aucun » s'il est vide) et envoyée comme un choix. Une première version laissait
  l'observateur choisir dans un dialogue, avec le tirage au sort après cinq secondes ; le dialogue
  encombrait l'écran, il est retiré. Le moteur ne change pas : il validait déjà tout choix
  contre les options de la question, qu'il vienne de Claude ou d'ailleurs.
- Les textes de l'interface qui mentionnaient Claude pour les conseils sont reformulés (fiche
  personnage, journal, onglet Statistiques).

## M27 – De vraies tuiles libres de droits (2026-09-16)

M26 notait que les banques d'images libres de droits n'étaient pas joignables depuis
l'environnement ; l'utilisateur a déposé directement deux planches Kenney dans la session, ce
qui a levé le blocage.

- **Deux planches CC0 de Kenney** ajoutées telles quelles à `packages/viewer/src/assets/tuiles/`
  (domaine public, aucune attribution requise) : le _Roguelike/RPG pack_ (57×31 tuiles de 16 px)
  et _Tiny Town_ (12×11 tuiles de 16 px). Détail et liens dans `assets/tuiles/CREDITS.md`.
- **Un atlas** (`atlas.ts`) découpe ces planches par coordonnées de grille et les pose comme
  textures ponctuelles au-dessus du fond vectoriel : pins et pommiers (forêt, collines
  givrées), tas de pierre et d'argile, buissons à baies, amas de gemmes, mousserons — à la
  place des formes dessinées à la main pour ces éléments précis. Bâtiments et gisements sans
  icône Kenney nette (poisson, gibier, fibres) restent en vectoriel.
  Chaque planche s'importe en `?inline` : elle finit en URL `data:` dans le script comme le
  reste du rendu, donc la page publiée reste un seul fichier sans image externe à charger.
  Le chargement des images étant asynchrone, un morceau de carte ne se met en cache qu'une fois
  les deux planches décodées, pour ne jamais figer un fond dessiné avant leur arrivée.

## M26 – Un monde plus réaliste, des buts, deux cents habitants, une application (2026-09-16)

Les points 6 à 8 de l'analyse « en faire un jeu », et une refonte du rendu demandée en premier.

- **Un monde plus réaliste à l'écran.** Le fond de carte se dessine par couches de blobs
  arrondis (eau profonde, eau peu profonde, marais, plage, prairie, colline, forêt,
  montagne) : rivages, lisières et crêtes ondulent au lieu de suivre la grille, la terre se
  détache de l'eau par un liseré d'écume, et une marge prise aux morceaux voisins fait
  continuer les formes d'un morceau à l'autre (le cache d'un morceau tient compte des versions
  de ses voisins). Textures de bruit (mouchetures, fleurs, galets, vaguelettes, roseaux),
  arbres à couronnes ombrées qui se chevauchent, pics à deux faces et calotte de neige, palette
  plus naturelle, fond à 24 px par tuile lissé. Bâtiments redessinés (hutte de peaux sur
  perches, maison à colombage et toit de chaume, grange de planches, ombres portées),
  personnages cernés d'un trait avec ceinture et col, crépuscule chaud avant le bleu de la
  nuit, halos des feux plus doux, six bulles de dialogue à la fois au plus. Aucune image
  externe : les banques d'images libres de droits n'étaient pas joignables depuis
  l'environnement, tout reste dessiné en vectoriel, sans licence à porter.
- **Des buts** (point 6). Vingt succès qui se débloquent à l'aube (un toit, le premier feu,
  dix berceaux, l'an deux, cinq et dix, vingt, cinquante et cent âmes, la troisième
  génération, l'âge du cuivre, une légende, une coutume, le second village, une alliance, une
  prière exaucée, la main du ciel, la créature, face aux loups, la bande repart). Cinq
  scénarios au formulaire (« but ») avec une année limite : passez l'an dix, le cuivre avant
  l'an cinq, faites naître une légende, trois villages en paix, cent âmes ; progrès, texte,
  gagné ou perdu (limite ou extinction). Des prophéties que le ciel formule une fois sur deux
  au premier jour d'une saison (une naissance chez une famille, tant d'âmes, un bâtiment, une
  prière exaucée, une légende, personne ne mourra) ; accomplies, elles rapportent huit de
  faveur. Onglet « Buts », événements `but` (dans le fil même sans position).
- **Deux cents habitants** (point 7). La simulation tourne dans un **Web Worker** (`?sansworker`
  pour l'ancien mode) : la page ne fait qu'afficher, une grande colonie ne fait plus attendre
  ni l'image ni les gestes (à 192 habitants et ×256, la pire image passe de plusieurs secondes
  à 130 ms, la vitesse effective s'affiche). La sauvegarde s'encode dans le travailleur et
  voyage par copie structurée ; la sauvegarde de sortie est la dernière reçue (moins d'une
  minute), la suivante est demandée dans la foulée. Les **peuples rivaux ont leur propre
  berceau** (terre garantie, rivage, mares, gisements abondants) : à quatre peuples de
  quarante-huit, 2 morts en vingt jours au lieu de 20. Moteur : les droits d'accès aux
  bâtiments se recalculent en un passage par personne (ce qui ne dépend que d'elle calculé une
  fois), l'observation parcourt les tuiles morceau par morceau (même ordre, mêmes cartes
  mentales), une distance par bâtiment au tri ; 11 → 15 ms par tick à 192 habitants _vivants
  et actifs_ (la version d'avant en perdait un quart en vingt jours). Formulaire jusqu'à 64
  habitants par peuple. Le niveau de détail par distance a été écarté : un cerveau allégé pour
  les personnages hors champ rendrait le monde dépendant de la caméra, contre le principe de
  reproductibilité du protocole.
- **Distribution** (point 8). La page autonome est une **application installable** :
  manifeste, icône, service worker qui la garde hors ligne quand elle est servie en https hors
  de claude.ai. `pnpm --filter @sdv/viewer dist:itch` produit `simulation-de-vie-itch.zip`,
  prêt pour itch.io (projet HTML, `index.html` à la racine). Steam (Tauri ou Electron) reste à
  faire : l'application est un seul dossier statique, l'emballage est direct.
- Les noms de famille de renfort (vingt-deux de plus) servent aux peuples posés quand les
  premiers sont tous portés, sans jamais se répéter et sans changer le tirage des mondes
  existants. Sauvegarde en version 6 (les mondes d'avant gardent leur terrain).

## M25 – Le jeu du ciel : sculpter, lire, légiférer, incarner, raconter (2026-09-16)

La simulation devient un jeu de dieu, dans l'esprit de WorldBox pour la main sur le monde et
d'Age of Mythology pour l'identité du ciel. Cinq chantiers, un par commit.

- **Sculpter le monde et poser des peuples.** Le pinceau du ciel (terre, eau, forêt, montagne,
  sable ; rayon 0 à 6 ; gratuit) remodèle le terrain en disque : peinture au glisser de la
  souris, appui long au doigt. Le cœur d'une montagne est en montagne, sa lisière en collines ;
  l'eau profonde au centre, peu profonde au bord ; chaque tuile sculptée perd son gisement et
  en retire un nouveau selon le biome posé, les tuiles bâties sont épargnées, et les personnes
  que l'eau surprend regagnent la rive. Les sculptures se sauvegardent avec la grille et se
  rejouent après la regénération (sauvegarde v5). Un **monde vierge** (0 habitant, case
  « vierge ») s'ouvre en mode Dieu, le berceau visible à quarante tuiles, l'outil « peupler »
  en main : le premier peuple posé est gratuit, les suivants coûtent 25 ✦ et fondent chacun
  leur village de familles neuves. Des **peuples rivaux dès le départ** (1 à 4, chacun avec
  autant d'habitants, à quarante-huit tuiles du berceau). Commandes `sculpter` et `peupler`.
- **Lire le monde.** Quatre calques par-dessus la carte (boutons en haut à gauche, touche `c`) :
  villages (territoire et habitants), familles (anneau au sol de chacun, contour des
  bâtiments), foi (du gris à l'or), vivres (les réserves de chaque village, du rouge au vert).
  Le **fil des grands événements** (importance ≥ 6) sur la carte et un bouton 📍 sur chaque
  ligne du journal : la caméra file sur place, un repère y pulse. Les **arbres des familles**
  dans l'onglet Population : lignées, couples, morts barrés, un clic ouvre la fiche.
- **Les lois du monde** (bouton ⚖️ Lois, touche `l`) : la faim tue, les maladies, les bêtes
  attaquent, les raids, les schismes, la mort de vieillesse, le conteur ; chacune se suspend
  et se rétablit, se journalise et se sauvegarde. Les tirages aléatoires restent alignés (une loi
  suspendue ne tue pas, elle ne change pas le hasard).
- **L'identité du ciel.** Un **domaine** (formulaire « ciel », ou plus tard dans la barre du
  mode Dieu) : Moisson (le Semeur), Orage (le Tonnant), Feu (la Braise), Songes (le Veilleur).
  Ses pouvoirs favoris coûtent 40 % de moins et s'ouvrent un palier plus tôt ; ceux du domaine
  opposé coûtent un quart de plus et viennent plus tard. Le **rang du ciel** (le niveau de
  culte, plus un à l'âge du cuivre) ouvre quatre paliers de pouvoirs (`NIVEAU_POUVOIR`) ; un
  ciel sans visage garde tout au prix du catalogue. Chaque usage dans la saison renchérit le
  pouvoir d'un quart, jusqu'au double ; la saison suivante en oublie la moitié. Les
  **créatures** du domaine (rang 2, 30 ✦, vingt jours, une de chaque à la fois) : un gardien
  posté qui repousse meutes et bandes à douze tuiles et rassure ; un fléau lâché qui rôde
  autour de son poste, ronge les gisements, fait fuir le gibier et effraie. La palette montre
  verrous, coûts effectifs et affinités ; commandes `domaine` et `creature`.
- **Le conteur.** Le directeur de danger devient un narrateur : une courbe de tension en quatre
  temps — calme (8–14 j, 24 au départ), montée (4–8 j), crise (une épreuve : meute, bande,
  maladie, orage, canicule, neige, selon les lois et la saison), répit (6–10 j, un bienfait :
  troupeau, ciel clair, guérison des malades, aubaine de gisements). Clémence : si le village
  est déjà en peine (faim, malades, menace, deuils : la « pression » mesurée chaque aube),
  le conteur passe au répit sans frapper. Au nouvel an, il écrit la **chronique de l'année**
  (titre — l'année des berceaux, du deuil, des loups, des bandes… — et quelques phrases :
  âmes, naissances, morts, unions, bâtiments, inventions, légendes, épreuves, bienfaits,
  miracles), lue au joueur dans un dialogue (🔊 à voix haute si le navigateur sait), relisible
  depuis la pastille 🎭 de la barre ou l'onglet Statistiques. Événements `conteur`.

## M24 – Une grande colonie sans à-coups (2026-09-13)

À cinquante habitants et plus, la page marquait encore des pauses d'une demi-seconde : bâtir
l'état diffusé à la carte coûtait 30 à 60 ms toutes les 100 ms, et chaque sauvegarde encodait
le monde d'un bloc, en faisait une chaîne JSON de sept mégaoctets, puis la passait d'un bloc au
compresseur (`Blob` + gzip : 500 ms de fil principal sur un téléphone lent, sans une ligne de
JavaScript à montrer du doigt). Sur un téléphone émulé (processeur divisé par quatre), à
quarante-huit habitants et vitesse ×256, les pires images passent de 600–680 ms à 190–310 ms,
plus aucune au-delà d'une demi-seconde.

- **Le journal tient en mémoire bornée** : vingt-quatre mille événements au plus (effacés par
  paquets de six mille), avec un index global qui ne recule jamais (`taille`, `depuisIndex`) ;
  la page et le serveur lisent « depuis le dernier index » au lieu de parcourir tout le journal.
  Les statistiques viennent de compteurs tenus au fil de l'eau (par type, et par détail :
  `chasse:reussie`, `faune:naissances`, `recolte:poisson`…), sauvés et restaurés.
- **L'état diffusé** ne recalcule la carte (gisements, découvertes) qu'une fois par seconde, par
  morceau et par index numérique, et la diffusion s'espace à quatre fois son coût (100 ms à 1 s).
- **Sauvegarde par étapes** (`Simulation.sauvegarderParEtapes`) : tout s'encode d'un coup sauf
  les personnages (neuf dixièmes du poids, 5 ms chacun), encodés à la demande ; la page les
  prend par tranches de 8 ms entre deux images, le monde attend le temps de l'encodage (une
  sauvegarde est d'un seul tick ; une commande entre-temps la fait recommencer), et la
  cadence automatique se règle sur ce coût. **Compression en flux** : le JSON n'est jamais
  assemblé en une seule chaîne ; chaque morceau (un personnage, un morceau de carte) est
  encodé et poussé dans le flux gzip dès qu'il est produit, en rendant la main toutes les
  8 ms ; une seule compression sert à la sauvegarde locale et à la distante, et le base64 de
  cette dernière se fait par tranches. La sauvegarde de sortie reste d'un bloc, sans attendre.
- **Souvenirs et lieux connus** plafonnent à trois cents et cinq cents par personne (six cents
  et huit cents avant) : une sauvegarde à quarante-huit habitants perd un tiers de son poids.
- **Dormeurs comptés une fois** pour tout le monde, tant que personne ne s'endort, ne se réveille,
  ne meurt ni ne grandit (la question revenait pour chaque abri de chacun, à chaque tick).
- La page saute une image quand la précédente a pris plus de 12 ms à dessiner.

## M23 – La colonie choisit sa taille, apprivoise, et entre dans l'âge du cuivre (2026-09-13)

- **Habitants au départ** : le formulaire « Nouveau monde » propose 12, 24, 36 ou 48 habitants
  (`?population=` dans l'adresse) ; trois familles au moins, une par quatre habitants.
- **Un berceau à la mesure de la colonie** : une part d'abondance pour douze habitants (quatre au
  plus) ajoute des mares à quatorze tuiles de l'origine (une par part au-delà de la première, à
  l'opposé du rivage) et rend les gisements du berceau plus denses (probabilité × 1,5 par part)
  et plus riches (quantités × √abondance). À douze, rien ne change : mêmes tirages, mêmes mondes.
  Le berceau se regénère à l'identique à la reprise d'une sauvegarde (la population de départ est
  dans la configuration sauvée).
- **Plus de cinquante habitants sans geler** : la page simulait jusqu'à vingt-quatre ticks par
  intervalle de 50 ms quoi qu'il en coûte ; à soixante habitants (4,4 ms par tick) elle ne
  rendait plus la main. Désormais un budget de 22 ms par intervalle, jamais plus, et le retard ne
  s'accumule pas au-delà d'une seconde de jeu : la vitesse effective baisse d'elle-même et
  s'affiche à côté de l'horloge (« ×110 effectif »). Côté moteur, à soixante habitants le tick
  passe de 4,4 à 2,9 ms : les bâtiments accessibles d'un personnage sont mémorisés une heure
  (la question revenait trente fois par tick et cherchait le propriétaire par parcours), le
  propriétaire se trouve par index, on n'observe les alentours qu'en bougeant (sinon toutes les
  quatre heures, une fois par nuit endormi ; la dernière observation est dans les drapeaux
  sauvés, pour rester déterministe), et la repousse des gisements se calcule à l'heure.
- Correction : un village né d'un schisme ne se recentre plus sur les abris que ses familles
  ont laissés dans l'ancien village (pas de recentrage tant que des migrants sont en route, et
  seulement sur les abris à moins de trente tuiles).
- **Apprivoiser, enfin** : personne n'apprivoisait parce que la capture n'arrivait qu'après une
  chasse réussie, par un chasseur qui portait une corde par hasard, et que les cordes partaient
  au stock. Désormais, devant un troupeau docile (mouflon, aurochs, lièvre, sanglier), un adulte
  tresse une corde et la garde en poche ; à la chasse, la corde sert d'abord à ramener la bête
  vivante (chance docilité × 0,8), sans avoir à la tuer ; quatre bêtes par famille au plus. Sur
  la graine 42, douze bêtes et deux enclos en six cents jours, contre une bête auparavant.
- **L'âge du cuivre** (domaine d'invention `outillage`) : du minerai affleure dans la montagne
  (et un peu dans les collines), à la pioche. L'idée de la **fonte** vient à un esprit curieux
  qui a vu du minerai, après soixante jours ; elle fait bâtir un four (un par village, argile et
  pierre) ; trois minerais et deux bûches au four donnent un lingot ; l'idée des **outils de
  cuivre** vient au premier lingot : hache et pioche de cuivre (un lingot, deux bûches), quatre
  fois plus solides, qui abattent et extraient trois unités là où la pierre en fait deux, et
  remplacent l'outil de pierre partout où il est requis. Le cerveau enchaîne pioche, minerai,
  four, lingot, outil ; une idée d'outillage attend soixante jours au lieu de vingt. Tuile « âge »
  dans Statistiques (pierre, puis cuivre au premier lingot), minerai dessiné sur la carte.

## M22 – La partie ne se perd plus à la sortie (2026-09-13)

Sur mobile, quitter l'artefact pouvait perdre la partie : la sauvegarde de sortie était
compressée hors du fil principal puis écrite, et le navigateur tuait la page avant la fin ;
au chargement suivant, un monde neuf écrasait la sauvegarde automatique.

- **Sauvegarde de sortie immédiate** : quand la page se cache ou se ferme, le JSON part tel
  quel, sans compression, dans une écriture lancée dans la foulée sur une connexion IndexedDB
  gardée ouverte depuis le chargement. Les sauvegardes de routine restent compressées ; une
  écriture plus récente sur le même nom l'emporte toujours sur une plus ancienne encore en vol.
- **La partie précédente est mise à l'abri** : avant qu'un nouveau monde (graine imposée,
  sauvegarde trop vieille pour reprendre seule, reprise impossible) ne remplace la sauvegarde
  automatique, une partie d'au moins vingt jours est copiée sous son nom (« Partie du jour 312
  (graine 42) ») et reste dans la boîte 💾. Une reprise qui échoue le dit désormais.
- **Sauvegardes plus légères** : les souvenirs plafonnent à six cents par personne (deux mille
  avant ; au-delà, l'oubli monte en importance), les lieux connus à huit cents (les plus
  anciennement vus s'effacent, la carte les rend), et un mort perd sa carte mentale. Une
  sauvegarde de quatre cents jours passe de 13 Mo à 5,4 Mo avant compression, ce qui allège
  aussi chaque sauvegarde automatique sur mobile.
- **Sauvegardes sur le serveur** (module `distant.ts`) : dans l'application, le stockage du
  navigateur ne survit pas toujours à la fermeture de l'artefact. La page range donc aussi ses
  sauvegardes dans la base de documents de l'artefact (capacité `db` de claude.ai), qui survit
  au navigateur, à l'application et à l'appareil : gzip puis base64, découpé en morceaux sous
  `sauvegardes/<id>/morceaux/<n>` (un document ne dépasse pas 256 Kio), l'en-tête écrit en
  dernier. Toute sauvegarde nommée y part ; l'automatique toutes les minutes, à l'aube, à la
  pause et à la sortie. La boîte 💾 liste les deux sources (📱 ce navigateur, ☁ le serveur) ;
  au chargement, la plus récente des deux reprend. Hors de claude.ai, la page vit avec le seul
  stockage local. Déclarer `db` rend l'artefact interne à l'organisation (plus de partage
  public).

## M21 – Le monde s'élargit (jalon 15, 2026-09-13)

Le monde sans limite prend son sens : plusieurs villages. Module `monde/villages.ts`, état
`Simulation.villages` (sauvegarde en version 4, migrations depuis les précédentes).

- **Villages** : le premier existe dès la fondation (toutes les familles) ; chaque famille
  appartient à un village, chaque village a un centre recalé sur ses abris, un nom, des
  familles, des vivres et une force (adultes, armes, palissades). La veillée se tient par village.
- **Schisme et second village** : au printemps (dix premiers jours), une faction minoritaire sous
  tension (≥ 70) ou, en cas de surpeuplement (≥ 24), la famille la moins prestigieuse part fonder
  un village à soixante tuiles, avec quatre portions par personne prises au stock familial ; site
  praticable, constructible, avec de l'eau à douze tuiles. Chacun reçoit une ambition `migrer`
  avec une destination : une intention `migrer` les fait marcher (par étapes de vingt tuiles),
  puis l'abri se bâtit sur place. Le village est fondé quand tous sont arrivés.
- **Bandes, raids et tribut** : une bande par an au plus, après la première année, attirée par
  un village dont les stocks dépassent quatre-vingts portions ; elle approche à quatre tuiles par
  heure ; devant un village fort (force ≥ deux fois sa taille) elle négocie un tribut d'un
  dixième ; sinon elle pille un quart des vivres, ébranle un bâtiment et laisse la peur.
- **Commerce et caravanes** : tous les vingt jours, un village avec surplus (≥ 30) envoie douze
  portions à un village qui manque (< 15) ou à un allié, avec une invention connue ici et pas
  là-bas ; à l'arrivée, un adulte l'apprend, l'attitude monte, la route se trace sur la carte ;
  une bande sur la route peut la perdre.
- **Diplomatie et guerre bornée** : une attitude par paire de villages (mariages +20, caravanes
  +6, parenté, dérive vers zéro ; vols −25 avec casus belli, rixes −8). Alliance à 60 ; guerre
  seulement sous −60 avec un casus belli ; au plus deux batailles à dix jours d'écart (forces
  mesurées, blessés, rarement un mort, un cinquième des vivres, bâtiments ébranlés) ; puis la paix
  par le prix du sang (dix portions du plus faible), attitude remise à −10.
- Viewer : noms des villages sur la carte, routes en pointillé, bandes (silhouettes grises),
  caravanes (chargements qui roulent) ; section « Villages » de l'onglet Village (familles,
  habitants, vivres, force, relations, mouvements) ; tuiles de statistiques ; événements
  `village`, `raid`, `caravane` dans le journal.
- Calibration : bandes limitées à une par an après la première année ; l'abattement garde les
  outils et le rangement ; un lieu évité n'est jamais le foyer.
- **La faim de l'an quatre** (les colonies mouraient toutes vers la quatrième année, de faim,
  avec des gisements intacts autour d'elles) : la cause n'était pas le manque de ressources mais
  le travail. À la belle saison, personne ne remplissait le garde-manger tant qu'il restait
  quelques baies en poche ; la dernière canne cassée n'était jamais remplacée (la fabrication
  attendait du bois que personne ne coupait, derrière un chantier de palissade qui échouait
  sans fin sur une tuile à gisement) ; les poches s'encombraient d'outils hérités en double et
  de graines. Corrections : règle du garde-manger (on récolte, en toute saison, quand le stock
  familial descend sous quatre portions par bouche, d'autant plus qu'on a des enfants) ; canne
  à pêche prioritaire quand la réserve baisse ; l'enceinte ignore les tuiles à gisement et un
  chantier qui échoue à se fonder attend six heures ; on n'hérite pas d'un outil qu'on a déjà ;
  plus de graines ramassées au-delà de trente en réserve ; réparer un foyer les mains vides
  répare au lieu d'échouer. Enfants adultes à quatorze ans (adolescents dès dix). Sur cinq
  graines et six cents jours, plus aucune mort de faim ; la graine 42 passe de zéro survivant
  en l'an cinq à vingt-deux.
- **La faim de l'an dix** : passé l'an quatre, la même graine montait à trente-cinq habitants
  dont vingt-neuf enfants pour six adultes, puis mourait de faim en l'an onze. Deux freins :
  une mère ne conçoit plus quand sa famille compte déjà deux enfants par paire de bras
  (adolescents et adultes), et attend deux ans entre deux naissances (un an avant) ; et les
  grands enfants, dès six ans, cueillent des baies eux-mêmes, pour eux et pour le garde-manger
  quand il se vide.

## M20 – La psyché et la mémoire (jalon 14, 2026-09-13)

Ce qui fait que deux personnages ne vivent pas le même drame de la même façon. Deux modules :
`memoire/psyche.ts` (chacun) et `memoire/legendes.ts` (le village).

- **Stress, traumatisme, abattement** : un stress (0..100) nourri par les blessures, les
  combats (témoins compris), les alarmes, les vols subis, les rixes, les maladies, l'exil, la
  faim et le froid qui durent ; apaisé de trois points par jour, par les jeux, les dialogues avec
  les proches, les naissances. Cinq jours au-dessus de 70 : l'**abattement** (humeur −15, seul
  le nécessaire garde son poids dans les décisions) ; on en sort sous 40. Après un combat ou la
  mort violente d'un proche, on **évite le lieu** soixante jours (sauf famine).
- **Joie, ambition, ennui, sens** : au premier jour de chaque saison, un **objectif personnel**
  selon ses valeurs (trente portions en réserve, un enfant, trente lieux, du prestige, être
  notable, cinq dons, une maison, transmettre un savoir, jouer cinq fois, aller à trente tuiles) ;
  l'atteindre donne dix jours de joie et du sens (0..100), le manquer en retire. L'**ennui**
  monte quand la même intention revient sept fois sur dix ; il pèse sur l'humeur et pousse vers
  autre chose. Un ancien qui s'ennuie **grave une pierre** (`stele`, deux pierres) de son motto.
- **Rêves et mémoire qui déforme** : au cœur de la nuit, un rêve mêle deux souvenirs (type
  `reve`, visible dans la fiche) ; chaque semaine, un souvenir ancien, important et peu consulté
  se réécrit (les nombres grossissent, la certitude s'effrite, marqué « altéré »). Les faits du
  journal ne bougent jamais.
- **Personnalité qui évolue, attachements, deuil long** : le caractère plie (névrosisme après
  un deuil ou l'abattement, conscience après un objectif atteint, extraversion après une sortie
  d'abattement, agréabilité après une naissance), dans une borne de ±0,2 autour du départ. Chaque
  mois, le lieu des bons souvenirs et l'outil qu'on porte deviennent des attachements (moral le
  soir près du lieu ; perte quand l'outil casse). Un proche mort laisse un deuil d'un an, avec
  son anniversaire (humeur, souvenir, événement).
- **Mémoire collective** : les événements marquants (morts, combats, miracles, inventions, exils,
  grandes chasses, alliances, gravures) deviennent des **récits** ; à chaque veillée quelqu'un en
  raconte un, les enfants écoutent ; raconté, il s'**embellit** (nombres +50 %, épithètes) ; trois
  fois raconté, c'est une **légende**. Les lieux prennent un **nom** (« la crique de Timéo » pour
  qui y pêche le premier loin du village, « le bois de X » où X est mort, « le pré des loups »,
  « la clairière du miracle ») et les dialogues les emploient à la place des directions. Chaque
  coutume engendre un **proverbe**, repris dans les salutations.
- Viewer : section Psyché de la fiche (stress, sens, ennui, objectif, attachements, lieux évités,
  deuils, dérive du caractère, dernier rêve), souvenirs de rêve et souvenirs altérés marqués,
  onglet **Légendes** (légendes, récits en cours avec les faits d'origine, lieux nommés,
  proverbes), noms de lieux sur la carte, stèles, nouveaux événements dans le journal.
- Sauvegarde en version 3 ; les sauvegardes v1 et v2 se relisent. Onze tests (`psyche.test.ts`).
- Calibration après M19 : une coutume n'enseigne plus la leçon à tout le monde (treize
  palissades et des abris jamais réparés sur la graine 42), un chantier commun ne passe qu'après
  le confort de la famille, le vote d'un puits exige de la pierre en stock, on ne vient pas à la
  veillée le ventre vide, une infraction par personne et par jour au plus.

## M19 – La société (jalon 13, 2026-09-13)

Comment trois familles deviennent un village avec ses règles. Tout est dans `social/societe.ts`,
branché sur le journal, l'aube, l'heure, la soirée, la naissance et la mort.

- **Prestige** (0..100 par personne) : dons, inventions, bâtiments terminés, chasses, soins,
  combats gagnés, naissances, adoptions ; −10 pour un vol ; érodé d'un point par jour. Les
  **notables** sont les trois plus grands prestiges à partir de 15, jamais nommés, toujours
  destituables ; une étoile au-dessus de la tête, un poids de vote plus lourd.
- **Coutumes nées des leçons** : une leçon connue de 60 % des adultes depuis trente jours devient
  coutume (tout adulte la sait, le cerveau la suit qu'il l'ait apprise ou non) ; à 40 % elle se
  perd. L'enfreindre devant témoins (manger devant un enfant affamé, refuser à manger en hiver)
  coûte réputation, prestige et affinité.
- **Veillées et fêtes** : à 21 h, trois adultes éveillés près d'un feu se rassemblent en cercle
  une heure ; affinités, moral, un savoir transmis. Naissance, union, funérailles et solstices
  font une fête (humeur, tension −5). Sous tension (≥ 70), chaque faction veille de son côté.
- **Justice réparatrice et bannissement** : un vol vu ouvre un grief, jugé à la veillée suivante
  (palabre) : l'accusé rend le double en nourriture s'il le peut ; sinon, mal vu ou récidiviste,
  le village vote son exil (soixante jours, quarante tuiles, plus d'accès aux bâtiments, retour
  possible) ; sinon on pardonne.
- **Rancune et rixe** : une rancune par relation (vols, refus), apaisée d'un point par jour ; à
  60 (ou 80 si le village est calme), deux voisins éveillés en viennent aux mains ; le perdant
  est contusionné, les deux y perdent réputation et prestige. Jamais de coups par la seule
  tension.
- **Décisions collectives** (une par dix jours, vote pondéré par le prestige) : ouvrir les stocks
  à tous vingt jours en hiver, creuser un puits commun (chantier `commun`, accessible et
  prioritaire pour tous), bannir.
- **Alliances, dot** : un mariage entre familles ouvre leurs abris et fait passer une dot de
  trois portions à la famille la moins pourvue.
- **Factions et tension** : chaque semaine, les familles rapprochées par un mariage ou une
  affinité moyenne ≥ 20 forment une faction. La tension (0..100) monte avec les vols, les refus
  d'hiver, les rixes, les exils, les votes perdus ; baisse avec les dons entre familles, les
  fêtes, les mariages, les amitiés d'enfance ; −0,5 par jour.
- **Deuil violent et haine héréditaire** : une mort par les loups ou une plaie traumatise la
  famille trente jours ; mourir de faim dans les trois jours d'un refus vaut au refuseur la haine
  de la famille, transmise aux enfants, effacée par le prix du sang (six portions à la veillée).
- **Croyances et tabous** : une mort inexpliquée (maladie) rend le lieu interdit trois tuiles
  autour pour une saison (hachuré sur la carte) ; on n'y récolte plus, sauf famine. Les tombes
  d'où viennent les leçons se visitent une fois par saison (« se recueillir » : moral, foi).
- **Éducation et maîtres** : un adolescent choisit pour maître l'adulte qui sait le mieux faire
  ce qui l'attire (une autre famille de préférence) ; près de lui le soir, il progresse et
  hérite de ses savoirs. Les enfants de familles différentes qui jouent ensemble se lient.
- Viewer : onglet **Village** (tension, coutumes, notables, factions, griefs et palabres,
  décisions, alliances, lieux interdits, dernière veillée), section Village de la fiche
  (prestige, maître, exil, rancunes), tuiles de statistiques, cercle de veillée et zones
  hachurées sur la carte, dix nouveaux types d'événements dans le journal.
- Sauvegarde en version 2 ; une sauvegarde v1 se relit, les champs nouveaux prennent leur valeur
  de départ. Treize tests (`societe.test.ts`).

## M18 – La partie ne se perd plus sur mobile (2026-09-13)

- **Le geste vers le bas ne recharge plus la page** : `overscroll-behavior: none` sur la page et
  les onglets, plus une garde tactile (`gestes.ts`) qui retient tout geste vertical qui sortirait
  de ce qui peut défiler (haut d'une liste, zones fixes), sans gêner le défilement intérieur ni
  les gestes horizontaux.
- **Sauvegarde automatique plus serrée** : toutes les vingt secondes au lieu d'une minute, à
  chaque aube (au moins cinq secondes après la précédente), dès la mise en pause, et toujours de
  force quand la page se cache ou se ferme. La cadence s'allonge d'elle-même (jusqu'à deux
  minutes) pour que l'encodage synchrone du monde reste sous un quarantième du temps.
- **Reprise automatique** : au chargement, la sauvegarde la plus récente reprend sans clic si
  elle a moins de douze heures et que l'adresse n'impose pas de `?seed=` ; sinon le bouton
  « ↩ Reprendre » se propose comme avant.
- **Sauvegardes compressées** : le JSON de la sauvegarde passe par gzip (`CompressionStream`,
  hors du fil principal) avant IndexedDB, environ vingt fois plus petit ; les anciennes
  sauvegardes à plat se relisent toujours, la liste affiche la taille.
- Tests : aller-retour d'une vraie sauvegarde par le JSON compressé (même état après deux cents
  ticks de plus), garde tactile, libellé de taille. Vérifié dans Chromium 400 × 800 tactile :
  geste retenu, reprise au même instant après rechargement, bouton seul avec `?seed=`.

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
