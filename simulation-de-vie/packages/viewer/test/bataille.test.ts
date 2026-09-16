import { describe, expect, it } from "vitest";
import type { BatailleEtat, MessageEtat, MessageInit } from "@sdv/protocole";
import { Magasin } from "../src/etat.js";

const init: MessageInit = {
  type: "init",
  seed: "1",
  tailleMorceau: 32,
  nomsBiomes: ["prairie", "foret", "eau_profonde"],
  ticksParJour: 144,
  joursParSaison: 30,
  modeCerveau: "rules",
};

function etat(decouvertes: number[]): MessageEtat {
  return {
    type: "etat",
    tick: 1,
    moment: {
      tick: 1,
      annee: 1,
      saison: "printemps",
      jourDeSaison: 1,
      jourAbsolu: 0,
      heure: 8,
      minute: 0,
      estNuit: false,
    },
    meteo: "clair",
    ticksParSeconde: 4,
    pause: false,
    personnages: [],
    batiments: [],
    troupeaux: [],
    gisements: [],
    evenements: [],
    stats: {
      tick: 1,
      vivants: 0,
      morts: 0,
      population: 0,
      enfants: 0,
      batiments: 0,
      chantiers: 0,
      parType: {},
      naissances: 0,
      deces: 0,
      unions: 0,
      dialogues: 0,
      generations: 1,
      stocks: {},
      parSaison: [],
      appelsLLM: 0,
      coutLLM: 0,
      evenements: 0,
      tuilesDecouvertes: decouvertes.length / 3,
      tuiles: 1024,
      morceaux: 1,
      savoirs: [],
      conquetes: 0,
      raidsRepousses: 0,
    },
    decouvertes,
    rayonVision: 6,
    faveur: {
      valeur: 20,
      max: 40,
      recharges: {},
      miracles: 0,
      reputation: 0,
      prieres: 0,
      offrandes: 0,
      exaucees: 0,
      providence: false,
      culte: 0,
    },
    questions: [],
    prieres: [],
    societe: {
      tension: 0,
      coutumes: [],
      notables: [],
      factions: [],
      griefs: [],
      decisions: [],
      alliances: [],
      lieuxInterdits: [],
      stocksOuverts: false,
      veillee: null,
      bannis: [],
    },
    chronique: { recits: [], lieuxNommes: [], proverbes: [] },
    villages: { villages: [], relations: [], bandes: [], caravanes: [], routes: [], batailles: [] },
    lois: {
      faim: true,
      maladies: true,
      betes: true,
      raids: true,
      schismes: true,
      vieillesse: true,
      conteur: true,
    },
    creatures: [],
    buts: { succes: [], scenario: null, propheties: [] },
    conteur: {
      phase: "calme",
      tension: 10,
      pression: 0,
      joursDansPhase: 0,
      crises: 0,
      bienfaits: 0,
      actes: [],
      chroniques: [],
    },
  };
}

function bataille(
  frappes: readonly BatailleEtat["frappes"][number][],
  phase: BatailleEtat["phase"] = "combat",
): BatailleEtat {
  return {
    id: "bataille-1",
    genre: "guerre",
    phase,
    attaquant: {
      village: "v-1",
      bande: null,
      meute: null,
      membres: [],
      nom: "les Naudin",
      guerriers: ["p-1", "p-2"],
      forceInitiale: 3,
      blesses: 1,
      morts: 0,
    },
    defenseur: {
      village: "v-2",
      bande: null,
      meute: null,
      membres: [],
      nom: "les Garnier",
      guerriers: ["p-3"],
      forceInitiale: 2,
      blesses: 2,
      morts: 0,
    },
    x: 10,
    y: 10,
    rayon: 8,
    debutTick: 100,
    combatTick: 150,
    finTick: null,
    issue: null,
    frappes,
  };
}

function avecBataille(tick: number, b: BatailleEtat): MessageEtat {
  const m = etat([]);
  return { ...m, tick, villages: { ...m.villages, batailles: [b] } };
}

describe("M32 : les coups de bataille côté viewer", () => {
  it("chaque frappe nouvelle devient un coup animé, une seule fois, échelonné", () => {
    const m = new Magasin();
    m.recevoir(init, 0);
    const f1 = { tick: 160, de: "p-1", vers: "p-3", degats: 20, mortelle: false };
    const f2 = { tick: 161, de: "p-3", vers: "p-1", degats: 0, mortelle: false };
    m.recevoir(avecBataille(162, bataille([f1, f2])), 1000);
    expect(m.coups).toHaveLength(2);
    expect(m.coups[0]?.debut).toBe(1000);
    expect(m.coups[1]?.debut).toBe(1090);
    expect(m.coups[0]?.fin).toBeGreaterThan(m.coups[0]?.debut ?? 0);
    // Le même état, ou un état qui répète les frappes déjà vues : rien de plus.
    m.recevoir(avecBataille(163, bataille([f1, f2])), 1200);
    expect(m.coups).toHaveLength(2);
    const f3 = { tick: 164, de: "p-2", vers: "p-3", degats: 8, mortelle: true };
    m.recevoir(avecBataille(165, bataille([f2, f3])), 1300);
    expect(m.coups).toHaveLength(3);
    expect(m.coups[2]?.mortelle).toBe(true);
    // Les coups s'effacent avec le temps.
    m.recevoir(avecBataille(166, bataille([f3])), 5000);
    expect(m.coups).toHaveLength(0);
  });

  it("un rattrapage n'anime pas, et les combattants se lisent par camp", () => {
    const m = new Magasin();
    m.recevoir(init, 0);
    const vieille = { tick: 10, de: "p-1", vers: "p-3", degats: 20, mortelle: false };
    m.recevoir(avecBataille(200, bataille([vieille])), 1000);
    expect(m.coups).toHaveLength(0);
    expect(m.batailleActive?.id).toBe("bataille-1");
    expect(m.combattants.get("p-1")).toBe("attaquant");
    expect(m.combattants.get("p-3")).toBe("defenseur");
    expect(m.combattants.has("p-9")).toBe(false);
    m.recevoir(
      avecBataille(300, { ...bataille([]), phase: "finie", issue: "attaquant", finTick: 290 }),
      2000,
    );
    expect(m.batailleActive).toBeNull();
    expect(m.combattants.size).toBe(0);
    m.reinitialiser();
    expect(m.coups).toHaveLength(0);
  });
});
