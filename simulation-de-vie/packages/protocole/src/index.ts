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
  | { readonly type: "providence"; readonly actif: boolean };

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
  };
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
    case "pouvoir": {
      const pouvoir = c.pouvoir;
      if (typeof pouvoir !== "string" || !(POUVOIRS as readonly string[]).includes(pouvoir))
        return null;
      if (!Number.isInteger(c.x) || !Number.isInteger(c.y)) return null;
      if (Math.abs(c.x as number) > 100_000 || Math.abs(c.y as number) > 100_000) return null;
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
