import { describe, expect, it } from "vitest";
import {
  ECHELLE_MAX,
  ECHELLE_MIN,
  ajuster,
  centrerSur,
  deplacer,
  versEcran,
  versMonde,
  zoomer,
} from "../src/camera.js";
import {
  couleurFamille,
  couleurMoral,
  formaterMoment,
  formaterTick,
  resumerEvenement,
} from "../src/format.js";

describe("caméra", () => {
  it("ajuste le monde à l'écran avec une marge", () => {
    const cam = ajuster(96, 64, 1000, 700);
    expect(cam.echelle).toBeCloseTo((1000 - 32) / 96, 5);
    const hautGauche = versEcran(cam, 0, 0);
    expect(hautGauche.x).toBeGreaterThanOrEqual(16);
    const basDroite = versEcran(cam, 96, 64);
    expect(basDroite.x).toBeLessThanOrEqual(1000 - 16);
  });

  it("écran ↔ monde sont inverses", () => {
    const cam = { echelle: 7, dx: 12, dy: -5 };
    const e = versEcran(cam, 10, 20);
    const m = versMonde(cam, e.x, e.y);
    expect(m.x).toBeCloseTo(10);
    expect(m.y).toBeCloseTo(20);
  });

  it("le zoom garde fixe le point sous le curseur et respecte les bornes", () => {
    const cam = { echelle: 8, dx: 0, dy: 0 };
    const avant = versMonde(cam, 100, 80);
    const z = zoomer(cam, 2, 100, 80);
    const apres = versMonde(z, 100, 80);
    expect(apres.x).toBeCloseTo(avant.x);
    expect(apres.y).toBeCloseTo(avant.y);
    expect(zoomer(cam, 1000, 0, 0).echelle).toBe(ECHELLE_MAX);
    expect(zoomer(cam, 0.0001, 0, 0).echelle).toBe(ECHELLE_MIN);
  });

  it("déplace et centre", () => {
    const cam = deplacer({ echelle: 4, dx: 0, dy: 0 }, 10, -10);
    expect(cam).toEqual({ echelle: 4, dx: 10, dy: -10 });
    const c = centrerSur(cam, 10, 10, 200, 100);
    const centre = versEcran(c, 10.5, 10.5);
    expect(centre.x).toBeCloseTo(100);
    expect(centre.y).toBeCloseTo(50);
  });
});

describe("format", () => {
  it("formate les moments et les ticks", () => {
    expect(
      formaterMoment({
        annee: 1,
        saison: "ete",
        jourDeSaison: 3,
        jourAbsolu: 32,
        heure: 7,
        minute: 5,
        estNuit: false,
      }),
    ).toBe("An 1 · été 3 · 07:05");
    expect(formaterTick(144 * 31 + 6 * 7, 144, 30)).toBe("An 1 été 2, 07:00");
  });

  it("couleurs stables", () => {
    expect(couleurFamille("Vidal")).toBe(couleurFamille("Vidal"));
    expect(couleurMoral(90)).not.toBe(couleurMoral(10));
  });

  it("résume les événements avec les noms", () => {
    const nom = (id: string): string => (id === "p-0001" ? "Léa Vidal" : "Tom Naudin");
    expect(
      resumerEvenement(
        {
          tick: 0,
          type: "dialogue",
          acteur: "p-0001",
          position: null,
          importance: 3,
          details: { avec: "p-0002", sujet: "nouvelles" },
        },
        nom,
      ),
    ).toBe("Léa Vidal discute avec Tom Naudin (nouvelles).");
    expect(
      resumerEvenement(
        {
          tick: 0,
          type: "naissance",
          acteur: "p-0001",
          position: null,
          importance: 10,
          details: { prenom: "Elia", sexe: "F" },
        },
        nom,
      ),
    ).toBe("Léa Vidal met au monde Elia (fille).");
  });
});
