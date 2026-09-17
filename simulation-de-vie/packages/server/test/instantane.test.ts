import { describe, expect, it } from "vitest";
import {
  MATIERES_BRUTES,
  Simulation,
  ajouterObjet,
  composerTrouvaille,
  matiereDe,
  objetDeTrouvaille,
  retenirTrouvaille,
} from "@sdv/core";
import type { Personnage } from "@sdv/core";
import { apprendre } from "@sdv/core";
import { etatPersonnage, messageFiche, outilEnMain, trouvaillesEtat } from "../src/instantane.js";

function premier(sim: Simulation): Personnage {
  const p = sim.personnages.find((x) => x.vivant);
  if (p === undefined) throw new Error("personne");
  p.corps.inventaire.objets.length = 0;
  return p;
}

describe("M31 : l'outil en main", () => {
  it("suit l'intention et l'inventaire, le cuivre avant la pierre", () => {
    const sim = Simulation.creer({ seed: 3 });
    const p = premier(sim);
    p.intention = { type: "recolter", ressource: "bois" };
    expect(outilEnMain(p)).toBeNull();
    ajouterObjet(p.corps.inventaire, { type: "hache_pierre", solidite: 30 });
    expect(outilEnMain(p)).toBe("hache");
    ajouterObjet(p.corps.inventaire, { type: "hache_cuivre", solidite: 30 });
    expect(outilEnMain(p)).toBe("hache_cuivre");
    p.intention = { type: "recolter", ressource: "pierre" };
    expect(outilEnMain(p)).toBeNull();
    ajouterObjet(p.corps.inventaire, { type: "pioche", solidite: 30 });
    expect(outilEnMain(p)).toBe("pioche");
    p.intention = { type: "recolter", ressource: "poisson" };
    ajouterObjet(p.corps.inventaire, { type: "filet", solidite: 30 });
    expect(outilEnMain(p)).toBe("canne");
    p.intention = { type: "recolter", ressource: "gibier" };
    ajouterObjet(p.corps.inventaire, { type: "lance", solidite: 30 });
    expect(outilEnMain(p)).toBe("lance");
    ajouterObjet(p.corps.inventaire, { type: "arc", solidite: 30 });
    expect(outilEnMain(p)).toBe("arc");
    p.intention = { type: "veiller" };
    expect(outilEnMain(p)).toBe("arc");
    p.intention = { type: "construire" };
    expect(outilEnMain(p)).toBe("marteau");
    p.intention = { type: "manger" };
    expect(outilEnMain(p)).toBeNull();
    p.intention = null;
    expect(outilEnMain(p)).toBeNull();
  });

  it("passe dans l'état envoyé au viewer", () => {
    const sim = Simulation.creer({ seed: 3 });
    const p = premier(sim);
    p.intention = { type: "reparer", objet: "hache_pierre" };
    expect(etatPersonnage(sim, p).outil).toBe("marteau");
  });
});

describe("M38c : les trouvailles telles que le viewer les reçoit", () => {
  it("envoie les matières brutes même quand rien n'a encore été trouvé", () => {
    const sim = Simulation.creer({ seed: 3 });
    const t = trouvaillesEtat(sim);
    expect(t.trouvailles).toEqual([]);
    expect(t.matieres.length).toBeGreaterThan(0);
    expect(t.matieres.every((m) => m.rang === 0)).toBe(true);
    expect(t.matieres.map((m) => m.nom)).toContain("cuivre");
  });

  it("envoie une trouvaille avec son histoire, son coût, ses porteurs et sa teinte", () => {
    const sim = Simulation.creer({ seed: 3 });
    const p = premier(sim);
    const hache = composerTrouvaille(
      sim.trouvailles,
      "couper",
      "tailler",
      matiereDe(sim.trouvailles, "cuivre") ?? MATIERES_BRUTES[0],
    );
    expect(hache).not.toBeNull();
    if (hache === null) return;
    hache.inventeur = p.identite.prenom;
    hache.probleme = "Abattre un arbre prend la journée.";
    hache.essais = 2;
    retenirTrouvaille(sim.trouvailles, hache);
    apprendre(p, hache.id, 1, p.identite.prenom, sim.tick);
    ajouterObjet(p.corps.inventaire, objetDeTrouvaille(hache));

    const t = trouvaillesEtat(sim);
    const vue = t.trouvailles.find((x) => x.id === hache.id);
    expect(vue).toBeDefined();
    expect(vue?.nom).toBe("hache de cuivre");
    expect(vue?.levier).toBe("recolte_bois");
    expect(vue?.gain).toBeGreaterThan(0);
    expect(vue?.inventeur).toBe(p.identite.prenom);
    expect(vue?.probleme).toBe("Abattre un arbre prend la journée.");
    expect(vue?.essais).toBe(2);
    expect(vue?.porteurs).toBe(1);
    expect(vue?.enMain).toBe(1);
    expect(vue?.matiereNom).toBe("cuivre");
    expect(vue?.ingredients.cuivre).toBeGreaterThan(0);
    // Le sprite prend la teinte de la matière, et la fiche dit « trouvaille ».
    expect(etatPersonnage(sim, p).outilCouleur).toBe(vue?.couleur);
    const fiche = messageFiche(sim, p.id);
    expect(fiche?.savoirs.some((s) => s.genre === "trouvaille")).toBe(true);
  });
});
