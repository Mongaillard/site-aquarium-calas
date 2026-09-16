import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { PREMIER_CALME_JOURS, ecrireChronique, frapper, offrir } from "../src/monde/conteur.js";
import { estMalade } from "../src/agents/maladies.js";

function colonie(seed = 31): Simulation {
  const sim = Simulation.creer({ seed, population: { initiale: 8, familles: 2 } });
  sim.config.brain.conseilsParJour = 0;
  return sim;
}

describe("M25 : le conteur", () => {
  it("naît calme, monte, frappe puis souffle : la courbe s'enchaîne sur soixante jours", () => {
    const sim = colonie();
    expect(sim.conteur.phase).toBe("calme");
    expect(sim.conteur.phaseDureeJours).toBe(PREMIER_CALME_JOURS);
    const phases = new Set<string>();
    for (let j = 0; j < 60; j++) {
      sim.avancerJusquaAube();
      sim.avancer(1);
      phases.add(sim.conteur.phase);
    }
    expect(phases.has("montee")).toBe(true);
    expect(phases.has("repit")).toBe(true);
    expect(sim.conteur.crises + sim.conteur.bienfaits).toBeGreaterThan(0);
    const evts = sim.journal.parType("conteur");
    expect(evts.some((e) => e.details.genre === "bienfait" || e.details.genre === "crise")).toBe(
      true,
    );
    expect(sim.conteur.actes.length).toBe(sim.conteur.crises + sim.conteur.bienfaits);
    expect(sim.vivants().length).toBeGreaterThan(0);
  });

  it("la crise respecte les lois : sans bêtes, ni raids, ni maladies, il ne reste que le ciel", () => {
    const sim = colonie();
    sim.definirLoi("betes", false);
    sim.definirLoi("raids", false);
    sim.definirLoi("maladies", false);
    const rng = sim.rng.fork("test-crise");
    for (let i = 0; i < 6; i++) frapper(sim, sim.conteur, rng);
    const quoi = new Set(sim.conteur.actes.map((a) => a.genre));
    expect(quoi.has("meute")).toBe(false);
    expect(quoi.has("bande")).toBe(false);
    expect(quoi.has("maladie")).toBe(false);
    expect([...quoi].every((q) => ["tempete", "canicule", "neige"].includes(q))).toBe(true);
    expect(sim.meteoForcee).not.toBeNull();
    expect(sim.conteur.crises).toBe(6);
  });

  it("la crise « meute » ouvre une menace pour le directeur de danger", () => {
    const sim = colonie();
    sim.avancer(144);
    const rng = sim.rng.fork("test-meute");
    let essais = 0;
    while (sim.conteur.actes.at(-1)?.genre !== "meute" && essais < 40) {
      frapper(sim, sim.conteur, rng);
      essais += 1;
      if (sim.conteur.actes.at(-1)?.genre === "meute") break;
    }
    expect(sim.conteur.actes.at(-1)?.genre).toBe("meute");
    expect(sim.danger.menace).not.toBeNull();
    const meute = sim.troupeaux.get(sim.danger.menace?.meute ?? "");
    expect(meute?.espece).toBe("loup");
    expect(meute?.enMenace).toBe(true);
  });

  it("le répit guérit les malades quand il y en a, sinon offre troupeau, beau temps ou aubaine", () => {
    const sim = colonie();
    sim.avancer(144);
    const p = sim.vivants()[0];
    if (p === undefined) throw new Error("personne");
    // Un malade : la guérison est deux fois plus probable ; on force jusqu'à la voir.
    const rng = sim.rng.fork("test-repit");
    let guerisons = 0;
    for (let i = 0; i < 12 && guerisons === 0; i++) {
      p.corps.etat.maladies.length = 0;
      p.corps.etat.maladies.push({
        type: "toux_grise",
        depuis: sim.tick,
        jusqua: sim.tick + 1440,
        origine: "test",
      } as (typeof p.corps.etat.maladies)[number]);
      offrir(sim, sim.conteur, rng);
      if (sim.conteur.actes.at(-1)?.genre === "guerison") {
        guerisons += 1;
        expect(estMalade(p)).toBe(false);
      }
    }
    expect(guerisons).toBe(1);
    expect(sim.conteur.actes.every((a) => a.bienfait)).toBe(true);
    expect(
      sim.journal.parType("conteur").filter((e) => e.details.genre === "bienfait").length,
    ).toBe(sim.conteur.bienfaits);
  });

  it("au nouvel an, la chronique de l'année s'écrit, se lit et se sauvegarde", () => {
    const sim = colonie();
    sim.avancer(144);
    const annee = sim.horloge.moment().annee;
    ecrireChronique(sim, sim.conteur);
    const ch = sim.conteur.chroniques[0];
    if (ch === undefined) throw new Error("pas de chronique");
    expect(ch.annee).toBe(annee);
    expect(ch.titre.length).toBeGreaterThan(3);
    expect(ch.texte).toContain(`An ${String(annee)}`);
    expect(ch.texte).toContain("âme");
    const evt = sim.journal.parType("conteur").find((e) => e.details.genre === "chronique");
    expect(evt?.importance).toBe(9);
    expect(evt?.details.titre).toBe(ch.titre);
    const copie = Simulation.restaurer(sim.sauvegarder());
    expect(copie.conteur.chroniques).toHaveLength(1);
    expect(copie.conteur.chroniques[0]?.texte).toBe(ch.texte);
    expect(copie.conteur.phase).toBe(sim.conteur.phase);
  });

  it("la chronique se déclenche d'elle-même au passage de l'an, et les vieilles sauvegardes reçoivent un conteur", () => {
    const sim = colonie(5);
    const brut = sim.sauvegarder() as unknown as { version: number; etat: { conteur?: unknown } };
    delete brut.etat.conteur;
    brut.version = 4;
    const copie = Simulation.restaurer(brut);
    expect(copie.conteur.phase).toBe("calme");
    expect(copie.conteur.chroniques).toHaveLength(0);
    // Jusqu'au premier jour de l'an 2 (120 jours de 144 ticks) : une chronique.
    const total = copie.config.vie.joursParAnnee;
    for (let j = 0; j < total + 1; j++) {
      copie.avancerJusquaAube();
      copie.avancer(1);
    }
    expect(copie.horloge.moment().annee).toBe(2);
    expect(copie.conteur.chroniques.map((c) => c.annee)).toEqual([1]);
  }, 120_000);
});
