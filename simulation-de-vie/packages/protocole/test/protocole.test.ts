import { describe, expect, it } from "vitest";
import {
  analyserCommande,
  decouperTranscription,
  opaciteNuit,
  teinteFamille,
} from "../src/index.js";

describe("protocole", () => {
  it("analyse les commandes valides et rejette les autres", () => {
    expect(analyserCommande('{"type":"pause"}')).toEqual({ type: "pause" });
    expect(analyserCommande('{"type":"vitesse","ticksParSeconde":16}')).toEqual({
      type: "vitesse",
      ticksParSeconde: 16,
    });
    expect(analyserCommande('{"type":"vitesse","ticksParSeconde":-1}')).toBeNull();
    expect(analyserCommande('{"type":"inspecter","id":"p-0001"}')).toEqual({
      type: "inspecter",
      id: "p-0001",
    });
    expect(analyserCommande('{"type":"inspecter"}')).toBeNull();
    expect(analyserCommande("pas du json")).toBeNull();
    expect(analyserCommande('{"type":"exploser"}')).toBeNull();
    expect(analyserCommande("42")).toBeNull();
  });

  it("la teinte de famille est stable et dans [0, 360)", () => {
    expect(teinteFamille("Vidal")).toBe(teinteFamille("Vidal"));
    expect(teinteFamille("Vidal")).not.toBe(teinteFamille("Naudin"));
    for (const n of ["Aubrac", "Weber", "Izard"]) {
      expect(teinteFamille(n)).toBeGreaterThanOrEqual(0);
      expect(teinteFamille(n)).toBeLessThan(360);
    }
  });

  it("le voile nocturne est nul le jour, plein la nuit, progressif au lever et au coucher", () => {
    expect(opaciteNuit(12, 0, 6, 20)).toBe(0);
    expect(opaciteNuit(2, 0, 6, 20)).toBeCloseTo(0.45);
    expect(opaciteNuit(6, 30, 6, 20)).toBeCloseTo(0.225);
    expect(opaciteNuit(19, 30, 6, 20)).toBeCloseTo(0.225);
    expect(opaciteNuit(20, 0, 6, 20)).toBeCloseTo(0.45);
  });

  it("découpe une transcription en répliques", () => {
    const r = decouperTranscription(
      "Noa : Bonjour Léa, comment vas-tu ? / Léa : Très bien, et toi ?",
    );
    expect(r).toEqual([
      { locuteur: "Noa", texte: "Bonjour Léa, comment vas-tu ?" },
      { locuteur: "Léa", texte: "Très bien, et toi ?" },
    ]);
    expect(decouperTranscription("")).toEqual([]);
  });
});
