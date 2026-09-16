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
  /** Le monde n'a pas de limite : il est découpé en morceaux carrés de ce côté. */
  readonly tailleMorceau: number;
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
  /** Le corps (jalon « le corps ») : blessé (bande rouge), épuisé. */
  readonly blesse: boolean;
  readonly epuise: boolean;
  /** L'alarme a été donnée : un « ! » au-dessus de la tête. */
  readonly alerte: boolean;
  /** Malade : teint pâle. */
  readonly malade: boolean;
  /** Titre de métier tiré de la pratique (« pêcheuse »), s'il en a un. */
  readonly metier: string | null;
  /** Notable du village (parmi les trois plus grands prestiges) : une étoile au-dessus de la tête. */
  readonly notable: boolean;
  /** Banni : il vit à l'écart le temps de l'exil. */
  readonly banni: boolean;
  /** Abattu (jalon 14) : ne fait plus que le nécessaire. */
  readonly abattu: boolean;
  /** Foi 0..3 (calque « foi », M25). */
  readonly foi: number;
  /**
   * L'outil en main (M31), déduit de l'intention et de l'inventaire : `hache`, `hache_cuivre`,
   * `pioche`, `pioche_cuivre`, `lance`, `arc`, `canne`, `marteau` — ou null les mains vides.
   */
  readonly outil: string | null;
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
  /** Feux : bûches en réserve (quatre par jour, six sous la neige). */
  readonly reserveBois: number;
  /** Champs : semé, stade de pousse (0 semé … 4 mûr), récoltes consécutives. */
  readonly culture: {
    readonly seme: boolean;
    readonly stade: number;
    readonly recoltes: number;
  } | null;
  readonly stock: Readonly<Record<string, number>> | null;
  /** Chantier : travail restant et total (ticks·personne), matériaux manquants. */
  readonly travailRestant: number;
  readonly travailTotal: number;
  readonly manquants: Readonly<Record<string, number>>;
  readonly capaciteDormeurs: number;
  readonly nom: string;
  /** Tombes : la morale qu'on y a gravée. */
  readonly epitaphe: string | null;
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
  /** Tuiles déjà vues par la colonie, tuiles générées et morceaux du monde existants. */
  readonly tuilesDecouvertes: number;
  readonly tuiles: number;
  readonly morceaux: number;
  /** Leçons et inventions connues dans la colonie, avec le nombre de vivants qui les portent. */
  readonly savoirs: readonly SavoirStat[];
  /** La faune : troupeaux et bêtes par espèce, et le bilan des chasses. */
  readonly faune: readonly FauneStat[];
  readonly chasses: { readonly reussies: number; readonly ratees: number };
  /** Attaques de meutes résolues par un combat. */
  readonly attaques: number;
  /** Malades en ce moment. */
  readonly malades: number;
  /** Bêtes apprivoisées et champs. */
  readonly betail: number;
  readonly champs: number;
  /** L'âge technique du village : pierre, ou cuivre dès le premier lingot ou outil de cuivre. */
  readonly age: "pierre" | "cuivre";
  /** Où ils vont : les ambitions en cours, nées des conseils de Claude. */
  readonly ambitions: readonly AmbitionStat[];
  /** Miracles exercés par l'observateur. */
  readonly miracles: number;
  /** Foi moyenne des vivants (0..10), prières et prières exaucées. */
  readonly foiMoyenne: number;
  readonly prieres: number;
  readonly exaucees: number;
  /** La société : veillées, fêtes, palabres, exils, rixes depuis le début. */
  readonly veillees: number;
  readonly fetes: number;
  readonly palabres: number;
  readonly exils: number;
  readonly rixes: number;
  /** La mémoire collective : légendes nées, lieux nommés, proverbes ; abattus en ce moment. */
  readonly legendes: number;
  readonly lieuxNommes: number;
  readonly proverbes: number;
  readonly abattus: number;
  /** Le monde qui s'élargit : villages, raids subis, caravanes, batailles. */
  readonly villages: number;
  readonly raids: number;
  readonly caravanes: number;
  readonly batailles: number;
  /** M35/M32c : villages conquis, raids repoussés par les armes. */
  readonly conquetes: number;
  readonly raidsRepousses: number;
}

/** Un récit du village, tel qu'on le raconte aujourd'hui. */
export interface RecitEtat {
  readonly id: string;
  readonly tick: number;
  readonly genre: string;
  readonly texte: string;
  readonly origine: string;
  readonly fois: number;
  readonly legende: boolean;
}

export interface LieuNommeEtat {
  readonly x: number;
  readonly y: number;
  readonly nom: string;
  readonly origine: string;
}

export interface ProverbeEtat {
  readonly lecon: string;
  readonly titre: string;
  readonly texte: string;
}

/** La mémoire collective (jalon 14), pour la page « Légendes » et les noms sur la carte. */
export interface ChroniqueEtat {
  readonly recits: readonly RecitEtat[];
  readonly lieuxNommes: readonly LieuNommeEtat[];
  readonly proverbes: readonly ProverbeEtat[];
}

export interface VillageEtat {
  readonly id: string;
  readonly nom: string;
  readonly x: number;
  readonly y: number;
  readonly familles: readonly string[];
  readonly habitants: number;
  readonly fondeJour: number;
  readonly origine: "fondation" | "schisme";
  readonly enRoute: number;
  readonly nourriture: number;
  readonly force: number;
}

export interface DiplomatieEtat {
  readonly a: string;
  readonly b: string;
  readonly attitude: number;
  readonly etat: "paix" | "alliance" | "guerre";
  readonly casusBelli: string | null;
  readonly batailles: number;
}

export interface BandeEtat {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly taille: number;
  readonly etat: string;
  readonly cible: string;
}

export interface CaravaneEtat {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly de: string;
  readonly vers: string;
  readonly etat: string;
  readonly quantite: number;
  readonly invention: string | null;
}

/** Les villages (jalon 15) : grappes nommées, routes, bandes, caravanes, relations. */
/** Un coup porté dans une bataille (M32) ; `degats` 0 quand il est manqué. */
export interface FrappeEtat {
  readonly tick: number;
  readonly de: string;
  readonly vers: string;
  readonly degats: number;
  readonly mortelle: boolean;
}

/** Un combattant virtuel (pillard, loup) : position et santé, pour le dessin et la barre de vie. */
export interface MembreEtat {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly sante: number;
  readonly santeMax: number;
}

