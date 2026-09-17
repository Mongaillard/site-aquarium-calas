import { describe, expect, it } from "vitest";
import {
  MATIERES_BRUTES,
  Simulation,
  bonusPorte,
  combinaisonValide,
  composerTrouvaille,
  deriverMatiere,
  etatTrouvaillesNeuf,
  ingredientsDe,
  levierDeRecolte,
  matiereDe,
  objetDeTrouvaille,
  recetteDeTrouvaille,
  retenirTrouvaille,
} from "../src/index.js";
import type { EtatTrouvailles, FicheMatiere, Fonction, Procede, Trouvaille } from "../src/index.js";
import { Rng } from "../src/rng.js";
import { ajouter, ajouterObjet } from "../src/agents/inventaire.js";
import type { Inventaire } from "../src/agents/inventaire.js";
import { apprendre } from "../src/savoirs/lecons.js";

/** Une matière du registre, ou l'échec du test si elle manque. */
function mat(e: EtatTrouvailles, id: string): FicheMatiere {
  const f = matiereDe(e, id);
  if (f === null) throw new Error(`matière inconnue : ${id}`);
  return f;
}

function derive(
  e: EtatTrouvailles,
  rng: Rng,
  procede: Procede,
  parents: readonly FicheMatiere[],
): FicheMatiere {
  const f = deriverMatiere(e, rng, procede, parents);
  if (f === null) throw new Error(`${procede} aurait dû donner une matière`);
  return f;
}

function compose(
  e: EtatTrouvailles,
  fonction: Fonction,
  procede: Procede,
  matiere: FicheMatiere,
): Trouvaille {
  const t = composerTrouvaille(e, fonction, procede, matiere);
  if (t === null) throw new Error(`${fonction} × ${procede} × ${matiere.nom} aurait dû tenir`);
  return t;
}

function inventaireVide(): Inventaire {
  return { ressources: {}, objets: [], capacite: 20 };
}

