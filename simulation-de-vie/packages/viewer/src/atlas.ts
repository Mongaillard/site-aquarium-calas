/**
 * Atlas de tuiles (M27, M31) : quatre planches CC0 de Kenney chargées une fois,
 * découpées par coordonnées de grille ou par rectangle, et posées comme textures
 * au-dessus du fond vectoriel — arbres, buissons, tas de pierre et d'argile,
 * minerai, mousserons (M27) ; bâtiments et personnages en couches (M31).
 * Voir `assets/tuiles/CREDITS.md`.
 *
 * Chaque planche s'importe en `?inline` : elle finit en URL `data:` dans le
 * script, comme le reste du rendu — aucune image externe à charger au
 * lancement, la page reste un seul fichier.
 */
import roguelikeUrl from "./assets/tuiles/roguelike/roguelikeSheet_transparent.png?inline";
import tinyTownUrl from "./assets/tuiles/tiny-town/tilemap_packed.png?inline";
import tinyFarmUrl from "./assets/tuiles/tiny-farm/tilemap_packed.png?inline";
import tinyDungeonUrl from "./assets/tuiles/tiny-dungeon/tilemap_packed.png?inline";
import medievalUrl from "./assets/tuiles/medieval-rts/medievalRTS_spritesheet.png?inline";
import personnagesUrl from "./assets/tuiles/roguelike-characters/roguelikeChar_transparent.png?inline";

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
/** Tiny Farm (M39b) : cultures par stade, bétail, sacs et étals. */
const tinyFarm = charger(tinyFarmUrl, 16, 16);
/** Tiny Dungeon (M40) : ce qui n'est ni villageois ni bête — créatures du ciel, pillards. */
const tinyDungeon = charger(tinyDungeonUrl, 16, 16);
const medieval = charger(medievalUrl, 0, 0);
const personnages = charger(personnagesUrl, 16, 17);

