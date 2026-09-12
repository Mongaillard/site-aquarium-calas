import { describe, expect, it } from "vitest";
import { executerTick } from "../src/actions/executeur.js";
import { planifier } from "../src/actions/planificateur.js";
import { ajouter, quantite } from "../src/agents/inventaire.js";
import {
  GENES,
  esperanceDeVie,
  genomeAleatoire,
  heriter,
  phenotype,
  probabiliteMortNaturelle,
} from "../src/agents/genetique.js";
import { relationAvec, stadeDepuisAge } from "../src/agents/personnage.js";
import type { Personnage } from "../src/agents/personnage.js";
import { adopter, peutConcevoir, tickVieQuotidien } from "../src/agents/vie.js";
import { construireGenealogie, descendantsVivants } from "../src/genealogie.js";
import { abriDisponible, autorise } from "../src/monde.js";
import { Rng } from "../src/rng.js";
import { eligibles, partenaireDe, unir, veutCourtiser } from "../src/social/couple.js";
import { Simulation } from "../src/simulation.js";
import { observer, percevoir } from "../src/cerveau/perception.js";
import { RuleBrain } from "../src/cerveau/rule-brain.js";
import { grilleUniforme, joursAsync } from "./utils.js";

/** Monde 24×24 : deux familles, a (F) et b (M) de familles différentes, c (F) sœur de a. */
function scenario() {
  const eau = Array.from({ length: 24 }, (_, y) => ({
    x: 0,
    y,
    biome: "eau_peu_profonde" as const,
  }));
  const grille = grilleUniforme(24, 24, "prairie", eau);
  const sim = Simulation.creerAvecGrille(
    { seed: 31, population: { initiale: 3, familles: 2 } },
    grille,
  );
  const [a, b, c] = sim.personnages;
  if (!a || !b || !c) throw new Error("population incomplète");
  const forcer = (p: Personnage, nom: string, sexe: "F" | "M"): void => {
    (p.identite as { nomFamille: string; sexe: "F" | "M" }).nomFamille = nom;
    (p.identite as { sexe: "F" | "M" }).sexe = sexe;
  };
  forcer(a, "Aubrac", "F");
  forcer(b, "Weber", "M");
  forcer(c, "Aubrac", "F");
  for (const p of sim.personnages) {
    p.relations.clear();
    p.corps.ageJours = 25 * 120;
    p.corps.stade = "adulte";
    Object.assign(p.besoins, {
      faim: 90,
      soif: 90,
      sommeil: 90,
      chaleur: 100,
      securite: 80,
      social: 80,
      moral: 70,
    });
  }
  a.corps.position = { x: 10, y: 10 };
  b.corps.position = { x: 11, y: 10 };
  c.corps.position = { x: 20, y: 20 };
  return { sim, a, b, c };
}

function executerPlan(sim: Simulation, p: Personnage, maxTicks = 300): string {
  for (let i = 0; i < maxTicks; i++) {
    const action = p.plan[0];
    if (action === undefined) return "terminee";
    const r = executerTick(sim, p, action);
    if (r.statut === "echec") return r.raison;
    if (r.statut === "terminee") p.plan.shift();
  }
  return "timeout";
}

