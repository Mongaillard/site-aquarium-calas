import { describe, expect, it } from "vitest";
import { FICHES_POUVOIR } from "@sdv/protocole";
import { Simulation } from "../src/simulation.js";
import { FAVEUR_INITIALE, FAVEUR_MAX, BUCHES_BRAISE } from "../src/monde/divin.js";
import { blesser } from "../src/agents/corps.js";
import { apprendre } from "../src/savoirs/lecons.js";
import { LECONS } from "../src/savoirs/catalogue.js";
import type { Lecon } from "../src/savoirs/catalogue.js";
import type { Personnage } from "../src/agents/personnage.js";

function colonie(): Simulation {
  const sim = Simulation.creer({ seed: 11, population: { initiale: 6, familles: 2 } });
  sim.avancer(144);
  return sim;
}

/** Une tuile constructible sans bâtiment, près d'une position. */
function tuileLibre(sim: Simulation, pos: { x: number; y: number }): { x: number; y: number } {
  for (let r = 1; r <= 4; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const t = sim.grille.tuileOuNull(pos.x + dx, pos.y + dy);
        if (t !== null && t.batiment === null && t.biome === "prairie") return { x: t.x, y: t.y };
      }
  throw new Error("aucune tuile libre");
}

function adulte(sim: Simulation): Personnage {
  const p = sim.vivants().find((x) => x.corps.stade === "adulte");
  if (p === undefined) throw new Error("aucun adulte");
  return p;
}

