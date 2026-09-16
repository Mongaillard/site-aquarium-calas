/**
 * Fond de carte pré-rendu, morceau par morceau. Chaque tuile est un blob
 * arrondi ; les biomes se dessinent par couches, de l'eau profonde à la
 * montagne, si bien que rivages, lisières et crêtes ondulent au lieu de
 * suivre la grille. Puis viennent les textures (herbe, sable, galets), les
 * arbres à couronnes qui se chevauchent, les rochers et les pics. Une marge
 * d'une tuile prise aux morceaux voisins fait continuer les formes d'un
 * morceau à l'autre. Seules les tuiles connues sont dessinées.
 */
import { COULEURS_BIOME } from "./format.js";
import type { MorceauVue } from "./etat.js";
import { bruit, herbe } from "./sprites.js";
import { mousserons, pin, pommier, tasDePierre } from "./atlas.js";

/** Pixels par tuile du fond pré-rendu. */
export const RESOLUTION_FOND = 24;

/** Ordre des couches : ce qui est bas se dessine d'abord, ce qui est haut recouvre. */
const COUCHES: readonly string[] = [
  "eau_profonde",
  "eau_peu_profonde",
  "marais",
  "plage",
  "prairie",
  "colline",
  "foret",
  "montagne",
];

/** Débord d'un blob au-delà de sa tuile, et rayon de ses coins. */
const DEBORD = 0.22;
const RAYON = 0.48;

export type BiomeEn = (x: number, y: number) => string | null;

