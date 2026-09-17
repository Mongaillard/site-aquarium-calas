import { describe, expect, it } from "vitest";
import { Simulation } from "../src/index.js";
import type { Personnage } from "../src/index.js";
import { ajouterObjet } from "../src/agents/inventaire.js";
import { quantite } from "../src/agents/inventaire.js";
import { siteADefricher } from "../src/actions/planificateur.js";
import { planifier } from "../src/actions/planificateur.js";
import { executerTick } from "../src/actions/executeur.js";

function colonie(seed = 6): { sim: Simulation; p: Personnage } {
  const sim = Simulation.creer({ seed, population: { initiale: 6, familles: 2 } });
  sim.config.brain.conseilsParJour = 0;
  sim.avancer(1);
  const p = sim.vivants().find((x) => x.corps.stade === "adulte");
  if (p === undefined) throw new Error("pas d'adulte");
  return { sim, p };
}

/** Pose un arbre (gisement de bois à la hache) juste à côté de la personne. */
function arbreACote(sim: Simulation, p: Personnage): { x: number; y: number } {
  const cible = { x: p.corps.position.x + 1, y: p.corps.position.y };
  sim.grille.modifierBiome(cible.x, cible.y, "foret");
  const t = sim.grille.tuile(cible.x, cible.y);
  sim.grille.poserGisement(t, {
    type: "bois",
    quantite: 4,
    max: 20,
    tauxRegen: 0.2,
    outilRequis: "hache_pierre",
  });
  return cible;
}

describe("M39d : défricher pour se faire de la place", () => {
  it("il faut l'outil du gisement, et être à côté", () => {
    const { sim, p } = colonie();
    const cible = arbreACote(sim, p);
    p.corps.inventaire.objets.length = 0;
    const sansHache = planifier(sim, p, { type: "defricher", cible });
    expect(sansHache.ok).toBe(false);
    ajouterObjet(p.corps.inventaire, { type: "hache_pierre", solidite: 40 });
    const avec = planifier(sim, p, { type: "defricher", cible });
    expect(avec.ok).toBe(true);
    if (!avec.ok) return;
    expect(avec.plan[avec.plan.length - 1]?.type).toBe("defricher");
  });

  it("dégage la tuile, ouvre la forêt en prairie, et ce qui restait tombe dans les poches", () => {
    const { sim, p } = colonie();
    const cible = arbreACote(sim, p);
    ajouterObjet(p.corps.inventaire, { type: "hache_pierre", solidite: 40 });
    const boisAvant = quantite(p.corps.inventaire, "bois");
    p.plan = [{ type: "defricher", cible, ticksRestants: null }];
    for (let i = 0; i < 40 && p.plan.length + (p.actionEnCours === null ? 0 : 1) > 0; i++)
      sim.avancer(1);
    const t = sim.grille.tuile(cible.x, cible.y);
    expect(t.gisement).toBeNull();
    expect(t.biome).toBe("prairie");
    expect(quantite(p.corps.inventaire, "bois")).toBeGreaterThan(boisAvant);
    expect(sim.journal.compte("defrichage")).toBeGreaterThan(0);
  });

  it("un tas de pierres se dégage sans changer le sol", () => {
    const { sim, p } = colonie();
    const cible = { x: p.corps.position.x + 1, y: p.corps.position.y };
    sim.grille.modifierBiome(cible.x, cible.y, "prairie");
    const t = sim.grille.tuile(cible.x, cible.y);
    sim.grille.poserGisement(t, {
      type: "pierre",
      quantite: 3,
      max: 20,
      tauxRegen: 0,
      outilRequis: null,
    });
    const action = { type: "defricher" as const, cible, ticksRestants: null };
    for (let i = 0; i < 40; i++) {
      const r = executerTick(sim, p, action);
      if (r.statut !== "encours") break;
    }
    expect(sim.grille.tuile(cible.x, cible.y).gisement).toBeNull();
    expect(sim.grille.tuile(cible.x, cible.y).biome).toBe("prairie");
  });

  it("quand il n'y a plus de place, on choisit la tuile la plus maigre et la plus proche", () => {
    const { sim, p } = colonie();
    const proche = { x: p.corps.position.x + 1, y: p.corps.position.y };
    sim.grille.modifierBiome(proche.x, proche.y, "prairie");
    sim.grille.poserGisement(sim.grille.tuile(proche.x, proche.y), {
      type: "pierre",
      quantite: 2,
      max: 20,
      tauxRegen: 0,
      outilRequis: null,
    });
    const riche = { x: p.corps.position.x + 2, y: p.corps.position.y };
    sim.grille.modifierBiome(riche.x, riche.y, "prairie");
    sim.grille.poserGisement(sim.grille.tuile(riche.x, riche.y), {
      type: "pierre",
      quantite: 25,
      max: 25,
      tauxRegen: 0,
      outilRequis: null,
    });
    const site = siteADefricher(sim, p);
    expect(site).not.toBeNull();
    // Le maigre passe avant le riche.
    if (site !== null) {
      const t = sim.grille.tuile(site.x, site.y);
      expect(t.gisement?.quantite ?? 99).toBeLessThan(25);
    }
  });
});
