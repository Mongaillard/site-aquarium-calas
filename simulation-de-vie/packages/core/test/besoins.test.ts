import { describe, expect, it } from "vitest";
import {
  CONTEXTE_BESOINS_DEFAUT,
  appliquerTickBesoins,
  besoinsInitiaux,
  urgence,
} from "../src/agents/besoins.js";
import type { Besoins, ContexteBesoins } from "../src/agents/besoins.js";
import { Rng } from "../src/rng.js";

const T = 144;
const base: ContexteBesoins = { ...CONTEXTE_BESOINS_DEFAUT, ticksParJour: T };

function pleins(): Besoins {
  return {
    faim: 100,
    soif: 100,
    sommeil: 100,
    chaleur: 100,
    securite: 100,
    social: 100,
    moral: 100,
  };
}

describe("besoins", () => {
  it("la faim passe de 100 à 0 en deux jours éveillé", () => {
    const b = pleins();
    for (let i = 0; i < 2 * T; i++) appliquerTickBesoins(b, base);
    expect(b.faim).toBeCloseTo(0, 5);
  });

  it("la soif passe de 100 à 0 en un jour", () => {
    const b = pleins();
    for (let i = 0; i < T; i++) appliquerTickBesoins(b, base);
    expect(b.soif).toBeCloseTo(0, 5);
  });

  it("le sommeil passe de 100 à 0 en un jour et demi, et se restaure en 8 h de sommeil", () => {
    const b = pleins();
    for (let i = 0; i < 1.5 * T; i++) appliquerTickBesoins(b, base);
    expect(b.sommeil).toBeCloseTo(0, 5);
    for (let i = 0; i < T / 3; i++) appliquerTickBesoins(b, { ...base, dort: true });
    expect(b.sommeil).toBeGreaterThanOrEqual(99);
  });

  it("la faim et la soif baissent moins vite en dormant", () => {
    const eveille = pleins();
    const dormeur = pleins();
    for (let i = 0; i < T; i++) {
      appliquerTickBesoins(eveille, base);
      appliquerTickBesoins(dormeur, { ...base, dort: true });
    }
    expect(dormeur.faim).toBeGreaterThan(eveille.faim);
    expect(dormeur.soif).toBeGreaterThan(eveille.soif);
  });

  it("la chaleur baisse selon les pertes et remonte selon les gains", () => {
    const b = pleins();
    for (let i = 0; i < 60; i++) appliquerTickBesoins(b, { ...base, perteChaleur: 1 });
    expect(b.chaleur).toBeCloseTo(100 - (60 * 100) / (1.25 * T), 5);
    const apresNuit = b.chaleur;
    for (let i = 0; i < 60; i++)
      appliquerTickBesoins(b, { ...base, perteChaleur: 1, gainChaleur: 1.5 });
    expect(b.chaleur).toBeGreaterThan(apresNuit);
    const c = { ...pleins(), chaleur: 50 };
    appliquerTickBesoins(c, base); // ni perte ni gain : retour lent vers 100
    expect(c.chaleur).toBeGreaterThan(50);
  });

  it("une nuit d'hiver sans abri fait perdre 100 points de chaleur en moins d'un jour", () => {
    const b = pleins();
    let ticks = 0;
    while (b.chaleur > 0 && ticks < T) {
      appliquerTickBesoins(b, { ...base, estNuit: true, perteChaleur: 2 });
      ticks++;
    }
    expect(b.chaleur).toBe(0);
    expect(ticks).toBeLessThan(T);
  });

  it("inflige des dégâts de santé quand faim, soif ou chaleur sont à zéro", () => {
    const b = { ...pleins(), faim: 0, soif: 0, chaleur: 0 };
    let total = 0;
    const causes = new Set<string>();
    for (let i = 0; i < T; i++) {
      const e = appliquerTickBesoins(b, { ...base, estNuit: true, perteChaleur: 1 });
      total += e.deltaSante;
      for (const c of e.causes) causes.add(c);
    }
    expect(total).toBeCloseTo(-(10 + 25 + 15), 0);
    expect([...causes].sort()).toEqual(["faim", "froid", "soif"]);
  });

  it("régénère la santé quand les besoins de base sont satisfaits", () => {
    let total = 0;
    for (let i = 0; i < T; i++) total += appliquerTickBesoins(pleins(), base).deltaSante;
    expect(total).toBeCloseTo(2, 1);
  });

  it("la canicule accélère la soif", () => {
    const normal = pleins();
    const chaud = pleins();
    for (let i = 0; i < 20; i++) {
      appliquerTickBesoins(normal, base);
      appliquerTickBesoins(chaud, { ...base, facteurSoif: 1.6 });
    }
    expect(chaud.soif).toBeLessThan(normal.soif);
  });

  it("le social baisse plus vite pour un extraverti et remonte en compagnie", () => {
    const intro = pleins();
    const extra = pleins();
    for (let i = 0; i < T; i++) {
      appliquerTickBesoins(intro, { ...base, extraversion: 0.1 });
      appliquerTickBesoins(extra, { ...base, extraversion: 0.9 });
    }
    expect(extra.social).toBeLessThan(intro.social);
    appliquerTickBesoins(extra, { ...base, enCompagnie: true });
    expect(extra.social).toBeGreaterThan(0);
  });

  it("urgence est convexe : 0 à 100, 1 à 0, 0,25 à 50", () => {
    expect(urgence(100)).toBe(0);
    expect(urgence(0)).toBe(1);
    expect(urgence(50)).toBeCloseTo(0.25);
  });

  it("besoinsInitiaux reste dans les bornes", () => {
    const b = besoinsInitiaux(Rng.depuisGraine(1));
    for (const v of Object.values(b)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});
