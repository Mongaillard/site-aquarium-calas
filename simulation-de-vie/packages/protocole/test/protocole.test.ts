import { describe, expect, it } from "vitest";
import {
  VITESSES,
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

  it("analyse les commandes du mode Dieu et des conseils, et borne leurs champs", () => {
    expect(analyserCommande('{"type":"pouvoir","pouvoir":"pluie","x":3,"y":-4}')).toEqual({
      type: "pouvoir",
      pouvoir: "pluie",
      x: 3,
      y: -4,
    });
    expect(
      analyserCommande('{"type":"pouvoir","pouvoir":"songe","x":0,"y":0,"cibleId":"p-0001"}'),
    ).toEqual({ type: "pouvoir", pouvoir: "songe", x: 0, y: 0, cibleId: "p-0001" });
    expect(analyserCommande('{"type":"pouvoir","pouvoir":"apocalypse","x":0,"y":0}')).toBeNull();
    for (const p of [
      "troupeau",
      "idee",
      "loups",
      "gel",
      "secheresse",
      "fievre",
      "secousse",
      "epiphanie",
    ])
      expect(analyserCommande(JSON.stringify({ type: "pouvoir", pouvoir: p, x: 0, y: 0 }))).toEqual(
        {
          type: "pouvoir",
          pouvoir: p,
          x: 0,
          y: 0,
        },
      );
    expect(VITESSES).toEqual([1, 4, 16, 64, 128, 256]);
    expect(analyserCommande('{"type":"vitesse","ticksParSeconde":256}')).toEqual({
      type: "vitesse",
      ticksParSeconde: 256,
    });
    expect(analyserCommande('{"type":"pouvoir","pouvoir":"pluie","x":1.5,"y":0}')).toBeNull();
    expect(analyserCommande('{"type":"pouvoir","pouvoir":"pluie","x":1e9,"y":0}')).toBeNull();
    const conseil = {
      type: "conseil",
      questionId: "q-1-p-0001",
      personnageId: "p-0001",
      choix: "invention:fumoir",
      pensee: "Le poisson pourrit.",
      ambition: { but: "que personne n'ait faim", jours: 12 },
    };
    expect(analyserCommande(JSON.stringify(conseil))).toEqual(conseil);
    expect(analyserCommande(JSON.stringify({ ...conseil, ambition: undefined }))).toEqual({
      type: "conseil",
      questionId: "q-1-p-0001",
      personnageId: "p-0001",
      choix: "invention:fumoir",
      pensee: "Le poisson pourrit.",
    });
    expect(
      analyserCommande(JSON.stringify({ ...conseil, ambition: { but: "x", jours: 99 } })),
    ).toBeNull();
    expect(analyserCommande(JSON.stringify({ ...conseil, choix: "x".repeat(200) }))).toBeNull();
    expect(analyserCommande(JSON.stringify({ ...conseil, pensee: "x".repeat(601) }))).toBeNull();
    expect(analyserCommande(JSON.stringify({ ...conseil, choix: "" }))).toBeNull();
    expect(analyserCommande('{"type":"demander_conseil","id":"p-0001"}')).toEqual({
      type: "demander_conseil",
      id: "p-0001",
    });
    expect(analyserCommande('{"type":"demander_conseil"}')).toBeNull();
    expect(analyserCommande('{"type":"providence","actif":true}')).toEqual({
      type: "providence",
      actif: true,
    });
    expect(analyserCommande('{"type":"providence","actif":"oui"}')).toBeNull();
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
