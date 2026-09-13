import { describe, expect, it } from "vitest";
import { BIOMES, INFO_BIOME } from "../src/monde/biomes.js";
import { BruitSimplex2D } from "../src/monde/bruit.js";
import { choisirBiome, genererGrille } from "../src/monde/generation.js";
import { hacherGrille } from "../src/monde/hachage.js";
import { GISEMENTS_PAR_BIOME } from "../src/monde/ressources.js";
import { rendreAscii } from "../src/monde/ascii.js";
import { Rng } from "../src/rng.js";
import { Simulation } from "../src/simulation.js";

describe("BruitSimplex2D", () => {
  it("est déterministe et borné dans [-1, 1]", () => {
    const a = new BruitSimplex2D(Rng.depuisGraine("bruit"));
    const b = new BruitSimplex2D(Rng.depuisGraine("bruit"));
    for (let i = 0; i < 500; i++) {
      const x = i * 0.37;
      const y = i * 0.11;
      const va = a.valeur(x, y);
      expect(va).toBe(b.valeur(x, y));
      expect(Math.abs(va)).toBeLessThanOrEqual(1);
      expect(Math.abs(a.fbm(x, y, 0.05))).toBeLessThanOrEqual(1);
    }
  });
});

describe("choisirBiome", () => {
  it("suit les seuils d'altitude et d'humidité", () => {
    expect(choisirBiome(-0.5, 0)).toBe("eau_profonde");
    expect(choisirBiome(-0.1, 0)).toBe("eau_peu_profonde");
    expect(choisirBiome(0.02, 0)).toBe("plage");
    expect(choisirBiome(0.2, -0.5)).toBe("prairie");
    expect(choisirBiome(0.2, 0.2)).toBe("foret");
    expect(choisirBiome(0.1, 0.6)).toBe("marais");
    expect(choisirBiome(0.5, 0)).toBe("colline");
    expect(choisirBiome(0.8, 0)).toBe("montagne");
  });
});

