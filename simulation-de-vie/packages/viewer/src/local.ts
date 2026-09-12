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
  /** Inspirations de Claude appliquées (affiché comme « appels IA »). */
  private appelsIA = 0;
  private preparation: ReturnType<typeof setTimeout> | null = null;
  private ferme = false;

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

  private pas(): void {
    const sim = this.sim;
    if (sim === null) return;
    const maintenant = performance.now();
    const dt = (maintenant - this.dernierTemps) / 1000;
    this.dernierTemps = maintenant;
    if (!this.pause) {
      this.accumulateur += dt * this.ticksParSeconde;
      // Plafond par intervalle pour laisser respirer l'affichage, surtout sur mobile.
      const n = Math.min(24, Math.floor(this.accumulateur));
      if (n > 0) {
        this.accumulateur -= n;
        sim.avancer(n);
        this.aDiffuser = true;
      }
    } else {
      this.accumulateur = 0;
    }
    if (this.aDiffuser && maintenant - this.derniereDiffusion >= 100) {
      this.diffuser();
      this.derniereDiffusion = maintenant;
      this.aDiffuser = false;
    }
  }

  private diffuser(): void {
    const sim = this.sim;
    if (sim === null) return;
    const brut = messageEtat(sim, {
      ticksParSeconde: this.ticksParSeconde,
      pause: this.pause,
      suivi: this.suivi,
      bilan: this.bilan,
      indexJournal: this.indexJournal,
    });
    const etat: MessageEtat = { ...brut, stats: { ...brut.stats, appelsLLM: this.appelsIA } };
    this.indexJournal = sim.journal.taille;
    this.onMessage(etat);
    if (this.ficheId !== null) {
      const fiche = messageFiche(sim, this.ficheId);
      if (fiche) this.onMessage(fiche);
    }
  }
}
