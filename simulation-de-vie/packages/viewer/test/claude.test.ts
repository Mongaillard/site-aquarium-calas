import { describe, expect, it } from "vitest";
import type { EvenementEtat, MessageEtat, MessageInit, PersonnageEtat } from "@sdv/protocole";
import { CerveauClaude, extraireJson } from "../src/claude.js";
import type { Inspiration } from "../src/claude.js";
import { Magasin } from "../src/etat.js";

const init: MessageInit = {
  type: "init",
  seed: "1",
  tailleMorceau: 32,
  nomsBiomes: ["prairie"],
  ticksParJour: 144,
  joursParSaison: 30,
  modeCerveau: "rules",
};

function personnage(id: string, vivant: boolean): PersonnageEtat {
  return {
    id,
    prenom: "Iris",
    nomFamille: "Besson",
    sexe: "F",
    vivant,
    x: 0,
    y: 0,
    endormi: false,
    stade: "adulte",
    enceinte: false,
    sante: 100,
    besoins: { faim: 50, soif: 60, sommeil: 70, chaleur: 80, securite: 90, social: 40, moral: 55 },
    intention: "manger",
    action: null,
    parents: null,
    partenaire: null,
    causeDeces: vivant ? null : "froid",
    teint: 0,
    cheveux: 0,
  };
}

function etat(personnages: PersonnageEtat[], evenements: EvenementEtat[]): MessageEtat {
  return {
    type: "etat",
    tick: 10,
    moment: {
      tick: 10,
      annee: 1,
      saison: "hiver",
      jourDeSaison: 1,
      jourAbsolu: 90,
      heure: 8,
      minute: 0,
      estNuit: false,
    },
    meteo: "neige",
    ticksParSeconde: 4,
    pause: false,
    personnages,
    batiments: [],
    gisements: [],
    evenements,
    stats: {
      tick: 10,
      vivants: 1,
      morts: 0,
      population: 1,
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
      tuilesDecouvertes: 0,
      tuiles: 0,
      morceaux: 0,
      savoirs: [],
    },
    decouvertes: [],
    rayonVision: 6,
  };
}

