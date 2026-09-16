/**
 * Génération procédurale du monde (section 4.1), morceau par morceau et sans
 * limite : un bruit lent dessine continents et mers, un bruit plus fin le
 * relief, un troisième l'humidité ; un « berceau » relève l'origine pour que la
 * colonie naisse toujours sur la terre ferme. Chaque morceau ne dépend que de
 * la graine et de ses coordonnées : l'ordre d'exploration ne change rien.
 */
import type { Rng } from "../rng.js";
import type { Biome } from "./biomes.js";
import { BruitSimplex2D } from "./bruit.js";
import { Grille, TAILLE_MORCEAU } from "./grille.js";
import type { Position, Tuile } from "./grille.js";
import { GISEMENTS_PAR_BIOME } from "./ressources.js";
import type { Gisement } from "./ressources.js";

export interface OptionsGeneration {
  /** Échelle du relief : plus grand = collines et vallées plus larges. */
  readonly echelleRelief?: number;
  /** Échelle des continents : plus grand = terres et mers plus vastes. */
  readonly echelleContinents?: number;
  /** Rayon du berceau (terre garantie autour de l'origine), en tuiles. */
  readonly berceau?: number;
  /**
   * Abondance du berceau (1 = normal, jusqu'à 4) : des mares supplémentaires à
   * quatorze tuiles de l'origine et des gisements plus denses et plus riches
   * dans le berceau, pour une colonie qui démarre nombreuse.
   */
  readonly abondance?: number;
  /**
   * Foyers des peuples rivaux (M26) : autour de chacun, la terre est garantie,
   * un rivage se creuse et les gisements ont l'abondance du berceau.
   */
  readonly foyers?: readonly Position[];
}

/** Distance du berceau à laquelle les peuples rivaux du départ s'installent. */
export const DISTANCE_PEUPLES = 48;

/**
 * Les sites des peuples rivaux (M26), tirés de la graine : répartis en cercle
 * autour du berceau, à partir d'un angle de départ. Le premier peuple est à
 * l'origine ; les suivants viennent ici.
 */
export function sitesDesPeuples(rng: Rng, peuples: number): Position[] {
  const decalage = rng.fork("peuples").suivant() * Math.PI * 2;
  const sites: Position[] = [];
  for (let k = 1; k < peuples; k++) {
    const angle = decalage + (Math.PI * 2 * k) / peuples;
    sites.push({
      x: Math.round(Math.cos(angle) * DISTANCE_PEUPLES),
      y: Math.round(Math.sin(angle) * DISTANCE_PEUPLES),
    });
  }
  return sites;
}

/** Abondance du berceau pour une population de départ : une part pour douze habitants, quatre au plus. */
export function abondanceDuBerceau(populationInitiale: number): number {
  return Math.min(4, Math.max(1, populationInitiale / 12));
}

/** Distance des mares supplémentaires à l'origine, en tuiles. */
const DISTANCE_MARES = 14;
/** Rayon d'une mare supplémentaire, en tuiles. */
const RAYON_MARE = 2.5;

/** Seuils d'altitude / d'humidité qui délimitent les biomes. */
export const SEUILS = {
  eauProfonde: -0.25,
  mer: 0,
  plage: 0.06,
  colline: 0.42,
  montagne: 0.62,
  maraisAltitudeMax: 0.16,
  maraisHumidite: 0.35,
  foretHumidite: 0.05,
} as const;

export function choisirBiome(altitude: number, humidite: number): Biome {
  if (altitude < SEUILS.eauProfonde) return "eau_profonde";
  if (altitude < SEUILS.mer) return "eau_peu_profonde";
  if (altitude < SEUILS.plage) return "plage";
  if (altitude >= SEUILS.montagne) return "montagne";
  if (altitude >= SEUILS.colline) return "colline";
  if (altitude < SEUILS.maraisAltitudeMax && humidite > SEUILS.maraisHumidite) return "marais";
  if (humidite > SEUILS.foretHumidite) return "foret";
  return "prairie";
}