describe("M38a : la grammaire d'invention", () => {
  it("part des matières brutes du monde", () => {
    const e = etatTrouvaillesNeuf();
    expect(e.matieres.size).toBe(MATIERES_BRUTES.length);
    expect(mat(e, "bois").ressource).toBe("bois");
    expect(mat(e, "cuivre").durete).toBeGreaterThan(mat(e, "bois").durete);
    expect(e.trouvailles.size).toBe(0);
  });

  it("allie deux métaux en une matière nouvelle, plus dure que ses parents", () => {
    const e = etatTrouvaillesNeuf();
    const rng = Rng.depuisGraine(7);
    const cuivre = mat(e, "cuivre");
    const bronze = derive(e, rng, "allier", [cuivre, mat(e, "pierre")]);
    expect(bronze.nom).toBe("bronze");
    expect(bronze.rang).toBe(1);
    expect(bronze.parents).toEqual(["cuivre", "pierre"]);
    expect(bronze.durete).toBeGreaterThan(cuivre.durete);
    expect(e.matieres.get(bronze.id)).toBe(bronze);
    // La chaîne continue : un alliage s'allie encore, et le nom ne se répète pas.
    const suivant = derive(e, rng, "allier", [bronze, cuivre]);
    expect(suivant.nom).not.toBe(bronze.nom);
    expect(suivant.rang).toBe(2);
  });

  it("refuse un procédé que la matière ne supporte pas", () => {
    const e = etatTrouvaillesNeuf();
    const rng = Rng.depuisGraine(7);
    const fibres = mat(e, "fibres");
    // Allier exige de la tenue : des fibres ne s'allient pas.
    expect(deriverMatiere(e, rng, "allier", [fibres, fibres])).toBeNull();
    // Tresser exige de la souplesse : la pierre ne se tresse pas.
    expect(combinaisonValide("pecher", "tresser", mat(e, "pierre"))).toBe(false);
    expect(combinaisonValide("pecher", "tresser", fibres)).toBe(true);
    // Une hache de fibres n'a pas de sens non plus.
    expect(combinaisonValide("couper", "tailler", fibres)).toBe(false);
  });

  it("compose une trouvaille dont le nom, la recette et le gain suivent le triplet", () => {
    const e = etatTrouvaillesNeuf();
    const hache = compose(e, "couper", "tailler", mat(e, "cuivre"));
    expect(hache.nom).toBe("hache de cuivre");
    expect(hache.levier).toBe("recolte_bois");
    expect(hache.gain).toBeGreaterThan(0);
    expect(hache.ingredients.cuivre).toBeGreaterThan(0);
    expect(hache.atelier).toBeNull();
    const filet = compose(e, "pecher", "tresser", mat(e, "fibres"));
    expect(filet.nom).toBe("filet de fibres");
    expect(filet.levier).toBe("recolte_poisson");
    expect(filet.id).not.toBe(hache.id);
  });

  it("fait payer la chaîne : un outil d'alliage coûte le minerai de ses parents", () => {
    const e = etatTrouvaillesNeuf();
    const rng = Rng.depuisGraine(11);
    const bronze = derive(e, rng, "allier", [mat(e, "cuivre"), mat(e, "minerai")]);
    const brut = ingredientsDe(e, "cuivre", 2);
    const allie = ingredientsDe(e, bronze.id, 2);
    expect(brut.cuivre).toBe(2);
    expect(allie.cuivre ?? 0).toBeGreaterThan(brut.cuivre ?? 0);
    expect(allie.minerai ?? 0).toBeGreaterThan(0);
  });

  it("une meilleure matière donne un meilleur gain sur le même levier", () => {
    const e = etatTrouvaillesNeuf();
    const dePierre = compose(e, "couper", "tailler", mat(e, "pierre"));
    const deCuivre = compose(e, "couper", "tailler", mat(e, "cuivre"));
    expect(deCuivre.gain).toBeGreaterThan(dePierre.gain);
    expect(deCuivre.solidite).toBeGreaterThan(dePierre.solidite);
  });

  it("le levier ne joue que pour qui porte la chose", () => {
    const e = etatTrouvaillesNeuf();
    const hache = compose(e, "couper", "tailler", mat(e, "cuivre"));
    retenirTrouvaille(e, hache);
    const inv = inventaireVide();
    expect(bonusPorte(e, inv, "recolte_bois")).toBe(1);
    ajouterObjet(inv, objetDeTrouvaille(hache));
    expect(bonusPorte(e, inv, "recolte_bois")).toBeCloseTo(1 + hache.gain, 5);
    // Elle ne pousse pas un autre levier.
    expect(bonusPorte(e, inv, "recolte_poisson")).toBe(1);
    expect(levierDeRecolte("bois")).toBe("recolte_bois");
    expect(levierDeRecolte("baies")).toBeNull();
  });

  it("se fabrique dans le monde, et la hache trouvée abat plus de bois", () => {
    const sim = Simulation.creer({ seed: 12, population: { initiale: 6, familles: 2 } });
    sim.config.brain.conseilsParJour = 0;
    const hache = compose(sim.trouvailles, "couper", "tailler", mat(sim.trouvailles, "cuivre"));
    retenirTrouvaille(sim.trouvailles, hache);
    const p = sim.vivants().find((x) => x.corps.stade === "adulte");
    expect(p).toBeDefined();
    if (p === undefined) return;
    // Il en a l'idée et de quoi la faire.
    apprendre(p, hache.id, 0.6, p.identite.prenom, sim.tick);
    p.experience.artisanat = 400;
    let obtenu = false;
    for (let essai = 0; essai < 12 && !obtenu; essai++) {
      for (const [r, n] of Object.entries(hache.ingredients))
        ajouter(p.corps.inventaire, r as "cuivre", n);
      p.plan = [{ type: "fabriquer", recette: hache.id, ticksRestants: null }];
      for (let i = 0; i < 20 && p.plan.length > 0; i++) sim.avancer(1);
      obtenu = p.corps.inventaire.objets.some((o) => o.trouvaille === hache.id);
    }
    expect(obtenu).toBe(true);
    // Une fois éprouvée, l'idée est un savoir, et le levier joue.
    expect(p.savoirs.get(hache.id)?.force).toBe(1);
    expect(bonusPorte(sim.trouvailles, p.corps.inventaire, "recolte_bois")).toBeCloseTo(
      1 + hache.gain,
      5,
    );
    expect(recetteDeTrouvaille(hache).produit).toEqual({ objet: "trouvaille" });
  });

  it("deux mondes de même graine trouvent les mêmes matières", () => {
    const chaine = (seed: number): string[] => {
      const e = etatTrouvaillesNeuf();
      const rng = Rng.depuisGraine(seed);
      const noms: string[] = [];
      let courant = mat(e, "cuivre");
      for (let i = 0; i < 4; i++) {
        courant = derive(e, rng, "allier", [courant, mat(e, "pierre")]);
        noms.push(`${courant.nom}:${courant.durete}:${courant.tenue}`);
      }
      return noms;
    };
    expect(chaine(3)).toEqual(chaine(3));
    expect(chaine(3)).not.toEqual(chaine(4));
  });

  it("se sauvegarde et se relit, matières dérivées comprises", () => {
    const sim = Simulation.creer({ seed: 5, population: { initiale: 6, familles: 2 } });
    sim.config.brain.conseilsParJour = 0;
    const bronze = derive(sim.trouvailles, sim.rng, "allier", [
      mat(sim.trouvailles, "cuivre"),
      mat(sim.trouvailles, "pierre"),
    ]);
    const epee = compose(sim.trouvailles, "frapper", "tailler", bronze);
    retenirTrouvaille(sim.trouvailles, epee);
    sim.avancer(10);
    const repris = Simulation.restaurer(sim.sauvegarder());
    expect(repris.trouvailles.matieres.get(bronze.id)?.nom).toBe(bronze.nom);
    expect(repris.trouvailles.trouvailles.get(epee.id)?.gain).toBe(epee.gain);
    expect(repris.trouvailles.prochain).toBe(sim.trouvailles.prochain);
  });

  it("un monde d'avant M38 se relit avec les matières brutes et rien de trouvé", () => {
    const sim = Simulation.creer({ seed: 9, population: { initiale: 6, familles: 2 } });
    sim.config.brain.conseilsParJour = 0;
    sim.avancer(5);
    const brut = sim.sauvegarder() as unknown as { etat: Record<string, unknown> };
    delete brut.etat.trouvailles;
    const repris = Simulation.restaurer(brut);
    expect(repris.trouvailles.matieres.size).toBe(MATIERES_BRUTES.length);
    expect(repris.trouvailles.trouvailles.size).toBe(0);
    expect(repris.vivants().length).toBeGreaterThan(0);
  });
});
