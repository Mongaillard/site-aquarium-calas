/**
 * Savoirs (phase « Savoirs ») : les leçons tirées des décès et les inventions.
 * Un savoir appartient à une personne, se transmet par le dialogue et aux
 * enfants, et change la façon de décider. Le catalogue est fermé : le moteur
 * sait appliquer chaque savoir ; ce sont les combinaisons qui sont ouvertes.
 */
import type { NomRecette } from "../monde/recettes.js";

export interface FicheLecon {
  readonly titre: string;
  /** La morale, telle qu'on se la répète. */
  readonly morale: string;
}

export const LECONS = {
  provisions_hiver: {
    titre: "Des provisions avant l'hiver",
    morale: "L'hiver ne nourrit pas : il faut des provisions avant les premières neiges.",
  },
  rentrer_quand_on_gele: {
    titre: "Rentrer quand on gèle",
    morale: "Quand on gèle, on rentre d'abord ; on mange après.",
  },
  enfants_dabord: {
    titre: "Les enfants d'abord",
    morale: "Les enfants mangent en premier et dorment au chaud.",
  },
  partager_en_hiver: {
    titre: "Partager en hiver",
    morale: "Un stock plein à côté d'un ventre vide, c'est une mort de trop : en hiver on partage.",
  },
  puits_pres_du_village: {
    titre: "Un puits au village",
    morale: "Personne ne doit mourir de soif à deux pas de chez soi : creusons un puits.",
  },
} as const satisfies Record<string, FicheLecon>;
export type Lecon = keyof typeof LECONS;

export type Domaine = "peche" | "chasse" | "deplacement" | "jeu";

export interface FicheInvention {
  readonly nom: string;
  readonly domaine: Domaine;
  readonly recette: NomRecette;
  /** Ce qu'on se dit quand l'idée vient. */
  readonly idee: string;
  /** Ce qu'on raconte aux autres une fois que ça marche. */
  readonly confidence: string;
}

export const INVENTIONS = {
  filet: {
    nom: "filet de pêche",
    domaine: "peche",
    recette: "filet",
    idee: "Une canne ne prend qu'un poisson à la fois. Avec des fibres tressées, on en prendrait plusieurs.",
    confidence: "Un filet de fibres tressées prend deux fois plus de poisson qu'une canne.",
  },
  piege: {
    nom: "piège à gibier",
    domaine: "chasse",
    recette: "piege",
    idee: "Le gibier m'échappe toujours. Un collet de fibres tendu sur son passage l'attendrait à ma place.",
    confidence: "Un piège de bois et de fibres attrape le gibier sans lance.",
  },
  pirogue: {
    nom: "pirogue",
    domaine: "deplacement",
    recette: "pirogue",
    idee: "Il y a de la terre de l'autre côté de l'eau. Un tronc creusé flotterait.",
    confidence: "Avec une pirogue de bois et de fibres, on traverse l'eau.",
  },
  osselets: {
    nom: "jeu d'osselets",
    domaine: "jeu",
    recette: "osselets",
    idee: "Les soirées sont longues. Quelques petites pierres à lancer et rattraper, ça ferait un jeu.",
    confidence: "Avec quelques pierres, on joue aux osselets : ça remonte le moral.",
  },
} as const satisfies Record<string, FicheInvention>;
export type Invention = keyof typeof INVENTIONS;

export type Savoir = Lecon | Invention;

export function estLecon(s: Savoir): s is Lecon {
  return s in LECONS;
}

export function titreSavoir(s: Savoir): string {
  return estLecon(s) ? LECONS[s].titre : INVENTIONS[s].nom;
}

/** Un savoir acquis : sa force (0,6 = idée ou ouï-dire, 1 = éprouvé) et d'où il vient. */
export interface SavoirAcquis {
  force: number;
  /** Prénom du défunt ou de l'inventeur, si connu. */
  origine: string | null;
  /** Tick de l'acquisition (une idée jamais réalisée finit par s'effacer). */
  depuis: number;
}

/** Force à partir de laquelle un savoir compte comme connu. */
export const SEUIL_SAVOIR = 0.6;