/** Tire (ou non) le gisement d'une tuile selon son biome ; sert aussi au pinceau du ciel. */
export function tirerGisement(rng: Rng, biome: Biome, abondance = 1): Gisement | null {
  // Même nombre de tirages quelle que soit l'abondance : les mondes à douze ne changent pas.
  const facteur = 1 + 0.5 * (abondance - 1);
  const richesse = Math.sqrt(abondance);
  for (const profil of GISEMENTS_PAR_BIOME[biome]) {
    if (rng.chance(Math.min(0.9, profil.probabilite * facteur))) {
      const max = rng.entier(
        Math.round(profil.min * richesse),
        Math.max(Math.round(profil.min * richesse), Math.round(profil.max * richesse)),
      );
      return {
        type: profil.type,
        quantite: max,
        max,
        tauxRegen: profil.tauxRegen,
        outilRequis: profil.outilRequis,
        epuiseDepuis: null,
      };
    }
  }
  return null;
}

/**
 * Crée une grille sans limite à partir d'un `Rng`. Le générateur passé est
 * forké en flux indépendants : le résultat ne dépend que de la graine et des
 * options, jamais de l'ordre dans lequel les morceaux sont demandés.
 */
export function genererGrille(rng: Rng, options: OptionsGeneration = {}): Grille {
  const echelle = options.echelleRelief ?? 40;
  const echelleContinents = options.echelleContinents ?? 220;
  const berceau = options.berceau ?? 28;
  const abondance = Math.min(4, Math.max(1, options.abondance ?? 1));

  const bruitContinents = new BruitSimplex2D(rng.fork("continents"));
  const bruitRelief = new BruitSimplex2D(rng.fork("relief"));
  const bruitHumidite = new BruitSimplex2D(rng.fork("humidite"));
  const rngMonde = rng.fork("gisements");
  // Le berceau : terre ferme à l'origine, et un rivage à une dizaine de tuiles
  // dans une direction tirée de la graine (eau à boire, poisson, argile).
  const angle = rng.fork("berceau").suivant() * Math.PI * 2;
  const rivage = { x: Math.cos(angle), y: Math.sin(angle) };
  // Une colonie nombreuse : des mares de plus, à l'opposé du rivage et de part et d'autre.
  const nombreMares = Math.round(abondance) - 1;
  const mares = Array.from({ length: nombreMares }, (_, k) => {
    const a = angle + (Math.PI * 2 * (k + 1)) / (nombreMares + 1);
    return { x: Math.cos(a) * DISTANCE_MARES, y: Math.sin(a) * DISTANCE_MARES };
  });
  const T = TAILLE_MORCEAU;
  // Les foyers des peuples rivaux : même berceau, rivage tourné vers le large (loin de l'origine).
  const foyers = (options.foyers ?? []).map((f) => {
    const a = Math.atan2(f.y, f.x);
    return { x: f.x, y: f.y, rivage: { x: Math.cos(a), y: Math.sin(a) } };
  });
  const maresFoyers = foyers.flatMap((f) =>
    Array.from({ length: nombreMares }, (_, k) => {
      const a = Math.atan2(f.rivage.y, f.rivage.x) + (Math.PI * 2 * (k + 1)) / (nombreMares + 1);
      return { x: f.x + Math.cos(a) * DISTANCE_MARES, y: f.y + Math.sin(a) * DISTANCE_MARES };
    }),
  );

  const graineGues = Math.floor(rng.fork("gues").suivant() * 2_147_483_647);

  return new Grille((cx, cy) => {
    // L'altitude ne dépend que de la position ; on la garde le temps du morceau, car les gués
    // regardent jusqu'à trois tuiles au-delà de ses bords.
    const cache = new Map<number, number>();
    const altitudeEn = (x: number, y: number): number => {
      const k = (x + 1_048_576) * 2_097_152 + (y + 1_048_576);
      const connue = cache.get(k);
      if (connue !== undefined) return connue;
      const continent = bruitContinents.fbm(x, y, 1 / echelleContinents, 3, 0.5, 2);
      const relief = bruitRelief.fbm(x, y, 1 / echelle, 5, 0.5, 2);
      const brute = continent * 0.55 + relief * 0.6 + 0.02;
      const d = Math.hypot(x, y) / berceau;
      const poids = Math.exp(-d * d);
      const cote = clamp((x * rivage.x + y * rivage.y - 5) / 8, 0, 1);
      const cible = 0.22 - 0.5 * cote;
      let altitude = clamp(brute + (cible - brute) * poids, -1, 1);
      for (const f of foyers) {
        const df = Math.hypot(x - f.x, y - f.y) / berceau;
        if (df > 3) continue;
        const pf = Math.exp(-df * df);
        const cf = clamp(((x - f.x) * f.rivage.x + (y - f.y) * f.rivage.y - 5) / 8, 0, 1);
        altitude = clamp(altitude + (0.22 - 0.5 * cf - altitude) * pf, -1, 1);
      }
      if (mares.some((m) => Math.hypot(x - m.x, y - m.y) < RAYON_MARE)) altitude = -0.05;
      if (maresFoyers.some((m) => Math.hypot(x - m.x, y - m.y) < RAYON_MARE)) altitude = -0.05;
      cache.set(k, altitude);
      return altitude;
    };
    const tuiles: Tuile[] = [];
    for (let j = 0; j < T; j++) {
      for (let i = 0; i < T; i++) {
        const x = cx * T + i;
        const y = cy * T + j;
        const altitude = altitudeEn(x, y);
        const humidite = clamp(bruitHumidite.fbm(x, y, 1 / (echelle * 0.7), 3, 0.55, 2), -1, 1);
        let biome = choisirBiome(altitude, humidite);
        if (biome === "eau_peu_profonde" && estGue(altitudeEn, graineGues, x, y)) biome = "gue";
        tuiles.push({ x, y, biome, altitude, humidite, gisement: null, batiment: null });
      }
    }
    // Gisements dans un second passage, avec un flux propre au morceau (reproductible).
    const rngGisements = rngMonde.fork(`morceau:${String(cx)}:${String(cy)}`);
    for (const t of tuiles)
      t.gisement = tirerGisement(
        rngGisements,
        t.biome,
        abondance > 1 &&
          (Math.hypot(t.x, t.y) <= berceau ||
            foyers.some((f) => Math.hypot(t.x - f.x, t.y - f.y) <= berceau))
          ? abondance
          : 1,
      );
    return tuiles;
  });
}

