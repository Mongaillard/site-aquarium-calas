import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { observer } from "../src/cerveau/perception.js";

describe("découverte du monde", () => {
  it("la grille compte chaque tuile découverte une seule fois", () => {
    const sim = Simulation.creer({ seed: 7 });
    const g = sim.grille;
    const avant = g.nombreDecouvertes;
    expect(g.decouvrir(g.limite + 1, 0)).toBe(false);
    // Le voisinage de départ est déjà marqué : on regarde une tuile lointaine (générée au passage).
    const loin = { x: 300, y: -260 };
    expect(g.estDecouverte(loin.x, loin.y)).toBe(false);
    expect(g.decouvrir(loin.x, loin.y)).toBe(true);
    expect(g.decouvrir(loin.x, loin.y)).toBe(false);
    expect(g.estDecouverte(loin.x, loin.y)).toBe(true);
    expect(g.nombreDecouvertes).toBe(avant + 1);
  });

  it("observer marque le voisinage visible, et la colonie découvre le monde peu à peu", () => {
    const sim = Simulation.creer({ seed: 7 });
    const auDepart = sim.grille.nombreDecouvertes;
    expect(auDepart).toBeGreaterThan(0);
    expect(auDepart).toBeLessThan(sim.grille.nombreTuiles / 2);
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    observer(sim, p, 3);
    const { x, y } = p.corps.position;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++)
        if (sim.grille.contient(x + dx, y + dy))
          expect(sim.grille.estDecouverte(x + dx, y + dy)).toBe(true);
    const morceauxAvant = sim.grille.nombreMorceaux;
    sim.avancer(144 * 5);
    expect(sim.grille.nombreDecouvertes).toBeGreaterThan(auDepart);
    // Le monde grandit avec l'exploration.
    expect(sim.grille.nombreMorceaux).toBeGreaterThanOrEqual(morceauxAvant);
  });
});
