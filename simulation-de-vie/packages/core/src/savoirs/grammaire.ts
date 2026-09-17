/**
 * La grammaire d'invention (M38a).
 *
 * Jusqu'ici les inventions formaient un catalogue fermé : le moteur connaissait
 * le filet, l'arc, la fonte, et rien d'autre ne pouvait jamais être trouvé. Ici
 * le moteur ne connaît plus aucune invention : il connaît une **grammaire**.
 *
 * Une trouvaille est un triplet **matière × procédé × fonction**. La matière dit
 * en quoi c'est fait, le procédé comment, la fonction à quoi ça sert. De ce
 * triplet le moteur déduit tout le reste : le nom, la recette, la difficulté, et
 * l'effet — un nombre sur un **levier** qu'il sait déjà lire (rendement d'une
 * récolte, solidité, conservation, chaleur, soin, combat, portage, bâtisse).
 *
 * Les matières elles-mêmes se dérivent : fondre un minerai donne un métal,
 * allier deux métaux en donne un troisième, plus dur et plus tenace que ses
 * parents. La chaîne n'a pas de fin, donc l'arbre des trouvailles non plus.
 *
 * Tout est déterministe : mêmes graines, mêmes trouvailles.
 */
import type { Rng } from "../rng.js";
import type { Ressource } from "../monde/ressources.js";
import type { Atelier, Objet, Recette } from "../monde/recettes.js";
import type { Inventaire } from "../agents/inventaire.js";
import type { IdTrouvaille } from "./catalogue.js";

// ---------------------------------------------------------------------------
// Matières
// ---------------------------------------------------------------------------

/**
 * Une matière : soit une ressource du monde (bois, pierre, cuivre…), soit une
 * matière dérivée par un procédé (un alliage), identifiée par `m:<n>`.
 */
export interface FicheMatiere {
  readonly id: string;
  readonly nom: string;
  /** Ressource du monde qui la porte, ou `null` pour une matière dérivée. */
  readonly ressource: Ressource | null;
  /** Ce dont elle est tirée (identifiants de matières), vide si brute. */
  readonly parents: readonly string[];
  /** Le procédé qui la produit, `null` si on la ramasse telle quelle. */
  readonly procede: Procede | null;
  /** Ce qui coupe, creuse et frappe : 0..100. */
  readonly durete: number;
  /** Ce qui dure : 0..100. */
  readonly tenue: number;
  /** Ce qui tient chaud et garde : 0..100. */
  readonly isolation: number;
  /** Ce qui se tresse, se noue et se porte : 0..100. */
  readonly souplesse: number;
  /** Ce qu'elle coûte à obtenir : 0..100. */
  readonly rarete: number;
  /** Teinte, pour le viewer. */
  readonly couleur: string;
  /** Rang dans la chaîne : 0 pour une matière brute, +1 à chaque dérivation. */
  readonly rang: number;
}

/** Les matières brutes, celles que le monde donne. */
export const MATIERES_BRUTES: readonly FicheMatiere[] = [
  m("bois", "bois", "bois", 25, 35, 40, 45, 5, "#8a5a2b"),
  m("pierre", "pierre", "pierre", 55, 45, 20, 5, 8, "#8d8d92"),
  m("fibres", "fibres", "fibres", 5, 15, 45, 95, 6, "#b8a05a"),
  m("argile", "argile", "argile", 20, 25, 55, 60, 10, "#b06a44"),
  m("cuir", "cuir", "cuir", 15, 40, 70, 80, 20, "#7a4a2a"),
  m("corde", "corde", "corde", 8, 30, 35, 90, 14, "#a88c4a"),
  m("minerai", "minerai", "minerai brut", 28, 25, 15, 10, 30, "#6f7f5a"),
  m("cuivre", "cuivre", "cuivre", 60, 65, 15, 55, 45, "#b87333"),
];

