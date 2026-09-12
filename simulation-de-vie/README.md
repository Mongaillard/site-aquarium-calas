# Simulation de vie

Monde 2D persistant peuplé de personnages autonomes, chacun doté d'une identité et d'une IA
propres. La spécification complète est dans [`PROTOCOLE.md`](./PROTOCOLE.md) ; l'avancement
par phase est dans [`CHANGELOG.md`](./CHANGELOG.md).

## Démarrage

```bash
pnpm install
pnpm check          # typecheck + lint + format + tests
pnpm sim run --seed 42 --days 30 --ressources
```

`pnpm sim run` génère un monde, l'affiche en ASCII avec sa distribution de biomes et son
empreinte, puis fait avancer l'horloge du nombre de jours demandé.

## Structure

```
packages/core   moteur déterministe (monde, horloge, RNG, configuration, boucle)
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
