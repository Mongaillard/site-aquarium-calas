import { describe, expect, it } from "vitest";
import {
  Simulation,
  lancerBatailleMeute,
  lancerRaid,
  peutConquerir,
  relationEntre,
} from "../src/index.js";
import type { Troupeau } from "../src/index.js";
import type { Personnage } from "../src/index.js";
import { ajouter, ajouterObjet, quantite } from "../src/agents/inventaire.js";
import { SEUILS } from "../src/monde/generation.js";

/**
 * Deux villages à quarante tuiles, en guerre déclarée : la famille détachée est
 * déplacée sur son site, chaque adulte reçoit une lance.
 */
function deuxVillagesEnGuerre(seed: number): {
  sim: Simulation;
  a: string;
  b: string;
  defenseurs: Personnage[];
} {
  const sim = Simulation.creer({ seed, population: { initiale: 12, familles: 3 } });
  sim.config.brain.conseilsParJour = 0;
  sim.avancer(144);
  const v = sim.villages.villages[0];
  if (v === undefined) throw new Error("pas de village");
  const famille = v.familles[2];
  if (famille === undefined) throw new Error("trois familles attendues");
  v.familles = v.familles.filter((f) => f !== famille);
  const site = { x: v.centre.x + 40, y: v.centre.y };
  // Un site de terre ferme : on cherche la première tuile praticable vers l'est.
  for (let k = 0; k < 30; k++) {
    const t = sim.grille.tuile(site.x + k, site.y);
    if (t.altitude >= SEUILS.mer && t.biome !== "eau_peu_profonde" && t.biome !== "montagne") {
      site.x += k;
      break;
    }
  }
  sim.villages.villages.push({
    id: "v-2",
    nom: `le village des ${famille}`,
    familles: [famille],
    centre: site,
    fondeJour: 0,
    origine: "schisme",
    enRoute: [],
  });
  const defenseurs = sim.vivants().filter((p) => p.identite.nomFamille === famille);
  defenseurs.forEach((p, i) => {
    p.corps.position = { x: site.x + (i % 3) - 1, y: site.y + Math.floor(i / 3) - 1 };
  });
  for (const p of sim.vivants())
    if (p.corps.stade === "adulte")
      ajouterObjet(p.corps.inventaire, { type: "lance", solidite: 40 });
  const r = relationEntre(sim.villages, v.id, "v-2");
  r.etat = "guerre";
  r.casusBelli = "un vol";
  r.attitude = -80;
  r.depuisJour = -10;
  sim.villages.derniereBatailleJour = -100;
  return { sim, a: v.id, b: "v-2", defenseurs };
}

