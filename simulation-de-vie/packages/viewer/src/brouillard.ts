/**
 * Brouillard d'exploration : l'inconnu reste noir, ce qui a été vu mais n'est
 * plus sous les yeux est voilé, et un halo de vision entoure chaque personnage.
 */
import type { MessageInit } from "@sdv/protocole";

/** Pixels par tuile du calque de brouillard (bords adoucis à l'affichage). */
export const RESOLUTION_BROUILLARD = 4;

export interface Observateur {
  readonly x: number;
  readonly y: number;
}

export class Brouillard {
  private masque: HTMLCanvasElement | null = null;
  private masquePour = -1;
  private readonly calque = document.createElement("canvas");

  /** Masque de l'inconnu (noir opaque), reconstruit quand les découvertes changent. */
  private masqueInconnu(
    init: MessageInit,
    decouvertes: Readonly<Uint8Array>,
    version: number,
  ): HTMLCanvasElement | null {
    if (this.masque !== null && this.masquePour === version) return this.masque;
    const R = RESOLUTION_BROUILLARD;
    const brut = document.createElement("canvas");
    brut.width = init.largeur * R;
    brut.height = init.hauteur * R;
    const b = brut.getContext("2d");
    if (b === null) return null;
    b.fillStyle = "#06080b";
    b.fillRect(0, 0, brut.width, brut.height);
    for (let i = 0; i < decouvertes.length; i++) {
      if (decouvertes[i] !== 1) continue;
      const x = i % init.largeur;
      const y = (i - x) / init.largeur;
      b.clearRect(x * R, y * R, R, R);
    }
    const masque = document.createElement("canvas");
    masque.width = brut.width;
    masque.height = brut.height;
    const m = masque.getContext("2d");
    if (m === null) return null;
    // Bords adoucis : le flou fond l'inconnu dans le connu.
    m.filter = `blur(${String(R * 0.7)}px)`;
    m.drawImage(brut, 0, 0);
    m.filter = "none";
    this.masque = masque;
    this.masquePour = version;
    return masque;
  }

  /**
   * Dessine le brouillard dans le repère monde (une unité = une tuile).
   * `rayon` est le rayon de vision courant, en tuiles.
   */
  dessiner(
    ctx: CanvasRenderingContext2D,
    init: MessageInit,
    decouvertes: Readonly<Uint8Array>,
    version: number,
    observateurs: readonly Observateur[],
    rayon: number,
  ): void {
    const masque = this.masqueInconnu(init, decouvertes, version);
    if (masque === null) return;
    const R = RESOLUTION_BROUILLARD;
    const calque = this.calque;
    if (calque.width !== masque.width || calque.height !== masque.height) {
      calque.width = masque.width;
      calque.height = masque.height;
    }
    const c = calque.getContext("2d");
    if (c === null) return;
    c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, calque.width, calque.height);
    // Voile sur tout ce qui n'est plus sous les yeux…
    c.fillStyle = "rgba(6, 8, 11, 0.45)";
    c.fillRect(0, 0, calque.width, calque.height);
    // …percé d'un halo de vision autour de chaque personnage.
    c.globalCompositeOperation = "destination-out";
    const r = (rayon + 0.6) * R;
    for (const o of observateurs) {
      const cx = (o.x + 0.5) * R;
      const cy = (o.y + 0.5) * R;
      const halo = c.createRadialGradient(cx, cy, 0, cx, cy, r);
      halo.addColorStop(0, "rgba(0,0,0,1)");
      halo.addColorStop(0.75, "rgba(0,0,0,1)");
      halo.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = halo;
      c.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
    c.globalCompositeOperation = "source-over";
    c.drawImage(masque, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(calque, 0, 0, init.largeur, init.hauteur);
  }
}
