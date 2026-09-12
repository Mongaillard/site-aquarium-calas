import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { RuleBrain } from "../src/cerveau/rule-brain.js";
import { percevoir } from "../src/cerveau/perception.js";
import { planifier } from "../src/actions/planificateur.js";
import { executerTick } from "../src/actions/executeur.js";
import { prochainBatimentNecessaire } from "../src/monde.js";
import { ajouter } from "../src/agents/inventaire.js";
import { foiInitiale } from "../src/agents/personnage.js";
import type { Personnage } from "../src/agents/personnage.js";
import { INVENTIONS, SEUIL_SAVOIR } from "../src/savoirs/catalogue.js";
import type { Invention } from "../src/savoirs/catalogue.js";
import { apprendre } from "../src/savoirs/lecons.js";
import { attribueAuCiel, saisonSansMiracle } from "../src/monde/divin.js";

function colonie(): Simulation {
  const sim = Simulation.creer({ seed: 11, population: { initiale: 6, familles: 2 } });
  sim.avancer(144);
  sim.config.brain.conseilsParJour = 0;
  return sim;
}

function adulte(sim: Simulation): Personnage {
  const p = sim.vivants().find((x) => x.corps.stade === "adulte");
  if (p === undefined) throw new Error("aucun adulte");
  return p;
}

function tuileLibre(sim: Simulation, pos: { x: number; y: number }): { x: number; y: number } {
  for (let r = 1; r <= 5; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const t = sim.grille.tuileOuNull(pos.x + dx, pos.y + dy);
        if (t !== null && t.batiment === null && t.gisement === null && t.biome === "prairie")
          return { x: t.x, y: t.y };
      }
  throw new Error("aucune tuile libre");
}

/** Exécute le plan d'une intention jusqu'au bout (au plus `max` ticks), sans passer par la boucle. */
function jouer(
  sim: Simulation,
  p: Personnage,
  intention: Parameters<typeof planifier>[2],
  max = 60,
): void {
  const plan = planifier(sim, p, intention);
  if (!plan.ok) throw new Error(plan.raison);
  const actions = [...plan.plan];
  let action = actions.shift();
  for (let i = 0; i < max && action !== undefined; i++) {
    const r = executerTick(sim, p, action);
    if (r.statut === "echec") throw new Error(r.raison);
    if (r.statut === "terminee") action = actions.shift();
  }
}

describe("mode Dieu v2 : la foi", () => {
  it("naît des valeurs, s'hérite à moitié, et s'use une saison sans miracle", () => {
    expect(foiInitiale(["tradition", "plaisir"])).toBe(3);
    expect(foiInitiale(["curiosite"])).toBe(1);
    expect(foiInitiale(["famille", "richesse"])).toBe(2);
    const sim = colonie();
    const p = adulte(sim);
    const q = sim.vivants().find((x) => x.id !== p.id && x.corps.stade === "adulte");
    if (q === undefined) throw new Error("vide");
    p.foi = 8;
    q.foi = 6;
    const enfant = sim.naitre(p.identite.sexe === "F" ? p : q, p.identite.sexe === "F" ? q : p);
    expect(enfant.foi).toBe(4);
    p.dernierMiracleVu = 0;
    sim.horloge.avancer(sim.config.monde.joursParSaison * 144);
    saisonSansMiracle(sim);
    expect(p.foi).toBe(7);
    // Jamais sous la foi native : les valeurs restent.
    p.foi = foiInitiale(p.identite.valeurs);
    saisonSansMiracle(sim);
    expect(p.foi).toBe(foiInitiale(p.identite.valeurs));
  });

  it("le témoin voit la main du ciel selon sa foi et la réputation du dieu, et sa foi grandit", () => {
    expect(attribueAuCiel(3, true, 0)).toBe(false);
    expect(attribueAuCiel(4, true, 0)).toBe(true);
    expect(attribueAuCiel(5, true, -6)).toBe(false); // un dieu cruel : on ne croit plus à ses grâces
    expect(attribueAuCiel(2, false, 0)).toBe(true);
    expect(attribueAuCiel(3, false, 6)).toBe(false); // un dieu vénéré : on n'y croit pas
    const sim = colonie();
    const p = adulte(sim);
    for (const x of sim.vivants()) x.foi = 1;
    p.foi = 6;
    const r = sim.exercer({
      pouvoir: "souffle",
      x: p.corps.position.x,
      y: p.corps.position.y,
      cibleId: p.id,
    });
    expect(r.ok).toBe(true);
    const e = sim.journal.parType("divin").at(-1);
    expect(e?.details.attribue).toBe(true);
    expect(String(e?.details.reaction)).toContain("Le ciel nous a fait une grâce");
    expect(p.foi).toBe(7);
    expect(sim.faveur.reputation).toBe(1);
    p.foi = 1;
    sim.faveur.recharges.clear();
    sim.exercer({
      pouvoir: "souffle",
      x: p.corps.position.x,
      y: p.corps.position.y,
      cibleId: p.id,
    });
    expect(String(sim.journal.parType("divin").at(-1)?.details.reaction)).toContain(
      "Une chance inespérée",
    );
    const pos = tuileLibre(sim, p.corps.position);
    sim.faveur.valeur = 40;
    expect(sim.exercer({ pouvoir: "foudre", x: pos.x, y: pos.y }).ok).toBe(true);
    expect(sim.faveur.reputation).toBe(0);
  });
});

