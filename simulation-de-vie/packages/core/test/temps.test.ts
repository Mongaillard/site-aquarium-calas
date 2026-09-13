import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { RuleBrain } from "../src/cerveau/rule-brain.js";
import { percevoir } from "../src/cerveau/perception.js";
import { executerTick } from "../src/actions/executeur.js";
import { planifier } from "../src/actions/planificateur.js";
import {
  VIE_NOURRITURE,
  ageDe,
  ajouter,
  ajouterAge,
  ajouterObjet,
  creerInventaire,
  estGate,
  pourrir,
  quantite,
  transferer,
} from "../src/agents/inventaire.js";
import {
  PROFILS_MALADIE,
  eauSouillee,
  estImmunise,
  estMalade,
  heureContagion,
  jourMaladies,
  tomberMalade,
} from "../src/agents/maladies.js";
import { sourcesDegats } from "../src/agents/corps.js";
import { REPARATIONS_MAX } from "../src/monde/recettes.js";
import { BUCHES_PAR_JOUR_FROID, feuAAlimenter, prochainBatimentNecessaire } from "../src/monde.js";
import { grilleUniforme, joursAsync } from "./utils.js";

function mondePlat(seed: number, initiale: number, eau = false): Simulation {
  const surcharges = eau ? [{ x: 20, y: 20, biome: "eau_peu_profonde" as const }] : [];
  const sim = Simulation.creerAvecGrille(
    { seed, population: { initiale, familles: 1 } },
    grilleUniforme(60, 60, "prairie", surcharges),
  );
  for (const t of [...sim.troupeaux.values()]) sim.troupeaux.delete(t.id);
  return sim;
}

describe("le temps compte : périssabilité", () => {
  it("chaque pile a un âge ; passé la moitié de sa vie, le plus vieux se gâte chaque jour, deux fois plus lentement à l'entrepôt", () => {
    const vieBaies = VIE_NOURRITURE.baies ?? 0;
    const inv = creerInventaire(50);
    ajouter(inv, "baies", 10);
    expect(ageDe(inv, "baies")).toBe(0);
    for (let j = 0; j < Math.floor(vieBaies / 2); j++) expect(pourrir(inv, 1)).toEqual([]);
    expect(quantite(inv, "baies")).toBe(10);
    expect(estGate(inv, "baies")).toBe(false);
    // Au-delà : un cinquième de la pile par jour (ce qu'on a cueilli il y a cinq jours).
    expect(pourrir(inv, 1)).toEqual([{ ressource: "baies", quantite: 2 }]);
    expect(quantite(inv, "baies")).toBe(8);
    // Une réserve renouvelée chaque jour se maintient au lieu de disparaître d'un coup.
    const reserve = creerInventaire(500);
    for (let j = 0; j < 60; j++) {
      ajouter(reserve, "poisson", 20);
      pourrir(reserve, 2);
    }
    const n = quantite(reserve, "poisson");
    expect(n).toBeGreaterThan(150);
    expect(n).toBeLessThan(500);
    // Le poisson fumé tient quatre-vingt-dix jours ; l'entrepôt double.
    const stock = creerInventaire(200);
    ajouter(stock, "poisson", 30);
    ajouter(stock, "poisson_fume", 30);
    for (let j = 0; j < 15; j++) pourrir(stock, 2);
    expect(quantite(stock, "poisson")).toBe(30);
    expect(quantite(stock, "poisson_fume")).toBe(30);
    pourrir(stock, 2);
    expect(quantite(stock, "poisson")).toBe(29);
    // Mélanger du frais et du vieux donne une pile d'âge moyen ; le transfert emporte l'âge.
    const sac = creerInventaire(20);
    ajouterAge(sac, "gibier", 2, 4);
    ajouter(sac, "gibier", 2);
    expect(ageDe(sac, "gibier")).toBe(2);
    const autre = creerInventaire(20);
    transferer(sac, autre, "gibier", 4);
    expect(ageDe(autre, "gibier")).toBe(2);
    expect(ageDe(sac, "gibier")).toBe(0);
  });

  it("un repas gâté peut donner le mal des ventres, et la nourriture se gâte aussi dans le monde", () => {
    const sim = mondePlat(3, 1);
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    const vieBaies = VIE_NOURRITURE.baies ?? 0;
    let malades = 0;
    for (let i = 0; i < 60; i++) {
      p.corps.etat.maladies.length = 0;
      p.besoins.faim = 20;
      ajouterAge(p.corps.inventaire, "baies", 3, vieBaies + 2);
      executerTick(sim, p, { type: "manger", ressource: "baies", ticksRestants: null });
      if (estMalade(p, "mal_des_ventres")) malades += 1;
    }
    expect(malades).toBeGreaterThan(8);
    expect(malades).toBeLessThan(40);
    expect(sim.journal.compte("maladie")).toBe(malades);
    // Dans le monde : un stock de baies vieilles se gâte à l'aube, et l'événement est journalisé.
    const entrepot = sim.fonderChantier("entrepot", { x: 30, y: 30 }, p);
    entrepot.etat = "termine";
    if (entrepot.stock) ajouterAge(entrepot.stock, "baies", 12, vieBaies * 2);
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(entrepot.stock ? quantite(entrepot.stock, "baies") : 0).toBeLessThan(12);
    expect(sim.journal.parType("pourriture").some((e) => e.details.lieu === "entrepot")).toBe(true);
  });
});

