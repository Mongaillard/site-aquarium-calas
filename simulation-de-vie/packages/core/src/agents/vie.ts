/**
 * Cycle de vie (sections 8.1 à 8.4) : grossesse, naissance, stades, mort
 * naturelle, héritage, deuil, adoption, apprentissage par observation.
 */
import { apprendre } from "../savoirs/lecons.js";
import { gagnerExperience } from "./competences.js";
import type { Competence } from "./competences.js";
import { phenotype, probabiliteMortNaturelle } from "./genetique.js";
import { ajouterHumeur } from "./corps.js";
import { NOURRITURE, placeLibre, transferer } from "./inventaire.js";
import { clamp } from "./besoins.js";
import { mettreAJourStade, relationAvec } from "./personnage.js";
import type { Personnage } from "./personnage.js";
import { personnaliteDepuisGenome } from "./identite.js";
import { batimentsAccessibles, membresFamille, sommeilChange } from "../monde.js";
import type { Monde } from "../monde.js";
import { rompre } from "../social/couple.js";
import { relationFamiliale } from "../social/relations.js";
import type { Ressource } from "../monde/ressources.js";

/** Âge minimal et maximal de la mère, en années. */
export const AGE_MATERNITE = { min: 16, max: 45 } as const;

/** Jours de jeu avant qu'une mère puisse concevoir à nouveau (deux ans). */
export const DELAI_POST_PARTUM_JOURS = 240;

/** Âge (années) à partir duquel un enfant cueille des baies lui-même. */
export const AGE_CUEILLETTE = 6;

/**
 * Enfants par bras (adolescents et adultes) au-delà desquels une famille n'a
 * plus de quoi nourrir un nouveau-né : on n'y conçoit plus.
 */
export const ENFANTS_PAR_BRAS_MAX = 2;

/** Un grand enfant : encore enfant, mais assez grand pour cueillir. */
export function grandEnfant(monde: Monde, p: Personnage): boolean {
  return (
    p.corps.stade === "enfant" &&
    p.corps.ageJours / monde.config.vie.joursParAnnee >= AGE_CUEILLETTE
  );
}

/** La famille a-t-elle encore les bras pour nourrir un enfant de plus ? */
export function familleSaturee(monde: Monde, p: Personnage): boolean {
  const membres = membresFamille(monde, p);
  const enfants = membres.filter((m) => m.corps.stade === "enfant").length;
  const bras = membres.length - enfants;
  return enfants >= ENFANTS_PAR_BRAS_MAX * Math.max(1, bras);
}

/** Une femme peut-elle concevoir ? (adulte, âge, pas enceinte, délai post-partum) */
export function peutConcevoir(monde: Monde, femme: Personnage): boolean {
  if (
    femme.identite.sexe !== "F" ||
    femme.corps.stade !== "adulte" ||
    femme.corps.enceinte !== null
  )
    return false;
  const age = femme.corps.ageJours / monde.config.vie.joursParAnnee;
  if (age < AGE_MATERNITE.min || age > AGE_MATERNITE.max) return false;
  if (familleSaturee(monde, femme)) return false;
  const dernier = femme.corps.dernierAccouchement;
  return (
    dernier === null ||
    monde.horloge.tick - dernier >= DELAI_POST_PARTUM_JOURS * monde.horloge.ticksParJour
  );
}

export function ticksGestation(monde: Monde): number {
  return monde.config.vie.gestationJours * monde.horloge.ticksParJour;
}

/** Fraction de la grossesse écoulée (0..1), ou 0 si pas enceinte. */
export function avancementGrossesse(monde: Monde, p: Personnage): number {
  if (p.corps.enceinte === null) return 0;
  return Math.min(1, (monde.horloge.tick - p.corps.enceinte.depuisTick) / ticksGestation(monde));
}

/**
 * Passage quotidien (à l'aube) : stade, grossesse (terme ou fausse couche),
 * mort naturelle. Renvoie les événements à journaliser.
 */
