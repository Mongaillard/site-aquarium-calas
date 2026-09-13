/**
 * Liaison locale : la simulation tourne dans la page elle-même (aucun serveur),
 * avec exactement les mêmes messages que le serveur WebSocket. Utile sur mobile
 * et pour les pages publiées.
 */
import { Simulation } from "@sdv/core";
import type { Sauvegarde, SimConfigPartielle } from "@sdv/core";
import type { Commande, MessageEtat, MessageServeur } from "@sdv/protocole";
import {
  BilanSaisons,
  SuiviClient,
  messageEtat,
  messageFiche,
  messageInit,
} from "@sdv/server/instantane";
import type { Liaison } from "./reseau.js";

/** Temps de simulation par intervalle de 50 ms : le reste est laissé à l'affichage et aux gestes. */
const BUDGET_TICKS_MS = 22;
/** Encodage d'une sauvegarde par tranches de ce temps, entre lesquelles la page respire. */
const TRANCHE_SAUVEGARDE_MS = 8;
/** Un monde qui a bougé pendant l'encodage : on recommence, jusqu'à ce nombre de fois. */
const ESSAIS_SAUVEGARDE = 3;

const souffler = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export interface OptionsLocales {
  readonly seed: number | string;
  /** Jours simulés avant d'afficher le monde (colonie déjà installée). */
  readonly joursAvance: number;
  readonly ticksParSeconde: number;
  readonly config?: SimConfigPartielle;
  /** Reprendre un monde sauvegardé au lieu d'en créer un (pas de pré-simulation). */
  readonly sauvegarde?: unknown;
}

export class LiaisonLocale implements Liaison {
  private sim: Simulation | null = null;
  private readonly suivi = new SuiviClient();
  private readonly bilan = new BilanSaisons();
  private indexJournal = 0;
  private ficheId: string | null = null;
  private pause = false;
  private ticksParSeconde: number;
  private accumulateur = 0;
  private dernierTemps = 0;
  private derniereDiffusion = 0;
  private aDiffuser = false;
  private minuteur: ReturnType<typeof setInterval> | null = null;
  /** Ticks réellement simulés par seconde, mesurés (la vitesse demandée peut être hors de portée). */
  private vitesseEffective = 0;
  private intervalleDiffusion = 100;
  private derniereCarte = 0;
  private ticksRecents = 0;
  private mesureDepuis = 0;
  /** Inspirations de Claude appliquées (affiché comme « appels IA »). */
  private appelsIA = 0;
  private preparation: ReturnType<typeof setTimeout> | null = null;
  private ferme = false;
  /** Sauvegarde en cours d'encodage par tranches : le monde ne bouge pas d'ici sa fin. */
  private encodage: Promise<Sauvegarde | null> | null = null;
  /** Compté à chaque commande qui change le monde sans le faire avancer. */
  private mutations = 0;
  /** Temps de calcul de la dernière sauvegarde encodée par tranches. */
  private coutSauvegarde = 0;

  constructor(
    private readonly options: OptionsLocales,
    private readonly onMessage: (m: MessageServeur) => void,
    private readonly onConnexion: (connecte: boolean) => void,
    private readonly onProgression: (jour: number, total: number) => void = () => undefined,
  ) {
    this.ticksParSeconde = options.ticksParSeconde;
  }

  connecter(): void {
    const reprise = this.options.sauvegarde !== undefined;
    const sim = reprise
      ? Simulation.restaurer(this.options.sauvegarde)
      : Simulation.creer({ ...this.options.config, seed: this.options.seed });
    this.sim = sim;
    this.onConnexion(true);
    this.onMessage(messageInit(sim));
    // Pré-simulation jour par jour, sans bloquer la page (aucune après une reprise).
    const total = reprise ? 0 : this.options.joursAvance;
    let jour = 0;
    const etape = (): void => {
      if (this.ferme) return;
      if (jour < total) {
        sim.avancerJusquaAube();
        jour += 1;
        this.onProgression(jour, total);
        this.preparation = setTimeout(etape, 0);
        return;
      }
      this.preparation = null;
      this.dernierTemps = performance.now();
      this.mesureDepuis = this.dernierTemps;
      this.diffuser();
      this.minuteur = setInterval(() => {
        this.pas();
      }, 50);
    };
    etape();
  }

  envoyer(commande: Commande): void {
    const sim = this.sim;
    if (sim === null) return;
    if (commande.type !== "pause" && commande.type !== "reprendre" && commande.type !== "vitesse")
      this.mutations += 1;
    switch (commande.type) {
      case "pause":
        this.pause = true;
        break;
      case "reprendre":
        this.pause = false;
        this.dernierTemps = performance.now();
        break;
      case "vitesse":
        this.ticksParSeconde = commande.ticksParSeconde;
        break;
      case "tick":
        sim.avancer(1);
        break;
      case "aube":
        sim.avancerJusquaAube();
        break;
      case "inspecter":
        this.ficheId = commande.id;
        this.aDiffuser = true;
        return;
      case "fermer_fiche":
        this.ficheId = null;
        return;
      case "inspiration":
        if (sim.inspirer(commande)) this.appelsIA += 1;
        this.aDiffuser = true;
        return;
      case "pouvoir":
        sim.exercer(commande);
        break;
      case "conseil":
        if (sim.conseiller(commande).ok) this.appelsIA += 1;
        this.aDiffuser = true;
        return;
      case "demander_conseil":
        sim.demanderConseil(commande.id);
        this.aDiffuser = true;
        return;
      case "providence":
        sim.definirProvidence(commande.actif);
        break;
    }
    if (this.minuteur !== null) this.diffuser();
  }

