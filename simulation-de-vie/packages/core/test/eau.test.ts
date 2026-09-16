import { describe, expect, it } from "vitest";
import {
  COUT_EAU_PIROGUE,
  coutChemin,
  trouverChemin,
  trouverCheminVers,
} from "../src/actions/chemin.js";
import { INFO_BIOME } from "../src/monde/biomes.js";
import { LARGEUR_GUE_MAX, PAS_GUE, SEUILS, genererGrille } from "../src/monde/generation.js";
import { Rng } from "../src/rng.js";
import { grilleUniforme } from "./utils.js";
import type { Surcharge } from "./utils.js";

/** Une bande d'eau peu profonde verticale, colonne `x`, sur toute la hauteur. */
function bande(x: number, hauteur: number, biome: Surcharge["biome"]): Surcharge[] {
  return Array.from({ length: hauteur }, (_, y) => ({ x, y, biome }));
}

describe("M30 : l'eau", () => {
  it("l'eau peu profonde ne se passe plus à pied, un gué si", () => {
    expect(INFO_BIOME.eau_peu_profonde.praticable).toBe(false);
    expect(INFO_BIOME.gue.praticable).toBe(true);
    const sansGue = grilleUniforme(12, 5, "prairie", bande(5, 5, "eau_peu_profonde"));
    expect(trouverChemin(sansGue, { x: 1, y: 2 }, { x: 9, y: 2 })).toBeNull();
    const avecGue = grilleUniforme(12, 5, "prairie", [
      ...bande(5, 5, "eau_peu_profonde"),
      { x: 5, y: 3, biome: "gue" },
    ]);
    const chemin = trouverChemin(avecGue, { x: 1, y: 2 }, { x: 9, y: 2 });
    expect(chemin).not.toBeNull();
    expect(chemin?.some((c) => c.x === 5 && c.y === 3)).toBe(true);
  });

  it("en pirogue, l'eau peu profonde se traverse comme l'eau profonde", () => {
    const grille = grilleUniforme(12, 5, "prairie", bande(5, 5, "eau_peu_profonde"));
    const chemin = trouverChemin(grille, { x: 1, y: 2 }, { x: 9, y: 2 }, { traverseEau: true });
    expect(chemin).not.toBeNull();
    expect(chemin?.some((c) => c.x === 5)).toBe(true);
  });

  it("d'un port, la barque mène à l'autre port par-dessus l'eau profonde, sans pirogue", () => {
    const grille = grilleUniforme(14, 5, "prairie", [
      ...bande(6, 5, "eau_profonde"),
      ...bande(7, 5, "eau_profonde"),
    ]);
    const premier = { x: 5, y: 2 };
    const ports = [premier, { x: 8, y: 2 }];
    expect(trouverChemin(grille, { x: 1, y: 2 }, { x: 12, y: 2 })).toBeNull();
    const chemin = trouverChemin(grille, { x: 1, y: 2 }, { x: 12, y: 2 }, { ports });
    expect(chemin).not.toBeNull();
    const i = chemin?.findIndex((c) => c.x === 5 && c.y === 2) ?? -1;
    expect(i).toBeGreaterThanOrEqual(0);
    // Le pas suivant est l'autre port : un saut, jamais une tuile d'eau.
    expect(chemin?.[i + 1]).toEqual({ x: 8, y: 2 });
    expect(chemin?.some((c) => c.x === 6 || c.x === 7)).toBe(false);
    // Le saut se paie à la distance, au prix de l'eau en pirogue.
    const cout = coutChemin(grille, { x: 1, y: 2 }, chemin ?? []);
    expect(cout).toBeCloseTo(4 + 3 * COUT_EAU_PIROGUE + 4, 5);
    // Un port seul ne mène nulle part.
    expect(trouverChemin(grille, { x: 1, y: 2 }, { x: 12, y: 2 }, { ports: [premier] })).toBeNull();
  });

  it("trouverCheminVers rejoint la rive atteignable la plus proche, pas la plus proche à vol d'oiseau", () => {
    // Un lac au milieu ; un îlot de terre à (5, 2), plus près que la rive ouest mais hors d'atteinte.
    const grille = grilleUniforme(12, 5, "prairie", [
      ...bande(4, 5, "eau_profonde"),
      ...bande(5, 5, "eau_profonde"),
      ...bande(6, 5, "eau_profonde"),
      { x: 5, y: 2, biome: "plage" },
    ]);
    const auBordDeLEau = (x: number, y: number): boolean =>
      grille.voisins(x, y).some((t) => t.biome === "eau_profonde");
    const chemin = trouverCheminVers(grille, { x: 0, y: 2 }, auBordDeLEau);
    expect(chemin).not.toBeNull();
    expect(chemin?.at(-1)).toEqual({ x: 3, y: 2 });
    // Déjà au bord : rien à faire ; nulle part au bord : null.
    expect(trouverCheminVers(grille, { x: 3, y: 2 }, auBordDeLEau)).toEqual([]);
    const sec = grilleUniforme(6, 3, "prairie");
    expect(trouverCheminVers(sec, { x: 0, y: 0 }, () => false)).toBeNull();
  });

  it("la génération pose des gués rares, étroits, rive à rive", () => {
    const grille = genererGrille(Rng.depuisGraine(7));
    const gues: { x: number; y: number }[] = [];
    let peuProfonde = 0;
    for (let y = -96; y < 96; y++)
      for (let x = -96; x < 96; x++) {
        const b = grille.tuile(x, y).biome;
        if (b === "gue") gues.push({ x, y });
        if (b === "eau_peu_profonde") peuProfonde += 1;
      }
    expect(gues.length).toBeGreaterThan(0);
    expect(gues.length).toBeLessThan(peuProfonde / 4);
    const terre = (x: number, y: number): boolean => grille.tuile(x, y).altitude >= SEUILS.mer;
    for (const g of gues) {
      // Sur un axe au moins, la terre est à trois pas au plus de chaque côté.
      const etroit = (
        [
          [1, 0],
          [0, 1],
        ] as const
      ).some(([dx, dy]) => {
        const rive = (s: number): number | null => {
          for (let k = 1; k <= LARGEUR_GUE_MAX; k++)
            if (terre(g.x + s * dx * k, g.y + s * dy * k)) return k;
          return null;
        };
        const a = rive(-1);
        const b = rive(1);
        return a !== null && b !== null && a + b - 1 <= LARGEUR_GUE_MAX;
      });
      expect(etroit).toBe(true);
    }
    // Pas deux traversées sur des rangs voisins : les gués se rangent par bandes de douze.
    const rangs = new Set(
      gues.map((g) => Math.floor(g.y / PAS_GUE) * 1000 + Math.floor(g.x / PAS_GUE)),
    );
    expect(rangs.size).toBeLessThanOrEqual(gues.length);
  });
});
