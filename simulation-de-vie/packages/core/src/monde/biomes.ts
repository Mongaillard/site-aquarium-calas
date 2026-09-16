/** Biomes du monde (section 4.1). */

export const BIOMES = [
  "eau_profonde",
  "eau_peu_profonde",
  "plage",
  "prairie",
  "foret",
  "colline",
  "montagne",
  "marais",
  "gue",
] as const;
export type Biome = (typeof BIOMES)[number];

export interface InfoBiome {
  /** Coût de déplacement relatif (1 = prairie). Infinity = infranchissable à pied. */
  readonly coutDeplacement: number;
  /** Caractère de rendu ASCII. */
  readonly ascii: string;
  /** Vrai si l'on peut y marcher. */
  readonly praticable: boolean;
  /** Vrai si l'on peut y construire. */
  readonly constructible: boolean;
  /** Réduction de la vision (0 = aucune). */
  readonly opacite: number;
}

export const INFO_BIOME: Record<Biome, InfoBiome> = {
  eau_profonde: {
    coutDeplacement: Infinity,
    ascii: "~",
    praticable: false,
    constructible: false,
    opacite: 0,
  },
  // L'eau peu profonde ne se passe plus à pied (M30) : à gué, en pirogue, ou de port à port.
  eau_peu_profonde: {
    coutDeplacement: Infinity,
    ascii: "-",
    praticable: false,
    constructible: false,
    opacite: 0,
  },
  plage: { coutDeplacement: 1.2, ascii: ".", praticable: true, constructible: true, opacite: 0 },
  prairie: { coutDeplacement: 1, ascii: ",", praticable: true, constructible: true, opacite: 0 },
  foret: { coutDeplacement: 1.6, ascii: "T", praticable: true, constructible: true, opacite: 2 },
  colline: { coutDeplacement: 1.8, ascii: "n", praticable: true, constructible: true, opacite: 0 },
  montagne: {
    coutDeplacement: 3.5,
    ascii: "^",
    praticable: true,
    constructible: false,
    opacite: 1,
  },
  marais: { coutDeplacement: 2.2, ascii: "%", praticable: true, constructible: false, opacite: 1 },
  /** Un gué : de l'eau peu profonde qui se passe à pied, posée à la génération (M30). */
  gue: { coutDeplacement: 2, ascii: "_", praticable: true, constructible: false, opacite: 0 },
};

/** Code numérique stable d'un biome (utilisé pour le hachage et la sérialisation compacte). */
export function codeBiome(biome: Biome): number {
  return BIOMES.indexOf(biome);
}
