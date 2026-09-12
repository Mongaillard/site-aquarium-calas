/** Magasin d'état côté viewer : ce que le serveur a envoyé, plus l'état d'interface. */
import type {
  EvenementEtat,
  MessageEtat,
  MessageFiche,
  MessageInit,
  MessageServeur,
} from "@sdv/protocole";
import { decouperTranscription } from "@sdv/protocole";

export interface Bulle {
  readonly id: string;
  readonly texte: string;
  readonly debut: number;
  readonly fin: number;
}

export interface Conversation {
  readonly tick: number;
  readonly acteur: string;
  readonly avec: string;
  readonly sujet: string;
  readonly repliques: readonly { locuteur: string; texte: string }[];
}

export const MAX_EVENEMENTS = 4000;
export const MAX_CONVERSATIONS = 150;

export class Magasin {
  init: MessageInit | null = null;
  etat: MessageEtat | null = null;
  fiche: MessageFiche | null = null;
  readonly gisements = new Map<
    string,
    { x: number; y: number; type: string; quantite: number; outil: string }
  >();
  /** Interpolation des déplacements : de (ax, ay) à (bx, by) entre t0 et t1. */
  private readonly trajets = new Map<
    string,
    { ax: number; ay: number; bx: number; by: number; t0: number; t1: number }
  >();
  private dernierEtatA = 0;
  selectionBatiment: string | null = null;
  readonly evenements: EvenementEtat[] = [];
  readonly conversations: Conversation[] = [];
  readonly noms = new Map<string, string>();
  readonly typesVus = new Set<string>();
  bulles: Bulle[] = [];
  selection: string | null = null;
  suivre = false;
  connecte = false;
  /** Compteur de messages `etat` reçus (pour rafraîchir les panneaux à cadence réduite). */
  version = 0;

  nom(id: string): string {
    return this.noms.get(id) ?? id;
  }

  /** Oublie tout (nouveau monde). */
  reinitialiser(): void {
    this.init = null;
    this.etat = null;
    this.fiche = null;
    this.gisements.clear();
    this.trajets.clear();
    this.evenements.length = 0;
    this.conversations.length = 0;
    this.noms.clear();
    this.typesVus.clear();
    this.bulles = [];
    this.selection = null;
    this.selectionBatiment = null;
    this.suivre = false;
    this.version += 1;
  }

  recevoir(message: MessageServeur, maintenant: number): void {
    switch (message.type) {
      case "init":
        this.init = message;
        this.gisements.clear();
        this.evenements.length = 0;
        this.conversations.length = 0;
        break;
      case "etat": {
        const precedent = this.etat;
        this.etat = message;
        this.version += 1;
        // Durée d'interpolation : l'intervalle réel entre deux états, borné.
        const duree = Math.min(900, Math.max(80, maintenant - this.dernierEtatA));
        this.dernierEtatA = maintenant;
        for (const p of message.personnages) {
          this.noms.set(p.id, `${p.prenom} ${p.nomFamille}`);
          const t = this.trajets.get(p.id);
          if (t === undefined) {
            this.trajets.set(p.id, {
              ax: p.x,
              ay: p.y,
              bx: p.x,
              by: p.y,
              t0: maintenant,
              t1: maintenant,
            });
          } else if (t.bx !== p.x || t.by !== p.y) {
            const courant = this.positionAffichee(p.id, maintenant) ?? { x: t.bx, y: t.by };
            const saut = Math.max(Math.abs(p.x - t.bx), Math.abs(p.y - t.by)) > 6;
            this.trajets.set(p.id, {
              ax: saut ? p.x : courant.x,
              ay: saut ? p.y : courant.y,
              bx: p.x,
              by: p.y,
              t0: maintenant,
              t1: maintenant + (saut ? 0 : duree),
            });
          }
        }
        if (precedent === null) this.dernierEtatA = maintenant;
        for (const [x, y, type, quantite, outil] of message.gisements) {
          const cle = `${x},${y}`;
          if (quantite < 0) this.gisements.delete(cle);
          else this.gisements.set(cle, { x, y, type, quantite, outil });
        }
        for (const e of message.evenements) {
          this.typesVus.add(e.type);
          this.evenements.push(e);
          if (e.type === "dialogue") this.ajouterConversation(e, maintenant);
        }
        if (this.evenements.length > MAX_EVENEMENTS)
          this.evenements.splice(0, this.evenements.length - MAX_EVENEMENTS);
        this.bulles = this.bulles.filter((b) => b.fin > maintenant);
        break;
      }
      case "fiche":
        if (message.id === this.selection) this.fiche = message;
        break;
      case "erreur":
        console.warn("serveur :", message.message);
        break;
    }
  }

  private ajouterConversation(e: EvenementEtat, maintenant: number): void {
    const acteur = e.acteur ?? "";
    const avec = String(e.details.avec ?? "");
    const repliques = decouperTranscription(String(e.details.transcription ?? ""));
    this.conversations.push({
      tick: e.tick,
      acteur,
      avec,
      sujet: String(e.details.sujet ?? ""),
      repliques,
    });
    if (this.conversations.length > MAX_CONVERSATIONS) this.conversations.shift();
    // Bulles : les répliques s'enchaînent toutes les 1,2 s, chacune reste 2,5 s ;
    // une seule bulle par personnage, la plus récente remplace l'ancienne.
    const prenomActeur = this.nom(acteur).split(" ")[0] ?? "";
    this.bulles = this.bulles.filter((b) => b.id !== acteur && b.id !== avec);
    repliques.slice(0, 4).forEach((r, i) => {
      const id = r.locuteur === prenomActeur ? acteur : avec;
      const debut = maintenant + i * 1200;
      this.bulles.push({ id, texte: r.texte, debut, fin: debut + 2500 });
    });
  }

  selectionner(id: string | null): void {
    this.selection = id;
    if (id !== null) this.selectionBatiment = null;
    if (id === null) {
      this.fiche = null;
      this.suivre = false;
    }
  }

  /** Position affichée d'un personnage (interpolée), ou null s'il est inconnu. */
  positionAffichee(
    id: string,
    maintenant: number,
  ): { x: number; y: number; enMouvement: boolean } | null {
    const t = this.trajets.get(id);
    if (t === undefined) return null;
    if (maintenant >= t.t1) return { x: t.bx, y: t.by, enMouvement: false };
    const f = (maintenant - t.t0) / Math.max(1, t.t1 - t.t0);
    return { x: t.ax + (t.bx - t.ax) * f, y: t.ay + (t.by - t.ay) * f, enMouvement: true };
  }

  batiment(id: string) {
    return this.etat?.batiments.find((b) => b.id === id) ?? null;
  }

  personnage(id: string) {
    return this.etat?.personnages.find((p) => p.id === id) ?? null;
  }
}
