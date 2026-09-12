import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { RuleBrain } from "../src/cerveau/rule-brain.js";
import { percevoir } from "../src/cerveau/perception.js";
import { composerDialogue } from "../src/social/dialogue.js";
import { executerTick } from "../src/actions/executeur.js";
import { trouverChemin } from "../src/actions/chemin.js";
import { ajouter, ajouterObjet, outilSatisfait } from "../src/agents/inventaire.js";
import { apprendre, connait, tirerLecons } from "../src/savoirs/lecons.js";
import { inventer } from "../src/savoirs/inventions.js";
import { membresFamille } from "../src/monde.js";
import { grilleUniforme } from "./utils.js";

function colonie(): Simulation {
  const sim = Simulation.creer({ seed: 11, population: { initiale: 6, familles: 2 } });
  sim.avancer(144);
  return sim;
}

describe("leçons tirées des décès", () => {
  it("l'autopsie déduit les bonnes leçons de la situation", () => {
    const sim = colonie();
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    const abri = sim.fonderChantier(
      "abri",
      { x: p.corps.position.x + 2, y: p.corps.position.y },
      p,
    );
    abri.etat = "termine";
    p.besoins.faim = 5;
    p.besoins.chaleur = 0;
    // Au printemps, on retient de rentrer ; en saison froide, aussi les provisions.
    expect(tirerLecons(sim, p, "froid")).toEqual(["rentrer_quand_on_gele"]);
    expect(tirerLecons(sim, p, "soif")).toEqual(["puits_pres_du_village"]);
    expect(tirerLecons(sim, p, "vieillesse")).toEqual([]);
  });

  it("à la mort, une tombe porte la morale et la famille retient la leçon", () => {
    const sim = colonie();
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    const abri = sim.fonderChantier(
      "abri",
      { x: p.corps.position.x + 2, y: p.corps.position.y },
      p,
    );
    abri.etat = "termine";
    p.besoins.chaleur = 0;
    const famille = membresFamille(sim, p).filter((m) => m.id !== p.id);
    expect(famille.length).toBeGreaterThan(0);
    for (const m of famille) expect(connait(m, "rentrer_quand_on_gele")).toBe(false);
    sim.tuer(p, "froid");
    const lecons = sim.journal.parType("lecon");
    expect(lecons).toHaveLength(1);
    expect(lecons[0]?.details.lecon).toBe("rentrer_quand_on_gele");
    expect(lecons[0]?.details.apprenants).toBeGreaterThan(0);
    for (const m of famille) {
      expect(connait(m, "rentrer_quand_on_gele")).toBe(true);
      expect(m.savoirs.get("rentrer_quand_on_gele")?.origine).toBe(p.identite.prenom);
      expect(m.memoire.tous().some((s) => s.texte.includes("m'a appris ceci"))).toBe(true);
    }
    const tombe = [...sim.batiments.values()].find((b) => b.type === "tombe");
    expect(tombe?.etat).toBe("termine");
    expect(tombe?.epitaphe).toContain("on rentre d'abord");
  });

  it("une leçon change les décisions : on rentre plus tôt et on fait des provisions dès l'été", () => {
    const sim = colonie();
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    const abri = sim.fonderChantier(
      "abri",
      { x: p.corps.position.x + 2, y: p.corps.position.y },
      p,
    );
    abri.etat = "termine";
    p.besoins.chaleur = 35;
    p.besoins.faim = 90;
    p.besoins.soif = 90;
    const cerveau = new RuleBrain(p);
    const avant = cerveau.urgence({
      moi: { besoins: p.besoins, nourritureEnPoche: false, savoirs: new Set() },
      abriDisponible: true,
      feuConnu: false,
    });
    expect(avant).toBeNull();
    apprendre(p, "rentrer_quand_on_gele", 1, "Ambre");
    const apres = cerveau.urgence({
      moi: {
        besoins: p.besoins,
        nourritureEnPoche: false,
        savoirs: new Set(["rentrer_quand_on_gele"]),
      },
      abriDisponible: true,
      feuConnu: false,
    });
    expect(apres).toEqual({ type: "se_rechauffer" });
  });

  it("un savoir se transmet par le dialogue, avec son origine", () => {
    const sim = colonie();
    const [a, b] = sim.personnages;
    if (!a || !b) throw new Error("vide");
    apprendre(a, "provisions_hiver", 1, "Timéo");
    b.corps.position = { ...a.corps.position };
    const d = composerDialogue(sim, a, b);
    const effet = d.effets.find((e) => e.type === "savoir");
    expect(effet).toMatchObject({
      type: "savoir",
      de: a.id,
      vers: b.id,
      savoir: "provisions_hiver",
    });
    expect(d.repliques.some((r) => r.texte.includes("Depuis la mort de Timéo"))).toBe(true);
    expect(d.sujet).toBe("savoir");
  });
});

