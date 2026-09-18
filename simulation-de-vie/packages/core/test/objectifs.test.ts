import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { FAVEUR_PROPHETIE, formuler } from "../src/monde/objectifs.js";
import { famillesLibres } from "../src/agents/population.js";
import { Rng } from "../src/rng.js";

function colonie(scenario: "an_dix" | "une_legende" | "cent_ames" | null = null): Simulation {
  const sim = Simulation.creer({
    seed: 23,
    population: { initiale: 8, familles: 2 },
    jeu: { scenario },
  });
  sim.config.brain.conseilsParJour = 0;
  return sim;
}

describe("M26 : les buts", () => {
  it("les succès se débloquent à l'aube et une seule fois, et se sauvegardent", () => {
    const sim = colonie();
    expect(sim.objectifs.succes).toHaveLength(0);
    for (let j = 0; j < 12; j++) {
      sim.avancerJusquaAube();
      sim.avancer(1);
    }
    const ids = sim.objectifs.succes.map((s) => s.id);
    expect(ids).toContain("un_toit");
    expect(new Set(ids).size).toBe(ids.length);
    const evts = sim.journal.parType("but").filter((e) => e.details.genre === "succes");
    expect(evts.length).toBe(ids.length);
    const copie = Simulation.restaurer(sim.sauvegarder());
    expect(copie.objectifs.succes.map((s) => s.id)).toEqual(ids);
  });

  it("un scénario suit son progrès, se gagne quand la condition est là, se perd à la limite ou à l'extinction", () => {
    const sim = colonie("une_legende");
    const sc = sim.objectifs.scenario;
    if (sc === null) throw new Error("pas de scénario");
    expect(sc.etat).toBe("en_cours");
    expect(sc.finJour).toBe(3 * sim.config.vie.joursParAnnee);
    sim.emettre("legende", null, { genre: "legende", texte: "test", fois: 3 }, 8);
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(sc.etat).toBe("gagne");
    expect(sc.progres).toBe(1);
    expect(sim.journal.parType("but").some((e) => e.details.issue === "gagne")).toBe(true);
    // Perdu à l'extinction.
    const autre = colonie("an_dix");
    for (const p of autre.vivants()) autre.tuer(p, "test");
    autre.avancerJusquaAube();
    autre.avancer(1);
    expect(autre.objectifs.scenario?.etat).toBe("perdu");
    // Partie libre : pas de scénario ; un vieux monde en reçoit un état vide.
    expect(colonie(null).objectifs.scenario).toBeNull();
  });

  it("les prophéties se formulent, s'accomplissent (faveur en prime) ou se manquent à l'échéance", () => {
    const sim = colonie();
    sim.avancer(144);
    const rng = sim.rng.fork("test-prophetie");
    const p = formuler(sim, sim.objectifs, rng);
    if (p === null) throw new Error("pas de prophétie");
    expect(p.texte.startsWith("Avant la fin")).toBe(true);
    expect(p.finJour).toBeGreaterThan(p.jour);
    // Une prophétie d'âmes, satisfaite d'office : accomplie à la prochaine aube, faveur gagnée.
    sim.objectifs.propheties.push({
      id: "prophetie-test",
      genre: "ames",
      texte: "Avant la fin de la saison, le village comptera 1 âme.",
      jour: sim.horloge.moment().jourAbsolu,
      finJour: sim.horloge.moment().jourAbsolu + 5,
      cible: 1,
      parametre: "",
      etat: "ouverte",
    });
    sim.faveur.valeur = 10;
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(sim.objectifs.propheties.at(-1)?.etat).toBe("accomplie");
    expect(sim.faveur.valeur).toBeGreaterThanOrEqual(10 + FAVEUR_PROPHETIE);
    expect(sim.journal.parType("but").some((e) => e.details.issue === "accomplie")).toBe(true);
    // Une prophétie impossible, déjà échue : manquée.
    sim.objectifs.propheties.push({
      id: "prophetie-test-2",
      genre: "ames",
      texte: "…",
      jour: sim.horloge.moment().jourAbsolu - 10,
      finJour: sim.horloge.moment().jourAbsolu - 1,
      cible: 9999,
      parametre: "",
      etat: "ouverte",
    });
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(sim.objectifs.propheties.at(-1)?.etat).toBe("manquee");
    expect(sim.journal.parType("but").some((e) => e.details.issue === "manquee")).toBe(true);
  });

  it("les vieilles sauvegardes reçoivent des buts vides, et les noms de famille de renfort ne se répètent pas", () => {
    const sim = colonie();
    const brut = sim.sauvegarder() as unknown as { version: number; etat: Record<string, unknown> };
    delete brut.etat.objectifs;
    brut.version = 4;
    const copie = Simulation.restaurer(brut);
    expect(copie.objectifs.succes).toEqual([]);
    expect(copie.objectifs.scenario).toBeNull();
    const rng = Rng.depuisGraine("noms");
    const portes = new Set<string>();
    const a = famillesLibres(rng, portes, 30);
    for (const f of a) portes.add(f);
    const b = famillesLibres(rng, portes, 30);
    expect(new Set([...a, ...b]).size).toBe(60);
  });
});
