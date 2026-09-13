import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { RuleBrain } from "../src/cerveau/rule-brain.js";
import { percevoir } from "../src/cerveau/perception.js";
import { executerTick } from "../src/actions/executeur.js";
import {
  ajouter,
  ajouterObjet,
  outilSatisfait,
  placeLibre,
  possede,
  quantite,
  retirer,
} from "../src/agents/inventaire.js";
import { cleLieu } from "../src/agents/personnage.js";
import type { Personnage } from "../src/agents/personnage.js";
import { prochainBatimentNecessaire } from "../src/monde.js";
import { BETES_PAR_FAMILLE_MAX } from "../src/monde/village.js";
import { SOLIDITE_INITIALE } from "../src/monde/recettes.js";
import { apprendre } from "../src/savoirs/lecons.js";
import { besoinRessenti } from "../src/savoirs/inventions.js";
import type { Troupeau } from "../src/monde/faune.js";
import { grilleUniforme } from "./utils.js";

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

/** Un adulte rassasié, installé (abri, feu, entrepôt), sans autre souci que celui du test. */
function colon(sim: Simulation): Personnage {
  const p = sim.personnages[0];
  if (!p) throw new Error("vide");
  p.corps.stade = "adulte";
  p.corps.position = { x: 30, y: 30 };
  Object.assign(p.besoins, { faim: 100, soif: 100, sommeil: 100, chaleur: 100, social: 100 });
  const abri = sim.fonderChantier("abri", { x: 30, y: 29 }, p);
  abri.etat = "termine";
  const feu = sim.fonderChantier("feu_de_camp", { x: 31, y: 29 }, p);
  feu.etat = "termine";
  feu.allume = true;
  feu.reserveBois = 20;
  const entrepot = sim.fonderChantier("entrepot", { x: 28, y: 30 }, p);
  entrepot.etat = "termine";
  // Un garde-manger plein : pas de raison d'aller récolter.
  if (entrepot.stock !== null) ajouter(entrepot.stock, "poisson_fume", 40);
  // De l'eau et des baies connues : rien ne manque, pas de raison d'explorer.
  lieu(p, 20, 20, "eau");
  lieu(p, 30, 36, "baies");
  return p;
}

function lieu(
  p: Personnage,
  x: number,
  y: number,
  type: "fibres" | "minerai" | "bois" | "eau" | "baies",
): void {
  p.connaissance.set(cleLieu(x, y), {
    x,
    y,
    type,
    outilRequis: type === "minerai" ? "pioche" : type === "bois" ? "hache_pierre" : null,
    quantiteVue: 8,
    tickVu: 0,
  });
}

describe("apprivoiser (M23)", () => {
  it("devant un troupeau docile, sans corde, on va en tresser une", () => {
    const sim = mondePlat(3, 2);
    const p = colon(sim);
    lieu(p, 30, 35, "fibres");
    troupeau(sim, "mouflon", 31, 30);
    const perception = percevoir(sim, p);
    const intention = new RuleBrain(p).decider(perception);
    expect(intention).toEqual({ type: "fabriquer", recette: "corde" });
    // Une corde en poche : plus besoin d'en faire ; les bêtes au complet non plus.
    ajouter(p.corps.inventaire, "corde", 1);
    expect(new RuleBrain(p).decider(percevoir(sim, p))).not.toEqual({
      type: "fabriquer",
      recette: "corde",
    });
    expect(percevoir(sim, p).troupeauxVisibles[0]?.docile).toBe(true);
    expect(BETES_PAR_FAMILLE_MAX).toBeGreaterThanOrEqual(2);
  });

  it("à la chasse, la corde sert d'abord à ramener la bête vivante, sans avoir à la tuer", () => {
    const sim = mondePlat(4, 2);
    const p = colon(sim);
    const t = troupeau(sim, "mouflon", 31, 30);
    ajouterObjet(p.corps.inventaire, { type: "lance", solidite: 1000 });
    p.experience.chasse = 0; // un chasseur novice : la capture ne dépend pas de la mise à mort
    let captures = 0;
    let tentatives = 0;
    for (let i = 0; i < 60; i++) {
      p.corps.inventaire.ressources = { corde: 1 };
      t.taille = 5;
      t.mefiance = 0;
      t.position = { x: 31, y: 30 };
      const avant = sim.journal.compte("capture");
      executerTick(sim, p, { type: "chasser", troupeau: t.id, ticksRestants: 1 });
      if (captures < BETES_PAR_FAMILLE_MAX) tentatives += 1;
      if (sim.journal.compte("capture") > avant) {
        captures += 1;
        expect(quantite(p.corps.inventaire, "gibier")).toBe(0); // ramenée vivante, pas tuée
        expect(quantite(p.corps.inventaire, "corde")).toBe(0);
      }
      p.corps.inventaire.ressources = {};
    }
    // Plus d'une fois sur deux, puis plus rien : l'enclos de la famille est au complet.
    expect(captures).toBe(BETES_PAR_FAMILLE_MAX);
    expect(tentatives).toBeLessThan(20);
    expect(sim.betail.size).toBe(BETES_PAR_FAMILLE_MAX);
  });
});

