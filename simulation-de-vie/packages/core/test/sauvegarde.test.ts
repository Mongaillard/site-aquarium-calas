import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { decoder, encoder, estSauvegarde } from "../src/sauvegarde.js";
import { Rng } from "../src/rng.js";

function empreinte(sim: Simulation, depuis: number): string {
  return sim.journal
    .tous()
    .filter((e) => e.tick >= depuis)
    .map((e) => `${String(e.tick)} ${e.type} ${e.acteur ?? ""} ${JSON.stringify(e.details)}`)
    .join("\n");
}

describe("sauvegarde", () => {
  it("encode et décode Map, Set, Infinity, Rng et flux de mémoire", () => {
    const rng = Rng.depuisGraine("x");
    rng.suivant();
    const original = {
      m: new Map([["a", { v: -Infinity }]]),
      s: new Set([1, 2]),
      n: Infinity,
      rng,
      liste: [1, null, "b"],
      vide: undefined,
    };
    const json = JSON.parse(JSON.stringify(encoder(original))) as unknown;
    const copie = decoder(json) as typeof original;
    expect(copie.m.get("a")?.v).toBe(-Infinity);
    expect([...copie.s]).toEqual([1, 2]);
    expect(copie.n).toBe(Infinity);
    expect(copie.rng.suivant()).toBe(rng.suivant());
    expect(copie.liste).toEqual([1, null, "b"]);
    expect("vide" in copie).toBe(false);
  });

  it(
    "un monde restauré continue exactement comme l'original (journal identique sur 60 jours)",
    { timeout: 120_000 },
    async () => {
      const sim = Simulation.creer({ seed: 11, population: { initiale: 6, familles: 2 } });
      sim.avancer(40 * 144 + 37);
      // Des miracles et une question ouverte : tout doit survivre à la sauvegarde.
      const p = sim.vivants()[0];
      if (!p) throw new Error("vide");
      sim.exercer({ pouvoir: "pluie", x: p.corps.position.x, y: p.corps.position.y });
      sim.exercer({
        pouvoir: "souffle",
        x: p.corps.position.x,
        y: p.corps.position.y,
        cibleId: p.id,
      });
      sim.demanderConseil(p.id);
      const sauvegarde = JSON.parse(JSON.stringify(sim.sauvegarder())) as unknown;
      expect(estSauvegarde(sauvegarde)).toBe(true);
      const copie = Simulation.restaurer(sauvegarde);
      expect(copie.tick).toBe(sim.tick);
      expect(copie.vivants().length).toBe(sim.vivants().length);
      expect(copie.batiments.size).toBe(sim.batiments.size);
      expect(copie.grille.nombreDecouvertes).toBe(sim.grille.nombreDecouvertes);
      expect(copie.grille.nombreMorceaux).toBe(sim.grille.nombreMorceaux);
      expect(copie.faveur.valeur).toBe(sim.faveur.valeur);
      expect(copie.questionEnCours?.id).toBe(sim.questionEnCours?.id);
      expect(copie.journal.compte("naissance")).toBe(sim.journal.compte("naissance"));
      // Les bâtiments sont raccrochés aux tuiles, les gisements remis en place.
      for (const b of sim.batiments.values())
        expect(copie.grille.tuileOuNull(b.position.x, b.position.y)?.batiment?.id).toBe(b.id);
      let gisements = 0;
      for (const t of sim.grille.toutes()) {
        const c = copie.grille.tuileOuNull(t.x, t.y);
        expect(c?.gisement?.quantite ?? null).toBe(t.gisement?.quantite ?? null);
        if (t.gisement) gisements++;
      }
      expect(gisements).toBeGreaterThan(50);
      // Même avenir.
      const depuis = sim.tick;
      for (let j = 0; j < 60; j += 5) {
        sim.avancer(5 * 144);
        copie.avancer(5 * 144);
        await new Promise((r) => setTimeout(r, 0));
      }
      expect(empreinte(copie, depuis)).toBe(empreinte(sim, depuis));
      expect(copie.vivants().map((x) => [x.id, x.corps.position, x.besoins.faim])).toEqual(
        sim.vivants().map((x) => [x.id, x.corps.position, x.besoins.faim]),
      );
    },
  );

  it("refuse ce qui n'est pas une sauvegarde ou une autre version", () => {
    expect(() => Simulation.restaurer({ format: "autre" })).toThrow(/pas une sauvegarde/);
    const sim = Simulation.creer({ seed: 3, population: { initiale: 4, familles: 1 } });
    const s = sim.sauvegarder();
    expect(() => Simulation.restaurer({ ...s, version: 99 })).toThrow(/version 99/);
    expect(s.jour).toBe(0);
    expect(s.seed).toBe("3");
  });
});
