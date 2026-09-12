import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { observer } from "../src/cerveau/perception.js";

describe("découverte du monde", () => {
  it("la grille compte chaque tuile découverte une seule fois", () => {
    const sim = Simulation.creer({ seed: 7, monde: { largeur: 32, hauteur: 24 } });
    const g = sim.grille;
    const avant = g.nombreDecouvertes;
    expect(g.decouvrir(-1, 0)).toBe(false);
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    const { x, y } = p.corps.position;
    // Le premier tick a déjà tout marqué autour des personnages : on regarde une tuile lointaine.
    const loin = { x: (x + 16) % 32, y: (y + 12) % 24 };
    const inedit = !g.estDecouverte(loin.x, loin.y);
    expect(g.decouvrir(loin.x, loin.y)).toBe(inedit);
    expect(g.decouvrir(loin.x, loin.y)).toBe(false);
    expect(g.estDecouverte(loin.x, loin.y)).toBe(true);
    expect(g.nombreDecouvertes).toBe(avant + (inedit ? 1 : 0));
  });

  it("observer marque le voisinage visible, et la colonie découvre le monde peu à peu", () => {
    const sim = Simulation.creer({ seed: 7, monde: { largeur: 48, hauteur: 32 } });
    const total = 48 * 32;
    const auDepart = sim.grille.nombreDecouvertes;
    expect(auDepart).toBeGreaterThan(0);
    expect(auDepart).toBeLessThan(total / 2);
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    observer(sim, p, 3);
    const { x, y } = p.corps.position;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++)
        if (sim.grille.contient(x + dx, y + dy))
          expect(sim.grille.estDecouverte(x + dx, y + dy)).toBe(true);
    sim.avancer(144 * 5);
    expect(sim.grille.nombreDecouvertes).toBeGreaterThan(auDepart);
    expect(sim.grille.tuilesDecouvertes().length).toBe(total);
  });
});
