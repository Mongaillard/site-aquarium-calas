/**
 * Configuration de la simulation (section 16 du protocole).
 * Les valeurs par défaut correspondent aux choix marqués [DÉCISION].
 */

export type ModeCerveau = "llm" | "rules" | "replay";
export type NiveauEffort = "low" | "medium" | "high" | "xhigh" | "max";
export type CoutumeNomFamille = "pere" | "mere" | "compose";

export interface SimConfig {
  seed: number | string;
  monde: {
    joursParSaison: number;
    /** Échelle du relief (collines, vallées), en tuiles. */
    echelleRelief: number;
    /** Échelle des continents et des mers, en tuiles. */
    echelleContinents: number;
    /** Rayon du berceau : terre garantie autour de l'origine, en tuiles. */
    berceau: number;
  };
  population: {
    initiale: number;
    familles: number;
  };
  temps: {
    minutesParTick: number;
    snapshotTousLesTicks: number;
  };
  vie: {
    joursParAnnee: number;
    gestationJours: number;
    probabiliteGrossesse: number;
    ageAdulte: number;
    ageAncien: number;
  };
  brain: {
    mode: ModeCerveau;
    model: string;
    modelDialogue: string | null;
    modelReflexion: string | null;
    effort: {
      aube: NiveauEffort;
      interruption: NiveauEffort;
      dialogue: NiveauEffort;
      soir: NiveauEffort;
    };
    maxCallsPerDay: number;
    maxConcurrent: number;
    timeoutMs: number;
    enfantsAvecLLM: boolean;
    budgetUsdParJourSimule: number;
  };
  memoire: {
    maxSouvenirs: number;
    topK: number;
    demiVieRecenceJours: number;
  };
  perception: {
    rayonJour: number;
    rayonNuit: number;
  };
  social: {
    monogamie: boolean;
    nomFamille: CoutumeNomFamille;
    vouvoiementInconnus: boolean;
  };
}

export const CONFIG_PAR_DEFAUT: SimConfig = {
  seed: 42,
  monde: { joursParSaison: 30, echelleRelief: 40, echelleContinents: 220, berceau: 28 },
  population: { initiale: 12, familles: 3 },
  temps: { minutesParTick: 10, snapshotTousLesTicks: 144 },
  vie: {
    joursParAnnee: 120,
    gestationJours: 30,
    probabiliteGrossesse: 0.15,
    ageAdulte: 16,
    ageAncien: 55,
  },
  brain: {
    mode: "rules",
    model: "claude-opus-5",
    modelDialogue: null,
    modelReflexion: null,
    effort: { aube: "medium", interruption: "medium", dialogue: "low", soir: "high" },
    maxCallsPerDay: 12,
    maxConcurrent: 4,
    timeoutMs: 60_000,
    enfantsAvecLLM: false,
    budgetUsdParJourSimule: 5,
  },
  memoire: { maxSouvenirs: 2000, topK: 20, demiVieRecenceJours: 1 },
  perception: { rayonJour: 6, rayonNuit: 3 },
  social: { monogamie: true, nomFamille: "pere", vouvoiementInconnus: true },
};

/** Configuration partielle : chaque section peut être omise ou partiellement fournie. */
export type SimConfigPartielle = {
  [K in keyof SimConfig]?: SimConfig[K] extends object ? Partial<SimConfig[K]> : SimConfig[K];
};

/** Fusionne une configuration partielle avec les valeurs par défaut (une profondeur). */
export function fusionnerConfig(partielle: SimConfigPartielle = {}): SimConfig {
  return {
    seed: partielle.seed ?? CONFIG_PAR_DEFAUT.seed,
    monde: { ...CONFIG_PAR_DEFAUT.monde, ...partielle.monde },
    population: { ...CONFIG_PAR_DEFAUT.population, ...partielle.population },
    temps: { ...CONFIG_PAR_DEFAUT.temps, ...partielle.temps },
    vie: { ...CONFIG_PAR_DEFAUT.vie, ...partielle.vie },
    brain: {
      ...CONFIG_PAR_DEFAUT.brain,
      ...partielle.brain,
      effort: { ...CONFIG_PAR_DEFAUT.brain.effort, ...partielle.brain?.effort },
    },
    memoire: { ...CONFIG_PAR_DEFAUT.memoire, ...partielle.memoire },
    perception: { ...CONFIG_PAR_DEFAUT.perception, ...partielle.perception },
    social: { ...CONFIG_PAR_DEFAUT.social, ...partielle.social },
  };
}

/** Vérifie les invariants simples ; lève une erreur explicite sinon. */
export function validerConfig(config: SimConfig): void {
  const erreurs: string[] = [];
  if (config.monde.echelleRelief < 4 || config.monde.echelleContinents < 4) {
    erreurs.push("monde.echelleRelief et monde.echelleContinents doivent être ≥ 4");
  }
  if (config.monde.berceau < 4) erreurs.push("monde.berceau doit être ≥ 4");
  if (config.temps.minutesParTick <= 0 || 1440 % config.temps.minutesParTick !== 0) {
    erreurs.push("temps.minutesParTick doit diviser 1440");
  }
  if (config.monde.joursParSaison <= 0) erreurs.push("monde.joursParSaison doit être > 0");
  if (config.vie.joursParAnnee !== config.monde.joursParSaison * 4) {
    erreurs.push("vie.joursParAnnee doit valoir 4 × monde.joursParSaison");
  }
  if (config.population.initiale < 0) erreurs.push("population.initiale doit être ≥ 0");
  if (erreurs.length > 0) {
    throw new Error(`Configuration invalide :\n - ${erreurs.join("\n - ")}`);
  }
}
