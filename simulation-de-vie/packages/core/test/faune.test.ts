import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { executerTick } from "../src/actions/executeur.js";
import { planifier } from "../src/actions/planificateur.js";
import { observer, percevoir } from "../src/cerveau/perception.js";
import { RuleBrain } from "../src/cerveau/rule-brain.js";
import { ajouterObjet, quantite } from "../src/agents/inventaire.js";
import { Grille } from "../src/monde/grille.js";
import {
  COTE_BASSIN,
  CROISSANCE_POISSON,
  FAMINE_MEUTE,
  IMMIGRATION_POISSON,
  JOURS_REPOUSSE_SOUCHE,
  PROFILS,
  RAYON_ACTIVITE,
  heureTroupeau,
  jourTroupeau,
  recensement,
} from "../src/monde/faune.js";
import type { Espece, Troupeau } from "../src/monde/faune.js";
import type { Position } from "../src/monde/grille.js";
import { grilleUniforme, joursAsync } from "./utils.js";

function seul(seed = 11): Simulation {
  return Simulation.creer({ seed, population: { initiale: 1, familles: 1 } });
}

function troupeau(sim: Simulation, espece: Espece, position: Position, taille: number): Troupeau {
  const id = `test-${espece}-${String(sim.troupeaux.size)}`;
  const t: Troupeau = {
    id,
    espece,
    position: { ...position },
    gite: { ...position },
    giteEte: { ...position },
    taille,
    mefiance: 0,
    etat: "pature",
    cible: null,
    faim: 0,
    derniereMiseBas: 0,
    proieHumaine: null,
    enMenace: false,
    rng: sim.rng.fork(id),
  };
  sim.troupeaux.set(id, t);
  return t;
}

