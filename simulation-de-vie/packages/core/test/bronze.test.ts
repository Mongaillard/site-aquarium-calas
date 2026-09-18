/**
 * M46 : que l'âge du bronze ait lieu. Depuis M38 la grammaire promettait une
 * chaîne de matières sans fin ; mesuré sur six mondes de neuf cents jours, elle
 * n'était **jamais** franchie : zéro porteur vivant de `fonte`, dans les six.
 */
import { describe, expect, it } from "vitest";
import { Simulation } from "../src/index.js";
import { NOMS_RECETTES, RECETTES } from "../src/monde/recettes.js";
import { PROCEDE } from "../src/savoirs/grammaire.js";
import { matiereDe } from "../src/savoirs/grammaire.js";
import { melanger } from "../src/savoirs/recherche.js";
import { executerTick } from "../src/actions/executeur.js";
import { ajouter, quantite } from "../src/agents/inventaire.js";
import { apprendre } from "../src/savoirs/lecons.js";
import { grilleUniforme } from "./utils.js";
import type { Personnage } from "../src/agents/personnage.js";

function monde(): Simulation {
  const sim = Simulation.creerAvecGrille(
    { seed: 4, population: { initiale: 2, familles: 1 } },
    grilleUniforme(40, 40, "prairie"),
  );
  for (const t of [...sim.troupeaux.values()]) sim.troupeaux.delete(t.id);
  return sim;
}

/** Un adulte curieux, avec un four sous la main et le niveau qu'il faut. */
function forgeron(sim: Simulation, artisanat = 900): Personnage {
  const p = sim.personnages[0];
  if (p === undefined) throw new Error("monde vide");
  p.identite.personnalite.ouverture = 0.95;
  p.experience.artisanat = artisanat;
  const four = sim.fonderChantier("four", { ...p.corps.position }, p);
  four.etat = "termine";
  four.travailRestant = 0;
  return p;
}

describe("M46 : que l'âge du bronze ait lieu", () => {
  it("deux recettes seulement rendent une ressource, et ce sont elles que le verrou tenait", () => {
    // C'est ce qui rendait le verrou invisible : deux cas sur douze inventions.
    // La fonte (toute la métallurgie) et le fumoir (la conservation par fumage).
    // `cuivre` porte l'invention `fonte`, `poisson_fume` porte `fumoir`.
    const aRessource = NOMS_RECETTES.filter((nom) => {
      const r = RECETTES[nom];
      return !("objet" in r.produit) && r.invention !== undefined;
    });
    expect([...aRessource].sort()).toEqual(["cuivre", "poisson_fume"]);
  });

  it("réussir une recette qui rend une ressource change l'idée en savoir éprouvé", () => {
    const sim = monde();
    const p = forgeron(sim);
    apprendre(p, "fonte", 0.6, "Ambre", sim.tick);
    // De quoi deux lingots : au-delà on dépasse la capacité d'un inventaire, et
    // c'est le bois qui saute — le test échouait alors sur « il manque bois ».
    ajouter(p.corps.inventaire, "minerai", 6);
    ajouter(p.corps.inventaire, "bois", 4);
    // On insiste : un prototype sur trois rate, mais sans rien coûter.
    let force = 0;
    for (let i = 0; i < 40 && force < 1; i++) {
      const action = {
        type: "fabriquer" as const,
        recette: "cuivre" as const,
        ticksRestants: null,
      };
      let statut = "encours";
      for (let k = 0; k < 20 && statut === "encours"; k++)
        statut = executerTick(sim, p, action).statut;
      force = p.savoirs.get("fonte")?.force ?? 0;
    }
    expect(force).toBe(1);
    expect(quantite(p.corps.inventaire, "cuivre")).toBeGreaterThan(0);
  });

  it("un prototype raté ne consomme plus les matières", () => {
    const sim = monde();
    const p = forgeron(sim);
    apprendre(p, "fonte", 0.6, "Ambre", sim.tick);
    ajouter(p.corps.inventaire, "minerai", 3);
    ajouter(p.corps.inventaire, "bois", 2);
    // Juste de quoi un seul lingot : si un échec mangeait les matières, on n'aurait
    // plus jamais rien. On retente jusqu'à la réussite, avec le même stock de départ.
    let force = 0;
    for (let i = 0; i < 60 && force < 1; i++) {
      const action = {
        type: "fabriquer" as const,
        recette: "cuivre" as const,
        ticksRestants: null,
      };
      let statut = "encours";
      for (let k = 0; k < 20 && statut === "encours"; k++)
        statut = executerTick(sim, p, action).statut;
      force = p.savoirs.get("fonte")?.force ?? 0;
    }
    expect(force).toBe(1);
  });

  it("le minerai brut se fond : la grammaire n'exige rien pour fondre", () => {
    // Le filtre retiré en M46 demandait tenue >= 40 ou dureté >= 40 ; le minerai
    // vaut 25 et 28, et `fondre` n'exige rien du tout.
    expect(PROCEDE.fondre.exige).toBeNull();
    const sim = monde();
    const minerai = matiereDe(sim.trouvailles, "minerai");
    if (minerai === null) throw new Error("pas de minerai au registre");
    expect(minerai.fusible).toBe(true);
    expect(Math.max(minerai.tenue, minerai.durete)).toBeLessThan(40);
  });

  it("un curieux devant son four tire une matière du minerai qu'il a en main", () => {
    const sim = monde();
    const p = forgeron(sim);
    ajouter(p.corps.inventaire, "minerai", 40);
    const avant = sim.trouvailles.matieres.size;
    let nee = null;
    for (let i = 0; i < 4000 && nee === null; i++) nee = melanger(sim, p);
    if (nee === null) throw new Error("aucune matière tirée du minerai");
    expect(sim.trouvailles.matieres.size).toBe(avant + 1);
    expect(nee.rang).toBe(1);
    // Plus dure et plus tenace que son parent : la chaîne monte.
    expect(nee.durete + nee.tenue).toBeGreaterThan(53);
  });
});
