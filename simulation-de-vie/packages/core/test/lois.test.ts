import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { tomberMalade } from "../src/agents/maladies.js";
import { loisParDefaut } from "@sdv/protocole";

function colonie(seed = 21): Simulation {
  const sim = Simulation.creer({ seed, population: { initiale: 8, familles: 2 } });
  sim.config.brain.conseilsParJour = 0;
  return sim;
}

describe("M25 : les lois du monde", () => {
  it("naissent toutes en vigueur, se suspendent, se journalisent et se sauvegardent", () => {
    const sim = colonie();
    expect(sim.lois).toEqual(loisParDefaut());
    sim.definirLoi("faim", false);
    sim.definirLoi("faim", false);
    expect(sim.lois.faim).toBe(false);
    const divins = sim.journal.parType("divin").filter((e) => e.details.pouvoir === "loi");
    expect(divins).toHaveLength(1);
    expect(divins[0]?.details).toMatchObject({ loi: "faim", actif: false });
    const copie = Simulation.restaurer(sim.sauvegarder());
    expect(copie.lois.faim).toBe(false);
    expect(copie.lois.maladies).toBe(true);
  });

  it("sans la loi de la faim, un ventre vide n'entame plus la santé", () => {
    const sim = colonie();
    const p = sim.vivants()[0];
    if (p === undefined) throw new Error("personne");
    sim.definirLoi("faim", false);
    // Toujours affamé, mais abreuvé, au chaud et reposé : la santé ne doit pas baisser.
    const sante = p.corps.sante;
    for (let i = 0; i < 24; i++) {
      p.besoins.faim = 0;
      p.besoins.soif = 90;
      p.besoins.chaleur = 90;
      p.besoins.sommeil = 90;
      sim.avancer(1);
      if (!p.vivant) break;
    }
    expect(p.vivant).toBe(true);
    expect(p.corps.sante).toBeGreaterThanOrEqual(sante - 0.01);
  });

  it("sans les maladies, personne ne tombe malade", () => {
    const sim = colonie();
    const p = sim.vivants()[0];
    if (p === undefined) throw new Error("personne");
    sim.definirLoi("maladies", false);
    expect(tomberMalade(sim, p, "toux_grise", "test")).toBeNull();
    sim.definirLoi("maladies", true);
    expect(tomberMalade(sim, p, "toux_grise", "test")).not.toBeNull();
  });

  it("sans la vieillesse, un ancien de cent ans ne meurt pas de son âge", () => {
    const sim = colonie();
    sim.definirLoi("vieillesse", false);
    for (const p of sim.vivants()) p.corps.ageJours = 100 * sim.config.vie.joursParAnnee;
    for (let j = 0; j < 6; j++) sim.avancerJusquaAube();
    expect(sim.journal.parType("deces").some((e) => e.details.cause === "vieillesse")).toBe(false);
    const temoin = colonie();
    for (const p of temoin.vivants()) p.corps.ageJours = 100 * temoin.config.vie.joursParAnnee;
    for (let j = 0; j < 6; j++) temoin.avancerJusquaAube();
    expect(temoin.journal.parType("deces").some((e) => e.details.cause === "vieillesse")).toBe(
      true,
    );
  });

  it("sans les bêtes, la menace en cours s'éteint et aucun combat n'a lieu", () => {
    const sim = colonie();
    sim.definirLoi("betes", false);
    expect(sim.danger.menace).toBeNull();
    for (let j = 0; j < 40; j++) sim.avancerJusquaAube();
    expect(sim.journal.compte("combat")).toBe(0);
    expect(sim.journal.compte("menace")).toBe(0);
  });

  it("les commandes loi passent par le protocole et la migration des vieilles sauvegardes les ajoute", () => {
    const sim = colonie();
    const brut = sim.sauvegarder() as unknown as { version: number; etat: { lois?: unknown } };
    delete brut.etat.lois;
    brut.version = 4;
    const copie = Simulation.restaurer(brut);
    expect(copie.lois).toEqual(loisParDefaut());
  });
});
