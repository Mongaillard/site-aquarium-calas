import { describe, expect, it } from "vitest";
import { executerTick } from "../src/actions/executeur.js";
import { planifier } from "../src/actions/planificateur.js";
import { ajouter, quantite } from "../src/agents/inventaire.js";
import { observer } from "../src/cerveau/perception.js";
import { Simulation } from "../src/simulation.js";
import type { Personnage } from "../src/agents/personnage.js";
import { gisementBaies, gisementBois, grilleUniforme } from "./utils.js";

/** Monde 20×20 : eau en x = 0, baies en (10, 5), bois en (12, 5), un personnage en (10, 10). */
function scenario(): { sim: Simulation; p: Personnage } {
  const eau = Array.from({ length: 20 }, (_, y) => ({
    x: 0,
    y,
    biome: "eau_peu_profonde" as const,
  }));
  const grille = grilleUniforme(20, 20, "prairie", [
    ...eau,
    { x: 10, y: 5, gisement: gisementBaies(5) },
    { x: 12, y: 5, gisement: gisementBois(10) },
  ]);
  const sim = Simulation.creerAvecGrille(
    { seed: 1, population: { initiale: 1, familles: 1 } },
    grille,
  );
  const p = sim.personnages[0];
  if (p === undefined) throw new Error("pas de personnage");
  p.corps.position = { x: 10, y: 10 };
  p.connaissance.clear();
  return { sim, p };
}

function executerJusquauBout(sim: Simulation, p: Personnage, maxTicks = 200): string {
  for (let i = 0; i < maxTicks; i++) {
    const action = p.plan[0];
    if (action === undefined) return "terminee";
    const r = executerTick(sim, p, action);
    if (r.statut === "echec") return r.raison;
    if (r.statut === "terminee") p.plan.shift();
  }
  return "timeout";
}

describe("actions", () => {
  it("déplacer suit le chemin et arrive à destination", () => {
    const { sim, p } = scenario();
    p.plan = [{ type: "deplacer", cible: { x: 15, y: 10 }, chemin: null, progression: 0 }];
    expect(executerJusquauBout(sim, p)).toBe("terminee");
    expect(p.corps.position).toEqual({ x: 15, y: 10 });
  });

  it("déplacer échoue sur une destination inaccessible", () => {
    const { sim, p } = scenario();
    const r = executerTick(sim, p, {
      type: "deplacer",
      cible: { x: 0, y: 0 },
      chemin: null,
      progression: 0,
    });
    // x = 0 est de l'eau peu profonde, praticable : on vise l'extérieur de la grille pour l'échec.
    expect(r.statut === "encours" || r.statut === "terminee").toBe(true);
    const hors = executerTick(sim, p, {
      type: "deplacer",
      cible: { x: 99, y: 99 },
      chemin: null,
      progression: 0,
    });
    expect(hors).toEqual({ statut: "echec", raison: "destination inaccessible" });
  });

  it("récolter transfère des baies dans l'inventaire et diminue le gisement", () => {
    const { sim, p } = scenario();
    p.corps.position = { x: 10, y: 6 };
    p.plan = [{ type: "recolter", cible: { x: 10, y: 5 }, ticksRestants: null }];
    expect(executerJusquauBout(sim, p)).toBe("terminee");
    expect(quantite(p.corps.inventaire, "baies")).toBe(1);
    expect(sim.grille.tuile(10, 5).gisement?.quantite).toBe(4);
    expect(p.experience.recolte).toBe(2);
    expect(sim.journal.compte("recolte")).toBe(1);
  });

  it("récolter échoue si trop loin ou si un outil est requis", () => {
    const { sim, p } = scenario();
    p.corps.position = { x: 10, y: 10 };
    expect(
      executerTick(sim, p, { type: "recolter", cible: { x: 10, y: 5 }, ticksRestants: null }),
    ).toMatchObject({
      statut: "echec",
      raison: "gisement trop loin",
    });
    p.corps.position = { x: 12, y: 6 };
    expect(
      executerTick(sim, p, { type: "recolter", cible: { x: 12, y: 5 }, ticksRestants: null }),
    ).toMatchObject({
      statut: "echec",
      raison: "outil requis : hache_pierre",
    });
  });

  it("boire remplit la soif uniquement près de l'eau", () => {
    const { sim, p } = scenario();
    p.besoins.soif = 10;
    expect(
      executerTick(sim, p, { type: "boire", cible: p.corps.position, ticksRestants: null }),
    ).toMatchObject({
      statut: "echec",
    });
    p.corps.position = { x: 1, y: 10 };
    expect(
      executerTick(sim, p, { type: "boire", cible: p.corps.position, ticksRestants: null }),
    ).toEqual({
      statut: "terminee",
    });
    expect(p.besoins.soif).toBe(100);
  });

  it("manger consomme des baies jusqu'à satiété", () => {
    const { sim, p } = scenario();
    p.besoins.faim = 40;
    ajouter(p.corps.inventaire, "baies", 5);
    expect(
      executerTick(sim, p, { type: "manger", ressource: "baies", ticksRestants: null }),
    ).toEqual({
      statut: "terminee",
    });
    expect(p.besoins.faim).toBeGreaterThanOrEqual(90);
    expect(quantite(p.corps.inventaire, "baies")).toBe(1); // 4 baies × 15 = 60
    expect(sim.journal.compte("repas")).toBe(1);
  });

  it("dormir restaure le sommeil puis se termine", () => {
    const { sim, p } = scenario();
    p.besoins.sommeil = 20;
    const action = { type: "dormir" as const, ticksDormis: 0 };
    let r = executerTick(sim, p, action);
    expect(p.corps.endormi).toBe(true);
    let ticks = 1;
    while (r.statut === "encours" && ticks < 200) {
      p.besoins.sommeil += 100 / 48; // ce que fait la boucle principale
      r = executerTick(sim, p, action);
      ticks++;
    }
    expect(r).toEqual({ statut: "terminee" });
    expect(p.corps.endormi).toBe(false);
    expect(ticks).toBeLessThan(60);
  });
});

