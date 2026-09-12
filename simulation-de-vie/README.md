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
packages/cli    commande `sim`
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