describe("mode Dieu v2 : prières et autel", () => {
  it("qui croit prie quand ça va mal, une fois par jour, et le ciel en tire de la faveur", () => {
    const sim = colonie();
    const p = adulte(sim);
    while (sim.horloge.moment().estNuit) sim.avancer(1);
    p.foi = 6;
    p.besoins.faim = 30;
    const cerveau = new RuleBrain(p);
    const candidats = cerveau.candidats(percevoir(sim, p));
    expect(candidats.some((c) => c.intention.type === "prier")).toBe(true);
    p.foi = 2;
    expect(cerveau.candidats(percevoir(sim, p)).some((c) => c.intention.type === "prier")).toBe(
      false,
    );
    p.foi = 6;
    const faveur = sim.faveur.valeur;
    jouer(sim, p, { type: "prier" });
    expect(p.priere).toMatchObject({ sujet: "faim", autel: false, exaucee: false });
    expect(sim.journal.compte("priere")).toBe(1);
    expect(sim.faveur.valeur).toBe(faveur + 1);
    expect(sim.faveur.prieres).toBe(1);
    expect(percevoir(sim, p).moi.peutPrier).toBe(false);
  });

  it("à l'autel, la prière dépose une offrande de nourriture", () => {
    const sim = colonie();
    const p = adulte(sim);
    p.foi = 6;
    p.besoins.chaleur = 30;
    const pos = tuileLibre(sim, p.corps.position);
    const autel = sim.fonderChantier("autel", pos, p);
    autel.etat = "termine";
    autel.termineAuTick = sim.tick;
    ajouter(p.corps.inventaire, "baies", 3);
    const faveur = sim.faveur.valeur;
    jouer(sim, p, { type: "prier" }, 200);
    expect(p.priere).toMatchObject({ sujet: "froid", autel: true });
    expect(p.corps.inventaire.ressources.baies).toBe(2);
    expect(sim.journal.parType("priere").at(-1)?.details.offrande).toBe("baies");
    expect(sim.faveur.valeur).toBe(faveur + 3);
    expect(sim.faveur.offrandes).toBe(1);
  });

  it("une famille qui croit bâtit un autel une fois logée", () => {
    const sim = colonie();
    const p = adulte(sim);
    const membres = sim.vivants().filter((x) => x.identite.nomFamille === p.identite.nomFamille);
    for (const m of membres) m.foi = 8;
    let pos = tuileLibre(sim, p.corps.position);
    for (const type of ["abri", "abri", "feu_de_camp", "entrepot", "maison"] as const) {
      const b = sim.fonderChantier(type, pos, p);
      b.etat = "termine";
      b.termineAuTick = sim.tick;
      if (type === "feu_de_camp") {
        b.allume = true;
        b.reserveBois = 20;
      }
      pos = tuileLibre(sim, { x: pos.x + 2, y: pos.y });
    }
    expect(prochainBatimentNecessaire(sim, p)).toBe("autel");
    for (const m of membres) m.foi = 2;
    expect(prochainBatimentNecessaire(sim, p)).not.toBe("autel");
  });

  it("un bienfait qui répond à une prière l'exauce : foi, faveur et souvenir", () => {
    const sim = colonie();
    const p = adulte(sim);
    p.foi = 5;
    p.besoins.faim = 30;
    jouer(sim, p, { type: "prier" });
    const faveur = sim.faveur.valeur;
    const r = sim.exercer({ pouvoir: "pluie", x: p.corps.position.x, y: p.corps.position.y });
    expect(r.ok).toBe(true);
    expect(p.priere?.exaucee).toBe(true);
    expect(p.foi).toBeGreaterThanOrEqual(7);
    expect(sim.faveur.exaucees).toBe(1);
    expect(sim.faveur.valeur).toBe(faveur - 6 + 2);
    expect(String(sim.journal.parType("divin").at(-1)?.details.exauces)).toContain(
      p.identite.prenom,
    );
    expect(p.memoire.tous().some((s) => s.texte.startsWith("Le ciel m'a entendu"))).toBe(true);
    expect(sim.prieresOuvertes()).toEqual([]);
  });
});

