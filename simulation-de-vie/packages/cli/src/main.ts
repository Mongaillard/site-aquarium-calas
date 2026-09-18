#!/usr/bin/env node
/**
 * CLI `sim` (section 12). `sim run` génère le monde, fait tourner la simulation
 * jour par jour et affiche l'état des personnages.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
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
  traverser  Fait traverser les âges à un monde, sans écran, en semant des instantanés
  help       Affiche cette aide

Options de traverser :
  --seed <n|texte>      Graine du monde (défaut : 42)
  --annees <n>          Durée, en années du jeu (4 saisons de 30 jours, soit 120 jours)
  --jours <n>           Durée en jours ; l'emporte sur --annees
  --population <n>      Personnages au départ (défaut : 12)
  --dossier <chemin>    Où semer les instantanés (défaut : chronique)
  --tous-les <jours>    Un instantané tous les tant de jours (défaut : 360)
  --json                Écrit les instantanés en clair ; par défaut ils sont comprimés
                        (à l'an cinq : 10,9 Mo en clair contre 1,1 Mo en gzip)
  --sans-conteur        Coupe les épreuves du ciel : on mesure le monde, pas ses malheurs
  --sans-instantanes    Ne rien écrire : on veut juste la courbe

Options de run :
  --seed <n|texte>     Graine du monde (défaut : 42)
  --days <n>           Nombre de jours à simuler (défaut : 1)
  --rayon <n>          Rayon de la carte affichée autour du berceau (défaut : 48)
  --population <n>     Nombre de personnages initiaux (défaut : 12)
  --ressources         Affiche les gisements sur la carte
  --sans-carte         N'affiche pas la carte ASCII
  --verbose            Affiche les événements marquants (décès, bâtiments, vols…)
  --inspect <id>       Affiche l'identité, les relations et les souvenirs d'un personnage (ex. p-0001)
  --journal <fichier>  Écrit le journal complet au format NDJSON à la fin
  --genealogie <fichier>  Écrit l'arbre généalogique en JSON à la fin
`;

function entier(valeur: string | undefined, defaut: number, nom: string): number {
  if (valeur === undefined) return defaut;
  const n = Number.parseInt(valeur, 10);
  if (!Number.isFinite(n)) throw new Error(`Option --${nom} : entier attendu, reçu "${valeur}"`);
  return n;
}

interface Zone {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Carte de la zone avec les bâtiments et les personnages vivants superposés (`@`). */
function carteAvecPersonnages(sim: Simulation, zone: Zone, ressources: boolean): string {
  const lignes = rendreAscii(sim.grille, { zone, ressources }).split("\n");
  const poser = (x: number, y: number, c: string): void => {
    const ligne = lignes[y - zone.y0];
    if (ligne === undefined || x < zone.x0 || x > zone.x1) return;
    const i = x - zone.x0;
    lignes[y - zone.y0] = `${ligne.slice(0, i)}${c}${ligne.slice(i + 1)}`;
  };
  for (const b of sim.batiments.values()) {
    poser(b.position.x, b.position.y, b.etat === "chantier" ? "?" : PLANS_BATIMENT[b.type].ascii);
  }
  for (const p of sim.vivants()) poser(p.corps.position.x, p.corps.position.y, "@");
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
    ? `${p.corps.endormi ? "dort" : "éveillé"} ${p.corps.stade}${p.corps.enceinte ? " enceinte" : ""}`
    : `mort (${p.causeDeces ?? "?"})`;
  return (
    `  ${nomComplet(p.identite).padEnd(20)} ${etat.padEnd(24)} ` +
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
      rayon: { type: "string" },
      population: { type: "string" },
      ressources: { type: "boolean", default: false },
      "sans-carte": { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
      inspect: { type: "string" },
      journal: { type: "string" },
      genealogie: { type: "string" },
    },
    strict: true,
  });

  const seedBrute = values.seed ?? "42";
  const seed = /^-?\d+$/.test(seedBrute) ? Number.parseInt(seedBrute, 10) : seedBrute;
  const jours = entier(values.days, 1, "days");
  const rayon = entier(values.rayon, 48, "rayon");
  const population = entier(values.population, 12, "population");

  const sim = Simulation.creer({
    seed,
    population: { initiale: population },
  });
  // Le monde n'a pas de limite : on génère et on affiche un carré autour du berceau.
  const zone = { x0: -rayon, y0: -rayon, x1: rayon - 1, y1: rayon - 1 };
  for (let y = zone.y0; y <= zone.y1; y += 32)
    for (let x = zone.x0; x <= zone.x1; x += 32) sim.grille.tuileOuNull(x, y);

  const distribution = sim.grille.distributionBiomes();
  const total = sim.grille.nombreTuiles;
  console.log(
    `Monde sans limite (${String(sim.grille.nombreMorceaux)} morceaux générés autour du berceau), graine ${String(seed)}, empreinte ${hacherGrille(sim.grille)}`,
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
        e.type === "outil_casse" ||
        e.type === "vol" ||
        e.type === "invitation" ||
        e.type === "union" ||
        e.type === "grossesse" ||
        e.type === "naissance" ||
        e.type === "adoption" ||
        e.type === "stade"
      ) {
        console.log(`  [${sim.horloge.formater(e.tick)}] ${e.type} ${JSON.stringify(e.details)}`);
      }
    });
  }

  console.log(`Début : ${sim.horloge.formater()}`);
  const t0 = performance.now();
  for (let j = 0; j < jours; j++) {
    const avant = sim.statistiques();
    const naissancesAvant = sim.journal.compte("naissance");
    sim.avancerJusquaAube();
    const apres = sim.statistiques();
    const naissances = sim.journal.compte("naissance") - naissancesAvant;
    const recoltes = sim.journal.compte("recolte");
    const repas = sim.journal.compte("repas");
    console.log(
      `Jour ${String(j + 1).padStart(3)} (${apres.meteo.padEnd(8)}) : vivants ${apres.vivants}/${sim.personnages.length}` +
        (apres.morts > avant.morts ? `  (+${apres.morts - avant.morts} décès)` : "") +
        (naissances > 0 ? `  (+${naissances} naissance${naissances > 1 ? "s" : ""})` : "") +
        `  bâtiments ${apres.batiments} (+${apres.chantiers} chantiers)` +
        `  récoltes ${recoltes}  repas ${repas}  événements ${apres.evenements}`,
    );
  }
  const duree = (performance.now() - t0).toFixed(0);
  console.log(`Fin   : ${sim.horloge.formater()}  (${sim.tick} ticks en ${duree} ms)`);
  console.log(`Empreinte du journal : ${sim.journal.empreinte()}`);
  console.log();

  if (!values["sans-carte"]) {
    console.log(carteAvecPersonnages(sim, zone, values.ressources));
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
  console.log();
  console.log(
    `Social : ${sim.journal.compte("dialogue")} dialogues, ${sim.journal.compte("offre")} dons, ` +
      `${sim.journal.compte("demande")} demandes, ${sim.journal.compte("vol")} vols, ` +
      `${sim.journal.compte("invitation")} invitations, ${sim.journal.compte("reflexion")} réflexions`,
  );
  console.log(
    `Vie : ${sim.journal.compte("cour")} cours, ${sim.journal.compte("union")} unions, ` +
      `${sim.journal.compte("grossesse")} grossesses, ${sim.journal.compte("naissance")} naissances, ` +
      `${sim.journal.compte("deces")} décès, ${sim.journal.compte("adoption")} adoptions` +
      `  (population ${sim.personnages.length}, générations ${sim.genealogie().generations})`,
  );

  if (values.inspect !== undefined) {
    console.log();
    inspecter(sim, values.inspect);
  }
  if (values.genealogie !== undefined) {
    writeFileSync(values.genealogie, JSON.stringify(sim.genealogie(), null, 2), "utf8");
    console.log(`Généalogie écrite : ${values.genealogie}`);
  }
  if (values.journal !== undefined) {
    writeFileSync(values.journal, `${sim.journal.ndjson()}\n`, "utf8");
    console.log(`Journal écrit : ${values.journal} (${sim.journal.taille} événements)`);
  }
  return 0;
}

