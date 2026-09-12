/**
 * Horloge du monde (section 4.3). Un tick vaut `minutesParTick` minutes de jeu.
 * L'année compte quatre saisons de `joursParSaison` jours.
 */

export const SAISONS = ["printemps", "ete", "automne", "hiver"] as const;
export type Saison = (typeof SAISONS)[number];

export interface ConfigHorloge {
  readonly minutesParTick: number;
  readonly joursParSaison: number;
}

/** Heure de lever et de coucher du soleil par saison (heures pleines). */
const LEVER_COUCHER: Record<Saison, readonly [number, number]> = {
  printemps: [6, 20],
  ete: [5, 21],
  automne: [6, 19],
  hiver: [7, 18],
};

export interface Moment {
  readonly tick: number;
  readonly annee: number; // à partir de 1
  readonly saison: Saison;
  readonly jourDeSaison: number; // 1..joursParSaison
  readonly jourAbsolu: number; // 0 = premier jour
  readonly heure: number; // 0..23
  readonly minute: number; // 0..59
  readonly estNuit: boolean;
}

export class Horloge {
  readonly ticksParJour: number;
  readonly ticksParSaison: number;
  readonly ticksParAnnee: number;
  private _tick: number;

  constructor(
    readonly config: ConfigHorloge,
    tickInitial = 0,
  ) {
    if (1440 % config.minutesParTick !== 0) {
      throw new RangeError("minutesParTick doit diviser 1440");
    }
    this.ticksParJour = 1440 / config.minutesParTick;
    this.ticksParSaison = this.ticksParJour * config.joursParSaison;
    this.ticksParAnnee = this.ticksParSaison * SAISONS.length;
    this._tick = tickInitial;
  }

  get tick(): number {
    return this._tick;
  }

  avancer(nombreTicks = 1): void {
    if (nombreTicks < 0) throw new RangeError("avancer(): nombreTicks négatif");
    this._tick += nombreTicks;
  }

  /** Décompose un tick arbitraire (par défaut le tick courant) en moment lisible. */
  moment(tick = this._tick): Moment {
    const jourAbsolu = Math.floor(tick / this.ticksParJour);
    const minuteDuJour = (tick % this.ticksParJour) * this.config.minutesParTick;
    const annee = Math.floor(tick / this.ticksParAnnee) + 1;
    const indexSaison = Math.floor((tick % this.ticksParAnnee) / this.ticksParSaison);
    const saison = SAISONS[indexSaison] ?? "printemps";
    const jourDeSaison = (jourAbsolu % this.config.joursParSaison) + 1;
    const heure = Math.floor(minuteDuJour / 60);
    const minute = minuteDuJour % 60;
    const [lever, coucher] = LEVER_COUCHER[saison];
    return {
      tick,
      annee,
      saison,
      jourDeSaison,
      jourAbsolu,
      heure,
      minute,
      estNuit: heure < lever || heure >= coucher,
    };
  }

  /** Vrai au premier tick d'un jour. */
  estAube(tick = this._tick): boolean {
    return tick % this.ticksParJour === 0;
  }

  /** Tick du début du prochain jour. */
  prochaineAube(tick = this._tick): number {
    return (Math.floor(tick / this.ticksParJour) + 1) * this.ticksParJour;
  }

  formater(tick = this._tick): string {
    const m = this.moment(tick);
    const hh = String(m.heure).padStart(2, "0");
    const mm = String(m.minute).padStart(2, "0");
    return `An ${m.annee}, ${m.saison} jour ${m.jourDeSaison}, ${hh}:${mm}${m.estNuit ? " (nuit)" : ""}`;
  }
}
