# Simulation de vie

Monde 2D persistant peuplé de personnages autonomes, chacun doté d'une identité et d'une IA
propres. La spécification complète est dans [`PROTOCOLE.md`](./PROTOCOLE.md) ; l'avancement
par phase est dans [`CHANGELOG.md`](./CHANGELOG.md).

## Démarrage

```bash
pnpm install
pnpm check          # typecheck + lint + format + tests
pnpm sim run --seed 42 --days 30 --ressources
pnpm sim run --seed 42 --days 30 --sans-carte --inspect p-0001 --journal journal/evenements.ndjson
```

`pnpm sim run` génère un monde, l'affiche en ASCII avec sa distribution de biomes et son
empreinte, puis fait avancer l'horloge du nombre de jours demandé.

## Interface d'observation

```bash
pnpm serve -- --seed 42 --jours 30 --vitesse 4   # http://localhost:8080
```

Le serveur fait tourner la simulation en temps réel (vitesse réglable depuis l'interface) et la
diffuse par WebSocket. La page montre la carte illustrée et animée (biomes, arbres, gisements,
huttes et maisons, feux, personnages dessinés aux couleurs de leur famille qui marchent d'une
case à l'autre, bulles de dialogue, jour / nuit) et cinq panneaux :
Personnage (pensée, besoins, famille, relations, souvenirs), Journal, Conversations,
Statistiques, Population. Cliquez sur un personnage ou un bâtiment pour l'inspecter, appuyez
sur `s` pour que la caméra suive le personnage sélectionné.

Un brouillard d'exploration couvre ce que la colonie n'a jamais vu : au départ, seul un halo
autour de chaque personnage est visible, et la carte se dévoile au fil des explorations. La
touche `b` (ou la case de la légende) l'enlève ; l'onglet Statistiques indique la part du monde
découverte.

Pour développer le viewer avec rechargement à chaud : lancez le serveur (`pnpm --filter
@sdv/server start -- --seed 42`) puis `pnpm viewer:dev` (http://localhost:5173).

### Sans serveur (mobile, page publiée)

```bash
pnpm --filter @sdv/viewer build:local   # fichiers autonomes dans packages/viewer/dist-local/
```

Dans ce mode la simulation tourne dans la page elle-même : la même interface, les mêmes
messages, aucun serveur. Ajoutez `?seed=123&jours=40` à l'URL pour choisir la graine et le
nombre de jours simulés avant l'affichage, ou changez la graine directement dans la barre
(« Nouveau monde »). Sur un écran tactile : un doigt pour déplacer la carte, deux pour zoomer,
toucher un personnage ou un bâtiment pour l'inspecter, bouton « ? » pour la légende. La page
servie par `pnpm serve` accepte aussi `?local` pour basculer dans ce mode.

## Structure

```
packages/core/src
  monde/        grille, génération, biomes, ressources, horloge, météo, recettes, bâtiments, rendu ASCII
  agents/       identité, génome et héritage, besoins, inventaire, compétences, population, cycle de vie
  actions/      types d'actions et d'intentions, A*, planificateur, exécuteur
  cerveau/      interface Cerveau, perception, RuleBrain (règles)
  memoire/      flux de souvenirs, mise en mots des événements, réflexion du soir
  social/       relations, dialogues à gabarits, échanges et vol, couples
  genealogie.ts arbre des filiations et des unions
  evenements/   journal d'événements
  simulation.ts boucle principale
packages/cli        commande `sim`
packages/protocole  messages serveur ↔ viewer
packages/server     serveur temps réel (WebSocket + fichiers statiques), commande `sim-serve`
packages/viewer     interface web (Vite, canvas 2D)
```

Le moteur ne dépend d'aucun service réseau ; le cerveau Claude (phase M5) sera un paquet
séparé qui s'y branche via l'interface `Cerveau`.

## Scripts

| Commande                            | Effet                                 |
| ----------------------------------- | ------------------------------------- |
| `pnpm typecheck`                    | `tsc -b` sur tous les paquets         |
| `pnpm lint`                         | ESLint (règles strictes type-checked) |
| `pnpm format` / `pnpm format:check` | Prettier                              |
| `pnpm test`                         | Vitest                                |
| `pnpm check`                        | tout ce qui précède, dans l'ordre     |
