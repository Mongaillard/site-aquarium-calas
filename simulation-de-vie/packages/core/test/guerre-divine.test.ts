import { describe, expect, it } from "vitest";
import { Simulation, lancerRaid, relationEntre } from "../src/index.js";
import type { Personnage } from "../src/index.js";
import { ajouterObjet } from "../src/agents/inventaire.js";
import { SEUILS } from "../src/monde/generation.js";

/** Deux villages à trente tuiles, la famille détachée déplacée sur son site, tous armés. */
function deuxVillages(seed: number): { sim: Simulation; a: string; b: string } {
  const sim = Simulation.creer({ seed, population: { initiale: 12, familles: 3 } });
  sim.config.brain.conseilsParJour = 0;
  sim.avancer(144);
  const v = sim.villages.villages[0];
  if (v === undefined) throw new Error("pas de village");
  const famille = v.familles[2];
  if (famille === undefined) throw new Error("trois familles attendues");
  v.familles = v.familles.filter((f) => f !== famille);
  const site = { x: v.centre.x + 30, y: v.centre.y };
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
  const gens: Personnage[] = sim.vivants().filter((p) => p.identite.nomFamille === famille);
  gens.forEach((p, i) => {
    p.corps.position = { x: site.x + (i % 3) - 1, y: site.y + Math.floor(i / 3) - 1 };
  });
  for (const p of sim.vivants())
    if (p.corps.stade === "adulte")
      ajouterObjet(p.corps.inventaire, { type: "lance", solidite: 40 });
  sim.faveur.valeur = 40;
  sim.faveur.rang = 3;
  return { sim, a: v.id, b: "v-2" };
}

describe("M33 : le dieu et la guerre", () => {
  it("Sonner la guerre : le village visé entre en guerre avec son voisin et sa troupe part", () => {
    const { sim, a, b } = deuxVillages(21);
    const va = sim.villages.villages[0];
    if (va === undefined) throw new Error("pas de village");
    const r = sim.exercer({ pouvoir: "guerre", x: va.centre.x, y: va.centre.y });
    expect(r.ok).toBe(true);
    expect(relationEntre(sim.villages, a, b).etat).toBe("guerre");
    const bataille = sim.villages.batailles[0];
    expect(bataille?.phase).toBe("marche");
    expect(bataille?.attaquant.village).toBe(a);
    expect(sim.journal.parType("divin").at(-1)?.details.pouvoir).toBe("guerre");
    // Une bataille à la fois : le pouvoir n'a plus d'effet tant qu'elle dure.
    sim.faveur.recharges.clear();
    sim.faveur.valeur = 40;
    expect(sim.exercer({ pouvoir: "guerre", x: va.centre.x, y: va.centre.y })).toEqual({
      ok: false,
      raison: "sans_effet",
    });
  });

  it("Apaiser arrête la bataille en cours ; sans bataille, le village fait la paix", () => {
    const { sim, a, b } = deuxVillages(21);
    const va = sim.villages.villages[0];
    if (va === undefined) throw new Error("pas de village");
    expect(sim.exercer({ pouvoir: "guerre", x: va.centre.x, y: va.centre.y }).ok).toBe(true);
    const bataille = sim.villages.batailles[0];
    sim.faveur.valeur = 40;
    const r = sim.exercer({ pouvoir: "apaiser", x: va.centre.x, y: va.centre.y });
    expect(r.ok).toBe(true);
    expect(bataille?.phase).toBe("finie");
    expect(bataille?.issue).toBe("treve");
    for (const p of sim.personnages) expect(p.drapeaux.bataille ?? null).toBeNull();
    // La guerre reste déclarée : un second Apaiser fait la paix.
    expect(relationEntre(sim.villages, a, b).etat).toBe("guerre");
    sim.faveur.recharges.clear();
    sim.faveur.valeur = 40;
    expect(sim.exercer({ pouvoir: "apaiser", x: va.centre.x, y: va.centre.y }).ok).toBe(true);
    expect(relationEntre(sim.villages, a, b).etat).toBe("paix");
    sim.faveur.recharges.clear();
    sim.faveur.valeur = 40;
    expect(sim.exercer({ pouvoir: "apaiser", x: va.centre.x, y: va.centre.y })).toEqual({
      ok: false,
      raison: "sans_effet",
    });
  });

  it("la loi des guerres suspendue : pas de déclaration, pas de troupe, et la paix à l'aube", () => {
    const { sim, a, b } = deuxVillages(21);
    const va = sim.villages.villages[0];
    if (va === undefined) throw new Error("pas de village");
    const r = relationEntre(sim.villages, a, b);
    r.etat = "guerre";
    r.casusBelli = "un vol";
    r.attitude = -80;
    r.depuisJour = -10;
    sim.villages.derniereBatailleJour = -100;
    sim.lois.guerres = false;
    expect(sim.exercer({ pouvoir: "guerre", x: va.centre.x, y: va.centre.y })).toEqual({
      ok: false,
      raison: "sans_effet",
    });
    sim.avancer(1); // l'aube du tick 144
    expect(r.etat).toBe("paix");
    expect(sim.villages.batailles).toHaveLength(0);
    // Une attitude au plus bas avec un casus belli ne déclare rien tant que la loi dort.
    r.attitude = -90;
    r.casusBelli = "un vol";
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(r.etat).toBe("paix");
  }, 30_000);

  it("la foudre frappe les pillards sur le champ, un gardien les repousse", () => {
    const sim = Simulation.creer({ seed: 5, population: { initiale: 12, familles: 3 } });
    sim.config.brain.conseilsParJour = 0;
    sim.avancer(144);
    const v = sim.villages.villages[0];
    if (v === undefined) throw new Error("pas de village");
    sim.villages.bandes.push({
      id: "bande-test",
      taille: 4,
      position: { x: v.centre.x + 2, y: v.centre.y },
      etat: "approche",
      cible: v.id,
      depuisJour: sim.horloge.moment().jourAbsolu,
      butin: 0,
    });
    const bande = sim.villages.bandes[0];
    if (bande === undefined) throw new Error("pas de bande");
    const b = lancerRaid(sim, bande, v);
    const pillard = b.attaquant.membres[0];
    if (pillard === undefined) throw new Error("pas de pillard");
    sim.faveur.valeur = 40;
    sim.faveur.rang = 3;
    const r = sim.exercer({ pouvoir: "foudre", x: pillard.x, y: pillard.y });
    expect(r.ok).toBe(true);
    expect(b.frappes.some((f) => f.de === "ciel" && f.vers === pillard.id && f.degats === 40)).toBe(
      true,
    );
    expect(pillard.sante).toBe(20);
    // Un gardien posté à côté : les pillards sont repoussés au tick suivant.
    sim.faveur.valeur = 40;
    sim.faveur.recharges.clear();
    sim.choisirDomaine("orage");
    sim.faveur.rang = 3;
    const c = sim.invoquer({ genre: "gardien", x: v.centre.x + 1, y: v.centre.y + 1 });
    expect(c.ok).toBe(true);
    sim.avancer(1);
    expect(b.phase).toBe("finie");
    expect(b.issue).toBe("defenseur");
    expect(bande.etat).toBe("repousse");
    expect(sim.journal.parType("divin").some((e) => e.details.pouvoir === "gardien_repousse")).toBe(
      true,
    );
  });
});
