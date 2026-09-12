/** Bus et journal d'événements (section 12). */
import { fnv1a32 } from "../rng.js";
import type { Position } from "../monde/grille.js";

export const TYPES_EVENEMENT = [
  "arrivee",
  "deces",
  "intention",
  "action_terminee",
  "action_echouee",
  "recolte",
  "gisement_epuise",
  "repas",
  "endormi",
  "reveil",
  "fabrication",
  "chantier_fonde",
  "livraison",
  "batiment_termine",
  "batiment_repare",
  "batiment_effondre",
  "feu_eteint",
  "feu_rallume",
  "depot",
  "retrait",
  "outil_casse",
  "jete",
  "meteo",
  "dialogue",
  "offre",
  "demande",
  "vol",
  "invitation",
  "reflexion",
  "cour",
  "union",
  "grossesse",
  "fausse_couche",
  "naissance",
  "stade",
  "heritage",
  "adoption",
  "lecon",
  "idee",
  "invention",
  "prototype_rate",
  "jeu",
  "claude",
  "blessure",
  "infection",
  "soin",
  "guerison",
  "sequelle",
  "carence",
  "epuisement",
  "accouchement",
  "chasse",
  "faune",
  "menace",
  "alarme",
  "combat",
  "maladie",
  "guerison_maladie",
  "epidemie",
  "pourriture",
  "reparation",
  "capture",
  "betail",
  "champ",
  "abattage",
  "semis",
  "divin",
  "conseil",
  "ambition",
] as const;
export type TypeEvenement = (typeof TYPES_EVENEMENT)[number];

export interface Evenement {
  readonly tick: number;
  readonly type: TypeEvenement;
  readonly acteur: string | null;
  readonly position: Position | null;
  /** Importance 1..10 (section 5.4) ; sert au futur flux de mémoire. */
  readonly importance: number;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
}

export type Auditeur = (evenement: Evenement) => void;

export class Journal {
  private readonly evenements: Evenement[] = [];
  private readonly auditeurs: Auditeur[] = [];
  private readonly compteurs = new Map<TypeEvenement, number>();

  ecouter(auditeur: Auditeur): () => void {
    this.auditeurs.push(auditeur);
    return () => {
      const i = this.auditeurs.indexOf(auditeur);
      if (i >= 0) this.auditeurs.splice(i, 1);
    };
  }

  enregistrer(evenement: Evenement): void {
    this.evenements.push(evenement);
    this.compteurs.set(evenement.type, (this.compteurs.get(evenement.type) ?? 0) + 1);
    for (const a of this.auditeurs) a(evenement);
  }

  get taille(): number {
    return this.evenements.length;
  }

  tous(): readonly Evenement[] {
    return this.evenements;
  }

  parType(type: TypeEvenement): Evenement[] {
    return this.evenements.filter((e) => e.type === type);
  }

  compte(type: TypeEvenement): number {
    return this.compteurs.get(type) ?? 0;
  }

  depuis(tick: number): Evenement[] {
    return this.evenements.filter((e) => e.tick >= tick);
  }

  /** Empreinte du journal complet : deux exécutions identiques doivent la partager (P1). */
  empreinte(): string {
    return fnv1a32(this.evenements.map((e) => JSON.stringify(e)).join("\n"))
      .toString(16)
      .padStart(8, "0");
  }

  /** Lignes NDJSON (persistance, M2+). */
  ndjson(): string {
    return this.evenements.map((e) => JSON.stringify(e)).join("\n");
  }
}
