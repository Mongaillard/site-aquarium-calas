import { describe, expect, it } from "vitest";
import { executerTick } from "../src/actions/executeur.js";
import { planifier } from "../src/actions/planificateur.js";
import { ajouter, ajouterObjet, quantite } from "../src/agents/inventaire.js";
import type { Personnage } from "../src/agents/personnage.js";
import { observer } from "../src/cerveau/perception.js";
import { PLANS_BATIMENT, materiauxManquants } from "../src/monde/batiments.js";
import { abriDisponible, autorise, prochainBatimentNecessaire } from "../src/monde.js";
import { Simulation } from "../src/simulation.js";
import { gisementBaies, gisementBois, grilleUniforme } from "./utils.js";

/** Monde 24×24 : eau en x = 0, une famille de 2 (p-0001, p-0002) et un étranger (p-0003). */
function scenario(): { sim: Simulation; a: Personnage; b: Personnage; etranger: Personnage } {
  const eau = Array.from({ length: 24 }, (_, y) => ({
    x: 0,
    y,
    biome: "eau_peu_profonde" as const,
  }));
  const grille = grilleUniforme(24, 24, "prairie", [
    ...eau,
    { x: 12, y: 4, gisement: gisementBaies(6) },
    { x: 14, y: 4, gisement: gisementBois(20) },
  ]);
  const sim = Simulation.creerAvecGrille(
    { seed: 11, population: { initiale: 3, familles: 2 } },
    grille,
  );
  const [a, b, etranger] = sim.personnages;
  if (!a || !b || !etranger) throw new Error("population incomplète");
  // Population : familles[i % 2] → p-0001 et p-0003 partagent un nom ; on force explicitement.
  const forcer = (p: Personnage, nom: string): void => {
    (p.identite as { nomFamille: string }).nomFamille = nom;
  };
  forcer(a, "Aubrac");
  forcer(b, "Aubrac");
  forcer(etranger, "Weber");
  a.corps.position = { x: 10, y: 10 };
  b.corps.position = { x: 11, y: 10 };
  etranger.corps.position = { x: 20, y: 20 };
  for (const p of sim.personnages) {
    p.connaissance.clear();
    p.relations.clear();
  }
  return { sim, a, b, etranger };
}

function executerPlan(sim: Simulation, p: Personnage, maxTicks = 400): string {
  for (let i = 0; i < maxTicks; i++) {
    const action = p.plan[0];
    if (action === undefined) return "terminee";
    const r = executerTick(sim, p, action);
    if (r.statut === "echec") return r.raison;
    if (r.statut === "terminee") p.plan.shift();
  }
  return "timeout";
}

function planifierEtExecuter(
  sim: Simulation,
  p: Personnage,
  intention: Parameters<typeof planifier>[2],
): string {
  const r = planifier(sim, p, intention);
  if (!r.ok) return `plan: ${r.raison}`;
  p.plan = r.plan;
  return executerPlan(sim, p);
}

