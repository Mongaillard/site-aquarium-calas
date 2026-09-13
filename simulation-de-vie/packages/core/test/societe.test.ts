import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import type { Personnage } from "../src/agents/personnage.js";
import { relationAvec } from "../src/agents/personnage.js";
import { apprendre } from "../src/savoirs/lecons.js";
import { ajouter, quantite, retirer } from "../src/agents/inventaire.js";
import type { Ressource } from "../src/monde/ressources.js";
import { autorise } from "../src/monde.js";
import {
  JOURS_COUTUME,
  eviteLeLieu,
  heureSociete,
  lieuInterdit,
  notables,
  estBanni,
} from "../src/social/societe.js";
import { joursAsync } from "./utils.js";

function colonie(seed = 5): Simulation {
  const sim = Simulation.creer({ seed, population: { initiale: 9, familles: 3 } });
  sim.config.brain.conseilsParJour = 0;
  sim.avancer(144);
  return sim;
}

function adultes(sim: Simulation): Personnage[] {
  return sim.vivants().filter((p) => p.corps.stade === "adulte");
}

function deFamillesDifferentes(sim: Simulation): [Personnage, Personnage] {
  const ad = adultes(sim);
  const a = ad[0];
  const b = ad.find((x) => x.identite.nomFamille !== a?.identite.nomFamille);
  if (a === undefined || b === undefined) throw new Error("il faut deux familles");
  return [a, b];
}

/** Amène la simulation à 21 h, un feu allumé sous les pieds de `gens`, tous éveillés à côté. */
function veilleeForcee(
  sim: Simulation,
  gens: Personnage[],
  avant: () => void = () => undefined,
): void {
  const chef = gens[0];
  if (chef === undefined) throw new Error("personne");
  const T = sim.horloge.ticksParJour;
  const cible = Math.floor(sim.tick / T) * T + 21 * 6;
  sim.avancer(cible - sim.tick);
  const feu =
    [...sim.batiments.values()].find((b) => b.type === "feu_de_camp") ??
    sim.fonderChantier(
      "feu_de_camp",
      { x: chef.corps.position.x + 2, y: chef.corps.position.y },
      chef,
    );
  feu.etat = "termine";
  feu.travailRestant = 0;
  feu.allume = true;
  feu.reserveBois = 10;
  for (const p of gens) {
    p.corps.position = { x: feu.position.x + 1, y: feu.position.y + 1 };
    p.corps.endormi = false;
    p.besoins.sommeil = 90;
    p.besoins.faim = 80;
    p.besoins.chaleur = 80;
    p.besoins.soif = 80;
    p.plan = [];
    p.actionEnCours = null;
  }
  avant();
  sim.avancer(1);
}

function vider(p: Personnage): void {
  for (const r of Object.keys(p.corps.inventaire.ressources) as Ressource[])
    retirer(p.corps.inventaire, r, quantite(p.corps.inventaire, r));
}

