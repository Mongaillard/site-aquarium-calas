/**
 * Protocole serveur ↔ viewer (section 13). Le viewer ne recalcule jamais de
 * logique de jeu : il ne fait qu'afficher ce que le serveur lui envoie.
 */

export interface MomentEtat {
  readonly annee: number;
  readonly saison: string;
  readonly jourDeSaison: number;
  readonly jourAbsolu: number;
  readonly heure: number;
  readonly minute: number;
  readonly estNuit: boolean;
}

export interface MessageInit {
  readonly type: "init";
  readonly seed: string;
  readonly largeur: number;
  readonly hauteur: number;
  /** Code de biome par tuile (index dans `nomsBiomes`), ligne par ligne. */
  readonly biomes: readonly number[];
  readonly nomsBiomes: readonly string[];
  readonly ticksParJour: number;
  readonly joursParSaison: number;
  readonly modeCerveau: string;
}

export interface BesoinsEtat {
  readonly faim: number;
  readonly soif: number;
  readonly sommeil: number;
  readonly chaleur: number;
  readonly securite: number;
  readonly social: number;
  readonly moral: number;
}

export interface PersonnageEtat {
  readonly id: string;
  readonly prenom: string;
  readonly nomFamille: string;
  readonly sexe: "F" | "M";
  readonly vivant: boolean;
  readonly x: number;
  readonly y: number;
  readonly endormi: boolean;
  readonly stade: string;
  readonly enceinte: boolean;
  readonly sante: number;
  readonly besoins: BesoinsEtat;
  readonly intention: string | null;
  readonly action: string | null;
  readonly parents: readonly [string, string] | null;
  readonly partenaire: string | null;
  readonly causeDeces: string | null;
  readonly teint: string;
  readonly cheveux: string;
}

export interface BatimentEtat {
  readonly id: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly etat: "chantier" | "termine";
  readonly famille: string;
  readonly proprietaire: string;
  readonly solidite: number;
  readonly allume: boolean;
  readonly stock: Readonly<Record<string, number>> | null;
  /** Chantier : travail restant et total (ticks·personne), matériaux manquants. */
  readonly travailRestant: number;
  readonly travailTotal: number;
  readonly manquants: Readonly<Record<string, number>>;
  readonly capaciteDormeurs: number;
  readonly nom: string;
}

/**
 * [x, y, type, quantité, outil requis ("" si aucun)] ; une quantité négative
 * signifie que le gisement a disparu.
 */
export type GisementEtat = readonly [number, number, string, number, string];

export interface EvenementEtat {
  readonly tick: number;
  readonly type: string;
  readonly acteur: string | null;
  readonly position: { readonly x: number; readonly y: number } | null;
  readonly importance: number;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
}

export interface BilanSaison {
  readonly annee: number;
  readonly saison: string;
  readonly naissances: number;
  readonly deces: number;
}

export interface Statistiques {
  readonly tick: number;
  readonly vivants: number;
  readonly morts: number;
  readonly population: number;
  readonly enfants: number;
  readonly batiments: number;
  readonly chantiers: number;
  readonly parType: Readonly<Record<string, number>>;
  readonly naissances: number;
  readonly deces: number;
  readonly unions: number;
  readonly dialogues: number;
  readonly generations: number;
  readonly stocks: Readonly<Record<string, number>>;
  readonly parSaison: readonly BilanSaison[];
  readonly appelsLLM: number;
  readonly coutLLM: number;
  readonly evenements: number;
  /** Tuiles déjà vues par la colonie, et taille du monde. */
  readonly tuilesDecouvertes: number;
  readonly tuiles: number;
}

export interface MessageEtat {
  readonly type: "etat";
  readonly tick: number;
  readonly moment: MomentEtat;
  readonly meteo: string;
  readonly ticksParSeconde: number;
  readonly pause: boolean;
  readonly personnages: readonly PersonnageEtat[];
  readonly batiments: readonly BatimentEtat[];
  /** Différentiel depuis le dernier état envoyé à ce client (complet au premier envoi). */
  readonly gisements: readonly GisementEtat[];
  readonly evenements: readonly EvenementEtat[];
  readonly stats: Statistiques;
  /** Tuiles nouvellement découvertes (indices y × largeur + x) ; toutes au premier envoi. */
  readonly decouvertes: readonly number[];
  /** Rayon de vision courant des personnages, en tuiles (jour / nuit, météo). */
  readonly rayonVision: number;
}

export interface RelationFiche {
  readonly id: string;
  readonly prenom: string;
  readonly nomFamille: string;
  readonly vivant: boolean;
  readonly lien: string;
  readonly affinite: number;
  readonly confiance: number;
  readonly attirance: number;
  readonly dette: number;
  readonly interactions: number;
}

export interface SouvenirFiche {
  readonly tick: number;
  readonly type: string;
  readonly texte: string;
  readonly importance: number;
}

