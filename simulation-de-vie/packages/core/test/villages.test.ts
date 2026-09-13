import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import type { Personnage } from "../src/agents/personnage.js";
import { ajouter } from "../src/agents/inventaire.js";
import { relationAvec } from "../src/agents/personnage.js";
import {
  SURPEUPLEMENT,
  forceDe,
  habitants,
  heureVillages,
  nourritureDe,
  relationEntre,
  villageDe,
} from "../src/monde/villages.js";
import { joursAsync } from "./utils.js";

function colonie(seed = 5, initiale = 9): Simulation {
  const sim = Simulation.creer({ seed, population: { initiale, familles: 3 } });
  sim.config.brain.conseilsParJour = 0;
  sim.avancer(144);
  return sim;
}

function adultes(sim: Simulation): Personnage[] {
  return sim.vivants().filter((p) => p.corps.stade === "adulte");
}

/** Un entrepôt terminé, plein de poisson fumé, pour la famille de `p`. */
function entrepotPlein(sim: Simulation, p: Personnage, poisson: number): void {
  const b = sim.fonderChantier(
    "entrepot",
    { x: p.corps.position.x + 1, y: p.corps.position.y + 1 },
    p,
  );
  b.etat = "termine";
  b.travailRestant = 0;
  if (b.stock !== null) ajouter(b.stock, "poisson_fume", poisson);
}