describe("mode Dieu : faveur et pouvoirs", () => {
  it("la faveur commence à 20, plafonne à 40, monte chaque jour et quand la colonie prospère", () => {
    const sim = colonie();
    expect(sim.faveur.valeur).toBeGreaterThanOrEqual(FAVEUR_INITIALE + 1); // une aube passée
    expect(sim.faveur.max).toBe(FAVEUR_MAX);
    const aube = sim.faveur.valeur;
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(sim.faveur.valeur).toBeGreaterThanOrEqual(aube + 1);
    const avant = sim.faveur.valeur;
    sim.emettre("naissance", adulte(sim), {}, 5);
    expect(sim.faveur.valeur).toBe(avant + 3);
    sim.faveur.valeur = 39;
    sim.emettre("invention", adulte(sim), {}, 5);
    expect(sim.faveur.valeur).toBe(FAVEUR_MAX);
    const etat = sim.etatFaveur();
    expect(etat).toMatchObject({ valeur: FAVEUR_MAX, max: FAVEUR_MAX, miracles: 0 });
  });

  it("refuse sans faveur, puis fait payer, journalise et impose une recharge", () => {
    const sim = colonie();
    const p = adulte(sim);
    const pos = p.corps.position;
    sim.faveur.valeur = 3;
    expect(sim.exercer({ pouvoir: "pluie", x: pos.x, y: pos.y })).toEqual({
      ok: false,
      raison: "faveur_insuffisante",
    });
    sim.faveur.valeur = 20;
    // Des témoins qui croient : ils verront la main du ciel.
    for (const x of sim.vivants()) x.foi = 5;
    const r = sim.exercer({ pouvoir: "pluie", x: pos.x, y: pos.y });
    expect(r.ok).toBe(true);
    expect(sim.meteo).toBe("pluie");
    expect(sim.faveur.valeur).toBe(20 - FICHES_POUVOIR.pluie.cout);
    expect(sim.faveur.miracles).toBe(1);
    expect(sim.journal.compte("divin")).toBe(1);
    const e = sim.journal.parType("divin")[0];
    expect(e?.details.pouvoir).toBe("pluie");
    const temoin = sim.personnage(e?.acteur ?? "");
    if (temoin === undefined) throw new Error("aucun témoin");
    expect(sim.exercer({ pouvoir: "pluie", x: pos.x, y: pos.y })).toEqual({
      ok: false,
      raison: "recharge",
    });
    // Hors du monde généré : rien à toucher (et aucun morceau n'est généré pour l'occasion).
    const morceaux = sim.grille.nombreMorceaux;
    expect(sim.exercer({ pouvoir: "regard", x: 100_000, y: 0 })).toEqual({
      ok: false,
      raison: "hors_monde",
    });
    expect(sim.grille.nombreMorceaux).toBe(morceaux);
    // Le témoin s'en souvient et s'en réjouit.
    expect(
      temoin.memoire.tous().some((s) => s.texte.startsWith("Le ciel nous a fait une grâce")),
    ).toBe(true);
    expect(temoin.humeur.some((m) => m.cle === "miracle" && m.valeur > 0)).toBe(true);
  });

  it("la sève regarnit les gisements alentour, souches comprises", () => {
    const sim = colonie();
    const p = adulte(sim);
    const pos = p.corps.position;
    let g = null;
    for (let dy = -6; dy <= 6 && g === null; dy++)
      for (let dx = -6; dx <= 6 && g === null; dx++) {
        const t = sim.grille.tuileOuNull(pos.x + dx, pos.y + dy);
        if (t?.gisement) g = t.gisement;
      }
    if (g === null) throw new Error("pas de gisement près du village");
    g.quantite = 0;
    g.epuiseDepuis = sim.tick;
    const r = sim.exercer({ pouvoir: "seve", x: pos.x, y: pos.y });
    expect(r.ok).toBe(true);
    expect(g.quantite).toBe(g.max);
    expect(g.epuiseDepuis).toBeNull();
  });

  it("le souffle et la main qui guérissent agissent sur une personne, et refusent le vide", () => {
    const sim = colonie();
    const p = adulte(sim);
    const pos = p.corps.position;
    p.corps.etat.fatigue = 60;
    p.besoins.moral = 30;
    expect(sim.exercer({ pouvoir: "souffle", x: pos.x, y: pos.y })).toEqual({
      ok: false,
      raison: "cible_invalide",
    });
    const r = sim.exercer({ pouvoir: "souffle", x: pos.x, y: pos.y, cibleId: p.id });
    expect(r.ok).toBe(true);
    expect(p.corps.etat.fatigue).toBe(0);
    expect(p.besoins.moral).toBe(45);
    expect(p.humeur.some((m) => m.cle === "souffle")).toBe(true);
    // Guérison : rien à guérir → sans effet et rien payé.
    p.corps.sante = 100;
    const faveur = sim.faveur.valeur;
    expect(sim.exercer({ pouvoir: "guerison", x: pos.x, y: pos.y, cibleId: p.id })).toEqual({
      ok: false,
      raison: "sans_effet",
    });
    expect(sim.faveur.valeur).toBe(faveur);
    blesser(sim, p, "morsure", 2, "jambe", "sous les crocs");
    p.corps.sante = 50;
    expect(p.corps.etat.blessures).toHaveLength(1);
    const g = sim.exercer({ pouvoir: "guerison", x: pos.x, y: pos.y, cibleId: p.id });
    expect(g.ok).toBe(true);
    expect(p.corps.etat.blessures).toHaveLength(0);
    expect(p.corps.sante).toBe(80);
  });

  it("la braise rallume un feu avec vingt bûches, consolide un autre bâtiment, ignore un chantier", () => {
    const sim = colonie();
    const p = adulte(sim);
    const pos = tuileLibre(sim, p.corps.position);
    const feu = sim.fonderChantier("feu_de_camp", pos, p);
    expect(sim.exercer({ pouvoir: "braise", x: pos.x, y: pos.y })).toEqual({
      ok: false,
      raison: "cible_invalide",
    });
    feu.etat = "termine";
    feu.termineAuTick = sim.tick;
    feu.allume = false;
    feu.reserveBois = 0;
    const r = sim.exercer({ pouvoir: "braise", x: pos.x, y: pos.y });
    expect(r.ok).toBe(true);
    expect(feu.allume).toBe(true);
    expect(feu.reserveBois).toBe(BUCHES_BRAISE);
    const pos2 = tuileLibre(sim, { x: p.corps.position.x + 6, y: p.corps.position.y + 6 });
    const abri = sim.fonderChantier("abri", pos2, p);
    abri.etat = "termine";
    abri.solidite = 50;
    sim.faveur.recharges.clear();
    expect(sim.exercer({ pouvoir: "braise", x: pos2.x, y: pos2.y }).ok).toBe(true);
    expect(abri.solidite).toBe(80);
  });

  it("la foudre ébranle le bâtiment, brûle qui est dessous, effraie les autres et amène l'orage", () => {
    const sim = colonie();
    const p = adulte(sim);
    const pos = tuileLibre(sim, p.corps.position);
    p.corps.position = { ...pos };
    const abri = sim.fonderChantier("abri", pos, p);
    abri.etat = "termine";
    abri.solidite = 100;
    sim.meteo = "clair";
    const securite = p.besoins.securite;
    const r = sim.exercer({ pouvoir: "foudre", x: pos.x, y: pos.y });
    expect(r.ok).toBe(true);
    expect(abri.solidite).toBe(60);
    expect(p.corps.etat.blessures.some((b) => b.contexte === "frappé par la foudre")).toBe(true);
    expect(p.besoins.securite).toBeLessThan(securite);
    expect(sim.meteo).toBe("orage");
    expect(sim.journal.parType("divin")[0]?.importance).toBe(8);
  });

  it("le songe enseigne la leçon la plus utile, et n'a rien à dire à qui sait tout", () => {
    const sim = colonie();
    const p = adulte(sim);
    const pos = p.corps.position;
    const r = sim.exercer({ pouvoir: "songe", x: pos.x, y: pos.y, cibleId: p.id });
    expect(r.ok).toBe(true);
    const appris = [...p.savoirs.entries()].find(([, v]) => v.origine === "un songe");
    expect(appris).toBeDefined();
    expect(appris?.[1].force).toBe(1);
    expect(sim.journal.compte("lecon")).toBe(1);
    for (const l of Object.keys(LECONS) as Lecon[]) apprendre(p, l, 1, null, sim.tick);
    sim.faveur.recharges.clear();
    expect(sim.exercer({ pouvoir: "songe", x: pos.x, y: pos.y, cibleId: p.id })).toEqual({
      ok: false,
      raison: "sans_effet",
    });
  });

  it("le regard révèle les alentours sans témoin ni réaction", () => {
    const sim = colonie();
    // Une tuile générée mais jamais vue, loin de tout le monde.
    const loin = [...sim.grille.toutes()]
      .filter((t) => !sim.grille.estDecouverte(t.x, t.y))
      .sort((a, b) => Math.hypot(b.x, b.y) - Math.hypot(a.x, a.y) || a.x - b.x || a.y - b.y)[0];
    if (loin === undefined) throw new Error("tout est découvert");
    const avant = sim.grille.nombreDecouvertes;
    const r = sim.exercer({ pouvoir: "regard", x: loin.x, y: loin.y });
    expect(r.ok).toBe(true);
    expect(sim.grille.nombreDecouvertes).toBeGreaterThan(avant);
    expect(sim.journal.parType("divin")[0]?.acteur).toBeNull();
    // Pas de recharge : on peut regarder encore.
    expect(sim.exercer({ pouvoir: "regard", x: loin.x, y: loin.y }).ok).toBe(true);
  });

  it("un même miracle au même tick produit exactement le même monde (déterminisme)", () => {
    const mondes = [0, 1].map(() => {
      const sim = colonie();
      const p = adulte(sim);
      sim.exercer({ pouvoir: "foudre", x: p.corps.position.x, y: p.corps.position.y });
      sim.exercer({ pouvoir: "pluie", x: p.corps.position.x, y: p.corps.position.y });
      sim.avancer(300);
      return sim;
    });
    const [a, b] = mondes;
    if (!a || !b) throw new Error("vide");
    expect(a.journal.taille).toBe(b.journal.taille);
    expect(a.journal.tous().map((e) => `${e.type}:${JSON.stringify(e.details)}`)).toEqual(
      b.journal.tous().map((e) => `${e.type}:${JSON.stringify(e.details)}`),
    );
    expect(a.faveur.valeur).toBe(b.faveur.valeur);
  });
});
