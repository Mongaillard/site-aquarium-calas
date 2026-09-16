import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { INFO_BIOME } from "../src/monde/biomes.js";
import { biomeDuPinceau } from "../src/monde/terrain.js";

describe("M25 : sculpter le monde et poser des peuples", () => {
  it("le pinceau pose le biome demandé en disque, découvre la zone et garde les bâtiments", () => {
    const sim = Simulation.creer({ seed: 7, population: { initiale: 6, familles: 2 } });
    const avant = sim.grille.nombreDecouvertes;
    const r = sim.sculpter({ pinceau: "montagne", x: 60, y: 60, rayon: 3 });
    expect(r.tuiles).toBeGreaterThan(20);
    expect(sim.grille.tuile(60, 60).biome).toBe("montagne");
    // La lisière est en collines, le cœur en montagne.
    expect(sim.grille.tuile(63, 60).biome).toBe("colline");
    expect(sim.grille.estDecouverte(60, 60)).toBe(true);
    expect(sim.grille.nombreDecouvertes).toBeGreaterThan(avant);
    // Un second coup identique ne change rien.
    expect(sim.sculpter({ pinceau: "montagne", x: 60, y: 60, rayon: 3 }).tuiles).toBe(0);
    // Une tuile bâtie reste telle quelle.
    const bati = [...sim.batiments.values()][0];
    if (bati !== undefined) {
      const biome = sim.grille.tuile(bati.position.x, bati.position.y).biome;
      sim.sculpter({ pinceau: "eau", x: bati.position.x, y: bati.position.y, rayon: 0 });
      expect(sim.grille.tuile(bati.position.x, bati.position.y).biome).toBe(biome);
    }
    expect(sim.journal.parType("divin").at(-1)?.details.pouvoir).toBe("sculpture");
  });

  it("l'eau profonde repousse les personnes sur la rive, et les biomes du pinceau sont cohérents", () => {
    const sim = Simulation.creer({ seed: 7, population: { initiale: 6, familles: 2 } });
    const p = sim.vivants()[0];
    if (p === undefined) throw new Error("personne");
    const pos = { ...p.corps.position };
    sim.sculpter({ pinceau: "eau", x: pos.x, y: pos.y, rayon: 4 });
    const t = sim.grille.tuile(p.corps.position.x, p.corps.position.y);
    expect(INFO_BIOME[t.biome].praticable).toBe(true);
    expect(biomeDuPinceau("eau", 0, 3)).toBe("eau_profonde");
    expect(biomeDuPinceau("eau", 3, 3)).toBe("eau_peu_profonde");
    expect(biomeDuPinceau("terre", 0, 3)).toBe("prairie");
    expect(biomeDuPinceau("sable", 2, 3)).toBe("plage");
    expect(biomeDuPinceau("foret", 3, 3)).toBe("foret");
  });

  it("les sculptures survivent à la sauvegarde (le terrain se regénère de la graine, puis se rejoue)", () => {
    const sim = Simulation.creer({ seed: 7, population: { initiale: 6, familles: 2 } });
    sim.sculpter({ pinceau: "foret", x: -40, y: 20, rayon: 2 });
    sim.sculpter({ pinceau: "eau", x: 30, y: -30, rayon: 2 });
    const bois = sim.grille.tuile(-40, 20).gisement;
    const copie = Simulation.restaurer(sim.sauvegarder());
    expect(copie.grille.tuile(-40, 20).biome).toBe("foret");
    expect(copie.grille.tuile(30, -30).biome).toBe("eau_profonde");
    expect(copie.grille.tuile(-40, 20).gisement).toEqual(bois);
    expect(copie.grille.versionDuTerrain).toBe(sim.grille.versionDuTerrain);
  });

  it("un monde vierge n'a personne, voit son berceau, et le premier peuple posé est gratuit", () => {
    const sim = Simulation.creer({ seed: 3, population: { initiale: 0, familles: 3 } });
    expect(sim.vivants()).toHaveLength(0);
    expect(sim.villages.villages).toHaveLength(0);
    expect(sim.grille.estDecouverte(0, 0)).toBe(true);
    expect(sim.grille.estDecouverte(30, 0)).toBe(true);
    // Un monde sans personne tourne quand même : trois jours vides, sans erreur.
    for (let j = 0; j < 3; j++) sim.avancerJusquaAube();
    sim.avancer(10);
    const faveur = sim.faveur.valeur;
    const r = sim.peupler({ x: 10, y: 5, taille: 12 });
    expect(r.ok).toBe(true);
    expect(sim.vivants()).toHaveLength(12);
    expect(sim.faveur.valeur).toBe(faveur);
    expect(sim.villages.villages).toHaveLength(1);
    const ids = new Set(sim.personnages.map((p) => p.id));
    expect(ids.size).toBe(12);
    // Le peuple vit : dix jours sans exception, et des bâtiments naissent.
    for (let j = 0; j < 10; j++) sim.avancerJusquaAube();
    expect(sim.vivants().length).toBeGreaterThan(0);
  });

  it("dans un monde habité, un peuple coûte de la faveur et fonde un second village de familles neuves", () => {
    const sim = Simulation.creer({ seed: 3, population: { initiale: 6, familles: 2 } });
    sim.faveur.valeur = 10;
    expect(sim.peupler({ x: 50, y: 50, taille: 6 })).toEqual({ ok: false, raison: "faveur" });
    sim.faveur.valeur = 30;
    const r = sim.peupler({ x: 50, y: 50, taille: 6 });
    expect(r.ok).toBe(true);
    expect(sim.faveur.valeur).toBe(5);
    expect(sim.villages.villages).toHaveLength(2);
    const [a, b] = sim.villages.villages;
    expect(a?.familles.some((f) => b?.familles.includes(f))).toBe(false);
    expect(sim.vivants()).toHaveLength(12);
    // Les identifiants restent uniques après une naissance ultérieure.
    const ids = sim.personnages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const copie = Simulation.restaurer(sim.sauvegarder());
    expect(copie.villages.villages).toHaveLength(2);
    expect(copie.vivants()).toHaveLength(12);
  });

  it("plusieurs peuples au départ : autant de villages, à bonne distance, aux familles distinctes", () => {
    const sim = Simulation.creer({ seed: 5, population: { initiale: 6, familles: 2, peuples: 3 } });
    expect(sim.villages.villages).toHaveLength(3);
    expect(sim.vivants()).toHaveLength(18);
    const noms = sim.villages.villages.flatMap((v) => v.familles);
    expect(new Set(noms).size).toBe(noms.length);
    const [premier, ...autres] = sim.villages.villages;
    for (const v of autres) {
      const d = Math.hypot(
        v.centre.x - (premier?.centre.x ?? 0),
        v.centre.y - (premier?.centre.y ?? 0),
      );
      expect(d).toBeGreaterThan(25);
    }
    // Déterminisme : même graine, mêmes villages.
    const bis = Simulation.creer({ seed: 5, population: { initiale: 6, familles: 2, peuples: 3 } });
    expect(bis.villages.villages.map((v) => v.centre)).toEqual(
      sim.villages.villages.map((v) => v.centre),
    );
    for (let j = 0; j < 5; j++) sim.avancerJusquaAube();
    expect(sim.vivants().length).toBeGreaterThan(10);
  });
});