describe("la faune : troupeaux mobiles", () => {
  it("un monde peuple ses morceaux de troupeaux, à l'identique pour une même graine", () => {
    const a = seul(42);
    const b = seul(42);
    expect(a.troupeaux.size).toBeGreaterThan(0);
    expect(recensement(a)).toEqual(recensement(b));
    for (const t of a.troupeaux.values()) {
      const tuile = a.grille.tuileOuNull(t.gite.x, t.gite.y);
      expect(tuile).not.toBeNull();
      if (tuile) expect(PROFILS[t.espece].biomes).toContain(tuile.biome);
      expect(t.taille).toBeGreaterThan(0);
    }
    // Plus de gibier immobile : les lieux de gibier viennent des bêtes aperçues.
    for (const tuile of a.grille.tuilesAvecGisement())
      expect(tuile.gisement?.type).not.toBe("gibier");
  });

  it("un troupeau pâture autour de son gîte, rentre la nuit, fuit l'humain et se fige loin de tous", () => {
    const sim = Simulation.creerAvecGrille(
      { seed: 3, population: { initiale: 1, familles: 1 } },
      grilleUniforme(80, 80, "prairie"),
    );
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    const t = troupeau(sim, "cerf", { x: 40, y: 40 }, 6);
    p.corps.position = { x: 60, y: 40 };
    // Une journée de pâture : le troupeau bouge mais reste dans le rayon du gîte.
    let bouge = false;
    for (let h = 0; h < 12; h++) {
      sim.avancer(6);
      heureTroupeau(sim, t);
      if (t.position.x !== 40 || t.position.y !== 40) bouge = true;
      expect(Grille.distance(t.position, t.gite)).toBeLessThanOrEqual(
        PROFILS.cerf.rayonPature + PROFILS.cerf.vitesse,
      );
    }
    expect(bouge).toBe(true);
    // La nuit, retour au gîte.
    while (!sim.horloge.moment().estNuit) sim.avancer(1);
    for (let h = 0; h < 12; h++) heureTroupeau(sim, t);
    expect(Grille.distance(t.position, t.gite)).toBeLessThanOrEqual(1);
    // Un humain tout près : fuite et méfiance.
    p.corps.position = { x: t.position.x + 1, y: t.position.y };
    const avant = { ...t.position };
    heureTroupeau(sim, t);
    expect(t.etat).toBe("fuite");
    expect(t.mefiance).toBeGreaterThan(0);
    expect(Grille.distance(t.position, p.corps.position)).toBeGreaterThan(
      Grille.distance(avant, p.corps.position),
    );
    // Loin de tout humain, le troupeau ne bouge plus.
    p.corps.position = { x: t.position.x + RAYON_ACTIVITE + 5, y: t.position.y };
    const fige = { ...t.position };
    for (let h = 0; h < 12; h++) heureTroupeau(sim, t);
    expect(t.position).toEqual(fige);
  });

  it("les bêtes aperçues deviennent des lieux de gibier ; le planificateur mène à portée puis chasse", () => {
    const sim = Simulation.creerAvecGrille(
      { seed: 5, population: { initiale: 1, familles: 1 } },
      grilleUniforme(60, 60, "prairie"),
    );
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    sim.avancer(60); // en plein jour, par temps clair, on voit à six tuiles
    sim.meteo = "clair";
    for (const t of [...sim.troupeaux.values()]) sim.troupeaux.delete(t.id);
    p.connaissance.clear();
    p.corps.position = { x: 10, y: 30 };
    const t = troupeau(sim, "cerf", { x: 16, y: 30 }, 5);
    ajouterObjet(p.corps.inventaire, { type: "lance", solidite: 30 });
    observer(sim, p, 8);
    const lieu = [...p.connaissance.values()].find((l) => l.type === "gibier");
    expect(lieu).toBeDefined();
    expect(lieu?.quantiteVue).toBe(5);
    expect(lieu?.outilRequis).toBe("lance");
    const perception = percevoir(sim, p);
    expect(perception.troupeauxVisibles[0]?.espece).toBe("cerf");
    const candidats = new RuleBrain(p)
      .candidats(perception)
      .map((c) => JSON.stringify(c.intention));
    expect(candidats).toContain(JSON.stringify({ type: "recolter", ressource: "gibier" }));
    const plan = planifier(sim, p, { type: "recolter", ressource: "gibier" });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const dernier = plan.plan[plan.plan.length - 1];
    expect(dernier?.type).toBe("chasser");
    const marche = plan.plan.find((a) => a.type === "deplacer");
    expect(marche).toBeDefined();
    if (marche?.type === "deplacer")
      expect(Grille.distance(marche.cible, t.position)).toBeLessThanOrEqual(2);
    // Sans troupeau près du lieu noté, le lieu est oublié.
    t.position = { x: 50, y: 50 };
    const plan2 = planifier(sim, p, { type: "recolter", ressource: "gibier" });
    expect(plan2.ok).toBe(false);
    expect([...p.connaissance.values()].some((l) => l.type === "gibier")).toBe(false);
  });

  it("seul on réussit trois fois sur dix, à plusieurs bien plus ; le troupeau fuit et se méfie, le sanglier blesse", () => {
    const sim = Simulation.creerAvecGrille(
      { seed: 9, population: { initiale: 3, familles: 1 } },
      grilleUniforme(40, 40, "prairie"),
    );
    const [p, r1, r2] = sim.personnages;
    if (!p || !r1 || !r2) throw new Error("vide");
    for (const t of [...sim.troupeaux.values()]) sim.troupeaux.delete(t.id);
    for (const x of [p, r1, r2]) {
      x.corps.stade = "adulte";
      ajouterObjet(x.corps.inventaire, { type: "lance", solidite: 1000 });
    }
    const essai = (rabatteurs: number, espece: Espece = "cerf"): boolean => {
      const t = troupeau(sim, espece, { x: 20, y: 20 }, 6);
      p.corps.position = { x: 18, y: 20 };
      r1.corps.position = rabatteurs >= 1 ? { x: 22, y: 20 } : { x: 2, y: 2 };
      r2.corps.position = rabatteurs >= 2 ? { x: 20, y: 22 } : { x: 2, y: 2 };
      r1.intention = rabatteurs >= 1 ? { type: "recolter", ressource: "gibier" } : null;
      r2.intention = rabatteurs >= 2 ? { type: "recolter", ressource: "gibier" } : null;
      p.corps.inventaire.ressources = {};
      p.experience.chasse = 0; // un chasseur qui ne progresse pas, pour mesurer la base
      const action = { type: "chasser" as const, troupeau: t.id, ticksRestants: 2 };
      let statut = "encours";
      for (let i = 0; i < 4 && statut === "encours"; i++)
        statut = executerTick(sim, p, action).statut;
      expect(statut).toBe("terminee");
      const reussie = quantite(p.corps.inventaire, "gibier") > 0;
      if (reussie) expect(t.taille).toBeLessThan(6);
      expect(t.etat).toBe("fuite");
      expect(t.mefiance).toBeGreaterThan(0);
      sim.troupeaux.delete(t.id);
      return reussie;
    };
    let seulOk = 0;
    for (let i = 0; i < 200; i++) if (essai(0)) seulOk += 1;
    let battueOk = 0;
    for (let i = 0; i < 200; i++) if (essai(2)) battueOk += 1;
    expect(seulOk / 200).toBeGreaterThan(0.2);
    expect(seulOk / 200).toBeLessThan(0.45);
    expect(battueOk / 200).toBeGreaterThan(0.6);
    expect(sim.journal.compte("chasse")).toBe(400);
    expect(sim.journal.parType("chasse").some((e) => Number(e.details.rabatteurs) === 2)).toBe(
      true,
    );
    // Le cerf rapporte du cuir ; le sanglier acculé mord parfois.
    expect(sim.journal.parType("chasse").some((e) => Number(e.details.cuir) > 0)).toBe(true);
    for (let i = 0; i < 80; i++) essai(0, "sanglier");
    expect(
      sim.journal.parType("blessure").some((e) => String(e.details.contexte).includes("sanglier")),
    ).toBe(true);
    expect(p.memoire.tous().some((s) => s.texte.includes("chassé"))).toBe(true);
  });
});

