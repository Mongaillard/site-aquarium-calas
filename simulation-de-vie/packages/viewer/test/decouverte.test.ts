import { describe, expect, it } from "vitest";
import type { MessageEtat, MessageInit } from "@sdv/protocole";
import { cadrer } from "../src/camera.js";
import { Magasin } from "../src/etat.js";

const init: MessageInit = {
  type: "init",
  seed: "1",
  largeur: 10,
  hauteur: 6,
  biomes: new Array<number>(60).fill(0),
  nomsBiomes: ["prairie"],
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
      tuilesDecouvertes: decouvertes.length,
      tuiles: 60,
    },
    decouvertes,
    rayonVision: 6,
  };
}

describe("découvertes côté viewer", () => {
  it("le magasin accumule les tuiles découvertes et en donne le cadre", () => {
    const m = new Magasin();
    expect(m.zoneDecouverte()).toBeNull();
    m.recevoir(init, 0);
    expect(m.decouvertes?.length).toBe(60);
    expect(m.zoneDecouverte()).toBeNull();
    const v0 = m.versionDecouvertes;
    m.recevoir(etat([12, 13, 23]), 10); // (2,1) (3,1) (3,2)
    expect(m.versionDecouvertes).toBe(v0 + 1);
    expect(m.zoneDecouverte()).toEqual({ x0: 2, y0: 1, x1: 3, y1: 2 });
    m.recevoir(etat([]), 20);
    expect(m.versionDecouvertes).toBe(v0 + 1); // rien de neuf : pas de reconstruction
    m.recevoir(etat([59]), 30);
    expect(m.zoneDecouverte()).toEqual({ x0: 2, y0: 1, x1: 9, y1: 5 });
    m.reinitialiser();
    expect(m.decouvertes).toBeNull();
  });

  it("cadrer centre une zone sans dépasser l'échelle demandée", () => {
    const cam = cadrer({ x0: 2, y0: 1, x1: 3, y1: 2 }, 800, 600, 20);
    expect(cam.echelle).toBe(20);
    // Le centre de la zone (x = 3, y = 2 en bords de tuiles) tombe au centre de l'écran.
    expect(cam.dx + 3 * cam.echelle).toBeCloseTo(400);
    expect(cam.dy + 2 * cam.echelle).toBeCloseTo(300);
    const large = cadrer({ x0: 0, y0: 0, x1: 99, y1: 49 }, 800, 600);
    expect(large.echelle).toBeCloseTo((800 - 32) / 100);
  });
});
