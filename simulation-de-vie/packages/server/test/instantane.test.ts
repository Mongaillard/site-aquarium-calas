import { describe, expect, it } from "vitest";
import { Simulation, ajouterObjet } from "@sdv/core";
import type { Personnage } from "@sdv/core";
import { etatPersonnage, outilEnMain } from "../src/instantane.js";

function premier(sim: Simulation): Personnage {
  const p = sim.personnages.find((x) => x.vivant);
  if (p === undefined) throw new Error("personne");
  p.corps.inventaire.objets.length = 0;
  return p;
}

describe("M31 : l'outil en main", () => {
  it("suit l'intention et l'inventaire, le cuivre avant la pierre", () => {
    const sim = Simulation.creer({ seed: 3 });
    const p = premier(sim);
    p.intention = { type: "recolter", ressource: "bois" };
    expect(outilEnMain(p)).toBeNull();
    ajouterObjet(p.corps.inventaire, { type: "hache_pierre", solidite: 30 });
    expect(outilEnMain(p)).toBe("hache");
    ajouterObjet(p.corps.inventaire, { type: "hache_cuivre", solidite: 30 });
    expect(outilEnMain(p)).toBe("hache_cuivre");
    p.intention = { type: "recolter", ressource: "pierre" };
    expect(outilEnMain(p)).toBeNull();
    ajouterObjet(p.corps.inventaire, { type: "pioche", solidite: 30 });
    expect(outilEnMain(p)).toBe("pioche");
    p.intention = { type: "recolter", ressource: "poisson" };
    ajouterObjet(p.corps.inventaire, { type: "filet", solidite: 30 });
    expect(outilEnMain(p)).toBe("canne");
    p.intention = { type: "recolter", ressource: "gibier" };
    ajouterObjet(p.corps.inventaire, { type: "lance", solidite: 30 });
    expect(outilEnMain(p)).toBe("lance");
    ajouterObjet(p.corps.inventaire, { type: "arc", solidite: 30 });
    expect(outilEnMain(p)).toBe("arc");
    p.intention = { type: "veiller" };
    expect(outilEnMain(p)).toBe("arc");
    p.intention = { type: "construire" };
    expect(outilEnMain(p)).toBe("marteau");
    p.intention = { type: "manger" };
    expect(outilEnMain(p)).toBeNull();
    p.intention = null;
    expect(outilEnMain(p)).toBeNull();
  });

  it("passe dans l'état envoyé au viewer", () => {
    const sim = Simulation.creer({ seed: 3 });
    const p = premier(sim);
    p.intention = { type: "reparer", objet: "hache_pierre" };
    expect(etatPersonnage(sim, p).outil).toBe("marteau");
  });
});
