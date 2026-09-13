import { describe, expect, it } from "vitest";
import { Rng, fnv1a32 } from "../src/rng.js";

describe("Rng", () => {
  it("produit la même séquence pour la même graine", () => {
    const a = Rng.depuisGraine(42);
    const b = Rng.depuisGraine(42);
    const sa = Array.from({ length: 50 }, () => a.suivantU32());
    const sb = Array.from({ length: 50 }, () => b.suivantU32());
    expect(sa).toEqual(sb);
  });

  it("produit des séquences différentes pour des graines différentes", () => {
    const a = Rng.depuisGraine(42);
    const b = Rng.depuisGraine(43);
    const sa = Array.from({ length: 20 }, () => a.suivantU32());
    const sb = Array.from({ length: 20 }, () => b.suivantU32());
    expect(sa).not.toEqual(sb);
  });

  it("accepte une graine textuelle équivalente à sa forme numérique", () => {
    expect(Rng.depuisGraine(7).suivantU32()).toBe(Rng.depuisGraine("7").suivantU32());
  });

  it("fork() est reproductible et indépendant de l'état du parent", () => {
    const parent1 = Rng.depuisGraine("monde");
    const parent2 = Rng.depuisGraine("monde");
    parent2.suivant(); // consomme du hasard sur un seul parent
    const f1 = parent1.fork("relief").suivantU32();
    const f2 = parent2.fork("relief").suivantU32();
    expect(f1).toBe(f2);
    expect(parent1.fork("relief").suivantU32()).not.toBe(parent1.fork("humidite").suivantU32());
  });

  it("suivant() reste dans [0, 1)", () => {
    const rng = Rng.depuisGraine(1);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.suivant();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("entier() respecte les bornes incluses et les atteint", () => {
    const rng = Rng.depuisGraine(3);
    const vus = new Set<number>();
    for (let i = 0; i < 5_000; i++) {
      const v = rng.entier(-2, 2);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThanOrEqual(2);
      vus.add(v);
    }
    expect([...vus].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
    expect(() => rng.entier(5, 1)).toThrow(RangeError);
  });

  it("melanger() renvoie une permutation sans modifier l'original", () => {
    const rng = Rng.depuisGraine(9);
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const melange = rng.melanger(original);
    expect(original).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...melange].sort((a, b) => a - b)).toEqual(original);
  });

  it("choisirPondere() favorise les poids élevés", () => {
    const rng = Rng.depuisGraine(11);
    let lourds = 0;
    for (let i = 0; i < 2_000; i++) {
      if (rng.choisirPondere(["leger", "lourd"], [1, 9]) === "lourd") lourds++;
    }
    expect(lourds / 2_000).toBeGreaterThan(0.85);
    expect(() => rng.choisir([])).toThrow(RangeError);
  });

  it("gaussien() a la moyenne et l'écart-type attendus", () => {
    const rng = Rng.depuisGraine("gauss");
    const n = 20_000;
    let somme = 0;
    let sommeCarres = 0;
    for (let i = 0; i < n; i++) {
      const v = rng.gaussien(10, 2);
      somme += v;
      sommeCarres += v * v;
    }
    const moyenne = somme / n;
    const ecart = Math.sqrt(sommeCarres / n - moyenne * moyenne);
    expect(moyenne).toBeCloseTo(10, 1);
    expect(ecart).toBeCloseTo(2, 1);
  });

  it("etat() / depuisEtat() reprennent exactement la séquence", () => {
    const rng = Rng.depuisGraine("snapshot");
    rng.suivant();
    rng.suivant();
    const etat = rng.etat();
    const copie = Rng.depuisEtat(etat);
    expect(Array.from({ length: 10 }, () => copie.suivantU32())).toEqual(
      Array.from({ length: 10 }, () => rng.suivantU32()),
    );
  });

  it("fnv1a32 est stable", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
  });
});
