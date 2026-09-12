/**
 * Boucle principale (section 3). M1 : besoins, perception, décision (cerveau à
 * règles), planification, exécution des actions, régénération des gisements,
 * mort, journal d'événements.
 */
import { appliquerTickBesoins } from "./agents/besoins.js";
import type { Personnage } from "./agents/personnage.js";
import { genererPopulation } from "./agents/population.js";
import { executerTick } from "./actions/executeur.js";
import { planifier } from "./actions/planificateur.js";
import { decrireAction, decrireIntention, memeIntention } from "./actions/types.js";
import type { Intention } from "./actions/types.js";
import { percevoir } from "./cerveau/perception.js";
import { RuleBrain } from "./cerveau/rule-brain.js";
import type { Cerveau } from "./cerveau/types.js";
import type { SimConfig, SimConfigPartielle } from "./config.js";
import { fusionnerConfig, validerConfig } from "./config.js";
import { Journal } from "./evenements/journal.js";
import type { Evenement, TypeEvenement } from "./evenements/journal.js";
import type { Monde } from "./monde.js";
import { genererGrille } from "./monde/generation.js";
import { Grille } from "./monde/grille.js";
import type { Position, Tuile } from "./monde/grille.js";
import { Horloge } from "./monde/horloge.js";
import type { Gisement } from "./monde/ressources.js";
import { Rng } from "./rng.js";

export interface Statistiques {
  readonly tick: number;
  readonly vivants: number;
  readonly morts: number;
  readonly evenements: number;
}

export class Simulation implements Monde {
  readonly journal = new Journal();
  readonly personnages: Personnage[];
  private readonly cerveaux = new Map<string, Cerveau>();
  private readonly gisements: { tuile: Tuile; gisement: Gisement }[] = [];

  private constructor(
    readonly config: SimConfig,
    readonly rng: Rng,
    readonly horloge: Horloge,
    readonly grille: Grille,
  ) {
    for (const t of grille.toutes())
      if (t.gisement) this.gisements.push({ tuile: t, gisement: t.gisement });
    this.personnages = genererPopulation(rng, config, grille);
    for (const p of this.personnages) {
      this.cerveaux.set(p.id, new RuleBrain(p));
      this.emettre(
        "arrivee",
        p,
        { prenom: p.identite.prenom, nomFamille: p.identite.nomFamille },
        5,
      );
    }
  }

  /** Crée une simulation neuve à partir d'une configuration (partielle ou non). */
  static creer(partielle: SimConfigPartielle = {}): Simulation {
    const config = fusionnerConfig(partielle);
    validerConfig(config);
    const rng = Rng.depuisGraine(config.seed);
    const grille = genererGrille(rng.fork("monde"), {
      largeur: config.monde.largeur,
      hauteur: config.monde.hauteur,
    });
    return Simulation.creerAvecGrille(config, grille);
  }

  /** Crée une simulation sur une grille fournie (tests, scénarios). */
  static creerAvecGrille(partielle: SimConfigPartielle, grille: Grille): Simulation {
    const config = fusionnerConfig({
      ...partielle,
      monde: { ...partielle.monde, largeur: grille.largeur, hauteur: grille.hauteur },
    });
    validerConfig(config);
    const rng = Rng.depuisGraine(config.seed);
    const horloge = new Horloge({
      minutesParTick: config.temps.minutesParTick,
      joursParSaison: config.monde.joursParSaison,
    });
    return new Simulation(config, rng, horloge, grille);
  }

  get tick(): number {
    return this.horloge.tick;
  }

  personnage(id: string): Personnage | undefined {
    return this.personnages.find((p) => p.id === id);
  }

  vivants(): Personnage[] {
    return this.personnages.filter((p) => p.vivant);
  }

  cerveau(id: string): Cerveau | undefined {
    return this.cerveaux.get(id);
  }

  /** Remplace le cerveau d'un personnage (mode LLM en M5, tests). */
  definirCerveau(id: string, cerveau: Cerveau): void {
    this.cerveaux.set(id, cerveau);
  }

  emettre(
    type: TypeEvenement,
    acteur: Personnage | null,
    details: Evenement["details"] = {},
    importance = 1,
    position: Position | null = null,
  ): void {
    this.journal.enregistrer({
      tick: this.horloge.tick,
      type,
      acteur: acteur?.id ?? null,
      position: position ?? (acteur ? { ...acteur.corps.position } : null),
      importance,
      details,
    });
  }

  statistiques(): Statistiques {
    const vivants = this.vivants().length;
    return {
      tick: this.tick,
      vivants,
      morts: this.personnages.length - vivants,
      evenements: this.journal.taille,
    };
  }

