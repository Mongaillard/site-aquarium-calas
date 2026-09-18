/**
 * Dessins vectoriels des éléments du monde, en unités de tuile (le contexte est
 * déjà mis à l'échelle : 1 = une tuile). Aucune image externe.
 */

import {
  beteFerme,
  buissonBaies,
  culture,
  gemmes,
  pin,
  spritePersonnage,
  tasDArgile,
  tasDePierre,
} from "./atlas.js";
import type { CouchesPersonnage } from "./atlas.js";

export type Ctx = CanvasRenderingContext2D;

/** Hachage stable d'une position, pour varier les décors sans hasard. */
export function bruit(x: number, y: number, sel = 0): number {
  let h = (x * 374761393 + y * 668265263 + sel * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function arbre(ctx: Ctx, x: number, y: number, taille: number, variante: number): void {
  const cx = x + 0.5;
  const base = y + 0.92;
  // Tronc, avec son ombre au sol.
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(cx + 0.06 * taille, base, 0.22 * taille, 0.07 * taille, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5a3a1a";
  ctx.fillRect(cx - 0.05 * taille, base - 0.4 * taille, 0.1 * taille, 0.4 * taille);
  const verts: readonly (readonly [string, string])[] = [
    ["#3f8a44", "#245a2b"],
    ["#357a3c", "#1f4f27"],
    ["#4a9a4c", "#2a6330"],
  ];
  const [clair, sombre] = verts[variante % verts.length] ?? ["#3f8a44", "#245a2b"];
  const couronne = (dx: number, dy: number, r: number): void => {
    ctx.beginPath();
    ctx.arc(cx + dx * taille, base - dy * taille, r * taille, 0, Math.PI * 2);
    ctx.fill();
  };
  // Le dessous de la couronne, dans l'ombre ; le dessus, au soleil.
  ctx.fillStyle = sombre;
  couronne(0, 0.5, 0.32);
  couronne(-0.2, 0.4, 0.24);
  couronne(0.2, 0.42, 0.24);
  ctx.fillStyle = clair;
  couronne(-0.03, 0.58, 0.27);
  couronne(-0.2, 0.47, 0.18);
  couronne(0.18, 0.5, 0.18);
  ctx.fillStyle = "rgba(255,255,230,0.18)";
  couronne(-0.1, 0.68, 0.12);
}

export function rocher(ctx: Ctx, x: number, y: number, taille: number, teinte = "#9a9a9a"): void {
  ctx.fillStyle = teinte;
  ctx.beginPath();
  ctx.moveTo(x + 0.15 * taille, y + 0.9 * taille);
  ctx.lineTo(x + 0.3 * taille, y + 0.45 * taille);
  ctx.lineTo(x + 0.55 * taille, y + 0.3 * taille);
  ctx.lineTo(x + 0.85 * taille, y + 0.6 * taille);
  ctx.lineTo(x + 0.9 * taille, y + 0.9 * taille);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.moveTo(x + 0.3 * taille, y + 0.45 * taille);
  ctx.lineTo(x + 0.55 * taille, y + 0.3 * taille);
  ctx.lineTo(x + 0.6 * taille, y + 0.5 * taille);
  ctx.closePath();
  ctx.fill();
}

export function herbe(ctx: Ctx, x: number, y: number, couleur: string): void {
  ctx.strokeStyle = couleur;
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const bx = x + 0.3 + i * 0.2;
    ctx.moveTo(bx, y + 0.85);
    ctx.quadraticCurveTo(bx + (i - 1) * 0.08, y + 0.6, bx + (i - 1) * 0.14, y + 0.4);
  }
  ctx.stroke();
}

export function vague(ctx: Ctx, x: number, y: number, dephasage: number): void {
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  const yy = y + 0.3 + dephasage * 0.4;
  ctx.moveTo(x + 0.15, yy);
  ctx.quadraticCurveTo(x + 0.3, yy - 0.12, x + 0.45, yy);
  ctx.quadraticCurveTo(x + 0.6, yy + 0.12, x + 0.75, yy);
  ctx.stroke();
}

/* ---------- Gisements ---------- */

export function gisement(
  ctx: Ctx,
  x: number,
  y: number,
  type: string,
  outil: string,
  fraction: number,
): void {
  const t = 0.55 + 0.45 * Math.min(1, fraction);
  switch (type) {
    case "bois":
      if (outil === "") {
        // Bois mort : deux bûches.
        ctx.fillStyle = "#6b4423";
        ctx.fillRect(x + 0.2, y + 0.55, 0.6 * t, 0.14);
        ctx.fillRect(x + 0.3, y + 0.7, 0.55 * t, 0.14);
        ctx.fillStyle = "#c9a071";
        ctx.fillRect(x + 0.2, y + 0.57, 0.08, 0.1);
        ctx.fillRect(x + 0.3, y + 0.72, 0.08, 0.1);
      } else {
        pin(ctx, x, y, 1.05 * t + 0.1, 1);
      }
      break;
    case "pierre":
      tasDePierre(ctx, x + 0.5, y + 0.6, 0.5 + 0.35 * t, Math.floor(bruit(x, y, 40) * 3));
      break;
    case "baies":
      buissonBaies(ctx, x + 0.5, y + 0.6, 0.5 + 0.35 * t, Math.floor(bruit(x, y, 41) * 3));
      break;
    case "poisson":
      ctx.fillStyle = "#cfefff";
      ctx.beginPath();
      ctx.ellipse(x + 0.5, y + 0.5, 0.22 * t, 0.11 * t, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 0.7 * t + 0.15, y + 0.5);
      ctx.lineTo(x + 0.85, y + 0.38);
      ctx.lineTo(x + 0.85, y + 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#1b3a6b";
      ctx.beginPath();
      ctx.arc(x + 0.36, y + 0.47, 0.03, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "gibier":
      ctx.fillStyle = "#a0703c";
      ctx.beginPath();
      ctx.ellipse(x + 0.5, y + 0.6, 0.26 * t, 0.17 * t, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 0.72, y + 0.45, 0.11 * t, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 0.68, y + 0.36);
      ctx.lineTo(x + 0.7, y + 0.22);
      ctx.lineTo(x + 0.76, y + 0.36);
      ctx.fill();
      break;
    case "fibres":
      herbe(ctx, x, y, "#d6e04b");
      break;
    case "herbes": {
      // Des simples : brins verts et trois petites fleurs blanches à cœur doré.
      herbe(ctx, x, y, "#5fae4f");
      for (const [dx, dy] of [
        [0.3, 0.45],
        [0.52, 0.38],
        [0.7, 0.5],
      ] as const) {
        ctx.fillStyle = "#f4f4ff";
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, 0.06 * t + 0.02, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e8c23a";
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, 0.025, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "minerai":
      gemmes(ctx, x + 0.5, y + 0.6, 0.5 + 0.35 * t);
      break;
    case "argile":
      tasDArgile(ctx, x + 0.5, y + 0.6, 0.5 + 0.35 * t, Math.floor(bruit(x, y, 42) * 3));
      break;
    default:
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 0.35, y + 0.35, 0.3, 0.3);
  }
}

/* ---------- Bâtiments ---------- */

export function abri(ctx: Ctx, x: number, y: number): void {
  ombreSol(ctx, x, y);
  // Une hutte de peaux tendues sur des perches.
  ctx.fillStyle = "#b8925c";
  ctx.beginPath();
  ctx.moveTo(x + 0.08, y + 0.9);
  ctx.lineTo(x + 0.5, y + 0.12);
  ctx.lineTo(x + 0.92, y + 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#8d6a3f";
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y + 0.12);
  ctx.lineTo(x + 0.92, y + 0.9);
  ctx.lineTo(x + 0.62, y + 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#5a3a1a";
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y + 0.05);
  ctx.lineTo(x + 0.08, y + 0.9);
  ctx.moveTo(x + 0.5, y + 0.05);
  ctx.lineTo(x + 0.92, y + 0.9);
  ctx.moveTo(x + 0.44, y + 0.02);
  ctx.lineTo(x + 0.56, y + 0.2);
  ctx.moveTo(x + 0.56, y + 0.02);
  ctx.lineTo(x + 0.44, y + 0.2);
  ctx.stroke();
  ctx.fillStyle = "#3d2412";
  ctx.beginPath();
  ctx.moveTo(x + 0.4, y + 0.9);
  ctx.lineTo(x + 0.5, y + 0.55);
  ctx.lineTo(x + 0.6, y + 0.9);
  ctx.closePath();
  ctx.fill();
}

/** L'ombre portée d'un bâtiment, au sud-est. */
export function ombreSol(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(x + 0.55, y + 0.93, 0.5, 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function maison(ctx: Ctx, x: number, y: number, nuit: boolean): void {
  ombreSol(ctx, x, y);
  // Murs de torchis sur colombage.
  ctx.fillStyle = "#e3d0ad";
  ctx.fillRect(x + 0.08, y + 0.42, 0.84, 0.52);
  ctx.strokeStyle = "#7a5230";
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(x + 0.08, y + 0.42);
  ctx.lineTo(x + 0.08, y + 0.94);
  ctx.moveTo(x + 0.92, y + 0.42);
  ctx.lineTo(x + 0.92, y + 0.94);
  ctx.moveTo(x + 0.08, y + 0.7);
  ctx.lineTo(x + 0.92, y + 0.7);
  ctx.moveTo(x + 0.3, y + 0.42);
  ctx.lineTo(x + 0.3, y + 0.94);
  ctx.moveTo(x + 0.7, y + 0.42);
  ctx.lineTo(x + 0.7, y + 0.94);
  ctx.stroke();
  // Toit de chaume, plus sombre côté ombre, avec ses lignes de paille.
  ctx.fillStyle = "#a8783c";
  ctx.beginPath();
  ctx.moveTo(x - 0.02, y + 0.46);
  ctx.lineTo(x + 0.5, y + 0.04);
  ctx.lineTo(x + 1.02, y + 0.46);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(60,30,10,0.28)";
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y + 0.04);
  ctx.lineTo(x + 1.02, y + 0.46);
  ctx.lineTo(x + 0.5, y + 0.46);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(90,50,15,0.45)";
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    ctx.moveTo(x - 0.02 + 0.52 * t, y + 0.46 - 0.42 * t);
    ctx.lineTo(x + 1.02 - 0.52 * t, y + 0.46 - 0.42 * t);
  }
  ctx.stroke();
  // Porte cintrée, fenêtres, cheminée.
  ctx.fillStyle = "#4a2a15";
  ctx.beginPath();
  ctx.moveTo(x + 0.42, y + 0.94);
  ctx.lineTo(x + 0.42, y + 0.7);
  ctx.arc(x + 0.5, y + 0.7, 0.08, Math.PI, 0);
  ctx.lineTo(x + 0.58, y + 0.94);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = nuit ? "#ffd27a" : "#9ecbe6";
  ctx.fillRect(x + 0.14, y + 0.5, 0.14, 0.14);
  ctx.fillRect(x + 0.72, y + 0.5, 0.14, 0.14);
  ctx.strokeStyle = "#7a5230";
  ctx.lineWidth = 0.02;
  ctx.strokeRect(x + 0.14, y + 0.5, 0.14, 0.14);
  ctx.strokeRect(x + 0.72, y + 0.5, 0.14, 0.14);
  ctx.fillStyle = "#6f6a66";
  ctx.fillRect(x + 0.68, y + 0.12, 0.11, 0.22);
}

export function entrepot(ctx: Ctx, x: number, y: number): void {
  ombreSol(ctx, x, y);
  // Une grange de planches, toit de bardeaux à deux pans, grande porte.
  ctx.fillStyle = "#7a4a1e";
  ctx.fillRect(x + 0.05, y + 0.38, 0.9, 0.56);
  ctx.strokeStyle = "rgba(40,20,5,0.4)";
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  for (let i = 1; i < 6; i++) {
    ctx.moveTo(x + 0.05, y + 0.38 + i * 0.093);
    ctx.lineTo(x + 0.95, y + 0.38 + i * 0.093);
  }
  ctx.stroke();
  ctx.fillStyle = "#5c5652";
  ctx.beginPath();
  ctx.moveTo(x - 0.02, y + 0.4);
  ctx.lineTo(x + 0.2, y + 0.1);
  ctx.lineTo(x + 0.8, y + 0.1);
  ctx.lineTo(x + 1.02, y + 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y + 0.1);
  ctx.lineTo(x + 0.8, y + 0.1);
  ctx.lineTo(x + 1.02, y + 0.4);
  ctx.lineTo(x + 0.5, y + 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#4a2a15";
  ctx.fillRect(x + 0.3, y + 0.55, 0.4, 0.39);
  ctx.strokeStyle = "#c9a56b";
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(x + 0.3, y + 0.55);
  ctx.lineTo(x + 0.7, y + 0.94);
  ctx.moveTo(x + 0.7, y + 0.55);
  ctx.lineTo(x + 0.3, y + 0.94);
  ctx.moveTo(x + 0.5, y + 0.55);
  ctx.lineTo(x + 0.5, y + 0.94);
  ctx.stroke();
}

/** Fumoir : une petite hutte close d'où monte une fumée qui ondule. */
export function fumoir(ctx: Ctx, x: number, y: number, maintenant: number): void {
  ctx.fillStyle = "#6b4a2a";
  ctx.fillRect(x + 0.2, y + 0.45, 0.6, 0.47);
  ctx.fillStyle = "#3d2a18";
  ctx.beginPath();
  ctx.moveTo(x + 0.12, y + 0.48);
  ctx.lineTo(x + 0.5, y + 0.18);
  ctx.lineTo(x + 0.88, y + 0.48);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2a1a10";
  ctx.fillRect(x + 0.42, y + 0.66, 0.16, 0.26);
  fumee(ctx, x + 0.5, y + 0.2, maintenant);
}

/** Une fumée qui ondule depuis le point (x, y) : trois volutes qui montent et s'élargissent. */
export function fumee(ctx: Ctx, x: number, y: number, maintenant: number): void {
  const t = maintenant / 900;
  ctx.fillStyle = "rgba(220,220,220,0.5)";
  for (let i = 0; i < 3; i++) {
    const phase = (t + i * 0.33) % 1;
    ctx.beginPath();
    ctx.arc(
      x + Math.sin((phase + i) * 6) * 0.08,
      y - phase * 0.3,
      0.05 + phase * 0.05,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

export function four(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = "#8a6a4a";
  ctx.beginPath();
  ctx.arc(x + 0.5, y + 0.7, 0.4, Math.PI, 0);
  ctx.lineTo(x + 0.9, y + 0.92);
  ctx.lineTo(x + 0.1, y + 0.92);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2a1a10";
  ctx.beginPath();
  ctx.arc(x + 0.5, y + 0.78, 0.16, Math.PI, 0);
  ctx.lineTo(x + 0.66, y + 0.9);
  ctx.lineTo(x + 0.34, y + 0.9);
  ctx.closePath();
  ctx.fill();
}

export function puits(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = "#8d8d8d";
  ctx.beginPath();
  ctx.ellipse(x + 0.5, y + 0.72, 0.32, 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1b3a6b";
  ctx.beginPath();
  ctx.ellipse(x + 0.5, y + 0.7, 0.2, 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6b4423";
  ctx.fillRect(x + 0.22, y + 0.25, 0.06, 0.45);
  ctx.fillRect(x + 0.72, y + 0.25, 0.06, 0.45);
  ctx.fillRect(x + 0.15, y + 0.2, 0.7, 0.08);
}

/** Port (M30) : un ponton de planches sur pilotis, une barque amarrée au bout. */
export function port(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = "#6b4423";
  for (const px of [0.18, 0.5, 0.82]) ctx.fillRect(x + px - 0.04, y + 0.35, 0.08, 0.55);
  ctx.fillStyle = "#a07a4a";
  for (let i = 0; i < 5; i++) ctx.fillRect(x + 0.08, y + 0.32 + i * 0.11, 0.84, 0.075);
  ctx.fillStyle = "#5a3a1e";
  ctx.beginPath();
  ctx.moveTo(x + 0.15, y + 0.2);
  ctx.quadraticCurveTo(x + 0.5, y + 0.36, x + 0.85, y + 0.2);
  ctx.lineTo(x + 0.72, y + 0.06);
  ctx.lineTo(x + 0.28, y + 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e9dcc0";
  ctx.fillRect(x + 0.47, y + 0.02, 0.05, 0.2);
}

/** Les côtés par lesquels un pan de mur en rejoint un autre. */
export interface Liens {
  readonly n: boolean;
  readonly s: boolean;
  readonly e: boolean;
  readonly o: boolean;
}

/**
 * Palissade (M39b) : un faisceau de pieux, et une lisse vers chaque voisin —
 * le mur se lit alors comme un mur, et non comme des pieux semés.
 */
export function palissade(ctx: Ctx, x: number, y: number, liens: Liens): void {
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(x + 0.18, y + 0.84, 0.64, 0.12);
  // Les lisses, d'abord : elles passent derrière les pieux.
  ctx.fillStyle = "#6b4e28";
  if (liens.o) ctx.fillRect(x, y + 0.42, 0.55, 0.1);
  if (liens.e) ctx.fillRect(x + 0.45, y + 0.42, 0.55, 0.1);
  if (liens.n) ctx.fillRect(x + 0.45, y, 0.1, 0.55);
  if (liens.s) ctx.fillRect(x + 0.45, y + 0.45, 0.1, 0.55);
  // Le faisceau de pieux, taillés en pointe.
  const pieux = 3;
  for (let i = 0; i < pieux; i++) {
    const px = x + 0.18 + (i * 0.64) / pieux;
    const l = 0.64 / pieux - 0.02;
    ctx.fillStyle = i % 2 === 0 ? "#8a6836" : "#7a5a2e";
    ctx.fillRect(px, y + 0.26, l, 0.62);
    ctx.fillStyle = i % 2 === 0 ? "#a0783c" : "#916c34";
    ctx.beginPath();
    ctx.moveTo(px, y + 0.26);
    ctx.lineTo(px + l / 2, y + 0.12);
    ctx.lineTo(px + l, y + 0.26);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#5a4020";
  ctx.fillRect(x + 0.18, y + 0.56, 0.64, 0.06);
}

/** Portail (M39a) : deux montants, un linteau, et deux battants ouverts. */
export function portail(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(x, y + 0.86, 1, 0.12);
  // Les montants, plus hauts que le mur.
  ctx.fillStyle = "#6b4e28";
  ctx.fillRect(x + 0.02, y + 0.08, 0.14, 0.82);
  ctx.fillRect(x + 0.84, y + 0.08, 0.14, 0.82);
  // Le linteau.
  ctx.fillStyle = "#8a6836";
  ctx.fillRect(x + 0.02, y + 0.06, 0.96, 0.12);
  // Deux battants entrebâillés, vers l'intérieur.
  ctx.fillStyle = "#a0783c";
  ctx.strokeStyle = "#5a4020";
  ctx.lineWidth = 0.035;
  for (const sens of [-1, 1]) {
    const bx = sens < 0 ? x + 0.16 : x + 0.62;
    ctx.fillRect(bx, y + 0.3, 0.22, 0.56);
    ctx.strokeRect(bx, y + 0.3, 0.22, 0.56);
    ctx.beginPath();
    ctx.moveTo(bx, y + 0.84);
    ctx.lineTo(bx + 0.22, y + 0.32);
    ctx.stroke();
  }
}

const COULEURS_STADE = ["#9c7a4a", "#a8c56a", "#7fb04f", "#c9c04a", "#e0b23a"] as const;

/**
 * Champ (M39b) : les sillons d'avant, qui se lisent de loin comme un champ, et
 * par-dessus quelques plants de la planche Tiny Farm quand la culture a levé —
 * on voit alors pousser ce qui pousse.
 */
export function champ(
  ctx: Ctx,
  x: number,
  y: number,
  seme: boolean,
  stade: number,
  variante = 0,
): void {
  ctx.fillStyle = "#6b4a2c";
  ctx.fillRect(x + 0.05, y + 0.05, 0.9, 0.9);
  ctx.fillStyle = seme ? (COULEURS_STADE[Math.max(0, Math.min(4, stade))] ?? "#9c7a4a") : "#7d5a38";
  for (let i = 0; i < 4; i++) ctx.fillRect(x + 0.1, y + 0.12 + i * 0.22, 0.8, 0.1);
  if (!seme || stade < 1) return;
  // Trois plants sur les sillons ; ils grossissent avec le stade.
  const niveau = Math.max(1, Math.min(3, stade));
  const taille = 0.3 + 0.12 * niveau;
  const places: readonly [number, number][] = [
    [0.22, 0.16],
    [0.56, 0.38],
    [0.3, 0.62],
  ];
  let pose = false;
  for (const [px, py] of places)
    pose = culture(ctx, x + px - taille / 2, y + py - taille / 2, taille, taille, niveau, variante);
  if (pose || stade < 3) return;
  // Sans la planche, les grains d'avant disent la maturité.
  ctx.fillStyle = "#f2d16b";
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++) ctx.fillRect(x + 0.2 + j * 0.28, y + 0.1 + i * 0.22, 0.06, 0.06);
}

/**
 * Le parc d'un enclos (M39b) : une clôture close de trois tuiles de côté autour
 * du piquet, avec un portillon au sud. Elle déborde sur les huit cases voisines,
 * qui sont libres : c'est là que les bêtes se tiennent.
 */
export function parc(ctx: Ctx, x: number, y: number): void {
  const g = x - 1;
  const h = y - 1;
  const cote = 3;
  const poteau = (px: number, py: number): void => {
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(px - 0.07, py + 0.5, 0.16, 0.1);
    ctx.fillStyle = "#7a5a2e";
    ctx.fillRect(px - 0.06, py - 0.02, 0.12, 0.56);
    ctx.fillStyle = "#a0783c";
    ctx.fillRect(px - 0.06, py - 0.02, 0.12, 0.08);
  };
  const lisse = (x1: number, x2: number, py: number): void => {
    ctx.fillStyle = "#a0783c";
    ctx.fillRect(x1, py + 0.12, x2 - x1, 0.07);
    ctx.fillRect(x1, py + 0.32, x2 - x1, 0.07);
  };
  const lisseV = (py1: number, py2: number, px: number): void => {
    ctx.fillStyle = "#a0783c";
    ctx.fillRect(px - 0.035, py1, 0.07, py2 - py1);
    ctx.fillRect(px - 0.035 + 0.2, py1, 0.07, py2 - py1);
  };
  // Les quatre côtés, le sud ouvert au milieu pour le portillon.
  lisse(g + 0.1, g + cote - 0.1, h + 0.05);
  lisseV(h + 0.1, h + cote - 0.1, g + 0.1);
  lisseV(h + 0.1, h + cote - 0.1, g + cote - 0.3);
  lisse(g + 0.1, g + 1.1, h + cote - 0.35);
  lisse(g + 1.9, g + cote - 0.1, h + cote - 0.35);
  for (let i = 0; i <= cote; i++) {
    poteau(g + i, h + 0.05);
    poteau(g + i, h + cote - 0.35);
    poteau(g + 0.1, h + i - 0.15);
    poteau(g + cote - 0.1, h + i - 0.15);
  }
  // Le portillon, entrebâillé.
  ctx.fillStyle = "#b98c48";
  ctx.strokeStyle = "#5a4020";
  ctx.lineWidth = 0.03;
  ctx.fillRect(g + 1.12, h + cote - 0.42, 0.34, 0.26);
  ctx.strokeRect(g + 1.12, h + cote - 0.42, 0.34, 0.26);
  ctx.beginPath();
  ctx.moveTo(g + 1.12, h + cote - 0.16);
  ctx.lineTo(g + 1.46, h + cote - 0.42);
  ctx.stroke();
  // La mangeoire, au pied du piquet.
  ctx.fillStyle = "#8a6836";
  ctx.fillRect(x + 0.28, y + 0.58, 0.44, 0.16);
  ctx.fillStyle = "#c9b06a";
  ctx.fillRect(x + 0.32, y + 0.56, 0.36, 0.06);
}

/** Autel : une dalle de pierre, deux montants, une petite flamme. */
export function autel(ctx: Ctx, x: number, y: number, temps: number): void {
  ctx.fillStyle = "#b9b09a";
  ctx.fillRect(x + 0.2, y + 0.55, 0.6, 0.12);
  ctx.fillStyle = "#8f8778";
  ctx.fillRect(x + 0.26, y + 0.67, 0.12, 0.25);
  ctx.fillRect(x + 0.62, y + 0.67, 0.12, 0.25);
  ctx.fillStyle = "#d8c68a";
  ctx.fillRect(x + 0.44, y + 0.35, 0.12, 0.2);
  const f = 0.06 + 0.03 * Math.sin(temps / 120);
  ctx.fillStyle = "#ffb347";
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y + 0.2 - f);
  ctx.lineTo(x + 0.56, y + 0.35);
  ctx.lineTo(x + 0.44, y + 0.35);
  ctx.closePath();
  ctx.fill();
}

export function tombe(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = "#777777";
  ctx.beginPath();
  ctx.moveTo(x + 0.3, y + 0.9);
  ctx.lineTo(x + 0.3, y + 0.45);
  ctx.arc(x + 0.5, y + 0.45, 0.2, Math.PI, 0);
  ctx.lineTo(x + 0.7, y + 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#333333";
  ctx.fillRect(x + 0.47, y + 0.45, 0.06, 0.3);
  ctx.fillRect(x + 0.38, y + 0.55, 0.24, 0.06);
}

/** Une stèle : une pierre dressée, gravée d'un trait. */
export function stele(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = "#8d8d8d";
  ctx.beginPath();
  ctx.moveTo(x + 0.36, y + 0.92);
  ctx.lineTo(x + 0.4, y + 0.3);
  ctx.lineTo(x + 0.6, y + 0.3);
  ctx.lineTo(x + 0.64, y + 0.92);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(x + 0.45, y + 0.42, 0.1, 0.04);
  ctx.fillRect(x + 0.45, y + 0.52, 0.1, 0.04);
  ctx.fillRect(x + 0.45, y + 0.62, 0.1, 0.04);
}

export function feu(ctx: Ctx, x: number, y: number, allume: boolean, temps: number): void {
  ctx.fillStyle = "#5a3a1a";
  ctx.save();
  ctx.translate(x + 0.5, y + 0.78);
  ctx.rotate(0.5);
  ctx.fillRect(-0.28, -0.05, 0.56, 0.1);
  ctx.rotate(-1);
  ctx.fillRect(-0.28, -0.05, 0.56, 0.1);
  ctx.restore();
  if (!allume) {
    ctx.fillStyle = "#555555";
    ctx.beginPath();
    ctx.ellipse(x + 0.5, y + 0.74, 0.18, 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const v = Math.sin(temps / 90) * 0.05 + Math.sin(temps / 37) * 0.03;
  const flamme = (couleur: string, largeur: number, hauteur: number, dx: number): void => {
    ctx.fillStyle = couleur;
    ctx.beginPath();
    ctx.moveTo(x + 0.5 + dx - largeur, y + 0.76);
    ctx.quadraticCurveTo(
      x + 0.5 + dx - largeur * 0.6,
      y + 0.76 - hauteur * 0.5,
      x + 0.5 + dx + v,
      y + 0.76 - hauteur,
    );
    ctx.quadraticCurveTo(
      x + 0.5 + dx + largeur * 0.6,
      y + 0.76 - hauteur * 0.5,
      x + 0.5 + dx + largeur,
      y + 0.76,
    );
    ctx.closePath();
    ctx.fill();
  };
  flamme("#ff7a1a", 0.22, 0.5 + v, 0);
  flamme("#ffb830", 0.14, 0.36 - v, 0.02);
  flamme("#fff2a0", 0.07, 0.2, -0.01);
}

export function chantier(ctx: Ctx, x: number, y: number, avancement: number): void {
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 0.05;
  ctx.setLineDash([0.12, 0.1]);
  ctx.strokeRect(x + 0.08, y + 0.08, 0.84, 0.84);
  ctx.setLineDash([]);
  ctx.fillStyle = "#8a5a2a";
  for (let i = 0; i < 3; i++) ctx.fillRect(x + 0.2, y + 0.75 - i * 0.14, 0.6, 0.09);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(x + 0.15, y + 0.12, 0.7, 0.1);
  ctx.fillStyle = "#7dffa0";
  ctx.fillRect(x + 0.15, y + 0.12, 0.7 * Math.max(0, Math.min(1, avancement)), 0.1);
}

/* ---------- Personnages ---------- */

export interface AspectPersonnage {
  readonly couleur: string;
  readonly contour: string;
  readonly teint: string;
  readonly cheveux: string;
  readonly sexe: "F" | "M";
  readonly echelle: number; // 1 adulte, 0,6 enfant
  readonly endormi: boolean;
  readonly marche: boolean;
  readonly phase: number; // 0..1, cycle de marche
  readonly enceinte: boolean;
  readonly selection: boolean;
  readonly survol: boolean;
  /** Blessé : un bandeau rouge sur le corps. */
  readonly blesse?: boolean;
  /** Alarme : un « ! » au-dessus de la tête. */
  readonly alerte?: boolean;
  /** Notable du village : une petite étoile dorée au-dessus de la tête. */
  readonly notable?: boolean;
  /** Banni : silhouette grisée. */
  readonly banni?: boolean;
  /**
   * Les couches du sprite Kenney (M31) : si elles sont données et la planche décodée, le
   * personnage se dessine en pixels ; sinon la figure vectorielle reste.
   */
  readonly couches?: CouchesPersonnage;
}

export const TEINTS: Readonly<Record<string, string>> = {
  clair: "#f3d3b3",
  hâlé: "#dfb08a",
  mat: "#b8825c",
  foncé: "#7a4b2c",
};

export const CHEVEUX: Readonly<Record<string, string>> = {
  noirs: "#1b1b1b",
  bruns: "#4a2e1a",
  châtains: "#7a5230",
  blonds: "#d9b45a",
  roux: "#b8502a",
  gris: "#a9a9a9",
};

export function personnage(ctx: Ctx, x: number, y: number, a: AspectPersonnage): void {
  const s = a.echelle;
  const cx = x + 0.5;
  const sol = y + 0.95;
  if (a.selection || a.survol) {
    ctx.strokeStyle = a.selection ? "#ffffff" : "rgba(255,255,255,0.6)";
    ctx.lineWidth = a.selection ? 0.07 : 0.05;
    ctx.beginPath();
    ctx.ellipse(cx, sol - 0.02, 0.36 * s + 0.08, 0.14 * s + 0.05, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(cx, sol, 0.26 * s, 0.08 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  const sprite = a.couches === undefined ? null : spritePersonnage(a.couches);
  if (sprite !== null) {
    personnageEnPixels(ctx, sprite, cx, sol, a);
    return;
  }

  if (a.endormi) {
    // Allongé : corps horizontal, tête à gauche.
    ctx.fillStyle = a.couleur;
    ctx.fillRect(cx - 0.05 * s, sol - 0.28 * s, 0.42 * s, 0.22 * s);
    ctx.fillStyle = a.teint;
    ctx.beginPath();
    ctx.arc(cx - 0.18 * s, sol - 0.17 * s, 0.13 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#cfe6ff";
    ctx.font = `${0.32 * s}px sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("z", cx + 0.1 * s, sol - 0.4 * s);
    return;
  }

  const balancement = a.marche ? Math.sin(a.phase * Math.PI * 2) * 0.09 * s : 0;
  // Jambes.
  ctx.fillStyle = "#3a2a20";
  ctx.fillRect(cx - 0.13 * s, sol - 0.22 * s, 0.1 * s, 0.22 * s + balancement);
  ctx.fillRect(cx + 0.03 * s, sol - 0.22 * s, 0.1 * s, 0.22 * s - balancement);
  // Corps.
  ctx.fillStyle = a.couleur;
  ctx.beginPath();
  const haut = sol - 0.58 * s;
  ctx.moveTo(cx - 0.2 * s, haut + 0.06 * s);
  ctx.quadraticCurveTo(cx - 0.2 * s, haut, cx - 0.14 * s, haut);
  ctx.lineTo(cx + 0.14 * s, haut);
  ctx.quadraticCurveTo(cx + 0.2 * s, haut, cx + 0.2 * s, haut + 0.06 * s);
  ctx.lineTo(cx + 0.2 * s, sol - 0.2 * s);
  ctx.lineTo(cx - 0.2 * s, sol - 0.2 * s);
  ctx.closePath();
  ctx.fill();
  if (a.blesse === true) {
    ctx.fillStyle = "#d63b3b";
    ctx.fillRect(cx - 0.19 * s, sol - 0.5 * s, 0.38 * s, 0.07 * s);
  }
  insignes(ctx, cx, sol, a);
  ctx.strokeStyle = a.contour;
  ctx.lineWidth = 0.035;
  ctx.stroke();
  // Une ceinture et un col : la tunique a une coupe.
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(cx - 0.19 * s, sol - 0.36 * s, 0.38 * s, 0.045 * s);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(cx - 0.06 * s, haut + 0.01 * s, 0.12 * s, 0.05 * s);
  if (a.enceinte) {
    ctx.fillStyle = a.couleur;
    ctx.beginPath();
    ctx.arc(cx + 0.1 * s, sol - 0.36 * s, 0.13 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  // Bras.
  ctx.strokeStyle = a.teint;
  ctx.lineWidth = 0.07 * s;
  ctx.beginPath();
  ctx.moveTo(cx - 0.2 * s, haut + 0.08 * s);
  ctx.lineTo(cx - 0.27 * s, sol - 0.3 * s - balancement);
  ctx.moveTo(cx + 0.2 * s, haut + 0.08 * s);
  ctx.lineTo(cx + 0.27 * s, sol - 0.3 * s + balancement);
  ctx.stroke();
  // Tête, cernée d'un trait sombre pour rester lisible sur tout fond.
  const ty = haut - 0.15 * s;
  ctx.fillStyle = a.teint;
  ctx.beginPath();
  ctx.arc(cx, ty, 0.16 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(30,15,5,0.45)";
  ctx.lineWidth = 0.025;
  ctx.stroke();
  // Cheveux : calotte, plus longue pour les femmes.
  ctx.fillStyle = a.cheveux;
  ctx.beginPath();
  ctx.arc(cx, ty - 0.02 * s, 0.165 * s, Math.PI, 0);
  if (a.sexe === "F") {
    ctx.lineTo(cx + 0.165 * s, ty + 0.16 * s);
    ctx.lineTo(cx + 0.09 * s, ty + 0.1 * s);
    ctx.lineTo(cx - 0.09 * s, ty + 0.1 * s);
    ctx.lineTo(cx - 0.165 * s, ty + 0.16 * s);
  }
  ctx.closePath();
  ctx.fill();
  // Yeux.
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(cx - 0.05 * s, ty + 0.02 * s, 0.02 * s, 0, Math.PI * 2);
  ctx.arc(cx + 0.05 * s, ty + 0.02 * s, 0.02 * s, 0, Math.PI * 2);
  ctx.fill();
}

/** Le « ! » d'alarme ou l'étoile de notable au-dessus de la tête. */
function insignes(ctx: Ctx, cx: number, sol: number, a: AspectPersonnage): void {
  const s = a.echelle;
  if (a.alerte === true) {
    ctx.fillStyle = "#ffd23a";
    ctx.font = `bold ${0.5 * s}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("!", cx, sol - 1.05 * s);
  } else if (a.notable === true) {
    ctx.fillStyle = "#ffd479";
    ctx.beginPath();
    const r = 0.14 * s;
    const cy = sol - 1.12 * s;
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      const px = cx + Math.cos(ang) * rr;
      const py = cy + Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Le personnage en pixels (M31) : le sprite composé, une tuile de haut, les pieds au sol.
 * Couché quand il dort ; en marche, un balancement et un léger roulis.
 */
function personnageEnPixels(
  ctx: Ctx,
  sprite: HTMLCanvasElement,
  cx: number,
  sol: number,
  a: AspectPersonnage,
): void {
  const s = a.echelle;
  const c = 1.05 * s;
  if (a.endormi) {
    ctx.save();
    ctx.translate(cx, sol - 0.22 * s);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(sprite, -c / 2, -c / 2, c, c);
    ctx.restore();
    ctx.fillStyle = "#cfe6ff";
    ctx.font = `${0.32 * s}px sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("z", cx + 0.2 * s, sol - 0.45 * s);
    return;
  }
  const t = a.marche ? Math.sin(a.phase * Math.PI * 2) : 0;
  ctx.save();
  ctx.translate(cx, sol - Math.abs(t) * 0.05 * s);
  if (a.marche) ctx.rotate(t * 0.07);
  ctx.drawImage(sprite, -c / 2, -c, c, c);
  ctx.restore();
  if (a.couches?.outil === "canne") {
    // Le fil de la canne (M36) : de la pointe du bâton vers l'eau, devant soi.
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.moveTo(cx + 0.36 * s, sol - 0.98 * s);
    ctx.quadraticCurveTo(cx + 0.6 * s, sol - 0.7 * s, cx + 0.62 * s, sol - 0.05 * s);
    ctx.stroke();
  }
  if (a.enceinte) {
    ctx.fillStyle = a.couleur;
    ctx.beginPath();
    ctx.arc(cx + 0.1 * s, sol - 0.36 * s, 0.11 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  if (a.blesse === true) {
    ctx.fillStyle = "#d63b3b";
    ctx.fillRect(cx - 0.2 * s, sol - 0.52 * s, 0.4 * s, 0.07 * s);
  }
  insignes(ctx, cx, sol, a);
}

export interface AspectTroupeau {
  readonly espece: string;
  readonly taille: number;
  readonly predateur: boolean;
  readonly marche: boolean;
  readonly phase: number;
  readonly echelle: number;
  /** Meute menaçante, la nuit : deux yeux jaunes. */
  readonly yeux?: boolean;
}

const ROBES: Readonly<Record<string, { corps: string; ventre: string; taille: number }>> = {
  cerf: { corps: "#8b5a2b", ventre: "#c9a27a", taille: 1 },
  sanglier: { corps: "#3a2a20", ventre: "#5a4636", taille: 0.85 },
  mouflon: { corps: "#9c8b7a", ventre: "#d8cbb8", taille: 0.8 },
  lievre: { corps: "#a89886", ventre: "#e0d6c8", taille: 0.45 },
  aurochs: { corps: "#4a2f1a", ventre: "#6b4a30", taille: 1.3 },
  loup: { corps: "#6f6f74", ventre: "#a5a5aa", taille: 0.9 },
};

/**
 * Une bête (M39b). Le mouton et la vache viennent de la planche Tiny Farm ; les
 * quatre autres sont dessinées, chacune avec sa silhouette : le cerf haut sur
 * pattes, l'encolure dressée et les bois ramifiés ; le sanglier bas, la bosse en
 * avant et le groin au sol ; le lièvre ramassé sur son arrière-train, les
 * oreilles droites ; le loup long, l'échine droite, la queue basse.
 */
function bete(ctx: Ctx, cx: number, sol: number, espece: string, s: number, pas: number): void {
  const robe = ROBES[espece] ?? ROBES.cerf ?? { corps: "#8b5a2b", ventre: "#c9a27a", taille: 1 };
  const k = s * robe.taille;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(cx, sol, 0.26 * k, 0.07 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  // Le mouton et la vache ont leur sprite ; il tient dans une tuile.
  const cote = 0.92 * s * Math.min(1.15, robe.taille);
  if (beteFerme(ctx, espece, cx - cote / 2, sol - cote * 0.92, cote, cote)) return;

  const corps = robe.corps;
  const ventre = robe.ventre;
  const trait = "rgba(0,0,0,0.3)";
  const patte = (dx: number, haut: number, bas: number, large = 0.055): void => {
    ctx.fillStyle = corps;
    ctx.fillRect(cx + dx * k, sol - haut * k, large * k, (haut - bas) * k);
  };

  if (espece === "sanglier") {
    patte(-0.2, 0.16, -0.02 + pas / k);
    patte(0.12, 0.16, -0.02 - pas / k);
    ctx.fillStyle = corps;
    ctx.beginPath();
    ctx.moveTo(cx - 0.3 * k, sol - 0.18 * k);
    ctx.quadraticCurveTo(cx - 0.24 * k, sol - 0.46 * k, cx - 0.02 * k, sol - 0.46 * k);
    ctx.quadraticCurveTo(cx + 0.16 * k, sol - 0.46 * k, cx + 0.24 * k, sol - 0.3 * k);
    ctx.lineTo(cx + 0.38 * k, sol - 0.22 * k);
    ctx.lineTo(cx + 0.24 * k, sol - 0.14 * k);
    ctx.quadraticCurveTo(cx - 0.06 * k, sol - 0.1 * k, cx - 0.3 * k, sol - 0.18 * k);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = trait;
    ctx.lineWidth = 0.02 * k;
    ctx.stroke();
    ctx.fillStyle = ventre;
    ctx.fillRect(cx + 0.3 * k, sol - 0.22 * k, 0.09 * k, 0.06 * k);
    ctx.fillStyle = "#f0e8da";
    ctx.beginPath();
    ctx.moveTo(cx + 0.28 * k, sol - 0.17 * k);
    ctx.lineTo(cx + 0.36 * k, sol - 0.24 * k);
    ctx.lineTo(cx + 0.3 * k, sol - 0.15 * k);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ventre;
    ctx.lineWidth = 0.025 * k;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const bx = cx - 0.16 * k + i * 0.08 * k;
      ctx.moveTo(bx, sol - 0.44 * k);
      ctx.lineTo(bx + 0.015 * k, sol - 0.54 * k);
    }
    ctx.stroke();
    return;
  }

  if (espece === "lievre") {
    // Arrière-train rond, buste dressé, deux longues oreilles.
    ctx.fillStyle = corps;
    ctx.beginPath();
    ctx.ellipse(cx - 0.1 * k, sol - 0.16 * k, 0.19 * k, 0.15 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 0.08 * k, sol - 0.26 * k, 0.13 * k, 0.12 * k, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ventre;
    ctx.beginPath();
    ctx.ellipse(cx - 0.06 * k, sol - 0.09 * k, 0.14 * k, 0.05 * k, 0, 0, Math.PI);
    ctx.fill();
    // La tête et les oreilles.
    ctx.fillStyle = corps;
    ctx.beginPath();
    ctx.ellipse(cx + 0.2 * k, sol - 0.4 * k, 0.1 * k, 0.085 * k, -0.25, 0, Math.PI * 2);
    ctx.fill();
    for (const [dx, incl] of [
      [0.13, -0.28],
      [0.22, -0.05],
    ] as const) {
      ctx.beginPath();
      ctx.ellipse(cx + dx * k, sol - 0.58 * k, 0.032 * k, 0.13 * k, incl, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#f4efe6";
    ctx.beginPath();
    ctx.arc(cx - 0.26 * k, sol - 0.2 * k, 0.055 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a2118";
    ctx.beginPath();
    ctx.arc(cx + 0.24 * k, sol - 0.42 * k, 0.022 * k, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (espece === "loup") {
    patte(-0.24, 0.24, 0.0 + pas / k);
    patte(-0.16, 0.24, 0.0 - pas / k);
    patte(0.12, 0.24, 0.0 - pas / k);
    patte(0.2, 0.24, 0.0 + pas / k);
    // La queue, basse et fournie.
    ctx.fillStyle = corps;
    ctx.beginPath();
    ctx.moveTo(cx - 0.26 * k, sol - 0.36 * k);
    ctx.quadraticCurveTo(cx - 0.46 * k, sol - 0.34 * k, cx - 0.44 * k, sol - 0.14 * k);
    ctx.quadraticCurveTo(cx - 0.36 * k, sol - 0.26 * k, cx - 0.24 * k, sol - 0.28 * k);
    ctx.closePath();
    ctx.fill();
    // Le tronc : échine droite, poitrail profond, ventre remonté.
    ctx.beginPath();
    ctx.moveTo(cx - 0.28 * k, sol - 0.4 * k);
    ctx.lineTo(cx + 0.2 * k, sol - 0.42 * k);
    ctx.quadraticCurveTo(cx + 0.3 * k, sol - 0.4 * k, cx + 0.28 * k, sol - 0.28 * k);
    ctx.quadraticCurveTo(cx + 0.02 * k, sol - 0.2 * k, cx - 0.22 * k, sol - 0.26 * k);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = ventre;
    ctx.beginPath();
    ctx.ellipse(cx - 0.02 * k, sol - 0.26 * k, 0.15 * k, 0.04 * k, 0, 0, Math.PI);
    ctx.fill();
    // La tête, basse et tendue, le museau pointu.
    ctx.fillStyle = corps;
    ctx.beginPath();
    ctx.moveTo(cx + 0.2 * k, sol - 0.5 * k);
    ctx.lineTo(cx + 0.34 * k, sol - 0.5 * k);
    ctx.lineTo(cx + 0.46 * k, sol - 0.4 * k);
    ctx.lineTo(cx + 0.3 * k, sol - 0.34 * k);
    ctx.lineTo(cx + 0.2 * k, sol - 0.38 * k);
    ctx.closePath();
    ctx.fill();
    for (const dx of [0.2, 0.3]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * k, sol - 0.5 * k);
      ctx.lineTo(cx + (dx + 0.025) * k, sol - 0.64 * k);
      ctx.lineTo(cx + (dx + 0.075) * k, sol - 0.5 * k);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#2a2a2e";
    ctx.beginPath();
    ctx.arc(cx + 0.45 * k, sol - 0.41 * k, 0.025 * k, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Le cerf.
  patte(-0.22, 0.34, 0.0 + pas / k, 0.045);
  patte(-0.14, 0.34, 0.0 - pas / k, 0.045);
  patte(0.12, 0.34, 0.0 - pas / k, 0.045);
  patte(0.19, 0.34, 0.0 + pas / k, 0.045);
  ctx.fillStyle = corps;
  ctx.beginPath();
  ctx.moveTo(cx - 0.26 * k, sol - 0.48 * k);
  ctx.lineTo(cx + 0.18 * k, sol - 0.5 * k);
  ctx.quadraticCurveTo(cx + 0.28 * k, sol - 0.48 * k, cx + 0.26 * k, sol - 0.34 * k);
  ctx.quadraticCurveTo(cx + 0.0 * k, sol - 0.28 * k, cx - 0.22 * k, sol - 0.34 * k);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ventre;
  ctx.beginPath();
  ctx.ellipse(cx - 0.02 * k, sol - 0.33 * k, 0.16 * k, 0.04 * k, 0, 0, Math.PI);
  ctx.fill();
  // L'encolure, dressée, et la tête.
  ctx.fillStyle = corps;
  ctx.beginPath();
  ctx.moveTo(cx + 0.14 * k, sol - 0.5 * k);
  ctx.lineTo(cx + 0.24 * k, sol - 0.78 * k);
  ctx.lineTo(cx + 0.34 * k, sol - 0.76 * k);
  ctx.lineTo(cx + 0.26 * k, sol - 0.46 * k);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 0.34 * k, sol - 0.8 * k, 0.09 * k, 0.06 * k, -0.35, 0, Math.PI * 2);
  ctx.fill();
  // Les bois.
  ctx.strokeStyle = "#d9c69b";
  ctx.lineWidth = 0.03 * k;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx + 0.28 * k, sol - 0.86 * k);
  ctx.lineTo(cx + 0.2 * k, sol - 1.06 * k);
  ctx.moveTo(cx + 0.24 * k, sol - 0.97 * k);
  ctx.lineTo(cx + 0.12 * k, sol - 1.0 * k);
  ctx.moveTo(cx + 0.36 * k, sol - 0.86 * k);
  ctx.lineTo(cx + 0.44 * k, sol - 1.04 * k);
  ctx.moveTo(cx + 0.41 * k, sol - 0.96 * k);
  ctx.lineTo(cx + 0.52 * k, sol - 0.99 * k);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = "#2a2118";
  ctx.beginPath();
  ctx.arc(cx + 0.38 * k, sol - 0.82 * k, 0.02 * k, 0, Math.PI * 2);
  ctx.fill();
  // La queue courte, claire.
  ctx.fillStyle = ventre;
  ctx.fillRect(cx - 0.29 * k, sol - 0.5 * k, 0.055 * k, 0.1 * k);
}

/** Un troupeau : une à trois bêtes serrées, et le nombre quand il dépasse trois. */
export function troupeau(ctx: Ctx, x: number, y: number, a: AspectTroupeau): void {
  const s = a.echelle;
  const sol = y + 0.95;
  const n = Math.min(3, Math.max(1, a.taille));
  const pas = a.marche ? Math.sin(a.phase * Math.PI * 2) * 0.05 * s : 0;
  const decalages = n === 1 ? [0] : n === 2 ? [-0.22, 0.22] : [-0.3, 0.05, 0.35];
  for (let i = 0; i < n; i++) {
    const dx = decalages[i] ?? 0;
    bete(
      ctx,
      x + 0.5 + dx * s,
      sol - (i % 2) * 0.12 * s,
      a.espece,
      s * 0.8,
      pas * (i % 2 === 0 ? 1 : -1),
    );
  }
  if (a.yeux === true) {
    ctx.fillStyle = "#ffd23a";
    for (let i = 0; i < n; i++) {
      const dx = decalages[i] ?? 0;
      const ex = x + 0.5 + dx * s + 0.26 * s * 0.8 * 0.9;
      const ey = sol - (i % 2) * 0.12 * s - 0.42 * s * 0.8 * 0.9;
      ctx.fillRect(ex - 0.05 * s, ey - 0.02 * s, 0.04 * s, 0.04 * s);
      ctx.fillRect(ex + 0.02 * s, ey - 0.02 * s, 0.04 * s, 0.04 * s);
    }
  }
  if (a.taille > 3) {
    ctx.fillStyle = a.predateur ? "#ffb3b3" : "#f4efe6";
    ctx.font = `${0.32 * s}px sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`×${String(a.taille)}`, x + 0.85, sol - 0.6 * s);
  }
}
