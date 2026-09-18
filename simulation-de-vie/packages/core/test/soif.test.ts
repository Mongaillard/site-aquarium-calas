/**
 * M42 : on ne meurt plus de soif au bord d'un lac. Le banc de poisson du bord
 * écrasait la mémoire de l'eau ; le puits n'arrivait qu'après un premier mort.
 */
import { describe, expect, it } from "vitest";
import { Simulation } from "../src/index.js";
import { observer } from "../src/cerveau/perception.js";
import { planifier } from "../src/actions/planificateur.js";
import {
  DISTANCE_EAU_POUR_PUITS,
  distanceEauConnue,
  lieuxEauConnus,
  prochainBatimentNecessaire,
  puitsProche,
} from "../src/monde.js";
import { elaguerConnaissance, estLieuEau } from "../src/agents/personnage.js";
import { grilleUniforme } from "./utils.js";
import type { Personnage } from "../src/agents/personnage.js";
import type { Surcharge } from "./utils.js";

function monde(surcharges: readonly Surcharge[], initiale = 2): Simulation {
  const sim = Simulation.creerAvecGrille(
    { seed: 4, population: { initiale, familles: 1 } },
    grilleUniforme(60, 60, "prairie", [...surcharges]),
  );
  for (const t of [...sim.troupeaux.values()]) sim.troupeaux.delete(t.id);
  return sim;
}

function premier(sim: Simulation): Personnage {
  const p = sim.personnages[0];
  if (p === undefined) throw new Error("monde vide");
  return p;
}

describe("M42 : la soif", () => {
  it("une tuile d'eau portant un banc de poisson reste un point d'eau", () => {
    const sim = monde([
      {
        x: 12,
        y: 10,
        biome: "eau_peu_profonde",
        gisement: { type: "poisson", quantite: 30, outilRequis: null },
      },
    ]);
    const p = premier(sim);
    p.corps.position = { x: 10, y: 10 };
    observer(sim, p, 6);
    const lieu = [...p.connaissance.values()].find((l) => l.x === 12 && l.y === 10);
    if (lieu === undefined) throw new Error("la tuile n'a pas été vue");
    // Le poisson reste connu comme poisson — c'est ce qui sert à pêcher…
    expect(lieu.type).toBe("poisson");
    // …et la tuile donne à boire quand même.
    expect(estLieuEau(lieu)).toBe(true);
    expect(lieuxEauConnus(p)).toBeGreaterThan(0);
  });

  it("on va boire à ce lac-là, au lieu d'échouer sur « aucun point d'eau connu »", () => {
    const sim = monde([
      {
        x: 20,
        y: 10,
        biome: "eau_peu_profonde",
        gisement: { type: "poisson", quantite: 30, outilRequis: null },
      },
      {
        x: 20,
        y: 11,
        biome: "eau_peu_profonde",
        gisement: { type: "poisson", quantite: 30, outilRequis: null },
      },
    ]);
    const p = premier(sim);
    p.corps.position = { x: 16, y: 10 };
    observer(sim, p, 8);
    p.besoins.soif = 5;
    const plan = planifier(sim, p, { type: "boire" });
    if (!plan.ok) throw new Error(`on n'a pas su aller boire : ${plan.raison}`);
    expect(plan.plan.length).toBeGreaterThan(0);
  });

  it("un lieu d'eau ne s'oublie pas quand la mémoire déborde", () => {
    const sim = monde([{ x: 12, y: 10, biome: "eau_peu_profonde" }]);
    const p = premier(sim);
    p.corps.position = { x: 11, y: 10 };
    observer(sim, p, 3);
    expect(lieuxEauConnus(p)).toBeGreaterThan(0);
    // Mille lieux de bois, tous vus plus tard que l'eau : l'élagage doit la garder.
    for (let i = 0; i < 1000; i++)
      p.connaissance.set(`bois-${String(i)}`, {
        x: i,
        y: 40,
        type: "bois",
        outilRequis: "hache",
        quantiteVue: 5,
        tickVu: sim.horloge.tick + 1000,
      });
    elaguerConnaissance(p);
    expect(lieuxEauConnus(p)).toBeGreaterThan(0);
  });

  it("l'eau trop loin décide un puits, sans attendre un mort de soif", () => {
    const sim = monde([{ x: 40, y: 10, biome: "eau_peu_profonde" }]);
    const p = premier(sim);
    p.corps.position = { x: 10, y: 10 };
    observer(sim, p, 40);
    expect(distanceEauConnue(p)).toBeGreaterThanOrEqual(DISTANCE_EAU_POUR_PUITS);
    // Personne ne connaît la leçon du mort de soif.
    expect(p.savoirs.get("puits_pres_du_village")).toBeUndefined();
    // On loge, on chauffe et on stocke la famille d'abord : le puits vient ensuite.
    const abri = sim.fonderChantier("abri", { x: 10, y: 11 }, p);
    abri.etat = "termine";
    const feu = sim.fonderChantier("feu_de_camp", { x: 10, y: 12 }, p);
    feu.etat = "termine";
    feu.allume = true;
    feu.reserveBois = 10;
    const entrepot = sim.fonderChantier("entrepot", { x: 10, y: 13 }, p);
    entrepot.etat = "termine";
    expect(prochainBatimentNecessaire(sim, p)).toBe("puits");
  });

  it("l'eau à côté ne fait pas creuser de puits, et un puits voisin dispense du second", () => {
    const sim = monde([{ x: 14, y: 10, biome: "eau_peu_profonde" }]);
    const p = premier(sim);
    p.corps.position = { x: 10, y: 10 };
    observer(sim, p, 8);
    expect(distanceEauConnue(p)).toBeLessThan(DISTANCE_EAU_POUR_PUITS);
    expect(prochainBatimentNecessaire(sim, p)).not.toBe("puits");
    expect(puitsProche(sim, p.corps.position)).toBe(false);
    sim.fonderChantier("puits", { x: 12, y: 12 }, p);
    expect(puitsProche(sim, p.corps.position)).toBe(true);
  });
});