describe("génétique", () => {
  it("l'enfant hérite d'un allèle de chaque parent, mutations rares et bornées", () => {
    const rng = Rng.depuisGraine("gen");
    const mere = genomeAleatoire(rng);
    const pere = genomeAleatoire(rng);
    let mutations = 0;
    let total = 0;
    for (let i = 0; i < 200; i++) {
      const enfant = heriter(mere, pere, rng);
      for (const g of GENES) {
        const [am, ap] = enfant[g];
        expect(am).toBeGreaterThanOrEqual(0);
        expect(ap).toBeLessThanOrEqual(1);
        if (!mere[g].includes(am)) mutations++;
        if (!pere[g].includes(ap)) mutations++;
        total += 2;
      }
    }
    expect(mutations / total).toBeGreaterThan(0.02);
    expect(mutations / total).toBeLessThan(0.09);
  });

  it("est déterministe à graine égale", () => {
    const m = genomeAleatoire(Rng.depuisGraine(1));
    const p = genomeAleatoire(Rng.depuisGraine(2));
    expect(heriter(m, p, Rng.depuisGraine(3))).toEqual(heriter(m, p, Rng.depuisGraine(3)));
  });

  it("espérance de vie et mortalité naturelle", () => {
    const g = genomeAleatoire(Rng.depuisGraine(4));
    const e = esperanceDeVie(g);
    expect(e).toBeGreaterThanOrEqual(55);
    expect(e).toBeLessThanOrEqual(85);
    expect(probabiliteMortNaturelle(30, g, 55)).toBe(0);
    expect(probabiliteMortNaturelle(60, g, 55)).toBeGreaterThan(0);
    expect(probabiliteMortNaturelle(e + 5, g, 55)).toBeGreaterThan(
      probabiliteMortNaturelle(60, g, 55),
    );
    expect(phenotype(g, "force")).toBeCloseTo((g.force[0] + g.force[1]) / 2);
  });
});

describe("couples", () => {
  it("éligibilité : sexes opposés, adultes, non apparentés, libres", () => {
    const { sim, a, b, c } = scenario();
    expect(eligibles(sim, a, b)).toBe(true);
    expect(eligibles(sim, a, c)).toBe(false); // même sexe
    (c.identite as { sexe: "F" | "M" }).sexe = "M";
    expect(eligibles(sim, a, c)).toBe(false); // même famille initiale
    b.corps.stade = "adolescent";
    expect(eligibles(sim, a, b)).toBe(false);
    b.corps.stade = "adulte";
    unir(a, b, 0);
    expect(eligibles(sim, c, a)).toBe(false); // a n'est plus libre (monogamie)
    expect(partenaireDe(sim, a)?.id).toBe(b.id);
  });

  it("les dialogues font croître l'attirance entre personnes éligibles, pas en famille", () => {
    const { sim, a, b, c } = scenario();
    c.corps.position = { x: 12, y: 10 };
    a.plan = [{ type: "parler", cible: b.id, ticksRestants: null }];
    expect(executerPlan(sim, a)).toBe("terminee");
    expect(relationAvec(a, b.id).attirance).toBeGreaterThan(0);
    expect(relationAvec(b, a.id).attirance).toBeGreaterThan(0);
    a.plan = [{ type: "parler", cible: c.id, ticksRestants: null }];
    expect(executerPlan(sim, a)).toBe("terminee");
    expect(relationAvec(a, c.id).attirance).toBe(0);
  });

  it("trois cours réussies scellent l'union", () => {
    const { sim, a, b } = scenario();
    const ra = relationAvec(a, b.id);
    const rb = relationAvec(b, a.id);
    ra.attirance = 80;
    ra.affinite = 60;
    rb.attirance = 80;
    rb.affinite = 60;
    expect(veutCourtiser(sim, a, b)).toBe(true);
    (b.identite.personnalite as { extraversion: number }).extraversion = 1;
    let unions = 0;
    for (let i = 0; i < 12 && unions === 0; i++) {
      a.plan = [{ type: "courtiser", cible: b.id, ticksRestants: null }];
      executerPlan(sim, a);
      unions = sim.journal.compte("union");
    }
    expect(unions).toBe(1);
    expect(ra.lien).toBe("partenaire");
    expect(rb.lien).toBe("partenaire");
    expect(sim.journal.compte("cour")).toBeGreaterThanOrEqual(3);
    // Un partenaire est apparenté : il accède aux bâtiments de l'autre.
    const abri = sim.fonderChantier("abri", { x: 10, y: 11 }, a);
    expect(autorise(sim, abri, b)).toBe(true);
  });
});