describe("la société (jalon 13)", () => {
  it("le prestige vient des dons et des exploits, et s'érode chaque jour", () => {
    const sim = colonie();
    const [a, b] = deFamillesDifferentes(sim);
    const depart = a.prestige;
    sim.emettre("offre", a, { cible: b.id, ressource: "baies", quantite: 2 }, 3);
    expect(a.prestige).toBe(depart + 2);
    sim.emettre("invention", a, { nom: "filet" }, 6);
    expect(a.prestige).toBe(depart + 8);
    a.prestige = 30;
    expect(notables(sim).map((p) => p.id)).toContain(a.id);
    const avant = a.prestige;
    sim.avancerJusquaAube();
    expect(a.prestige).toBeLessThanOrEqual(avant + 12);
    expect(a.prestige).toBeGreaterThanOrEqual(avant - 1);
  });

  it("une leçon connue de tous les adultes depuis trente jours devient coutume, et l'enfreindre coûte", () => {
    const sim = colonie();
    const T = sim.horloge.ticksParJour;
    for (const p of adultes(sim))
      apprendre(p, "enfants_dabord", 1, "Ambre", sim.tick - (JOURS_COUTUME + 1) * T);
    sim.avancerJusquaAube();
    expect(sim.societe.coutumes.map((c) => c.lecon)).toContain("enfants_dabord");
    const adoption = sim.journal.parType("coutume").find((e) => e.details.genre === "adoptee");
    expect(adoption?.details.lecon).toBe("enfants_dabord");
    // Un adulte mange devant un enfant affamé, devant témoins : infraction.
    const ad = adultes(sim);
    const coupable = ad[0];
    const temoin = ad[1];
    const enfant = sim.vivants().find((p) => p.corps.stade === "enfant") ?? ad[2];
    if (coupable === undefined || temoin === undefined || enfant === undefined)
      throw new Error("il manque du monde");
    enfant.corps.stade = "enfant";
    enfant.besoins.faim = 20;
    enfant.corps.position = { ...coupable.corps.position };
    temoin.corps.position = { ...coupable.corps.position };
    temoin.corps.endormi = false;
    ajouter(coupable.corps.inventaire, "baies", 3);
    const reputation = coupable.reputation;
    sim.emettre("repas", coupable, { ressource: "baies" }, 2, coupable.corps.position);
    const infraction = sim.journal.parType("coutume").find((e) => e.details.genre === "infraction");
    expect(infraction?.acteur).toBe(coupable.id);
    expect(coupable.reputation).toBe(reputation - 3);
    expect(sim.societe.compteurs.infractions).toBe(1);
  });

  it("un vol vu ouvre un grief, jugé à la veillée : le voleur répare s'il le peut", () => {
    const sim = colonie();
    const [voleur, victime] = deFamillesDifferentes(sim);
    const stock = sim.fonderChantier(
      "entrepot",
      { x: victime.corps.position.x + 1, y: victime.corps.position.y },
      victime,
    );
    sim.emettre(
      "vol",
      voleur,
      {
        batiment: stock.id,
        famille: victime.identite.nomFamille,
        ressource: "baies",
        quantite: 1,
        temoins: 1,
      },
      6,
      stock.position,
    );
    expect(sim.societe.griefs).toHaveLength(1);
    expect(relationAvec(victime, voleur.id).rancune).toBeGreaterThanOrEqual(30);
    const gens = adultes(sim).slice(0, 4);
    if (!gens.some((p) => p.id === voleur.id)) gens[0] = voleur;
    veilleeForcee(sim, gens, () => {
      vider(voleur);
      vider(victime);
      ajouter(voleur.corps.inventaire, "baies", 4);
    });
    expect(sim.societe.derniereVeillee).not.toBeNull();
    expect(sim.societe.compteurs.veillees).toBe(1);
    const palabre = sim.journal.parType("palabre")[0];
    expect(palabre?.details.issue).toBe("repare");
    expect(sim.societe.griefs[0]?.etat).toBe("repare");
    expect(sim.societe.compteurs.reparations).toBe(1);
  });

  it("un voleur mal vu qui ne peut pas réparer est banni par un vote, perd l'accès aux bâtiments et revient après l'exil", () => {
    const sim = colonie();
    const [voleur, victime] = deFamillesDifferentes(sim);
    voleur.reputation = -50;
    const abri = sim.fonderChantier(
      "abri",
      { x: voleur.corps.position.x + 3, y: voleur.corps.position.y + 3 },
      voleur,
    );
    abri.etat = "termine";
    sim.emettre(
      "vol",
      voleur,
      {
        batiment: "x",
        famille: victime.identite.nomFamille,
        ressource: "baies",
        quantite: 1,
        temoins: 2,
      },
      6,
    );
    // Tout le monde en veut au voleur.
    const gens = adultes(sim)
      .filter((p) => p.identite.nomFamille !== voleur.identite.nomFamille)
      .slice(0, 4);
    for (const p of gens) relationAvec(p, voleur.id).affinite = -30;
    gens.push(voleur);
    veilleeForcee(sim, gens, () => {
      vider(voleur);
    });
    expect(sim.journal.parType("palabre")[0]?.details.issue).toBe("exil");
    expect(estBanni(sim, voleur)).toBe(true);
    expect(voleur.ambition?.genre).toBe("migrer");
    expect(autorise(sim, abri, voleur)).toBe(false);
    expect(sim.societe.decisions.some((d) => d.sujet === "exil" && d.adoptee)).toBe(true);
    // Le retour : on avance le jour de fin d'exil.
    if (voleur.banni === null) throw new Error("pas banni");
    voleur.banni = { ...voleur.banni, jusquaJour: sim.horloge.moment().jourAbsolu };
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(voleur.banni).toBeNull();
    expect(sim.journal.parType("justice").some((e) => e.details.genre === "retour")).toBe(true);
  });

  it("une rancune trop forte entre voisins finit en rixe : le perdant est contusionné", () => {
    const sim = colonie();
    const [a, b] = deFamillesDifferentes(sim);
    b.corps.position = { x: a.corps.position.x + 1, y: a.corps.position.y };
    a.corps.endormi = false;
    b.corps.endormi = false;
    relationAvec(a, b.id).rancune = 90;
    heureSociete(sim);
    expect(sim.societe.compteurs.rixes).toBe(1);
    const rixe = sim.journal.parType("rixe")[0];
    expect(rixe).toBeDefined();
    const blesse = [a, b].find((p) =>
      p.corps.etat.blessures.some((x) => x.contexte === "dans une rixe"),
    );
    expect(blesse).toBeDefined();
    expect(relationAvec(a, b.id).rancune).toBe(20);
    // Pas deux rixes dans la même semaine.
    relationAvec(a, b.id).rancune = 90;
    heureSociete(sim);
    expect(sim.societe.compteurs.rixes).toBe(1);
  });

  it("une mort inexpliquée rend le lieu interdit pour une saison, sauf famine", () => {
    const sim = colonie();
    const [defunt, autre] = deFamillesDifferentes(sim);
    const pos = { ...defunt.corps.position };
    sim.tuer(defunt, "toux grise");
    expect(sim.societe.lieuxInterdits).toHaveLength(1);
    expect(lieuInterdit(sim, pos)).not.toBeNull();
    autre.besoins.faim = 80;
    expect(eviteLeLieu(sim, autre, pos)).toBe(true);
    autre.besoins.faim = 20;
    expect(eviteLeLieu(sim, autre, pos)).toBe(false);
    expect(sim.journal.parType("tabou")[0]?.details.genre).toBe("lieu_interdit");
    // Une mort de vieillesse n'interdit rien.
    const vieux = adultes(sim)[1];
    if (vieux === undefined) throw new Error("personne");
    sim.tuer(vieux, "vieillesse");
    expect(sim.societe.lieuxInterdits).toHaveLength(1);
  });

  it("laisser mourir de faim après un refus vaut une haine héréditaire, levée par le prix du sang", () => {
    const sim = colonie();
    const [victime, refuseur] = deFamillesDifferentes(sim);
    const frere = adultes(sim).find(
      (p) => p.id !== victime.id && p.identite.nomFamille === victime.identite.nomFamille,
    );
    if (frere === undefined) throw new Error("pas de frère");
    victime.drapeaux.refusePar = { id: refuseur.id, tick: sim.tick };
    sim.tuer(victime, "faim");
    expect(relationAvec(frere, refuseur.id).haine).toBe(true);
    expect(sim.journal.parType("justice").some((e) => e.details.genre === "haine")).toBe(true);
    // Le prix du sang à la veillée : six portions, et la haine s'efface.
    const gens = [
      refuseur,
      frere,
      ...adultes(sim)
        .filter((p) => p.id !== refuseur.id && p.id !== frere.id)
        .slice(0, 2),
    ];
    veilleeForcee(sim, gens, () => {
      vider(refuseur);
      vider(frere);
      ajouter(refuseur.corps.inventaire, "baies", 8);
    });
    expect(relationAvec(frere, refuseur.id).haine).toBe(false);
    expect(sim.journal.parType("justice").some((e) => e.details.genre === "prix_du_sang")).toBe(
      true,
    );
  });

  it("un mariage entre deux familles les allie : les abris s'ouvrent, une dot passe", () => {
    const sim = colonie();
    const [a, b] = deFamillesDifferentes(sim);
    const abri = sim.fonderChantier(
      "abri",
      { x: b.corps.position.x + 2, y: b.corps.position.y + 2 },
      b,
    );
    abri.etat = "termine";
    const cousin = adultes(sim).find(
      (p) => p.identite.nomFamille === a.identite.nomFamille && p.id !== a.id,
    );
    if (cousin === undefined) throw new Error("pas de cousin");
    expect(autorise(sim, abri, cousin)).toBe(false);
    sim.emettre("union", a, { cible: b.id, prenoms: "x & y" }, 8);
    expect(sim.societe.alliances).toHaveLength(1);
    expect(autorise(sim, abri, cousin)).toBe(true);
    expect(sim.journal.parType("alliance")[0]?.details.nouvelle).toBe(true);
  });

  it("un adolescent choisit un maître et progresse près de lui", () => {
    const sim = colonie();
    const [eleve, maitre] = deFamillesDifferentes(sim);
    eleve.corps.ageJours = 13 * sim.config.vie.joursParAnnee;
    eleve.corps.stade = "adolescent";
    eleve.experience.peche = 50;
    maitre.experience.peche = 400;
    sim.avancerJusquaAube();
    expect(eleve.maitre).toBe(maitre.id);
    expect(sim.journal.parType("maitre")[0]?.details.genre).toBe("choisi");
  });

  it("le village décide ensemble d'un puits commun quand la leçon est connue", () => {
    const sim = colonie(8);
    const ad = adultes(sim);
    for (const p of ad) {
      apprendre(p, "puits_pres_du_village", 1, "Ambre", sim.tick);
      p.corps.stade = "adulte";
    }
    for (const p of sim.vivants()) if (p.corps.stade !== "adulte") p.corps.stade = "adulte";
    // Il faut déjà de la pierre dans un stock pour que le village vote un puits.
    const chef = ad[0];
    if (chef === undefined) throw new Error("personne");
    const entrepot = sim.fonderChantier(
      "entrepot",
      { x: chef.corps.position.x + 2, y: chef.corps.position.y + 2 },
      chef,
    );
    entrepot.etat = "termine";
    if (entrepot.stock !== null) ajouter(entrepot.stock, "pierre", 10);
    sim.avancerJusquaAube();
    const decision = sim.societe.decisions.find((d) => d.sujet === "puits");
    expect(decision).toBeDefined();
    expect(decision?.adoptee).toBe(true);
    const puits = [...sim.batiments.values()].find((b) => b.type === "puits");
    expect(puits?.commun).toBe(true);
    // Un chantier commun est accessible à tous et passe avant le confort familial.
    if (puits === undefined) throw new Error("pas de puits");
    for (const p of adultes(sim).slice(0, 3)) expect(autorise(sim, puits, p)).toBe(true);
  });

  it("la société se sauvegarde et se restaure à l'identique", () => {
    const sim = colonie();
    const [a, b] = deFamillesDifferentes(sim);
    relationAvec(a, b.id).rancune = 45;
    a.prestige = 22;
    sim.societe.tension = 12;
    sim.tuer(b, "toux grise");
    const copie = Simulation.restaurer(JSON.parse(JSON.stringify(sim.sauvegarder())));
    expect(JSON.stringify([...copie.societe.rixes])).toBe(JSON.stringify([...sim.societe.rixes]));
    expect(copie.societe.lieuxInterdits).toEqual(sim.societe.lieuxInterdits);
    expect(copie.societe.tension).toBe(12);
    expect(copie.personnage(a.id)?.prestige).toBe(22);
    expect(copie.personnage(a.id)?.relations.get(b.id)?.rancune).toBe(45);
    sim.avancer(300);
    copie.avancer(300);
    expect(copie.journal.empreinte()).toBe(sim.journal.empreinte());
  });

  it("une sauvegarde de la version 1 se relit : les champs nouveaux prennent leur valeur de départ", () => {
    const sim = colonie();
    const brute = JSON.parse(JSON.stringify(sim.sauvegarder())) as {
      version: number;
      etat: { societe?: unknown; personnages: Record<string, unknown>[] };
    };
    brute.version = 1;
    delete brute.etat.societe;
    for (const p of brute.etat.personnages) {
      delete p.prestige;
      delete p.maitre;
      delete p.banni;
    }
    const copie = Simulation.restaurer(brute);
    expect(copie.societe.tension).toBe(0);
    expect(copie.vivants()[0]?.prestige).toBe(0);
    copie.avancer(50);
  });

  it("sur soixante jours, le village tient des veillées et des fêtes sans se casser", async () => {
    const sim = Simulation.creer({ seed: 3 });
    sim.config.brain.conseilsParJour = 0;
    await joursAsync(sim, 60);
    const c = sim.societe.compteurs;
    expect(c.veillees).toBeGreaterThan(0);
    expect(c.fetes).toBeGreaterThan(0);
    expect(sim.societe.factions.length).toBeGreaterThan(0);
    expect(sim.vivants().length).toBeGreaterThan(0);
  }, 120_000);
});
