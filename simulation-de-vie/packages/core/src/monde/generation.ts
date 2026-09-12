/**
 * Génération procédurale du monde (section 4.1) : deux champs de bruit
 * (altitude, humidité) seedés séparément, un adoucissement insulaire pour
 * garantir des côtes, puis attribution des biomes et des gisements.
 */
import type { Rng } from "../rng.js";
import type { Biome } from "./biomes.js";
import { BruitSimplex2D } from "./bruit.js";
import { Grille } from "./grille.js";
import type { Tuile } from "./grille.js";
import { GISEMENTS_PAR_BIOME } from "./ressources.js";
import type { Gisement } from "./ressources.js";

export interface OptionsGeneration {
  readonly largeur: number;
  readonly hauteur: number;
  /** Échelle du relief : plus grand = continents plus larges. */
  readonly echelleRelief?: number;
  /** Intensité de l'adoucissement insulaire (0 = aucun, 1 = île franche). */
  readonly insularite?: number;
}

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

function tirerGisement(rng: Rng, biome: Biome): Gisement | null {
  for (const profil of GISEMENTS_PAR_BIOME[biome]) {
    if (rng.chance(profil.probabilite)) {
      const max = rng.entier(profil.min, profil.max);
      return {
        type: profil.type,
        quantite: max,
        max,
        tauxRegen: profil.tauxRegen,
        outilRequis: profil.outilRequis,
      };
    }
  }
  return null;
}

/**
 * Génère une grille à partir d'un `Rng`. Le générateur passé est forké en
 * flux indépendants : le résultat ne dépend que de la graine et des options.
 */
export function genererGrille(rng: Rng, options: OptionsGeneration): Grille {
  const { largeur, hauteur } = options;
  const echelle = options.echelleRelief ?? Math.max(largeur, hauteur) / 3;
  const insularite = options.insularite ?? 0.55;

  const bruitRelief = new BruitSimplex2D(rng.fork("relief"));
  const bruitHumidite = new BruitSimplex2D(rng.fork("humidite"));
  const rngGisements = rng.fork("gisements");

  const cx = (largeur - 1) / 2;
  const cy = (hauteur - 1) / 2;
  const tuiles: Tuile[] = [];

  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const relief = bruitRelief.fbm(x, y, 1 / echelle, 5, 0.5, 2);
      // Distance normalisée au centre (0 au centre, ~1 sur les bords).
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) / Math.SQRT2);
      // Relève le centre et abaisse les bords pour obtenir des côtes.
      const altitude = clamp(relief * 0.8 + 0.25 - insularite * d * d * 1.4, -1, 1);
      const humidite = clamp(bruitHumidite.fbm(x, y, 1 / (echelle * 0.7), 3, 0.55, 2), -1, 1);
      tuiles.push({
        x,
        y,
        biome: choisirBiome(altitude, humidite),
        altitude,
        humidite,
        gisement: null,
      });
    }
  }

  // Gisements dans un second passage, dans l'ordre des tuiles (reproductible).
  for (const t of tuiles) {
    t.gisement = tirerGisement(rngGisements, t.biome);
  }

  return new Grille(largeur, hauteur, tuiles);
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