export interface CampEtat {
  readonly village: string | null;
  /** La bande ou la meute, pour un camp virtuel. */
  readonly bande: string | null;
  readonly meute: string | null;
  readonly membres: readonly MembreEtat[];
  readonly nom: string;
  /** Les combattants encore engagés. */
  readonly guerriers: readonly string[];
  readonly forceInitiale: number;
  readonly blesses: number;
  readonly morts: number;
}

/** Une bataille (M32) : en marche, au combat, ou finie depuis peu. */
export interface BatailleEtat {
  readonly id: string;
  readonly genre: string;
  readonly phase: "marche" | "combat" | "finie";
  readonly attaquant: CampEtat;
  readonly defenseur: CampEtat;
  /** Le lieu de l'assaut et le rayon du champ de bataille. */
  readonly x: number;
  readonly y: number;
  readonly rayon: number;
  readonly debutTick: number;
  readonly combatTick: number | null;
  readonly finTick: number | null;
  readonly issue: "attaquant" | "defenseur" | "treve" | null;
  /** Les derniers coups, pour l'animation. */
  readonly frappes: readonly FrappeEtat[];
}

export interface VillagesEtat {
  readonly villages: readonly VillageEtat[];
  readonly relations: readonly DiplomatieEtat[];
  readonly bandes: readonly BandeEtat[];
  readonly caravanes: readonly CaravaneEtat[];
  /** Routes empruntées, par paires de positions [x1, y1, x2, y2]. */
  readonly routes: readonly (readonly [number, number, number, number])[];
  /** Les batailles (M32) en cours ou fraîchement finies. */
  readonly batailles: readonly BatailleEtat[];
}

/** Une coutume du village : une leçon que tout adulte suit. */
export interface CoutumeEtat {
  readonly lecon: string;
  readonly titre: string;
  readonly morale: string;
  readonly depuisJour: number;
  /** Part des adultes qui la connaissent, en pour cent. */
  readonly part: number;
}

export interface NotableEtat {
  readonly id: string;
  readonly prenom: string;
  readonly nomFamille: string;
  readonly prestige: number;
}

export interface GriefEtat {
  readonly id: string;
  readonly jour: number;
  readonly motif: string;
  readonly details: string;
  readonly plaignant: PersonneCourte;
  readonly accuse: PersonneCourte;
  readonly etat: string;
}

export interface DecisionEtat {
  readonly jour: number;
  readonly sujet: string;
  readonly libelle: string;
  readonly pour: number;
  readonly contre: number;
  readonly adoptee: boolean;
}

export interface LieuInterditEtat {
  readonly x: number;
  readonly y: number;
  readonly rayon: number;
  readonly joursRestants: number;
  readonly motif: string;
}

export interface FactionEtat {
  readonly nom: string;
  readonly familles: readonly string[];
  readonly membres: number;
}

export interface VeilleeEtat {
  readonly tick: number;
  readonly x: number;
  readonly y: number;
  readonly participants: readonly string[];
  readonly fete: string | null;
}

/** La société du village (jalon 13), pour l'onglet « Village » et la carte. */
export interface SocieteEtat {
  readonly tension: number;
  readonly coutumes: readonly CoutumeEtat[];
  readonly notables: readonly NotableEtat[];
  readonly factions: readonly FactionEtat[];
  readonly griefs: readonly GriefEtat[];
  readonly decisions: readonly DecisionEtat[];
  /** Familles alliées par mariage, par paires. */
  readonly alliances: readonly (readonly [string, string])[];
  readonly lieuxInterdits: readonly LieuInterditEtat[];
  readonly stocksOuverts: boolean;
  /** La dernière veillée (le cercle autour du feu se dessine une heure). */
  readonly veillee: VeilleeEtat | null;
  readonly bannis: readonly PersonneCourte[];
}

export interface SavoirStat {
  readonly id: string;
  readonly genre: "lecon" | "invention";
  readonly titre: string;
  readonly texte: string;
  readonly porteurs: number;
}

/** Un savoir d'une personne : leçon retenue ou invention (idée en cours si force < 1). */
export interface SavoirFiche {
  readonly id: string;
  readonly genre: "lecon" | "invention";
  readonly titre: string;
  readonly texte: string;
  readonly force: number;
  readonly origine: string | null;
}

/** Un troupeau ou une meute vus sur des tuiles découvertes (jalon « la faune vit »). */
export interface TroupeauEtat {
  readonly id: string;
  readonly espece: string;
  readonly nom: string;
  readonly x: number;
  readonly y: number;
  readonly taille: number;
  readonly etat: "pature" | "fuite" | "gite";
  readonly predateur: boolean;
  /** Meute désignée comme menace par le directeur de danger (yeux jaunes la nuit). */
  readonly menace: boolean;
  /** Bête apprivoisée (bétail d'une famille). */
  readonly domestique: boolean;
}

export interface FauneStat {
  readonly espece: string;
  readonly nom: string;
  readonly troupeaux: number;
  readonly betes: number;
}

/**
 * Mode Dieu : les pouvoirs qu'un observateur peut exercer sur le monde. Le
 * catalogue est fermé ; le moteur applique, journalise (`divin`) et fait
 * payer en faveur. Les personnages interprètent, ils n'obéissent pas.
 */
export const POUVOIRS = [
  "pluie",
  "eclaircie",
  "seve",
  "souffle",
  "guerison",
  "braise",
  "foudre",
  "songe",
  "regard",
  "troupeau",
  "idee",
  "loups",
  "gel",
  "secheresse",
  "fievre",
  "secousse",
  "epiphanie",
  "guerre",
  "apaiser",
] as const;
export type Pouvoir = (typeof POUVOIRS)[number];

export interface FichePouvoir {
  readonly nom: string;
  readonly emoji: string;
  /** Coût en faveur (✦). */
  readonly cout: number;
  /** Ce qu'il faut viser : une tuile, une personne, un bâtiment (feu ou autre). */
  readonly cible: "tuile" | "personnage" | "batiment";
  /** Rayon d'effet en tuiles (0 : la cible seule). */
  readonly rayon: number;
  /** Jours de recharge avant de pouvoir l'exercer de nouveau. */
  readonly rechargeJours: number;
  /** Bienfait (les témoins remercient) ou épreuve (ils craignent). */
  readonly bienfait: boolean;
  readonly description: string;
}

