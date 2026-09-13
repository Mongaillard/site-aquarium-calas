import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { RuleBrain } from "../src/cerveau/rule-brain.js";
import { percevoir } from "../src/cerveau/perception.js";
import { planifier } from "../src/actions/planificateur.js";
import { prochainBatimentNecessaire } from "../src/monde.js";
import {
  JOURS_ENTRE_CONSEILS,
  bonusPriorite,
  motifsDeConseil,
  optionsConseil,
  scoreMotifs,
} from "../src/cerveau/conseil.js";
import { SEUIL_SAVOIR } from "../src/savoirs/catalogue.js";
import type { Personnage } from "../src/agents/personnage.js";

function colonie(): Simulation {
  const sim = Simulation.creer({ seed: 11, population: { initiale: 6, familles: 2 } });
  sim.avancer(144);
  return sim;
}

function adultes(sim: Simulation): Personnage[] {
  return sim.vivants().filter((x) => x.corps.stade === "adulte");
}

function adulte(sim: Simulation): Personnage {
  const p = adultes(sim)[0];
  if (p === undefined) throw new Error("aucun adulte");
  return p;
}

/** Avance jusqu'à ce qu'une question soit ouverte pour `id` ; ferme celles des autres. */
function attendreQuestionDe(sim: Simulation, id: string, maxTicks = 2 * 144): void {
  for (let i = 0; i < maxTicks; i++) {
    const q = sim.questionEnCours;
    if (q !== null) {
      if (q.personnageId === id) return;
      sim.conseiller({
        questionId: q.id,
        personnageId: q.personnageId,
        choix: "aucun",
        pensee: "",
      });
    }
    sim.avancer(1);
  }
  throw new Error(`aucune question pour ${id}`);
}

describe("demander à Claude : déclencheurs, file et anti-spam", () => {
  it("trois jours de faim font entrer un adulte dans la file, avec un catalogue d'options", () => {
    const sim = colonie();
    const p = adulte(sim);
    for (let j = 0; j < 3; j++) {
      sim.avancerJusquaAube();
      p.drapeaux.faimMinDuJour = 20;
      sim.avancer(1);
    }
    expect(p.drapeaux.joursFaim).toBe(3);
    // Une question qu'on lui aurait déjà posée pendant ces trois jours ne compte pas.
    p.drapeaux.conseilDemandeA = -1;
    const motifs = motifsDeConseil(sim, p);
    expect(motifs).toContain("inconfort_chronique");
    expect(scoreMotifs(motifs)).toBeGreaterThanOrEqual(2);
    const options = optionsConseil(sim, p);
    expect(options.some((o) => o.id === "priorite:provisions")).toBe(true);
    // Trois inventions, trois bâtiments, deux leçons, deux priorités, deux directions au plus.
    expect(options.length).toBeLessThanOrEqual(12);
    for (const o of options) expect(o.id).toMatch(/^(invention|batiment|lecon|priorite|explorer):/);
    attendreQuestionDe(sim, p.id);
    const q = sim.questionsEnAttente()[0];
    expect(q?.personnageId).toBe(p.id);
    expect(q?.contexte.prenom).toBe(p.identite.prenom);
    expect(q?.contexte.inconfort.joursFaim).toBeGreaterThanOrEqual(3);
    expect(sim.journal.parType("conseil").at(-1)?.details.etape).toBe("question");
  });

  it("une seule question à la fois, le budget du jour, et cinq jours de silence après une réponse", () => {
    const sim = colonie();
    sim.config.brain.conseilsParJour = 1;
    const candidats = adultes(sim).slice(0, 3);
    // Soirée : les échecs répétés (posés juste avant le bilan du soir) font entrer dans la file.
    while (sim.horloge.moment().heure !== 21) sim.avancer(1);
    for (const p of candidats) p.echecsConsecutifs = 5;
    sim.avancer(1);
    expect(sim.fileConseils.length + (sim.questionEnCours === null ? 0 : 1)).toBeGreaterThanOrEqual(
      candidats.length,
    );
    sim.avancer(1);
    const q = sim.questionEnCours;
    expect(q).not.toBeNull();
    if (q === null) throw new Error("vide");
    const r = sim.conseiller({
      questionId: q.id,
      personnageId: q.personnageId,
      choix: "aucun",
      pensee: "",
    });
    expect(r).toEqual({ ok: false, raison: "aucun" });
    // Budget épuisé : personne d'autre avant le jour suivant (à 21 h, il reste 18 ticks).
    sim.avancer(10);
    expect(sim.questionEnCours).toBeNull();
    sim.avancerJusquaAube();
    sim.avancer(2);
    expect(sim.questionEnCours).not.toBeNull();
    expect(sim.questionEnCours?.personnageId).not.toBe(q.personnageId);
    // Le premier questionné n'est pas requestionné avant cinq jours.
    const premier = sim.personnage(q.personnageId);
    if (premier === undefined) throw new Error("vide");
    expect(sim.conseilPossible(premier)).toBe(false);
    premier.echecsConsecutifs = 5;
    expect(premier.drapeaux.conseilDemandeA).toBeGreaterThanOrEqual(0);
    expect(sim.tick - premier.drapeaux.conseilDemandeA).toBeLessThan(JOURS_ENTRE_CONSEILS * 144);
    expect(sim.fileConseils.some((c) => c.id === premier.id)).toBe(false);
  });

  it("une question sans réponse expire au bout d'un jour ; une réponse tardive est ignorée", () => {
    const sim = colonie();
    const p = adulte(sim);
    expect(sim.demanderConseil(p.id)).toBe(true);
    const q = sim.questionEnCours;
    if (q === null) throw new Error("vide");
    expect(q.motifs[0]).toBe("observateur");
    expect(sim.demanderConseil(adultes(sim)[1]?.id ?? "")).toBe(false); // une seule à la fois
    sim.avancer(144 + 2);
    expect(sim.questionEnCours).toBeNull();
    expect(sim.journal.parType("conseil").at(-1)?.details).toMatchObject({
      applique: false,
      raison: "expiree",
    });
    expect(
      sim.conseiller({
        questionId: q.id,
        personnageId: p.id,
        choix: "priorite:provisions",
        pensee: "",
      }),
    ).toEqual({ ok: false, raison: "question_inconnue" });
    expect(p.ambition).toBeNull();
  });
});

