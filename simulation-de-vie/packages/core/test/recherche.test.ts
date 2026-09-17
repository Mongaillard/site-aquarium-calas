import { describe, expect, it } from "vitest";
import { Simulation } from "../src/index.js";
import type { Personnage } from "../src/index.js";
import { ajouter } from "../src/agents/inventaire.js";
import {
  JOURS_IDEE,
  chercher,
  matieresAPortee,
  melanger,
  oublierTrouvailles,
  problemes,
} from "../src/savoirs/recherche.js";
import {
  MATIERES_BRUTES,
  composerTrouvaille,
  matiereDe,
  objetDeTrouvaille,
  retenirTrouvaille,
} from "../src/savoirs/grammaire.js";
import type { FicheMatiere, Fonction, Procede, Trouvaille } from "../src/savoirs/grammaire.js";
import type { EtatTrouvailles } from "../src/savoirs/grammaire.js";
import { ajouter, ajouterObjet } from "../src/agents/inventaire.js";
import { apprendre } from "../src/savoirs/lecons.js";

/** Une matière du registre, ou l'échec du test. */
function mat(e: EtatTrouvailles, id: string): FicheMatiere {
  const f = matiereDe(e, id);
  if (f === null) throw new Error(`matière inconnue : ${id}`);
  return f;
}

/** Une trouvaille du triplet, ou l'échec du test. */
function compose(
  e: EtatTrouvailles,
  fonction: Fonction,
  procede: Procede,
  matiere: FicheMatiere,
): Trouvaille {
  const t = composerTrouvaille(e, fonction, procede, matiere);
  if (t === null) throw new Error("triplet refusé");
  return t;
}
import { joursAsync } from "./utils.js";

/** Un adulte curieux, cobaye des recherches. */
function curieux(sim: Simulation): Personnage {
  const p = sim.vivants().find((x) => x.corps.stade === "adulte");
  if (p === undefined) throw new Error("pas d'adulte");
  p.identite.personnalite.ouverture = 0.9;
  return p;
}

function colonie(seed = 21): Simulation {
  const sim = Simulation.creer({ seed, population: { initiale: 8, familles: 2 } });
  sim.config.brain.conseilsParJour = 0;
  return sim;
}