describe("planifier", () => {
  it("manger : avec des baies en poche → [manger]", () => {
    const { sim, p } = scenario();
    ajouter(p.corps.inventaire, "baies", 2);
    const r = planifier(sim, p, { type: "manger" });
    expect(r.ok && r.plan.map((a) => a.type)).toEqual(["manger"]);
  });

  it("manger : sans baies mais gisement connu → [deplacer, recolter, manger]", () => {
    const { sim, p } = scenario();
    observer(sim, p, 6); // voit les baies en (10, 5)
    const r = planifier(sim, p, { type: "manger" });
    expect(r.ok && r.plan.map((a) => a.type)).toEqual(["deplacer", "recolter", "manger"]);
  });

  it("manger : rien de connu → échec explicite", () => {
    const { sim, p } = scenario();
    const r = planifier(sim, p, { type: "manger" });
    expect(r).toEqual({ ok: false, raison: "aucun gisement de baies connu" });
  });

  it("boire : eau connue → [deplacer, boire] vers la terre ferme adjacente", () => {
    const { sim, p } = scenario();
    p.corps.position = { x: 4, y: 10 };
    observer(sim, p, 6);
    const r = planifier(sim, p, { type: "boire" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.map((a) => a.type)).toEqual(["deplacer", "boire"]);
    const cible = r.plan[0]?.type === "deplacer" ? r.plan[0].cible : null;
    expect(cible).toEqual({ x: 1, y: 10 });
  });

  it("explorer produit un déplacement vers une tuile praticable", () => {
    const { sim, p } = scenario();
    const r = planifier(sim, p, { type: "explorer" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.plan[0];
    expect(a?.type).toBe("deplacer");
    if (a?.type === "deplacer") expect(sim.grille.estPraticable(a.cible.x, a.cible.y)).toBe(true);
  });
});