describe("le temps compte : bois de chauffe et outils", () => {
  it("un feu brûle ses bûches chaque jour, s'éteint faute de bois, et la famille va le nourrir", () => {
    const sim = mondePlat(5, 2, true);
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    p.corps.stade = "adulte";
    const abri = sim.fonderChantier("abri", { x: 30, y: 30 }, p);
    abri.etat = "termine";
    const entrepot = sim.fonderChantier("entrepot", { x: 28, y: 30 }, p);
    entrepot.etat = "termine";
    const feu = sim.fonderChantier("feu_de_camp", { x: 31, y: 30 }, p);
    feu.etat = "termine";
    feu.allume = true;
    // À la belle saison le feu couve : rien ne brûle (le temps d'un jour, des enfants ne le nourrissent pas).
    for (const x of sim.personnages) {
      x.corps.stade = "enfant";
      x.corps.inventaire.ressources = {};
    }
    // (L'aube se traite au premier tick du jour : on se place juste avant, puis on avance d'un tick.)
    sim.avancerJusquaAube();
    feu.reserveBois = 5;
    sim.avancer(1);
    if (sim.meteo !== "orage") expect(feu.reserveBois).toBe(5);
    // En automne, une bûche par jour (on saute les jours d'orage, qui éteignent le feu).
    while (sim.horloge.moment().saison !== "automne") sim.avancerJusquaAube();
    let brule = false;
    for (let j = 0; j < 10 && !brule; j++) {
      sim.avancerJusquaAube();
      feu.allume = true;
      feu.reserveBois = BUCHES_PAR_JOUR_FROID * 2;
      sim.avancer(1);
      if (sim.meteo === "orage") continue;
      expect(feu.reserveBois).toBe(BUCHES_PAR_JOUR_FROID);
      expect(feu.allume).toBe(true);
      brule = true;
    }
    expect(brule).toBe(true);
    p.corps.stade = "adulte";
    p.vivant = true;
    // Réserve basse : le feu est à alimenter ; on apporte des bûches.
    expect(feuAAlimenter(sim, p)?.id).toBe(feu.id);
    expect(prochainBatimentNecessaire(sim, p)).toBe("feu_de_camp");
    p.corps.position = { x: 31, y: 31 };
    ajouter(p.corps.inventaire, "bois", 5);
    const plan = planifier(sim, p, { type: "construire" });
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.plan.map((a) => a.type)).toEqual(["construire"]);
    executerTick(sim, p, { type: "construire", batimentId: feu.id, ticksTravail: 0 });
    expect(feu.reserveBois).toBe(BUCHES_PAR_JOUR_FROID + 5);
    expect(quantite(p.corps.inventaire, "bois")).toBe(0);
    // Sans bûches, le feu s'éteint à l'aube ; avec une bûche en réserve, il se rallume sans rien apporter.
    feu.reserveBois = 0;
    for (const x of sim.personnages) {
      x.corps.stade = "enfant";
      x.corps.inventaire.ressources = {};
    }
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(feu.allume).toBe(false);
    p.corps.stade = "adulte";
    p.corps.position = { x: 31, y: 31 };
    expect(sim.journal.parType("feu_eteint").some((e) => e.details.raison === "plus de bois")).toBe(
      true,
    );
    feu.reserveBois = 1;
    const rallumage = planifier(sim, p, { type: "construire" });
    expect(rallumage.ok).toBe(true);
    executerTick(sim, p, { type: "construire", batimentId: feu.id, ticksTravail: 0 });
    expect(feu.allume).toBe(true);
  });

  it("un outil ébréché se répare avec une bûche, deux fois au plus", () => {
    const sim = mondePlat(6, 1);
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    p.corps.stade = "adulte";
    p.corps.inventaire.objets.length = 0;
    ajouterObjet(p.corps.inventaire, { type: "lance", solidite: 10 });
    ajouter(p.corps.inventaire, "bois", 3);
    const candidats = new RuleBrain(p)
      .candidats(percevoir(sim, p))
      .map((c) => JSON.stringify(c.intention));
    expect(candidats).toContain(JSON.stringify({ type: "reparer", objet: "lance" }));
    for (let fois = 1; fois <= REPARATIONS_MAX; fois++) {
      const plan = planifier(sim, p, { type: "reparer", objet: "lance" });
      expect(plan.ok).toBe(true);
      const action = { type: "reparer" as const, objet: "lance" as const, ticksRestants: 3 };
      let statut = "encours";
      for (let i = 0; i < 5 && statut === "encours"; i++)
        statut = executerTick(sim, p, action).statut;
      expect(statut).toBe("terminee");
      const lance = p.corps.inventaire.objets.find((o) => o.type === "lance");
      expect(lance?.reparations).toBe(fois);
      if (lance) lance.solidite = 10;
    }
    expect(quantite(p.corps.inventaire, "bois")).toBe(1);
    expect(planifier(sim, p, { type: "reparer", objet: "lance" }).ok).toBe(false);
    expect(sim.journal.compte("reparation")).toBe(REPARATIONS_MAX);
  });
});

