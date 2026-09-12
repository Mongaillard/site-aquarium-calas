/**
 * Boucle principale (section 3). M2 : météo et saisons, bâtiments (chantiers,
 * usure, feux), chaleur selon abri / feu / vêtement, en plus des besoins, de la
 * perception, de la décision, de la planification et de l'exécution de M1.
 */
import { appliquerTickBesoins } from "./agents/besoins.js";
import { possede } from "./agents/inventaire.js";
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
import { feuProche } from "./monde.js";
import type { Monde } from "./monde.js";
import { PLANS_BATIMENT, creerChantier } from "./monde/batiments.js";
import type { Batiment, TypeBatiment } from "./monde/batiments.js";
import { genererGrille } from "./monde/generation.js";
import { Grille } from "./monde/grille.js";
import type { Position, Tuile } from "./monde/grille.js";
import { Horloge } from "./monde/horloge.js";
import { EFFETS_METEO, EFFETS_SAISON, tirerMeteo } from "./monde/meteo.js";
import type { Meteo } from "./monde/meteo.js";
import type { Gisement } from "./monde/ressources.js";
import { Rng } from "./rng.js";

export interface Statistiques {
  readonly tick: number;
  readonly vivants: number;
  readonly morts: number;
  readonly evenements: number;
  readonly batiments: number;
  readonly chantiers: number;
  readonly meteo: Meteo;
}

export class Simulation implements Monde {
  readonly journal = new Journal();
  readonly personnages: Personnage[];
  readonly batiments = new Map<string, Batiment>();
  meteo: Meteo = "clair";
  private readonly cerveaux = new Map<string, Cerveau>();
  private readonly gisements: { tuile: Tuile; gisement: Gisement }[] = [];
  private compteurBatiments = 0;

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
    this.nouveauJour();
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

  fonderChantier(type: TypeBatiment, position: Position, fondateur: Personnage): Batiment {
    const tuile = this.grille.tuile(position.x, position.y);
    if (tuile.batiment !== null) throw new Error(`Tuile (${position.x}, ${position.y}) déjà bâtie`);
    this.compteurBatiments += 1;
    const id = `b-${String(this.compteurBatiments).padStart(4, "0")}`;
    const b = creerChantier(
      id,
      type,
      position,
      fondateur.id,
      fondateur.identite.nomFamille,
      this.tick,
    );
    this.batiments.set(id, b);
    tuile.batiment = b;
    this.emettre("chantier_fonde", fondateur, { batiment: id, type }, 4, position);
    return b;
  }

  detruireBatiment(id: string): void {
    const b = this.batiments.get(id);
    if (b === undefined) return;
    this.batiments.delete(id);
    const tuile = this.grille.tuile(b.position.x, b.position.y);
    if (tuile.batiment?.id === id) tuile.batiment = null;
    for (const p of this.personnages) if (p.projet?.batimentId === id) p.projet = null;
    this.emettre(
      "batiment_effondre",
      null,
      { batiment: id, type: b.type, proprietaire: b.proprietaire },
      6,
      b.position,
    );
  }

  batimentsTermines(type?: TypeBatiment): Batiment[] {
    return [...this.batiments.values()].filter(
      (b) => b.etat === "termine" && (type === undefined || b.type === type),
    );
  }

  statistiques(): Statistiques {
    const vivants = this.vivants().length;
    let chantiers = 0;
    for (const b of this.batiments.values()) if (b.etat === "chantier") chantiers++;
    return {
      tick: this.tick,
      vivants,
      morts: this.personnages.length - vivants,
      evenements: this.journal.taille,
      batiments: this.batiments.size - chantiers,
      chantiers,
      meteo: this.meteo,
    };
  }

