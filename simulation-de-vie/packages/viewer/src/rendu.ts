/** Rendu de la carte sur canvas 2D : biomes, gisements, bâtiments, personnages, bulles, nuit. */
import { LEVER_COUCHER, opaciteNuit } from "@sdv/protocole";
import type { PersonnageEtat } from "@sdv/protocole";
import type { Camera } from "./camera.js";
import { versEcran, versMonde } from "./camera.js";
import type { Magasin } from "./etat.js";
import {
  COULEURS_BATIMENT,
  COULEURS_BIOME,
  COULEURS_RESSOURCE,
  LETTRES_BATIMENT,
  couleurFamille,
  couleurMoral,
} from "./format.js";

export class Rendu {
  private fond: HTMLCanvasElement | null = null;
  private fondPour: unknown = null;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly magasin: Magasin,
  ) {
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("canvas 2D indisponible");
    this.ctx = ctx;
  }

  /** Image des biomes, calculée une fois par message `init` (1 pixel par tuile). */
  private fondBiomes(): HTMLCanvasElement | null {
    const init = this.magasin.init;
    if (init === null) return null;
    if (this.fond !== null && this.fondPour === init) return this.fond;
    const c = document.createElement("canvas");
    c.width = init.largeur;
    c.height = init.hauteur;
    const ctx = c.getContext("2d");
    if (ctx === null) return null;
    const image = ctx.createImageData(init.largeur, init.hauteur);
    for (let i = 0; i < init.biomes.length; i++) {
      const nom = init.nomsBiomes[init.biomes[i] ?? 0] ?? "prairie";
      const [r, g, b] = hexVersRgb(COULEURS_BIOME[nom] ?? "#7db85a");
      image.data[i * 4] = r;
      image.data[i * 4 + 1] = g;
      image.data[i * 4 + 2] = b;
      image.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    this.fond = c;
    this.fondPour = init;
    return c;
  }

  dessiner(cam: Camera, maintenant: number, survol: string | null): void {
    const { canvas, ctx, magasin } = this;
    const init = magasin.init;
    const etat = magasin.etat;
    ctx.fillStyle = "#0f1216";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (init === null) return;
    const fond = this.fondBiomes();
    if (fond === null) return;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(cam.dx, cam.dy);
    ctx.scale(cam.echelle, cam.echelle);
    ctx.drawImage(fond, 0, 0);

    // Gisements : petits carrés colorés, visibles à partir d'une certaine échelle.
    if (cam.echelle >= 5) {
      const taille = cam.echelle >= 12 ? 0.45 : 0.35;
      for (const g of magasin.gisements.values()) {
        if (g.quantite <= 0) continue;
        ctx.fillStyle = COULEURS_RESSOURCE[g.type] ?? "#ffffff";
        ctx.globalAlpha = 0.85;
        ctx.fillRect(g.x + (1 - taille) / 2, g.y + (1 - taille) / 2, taille, taille);
      }
      ctx.globalAlpha = 1;
    }

    if (etat !== null) {
      // Bâtiments.
      for (const b of etat.batiments) {
        ctx.fillStyle =
          b.etat === "chantier" ? "rgba(255,255,255,0.25)" : (COULEURS_BATIMENT[b.type] ?? "#888");
        ctx.fillRect(b.x + 0.08, b.y + 0.08, 0.84, 0.84);
        if (b.etat === "chantier") {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 0.08;
          ctx.setLineDash([0.15, 0.1]);
          ctx.strokeRect(b.x + 0.08, b.y + 0.08, 0.84, 0.84);
          ctx.setLineDash([]);
        }
        if (b.type === "feu_de_camp" && b.allume && b.etat === "termine") {
          ctx.fillStyle = "rgba(255,180,60,0.18)";
          ctx.beginPath();
          ctx.arc(b.x + 0.5, b.y + 0.5, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        if (cam.echelle >= 9) {
          ctx.fillStyle = b.type === "feu_de_camp" && !b.allume ? "#999" : "#fff";
          ctx.font = "0.6px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(LETTRES_BATIMENT[b.type] ?? "?", b.x + 0.5, b.y + 0.52);
        }
      }

      // Personnages : cercle coloré par famille, contour selon le moral.
      for (const p of etat.personnages) {
        if (!p.vivant) continue;
        const rayon = p.stade === "enfant" ? 0.24 : p.stade === "adolescent" ? 0.32 : 0.4;
        const cx = p.x + 0.5;
        const cy = p.y + 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy, rayon, 0, Math.PI * 2);
        ctx.fillStyle = couleurFamille(p.nomFamille);
        ctx.fill();
        ctx.lineWidth = p.id === magasin.selection ? 0.16 : 0.08;
        ctx.strokeStyle = p.id === magasin.selection ? "#ffffff" : couleurMoral(p.besoins.moral);
        ctx.stroke();
        if (p.id === survol) {
          ctx.beginPath();
          ctx.arc(cx, cy, rayon + 0.18, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255,255,255,0.7)";
          ctx.lineWidth = 0.06;
          ctx.stroke();
        }
        if (p.endormi && cam.echelle >= 7) {
          ctx.fillStyle = "#cfe6ff";
          ctx.font = "0.5px sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
          ctx.fillText("z", cx + rayon * 0.6, cy - rayon * 0.6);
        }
        if (p.enceinte) {
          ctx.beginPath();
          ctx.arc(cx + rayon * 0.55, cy + rayon * 0.55, 0.12, 0, Math.PI * 2);
          ctx.fillStyle = "#ffa0d0";
          ctx.fill();
        }
      }
    }
    ctx.restore();

    // Prénoms (espace écran, lisibles quel que soit le zoom).
    if (etat !== null && cam.echelle >= 10) {
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      for (const p of etat.personnages) {
        if (!p.vivant) continue;
        const e = versEcran(cam, p.x + 0.5, p.y + 0.05);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillText(p.prenom, e.x + 1, e.y + 1);
        ctx.fillStyle = "#fff";
        ctx.fillText(p.prenom, e.x, e.y);
      }
    }

    // Voile nocturne.
    if (etat !== null) {
      const [lever, coucher] = LEVER_COUCHER[etat.moment.saison] ?? [6, 20];
      const alpha = opaciteNuit(etat.moment.heure, etat.moment.minute, lever, coucher);
      if (alpha > 0) {
        ctx.fillStyle = `rgba(10, 18, 50, ${alpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Halo des feux.
        for (const b of etat.batiments) {
          if (b.type !== "feu_de_camp" || !b.allume || b.etat !== "termine") continue;
          const e = versEcran(cam, b.x + 0.5, b.y + 0.5);
          const r = cam.echelle * 3;
          const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
          grad.addColorStop(0, `rgba(255,190,90,${alpha * 0.9})`);
          grad.addColorStop(1, "rgba(255,190,90,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(e.x - r, e.y - r, 2 * r, 2 * r);
        }
      }
    }

    // Bulles de dialogue.
    if (etat !== null) {
      ctx.font = "12px system-ui, sans-serif";
      ctx.textBaseline = "middle";
      const affichees = new Set<string>();
      for (const bulle of magasin.bulles) {
        if (bulle.debut > maintenant || bulle.fin < maintenant || affichees.has(bulle.id)) continue;
        affichees.add(bulle.id);
        const p = etat.personnages.find((x) => x.id === bulle.id);
        if (p === undefined) continue;
        const e = versEcran(cam, p.x + 0.5, p.y);
        const texte = bulle.texte.length > 60 ? `${bulle.texte.slice(0, 57)}…` : bulle.texte;
        const largeur = ctx.measureText(texte).width + 14;
        const x = Math.max(4, Math.min(canvas.width - largeur - 4, e.x - largeur / 2));
        const y = e.y - 30;
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        arrondi(ctx, x, y, largeur, 22, 8);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(e.x - 5, y + 22);
        ctx.lineTo(e.x + 5, y + 22);
        ctx.lineTo(e.x, y + 28);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#111";
        ctx.textAlign = "left";
        ctx.fillText(texte, x + 7, y + 11);
      }
    }
  }

  /** Personnage vivant le plus proche du point écran (rayon de 14 px), ou null. */
  trouverPersonnage(cam: Camera, sx: number, sy: number): PersonnageEtat | null {
    const etat = this.magasin.etat;
    if (etat === null) return null;
    const m = versMonde(cam, sx, sy);
    let meilleur: PersonnageEtat | null = null;
    let dMin = Infinity;
    for (const p of etat.personnages) {
      if (!p.vivant) continue;
      const d = Math.hypot(p.x + 0.5 - m.x, p.y + 0.5 - m.y) * cam.echelle;
      if (d < 14 && d < dMin) {
        dMin = d;
        meilleur = p;
      }
    }
    return meilleur;
  }
}

function arrondi(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexVersRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
