import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import type { Personnage } from "../src/agents/personnage.js";
import { relationAvec } from "../src/agents/personnage.js";
import { ajouter } from "../src/agents/inventaire.js";
import {
  BORNE_PERSONNALITE,
  JOURS_AVANT_ABATTEMENT,
  SEUIL_ABATTEMENT,
  deformerUnSouvenir,
  flechirPersonnalite,
  lieuEvite,
  rever,
  stresser,
} from "../src/memoire/psyche.js";
import { FOIS_LEGENDE, embellir, nomDuLieu, raconter } from "../src/memoire/legendes.js";
import { composerDialogue } from "../src/social/dialogue.js";
import { joursAsync } from "./utils.js";

function colonie(seed = 5): Simulation {
  const sim = Simulation.creer({ seed, population: { initiale: 9, familles: 3 } });
  sim.config.brain.conseilsParJour = 0;
  sim.avancer(144);
  return sim;
}

function adultes(sim: Simulation): Personnage[] {
  return sim.vivants().filter((p) => p.corps.stade === "adulte");
}

describe("la psyché (jalon 14)", () => {
  it("le stress s'accumule aux épreuves et retombe chaque jour ; cinq jours en haut, c'est l'abattement", () => {
    const sim = colonie();
    const p = adultes(sim)[0];
    if (p === undefined) throw new Error("personne");
    sim.emettre("blessure", p, { type: "coupure", gravite: 2, lieu: "bras", contexte: "test" }, 6);
    expect(p.psyche.stress).toBe(12);
    p.psyche.stress = SEUIL_ABATTEMENT + 20;
    for (let j = 0; j < JOURS_AVANT_ABATTEMENT; j++) {
      p.psyche.stress = SEUIL_ABATTEMENT + 20;
      sim.avancerJusquaAube();
      sim.avancer(1);
    }
    expect(p.psyche.abattu).toBe(true);
    expect(sim.journal.parType("psyche").some((e) => e.details.genre === "abattement")).toBe(true);
    // On en sort quand le stress est retombé.
    p.psyche.stress = 10;
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(p.psyche.abattu).toBe(false);
    expect(sim.journal.parType("psyche").some((e) => e.details.genre === "sortie")).toBe(true);
  });

  it("la personnalité plie sous les épreuves, mais jamais au-delà de la borne", () => {
    const sim = colonie();
    const p = adultes(sim)[0];
    if (p === undefined) throw new Error("personne");
    const base = p.identite.personnalite.nevrosisme;
    for (let i = 0; i < 20; i++) flechirPersonnalite(p, "nevrosisme", 0.05);
    expect(p.identite.personnalite.nevrosisme).toBeCloseTo(
      Math.min(1, base + BORNE_PERSONNALITE),
      5,
    );
    for (let i = 0; i < 20; i++) flechirPersonnalite(p, "nevrosisme", -0.05);
    expect(p.identite.personnalite.nevrosisme).toBeCloseTo(
      Math.max(0, base - BORNE_PERSONNALITE),
      5,
    );
  });

  it("une mort violente d'un proche laisse un lieu évité, un deuil long et son anniversaire", () => {
    const sim = colonie();
    const [a, b] = adultes(sim);
    if (a === undefined || b === undefined) throw new Error("personne");
    relationAvec(a, b.id).lien = "ami";
    const frere = adultes(sim).find(
      (x) => x.id !== b.id && x.identite.nomFamille === b.identite.nomFamille,
    );
    if (frere === undefined) throw new Error("pas de frère");
    // Loin du village : un lieu qu'on peut éviter (on n'évite jamais son propre foyer).
    b.corps.position = { x: b.corps.position.x + 30, y: b.corps.position.y + 30 };
    sim.grille.tuile(b.corps.position.x, b.corps.position.y);
    const pos = { ...b.corps.position };
    sim.tuer(b, "loups");
    expect(frere.psyche.deuils.map((d) => d.defunt)).toContain(b.id);
    frere.besoins.faim = 80;
    expect(lieuEvite(frere, pos, sim.tick)).toBe(true);
    frere.besoins.faim = 20;
    expect(lieuEvite(frere, pos, sim.tick)).toBe(false);
    expect(a.psyche.stress).toBeGreaterThan(0);
    // Un an plus tard, l'anniversaire.
    const deuil = frere.psyche.deuils.find((d) => d.defunt === b.id);
    if (deuil === undefined) throw new Error("pas de deuil");
    (deuil as { tick: number }).tick = sim.tick - sim.horloge.ticksParAnnee;
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(deuil.anniversaires).toBe(1);
    expect(sim.journal.parType("psyche").some((e) => e.details.genre === "anniversaire")).toBe(
      true,
    );
  });

  it("chacun se donne un objectif selon ses valeurs au début d'une saison, et se réjouit de l'atteindre", () => {
    const sim = colonie();
    const p = adultes(sim)[0];
    if (p === undefined) throw new Error("personne");
    (p.identite as { valeurs: string[] }).valeurs = ["harmonie"];
    // Aller au premier jour de la saison suivante.
    while (sim.horloge.moment().jourDeSaison !== 1 || sim.tick % sim.horloge.ticksParJour !== 1)
      sim.avancer(1);
    expect(p.psyche.objectif?.genre).toBe("dons");
    p.psyche.dons += 5;
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(p.psyche.objectif?.issue).toBe("accompli");
    expect(p.humeur.some((m) => m.cle === "joie")).toBe(true);
  }, 60_000);

  it("la nuit, un rêve mêle deux souvenirs ; avec le temps, un souvenir ancien se réécrit sans toucher au journal", () => {
    const sim = colonie();
    const p = adultes(sim)[0];
    if (p === undefined) throw new Error("personne");
    const T = sim.horloge.ticksParJour;
    p.memoire.ajouter(sim.tick - 3 * T, "action", "J'ai rapporté 3 poissons.", 6, []);
    p.memoire.ajouter(sim.tick - 2 * T, "observation", "Les loups rôdaient.", 7, []);
    rever(sim, p);
    expect(p.psyche.reve).not.toBeNull();
    expect(p.memoire.tous().some((s) => s.type === "reve")).toBe(true);
    // Un souvenir vieux de deux saisons, jamais consulté, grossit.
    const vieux = p.memoire.ajouter(
      sim.tick - 70 * T,
      "action",
      "J'ai vu 4 loups ce soir-là.",
      7,
      [],
    );
    vieux.dernierAcces = sim.tick - 70 * T;
    const empreinte = sim.journal.empreinte();
    let altere = deformerUnSouvenir(sim, p);
    for (let i = 0; altere !== null && altere.id !== vieux.id && i < 10; i++)
      altere = deformerUnSouvenir(sim, p);
    expect(vieux.altere).toBe(true);
    expect(vieux.texte).toContain("6 loups");
    expect(sim.journal.empreinte()).toBe(empreinte);
  });

  it("un objet cassé qu'on aimait pèse sur l'humeur", () => {
    const sim = colonie();
    const p = adultes(sim)[0];
    if (p === undefined) throw new Error("personne");
    p.psyche.attachement.objet = "canne_a_peche";
    sim.emettre("outil_casse", p, { outil: "canne_a_peche" }, 3);
    expect(p.humeur.some((m) => m.cle === "perte")).toBe(true);
    expect(p.psyche.attachement.objet).toBeNull();
  });
});

