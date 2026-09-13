import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { RuleBrain } from "../src/cerveau/rule-brain.js";
import { percevoir, percevoirLeger } from "../src/cerveau/perception.js";
import { planifier } from "../src/actions/planificateur.js";
import { choisirSite } from "../src/actions/planificateur.js";
import { ajouterObjet } from "../src/agents/inventaire.js";
import { apprendre } from "../src/savoirs/lecons.js";
import { combattre } from "../src/agents/combat.js";
import { prochainBatimentNecessaire, tuileEnceinteManquante } from "../src/monde.js";
import { heureTroupeau } from "../src/monde/faune.js";
import type { Espece, Troupeau } from "../src/monde/faune.js";
import {
  ATTAQUES_PAR_SAISON,
  enclos,
  etatDangerInitial,
  heureDanger,
  prochainCrepuscule,
  vulnerabilite,
} from "../src/monde/danger.js";
import { Grille } from "../src/monde/grille.js";
import type { Position } from "../src/monde/grille.js";
import { grilleUniforme, joursAsync } from "./utils.js";

function meute(
  sim: Simulation,
  position: Position,
  taille: number,
  espece: Espece = "loup",
): Troupeau {
  const id = `test-${espece}-${String(sim.troupeaux.size)}`;
  const t: Troupeau = {
    id,
    espece,
    position: { ...position },
    gite: { ...position },
    giteEte: { ...position },
    taille,
    mefiance: 0,
    etat: "pature",
    cible: null,
    faim: 3,
    derniereMiseBas: 0,
    proieHumaine: null,
    enMenace: false,
    rng: sim.rng.fork(id),
  };
  sim.troupeaux.set(id, t);
  return t;
}

function mondePlat(seed: number, initiale: number): Simulation {
  const sim = Simulation.creerAvecGrille(
    { seed, population: { initiale, familles: 1 } },
    grilleUniforme(60, 60, "prairie"),
  );
  for (const t of [...sim.troupeaux.values()]) sim.troupeaux.delete(t.id);
  return sim;
}

/** Avance jusqu'à la prochaine nuit (21 h). */
function jusquaLaNuit(sim: Simulation): void {
  while (!sim.horloge.moment().estNuit || sim.horloge.moment().heure < 21) sim.avancer(1);
}

describe("la nuit menace : directeur de danger", () => {
  it("une meute affamée près du village devient une menace, laisse des traces, puis attaque au crépuscule suivant", () => {
    const sim = mondePlat(4, 3);
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    const abri = sim.fonderChantier("abri", { x: 30, y: 30 }, p);
    abri.etat = "termine";
    for (const x of sim.personnages) x.corps.position = { x: 30, y: 33 };
    const loups = meute(sim, { x: 55, y: 30 }, 4);
    const etat = etatDangerInitial();
    const rng = sim.rng.fork("test-danger");
    const creer = (): Troupeau => loups;
    // Les trente premiers jours sont de grâce : aucune menace tant que la colonie s'installe.
    expect(heureDanger(sim, etat, rng, creer)).toEqual([]);
    etat.graceJusqua = 0;
    // Menace ouverte : préavis jusqu'au crépuscule, au moins une demi-journée plus tard.
    let effets = heureDanger(sim, etat, rng, creer);
    expect(effets.map((e) => e.genre)).toEqual(["menace"]);
    expect(etat.menace?.meute).toBe(loups.id);
    expect(loups.enMenace).toBe(true);
    expect(etat.menace?.preavis).toBe(prochainCrepuscule(sim.tick, 72, 144));
    expect(etat.attaquesSaison).toBe(1);
    // Des traces : un humain éveillé passe à moins de quinze tuiles de la meute.
    p.corps.position = { x: 45, y: 30 };
    p.corps.endormi = false;
    effets = heureDanger(sim, etat, rng, creer);
    expect(effets.map((e) => e.genre)).toEqual(["traces"]);
    expect(effets[0]?.personnage?.id).toBe(p.id);
    p.corps.position = { x: 30, y: 33 };
    // Avant le crépuscule, la meute rôde à une douzaine de tuiles du village.
    heureDanger(sim, etat, rng, creer);
    expect(loups.cible).not.toBeNull();
    if (loups.cible) expect(Grille.distance(loups.cible, { x: 30, y: 30 })).toBeLessThanOrEqual(13);
    // La nuit venue, elle désigne la proie la plus vulnérable : l'isolé qui dort dehors.
    while (sim.tick < (etat.menace?.preavis ?? 0)) sim.avancer(1);
    const [, seul, groupe] = sim.personnages;
    if (!seul || !groupe) throw new Error("vide");
    seul.corps.position = { x: 40, y: 40 };
    seul.corps.endormi = true;
    groupe.corps.position = { x: 30, y: 30 }; // sur l'abri : protégé
    p.corps.position = { x: 30, y: 31 };
    expect(vulnerabilite(sim, groupe, loups)).toBe(0);
    expect(vulnerabilite(sim, seul, loups)).toBeGreaterThan(vulnerabilite(sim, p, loups));
    loups.position = { x: 44, y: 44 };
    heureDanger(sim, etat, rng, creer);
    expect(etat.menace?.cible).toBe(seul.id);
    expect(loups.proieHumaine).toBe(seul.id);
    // Le budget : une menace par saison, pas plus.
    const etat2 = etatDangerInitial();
    etat2.attaquesSaison = ATTAQUES_PAR_SAISON;
    etat2.saisonCle = etat.saisonCle;
    expect(heureDanger(sim, etat2, rng, creer)).toEqual([]);
  });

  it("une meute ne s'approche pas d'un feu allumé et ne franchit pas une palissade", () => {
    const sim = mondePlat(6, 1);
    const p = sim.personnages[0];
    if (!p) throw new Error("vide");
    p.corps.position = { x: 30, y: 30 };
    const feu = sim.fonderChantier("feu_de_camp", { x: 30, y: 31 }, p);
    feu.etat = "termine";
    feu.allume = true;
    feu.reserveBois = 12;
    const loups = meute(sim, { x: 40, y: 30 }, 3);
    loups.enMenace = true;
    loups.proieHumaine = p.id;
    for (let h = 0; h < 6; h++) heureTroupeau(sim, loups);
    expect(Grille.distance(loups.position, feu.position)).toBeGreaterThan(4);
    // Une enceinte de pieux : la position est enclose, les loups restent dehors.
    feu.allume = false;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== 3) continue;
        const pal = sim.fonderChantier("palissade", { x: 30 + dx, y: 30 + dy }, p);
        pal.etat = "termine";
      }
    }
    expect(enclos(sim, { x: 30, y: 30 })).toBe(true);
    expect(enclos(sim, { x: 40, y: 30 })).toBe(false);
    expect(vulnerabilite(sim, p, loups)).toBe(0);
    loups.position = { x: 40, y: 30 };
    for (let h = 0; h < 6; h++) heureTroupeau(sim, loups);
    expect(Grille.distance(loups.position, p.corps.position)).toBeGreaterThanOrEqual(3);
  });
});

