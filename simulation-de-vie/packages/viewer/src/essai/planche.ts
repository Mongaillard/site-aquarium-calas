/** Planche d'essai (M39b) : tous les dessins nouveaux, côte à côte. */
import * as sprites from "../sprites.js";
import { atlasPret } from "../atlas.js";

const canvas = document.createElement("canvas");
canvas.width = 1200;
canvas.height = 760;
document.body.style.background = "#2a2f26";
document.body.style.margin = "0";
document.body.append(canvas);
const contexte = canvas.getContext("2d");
if (contexte === null) throw new Error("pas de contexte");
const ctx: CanvasRenderingContext2D = contexte;

const E = 64;
function cellule(col: number, row: number, titre: string, dessin: () => void): void {
  ctx.save();
  ctx.translate(30 + col * (E * 2.4), 40 + row * (E * 2.4));
  ctx.scale(E, E);
  dessin();
  ctx.restore();
  ctx.fillStyle = "#dfe4dc";
  ctx.font = "13px sans-serif";
  ctx.fillText(titre, 30 + col * (E * 2.4), 34 + row * (E * 2.4));
}

function fond(largeur = 2, hauteur = 2): void {
  ctx.fillStyle = "#6fa04a";
  ctx.fillRect(-0.5, -0.5, largeur, hauteur);
}

function tout(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#2a2f26";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const stades = ["semé", "levée", "pousse", "mûr"];
  for (let i = 0; i < 4; i++)
    cellule(i, 0, `champ ${stades[i]}`, () => {
      fond();
      sprites.champ(ctx, 0, 0, i > 0, i, 5);
    });
  for (let v = 0; v < 3; v++)
    cellule(4 + v, 0, `champ mûr ${v}`, () => {
      fond();
      sprites.champ(ctx, 0, 0, true, 3, v);
    });
  cellule(0, 1, "palissade seule", () => {
    fond();
    sprites.palissade(ctx, 0, 0, { n: false, s: false, e: false, o: false });
  });
  cellule(1, 1, "mur est-ouest", () => {
    fond(3);
    sprites.palissade(ctx, -1, 0, { n: false, s: false, e: true, o: false });
    sprites.palissade(ctx, 0, 0, { n: false, s: false, e: true, o: true });
    sprites.palissade(ctx, 1, 0, { n: false, s: false, e: false, o: true });
  });
  cellule(2, 1, "angle", () => {
    fond(2, 2);
    sprites.palissade(ctx, 0, 0, { n: false, s: true, e: true, o: false });
    sprites.palissade(ctx, 1, 0, { n: false, s: false, e: false, o: true });
    sprites.palissade(ctx, 0, 1, { n: true, s: false, e: false, o: false });
  });
  cellule(3, 1, "portail", () => {
    fond(3);
    sprites.palissade(ctx, -1, 0, { n: false, s: false, e: true, o: false });
    sprites.portail(ctx, 0, 0);
    sprites.palissade(ctx, 1, 0, { n: false, s: false, e: false, o: true });
  });
  cellule(5, 1, "parc", () => {
    ctx.fillStyle = "#6fa04a";
    ctx.fillRect(-1.5, -1.5, 4, 4);
    sprites.parc(ctx, 0, 0);
  });
  const especes = ["cerf", "sanglier", "mouflon", "lievre", "aurochs", "loup"];
  especes.forEach((espece, i) => {
    cellule(i, 2, espece, () => {
      fond();
      sprites.troupeau(ctx, 0, 0, {
        espece,
        taille: 1,
        predateur: espece === "loup",
        echelle: 1.6,
        marche: false,
        phase: 0,
      });
    });
  });
  especes.forEach((espece, i) => {
    cellule(i, 3, `${espece} ×3`, () => {
      fond();
      sprites.troupeau(ctx, 0, 0, {
        espece,
        taille: 3,
        predateur: espece === "loup",
        echelle: 1.2,
        marche: true,
        phase: 0.25,
      });
    });
  });
}

tout();
const attendre = setInterval(() => {
  if (atlasPret()) {
    tout();
    clearInterval(attendre);
    document.title = "prêt";
  }
}, 120);
