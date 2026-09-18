import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { coutEffectif, niveauRequis } from "../src/monde/divin.js";
import { heureCreatures } from "../src/monde/creatures.js";
import { COUT_CREATURE, FICHES_POUVOIR, NIVEAU_POUVOIR } from "@sdv/protocole";

function colonie(domaine: "moisson" | "orage" | "feu" | "songes" | null = "moisson"): Simulation {
  const sim = Simulation.creer({
    seed: 17,
    population: { initiale: 8, familles: 2 },
    dieu: { domaine },
  });
  sim.avancer(144);
  sim.config.brain.conseilsParJour = 0;
  sim.faveur.valeur = 40;
  return sim;
}

describe("M25 : l'identité du ciel (domaine, paliers, coûts, créatures)", () => {
  it("le domaine rend ses pouvoirs favoris moins chers et plus tôt, ceux du domaine opposé l'inverse", () => {
    const sim = colonie("moisson");
    expect(sim.faveur.domaine).toBe("moisson");
    // Favori : la pluie (6 ✦ au catalogue) coûte 4 ; étranger : la braise (feu) coûte plus.
    expect(coutEffectif(sim.faveur, "pluie")).toBe(Math.round(FICHES_POUVOIR.pluie.cout * 0.6));
    expect(coutEffectif(sim.faveur, "braise")).toBe(Math.round(FICHES_POUVOIR.braise.cout * 1.25));
    expect(coutEffectif(sim.faveur, "songe")).toBe(FICHES_POUVOIR.songe.cout);
    // Le troupeau (palier 1) s'ouvre dès le rang 0 pour le Semeur ; la sécheresse (2) passe à 3.
    expect(niveauRequis(sim.faveur, "troupeau")).toBe(NIVEAU_POUVOIR.troupeau - 1);
    expect(niveauRequis(sim.faveur, "secheresse")).toBe(NIVEAU_POUVOIR.secheresse + 1);
    const sansVisage = colonie(null);
    expect(coutEffectif(sansVisage.faveur, "pluie")).toBe(FICHES_POUVOIR.pluie.cout);
    // Sans visage : rien n'est verrouillé.
    expect(niveauRequis(sansVisage.faveur, "troupeau")).toBe(0);
    expect(niveauRequis(sansVisage.faveur, "epiphanie")).toBe(0);
  });

  it("un pouvoir au-dessus du rang est verrouillé (dès qu'un domaine est pris) ; le rang suit le culte", () => {
    const sim = colonie("orage");
    const p = sim.vivants()[0];
    if (p === undefined) throw new Error("personne");
    expect(sim.faveur.rang).toBe(sim.faveur.culte);
    const pos = p.corps.position;
    const r = sim.exercer({ pouvoir: "epiphanie", x: pos.x, y: pos.y, cibleId: p.id });
    expect(r).toEqual({ ok: false, raison: "verrouille" });
    sim.faveur.rang = 3;
    expect(sim.exercer({ pouvoir: "epiphanie", x: pos.x, y: pos.y, cibleId: p.id }).ok).toBe(true);
    const f = sim.etatFaveur();
    expect(f.verrous.epiphanie).toBe(3);
    expect(f.couts.epiphanie).toBeGreaterThan(FICHES_POUVOIR.epiphanie.cout);
  });

  // Ce scénario avance une saison entière : il frôlait ses cinq secondes par défaut et
  // flanchait sous la charge de la suite (mesuré 5,7 s). Son délai est désormais explicite.
  it(
    "chaque usage renchérit le pouvoir d'un quart, et la saison en oublie la moitié",
    { timeout: 30_000 },
    () => {
      const sim = colonie(null);
      const p = sim.vivants()[0];
      if (p === undefined) throw new Error("personne");
      const base = FICHES_POUVOIR.regard.cout;
      const pos = p.corps.position;
      sim.faveur.valeur = 100;
      sim.faveur.max = 100;
      expect(coutEffectif(sim.faveur, "regard")).toBe(base);
      expect(sim.exercer({ pouvoir: "regard", x: pos.x, y: pos.y }).ok).toBe(true);
      expect(coutEffectif(sim.faveur, "regard")).toBe(Math.max(1, Math.round(base * 1.25)));
      expect(sim.exercer({ pouvoir: "regard", x: pos.x + 3, y: pos.y }).ok).toBe(true);
      expect(sim.faveur.usages.get("regard")).toBe(2);
      expect(coutEffectif(sim.faveur, "regard")).toBe(Math.max(1, Math.round(base * 1.5)));
      // La sauvegarde retient les usages ; la saison suivante les divise par deux.
      const copie = Simulation.restaurer(sim.sauvegarder());
      expect(copie.faveur.usages.get("regard")).toBe(2);
      while (copie.horloge.moment().jourDeSaison !== 1) copie.avancerJusquaAube();
      copie.avancer(1);
      expect(copie.faveur.usages.get("regard")).toBe(1);
    },
  );

  it("le domaine se choisit une fois, en cours de partie aussi, et se sauvegarde", () => {
    const sim = colonie(null);
    expect(sim.faveur.domaine).toBeNull();
    expect(sim.choisirDomaine("orage")).toBe(true);
    expect(sim.choisirDomaine("feu")).toBe(false);
    expect(sim.faveur.domaine).toBe("orage");
    expect(sim.journal.parType("divin").some((e) => e.details.pouvoir === "domaine")).toBe(true);
    const copie = Simulation.restaurer(sim.sauvegarder());
    expect(copie.faveur.domaine).toBe("orage");
    expect(coutEffectif(copie.faveur, "foudre")).toBe(Math.round(FICHES_POUVOIR.foudre.cout * 0.6));
  });

  it("le gardien coûte de la faveur, demande le rang 2 et un domaine, repousse une meute en chasse", () => {
    const sim = colonie(null);
    const p = sim.vivants()[0];
    if (p === undefined) throw new Error("personne");
    const pos = { x: p.corps.position.x, y: p.corps.position.y };
    expect(sim.invoquer({ genre: "gardien", ...pos })).toEqual({
      ok: false,
      raison: "sans_domaine",
    });
    sim.choisirDomaine("moisson");
    expect(sim.invoquer({ genre: "gardien", ...pos })).toEqual({ ok: false, raison: "verrouille" });
    sim.faveur.rang = 2;
    sim.faveur.valeur = 10;
    expect(sim.invoquer({ genre: "gardien", ...pos })).toEqual({
      ok: false,
      raison: "faveur_insuffisante",
    });
    sim.faveur.valeur = 60;
    const r = sim.invoquer({ genre: "gardien", ...pos });
    expect(r.ok).toBe(true);
    expect(sim.faveur.valeur).toBe(60 - COUT_CREATURE);
    expect(sim.invoquer({ genre: "gardien", ...pos })).toEqual({ ok: false, raison: "deja_la" });
    expect(sim.creatures.size).toBe(1);
    // Une meute en chasse à portée : repoussée, la menace s'éteint.
    const meute = sim.ajouterTroupeau({ x: pos.x + 5, y: pos.y }, "loup", 4);
    meute.proieHumaine = p.id;
    meute.enMenace = true;
    sim.danger.menace = {
      meute: meute.id,
      depuis: sim.tick,
      preavis: sim.tick,
      cible: p.id,
      alarmeDonnee: false,
    };
    heureCreatures(sim, sim.creatures, sim.rng.fork("test"));
    expect(meute.etat).toBe("fuite");
    expect(meute.proieHumaine).toBeNull();
    expect(sim.danger.menace).toBeNull();
    expect(sim.journal.parType("divin").some((e) => e.details.pouvoir === "gardien_repousse")).toBe(
      true,
    );
    // Et le monde tourne avec son gardien.
    sim.avancer(12);
    expect(sim.creatures.size).toBe(1);
    // La sauvegarde garde la créature ; vingt jours plus tard elle s'en va.
    const copie = Simulation.restaurer(sim.sauvegarder());
    expect(copie.creatures.size).toBe(1);
    for (let j = 0; j < 21; j++) copie.avancerJusquaAube();
    expect(copie.creatures.size).toBe(0);
    expect(
      copie.journal.parType("divin").some((e) => e.details.pouvoir === "creature_partie"),
    ).toBe(true);
  });

  it("le fléau rôde autour de son poste, ronge les gisements et fait peur", () => {
    const sim = colonie("feu");
    sim.faveur.rang = 2;
    sim.faveur.valeur = 60;
    const p = sim.vivants()[0];
    if (p === undefined) throw new Error("personne");
    const pos = { x: p.corps.position.x, y: p.corps.position.y };
    // Un gisement plein sous le poste, pour mesurer la morsure.
    const t = sim.grille.tuile(pos.x, pos.y);
    t.gisement = {
      type: "baies",
      quantite: 20,
      max: 20,
      tauxRegen: 0,
      outilRequis: null,
      epuiseDepuis: null,
    };
    const securite = p.besoins.securite;
    p.besoins.securite = 90;
    const r = sim.invoquer({ genre: "fleau", ...pos });
    expect(r.ok).toBe(true);
    const c = [...sim.creatures.values()][0];
    if (c === undefined) throw new Error("pas de fléau");
    p.corps.position = { x: c.position.x, y: c.position.y };
    heureCreatures(sim, sim.creatures, sim.rng.fork("test"));
    expect(
      Math.max(Math.abs(c.position.x - pos.x), Math.abs(c.position.y - pos.y)),
    ).toBeLessThanOrEqual(6);
    expect(p.besoins.securite).toBeLessThan(90);
    sim.avancer(12);
    expect(t.gisement.quantite).toBeLessThan(20);
    expect(securite).toBeGreaterThan(0);
  });

  it("les vieilles sauvegardes reçoivent un ciel sans visage, sans créature", () => {
    const sim = colonie(null);
    const brut = sim.sauvegarder() as unknown as {
      version: number;
      etat: {
        creatures?: unknown;
        faveur: Record<string, unknown>;
        config: Record<string, unknown>;
      };
    };
    delete brut.etat.creatures;
    delete brut.etat.faveur.domaine;
    delete brut.etat.faveur.usages;
    delete brut.etat.config.dieu;
    brut.version = 4;
    const copie = Simulation.restaurer(brut);
    expect(copie.faveur.domaine).toBeNull();
    expect(copie.creatures.size).toBe(0);
    expect(copie.config.dieu.domaine).toBeNull();
  });
});
