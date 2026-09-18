import { describe, expect, it } from "vitest";
import { Horloge } from "../src/monde/horloge.js";

const config = { minutesParTick: 10, joursParSaison: 30 };

describe("Horloge", () => {
  it("compte 144 ticks par jour avec 10 minutes par tick", () => {
    const h = new Horloge(config);
    expect(h.ticksParJour).toBe(144);
    expect(h.ticksParSaison).toBe(144 * 30);
    expect(h.ticksParAnnee).toBe(144 * 120);
  });

  it("décompose le tick 0 en An 1, printemps, jour 1, 00:00", () => {
    const m = new Horloge(config).moment(0);
    expect(m).toMatchObject({
      annee: 1,
      saison: "printemps",
      jourDeSaison: 1,
      heure: 0,
      minute: 0,
    });
    expect(m.estNuit).toBe(true);
  });

  it("calcule heures et minutes", () => {
    const h = new Horloge(config);
    h.avancer(7 * 6 + 3); // 7h30
    expect(h.moment()).toMatchObject({ heure: 7, minute: 30, estNuit: false });
  });

  it("passe au jour, à la saison et à l'année suivants", () => {
    const h = new Horloge(config);
    h.avancer(144);
    expect(h.moment()).toMatchObject({ jourDeSaison: 2, saison: "printemps", annee: 1 });
    h.avancer(144 * 29);
    expect(h.moment()).toMatchObject({ jourDeSaison: 1, saison: "ete", annee: 1 });
    h.avancer(144 * 90);
    expect(h.moment()).toMatchObject({ jourDeSaison: 1, saison: "printemps", annee: 2 });
  });

  it("la nuit dépend de la saison", () => {
    const h = new Horloge(config);
    const tick6h = 6 * 6;
    expect(h.moment(tick6h).estNuit).toBe(false); // printemps : lever 6h
    const hiver6h = h.ticksParSaison * 3 + tick6h;
    expect(h.moment(hiver6h).estNuit).toBe(true); // hiver : lever 7h
  });

  it("estAube et prochaineAube", () => {
    const h = new Horloge(config);
    expect(h.estAube()).toBe(true);
    h.avancer(5);
    expect(h.estAube()).toBe(false);
    expect(h.prochaineAube()).toBe(144);
  });

  it("refuse un pas de temps qui ne divise pas la journée", () => {
    expect(() => new Horloge({ minutesParTick: 7, joursParSaison: 30 })).toThrow(RangeError);
  });

  it("formate un moment lisible", () => {
    expect(new Horloge(config).formater(0)).toBe("An 1, printemps jour 1, 00:00 (nuit)");
  });
});