function m(
  id: string,
  ressource: Ressource,
  nom: string,
  durete: number,
  tenue: number,
  isolation: number,
  souplesse: number,
  rarete: number,
  couleur: string,
): FicheMatiere {
  return {
    id,
    nom,
    ressource,
    parents: [],
    procede: null,
    durete,
    tenue,
    isolation,
    souplesse,
    rarete,
    couleur,
    rang: 0,
  };
}

// ---------------------------------------------------------------------------
// Procédés
// ---------------------------------------------------------------------------

/** Les façons de travailler une matière. */
export const PROCEDES = [
  "tailler",
  "tresser",
  "assembler",
  "cuire",
  "fondre",
  "allier",
  "tremper",
  "polir",
] as const;
export type Procede = (typeof PROCEDES)[number];

export interface FicheProcede {
  readonly nom: string;
  /** Participe, pour les noms composés : « de fibres tressées ». */
  readonly participe: string;
  /** L'atelier qu'il exige. */
  readonly atelier: Atelier | null;
  /** Niveau d'artisanat requis. */
  readonly niveau: number;
  /** Ce qu'il fait aux propriétés de la matière (facteurs). */
  readonly durete: number;
  readonly tenue: number;
  readonly isolation: number;
  readonly souplesse: number;
  /** Il ne s'applique qu'à une matière qui a au moins ça. */
  readonly exige: { readonly propriete: Propriete; readonly seuil: number } | null;
  /** Un procédé qui produit une matière nouvelle plutôt qu'un objet. */
  readonly derive: boolean;
}

export type Propriete = "durete" | "tenue" | "isolation" | "souplesse";

export const PROCEDE: Record<Procede, FicheProcede> = {
  tailler: {
    nom: "tailler",
    participe: "taillé",
    atelier: null,
    niveau: 0,
    durete: 1.15,
    tenue: 0.95,
    isolation: 1,
    souplesse: 0.9,
    exige: { propriete: "durete", seuil: 20 },
    derive: false,
  },
  tresser: {
    nom: "tresser",
    participe: "tressé",
    atelier: null,
    niveau: 1,
    durete: 0.8,
    tenue: 1.2,
    isolation: 1.15,
    souplesse: 1.1,
    exige: { propriete: "souplesse", seuil: 50 },
    derive: false,
  },
  assembler: {
    nom: "assembler",
    participe: "assemblé",
    atelier: null,
    niveau: 2,
    durete: 1,
    tenue: 1.15,
    isolation: 1.1,
    souplesse: 1,
    exige: null,
    derive: false,
  },
  cuire: {
    nom: "cuire",
    participe: "cuit",
    atelier: "feu",
    niveau: 1,
    durete: 1.3,
    tenue: 1.6,
    isolation: 1.2,
    souplesse: 0.4,
    exige: { propriete: "isolation", seuil: 50 },
    derive: false,
  },
  fondre: {
    nom: "fondre",
    participe: "fondu",
    atelier: "four",
    niveau: 2,
    durete: 1.5,
    tenue: 2,
    isolation: 0.8,
    souplesse: 3,
    exige: null,
    derive: true,
  },
  allier: {
    nom: "allier",
    participe: "allié",
    atelier: "four",
    niveau: 3,
    durete: 1.25,
    tenue: 1.3,
    isolation: 1,
    souplesse: 0.95,
    exige: { propriete: "tenue", seuil: 50 },
    derive: true,
  },
  tremper: {
    nom: "tremper",
    participe: "trempé",
    atelier: "four",
    niveau: 4,
    durete: 1.35,
    tenue: 1.15,
    isolation: 1,
    souplesse: 0.85,
    exige: { propriete: "durete", seuil: 55 },
    derive: true,
  },
  polir: {
    nom: "polir",
    participe: "poli",
    atelier: null,
    niveau: 3,
    durete: 1.05,
    tenue: 1.2,
    isolation: 1,
    souplesse: 1,
    exige: { propriete: "tenue", seuil: 40 },
    derive: false,
  },
};