export function tickVieQuotidien(monde: Monde, p: Personnage): void {
  const { joursParAnnee, ageAdulte, ageAncien } = monde.config.vie;
  const ancien = mettreAJourStade(p, joursParAnnee, ageAdulte, ageAncien);
  if (ancien !== null) sommeilChange();
  if (ancien !== null) {
    if (p.corps.stade === "adolescent") {
      personnaliteAdolescente(monde, p);
      // Ce que les parents savent, l'adolescent le sait aussi.
      for (const id of p.identite.parents ?? []) {
        const parent = monde.personnages.find((x) => x.id === id);
        if (parent === undefined) continue;
        for (const [s, v] of parent.savoirs)
          if (v.force >= 1) apprendre(p, s, 1, v.origine, monde.horloge.tick);
      }
    }
    monde.emettre(
      "stade",
      p,
      { ancien, nouveau: p.corps.stade, ageAnnees: Math.floor(p.corps.ageJours / joursParAnnee) },
      5,
    );
  }

  if (p.corps.enceinte !== null) {
    const pere = monde.personnages.find((x) => x.id === p.corps.enceinte?.pere);
    if (avancementGrossesse(monde, p) >= 1 && pere !== undefined) {
      monde.naitre(p, pere);
      p.corps.enceinte = null;
      p.corps.dernierAccouchement = monde.horloge.tick;
      p.besoins.faim = clamp(p.besoins.faim - 20);
      p.besoins.sommeil = clamp(p.besoins.sommeil - 20);
    } else if (p.corps.sante < 30 && p.rng.chance(0.2)) {
      p.corps.enceinte = null;
      p.besoins.moral = clamp(p.besoins.moral - 25);
      monde.emettre("fausse_couche", p, {}, 8);
    }
  }

  const ageAnnees = p.corps.ageJours / joursParAnnee;
  if (p.rng.chance(probabiliteMortNaturelle(ageAnnees, p.identite.genome, ageAncien))) {
    monde.tuer(p, "vieillesse");
    return;
  }
  // Les deux premières années sont fragiles : mort au berceau, rare mais réelle.
  if (
    ageAnnees < 2 &&
    p.rng.chance(0.0002 * (1.4 - 0.8 * phenotype(p.identite.genome, "immunite")))
  ) {
    monde.tuer(p, "mort au berceau");
  }
}

/**
 * À l'adolescence, la personnalité se fixe : phénotype × 0,6 + influence
 * de l'entourage × 0,4 (les trois personnes les plus présentes en mémoire).
 */
export function personnaliteAdolescente(monde: Monde, p: Personnage): void {
  const frequences = new Map<string, number>();
  for (const s of p.memoire.tous())
    for (const id of s.sujets) frequences.set(id, (frequences.get(id) ?? 0) + 1);
  const entourage = [...frequences.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([id]) => monde.personnages.find((x) => x.id === id))
    .filter((x): x is Personnage => x !== undefined);
  const genetique = personnaliteDepuisGenome(p.identite.genome, p.rng.fork("adolescence"));
  const cible = p.identite.personnalite;
  for (const cle of Object.keys(genetique) as (keyof typeof genetique)[]) {
    const env =
      entourage.length > 0
        ? entourage.reduce((t, x) => t + x.identite.personnalite[cle], 0) / entourage.length
        : genetique[cle];
    cible[cle] = genetique[cle] * 0.6 + env * 0.4;
  }
}

/**
 * Héritage (section 8.4) : les biens vont au partenaire, sinon à l'enfant le
 * plus âgé, sinon à un membre de la famille ; les bâtiments changent de
 * propriétaire de la même façon.
 */
export function heriter(monde: Monde, defunt: Personnage): Personnage | null {
  const heritier = choisirHeritier(monde, defunt);
  if (heritier === null) return null;
  const inv = defunt.corps.inventaire;
  let transmis = 0;
  const enfant = heritier.corps.stade === "enfant";
  // La nourriture d'abord ; un enfant n'hérite que de quoi manger, le reste va au stock.
  const ordre = (Object.entries(inv.ressources) as [Ressource, number][]).sort(
    ([a], [b]) => Number(NOURRITURE[b] !== undefined) - Number(NOURRITURE[a] !== undefined),
  );
  for (const [r, n] of ordre) {
    if (enfant && NOURRITURE[r] === undefined) continue;
    transmis += transferer(inv, heritier.corps.inventaire, r, n);
  }
  const stock = batimentsAccessibles(monde, heritier).find(
    (b) => b.etat === "termine" && b.stock !== null,
  );
  if (stock?.stock) {
    for (const [r, n] of Object.entries(inv.ressources) as [Ressource, number][])
      transmis += transferer(inv, stock.stock, r, n);
  }
  for (const o of inv.objets.splice(0)) {
    if (enfant || placeLibre(heritier.corps.inventaire) <= 0) continue;
    // On n'hérite pas d'un outil qu'on a déjà : il reste avec le défunt.
    if (heritier.corps.inventaire.objets.some((x) => x.type === o.type)) continue;
    heritier.corps.inventaire.objets.push(o);
    if (o.type === "traineau") heritier.corps.inventaire.capacite += 6;
  }
  let batiments = 0;
  for (const b of monde.batiments.values()) {
    if (b.proprietaire === defunt.id) {
      b.proprietaire = heritier.id;
      batiments++;
    }
  }
  monde.emettre("heritage", heritier, { defunt: defunt.id, ressources: transmis, batiments }, 5);
  return heritier;
}

