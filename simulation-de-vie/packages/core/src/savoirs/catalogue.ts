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
  vetements_chauds: {
    titre: "Des vêtements chauds",
    morale: "Le froid passe à travers les fibres : il faut du cuir sur le dos avant l'hiver.",
  },
  soigner_les_blesses: {
    titre: "Soigner les blessés",
    morale:
      "Une plaie qu'on ne bande pas emporte quelqu'un en une semaine : on soigne d'abord, et on garde un bandage.",
  },
  accoucheuse: {
    titre: "Une accoucheuse",
    morale: "Une femme n'accouche pas seule : qu'une autre, qui sait, soit près d'elle.",
  },
  murs_contre_les_loups: {
    titre: "Des murs contre les loups",
    morale: "Les loups ne passent pas une palissade : entourons les abris de pieux.",
  },
  veilleur_de_nuit: {
    titre: "Un veilleur de nuit",
    morale:
      "La meute vient quand tout le monde dort : qu'un de nous veille au feu, à tour de rôle.",
  },
  le_ciel_ecoute: {
    titre: "Le ciel écoute",
    morale: "Deux fois j'ai prié, deux fois le ciel a répondu : quand ça va mal, on prie.",
  },
  le_ciel_frappe: {
    titre: "Le ciel frappe",
    morale: "Le ciel peut frapper sans prévenir : mieux vaut l'avoir de son côté.",
  },
  ne_pas_attendre_le_ciel: {
    titre: "Ne pas attendre le ciel",
    morale: "Trois prières sans réponse : le ciel n'aide que ceux qui se lèvent.",
  },
} as const satisfies Record<string, FicheLecon>;
export type Lecon = keyof typeof LECONS;

export type Domaine =
  "peche" | "chasse" | "deplacement" | "jeu" | "conservation" | "confort" | "outillage";

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
  arc: {
    nom: "arc",
    domaine: "chasse",
    recette: "arc",
    idee: "Le gibier est trop loin pour la lance. Une branche courbée et une corde tendue lanceraient une flèche.",
    confidence: "Avec un arc, on rapporte deux fois plus de gibier.",
  },
  fumoir: {
    nom: "fumoir",
    domaine: "conservation",
    recette: "poisson_fume",
    idee: "Le poisson s'entasse et se gâte. Suspendu au-dessus d'un feu couvert, il se garderait tout l'hiver.",
    confidence: "Fumé dans un fumoir, le poisson nourrit davantage et se garde tout l'hiver.",
  },
  couche: {
    nom: "couche de fibres",
    domaine: "confort",
    recette: "couche",
    idee: "Le sol est dur et froid. Une épaisse couche de fibres tressées ferait une vraie couche.",
    confidence: "Sur une couche de fibres, on dort mieux et on a moins froid.",
  },
  traineau: {
    nom: "traîneau",
    domaine: "deplacement",
    recette: "traineau",
    idee: "Mes bras ne suffisent plus. Des planches liées qu'on tire porteraient le reste.",
    confidence: "Avec un traîneau, on rapporte bien plus à chaque voyage.",
  },
  flute: {
    nom: "flûte",
    domaine: "jeu",
    recette: "flute",
    idee: "Le vent siffle dans les roseaux creux. Un bois percé chanterait aussi.",
    confidence: "Un bois percé fait une flûte : les veillées sont plus douces.",
  },
  vetement: {
    nom: "vêtement de cuir",
    domaine: "confort",
    recette: "vetement_cuir",
    idee: "Les peaux du gibier tiennent chaud aux bêtes. Cousues avec de la corde, elles nous tiendraient chaud aussi.",
    confidence: "Un vêtement de cuir cousu tient chaud tout l'hiver.",
  },
  fonte: {
    nom: "fonte du cuivre",
    domaine: "outillage",
    recette: "cuivre",
    idee: "Cette pierre verte de la montagne a pleuré des gouttes rouges dans le feu. Chauffée assez fort, elle ferait un métal.",
    confidence:
      "Trois pierres vertes de la montagne et du bois au four donnent un lingot de cuivre.",
  },
  outils_de_cuivre: {
    nom: "outils de cuivre",
    domaine: "outillage",
    recette: "hache_cuivre",
    idee: "Une hache de pierre s'ébrèche en quarante coups. Une lame de cuivre tiendrait bien plus longtemps, et couperait mieux.",
    confidence: "Une hache ou une pioche de cuivre dure quatre fois plus et abat deux fois plus.",
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
