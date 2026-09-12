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
  readonly gisements = new Map<string, { x: number; y: number; type: string; quantite: number }>();
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

  recevoir(message: MessageServeur, maintenant: number): void {
    switch (message.type) {
      case "init":
        this.init = message;
        this.gisements.clear();
        this.evenements.length = 0;
        this.conversations.length = 0;
        break;
      case "etat":
        this.etat = message;
        this.version += 1;
        for (const p of message.personnages) this.noms.set(p.id, `${p.prenom} ${p.nomFamille}`);
        for (const [x, y, type, quantite] of message.gisements) {
          const cle = `${x},${y}`;
          if (quantite < 0) this.gisements.delete(cle);
          else this.gisements.set(cle, { x, y, type, quantite });
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
    if (id === null) {
      this.fiche = null;
      this.suivre = false;
    }
  }

  personnage(id: string) {
    return this.etat?.personnages.find((p) => p.id === id) ?? null;
  }
}
