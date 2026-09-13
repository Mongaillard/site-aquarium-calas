import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng.js";
import { abondanceDuBerceau, genererGrille } from "../src/monde/generation.js";
import { Simulation } from "../src/simulation.js";
import type { Grille } from "../src/monde/grille.js";

/** Tuiles d'eau et gisements dans le carré de rayon `r` autour de l'origine. */
function inventaire(grille: Grille, r: number): { eau: number; gisements: number; unites: number } {
  let eau = 0;
  let gisements = 0;
  let unites = 0;
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const t = grille.tuile(x, y);
      if (t.biome === "eau_peu_profonde" || t.biome === "eau_profonde") eau += 1;
      if (t.gisement !== null) {
        gisements += 1;
        unites += t.gisement.max;
      }
    }
  return { eau, gisements, unites };
}

describe("le berceau à la mesure de la colonie (M23)", () => {
  it("une part d'abondance pour douze habitants, quatre au plus", () => {
    expect(abondanceDuBerceau(12)).toBe(1);
    expect(abondanceDuBerceau(6)).toBe(1);
    expect(abondanceDuBerceau(24)).toBe(2);
    expect(abondanceDuBerceau(48)).toBe(4);
    expect(abondanceDuBerceau(96)).toBe(4);
  });

  it("à douze, rien ne change ; à quarante-huit, des mares de plus et des gisements plus riches", () => {
    const options = { echelleRelief: 40, echelleContinents: 220, berceau: 28 };
    const normal = genererGrille(Rng.depuisGraine(42).fork("monde"), options);
    const identique = genererGrille(Rng.depuisGraine(42).fork("monde"), {
      ...options,
      abondance: 1,
    });
    const riche = genererGrille(Rng.depuisGraine(42).fork("monde"), { ...options, abondance: 4 });
    const a = inventaire(normal, 28);
    const b = inventaire(identique, 28);
    const c = inventaire(riche, 28);
    expect(b).toEqual(a);
    // Trois mares de rayon 2,5 : au moins une quinzaine de tuiles d'eau en plus.
    expect(c.eau).toBeGreaterThanOrEqual(a.eau + 15);
    expect(c.gisements).toBeGreaterThan(a.gisements * 1.5);
    expect(c.unites).toBeGreaterThan(a.unites * 2);
    // Hors du berceau, le monde est le même.
    const loin = { x: 60, y: 60 };
    expect(riche.tuile(loin.x, loin.y).biome).toBe(normal.tuile(loin.x, loin.y).biome);
    expect(riche.tuile(loin.x, loin.y).gisement).toEqual(normal.tuile(loin.x, loin.y).gisement);
  });

  it("un monde à quarante-huit se sauvegarde et se restaure sur le même berceau", () => {
    const sim = Simulation.creer({ seed: 7, population: { initiale: 48, familles: 12 } });
    sim.avancer(50);
    const copie = Simulation.restaurer(JSON.parse(JSON.stringify(sim.sauvegarder())));
    expect(inventaire(copie.grille, 20)).toEqual(inventaire(sim.grille, 20));
    sim.avancer(100);
    copie.avancer(100);
    expect(copie.journal.empreinte()).toBe(sim.journal.empreinte());
  });
});
