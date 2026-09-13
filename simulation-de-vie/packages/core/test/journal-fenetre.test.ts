import { describe, expect, it } from "vitest";
import { FENETRE_JOURNAL, Journal } from "../src/evenements/journal.js";
import type { Evenement } from "../src/evenements/journal.js";

function evenement(i: number, type: Evenement["type"] = "dialogue", reussie?: boolean): Evenement {
  return {
    tick: i,
    type,
    acteur: null,
    position: null,
    importance: 1,
    details: reussie === undefined ? {} : { reussie },
  };
}

describe("le journal en mémoire bornée (M24)", () => {
  it("garde une fenêtre d'événements, un index global qui ne recule pas, et des compteurs exacts", () => {
    const j = new Journal();
    const n = FENETRE_JOURNAL + 10;
    for (let i = 0; i < n; i++) j.enregistrer(evenement(i));
    expect(j.taille).toBe(n);
    expect(j.tous().length).toBeLessThanOrEqual(FENETRE_JOURNAL);
    expect(j.compte("dialogue")).toBe(n);
    // L'index global : qui a lu jusqu'à `n - 3` reçoit exactement les trois derniers.
    expect(j.depuisIndex(n - 3).map((e) => e.tick)).toEqual([n - 3, n - 2, n - 1]);
    // Un lecteur trop en retard reçoit ce qui reste, sans erreur.
    expect(j.depuisIndex(0).length).toBe(j.tous().length);
  });

  it("compte les chasses réussies et ratées au fil de l'eau, et les retrouve après une sauvegarde", () => {
    const j = new Journal();
    j.enregistrer(evenement(1, "chasse", true));
    j.enregistrer(evenement(2, "chasse", false));
    j.enregistrer(evenement(3, "chasse", true));
    expect(j.compteDetail("chasse:reussie")).toBe(2);
    expect(j.compteDetail("chasse:ratee")).toBe(1);
    const copie = new Journal();
    copie.restaurer(JSON.parse(JSON.stringify(j.etat(2))) as ReturnType<Journal["etat"]>);
    expect(copie.compteDetail("chasse:reussie")).toBe(2);
    expect(copie.taille).toBe(3);
    expect(copie.tous().length).toBe(2);
    expect(copie.depuisIndex(2).map((e) => e.tick)).toEqual([3]);
    // Une sauvegarde d'avant les compteurs de détail se reconstitue sur ce qu'elle contient.
    const ancienne = new Journal();
    ancienne.restaurer({ evenements: j.tous(), compteurs: [["chasse", 3]] });
    expect(ancienne.compteDetail("chasse:reussie")).toBe(2);
  });
});
