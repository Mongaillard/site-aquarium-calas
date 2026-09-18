import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { planifier } from "../src/actions/planificateur.js";
import { executerTick } from "../src/actions/executeur.js";
import { prochainBatimentNecessaire } from "../src/monde.js";
import { choisirSite } from "../src/actions/planificateur.js";
import { optionsConseil } from "../src/cerveau/conseil.js";
import { niveau } from "../src/agents/competences.js";
import type { Personnage } from "../src/agents/personnage.js";
import { FAVEUR_MAX, jourDuCiel, niveauCulte } from "../src/monde/divin.js";
import { Grille } from "../src/monde/grille.js";

function colonie(): Simulation {
  const sim = Simulation.creer({ seed: 11, population: { initiale: 6, familles: 2 } });
  sim.avancer(144);
  sim.config.brain.conseilsParJour = 0;
  sim.faveur.valeur = 40;
  return sim;
}

function adulte(sim: Simulation): Personnage {
  const p = sim.vivants().find((x) => x.corps.stade === "adulte");
  if (p === undefined) throw new Error("aucun adulte");
  return p;
}

function tuileLibre(sim: Simulation, pos: { x: number; y: number }): { x: number; y: number } {
  for (let r = 1; r <= 6; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const t = sim.grille.tuileOuNull(pos.x + dx, pos.y + dy);
        if (t !== null && t.batiment === null && t.gisement === null && t.biome === "prairie")
          return { x: t.x, y: t.y };
      }
  throw new Error("aucune tuile libre");
}

function prier(sim: Simulation, p: Personnage): void {
  const plan = planifier(sim, p, { type: "prier" });
  if (!plan.ok) throw new Error(plan.raison);
  const actions = [...plan.plan];
  let action = actions.shift();
  for (let i = 0; i < 60 && action !== undefined; i++) {
    const r = executerTick(sim, p, action);
    if (r.statut === "echec") throw new Error(r.raison);
    if (r.statut === "terminee") action = actions.shift();
  }
}

describe("mode Dieu v3 : épreuves lourdes et Épiphanie", () => {
  it("le gel impose trois jours de neige, la sécheresse dix jours de canicule et des gisements réduits", () => {
    const sim = colonie();
    const p = adulte(sim);
    const pos = p.corps.position;
    expect(sim.exercer({ pouvoir: "gel", x: pos.x, y: pos.y }).ok).toBe(true);
    expect(sim.meteo).toBe("neige");
    const jour = sim.horloge.moment().jourAbsolu;
    for (let j = 1; j <= 2; j++) {
      sim.avancerJusquaAube();
      sim.avancer(1);
      expect([sim.horloge.moment().jourAbsolu, sim.meteo]).toEqual([jour + j, "neige"]);
    }
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(sim.meteo).not.toBe("neige");
    expect(sim.meteoForcee).toBeNull();
    // Sécheresse : les baies alentour sont réduites de moitié.
    sim.faveur.valeur = 40;
    let baies = null;
    for (const t of sim.grille.toutes())
      if (
        t.gisement?.type === "baies" &&
        Grille.distance(t, pos) <= 12 &&
        t.gisement.quantite >= 4
      ) {
        baies = t.gisement;
        break;
      }
    if (baies === null) throw new Error("pas de baies");
    const avant = baies.quantite;
    expect(sim.exercer({ pouvoir: "secheresse", x: pos.x, y: pos.y }).ok).toBe(true);
    expect(sim.meteo).toBe("canicule");
    expect(baies.quantite).toBe(Math.floor(avant / 2));
    // La météo forcée survit à une sauvegarde.
    const copie = Simulation.restaurer(JSON.parse(JSON.stringify(sim.sauvegarder())));
    expect(copie.meteoForcee?.meteo).toBe("canicule");
  });

  it("la fièvre envoyée rend malade une fois ; la secousse ébranle et fracture ; l'Épiphanie fait monter d'un niveau", () => {
    const sim = colonie();
    const p = adulte(sim);
    const pos = p.corps.position;
    expect(sim.exercer({ pouvoir: "fievre", x: pos.x, y: pos.y, cibleId: p.id }).ok).toBe(true);
    expect(p.corps.etat.maladies.some((m) => m.type === "fievre_des_eaux")).toBe(true);
    sim.faveur.recharges.clear();
    expect(sim.exercer({ pouvoir: "fievre", x: pos.x, y: pos.y, cibleId: p.id })).toEqual({
      ok: false,
      raison: "sans_effet",
    });
    const site = tuileLibre(sim, pos);
    const abri = sim.fonderChantier("abri", site, p);
    abri.etat = "termine";
    abri.solidite = 100;
    sim.faveur.valeur = 40;
    const r = sim.exercer({ pouvoir: "secousse", x: site.x, y: site.y });
    expect(r.ok).toBe(true);
    expect(abri.solidite).toBe(50);
    expect(p.besoins.securite).toBeLessThanOrEqual(60);
    expect(sim.faveur.reputation).toBeLessThan(0);
    sim.faveur.valeur = 40;
    p.experience.peche = 45; // niveau 2
    const q = sim.vivants().find((x) => x.id !== p.id);
    if (q) q.corps.position = { ...p.corps.position };
    const e = sim.exercer({ pouvoir: "epiphanie", x: pos.x, y: pos.y, cibleId: p.id });
    expect(e.ok).toBe(true);
    expect(niveau(p.experience.peche)).toBe(3);
    expect(p.humeur.some((m) => m.cle === "epiphanie")).toBe(true);
    expect(q?.humeur.some((m) => m.cle === "fete")).toBe(true);
  });
});

