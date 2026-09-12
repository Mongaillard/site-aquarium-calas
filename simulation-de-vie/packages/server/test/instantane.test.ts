import { describe, expect, it } from "vitest";
import { Simulation } from "@sdv/core";
import {
  BilanSaisons,
  SuiviGisements,
  messageEtat,
  messageFiche,
  messageInit,
  pensee,
} from "../src/instantane.js";

function sim(): Simulation {
  const s = Simulation.creer({ seed: 42, monde: { largeur: 48, hauteur: 32 } });
  s.avancer(300);
  return s;
}

describe("instantanés", () => {
  it("init décrit la grille et l'horloge", () => {
    const s = sim();
    const m = messageInit(s);
    expect(m.largeur).toBe(48);
    expect(m.hauteur).toBe(32);
    expect(m.biomes).toHaveLength(48 * 32);
    expect(m.nomsBiomes).toContain("prairie");
    expect(m.ticksParJour).toBe(144);
    expect(m.modeCerveau).toBe("rules");
  });

  it("l'état porte les personnages, les bâtiments, les stats et les événements depuis l'index", () => {
    const s = sim();
    const suivi = new SuiviGisements();
    const bilan = new BilanSaisons();
    const e1 = messageEtat(s, { ticksParSeconde: 4, pause: false, suivi, bilan, indexJournal: 0 });
    expect(e1.tick).toBe(300);
    expect(e1.personnages).toHaveLength(12);
    expect(e1.personnages[0]).toMatchObject({ vivant: true, stade: "adulte" });
    expect(e1.evenements.length).toBe(s.journal.taille);
    expect(e1.gisements.length).toBeGreaterThan(50); // complet au premier envoi
    expect(e1.stats.vivants).toBe(12);
    const e2 = messageEtat(s, {
      ticksParSeconde: 4,
      pause: false,
      suivi,
      bilan,
      indexJournal: s.journal.taille,
    });
    expect(e2.evenements).toHaveLength(0);
    expect(e2.gisements).toHaveLength(0); // rien n'a changé
    s.avancer(144);
    const e3 = messageEtat(s, {
      ticksParSeconde: 4,
      pause: false,
      suivi,
      bilan,
      indexJournal: s.journal.taille - 5,
    });
    expect(e3.evenements).toHaveLength(5);
    expect(e3.gisements.length).toBeGreaterThan(0); // récoltes et repousse
  });

  it("le différentiel signale les gisements disparus", () => {
    const s = sim();
    const suivi = new SuiviGisements();
    suivi.differentiel(s);
    const tuile = [...s.grille.toutes()].find((t) => t.gisement !== null);
    if (!tuile) throw new Error("pas de gisement");
    tuile.gisement = null;
    const diff = suivi.differentiel(s);
    expect(diff).toContainEqual([tuile.x, tuile.y, "", -1, ""]);
  });

  it("le bilan par saison compte naissances et décès", () => {
    const s = sim();
    const bilan = new BilanSaisons();
    expect(bilan.mettreAJour(s)).toEqual([]);
    const p = s.personnages[0];
    if (!p) throw new Error("vide");
    s.tuer(p, "test");
    expect(bilan.mettreAJour(s)).toEqual([
      { annee: 1, saison: "printemps", naissances: 0, deces: 1 },
    ]);
  });

  it("la fiche rassemble identité, besoins, relations nommées, famille et souvenirs", () => {
    const s = sim();
    const p = s.personnages[0];
    if (!p) throw new Error("vide");
    const f = messageFiche(s, p.id);
    expect(f).not.toBeNull();
    if (!f) return;
    expect(f.prenom).toBe(p.identite.prenom);
    expect(f.relations.length).toBeGreaterThan(0);
    expect(f.relations[0]?.prenom).not.toBe("");
    expect(f.famille.fratrie.length).toBeGreaterThan(0);
    expect(f.pensee.length).toBeGreaterThan(0);
    expect(Object.keys(f.competences)).toContain("recolte");
    expect(f.souvenirsRecents.length).toBeGreaterThan(0);
    expect(messageFiche(s, "p-9999")).toBeNull();
  });

  it("la pensée couvre toutes les intentions", () => {
    const s = sim();
    const p = s.personnages[0];
    if (!p) throw new Error("vide");
    const intentions = [
      { type: "boire" },
      { type: "manger" },
      { type: "dormir" },
      { type: "recolter", ressource: "baies" },
      { type: "explorer" },
      { type: "construire" },
      { type: "fabriquer", recette: "hache_pierre" },
      { type: "stocker" },
      { type: "parler", cible: "p-0002" },
      { type: "offrir", cible: "p-0002", ressource: "baies" },
      { type: "demander", cible: "p-0002", ressource: "baies" },
      { type: "voler" },
      { type: "courtiser", cible: "p-0002" },
      { type: "se_reproduire" },
      { type: "suivre", cible: "p-0002" },
      { type: "se_rechauffer" },
      { type: "attendre", ticks: 3 },
    ] as const;
    for (const i of intentions) {
      p.intention = i;
      expect(pensee(s, p).length).toBeGreaterThan(1);
    }
    p.intention = null;
    expect(pensee(s, p).length).toBeGreaterThan(1);
  });
});