export const FICHES_POUVOIR: Readonly<Record<Pouvoir, FichePouvoir>> = {
  pluie: {
    nom: "Ondée",
    emoji: "🌧️",
    cout: 6,
    cible: "tuile",
    rayon: 8,
    rechargeJours: 2,
    bienfait: true,
    description: "Il pleut aujourd'hui ; les baies et les fibres alentour repoussent d'un coup.",
  },
  eclaircie: {
    nom: "Éclaircie",
    emoji: "☀️",
    cout: 8,
    cible: "tuile",
    rayon: 0,
    rechargeJours: 2,
    bienfait: true,
    description: "Le ciel se dégage : plus d'orage ni de neige pour la journée.",
  },
  seve: {
    nom: "Sève",
    emoji: "🌱",
    cout: 12,
    cible: "tuile",
    rayon: 6,
    rechargeJours: 4,
    bienfait: true,
    description:
      "Les gisements alentour se remplissent, les souches repoussent, le poisson revient.",
  },
  souffle: {
    nom: "Souffle",
    emoji: "🍃",
    cout: 4,
    cible: "personnage",
    rayon: 0,
    rechargeJours: 1,
    bienfait: true,
    description: "Trois jours de courage : le moral remonte, la fatigue s'envole.",
  },
  guerison: {
    nom: "Main qui guérit",
    emoji: "✨",
    cout: 14,
    cible: "personnage",
    rayon: 0,
    rechargeJours: 3,
    bienfait: true,
    description: "Les plaies se ferment, la fièvre tombe, la santé revient.",
  },
  braise: {
    nom: "Braise",
    emoji: "🔥",
    cout: 5,
    cible: "batiment",
    rayon: 0,
    rechargeJours: 1,
    bienfait: true,
    description: "Un feu se rallume avec vingt bûches ; un autre bâtiment se consolide.",
  },
  foudre: {
    nom: "Foudre",
    emoji: "⚡",
    cout: 15,
    cible: "tuile",
    rayon: 1,
    rechargeJours: 3,
    bienfait: false,
    description: "La foudre frappe : bâtiment ébranlé, gens brûlés, tout le monde effrayé.",
  },
  songe: {
    nom: "Songe",
    emoji: "🌙",
    cout: 10,
    cible: "personnage",
    rayon: 0,
    rechargeJours: 3,
    bienfait: true,
    description: "Une leçon apprise en rêve, celle qui manque le plus à cette personne.",
  },
  regard: {
    nom: "Regard",
    emoji: "👁️",
    cout: 2,
    cible: "tuile",
    rayon: 12,
    rechargeJours: 0,
    bienfait: true,
    description: "Le brouillard se lève sur les alentours (la colonie ne le sait pas).",
  },
  troupeau: {
    nom: "Troupeau offert",
    emoji: "🐏",
    cout: 16,
    cible: "tuile",
    rayon: 0,
    rechargeJours: 10,
    bienfait: true,
    description: "Quatre mouflons paissent ici : de la viande, ou des bêtes à apprivoiser.",
  },
  idee: {
    nom: "Idée soufflée",
    emoji: "💡",
    cout: 12,
    cible: "personnage",
    rayon: 0,
    rechargeJours: 3,
    bienfait: true,
    description: "Une personne a soudain l'idée de l'invention qui lui manque.",
  },
  loups: {
    nom: "Loups au bord du halo",
    emoji: "🐺",
    cout: 12,
    cible: "tuile",
    rayon: 0,
    rechargeJours: 5,
    bienfait: false,
    description: "Une meute affamée arrive ici et menacera le village dès ce soir.",
  },
  guerre: {
    nom: "Sonner la guerre",
    emoji: "⚔️",
    cout: 16,
    cible: "tuile",
    rayon: 0,
    rechargeJours: 6,
    bienfait: false,
    description:
      "Le village le plus proche entre en guerre avec son pire voisin et sa troupe part sur-le-champ.",
  },
  apaiser: {
    nom: "Apaiser",
    emoji: "🕊️",
    cout: 10,
    cible: "tuile",
    rayon: 8,
    rechargeJours: 3,
    bienfait: true,
    description:
      "La bataille en cours s'arrête, chacun rentre ; sans bataille, le village le plus proche fait la paix.",
  },
  gel: {
    nom: "Gel précoce",
    emoji: "❄️",
    cout: 18,
    cible: "tuile",
    rayon: 0,
    rechargeJours: 8,
    bienfait: false,
    description: "Trois jours de neige, quelle que soit la saison : les feux dévorent le bois.",
  },
  secheresse: {
    nom: "Sécheresse",
    emoji: "🌵",
    cout: 20,
    cible: "tuile",
    rayon: 12,
    rechargeJours: 10,
    bienfait: false,
    description: "Dix jours de canicule ; baies, fibres et poissons alentour réduits de moitié.",
  },
  fievre: {
    nom: "Fièvre envoyée",
    emoji: "🤒",
    cout: 10,
    cible: "personnage",
    rayon: 0,
    rechargeJours: 5,
    bienfait: false,
    description: "La fièvre des eaux prend cette personne (une semaine, immunité après).",
  },
  secousse: {
    nom: "Secousse",
    emoji: "🌋",
    cout: 22,
    cible: "tuile",
    rayon: 6,
    rechargeJours: 12,
    bienfait: false,
    description: "La terre tremble : bâtiments ébranlés à six tuiles, fractures, peur à douze.",
  },
  epiphanie: {
    nom: "Épiphanie",
    emoji: "🌟",
    cout: 30,
    cible: "personnage",
    rayon: 8,
    rechargeJours: 20,
    bienfait: true,
    description:
      "Cette personne gagne un niveau dans ce qu'elle sait le mieux faire, et l'on fête ça.",
  },
};

/** Niveaux de culte (foi moyenne des adultes) : 0 « personne ne prie », 1 « on prie », 2 « un culte », 3 « la dévotion ». */
export const NOMS_CULTE = ["personne ne prie", "on prie", "un culte", "la dévotion"] as const;

/** Ce qu'une prière demande, et les pouvoirs qui l'exaucent. */
export const SUJETS_PRIERE = ["faim", "froid", "soin", "securite", "moral", "protection"] as const;
export type SujetPriere = (typeof SUJETS_PRIERE)[number];
export const POUVOIRS_EXAUCANT: Readonly<Record<SujetPriere, readonly Pouvoir[]>> = {
  faim: ["pluie", "seve", "troupeau"],
  froid: ["eclaircie", "braise"],
  soin: ["guerison"],
  securite: ["souffle", "braise"],
  moral: ["souffle"],
  protection: ["souffle", "braise", "eclaircie"],
};

/** Une prière en attente : la quête que le ciel peut exaucer dans les trois jours. */
export interface PriereEtat {
  readonly personnageId: string;
  readonly prenom: string;
  readonly sujet: SujetPriere;
  readonly tick: number;
  readonly autel: boolean;
  readonly x: number;
  readonly y: number;
}

