/**
 * Fond de carte pré-rendu, morceau par morceau (biomes texturés, arbres,
 * rochers, herbes, vagues). Seules les tuiles connues sont dessinées : le
 * monde apparaît au fil des découvertes.
 */
import { COULEURS_BIOME } from "./format.js";
import type { MorceauVue } from "./etat.js";
import { arbre, bruit, herbe, rocher, vague } from "./sprites.js";

/** Pixels par tuile du fond pré-rendu. */
export const RESOLUTION_FOND = 16;

export function construireFondMorceau(
  m: MorceauVue,
  taille: number,
  nomsBiomes: readonly string[],
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = taille * RESOLUTION_FOND;
  c.height = taille * RESOLUTION_FOND;
  const ctx = c.getContext("2d");
  if (ctx === null) return c;
  ctx.scale(RESOLUTION_FOND, RESOLUTION_FOND);
  // Le repère du canevas est celui du monde, décalé à l'origine du morceau.
  ctx.translate(-m.cx * taille, -m.cy * taille);
  const x0 = m.cx * taille;
  const y0 = m.cy * taille;
  const biomeEn = (x: number, y: number): string | null => {
    const code = m.biomes[(y - y0) * taille + (x - x0)] ?? -1;
    return code < 0 ? null : (nomsBiomes[code] ?? "prairie");
  };

  for (let y = y0; y < y0 + taille; y++) {
    for (let x = x0; x < x0 + taille; x++) {
      const nom = biomeEn(x, y);
      if (nom === null) continue;
      const base = COULEURS_BIOME[nom] ?? "#7db85a";
      ctx.fillStyle = nuancer(base, (bruit(x, y) - 0.5) * 0.12);
      ctx.fillRect(x, y, 1.02, 1.02);
    }
  }
  for (let y = y0; y < y0 + taille; y++) {
    for (let x = x0; x < x0 + taille; x++) {
      const nom = biomeEn(x, y);
      if (nom === null) continue;
      const b = bruit(x, y, 1);
      switch (nom) {
        case "foret":
          arbre(ctx, x + (bruit(x, y, 2) - 0.5) * 0.3, y, 0.7 + b * 0.35, Math.floor(b * 3));
          if (b > 0.55) arbre(ctx, x + 0.3, y - 0.25, 0.5, Math.floor(bruit(x, y, 3) * 3));
          break;
        case "montagne":
          rocher(ctx, x, y - 0.05, 1, "#a3a3a3");
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.beginPath();
          ctx.moveTo(x + 0.45, y + 0.28);
          ctx.lineTo(x + 0.55, y + 0.25);
          ctx.lineTo(x + 0.7, y + 0.42);
          ctx.lineTo(x + 0.35, y + 0.4);
          ctx.closePath();
          ctx.fill();
          break;
        case "colline":
          if (b > 0.5) rocher(ctx, x + 0.4, y + 0.4, 0.45, "#8f865a");
          if (b < 0.3) herbe(ctx, x, y, "#c2b56a");
          break;
        case "prairie":
          if (b > 0.7) herbe(ctx, x, y, "#9ed37a");
          if (b < 0.06) {
            ctx.fillStyle = b < 0.03 ? "#f2e26a" : "#f5a3c4";
            ctx.beginPath();
            ctx.arc(x + 0.3 + b * 5, y + 0.4, 0.06, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        case "marais":
          herbe(ctx, x, y, "#6e8f5a");
          if (b > 0.6) {
            ctx.fillStyle = "rgba(60,90,120,0.45)";
            ctx.beginPath();
            ctx.ellipse(x + 0.5, y + 0.7, 0.3, 0.14, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        case "plage":
          if (b > 0.75) {
            ctx.fillStyle = "rgba(255,255,255,0.35)";
            ctx.beginPath();
            ctx.arc(x + b, y + bruit(x, y, 4), 0.05, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        case "eau_peu_profonde":
          if (b > 0.5) vague(ctx, x, y, bruit(x, y, 5));
          break;
        case "eau_profonde":
          if (b > 0.85) vague(ctx, x, y, bruit(x, y, 5));
          break;
        default:
          break;
      }
    }
  }
  return c;
}

/** Éclaircit (delta > 0) ou assombrit (delta < 0) une couleur hexadécimale. */
export function nuancer(hex: string, delta: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const canal = (v: number): number => Math.max(0, Math.min(255, Math.round(v + delta * 255)));
  const r = canal((n >> 16) & 255);
  const g = canal((n >> 8) & 255);
  const b = canal(n & 255);
  return `rgb(${r} ${g} ${b})`;
}