describe("mode Dieu v3 : culte, gardien et leçons du ciel", () => {
  it("le culte suit la foi moyenne et relève la faveur maximale", () => {
    const sim = colonie();
    for (const p of sim.vivants()) p.foi = 7;
    expect(niveauCulte(sim)).toBe(2);
    jourDuCiel(sim, sim.faveur);
    expect(sim.faveur.culte).toBe(2);
    expect(sim.faveur.max).toBe(FAVEUR_MAX + 20);
    expect(sim.etatFaveur().culte).toBe(2);
    for (const p of sim.vivants()) p.foi = 1;
    jourDuCiel(sim, sim.faveur);
    expect(sim.faveur.max).toBe(FAVEUR_MAX);
  });

  it("qui prie cinq fois à l'autel en devient le gardien", () => {
    const sim = colonie();
    const p = adulte(sim);
    const site = tuileLibre(sim, p.corps.position);
    const autel = sim.fonderChantier("autel", site, p);
    autel.etat = "termine";
    autel.termineAuTick = sim.tick;
    expect(sim.titre(p) ?? "").not.toContain("gardien");
    p.prieresAutel = 5;
    expect(sim.titre(p)).toMatch(/gardien(ne)? de l'autel/);
  });

  it("deux prières exaucées enseignent « le ciel écoute », trois silences « ne pas attendre le ciel », une épreuve reconnue « le ciel frappe »", () => {
    const sim = colonie();
    const p = adulte(sim);
    p.foi = 6;
    for (let i = 0; i < 2; i++) {
      p.besoins.faim = 30;
      p.dernierePriere = -1;
      prier(sim, p);
      sim.faveur.valeur = 40;
      sim.faveur.recharges.clear();
      expect(
        sim.exercer({ pouvoir: "pluie", x: p.corps.position.x, y: p.corps.position.y }).ok,
      ).toBe(true);
    }
    expect(p.prieresExaucees).toBe(2);
    expect(p.savoirs.get("le_ciel_ecoute")?.force).toBe(1);
    // Silences : trois prières laissées sans réponse pendant plus de trois jours.
    const q = sim.vivants().find((x) => x.id !== p.id && x.corps.stade === "adulte");
    if (!q) throw new Error("vide");
    for (let i = 0; i < 3; i++) {
      q.priere = { tick: sim.tick - 4 * 144, sujet: "faim", autel: false, exaucee: false };
      jourDuCiel(sim, sim.faveur);
    }
    expect(q.prieresSansReponse).toBe(3);
    expect(q.savoirs.get("ne_pas_attendre_le_ciel")?.force).toBe(1);
    // Épreuve reconnue : un témoin de foi suffisante retient que le ciel frappe.
    for (const x of sim.vivants()) x.foi = 6;
    sim.faveur.valeur = 40;
    const site = tuileLibre(sim, p.corps.position);
    expect(sim.exercer({ pouvoir: "foudre", x: site.x, y: site.y }).ok).toBe(true);
    const temoin = sim.personnage(sim.journal.parType("divin").at(-1)?.acteur ?? "");
    if (temoin === undefined) throw new Error("aucun témoin");
    expect(temoin.savoirs.get("le_ciel_frappe")?.force).toBe(1);
  });
});

describe("mode Dieu v3 : migration conseillée", () => {
  it("après cinq jours de faim, Claude peut conseiller de partir ; la famille suit et bâtit loin du vieux foyer", () => {
    const sim = colonie();
    const p = adulte(sim);
    const famille = sim
      .vivants()
      .filter((x) => x.identite.nomFamille === p.identite.nomFamille && x.corps.stade !== "enfant");
    const site = tuileLibre(sim, p.corps.position);
    const foyer = sim.fonderChantier("abri", site, p);
    foyer.etat = "termine";
    foyer.termineAuTick = sim.tick;
    expect(optionsConseil(sim, p).some((o) => o.id.startsWith("migrer:"))).toBe(false);
    p.drapeaux.joursFaim = 5;
    const option = optionsConseil(sim, p).find((o) => o.id.startsWith("migrer:"));
    expect(option).toBeDefined();
    if (!option) throw new Error("vide");
    expect(sim.demanderConseil(p.id)).toBe(true);
    const q = sim.questionEnCours;
    if (q === null) throw new Error("vide");
    expect(q.options.some((o) => o.id === option.id)).toBe(true);
    expect(
      sim.conseiller({
        questionId: q.id,
        personnageId: p.id,
        choix: option.id,
        pensee: "On s'en va.",
      }).ok,
    ).toBe(true);
    expect(p.ambition).toMatchObject({ genre: "migrer", issue: "en_cours" });
    const origine = p.ambition?.origine;
    if (origine === undefined) throw new Error("origine absente");
    for (const m of famille) expect(m.ambition?.genre).toBe("migrer");
    // Près du foyer : rien de neuf à bâtir ; loin : un abri, sur place.
    expect(prochainBatimentNecessaire(sim, p)).not.toBe("abri");
    p.corps.position = { x: origine.x + 20, y: origine.y };
    if (sim.grille.tuileOuNull(p.corps.position.x, p.corps.position.y) === null)
      throw new Error("hors monde");
    expect(prochainBatimentNecessaire(sim, p)).toBe("abri");
    const nouveau = choisirSite(sim, p, "abri");
    expect(nouveau).not.toBeNull();
    if (nouveau) expect(Grille.distance(nouveau, p.corps.position)).toBeLessThanOrEqual(6);
    // Un abri terminé loin du vieux foyer accomplit la migration.
    const loin = tuileLibre(sim, p.corps.position);
    const abri = sim.fonderChantier("abri", loin, p);
    abri.etat = "termine";
    abri.termineAuTick = sim.tick;
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(p.ambition?.issue).toBe("accomplie");
  });
});
