#!/usr/bin/env node
/**
 * CLI `sim` (section 12). `sim run` génère le monde, fait tourner la simulation
 * jour par jour et affiche l'état des personnages.
 */
import { parseArgs } from "node:util";
import {
  Simulation,
  hacherGrille,
  rendreAscii,
  LEGENDE_ASCII,
  BIOMES,
  nomComplet,
  PLANS_BATIMENT,
} from "@sdv/core";
import type { Personnage } from "@sdv/core";

const USAGE = `Usage : sim <commande> [options]

Commandes :
  run        Génère un monde et fait tourner la simulation
  help       Affiche cette aide

Options de run :
  --seed <n|texte>     Graine du monde (défaut : 42)
  --days <n>           Nombre de jours à simuler (défaut : 1)
  --largeur <n>        Largeur de la grille (défaut : 96)
  --hauteur <n>        Hauteur de la grille (défaut : 64)
  --population <n>     Nombre de personnages initiaux (défaut : 12)
  --ressources         Affiche les gisements sur la carte
  --sans-carte         N'affiche pas la carte ASCII
  --verbose            Affiche les événements marquants (décès, gisements épuisés)
`;

function entier(valeur: string | undefined, defaut: number, nom: string): number {
  if (valeur === undefined) return defaut;
  const n = Number.parseInt(valeur, 10);
  if (!Number.isFinite(n)) throw new Error(`Option --${nom} : entier attendu, reçu "${valeur}"`);
  return n;
}

/** Carte avec les bâtiments et les personnages vivants superposés (`@`). */
function carteAvecPersonnages(sim: Simulation, ressources: boolean): string {
  const lignes = rendreAscii(sim.grille, { ressources }).split("\n");
  for (const b of sim.batiments.values()) {
    const { x, y } = b.position;
    const ligne = lignes[y];
    if (ligne === undefined) continue;
    const c = b.etat === "chantier" ? "?" : PLANS_BATIMENT[b.type].ascii;
    lignes[y] = `${ligne.slice(0, x)}${c}${ligne.slice(x + 1)}`;
  }
  for (const p of sim.vivants()) {
    const { x, y } = p.corps.position;
    const ligne = lignes[y];
    if (ligne === undefined) continue;
    lignes[y] = `${ligne.slice(0, x)}@${ligne.slice(x + 1)}`;
  }
  return lignes.join("\n");
}

function jauge(v: number): string {
  return String(Math.round(v)).padStart(3);
}

function ligneStatut(sim: Simulation, p: Personnage): string {
  const b = p.besoins;
  const inv = [
    ...Object.entries(p.corps.inventaire.ressources).map(([r, n]) => `${r}×${n}`),
    ...p.corps.inventaire.objets.map((o) => `[${o.type}]`),
  ].join(" ");
  const etat = p.vivant
    ? p.corps.endormi
      ? "dort  "
      : "éveillé"
    : `mort (${p.causeDeces ?? "?"})`;
  return (
    `  ${nomComplet(p.identite).padEnd(20)} ${etat.padEnd(14)} ` +
    `santé ${jauge(p.corps.sante)} faim ${jauge(b.faim)} soif ${jauge(b.soif)} ` +
    `sommeil ${jauge(b.sommeil)} chaleur ${jauge(b.chaleur)} moral ${jauge(b.moral)} ` +
    `pos (${p.corps.position.x},${p.corps.position.y}) ${inv}`.trimEnd() +
    (sim.tick > 0 && p.intention ? `  → ${p.intention.type}` : "")
  );
}

function commandeRun(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      seed: { type: "string" },
      days: { type: "string" },
      largeur: { type: "string" },
      hauteur: { type: "string" },
      population: { type: "string" },
      ressources: { type: "boolean", default: false },
      "sans-carte": { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
    },
    strict: true,
  });

  const seedBrute = values.seed ?? "42";
  const seed = /^-?\d+$/.test(seedBrute) ? Number.parseInt(seedBrute, 10) : seedBrute;
  const jours = entier(values.days, 1, "days");
  const largeur = entier(values.largeur, 96, "largeur");
  const hauteur = entier(values.hauteur, 64, "hauteur");
  const population = entier(values.population, 12, "population");

  const sim = Simulation.creer({
    seed,
    monde: { largeur, hauteur },
    population: { initiale: population },
  });

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
  console.log();
  console.log(`Population initiale : ${sim.personnages.length}`);
  for (const p of sim.personnages) {
    console.log(
      `  ${nomComplet(p.identite).padEnd(20)} ${p.identite.sexe}  ${p.identite.biographie}`,
    );
  }
  console.log();

  if (values.verbose) {
    sim.journal.ecouter((e) => {
      if (
        e.type === "deces" ||
        e.type === "batiment_termine" ||
        e.type === "batiment_effondre" ||
        e.type === "feu_eteint" ||
        e.type === "outil_casse"
      ) {
        console.log(`  [${sim.horloge.formater(e.tick)}] ${e.type} ${JSON.stringify(e.details)}`);
      }
    });
  }

  console.log(`Début : ${sim.horloge.formater()}`);
  const t0 = performance.now();
  for (let j = 0; j < jours; j++) {
    const avant = sim.statistiques();
    sim.avancerJusquaAube();
    const apres = sim.statistiques();
    const recoltes = sim.journal.compte("recolte");
    const repas = sim.journal.compte("repas");
    console.log(
      `Jour ${String(j + 1).padStart(3)} (${apres.meteo.padEnd(8)}) : vivants ${apres.vivants}/${sim.personnages.length}` +
        (apres.morts > avant.morts ? `  (+${apres.morts - avant.morts} décès)` : "") +
        `  bâtiments ${apres.batiments} (+${apres.chantiers} chantiers)` +
        `  récoltes ${recoltes}  repas ${repas}  événements ${apres.evenements}`,
    );
  }
  const duree = (performance.now() - t0).toFixed(0);
  console.log(`Fin   : ${sim.horloge.formater()}  (${sim.tick} ticks en ${duree} ms)`);
  console.log(`Empreinte du journal : ${sim.journal.empreinte()}`);
  console.log();

  if (!values["sans-carte"]) {
    console.log(carteAvecPersonnages(sim, values.ressources));
    console.log();
    console.log(
      `${LEGENDE_ASCII}\n@ personnage   ? chantier   f feu   A abri   M maison   E entrepôt`,
    );
    console.log();
  }

  console.log("Bâtiments :");
  for (const b of sim.batiments.values()) {
    const plan = PLANS_BATIMENT[b.type];
    const proprietaire = sim.personnage(b.proprietaire)?.identite ?? null;
    console.log(
      `  ${b.id} ${plan.nom.padEnd(12)} ${b.etat.padEnd(8)} (${b.position.x},${b.position.y})  ` +
        `${b.famille.padEnd(10)} ${proprietaire ? proprietaire.prenom : "?"}  solidité ${b.solidite}` +
        (b.type === "feu_de_camp" && b.etat === "termine"
          ? b.allume
            ? "  allumé"
            : "  éteint"
          : "") +
        (b.stock ? `  stock ${JSON.stringify(b.stock.ressources)}` : ""),
    );
  }
  console.log();
  console.log("Personnages :");
  for (const p of sim.personnages) console.log(ligneStatut(sim, p));
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