describe("reproduction et naissance", () => {
  function couple() {
    const s = scenario();
    unir(s.a, s.b, 0);
    const abri = s.sim.fonderChantier("abri", { x: 10, y: 11 }, s.a);
    abri.etat = "termine";
    return { ...s, abri };
  }

  it("se_reproduire exige l'abri, le couple et la forme", () => {
    const { sim, a, b, abri } = couple();
    expect(
      executerTick(sim, a, { type: "se_reproduire", partenaire: b.id, ticksRestants: null }),
    ).toMatchObject({
      statut: "echec",
      raison: "pas à l'abri",
    });
    a.corps.position = { ...abri.position };
    b.corps.position = { x: 11, y: 11 };
    a.besoins.faim = 20;
    expect(
      executerTick(sim, a, { type: "se_reproduire", partenaire: b.id, ticksRestants: null }),
    ).toMatchObject({
      statut: "echec",
      raison: "pas en état",
    });
    a.besoins.faim = 90;
    (sim.config.vie as { probabiliteGrossesse: number }).probabiliteGrossesse = 1;
    a.plan = [{ type: "se_reproduire", partenaire: b.id, ticksRestants: null }];
    expect(executerPlan(sim, a)).toBe("terminee");
    expect(a.corps.enceinte?.pere).toBe(b.id);
    expect(sim.journal.compte("grossesse")).toBe(1);
    expect(peutConcevoir(sim, a)).toBe(false);
  });

  it("le planificateur amène les deux partenaires à l'abri", () => {
    const { sim, a, b, abri } = couple();
    relationAvec(b, a.id).attirance = 80;
    const r = planifier(sim, a, { type: "se_reproduire" });
    expect(r.ok && r.plan.map((x) => x.type)).toEqual(["deplacer", "attendre", "se_reproduire"]);
    expect(b.plan.map((x) => x.type)).toEqual(["deplacer", "attendre"]);
    expect(b.plan[0]?.type === "deplacer" && b.plan[0].cible).toEqual(abri.position);
  });

  it("au terme, un enfant naît avec ses parents, son nom, ses liens et un génome hérité", () => {
    const { sim, a, b } = couple();
    a.corps.enceinte = { depuisTick: sim.tick, pere: b.id };
    // Monde sans nourriture : on immobilise les cerveaux et on entretient les besoins à la main.
    for (const p of sim.personnages) {
      sim.definirCerveau(p.id, {
        decider: () => ({ type: "attendre", ticks: 50 }),
        urgence: () => null,
      });
    }
    for (let j = 0; j < sim.config.vie.gestationJours + 1; j++) {
      for (const p of sim.personnages)
        Object.assign(p.besoins, { faim: 90, soif: 90, sommeil: 90, chaleur: 90 });
      sim.avancerJusquaAube();
      sim.tick1();
    }
    expect(sim.journal.compte("naissance")).toBe(1);
    const enfant = sim.personnages[3];
    if (!enfant) throw new Error("pas d'enfant");
    expect(enfant.identite.parents).toEqual([a.id, b.id]);
    expect(enfant.identite.nomFamille).toBe(b.identite.nomFamille); // coutume : père
    expect(enfant.corps.stade).toBe("enfant");
    expect(enfant.corps.ageJours).toBeLessThan(3);
    expect(relationAvec(a, enfant.id).lien).toBe("enfant");
    expect(relationAvec(enfant, b.id).lien).toBe("parent");
    for (const g of GENES) {
      const [am, ap] = enfant.identite.genome[g];
      expect(
        Math.abs(am - Math.min(...a.identite.genome[g])) < 0.5 ||
          Math.abs(am - Math.max(...a.identite.genome[g])) < 0.5,
      ).toBe(true);
      expect(Number.isFinite(ap)).toBe(true);
    }
    expect(a.corps.enceinte).toBeNull();
    expect(a.corps.dernierAccouchement).not.toBeNull();
    expect(
      b.memoire.tous().some((s) => s.importance === 10 && s.texte.includes(enfant.identite.prenom)),
    ).toBe(true);
    expect(sim.prenomsUtilises().size).toBe(4);
  });

  it("un enfant ne récolte pas et demande à ses parents", () => {
    const { sim, a, b } = scenario();
    const enfant = sim.naitre(a, b);
    expect(
      executerTick(sim, enfant, { type: "recolter", cible: { x: 5, y: 5 }, ticksRestants: null }),
    ).toMatchObject({
      statut: "echec",
    });
    expect(planifier(sim, enfant, { type: "manger" })).toMatchObject({ ok: false }); // personne n'a rien
    ajouter(a.corps.inventaire, "baies", 3);
    const r = planifier(sim, enfant, { type: "manger" });
    expect(r.ok && r.plan.map((x) => x.type)).toEqual(["demander"]);
    enfant.plan = [{ type: "demander", cible: a.id, ressource: "baies", quantite: 2 }];
    expect(executerPlan(sim, enfant)).toBe("terminee"); // un parent ne refuse (presque) jamais
    expect(quantite(enfant.corps.inventaire, "baies")).toBe(2);
  });
});

