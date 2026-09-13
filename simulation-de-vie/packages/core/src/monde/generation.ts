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
import type { Tuile } from "./grille.js";
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

function tirerGisement(rng: Rng, biome: Biome, abondance = 1): Gisement | null {
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

  return new Grille((cx, cy) => {
    const tuiles: Tuile[] = [];
    for (let j = 0; j < T; j++) {
      for (let i = 0; i < T; i++) {
        const x = cx * T + i;
        const y = cy * T + j;
        const continent = bruitContinents.fbm(x, y, 1 / echelleContinents, 3, 0.5, 2);
        const relief = bruitRelief.fbm(x, y, 1 / echelle, 5, 0.5, 2);
        const brute = continent * 0.55 + relief * 0.6 + 0.02;
        const d = Math.hypot(x, y) / berceau;
        const poids = Math.exp(-d * d);
        const cote = clamp((x * rivage.x + y * rivage.y - 5) / 8, 0, 1);
        const cible = 0.22 - 0.5 * cote;
        let altitude = clamp(brute + (cible - brute) * poids, -1, 1);
        if (mares.some((m) => Math.hypot(x - m.x, y - m.y) < RAYON_MARE)) altitude = -0.05;
        const humidite = clamp(bruitHumidite.fbm(x, y, 1 / (echelle * 0.7), 3, 0.55, 2), -1, 1);
        tuiles.push({
          x,
          y,
          biome: choisirBiome(altitude, humidite),
          altitude,
          humidite,
          gisement: null,
          batiment: null,
        });
      }
    }
    // Gisements dans un second passage, avec un flux propre au morceau (reproductible).
    const rngGisements = rngMonde.fork(`morceau:${String(cx)}:${String(cy)}`);
    for (const t of tuiles)
      t.gisement = tirerGisement(
        rngGisements,
        t.biome,
        abondance > 1 && Math.hypot(t.x, t.y) <= berceau ? abondance : 1,
      );
    return tuiles;
  });
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
