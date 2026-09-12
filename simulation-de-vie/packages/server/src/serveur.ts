/**
 * Serveur de simulation : boucle temps réel à vitesse réglable, diffusion de
 * l'état par WebSocket, service statique du viewer.
 */
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { WebSocketServer } from "ws";
import type { RawData, WebSocket } from "ws";
import type { Simulation } from "@sdv/core";
import { analyserCommande } from "@sdv/protocole";
import type { Commande, MessageServeur } from "@sdv/protocole";
import { BilanSaisons, SuiviClient, messageEtat, messageFiche, messageInit } from "./instantane.js";

export interface OptionsServeur {
  readonly port: number;
  readonly ticksParSeconde: number;
  readonly pause: boolean;
  /** Dossier des fichiers statiques du viewer (null : pas de service statique). */
  readonly racineStatique: string | null;
  /** Période de diffusion minimale en ms. */
  readonly periodeDiffusionMs?: number;
}

interface Client {
  readonly ws: WebSocket;
  readonly suivi: SuiviClient;
  indexJournal: number;
  ficheId: string | null;
}

/** Décode un message WebSocket (chaîne, Buffer, ArrayBuffer ou fragments) en texte. */
export function texteDe(donnees: RawData): string {
  if (typeof donnees === "string") return donnees;
  if (Array.isArray(donnees)) return Buffer.concat(donnees).toString("utf8");
  if (Buffer.isBuffer(donnees)) return donnees.toString("utf8");
  return Buffer.from(donnees).toString("utf8");
}

const TYPES_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export class Serveur {
  readonly clients = new Set<Client>();
  ticksParSeconde: number;
  pause: boolean;
  private http: Server | null = null;
  private wss: WebSocketServer | null = null;
  private minuteur: NodeJS.Timeout | null = null;
  private accumulateur = 0;
  private dernierTemps = 0;
  private derniereDiffusion = 0;
  private aDiffuser = false;
  private readonly bilan = new BilanSaisons();

  constructor(
    readonly sim: Simulation,
    readonly options: OptionsServeur,
  ) {
    this.ticksParSeconde = options.ticksParSeconde;
    this.pause = options.pause;
  }

  /** Démarre HTTP + WebSocket ; renvoie le port effectif (utile avec le port 0). */
  async demarrer(): Promise<number> {
    const http = createServer((req, res) => {
      void this.servirStatique(req, res);
    });
    const wss = new WebSocketServer({ server: http, path: "/ws" });
    wss.on("connection", (ws) => {
      this.accueillir(ws);
    });
    this.http = http;
    this.wss = wss;
    await new Promise<void>((resoudre) => {
      http.listen(this.options.port, resoudre);
    });
    this.dernierTemps = performance.now();
    this.minuteur = setInterval(() => {
      this.pas();
    }, 50);
    const adresse = http.address();
    return typeof adresse === "object" && adresse !== null ? adresse.port : this.options.port;
  }

  async arreter(): Promise<void> {
    if (this.minuteur) clearInterval(this.minuteur);
    this.minuteur = null;
    for (const c of this.clients) c.ws.close();
    this.clients.clear();
    this.wss?.close();
    await new Promise<void>((resoudre) => {
      if (this.http) {
        this.http.close(() => {
          resoudre();
        });
      } else {
        resoudre();
      }
    });
  }

  /** Un pas de la boucle temps réel : avance la simulation selon la vitesse, puis diffuse. */
  pas(): void {
    const maintenant = performance.now();
    const dt = (maintenant - this.dernierTemps) / 1000;
    this.dernierTemps = maintenant;
    if (!this.pause) {
      this.accumulateur += dt * this.ticksParSeconde;
      const n = Math.min(256, Math.floor(this.accumulateur));
      if (n > 0) {
        this.accumulateur -= n;
        this.sim.avancer(n);
        this.aDiffuser = true;
      }
    } else {
      this.accumulateur = 0;
    }
    const periode = this.options.periodeDiffusionMs ?? 100;
    if (this.aDiffuser && maintenant - this.derniereDiffusion >= periode) {
      this.diffuser();
      this.derniereDiffusion = maintenant;
      this.aDiffuser = false;
    }
  }

  private accueillir(ws: WebSocket): void {
    const client: Client = { ws, suivi: new SuiviClient(), indexJournal: 0, ficheId: null };
    this.clients.add(client);
    ws.on("message", (donnees) => {
      const commande = analyserCommande(texteDe(donnees));
      if (commande === null) {
        this.envoyer(client, { type: "erreur", message: "commande invalide" });
        return;
      }
      this.executer(client, commande);
    });
    ws.on("close", () => {
      this.clients.delete(client);
    });
    this.envoyer(client, messageInit(this.sim));
    this.envoyerEtat(client);
  }

  executer(client: Client, commande: Commande): void {
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
        this.sim.avancer(1);
        break;
      case "aube":
        this.sim.avancerJusquaAube();
        break;
      case "inspecter":
        client.ficheId = commande.id;
        break;
      case "fermer_fiche":
        client.ficheId = null;
        break;
      case "inspiration":
        this.sim.inspirer(commande);
        break;
      case "pouvoir":
        this.sim.exercer(commande);
        break;
      case "conseil":
        this.sim.conseiller(commande);
        break;
      case "demander_conseil":
        this.sim.demanderConseil(commande.id);
        break;
    }
    this.diffuser();
  }

  diffuser(): void {
    for (const client of this.clients) this.envoyerEtat(client);
  }

  private envoyerEtat(client: Client): void {
    const etat = messageEtat(this.sim, {
      ticksParSeconde: this.ticksParSeconde,
      pause: this.pause,
      suivi: client.suivi,
      bilan: this.bilan,
      indexJournal: client.indexJournal,
    });
    client.indexJournal = this.sim.journal.taille;
    this.envoyer(client, etat);
    if (client.ficheId !== null) {
      const fiche = messageFiche(this.sim, client.ficheId);
      if (fiche) this.envoyer(client, fiche);
    }
  }

  private envoyer(client: Client, message: MessageServeur): void {
    if (client.ws.readyState === client.ws.OPEN) client.ws.send(JSON.stringify(message));
  }

  private async servirStatique(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const racine = this.options.racineStatique;
    if (racine === null) {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(
        "Serveur de simulation : le viewer n'est pas construit (pnpm --filter @sdv/viewer build).",
      );
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    let chemin = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (chemin === "/" || chemin === "\\") chemin = "/index.html";
    let fichier = join(racine, chemin);
    if (!fichier.startsWith(racine)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      const infos = await stat(fichier);
      if (infos.isDirectory()) fichier = join(fichier, "index.html");
    } catch {
      fichier = join(racine, "index.html");
    }
    try {
      const contenu = await readFile(fichier);
      res.writeHead(200, {
        "content-type": TYPES_MIME[extname(fichier)] ?? "application/octet-stream",
        "cache-control": "no-cache",
      });
      res.end(contenu);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("introuvable");
    }
  }
}
