import { describe, expect, it } from "vitest";
import { Simulation, relationEntre } from "../src/index.js";
import type { Personnage } from "../src/index.js";
import { ajouterObjet } from "../src/agents/inventaire.js";
import { SEUILS } from "../src/monde/generation.js";

/**
 * Deux villages à quarante tuiles, en guerre déclarée : la famille détachée est
 * déplacée sur son site, chaque adulte reçoit une lance.
 */
function deuxVillagesEnGuerre(seed: number): {
  sim: Simulation;
  a: string;
  b: string;
  defenseurs: Personnage[];
} {
  const sim = Simulation.creer({ seed, population: { initiale: 12, familles: 3 } });
  sim.config.brain.conseilsParJour = 0;
  sim.avancer(144);
  const v = sim.villages.villages[0];
  if (v === undefined) throw new Error("pas de village");
  const famille = v.familles[2];
  if (famille === undefined) throw new Error("trois familles attendues");
  v.familles = v.familles.filter((f) => f !== famille);
  const site = { x: v.centre.x + 40, y: v.centre.y };
  // Un site de terre ferme : on cherche la première tuile praticable vers l'est.
  for (let k = 0; k < 30; k++) {
    const t = sim.grille.tuile(site.x + k, site.y);
    if (t.altitude >= SEUILS.mer && t.biome !== "eau_peu_profonde" && t.biome !== "montagne") {
      site.x += k;
      break;
    }
  }
  sim.villages.villages.push({
    id: "v-2",
    nom: `le village des ${famille}`,
    familles: [famille],
    centre: site,
    fondeJour: 0,
    origine: "schisme",
    enRoute: [],
  });
  const defenseurs = sim.vivants().filter((p) => p.identite.nomFamille === famille);
  defenseurs.forEach((p, i) => {
    p.corps.position = { x: site.x + (i % 3) - 1, y: site.y + Math.floor(i / 3) - 1 };
  });
  for (const p of sim.vivants())
    if (p.corps.stade === "adulte")
      ajouterObjet(p.corps.inventaire, { type: "lance", solidite: 40 });
  const r = relationEntre(sim.villages, v.id, "v-2");
  r.etat = "guerre";
  r.casusBelli = "un vol";
  r.attitude = -80;
  r.depuisJour = -10;
  sim.villages.derniereBatailleJour = -100;
  return { sim, a: v.id, b: "v-2", defenseurs };
}

describe("M32 : la bataille tick par tick", () => {
  it("une troupe se lève à l'aube, marche, donne l'assaut, et la bataille se conclut", () => {
    const { sim, defenseurs } = deuxVillagesEnGuerre(11);
    // Le tick 144 est une aube : la troupe se lève dès le premier tick.
    sim.avancer(1);
    const b = sim.villages.batailles[0];
    expect(b).toBeDefined();
    if (b === undefined) return;
    expect(b.phase).toBe("marche");
    expect(b.attaquant.guerriers.length).toBeGreaterThanOrEqual(2);
    for (const id of b.attaquant.guerriers)
      expect(sim.personnage(id)?.drapeaux.bataille).toBe(b.id);
    expect(sim.journal.parType("village").some((e) => e.details.genre === "marche")).toBe(true);
    // La troupe part : ses guerriers veulent combattre, et ils bougent.
    let assaut = false;
    for (let t = 0; t < 600 && b.phase !== "finie"; t++) {
      sim.avancer(1);
      if (b.phase === "combat") assaut = true;
    }
    expect(assaut).toBe(true);
    expect(b.phase).toBe("finie");
    expect(b.issue).not.toBeNull();
    expect(b.combatTick).not.toBeNull();
    // Les coups ont été consignés, pour l'animation ; personne ne reste engagé.
    expect(b.frappes.length).toBeGreaterThan(0);
    for (const p of sim.personnages) expect(p.drapeaux.bataille ?? null).toBeNull();
    const fin = sim.journal.parType("village").find((e) => e.details.genre === "bataille");
    expect(fin).toBeDefined();
    expect(fin?.details.issue).toBe(b.issue);
    expect(relationEntre(sim.villages, "v-2", sim.villages.villages[0]?.id ?? "").batailles).toBe(
      1,
    );
    expect(sim.villages.compteurs.batailles).toBe(1);
    // Les défenseurs ont pris les armes en voyant venir la troupe.
    expect(b.defenseur.forceInitiale).toBeGreaterThan(0);
    expect(b.defenseur.forceInitiale).toBeLessThanOrEqual(defenseurs.length);
  }, 120_000);

  it("deux mondes de même graine livrent la même bataille", () => {
    const issue = (): string => {
      const { sim } = deuxVillagesEnGuerre(11);
      sim.avancer(1);
      for (let t = 0; t < 600 && sim.villages.batailles[0]?.phase !== "finie"; t++) sim.avancer(1);
      const b = sim.villages.batailles[0];
      return `${String(b?.issue)}|${String(b?.frappes.length)}|${String(b?.attaquant.blesses)}|${String(b?.defenseur.blesses)}`;
    };
    expect(issue()).toBe(issue());
  }, 120_000);

  it("une bataille se sauvegarde et se restaure en cours de route", () => {
    const { sim } = deuxVillagesEnGuerre(11);
    sim.avancer(30);
    const b = sim.villages.batailles[0];
    expect(b?.phase).not.toBe("finie");
    const copie = Simulation.restaurer(JSON.parse(JSON.stringify(sim.sauvegarder())));
    const bc = copie.villages.batailles[0];
    expect(bc?.id).toBe(b?.id);
    expect(bc?.attaquant.guerriers).toEqual(b?.attaquant.guerriers);
    for (const id of bc?.attaquant.guerriers ?? [])
      expect(copie.personnage(id)?.drapeaux.bataille).toBe(bc?.id);
    for (let t = 0; t < 600 && bc?.phase !== "finie"; t++) copie.avancer(1);
    expect(bc?.phase).toBe("finie");
  }, 120_000);
});