export function construireFondMorceau(
  m: MorceauVue,
  taille: number,
  nomsBiomes: readonly string[],
  voisin?: (x: number, y: number) => number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = taille * RESOLUTION_FOND;
  c.height = taille * RESOLUTION_FOND;
  const ctx = c.getContext("2d");
  if (ctx === null) return c;
  ctx.scale(RESOLUTION_FOND, RESOLUTION_FOND);
  const x0 = m.cx * taille;
  const y0 = m.cy * taille;
  // Le repère du canevas est celui du monde, décalé à l'origine du morceau.
  ctx.translate(-x0, -y0);
  const biomeEn: BiomeEn = (x, y) => {
    let code: number;
    if (x >= x0 && y >= y0 && x < x0 + taille && y < y0 + taille)
      code = m.biomes[(y - y0) * taille + (x - x0)] ?? -1;
    else code = voisin === undefined ? -1 : voisin(x, y);
    return code < 0 ? null : (nomsBiomes[code] ?? "prairie");
  };
  const marge = 1;
  const xa = x0 - marge;
  const ya = y0 - marge;
  const xb = x0 + taille + marge;
  const yb = y0 + taille + marge;

  // 1. Les couches de biomes, en blobs arrondis.
  for (const couche of COUCHES) {
    const base = COULEURS_BIOME[couche] ?? "#7db85a";
    // L'écume : la terre se détache de l'eau par un liseré clair.
    const terre = couche !== "eau_profonde" && couche !== "eau_peu_profonde";
    if (terre) {
      ctx.strokeStyle =
        couche === "marais" ? "rgba(120, 160, 120, 0.5)" : "rgba(235, 240, 220, 0.55)";
      ctx.lineWidth = 0.16;
      for (let y = ya; y < yb; y++)
        for (let x = xa; x < xb; x++) {
          if (biomeEn(x, y) !== couche) continue;
          if (!bordEau(biomeEn, x, y)) continue;
          blob(ctx, x, y);
          ctx.stroke();
        }
    }
    for (let y = ya; y < yb; y++)
      for (let x = xa; x < xb; x++) {
        if (biomeEn(x, y) !== couche) continue;
        ctx.fillStyle = nuancer(base, (bruit(x, y) - 0.5) * (couche === "montagne" ? 0.16 : 0.1));
        blob(ctx, x, y);
        ctx.fill();
      }
  }

  // 2. Textures : mouchetures, sable, galets, reflets.
  for (let y = ya; y < yb; y++)
    for (let x = xa; x < xb; x++) {
      const nom = biomeEn(x, y);
      if (nom === null) continue;
      const b = bruit(x, y, 1);
      switch (nom) {
        case "prairie":
          tache(ctx, x, y, b, b > 0.5 ? "rgba(255,255,220,0.10)" : "rgba(20,60,20,0.10)");
          if (b > 0.72) herbe(ctx, x, y, "#9ed37a");
          if (b < 0.05) fleur(ctx, x, y, b < 0.025 ? "#f2e26a" : "#f5a3c4");
          break;
        case "plage":
          tache(ctx, x, y, b, "rgba(255,255,255,0.14)");
          if (b > 0.7) galet(ctx, x + b * 0.6, y + bruit(x, y, 4) * 0.7, 0.05, "#cdbf8a");
          break;
        case "eau_peu_profonde":
          tache(ctx, x, y, b, "rgba(255,255,255,0.08)");
          if (b > 0.55) vaguelette(ctx, x, y, bruit(x, y, 5), 0.28);
          break;
        case "eau_profonde":
          tache(ctx, x, y, b, "rgba(0,0,30,0.14)");
          if (b > 0.86) vaguelette(ctx, x, y, bruit(x, y, 5), 0.16);
          break;
        case "marais":
          tache(ctx, x, y, b, "rgba(40,70,110,0.22)");
          if (b > 0.45) roseaux(ctx, x, y, b);
          break;
        case "colline":
          tache(ctx, x, y, b, b > 0.5 ? "rgba(255,240,200,0.10)" : "rgba(60,50,20,0.12)");
          if (b < 0.25) herbe(ctx, x, y, "#c2b56a");
          break;
        default:
          break;
      }
    }

  // 3. Le relief et la végétation, du haut vers le bas pour que ce qui est devant recouvre.
  for (let y = ya; y < yb; y++)
    for (let x = xa; x < xb; x++) {
      const nom = biomeEn(x, y);
      if (nom === null) continue;
      const b = bruit(x, y, 1);
      switch (nom) {
        case "foret": {
          const ombre = "rgba(10,40,15,0.35)";
          ctx.fillStyle = ombre;
          ctx.beginPath();
          ctx.ellipse(x + 0.5, y + 0.95, 0.5, 0.18, 0, 0, Math.PI * 2);
          ctx.fill();
          // Le pin de la planche Kenney domine le couvert ; un pommier de temps en temps
          // (une frondaison rouge tachetée) casse la monotonie, comme dans une vraie forêt mêlée.
          const principal = bruit(x, y, 9) > 0.8 ? pommier : pin;
          principal(ctx, x + (bruit(x, y, 2) - 0.5) * 0.35, y, 0.95 + b * 0.4, Math.floor(b * 3));
          if (b > 0.45)
            pin(
              ctx,
              x + 0.35 + (bruit(x, y, 6) - 0.5) * 0.3,
              y - 0.3,
              0.7,
              Math.floor(bruit(x, y, 3) * 3),
            );
          if (b < 0.2) pin(ctx, x - 0.3, y + 0.15, 0.6, 2);
          // Un mousseron, rarement, au pied d'un arbre.
          if (bruit(x, y, 11) > 0.95) mousserons(ctx, x - 0.28, y + 0.3, 0.45);
          break;
        }
        case "montagne":
          pic(ctx, x, y, b);
          break;
        case "colline":
          if (b > 0.55) tasDePierre(ctx, x + 0.5, y + 0.55, 0.55, Math.floor(bruit(x, y, 40) * 3));
          if (b > 0.9) pin(ctx, x + 0.1, y + 0.1, 0.55, 1);
          break;
        case "prairie":
          if (b > 0.985) pommier(ctx, x, y, 0.8, Math.floor(bruit(x, y, 3) * 3));
          break;
        default:
          break;
      }
    }
  return c;
}

