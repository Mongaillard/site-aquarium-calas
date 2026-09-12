/** Échanges, demandes et vol (section 9.2). */
import { niveau } from "../agents/competences.js";
import { NOURRITURE, quantite } from "../agents/inventaire.js";
import { relationAvec } from "../agents/personnage.js";
import type { Personnage } from "../agents/personnage.js";
import type { Batiment } from "../monde/batiments.js";
import { Grille } from "../monde/grille.js";
import type { Monde } from "../monde.js";
import type { Ressource } from "../monde/ressources.js";
import { ajusterRelation, borner } from "./relations.js";

/** Probabilité que `cible` accède à la demande de `demandeur` (exposée pour les tests). */
export function probabiliteAccord(
  demandeur: Personnage,
  cible: Personnage,
  ressource: Ressource,
  n: number,
): number {
  const possede = quantite(cible.corps.inventaire, ressource);
  const estNourriture = NOURRITURE[ressource] !== undefined;
  const rel = relationAvec(cible, demandeur.id);
  const reserve = estNourriture && rel.lien !== "enfant" ? 1 : 0;
  if (possede - reserve < n) return 0;
  const famille = cible.identite.nomFamille === demandeur.identite.nomFamille;
  let p =
    0.25 +
    cible.identite.personnalite.agreabilite * 0.4 +
    rel.affinite / 200 +
    (famille ? 0.3 : 0) +
    niveau(demandeur.experience.persuasion) * 0.05 +
    demandeur.reputation / 400;
  if (estNourriture && cible.besoins.faim < 40) p -= 0.4;
  if (rel.dette < 0) p += 0.2; // la cible me doit quelque chose
  if (rel.lien === "enfant") p += 0.6; // un parent ne laisse pas son enfant avoir faim
  return borner(p, 0, 0.95);
}

export function accepteDemande(
  demandeur: Personnage,
  cible: Personnage,
  ressource: Ressource,
  n: number,
): boolean {
  return cible.rng.chance(probabiliteAccord(demandeur, cible, ressource, n));
}

/** Effets sociaux d'un don : la cible est reconnaissante et redevable. */
export function effetsDon(donneur: Personnage, cible: Personnage, n: number, tick: number): void {
  ajusterRelation(
    relationAvec(cible, donneur.id),
    cible.identite.personnalite,
    donneur.identite.personnalite,
    { affinite: 6 + n, confiance: 4, dette: -n },
    tick,
  );
  ajusterRelation(
    relationAvec(donneur, cible.id),
    donneur.identite.personnalite,
    cible.identite.personnalite,
    { affinite: 2, dette: n },
    tick,
  );
}

export function effetsRefus(demandeur: Personnage, cible: Personnage, tick: number): void {
  ajusterRelation(
    relationAvec(demandeur, cible.id),
    demandeur.identite.personnalite,
    cible.identite.personnalite,
    { affinite: -3, confiance: -2 },
    tick,
  );
}

/**
 * Effets d'un vol : les témoins (vivants, à portée de vue) perdent affinité et
 * confiance envers le voleur, et sa réputation baisse d'autant.
 */
export function effetsVol(
  monde: Monde,
  voleur: Personnage,
  batiment: Batiment,
  rayon: number,
): string[] {
  const temoins: string[] = [];
  for (const t of monde.personnages) {
    if (!t.vivant || t.id === voleur.id || t.corps.endormi) continue;
    if (Grille.distance(t.corps.position, batiment.position) > rayon) continue;
    const lese = t.identite.nomFamille === batiment.famille || t.id === batiment.proprietaire;
    ajusterRelation(
      relationAvec(t, voleur.id),
      t.identite.personnalite,
      voleur.identite.personnalite,
      { affinite: lese ? -35 : -20, confiance: lese ? -40 : -25 },
      monde.horloge.tick,
    );
    voleur.reputation = borner(voleur.reputation - (lese ? 15 : 8), -100, 100);
    temoins.push(t.id);
  }
  return temoins;
}