describe("vieillesse, héritage, adoption", () => {
  it("les stades suivent l'âge", () => {
    expect(stadeDepuisAge(5 * 120, 120, 16, 55)).toBe("enfant");
    expect(stadeDepuisAge(13 * 120, 120, 16, 55)).toBe("adolescent");
    expect(stadeDepuisAge(30 * 120, 120, 16, 55)).toBe("adulte");
    expect(stadeDepuisAge(60 * 120, 120, 16, 55)).toBe("ancien");
  });

  it("le passage quotidien change de stade, journalise, et finit par la mort de vieillesse", () => {
    const { sim, a } = scenario();
    a.corps.ageJours = 16 * 120 - 1;
    a.corps.stade = "adolescent";
    a.corps.ageJours += 1;
    tickVieQuotidien(sim, a);
    expect(a.corps.stade).toBe("adulte");
    expect(sim.journal.compte("stade")).toBe(1);
    a.corps.ageJours = 120 * 120; // 120 ans : mort quasi certaine
    let jours = 0;
    while (a.vivant && jours < 400) {
      tickVieQuotidien(sim, a);
      jours++;
    }
    expect(a.vivant).toBe(false);
    expect(a.causeDeces).toBe("vieillesse");
  });

  it("à la mort, le partenaire hérite des biens et des bâtiments, les proches portent le deuil", () => {
    const { sim, a, b, c } = scenario();
    unir(a, b, 0);
    c.relations.set(a.id, { ...relationAvec(c, a.id), lien: "fratrie" });
    ajouter(a.corps.inventaire, "pierre", 4);
    const abri = sim.fonderChantier("abri", { x: 10, y: 11 }, a);
    const moralAvant = b.besoins.moral;
    sim.tuer(a, "test");
    expect(quantite(b.corps.inventaire, "pierre")).toBe(4);
    expect(abri.proprietaire).toBe(b.id);
    expect(b.besoins.moral).toBeLessThan(moralAvant);
    expect(c.memoire.tous().some((s) => s.importance === 10 && s.texte.includes("sœur"))).toBe(
      true,
    );
    expect(relationAvec(b, a.id).lien).toBe("connaissance"); // union rompue
    expect(sim.journal.compte("heritage")).toBe(1);
  });

  it("un orphelin est adopté par l'adulte qui l'aime le plus", () => {
    const { sim, a, b, c } = scenario();
    const enfant = sim.naitre(a, b);
    relationAvec(c, enfant.id).affinite = 50;
    sim.tuer(a, "test");
    expect(adopter(sim, enfant)).toBeNull(); // le père vit encore
    sim.tuer(b, "test");
    expect(relationAvec(c, enfant.id).lien).toBe("enfant");
    expect(relationAvec(enfant, c.id).lien).toBe("parent");
    expect(sim.journal.compte("adoption")).toBe(1);
  });

  it("la généalogie compte les générations et les descendants", () => {
    const { sim, a, b } = scenario();
    const enfant = sim.naitre(a, b);
    const g = construireGenealogie(sim.personnages);
    expect(g.generations).toBe(2);
    const noeud = g.personnes.find((n) => n.id === enfant.id);
    expect(noeud?.generation).toBe(1);
    expect(g.personnes.find((n) => n.id === a.id)?.enfants).toEqual([enfant.id]);
    expect(descendantsVivants(sim.personnages, a.id).map((p) => p.id)).toEqual([enfant.id]);
  });
});