describe("genererGrille", () => {
  /** Génère un carré de morceaux autour de l'origine. */
  function generer(seed: number | string, rayonMorceaux = 2): ReturnType<typeof genererGrille> {
    const g = genererGrille(Rng.depuisGraine(seed));
    for (let cy = -rayonMorceaux; cy < rayonMorceaux; cy++)
      for (let cx = -rayonMorceaux; cx < rayonMorceaux; cx++) g.morceau(cx, cy);
    return g;
  }

  it("est reproductible : même graine → même empreinte", () => {
    const g1 = generer(42);
    const g2 = generer(42);
    expect(hacherGrille(g1)).toBe(hacherGrille(g2));
    expect(rendreAscii(g1)).toBe(rendreAscii(g2));
  });

  it("change avec la graine", () => {
    expect(hacherGrille(generer(42))).not.toBe(hacherGrille(generer(43)));
  });

  it("ne dépend ni de l'état du Rng parent ni de l'ordre de génération des morceaux", () => {
    const rng = Rng.depuisGraine(42);
    rng.suivant();
    rng.suivant();
    const g1 = genererGrille(rng);
    g1.morceau(1, 1);
    g1.morceau(-1, 0);
    g1.morceau(0, 0);
    const g2 = genererGrille(Rng.depuisGraine(42));
    g2.morceau(0, 0);
    g2.morceau(-1, 0);
    g2.morceau(1, 1);
    expect(hacherGrille(g1)).toBe(hacherGrille(g2));
    expect(g1.tuile(40, 33).biome).toBe(g2.tuile(40, 33).biome);
    expect(g1.tuile(40, 33).gisement).toEqual(g2.tuile(40, 33).gisement);
  });

  it("n'a pas de limite : les morceaux lointains et négatifs existent et sont continus", () => {
    const g = genererGrille(Rng.depuisGraine(42));
    expect(g.tuileOuNull(-500, 800)).not.toBeNull();
    expect(g.tuile(-500, 800).x).toBe(-500);
    expect(g.nombreMorceaux).toBe(1);
    // Les tuiles de part et d'autre d'une frontière de morceau viennent du même bruit.
    const a = g.tuile(31, 5);
    const b = g.tuile(32, 5);
    expect(Math.abs(a.altitude - b.altitude)).toBeLessThan(0.2);
  });

  it("produit un monde plausible : terre majoritaire, eau présente, montagnes rares", () => {
    const g = generer(42, 4); // 256 × 256 tuiles
    const d = g.distributionBiomes();
    const total = g.nombreTuiles;
    expect(total).toBe(256 * 256);
    const eau = (d.eau_profonde ?? 0) + (d.eau_peu_profonde ?? 0);
    const terre = total - eau;
    expect(eau / total).toBeGreaterThan(0.1);
    expect(terre / total).toBeGreaterThan(0.4);
    expect((d.prairie ?? 0) + (d.foret ?? 0)).toBeGreaterThan(total * 0.2);
    expect((d.montagne ?? 0) / total).toBeLessThan(0.15);
    for (const biome of BIOMES) expect(INFO_BIOME[biome]).toBeDefined();
  });

  it("le berceau est de la terre ferme, pour toutes les graines", () => {
    for (const seed of [1, 2, 3, 42, 99, "mer"]) {
      const g = genererGrille(Rng.depuisGraine(seed));
      let terre = 0;
      for (let y = -6; y <= 6; y++)
        for (let x = -6; x <= 6; x++) if (INFO_BIOME[g.tuile(x, y).biome].constructible) terre++;
      expect(terre).toBeGreaterThan(100);
    }
  });

  it("place les gisements uniquement sur les biomes autorisés, pleins à la génération", () => {
    const g = generer(42);
    let nb = 0;
    for (const t of g.toutes()) {
      if (!t.gisement) continue;
      nb++;
      const profils = GISEMENTS_PAR_BIOME[t.biome];
      expect(
        profils.some(
          (pr) => pr.type === t.gisement?.type && pr.outilRequis === t.gisement.outilRequis,
        ),
      ).toBe(true);
      expect(t.gisement.quantite).toBe(t.gisement.max);
      expect(t.gisement.quantite).toBeGreaterThan(0);
    }
    expect(nb).toBeGreaterThan(100);
  });

  it("rend une carte ASCII de la zone demandée", () => {
    const g = genererGrille(Rng.depuisGraine(1));
    const lignes = rendreAscii(g, { zone: { x0: -10, y0: -5, x1: 9, y1: 4 } }).split("\n");
    expect(lignes).toHaveLength(10);
    for (const l of lignes) expect(l).toHaveLength(20);
    expect(g.nombreMorceaux).toBe(4);
  });
});

describe("Simulation (M0)", () => {
  it("génère un monde reproductible depuis la configuration", () => {
    const s1 = Simulation.creer({ seed: 42 });
    const s2 = Simulation.creer({ seed: 42 });
    expect(hacherGrille(s1.grille)).toBe(hacherGrille(s2.grille));
    expect(s1.grille.nombreMorceaux).toBeGreaterThan(0);
    for (const p of s1.personnages)
      expect(Math.hypot(p.corps.position.x, p.corps.position.y)).toBeLessThan(40);
  });

  it("avance l'horloge jusqu'à l'aube suivante", () => {
    const sim = Simulation.creer({ seed: 42 });
    sim.avancer(10);
    sim.avancerJusquaAube();
    expect(sim.tick).toBe(144);
    expect(sim.horloge.estAube()).toBe(true);
  });

  it("rejette une configuration incohérente", () => {
    expect(() => Simulation.creer({ temps: { minutesParTick: 7 } })).toThrow(/minutesParTick/);
    expect(() => Simulation.creer({ monde: { berceau: 1 } })).toThrow(/berceau/);
  });
});