  /** Avance la simulation d'un tick. */
  tick1(): void {
    if (this.horloge.estAube() && this.tick > 0) this.nouveauJour();
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

  /** Aube : météo du jour, usure des bâtiments, tempêtes, vieillissement. */
  private nouveauJour(): void {
    const moment = this.horloge.moment();
    this.meteo = tirerMeteo(this.rng, moment.saison, moment.jourAbsolu);
    this.emettre(
      "meteo",
      null,
      { meteo: this.meteo, saison: moment.saison, jour: moment.jourAbsolu },
      1,
    );
    const tempete = EFFETS_METEO[this.meteo].tempete;
    for (const b of [...this.batiments.values()]) {
      if (b.etat !== "termine") continue;
      b.solidite -= tempete ? 4 : 1;
      if (tempete && b.type === "feu_de_camp" && b.allume) {
        b.allume = false;
        this.emettre("feu_eteint", null, { batiment: b.id }, 3, b.position);
      }
      if (b.solidite <= 0) this.detruireBatiment(b.id);
    }
    if (this.tick > 0) for (const p of this.vivants()) p.corps.ageJours += 1;
  }

  private regenererGisements(): void {
    const moment = this.horloge.moment();
    const facteurBaies =
      EFFETS_SAISON[moment.saison].regenBaies * EFFETS_METEO[this.meteo].regenBaies;
    const parTick = 1 / this.horloge.ticksParJour;
    for (const { gisement } of this.gisements) {
      if (gisement.tauxRegen <= 0 || gisement.quantite >= gisement.max) continue;
      const facteur = gisement.type === "baies" ? facteurBaies : 1;
      if (facteur <= 0) continue;
      gisement.quantite = Math.min(
        gisement.max,
        gisement.quantite + gisement.tauxRegen * facteur * parTick,
      );
    }
  }

  private tickPersonnage(p: Personnage): void {
    const moment = this.horloge.moment();
    const pos = p.corps.position;
    const enCompagnie = this.personnages.some(
      (a) => a.vivant && a.id !== p.id && Grille.distance(a.corps.position, pos) <= 2,
    );

    // Chaleur : pertes (saison × météo) atténuées par l'abri et le vêtement, gains de l'abri et du feu.
    const saison = EFFETS_SAISON[moment.saison];
    const meteo = EFFETS_METEO[this.meteo];
    const batimentIci = this.grille.tuile(pos.x, pos.y).batiment;
    const abriIci =
      batimentIci !== null &&
      batimentIci.etat === "termine" &&
      PLANS_BATIMENT[batimentIci.type].abri
        ? batimentIci
        : null;
    let perteChaleur = (moment.estNuit ? saison.froidNuit : saison.froidJour) * meteo.froid;
    let gainChaleur = 0;
    if (abriIci !== null) {
      perteChaleur *= 0.3;
      gainChaleur += PLANS_BATIMENT[abriIci.type].chaleur;
    }
    const feu = feuProche(this, pos);
    if (feu !== null) gainChaleur += PLANS_BATIMENT[feu.type].chaleur;
    if (possede(p.corps.inventaire, "vetement_cuir")) perteChaleur *= 0.6;

    const effet = appliquerTickBesoins(p.besoins, {
      ticksParJour: this.horloge.ticksParJour,
      estNuit: moment.estNuit,
      dort: p.corps.endormi,
      aAbri: abriIci !== null,
      enCompagnie,
      extraversion: p.identite.personnalite.extraversion,
      perteChaleur,
      gainChaleur,
      facteurSoif: meteo.soif,
    });
    p.corps.sante = Math.min(100, p.corps.sante + effet.deltaSante);
    if (p.corps.sante <= 0) {
      this.mourir(p, effet.causes[0] ?? "inconnue");
      return;
    }

    // Projet orphelin (bâtiment détruit ou terminé par d'autres).
    if (p.projet !== null) {
      const b = this.batiments.get(p.projet.batimentId);
      if (b === undefined || b.etat === "termine") p.projet = null;
    }

    const perception = percevoir(this, p);
    const cerveau = this.cerveaux.get(p.id);
    if (cerveau === undefined) return;

    if (!p.corps.endormi) {
      const urgence = cerveau.urgence(perception);
      if (urgence !== null) {
        if (!memeIntention(urgence, p.intention)) {
          this.definirIntention(p, urgence);
          p.plan = [];
          p.actionEnCours = null;
        }
      } else if (p.besoins.sommeil <= 0) {
        // Épuisement sans urgence vitale : on s'endort sur place.
        this.definirIntention(p, { type: "dormir" });
        p.plan = [];
        p.actionEnCours = { type: "dormir", ticksDormis: 0 };
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
        p.intention = null;
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
    p.projet = null;
    this.emettre("deces", p, { cause, prenom: p.identite.prenom, ageJours: p.corps.ageJours }, 10);
  }
}
