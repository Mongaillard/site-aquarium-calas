/**
 * M44 : le grain. L'agriculture ne servait à rien — un champ mûr donnait
 * vingt-quatre baies une fois l'an, quand un village de seize consomme deux cent
 * quatre-vingt-dix mille points de faim dans l'année, et les graines ne venaient
 * que d'une chance sur dix en cueillant des baies que personne ne cueillait.
 */
import { describe, expect, it } from "vitest";
import { Simulation } from "../src/index.js";
import { NOURRITURE, VIE_NOURRITURE, ajouter } from "../src/agents/inventaire.js";
import { GISEMENTS_PAR_BIOME } from "../src/monde/ressources.js";
import { RENDEMENT_CHAMP, jourChamp, rendement, semer } from "../src/monde/village.js";
import { meilleureNourritureConnue } from "../src/actions/planificateur.js";
import { prochainBatimentNecessaire } from "../src/monde.js";
import { observer } from "../src/cerveau/perception.js";
import { grilleUniforme } from "./utils.js";
import type { Personnage } from "../src/agents/personnage.js";

function monde(initiale = 2): Simulation {
  const sim = Simulation.creerAvecGrille(
    { seed: 4, population: { initiale, familles: 1 } },
    grilleUniforme(60, 60, "prairie", [{ x: 12, y: 10, biome: "eau_peu_profonde" }]),
  );
  for (const t of [...sim.troupeaux.values()]) sim.troupeaux.delete(t.id);
  return sim;
}

function premier(sim: Simulation): Personnage {
  const p = sim.personnages[0];
  if (p === undefined) throw new Error("monde vide");
  return p;
}

describe("M44 : le grain", () => {
  it("le grain se mange, rassasie moins qu'un poisson, et se garde presque un an", () => {
    expect(NOURRITURE.graines).toBeDefined();
    expect(NOURRITURE.graines ?? 0).toBeLessThan(NOURRITURE.poisson ?? 0);
    // La seule nourriture qui passe l'hiver.
    const vies = Object.values(VIE_NOURRITURE);
    expect(VIE_NOURRITURE.graines).toBe(Math.max(...vies));
  });

  it("la prairie porte des céréales sauvages : on en cueille avant d'en semer", () => {
    const sauvage = GISEMENTS_PAR_BIOME.prairie.find((g) => g.type === "graines");
    if (sauvage === undefined) throw new Error("pas de céréale sauvage en prairie");
    expect(sauvage.outilRequis).toBeNull();
    // Elles repoussent : c'est une ressource, pas un trésor.
    expect(sauvage.tauxRegen).toBeGreaterThan(0);
  });

  it("un champ mûr devient un gisement de grain, et non de baies", () => {
    const sim = monde();
    const p = premier(sim);
    const champ = sim.fonderChantier("champ", { x: 20, y: 20 }, p);
    champ.etat = "termine";
    while (sim.horloge.moment().saison !== "printemps") sim.avancerJusquaAube();
    expect(semer(champ)).toBe(true);
    // Quatre stades de douze jours.
    for (let j = 0; j < 4 * 12 + 2; j++) {
      sim.avancerJusquaAube();
      jourChamp(sim, champ, 0);
      if (champ.culture?.stade === 4) break;
    }
    const tuile = sim.grille.tuileOuNull(20, 20);
    expect(tuile?.gisement?.type).toBe("graines");
    expect(tuile?.gisement?.quantite ?? 0).toBeGreaterThanOrEqual(RENDEMENT_CHAMP * 0.5);
  });

  it("un champ mûr vaut mieux qu'un banc de poisson : on va le récolter", () => {
    const sim = monde();
    const p = premier(sim);
    p.corps.position = { x: 10, y: 10 };
    ajouter(p.corps.inventaire, "canne_a_peche" as never, 0);
    // On ne connaît que l'eau : pas de grain à l'horizon.
    observer(sim, p, 5);
    const tuile = sim.grille.tuileOuNull(14, 10);
    if (tuile === null) throw new Error("hors carte");
    tuile.gisement = {
      type: "graines",
      quantite: 200,
      max: 200,
      tauxRegen: 0,
      outilRequis: null,
      epuiseDepuis: null,
    };
    observer(sim, p, 6);
    expect(meilleureNourritureConnue(p)).toBe("graines");
  });

  it("une famille peut avoir autant de champs que de bouches à nourrir", () => {
    const sim = monde(3);
    const p = premier(sim);
    // Logée, chauffée, pourvue d'un stock et de graines : le champ vient ensuite.
    const abri = sim.fonderChantier("abri", { x: 10, y: 11 }, p);
    abri.etat = "termine";
    const abri2 = sim.fonderChantier("abri", { x: 10, y: 12 }, p);
    abri2.etat = "termine";
    const feu = sim.fonderChantier("feu_de_camp", { x: 10, y: 13 }, p);
    feu.etat = "termine";
    feu.allume = true;
    feu.reserveBois = 10;
    const entrepot = sim.fonderChantier("entrepot", { x: 10, y: 14 }, p);
    entrepot.etat = "termine";
    // Une famille de trois veut sa maison avant son champ : elle l'a.
    const maison = sim.fonderChantier("maison", { x: 10, y: 15 }, p);
    maison.etat = "termine";
    if (entrepot.stock === null) throw new Error("entrepôt sans stock");
    ajouter(entrepot.stock, "graines", 40);
    while (sim.horloge.moment().saison !== "printemps") sim.avancerJusquaAube();
    // Le premier champ, puis le deuxième : un seul par famille ne nourrissait personne.
    const premierChamp = sim.fonderChantier("champ", { x: 16, y: 16 }, p);
    premierChamp.etat = "termine";
    expect(prochainBatimentNecessaire(sim, p)).toBe("champ");
  });

  it("le rendement baisse sans jachère, mais reste d'un autre ordre qu'avant M44", () => {
    // Avant M44 : vingt-quatre unités, soit sept jours de vivres pour une personne.
    expect(RENDEMENT_CHAMP).toBeGreaterThan(24);
    const neuf = rendement({ seme: true, stade: 4, jours: 0, recoltes: 0, jachere: false }, 0);
    const epuise = rendement({ seme: true, stade: 4, jours: 0, recoltes: 3, jachere: false }, 0);
    expect(neuf).toBeGreaterThan(epuise);
    expect(epuise).toBeGreaterThan(24);
  });
});
