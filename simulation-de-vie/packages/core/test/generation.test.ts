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
  const options = { largeur: 96, hauteur: 64 };

  it("est reproductible : même graine → même empreinte", () => {
    const g1 = genererGrille(Rng.depuisGraine(42), options);
    const g2 = genererGrille(Rng.depuisGraine(42), options);
    expect(hacherGrille(g1)).toBe(hacherGrille(g2));
    expect(rendreAscii(g1)).toBe(rendreAscii(g2));
  });

  it("change avec la graine", () => {
    const g1 = genererGrille(Rng.depuisGraine(42), options);
    const g2 = genererGrille(Rng.depuisGraine(43), options);
    expect(hacherGrille(g1)).not.toBe(hacherGrille(g2));
  });

  it("ne dépend pas de l'état de consommation du Rng parent", () => {
    const rng = Rng.depuisGraine(42);
    rng.suivant();
    rng.suivant();
    expect(hacherGrille(genererGrille(rng, options))).toBe(
      hacherGrille(genererGrille(Rng.depuisGraine(42), options)),
    );
  });

  it("produit un monde plausible : terre majoritaire, eau présente, montagnes rares", () => {
    const g = genererGrille(Rng.depuisGraine(42), options);
    const d = g.distributionBiomes();
    const total = options.largeur * options.hauteur;
    const eau = (d.eau_profonde ?? 0) + (d.eau_peu_profonde ?? 0);
    const terre = total - eau;
    expect(eau / total).toBeGreaterThan(0.1);
    expect(terre / total).toBeGreaterThan(0.4);
    expect((d.prairie ?? 0) + (d.foret ?? 0)).toBeGreaterThan(total * 0.2);
    expect((d.montagne ?? 0) / total).toBeLessThan(0.15);
    for (const biome of BIOMES) expect(INFO_BIOME[biome]).toBeDefined();
  });

  it("place les gisements uniquement sur les biomes autorisés, pleins à la génération", () => {
    const g = genererGrille(Rng.depuisGraine(42), options);
    let nb = 0;
    for (const t of g.toutes()) {
      if (!t.gisement) continue;
      nb++;
      const types = GISEMENTS_PAR_BIOME[t.biome].map((p) => p.type);
      expect(types).toContain(t.gisement.type);
      expect(t.gisement.quantite).toBe(t.gisement.max);
      expect(t.gisement.quantite).toBeGreaterThan(0);
    }
    expect(nb).toBeGreaterThan(100);
  });

  it("rend une carte ASCII aux bonnes dimensions", () => {
    const g = genererGrille(Rng.depuisGraine(1), { largeur: 20, hauteur: 10 });
    const lignes = rendreAscii(g).split("\n");
    expect(lignes).toHaveLength(10);
    for (const l of lignes) expect(l).toHaveLength(20);
  });
});

describe("Simulation (M0)", () => {
  it("génère un monde reproductible depuis la configuration", () => {
    const s1 = Simulation.creer({ seed: 42 });
    const s2 = Simulation.creer({ seed: 42 });
    expect(hacherGrille(s1.grille)).toBe(hacherGrille(s2.grille));
    expect(s1.grille.largeur).toBe(96);
    expect(s1.grille.hauteur).toBe(64);
  });

  it("avance l'horloge jusqu'à l'aube suivante", () => {
    const sim = Simulation.creer({ seed: 42, monde: { largeur: 16, hauteur: 16 } });
    sim.avancer(10);
    sim.avancerJusquaAube();
    expect(sim.tick).toBe(144);
    expect(sim.horloge.estAube()).toBe(true);
  });

  it("rejette une configuration incohérente", () => {
    expect(() => Simulation.creer({ temps: { minutesParTick: 7 } })).toThrow(/minutesParTick/);
    expect(() => Simulation.creer({ monde: { largeur: 4 } })).toThrow(/largeur/);
  });
});
