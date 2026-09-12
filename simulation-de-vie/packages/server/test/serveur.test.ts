import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { Simulation } from "@sdv/core";
import type { MessageServeur } from "@sdv/protocole";
import { Serveur, texteDe } from "../src/serveur.js";

let serveur: Serveur | null = null;

afterEach(async () => {
  await serveur?.arreter();
  serveur = null;
});

function attendre<T extends MessageServeur["type"]>(
  ws: WebSocket,
  type: T,
  predicat: (m: Extract<MessageServeur, { type: T }>) => boolean = () => true,
): Promise<Extract<MessageServeur, { type: T }>> {
  return new Promise((resoudre, rejeter) => {
    const minuteur = setTimeout(() => {
      rejeter(new Error(`pas de message ${type}`));
    }, 5000);
    const ecouteur = (donnees: WebSocket.RawData): void => {
      const m = JSON.parse(texteDe(donnees)) as MessageServeur;
      if (m.type === type && predicat(m as Extract<MessageServeur, { type: T }>)) {
        clearTimeout(minuteur);
        ws.off("message", ecouteur);
        resoudre(m as Extract<MessageServeur, { type: T }>);
      }
    };
    ws.on("message", ecouteur);
  });
}

describe("Serveur", () => {
  it("envoie init puis etat à la connexion, et répond aux commandes", async () => {
    const sim = Simulation.creer({ seed: 42, monde: { largeur: 48, hauteur: 32 } });
    serveur = new Serveur(sim, {
      port: 0,
      ticksParSeconde: 4,
      pause: true,
      racineStatique: null,
      periodeDiffusionMs: 10,
    });
    const port = await serveur.demarrer();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const init = attendre(ws, "init");
    const etat = attendre(ws, "etat");
    await new Promise<void>((r) => {
      ws.on("open", () => {
        r();
      });
    });
    expect((await init).largeur).toBe(48);
    expect((await etat).pause).toBe(true);

    const apresTick = attendre(ws, "etat");
    ws.send(JSON.stringify({ type: "tick" }));
    expect((await apresTick).tick).toBe(1);

    const apresAube = attendre(ws, "etat");
    ws.send(JSON.stringify({ type: "aube" }));
    expect((await apresAube).tick).toBe(144);

    const fiche = attendre(ws, "fiche");
    ws.send(JSON.stringify({ type: "inspecter", id: "p-0001" }));
    expect((await fiche).id).toBe("p-0001");

    const erreur = attendre(ws, "erreur");
    ws.send("n'importe quoi");
    expect((await erreur).message).toContain("invalide");

    const reprise = attendre(ws, "etat", (m) => !m.pause);
    ws.send(JSON.stringify({ type: "vitesse", ticksParSeconde: 64 }));
    ws.send(JSON.stringify({ type: "reprendre" }));
    expect((await reprise).pause).toBe(false);
    // La boucle temps réel fait avancer la simulation.
    await new Promise((r) => {
      setTimeout(r, 400);
    });
    expect(sim.tick).toBeGreaterThan(144);
    ws.close();
  });

  it("sert un texte explicite sans viewer construit", async () => {
    const sim = Simulation.creer({
      seed: 1,
      monde: { largeur: 32, hauteur: 32 },
      population: { initiale: 0 },
    });
    serveur = new Serveur(sim, { port: 0, ticksParSeconde: 1, pause: true, racineStatique: null });
    const port = await serveur.demarrer();
    const reponse = await fetch(`http://127.0.0.1:${port}/`);
    expect(reponse.status).toBe(200);
    expect(await reponse.text()).toContain("viewer");
  });
});