// ---------------------------------------------------------------------------
// Fonctions et leviers
// ---------------------------------------------------------------------------

/** Les leviers du monde : ce sur quoi une trouvaille peut agir. */
export const LEVIERS = [
  "recolte_bois",
  "recolte_pierre",
  "recolte_poisson",
  "recolte_gibier",
  "recolte_minerai",
  "solidite",
  "conservation",
  "chaleur",
  "soin",
  "combat",
  "portage",
  "batisse",
] as const;
export type Levier = (typeof LEVIERS)[number];

/** À quoi sert une chose. */
export const FONCTIONS = [
  "couper",
  "creuser",
  "pecher",
  "chasser",
  "porter",
  "chauffer",
  "conserver",
  "soigner",
  "frapper",
  "batir",
] as const;
export type Fonction = (typeof FONCTIONS)[number];

export interface FicheFonction {
  readonly nom: string;
  /** Le levier qu'elle pousse. */
  readonly levier: Levier;
  /** La propriété de la matière qui décide de sa valeur. */
  readonly propriete: Propriete;
  /** Gain maximal (facteur ajouté) pour une matière parfaite. */
  readonly gainMax: number;
  /** Les procédés qui peuvent la servir. */
  readonly procedes: readonly Procede[];
}

export const FONCTION: Record<Fonction, FicheFonction> = {
  couper: {
    nom: "couper",
    levier: "recolte_bois",
    propriete: "durete",
    gainMax: 1.2,
    procedes: ["tailler", "assembler", "polir"],
  },
  creuser: {
    nom: "creuser",
    levier: "recolte_pierre",
    propriete: "durete",
    gainMax: 1.2,
    procedes: ["tailler", "assembler", "polir"],
  },
  pecher: {
    nom: "pêcher",
    levier: "recolte_poisson",
    propriete: "souplesse",
    gainMax: 1.4,
    procedes: ["tresser", "assembler"],
  },
  chasser: {
    nom: "chasser",
    levier: "recolte_gibier",
    propriete: "durete",
    gainMax: 1.4,
    procedes: ["tailler", "tresser", "assembler"],
  },
  porter: {
    nom: "porter",
    levier: "portage",
    propriete: "souplesse",
    gainMax: 0.8,
    procedes: ["tresser", "assembler"],
  },
  chauffer: {
    nom: "tenir chaud",
    levier: "chaleur",
    propriete: "isolation",
    gainMax: 0.9,
    procedes: ["tresser", "assembler", "cuire"],
  },
  conserver: {
    nom: "conserver",
    levier: "conservation",
    propriete: "isolation",
    gainMax: 1.1,
    procedes: ["cuire", "assembler", "tresser"],
  },
  soigner: {
    nom: "soigner",
    levier: "soin",
    propriete: "souplesse",
    gainMax: 0.9,
    procedes: ["tresser", "cuire"],
  },
  frapper: {
    nom: "frapper",
    levier: "combat",
    propriete: "durete",
    gainMax: 0.45,
    procedes: ["tailler", "assembler", "polir"],
  },
  batir: {
    nom: "bâtir",
    levier: "batisse",
    propriete: "tenue",
    gainMax: 0.9,
    procedes: ["tailler", "assembler", "cuire", "polir"],
  },
};

