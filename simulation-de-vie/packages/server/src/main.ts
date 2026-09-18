#!/usr/bin/env node
/** `sim-serve` : lance une simulation et la sert au viewer. */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Simulation } from "@sdv/core";
import { Serveur } from "./serveur.js";

const USAGE = `Usage : sim-serve [options]

  --seed <n|texte>     Graine du monde (défaut : 42)
  --port <n>           Port HTTP / WebSocket (défaut : 8080)
  --vitesse <n>        Ticks de jeu par seconde au démarrage (défaut : 4)
  --pause              Démarre en pause
  --jours <n>          Jours à simuler avant d'ouvrir le serveur (défaut : 0)
  --population <n>     Personnages initiaux (défaut : 12)
  --statique <dossier> Dossier du viewer construit (défaut : packages/viewer/dist)
`;

function entier(valeur: string | undefined, defaut: number): number {
  if (valeur === undefined) return defaut;
  const n = Number.parseInt(valeur, 10);
  if (!Number.isFinite(n)) throw new Error(`entier attendu, reçu "${valeur}"`);
  return n;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      seed: { type: "string" },
      port: { type: "string" },
      vitesse: { type: "string" },
      pause: { type: "boolean", default: false },
      jours: { type: "string" },
      population: { type: "string" },
      statique: { type: "string" },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const seedBrute = values.seed ?? "42";
  const seed = /^-?\d+$/.test(seedBrute) ? Number.parseInt(seedBrute, 10) : seedBrute;
  const sim = Simulation.creer({ seed, population: { initiale: entier(values.population, 12) } });
  const jours = entier(values.jours, 0);
  for (let j = 0; j < jours; j++) sim.avancerJusquaAube();

  const statique = values.statique ?? fileURLToPath(new URL("../../viewer/dist/", import.meta.url));
  const racineStatique = existsSync(statique) ? statique : null;
  if (racineStatique === null) {
    console.warn(
      `Viewer introuvable dans ${statique} : lancez d'abord \`pnpm --filter @sdv/viewer build\`.`,
    );
  }
  const serveur = new Serveur(sim, {
    port: entier(values.port, 8080),
    ticksParSeconde: entier(values.vitesse, 4),
    pause: values.pause,
    racineStatique,
  });
  const port = await serveur.demarrer();
  console.log(
    `Simulation (graine ${String(seed)}, ${sim.personnages.length} personnages, jour ${jours + 1}) : http://localhost:${port}`,
  );
  const arreter = (): void => {
    void serveur.arreter().then(() => process.exit(0));
  };
  process.on("SIGINT", arreter);
  process.on("SIGTERM", arreter);
}

main().catch((erreur: unknown) => {
  console.error(erreur instanceof Error ? erreur.message : String(erreur));
  process.exitCode = 1;
});
