/**
 * Brouillard d'exploration : l'inconnu reste noir, ce qui a été vu mais n'est
 * plus sous les yeux est voilé, et un halo de vision entoure chaque personnage.
 * Le monde n'ayant pas de limite, les calques couvrent la zone connue.
 */
import type { Magasin, Zone } from "./etat.js";

/** Pixels par tuile du calque de brouillard (bords adoucis à l'affichage). */
export const RESOLUTION_BROUILLARD = 4;
/** Couleur de l'inconnu, la même que le fond du canevas. */
export const COULEUR_INCONNU = "#06080b";

export interface Observateur {
  readonly x: number;
  readonly y: number;
}

export class Brouillard {
  private masque: HTMLCanvasElement | null = null;
  private masquePour = -1;
  private masqueZone: Zone = { x0: 0, y0: 0, x1: -1, y1: -1 };
  private readonly calque = document.createElement("canvas");

  /** Masque de l'inconnu (noir opaque) sur la zone connue, reconstruit quand les découvertes changent. */
  private masqueInconnu(magasin: Magasin, zone: Zone): HTMLCanvasElement | null {
    const version = magasin.versionDecouvertes;
    if (this.masque !== null && this.masquePour === version) return this.masque;
    const R = RESOLUTION_BROUILLARD;
    const largeur = zone.x1 - zone.x0 + 1;
    const hauteur = zone.y1 - zone.y0 + 1;
    const brut = document.createElement("canvas");
    brut.width = largeur * R;
    brut.height = hauteur * R;
    const b = brut.getContext("2d");
    if (b === null) return null;
    b.fillStyle = COULEUR_INCONNU;
    b.fillRect(0, 0, brut.width, brut.height);
    for (let y = zone.y0; y <= zone.y1; y++) {
      for (let x = zone.x0; x <= zone.x1; x++) {
        if (magasin.biomeEn(x, y) < 0) continue;
        b.clearRect((x - zone.x0) * R, (y - zone.y0) * R, R, R);
      }
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
    this.masqueZone = zone;
    return masque;
  }

  /**
   * Dessine le brouillard dans le repère monde (une unité = une tuile).
   * `rayon` est le rayon de vision courant, en tuiles.
   */
  dessiner(
    ctx: CanvasRenderingContext2D,
    magasin: Magasin,
    observateurs: readonly Observateur[],
    rayon: number,
  ): void {
    const connue = magasin.zoneDecouverte();
    if (connue === null) return;
    // Une marge d'une tuile : le flou du bord a besoin d'un peu d'inconnu autour.
    const zone: Zone = {
      x0: connue.x0 - 1,
      y0: connue.y0 - 1,
      x1: connue.x1 + 1,
      y1: connue.y1 + 1,
    };
    const masque = this.masqueInconnu(magasin, zone);
    if (masque === null) return;
    const zm = this.masqueZone;
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
      const cx = (o.x - zm.x0 + 0.5) * R;
      const cy = (o.y - zm.y0 + 0.5) * R;
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
    ctx.drawImage(calque, zm.x0, zm.y0, zm.x1 - zm.x0 + 1, zm.y1 - zm.y0 + 1);
  }
}
