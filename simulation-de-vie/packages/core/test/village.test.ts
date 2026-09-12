import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { RuleBrain } from "../src/cerveau/rule-brain.js";
import { percevoir } from "../src/cerveau/perception.js";
import { executerTick } from "../src/actions/executeur.js";
import { planifier } from "../src/actions/planificateur.js";
import { ajouter, ajouterObjet, quantite } from "../src/agents/inventaire.js";
import { prochainBatimentNecessaire } from "../src/monde.js";
import {
  AGE_ADULTE_BETAIL,
  DOCILITE,
  JOURS_PAR_STADE,
  RENDEMENT_CHAMP,
  betesDe,
  enclosDe,
  jourBete,
  jourChamp,
  rendement,
  semer,
  tenterCapture,
  titre,
} from "../src/monde/village.js";
import type { Bete } from "../src/monde/village.js";
import type { Troupeau } from "../src/monde/faune.js";
import { grilleUniforme, joursAsync } from "./utils.js";

function mondePlat(seed: number, initiale: number): Simulation {
  const sim = Simulation.creerAvecGrille(
    { seed, population: { initiale, familles: 1 } },
    grilleUniforme(60, 60, "prairie", [{ x: 20, y: 20, biome: "eau_peu_profonde" }]),
  );
  for (const t of [...sim.troupeaux.values()]) sim.troupeaux.delete(t.id);
  return sim;
}