/** Un moment semé le long d'une traversée : de quoi le retrouver et le résumer. */
interface Moment {
  readonly fichier: string;
  readonly jour: number;
  readonly an: number;
  readonly saison: string;
  readonly vivants: number;
  readonly batiments: number;
  readonly villages: number;
  readonly champs: number;
  readonly trouvailles: number;
  readonly naissances: number;
  readonly morts: number;
  readonly octets: number;
}

/**
 * `sim traverser` : le moteur sans écran. On fait tourner des décennies sans
 * navigateur, et l'on **sème des instantanés** — des sauvegardes datées, qu'on
 * rouvre ensuite dans le viewer pour aller regarder un moment précis.
 *
 * **[DÉCISION]** Un fichier par moment plutôt qu'un journal continu : une
 * sauvegarde se recharge telle quelle par `Simulation.restaurer`, donc le moment
 * n'est pas une image, c'est une partie — on peut la reprendre, la continuer, y
 * jouer au dieu. Un index `chronique.json` les recense pour qu'on sache où aller.
 */
function commandeTraverser(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      seed: { type: "string" },
      annees: { type: "string" },
      jours: { type: "string" },
      population: { type: "string" },
      dossier: { type: "string" },
      "tous-les": { type: "string" },
      json: { type: "boolean", default: false },
      "sans-conteur": { type: "boolean", default: false },
      "sans-instantanes": { type: "boolean", default: false },
    },
  });
  const graine = values.seed ?? "42";
  const seed = /^-?\d+$/.test(graine) ? Number.parseInt(graine, 10) : graine;
  const annees = entier(values.annees, 10, "annees");
  const population = entier(values.population, 12, "population");
  const pas = Math.max(1, entier(values["tous-les"], 360, "tous-les"));
  const dossier = values.dossier ?? "chronique";
  const ecrire = !values["sans-instantanes"];

  const sim = Simulation.creer({ seed, population: { initiale: population } });
  // **[DÉCISION]** L'année vient de l'horloge du monde et non d'un 360 écrit à la
  // main : une année du jeu fait quatre saisons de trente jours, soit cent vingt
  // jours. Compter en années de 360 jours faisait dire « an 3 » au moment où le
  // monde en affichait 7 — et triplait toutes les durées annoncées.
  const joursParAn = sim.config.monde.joursParSaison * 4;
  const jours = entier(values.jours, annees * joursParAn, "jours");
  if (values["sans-conteur"]) sim.lois.conteur = false;
  if (ecrire) mkdirSync(dossier, { recursive: true });

  const moments: Moment[] = [];
  let naissancesVues = 0;
  let mortsVues = 0;
  const causes = new Map<string, number>();
  sim.journal.ecouter((e) => {
    if (e.type === "deces") {
      const c = String(e.details.cause ?? "?");
      causes.set(c, (causes.get(c) ?? 0) + 1);
    }
  });

  const semer = (): void => {
    const jour = sim.horloge.moment().jourAbsolu;
    const naissances = sim.journal.compte("naissance");
    const morts = sim.journal.compte("deces");
    let octets = 0;
    let fichier = "";
    if (ecrire) {
      const nom = `jour-${String(jour).padStart(6, "0")}`;
      const json = JSON.stringify(sim.sauvegarder());
      // **[DÉCISION]** Comprimé par défaut : une sauvegarde pèse 10,9 Mo en clair à
      // l'an cinq contre 1,1 Mo en gzip, et une traversée en sème des dizaines.
      if (values.json) {
        fichier = `${nom}.json`;
        octets = Buffer.byteLength(json, "utf8");
        writeFileSync(join(dossier, fichier), json, "utf8");
      } else {
        const gz = gzipSync(json);
        fichier = `${nom}.json.gz`;
        octets = gz.length;
        writeFileSync(join(dossier, fichier), gz);
      }
    }
    const m = sim.horloge.moment();
    let champs = 0;
    for (const b of sim.batiments.values()) if (b.type === "champ") champs += 1;
    const moment: Moment = {
      fichier,
      jour,
      an: m.annee,
      saison: m.saison,
      vivants: sim.vivants().length,
      batiments: sim.batiments.size,
      villages: sim.villages.villages.length,
      champs,
      trouvailles: sim.trouvailles.trouvailles.size,
      naissances: naissances - naissancesVues,
      morts: morts - mortsVues,
      octets,
    };
    naissancesVues = naissances;
    mortsVues = morts;
    moments.push(moment);
    console.log(
      `  an ${String(moment.an).padStart(3)} · jour ${String(jour).padStart(6)} · ` +
        `${String(moment.vivants).padStart(4)} vivants ` +
        `(+${moment.naissances} −${moment.morts})  ` +
        `${String(moment.batiments).padStart(4)} bâtiments, ${String(moment.champs).padStart(3)} champs, ` +
        `${moment.villages} village${moment.villages > 1 ? "s" : ""}, ${moment.trouvailles} trouvailles` +
        (ecrire ? `  → ${fichier} (${(octets / 1024 / 1024).toFixed(2)} Mo)` : ""),
    );
  };

  console.log(
    `Traversée : graine ${String(seed)}, ${population} au départ, ${jours} jours ` +
      `(${(jours / joursParAn).toFixed(1)} ans de ${joursParAn} jours), un instantané tous les ${pas} jours` +
      (ecrire ? ` dans ${dossier}/` : " (sans écrire)"),
  );
  const t0 = performance.now();
  semer();
  let eteint = -1;
  for (let j = 1; j <= jours; j++) {
    sim.avancerJusquaAube();
    if (eteint < 0 && sim.vivants().length === 0) {
      eteint = j;
      console.log(`  ⚑ le monde s'éteint au jour ${String(j)}`);
      semer();
      break;
    }
    if (j % pas === 0) semer();
  }
  if (eteint < 0 && jours % pas !== 0) semer();
  const duree = performance.now() - t0;

  if (ecrire) {
    const index = {
      seed: String(seed),
      population,
      jours,
      pas,
      conteur: sim.lois.conteur,
      eteintAuJour: eteint < 0 ? null : eteint,
      dureeMs: Math.round(duree),
      moments,
    };
    writeFileSync(join(dossier, "chronique.json"), JSON.stringify(index, null, 2), "utf8");
  }

  const dernier = moments[moments.length - 1];
  const parAn = duree / Math.max(1, jours / joursParAn);
  console.log();
  console.log(
    `Fin : ${eteint < 0 ? `${String(dernier?.vivants ?? 0)} vivants` : `monde éteint au jour ${String(eteint)}`}` +
      ` en ${(duree / 1000).toFixed(1)} s, soit ${(parAn / 1000).toFixed(1)} s par année simulée.`,
  );
  const tri = [...causes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (tri.length > 0)
    console.log(`Causes de décès : ${tri.map(([c, n]) => `${c} ${String(n)}`).join(", ")}`);
  if (ecrire)
    console.log(
      `${moments.length} instantanés dans ${dossier}/ — ouvrez-en un dans le viewer ` +
        `(Sauvegardes → « Ouvrir un fichier ») pour reprendre la partie à ce moment-là.`,
    );
  return 0;
}

