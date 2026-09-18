/** Fiche d'identité persistante (section 5.1). */
import type { Rng } from "../rng.js";
import type { Genome } from "./genetique.js";
import { clamp01, genomeAleatoire, phenotype } from "./genetique.js";
import { NOMS_FAMILLE, PRENOMS_F, PRENOMS_M, TRAITS_POSSIBLES, VALEURS_POSSIBLES } from "./noms.js";
import type { Valeur } from "./noms.js";

export type Sexe = "F" | "M";

export interface Personnalite {
  ouverture: number;
  conscience: number;
  extraversion: number;
  agreabilite: number;
  nevrosisme: number;
}

export interface Apparence {
  taille: number; // en cm
  teint: string;
  cheveux: string;
  yeux: string;
}

export interface Identite {
  readonly id: string;
  readonly prenom: string;
  readonly nomFamille: string;
  readonly sexe: Sexe;
  readonly naissance: number; // tick (négatif pour la population initiale)
  readonly parents: readonly [string, string] | null;
  readonly apparence: Apparence;
  readonly personnalite: Personnalite;
  readonly valeurs: readonly Valeur[];
  traits: string[];
  biographie: string;
  motto: string;
  readonly genome: Genome;
}

const TEINTS = ["clair", "hâlé", "mat", "foncé"] as const;
const CHEVEUX = ["noirs", "bruns", "châtains", "blonds", "roux", "gris"] as const;
const YEUX = ["bruns", "noisette", "verts", "gris", "bleus"] as const;

export interface OptionsIdentite {
  readonly id: string;
  readonly naissance: number;
  readonly sexe?: Sexe;
  readonly nomFamille?: string;
  readonly parents?: readonly [string, string];
  readonly genome?: Genome;
  readonly prenomsInterdits?: ReadonlySet<string>;
}

/** Personnalité = phénotype génétique × 0,6 + bruit d'environnement × 0,4. */
export function personnaliteDepuisGenome(genome: Genome, rng: Rng): Personnalite {
  const mixer = (
    gene: "ouverture" | "conscience" | "extraversion" | "agreabilite" | "nevrosisme",
  ) => clamp01(phenotype(genome, gene) * 0.6 + clamp01(rng.gaussien(0.5, 0.2)) * 0.4);
  return {
    ouverture: mixer("ouverture"),
    conscience: mixer("conscience"),
    extraversion: mixer("extraversion"),
    agreabilite: mixer("agreabilite"),
    nevrosisme: mixer("nevrosisme"),
  };
}

export function genererIdentite(rng: Rng, options: OptionsIdentite): Identite {
  const sexe: Sexe = options.sexe ?? (rng.chance(0.5) ? "F" : "M");
  const genome = options.genome ?? genomeAleatoire(rng);
  const liste = sexe === "F" ? PRENOMS_F : PRENOMS_M;
  const candidats = liste.filter((p) => !options.prenomsInterdits?.has(p));
  const prenom = rng.choisir(candidats.length > 0 ? candidats : liste);
  const nomFamille = options.nomFamille ?? rng.choisir(NOMS_FAMILLE);
  const personnalite = personnaliteDepuisGenome(genome, rng);

  const teintIndex = Math.min(
    TEINTS.length - 1,
    Math.floor(phenotype(genome, "teint") * TEINTS.length),
  );
  const apparence: Apparence = {
    taille: Math.round(150 + phenotype(genome, "taille") * 40 + (sexe === "M" ? 8 : 0)),
    teint: TEINTS[teintIndex] ?? "clair",
    cheveux: rng.choisir(CHEVEUX),
    yeux: rng.choisir(YEUX),
  };

  const valeurs = rng.melanger(VALEURS_POSSIBLES).slice(0, rng.entier(2, 3));
  const traits = rng.melanger(TRAITS_POSSIBLES).slice(0, rng.entier(2, 4));

  const identite: Identite = {
    id: options.id,
    prenom,
    nomFamille,
    sexe,
    naissance: options.naissance,
    parents: options.parents ?? null,
    apparence,
    personnalite,
    valeurs,
    traits,
    biographie: "",
    motto: "",
    genome,
  };
  identite.biographie = biographieParDefaut(identite);
  identite.motto = mottoParDefaut(identite);
  return identite;
}

/** Choisit la forme « masculin|féminin » selon le sexe. */
function accorder(mot: string, sexe: Sexe): string {
  const [m, f] = mot.split("|");
  return (sexe === "F" ? (f ?? m) : m) ?? mot;
}

function qualificatif(
  valeur: number,
  sexe: Sexe,
  bas: string,
  moyen: string,
  haut: string,
): string {
  return accorder(valeur < 0.35 ? bas : valeur > 0.65 ? haut : moyen, sexe);
}

/** Biographie modèle (le cerveau LLM pourra la réécrire en M5). */
export function biographieParDefaut(identite: Identite): string {
  const p = identite.personnalite;
  const s = identite.sexe;
  const pronom = s === "F" ? "Elle" : "Il";
  const caractere = [
    qualificatif(
      p.ouverture,
      s,
      "peu curieux|peu curieuse",
      "curieux|curieuse",
      "avide de découvertes",
    ),
    qualificatif(
      p.conscience,
      s,
      "insouciant|insouciante",
      "appliqué|appliquée",
      "méticuleux|méticuleuse",
    ),
    qualificatif(p.extraversion, s, "réservé|réservée", "sociable", "très sociable"),
    qualificatif(
      p.agreabilite,
      s,
      "méfiant|méfiante",
      "conciliant|conciliante",
      "généreux|généreuse",
    ),
    qualificatif(p.nevrosisme, s, "imperturbable", "sensible", "anxieux|anxieuse"),
  ];
  return (
    `${identite.prenom} ${identite.nomFamille} est ${caractere.join(", ")}. ` +
    `${pronom} tient par-dessus tout à : ${identite.valeurs.join(", ")}. ` +
    `On dit ${s === "F" ? "d'elle" : "de lui"} qu'${pronom.toLowerCase()} est ${identite.traits.join(" et ")}.`
  );
}

export function mottoParDefaut(identite: Identite): string {
  const mottos: Record<Valeur, string> = {
    famille: "Les miens d'abord.",
    liberte: "Personne ne me dira où aller.",
    securite: "Un toit, du feu, et l'on verra demain.",
    tradition: "On fait comme on a toujours fait.",
    curiosite: "Qu'y a-t-il derrière la colline ?",
    pouvoir: "Celui qui décide, c'est celui qui a le plus.",
    harmonie: "Une dispute évitée vaut dix victoires.",
    richesse: "Un grenier plein ne ment jamais.",
    honneur: "Ma parole vaut plus que ma vie.",
    plaisir: "Autant en profiter tant qu'on est là.",
  };
  const valeur = identite.valeurs[0] ?? "securite";
  return mottos[valeur];
}

export function nomComplet(identite: Identite): string {
  return `${identite.prenom} ${identite.nomFamille}`;
}