describe("M38b : du problème à l'idée", () => {
  it("ne voit aucun problème chez quelqu'un qui ne manque de rien", () => {
    const sim = colonie();
    const p = curieux(sim);
    p.drapeaux.joursFaim = 0;
    p.drapeaux.joursFroid = 0;
    p.drapeaux.faimMinDuJour = 90;
    p.drapeaux.chaleurMinDuJour = 90;
    p.drapeaux.nourritureGateeJusqua = -1;
    p.drapeaux.alerteJusqua = -1;
    p.drapeaux.bataille = null;
    p.projet = null;
    p.connaissance.clear();
    p.corps.etat.blessures.length = 0;
    expect(problemes(sim, p)).toEqual([]);
  });

  it("traduit le froid en fonction manquante, et le plus pressant vient d'abord", () => {
    const sim = colonie();
    const p = curieux(sim);
    p.drapeaux.chaleurMinDuJour = 10;
    p.drapeaux.joursFroid = 3;
    p.drapeaux.nourritureGateeJusqua = sim.tick + 100;
    const liste = problemes(sim, p);
    const froid = liste.find((x) => x.cle === "froid");
    expect(froid?.fonction).toBe("chauffer");
    expect(liste.find((x) => x.cle === "pourriture")?.fonction).toBe("conserver");
    // Trois jours de froid pèsent plus que de la nourriture gâtée.
    expect(liste[0]?.cle).toBe("froid");
  });

  it("un curieux qui gèle imagine de quoi se couvrir avec ce qu'il connaît", () => {
    const sim = colonie();
    const p = curieux(sim);
    p.experience.artisanat = 400;
    p.drapeaux.chaleurMinDuJour = 5;
    p.drapeaux.joursFroid = 4;
    ajouter(p.corps.inventaire, "cuir", 4);
    let trouve = null;
    for (let i = 0; i < 40 && trouve === null; i++) trouve = chercher(sim, p);
    expect(trouve).not.toBeNull();
    if (trouve === null) return;
    expect(trouve.trouvaille.fonction).toBe("chauffer");
    expect(trouve.trouvaille.levier).toBe("chaleur");
    expect(trouve.probleme.cle).toBe("froid");
    // L'idée est retenue par le monde, avec son inventeur et le problème qui l'a fait naître.
    expect(sim.trouvailles.trouvailles.get(trouve.trouvaille.id)?.inventeur).toBe(
      p.identite.prenom,
    );
    expect(trouve.trouvaille.probleme).toBe(trouve.probleme.plainte);
    // Et c'est une idée, pas encore un savoir éprouvé.
    expect(p.savoirs.get(trouve.trouvaille.id)?.force).toBeCloseTo(0.6, 5);
  });

  it("n'imagine pas deux fois la même chose, ni moins bien que ce qu'il sait déjà", () => {
    const sim = colonie();
    const p = curieux(sim);
    p.experience.artisanat = 400;
    p.drapeaux.chaleurMinDuJour = 5;
    p.drapeaux.joursFroid = 4;
    ajouter(p.corps.inventaire, "cuir", 4);
    let premier = null;
    for (let i = 0; i < 40 && premier === null; i++) premier = chercher(sim, p);
    expect(premier).not.toBeNull();
    if (premier === null) return;
    // Une idée en cours en interdit une autre.
    expect(chercher(sim, p)).toBeNull();
    // Idée éprouvée : on ne la réinvente pas, et rien de moins bon ne vient la remplacer.
    p.savoirs.set(premier.trouvaille.id, { force: 1, origine: null, depuis: 0 });
    let encore = null;
    for (let i = 0; i < 40 && encore === null; i++) encore = chercher(sim, p);
    if (encore !== null) {
      expect(encore.trouvaille.id).not.toBe(premier.trouvaille.id);
      expect(encore.trouvaille.gain).toBeGreaterThan(premier.trouvaille.gain);
    }
  });

  it("une idée jamais réalisée s'efface, et l'on passe à autre chose", () => {
    const sim = colonie();
    const p = curieux(sim);
    p.experience.artisanat = 400;
    p.drapeaux.chaleurMinDuJour = 5;
    p.drapeaux.joursFroid = 4;
    ajouter(p.corps.inventaire, "cuir", 4);
    let idee = null;
    for (let i = 0; i < 40 && idee === null; i++) idee = chercher(sim, p);
    expect(idee).not.toBeNull();
    if (idee === null) return;
    const acquis = p.savoirs.get(idee.trouvaille.id);
    if (acquis === undefined) throw new Error("idée perdue");
    acquis.depuis = sim.tick - (JOURS_IDEE + 1) * sim.horloge.ticksParJour;
    chercher(sim, p);
    expect(p.savoirs.has(idee.trouvaille.id)).toBe(false);
  });

  it("devant un four, mêler deux matières en donne une troisième, et coûte ce qu'on y met", () => {
    const sim = colonie();
    const p = curieux(sim);
    p.experience.artisanat = 900;
    // Un four à côté de soi.
    const four = sim.fonderChantier("four", { ...p.corps.position }, p);
    four.etat = "termine";
    four.travailRestant = 0;
    ajouter(p.corps.inventaire, "cuivre", 9);
    ajouter(p.corps.inventaire, "pierre", 9);
    const avant = sim.trouvailles.matieres.size;
    let nee = null;
    for (let i = 0; i < 400 && nee === null; i++) nee = melanger(sim, p);
    expect(nee).not.toBeNull();
    if (nee === null) return;
    expect(nee.ressource).toBeNull();
    expect(nee.rang).toBeGreaterThanOrEqual(1);
    expect(sim.trouvailles.matieres.size).toBe(avant + 1);
    // Sa famille la connaît, et elle sert désormais aux idées.
    expect(p.matieresSues?.has(nee.id)).toBe(true);
    expect(matiereDe(sim.trouvailles, nee.id)?.nom).toBe(nee.nom);
  });

  it(
    "sur deux cents jours, une colonie trouve, rate et finit par réussir",
    { timeout: 240_000 },
    async () => {
      const sim = Simulation.creer({ seed: 42, population: { initiale: 24, familles: 4 } });
      sim.config.brain.conseilsParJour = 0;
      await joursAsync(sim, 200);
      const compteurs = new Map(sim.journal.etat(1).compteurs);
      expect(compteurs.get("idee") ?? 0).toBeGreaterThan(10);
      expect(compteurs.get("invention") ?? 0).toBeGreaterThan(5);
      // L'essai-erreur se voit : des prototypes ratent avant que ça tienne.
      expect(compteurs.get("prototype_rate") ?? 0).toBeGreaterThan(0);
      // Et les gens portent vraiment ce qu'ils ont inventé.
      const portees = sim
        .vivants()
        .flatMap((p) => p.corps.inventaire.objets)
        .filter((o) => o.trouvaille !== undefined);
      expect(portees.length).toBeGreaterThan(0);
      // Ce sont des choses qui ont un sens : un nom, une matière connue, un gain.
      for (const o of portees) {
        const t = sim.trouvailles.trouvailles.get(o.trouvaille ?? "");
        expect(t).toBeDefined();
        expect(t?.gain ?? 0).toBeGreaterThan(0);
        expect(sim.trouvailles.matieres.has(t?.matiere ?? "")).toBe(true);
      }
    },
  );
});

