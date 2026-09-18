import { describe, expect, it } from "vitest";
import { decrireEvenement, importancePourTemoin } from "../src/memoire/descriptions.js";
import { FluxMemoire } from "../src/memoire/souvenir.js";
import type { Evenement } from "../src/evenements/journal.js";

const T = 144;
const flux = (): FluxMemoire =>
  new FluxMemoire({ ticksParJour: T, demiVieRecenceJours: 1, maxSouvenirs: 50 });

describe("FluxMemoire", () => {
  it("ajoute des souvenirs bornés en importance", () => {
    const f = flux();
    const s = f.ajouter(0, "action", "J'ai mangé.", 42);
    expect(s.importance).toBe(10);
    expect(f.ajouter(0, "action", "Rien.", -3).importance).toBe(1);
    expect(f.taille).toBe(2);
  });

  it("la récence décroît de moitié par jour", () => {
    const f = flux();
    const s = f.ajouter(0, "action", "Hier.", 5);
    const scoreT0 = f.score(s, { tick: 0 });
    const scoreT1 = f.score(s, { tick: T });
    expect(scoreT0 - scoreT1).toBeCloseTo(0.5, 5); // récence 1 → 0,5, importance identique
  });

  it("récupère d'abord les souvenirs importants, récents et pertinents", () => {
    const f = flux();
    f.ajouter(0, "action", "Vieux et banal.", 1);
    f.ajouter(10 * T, "action", "Récent et banal.", 1);
    f.ajouter(0, "action", "Vieux mais capital.", 10, ["p-0002"]);
    f.ajouter(9 * T, "dialogue", "Récent, à propos de Léa.", 3, ["p-0002"]);
    const top = f.recuperer({ tick: 10 * T, sujets: ["p-0002"] }, 2).map((s) => s.texte);
    expect(top).toContain("Récent, à propos de Léa.");
    expect(top).toContain("Vieux mais capital.");
    // La position rapproche aussi.
    f.ajouter(0, "observation", "Près d'ici.", 2, [], { x: 5, y: 5 });
    const proche = f.recuperer(
      { tick: 10 * T, position: { x: 6, y: 5 }, types: ["observation"] },
      1,
    );
    expect(proche[0]?.texte).toBe("Près d'ici.");
  });

  it("marque l'accès et filtre par type", () => {
    const f = flux();
    const s = f.ajouter(0, "reflexion", "Je réfléchis.", 6);
    f.recuperer({ tick: 5 * T, types: ["reflexion"] }, 1);
    expect(s.dernierAcces).toBe(5 * T);
    expect(f.recuperer({ tick: 5 * T, types: ["dialogue"] }, 1)).toHaveLength(0);
  });

  it("oublie en compressant les souvenirs banals non consultés", () => {
    const f = new FluxMemoire({ ticksParJour: T, demiVieRecenceJours: 1, maxSouvenirs: 20 });
    for (let i = 0; i < 20; i++) f.ajouter(i, "action", `Banal ${i}.`, 1);
    f.ajouter(0, "action", "Important.", 9);
    // Le 21e ajout dépasse la limite et déclenche l'oubli : rien à compresser (trop récent).
    expect(f.taille).toBe(21);
    const supprimes = f.oublier(40 * T);
    expect(supprimes).toBe(20);
    const textes = f.tous().map((s) => s.texte);
    expect(textes).toContain("Important.");
    expect(textes.some((t) => t.startsWith("Pendant environ"))).toBe(true);
    expect(f.taille).toBe(2);
  });
});

describe("decrireEvenement", () => {
  const noms = {
    prenom: (id: string) => (id === "p-0001" ? "Léa" : "Tom"),
    feminin: (id: string) => id === "p-0001",
  };
  const ev = (
    type: Evenement["type"],
    details: Evenement["details"],
    acteur = "p-0001",
  ): Evenement => ({
    tick: 0,
    type,
    acteur,
    position: { x: 3, y: 4 },
    importance: 5,
    details,
  });

  it("parle à la première personne pour l'acteur et à la troisième pour le témoin", () => {
    const e = ev("recolte", { ressource: "baies", quantite: 2 });
    expect(decrireEvenement(e, "acteur", noms)).toBe("J'ai récolté des baies en (3, 4).");
    expect(decrireEvenement(e, "temoin", noms)).toBe("J'ai vu Léa récolter des baies en (3, 4).");
  });

  it("accorde le décès et décrit les dialogues, dons, vols", () => {
    expect(decrireEvenement(ev("deces", { cause: "soif" }), "temoin", noms)).toContain(
      "Léa est morte",
    );
    expect(
      decrireEvenement(ev("dialogue", { avec: "p-0002", sujet: "nouvelles" }), "acteur", noms),
    ).toBe("J'ai discuté avec Tom (nouvelles).");
    expect(
      decrireEvenement(ev("offre", { cible: "p-0002", ressource: "baies" }), "temoin", noms),
    ).toBe("J'ai vu Léa donner des baies à Tom.");
    expect(
      decrireEvenement(ev("vol", { famille: "Vidal", ressource: "baies" }), "temoin", noms),
    ).toContain("voler");
  });

  it("ignore les événements sans intérêt mémoriel", () => {
    expect(decrireEvenement(ev("intention", { intention: "boire" }), "acteur", noms)).toBeNull();
    expect(
      decrireEvenement(ev("outil_casse", { outil: "hache_pierre" }), "temoin", noms),
    ).toBeNull();
  });

  it("l'importance pour un témoin est réduite sauf pour les drames", () => {
    expect(importancePourTemoin(ev("recolte", {}))).toBe(3);
    expect(importancePourTemoin({ ...ev("deces", {}), importance: 10 })).toBe(8);
  });
});