  /** Avance la simulation d'un tick. */
  tick1(): void {
    this.regenererGisements();
    const ordre = this.rng.fork(`tick/${this.tick}`).melanger(this.vivants());
    for (const p of ordre) this.tickPersonnage(p);
    this.horloge.avancer(1);
  }

  avancer(n: number): void {
    for (let i = 0; i < n; i++) this.tick1();
  }

  avancerJusquaAube(): void {
    this.avancer(this.horloge.prochaineAube() - this.horloge.tick);
  }

  private regenererGisements(): void {
    const parTick = 1 / this.horloge.ticksParJour;
    for (const { gisement } of this.gisements) {
      if (gisement.tauxRegen > 0 && gisement.quantite < gisement.max) {
        gisement.quantite = Math.min(
          gisement.max,
          gisement.quantite + gisement.tauxRegen * parTick,
        );
      }
    }
  }

  private tickPersonnage(p: Personnage): void {
    const moment = this.horloge.moment();
    const enCompagnie = this.personnages.some(
      (a) => a.vivant && a.id !== p.id && Grille.distance(a.corps.position, p.corps.position) <= 2,
    );
    const effet = appliquerTickBesoins(p.besoins, {
      ticksParJour: this.horloge.ticksParJour,
      estNuit: moment.estNuit,
      dort: p.corps.endormi,
      aAbri: false,
      enCompagnie,
      extraversion: p.identite.personnalite.extraversion,
    });
    p.corps.sante = Math.min(100, p.corps.sante + effet.deltaSante);
    if (p.corps.sante <= 0) {
      this.mourir(p, effet.causes[0] ?? "inconnue");
      return;
    }
    if (this.horloge.estAube()) p.corps.ageJours += 1;

    // Épuisement : on s'endort sur place.
    if (p.besoins.sommeil <= 0 && !p.corps.endormi) {
      this.definirIntention(p, { type: "dormir" });
      p.plan = [];
      p.actionEnCours = { type: "dormir", ticksDormis: 0 };
    }

    const perception = percevoir(this, p);
    const cerveau = this.cerveaux.get(p.id);
    if (cerveau === undefined) return;

    if (!p.corps.endormi) {
      const urgence = cerveau.urgence(perception);
      if (urgence !== null && !memeIntention(urgence, p.intention)) {
        this.definirIntention(p, urgence);
        p.plan = [];
        p.actionEnCours = null;
      }
    }

    if (p.actionEnCours === null && p.plan.length === 0) {
      if (p.intention === null) this.definirIntention(p, cerveau.decider(perception));
      const intention = p.intention;
      if (intention === null) return;
      const resultat = planifier(this, p, intention);
      if (resultat.ok) {
        p.plan = resultat.plan;
        p.echecsConsecutifs = 0;
      } else {
        this.echouer(p, decrireIntention(intention), resultat.raison);
        // Repli : bouger pour découvrir autre chose.
        const repli = planifier(this, p, { type: "explorer" });
        if (repli.ok) p.plan = repli.plan;
        return;
      }
    }

    p.actionEnCours ??= p.plan.shift() ?? null;
    const action = p.actionEnCours;
    if (action === null) return;

    const resultat = executerTick(this, p, action);
    if (resultat.statut === "terminee") {
      p.actionEnCours = null;
      if (p.plan.length === 0) {
        this.emettre(
          "action_terminee",
          p,
          { intention: decrireIntention(p.intention ?? { type: "attendre", ticks: 0 }) },
          1,
        );
        p.intention = null;
      }
    } else if (resultat.statut === "echec") {
      this.echouer(p, decrireAction(action), resultat.raison);
      p.actionEnCours = null;
      p.plan = [];
      p.intention = null;
      p.corps.endormi = false;
    }
  }

  private definirIntention(p: Personnage, intention: Intention): void {
    p.intention = intention;
    this.emettre("intention", p, { intention: decrireIntention(intention) }, 1);
  }

  private echouer(p: Personnage, action: string, raison: string): void {
    p.dernierEchec = { tick: this.tick, action, raison };
    p.echecsConsecutifs += 1;
    this.emettre("action_echouee", p, { action, raison }, 2);
  }

  private mourir(p: Personnage, cause: string): void {
    p.vivant = false;
    p.causeDeces = cause;
    p.tickDeces = this.tick;
    p.corps.endormi = false;
    p.actionEnCours = null;
    p.plan = [];
    p.intention = null;
    this.emettre("deces", p, { cause, prenom: p.identite.prenom, ageJours: p.corps.ageJours }, 10);
  }
}