describe("M41 : les idées aboutissent", () => {
  it("une idée vit trois mois, pas un", () => {
    expect(JOURS_IDEE).toBe(90);
  });

  it("dit si les matières sont à portée : en poche ou au stock de la famille", () => {
    const sim = colonie();
    const p = curieux(sim);
    const t = composerTrouvaille(
      sim.trouvailles,
      "couper",
      "tailler",
      matiereDe(sim.trouvailles, "cuivre") ?? MATIERES_BRUTES[0],
    );
    expect(t).not.toBeNull();
    if (t === null) return;
    p.corps.inventaire.ressources = {};
    expect(matieresAPortee(sim, p, t)).toBe(false);
    // Au stock de la famille : c'est à portée, on ira le chercher.
    const entrepot = sim.fonderChantier("entrepot", { ...p.corps.position }, p);
    entrepot.etat = "termine";
    entrepot.travailRestant = 0;
    if (entrepot.stock === null) throw new Error("pas de stock");
    for (const [r, n] of Object.entries(t.ingredients))
      ajouter(entrepot.stock, r as "cuivre", n * 2);
    expect(matieresAPortee(sim, p, t)).toBe(true);
  });

  it("le monde oublie les trouvailles que plus personne ne connaît, et garde les autres", () => {
    const sim = colonie();
    const p = curieux(sim);
    const perdue = compose(sim.trouvailles, "couper", "tailler", mat(sim.trouvailles, "pierre"));
    const gardee = compose(sim.trouvailles, "creuser", "tailler", mat(sim.trouvailles, "cuivre"));
    const portee = compose(sim.trouvailles, "frapper", "tailler", mat(sim.trouvailles, "pierre"));
    for (const t of [perdue, gardee, portee]) retenirTrouvaille(sim.trouvailles, t);
    // L'une est encore en tête, l'autre est dans une poche, la troisième n'est à personne.
    apprendre(p, gardee.id, 0.6, p.identite.prenom, sim.tick);
    ajouterObjet(p.corps.inventaire, objetDeTrouvaille(portee));
    // Trop neuves pour être oubliées.
    expect(oublierTrouvailles(sim)).toBe(0);
    for (const t of [perdue, gardee, portee]) t.jour = -200;
    expect(oublierTrouvailles(sim)).toBe(1);
    expect(sim.trouvailles.trouvailles.has(perdue.id)).toBe(false);
    expect(sim.trouvailles.trouvailles.has(gardee.id)).toBe(true);
    expect(sim.trouvailles.trouvailles.has(portee.id)).toBe(true);
  });
});
