import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";

/** Test d'intégration M1 (section 15) : 12 personnages, 10 jours, cerveau à règles. */
describe("survie (intégration M1)", () => {
  it("au moins 10 personnages sur 12 survivent 10 jours avec la graine 42", () => {
    const sim = Simulation.creer({ seed: 42 });
    for (let j = 0; j < 10; j++) sim.avancerJusquaAube();
    const stats = sim.statistiques();
    expect(stats.vivants).toBeGreaterThanOrEqual(10);
    expect(sim.journal.compte("repas")).toBeGreaterThan(50);
    expect(sim.journal.compte("recolte")).toBeGreaterThan(50);
    for (const p of sim.vivants()) {
      expect(p.corps.sante).toBeGreaterThan(0);
      expect(p.connaissance.size).toBeGreaterThan(0);
    }
  }, 30_000);

  it("deux exécutions identiques produisent le même journal (P1)", () => {
    const a = Simulation.creer({ seed: 7, monde: { largeur: 48, hauteur: 32 } });
    const b = Simulation.creer({ seed: 7, monde: { largeur: 48, hauteur: 32 } });
    a.avancer(3 * 144);
    b.avancer(3 * 144);
    expect(a.journal.empreinte()).toBe(b.journal.empreinte());
    expect(a.personnages.map((p) => p.corps.position)).toEqual(
      b.personnages.map((p) => p.corps.position),
    );
  }, 30_000);

  it("un personnage privé d'eau meurt de soif, et l'événement est journalisé", () => {
    const sim = Simulation.creer({
      seed: 3,
      monde: { largeur: 32, hauteur: 32 },
      population: { initiale: 1, familles: 1 },
    });
    const p = sim.personnages[0];
    if (p === undefined) throw new Error("pas de personnage");
    // On remplace le cerveau par un cerveau passif : le personnage attend indéfiniment.
    sim.definirCerveau(p.id, {
      decider: () => ({ type: "attendre", ticks: 50 }),
      urgence: () => null,
    });
    sim.avancer(6 * 144);
    expect(p.vivant).toBe(false);
    expect(p.causeDeces).toBe("soif");
    const deces = sim.journal.parType("deces");
    expect(deces).toHaveLength(1);
    expect(deces[0]?.importance).toBe(10);
    expect(sim.statistiques()).toMatchObject({ vivants: 0, morts: 1 });
  });

  it("les gisements renouvelables se régénèrent", () => {
    const sim = Simulation.creer({ seed: 42, population: { initiale: 0 } });
    const gisement = [...sim.grille.toutes()].find((t) => t.gisement?.type === "baies")?.gisement;
    if (!gisement) throw new Error("pas de baies");
    gisement.quantite = 0;
    sim.avancer(144);
    expect(gisement.quantite).toBeCloseTo(gisement.tauxRegen, 5);
  });
});