describe("le monde s'élargit (jalon 15)", () => {
  it("le premier village existe dès la fondation, avec toutes les familles", () => {
    const sim = colonie();
    expect(sim.villages.villages).toHaveLength(1);
    const v = sim.villages.villages[0];
    expect(v?.familles.length).toBe(3);
    if (v === undefined) throw new Error("pas de village");
    for (const p of sim.vivants()) expect(villageDe(sim, p)?.id).toBe(v.id);
    expect(habitants(sim, v).length).toBe(sim.vivants().length);
  });

  it("le surpeuplement envoie une famille fonder un second village à soixante tuiles, avec des vivres", () => {
    const sim = colonie(8, 12);
    // Assez de monde, tous adultes, et un stock où puiser.
    for (const p of sim.vivants()) {
      p.corps.stade = "adulte";
      p.corps.ageJours = 25 * sim.config.vie.joursParAnnee;
    }
    for (let i = 0; i < SURPEUPLEMENT; i++) {
      const [mere, pere] = adultes(sim);
      if (mere !== undefined && pere !== undefined && sim.vivants().length < SURPEUPLEMENT + 2)
        sim.naitre(
          mere.identite.sexe === "F" ? mere : pere,
          mere.identite.sexe === "F" ? pere : mere,
        );
    }
    const chef = adultes(sim)[0];
    if (chef === undefined) throw new Error("personne");
    entrepotPlein(sim, chef, 60);
    // Jour après jour jusqu'au schisme (au printemps, dans les dix premiers jours), deux ans au plus.
    for (let j = 0; j < 2 * 120 && sim.villages.villages.length < 2; j++) {
      for (const p of sim.vivants()) p.corps.stade = "adulte";
      sim.avancerJusquaAube();
      sim.avancer(1);
    }
    expect(sim.villages.villages.length).toBe(2);
    const nouveau = sim.villages.villages[1];
    if (nouveau === undefined) throw new Error("pas de second village");
    const ancien = sim.villages.villages[0];
    expect(nouveau.origine).toBe("schisme");
    expect(nouveau.enRoute.length).toBeGreaterThanOrEqual(3);
    const d = Math.max(
      Math.abs(nouveau.centre.x - (ancien?.centre.x ?? 0)),
      Math.abs(nouveau.centre.y - (ancien?.centre.y ?? 0)),
    );
    expect(d).toBeGreaterThanOrEqual(40);
    const migrant = sim.personnage(nouveau.enRoute[0] ?? "");
    expect(migrant?.ambition?.genre).toBe("migrer");
    expect(migrant?.ambition?.destination).toEqual(nouveau.centre);
    expect(sim.journal.parType("village").some((e) => e.details.genre === "schisme")).toBe(true);
    // Les migrants marchent vers le site.
    const avant = Math.max(
      Math.abs((migrant?.corps.position.x ?? 0) - nouveau.centre.x),
      Math.abs((migrant?.corps.position.y ?? 0) - nouveau.centre.y),
    );
    // Sur deux jours, on s'en approche (quitte à repartir manger ou boire ensuite).
    let apres = avant;
    for (let t = 0; t < 2 * 144; t++) {
      sim.avancer(1);
      apres = Math.min(
        apres,
        Math.max(
          Math.abs((migrant?.corps.position.x ?? 0) - nouveau.centre.x),
          Math.abs((migrant?.corps.position.y ?? 0) - nouveau.centre.y),
        ),
      );
    }
    expect(apres).toBeLessThan(avant);
  }, 120_000);

  it("une bande attirée par un stock plein négocie un tribut devant un village fort, pille un village faible", () => {
    const sim = colonie();
    const v = sim.villages.villages[0];
    if (v === undefined) throw new Error("pas de village");
    const chef = adultes(sim)[0];
    if (chef === undefined) throw new Error("personne");
    entrepotPlein(sim, chef, 100);
    expect(nourritureDe(sim, v)).toBeGreaterThanOrEqual(100);
    sim.villages.bandes.push({
      id: "bande-test",
      taille: 3,
      position: { x: v.centre.x + 20, y: v.centre.y },
      etat: "approche",
      cible: v.id,
      depuisJour: sim.horloge.moment().jourAbsolu,
      butin: 0,
    });
    // Un village fort : au moins six adultes armés.
    for (const p of adultes(sim)) {
      p.corps.inventaire.objets.push({ type: "lance", solidite: 100 });
    }
    expect(forceDe(sim, v)).toBeGreaterThanOrEqual(6);
    const avant = nourritureDe(sim, v);
    for (let i = 0; i < 8; i++) heureVillages(sim, sim.rng.fork(`t${String(i)}`));
    const bande = sim.villages.bandes[0];
    expect(bande?.etat === "negocie" || bande?.etat === "parti").toBe(true);
    expect(sim.villages.compteurs.tributs).toBe(1);
    expect(nourritureDe(sim, v)).toBeLessThan(avant);
    expect(sim.journal.parType("raid").some((e) => e.details.genre === "tribut")).toBe(true);
    // Un village faible se fait piller.
    const sim2 = colonie(6);
    const w = sim2.villages.villages[0];
    const chef2 = adultes(sim2)[0];
    if (w === undefined || chef2 === undefined) throw new Error("personne");
    entrepotPlein(sim2, chef2, 100);
    for (const p of sim2.vivants()) if (p.id !== chef2.id) p.corps.stade = "enfant";
    sim2.villages.bandes.push({
      id: "bande-test",
      taille: 6,
      position: { x: w.centre.x + 8, y: w.centre.y },
      etat: "approche",
      cible: w.id,
      depuisJour: sim2.horloge.moment().jourAbsolu,
      butin: 0,
    });
    for (let i = 0; i < 4; i++) heureVillages(sim2, sim2.rng.fork(`t${String(i)}`));
    expect(sim2.villages.compteurs.pillages).toBe(1);
    expect(sim2.journal.parType("raid").some((e) => e.details.genre === "pillage")).toBe(true);
  });

  it("une caravane porte un surplus vers un manque et fait voyager une invention ; un vol entre villages est un casus belli", () => {
    const sim = colonie(8, 12);
    const v = sim.villages.villages[0];
    if (v === undefined) throw new Error("pas de village");
    // Un second village à la main : la troisième famille s'installe à quarante tuiles.
    const famille = v.familles[2];
    if (famille === undefined) throw new Error("trois familles attendues");
    v.familles = v.familles.filter((f) => f !== famille);
    const site = { x: v.centre.x + 40, y: v.centre.y };
    sim.grille.tuile(site.x, site.y);
    sim.villages.compteurs.villages += 1;
    sim.villages.villages.push({
      id: "v-2",
      nom: `le village des ${famille}`,
      familles: [famille],
      centre: site,
      fondeJour: 0,
      origine: "schisme",
      enRoute: [],
    });
    const v2 = sim.villages.villages[1];
    if (v2 === undefined) throw new Error("pas de second village");
    const gens2 = habitants(sim, v2);
    for (const p of gens2) p.corps.position = { ...site };
    const chef1 = habitants(sim, v)[0];
    const chef2 = gens2[0];
    if (chef1 === undefined || chef2 === undefined) throw new Error("personne");
    entrepotPlein(sim, chef1, 80);
    // Le premier village connaît le filet, pas le second.
    for (const p of habitants(sim, v))
      p.savoirs.set("filet", { force: 1, origine: null, depuis: 0 });
    for (const p of gens2) p.savoirs.delete("filet");
    const r = relationEntre(sim.villages, v.id, "v-2");
    r.attitude = 30;
    sim.villages.derniereCaravaneJour = -100;
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(sim.villages.caravanes.length).toBe(1);
    const c = sim.villages.caravanes[0];
    expect(c?.invention).toBe("filet");
    for (let i = 0; i < 12; i++) heureVillages(sim, sim.rng.fork(`c${String(i)}`));
    expect(c?.etat).toBe("arrivee");
    expect(sim.journal.parType("caravane").some((e) => e.details.genre === "arrivee")).toBe(true);
    expect(gens2.some((p) => (p.savoirs.get("filet")?.force ?? 0) >= 0.6)).toBe(true);
    expect(sim.villages.routes).toHaveLength(1);
    expect(r.attitude).toBeGreaterThan(30);
    // Un vol du second village chez le premier : casus belli, et l'attitude chute.
    const voleur = gens2[1] ?? chef2;
    sim.emettre(
      "vol",
      voleur,
      {
        batiment: "x",
        famille: chef1.identite.nomFamille,
        ressource: "baies",
        quantite: 1,
        temoins: 1,
      },
      6,
    );
    expect(r.casusBelli).not.toBeNull();
    expect(r.attitude).toBeLessThan(30);
  }, 60_000);

  it("la guerre ne se déclare qu'avec un casus belli, se borne à deux batailles et finit par le prix du sang", () => {
    const sim = colonie(8, 12);
    const v = sim.villages.villages[0];
    if (v === undefined) throw new Error("pas de village");
    const famille = v.familles[2];
    if (famille === undefined) throw new Error("trois familles attendues");
    v.familles = v.familles.filter((f) => f !== famille);
    const site = { x: v.centre.x + 40, y: v.centre.y };
    sim.grille.tuile(site.x, site.y);
    sim.villages.villages.push({
      id: "v-2",
      nom: `le village des ${famille}`,
      familles: [famille],
      centre: site,
      fondeJour: 0,
      origine: "schisme",
      enRoute: [],
    });
    const r = relationEntre(sim.villages, v.id, "v-2");
    r.attitude = -80;
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(r.etat).toBe("paix"); // pas de casus belli : pas de guerre
    r.casusBelli = "un vol";
    r.attitude = -80;
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(r.etat).toBe("guerre");
    expect(sim.journal.parType("village").some((e) => e.details.genre === "guerre")).toBe(true);
    // Les batailles, dix jours d'écart, deux au plus, puis la paix.
    for (let j = 0; j < 30 && r.etat === "guerre"; j++) {
      r.attitude = Math.min(r.attitude, -50);
      sim.avancerJusquaAube();
      sim.avancer(1);
    }
    expect(r.batailles).toBeLessThanOrEqual(2);
    expect(r.etat).toBe("paix");
    expect(
      sim.journal.parType("village").filter((e) => e.details.genre === "bataille").length,
    ).toBe(r.batailles);
    expect(sim.journal.parType("village").some((e) => e.details.genre === "paix")).toBe(true);
    expect(sim.villages.compteurs.paix).toBe(1);
  }, 120_000);

  it("les villages se sauvegardent et se restaurent, et une sauvegarde v3 fonde le premier village", () => {
    const sim = colonie();
    const copie = Simulation.restaurer(JSON.parse(JSON.stringify(sim.sauvegarder())));
    expect(copie.villages.villages[0]?.familles).toEqual(sim.villages.villages[0]?.familles);
    sim.avancer(150);
    copie.avancer(150);
    expect(copie.journal.empreinte()).toBe(sim.journal.empreinte());
    const brute = JSON.parse(JSON.stringify(sim.sauvegarder())) as {
      version: number;
      etat: { villages?: unknown };
    };
    brute.version = 3;
    delete brute.etat.villages;
    const ancienne = Simulation.restaurer(brute);
    expect(ancienne.villages.villages).toHaveLength(1);
    expect(ancienne.villages.villages[0]?.familles.length).toBe(3);
    ancienne.avancer(50);
  });

  it("sur soixante jours, tout tient ensemble : villages, veillées, psyché", async () => {
    const sim = Simulation.creer({ seed: 3 });
    sim.config.brain.conseilsParJour = 0;
    await joursAsync(sim, 60);
    expect(sim.villages.villages.length).toBeGreaterThanOrEqual(1);
    expect(sim.vivants().length).toBeGreaterThan(0);
    const p = sim.vivants()[0];
    if (p !== undefined) expect(relationAvec(p, p.id)).toBeDefined();
  }, 120_000);
});