describe("la mémoire collective (jalon 14)", () => {
  it("un événement marquant devient un récit, raconté à la veillée, embelli, puis légende", () => {
    const sim = colonie();
    const p = adultes(sim)[0];
    if (p === undefined) throw new Error("personne");
    sim.emettre(
      "combat",
      p,
      { issue: "repousse", loups: 3, defenseurs: 2, loupsTues: 1, rounds: 4 },
      8,
      p.corps.position,
    );
    const recit = sim.chronique.recits.find((r) => r.genre === "combat");
    expect(recit?.texte).toContain("3 loups");
    const rng = sim.rng.fork("test");
    for (let i = 0; i < FOIS_LEGENDE; i++) raconter(sim, adultes(sim), rng);
    const legende = sim.chronique.recits.find((r) => r.legende);
    expect(legende).toBeDefined();
    expect(legende?.origine).toContain("3 loups");
    expect(legende?.texte).not.toBe(legende?.origine);
    expect(sim.journal.parType("legende").some((e) => e.details.genre === "legende")).toBe(true);
    // Le pré des loups a reçu son nom.
    expect(nomDuLieu(sim, p.corps.position)).toBe("le pré des loups");
  });

  it("embellir grossit les nombres et ajoute une épithète", () => {
    const sim = colonie();
    const recit = {
      id: "r",
      tick: 0,
      genre: "chasse",
      texte: "Ambre a rapporté 2 cerfs.",
      origine: "Ambre a rapporté 2 cerfs.",
      sujets: [],
      fois: 2,
      embellissements: 0,
      legende: false,
      position: null,
    };
    embellir(recit, sim.rng.fork("e"));
    expect(recit.texte).toContain("3 cerfs");
    expect(recit.texte).toContain("—");
  });

  it("une coutume engendre un proverbe, repris dans les dialogues, et les lieux nommés remplacent les directions", () => {
    const sim = colonie();
    sim.chronique.proverbes.push({
      lecon: "enfants_dabord",
      texte: "Le petit mange, le grand attend.",
      depuis: 0,
    });
    const [a, b] = adultes(sim);
    if (a === undefined || b === undefined) throw new Error("personne");
    let proverbe = false;
    for (let i = 0; i < 40 && !proverbe; i++)
      proverbe = composerDialogue(sim, a, b).repliques.some((r) =>
        r.texte.includes("Comme on dit chez nous"),
      );
    expect(proverbe).toBe(true);
    // Un lieu nommé près d'un gisement connu.
    const lieu = [...a.connaissance.values()][0];
    if (lieu === undefined) throw new Error("aucun lieu connu");
    sim.chronique.lieuxNommes.push({
      x: lieu.x,
      y: lieu.y,
      nom: "la crique de Timéo",
      depuis: 0,
      origine: "test",
    });
    expect(nomDuLieu(sim, lieu)).toBe("la crique de Timéo");
  });

  it("la psyché et la chronique se sauvegardent, et une sauvegarde v2 se relit", () => {
    const sim = colonie();
    const p = adultes(sim)[0];
    if (p === undefined) throw new Error("personne");
    stresser(p, 33);
    ajouter(p.corps.inventaire, "baies", 1);
    sim.chronique.lieuxNommes.push({
      x: 1,
      y: 2,
      nom: "la crique de Timéo",
      depuis: 0,
      origine: "test",
    });
    const copie = Simulation.restaurer(JSON.parse(JSON.stringify(sim.sauvegarder())));
    expect(copie.personnage(p.id)?.psyche.stress).toBe(33);
    expect(copie.chronique.lieuxNommes[0]?.nom).toBe("la crique de Timéo");
    sim.avancer(200);
    copie.avancer(200);
    expect(copie.journal.empreinte()).toBe(sim.journal.empreinte());
    const brute = JSON.parse(JSON.stringify(sim.sauvegarder())) as {
      version: number;
      etat: { chronique?: unknown; personnages: Record<string, unknown>[] };
    };
    brute.version = 2;
    delete brute.etat.chronique;
    for (const q of brute.etat.personnages) delete q.psyche;
    const ancienne = Simulation.restaurer(brute);
    expect(ancienne.vivants()[0]?.psyche.stress).toBe(0);
    ancienne.avancer(50);
  });

  it("sur soixante jours, on rêve, on raconte, on nomme des lieux, sans se casser", async () => {
    const sim = Simulation.creer({ seed: 3 });
    sim.config.brain.conseilsParJour = 0;
    await joursAsync(sim, 60);
    expect(sim.vivants().some((p) => p.psyche.reve !== null)).toBe(true);
    expect(sim.vivants().some((p) => p.psyche.objectif !== null)).toBe(true);
    expect(sim.journal.parType("legende").length).toBeGreaterThan(0);
  }, 120_000);
});
