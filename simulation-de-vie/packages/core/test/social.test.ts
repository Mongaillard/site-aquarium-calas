import { describe, expect, it } from "vitest";
import { executerTick } from "../src/actions/executeur.js";
import { planifier } from "../src/actions/planificateur.js";
import { ajouter, quantite } from "../src/agents/inventaire.js";
import { relationAvec } from "../src/agents/personnage.js";
import type { Personnage } from "../src/agents/personnage.js";
import { observer } from "../src/cerveau/perception.js";
import { RuleBrain } from "../src/cerveau/rule-brain.js";
import { percevoir } from "../src/cerveau/perception.js";
import { reflechir } from "../src/memoire/reflexion.js";
import { composerDialogue, directionVers, lieuxAPartager } from "../src/social/dialogue.js";
import { effetsVol, probabiliteAccord } from "../src/social/echange.js";
import {
  ajusterRelation,
  compatibilite,
  lienDerive,
  relationVierge,
  tutoie,
} from "../src/social/relations.js";
import { Simulation } from "../src/simulation.js";
import { gisementBaies, grilleUniforme } from "./utils.js";

/** Monde 24×24 : eau en x = 0, baies en (18, 4). a et b sont de la même famille, c est étranger. */
function scenario() {
  const eau = Array.from({ length: 24 }, (_, y) => ({
    x: 0,
    y,
    biome: "eau_peu_profonde" as const,
  }));
  const grille = grilleUniforme(24, 24, "prairie", [
    ...eau,
    { x: 18, y: 4, gisement: gisementBaies(6) },
  ]);
  const sim = Simulation.creerAvecGrille(
    { seed: 21, population: { initiale: 3, familles: 2 } },
    grille,
  );
  const [a, b, c] = sim.personnages;
  if (!a || !b || !c) throw new Error("population incomplète");
  const forcer = (p: Personnage, nom: string): void => {
    (p.identite as { nomFamille: string }).nomFamille = nom;
  };
  forcer(a, "Aubrac");
  forcer(b, "Aubrac");
  forcer(c, "Weber");
  a.relations.clear();
  b.relations.clear();
  c.relations.clear();
  a.corps.position = { x: 10, y: 10 };
  b.corps.position = { x: 11, y: 10 };
  c.corps.position = { x: 20, y: 20 };
  for (const p of sim.personnages) {
    p.connaissance.clear();
    Object.assign(p.besoins, {
      faim: 90,
      soif: 90,
      sommeil: 90,
      chaleur: 100,
      securite: 80,
      social: 60,
      moral: 70,
    });
  }
  return { sim, a, b, c };
}

function executerPlan(sim: Simulation, p: Personnage, maxTicks = 200): string {
  for (let i = 0; i < maxTicks; i++) {
    const action = p.plan[0];
    if (action === undefined) return "terminee";
    const r = executerTick(sim, p, action);
    if (r.statut === "echec") return r.raison;
    if (r.statut === "terminee") p.plan.shift();
  }
  return "timeout";
}

describe("relations", () => {
  it("dérive le lien des seuils, sauf liens familiaux", () => {
    const r = relationVierge("x");
    expect(lienDerive(r)).toBe("inconnu");
    r.interactions = 1;
    expect(lienDerive(r)).toBe("connaissance");
    r.affinite = 65;
    r.confiance = 55;
    expect(lienDerive(r)).toBe("ami");
    r.affinite = -20;
    expect(lienDerive(r)).toBe("rival");
    r.affinite = -50;
    expect(lienDerive(r)).toBe("ennemi");
    r.lien = "fratrie";
    expect(lienDerive(r)).toBe("fratrie");
  });

  it("l'ajustement est amplifié par le névrosisme et coloré par la compatibilité", () => {
    const calme = {
      ouverture: 0.5,
      conscience: 0.5,
      extraversion: 0.5,
      agreabilite: 0.5,
      nevrosisme: 0.1,
    };
    const anxieux = { ...calme, nevrosisme: 0.9 };
    const r1 = relationVierge("x");
    const r2 = relationVierge("x");
    ajusterRelation(r1, calme, calme, { affinite: 10 }, 5);
    ajusterRelation(r2, anxieux, calme, { affinite: 10 }, 5);
    expect(r2.affinite).toBeGreaterThan(r1.affinite);
    expect(r1.derniereInteraction).toBe(5);
    expect(r1.interactions).toBe(1);
    expect(compatibilite(calme, calme)).toBeGreaterThan(
      compatibilite(anxieux, { ...anxieux, agreabilite: 0.1 }),
    );
    r1.affinite = 200;
    ajusterRelation(r1, calme, calme, { affinite: 1 }, 6);
    expect(r1.affinite).toBe(100);
  });

  it("tutoiement selon le lien", () => {
    const r = relationVierge("x");
    expect(tutoie(r)).toBe(false);
    r.lien = "ami";
    expect(tutoie(r)).toBe(true);
    r.lien = "connaissance";
    r.affinite = 35;
    expect(tutoie(r)).toBe(true);
  });

  it("la population initiale relie les familles en fratrie", () => {
    const sim = Simulation.creer({ seed: 42, monde: { largeur: 32, hauteur: 32 } });
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    const freres = [...p.relations.values()].filter((r) => r.lien === "fratrie");
    expect(freres.length).toBeGreaterThan(0);
    for (const r of freres)
      expect(sim.personnage(r.cible)?.identite.nomFamille).toBe(p.identite.nomFamille);
  });
});

