/**
 * Combat déterministe (jalon « la nuit menace ») : une meute contre une
 * personne et ceux qui se tiennent à ses côtés. Six rounds au plus, des
 * chances de toucher chiffrées, les armes et le cuir qui comptent, la meute
 * qui renonce quand elle saigne, la proie qui se dérobe sous 40 de santé.
 * Un seul événement résume le combat.
 */
import { Grille } from "../monde/grille.js";
import { bonusPorte } from "../savoirs/grammaire.js";
import type { EtatTrouvailles } from "../savoirs/grammaire.js";
import type { Monde } from "../monde.js";
import type { Troupeau } from "../monde/faune.js";
import { faireFuir } from "../monde/faune.js";
import { possede } from "./inventaire.js";
import { niveau } from "./competences.js";
import { blesser } from "./corps.js";
import type { Gravite, LieuBlessure } from "./corps.js";
import type { Personnage } from "./personnage.js";

export const ROUNDS_MAX = 6;
/** Loups engagés à la fois : deux sur une personne seule, trois face à un groupe. */
export const LOUPS_ENGAGES_MAX = 2;
/** Sous cette santé, la proie se dérobe (vers le feu, l'abri, les autres). */
export const SANTE_FUITE = 40;

export type IssueCombat = "repousses" | "fuite" | "mort";

export interface ResultatCombat {
  readonly issue: IssueCombat;
  readonly rounds: number;
  readonly defenseurs: number;
  readonly loupsTues: number;
  readonly loupsBlesses: number;
  readonly blesses: number;
  readonly victime: Personnage | null;
}

/** Ceux qui se battent : la cible, et les adultes éveillés à moins de deux tuiles. */
export function defenseursAutour(monde: Monde, cible: Personnage): Personnage[] {
  const resultat = [cible];
  for (const p of monde.personnages) {
    if (!p.vivant || p.id === cible.id || p.corps.endormi || p.corps.stade === "enfant") continue;
    if (Grille.distance(p.corps.position, cible.corps.position) <= 2) resultat.push(p);
  }
  return resultat;
}

/**
 * Ce qu'une arme ajoute à la chance de toucher : lance, arc, hache (le cuivre
 * mord mieux). Une arme née de la grammaire (M38) compte pour son gain, et c'est
 * la meilleure des deux qui sert.
 */
export function bonusArme(p: Personnage, trouvailles?: EtatTrouvailles): number {
  const inv = p.corps.inventaire;
  const grammaire = trouvailles === undefined ? 0 : bonusPorte(trouvailles, inv, "combat") - 1;
  let catalogue = 0;
  if (possede(inv, "lance")) catalogue = 0.2;
  else if (possede(inv, "hache_cuivre")) catalogue = 0.15;
  else if (possede(inv, "arc")) catalogue = 0.12;
  else if (possede(inv, "hache_pierre")) catalogue = 0.1;
  return Math.max(catalogue, grammaire);
}

/**
 * Résout le combat sur place et applique ses effets (blessures, morts, loups
 * tués, fuite de la meute). Ne journalise pas : l'appelant émet l'événement.
 */
export function combattre(monde: Monde, meute: Troupeau, cible: Personnage): ResultatCombat {
  const rng = meute.rng;
  const defenseurs = defenseursAutour(monde, cible);
  let loupsTues = 0;
  let loupsBlesses = 0;
  let rounds = 0;
  let issue: IssueCombat = "repousses";
  let victime: Personnage | null = null;
  const blesses = new Set<string>();

  for (let round = 1; round <= ROUNDS_MAX; round++) {
    rounds = round;
    // Les loups mordent : au plus trois à la fois, moins sûrs face à plusieurs défenseurs.
    const vivants = defenseurs.filter((d) => d.vivant);
    if (vivants.length === 0) break;
    const engages = Math.min(LOUPS_ENGAGES_MAX + (vivants.length >= 3 ? 1 : 0), meute.taille);
    for (let i = 0; i < engages; i++) {
      const chance = Math.max(0.1, 0.3 - 0.05 * (vivants.length - 1));
      if (!rng.chance(chance)) continue;
      const proie =
        rng.chance(0.7) || vivants.length === 1
          ? cible
          : (vivants[rng.entier(0, vivants.length - 1)] ?? cible);
      if (!proie.vivant) continue;
      const r = rng.suivant();
      let gravite: Gravite = r < 0.6 ? 1 : r < 0.97 ? 2 : 3;
      if (possede(proie.corps.inventaire, "vetement_cuir") && gravite > 1)
        gravite = (gravite - 1) as Gravite;
      const lieu: LieuBlessure = rng.chance(0.5) ? "jambe" : rng.chance(0.5) ? "bras" : "flanc";
      blesser(monde, proie, "morsure", gravite, lieu, "sous les crocs des loups");
      blesses.add(proie.id);
      if (proie.corps.sante <= 0) {
        monde.tuer(proie, "loups");
        victime = proie;
      }
    }
    if (!cible.vivant) {
      issue = "mort";
      break;
    }
    // Les défenseurs frappent.
    for (const d of defenseurs) {
      if (!d.vivant || meute.taille <= 0) continue;
      const chance = 0.25 + bonusArme(d, monde.trouvailles) + 0.03 * niveau(d.experience.chasse);
      if (!rng.chance(chance)) continue;
      if (rng.chance(0.4)) {
        meute.taille -= 1;
        loupsTues += 1;
      } else {
        loupsBlesses += 1;
      }
    }
    if (meute.taille <= 0 || loupsTues >= 2 || loupsBlesses >= 3) {
      issue = "repousses";
      break;
    }
    if (cible.corps.sante < SANTE_FUITE) {
      issue = "fuite";
      break;
    }
    // Au bout de six rounds, la meute renonce ; une proie mordue se dérobe vers le feu.
    if (round === ROUNDS_MAX) issue = blesses.has(cible.id) ? "fuite" : "repousses";
  }

  if (meute.taille > 0) {
    faireFuir(meute, cible.corps.position, 0.3);
    // Une meute qui a tué mange ; une meute repoussée reste affamée.
    meute.faim = victime !== null ? -5 : Math.max(meute.faim, 0);
    meute.proieHumaine = null;
    meute.enMenace = false;
  }
  return {
    issue,
    rounds,
    defenseurs: defenseurs.length,
    loupsTues,
    loupsBlesses,
    blesses: blesses.size,
    victime,
  };
}