function choisirHeritier(monde: Monde, defunt: Personnage): Personnage | null {
  const vivant = (id: string): Personnage | null => {
    const p = monde.personnages.find((x) => x.id === id);
    return p?.vivant ? p : null;
  };
  for (const r of defunt.relations.values())
    if (r.lien === "partenaire") {
      const p = vivant(r.cible);
      if (p) return p;
    }
  const enfants = monde.personnages
    .filter((x) => x.vivant && (x.identite.parents?.includes(defunt.id) ?? false))
    .sort((a, b) => b.corps.ageJours - a.corps.ageJours);
  const aine = enfants[0];
  if (aine) return aine;
  const famille = monde.personnages
    .filter(
      (x) => x.vivant && x.id !== defunt.id && x.identite.nomFamille === defunt.identite.nomFamille,
    )
    .sort((a, b) => b.corps.ageJours - a.corps.ageJours);
  return famille[0] ?? null;
}

/** Deuil (section 8.4) : les proches perdent du moral et se souviennent. */
export function deuil(monde: Monde, defunt: Personnage, cause: string): void {
  const tick = monde.horloge.tick;
  for (const p of monde.personnages) {
    if (!p.vivant || p.id === defunt.id) continue;
    const lien = p.relations.get(defunt.id)?.lien ?? "inconnu";
    const proche =
      lien === "partenaire" || lien === "parent" || lien === "enfant" || lien === "fratrie";
    const ami = lien === "ami";
    if (!proche && !ami) continue;
    p.besoins.moral = clamp(p.besoins.moral - (proche ? 25 : 10));
    p.besoins.social = clamp(p.besoins.social - (proche ? 20 : 5));
    ajouterHumeur(
      p,
      `deuil:${defunt.id}`,
      proche ? -12 : -4,
      60 * monde.horloge.ticksParJour,
      tick,
    );
    const f = defunt.identite.sexe === "F";
    p.memoire.ajouter(
      tick,
      "observation",
      proche
        ? `${defunt.identite.prenom}, ${f ? "ma" : "mon"} ${nomDuLien(lien, f)}, est mort${f ? "e" : ""} de ${cause}. Rien ne sera plus pareil.`
        : `${defunt.identite.prenom}, ${f ? "une amie" : "un ami"}, est mort${f ? "e" : ""} de ${cause}.`,
      proche ? 10 : 6,
      [defunt.id],
    );
  }
  const partenaire = monde.personnages.find(
    (x) => x.relations.get(defunt.id)?.lien === "partenaire",
  );
  if (partenaire) rompre(defunt, partenaire);
}

function nomDuLien(lien: string, feminin: boolean): string {
  switch (lien) {
    case "partenaire":
      return feminin ? "compagne" : "compagnon";
    case "parent":
      return feminin ? "mère" : "père";
    case "enfant":
      return feminin ? "fille" : "fils";
    case "fratrie":
      return feminin ? "sœur" : "frère";
    default:
      return "proche";
  }
}

/**
 * Adoption (section 8.3) : un enfant ou adolescent dont les deux parents sont
 * morts est pris en charge par l'adulte qui l'aime le plus.
 */
export function adopter(monde: Monde, orphelin: Personnage): Personnage | null {
  const parents = orphelin.identite.parents;
  if (parents === null) return null;
  if (parents.some((id) => monde.personnages.find((x) => x.id === id)?.vivant)) return null;
  if (orphelin.corps.stade !== "enfant" && orphelin.corps.stade !== "adolescent") return null;
  let meilleur: Personnage | null = null;
  let meilleurScore = -Infinity;
  for (const a of monde.personnages) {
    if (!a.vivant || a.corps.stade !== "adulte" || a.id === orphelin.id) continue;
    const score =
      relationAvec(a, orphelin.id).affinite +
      relationAvec(orphelin, a.id).affinite +
      a.identite.personnalite.agreabilite * 20;
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = a;
    }
  }
  if (meilleur === null) return null;
  meilleur.relations.set(orphelin.id, relationFamiliale(orphelin.id, "enfant"));
  orphelin.relations.set(meilleur.id, relationFamiliale(meilleur.id, "parent"));
  monde.emettre("adoption", meilleur, { enfant: orphelin.id, prenom: orphelin.identite.prenom }, 7);
  return meilleur;
}

/** Compétence apprise en observant un acte (enfants et adolescents). */
export function competenceObservee(typeEvenement: string): Competence | null {
  switch (typeEvenement) {
    case "recolte":
      return "recolte";
    case "fabrication":
      return "artisanat";
    case "livraison":
    case "batiment_termine":
    case "batiment_repare":
      return "construction";
    default:
      return null;
  }
}

export function apprendreParObservation(p: Personnage, typeEvenement: string): void {
  if (p.corps.stade !== "enfant" && p.corps.stade !== "adolescent") return;
  const c = competenceObservee(typeEvenement);
  if (c !== null) gagnerExperience(p.experience, c, 1);
}