describe("dialogue", () => {
  it("transmet un lieu connu que l'autre ignore", () => {
    const { sim, a, b } = scenario();
    a.corps.position = { x: 17, y: 5 };
    observer(sim, a, 3); // a voit les baies
    a.corps.position = { x: 10, y: 10 };
    expect(lieuxAPartager(a, b, 2).map((l) => l.type)).toEqual(["baies"]);
    const d = composerDialogue(sim, a, b);
    expect(d.repliques.length).toBeGreaterThanOrEqual(2);
    expect(d.repliques.length).toBeLessThanOrEqual(6);
    expect(d.effets.some((e) => e.type === "information" && e.vers === b.id)).toBe(true);
    // Exécution complète : b connaît désormais les baies.
    a.plan = [{ type: "parler", cible: b.id, ticksRestants: null }];
    expect(executerPlan(sim, a)).toBe("terminee");
    expect([...b.connaissance.values()].some((l) => l.type === "baies")).toBe(true);
    expect(sim.journal.compte("dialogue")).toBe(1);
    expect(b.memoire.tous().some((s) => s.type === "dialogue")).toBe(true);
    expect(a.besoins.social).toBeGreaterThan(60);
    expect(relationAvec(a, b.id).affinite).toBeGreaterThan(0);
  });

  it("tutoie en famille et vouvoie les inconnus", () => {
    const { sim, a, b, c } = scenario();
    expect(composerDialogue(sim, a, b).repliques[0]?.texte).toContain("vas-tu");
    c.corps.position = { x: 11, y: 11 };
    expect(composerDialogue(sim, a, c).repliques[0]?.texte).toContain("allez-vous");
  });

  it("dispute entre personnes qui se détestent", () => {
    const { sim, a, c } = scenario();
    c.corps.position = { x: 11, y: 11 };
    relationAvec(a, c.id).affinite = -30;
    const d = composerDialogue(sim, a, c);
    expect(d.sujet).toBe("dispute");
    expect(d.effets.every((e) => e.type === "relation" && e.affinite < 0)).toBe(true);
  });

  it("entraide : donne à manger à un affamé", () => {
    const { sim, a, b } = scenario();
    b.besoins.faim = 20;
    ajouter(a.corps.inventaire, "baies", 3);
    const d = composerDialogue(sim, a, b);
    expect(d.sujet).toBe("entraide");
    a.plan = [{ type: "parler", cible: b.id, ticksRestants: null }];
    expect(executerPlan(sim, a)).toBe("terminee");
    expect(quantite(b.corps.inventaire, "baies")).toBe(1);
    expect(relationAvec(b, a.id).dette).toBeLessThan(0);
    expect(sim.journal.compte("offre")).toBe(1);
  });

  it("invite un proche sans abri dans le sien", () => {
    const { sim, a, c } = scenario();
    c.corps.position = { x: 11, y: 11 };
    const abri = sim.fonderChantier("abri", { x: 9, y: 9 }, a);
    abri.etat = "termine";
    const ra = relationAvec(a, c.id);
    ra.confiance = 70;
    ra.affinite = 50;
    a.plan = [{ type: "parler", cible: c.id, ticksRestants: null }];
    expect(executerPlan(sim, a)).toBe("terminee");
    expect(abri.autorises).toContain(c.id);
    expect(sim.journal.compte("invitation")).toBe(1);
  });

  it("parler échoue si l'autre dort ou est loin", () => {
    const { sim, a, b } = scenario();
    b.corps.endormi = true;
    expect(
      executerTick(sim, a, { type: "parler", cible: b.id, ticksRestants: null }),
    ).toMatchObject({ statut: "echec" });
    b.corps.endormi = false;
    b.corps.position = { x: 20, y: 20 };
    expect(
      executerTick(sim, a, { type: "parler", cible: b.id, ticksRestants: null }),
    ).toMatchObject({ statut: "echec" });
    const r = planifier(sim, a, { type: "parler", cible: b.id });
    expect(r.ok && r.plan.map((x) => x.type)).toEqual(["deplacer", "parler"]);
  });

  it("directionVers", () => {
    expect(directionVers({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe("au est");
    expect(directionVers({ x: 0, y: 0 }, { x: 5, y: -5 })).toBe("au nord-est");
    expect(directionVers({ x: 0, y: 0 }, { x: 0, y: 3 })).toBe("au sud");
  });
});

describe("échange et vol", () => {
  it("offrir transfère et crée une dette", () => {
    const { sim, a, b } = scenario();
    ajouter(a.corps.inventaire, "baies", 3);
    a.plan = [{ type: "offrir", cible: b.id, ressource: "baies", quantite: 2 }];
    expect(executerPlan(sim, a)).toBe("terminee");
    expect(quantite(b.corps.inventaire, "baies")).toBe(2);
    expect(relationAvec(a, b.id).dette).toBe(2);
    expect(relationAvec(b, a.id).dette).toBe(-2);
    expect(relationAvec(b, a.id).affinite).toBeGreaterThan(0);
  });

  it("demander : la famille accepte plus volontiers, et jamais sans réserve", () => {
    const { sim, a, b, c } = scenario();
    ajouter(b.corps.inventaire, "baies", 4);
    ajouter(c.corps.inventaire, "baies", 4);
    expect(probabiliteAccord(a, b, "baies", 2)).toBeGreaterThan(
      probabiliteAccord(a, c, "baies", 2),
    );
    expect(probabiliteAccord(a, b, "baies", 4)).toBe(0); // b garde au moins une baie
    // Accord forcé : on rend b très généreux.
    (b.identite.personnalite as { agreabilite: number }).agreabilite = 1;
    relationAvec(b, a.id).affinite = 100;
    a.plan = [{ type: "demander", cible: b.id, ressource: "baies", quantite: 2 }];
    const resultat = executerPlan(sim, a);
    const demande = sim.journal.parType("demande")[0];
    expect(demande).toBeDefined();
    if (resultat === "terminee") {
      expect(quantite(a.corps.inventaire, "baies")).toBe(2);
      expect(demande?.details.accepte).toBe(true);
    } else {
      expect(demande?.details.accepte).toBe(false);
    }
  });

  it("voler dans un stock d'autrui : les témoins s'en souviennent et la réputation chute", () => {
    const { sim, a, b, c } = scenario();
    const entrepot = sim.fonderChantier("entrepot", { x: 12, y: 10 }, a);
    entrepot.etat = "termine";
    if (entrepot.stock) ajouter(entrepot.stock, "baies", 5);
    c.corps.position = { x: 12, y: 11 };
    b.corps.position = { x: 13, y: 10 }; // b, de la famille lésée, est témoin
    expect(
      executerTick(sim, a, {
        type: "voler",
        batimentId: entrepot.id,
        ressource: "baies",
        quantite: 2,
      }),
    ).toMatchObject({
      statut: "echec",
      raison: "ce stock est le mien",
    });
    c.plan = [{ type: "voler", batimentId: entrepot.id, ressource: "baies", quantite: 2 }];
    expect(executerPlan(sim, c)).toBe("terminee");
    expect(quantite(c.corps.inventaire, "baies")).toBe(2);
    expect(c.reputation).toBeLessThan(0);
    expect(relationAvec(b, c.id).affinite).toBeLessThan(-20);
    expect(relationAvec(a, c.id).affinite).toBeLessThan(-20);
    expect(b.memoire.tous().some((s) => s.texte.includes("voler"))).toBe(true);
    expect(sim.journal.compte("vol")).toBe(1);
    expect(effetsVol(sim, c, entrepot, 0)).toEqual([]); // hors de portée : aucun témoin
  });
});

describe("réflexion du soir", () => {
  it("après une journée de faim, décide de faire des réserves", () => {
    const { sim, a } = scenario();
    a.drapeaux.faimMinDuJour = 10;
    const r = reflechir(sim, a);
    expect(r.some((x) => x.cle.startsWith("faim:"))).toBe(true);
    expect(a.drapeaux.prudenceNourritureJusqua).toBeGreaterThan(sim.tick);
    expect(reflechir(sim, a).some((x) => x.cle.startsWith("faim:"))).toBe(false); // pas deux fois
  });

  it("reconnaît un proche fiable et renforce la confiance", () => {
    const { sim, a, b } = scenario();
    const r = relationAvec(a, b.id);
    r.interactions = 4;
    r.affinite = 60;
    r.derniereInteraction = sim.tick;
    const avant = r.confiance;
    const reflexions = reflechir(sim, a);
    expect(reflexions.some((x) => x.sujets.includes(b.id))).toBe(true);
    expect(r.confiance).toBe(avant + 5);
  });

  it("la simulation journalise les réflexions à 21 h et les mémorise", () => {
    const { sim, a } = scenario();
    a.drapeaux.faimMinDuJour = 5;
    sim.avancer(21 * 6 + 1);
    expect(sim.journal.compte("reflexion")).toBeGreaterThan(0);
    expect(a.memoire.tous().some((s) => s.type === "reflexion")).toBe(true);
  });
});

describe("RuleBrain social", () => {
  it("veut parler quand le besoin social est bas et quelqu'un est visible", () => {
    const { sim, a } = scenario();
    a.besoins.social = 10;
    const cerveau = new RuleBrain(a);
    expect(cerveau.decider(percevoir(sim, a))).toMatchObject({ type: "parler" });
  });

  it("propose d'offrir à un affamé quand on a des vivres", () => {
    const { sim, a, b } = scenario();
    b.besoins.faim = 20;
    ajouter(a.corps.inventaire, "baies", 4);
    const types = new RuleBrain(a).candidats(percevoir(sim, a)).map((c) => c.intention.type);
    expect(types).toContain("offrir");
  });
});