export interface PersonneCourte {
  readonly id: string;
  readonly prenom: string;
  readonly vivant: boolean;
}

export interface MessageFiche {
  readonly type: "fiche";
  readonly id: string;
  readonly prenom: string;
  readonly nomFamille: string;
  readonly sexe: "F" | "M";
  readonly vivant: boolean;
  readonly causeDeces: string | null;
  readonly ageAnnees: number;
  readonly stade: string;
  readonly biographie: string;
  readonly motto: string;
  readonly personnalite: Readonly<Record<string, number>>;
  readonly valeurs: readonly string[];
  readonly traits: readonly string[];
  readonly apparence: Readonly<Record<string, string | number>>;
  readonly sante: number;
  readonly besoins: BesoinsEtat;
  readonly inventaire: {
    readonly ressources: Readonly<Record<string, number>>;
    readonly objets: readonly string[];
    readonly capacite: number;
  };
  readonly competences: Readonly<Record<string, number>>;
  readonly relations: readonly RelationFiche[];
  readonly intention: string | null;
  readonly action: string | null;
  readonly plan: readonly string[];
  readonly projet: string | null;
  /** Pensée intérieure : phrase du cerveau (règles ou LLM). */
  readonly pensee: string;
  readonly souvenirsRecents: readonly SouvenirFiche[];
  readonly souvenirsMarquants: readonly SouvenirFiche[];
  readonly famille: {
    readonly parents: readonly PersonneCourte[];
    readonly partenaire: PersonneCourte | null;
    readonly enfants: readonly PersonneCourte[];
    readonly fratrie: readonly PersonneCourte[];
  };
  readonly reputation: number;
  readonly enceinte: { readonly avancement: number; readonly pere: string } | null;
  readonly lieuxConnus: number;
  readonly nombreSouvenirs: number;
}

export interface MessageErreur {
  readonly type: "erreur";
  readonly message: string;
}

export type MessageServeur = MessageInit | MessageEtat | MessageFiche | MessageErreur;

export type Commande =
  | { readonly type: "pause" }
  | { readonly type: "reprendre" }
  | { readonly type: "vitesse"; readonly ticksParSeconde: number }
  | { readonly type: "tick" }
  | { readonly type: "aube" }
  | { readonly type: "inspecter"; readonly id: string }
  | { readonly type: "fermer_fiche" };

/** Vitesses proposées par l'interface (ticks de jeu par seconde réelle). */
export const VITESSES: readonly number[] = [1, 4, 16, 64];

/** Analyse une commande reçue (JSON) ; renvoie `null` si elle est invalide. */
export function analyserCommande(texte: string): Commande | null {
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return null;
  }
  if (typeof brut !== "object" || brut === null || !("type" in brut)) return null;
  const c = brut as { type: unknown; ticksParSeconde?: unknown; id?: unknown };
  switch (c.type) {
    case "pause":
    case "reprendre":
    case "tick":
    case "aube":
    case "fermer_fiche":
      return { type: c.type };
    case "vitesse":
      return typeof c.ticksParSeconde === "number" &&
        c.ticksParSeconde > 0 &&
        c.ticksParSeconde <= 1024
        ? { type: "vitesse", ticksParSeconde: c.ticksParSeconde }
        : null;
    case "inspecter":
      return typeof c.id === "string" && c.id.length > 0 && c.id.length < 64
        ? { type: "inspecter", id: c.id }
        : null;
    default:
      return null;
  }
}

/** Teinte stable (0..360) dérivée du nom de famille, pour colorer les personnages. */
export function teinteFamille(nomFamille: string): number {
  let h = 2166136261;
  for (let i = 0; i < nomFamille.length; i++) {
    h ^= nomFamille.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

/** Opacité du voile nocturne selon l'heure (fondu d'une heure autour du lever et du coucher). */
export function opaciteNuit(heure: number, minute: number, lever: number, coucher: number): number {
  const h = heure + minute / 60;
  const max = 0.45;
  if (h >= lever + 1 && h < coucher - 1) return 0;
  if (h < lever || h >= coucher) return max;
  if (h < lever + 1) return max * (1 - (h - lever));
  return max * (h - (coucher - 1));
}

/** Heures de lever et de coucher par saison (identiques à l'horloge du moteur). */
export const LEVER_COUCHER: Readonly<Record<string, readonly [number, number]>> = {
  printemps: [6, 20],
  ete: [5, 21],
  automne: [6, 19],
  hiver: [7, 18],
};

/** Découpe une transcription « A : … / B : … » en répliques. */
export function decouperTranscription(
  transcription: string,
): { locuteur: string; texte: string }[] {
  return transcription
    .split(" / ")
    .map((r) => {
      const i = r.indexOf(" : ");
      return i < 0
        ? { locuteur: "", texte: r }
        : { locuteur: r.slice(0, i), texte: r.slice(i + 3) };
    })
    .filter((r) => r.texte.length > 0);
}
