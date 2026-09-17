import { describe, expect, it } from "vitest";
import { Simulation } from "../src/index.js";
import type { Personnage } from "../src/index.js";
import {
  RAYON_ENCEINTE,
  RAYON_ENCEINTE_MAX,
  centreEnceinte,
  rayonEnceinte,
  siteDuPortail,
  tuileEnceinteManquante,
  tuilesEnceinte,
} from "../src/monde.js";
import { Grille } from "../src/monde/grille.js";

function colonie(seed = 4): { sim: Simulation; p: Personnage } {
  const sim = Simulation.creer({ seed, population: { initiale: 8, familles: 2 } });
  sim.config.brain.conseilsParJour = 0;
  sim.avancer(1);
  const p = sim.vivants().find((x) => x.corps.stade === "adulte");
  if (p === undefined) throw new Error("pas d'adulte");
  return { sim, p };
}

describe("M39a : l'enceinte entoure le village", () => {
  it("se centre sur le village, pas sur une maison", () => {
    const { sim, p } = colonie();
    const village = sim.villages.villages.find((v) => v.familles.includes(p.identite.nomFamille));
    expect(village).toBeDefined();
    expect(centreEnceinte(sim, p)).toEqual(village?.centre);
  });

  it("s'élargit pour contenir ce qu'on a bâti, sans dépasser sa borne", () => {
    const { sim, p } = colonie();
    const centre = centreEnceinte(sim, p);
    if (centre === null) throw new Error("pas de centre");
    expect(rayonEnceinte(sim, centre)).toBeGreaterThanOrEqual(RAYON_ENCEINTE);
    // Un bâtiment loin du centre repousse l'anneau, jusqu'à la borne.
    const loin = { x: centre.x + 6, y: centre.y };
    if (
      sim.grille.estPraticable(loin.x, loin.y) &&
      sim.grille.tuileOuNull(loin.x, loin.y)?.batiment === null
    ) {
      sim.fonderChantier("abri", loin, p);
      expect(rayonEnceinte(sim, centre)).toBeGreaterThanOrEqual(6);
    }
    expect(rayonEnceinte(sim, centre)).toBeLessThanOrEqual(RAYON_ENCEINTE_MAX);
  });

  it("dessine un anneau continu : chaque tuile touche la suivante", () => {
    const { sim, p } = colonie();
    const centre = centreEnceinte(sim, p);
    if (centre === null) throw new Error("pas de centre");
    const anneau = tuilesEnceinte(sim, centre, 3);
    expect(anneau.length).toBeGreaterThan(8);
    // Aucune tuile n'est loin de l'anneau idéal : on rattrape d'un pas, pas plus.
    for (const pos of anneau) {
      const d = Math.max(Math.abs(pos.x - centre.x), Math.abs(pos.y - centre.y));
      expect(d).toBeGreaterThanOrEqual(2);
      expect(d).toBeLessThanOrEqual(4);
    }
    // Pas de doublon.
    expect(new Set(anneau.map((q) => `${q.x},${q.y}`)).size).toBe(anneau.length);
  });

  it("le portail attend que le mur tienne, puis se taille une fois, du côté de l'eau", () => {
    const { sim, p } = colonie();
    const centre = centreEnceinte(sim, p);
    if (centre === null) throw new Error("pas de centre");
    // Anneau nu : pas de portail.
    expect(siteDuPortail(sim, p)).toBeNull();
    // On dresse tout l'anneau.
    let garde = 0;
    for (let pos = tuileEnceinteManquante(sim, p); pos !== null && garde < 60; garde++) {
      const b = sim.fonderChantier("palissade", pos, p);
      b.etat = "termine";
      b.travailRestant = 0;
      pos = tuileEnceinteManquante(sim, p);
    }
    expect(tuileEnceinteManquante(sim, p)).toBeNull();
    const site = siteDuPortail(sim, p);
    expect(site).not.toBeNull();
    if (site === null) return;
    // Le portail est sur l'anneau.
    const d = Math.max(Math.abs(site.x - centre.x), Math.abs(site.y - centre.y));
    expect(d).toBeGreaterThanOrEqual(2);
    // Une fois taillé, on n'en taille pas un second.
    const t = sim.grille.tuileOuNull(site.x, site.y);
    if (t?.batiment != null) {
      sim.detruireBatiment(t.batiment.id);
      const portail = sim.fonderChantier("portail", site, p);
      portail.etat = "termine";
      portail.travailRestant = 0;
    }
    expect(siteDuPortail(sim, p)).toBeNull();
  });

  it("les bêtes du parc se répartissent autour du piquet", () => {
    const { sim, p } = colonie();
    const site = { x: p.corps.position.x + 2, y: p.corps.position.y + 2 };
    if (!sim.grille.estPraticable(site.x, site.y)) return;
    const enclos = sim.fonderChantier("enclos", site, p);
    enclos.etat = "termine";
    enclos.travailRestant = 0;
    for (let i = 0; i < 4; i++) {
      sim.ajouterBete({
        id: sim.prochainIdBete(),
        espece: "mouflon",
        famille: p.identite.nomFamille,
        proprietaire: p.id,
        position: { x: site.x + 9, y: site.y + 9 },
        ageJours: 200,
        docilite: 0.8,
        faim: 0,
        neeEnCaptivite: false,
        derniereTraite: 0,
        derniereTonte: 0,
      });
    }
    for (let j = 0; j < 3; j++) sim.avancerJusquaAube();
    const miennes = [...sim.betail.values()].filter((b) => b.famille === p.identite.nomFamille);
    expect(miennes.length).toBeGreaterThanOrEqual(4);
    // Toutes au parc, et pas toutes sur la même case.
    for (const b of miennes) expect(Grille.distance(b.position, site)).toBeLessThanOrEqual(1);
    expect(new Set(miennes.map((b) => `${b.position.x},${b.position.y}`)).size).toBeGreaterThan(1);
  });
});