describe("cerveau Claude côté page", () => {
  it("extrait un objet JSON même entouré de texte", () => {
    expect(extraireJson('Voici : ```json\n{"pensee": "Il fait froid."}\n```')).toEqual({
      pensee: "Il fait froid.",
    });
    expect(extraireJson("rien")).toBeNull();
  });

  it("à un décès, demande une épitaphe et une leçon, puis les transmet au moteur", async () => {
    const magasin = new Magasin();
    magasin.recevoir(init, 0);
    const prompts: string[] = [];
    const envoyees: Inspiration[] = [];
    const statuts: string[] = [];
    const cerveau = new CerveauClaude(
      magasin,
      (i) => envoyees.push(i),
      () =>
        Promise.resolve((entree: string) => {
          prompts.push(entree);
          return Promise.resolve({
            text: '{"epitaphe": "Elle est partie dans la neige.", "lecon": "rentrer_quand_on_gele"}',
          });
        }),
      (t) => statuts.push(t),
      { intervalleMs: 1000 },
    );
    cerveau.activer();
    magasin.recevoir(
      etat(
        [personnage("p-1", false)],
        [
          {
            tick: 10,
            type: "deces",
            acteur: "p-1",
            position: null,
            importance: 10,
            details: { cause: "froid" },
          },
          {
            tick: 10,
            type: "lecon",
            acteur: "p-1",
            position: null,
            importance: 8,
            details: { lecon: "provisions_hiver", morale: "…", cause: "froid", apprenants: 3 },
          },
        ],
      ),
      10,
    );
    await cerveau.tick(5000);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("vient de mourir de froid");
    expect(prompts[0]).toContain("Le moteur propose : provisions_hiver");
    expect(envoyees).toEqual([
      {
        type: "inspiration",
        genre: "epitaphe",
        personnageId: "p-1",
        texte: "Elle est partie dans la neige.",
        savoir: "rentrer_quand_on_gele",
      },
    ]);
    expect(cerveau.appels).toBe(1);
    expect(statuts.at(-1)).toContain("Claude a écrit");
    // Rien de nouveau : pas d'appel supplémentaire.
    await cerveau.tick(9000);
    expect(prompts).toHaveLength(1);
  });

  it("écrit la pensée du personnage sélectionné, sans jamais enchaîner les appels", async () => {
    const magasin = new Magasin();
    magasin.recevoir(init, 0);
    magasin.recevoir(etat([personnage("p-1", true)], []), 10);
    magasin.selectionner("p-1");
    magasin.recevoir(
      {
        type: "fiche",
        id: "p-1",
        prenom: "Iris",
        nomFamille: "Besson",
        sexe: "F",
        vivant: true,
        causeDeces: null,
        ageAnnees: 28,
        stade: "adulte",
        biographie: "Née au bord de l'eau.",
        motto: "Un pas après l'autre.",
        personnalite: {},
        valeurs: ["famille"],
        traits: ["calme"],
        apparence: {},
        sante: 100,
        besoins: {
          faim: 50,
          soif: 60,
          sommeil: 70,
          chaleur: 80,
          securite: 90,
          social: 40,
          moral: 55,
        },
        inventaire: { ressources: {}, objets: [], capacite: 12 },
        competences: {},
        relations: [],
        intention: "manger",
        action: null,
        plan: [],
        projet: null,
        pensee: "…",
        penseeDeClaude: false,
        souvenirsRecents: [
          { tick: 9, type: "action", texte: "J'ai récolté des baies.", importance: 2 },
        ],
        souvenirsMarquants: [],
        famille: { parents: [], partenaire: null, enfants: [], fratrie: [] },
        reputation: 0,
        enceinte: null,
        lieuxConnus: 3,
        nombreSouvenirs: 1,
        savoirs: [],
      },
      20,
    );
    let appels = 0;
    const envoyees: Inspiration[] = [];
    const cerveau = new CerveauClaude(
      magasin,
      (i) => envoyees.push(i),
      () =>
        Promise.resolve(() => {
          appels += 1;
          return Promise.resolve({ text: '{"pensee": "Des baies, encore des baies."}' });
        }),
      () => undefined,
      { intervalleMs: 1000 },
    );
    cerveau.activer();
    await cerveau.tick(2000);
    expect(appels).toBe(1);
    expect(envoyees[0]).toMatchObject({ genre: "pensee", personnageId: "p-1" });
    await cerveau.tick(2500); // trop tôt, même intention : rien
    await cerveau.tick(3100);
    expect(appels).toBe(1);
    await cerveau.tick(5100); // au bout de trois intervalles, on rafraîchit
    expect(appels).toBe(2);
  });

  it("se désactive quand Claude n'est pas disponible", async () => {
    const magasin = new Magasin();
    magasin.recevoir(init, 0);
    magasin.recevoir(
      etat(
        [personnage("p-1", false)],
        [
          {
            tick: 10,
            type: "deces",
            acteur: "p-1",
            position: null,
            importance: 10,
            details: { cause: "faim" },
          },
        ],
      ),
      10,
    );
    const statuts: string[] = [];
    const cerveau = new CerveauClaude(
      magasin,
      () => undefined,
      () => Promise.resolve(null),
      (t) => statuts.push(t),
    );
    cerveau.activer();
    magasin.recevoir(
      etat(
        [personnage("p-1", false)],
        [
          {
            tick: 11,
            type: "deces",
            acteur: "p-1",
            position: null,
            importance: 10,
            details: { cause: "faim" },
          },
        ],
      ),
      20,
    );
    await cerveau.tick(100_000);
    expect(cerveau.estActif).toBe(false);
    expect(statuts.at(-1)).toContain("pas disponible");
  });
});
