import { describe, expect, it } from "vitest";
import { coutChemin, trouverChemin } from "../src/actions/chemin.js";
import { grilleUniforme } from "./utils.js";

describe("trouverChemin", () => {
  it("trouve une ligne droite sur une prairie uniforme", () => {
    const g = grilleUniforme(10, 10);
    const chemin = trouverChemin(g, { x: 0, y: 0 }, { x: 5, y: 0 });
    expect(chemin).not.toBeNull();
    expect(chemin).toHaveLength(5);
    expect(chemin?.[4]).toEqual({ x: 5, y: 0 });
  });

  it("utilise les diagonales", () => {
    const g = grilleUniforme(10, 10);
    const chemin = trouverChemin(g, { x: 0, y: 0 }, { x: 4, y: 4 });
    expect(chemin).toHaveLength(4);
  });

  it("contourne l'eau profonde", () => {
    const mur = Array.from({ length: 9 }, (_, y) => ({ x: 5, y, biome: "eau_profonde" as const }));
    const g = grilleUniforme(10, 10, "prairie", mur); // passage en y = 9
    const chemin = trouverChemin(g, { x: 0, y: 0 }, { x: 9, y: 0 });
    expect(chemin).not.toBeNull();
    expect(chemin?.some((p) => p.x === 5 && p.y === 9)).toBe(true);
    expect(chemin?.every((p) => g.tuile(p.x, p.y).biome !== "eau_profonde")).toBe(true);
  });

  it("renvoie null si la cible est inaccessible ou non praticable", () => {
    const mur = Array.from({ length: 10 }, (_, y) => ({ x: 5, y, biome: "eau_profonde" as const }));
    const g = grilleUniforme(10, 10, "prairie", mur);
    expect(trouverChemin(g, { x: 0, y: 0 }, { x: 9, y: 0 })).toBeNull();
    expect(trouverChemin(g, { x: 0, y: 0 }, { x: 5, y: 0 })).toBeNull();
  });

  it("préfère un détour par la prairie à la traversée d'une montagne", () => {
    const montagne = Array.from({ length: 3 }, (_, i) => ({
      x: 5,
      y: 4 + i,
      biome: "montagne" as const,
    }));
    const g = grilleUniforme(11, 11, "prairie", montagne);
    const chemin = trouverChemin(g, { x: 3, y: 5 }, { x: 7, y: 5 });
    expect(chemin).not.toBeNull();
    expect(chemin?.every((p) => g.tuile(p.x, p.y).biome !== "montagne")).toBe(true);
    expect(coutChemin(g, { x: 3, y: 5 }, chemin ?? [])).toBeLessThan(3.5 + 3);
  });

  it("renvoie un chemin vide quand départ = arrivée", () => {
    const g = grilleUniforme(5, 5);
    expect(trouverChemin(g, { x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([]);
  });

  it("est déterministe", () => {
    const g = grilleUniforme(30, 30, "prairie", [{ x: 10, y: 10, biome: "foret" }]);
    const a = trouverChemin(g, { x: 0, y: 0 }, { x: 29, y: 20 });
    const b = trouverChemin(g, { x: 0, y: 0 }, { x: 29, y: 20 });
    expect(a).toEqual(b);
  });
});