describe("chantiers et bâtiments", () => {
  it("fonder crée un chantier, propriétaire et famille autorisés, étranger non", () => {
    const { sim, a, b, etranger } = scenario();
    a.plan = [{ type: "fonder", batimentType: "abri", cible: { x: 10, y: 11 } }];
    expect(executerPlan(sim, a)).toBe("terminee");
    const chantier = [...sim.batiments.values()][0];
    if (!chantier) throw new Error("pas de chantier");
    expect(chantier.etat).toBe("chantier");
    expect(chantier.proprietaire).toBe(a.id);
    expect(a.projet?.batimentId).toBe(chantier.id);
    expect(sim.grille.tuile(10, 11).batiment?.id).toBe(chantier.id);
    expect(autorise(sim, chantier, a)).toBe(true);
    expect(autorise(sim, chantier, b)).toBe(true);
    expect(autorise(sim, chantier, etranger)).toBe(false);
    expect(sim.journal.compte("chantier_fonde")).toBe(1);
  });

  it("fonder refuse une tuile déjà bâtie ou portant un gisement", () => {
    const { sim, a } = scenario();
    a.corps.position = { x: 12, y: 5 };
    expect(
      executerTick(sim, a, { type: "fonder", batimentType: "abri", cible: { x: 12, y: 4 } }),
    ).toMatchObject({
      statut: "echec",
      raison: "un gisement occupe la tuile",
    });
    sim.fonderChantier("abri", { x: 12, y: 6 }, a);
    expect(
      executerTick(sim, a, { type: "fonder", batimentType: "abri", cible: { x: 12, y: 6 } }),
    ).toMatchObject({
      statut: "echec",
      raison: "tuile déjà occupée",
    });
  });

  it("deux membres d'une famille livrent et travaillent sur le même chantier", () => {
    const { sim, a, b } = scenario();
    const chantier = sim.fonderChantier("abri", { x: 10, y: 11 }, a);
    ajouter(a.corps.inventaire, "bois", 6);
    ajouter(b.corps.inventaire, "bois", 4);
    ajouter(b.corps.inventaire, "fibres", 4);

    a.plan = [{ type: "construire", batimentId: chantier.id, ticksTravail: 0 }];
    expect(executerPlan(sim, a)).toBe("terminee"); // a livre 6 bois, matériaux incomplets → terminé
    expect(materiauxManquants(chantier)).toEqual({ bois: 4, fibres: 4 });
    expect(quantite(a.corps.inventaire, "bois")).toBe(0);

    b.plan = [{ type: "construire", batimentId: chantier.id, ticksTravail: 0 }];
    expect(executerPlan(sim, b)).toBe("terminee"); // b complète puis travaille jusqu'au bout
    expect(chantier.etat).toBe("termine");
    expect(chantier.termineAuTick).not.toBeNull();
    expect(sim.journal.compte("batiment_termine")).toBe(1);
    expect(sim.journal.compte("livraison")).toBe(3);
    expect(a.projet).toBeNull();
    expect(b.experience.construction).toBeGreaterThan(0);
  });

  it("construire échoue sans matériaux à livrer, ou trop loin", () => {
    const { sim, a } = scenario();
    const chantier = sim.fonderChantier("abri", { x: 10, y: 11 }, a);
    expect(
      executerTick(sim, a, { type: "construire", batimentId: chantier.id, ticksTravail: 0 }),
    ).toMatchObject({
      statut: "echec",
      raison: "matériaux manquants",
    });
    a.corps.position = { x: 20, y: 20 };
    expect(
      executerTick(sim, a, { type: "construire", batimentId: chantier.id, ticksTravail: 0 }),
    ).toMatchObject({
      statut: "echec",
      raison: "chantier trop loin",
    });
  });

  it("un abri terminé accueille deux dormeurs autorisés, pas un troisième ni un étranger", () => {
    const { sim, a, b, etranger } = scenario();
    const abri = sim.fonderChantier("abri", { x: 10, y: 11 }, a);
    abri.etat = "termine";
    expect(abriDisponible(sim, a)?.id).toBe(abri.id);
    expect(abriDisponible(sim, etranger)).toBeNull();
    a.corps.position = { ...abri.position };
    a.corps.endormi = true;
    expect(abriDisponible(sim, b)?.id).toBe(abri.id);
    b.corps.position = { ...abri.position };
    b.corps.endormi = true;
    const c = sim.personnages[2];
    if (!c) throw new Error("pas de troisième");
    (c.identite as { nomFamille: string }).nomFamille = "Aubrac";
    expect(abriDisponible(sim, c)).toBeNull();
  });

  it("dormir à l'abri protège du froid et accélère la récupération", () => {
    const { sim, a, b } = scenario();
    const abri = sim.fonderChantier("abri", { x: 10, y: 11 }, a);
    abri.etat = "termine";
    a.corps.position = { ...abri.position };
    b.corps.position = { x: 15, y: 15 };
    for (const p of [a, b]) {
      p.besoins.sommeil = 30;
      p.besoins.chaleur = 60;
      sim.definirCerveau(p.id, { decider: () => ({ type: "dormir" }), urgence: () => null });
    }
    sim.horloge.avancer(22 * 6); // 22 h, printemps : nuit
    sim.avancer(24);
    expect(a.besoins.chaleur).toBeGreaterThan(b.besoins.chaleur);
    expect(a.besoins.sommeil).toBeGreaterThan(b.besoins.sommeil);
  });

  it("prochainBatimentNecessaire : abri pour tous, puis feu, puis stock, puis maison", () => {
    const { sim, a } = scenario();
    expect(prochainBatimentNecessaire(sim, a)).toBe("abri");
    const abri = sim.fonderChantier("abri", { x: 10, y: 11 }, a);
    expect(prochainBatimentNecessaire(sim, a)).toBe("feu_de_camp"); // 2 places pour 2 membres, chantier compris
    abri.etat = "termine";
    const feu = sim.fonderChantier("feu_de_camp", { x: 9, y: 11 }, a);
    feu.etat = "termine";
    feu.allume = true;
    feu.reserveBois = 12;
    expect(prochainBatimentNecessaire(sim, a)).toBe("entrepot");
    feu.allume = false;
    expect(prochainBatimentNecessaire(sim, a)).toBe("feu_de_camp");
    feu.allume = true;
    feu.reserveBois = 12;
    const entrepot = sim.fonderChantier("entrepot", { x: 8, y: 11 }, a);
    entrepot.etat = "termine";
    expect(prochainBatimentNecessaire(sim, a)).toBeNull(); // famille de 2 : pas de maison
  });

  it("stock : déposer puis prendre, refusé à un étranger", () => {
    const { sim, a, b, etranger } = scenario();
    const entrepot = sim.fonderChantier("entrepot", { x: 10, y: 11 }, a);
    entrepot.etat = "termine";
    ajouter(a.corps.inventaire, "pierre", 5);
    a.plan = [{ type: "deposer", batimentId: entrepot.id, ressource: "pierre", quantite: 5 }];
    expect(executerPlan(sim, a)).toBe("terminee");
    expect(quantite(entrepot.stock ?? a.corps.inventaire, "pierre")).toBe(5);
    b.corps.position = { x: 10, y: 12 };
    b.plan = [{ type: "prendre", batimentId: entrepot.id, ressource: "pierre", quantite: 2 }];
    expect(executerPlan(sim, b)).toBe("terminee");
    expect(quantite(b.corps.inventaire, "pierre")).toBe(2);
    etranger.corps.position = { x: 10, y: 12 };
    expect(
      executerTick(sim, etranger, {
        type: "prendre",
        batimentId: entrepot.id,
        ressource: "pierre",
        quantite: 1,
      }),
    ).toMatchObject({ statut: "echec", raison: "accès refusé" });
  });

  it("le planificateur de construction livre, s'approvisionne, puis travaille", () => {
    const { sim, a } = scenario();
    observer(sim, a, 8);
    // 1. Aucun projet : fondation d'un abri près de soi.
    let r = planifier(sim, a, { type: "construire" });
    expect(r.ok && r.plan.map((x) => x.type)).toContain("fonder");
    expect(planifierEtExecuter(sim, a, { type: "construire" })).toBe("terminee");
    expect(a.projet).not.toBeNull();
    // 2. Sans matériaux ni gisement connu de bois mort : approvisionnement impossible → échec explicite.
    r = planifier(sim, a, { type: "construire" });
    expect(r.ok).toBe(false);
    // 3. Avec les matériaux en poche : livraison + travail jusqu'au bout.
    ajouter(a.corps.inventaire, "bois", 10);
    ajouter(a.corps.inventaire, "fibres", 4);
    expect(planifierEtExecuter(sim, a, { type: "construire" })).toBe("terminee");
    const abri = [...sim.batiments.values()][0];
    expect(abri?.etat).toBe("termine");
  });

  it("les bâtiments s'usent chaque jour, davantage sous l'orage, et s'effondrent à zéro", () => {
    const { sim, a } = scenario();
    const abri = sim.fonderChantier("abri", { x: 10, y: 11 }, a);
    abri.etat = "termine";
    abri.solidite = 3;
    sim.avancerJusquaAube();
    sim.tick1(); // l'aube est traitée au premier tick du jour : usure de 0,5 (ou 3 sous orage)
    if (sim.batiments.has(abri.id)) {
      expect(abri.solidite).toBeLessThan(3);
      abri.solidite = 0.4;
      sim.avancerJusquaAube();
      sim.tick1();
    }
    expect(sim.batiments.has(abri.id)).toBe(false);
    expect(sim.grille.tuile(10, 11).batiment).toBeNull();
    expect(sim.journal.compte("batiment_effondre")).toBe(1);
  });

  it("un feu terminé est allumé, réchauffe à portée, s'éteint sous l'orage et se rallume avec du bois", () => {
    const { sim, a } = scenario();
    const feu = sim.fonderChantier("feu_de_camp", { x: 10, y: 11 }, a);
    ajouter(a.corps.inventaire, "bois", 6);
    a.plan = [{ type: "construire", batimentId: feu.id, ticksTravail: 0 }];
    expect(executerPlan(sim, a)).toBe("terminee");
    expect(feu.allume).toBe(true);
    expect(PLANS_BATIMENT.feu_de_camp.rayonChaleur).toBe(2);
    feu.allume = false;
    a.plan = [{ type: "construire", batimentId: feu.id, ticksTravail: 0 }];
    expect(executerPlan(sim, a)).toBe("terminee");
    expect(feu.allume).toBe(true);
    expect(quantite(a.corps.inventaire, "bois")).toBe(0);
    expect(sim.journal.compte("feu_rallume")).toBe(1);
  });
});

