/**
 * Dessins vectoriels des éléments du monde, en unités de tuile (le contexte est
 * déjà mis à l'échelle : 1 = une tuile). Aucune image externe.
 */

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
  ctx.fillStyle = "#5a3a1a";
  ctx.fillRect(cx - 0.05 * taille, base - 0.35 * taille, 0.1 * taille, 0.35 * taille);
  const verts = ["#2f7a3a", "#276b33", "#3a8a44"];
  ctx.fillStyle = verts[variante % verts.length] ?? "#2f7a3a";
  ctx.beginPath();
  ctx.arc(cx, base - 0.5 * taille, 0.3 * taille, 0, Math.PI * 2);
  ctx.arc(cx - 0.18 * taille, base - 0.38 * taille, 0.22 * taille, 0, Math.PI * 2);
  ctx.arc(cx + 0.18 * taille, base - 0.4 * taille, 0.22 * taille, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(cx - 0.08 * taille, base - 0.6 * taille, 0.12 * taille, 0, Math.PI * 2);
  ctx.fill();
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
        arbre(ctx, x, y, 1.05 * t + 0.1, 1);
      }
      break;
    case "pierre":
      rocher(ctx, x + 0.05, y + 0.1, 0.9 * t, "#b0b0b0");
      rocher(ctx, x + 0.45, y + 0.4, 0.5 * t, "#8c8c8c");
      break;
    case "baies": {
      ctx.fillStyle = "#3f8f3a";
      ctx.beginPath();
      ctx.arc(x + 0.5, y + 0.6, 0.32 * t, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e0306a";
      const points: readonly (readonly [number, number])[] = [
        [-0.12, -0.05],
        [0.1, 0.02],
        [0, 0.12],
        [-0.02, -0.16],
      ];
      for (const [dx, dy] of points) {
        ctx.beginPath();
        ctx.arc(x + 0.5 + dx * t, y + 0.6 + dy * t, 0.06 * t, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
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
    case "argile":
      ctx.fillStyle = "#c46a2b";
      ctx.beginPath();
      ctx.ellipse(x + 0.5, y + 0.7, 0.32 * t, 0.16 * t, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#a8551f";
      ctx.beginPath();
      ctx.ellipse(x + 0.5, y + 0.66, 0.18 * t, 0.08 * t, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    default:
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 0.35, y + 0.35, 0.3, 0.3);
  }
}

/* ---------- Bâtiments ---------- */

export function abri(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = "#c9a56b";
  ctx.fillRect(x + 0.18, y + 0.52, 0.64, 0.4);
  ctx.fillStyle = "#6b4423";
  ctx.beginPath();
  ctx.moveTo(x + 0.06, y + 0.55);
  ctx.lineTo(x + 0.5, y + 0.1);
  ctx.lineTo(x + 0.94, y + 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#3d2412";
  ctx.fillRect(x + 0.42, y + 0.66, 0.16, 0.26);
}

export function maison(ctx: Ctx, x: number, y: number, nuit: boolean): void {
  ctx.fillStyle = "#e8d5b5";
  ctx.fillRect(x + 0.08, y + 0.42, 0.84, 0.52);
  ctx.fillStyle = "#8b3a2a";
  ctx.beginPath();
  ctx.moveTo(x, y + 0.45);
  ctx.lineTo(x + 0.5, y + 0.06);
  ctx.lineTo(x + 1, y + 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#4a2a15";
  ctx.fillRect(x + 0.42, y + 0.64, 0.16, 0.3);
  ctx.fillStyle = nuit ? "#ffd27a" : "#9ecbe6";
  ctx.fillRect(x + 0.16, y + 0.52, 0.16, 0.14);
  ctx.fillRect(x + 0.68, y + 0.52, 0.16, 0.14);
  ctx.fillStyle = "#6b4423";
  ctx.fillRect(x + 0.68, y + 0.16, 0.1, 0.2);
}

export function entrepot(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = "#7a4a1e";
  ctx.fillRect(x + 0.05, y + 0.38, 0.9, 0.56);
  ctx.fillStyle = "#555555";
  ctx.beginPath();
  ctx.moveTo(x, y + 0.4);
  ctx.lineTo(x + 0.2, y + 0.12);
  ctx.lineTo(x + 0.8, y + 0.12);
  ctx.lineTo(x + 1, y + 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#4a2a15";
  ctx.fillRect(x + 0.32, y + 0.55, 0.36, 0.39);
  ctx.strokeStyle = "#c9a56b";
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(x + 0.32, y + 0.55);
  ctx.lineTo(x + 0.68, y + 0.94);
  ctx.moveTo(x + 0.68, y + 0.55);
  ctx.lineTo(x + 0.32, y + 0.94);
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
  const t = maintenant / 900;
  ctx.fillStyle = "rgba(220,220,220,0.5)";
  for (let i = 0; i < 3; i++) {
    const phase = (t + i * 0.33) % 1;
    ctx.beginPath();
    ctx.arc(
      x + 0.5 + Math.sin((phase + i) * 6) * 0.08,
      y + 0.2 - phase * 0.3,
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

export function palissade(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = "#7a5a2e";
  for (let i = 0; i < 4; i++) ctx.fillRect(x + 0.1 + i * 0.22, y + 0.3, 0.12, 0.6);
  ctx.fillRect(x + 0.05, y + 0.5, 0.9, 0.08);
}

/** Enclos : quatre pieux et deux lisses, une porte au sud. */
export function enclos(ctx: Ctx, x: number, y: number): void {
  ctx.strokeStyle = "#a0783c";
  ctx.lineWidth = 0.06;
  ctx.strokeRect(x + 0.1, y + 0.15, 0.8, 0.75);
  ctx.beginPath();
  ctx.moveTo(x + 0.1, y + 0.5);
  ctx.lineTo(x + 0.9, y + 0.5);
  ctx.stroke();
  ctx.fillStyle = "#7a5a2e";
  for (const [px, py] of [
    [0.1, 0.15],
    [0.9, 0.15],
    [0.1, 0.9],
    [0.9, 0.9],
  ] as const)
    ctx.fillRect(x + px - 0.05, y + py - 0.12, 0.1, 0.18);
}

const COULEURS_STADE = ["#9c7a4a", "#a8c56a", "#7fb04f", "#c9c04a", "#e0b23a"] as const;

/** Champ : des sillons, dont la couleur dit le stade (terre nue, levée, pousse, épis, mûr). */
export function champ(ctx: Ctx, x: number, y: number, seme: boolean, stade: number): void {
  ctx.fillStyle = "#6b4a2c";
  ctx.fillRect(x + 0.05, y + 0.05, 0.9, 0.9);
  ctx.fillStyle = seme ? (COULEURS_STADE[Math.max(0, Math.min(4, stade))] ?? "#9c7a4a") : "#7d5a38";
  for (let i = 0; i < 4; i++) ctx.fillRect(x + 0.1, y + 0.12 + i * 0.22, 0.8, 0.1);
  if (seme && stade >= 3) {
    ctx.fillStyle = "#f2d16b";
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 3; j++) ctx.fillRect(x + 0.2 + j * 0.28, y + 0.1 + i * 0.22, 0.06, 0.06);
  }
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
  if (a.alerte === true) {
    ctx.fillStyle = "#ffd23a";
    ctx.font = `bold ${0.5 * s}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("!", cx, sol - 1.05 * s);
  }
  ctx.strokeStyle = a.contour;
  ctx.lineWidth = 0.035;
  ctx.stroke();
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
  // Tête.
  const ty = haut - 0.15 * s;
  ctx.fillStyle = a.teint;
  ctx.beginPath();
  ctx.arc(cx, ty, 0.16 * s, 0, Math.PI * 2);
  ctx.fill();
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

/** Une bête : corps, tête, pattes, et selon l'espèce des bois, des cornes ou des oreilles. */
function bete(ctx: Ctx, cx: number, sol: number, espece: string, s: number, pas: number): void {
  const robe = ROBES[espece] ?? ROBES.cerf ?? { corps: "#8b5a2b", ventre: "#c9a27a", taille: 1 };
  const k = s * robe.taille;
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(cx, sol, 0.28 * k, 0.07 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pattes.
  ctx.fillStyle = robe.corps;
  ctx.fillRect(cx - 0.2 * k, sol - 0.22 * k, 0.07 * k, 0.22 * k + pas);
  ctx.fillRect(cx + 0.12 * k, sol - 0.22 * k, 0.07 * k, 0.22 * k - pas);
  // Corps.
  ctx.beginPath();
  ctx.ellipse(cx, sol - 0.3 * k, 0.3 * k, 0.16 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = robe.ventre;
  ctx.beginPath();
  ctx.ellipse(cx, sol - 0.25 * k, 0.22 * k, 0.07 * k, 0, 0, Math.PI);
  ctx.fill();
  // Tête, à droite.
  ctx.fillStyle = robe.corps;
  ctx.beginPath();
  ctx.ellipse(cx + 0.32 * k, sol - 0.42 * k, 0.11 * k, 0.09 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 0.03 * k;
  ctx.strokeStyle = robe.corps;
  if (espece === "cerf") {
    ctx.beginPath();
    ctx.moveTo(cx + 0.3 * k, sol - 0.5 * k);
    ctx.lineTo(cx + 0.22 * k, sol - 0.68 * k);
    ctx.moveTo(cx + 0.26 * k, sol - 0.6 * k);
    ctx.lineTo(cx + 0.16 * k, sol - 0.66 * k);
    ctx.moveTo(cx + 0.36 * k, sol - 0.5 * k);
    ctx.lineTo(cx + 0.42 * k, sol - 0.68 * k);
    ctx.stroke();
  } else if (espece === "aurochs" || espece === "mouflon") {
    ctx.beginPath();
    ctx.moveTo(cx + 0.28 * k, sol - 0.5 * k);
    ctx.quadraticCurveTo(cx + 0.2 * k, sol - 0.62 * k, cx + 0.3 * k, sol - 0.62 * k);
    ctx.moveTo(cx + 0.38 * k, sol - 0.5 * k);
    ctx.quadraticCurveTo(cx + 0.46 * k, sol - 0.62 * k, cx + 0.36 * k, sol - 0.62 * k);
    ctx.stroke();
  } else if (espece === "lievre" || espece === "loup") {
    ctx.fillRect(cx + 0.26 * k, sol - 0.58 * k, 0.04 * k, 0.12 * k);
    ctx.fillRect(cx + 0.34 * k, sol - 0.58 * k, 0.04 * k, 0.12 * k);
  } else if (espece === "sanglier") {
    ctx.fillStyle = "#f0e6d8";
    ctx.fillRect(cx + 0.4 * k, sol - 0.4 * k, 0.05 * k, 0.04 * k);
  }
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
