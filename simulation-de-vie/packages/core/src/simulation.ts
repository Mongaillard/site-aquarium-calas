/**
 * Boucle principale (section 3). M2 : météo et saisons, bâtiments (chantiers,
 * usure, feux), chaleur selon abri / feu / vêtement, en plus des besoins, de la
 * perception, de la décision, de la planification et de l'exécution de M1.
 */
import { appliquerTickBesoins } from "./agents/besoins.js";
import { possede } from "./agents/inventaire.js";
import type { Personnage } from "./agents/personnage.js";
import { genererPopulation } from "./agents/population.js";
import { creerPersonnage } from "./agents/personnage.js";
import { heriter as heriterGenome } from "./agents/genetique.js";
import {
  adopter,
  apprendreParObservation,
  deuil,
  heriter,
  tickVieQuotidien,
} from "./agents/vie.js";
import { construireGenealogie } from "./genealogie.js";
import type { Genealogie } from "./genealogie.js";
import { executerTick } from "./actions/executeur.js";
import { planifier } from "./actions/planificateur.js";
import { decrireAction, decrireIntention, memeIntention } from "./actions/types.js";
import type { Intention } from "./actions/types.js";
import { observer, percevoir, percevoirLeger, rayonVision } from "./cerveau/perception.js";
import { RuleBrain } from "./cerveau/rule-brain.js";
import type { Cerveau } from "./cerveau/types.js";
import type { SimConfig, SimConfigPartielle } from "./config.js";
import { fusionnerConfig, validerConfig } from "./config.js";
import { Journal } from "./evenements/journal.js";
import type { Evenement, TypeEvenement } from "./evenements/journal.js";
import { feuProche } from "./monde.js";
import { decrireEvenement, importancePourTemoin } from "./memoire/descriptions.js";
import type { Nommeur } from "./memoire/descriptions.js";
import { reflechir } from "./memoire/reflexion.js";
import { relationFamiliale } from "./social/relations.js";
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
  private compteurPersonnages = 0;
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
    this.compteurPersonnages = this.personnages.length;
    this.journal.ecouter((e) => {
      this.memoriser(e);
    });
    for (const p of this.personnages) {
      this.cerveaux.set(p.id, new RuleBrain(p));
      this.emettre(
        "arrivee",
        p,
        { prenom: p.identite.prenom, nomFamille: p.identite.nomFamille },
        5,
      );
    }
    // Les membres d'une même famille initiale se connaissent comme frères et sœurs.
    for (const a of this.personnages) {
      for (const b of this.personnages) {
        if (a.id !== b.id && a.identite.nomFamille === b.identite.nomFamille) {
          a.relations.set(b.id, relationFamiliale(b.id, "fratrie"));
        }
      }
    }
    this.nouveauJour();
  }

  /** Accès aux prénoms pour la mise en mots des souvenirs. */
  readonly nommeur: Nommeur = {
    prenom: (id) => this.personnage(id)?.identite.prenom ?? id,
    feminin: (id) => this.personnage(id)?.identite.sexe === "F",
  };

  /**
   * Alimente les mémoires : l'acteur (et l'interlocuteur d'un dialogue) se
   * souviennent à la première personne ; les témoins à portée de vue, en tiers.
   */
  private memoriser(e: Evenement): void {
    if (e.importance < 2 && e.type !== "dialogue") return;
    const type =
      e.type === "dialogue" ? "dialogue" : e.type === "reflexion" ? "reflexion" : "action";
    const acteur = e.acteur ? this.personnage(e.acteur) : undefined;
    if (acteur) {
      const texte = decrireEvenement(e, "acteur", this.nommeur);
      if (texte !== null) {
        const sujets = String(e.details.avec ?? e.details.cible ?? e.details.sujets ?? "")
          .split(",")
          .filter((x) => x !== "");
        acteur.memoire.ajouter(e.tick, type, texte, e.importance, sujets, e.position);
      }
    }
    if (e.type === "dialogue" || e.type === "offre" || e.type === "demande") {
      const autreId = String(e.details.avec ?? e.details.cible ?? "");
      const autre = this.personnage(autreId);
      if (autre && acteur) {
        const texte =
          e.type === "dialogue"
            ? `J'ai discuté avec ${acteur.identite.prenom} (${String(e.details.sujet)}).`
            : e.type === "offre"
              ? `${acteur.identite.prenom} m'a donné ${String(e.details.ressource)}.`
              : e.details.accepte === true
                ? `J'ai donné ${String(e.details.ressource)} à ${acteur.identite.prenom} qui me le demandait.`
                : `J'ai refusé ${String(e.details.ressource)} à ${acteur.identite.prenom}.`;
        autre.memoire.ajouter(e.tick, type, texte, e.importance, [acteur.id], e.position);
      }
    }
    if (e.importance < 3 || e.position === null) return;
    const rayon = rayonVision(this, this.horloge.moment());
    const exclus = new Set([e.acteur, String(e.details.avec ?? ""), String(e.details.cible ?? "")]);
    for (const t of this.personnages) {
      if (!t.vivant || t.corps.endormi || exclus.has(t.id)) continue;
      if (Grille.distance(t.corps.position, e.position) > rayon) continue;
      const texte = decrireEvenement(e, "temoin", this.nommeur);
      if (texte === null) continue;
      t.memoire.ajouter(
        e.tick,
        "observation",
        texte,
        importancePourTemoin(e),
        e.acteur ? [e.acteur] : [],
        e.position,
      );
      apprendreParObservation(t, e.type);
    }
  }

  /** Réflexion du soir pour un personnage : produit des événements `reflexion`. */
  reflechirPour(p: Personnage): void {
    for (const r of reflechir(this, p)) {
      this.emettre(
        "reflexion",
        p,
        { texte: r.texte, cle: r.cle, sujets: r.sujets.join(",") },
        r.importance,
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

  /** Prénoms déjà portés (vivants et morts), pour éviter les doublons. */
  prenomsUtilises(): Set<string> {
    return new Set(this.personnages.map((p) => p.identite.prenom));
  }

  naitre(mere: Personnage, pere: Personnage): Personnage {
    this.compteurPersonnages += 1;
    const id = `p-${String(this.compteurPersonnages).padStart(4, "0")}`;
    const coutume = this.config.social.nomFamille;
    const nomFamille =
      coutume === "pere"
        ? pere.identite.nomFamille
        : coutume === "mere"
          ? mere.identite.nomFamille
          : `${pere.identite.nomFamille}-${mere.identite.nomFamille}`;
    const enfant = creerPersonnage(this.rng, {
      id,
      naissance: this.tick,
      nomFamille,
      parents: [mere.id, pere.id],
      genome: heriterGenome(
        mere.identite.genome,
        pere.identite.genome,
        this.rng.fork(`genome/${id}`),
      ),
      prenomsInterdits: this.prenomsUtilises(),
      position: { ...mere.corps.position },
      ageJours: 0,
      joursParAnnee: this.config.vie.joursParAnnee,
      ageAdulte: this.config.vie.ageAdulte,
      ageAncien: this.config.vie.ageAncien,
      ticksParJour: this.horloge.ticksParJour,
      memoire: {
        maxSouvenirs: this.config.memoire.maxSouvenirs,
        demiVieRecenceJours: this.config.memoire.demiVieRecenceJours,
      },
    });
    enfant.besoins.faim = 80;
    enfant.besoins.soif = 80;
    this.personnages.push(enfant);
    this.cerveaux.set(id, new RuleBrain(enfant));
    for (const parent of [mere, pere]) {
      parent.relations.set(id, relationFamiliale(id, "enfant"));
      enfant.relations.set(parent.id, relationFamiliale(parent.id, "parent"));
    }
    for (const autre of this.personnages) {
      if (autre.id === id || autre.identite.parents === null) continue;
      if (autre.identite.parents.some((x) => x === mere.id || x === pere.id)) {
        autre.relations.set(id, relationFamiliale(id, "fratrie"));
        enfant.relations.set(autre.id, relationFamiliale(autre.id, "fratrie"));
      }
    }
    this.emettre(
      "naissance",
      mere,
      {
        enfant: id,
        prenom: enfant.identite.prenom,
        sexe: enfant.identite.sexe,
        pere: pere.id,
        nomFamille,
      },
      10,
    );
    const fille = enfant.identite.sexe === "F";
    pere.memoire.ajouter(
      this.tick,
      "action",
      `${enfant.identite.prenom}, ${fille ? "ma fille" : "mon fils"}, est né${fille ? "e" : ""}. ${mere.identite.prenom} va bien.`,
      10,
      [id, mere.id],
      mere.corps.position,
    );
    mere.besoins.moral = Math.min(100, mere.besoins.moral + 20);
    pere.besoins.moral = Math.min(100, pere.besoins.moral + 20);
    return enfant;
  }

  tuer(p: Personnage, cause: string): void {
    this.mourir(p, cause);
  }

  genealogie(): Genealogie {
    return construireGenealogie(this.personnages);
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
    const moment = this.horloge.moment();
    if (moment.heure === 21 && moment.minute === 0) this.soiree();
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
    if (this.tick > 0) {
      for (const p of this.vivants()) {
        p.corps.ageJours += 1;
        tickVieQuotidien(this, p);
      }
    }
    for (const p of this.vivants()) {
      p.drapeaux.faimMinDuJour = p.besoins.faim;
      p.drapeaux.chaleurMinDuJour = p.besoins.chaleur;
    }
  }

  /** Soir (21 h) : chacun fait le bilan de sa journée. */
  private soiree(): void {
    for (const p of this.vivants()) this.reflechirPour(p);
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
    if (feu !== null) {
      gainChaleur += PLANS_BATIMENT[feu.type].chaleur;
      perteChaleur *= 0.7;
    }
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
      facteurFaim: p.corps.enceinte !== null ? 1.3 : 1,
    });
    p.corps.sante = Math.min(100, p.corps.sante + effet.deltaSante);
    p.drapeaux.faimMinDuJour = Math.min(p.drapeaux.faimMinDuJour, p.besoins.faim);
    p.drapeaux.chaleurMinDuJour = Math.min(p.drapeaux.chaleurMinDuJour, p.besoins.chaleur);
    if (p.corps.sante <= 0) {
      this.mourir(p, effet.causes[0] ?? "inconnue");
      return;
    }

    // Projet orphelin (bâtiment détruit ou terminé par d'autres).
    if (p.projet !== null) {
      const b = this.batiments.get(p.projet.batimentId);
      if (b === undefined || b.etat === "termine") p.projet = null;
    }

    // Observation à chaque tick (connaissance des lieux) ; perception complète seulement pour décider.
    observer(this, p, rayonVision(this, moment));
    const legere = percevoirLeger(this, p);
    const cerveau = this.cerveaux.get(p.id);
    if (cerveau === undefined) return;

    if (!p.corps.endormi) {
      const urgence = this.tick >= p.urgenceIgnoreeJusqua ? cerveau.urgence(legere) : null;
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
      const perception = percevoir(this, p, false);
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
        // Une urgence impossible à planifier (aucune eau connue…) est mise en sommeil
        // deux heures, sinon elle annulerait le repli à chaque tick sans jamais bouger.
        if (memeIntention(intention, cerveau.urgence(legere))) {
          p.urgenceIgnoreeJusqua = this.tick + 12;
        }
        // Repli : un enfant rejoint un parent, un adulte bouge pour découvrir autre chose.
        const parent =
          p.corps.stade === "enfant"
            ? p.identite.parents?.find((id) => this.personnage(id)?.vivant)
            : undefined;
        const repli = planifier(
          this,
          p,
          parent !== undefined ? { type: "suivre", cible: parent } : { type: "explorer" },
        );
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
    this.emettre("action_echouee", p, { action, raison }, 1);
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
    heriter(this, p); // avant le deuil, qui rompt l'union
    deuil(this, p, cause);
    for (const enfant of this.personnages) {
      if (enfant.vivant && (enfant.identite.parents?.includes(p.id) ?? false))
        adopter(this, enfant);
    }
  }
}