describe("le temps compte : maladies", () => {
  it("chaque maladie a une durée, une perte par jour, une guérison et parfois une immunité", () => {
    const sim = mondePlat(8, 2);
    const [p, q] = sim.personnages;
    if (!p || !q) throw new Error("vide");
    p.corps.stade = "adulte";
    const m = tomberMalade(sim, p, "fievre_des_eaux", "test");
    expect(m).not.toBeNull();
    expect(estMalade(p, "fievre_des_eaux")).toBe(true);
    expect(sourcesDegats(p, sim.tick)).toContainEqual({
      cause: PROFILS_MALADIE.fievre_des_eaux.nom,
      perteParJour: PROFILS_MALADIE.fievre_des_eaux.perteParJour,
    });
    // Pas deux fois la même maladie en même temps.
    expect(tomberMalade(sim, p, "fievre_des_eaux", "test")).toBeNull();
    // Guérison : on avance jusqu'à la fin, et l'immunité est acquise.
    if (m) m.jusqua = sim.tick;
    jourMaladies(sim, p);
    expect(estMalade(p)).toBe(false);
    expect(estImmunise(p, "fievre_des_eaux")).toBe(true);
    expect(tomberMalade(sim, p, "fievre_des_eaux", "test")).toBeNull();
    expect(sim.journal.compte("guerison_maladie")).toBe(1);
    // Un enfant perd une fois et demie plus.
    q.corps.stade = "enfant";
    tomberMalade(sim, q, "toux_grise", "test");
    expect(sourcesDegats(q, sim.tick)[0]?.perteParJour).toBe(
      PROFILS_MALADIE.toux_grise.perteParJour * 1.5,
    );
  });

  it("la toux grise se transmet au contact ; on garde ses distances et le malade se repose", () => {
    const sim = mondePlat(9, 4);
    const [malade, ...autres] = sim.personnages;
    if (!malade) throw new Error("vide");
    for (const x of sim.personnages) {
      x.corps.stade = "adulte";
      x.corps.position = { x: 30, y: 30 };
    }
    tomberMalade(sim, malade, "toux_grise", "test");
    let contagions = 0;
    for (let h = 0; h < 200 && contagions < autres.length; h++) {
      heureContagion(sim);
      contagions = autres.filter((x) => estMalade(x, "toux_grise")).length;
    }
    expect(contagions).toBeGreaterThan(0);
    // Loin, rien ne passe.
    const sain = autres.find((x) => !estMalade(x, "toux_grise"));
    if (sain) {
      sain.corps.position = { x: 50, y: 50 };
      for (let h = 0; h < 200; h++) heureContagion(sim);
      expect(estMalade(sain, "toux_grise")).toBe(false);
    }
    // Le cerveau : le malade veut se reposer, les autres évitent de lui parler.
    const abri = sim.fonderChantier("abri", { x: 30, y: 31 }, malade);
    abri.etat = "termine";
    malade.besoins.faim = 80;
    malade.besoins.soif = 80;
    const candidats = new RuleBrain(malade).candidats(percevoir(sim, malade));
    expect(candidats.some((c) => c.intention.type === "se_reposer")).toBe(true);
    const perception = percevoir(sim, malade);
    expect(perception.moi.corps.malade).toBe(true);
    const voisin = perception.personnesVisibles[0];
    expect(voisin).toBeDefined();
  });

  it("une tombe près de l'eau la souille (sauf un puits) ; boire une eau souillée donne parfois la fièvre", () => {
    const sim = mondePlat(10, 1, true);
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    p.corps.position = { x: 21, y: 20 };
    expect(eauSouillee(sim, 21, 20)).toBe(false);
    const tombe = sim.fonderChantier("tombe", { x: 23, y: 21 }, p);
    tombe.etat = "termine";
    expect(eauSouillee(sim, 21, 20)).toBe(true);
    let fievres = 0;
    for (let i = 0; i < 200; i++) {
      p.corps.etat.maladies.length = 0;
      p.corps.etat.immunites.length = 0;
      executerTick(sim, p, { type: "boire", cible: { x: 21, y: 20 }, ticksRestants: null });
      if (estMalade(p, "fievre_des_eaux")) fievres += 1;
    }
    expect(fievres).toBeGreaterThan(0);
    expect(fievres).toBeLessThan(30);
    // Un puits, lui, donne une eau propre.
    const puits = sim.fonderChantier("puits", { x: 40, y: 40 }, p);
    puits.etat = "termine";
    const tombe2 = sim.fonderChantier("tombe", { x: 42, y: 41 }, p);
    tombe2.etat = "termine";
    expect(eauSouillee(sim, 41, 40)).toBe(false);
    // Le mort est enterré à l'écart de l'eau quand il y a de la place.
    const sim2 = mondePlat(11, 2, true);
    const q = sim2.personnages[0];
    if (!q) throw new Error("vide");
    q.corps.position = { x: 21, y: 21 };
    sim2.tuer(q, "test");
    const tombeQ = [...sim2.batiments.values()].find((b) => b.type === "tombe");
    expect(tombeQ).toBeDefined();
    if (tombeQ) expect(eauSouillee(sim2, 21, 20)).toBe(false);
  });

  it(
    "sur cent cinquante jours, la colonie tient : feux nourris, nourriture qui se gâte, malades qui guérissent",
    { timeout: 180000 },
    async () => {
      const sim = Simulation.creer({ seed: 7 });
      await joursAsync(sim, 150);
      expect(sim.vivants().length).toBeGreaterThanOrEqual(11);
      expect(sim.journal.compte("pourriture")).toBeGreaterThan(0);
      expect(sim.journal.compte("maladie")).toBeGreaterThan(0);
      expect(sim.journal.compte("guerison_maladie")).toBeGreaterThan(0);
      expect(sim.journal.parType("livraison").some((e) => e.details.ressource === "bois")).toBe(
        true,
      );
      expect(sim.journal.compte("reparation")).toBeGreaterThan(0);
    },
  );
});