describe("M32 : la bataille tick par tick", () => {
  it("une troupe se lève à l'aube, marche, donne l'assaut, et la bataille se conclut", () => {
    const { sim, defenseurs } = deuxVillagesEnGuerre(11);
    // Le tick 144 est une aube : la troupe se lève dès le premier tick.
    sim.avancer(1);
    const b = sim.villages.batailles[0];
    expect(b).toBeDefined();
    if (b === undefined) return;
    expect(b.phase).toBe("marche");
    expect(b.attaquant.guerriers.length).toBeGreaterThanOrEqual(2);
    for (const id of b.attaquant.guerriers)
      expect(sim.personnage(id)?.drapeaux.bataille).toBe(b.id);
    expect(sim.journal.parType("village").some((e) => e.details.genre === "marche")).toBe(true);
    // La troupe part : ses guerriers veulent combattre, et ils bougent.
    let assaut = false;
    for (let t = 0; t < 600 && b.phase !== "finie"; t++) {
      sim.avancer(1);
      if (b.phase === "combat") assaut = true;
    }
    expect(assaut).toBe(true);
    expect(b.phase).toBe("finie");
    expect(b.issue).not.toBeNull();
    expect(b.combatTick).not.toBeNull();
    // Les coups ont été consignés, pour l'animation ; personne ne reste engagé.
    expect(b.frappes.length).toBeGreaterThan(0);
    for (const p of sim.personnages) expect(p.drapeaux.bataille ?? null).toBeNull();
    const fin = sim.journal.parType("village").find((e) => e.details.genre === "bataille");
    expect(fin).toBeDefined();
    expect(fin?.details.issue).toBe(b.issue);
    expect(sim.villages.compteurs.batailles).toBe(1);
    // Le vaincu tient encore debout : la relation compte la bataille ; sinon il a été conquis (M35).
    if (sim.villages.villages.some((v) => v.id === "v-2"))
      expect(relationEntre(sim.villages, "v-2", sim.villages.villages[0]?.id ?? "").batailles).toBe(
        1,
      );
    else
      expect(sim.journal.parType("village").some((e) => e.details.genre === "conquete")).toBe(true);
    // Les défenseurs ont pris les armes en voyant venir la troupe.
    expect(b.defenseur.forceInitiale).toBeGreaterThan(0);
    expect(b.defenseur.forceInitiale).toBeLessThanOrEqual(defenseurs.length);
  }, 120_000);

  it("deux mondes de même graine livrent la même bataille", () => {
    const issue = (): string => {
      const { sim } = deuxVillagesEnGuerre(11);
      sim.avancer(1);
      for (let t = 0; t < 600 && sim.villages.batailles[0]?.phase !== "finie"; t++) sim.avancer(1);
      const b = sim.villages.batailles[0];
      return `${String(b?.issue)}|${String(b?.frappes.length)}|${String(b?.attaquant.blesses)}|${String(b?.defenseur.blesses)}`;
    };
    expect(issue()).toBe(issue());
  }, 120_000);

  it("une bataille se sauvegarde et se restaure en cours de route", () => {
    const { sim } = deuxVillagesEnGuerre(11);
    sim.avancer(30);
    const b = sim.villages.batailles[0];
    expect(b?.phase).not.toBe("finie");
    const copie = Simulation.restaurer(JSON.parse(JSON.stringify(sim.sauvegarder())));
    const bc = copie.villages.batailles[0];
    expect(bc?.id).toBe(b?.id);
    expect(bc?.attaquant.guerriers).toEqual(b?.attaquant.guerriers);
    for (const id of bc?.attaquant.guerriers ?? [])
      expect(copie.personnage(id)?.drapeaux.bataille).toBe(bc?.id);
    for (let t = 0; t < 600 && bc?.phase !== "finie"; t++) copie.avancer(1);
    expect(bc?.phase).toBe("finie");
  }, 120_000);

  it("un raid se joue sur la carte : les pillards repoussés s'en vont bredouilles (M32c)", () => {
    const sim = Simulation.creer({ seed: 5, population: { initiale: 12, familles: 3 } });
    sim.config.brain.conseilsParJour = 0;
    sim.avancer(144);
    const v = sim.villages.villages[0];
    if (v === undefined) throw new Error("pas de village");
    for (const p of sim.vivants())
      if (p.corps.stade === "adulte")
        ajouterObjet(p.corps.inventaire, { type: "lance", solidite: 100 });
    sim.villages.bandes.push({
      id: "bande-test",
      taille: 3,
      position: { x: v.centre.x + 2, y: v.centre.y },
      etat: "approche",
      cible: v.id,
      depuisJour: sim.horloge.moment().jourAbsolu,
      butin: 0,
    });
    // Un village faible aux yeux de la bande (force < 2 × taille) mais bien armé pour le combat :
    // on force le raid directement.
    const bande = sim.villages.bandes[0];
    if (bande === undefined) throw new Error("pas de bande");
    const b = lancerRaid(sim, bande, v);
    expect(b.genre).toBe("raid");
    expect(b.attaquant.membres).toHaveLength(3);
    expect(bande.etat).toBe("combat");
    expect(sim.journal.parType("raid").some((e) => e.details.genre === "assaut")).toBe(true);
    for (let t = 0; t < 400 && b.phase !== "finie"; t++) sim.avancer(1);
    expect(b.phase).toBe("finie");
    expect(b.frappes.length).toBeGreaterThan(0);
    expect(["pille", "repousse"]).toContain(bande.etat);
    if (b.issue === "attaquant") expect(sim.villages.compteurs.pillages).toBe(1);
    else expect(sim.villages.compteurs.raidsRepousses).toBe(1);
    for (const p of sim.personnages) expect(p.drapeaux.bataille ?? null).toBeNull();
  }, 60_000);

  it("une meute qui atteint sa proie se bat tick par tick et un seul événement combat résume (M32c)", () => {
    const sim = Simulation.creer({ seed: 5, population: { initiale: 12, familles: 3 } });
    sim.config.brain.conseilsParJour = 0;
    sim.avancer(144);
    const proie = sim.vivants().find((p) => p.corps.stade === "adulte");
    if (proie === undefined) throw new Error("personne");
    const pos = proie.corps.position;
    const loups: Troupeau = {
      id: "meute-test",
      espece: "loup",
      position: { x: pos.x + 1, y: pos.y },
      gite: { x: pos.x + 20, y: pos.y },
      giteEte: { x: pos.x + 20, y: pos.y },
      taille: 4,
      mefiance: 0,
      etat: "pature",
      cible: null,
      faim: 6,
      derniereMiseBas: 0,
      proieHumaine: proie.id,
      enMenace: true,
      rng: sim.rng.fork("meute-test"),
    };
    sim.troupeaux.set(loups.id, loups);
    const b = lancerBatailleMeute(sim, loups, proie);
    expect(b.genre).toBe("meute");
    expect(b.attaquant.membres).toHaveLength(4);
    expect(b.defenseur.guerriers).toContain(proie.id);
    for (let t = 0; t < 300 && b.phase !== "finie"; t++) sim.avancer(1);
    expect(b.phase).toBe("finie");
    const combat = sim.journal.parType("combat").at(-1);
    expect(combat).toBeDefined();
    expect(combat?.details.contre).toBe("loups");
    expect(["repousses", "fuite", "mort"]).toContain(combat?.details.issue);
    expect(loups.proieHumaine).toBeNull();
    expect(loups.enMenace).toBe(false);
    expect(loups.taille).toBe(b.attaquant.membres.length);
    for (const p of sim.personnages) expect(p.drapeaux.bataille ?? null).toBeNull();
  }, 60_000);

  it("un village pris est pillé de moitié et de ses outils, puis conquis s'il est deux fois plus faible (M35)", () => {
    const { sim, a, b, defenseurs } = deuxVillagesEnGuerre(11);
    const perdant = sim.villages.villages.find((v) => v.id === b);
    const gagnant = sim.villages.villages.find((v) => v.id === a);
    if (perdant === undefined || gagnant === undefined) throw new Error("villages");
    // Les vaincus n'ont pas d'armes et sont trop mal en point pour se battre ; leur stock est plein.
    const chef = defenseurs[0];
    if (chef === undefined) throw new Error("personne");
    for (const p of defenseurs) {
      p.corps.inventaire.objets = [];
      p.corps.sante = 30;
    }
    const entrepot = sim.fonderChantier(
      "entrepot",
      { x: perdant.centre.x + 1, y: perdant.centre.y + 1 },
      chef,
    );
    entrepot.etat = "termine";
    entrepot.travailRestant = 0;
    if (entrepot.stock === null) throw new Error("stock");
    ajouter(entrepot.stock, "poisson_fume", 40);
    entrepot.stock.objets.push({ type: "hache_pierre", solidite: 20 });
    expect(peutConquerir(sim, gagnant, perdant)).toBe(true);
    sim.avancer(1);
    const bataille = sim.villages.batailles[0];
    for (let t = 0; t < 600 && bataille?.phase !== "finie"; t++) sim.avancer(1);
    expect(bataille?.issue).toBe("attaquant");
    const fin = sim.journal.parType("village").find((e) => e.details.genre === "bataille");
    expect(fin?.details.pris).toBe(true);
    // La famille a mangé et pris dans son stock entre-temps : on vérifie la moitié de ce qui restait.
    const butin = Number(fin?.details.butin);
    expect(butin).toBeGreaterThan(0);
    expect(quantite(entrepot.stock, "poisson_fume")).toBeLessThanOrEqual(40 - butin);
    expect(entrepot.stock.objets).toHaveLength(0);
    // Le butin est dans les poches des vainqueurs (ou leur stock), pas perdu.
    const porteurs = (bataille?.attaquant.guerriers ?? [])
      .map((id) => sim.personnage(id))
      .filter((p) => p !== undefined);
    const rapporte = porteurs.reduce((n, p) => n + quantite(p.corps.inventaire, "poisson_fume"), 0);
    expect(rapporte).toBeGreaterThan(0);
    if (Number(fin?.details.outils) > 0)
      expect(
        porteurs.some((p) => p.corps.inventaire.objets.some((o) => o.type === "hache_pierre")),
      ).toBe(true);
    // La conquête : le village vaincu n'est plus, ses familles et ses gens passent au vainqueur.
    const conquete = sim.journal.parType("village").find((e) => e.details.genre === "conquete");
    expect(conquete).toBeDefined();
    expect(sim.villages.villages.map((v) => v.id)).toEqual([a]);
    expect(gagnant.familles).toContain(chef.identite.nomFamille);
    for (const p of defenseurs.filter((x) => x.vivant)) {
      expect(gagnant.enRoute).toContain(p.id);
      expect(p.ambition?.genre).toBe("migrer");
      expect(p.ambition?.cible).toBe(a);
      expect(p.prestige).toBe(0);
    }
    expect(sim.villages.compteurs.conquetes).toBe(1);
    expect(sim.villages.relations.some((r) => r.a === b || r.b === b)).toBe(false);
    // Une seule conquête par an : un second village trop faible ne serait pas conquis tout de suite.
    const autre = { ...perdant, id: "v-3", familles: [] as string[] };
    expect(peutConquerir(sim, gagnant, autre)).toBe(false);
  }, 120_000);
});