describe("l'âge du cuivre (M23)", () => {
  it("le minerai vu dans la montagne fait venir l'idée, l'idée fait bâtir un four, le four donne un lingot", () => {
    const sim = mondePlat(5, 2);
    const p = colon(sim);
    p.identite.personnalite.ouverture = 0.9;
    expect(besoinRessenti(sim, p, "fonte")).toBe(false);
    // Un filon loin du foyer (hors de vue : ce qu'on ne voit plus reste dans la mémoire).
    sim.grille.tuile(55, 55).gisement = {
      type: "minerai",
      quantite: 12,
      max: 12,
      tauxRegen: 0,
      outilRequis: "pioche",
    };
    // Soixante jours passent, personne ne bouge (une idée d'outillage attend une colonie installée).
    for (const q of sim.personnages)
      sim.definirCerveau(q.id, {
        decider: () => ({ type: "attendre", ticks: 50 }),
        urgence: () => null,
      });
    for (let h = 0; h < 60 * 12; h++) {
      for (const q of sim.personnages)
        Object.assign(q.besoins, { faim: 90, soif: 90, sommeil: 90, chaleur: 90, securite: 90 });
      sim.avancer(12);
    }
    expect(p.vivant).toBe(true);
    // Ce qu'on a vu disparaître de la carte s'oublie ; on remet ce que le test suppose connu.
    p.savoirs.delete("osselets");
    lieu(p, 20, 20, "eau");
    lieu(p, 30, 36, "baies");
    lieu(p, 55, 55, "minerai");
    Object.assign(p.besoins, { faim: 100, soif: 100, sommeil: 100, chaleur: 100, social: 100 });
    // Le feu a brûlé ses bûches pendant ce temps : on le regarnit, ce n'est pas le sujet.
    for (const b of sim.batiments.values()) {
      b.solidite = 100;
      if (b.type === "feu_de_camp") {
        b.allume = true;
        b.reserveBois = 20;
      }
    }
    expect(sim.horloge.moment().jourAbsolu).toBeGreaterThanOrEqual(60);
    expect(besoinRessenti(sim, p, "fonte")).toBe(true);
    apprendre(p, "fonte", 1, "test", sim.tick);
    expect(prochainBatimentNecessaire(sim, p)).toBe("four");
    const four = sim.fonderChantier("four", { x: 31, y: 31 }, p);
    four.etat = "termine";
    expect(prochainBatimentNecessaire(sim, p)).toBeNull();
    // Sans pioche, le cerveau en fabrique une pour aller au minerai (les poches presque pleines
    // et un peu à manger : ni provisions d'automne ni cueillette ne passent devant).
    ajouter(p.corps.inventaire, "baies", 2);
    ajouter(p.corps.inventaire, "pierre", placeLibre(p.corps.inventaire) - 3);
    const perc = percevoir(sim, p);
    expect(new RuleBrain(p).decider(perc)).toEqual({
      type: "fabriquer",
      recette: "pioche",
    });
    retirer(p.corps.inventaire, "pierre", quantite(p.corps.inventaire, "pierre"));
    // Trois minerais et deux bûches au four : un lingot.
    p.experience.artisanat = 100;
    ajouter(p.corps.inventaire, "minerai", 3);
    ajouter(p.corps.inventaire, "bois", 2);
    const fonte = { type: "fabriquer" as const, recette: "cuivre" as const, ticksRestants: null };
    let statut = "";
    for (let i = 0; i < 20 && statut !== "terminee"; i++)
      statut = executerTick(sim, p, fonte).statut;
    expect(statut).toBe("terminee");
    expect(quantite(p.corps.inventaire, "cuivre")).toBe(1);
    expect(quantite(p.corps.inventaire, "minerai")).toBe(0);
    // L'outil de cuivre : deux bûches et le lingot ; il remplace la hache de pierre et dure quatre fois plus.
    expect(besoinRessenti(sim, p, "outils_de_cuivre")).toBe(true);
    apprendre(p, "outils_de_cuivre", 1, "test", sim.tick);
    ajouter(p.corps.inventaire, "bois", 2);
    const forge = {
      type: "fabriquer" as const,
      recette: "hache_cuivre" as const,
      ticksRestants: null,
    };
    statut = "";
    for (let i = 0; i < 20 && statut !== "terminee"; i++)
      statut = executerTick(sim, p, forge).statut;
    expect(statut).toBe("terminee");
    expect(possede(p.corps.inventaire, "hache_cuivre")).toBe(true);
    expect(outilSatisfait(p.corps.inventaire, "hache_pierre")).toBe(true);
    expect(SOLIDITE_INITIALE.hache_cuivre).toBe(4 * SOLIDITE_INITIALE.hache_pierre);
    // À l'arbre, la hache de cuivre abat trois bûches là où la pierre en fait deux.
    sim.grille.tuile(31, 30).gisement = {
      type: "bois",
      quantite: 20,
      max: 20,
      tauxRegen: 0,
      outilRequis: "hache_pierre",
    };
    const coupe = { type: "recolter" as const, cible: { x: 31, y: 30 }, ticksRestants: null };
    statut = "";
    for (let i = 0; i < 20 && statut !== "terminee"; i++)
      statut = executerTick(sim, p, coupe).statut;
    expect(statut).toBe("terminee");
    expect(quantite(p.corps.inventaire, "bois")).toBe(3);
    expect(possede(p.corps.inventaire, "hache_cuivre")).toBe(true);
  });
});
