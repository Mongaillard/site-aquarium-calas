import { describe, expect, it } from "vitest";
import type { MessageServeur } from "@sdv/protocole";
import { LiaisonLocale } from "../src/local.js";

function attendre(condition: () => boolean, delaiMs = 5000): Promise<void> {
  return new Promise((resoudre, rejeter) => {
    const debut = Date.now();
    const verifier = (): void => {
      if (condition()) resoudre();
      else if (Date.now() - debut > delaiMs) rejeter(new Error("délai dépassé"));
      else setTimeout(verifier, 10);
    };
    verifier();
  });
}

describe("LiaisonLocale", () => {
  it("reprend un monde sauvegardé sans pré-simulation, au même tick", async () => {
    const messages: MessageServeur[] = [];
    const source = new LiaisonLocale(
      { seed: 42, joursAvance: 1, ticksParSeconde: 1 },
      (m) => messages.push(m),
      () => undefined,
    );
    source.connecter();
    await attendre(() => messages.some((m) => m.type === "etat"));
    source.envoyer({ type: "pause" });
    source.envoyer({ type: "tick" });
    const sauvegarde = source.sauvegarder();
    source.fermer();
    expect(sauvegarde?.tick).toBe(145);
    const recus: MessageServeur[] = [];
    const progressions: number[] = [];
    const reprise = new LiaisonLocale(
      { seed: 42, joursAvance: 5, ticksParSeconde: 1, sauvegarde },
      (m) => recus.push(m),
      () => undefined,
      (j) => progressions.push(j),
    );
    reprise.connecter();
    await attendre(() => recus.some((m) => m.type === "etat"));
    const etat = recus.find((m) => m.type === "etat");
    expect(etat?.type === "etat" && etat.tick).toBe(145);
    expect(progressions).toEqual([]);
    expect(reprise.simulation?.vivants().length).toBe(12);
    reprise.fermer();
  });

  it("prépare le monde, envoie init puis etat, et répond aux commandes comme le serveur", async () => {
    const messages: MessageServeur[] = [];
    const progressions: number[] = [];
    const connexions: boolean[] = [];
    const liaison = new LiaisonLocale(
      {
        seed: 42,
        joursAvance: 2,
        ticksParSeconde: 64,
        config: {},
      },
      (m) => messages.push(m),
      (c) => connexions.push(c),
      (jour) => progressions.push(jour),
    );
    liaison.connecter();
    expect(connexions).toEqual([true]);
    expect(messages[0]?.type).toBe("init");
    await attendre(() => messages.some((m) => m.type === "etat"));
    expect(progressions).toEqual([1, 2]);
    const premier = messages.find((m) => m.type === "etat");
    expect(premier?.type === "etat" && premier.tick).toBe(2 * 144);
    expect(premier?.type === "etat" && premier.personnages.length).toBe(12);

    liaison.envoyer({ type: "pause" });
    liaison.envoyer({ type: "tick" });
    const apresTick = messages.filter((m) => m.type === "etat").at(-1);
    expect(apresTick?.type === "etat" && apresTick.tick).toBe(2 * 144 + 1);
    expect(apresTick?.type === "etat" && apresTick.pause).toBe(true);

    // La fiche est diffusée au pas suivant (jamais de façon synchrone, pour
    // éviter une récursion réception → inspection → diffusion).
    liaison.envoyer({ type: "inspecter", id: "p-0001" });
    expect(messages.at(-1)?.type).toBe("etat");
    await attendre(() => messages.some((m) => m.type === "fiche"));
    const fiche = messages.find((m) => m.type === "fiche");
    expect(fiche?.type === "fiche" && fiche.id).toBe("p-0001");

    liaison.envoyer({ type: "reprendre" });
    const tickAvant = liaison.simulation?.tick ?? 0;
    await attendre(() => (liaison.simulation?.tick ?? 0) > tickAvant + 10, 4000);
    liaison.fermer();
    expect(connexions.at(-1)).toBe(false);
  });
});
