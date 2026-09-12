import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { grilleUniforme } from "./utils.js";

/** Test d'intégration M1 (section 15) : 12 personnages, 10 jours, cerveau à règles. */
describe("survie (intégration M1)", () => {
  it("au moins 10 personnages sur 12 survivent 10 jours avec la graine 42", () => {
    const sim = Simulation.creer({ seed: 42 });
    for (let j = 0; j < 10; j++) sim.avancerJusquaAube();
    const stats = sim.statistiques();
    expect(stats.vivants).toBeGreaterThanOrEqual(10);
    expect(sim.journal.compte("repas")).toBeGreaterThan(50);
    expect(sim.journal.compte("recolte")).toBeGreaterThan(50);
    for (const p of sim.vivants()) {
      expect(p.corps.sante).toBeGreaterThan(0);
      expect(p.connaissance.size).toBeGreaterThan(0);
    }
  }, 30_000);

  it("deux exécutions identiques produisent le même journal (P1)", () => {
    const a = Simulation.creer({ seed: 7, monde: { largeur: 48, hauteur: 32 } });
    const b = Simulation.creer({ seed: 7, monde: { largeur: 48, hauteur: 32 } });
    a.avancer(3 * 144);
    b.avancer(3 * 144);
    expect(a.journal.empreinte()).toBe(b.journal.empreinte());
    expect(a.personnages.map((p) => p.corps.position)).toEqual(
      b.personnages.map((p) => p.corps.position),
    );
  }, 30_000);

  it("un personnage privé d'eau meurt de soif, et l'événement est journalisé", () => {
    const sim = Simulation.creer({
      seed: 3,
      monde: { largeur: 32, hauteur: 32 },
      population: { initiale: 1, familles: 1 },
    });
    const p = sim.personnages[0];
    if (p === undefined) throw new Error("pas de personnage");
    // On remplace le cerveau par un cerveau passif : le personnage attend indéfiniment.
    sim.definirCerveau(p.id, {
      decider: () => ({ type: "attendre", ticks: 50 }),
      urgence: () => null,
    });
    sim.avancer(6 * 144);
    expect(p.vivant).toBe(false);
    expect(p.causeDeces).toBe("soif");
    const deces = sim.journal.parType("deces");
    expect(deces).toHaveLength(1);
    expect(deces[0]?.importance).toBe(10);
    expect(sim.statistiques()).toMatchObject({ vivants: 0, morts: 1 });
  });

  it("M2 : au moins 3 abris terminés en 30 jours, et la colonie reste vivante", () => {
    const sim = Simulation.creer({ seed: 42 });
    for (let j = 0; j < 30; j++) sim.avancerJusquaAube();
    const abris = sim.batimentsTermines("abri").length + sim.batimentsTermines("maison").length;
    expect(abris).toBeGreaterThanOrEqual(3);
    expect(sim.batimentsTermines("feu_de_camp").length).toBeGreaterThanOrEqual(1);
    expect(sim.statistiques().vivants).toBeGreaterThanOrEqual(10);
    expect(sim.journal.compte("fabrication")).toBeGreaterThan(0);
    // Les chantiers sont partagés : au moins un bâtiment a reçu des livraisons de plusieurs personnes.
    const livreursParBatiment = new Map<string, Set<string>>();
    for (const e of sim.journal.parType("livraison")) {
      const id = String(e.details.batiment);
      livreursParBatiment.set(id, (livreursParBatiment.get(id) ?? new Set()).add(e.acteur ?? "?"));
    }
    expect([...livreursParBatiment.values()].some((s) => s.size >= 2)).toBe(true);
  }, 60_000);

  it("épuisé et assoiffé, un personnage va boire au lieu de s'endormir sur place", () => {
    const sim = Simulation.creer({
      seed: 5,
      monde: { largeur: 48, hauteur: 32 },
      population: { initiale: 1, familles: 1 },
    });
    const p = sim.personnages[0];
    if (p === undefined) throw new Error("pas de personnage");
    sim.avancer(144); // découvre les environs
    p.besoins.sommeil = 0;
    p.besoins.soif = 10;
    p.besoins.faim = 90;
    let soifMax = 0;
    for (let i = 0; i < 144; i++) {
      sim.tick1();
      soifMax = Math.max(soifMax, p.besoins.soif);
    }
    expect(p.vivant).toBe(true);
    expect(soifMax).toBeGreaterThan(90); // il a bu avant de dormir
  });

  it("affamé avec un inventaire plein, un personnage libère de la place puis mange", () => {
    const sim = Simulation.creer({
      seed: 5,
      monde: { largeur: 48, hauteur: 32 },
      population: { initiale: 1, familles: 1 },
    });
    const p = sim.personnages[0];
    if (p === undefined) throw new Error("pas de personnage");
    sim.avancer(144);
    p.corps.inventaire.ressources = {};
    p.corps.inventaire.ressources.pierre = p.corps.inventaire.capacite;
    p.besoins.faim = 10;
    sim.avancer(144);
    expect(p.vivant).toBe(true);
    expect(sim.journal.compte("jete") + sim.journal.compte("depot")).toBeGreaterThan(0);
    expect(p.besoins.faim).toBeGreaterThan(30);
  });

  it("M3 : en 30 jours, les personnages dialoguent, se transmettent des lieux et réfléchissent", () => {
    const sim = Simulation.creer({ seed: 42 });
    for (let j = 0; j < 30; j++) sim.avancerJusquaAube();
    expect(sim.journal.compte("dialogue")).toBeGreaterThan(30);
    const transmissions = sim.journal
      .parType("dialogue")
      .filter((e) => String(e.details.informations ?? "") !== "").length;
    expect(transmissions).toBeGreaterThan(5);
    expect(sim.journal.compte("reflexion")).toBeGreaterThan(0);
    expect(sim.statistiques().vivants).toBeGreaterThanOrEqual(10);
    for (const p of sim.vivants()) {
      expect(p.memoire.taille).toBeGreaterThan(10);
      expect([...p.relations.values()].some((r) => r.interactions > 0)).toBe(true);
    }
  }, 60_000);

  it("assoiffé sans point d'eau connu, un personnage explore au lieu de rester sur place", () => {
    const eau = Array.from({ length: 40 }, (_, y) => ({
      x: 0,
      y,
      biome: "eau_peu_profonde" as const,
    }));
    const grille = grilleUniforme(40, 40, "prairie", eau);
    const sim = Simulation.creerAvecGrille(
      { seed: 8, population: { initiale: 1, familles: 1 } },
      grille,
    );
    const p = sim.personnages[0];
    if (p === undefined) throw new Error("pas de personnage");
    p.corps.position = { x: 30, y: 20 };
    p.connaissance.clear();
    p.besoins.soif = 12;
    p.besoins.faim = 90;
    p.besoins.sommeil = 90;
    sim.avancer(60);
    expect(p.corps.position).not.toEqual({ x: 30, y: 20 });
    const echecsEau = sim.journal
      .parType("action_echouee")
      .filter((e) => e.details.raison === "aucun point d'eau connu");
    expect(echecsEau.length).toBeLessThan(10);
  });

  it("M4 : au moins une naissance en 60 jours, et l'enfant survit à ses premiers jours", () => {
    const sim = Simulation.creer({ seed: 42 });
    for (let j = 0; j < 60; j++) sim.avancerJusquaAube();
    expect(sim.journal.compte("union")).toBeGreaterThanOrEqual(1);
    expect(sim.journal.compte("naissance")).toBeGreaterThanOrEqual(1);
    const enfants = sim.personnages.filter((p) => p.identite.parents !== null);
    expect(enfants.length).toBeGreaterThanOrEqual(1);
    expect(enfants.some((p) => p.vivant)).toBe(true);
    expect(sim.genealogie().generations).toBe(2);
    expect(sim.statistiques().vivants).toBeGreaterThanOrEqual(11);
  }, 120_000);

  it("les gisements renouvelables se régénèrent", () => {
    const sim = Simulation.creer({ seed: 42, population: { initiale: 0 } });
    const gisement = [...sim.grille.toutes()].find((t) => t.gisement?.type === "fibres")?.gisement;
    if (!gisement) throw new Error("pas de fibres");
    gisement.quantite = 0;
    sim.avancer(144);
    expect(gisement.quantite).toBeCloseTo(gisement.tauxRegen, 5);
  });
});