describe("la nuit menace : combat, alarme et défenses", () => {
  it("le combat est résolu en six rounds au plus : seul on est mordu, à trois armés on repousse la meute", () => {
    const sim = mondePlat(8, 4);
    const [p, a, b, c] = sim.personnages;
    if (!p || !a || !b || !c) throw new Error("vide");
    for (const x of sim.personnages) {
      x.corps.stade = "adulte";
      x.corps.endormi = false;
    }
    let mordu = 0;
    let repousses = 0;
    for (let i = 0; i < 40; i++) {
      p.corps.sante = 100;
      p.corps.etat.blessures.length = 0;
      p.corps.position = { x: 20, y: 20 };
      for (const x of [a, b, c]) x.corps.position = { x: 5, y: 5 };
      const loups = meute(sim, { x: 21, y: 20 }, 4);
      const r = combattre(sim, loups, p);
      expect(r.rounds).toBeLessThanOrEqual(6);
      expect(r.defenseurs).toBe(1);
      if (r.blesses > 0) mordu += 1;
      if (r.issue === "repousses") repousses += 1;
      expect(loups.etat === "fuite" || loups.taille <= 0).toBe(true);
      sim.troupeaux.delete(loups.id);
    }
    expect(mordu).toBeGreaterThan(20);
    // À plusieurs et armés : la meute est repoussée bien plus souvent, et on y laisse des loups.
    let repoussesArmes = 0;
    let loupsTues = 0;
    for (const x of [p, a, b, c])
      ajouterObjet(x.corps.inventaire, { type: "lance", solidite: 1000 });
    for (let i = 0; i < 40; i++) {
      for (const x of [p, a, b, c]) {
        x.corps.sante = 100;
        x.corps.etat.blessures.length = 0;
      }
      p.corps.position = { x: 20, y: 20 };
      a.corps.position = { x: 21, y: 21 };
      b.corps.position = { x: 19, y: 21 };
      c.corps.position = { x: 20, y: 22 };
      const loups = meute(sim, { x: 21, y: 20 }, 4);
      const r = combattre(sim, loups, p);
      expect(r.defenseurs).toBe(4);
      if (r.issue === "repousses") repoussesArmes += 1;
      loupsTues += r.loupsTues;
      sim.troupeaux.delete(loups.id);
    }
    expect(repoussesArmes).toBeGreaterThan(repousses);
    expect(repoussesArmes).toBeGreaterThanOrEqual(30);
    expect(loupsTues).toBeGreaterThan(20);
    expect(sim.journal.compte("blessure")).toBeGreaterThan(0);
    expect(p.memoire.tous().some((s) => s.texte.includes("loups"))).toBe(true);
  });

  it("l'alarme fait fuir les uns vers l'abri et envoie les adultes armés défendre l'enfant visé", () => {
    const sim = mondePlat(10, 3);
    const [enfant, arme, sansArme] = sim.personnages;
    if (!enfant || !arme || !sansArme) throw new Error("vide");
    enfant.corps.stade = "enfant";
    enfant.identite.parents = [arme.id, sansArme.id];
    arme.corps.stade = "adulte";
    sansArme.corps.stade = "adulte";
    ajouterObjet(arme.corps.inventaire, { type: "lance", solidite: 100 });
    sansArme.corps.inventaire.objets.length = 0;
    const abri = sim.fonderChantier("abri", { x: 30, y: 30 }, arme);
    abri.etat = "termine";
    enfant.corps.position = { x: 36, y: 30 };
    arme.corps.position = { x: 32, y: 30 };
    sansArme.corps.position = { x: 31, y: 30 };
    const loups = meute(sim, { x: 40, y: 30 }, 3);
    loups.enMenace = true;
    loups.proieHumaine = enfant.id;
    for (const x of sim.personnages) x.drapeaux.alerteJusqua = sim.tick + 36;
    const legereArme = percevoirLeger(sim, arme);
    expect(legereArme.menace?.cible).toBe(enfant.id);
    expect(legereArme.menace?.cibleEstMonEnfant).toBe(true);
    expect(new RuleBrain(arme).urgence(legereArme)).toEqual({ type: "defendre", cible: enfant.id });
    expect(new RuleBrain(sansArme).urgence(percevoirLeger(sim, sansArme))).toEqual({
      type: "fuir",
    });
    expect(new RuleBrain(enfant).urgence(percevoirLeger(sim, enfant))).toEqual({ type: "fuir" });
    const fuite = planifier(sim, sansArme, { type: "fuir" });
    expect(fuite.ok).toBe(true);
    if (fuite.ok) expect(fuite.plan.map((a) => a.type)).toEqual(["deplacer", "attendre"]);
    const defense = planifier(sim, arme, { type: "defendre", cible: enfant.id });
    expect(defense.ok).toBe(true);
    if (defense.ok) expect(defense.plan[defense.plan.length - 1]?.type).toBe("defendre");
  });

  it("la leçon des murs mène à une enceinte de pieux autour de l'abri ; celle du veilleur, à veiller au feu", () => {
    const sim = mondePlat(12, 2);
    const [p, q] = sim.personnages;
    if (!p || !q) throw new Error("vide");
    p.corps.stade = "adulte";
    q.corps.stade = "adulte";
    const abri = sim.fonderChantier("abri", { x: 30, y: 30 }, p);
    abri.etat = "termine";
    const feu = sim.fonderChantier("feu_de_camp", { x: 32, y: 30 }, p);
    feu.etat = "termine";
    feu.allume = true;
    feu.reserveBois = 12;
    const entrepot = sim.fonderChantier("entrepot", { x: 28, y: 30 }, p);
    entrepot.etat = "termine";
    p.corps.position = { x: 30, y: 31 };
    expect(prochainBatimentNecessaire(sim, p)).toBeNull();
    apprendre(p, "murs_contre_les_loups", 1, "Test", sim.tick);
    expect(prochainBatimentNecessaire(sim, p)).toBe("palissade");
    const site = choisirSite(sim, p, "palissade");
    expect(site).not.toBeNull();
    if (site) expect(Grille.distance(site, abri.position)).toBe(3);
    expect(tuileEnceinteManquante(sim, p)).toEqual(site);
    // L'enceinte complète : plus rien à bâtir, et l'abri est enclos.
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== 3) continue;
        const t = sim.grille.tuile(30 + dx, 30 + dy);
        if (t.batiment !== null) continue;
        sim.fonderChantier("palissade", { x: 30 + dx, y: 30 + dy }, p).etat = "termine";
      }
    }
    expect(tuileEnceinteManquante(sim, p)).toBeNull();
    expect(prochainBatimentNecessaire(sim, p)).toBeNull();
    expect(enclos(sim, abri.position)).toBe(true);
    // Le veilleur : la nuit, avec la leçon et une lance, on veille au feu.
    jusquaLaNuit(sim);
    ajouterObjet(q.corps.inventaire, { type: "lance", solidite: 100 });
    apprendre(q, "veilleur_de_nuit", 1, "Test", sim.tick);
    q.besoins.sommeil = 80;
    q.corps.position = { x: 33, y: 30 };
    const candidats = new RuleBrain(q)
      .candidats(percevoir(sim, q))
      .map((c) => JSON.stringify(c.intention));
    expect(candidats).toContain(JSON.stringify({ type: "veiller" }));
    const veille = planifier(sim, q, { type: "veiller" });
    expect(veille.ok).toBe(true);
    if (veille.ok) expect(veille.plan[0]?.type).toBe("veiller");
  });

  it(
    "sur cent vingt jours, des menaces s'ouvrent, l'alarme est donnée et les loups sont tenus à distance",
    { timeout: 180000 },
    async () => {
      const sim = Simulation.creer({ seed: 42 });
      await joursAsync(sim, 120);
      expect(sim.journal.compteDetail("menace:menace")).toBeGreaterThan(1);
      expect(sim.journal.compte("alarme")).toBeGreaterThan(0);
      expect(
        sim.journal.parType("deces").filter((e) => e.details.cause === "loups").length,
      ).toBeLessThanOrEqual(2);
      expect(sim.vivants().length).toBeGreaterThanOrEqual(10);
    },
  );
});