describe("demander à Claude : le bouton de l'observateur", () => {
  it("passe devant une question ouverte par le moteur, jamais devant une autre demande", () => {
    const sim = colonie();
    const [a, b] = adultes(sim);
    if (a === undefined || b === undefined) throw new Error("vide");
    a.echecsConsecutifs = 5;
    sim.fileConseils.push({ id: a.id, motifs: ["echec_repete"], score: 3 });
    sim.avancer(1);
    expect(sim.questionEnCours?.personnageId).toBe(a.id);
    expect(sim.conseilPossible(a)).toBe(false);
    expect(sim.conseilPossible(b)).toBe(true);
    expect(sim.demanderConseil(b.id)).toBe(true);
    expect(sim.questionEnCours?.personnageId).toBe(b.id);
    expect(sim.journal.parType("conseil").at(-2)?.details).toMatchObject({
      raison: "remplacee",
      questionId: expect.stringContaining(a.id) as string,
    });
    expect(sim.conseilPossible(a)).toBe(false); // une demande de l'observateur ne se remplace pas
  });
});

describe("demander à Claude : application déterministe", () => {
  function questionAvec(sim: Simulation, p: Personnage, id: string): string {
    // Seul l'observateur pose des questions ici : le moteur n'en ouvre aucune de lui-même.
    sim.config.brain.conseilsParJour = 0;
    expect(sim.demanderConseil(p.id)).toBe(true);
    const q = sim.questionEnCours;
    if (q === null) throw new Error("vide");
    sim.questionEnCours = {
      ...q,
      options: [...q.options, { id, libelle: id, pourquoi: "test" }],
    };
    return q.id;
  }

  it("une invention conseillée devient une idée (force 0,6, origine Claude) et une ambition", () => {
    const sim = colonie();
    const p = adulte(sim);
    const qid = questionAvec(sim, p, "invention:fumoir");
    const r = sim.conseiller({
      questionId: qid,
      personnageId: p.id,
      choix: "invention:fumoir",
      pensee: "Le poisson pourrit pendant que mes enfants ont faim.",
      ambition: { but: "que personne n'ait faim cet hiver", jours: 12 },
    });
    expect(r.ok).toBe(true);
    expect(p.savoirs.get("fumoir")).toMatchObject({ force: SEUIL_SAVOIR, origine: "Claude" });
    expect(p.ambition).toMatchObject({
      genre: "invention",
      cible: "fumoir",
      but: "que personne n'ait faim cet hiver",
      issue: "en_cours",
    });
    expect(p.ambition?.jusqua).toBe(sim.tick + 12 * 144);
    expect(p.penseeClaude?.texte).toContain("Le poisson pourrit");
    expect(sim.questionEnCours).toBeNull();
    const e = sim.journal.parType("conseil").at(-1)?.details;
    expect(e).toMatchObject({ applique: true, choix: "invention:fumoir", questionId: qid });
    expect(p.memoire.tous().some((s) => s.texte.startsWith("On m'a soufflé une idée"))).toBe(true);
    // Accomplie dès que le prototype réussit.
    const s = p.savoirs.get("fumoir");
    if (s) s.force = 1;
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(p.ambition?.issue).toBe("accomplie");
    expect(sim.journal.parType("ambition").at(-1)?.details.issue).toBe("accomplie");
  });

  it("un bâtiment conseillé passe devant dans les besoins de construction, puis un chantier s'ouvre", () => {
    const sim = colonie();
    const p = adulte(sim);
    const qid = questionAvec(sim, p, "batiment:puits");
    expect(
      sim.conseiller({ questionId: qid, personnageId: p.id, choix: "batiment:puits", pensee: "" })
        .ok,
    ).toBe(true);
    expect(prochainBatimentNecessaire(sim, p)).toBe("puits");
    // Libre de tout autre chantier : le conseil doit se traduire par une fondation.
    p.projet = null;
    sim.avancer(3 * 144);
    expect([...sim.batiments.values()].some((b) => b.type === "puits")).toBe(true);
  });

  it("une leçon conseillée est retenue ; une priorité pèse sur le cerveau ; une direction oriente l'exploration", () => {
    const sim = colonie();
    const p = adulte(sim);
    let qid = questionAvec(sim, p, "lecon:enfants_dabord");
    expect(
      sim.conseiller({
        questionId: qid,
        personnageId: p.id,
        choix: "lecon:enfants_dabord",
        pensee: "",
        ambition: { but: "les petits d'abord", jours: 2 },
      }).ok,
    ).toBe(true);
    expect(p.savoirs.get("enfants_dabord")?.force).toBe(1);
    sim.avancerJusquaAube();
    sim.avancer(1);
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(p.ambition?.issue).toBe("accomplie");

    // Priorité : le score d'exploration monte de 0,35, le reste ne bouge pas.
    const cerveau = new RuleBrain(p);
    const sans = cerveau.candidats(percevoir(sim, p));
    p.drapeaux.conseilDemandeA = -1;
    qid = questionAvec(sim, p, "priorite:explorer");
    expect(
      sim.conseiller({
        questionId: qid,
        personnageId: p.id,
        choix: "priorite:explorer",
        pensee: "",
      }).ok,
    ).toBe(true);
    const avec = cerveau.candidats(percevoir(sim, p));
    const score = (l: typeof sans): number =>
      l.find((c) => c.intention.type === "explorer")?.score ?? 0;
    expect(score(avec)).toBeCloseTo(score(sans) + 0.35);
    expect(bonusPriorite("soin", { type: "soigner", cible: p.id })).toBe(0.35);
    expect(bonusPriorite("soin", { type: "explorer" })).toBe(0);

    // Direction : le plan d'exploration part vers le nord.
    p.drapeaux.conseilDemandeA = -1;
    qid = questionAvec(sim, p, "explorer:nord");
    expect(
      sim.conseiller({ questionId: qid, personnageId: p.id, choix: "explorer:nord", pensee: "" })
        .ok,
    ).toBe(true);
    expect(p.ambition).toMatchObject({ genre: "explorer", cible: "nord" });
    const plan = planifier(sim, p, { type: "explorer" });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      const a = plan.plan[0];
      expect(a?.type).toBe("deplacer");
      if (a?.type === "deplacer") expect(a.cible.y).toBeLessThan(p.corps.position.y);
    }
  });

  it("un choix hors catalogue, une mauvaise question ou un mort ne changent rien", () => {
    const sim = colonie();
    const p = adulte(sim);
    const qid = questionAvec(sim, p, "batiment:puits");
    expect(
      sim.conseiller({
        questionId: "q-autre",
        personnageId: p.id,
        choix: "batiment:puits",
        pensee: "",
      }),
    ).toEqual({ ok: false, raison: "question_inconnue" });
    expect(sim.questionEnCours).not.toBeNull();
    expect(
      sim.conseiller({ questionId: qid, personnageId: p.id, choix: "batiment:tombe", pensee: "" }),
    ).toEqual({ ok: false, raison: "option_invalide" });
    expect(sim.questionEnCours).toBeNull();
    expect(p.ambition).toBeNull();
    expect(sim.journal.parType("conseil").at(-1)?.details).toMatchObject({
      applique: false,
      raison: "option_invalide",
    });
    // Personnage mort.
    p.drapeaux.conseilDemandeA = -1;
    const qid2 = questionAvec(sim, p, "batiment:puits");
    sim.tuer(p, "test");
    expect(
      sim.conseiller({ questionId: qid2, personnageId: p.id, choix: "batiment:puits", pensee: "" }),
    ).toEqual({ ok: false, raison: "personnage_mort" });
  });

  it("une ambition non atteinte à l'échéance est abandonnée, et une nouvelle remplace l'ancienne", () => {
    const sim = colonie();
    const p = adulte(sim);
    const qid = questionAvec(sim, p, "batiment:maison");
    sim.conseiller({
      questionId: qid,
      personnageId: p.id,
      choix: "batiment:maison",
      pensee: "",
      ambition: { but: "un vrai toit", jours: 1 },
    });
    sim.avancerJusquaAube();
    sim.avancer(1);
    sim.avancerJusquaAube();
    sim.avancer(1);
    expect(p.ambition?.issue).toBe("abandonnee");
    expect(sim.journal.parType("ambition").at(-1)?.details.issue).toBe("abandonnee");
    p.drapeaux.conseilDemandeA = -1;
    const qid2 = questionAvec(sim, p, "priorite:provisions");
    sim.conseiller({
      questionId: qid2,
      personnageId: p.id,
      choix: "priorite:provisions",
      pensee: "",
    });
    expect(p.ambition).toMatchObject({ genre: "priorite", issue: "en_cours" });
  });
});
