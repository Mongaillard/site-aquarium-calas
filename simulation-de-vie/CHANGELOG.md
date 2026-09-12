# Changelog

Toutes les évolutions notables du projet, phase par phase (voir `PROTOCOLE.md`, section 15).

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