  fermer(): void {
    this.ferme = true;
    if (this.minuteur !== null) clearInterval(this.minuteur);
    if (this.preparation !== null) clearTimeout(this.preparation);
    this.minuteur = null;
    this.preparation = null;
    this.onConnexion(false);
  }

  get simulation(): Simulation | null {
    return this.sim;
  }

  /** L'état complet du monde, à ranger où l'on veut (null tant que le monde n'est pas prêt). */
  sauvegarder(): Sauvegarde | null {
    return this.sim === null || this.preparation !== null ? null : this.sim.sauvegarder();
  }

  /**
   * La même sauvegarde, sans figer la page : les personnages s'encodent par
   * tranches de quelques millisecondes, la simulation attend entre-temps
   * (une grande colonie prend plusieurs centaines de millisecondes à encoder).
   * Une demande pendant qu'une autre est en cours reçoit la même sauvegarde.
   */
  sauvegarderSansBloquer(): Promise<Sauvegarde | null> {
    if (this.sim === null || this.preparation !== null) return Promise.resolve(null);
    if (this.encodage !== null) return this.encodage;
    const promesse = this.encoderParTranches().finally(() => {
      if (this.encodage === promesse) this.encodage = null;
    });
    this.encodage = promesse;
    return promesse;
  }

  /** Temps de calcul (ms) de la dernière sauvegarde encodée par tranches. */
  get coutSauvegardeMs(): number {
    return this.coutSauvegarde;
  }

  private async encoderParTranches(): Promise<Sauvegarde | null> {
    const sim = this.sim;
    if (sim === null) return null;
    for (let essai = 0; essai < ESSAIS_SAUVEGARDE; essai++) {
      const mutations = this.mutations;
      const etapes = sim.sauvegarderParEtapes();
      let cout = 0;
      let sauvegarde: Sauvegarde | null = null;
      for (;;) {
        const debut = performance.now();
        while (sauvegarde === null && performance.now() - debut < TRANCHE_SAUVEGARDE_MS)
          sauvegarde = etapes.suivant(1);
        cout += performance.now() - debut;
        if (sauvegarde !== null) break;
        await souffler();
        if (this.ferme || this.sim !== sim) return null;
        // Une commande a touché au monde entre deux tranches : on repart du monde d'à présent.
        if (sim.tick !== etapes.tick || this.mutations !== mutations) break;
      }
      if (sauvegarde !== null) {
        this.coutSauvegarde = cout;
        return sauvegarde;
      }
    }
    return sim.sauvegarder();
  }

  private pas(): void {
    const sim = this.sim;
    if (sim === null) return;
    const maintenant = performance.now();
    const dt = (maintenant - this.dernierTemps) / 1000;
    this.dernierTemps = maintenant;
    // Pendant l'encodage d'une sauvegarde, le monde attend (la sauvegarde doit être d'un seul tick).
    if (!this.pause && this.encodage === null) {
      this.accumulateur += dt * this.ticksParSeconde;
      // Un budget de temps par intervalle, jamais plus : la page ne gèle pas, et quand la
      // colonie est nombreuse la vitesse effective baisse d'elle-même. Ce qu'on n'a pas pu
      // simuler ne s'accumule pas au-delà d'une seconde de jeu.
      const n = Math.floor(this.accumulateur);
      if (n > 0) {
        const debut = performance.now();
        let faits = 0;
        while (faits < n && (faits === 0 || performance.now() - debut < BUDGET_TICKS_MS)) {
          sim.avancer(1);
          faits += 1;
        }
        this.accumulateur = Math.min(this.accumulateur - faits, this.ticksParSeconde);
        this.ticksRecents += faits;
        this.aDiffuser = true;
      }
      if (maintenant - this.mesureDepuis >= 1000) {
        this.vitesseEffective = Math.round(
          (this.ticksRecents * 1000) / (maintenant - this.mesureDepuis),
        );
        this.ticksRecents = 0;
        this.mesureDepuis = maintenant;
      }
    } else {
      this.accumulateur = 0;
    }
    // Bâtir l'état coûte d'autant plus que la colonie est grande : on espace la diffusion à
    // quatre fois son coût (entre 100 ms et 1 s), pour laisser la simulation et l'affichage vivre.
    if (this.aDiffuser && maintenant - this.derniereDiffusion >= this.intervalleDiffusion) {
      this.derniereDiffusion = maintenant;
      this.aDiffuser = false;
      // Dans une tâche à part : les ticks et l'état ne font pas un seul long blocage.
      const avecCarte = maintenant - this.derniereCarte >= 1000;
      if (avecCarte) this.derniereCarte = maintenant;
      setTimeout(() => {
        if (this.ferme) return;
        const debut = performance.now();
        this.diffuser(avecCarte);
        this.intervalleDiffusion = Math.min(1000, Math.max(100, (performance.now() - debut) * 4));
      }, 0);
    }
  }

  private diffuser(avecCarte = true): void {
    const sim = this.sim;
    if (sim === null) return;
    const brut = messageEtat(sim, {
      ticksParSeconde: this.ticksParSeconde,
      pause: this.pause,
      suivi: this.suivi,
      bilan: this.bilan,
      indexJournal: this.indexJournal,
      avecCarte,
    });
    const etat: MessageEtat = {
      ...brut,
      vitesseEffective: this.vitesseEffective,
      stats: { ...brut.stats, appelsLLM: this.appelsIA },
    };
    this.indexJournal = sim.journal.taille;
    this.onMessage(etat);
    if (this.ficheId !== null) {
      const fiche = messageFiche(sim, this.ficheId);
      if (fiche) this.onMessage(fiche);
    }
  }
}
