#!/usr/bin/env node
/**
 * CLI `sim` (section 12). M0 : `sim run` génère le monde, l'affiche en ASCII
 * et fait avancer l'horloge.
 */
import { parseArgs } from "node:util";
import { Simulation, hacherGrille, rendreAscii, LEGENDE_ASCII, BIOMES } from "@sdv/core";

const USAGE = `Usage : sim <commande> [options]

Commandes :
  run        Génère un monde et fait tourner la simulation
  help       Affiche cette aide

Options de run :
  --seed <n|texte>     Graine du monde (défaut : 42)
  --days <n>           Nombre de jours à simuler (défaut : 1)
  --largeur <n>        Largeur de la grille (défaut : 96)
  --hauteur <n>        Hauteur de la grille (défaut : 64)
  --ressources         Affiche les gisements sur la carte
  --sans-carte         N'affiche pas la carte ASCII
`;

function entier(valeur: string | undefined, defaut: number, nom: string): number {
  if (valeur === undefined) return defaut;
  const n = Number.parseInt(valeur, 10);
  if (!Number.isFinite(n)) throw new Error(`Option --${nom} : entier attendu, reçu "${valeur}"`);
  return n;
}

function commandeRun(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      seed: { type: "string" },
      days: { type: "string" },
      largeur: { type: "string" },
      hauteur: { type: "string" },
      ressources: { type: "boolean", default: false },
      "sans-carte": { type: "boolean", default: false },
    },
    strict: true,
  });

  const seedBrute = values.seed ?? "42";
  const seed = /^-?\d+$/.test(seedBrute) ? Number.parseInt(seedBrute, 10) : seedBrute;
  const jours = entier(values.days, 1, "days");
  const largeur = entier(values.largeur, 96, "largeur");
  const hauteur = entier(values.hauteur, 64, "hauteur");

  const sim = Simulation.creer({ seed, monde: { largeur, hauteur } });

  if (!values["sans-carte"]) {
    console.log(rendreAscii(sim.grille, { ressources: values.ressources }));
    console.log();
    console.log(LEGENDE_ASCII);
    console.log();
  }

  const distribution = sim.grille.distributionBiomes();
  const total = largeur * hauteur;
  console.log(
    `Monde ${largeur}×${hauteur}, graine ${String(seed)}, empreinte ${hacherGrille(sim.grille)}`,
  );
  for (const biome of BIOMES) {
    const n = distribution[biome] ?? 0;
    const pct = ((100 * n) / total).toFixed(1).padStart(5);
    console.log(`  ${biome.padEnd(17)} ${String(n).padStart(6)}  ${pct} %`);
  }
  let gisements = 0;
  for (const t of sim.grille.toutes()) if (t.gisement) gisements++;
  console.log(`  gisements         ${String(gisements).padStart(6)}`);
  console.log();

  console.log(`Début : ${sim.horloge.formater()}`);
  const t0 = performance.now();
  for (let j = 0; j < jours; j++) sim.avancerJusquaAube();
  const duree = (performance.now() - t0).toFixed(0);
  console.log(`Fin   : ${sim.horloge.formater()}  (${sim.tick} ticks en ${duree} ms)`);
  return 0;
}

function main(argv: string[]): number {
  const [commande, ...reste] = argv;
  switch (commande) {
    case "run":
      return commandeRun(reste);
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      return commande === undefined ? 1 : 0;
    default:
      console.error(`Commande inconnue : ${commande}\n`);
      console.log(USAGE);
      return 1;
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (erreur) {
  console.error(erreur instanceof Error ? erreur.message : String(erreur));
  process.exitCode = 1;
}