export interface FaveurEtat {
  readonly valeur: number;
  readonly max: number;
  /** Par pouvoir, tick à partir duquel il redevient disponible. */
  readonly recharges: Readonly<Record<string, number>>;
  /** Miracles exercés depuis le début. */
  readonly miracles: number;
  /** Réputation du dieu −10..10 : les bienfaits la font monter, les épreuves la font chuter. */
  readonly reputation: number;
  /** Prières entendues, offrandes reçues, prières exaucées. */
  readonly prieres: number;
  readonly offrandes: number;
  readonly exaucees: number;
  /** Providence : le ciel répond de lui-même aux prières, avec la faveur disponible. */
  readonly providence: boolean;
  /** Niveau de culte 0..3 (foi moyenne des adultes) ; chaque niveau ajoute dix à la faveur maximale. */
  readonly culte: number;
  /** Le domaine du ciel (M25), ou null tant qu'il n'est pas choisi. */
  readonly domaine: Domaine | null;
  /** Rang du ciel 0..3 : le culte, plus un à l'âge du cuivre. Ouvre les paliers de pouvoirs. */
  readonly rang: number;
  /** Par pouvoir, le coût effectif (domaine et usages de la saison compris). */
  readonly couts: Readonly<Record<string, number>>;
  /** Par pouvoir, le rang requis (domaine compris ; tout à 0 pour un ciel sans visage). */
  readonly verrous: Readonly<Record<string, number>>;
}

/** Contexte d'une demande de conseil, construit par le moteur (jamais par la page). */
export interface ContexteConseil {
  readonly prenom: string;
  readonly nomFamille: string;
  readonly sexe: "F" | "M";
  readonly stade: string;
  readonly ageAnnees: number;
  readonly motto: string;
  readonly valeurs: readonly string[];
  readonly traits: readonly string[];
  readonly besoins: BesoinsEtat;
  readonly inconfort: {
    readonly joursFaim: number;
    readonly joursFroid: number;
    readonly joursMoralBas: number;
    readonly echecsConsecutifs: number;
    readonly dernierEchec: string | null;
  };
  readonly moment: { readonly saison: string; readonly jourAbsolu: number; readonly meteo: string };
  readonly village: {
    readonly batiments: Readonly<Record<string, number>>;
    readonly chantiers: readonly string[];
    readonly stocks: Readonly<Record<string, number>>;
    readonly famille: number;
    readonly enfants: number;
  };
  readonly savoirs: readonly string[];
  readonly ideesEnCours: readonly string[];
  readonly souvenirs: readonly string[];
}

/** Une option du catalogue fermé (`invention:fumoir`, `batiment:puits`, `priorite:provisions`…). */
export interface OptionConseil {
  readonly id: string;
  readonly libelle: string;
  readonly pourquoi: string;
}

/** Une question ouverte d'un personnage à Claude (au plus une à la fois). */
export interface QuestionConseil {
  readonly id: string;
  readonly personnageId: string;
  readonly tick: number;
  readonly expireA: number;
  readonly motifs: readonly string[];
  readonly contexte: ContexteConseil;
  readonly options: readonly OptionConseil[];
}

export interface AmbitionFiche {
  readonly genre: string;
  readonly cible: string;
  readonly but: string;
  readonly pensee: string;
  readonly joursRestants: number;
  readonly issue: "en_cours" | "accomplie" | "abandonnee";
}

export interface AmbitionStat {
  readonly personnageId: string;
  readonly prenom: string;
  readonly nomFamille: string;
  readonly cible: string;
  readonly but: string;
  readonly joursRestants: number;
}

export interface MessageEtat {
  readonly type: "etat";
  readonly tick: number;
  readonly moment: MomentEtat;
  readonly meteo: string;
  readonly ticksParSeconde: number;
  /** Ticks réellement simulés par seconde quand la page n'arrive pas à suivre (mode local). */
  readonly vitesseEffective?: number;
  readonly pause: boolean;
  readonly personnages: readonly PersonnageEtat[];
  readonly batiments: readonly BatimentEtat[];
  readonly troupeaux: readonly TroupeauEtat[];
  /** Différentiel depuis le dernier état envoyé à ce client (complet au premier envoi). */
  readonly gisements: readonly GisementEtat[];
  readonly evenements: readonly EvenementEtat[];
  readonly stats: Statistiques;
  /**
   * Tuiles nouvellement découvertes, par triplets `x, y, code de biome` (index
   * dans `nomsBiomes`) ; toutes au premier envoi. La carte se construit ainsi
   * au fil des découvertes : le viewer ne connaît que ce que la colonie a vu.
   */
  readonly decouvertes: readonly number[];
  /** Rayon de vision courant des personnages, en tuiles (jour / nuit, météo). */
  readonly rayonVision: number;
  /** Mode Dieu : la faveur disponible et les recharges. */
  readonly faveur: FaveurEtat;
  /** Questions ouvertes à Claude (au plus une). */
  readonly questions: readonly QuestionConseil[];
  /** Prières en attente (trois jours au plus), les plus récentes d'abord. */
  readonly prieres: readonly PriereEtat[];
  /** La société du village. */
  readonly societe: SocieteEtat;
  /** La mémoire collective : légendes, lieux nommés, proverbes. */
  readonly chronique: ChroniqueEtat;
  /** Les villages : schismes, bandes, caravanes, diplomatie. */
  readonly villages: VillagesEtat;
  /** Les lois du monde en vigueur (M25). */
  readonly lois: LoisEtat;
  /** Les créatures du ciel en ce moment (M25). */
  readonly creatures: readonly CreatureEtat[];
  /** Le conteur (M25) : phase, tension, actes, chroniques. */
  readonly conteur: ConteurEtat;
  /** Les buts (M26) : succès, scénario, prophéties. */
  readonly buts: ButsEtat;
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
  /** Réécrit par la mémoire qui déforme (jalon 14). */
  readonly altere?: boolean;
}

export interface PersonneCourte {
  readonly id: string;
  readonly prenom: string;
  readonly vivant: boolean;
}

export interface BlessureFiche {
  readonly type: string;
  readonly gravite: number;
  readonly lieu: string;
  readonly jours: number;
  readonly saigne: boolean;
  readonly bandee: boolean;
  readonly infectee: boolean;
  readonly immobilisee: boolean;
}

export interface CorpsFiche {
  readonly fatigue: number;
  readonly epuise: boolean;
  readonly blessures: readonly BlessureFiche[];
  readonly carence: string | null;
  readonly handicaps: readonly string[];
  readonly cicatrices: number;
  readonly maladies: readonly { readonly nom: string; readonly joursRestants: number }[];
  readonly capacites: {
    readonly mobilite: number;
    readonly manipulation: number;
    readonly vue: number;
    readonly vigueur: number;
  };
}