/** Le levier que pousse une récolte donnée, s'il y en a un. */
export function levierDeRecolte(r: Ressource): Levier | null {
  switch (r) {
    case "bois":
      return "recolte_bois";
    case "pierre":
      return "recolte_pierre";
    case "poisson":
      return "recolte_poisson";
    case "gibier":
      return "recolte_gibier";
    case "minerai":
      return "recolte_minerai";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Trouvailles
// ---------------------------------------------------------------------------

/** Une trouvaille : ce qu'une personne a inventé, tel que le monde le retient. */
export interface Trouvaille {
  readonly id: IdTrouvaille;
  readonly nom: string;
  readonly matiere: string;
  readonly procede: Procede;
  readonly fonction: Fonction;
  readonly levier: Levier;
  /** Gain apporté, en facteur ajouté (0,35 = un tiers de mieux). */
  readonly gain: number;
  /** Solidité de l'objet neuf. */
  readonly solidite: number;
  readonly ingredients: Partial<Record<Ressource, number>>;
  readonly atelier: Atelier | null;
  readonly niveauRequis: number;
  readonly duree: number;
  /** Ce qu'il faut savoir avant : matières dérivées et trouvailles nécessaires. */
  readonly requiert: readonly string[];
  /** Le problème qui l'a fait naître (M38b), pour la fiche du viewer. */
  probleme: string | null;
  inventeur: string | null;
  village: string | null;
  jour: number;
  /** Essais ratés avant la réussite. */
  essais: number;
}

/** Tout ce que le monde a trouvé : les matières dérivées et les trouvailles. */
export interface EtatTrouvailles {
  matieres: Map<string, FicheMatiere>;
  trouvailles: Map<string, Trouvaille>;
  /** Compteur des identifiants. */
  prochain: number;
  /** Noms de matières déjà donnés, pour ne pas se répéter. */
  nomsPris: Set<string>;
}

export function etatTrouvaillesNeuf(): EtatTrouvailles {
  const matieres = new Map<string, FicheMatiere>();
  for (const f of MATIERES_BRUTES) matieres.set(f.id, f);
  return { matieres, trouvailles: new Map(), prochain: 1, nomsPris: new Set() };
}

export function matiereDe(e: EtatTrouvailles, id: string): FicheMatiere | null {
  return e.matieres.get(id) ?? null;
}

/** Une trouvaille se reconnaît à son identifiant. */
export function estTrouvailleId(s: string): boolean {
  return s.startsWith("t:");
}

// ---------------------------------------------------------------------------
// Dériver une matière
// ---------------------------------------------------------------------------

/**
 * Les noms des métaux, dans l'ordre où l'histoire les a trouvés. Passé cette
 * liste, les alliages prennent un nom composé : la chaîne ne s'arrête jamais.
 */
const NOMS_METAUX = [
  "bronze",
  "laiton",
  "fer",
  "acier",
  "acier trempé",
  "fonte grise",
  "vif-argent",
  "électrum",
  "orichalque",
  "argentine",
] as const;

const RACINES = [
  "aub",
  "cendr",
  "clair",
  "fauv",
  "givr",
  "lam",
  "meul",
  "roch",
  "sombr",
  "vif",
] as const;
const SUFFIXES = ["ain", "ite", "ure", "ier", "al", "in"] as const;

/** Un nom de matière qui n'a pas encore servi. */
function nommerMatiere(e: EtatTrouvailles, rng: Rng): string {
  for (const nom of NOMS_METAUX) if (!e.nomsPris.has(nom)) return nom;
  for (let essai = 0; essai < 64; essai++) {
    const nom = `${rng.choisir(RACINES)}${rng.choisir(SUFFIXES)}`;
    if (!e.nomsPris.has(nom)) return nom;
  }
  return `matière ${e.prochain}`;
}

function moyenne(valeurs: readonly number[]): number {
  return valeurs.reduce((a, b) => a + b, 0) / Math.max(1, valeurs.length);
}

function borne(v: number): number {
  return Math.max(1, Math.min(100, Math.round(v)));
}

/**
 * Dérive une matière d'une ou deux autres par un procédé. Les propriétés
 * tiennent des parents (la meilleure des deux, tirée vers la moyenne) puis du
 * procédé, avec une part de hasard : deux colonies n'obtiennent pas le même
 * bronze. Renvoie `null` si le procédé ne s'applique pas.
 */
export function deriverMatiere(
  e: EtatTrouvailles,
  rng: Rng,
  procede: Procede,
  parents: readonly FicheMatiere[],
): FicheMatiere | null {
  const fiche = PROCEDE[procede];
  if (!fiche.derive || parents.length === 0 || parents.length > 2) return null;
  if (procede === "allier" && parents.length !== 2) return null;
  if (procede !== "allier" && parents.length !== 1) return null;
  const premier = parents[0];
  if (premier === undefined) return null;
  if (fiche.exige !== null && premier[fiche.exige.propriete] < fiche.exige.seuil) return null;

  const melange = (prop: Propriete): number => {
    const valeurs = parents.map((p) => p[prop]);
    const haut = Math.max(...valeurs);
    const moyenne = valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
    return (haut * 2 + moyenne) / 3;
  };
  // Le hasard de la coulée : de −10 % à +25 %.
  const chance = 0.9 + rng.entier(0, 36) / 100;
  const nom = nommerMatiere(e, rng);
  const id = `m:${e.prochain}`;
  const derivee: FicheMatiere = {
    id,
    nom,
    ressource: null,
    parents: parents.map((p) => p.id),
    procede,
    durete: borne(melange("durete") * fiche.durete * chance),
    tenue: borne(melange("tenue") * fiche.tenue * chance),
    isolation: borne(melange("isolation") * fiche.isolation),
    souplesse: borne(melange("souplesse") * fiche.souplesse),
    rarete: borne(moyenne(parents.map((x) => x.rarete)) * 1.3 + 8),
    couleur: teinte(parents, chance),
    rang: Math.max(...parents.map((p) => p.rang)) + 1,
  };
  e.prochain += 1;
  e.nomsPris.add(nom);
  e.matieres.set(id, derivee);
  return derivee;
}

/** La teinte d'un alliage : la moyenne de ses parents, éclaircie par la chance. */
function teinte(parents: readonly FicheMatiere[], chance: number): string {
  let r = 0;
  let v = 0;
  let b = 0;
  for (const p of parents) {
    const n = parseInt(p.couleur.slice(1), 16);
    r += (n >> 16) & 255;
    v += (n >> 8) & 255;
    b += n & 255;
  }
  const k = parents.length;
  const clair = (x: number): number =>
    Math.max(0, Math.min(255, Math.round((x / k) * (0.85 + chance * 0.3))));
  return `#${((clair(r) << 16) | (clair(v) << 8) | clair(b)).toString(16).padStart(6, "0")}`;
}

/**
 * Les ressources brutes d'où vient une matière, avec leur quantité. Une matière
 * dérivée coûte ses parents, et chaque niveau de la chaîne coûte moitié plus :
 * un outil de bout de chaîne se paie cher en minerai et en bois.
 */
export function ingredientsDe(
  e: EtatTrouvailles,
  id: string,
  facteur = 1,
): Partial<Record<Ressource, number>> {
  const total: Partial<Record<Ressource, number>> = {};
  const empiler = (courant: string, part: number, profondeur: number): void => {
    const f = e.matieres.get(courant);
    if (f === undefined || profondeur > 8) return;
    if (f.ressource !== null) {
      total[f.ressource] = Math.min(12, (total[f.ressource] ?? 0) + Math.max(1, Math.round(part)));
      return;
    }
    for (const parent of f.parents) empiler(parent, part * 1.5, profondeur + 1);
  };
  empiler(id, Math.max(1, facteur), 0);
  return total;
}

// ---------------------------------------------------------------------------
// Composer une trouvaille
// ---------------------------------------------------------------------------

/** Le nom de la chose, selon ce qu'elle fait et comment elle est faite. */
const NOMS_OBJET: Record<Fonction, Partial<Record<Procede, string>> & { readonly defaut: string }> =
  {
    couper: { defaut: "hache", tresser: "scie à fibres", polir: "hache polie" },
    creuser: { defaut: "pioche", tresser: "houe", polir: "pic poli" },
    pecher: { defaut: "nasse", tresser: "filet", assembler: "harpon" },
    chasser: { defaut: "épieu", tresser: "collet", tailler: "arc", assembler: "arbalète" },
    porter: { defaut: "hotte", tresser: "besace", assembler: "traîneau" },
    chauffer: { defaut: "manteau", tresser: "cape", cuire: "brasero", assembler: "couche" },
    conserver: { defaut: "jarre", cuire: "jarre", tresser: "claie", assembler: "grenier" },
    soigner: { defaut: "onguent", tresser: "bandage", cuire: "baume" },
    frapper: { defaut: "masse", tailler: "lame", assembler: "hallebarde", polir: "épée" },
    batir: { defaut: "équerre", tailler: "coin", cuire: "brique", assembler: "charpente" },
  };

function nommerTrouvaille(fonction: Fonction, procede: Procede, matiere: FicheMatiere): string {
  const noms = NOMS_OBJET[fonction];
  const base = noms[procede] ?? noms.defaut;
  const voyelle = /^[aeiouyâàéèêëîïôöûü]/i.test(matiere.nom);
  return `${base} ${voyelle ? "d'" : "de "}${matiere.nom}`;
}

/** Le triplet tient-il debout ? Une matière molle ne fait pas une hache. */
export function combinaisonValide(
  fonction: Fonction,
  procede: Procede,
  matiere: FicheMatiere,
): boolean {
  const f = FONCTION[fonction];
  if (!f.procedes.includes(procede)) return false;
  const p = PROCEDE[procede];
  if (p.derive) return false;
  if (p.exige !== null && matiere[p.exige.propriete] < p.exige.seuil) return false;
  // Il faut que la matière serve vraiment à ça.
  return valeurBrute(fonction, procede, matiere) >= 40;
}

/** La propriété qui décide, une fois le procédé passé dessus : 0..100. */
function valeurBrute(fonction: Fonction, procede: Procede, matiere: FicheMatiere): number {
  const propriete = FONCTION[fonction].propriete;
  return Math.min(100, matiere[propriete] * PROCEDE[procede][propriete]);
}

/**
 * Compose la trouvaille d'un triplet. Le gain vient de la propriété qui
 * compte, élevée au carré pour que les bonnes matières se détachent, et le
 * coût vient de la chaîne de la matière.
 */
export function composerTrouvaille(
  e: EtatTrouvailles,
  fonction: Fonction,
  procede: Procede,
  matiere: FicheMatiere,
): Trouvaille | null {
  if (!combinaisonValide(fonction, procede, matiere)) return null;
  const f = FONCTION[fonction];
  const p = PROCEDE[procede];
  const part = valeurBrute(fonction, procede, matiere) / 100;
  // Une matière brute ne donne qu'une part du gain possible ; la chaîne fait le reste.
  const avancement = 0.55 + 0.45 * Math.min(1, matiere.rang / 3);
  const gain = Math.round(f.gainMax * part * part * avancement * 100) / 100;
  const tenue = Math.min(100, matiere.tenue * p.tenue);
  // L'identifiant vient du triplet : deux personnes qui ont la même idée ont la même.
  const id: IdTrouvaille = `t:${fonction}.${procede}.${matiere.id}`;
  return {
    id,
    nom: nommerTrouvaille(fonction, procede, matiere),
    matiere: matiere.id,
    procede,
    fonction,
    levier: f.levier,
    gain,
    solidite: Math.max(30, Math.round(40 + tenue * 0.9)),
    ingredients: ingredientsDe(e, matiere.id, 2 + Math.round(matiere.rang * 0.5)),
    atelier: p.atelier,
    niveauRequis: p.niveau + Math.floor(matiere.rang / 2),
    duree: 4 + p.niveau + matiere.rang,
    requiert: matiere.ressource === null ? [matiere.id] : [],
    probleme: null,
    inventeur: null,
    village: null,
    jour: 0,
    essais: 0,
  };
}

/** Enregistre une trouvaille dans le monde. */
export function retenirTrouvaille(e: EtatTrouvailles, t: Trouvaille): void {
  e.trouvailles.set(t.id, t);
}

/**
 * Une trouvaille en remplace-t-elle une autre ? Deux choses qui poussent le
 * même levier ne se cumulent pas : on garde la meilleure.
 */
export function meilleureQue(a: Trouvaille, b: Trouvaille): boolean {
  return a.levier === b.levier && a.gain > b.gain;
}

// ---------------------------------------------------------------------------
// Lire les effets
// ---------------------------------------------------------------------------

/**
 * Le facteur qu'apportent les trouvailles qu'une personne a en main sur un
 * levier : 1 si elle n'a rien. Deux choses qui font la même chose ne
 * s'additionnent pas — on se sert de la meilleure.
 */
export function bonusPorte(e: EtatTrouvailles, inv: Inventaire, levier: Levier): number {
  let meilleur = 0;
  for (const o of inv.objets) {
    if (o.trouvaille === undefined) continue;
    const t = e.trouvailles.get(o.trouvaille);
    if (t?.levier !== levier) continue;
    if (t.gain > meilleur) meilleur = t.gain;
  }
  return 1 + meilleur;
}

/** L'objet en main qui sert ce levier, s'il y en a un (pour l'user à l'usage). */
export function objetDuLevier(e: EtatTrouvailles, inv: Inventaire, levier: Levier): Objet | null {
  let choisi: Objet | null = null;
  let meilleur = 0;
  for (const o of inv.objets) {
    if (o.trouvaille === undefined) continue;
    const t = e.trouvailles.get(o.trouvaille);
    if (t?.levier !== levier) continue;
    if (t.gain > meilleur) {
      meilleur = t.gain;
      choisi = o;
    }
  }
  return choisi;
}

/**
 * Le facteur qu'apporte le savoir d'un groupe sur un levier, sans rien porter :
 * ce qui vaut pour un bâtiment (conserver, bâtir) plutôt que pour une paire de
 * mains. La trouvaille doit être connue de quelqu'un.
 */
export function bonusSu(
  e: EtatTrouvailles,
  savoirs: Iterable<Iterable<string>>,
  levier: Levier,
): number {
  const connus = new Set<string>();
  for (const s of savoirs) for (const id of s) connus.add(id);
  let meilleur = 0;
  for (const id of connus) {
    const t = e.trouvailles.get(id);
    if (t?.levier !== levier) continue;
    if (t.gain > meilleur) meilleur = t.gain;
  }
  return 1 + meilleur;
}

/** Les trouvailles connues d'une personne, de la meilleure à la moindre. */
export function trouvaillesConnues(
  e: EtatTrouvailles,
  savoirs: Iterable<string>,
): readonly Trouvaille[] {
  const liste: Trouvaille[] = [];
  for (const id of savoirs) {
    const t = e.trouvailles.get(id);
    if (t !== undefined) liste.push(t);
  }
  liste.sort((a, b) => b.gain - a.gain || (a.id < b.id ? -1 : 1));
  return liste;
}

// ---------------------------------------------------------------------------
// Fabriquer une trouvaille
// ---------------------------------------------------------------------------

/** La recette d'une trouvaille, telle que l'exécuteur la lit. */
export function recetteDeTrouvaille(t: Trouvaille): Recette {
  return {
    nom: t.nom,
    produit: { objet: "trouvaille" },
    ingredients: t.ingredients,
    competence: "artisanat",
    niveauRequis: t.niveauRequis,
    atelier: t.atelier,
    duree: t.duree,
  };
}

/** L'objet neuf que donne une trouvaille. */
export function objetDeTrouvaille(t: Trouvaille): Objet {
  return { type: "trouvaille", solidite: t.solidite, trouvaille: t.id };
}