describe("hiver : chaleur, pêche et provisions", () => {
  it("se réchauffer préfère l'abri au feu en plein vent", () => {
    const { sim, a } = scenario();
    const feu = sim.fonderChantier("feu_de_camp", { x: 15, y: 10 }, a);
    feu.etat = "termine";
    feu.allume = true;
    feu.reserveBois = 12;
    const abri = sim.fonderChantier("abri", { x: 8, y: 10 }, a);
    abri.etat = "termine";
    const r = planifier(sim, a, { type: "se_rechauffer" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan[0]?.type === "deplacer" && r.plan[0].cible).toEqual(abri.position);
    expect(r.plan[1]?.type).toBe("se_rechauffer");
    // Sans abri : le feu.
    sim.detruireBatiment(abri.id);
    const r2 = planifier(sim, a, { type: "se_rechauffer" });
    expect(r2.ok && r2.plan[0]?.type === "deplacer" && Math.abs(r2.plan[0].cible.x - 15) <= 1).toBe(
      true,
    );
  });

  it("l'action se_rechauffer échoue loin de toute chaleur et se termine une fois réchauffé", () => {
    const { sim, a } = scenario();
    expect(executerTick(sim, a, { type: "se_rechauffer", ticksRestants: 5 })).toMatchObject({
      statut: "echec",
    });
    const abri = sim.fonderChantier("abri", { x: 10, y: 10 }, a);
    abri.etat = "termine";
    a.besoins.chaleur = 90;
    expect(executerTick(sim, a, { type: "se_rechauffer", ticksRestants: 5 })).toEqual({
      statut: "terminee",
    });
  });

  it("un enfant a toujours une place à l'abri familial", () => {
    const { sim, a, b } = scenario();
    unir(a, b, 0);
    const enfant = sim.naitre(a, b);
    const abri = sim.fonderChantier("abri", { x: 10, y: 11 }, a);
    abri.etat = "termine";
    a.corps.position = { ...abri.position };
    b.corps.position = { ...abri.position };
    a.corps.endormi = true;
    b.corps.endormi = true;
    expect(abriDisponible(sim, enfant)?.id).toBe(abri.id);
  });

  it("le cerveau à règles fabrique une canne quand il connaît un banc de poissons", () => {
    const eau = Array.from({ length: 24 }, (_, y) => ({
      x: 0,
      y,
      biome: "eau_peu_profonde" as const,
    }));
    const grille = grilleUniforme(24, 24, "prairie", [
      ...eau,
      {
        x: 0,
        y: 5,
        biome: "eau_peu_profonde",
        gisement: {
          type: "poisson",
          quantite: 10,
          max: 10,
          tauxRegen: 1,
          outilRequis: "canne_a_peche",
        },
      },
    ]);
    const sim = Simulation.creerAvecGrille(
      { seed: 3, population: { initiale: 1, familles: 1 } },
      grille,
    );
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    p.corps.position = { x: 2, y: 5 };
    p.connaissance.clear();
    observer(sim, p, 3);
    const types = new RuleBrain(p)
      .candidats(percevoir(sim, p))
      .map((c) => JSON.stringify(c.intention));
    expect(types).toContain(JSON.stringify({ type: "fabriquer", recette: "canne_a_peche" }));
  });

  it("M4 : la colonie passe l'hiver (120 jours) avec des naissances et sans effondrement", async () => {
    const sim = Simulation.creer({ seed: 42 });
    await joursAsync(sim, 120);
    expect(sim.horloge.moment().saison).toBe("printemps");
    expect(sim.statistiques().vivants).toBeGreaterThanOrEqual(12);
    expect(sim.journal.compte("naissance")).toBeGreaterThanOrEqual(3);
    expect(
      sim.journal.parType("recolte").filter((e) => e.details.ressource === "poisson").length,
    ).toBeGreaterThan(50);
    expect(
      sim.journal.parType("intention").filter((e) => e.details.intention === "se_rechauffer")
        .length,
    ).toBeGreaterThan(20);
  }, 180_000);
});
