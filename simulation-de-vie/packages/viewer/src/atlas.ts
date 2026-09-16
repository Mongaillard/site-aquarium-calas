/**
 * Atlas de tuiles (M27) : deux planches CC0 de Kenney chargées une fois,
 * découpées par coordonnées de grille, et posées comme textures ponctuelles
 * au-dessus du fond vectoriel (arbres, buissons, tas de pierre et d'argile,
 * minerai, mousserons). Voir `assets/tuiles/CREDITS.md`.
 *
 * Chaque planche s'importe en `?inline` : elle finit en URL `data:` dans le
 * script, comme le reste du rendu — aucune image externe à charger au
 * lancement, la page reste un seul fichier.
 */
import roguelikeUrl from "./assets/tuiles/roguelike/roguelikeSheet_transparent.png?inline";
import tinyTownUrl from "./assets/tuiles/tiny-town/tilemap_packed.png?inline";

interface Feuille {
  readonly image: HTMLImageElement;
  readonly tuile: number;
  readonly pas: number;
  prete: boolean;
}

function charger(url: string, tuile: number, pas: number): Feuille {
  const image = new Image();
  const feuille: Feuille = { image, tuile, pas, prete: false };
  image.decoding = "async";
  image.addEventListener("load", () => {
    feuille.prete = true;
  });
  image.src = url;
  return feuille;
}

const roguelike = charger(roguelikeUrl, 16, 17);
const tinyTown = charger(tinyTownUrl, 16, 16);

/** Vrai une fois les deux planches décodées : avant, mieux vaut ne rien mettre en cache. */
export function atlasPret(): boolean {
  return roguelike.prete && tinyTown.prete;
}

/** Dessine la tuile (col, row) d'une feuille dans le carré [x, y, w, h] (repère monde). */
function tuile(
  ctx: CanvasRenderingContext2D,
  feuille: Feuille,
  col: number,
  row: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (!feuille.prete) return;
  const { tuile: t, pas } = feuille;
  ctx.drawImage(feuille.image, col * pas, row * pas, t, t, x, y, w, h);
}

/** Pin (trois tailles, `variante` 0..2) de la planche Roguelike, colonne 16. */
export function pin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  taille: number,
  variante: number,
): void {
  const row = 9 + Math.max(0, Math.min(2, variante));
  const c = taille;
  tuile(ctx, roguelike, 16, row, x + 0.5 - c / 2, y + 0.95 - c, c, c);
}

/** Pommier (trois densités de fruits, `variante` 0..2) de la planche Roguelike, colonne 23. */
export function pommier(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  taille: number,
  variante: number,
): void {
  const row = 9 + Math.max(0, Math.min(2, variante));
  const c = taille;
  tuile(ctx, roguelike, 23, row, x + 0.5 - c / 2, y + 0.95 - c, c, c);
}

/** Buisson à baies (rouges, bleues ou violettes selon `variante` 0..2), colonne 24. */
export function buissonBaies(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  taille: number,
  variante: number,
): void {
  const row = 9 + Math.max(0, Math.min(2, variante));
  const c = taille;
  tuile(ctx, roguelike, 24, row, x + 0.5 - c / 2, y + 0.95 - c, c, c);
}

/** Tas de pierre (trois variantes 0..2), colonnes 54-56, ligne 21. */
export function tasDePierre(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  taille: number,
  variante: number,
): void {
  const col = 54 + Math.max(0, Math.min(2, variante));
  const c = taille;
  tuile(ctx, roguelike, col, 21, x + 0.5 - c / 2, y + 0.95 - c, c, c);
}

/** Tas d'argile (trois variantes 0..2), colonnes 54-56, ligne 18. */
export function tasDArgile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  taille: number,
  variante: number,
): void {
  const col = 54 + Math.max(0, Math.min(2, variante));
  const c = taille;
  tuile(ctx, roguelike, col, 18, x + 0.5 - c / 2, y + 0.95 - c, c, c);
}

/** Amas de gemmes (minerai), colonne 32, ligne 9. */
export function gemmes(ctx: CanvasRenderingContext2D, x: number, y: number, taille: number): void {
  const c = taille;
  tuile(ctx, roguelike, 32, 9, x + 0.5 - c / 2, y + 0.95 - c, c, c);
}

/** Mousserons (planche Tiny Town, colonne 5, ligne 2). */
export function mousserons(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  taille: number,
): void {
  const c = taille;
  tuile(ctx, tinyTown, 5, 2, x + 0.5 - c / 2, y + 0.95 - c, c, c);
}