describe("inspirations de Claude (M5)", () => {
  it("une pensée soufflée remplace la pensée des règles pendant un jour, un récit devient souvenir", () => {
    const sim = colonie();
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    expect(sim.inspirer({ genre: "pensee", personnageId: "inconnu", texte: "x" })).toBe(false);
    expect(sim.inspirer({ genre: "pensee", personnageId: p.id, texte: "   " })).toBe(false);
    expect(sim.inspirer({ genre: "pensee", personnageId: p.id, texte: "Le vent tourne." })).toBe(
      true,
    );
    expect(p.penseeClaude?.texte).toBe("Le vent tourne.");
    expect(sim.inspirer({ genre: "recit", personnageId: p.id, texte: "Une belle histoire." })).toBe(
      true,
    );
    expect(p.memoire.tous().some((s) => s.texte === "Une belle histoire.")).toBe(true);
    expect(sim.journal.compte("claude")).toBe(2);
  });

  it("une épitaphe soufflée s'inscrit sur la tombe et peut porter une leçon du catalogue", () => {
    const sim = colonie();
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    sim.tuer(p, "vieillesse");
    const tombe = [...sim.batiments.values()].find(
      (b) => b.type === "tombe" && b.proprietaire === p.id,
    );
    expect(tombe).toBeDefined();
    const famille = membresFamille(sim, p).filter((m) => m.id !== p.id);
    expect(
      sim.inspirer({
        genre: "epitaphe",
        personnageId: p.id,
        texte: "Ici repose une aînée qui nous a tout appris.",
        savoir: "provisions_hiver",
      }),
    ).toBe(true);
    expect(tombe?.epitaphe).toBe("Ici repose une aînée qui nous a tout appris.");
    for (const m of famille) expect(connait(m, "provisions_hiver")).toBe(true);
    expect(sim.journal.compte("lecon")).toBe(1);
    // Une leçon inconnue est ignorée sans erreur.
    expect(
      sim.inspirer({
        genre: "epitaphe",
        personnageId: p.id,
        texte: "Adieu.",
        savoir: "n_importe_quoi",
      }),
    ).toBe(true);
    expect(sim.journal.compte("lecon")).toBe(1);
  });
});

describe("inventions", () => {
  it("un besoin et de la curiosité donnent une idée, puis un prototype, puis un savoir partagé", () => {
    const sim = colonie();
    const p = sim.personnages.find((x) => x.corps.stade === "adulte");
    if (!p) throw new Error("vide");
    p.identite.personnalite.ouverture = 0.9;
    p.corps.inventaire.ressources = {};
    p.corps.inventaire.objets.length = 0;
    p.connaissance.clear(); // sans gibier connu, pas d'idée de piège : la faim mène au filet
    expect(ajouterObjet(p.corps.inventaire, { type: "canne_a_peche", solidite: 30 })).toBe(true);
    p.connaissance.set("poisson", {
      x: p.corps.position.x + 3,
      y: p.corps.position.y,
      type: "poisson",
      outilRequis: "canne_a_peche",
      quantiteVue: 5,
      tickVu: sim.tick,
    });
    p.drapeaux.faimMinDuJour = 10;
    let idee = null;
    for (let i = 0; i < 2000 && idee === null; i++) idee = inventer(sim, p);
    expect(idee).toBe("filet");
    expect(p.savoirs.get("filet")?.force).toBeCloseTo(0.6);
    expect(connait(p, "filet")).toBe(true);

    // Le cerveau veut réaliser son idée.
    const candidats = new RuleBrain(p)
      .candidats(percevoir(sim, p))
      .map((c) => JSON.stringify(c.intention));
    expect(candidats).toContain(JSON.stringify({ type: "fabriquer", recette: "filet" }));

    // Prototype : peut rater, finit par réussir ; la famille l'apprend.
    p.experience.artisanat = 200;
    let reussi = false;
    for (let essai = 0; essai < 20 && !reussi; essai++) {
      ajouter(p.corps.inventaire, "fibres", 6);
      ajouter(p.corps.inventaire, "bois", 1);
      const action = { type: "fabriquer" as const, recette: "filet" as const, ticksRestants: null };
      let statut = "encours";
      for (let i = 0; i < 40 && statut === "encours"; i++)
        statut = executerTick(sim, p, action).statut;
      expect(statut).toBe("terminee");
      reussi = (p.savoirs.get("filet")?.force ?? 0) >= 1;
    }
    expect(reussi).toBe(true);
    expect(sim.journal.compte("invention")).toBe(1);
    expect(outilSatisfait(p.corps.inventaire, "canne_a_peche")).toBe(true);
    for (const m of membresFamille(sim, p)) expect(connait(m, "filet")).toBe(true);
  });

  it("le piège remplace la lance et le filet remplace la canne", () => {
    const sim = colonie();
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    expect(outilSatisfait(p.corps.inventaire, "lance")).toBe(false);
    ajouterObjet(p.corps.inventaire, { type: "piege", solidite: 25 });
    expect(outilSatisfait(p.corps.inventaire, "lance")).toBe(true);
    expect(outilSatisfait(p.corps.inventaire, "canne_a_peche")).toBe(false);
    ajouterObjet(p.corps.inventaire, { type: "filet", solidite: 50 });
    expect(outilSatisfait(p.corps.inventaire, "canne_a_peche")).toBe(true);
    expect(outilSatisfait(p.corps.inventaire, null)).toBe(true);
  });

  it("une pirogue permet de traverser l'eau profonde", () => {
    const grille = grilleUniforme(12, 5, "prairie", [
      { x: 5, y: 0, biome: "eau_profonde" },
      { x: 5, y: 1, biome: "eau_profonde" },
      { x: 5, y: 2, biome: "eau_profonde" },
      { x: 5, y: 3, biome: "eau_profonde" },
      { x: 5, y: 4, biome: "eau_profonde" },
    ]);
    expect(trouverChemin(grille, { x: 1, y: 2 }, { x: 9, y: 2 })).toBeNull();
    const chemin = trouverChemin(grille, { x: 1, y: 2 }, { x: 9, y: 2 }, { traverseEau: true });
    expect(chemin).not.toBeNull();
    expect(chemin?.some((c) => c.x === 5)).toBe(true);
  });
});