describe("fabrication", () => {
  it("fabrique une hache avec les ingrédients, puis récolte des arbres avec", () => {
    const { sim, a } = scenario();
    ajouter(a.corps.inventaire, "bois", 2);
    ajouter(a.corps.inventaire, "pierre", 3);
    ajouter(a.corps.inventaire, "fibres", 1);
    a.plan = [{ type: "fabriquer", recette: "hache_pierre", ticksRestants: null }];
    expect(executerPlan(sim, a)).toBe("terminee");
    expect(a.corps.inventaire.objets.map((o) => o.type)).toEqual(["hache_pierre"]);
    expect(quantite(a.corps.inventaire, "bois")).toBe(0);
    expect(sim.journal.compte("fabrication")).toBe(1);
    a.corps.position = { x: 14, y: 5 };
    a.plan = [{ type: "recolter", cible: { x: 14, y: 4 }, ticksRestants: null }];
    expect(executerPlan(sim, a)).toBe("terminee");
    expect(quantite(a.corps.inventaire, "bois")).toBe(2); // rendement ×2 avec la hache
    expect(a.corps.inventaire.objets[0]?.solidite).toBe(39);
  });

  it("refuse une recette sans ingrédients, sans niveau, ou sans atelier", () => {
    const { sim, a } = scenario();
    expect(
      executerTick(sim, a, { type: "fabriquer", recette: "hache_pierre", ticksRestants: null }),
    ).toMatchObject({
      statut: "echec",
      raison: "il manque bois",
    });
    ajouter(a.corps.inventaire, "fibres", 6);
    expect(
      executerTick(sim, a, { type: "fabriquer", recette: "pioche", ticksRestants: null }),
    ).toMatchObject({
      statut: "echec",
      raison: "niveau 2 requis en artisanat",
    });
    ajouter(a.corps.inventaire, "baies", 1);
    expect(
      executerTick(sim, a, { type: "fabriquer", recette: "repas_cuit", ticksRestants: null }),
    ).toMatchObject({
      statut: "echec",
      raison: "atelier requis : feu",
    });
  });

  it("cuisine près d'un feu allumé et le repas cuit nourrit davantage", () => {
    const { sim, a } = scenario();
    const feu = sim.fonderChantier("feu_de_camp", { x: 10, y: 11 }, a);
    feu.etat = "termine";
    feu.allume = true;
    feu.reserveBois = 12;
    ajouter(a.corps.inventaire, "baies", 1);
    a.plan = [{ type: "fabriquer", recette: "repas_cuit", ticksRestants: null }];
    expect(executerPlan(sim, a)).toBe("terminee");
    expect(quantite(a.corps.inventaire, "repas_cuit")).toBe(1);
    a.besoins.faim = 50;
    a.plan = [{ type: "manger", ressource: "repas_cuit", ticksRestants: null }];
    expect(executerPlan(sim, a)).toBe("terminee");
    expect(a.besoins.faim).toBe(75);
  });

  it("un outil s'use et casse", () => {
    const { sim, a } = scenario();
    ajouterObjet(a.corps.inventaire, { type: "hache_pierre", solidite: 1 });
    a.corps.position = { x: 14, y: 5 };
    a.plan = [{ type: "recolter", cible: { x: 14, y: 4 }, ticksRestants: null }];
    expect(executerPlan(sim, a)).toBe("terminee");
    expect(a.corps.inventaire.objets).toHaveLength(0);
    expect(sim.journal.compte("outil_casse")).toBe(1);
  });
});