describe("la faune : forêt, pêche, calendrier et démographie", () => {
  it("une souche ne repousse qu'au bout de cent quatre-vingts jours", () => {
    const sim = seul(42);
    const arbre = [...sim.grille.tuilesAvecGisement()]
      .map((t) => t.gisement)
      .find((g) => g?.type === "bois" && g.outilRequis === "hache_pierre");
    if (!arbre) throw new Error("pas d'arbre");
    const T = sim.horloge.ticksParJour;
    arbre.quantite = 0;
    arbre.epuiseDepuis = sim.tick;
    for (let j = 0; j < 5; j++) sim.avancerJusquaAube();
    expect(arbre.quantite).toBe(0);
    arbre.epuiseDepuis = sim.tick - (JOURS_REPOUSSE_SOUCHE + 1) * T;
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(arbre.quantite).toBeGreaterThan(0);
    expect(arbre.epuiseDepuis).toBeNull();
  });

  it("les bancs de poissons croissent par bassin, et un bassin vidé se repeuple lentement", () => {
    const sim = seul(42);
    const bassins = new Map<string, { quantite: number; max: number }[]>();
    for (const t of sim.grille.tuilesAvecGisement()) {
      if (t.gisement?.type !== "poisson") continue;
      const cle = `${Math.floor(t.x / COTE_BASSIN)},${Math.floor(t.y / COTE_BASSIN)}`;
      const liste = bassins.get(cle) ?? [];
      liste.push(t.gisement);
      bassins.set(cle, liste);
    }
    const [plein, vide] = [...bassins.values()].filter((b) => b.length >= 3);
    if (!plein || !vide) throw new Error("pas assez de bassins");
    const somme = (b: { quantite: number }[]): number => b.reduce((s, g) => s + g.quantite, 0);
    const k = plein.reduce((s, g) => s + g.max, 0);
    for (const g of plein) g.quantite = g.max / 2;
    for (const g of vide) g.quantite = 0;
    // Aucun pêcheur : la seule variation vient de la croissance.
    const p = sim.personnages[0];
    if (p) p.corps.position = { x: 500, y: 500 };
    sim.avancerJusquaAube();
    sim.avancer(1); // l'aube elle-même : croissance des bassins
    const attendu = k / 2 + CROISSANCE_POISSON * (k / 2) * 0.5;
    expect(somme(plein)).toBeCloseTo(attendu, 3);
    expect(somme(vide)).toBeCloseTo(IMMIGRATION_POISSON, 3);
  });

  it("mises bas au printemps, mortalité d'hiver, migration, scission et meutes qui se nourrissent ou dépérissent", () => {
    const sim = Simulation.creerAvecGrille(
      { seed: 21, population: { initiale: 1, familles: 1 } },
      grilleUniforme(60, 60, "prairie", [
        { x: 30, y: 10, biome: "foret" },
        { x: 31, y: 10, biome: "foret" },
      ]),
    );
    for (const t of [...sim.troupeaux.values()]) sim.troupeaux.delete(t.id);
    const p = sim.personnages[0];
    if (p) p.corps.position = { x: 5, y: 55 };
    const id = (): string => `n${String(sim.troupeaux.size)}`;
    // Printemps, dixième jour : naissances.
    for (let j = 0; j < 9; j++) sim.avancerJusquaAube();
    expect(sim.horloge.moment()).toMatchObject({ saison: "printemps", jourDeSaison: 10 });
    const cerfs = troupeau(sim, "cerf", { x: 30, y: 30 }, 10);
    const r = jourTroupeau(sim, cerfs, id);
    expect(cerfs.taille).toBe(10 + Math.round(10 * PROFILS.cerf.naissances));
    expect(r.evenements.map((e) => e.genre)).toContain("naissances");
    // Un troupeau trop grand se scinde.
    cerfs.taille = PROFILS.cerf.tailleMax + 4;
    const s = jourTroupeau(sim, cerfs, id);
    expect(s.scission).not.toBeNull();
    expect(s.scission?.taille).toBe(Math.floor((PROFILS.cerf.tailleMax + 4) / 2));
    expect(s.evenements.map((e) => e.genre)).toContain("scission");
    // Une meute affamée prélève sur une proie voisine ; sans proie, elle dépérit.
    const loups = troupeau(sim, "loup", { x: 30, y: 32 }, 4);
    loups.faim = 3;
    let pris = 0;
    for (let j = 0; j < 30; j++) {
      const e = jourTroupeau(sim, loups, id).evenements;
      if (e.some((x) => x.genre === "meute")) pris += 1;
      if (loups.faim < 2) loups.faim = 3; // reste affamée pour le test
    }
    expect(pris).toBeGreaterThan(3);
    const solitaires = troupeau(sim, "loup", { x: 5, y: 5 }, 3);
    solitaires.faim = FAMINE_MEUTE;
    jourTroupeau(sim, solitaires, id);
    expect(solitaires.taille).toBe(2);
    // Hiver : migration vers la forêt le premier jour, puis mortalité.
    while (sim.horloge.moment().saison !== "hiver") sim.avancerJusquaAube();
    const lievres = troupeau(sim, "lievre", { x: 30, y: 20 }, PROFILS.lievre.tailleMax);
    const m = jourTroupeau(sim, lievres, id);
    expect(m.evenements.map((e) => e.genre)).toContain("migration");
    expect(lievres.gite).toEqual({ x: 30, y: 10 });
    let pertes = 0;
    for (let j = 0; j < 200; j++)
      for (const e of jourTroupeau(sim, lievres, id).evenements)
        if (e.genre === "hiver") pertes += e.nombre;
    expect(pertes).toBeGreaterThan(0);
    expect(lievres.taille).toBe(PROFILS.lievre.tailleMax - pertes);
  });

  it(
    "sur cent jours, la faune vit : naissances, meutes et chasses apparaissent dans le journal",
    { timeout: 120000 },
    async () => {
      const sim = Simulation.creer({ seed: 7 });
      await joursAsync(sim, 100);
      expect(sim.journal.compte("faune")).toBeGreaterThan(0);
      expect(sim.journal.compteDetail("faune:naissances")).toBeGreaterThan(0);
      expect(sim.journal.compte("chasse")).toBeGreaterThan(5);
      expect(sim.journal.compteDetail("chasse:reussie")).toBeGreaterThan(0);
      expect(recensement(sim).length).toBeGreaterThanOrEqual(3);
      expect(sim.vivants().length).toBeGreaterThanOrEqual(10);
    },
  );
});