/** Fiche complète d'un personnage : identité, relations, souvenirs récents. */
function inspecter(sim: Simulation, id: string): void {
  const p = sim.personnage(id);
  if (p === undefined) {
    console.log(`Personnage inconnu : ${id}`);
    return;
  }
  const i = p.identite;
  console.log(`=== ${nomComplet(i)} (${p.id}) ===`);
  console.log(i.biographie);
  console.log(`« ${i.motto} »`);
  const pers = Object.entries(i.personnalite as unknown as Record<string, number>)
    .map(([k, v]) => `${k} ${v.toFixed(2)}`)
    .join("  ");
  console.log(`Personnalité : ${pers}`);
  console.log(
    `Réputation : ${p.reputation}   Lieux connus : ${p.connaissance.size}   Souvenirs : ${p.memoire.taille}`,
  );
  console.log("Relations :");
  const relations = [...p.relations.values()].sort((a, b) => b.affinite - a.affinite);
  for (const r of relations) {
    const autre = sim.personnage(r.cible);
    console.log(
      `  ${(autre ? nomComplet(autre.identite) : r.cible).padEnd(20)} ${r.lien.padEnd(12)} ` +
        `affinité ${String(Math.round(r.affinite)).padStart(4)}  confiance ${String(Math.round(r.confiance)).padStart(3)}  ` +
        `dette ${String(r.dette).padStart(3)}  interactions ${r.interactions}`,
    );
  }
  console.log("Souvenirs marquants :");
  for (const s of p.memoire.recuperer({ tick: sim.tick }, 12)) {
    console.log(`  [${sim.horloge.formater(s.tick)}] (${s.importance}) ${s.texte}`);
  }
  console.log("Derniers souvenirs :");
  for (const s of p.memoire.tous().slice(-10)) {
    console.log(`  [${sim.horloge.formater(s.tick)}] (${s.importance}) ${s.texte}`);
  }
}

function main(argv: string[]): number {
  const [commande, ...reste] = argv;
  switch (commande) {
    case "run":
      return commandeRun(reste);
    case "traverser":
      return commandeTraverser(reste);
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
