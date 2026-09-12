import { describe, expect, it } from "vitest";
import { RuleBrain } from "../src/cerveau/rule-brain.js";
import { percevoir } from "../src/cerveau/perception.js";
import { Simulation } from "../src/simulation.js";
import { ajouter } from "../src/agents/inventaire.js";
import { gisementBaies, grilleUniforme } from "./utils.js";

function scenario() {
  const eau = Array.from({ length: 20 }, (_, y) => ({
    x: 0,
    y,
    biome: "eau_peu_profonde" as const,
  }));
  const grille = grilleUniforme(20, 20, "prairie", [
    ...eau,
    { x: 3, y: 3, gisement: gisementBaies(5) },
  ]);
  const sim = Simulation.creerAvecGrille(
    { seed: 5, population: { initiale: 1, familles: 1 } },
    grille,
  );
  const p = sim.personnages[0];
  if (p === undefined) throw new Error("pas de personnage");
  p.corps.position = { x: 3, y: 5 };
  Object.assign(p.besoins, {
    faim: 90,
    soif: 90,
    sommeil: 90,
    chaleur: 100,
    securite: 80,
    social: 80,
    moral: 80,
  });
  return { sim, p, cerveau: new RuleBrain(p) };
}

describe("RuleBrain", () => {
  it("choisit boire quand la soif domine", () => {
    const { sim, p, cerveau } = scenario();
    p.besoins.soif = 20;
    expect(cerveau.decider(percevoir(sim, p))).toEqual({ type: "boire" });
  });

  it("choisit manger quand la faim domine", () => {
    const { sim, p, cerveau } = scenario();
    p.besoins.faim = 20;
    expect(cerveau.decider(percevoir(sim, p))).toEqual({ type: "manger" });
  });

  it("choisit dormir la nuit quand le sommeil est bas", () => {
    const { sim, p, cerveau } = scenario();
    sim.horloge.avancer(23 * 6); // 23 h
    p.besoins.sommeil = 30;
    expect(cerveau.decider(percevoir(sim, p))).toEqual({ type: "dormir" });
  });

  it("ne propose ni manger ni boire quand les besoins sont satisfaits", () => {
    const { sim, p, cerveau } = scenario();
    const types = cerveau.candidats(percevoir(sim, p)).map((c) => c.intention.type);
    expect(types).not.toContain("manger");
    expect(types).not.toContain("boire");
    expect(types).toContain("explorer");
  });

  it("propose de faire des réserves de baies quand il en connaît et n'en a pas", () => {
    const { sim, p, cerveau } = scenario();
    const avant = cerveau.candidats(percevoir(sim, p)).map((c) => c.intention.type);
    expect(avant).toContain("recolter");
    ajouter(p.corps.inventaire, "baies", 2);
    const apres = cerveau.candidats(percevoir(sim, p)).map((c) => c.intention.type);
    expect(apres).not.toContain("recolter");
  });

  it("urgence : interrompt pour boire sous le seuil, sinon null", () => {
    const { sim, p, cerveau } = scenario();
    expect(cerveau.urgence(percevoir(sim, p))).toBeNull();
    p.besoins.soif = 10;
    expect(cerveau.urgence(percevoir(sim, p))).toEqual({ type: "boire" });
  });

  it("est déterministe à graine égale", () => {
    const a = scenario();
    const b = scenario();
    for (let i = 0; i < 20; i++) {
      expect(a.cerveau.decider(percevoir(a.sim, a.p))).toEqual(
        b.cerveau.decider(percevoir(b.sim, b.p)),
      );
    }
  });
});