describe("mode Dieu v2 : providence", () => {
  it("répond de lui-même aux prières avec le premier pouvoir payable, une fois par prière", () => {
    const sim = colonie();
    const p = adulte(sim);
    p.foi = 5;
    p.besoins.faim = 30;
    jouer(sim, p, { type: "prier" });
    expect(p.priere?.exaucee).toBe(false);
    sim.faveur.valeur = 40;
    // Sans providence : rien ne se passe.
    sim.avancer(12);
    expect(p.priere?.exaucee).toBe(false);
    sim.definirProvidence(true);
    sim.avancer(6);
    expect(p.priere?.exaucee).toBe(true);
    const e = sim.journal.parType("divin").at(-1);
    expect(e?.details).toMatchObject({ pouvoir: "pluie", auto: true });
    expect(String(e?.details.exauces)).toContain(p.identite.prenom);
    expect(sim.faveur.miracles).toBe(1);
    // Une seule réponse par prière, et jamais sans faveur.
    sim.avancer(12);
    expect(sim.faveur.miracles).toBe(1);
    sim.faveur.valeur = 0;
    p.priere = { tick: sim.tick, sujet: "soin", autel: false, exaucee: false };
    sim.avancer(6);
    expect(p.priere.exaucee).toBe(false);
    // La providence survit à une sauvegarde.
    const copie = Simulation.restaurer(JSON.parse(JSON.stringify(sim.sauvegarder())));
    expect(copie.faveur.providence).toBe(true);
  });
});

describe("mode Dieu v2 : nouveaux pouvoirs", () => {
  it("le troupeau offert fait paître quatre mouflons, jamais sur l'eau ni un bâtiment", () => {
    const sim = colonie();
    const p = adulte(sim);
    const pos = tuileLibre(sim, p.corps.position);
    const avant = sim.troupeaux.size;
    const r = sim.exercer({ pouvoir: "troupeau", x: pos.x, y: pos.y });
    expect(r.ok).toBe(true);
    expect(sim.troupeaux.size).toBe(avant + 1);
    const t = [...sim.troupeaux.values()].at(-1);
    expect(t).toMatchObject({ espece: "mouflon", taille: 4, position: pos });
    const abri = sim.fonderChantier("abri", tuileLibre(sim, { x: pos.x + 3, y: pos.y }), p);
    sim.faveur.recharges.clear();
    sim.faveur.valeur = 40;
    expect(sim.exercer({ pouvoir: "troupeau", x: abri.position.x, y: abri.position.y })).toEqual({
      ok: false,
      raison: "cible_invalide",
    });
  });

  it("l'idée soufflée donne l'invention qui manque, et n'a rien à souffler à qui sait tout", () => {
    const sim = colonie();
    const p = adulte(sim);
    const pos = p.corps.position;
    const r = sim.exercer({ pouvoir: "idee", x: pos.x, y: pos.y, cibleId: p.id });
    expect(r.ok).toBe(true);
    const idee = [...p.savoirs.entries()].find(([, v]) => v.origine === "une inspiration");
    expect(idee?.[1].force).toBe(SEUIL_SAVOIR);
    expect(sim.journal.parType("idee").at(-1)?.details.source).toBe("divin");
    for (const i of Object.keys(INVENTIONS) as Invention[]) apprendre(p, i, 1, null, sim.tick);
    sim.faveur.recharges.clear();
    sim.faveur.valeur = 40;
    expect(sim.exercer({ pouvoir: "idee", x: pos.x, y: pos.y, cibleId: p.id })).toEqual({
      ok: false,
      raison: "sans_effet",
    });
  });

  it("les loups au bord du halo ouvrent une menace pour ce soir, une seule à la fois", () => {
    const sim = colonie();
    const p = adulte(sim);
    const pos = tuileLibre(sim, { x: p.corps.position.x + 8, y: p.corps.position.y });
    sim.faveur.valeur = 40;
    const r = sim.exercer({ pouvoir: "loups", x: pos.x, y: pos.y });
    expect(r.ok).toBe(true);
    const menace = sim.danger.menace;
    expect(menace).not.toBeNull();
    const meute = sim.troupeaux.get(menace?.meute ?? "");
    expect(meute).toMatchObject({ espece: "loup", taille: 3, enMenace: true });
    expect(sim.journal.parType("menace").at(-1)?.details.source).toBe("divin");
    sim.faveur.recharges.clear();
    expect(sim.exercer({ pouvoir: "loups", x: pos.x, y: pos.y })).toEqual({
      ok: false,
      raison: "sans_effet",
    });
    // Le directeur de danger prend la menace en charge comme une autre : elle vit ses heures,
    // puis se referme (proie trouvée, aube, ou meute repue) avec un répit.
    sim.avancer(2 * 144);
    expect(sim.danger.menace).toBeNull();
    expect(sim.danger.repitJusqua).toBeGreaterThan(0);
  });
});
