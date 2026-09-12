# Changelog

Toutes les évolutions notables du projet, phase par phase (voir `PROTOCOLE.md`, section 15).

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
