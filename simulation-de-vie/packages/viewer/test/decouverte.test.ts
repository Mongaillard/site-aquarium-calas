import { describe, expect, it } from "vitest";
import type { MessageEtat, MessageInit } from "@sdv/protocole";
import { cadrer } from "../src/camera.js";
import { Magasin } from "../src/etat.js";

const init: MessageInit = {
  type: "init",
  seed: "1",
  tailleMorceau: 32,
  nomsBiomes: ["prairie", "foret", "eau_profonde"],
  ticksParJour: 144,
  joursParSaison: 30,
  modeCerveau: "rules",
};

function etat(decouvertes: number[]): MessageEtat {
  return {
    type: "etat",
    tick: 1,
    moment: {
      tick: 1,
      annee: 1,
      saison: "printemps",
      jourDeSaison: 1,
      jourAbsolu: 0,
      heure: 8,
      minute: 0,
      estNuit: false,
    },
    meteo: "clair",
    ticksParSeconde: 4,
    pause: false,
    personnages: [],
    batiments: [],
    troupeaux: [],
    gisements: [],
    evenements: [],
    stats: {
      tick: 1,
      vivants: 0,
      morts: 0,
      population: 0,
      enfants: 0,
      batiments: 0,
      chantiers: 0,
      parType: {},
      naissances: 0,
      deces: 0,
      unions: 0,
      dialogues: 0,
      generations: 1,
      stocks: {},
      parSaison: [],
      appelsLLM: 0,
      coutLLM: 0,
      evenements: 0,
      tuilesDecouvertes: decouvertes.length / 3,
      tuiles: 1024,
      morceaux: 1,
      savoirs: [],
    },
    decouvertes,
    rayonVision: 6,
    faveur: {
      valeur: 20,
      max: 40,
      recharges: {},
      miracles: 0,
      reputation: 0,
      prieres: 0,
      offrandes: 0,
      exaucees: 0,
      providence: false,
      culte: 0,
    },
    questions: [],
    prieres: [],
    societe: {
      tension: 0,
      coutumes: [],
      notables: [],
      factions: [],
      griefs: [],
      decisions: [],
      alliances: [],
      lieuxInterdits: [],
      stocksOuverts: false,
      veillee: null,
      bannis: [],
    },
    chronique: { recits: [], lieuxNommes: [], proverbes: [] },
    villages: { villages: [], relations: [], bandes: [], caravanes: [], routes: [] },
    lois: {
      faim: true,
      maladies: true,
      betes: true,
      raids: true,
      schismes: true,
      vieillesse: true,
    },
    creatures: [],
  };
}

describe("découvertes côté viewer", () => {
  it("le magasin construit la carte par morceaux au fil des découvertes, coordonnées négatives comprises", () => {
    const m = new Magasin();
    expect(m.zoneDecouverte()).toBeNull();
    m.recevoir(init, 0);
    expect(m.tailleMorceau).toBe(32);
    expect(m.biomeEn(0, 0)).toBe(-1);
    const v0 = m.versionDecouvertes;
    m.recevoir(etat([2, 1, 0, 3, 1, 1, -3, -2, 2]), 10);
    expect(m.versionDecouvertes).toBe(v0 + 1);
    expect(m.biomeEn(2, 1)).toBe(0);
    expect(m.biomeEn(3, 1)).toBe(1);
    expect(m.biomeEn(-3, -2)).toBe(2);
    expect(m.biomeEn(5, 5)).toBe(-1);
    expect(m.morceaux.size).toBe(2); // (0,0) et (−1,−1)
    expect(m.tuilesConnues).toBe(3);
    expect(m.zoneDecouverte()).toEqual({ x0: -3, y0: -2, x1: 3, y1: 1 });
    m.recevoir(etat([]), 20);
    expect(m.versionDecouvertes).toBe(v0 + 1); // rien de neuf : pas de reconstruction
    m.recevoir(etat([40, 33, 0]), 30);
    expect(m.morceaux.size).toBe(3);
    expect(m.zoneDecouverte()).toEqual({ x0: -3, y0: -2, x1: 40, y1: 33 });
    m.reinitialiser();
    expect(m.morceaux.size).toBe(0);
    expect(m.zoneDecouverte()).toBeNull();
  });

  it("cadrer centre une zone sans dépasser l'échelle demandée", () => {
    const cam = cadrer({ x0: 2, y0: 1, x1: 3, y1: 2 }, 800, 600, 20);
    expect(cam.echelle).toBe(20);
    // Le centre de la zone (x = 3, y = 2 en bords de tuiles) tombe au centre de l'écran.
    expect(cam.dx + 3 * cam.echelle).toBeCloseTo(400);
    expect(cam.dy + 2 * cam.echelle).toBeCloseTo(300);
    const large = cadrer({ x0: -50, y0: 0, x1: 49, y1: 49 }, 800, 600);
    expect(large.echelle).toBeCloseTo((800 - 32) / 100);
    expect(large.dx + 0 * large.echelle).toBeCloseTo(400);
  });
});