function troupeau(sim: Simulation, espece: Troupeau["espece"], x: number, y: number): Troupeau {
  const id = `test-${espece}`;
  const t: Troupeau = {
    id,
    espece,
    position: { x, y },
    gite: { x, y },
    giteEte: { x, y },
    taille: 5,
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

describe("le village apprivoise : capture et élevage", () => {
  it("après une chasse, avec une corde, un mouflon se laisse parfois ramener ; jamais un cerf", () => {
    const sim = mondePlat(3, 2);
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    p.corps.stade = "adulte";
    let captures = 0;
    for (let i = 0; i < 100; i++) {
      p.corps.inventaire.ressources = { corde: 1 };
      const bete = tenterCapture(
        p,
        "mouflon",
        sim.rng.fork(`c${String(i)}`),
        () => `b${String(i)}`,
      );
      if (bete !== null) {
        captures += 1;
        expect(bete.famille).toBe(p.identite.nomFamille);
        expect(bete.docilite).toBeCloseTo(DOCILITE.mouflon * 0.6, 5);
        expect(quantite(p.corps.inventaire, "corde")).toBe(0); // la corde a servi
      }
    }
    expect(captures).toBeGreaterThan(30);
    expect(captures).toBeLessThan(85);
    p.corps.inventaire.ressources = { corde: 1 };
    expect(tenterCapture(p, "cerf", sim.rng.fork("cerf"), () => "x")).toBeNull();
    p.corps.inventaire.ressources = {};
    expect(tenterCapture(p, "mouflon", sim.rng.fork("sans"), () => "x")).toBeNull();
    // Par la chasse elle-même : l'événement `capture` et la bête dans le monde.
    const t = troupeau(sim, "mouflon", 31, 30);
    ajouterObjet(p.corps.inventaire, { type: "lance", solidite: 1000 });
    p.corps.position = { x: 30, y: 30 };
    p.experience.chasse = 1000; // un chasseur sûr, pour que la prise vienne vite
    let vu = false;
    for (let i = 0; i < 60 && !vu; i++) {
      p.corps.inventaire.ressources = { corde: 1 };
      t.taille = 5;
      t.mefiance = 0;
      t.position = { x: 31, y: 30 };
      const action = { type: "chasser" as const, troupeau: t.id, ticksRestants: 1 };
      executerTick(sim, p, action);
      executerTick(sim, p, action);
      vu = sim.journal.compte("capture") > 0;
    }
    expect(vu).toBe(true);
    expect(sim.betail.size).toBe(1);
    expect(betesDe(sim, p.identite.nomFamille)).toHaveLength(1);
  });

  it("une famille qui a une bête bâtit un enclos ; à l'enclos, lait, laine, naissances et fourrage d'hiver", () => {
    const sim = mondePlat(5, 2);
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    p.corps.stade = "adulte";
    const abri = sim.fonderChantier("abri", { x: 30, y: 30 }, p);
    abri.etat = "termine";
    const feu = sim.fonderChantier("feu_de_camp", { x: 31, y: 30 }, p);
    feu.etat = "termine";
    feu.allume = true;
    feu.reserveBois = 20;
    const entrepot = sim.fonderChantier("entrepot", { x: 28, y: 30 }, p);
    entrepot.etat = "termine";
    const bete: Bete = {
      id: "b1",
      espece: "mouflon",
      famille: p.identite.nomFamille,
      proprietaire: p.id,
      position: { x: 30, y: 31 },
      ageJours: AGE_ADULTE_BETAIL,
      docilite: 0.5,
      faim: 0,
      neeEnCaptivite: false,
      derniereTraite: 0,
      derniereTonte: 0,
    };
    sim.ajouterBete(bete);
    expect(prochainBatimentNecessaire(sim, p)).toBe("enclos");
    const enclos = sim.fonderChantier("enclos", { x: 33, y: 30 }, p);
    enclos.etat = "termine";
    expect(enclosDe(sim, p.identite.nomFamille)?.id).toBe(enclos.id);
    expect(prochainBatimentNecessaire(sim, p)).toBeNull();
    // Avec un compagnon adulte, le printemps apporte un petit ; le lait et la laine vont au stock.
    const compagnon: Bete = { ...bete, id: "b2", derniereTraite: 0 };
    sim.ajouterBete(compagnon);
    while (!(
      sim.horloge.moment().saison === "printemps" && sim.horloge.moment().jourDeSaison === 10
    ))
      sim.avancerJusquaAube();
    const id = (): string => `n${String(sim.betail.size)}`;
    bete.derniereTraite = 0;
    bete.ageJours = AGE_ADULTE_BETAIL;
    const r = jourBete(sim, bete, sim.rng.fork("naissance-oui"), id);
    expect(r.evenements.some((e) => e.genre === "lait")).toBe(true);
    expect(enclos.stock ? quantite(enclos.stock, "lait") : 0).toBeGreaterThan(0);
    let nes = r.nouvelle ? 1 : 0;
    for (let i = 0; i < 6 && nes === 0; i++) {
      bete.ageJours = AGE_ADULTE_BETAIL;
      const r2 = jourBete(sim, bete, sim.rng.fork(`n${String(i)}`), id);
      if (r2.nouvelle) nes += 1;
    }
    expect(nes).toBeGreaterThan(0);
    while (sim.horloge.moment().jourDeSaison < 15) sim.avancerJusquaAube();
    bete.derniereTonte = 0;
    bete.ageJours = AGE_ADULTE_BETAIL;
    const tonte = jourBete(sim, bete, sim.rng.fork("tonte"), id);
    expect(tonte.evenements.some((e) => e.genre === "laine")).toBe(true);
    // L'hiver, sans fibres autour ni au stock, la bête dépérit.
    while (sim.horloge.moment().saison !== "hiver") sim.avancerJusquaAube();
    for (const t of sim.grille.tuilesAvecGisement())
      if (t.gisement?.type === "fibres") t.gisement.quantite = 0;
    if (enclos.stock) enclos.stock.ressources = {};
    let famine = false;
    for (let j = 0; j < 20 && !famine; j++) {
      const r3 = jourBete(sim, bete, sim.rng.fork(`h${String(j)}`), id);
      famine = r3.evenements.some((e) => e.genre === "famine");
    }
    expect(famine).toBe(true);
  });

  it("quand la faim presse et qu'on ne connaît rien d'autre, on abat une bête de la famille", () => {
    const sim = mondePlat(7, 1);
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    p.corps.stade = "adulte";
    p.connaissance.clear();
    p.corps.inventaire.ressources = {};
    ajouterObjet(p.corps.inventaire, { type: "lance", solidite: 100 });
    p.besoins.faim = 20;
    p.corps.position = { x: 30, y: 30 };
    sim.ajouterBete({
      id: "b1",
      espece: "aurochs",
      famille: p.identite.nomFamille,
      proprietaire: p.id,
      position: { x: 31, y: 30 },
      ageJours: 200,
      docilite: 0.5,
      faim: 0,
      neeEnCaptivite: true,
      derniereTraite: 0,
      derniereTonte: 0,
    });
    const candidats = new RuleBrain(p)
      .candidats(percevoir(sim, p))
      .map((c) => JSON.stringify(c.intention));
    expect(candidats).toContain(JSON.stringify({ type: "abattre", bete: "b1" }));
    const plan = planifier(sim, p, { type: "abattre", bete: "b1" });
    expect(plan.ok).toBe(true);
    const action = { type: "abattre" as const, bete: "b1", ticksRestants: 3 };
    let statut = "encours";
    for (let i = 0; i < 5 && statut === "encours"; i++)
      statut = executerTick(sim, p, action).statut;
    expect(statut).toBe("terminee");
    expect(quantite(p.corps.inventaire, "gibier")).toBe(8);
    expect(quantite(p.corps.inventaire, "cuir")).toBe(3);
    expect(sim.betail.size).toBe(0);
    expect(sim.journal.compte("abattage")).toBe(1);
  });
});

describe("le village apprivoise : champs et métiers", () => {
  it("un champ semé pousse en quatre stades, mûrit en gisement de baies, gèle l'hiver et s'épuise sans jachère", () => {
    const sim = mondePlat(9, 2);
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    p.corps.stade = "adulte";
    // Des graines en poche à la belle saison : un champ est le prochain bâtiment.
    const abri = sim.fonderChantier("abri", { x: 30, y: 30 }, p);
    abri.etat = "termine";
    const feu = sim.fonderChantier("feu_de_camp", { x: 31, y: 30 }, p);
    feu.etat = "termine";
    feu.allume = true;
    feu.reserveBois = 20;
    const entrepot = sim.fonderChantier("entrepot", { x: 28, y: 30 }, p);
    entrepot.etat = "termine";
    expect(prochainBatimentNecessaire(sim, p)).toBeNull();
    ajouter(p.corps.inventaire, "graines", 4);
    expect(prochainBatimentNecessaire(sim, p)).toBe("champ");
    const champ = sim.fonderChantier("champ", { x: 34, y: 30 }, p);
    champ.etat = "termine";
    expect(champ.culture).not.toBeNull();
    expect(semer(champ)).toBe(true);
    expect(semer(champ)).toBe(false);
    // Quatre stades, un tous les douze jours ; mûr, la tuile porte des baies à récolter.
    const genres: string[] = [];
    for (let j = 0; j < JOURS_PAR_STADE * 4 + 2; j++)
      for (const e of jourChamp(sim, champ, 0)) genres.push(e.genre);
    expect(genres).toContain("levee");
    expect(genres).toContain("mur");
    expect(champ.culture?.stade).toBe(4);
    const tuile = sim.grille.tuile(34, 30);
    expect(tuile.gisement?.type).toBe("baies");
    expect(tuile.gisement?.quantite).toBe(RENDEMENT_CHAMP);
    expect(champ.culture?.recoltes).toBe(1);
    // La récolte vide le gisement et rend le champ à semer ; le paysan apprend.
    p.corps.position = { x: 34, y: 31 };
    p.corps.inventaire.ressources = {};
    let statut = "encours";
    for (let i = 0; i < 400 && (tuile.gisement?.quantite ?? 0) > 0; i++) {
      const action = { type: "recolter" as const, cible: { x: 34, y: 30 }, ticksRestants: null };
      statut = "encours";
      for (let k = 0; k < 10 && statut === "encours"; k++)
        statut = executerTick(sim, p, action).statut;
      p.corps.inventaire.ressources = {};
    }
    expect(tuile.gisement).toBeNull();
    expect(champ.culture?.seme).toBe(false);
    expect(p.experience.agriculture).toBeGreaterThan(0);
    // Deux récoltes de suite épuisent la terre : le rendement baisse ; une jachère le rend.
    expect(rendement({ seme: true, stade: 4, jours: 0, recoltes: 0, jachere: false }, 0)).toBe(
      RENDEMENT_CHAMP,
    );
    expect(
      rendement({ seme: true, stade: 4, jours: 0, recoltes: 2, jachere: false }, 0),
    ).toBeLessThan(RENDEMENT_CHAMP * 0.5);
    // Le gel : un champ semé mais pas mûr perd tout au premier jour de l'hiver.
    semer(champ);
    while (!(sim.horloge.moment().saison === "hiver" && sim.horloge.moment().jourDeSaison === 1))
      sim.avancerJusquaAube();
    if (champ.culture) {
      champ.culture.seme = true;
      champ.culture.stade = 2;
    }
    const hiver = jourChamp(sim, champ, 0).map((e) => e.genre);
    expect(hiver).toContain("gel");
    expect(champ.culture?.seme).toBe(false);
    // Un troupeau qui passe piétine.
    while (sim.horloge.moment().saison !== "printemps") sim.avancerJusquaAube();
    semer(champ);
    if (champ.culture) champ.culture.stade = 2;
    troupeau(sim, "cerf", 35, 30);
    expect(jourChamp(sim, champ, 0).map((e) => e.genre)).toContain("ravage");
    expect(champ.culture?.stade).toBe(1);
  });

  it("le métier vient de la pratique : niveau 3 au moins, la cueillette comptant moitié", () => {
    const sim = mondePlat(11, 2);
    const [f, h] = sim.personnages;
    if (!f || !h) throw new Error("vide");
    f.identite.sexe = "F";
    h.identite.sexe = "M";
    expect(titre(f)).toBeNull();
    f.experience.peche = 100; // niveau 3
    f.experience.recolte = 150; // niveau 3 aussi, mais compte moitié
    expect(titre(f)).toBe("pêcheuse");
    h.experience.chasse = 40; // niveau 2 : pas encore un métier
    expect(titre(h)).toBeNull();
    h.experience.chasse = 100;
    expect(titre(h)).toBe("chasseur");
    expect(sim.titre(h)).toBe("chasseur");
  });

  it(
    "sur deux cent quarante jours, des champs se sèment et mûrissent, on chasse, des métiers apparaissent",
    { timeout: 240000 },
    async () => {
      const sim = Simulation.creer({ seed: 7 });
      await joursAsync(sim, 240);
      expect(sim.journal.compte("semis")).toBeGreaterThan(0);
      expect(sim.journal.parType("champ").some((e) => e.details.genre === "mur")).toBe(true);
      expect(sim.journal.compte("chasse")).toBeGreaterThan(0);
      expect(sim.vivants().some((p) => titre(p) !== null)).toBe(true);
      expect(sim.vivants().length).toBeGreaterThanOrEqual(12);
    },
  );
});
