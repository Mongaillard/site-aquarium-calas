/**
 * Liaison avec la simulation qui tourne dans un Web Worker (M26) : même
 * interface que la liaison locale, mais la page ne simule plus rien. Une
 * grande colonie ne fait plus attendre l'affichage ni les gestes.
 */
import type { Sauvegarde } from "@sdv/core";
import type { Commande, MessageServeur } from "@sdv/protocole";
import type { LiaisonSimulee, OptionsLocales } from "./local.js";
import TravailleurWorker from "./travailleur.ts?worker&inline";
import type { DuTravailleur, VersTravailleur } from "./travailleur.js";

/** Une sauvegarde reçue il y a moins longtemps que cela sert de sauvegarde de sortie. */
const FRAICHEUR_SORTIE_MS = 60_000;

export class LiaisonTravailleur implements LiaisonSimulee {
  private travailleur: Worker | null = null;
  private compteur = 0;
  private readonly attentes = new Map<number, (s: Sauvegarde | null) => void>();
  private derniere: { sauvegarde: Sauvegarde; recueA: number } | null = null;
  private cout = 0;
  private pret = false;

  constructor(
    private readonly options: OptionsLocales,
    private readonly onMessage: (m: MessageServeur) => void,
    private readonly onConnexion: (connecte: boolean) => void,
    private readonly onProgression: (jour: number, total: number) => void = () => undefined,
  ) {}

  /** Vrai si le navigateur sait faire tourner un Web Worker. */
  static disponible(): boolean {
    return typeof Worker !== "undefined";
  }

  connecter(): void {
    const w = new TravailleurWorker();
    this.travailleur = w;
    w.onmessage = (ev: MessageEvent<DuTravailleur>): void => {
      const m = ev.data;
      switch (m.type) {
        case "message":
          this.onMessage(m.message);
          break;
        case "connexion":
          this.onConnexion(m.connecte);
          break;
        case "progression":
          this.onProgression(m.jour, m.total);
          if (m.jour >= m.total) this.pret = true;
          break;
        case "sauvegarde": {
          if (m.sauvegarde !== null) {
            this.derniere = { sauvegarde: m.sauvegarde, recueA: performance.now() };
            this.cout = m.cout;
          }
          const resolution = this.attentes.get(m.id);
          this.attentes.delete(m.id);
          resolution?.(m.sauvegarde);
          break;
        }
      }
    };
    w.onerror = (ev): void => {
      console.warn("travailleur :", ev.message);
    };
    this.poster({ type: "demarrer", options: this.options });
    if (this.options.joursAvance <= 0 || this.options.sauvegarde !== undefined) this.pret = true;
  }

  envoyer(commande: Commande): void {
    this.poster({ type: "commande", commande });
  }

  fermer(): void {
    this.poster({ type: "fermer" });
    this.travailleur?.terminate();
    this.travailleur = null;
    for (const r of this.attentes.values()) r(null);
    this.attentes.clear();
    this.onConnexion(false);
  }

  /**
   * La sauvegarde de sortie : la dernière reçue, si elle est fraîche. Un
   * travailleur ne répond pas dans le tour d'une page qui se ferme ; on
   * demande quand même la suivante, pour la fois d'après.
   */
  sauvegarder(): Sauvegarde | null {
    void this.sauvegarderSansBloquer();
    const d = this.derniere;
    return d !== null && performance.now() - d.recueA < FRAICHEUR_SORTIE_MS ? d.sauvegarde : null;
  }

  sauvegarderSansBloquer(): Promise<Sauvegarde | null> {
    if (this.travailleur === null || !this.pret) return Promise.resolve(null);
    const id = ++this.compteur;
    return new Promise((resolution) => {
      this.attentes.set(id, resolution);
      this.poster({ type: "sauvegarder", id, immediate: false });
    });
  }

  get coutSauvegardeMs(): number {
    return this.cout;
  }

  private poster(m: VersTravailleur): void {
    this.travailleur?.postMessage(m);
  }
}