/** Un blob : la tuile, débordée et arrondie. */
function blob(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.roundRect(x - DEBORD, y - DEBORD, 1 + 2 * DEBORD, 1 + 2 * DEBORD, RAYON);
}

function bordEau(biomeEn: BiomeEn, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const v = biomeEn(x + dx, y + dy);
      if (v === "eau_profonde" || v === "eau_peu_profonde") return true;
    }
  return false;
}

/** Une moucheture douce, placée par le bruit. */
function tache(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  b: number,
  couleur: string,
): void {
  ctx.fillStyle = couleur;
  ctx.beginPath();
  ctx.ellipse(x + 0.2 + b * 0.6, y + 0.2 + bruit(x, y, 7) * 0.6, 0.32, 0.22, b * 3, 0, Math.PI * 2);
  ctx.fill();
}

function fleur(ctx: CanvasRenderingContext2D, x: number, y: number, couleur: string): void {
  ctx.fillStyle = couleur;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(
      x + 0.25 + bruit(x, y, 10 + i) * 0.5,
      y + 0.25 + bruit(x, y, 20 + i) * 0.5,
      0.045,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function galet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  couleur: string,
): void {
  ctx.fillStyle = couleur;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.3, r, 0, 0, Math.PI * 2);
  ctx.fill();
}

function vaguelette(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  d: number,
  alpha: number,
): void {
  ctx.strokeStyle = `rgba(255,255,255,${String(alpha)})`;
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  const yy = y + 0.25 + d * 0.5;
  ctx.moveTo(x + 0.1, yy);
  ctx.quadraticCurveTo(x + 0.28, yy - 0.1, x + 0.45, yy);
  ctx.quadraticCurveTo(x + 0.62, yy + 0.1, x + 0.8, yy);
  ctx.stroke();
}

function roseaux(ctx: CanvasRenderingContext2D, x: number, y: number, b: number): void {
  ctx.strokeStyle = "#7f9b52";
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const bx = x + 0.2 + i * 0.18 + (b - 0.5) * 0.2;
    ctx.moveTo(bx, y + 0.9);
    ctx.lineTo(bx + (i % 2 === 0 ? 0.04 : -0.04), y + 0.35);
  }
  ctx.stroke();
  ctx.fillStyle = "#6b4a2c";
  for (let i = 0; i < 2; i++)
    ctx.fillRect(x + 0.22 + i * 0.36 + (b - 0.5) * 0.2, y + 0.33, 0.05, 0.14);
}

/** Un pic : deux faces, une ombre portée, une calotte de neige quand il est haut. */
function pic(ctx: CanvasRenderingContext2D, x: number, y: number, b: number): void {
  const h = 0.9 + b * 0.5;
  const cx = x + 0.5 + (bruit(x, y, 8) - 0.5) * 0.3;
  const base = y + 1.05;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(cx + 0.15, base - 0.02, 0.7, 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Face éclairée (gauche) et face à l'ombre (droite).
  ctx.fillStyle = "#9a958e";
  ctx.beginPath();
  ctx.moveTo(cx - 0.75, base);
  ctx.lineTo(cx, base - h);
  ctx.lineTo(cx + 0.05, base);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#6a655f";
  ctx.beginPath();
  ctx.moveTo(cx, base - h);
  ctx.lineTo(cx + 0.7, base);
  ctx.lineTo(cx + 0.05, base);
  ctx.closePath();
  ctx.fill();
  if (h > 1.15) {
    ctx.fillStyle = "#f4f6f8";
    ctx.beginPath();
    ctx.moveTo(cx, base - h);
    ctx.lineTo(cx + 0.22, base - h + 0.3);
    ctx.lineTo(cx + 0.1, base - h + 0.28);
    ctx.lineTo(cx, base - h + 0.36);
    ctx.lineTo(cx - 0.12, base - h + 0.26);
    ctx.lineTo(cx - 0.22, base - h + 0.3);
    ctx.closePath();
    ctx.fill();
  }
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