/** Rangs entre deux gués possibles, sur chaque axe. */
export const PAS_GUE = 12;
/** Largeur maximale d'un banc d'eau peu profonde qu'un gué traverse. */
export const LARGEUR_GUE_MAX = 3;

type AltitudeEn = (x: number, y: number) => number;

/** Le rang, dans une bande de douze, où un gué peut se poser : tiré de la graine et de la bande. */
function rangDeGue(bande: number, axe: number, graine: number): number {
  return ((Math.imul(bande, 2654435761) ^ Math.imul(axe + 1, 40503) ^ graine) >>> 0) % PAS_GUE;
}

/** Pas jusqu'à la rive dans une direction (1 : la voisine est terre), ou null si l'eau continue. */
function riveA(
  altitudeEn: AltitudeEn,
  x: number,
  y: number,
  dx: number,
  dy: number,
): number | null {
  for (let k = 1; k <= LARGEUR_GUE_MAX; k++) {
    const a = altitudeEn(x + dx * k, y + dy * k);
    if (a >= SEUILS.mer) return k;
    if (a < SEUILS.eauProfonde) return null;
  }
  return null;
}

/**
 * Un gué (M30) : sur un rang choisi (un sur douze par axe), un banc d'eau peu profonde de trois
 * tuiles au plus entre deux rives de terre. Toute la traversée y passe : une ligne droite,
 * rive à rive. Ailleurs, l'eau peu profonde ne se passe qu'en pirogue ou de port à port.
 */
export function estGue(altitudeEn: AltitudeEn, graine: number, x: number, y: number): boolean {
  for (const [dx, dy, axe] of [
    [1, 0, 0],
    [0, 1, 1],
  ] as const) {
    const rang = axe === 0 ? y : x;
    const bande = Math.floor(rang / PAS_GUE);
    if (rang - bande * PAS_GUE !== rangDeGue(bande, axe, graine)) continue;
    const avant = riveA(altitudeEn, x, y, -dx, -dy);
    const apres = riveA(altitudeEn, x, y, dx, dy);
    if (avant === null || apres === null || avant + apres - 1 > LARGEUR_GUE_MAX) continue;
    return true;
  }
  return false;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
