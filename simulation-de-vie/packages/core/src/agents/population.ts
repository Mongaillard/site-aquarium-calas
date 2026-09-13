/** Génération de la population initiale (section 5.1, « Génération initiale »). */
import type { SimConfig } from "../config.js";
import { INFO_BIOME } from "../monde/biomes.js";
import type { Grille, Position } from "../monde/grille.js";
import type { Rng } from "../rng.js";
import { NOMS_FAMILLE } from "./noms.js";
import { creerPersonnage } from "./personnage.js";
import type { Personnage } from "./personnage.js";

/** Tuile constructible la plus proche du centre (spirale carrée). */
export function trouverPointDeDepart(grille: Grille, origine: Position = { x: 0, y: 0 }): Position {
  const cx = origine.x;
  const cy = origine.y;
  const rayonMax = 96;
  for (let r = 0; r < rayonMax; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const t = grille.tuileOuNull(cx + dx, cy + dy);
        if (t && INFO_BIOME[t.biome].constructible && scoreVoisinage(grille, t.x, t.y) >= 6) {
          return { x: t.x, y: t.y };
        }
      }
    }
  }
  throw new Error("Aucune tuile constructible dans la grille");
}

function scoreVoisinage(grille: Grille, x: number, y: number): number {
  let n = 0;
  for (const v of grille.voisins(x, y)) if (INFO_BIOME[v.biome].praticable) n++;
  return n;
}

/** Tuiles praticables à distance ≤ rayon du centre, dans un ordre stable. */
function tuilesAutour(grille: Grille, centre: Position, rayon: number): Position[] {
  const resultat: Position[] = [];
  for (let dy = -rayon; dy <= rayon; dy++) {
    for (let dx = -rayon; dx <= rayon; dx++) {
      const t = grille.tuileOuNull(centre.x + dx, centre.y + dy);
      if (t && INFO_BIOME[t.biome].praticable && INFO_BIOME[t.biome].constructible) {
        resultat.push({ x: t.x, y: t.y });
      }
    }
  }
  return resultat;
}

export function genererPopulation(rngMonde: Rng, config: SimConfig, grille: Grille): Personnage[] {
  const rng = rngMonde.fork("population");
  const n = config.population.initiale;
  const nbFamilles = Math.max(1, Math.min(config.population.familles, n));
  const familles = rng.melanger(NOMS_FAMILLE).slice(0, nbFamilles);
  const centre = trouverPointDeDepart(grille);
  const emplacements = rng.melanger(tuilesAutour(grille, centre, 4));
  const prenomsUtilises = new Set<string>();
  const personnages: Personnage[] = [];

  for (let i = 0; i < n; i++) {
    const id = `p-${String(i + 1).padStart(4, "0")}`;
    const position = emplacements[i % Math.max(1, emplacements.length)] ?? centre;
    const ageAnnees = rng.entier(18, 35);
    const ageJours =
      ageAnnees * config.vie.joursParAnnee + rng.entier(0, config.vie.joursParAnnee - 1);
    const personnage = creerPersonnage(rngMonde, {
      id,
      naissance: -ageJours * (1440 / config.temps.minutesParTick),
      sexe: i % 2 === 0 ? "F" : "M",
      nomFamille: familles[i % nbFamilles] ?? "Sansnom",
      prenomsInterdits: prenomsUtilises,
      position,
      ageJours,
      joursParAnnee: config.vie.joursParAnnee,
      ageAdulte: config.vie.ageAdulte,
      ageAncien: config.vie.ageAncien,
      ticksParJour: 1440 / config.temps.minutesParTick,
      memoire: {
        maxSouvenirs: config.memoire.maxSouvenirs,
        demiVieRecenceJours: config.memoire.demiVieRecenceJours,
      },
    });
    prenomsUtilises.add(personnage.identite.prenom);
    personnages.push(personnage);
  }
  return personnages;
}
