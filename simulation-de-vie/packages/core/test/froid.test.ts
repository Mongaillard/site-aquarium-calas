/**
 * M43 : on ne gèle plus en route. Les vingt-sept morts de froid mesurés étaient
 * tous dehors et éveillés, souvent avec vingt couchages libres à la maison : le
 * seuil d'alerte était fixe et ne disait rien de la distance à parcourir.
 */
import { describe, expect, it } from "vitest";
import { Simulation } from "../src/index.js";
import { seuilRentrer } from "../src/cerveau/rule-brain.js";
import { SEUILS_URGENCE } from "../src/cerveau/rule-brain.js";
import { percevoir } from "../src/cerveau/perception.js";
import { planifier } from "../src/actions/planificateur.js";
import { distanceChaleur } from "../src/monde.js";
import { ajouter } from "../src/agents/inventaire.js";
import { grilleUniforme } from "./utils.js";
import type { Personnage } from "../src/agents/personnage.js";

function monde(initiale = 2): Simulation {
  const sim = Simulation.creerAvecGrille(
    { seed: 4, population: { initiale, familles: 1 } },
    grilleUniforme(60, 60, "prairie", [{ x: 20, y: 20, biome: "eau_peu_profonde" }]),
  );
  for (const t of [...sim.troupeaux.values()]) sim.troupeaux.delete(t.id);
  return sim;
}

function premier(sim: Simulation): Personnage {
  const p = sim.personnages[0];
  if (p === undefined) throw new Error("monde vide");
  return p;
}

/** Le seuil tel que le cerveau le calcule, à telle distance et telle perte. */
function seuil(savoirs: readonly string[], distance: number, perte: number): number {
  return seuilRentrer({
    moi: { savoirs: new Set(savoirs) },
    distanceChaleur: distance,
    perteChaleurParTick: perte,
  } as Parameters<typeof seuilRentrer>[0]);
}

describe("M43 : le froid", () => {
  it("le seuil d'alerte grandit avec le trajet, et reste borné", () => {
    // Une nuit d'hiver coûte environ 1,1 point par tick, un pas prend un tick.
    const perte = 1.11;
    // À deux pas, l'ancien plancher suffit.
    expect(seuil([], 2, perte)).toBe(SEUILS_URGENCE.chaleur);
    // À vingt pas, il faut de quoi tenir le trajet et un peu plus.
    expect(seuil([], 20, perte)).toBeGreaterThan(30);
    expect(seuil([], 20, perte)).toBeGreaterThan(seuil([], 5, perte));
    // Jamais au-delà de quatre-vingts : sinon on ne sortirait plus l'hiver.
    expect(seuil([], 500, perte)).toBe(80);
    // La leçon relève le plancher, pas le plafond.
    expect(seuil(["rentrer_quand_on_gele"], 1, perte)).toBe(SEUILS_URGENCE.chaleur + 15);
    // Sans aucune chaleur connue, on en reste au plancher.
    expect(seuil([], Infinity, perte)).toBe(SEUILS_URGENCE.chaleur);
  });

  it("la perte de chaleur perçue suit la saison et la nuit", () => {
    const sim = monde();
    const p = premier(sim);
    const ete = percevoir(sim, p).perteChaleurParTick;
    while (sim.horloge.moment().saison !== "hiver") sim.avancerJusquaAube();
    while (!sim.horloge.moment().estNuit) sim.avancer(1);
    expect(percevoir(sim, p).perteChaleurParTick).toBeGreaterThan(ete);
  });

  it("la distance à la chaleur compte l'abri des siens et le feu allumé", () => {
    const sim = monde();
    const p = premier(sim);
    p.corps.position = { x: 10, y: 10 };
    expect(distanceChaleur(sim, p)).toBe(Infinity);
    const abri = sim.fonderChantier("abri", { x: 18, y: 10 }, p);
    abri.etat = "termine";
    expect(distanceChaleur(sim, p)).toBe(8);
    const feu = sim.fonderChantier("feu_de_camp", { x: 13, y: 10 }, p);
    feu.etat = "termine";
    // Un feu éteint ne réchauffe personne.
    expect(distanceChaleur(sim, p)).toBe(8);
    feu.allume = true;
    expect(distanceChaleur(sim, p)).toBe(3);
  });

  it("sans abri ni feu, on allume un feu là où l'on est plutôt que de geler dessus", () => {
    const sim = monde();
    const p = premier(sim);
    p.corps.position = { x: 10, y: 10 };
    p.besoins.chaleur = 10;
    // Sans bois, il n'y a rien à faire : le plan échoue, honnêtement.
    const sansBois = planifier(sim, p, { type: "se_rechauffer" });
    expect(sansBois.ok).toBe(false);
    ajouter(p.corps.inventaire, "bois", 6);
    const avecBois = planifier(sim, p, { type: "se_rechauffer" });
    if (!avecBois.ok) throw new Error(`on n'a pas su faire du feu : ${avecBois.raison}`);
    expect(avecBois.plan.some((a) => a.type === "fonder")).toBe(true);
  });
});