export interface HumeurFiche {
  readonly cle: string;
  readonly valeur: number;
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
  /** Vrai quand la pensée vient de Claude (M5) et non des règles. */
  readonly penseeDeClaude: boolean;
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
  readonly savoirs: readonly SavoirFiche[];
  readonly corps: CorpsFiche;
  readonly humeur: readonly HumeurFiche[];
  readonly metier: string | null;
  /** Ambition en cours ou dernière issue (conseil de Claude). */
  readonly ambition: AmbitionFiche | null;
  /** Le bouton « Demander conseil » est-il possible maintenant ? */
  readonly conseilPossible: boolean;
  /** La question ouverte, ou le dernier conseil demandé (question, options, réponse). */
  readonly conseil: ConseilFiche | null;
  readonly foi: number;
  readonly priere: {
    readonly sujet: SujetPriere;
    readonly tick: number;
    readonly exaucee: boolean;
    readonly autel: boolean;
  } | null;
  /** La société : prestige, notable, maître, exil, rancunes et haines. */
  readonly prestige: number;
  readonly notable: boolean;
  readonly maitre: PersonneCourte | null;
  readonly apprentis: readonly PersonneCourte[];
  readonly banni: { readonly joursRestants: number; readonly motif: string } | null;
  readonly rancunes: readonly {
    readonly id: string;
    readonly prenom: string;
    readonly rancune: number;
    readonly haine: boolean;
  }[];
  readonly traumatise: boolean;
  /** La psyché (jalon 14). */
  readonly psyche: PsycheFiche;
}

export interface PsycheFiche {
  readonly stress: number;
  readonly abattu: boolean;
  readonly ennui: number;
  readonly sens: number;
  readonly objectif: {
    readonly but: string;
    readonly joursRestants: number;
    readonly progres: number;
    readonly issue: "en_cours" | "accompli" | "manque";
  } | null;
  readonly reve: { readonly tick: number; readonly texte: string } | null;
  readonly attachement: { readonly lieu: string | null; readonly objet: string | null };
  readonly lieuxEvites: readonly { readonly motif: string; readonly joursRestants: number }[];
  readonly deuils: readonly { readonly prenom: string; readonly jours: number }[];
  /** Ce que la personnalité a bougé depuis le départ (par trait, en centièmes). */
  readonly derive: Readonly<Record<string, number>>;
}

