/** Liaison WebSocket avec reconnexion. */
import type { Commande, MessageServeur } from "@sdv/protocole";

/** Ce que le viewer attend d'une liaison avec la simulation, distante ou locale. */
export interface Liaison {
  connecter(): void;
  envoyer(commande: Commande): void;
  fermer(): void;
}

export class Reseau implements Liaison {
  private ws: WebSocket | null = null;
  private tentative = 0;
  private ferme = false;

  constructor(
    private readonly url: string,
    private readonly onMessage: (m: MessageServeur) => void,
    private readonly onConnexion: (connecte: boolean) => void,
  ) {}

  connecter(): void {
    if (this.ferme) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.addEventListener("open", () => {
      this.tentative = 0;
      this.onConnexion(true);
    });
    ws.addEventListener("message", (ev) => {
      try {
        this.onMessage(JSON.parse(String(ev.data)) as MessageServeur);
      } catch (erreur) {
        console.warn("message illisible", erreur);
      }
    });
    ws.addEventListener("close", () => {
      this.onConnexion(false);
      this.tentative += 1;
      const delai = Math.min(8000, 500 * 2 ** this.tentative);
      setTimeout(() => {
        this.connecter();
      }, delai);
    });
    ws.addEventListener("error", () => {
      ws.close();
    });
  }

  envoyer(commande: Commande): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(commande));
  }

  fermer(): void {
    this.ferme = true;
    this.ws?.close();
  }
}

/** URL du WebSocket à partir de l'adresse de la page (dev Vite ou serveur intégré). */
export function urlWebSocket(location: { protocol: string; host: string }): string {
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}