/** Vrai une fois les cinq planches décodées : avant, mieux vaut ne rien mettre en cache. */
export function atlasPret(): boolean {
  return roguelike.prete && tinyTown.prete && medieval.prete && personnages.prete && tinyFarm.prete;
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

/* ---------- Bâtiments (Medieval RTS, M31) ---------- */

/** Rectangles de l'atlas Medieval RTS (x, y, largeur, hauteur en pixels), recopiés de son XML. */
const STRUCTURES = {
  tente: [479, 382, 32, 40],
  grange: [380, 447, 56, 60],
  puits: [511, 197, 20, 36],
  maison_haute: [431, 84, 44, 60],
  maison_basse: [431, 262, 44, 48],
  four: [383, 320, 52, 60],
  fumoir: [384, 0, 52, 48],
  sanctuaire: [431, 226, 44, 36],
} as const;

export type Structure = keyof typeof STRUCTURES;

/** Vrai si la planche des bâtiments est décodée : sinon, le dessin vectoriel reste. */
export function batimentsPrets(): boolean {
  return medieval.prete;
}

/**
 * Pose un bâtiment de l'atlas sur la tuile (x, y) : `largeur` tuiles de large, ancré au sol
 * (le bas du sprite à y + 0.98), hauteur proportionnelle. Renvoie faux si la planche manque.
 */
export function structure(
  ctx: CanvasRenderingContext2D,
  nom: Structure,
  x: number,
  y: number,
  largeur: number,
): boolean {
  if (!medieval.prete) return false;
  const [sx, sy, sw, sh] = STRUCTURES[nom];
  const hauteur = (largeur * sh) / sw;
  ctx.drawImage(
    medieval.image,
    sx,
    sy,
    sw,
    sh,
    x + 0.5 - largeur / 2,
    y + 0.98 - hauteur,
    largeur,
    hauteur,
  );
  return true;
}

/* ---------- Personnages (Roguelike Characters, M31) ---------- */

/** Ce qu'il faut pour composer un personnage : chaque clé change le sprite en cache. */
export interface CouchesPersonnage {
  /** Clé de teint du moteur : clair, hâlé, mat, foncé. */
  readonly teint: string;
  /** Clé de cheveux du moteur : noirs, bruns, châtains, blonds, roux, gris. */
  readonly cheveux: string;
  readonly sexe: "F" | "M";
  /** Coiffure 0..2, tirée de l'identité pour varier les têtes. */
  readonly coiffure: number;
  /** Couleur CSS de la tunique (la famille). */
  readonly couleur: string;
  /** Outil en main (`PersonnageEtat.outil`) ou null. */
  readonly outil: string | null;
  /** Teinte de la matière de l'outil trouvé (M38) : une hache de bronze se voit. */
  readonly outilCouleur?: string | undefined;
  readonly malade: boolean;
  readonly banni: boolean;
}

const TAILLE = 16;
/** Corps : colonne 0, ligne par teint ; `foncé` prend le corps brun assombri. */
const CORPS: Readonly<Record<string, { readonly row: number; readonly teinte: string | null }>> = {
  clair: { row: 0, teinte: null },
  hâlé: { row: 1, teinte: null },
  mat: { row: 2, teinte: null },
  foncé: { row: 2, teinte: "#a07858" },
};
/** Blocs de cheveux : coin haut-gauche (col, row) d'un bloc de 4×4 coiffures d'une couleur. */
const BLOCS_CHEVEUX: Readonly<Record<string, readonly [number, number]>> = {
  bruns: [19, 0],
  châtains: [19, 0],
  roux: [23, 0],
  blonds: [19, 4],
  noirs: [23, 4],
  gris: [19, 8],
};
/** Coiffures dans un bloc : (dcol, drow) — courtes pour les hommes, longues pour les femmes. */
const COIFFURES: Readonly<Record<"F" | "M", readonly (readonly [number, number])[]>> = {
  M: [
    [0, 0],
    [2, 0],
    [3, 0],
  ],
  F: [
    [1, 0],
    [1, 1],
    [3, 1],
  ],
};
/** Outils : colonne, et ligne selon la matière (pierre : bois brun ; cuivre : ferrure claire). */
const OUTILS: Readonly<Record<string, readonly [number, number]>> = {
  hache: [51, 0],
  hache_cuivre: [51, 7],
  pioche: [50, 0],
  pioche_cuivre: [50, 7],
  lance: [42, 0],
  arc: [52, 0],
  canne: [44, 0],
  marteau: [49, 0],
};
/** La tunique blanche unie (colonne 12, ligne 4) : elle épouse le corps ; la 10 est une cuirasse à épaulières. */
const TUNIQUE: readonly [number, number] = [12, 4];

const cache = new Map<string, HTMLCanvasElement>();
let brouillon: CanvasRenderingContext2D | null = null;

function contexte(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("canvas 2D indisponible");
  return ctx;
}

/** Une couche de la planche, teintée (multiplication) si demandé, posée sur `dest`. */
function couche(
  dest: CanvasRenderingContext2D,
  col: number,
  row: number,
  teinte: string | null,
): void {
  const { image, pas } = personnages;
  if (teinte === null) {
    dest.drawImage(image, col * pas, row * pas, TAILLE, TAILLE, 0, 0, TAILLE, TAILLE);
    return;
  }
  if (brouillon === null) {
    const c = document.createElement("canvas");
    c.width = TAILLE;
    c.height = TAILLE;
    brouillon = contexte(c);
  }
  const b = brouillon;
  b.globalCompositeOperation = "source-over";
  b.clearRect(0, 0, TAILLE, TAILLE);
  b.drawImage(image, col * pas, row * pas, TAILLE, TAILLE, 0, 0, TAILLE, TAILLE);
  b.globalCompositeOperation = "multiply";
  b.fillStyle = teinte;
  b.fillRect(0, 0, TAILLE, TAILLE);
  // La multiplication a peint tout le carré : on ne garde que la silhouette de la couche.
  b.globalCompositeOperation = "destination-in";
  b.drawImage(image, col * pas, row * pas, TAILLE, TAILLE, 0, 0, TAILLE, TAILLE);
  b.globalCompositeOperation = "source-over";
  dest.drawImage(b.canvas, 0, 0);
}

/** Le sprite composé d'un personnage (16×16), mis en cache par apparence ; null si la planche manque. */
export function spritePersonnage(c: CouchesPersonnage): HTMLCanvasElement | null {
  if (!personnages.prete) return null;
  const cle = `${c.teint}|${c.cheveux}|${c.sexe}|${String(c.coiffure)}|${c.couleur}|${c.outil ?? ""}|${c.outilCouleur ?? ""}|${c.malade ? "m" : ""}|${c.banni ? "b" : ""}`;
  const existant = cache.get(cle);
  if (existant !== undefined) return existant;
  if (cache.size > 2000) cache.clear();
  const canvas = document.createElement("canvas");
  canvas.width = TAILLE;
  canvas.height = TAILLE;
  const ctx = contexte(canvas);
  const corps = CORPS[c.teint] ?? { row: 0, teinte: null };
  couche(ctx, 0, corps.row, c.malade ? "#c9d8c6" : corps.teinte);
  couche(ctx, TUNIQUE[0], TUNIQUE[1], c.couleur);
  const bloc = BLOCS_CHEVEUX[c.cheveux] ?? [19, 0];
  const coiffures = COIFFURES[c.sexe];
  const coiffure = coiffures[Math.abs(c.coiffure) % coiffures.length] ?? [0, 0];
  couche(
    ctx,
    bloc[0] + coiffure[0],
    bloc[1] + coiffure[1],
    c.cheveux === "châtains" ? "#e0c090" : null,
  );
  const outil = c.outil === null ? undefined : OUTILS[c.outil];
  if (outil !== undefined) couche(ctx, outil[0], outil[1], c.outilCouleur ?? null);
  if (c.banni && brouillon !== null) {
    // À l'écart du village : une silhouette éteinte. La multiplication peint tout le carré,
    // une copie du composé sert ensuite de pochoir pour n'en garder que la silhouette.
    const b = brouillon;
    b.globalCompositeOperation = "source-over";
    b.clearRect(0, 0, TAILLE, TAILLE);
    b.drawImage(canvas, 0, 0);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "#8a8a90";
    ctx.fillRect(0, 0, TAILLE, TAILLE);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(b.canvas, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }
  cache.set(cle, canvas);
  return canvas;
}

/* ---------- Tiny Farm (M39b) : cultures, sol labouré, bétail ---------- */

/** Les cinq cultures de la planche, une ligne chacune : on varie selon le champ. */
const CULTURES: readonly number[] = [0, 2, 3, 4, 5];
/** Les trois colonnes d'une culture : pousse, jeune, mûre. */
const STADES: readonly number[] = [4, 5, 6];

/**
 * La culture d'un champ selon son stade (1 à 4) ; `variante` choisit la plante,
 * pour que deux champs voisins ne poussent pas la même chose. Faux si la planche
 * n'est pas prête, ou si le champ n'est pas encore levé.
 */
export function culture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  stade: number,
  variante: number,
): boolean {
  if (!tinyFarm.prete || stade < 1) return false;
  const ligne = CULTURES[Math.abs(variante) % CULTURES.length] ?? 5;
  const colonne = STADES[Math.min(STADES.length - 1, stade - 1)] ?? 6;
  tuile(ctx, tinyFarm, colonne, ligne, x, y, w, h);
  return true;
}

/** Les bêtes que la planche sait dessiner : mouton et vache. */
const BETES_FERME: Readonly<Record<string, readonly [number, number]>> = {
  mouflon: [0, 10],
  aurochs: [1, 10],
};

/** Une bête de ferme en sprite (M39b) ; faux pour une espèce que la planche ignore. */
export function beteFerme(
  ctx: CanvasRenderingContext2D,
  espece: string,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  if (!tinyFarm.prete) return false;
  const t = BETES_FERME[espece];
  if (t === undefined) return false;
  tuile(ctx, tinyFarm, t[0], t[1], x, y, w, h);
  return true;
}

/* ---------- Tiny Dungeon (M40) : créatures du ciel et pillards ---------- */

/** Ce que la planche prête à ce qui n'est ni villageois ni bête. */
const FIGURES: Readonly<Record<string, readonly [number, number]>> = {
  /** Le gardien posté : un homme d'armes casqué. */
  gardien: [0, 8],
  /** Le fléau lâché : un spectre. */
  fleau: [1, 10],
  /** Un pillard : casque à cornes. */
  pillard: [3, 7],
};

/**
 * Une figure de la planche Tiny Dungeon (M40) ; faux si la planche n'est pas
 * prête ou si la figure n'existe pas — l'appelant garde alors son dessin.
 */
export function figure(
  ctx: CanvasRenderingContext2D,
  nom: string,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  if (!tinyDungeon.prete) return false;
  const t = FIGURES[nom];
  if (t === undefined) return false;
  tuile(ctx, tinyDungeon, t[0], t[1], x, y, w, h);
  return true;
}