export interface ConseilFiche {
  readonly questionId: string;
  readonly etat: "ouverte" | "repondue" | "sans_suite";
  readonly tick: number;
  readonly motifs: readonly string[];
  readonly options: readonly OptionConseil[];
  readonly choix: string | null;
  readonly libelle: string | null;
  readonly pensee: string;
  readonly but: string | null;
  readonly raison: string | null;
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
  | { readonly type: "fermer_fiche" }
  /** Cerveau Claude (M5) : un texte soufflé au moteur, qui reste maître de l'appliquer. */
  | {
      readonly type: "inspiration";
      readonly genre: "pensee" | "recit" | "epitaphe";
      readonly personnageId: string;
      readonly texte: string;
      readonly savoir?: string;
    }
  /** Mode Dieu : exercer un pouvoir sur une tuile, une personne ou un bâtiment. */
  | {
      readonly type: "pouvoir";
      readonly pouvoir: Pouvoir;
      readonly x: number;
      readonly y: number;
      readonly cibleId?: string;
    }
  /** Réponse de Claude à une question ouverte : un choix du catalogue, une pensée, une ambition. */
  | {
      readonly type: "conseil";
      readonly questionId: string;
      readonly personnageId: string;
      readonly choix: string;
      readonly pensee: string;
      readonly ambition?: { readonly but: string; readonly jours: number };
    }
  /** L'observateur demande qu'un personnage pose sa question à Claude. */
  | { readonly type: "demander_conseil"; readonly id: string }
  /** Providence : répondre automatiquement aux prières (ou cesser). */
  | { readonly type: "providence"; readonly actif: boolean }
  /** Sculpter le monde (M25) : un pinceau en disque sur la carte. */
  | {
      readonly type: "sculpter";
      readonly pinceau: Pinceau;
      readonly x: number;
      readonly y: number;
      readonly rayon: number;
    }
  /** Poser un peuple (M25) : de nouvelles familles fondent leur village au point choisi. */
  | { readonly type: "peupler"; readonly x: number; readonly y: number; readonly taille: number }
  /** Une loi du monde (M25) : la suspendre ou la rétablir. */
  | { readonly type: "loi"; readonly loi: Loi; readonly actif: boolean }
  /** Choisir le domaine du ciel (M25), une fois pour toutes. */
  | { readonly type: "domaine"; readonly domaine: Domaine }
  /** Invoquer une créature du domaine (M25) : un gardien à poster, un fléau à lâcher. */
  | {
      readonly type: "creature";
      readonly genre: GenreCreature;
      readonly x: number;
      readonly y: number;
    };

/** Les domaines du ciel (M25, façon Age of Mythology) : une identité qui colore les pouvoirs. */
export const DOMAINES = ["moisson", "orage", "feu", "songes"] as const;
export type Domaine = (typeof DOMAINES)[number];

export interface FicheCreature {
  readonly nom: string;
  readonly emoji: string;
  readonly description: string;
}

export interface FicheDomaine {
  readonly nom: string;
  readonly titre: string;
  readonly emoji: string;
  readonly description: string;
  /** Pouvoirs favoris : un palier plus tôt, moins chers. */
  readonly pouvoirs: readonly Pouvoir[];
  /** Le domaine opposé : ses pouvoirs favoris viennent plus tard et coûtent plus cher. */
  readonly etranger: Domaine;
  /** Les créatures du domaine : un gardien qui protège, un fléau qu'on envoie. */
  readonly gardien: FicheCreature;
  readonly fleau: FicheCreature;
}

export const FICHES_DOMAINE: Readonly<Record<Domaine, FicheDomaine>> = {
  moisson: {
    nom: "Moisson",
    titre: "le Semeur",
    emoji: "🌾",
    description: "Pluies, sève, troupeaux et guérisons : un ciel qui nourrit.",
    pouvoirs: ["pluie", "seve", "troupeau", "eclaircie", "guerison"],
    etranger: "feu",
    gardien: {
      nom: "le Cerf d'or",
      emoji: "🦌",
      description: "Il se poste où on le pose : les meutes et les bandes rebroussent chemin.",
    },
    fleau: {
      nom: "la Nuée",
      emoji: "🦗",
      description: "Elle rôde et dévore les gisements ; on la craint.",
    },
  },
  orage: {
    nom: "Orage",
    titre: "le Tonnant",
    emoji: "⚡",
    description: "Foudre, gel, secousses : un ciel qui gronde.",
    pouvoirs: ["foudre", "gel", "secousse", "pluie", "souffle"],
    etranger: "songes",
    gardien: {
      nom: "le Griffon",
      emoji: "🦅",
      description: "Il veille du haut du ciel : rien d'hostile n'approche son poste.",
    },
    fleau: {
      nom: "la Tourmente",
      emoji: "🌪️",
      description: "Un vent vivant qui disperse bêtes et réserves.",
    },
  },
  feu: {
    nom: "Feu",
    titre: "la Braise",
    emoji: "🔥",
    description: "Braises, sécheresse, fièvres : un ciel qui éprouve.",
    pouvoirs: ["braise", "secheresse", "fievre", "foudre", "loups", "guerre"],
    etranger: "moisson",
    gardien: {
      nom: "la Salamandre",
      emoji: "🦎",
      description: "Elle garde le feu du village et brûle ce qui s'en approche.",
    },
    fleau: {
      nom: "le Brasier errant",
      emoji: "☄️",
      description: "Il ravage les gisements sur son passage.",
    },
  },
  songes: {
    nom: "Songes",
    titre: "le Veilleur",
    emoji: "🌙",
    description: "Rêves, idées, épiphanies : un ciel qui murmure.",
    pouvoirs: ["songe", "idee", "epiphanie", "regard", "guerison", "apaiser"],
    etranger: "orage",
    gardien: {
      nom: "le Sphinx",
      emoji: "🦁",
      description: "Il garde son poste d'un regard : les menaces s'en détournent.",
    },
    fleau: {
      nom: "le Cauchemar",
      emoji: "👁️",
      description: "Il hante les nuits alentour ; le moral s'effondre.",
    },
  },
};

/** Palier de rang requis pour chaque pouvoir (0 : dès le départ ; 3 : la dévotion). */
export const NIVEAU_POUVOIR: Readonly<Record<Pouvoir, number>> = {
  pluie: 0,
  eclaircie: 0,
  seve: 0,
  souffle: 0,
  guerison: 0,
  regard: 0,
  braise: 0,
  foudre: 1,
  songe: 1,
  troupeau: 1,
  idee: 1,
  gel: 1,
  secheresse: 2,
  fievre: 2,
  loups: 2,
  secousse: 2,
  epiphanie: 3,
  guerre: 2,
  apaiser: 1,
};
/** Rang maximal du ciel (culte 3, ou culte 2 et l'âge du cuivre). */
export const RANG_MAX = 3;
/** Multiplicateur de coût des pouvoirs favoris et étrangers au domaine. */
export const COUT_FAVORI = 0.6;
export const COUT_ETRANGER = 1.25;
/** Chaque usage dans la saison renchérit le pouvoir d'un quart, jusqu'au double. */
export const COUT_PAR_USAGE = 0.25;
export const USAGES_MAX = 4;

export const GENRES_CREATURE = ["gardien", "fleau"] as const;
export type GenreCreature = (typeof GENRES_CREATURE)[number];
/** Faveur qu'une créature coûte, rang requis, jours qu'elle reste. */
export const COUT_CREATURE = 30;
export const RANG_CREATURE = 2;
export const DUREE_CREATURE_JOURS = 20;

export interface CreatureEtat {
  readonly id: string;
  readonly genre: GenreCreature;
  readonly domaine: Domaine;
  readonly nom: string;
  readonly emoji: string;
  readonly x: number;
  readonly y: number;
  readonly joursRestants: number;
}

/** Les buts (M26) : succès, scénarios, prophéties. */
export const SUCCES = [
  "un_toit",
  "premier_feu",
  "dix_berceaux",
  "an_deux",
  "an_cinq",
  "an_dix",
  "vingt_ames",
  "cinquante_ames",
  "cent_ames",
  "troisieme_generation",
  "age_du_cuivre",
  "une_legende",
  "une_coutume",
  "second_village",
  "une_alliance",
  "priere_exaucee",
  "main_du_ciel",
  "creature",
  "loups_repousses",
  "raid_repousse",
] as const;
export type Succes = (typeof SUCCES)[number];

export interface FicheSucces {
  readonly nom: string;
  readonly emoji: string;
  readonly description: string;
}

export const FICHES_SUCCES: Readonly<Record<Succes, FicheSucces>> = {
  un_toit: { nom: "Un toit", emoji: "🏠", description: "Le premier bâtiment est achevé." },
  premier_feu: {
    nom: "Le premier feu",
    emoji: "🔥",
    description: "Un feu de camp brûle au village.",
  },
  dix_berceaux: { nom: "Dix berceaux", emoji: "👶", description: "Dix enfants sont nés." },
  an_deux: { nom: "L'an deux", emoji: "🌱", description: "La colonie passe sa première année." },
  an_cinq: { nom: "L'an cinq", emoji: "🌳", description: "Cinq années, et des vivants." },
  an_dix: { nom: "L'an dix", emoji: "🏛️", description: "Dix années : le village est installé." },
  vingt_ames: { nom: "Vingt âmes", emoji: "👥", description: "Vingt habitants vivent ensemble." },
  cinquante_ames: { nom: "Cinquante âmes", emoji: "🏘️", description: "Cinquante habitants." },
  cent_ames: { nom: "Cent âmes", emoji: "🏙️", description: "Cent habitants : une petite cité." },
  troisieme_generation: {
    nom: "La troisième génération",
    emoji: "🧬",
    description: "Des petits-enfants des fondateurs sont nés.",
  },
  age_du_cuivre: {
    nom: "L'âge du cuivre",
    emoji: "⛏️",
    description: "Le premier cuivre est fondu.",
  },
  une_legende: { nom: "Une légende", emoji: "📖", description: "Un récit est devenu légende." },
  une_coutume: { nom: "Une coutume", emoji: "📜", description: "Une leçon est devenue coutume." },
  second_village: {
    nom: "Le second village",
    emoji: "🏕️",
    description: "Deux villages sur la carte.",
  },
  une_alliance: { nom: "Une alliance", emoji: "🤝", description: "Deux villages se sont alliés." },
  priere_exaucee: { nom: "Une prière exaucée", emoji: "🙏", description: "Le ciel a répondu." },
  main_du_ciel: { nom: "La main du ciel", emoji: "✨", description: "Dix miracles." },
  creature: { nom: "La créature", emoji: "🦌", description: "Un gardien ou un fléau est venu." },
  loups_repousses: {
    nom: "Face aux loups",
    emoji: "🐺",
    description: "Trois combats contre les meutes.",
  },
  raid_repousse: {
    nom: "La bande repart",
    emoji: "🛡️",
    description: "Une bande a quitté le village.",
  },
};

export const SCENARIOS = [
  "an_dix",
  "cuivre_an_cinq",
  "une_legende",
  "trois_villages",
  "cent_ames",
] as const;
export type Scenario = (typeof SCENARIOS)[number];

export interface FicheScenario {
  readonly nom: string;
  readonly description: string;
  /** Année limite (le scénario est perdu au premier jour de cette année). */
  readonly anneesLimite: number;
}

export const FICHES_SCENARIO: Readonly<Record<Scenario, FicheScenario>> = {
  an_dix: {
    nom: "Passez l'an dix",
    description: "Qu'il reste des vivants à l'an dix.",
    anneesLimite: 10,
  },
  cuivre_an_cinq: {
    nom: "Le cuivre avant l'an cinq",
    description: "Fondre le premier cuivre avant l'an cinq.",
    anneesLimite: 5,
  },
  une_legende: {
    nom: "Faites naître une légende",
    description: "Qu'un récit devienne légende avant l'an trois.",
    anneesLimite: 3,
  },
  trois_villages: {
    nom: "Trois villages en paix",
    description: "Trois villages sur la carte, sans guerre, avant l'an huit.",
    anneesLimite: 8,
  },
  cent_ames: {
    nom: "Cent âmes",
    description: "Cent habitants avant l'an douze.",
    anneesLimite: 12,
  },
};

export interface SuccesEtat {
  readonly id: Succes;
  readonly nom: string;
  readonly emoji: string;
  readonly description: string;
  /** Jour du déblocage, ou null. */
  readonly jour: number | null;
}

export interface ScenarioEtat {
  readonly id: Scenario;
  readonly nom: string;
  readonly description: string;
  readonly etat: "en_cours" | "gagne" | "perdu";
  readonly progres: number;
  readonly texte: string;
  readonly finJour: number;
  readonly jourIssue: number | null;
}

export interface ProphetieEtat {
  readonly id: string;
  readonly texte: string;
  readonly jour: number;
  readonly finJour: number;
  readonly etat: "ouverte" | "accomplie" | "manquee";
}

export interface ButsEtat {
  readonly succes: readonly SuccesEtat[];
  readonly scenario: ScenarioEtat | null;
  /** Les prophéties, la plus récente d'abord. */
  readonly propheties: readonly ProphetieEtat[];
}

/** Le conteur (M25) : la courbe de tension et ses chroniques. */
export type PhaseConteurEtat = "calme" | "montee" | "crise" | "repit";
export const LIBELLES_PHASE: Readonly<Record<PhaseConteurEtat, string>> = {
  calme: "calme",
  montee: "montée",
  crise: "crise",
  repit: "répit",
};
export interface ActeConteurEtat {
  readonly jour: number;
  readonly genre: string;
  readonly bienfait: boolean;
  readonly texte: string;
}
export interface ChroniqueAnneeEtat {
  readonly annee: number;
  readonly titre: string;
  readonly texte: string;
  readonly tick: number;
}
export interface ConteurEtat {
  readonly phase: PhaseConteurEtat;
  readonly tension: number;
  readonly pression: number;
  readonly joursDansPhase: number;
  readonly crises: number;
  readonly bienfaits: number;
  /** Les derniers actes, le plus récent d'abord. */
  readonly actes: readonly ActeConteurEtat[];
  /** Les chroniques de fin d'année, la plus récente d'abord. */
  readonly chroniques: readonly ChroniqueAnneeEtat[];
}

/** Les lois du monde (M25) : ce que l'observateur peut suspendre. */
export const LOIS = [
  "faim",
  "maladies",
  "betes",
  "raids",
  "schismes",
  "vieillesse",
  "conteur",
  "guerres",
] as const;
export type Loi = (typeof LOIS)[number];
export type LoisEtat = Readonly<Record<Loi, boolean>>;

export interface FicheLoi {
  readonly nom: string;
  readonly emoji: string;
  readonly description: string;
}

export const FICHES_LOI: Readonly<Record<Loi, FicheLoi>> = {
  faim: {
    nom: "La faim tue",
    emoji: "🍖",
    description: "Sans elle, un ventre vide n'entame plus la santé (la soif et le froid, si).",
  },
  maladies: {
    nom: "Les maladies",
    emoji: "🤒",
    description:
      "Sans elles, personne ne tombe plus malade ; les malades guérissent à leur rythme.",
  },
  betes: {
    nom: "Les bêtes attaquent",
    emoji: "🐺",
    description: "Sans elle, les meutes rôdent mais n'attaquent plus le village.",
  },
  raids: {
    nom: "Les raids",
    emoji: "⚔️",
    description: "Sans eux, aucune bande ne vient piller les réserves.",
  },
  schismes: {
    nom: "Les schismes",
    emoji: "🏕️",
    description: "Sans eux, aucune faction ne part fonder son village ailleurs.",
  },
  vieillesse: {
    nom: "La mort de vieillesse",
    emoji: "🕯️",
    description: "Sans elle, les anciens ne meurent plus de leur âge.",
  },
  conteur: {
    nom: "Le conteur",
    emoji: "🎭",
    description:
      "Sans lui, plus d'épreuves ni de bienfaits scénarisés, ni de chronique : le monde suit son cours.",
  },
  guerres: {
    nom: "Les guerres",
    emoji: "⚔️",
    description:
      "Sans elles, aucun village ne déclare la guerre, et celles en cours se règlent par la paix à l'aube.",
  },
};

/** Les lois telles qu'un monde naît : toutes en vigueur. */
export function loisParDefaut(): Record<Loi, boolean> {
  return {
    faim: true,
    maladies: true,
    betes: true,
    raids: true,
    schismes: true,
    vieillesse: true,
    conteur: true,
    guerres: true,
  };
}

/** Les pinceaux du ciel (M25) : ce qu'ils posent, dans l'ordre de la palette. */
export const PINCEAUX = ["terre", "eau", "foret", "montagne", "sable"] as const;
export type Pinceau = (typeof PINCEAUX)[number];

export interface FichePinceau {
  readonly nom: string;
  readonly emoji: string;
  readonly description: string;
}

export const FICHES_PINCEAU: Readonly<Record<Pinceau, FichePinceau>> = {
  terre: { nom: "Terre", emoji: "🟩", description: "De la prairie : on y bâtit, on y cultive." },
  eau: {
    nom: "Eau",
    emoji: "🟦",
    description: "Un lac ou un bras de mer : à boire, du poisson, et une frontière.",
  },
  foret: {
    nom: "Forêt",
    emoji: "🌲",
    description: "Du bois et des baies, mais on y voit moins loin.",
  },
  montagne: {
    nom: "Montagne",
    emoji: "⛰️",
    description: "Pierre et minerai au cœur, collines en lisière ; on n'y bâtit pas.",
  },
  sable: { nom: "Sable", emoji: "🟨", description: "Une plage : de l'argile pour les potiers." },
};

/** Rayon maximal d'un coup de pinceau, en tuiles. */
export const RAYON_PINCEAU_MAX = 6;
/** Tailles de peuple proposées par l'interface. */
export const TAILLES_PEUPLE: readonly number[] = [6, 12, 24, 36, 48];
/** Faveur que coûte un peuple posé par le ciel dans un monde déjà habité (gratuit s'il est vide). */
export const COUT_PEUPLE = 25;

/** Vitesses proposées par l'interface (ticks de jeu par seconde réelle). */
export const VITESSES: readonly number[] = [1, 4, 16, 64, 128, 256];

/** Analyse une commande reçue (JSON) ; renvoie `null` si elle est invalide. */
export function analyserCommande(texte: string): Commande | null {
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return null;
  }
  if (typeof brut !== "object" || brut === null || !("type" in brut)) return null;
  const c = brut as {
    type: unknown;
    ticksParSeconde?: unknown;
    id?: unknown;
    genre?: unknown;
    personnageId?: unknown;
    texte?: unknown;
    savoir?: unknown;
    pouvoir?: unknown;
    x?: unknown;
    y?: unknown;
    cibleId?: unknown;
    questionId?: unknown;
    choix?: unknown;
    pensee?: unknown;
    ambition?: unknown;
    actif?: unknown;
    pinceau?: unknown;
    rayon?: unknown;
    taille?: unknown;
    loi?: unknown;
    domaine?: unknown;
  };
  const coordonnees = Number.isInteger(c.x) && Number.isInteger(c.y);
  const dansLeMonde =
    coordonnees && Math.abs(c.x as number) <= 100_000 && Math.abs(c.y as number) <= 100_000;
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
    case "inspiration": {
      const genre = c.genre;
      if (genre !== "pensee" && genre !== "recit" && genre !== "epitaphe") return null;
      if (typeof c.personnageId !== "string" || c.personnageId.length === 0) return null;
      if (typeof c.texte !== "string" || c.texte.length === 0 || c.texte.length > 2000) return null;
      return {
        type: "inspiration",
        genre,
        personnageId: c.personnageId,
        texte: c.texte,
        ...(typeof c.savoir === "string" ? { savoir: c.savoir } : {}),
      };
    }
    case "sculpter": {
      const pinceau = c.pinceau;
      if (typeof pinceau !== "string" || !(PINCEAUX as readonly string[]).includes(pinceau))
        return null;
      if (!dansLeMonde || !Number.isInteger(c.rayon)) return null;
      const rayon = c.rayon as number;
      if (rayon < 0 || rayon > RAYON_PINCEAU_MAX) return null;
      return {
        type: "sculpter",
        pinceau: pinceau as Pinceau,
        x: c.x as number,
        y: c.y as number,
        rayon,
      };
    }
    case "domaine": {
      const domaine = c.domaine;
      if (typeof domaine !== "string" || !(DOMAINES as readonly string[]).includes(domaine))
        return null;
      return { type: "domaine", domaine: domaine as Domaine };
    }
    case "creature": {
      const genre = c.genre;
      if (typeof genre !== "string" || !(GENRES_CREATURE as readonly string[]).includes(genre))
        return null;
      if (!dansLeMonde) return null;
      return {
        type: "creature",
        genre: genre as GenreCreature,
        x: c.x as number,
        y: c.y as number,
      };
    }
    case "loi": {
      const loi = c.loi;
      if (typeof loi !== "string" || !(LOIS as readonly string[]).includes(loi)) return null;
      if (typeof c.actif !== "boolean") return null;
      return { type: "loi", loi: loi as Loi, actif: c.actif };
    }
    case "peupler": {
      if (!dansLeMonde || !Number.isInteger(c.taille)) return null;
      const taille = c.taille as number;
      if (taille < 1 || taille > 48) return null;
      return { type: "peupler", x: c.x as number, y: c.y as number, taille };
    }
    case "pouvoir": {
      const pouvoir = c.pouvoir;
      if (typeof pouvoir !== "string" || !(POUVOIRS as readonly string[]).includes(pouvoir))
        return null;
      if (!dansLeMonde) return null;
      return {
        type: "pouvoir",
        pouvoir: pouvoir as Pouvoir,
        x: c.x as number,
        y: c.y as number,
        ...(typeof c.cibleId === "string" && c.cibleId.length > 0 && c.cibleId.length < 64
          ? { cibleId: c.cibleId }
          : {}),
      };
    }
    case "conseil": {
      if (typeof c.questionId !== "string" || c.questionId.length === 0 || c.questionId.length > 96)
        return null;
      if (typeof c.personnageId !== "string" || c.personnageId.length === 0) return null;
      if (typeof c.choix !== "string" || c.choix.length === 0 || c.choix.length >= 64) return null;
      if (typeof c.pensee !== "string" || c.pensee.length > 600) return null;
      let ambition: { but: string; jours: number } | undefined;
      if (c.ambition !== undefined && c.ambition !== null) {
        if (typeof c.ambition !== "object") return null;
        const a = c.ambition as { but?: unknown; jours?: unknown };
        if (typeof a.but !== "string" || a.but.length === 0 || a.but.length > 200) return null;
        if (!Number.isInteger(a.jours) || (a.jours as number) < 1 || (a.jours as number) > 30)
          return null;
        ambition = { but: a.but, jours: a.jours as number };
      }
      return {
        type: "conseil",
        questionId: c.questionId,
        personnageId: c.personnageId,
        choix: c.choix,
        pensee: c.pensee,
        ...(ambition !== undefined ? { ambition } : {}),
      };
    }
    case "demander_conseil":
      return typeof c.id === "string" && c.id.length > 0 && c.id.length < 64
        ? { type: "demander_conseil", id: c.id }
        : null;
    case "providence":
      return typeof c.actif === "boolean" ? { type: "providence", actif: c.actif } : null;
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
