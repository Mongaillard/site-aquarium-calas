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
  "priere",
  "veillee",
  "palabre",
  "justice",
  "rixe",
  "coutume",
  "decision",
  "alliance",
  "tabou",
  "recueillement",
  "maitre",
  "psyche",
  "gravure",
  "legende",
  "village",
  "raid",
  "caravane",
  "conteur",
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

/** Événements gardés en mémoire ; au-delà, les plus anciens s'effacent par paquets (les compteurs restent). */
export const FENETRE_JOURNAL = 24_000;
const PAQUET_EFFACE = FENETRE_JOURNAL / 4;

/**
 * Compteurs de détail tenus au fil de l'eau (une statistique ne parcourt jamais
 * le journal) : `type:genre`, `type:ressource`, et `type:reussie` / `type:ratee`.
 */
function clesDetail(e: Evenement): string[] {
  const cles: string[] = [];
  const { genre, ressource, reussie } = e.details;
  if (typeof genre === "string") cles.push(`${e.type}:${genre}`);
  if (typeof ressource === "string") cles.push(`${e.type}:${ressource}`);
  if (typeof reussie === "boolean") cles.push(`${e.type}:${reussie ? "reussie" : "ratee"}`);
  return cles;
}

export class Journal {
  private readonly evenements: Evenement[] = [];
  private readonly auditeurs: Auditeur[] = [];
  private readonly compteurs = new Map<string, number>();
  /** Événements effacés de la fenêtre depuis le début : l'index global d'un événement = supprimes + son rang. */
  private supprimes = 0;

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
    for (const cle of clesDetail(evenement))
      this.compteurs.set(cle, (this.compteurs.get(cle) ?? 0) + 1);
    if (this.evenements.length > FENETRE_JOURNAL) {
      this.evenements.splice(0, PAQUET_EFFACE);
      this.supprimes += PAQUET_EFFACE;
    }
    for (const a of this.auditeurs) a(evenement);
  }

  /** Nombre d'événements depuis le début (fenêtre comprise), qui sert d'index global. */
  get taille(): number {
    return this.supprimes + this.evenements.length;
  }

  /** État pour la sauvegarde : les `garder` derniers événements et tous les compteurs. */
  etat(garder = Infinity): {
    evenements: Evenement[];
    compteurs: [string, number][];
    supprimes?: number;
  } {
    const gardes = Math.min(garder, this.evenements.length);
    return {
      evenements: this.evenements.slice(this.evenements.length - gardes),
      compteurs: [...this.compteurs.entries()],
      supprimes: this.taille - gardes,
    };
  }

  /** Remplace le contenu par un état sauvegardé (sans prévenir les auditeurs). */
  restaurer(etat: {
    evenements: readonly Evenement[];
    compteurs: readonly (readonly [string, number])[];
    supprimes?: number;
  }): void {
    this.evenements.length = 0;
    this.evenements.push(...etat.evenements);
    this.supprimes = etat.supprimes ?? 0;
    this.compteurs.clear();
    for (const [t, n] of etat.compteurs) this.compteurs.set(t, n);
    // Une sauvegarde d'avant les compteurs de détail : on les reconstitue sur ce qu'on a.
    if (![...this.compteurs.keys()].some((c) => c.includes(":")))
      for (const e of this.evenements)
        for (const cle of clesDetail(e))
          this.compteurs.set(cle, (this.compteurs.get(cle) ?? 0) + 1);
  }

  /** Les événements encore en mémoire (la fenêtre), du plus ancien au plus récent. */
  tous(): readonly Evenement[] {
    return this.evenements;
  }

  /** Les événements d'index global ≥ `index` (pour qui suit le journal au fil de l'eau). */
  depuisIndex(index: number): readonly Evenement[] {
    const debut = index - this.supprimes;
    return debut <= 0 ? this.evenements : this.evenements.slice(debut);
  }

  parType(type: TypeEvenement): Evenement[] {
    return this.evenements.filter((e) => e.type === type);
  }

  compte(type: TypeEvenement): number {
    return this.compteurs.get(type) ?? 0;
  }

  /** Un compteur de détail (`chasse:reussie`, `chasse:ratee`). */
  compteDetail(cle: string): number {
    return this.compteurs.get(cle) ?? 0;
  }

  depuis(tick: number): Evenement[] {
    return this.evenements.filter((e) => e.tick >= tick);
  }

  /** Empreinte du journal en mémoire : deux exécutions identiques doivent la partager (P1). */
  empreinte(): string {
    return fnv1a32(
      `${String(this.supprimes)}\n${this.evenements.map((e) => JSON.stringify(e)).join("\n")}`,
    )
      .toString(16)
      .padStart(8, "0");
  }

  /** Lignes NDJSON (persistance, M2+). */
  ndjson(): string {
    return this.evenements.map((e) => JSON.stringify(e)).join("\n");
  }
}
