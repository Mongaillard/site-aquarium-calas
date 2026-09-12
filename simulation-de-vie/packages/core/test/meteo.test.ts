import { describe, expect, it } from "vitest";
import { EFFETS_METEO, METEOS, tirerMeteo } from "../src/monde/meteo.js";
import { Rng } from "../src/rng.js";
import { Simulation } from "../src/simulation.js";

describe("météo", () => {
  it("est reproductible et ne dépend que de la graine et du jour", () => {
    const a = Rng.depuisGraine(42);
    const b = Rng.depuisGraine(42);
    b.suivant();
    for (let j = 0; j < 50; j++)
      expect(tirerMeteo(a, "printemps", j)).toBe(tirerMeteo(b, "printemps", j));
  });

  it("respecte les saisons : neige seulement en hiver, canicule seulement en été", () => {
    const rng = Rng.depuisGraine(7);
    const vues = {
      printemps: new Set<string>(),
      ete: new Set<string>(),
      automne: new Set<string>(),
      hiver: new Set<string>(),
    };
    for (let j = 0; j < 400; j++) {
      for (const saison of ["printemps", "ete", "automne", "hiver"] as const)
        vues[saison].add(tirerMeteo(rng, saison, j));
    }
    expect(vues.hiver.has("neige")).toBe(true);
    expect(vues.ete.has("canicule")).toBe(true);
    expect(vues.printemps.has("neige")).toBe(false);
    expect(vues.printemps.has("canicule")).toBe(false);
    expect(vues.automne.has("neige")).toBe(false);
    for (const m of METEOS) expect(EFFETS_METEO[m]).toBeDefined();
  });

  it("la simulation tire une météo par jour et la journalise", () => {
    const sim = Simulation.creer({
      seed: 42,
      population: { initiale: 0 },
    });
    expect(METEOS).toContain(sim.meteo);
    sim.avancer(144 * 3 + 1); // l'aube est traitée au premier tick du jour
    expect(sim.journal.compte("meteo")).toBe(4);
  });
});
