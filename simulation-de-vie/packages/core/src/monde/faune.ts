/**
 * La faune (jalon « la faune vit ») : le gibier immobile est remplacé par des
 * troupeaux mobiles. Une entité par troupeau, avec un gîte et une pâture ;
 * les bêtes fuient les humains, se méfient après chaque chasse, mettent bas
 * au printemps, souffrent l'hiver, se scindent quand elles sont nombreuses ;
 * les meutes de loups prélèvent sur les proies et meurent de faim sans elles.
 * Tout est tiré d'un flux `rng.fork("faune/…")` : déterministe à graine égale.
 */
import type { Monde } from "../monde.js";
import type { Rng } from "../rng.js";
import type { Biome } from "./biomes.js";
import { INFO_BIOME } from "./biomes.js";
import { PLANS_BATIMENT } from "./batiments.js";
import { Grille, TAILLE_MORCEAU } from "./grille.js";
import type { Morceau, Position } from "./grille.js";

export const ESPECES = ["cerf", "sanglier", "mouflon", "lievre", "aurochs", "loup"] as const;
export type Espece = (typeof ESPECES)[number];

export interface ProfilEspece {
  readonly nom: string;
  readonly pluriel: string;
  readonly predateur: boolean;
  /** Biomes de pâture (et de gîte). */
  readonly biomes: readonly Biome[];
  readonly tailleInitiale: readonly [number, number];
  /** Au-delà, le troupeau se scinde. */
  readonly tailleMax: number;
  readonly rayonPature: number;
  /** Distance (tuiles) à laquelle un humain fait fuir le troupeau. */
  readonly fuite: number;
  /** Tuiles parcourues par heure (six ticks) en pâture ; le double en fuite. */
  readonly vitesse: number;
  /** Gibier et cuir rapportés par bête. */
  readonly viande: number;
  readonly cuir: number;
  /** Une bête acculée blesse le chasseur qui la rate. */
  readonly dangereux: boolean;
  /** Fraction de naissances au printemps. */
  readonly naissances: number;
  /** Probabilité, par bête et par jour d'hiver, de mourir de faim ou de froid. */
  readonly mortaliteHiver: number;
  /** Réussite d'un chasseur seul, sans arc ni méfiance. */
  readonly reussiteBase: number;
  /** Nombre attendu de troupeaux par morceau entièrement favorable. */
  readonly densite: number;
}

export const PROFILS: Readonly<Record<Espece, ProfilEspece>> = {
  cerf: {
    nom: "cerf",
    pluriel: "cerfs",
    predateur: false,
    biomes: ["prairie", "foret"],
    tailleInitiale: [4, 9],
    tailleMax: 14,
    rayonPature: 20,
    fuite: 4,
    vitesse: 3,
    viande: 4,
    cuir: 2,
    dangereux: false,
    naissances: 0.35,
    mortaliteHiver: 0.004,
    reussiteBase: 0.3,
    densite: 1.2,
  },
  sanglier: {
    nom: "sanglier",
    pluriel: "sangliers",
    predateur: false,
    biomes: ["foret", "marais"],
    tailleInitiale: [3, 7],
    tailleMax: 12,
    rayonPature: 14,
    fuite: 3,
    vitesse: 3,
    viande: 3,
    cuir: 1,
    dangereux: true,
    naissances: 0.5,
    mortaliteHiver: 0.003,
    reussiteBase: 0.3,
    densite: 1.0,
  },
  mouflon: {
    nom: "mouflon",
    pluriel: "mouflons",
    predateur: false,
    biomes: ["colline", "montagne"],
    tailleInitiale: [5, 10],
    tailleMax: 16,
    rayonPature: 16,
    fuite: 5,
    vitesse: 4,
    viande: 2,
    cuir: 1,
    dangereux: false,
    naissances: 0.3,
    mortaliteHiver: 0.003,
    reussiteBase: 0.25,
    densite: 1.0,
  },
  lievre: {
    nom: "lièvre",
    pluriel: "lièvres",
    predateur: false,
    biomes: ["prairie"],
    tailleInitiale: [2, 5],
    tailleMax: 8,
    rayonPature: 10,
    fuite: 3,
    vitesse: 5,
    viande: 1,
    cuir: 0,
    dangereux: false,
    naissances: 0.8,
    mortaliteHiver: 0.006,
    reussiteBase: 0.4,
    densite: 1.2,
  },
  aurochs: {
    nom: "aurochs",
    pluriel: "aurochs",
    predateur: false,
    biomes: ["prairie"],
    tailleInitiale: [3, 6],
    tailleMax: 10,
    rayonPature: 24,
    fuite: 5,
    vitesse: 2,
    viande: 8,
    cuir: 3,
    dangereux: true,
    naissances: 0.25,
    mortaliteHiver: 0.002,
    reussiteBase: 0.2,
    densite: 0.5,
  },
  loup: {
    nom: "loup",
    pluriel: "loups",
    predateur: true,
    biomes: ["foret", "colline", "prairie"],
    tailleInitiale: [2, 4],
    tailleMax: 8,
    rayonPature: 24,
    fuite: 6,
    vitesse: 4,
    viande: 1,
    cuir: 1,
    dangereux: true,
    naissances: 0.4,
    mortaliteHiver: 0.001,
    reussiteBase: 0.3,
    densite: 0.25,
  },
};

export type EtatTroupeau = "pature" | "fuite" | "gite";

export interface Troupeau {
  readonly id: string;
  readonly espece: Espece;
  position: Position;
  /** Gîte du moment (l'hiver, la forêt) et gîte d'été d'origine. */
  gite: Position;
  readonly giteEte: Position;
  taille: number;
  /** Méfiance 0..1 : monte à chaque chasse, redescend d'un dixième par jour. */
  mefiance: number;
  etat: EtatTroupeau;
  cible: Position | null;
  /** Prédateurs : jours sans proie. */
  faim: number;
  /** Année de la dernière mise bas (0 = jamais). */
  derniereMiseBas: number;
  /** Meute lancée sur une personne (directeur de danger) : son identifiant. */
  proieHumaine: string | null;
  /** Meute désignée comme menace : elle rôde vers le village au lieu de pâturer. */
  enMenace: boolean;
  readonly rng: Rng;
}

/** Une meute n'approche jamais à moins de quatre tuiles d'un feu allumé. */
export const RAYON_FEU_SUR = 4;

/** Vrai si un feu allumé se trouve à moins de quatre tuiles. */
export function presDunFeu(monde: Monde, pos: Position): boolean {
  for (const b of monde.batiments.values()) {
    if (b.etat !== "termine" || !b.allume || PLANS_BATIMENT[b.type].atelier !== "feu") continue;
    if (Grille.distance(b.position, pos) <= RAYON_FEU_SUR) return true;
  }
  return false;
}

/** Au-delà de cette distance (tuiles) de tout humain vivant, un troupeau ne bouge plus. */
export const RAYON_ACTIVITE = 48;
/** Une souche repousse en autant de jours. */
export const JOURS_REPOUSSE_SOUCHE = 180;
/** Croissance logistique des bancs de poissons, par bassin (morceau) et par jour. */
export const CROISSANCE_POISSON = 0.25;
/** Immigration d'un bassin voisin quand un bassin est presque vide (poissons par jour). */
export const IMMIGRATION_POISSON = 1;
/** Un bassin de pêche : un carré de ce côté (tuiles). */
export const COTE_BASSIN = 8;
/** Rayon dans lequel une meute traque une proie, et distance à laquelle une proie sent la meute. */
export const RAYON_TRAQUE = 15;
export const FLAIR_PROIE = 6;
/** Jours de faim à partir desquels une meute chasse, et sans proie au bout desquels elle perd un loup. */
export const FAIM_MEUTE = 2;
export const FAMINE_MEUTE = 20;

const pasVersCible = (a: number, b: number): number => (a < b ? 1 : a > b ? -1 : 0);

function tuileFavorable(monde: Monde, profil: ProfilEspece, pos: Position): boolean {
  const t = monde.grille.tuileSiGeneree(pos.x, pos.y);
  return t !== null && t.batiment === null && profil.biomes.includes(t.biome);
}

function praticable(monde: Monde, pos: Position): boolean {
  const t = monde.grille.tuileSiGeneree(pos.x, pos.y);
  return t !== null && t.batiment === null && INFO_BIOME[t.biome].praticable;
}

/**
 * Peuple un morceau fraîchement généré : le nombre de troupeaux de chaque
 * espèce dépend de la part de ses biomes favorables, le gîte est une tuile
 * favorable tirée au sort.
 */
export function peuplerMorceau(morceau: Morceau, rng: Rng, prochainId: () => string): Troupeau[] {
  const parBiome = new Map<Biome, Position[]>();
  for (const t of morceau.tuiles) {
    if (t?.batiment !== null) continue;
    let liste = parBiome.get(t.biome);
    if (liste === undefined) {
      liste = [];
      parBiome.set(t.biome, liste);
    }
    liste.push({ x: t.x, y: t.y });
  }
  const total = TAILLE_MORCEAU * TAILLE_MORCEAU;
  const troupeaux: Troupeau[] = [];
  for (const espece of ESPECES) {
    const profil = PROFILS[espece];
    const favorables: Position[] = [];
    for (const b of profil.biomes) favorables.push(...(parBiome.get(b) ?? []));
    if (favorables.length === 0) continue;
    const attendu = (profil.densite * favorables.length) / total;
    let n = Math.floor(attendu);
    if (rng.chance(attendu - n)) n += 1;
    if (profil.predateur && n === 0 && favorables.length < total * 0.2) continue;
    for (let i = 0; i < n; i++) {
      const gite = favorables[rng.entier(0, favorables.length - 1)];
      if (gite === undefined) continue;
      const id = prochainId();
      troupeaux.push({
        id,
        espece,
        position: { ...gite },
        gite: { ...gite },
        giteEte: { ...gite },
        taille: rng.entier(profil.tailleInitiale[0], profil.tailleInitiale[1]),
        mefiance: 0,
        etat: "pature",
        cible: null,
        faim: 0,
        derniereMiseBas: 0,
        proieHumaine: null,
        enMenace: false,
        rng: rng.fork(id),
      });
    }
  }
  return troupeaux;
}

function humainLePlusProche(
  monde: Monde,
  pos: Position,
): { distance: number; position: Position } | null {
  let meilleur: { distance: number; position: Position } | null = null;
  for (const p of monde.personnages) {
    if (!p.vivant) continue;
    const d = Grille.distance(p.corps.position, pos);
    if (meilleur === null || d < meilleur.distance)
      meilleur = { distance: d, position: p.corps.position };
  }
  return meilleur;
}

/** Point de pâture : une tuile favorable dans le rayon du gîte (élargi à l'automne, le rut). */
function choisirPature(monde: Monde, t: Troupeau, rut: boolean): Position | null {
  const profil = PROFILS[t.espece];
  const rayon = Math.round(profil.rayonPature * (rut ? 1.5 : 1));
  for (let essai = 0; essai < 8; essai++) {
    const pos = {
      x: t.gite.x + t.rng.entier(-rayon, rayon),
      y: t.gite.y + t.rng.entier(-rayon, rayon),
    };
    if (tuileFavorable(monde, profil, pos)) return pos;
  }
  for (let essai = 0; essai < 4; essai++) {
    const pos = {
      x: t.gite.x + t.rng.entier(-rayon, rayon),
      y: t.gite.y + t.rng.entier(-rayon, rayon),
    };
    if (praticable(monde, pos)) return pos;
  }
  return null;
}

/** Fait fuir le troupeau à l'opposé d'une position, sur une dizaine de tuiles. */
export function faireFuir(t: Troupeau, depuis: Position, mefiance: number): void {
  const dx = t.position.x - depuis.x;
  const dy = t.position.y - depuis.y;
  const norme = Math.max(1, Math.abs(dx), Math.abs(dy));
  const cible = {
    x: t.position.x + Math.round((dx / norme) * 10),
    y: t.position.y + Math.round((dy / norme) * 10),
  };
  t.etat = "fuite";
  t.cible = cible;
  t.mefiance = Math.min(1, t.mefiance + mefiance);
}

/** Un pas d'une tuile vers la cible, en contournant l'obstacle si besoin. */
function avancerDUnPas(
  monde: Monde,
  t: Troupeau,
  cible: Position,
  interdit?: (pos: Position) => boolean,
): boolean {
  const sx = pasVersCible(t.position.x, cible.x);
  const sy = pasVersCible(t.position.y, cible.y);
  const essais: Position[] = [
    { x: t.position.x + sx, y: t.position.y + sy },
    { x: t.position.x + sx, y: t.position.y },
    { x: t.position.x, y: t.position.y + sy },
    { x: t.position.x + sx, y: t.position.y - sy },
    { x: t.position.x - sx, y: t.position.y + sy },
  ];
  for (const pos of essais) {
    if (pos.x === t.position.x && pos.y === t.position.y) continue;
    if (praticable(monde, pos) && !(interdit?.(pos) ?? false)) {
      t.position = pos;
      return true;
    }
  }
  return false;
}

/**
 * Une heure de vie du troupeau : fuite devant les humains proches, retour au
 * gîte la nuit, pâture le jour, traque pour les prédateurs. Les troupeaux
 * loin de tout humain restent figés (le monde est sans limite).
 */
export function heureTroupeau(monde: Monde, t: Troupeau): void {
  const profil = PROFILS[t.espece];
  const humain = humainLePlusProche(monde, t.position);
  if (humain === null || humain.distance > RAYON_ACTIVITE) return;
  const moment = monde.horloge.moment();

  // Une meute lancée sur une proie humaine la suit, sans fuir, en évitant les feux ;
  // une meute qui rôde (menace sans proie désignée) garde le cap que le directeur lui donne.
  const traque = profil.predateur && (t.proieHumaine !== null || t.enMenace);
  if (profil.predateur && t.proieHumaine !== null) {
    const proie = monde.personnages.find((p) => p.id === t.proieHumaine && p.vivant);
    if (proie === undefined) {
      t.proieHumaine = null;
      t.cible = null;
    } else {
      t.cible = { ...proie.corps.position };
      t.etat = "pature";
    }
  }
  // Un troupeau jamais chassé se laisse approcher de près ; un troupeau méfiant fuit de loin.
  const distanceFuite = Math.max(1, Math.round(profil.fuite * (0.5 + t.mefiance)));
  if (traque) {
    // Rien à faire : la proie est déjà la cible.
  } else if (humain.distance <= distanceFuite && !(profil.predateur && t.faim > 5)) {
    faireFuir(t, humain.position, 0.05);
  } else if (!profil.predateur && t.etat !== "fuite") {
    // Une proie qui sent la meute s'enfuit.
    const meute = meuteProche(monde, t, FLAIR_PROIE);
    if (meute !== null) faireFuir(t, meute.position, 0);
  }
  if (t.etat === "fuite" && (t.cible === null || Grille.distance(t.position, t.cible) <= 1)) {
    t.etat = "pature";
    t.cible = null;
  }

  if (t.etat !== "fuite" && !traque) {
    if (profil.predateur && t.faim >= FAIM_MEUTE) {
      // Une meute affamée traque la proie la plus proche dans son rayon.
      const proie = proieLaPlusProche(monde, t, RAYON_TRAQUE);
      if (proie !== null) {
        t.cible = { ...proie.position };
        t.etat = "pature";
      }
    }
    if (moment.estNuit && !profil.predateur) {
      t.etat = "gite";
      t.cible = t.gite;
    } else if (t.etat === "gite" && !moment.estNuit) {
      t.etat = "pature";
      t.cible = null;
    }
    if (t.cible === null || Grille.distance(t.position, t.cible) <= 1) {
      t.cible = t.rng.chance(0.3) ? choisirPature(monde, t, moment.saison === "automne") : null;
    }
  }

  if (t.cible !== null) {
    const pas = t.etat === "fuite" || traque ? profil.vitesse * 2 : profil.vitesse;
    const interdit = traque ? (pos: Position): boolean => presDunFeu(monde, pos) : undefined;
    for (let i = 0; i < pas; i++) {
      if (Grille.distance(t.position, t.cible) <= (traque ? 1 : 0)) break;
      if (!avancerDUnPas(monde, t, t.cible, interdit)) {
        if (!traque) t.cible = null;
        break;
      }
    }
  }
}

export function proieLaPlusProche(monde: Monde, meute: Troupeau, rayon: number): Troupeau | null {
  let meilleure: Troupeau | null = null;
  let distance = Infinity;
  for (const autre of monde.troupeaux.values()) {
    if (autre.id === meute.id || PROFILS[autre.espece].predateur || autre.taille <= 0) continue;
    const d = Grille.distance(autre.position, meute.position);
    if (d <= rayon && d < distance) {
      distance = d;
      meilleure = autre;
    }
  }
  return meilleure;
}

/** Meute la plus proche d'un troupeau, dans un rayon. */
function meuteProche(monde: Monde, t: Troupeau, rayon: number): Troupeau | null {
  let meilleure: Troupeau | null = null;
  let distance = Infinity;
  for (const autre of monde.troupeaux.values()) {
    if (!PROFILS[autre.espece].predateur || autre.taille <= 0) continue;
    const d = Grille.distance(autre.position, t.position);
    if (d <= rayon && d < distance) {
      distance = d;
      meilleure = autre;
    }
  }
  return meilleure;
}

/** Bêtes de la même espèce à moins de 40 tuiles (capacité du milieu). */
function densiteLocale(monde: Monde, t: Troupeau): number {
  let total = 0;
  for (const autre of monde.troupeaux.values()) {
    if (autre.espece === t.espece && Grille.distance(autre.position, t.position) <= 40)
      total += autre.taille;
  }
  return total;
}

export interface EvenementFaune {
  readonly genre:
    "naissances" | "scission" | "migration" | "retour" | "hiver" | "disparition" | "meute";
  readonly troupeau: Troupeau;
  readonly nombre: number;
  /** Meute : la proie prélevée. */
  readonly proie?: Troupeau;
}

/**
 * Passe quotidienne d'un troupeau : méfiance qui retombe, mises bas de
 * printemps, mortalité d'hiver, migration vers la forêt, scission, faim des
 * meutes. Renvoie les événements à journaliser et, s'il y a lieu, un
 * nouveau troupeau né d'une scission.
 */
export function jourTroupeau(
  monde: Monde,
  t: Troupeau,
  prochainId: () => string,
): { evenements: EvenementFaune[]; scission: Troupeau | null } {
  const profil = PROFILS[t.espece];
  const moment = monde.horloge.moment();
  const evenements: EvenementFaune[] = [];
  let scission: Troupeau | null = null;
  t.mefiance = Math.max(0, t.mefiance - 0.1);

  if (profil.predateur) {
    // Une meute affamée prend une bête sur une proie à portée, puis se repose ; sans proie, elle dépérit.
    const proie = t.faim >= FAIM_MEUTE ? proieLaPlusProche(monde, t, FLAIR_PROIE) : null;
    if (proie !== null && t.rng.chance(0.25 + 0.05 * Math.min(4, t.taille))) {
      proie.taille -= 1;
      faireFuir(proie, t.position, 0.1);
      t.faim = -3;
      evenements.push({ genre: "meute", troupeau: t, nombre: 1, proie });
      if (proie.taille <= 0) evenements.push({ genre: "disparition", troupeau: proie, nombre: 0 });
    } else {
      t.faim += 1;
      if (t.faim > FAMINE_MEUTE) {
        t.taille -= 1;
        t.faim = 10;
        evenements.push({ genre: "hiver", troupeau: t, nombre: 1 });
      }
    }
  }

  // Mises bas au printemps (dixième jour), une fois par an, freinées par la densité.
  if (
    moment.saison === "printemps" &&
    moment.jourDeSaison === 10 &&
    t.derniereMiseBas !== moment.annee &&
    t.taille > 0
  ) {
    t.derniereMiseBas = moment.annee;
    const surpeuple = densiteLocale(monde, t) > profil.tailleMax * 2.5;
    const fecondite = profil.predateur
      ? t.faim > FAIM_MEUTE
        ? 0
        : profil.naissances
      : profil.naissances;
    const nes = Math.round(t.taille * fecondite * (surpeuple ? 0.4 : 1));
    if (nes > 0) {
      t.taille += nes;
      evenements.push({ genre: "naissances", troupeau: t, nombre: nes });
    }
  }

  // Mortalité d'hiver, par bête.
  if (moment.saison === "hiver" && t.taille > 0) {
    let pertes = 0;
    for (let i = 0; i < t.taille; i++) if (t.rng.chance(profil.mortaliteHiver)) pertes += 1;
    if (pertes > 0) {
      t.taille -= pertes;
      evenements.push({ genre: "hiver", troupeau: t, nombre: pertes });
    }
  }

  // Migration : à l'entrée de l'hiver, les herbivores gîtent en forêt ; au printemps, ils rentrent.
  if (!profil.predateur && moment.jourDeSaison === 1) {
    if (moment.saison === "hiver") {
      const foret = tuileProche(monde, t.gite, "foret", 20);
      if (foret !== null && Grille.distance(foret, t.gite) > 2) {
        t.gite = foret;
        t.cible = foret;
        evenements.push({ genre: "migration", troupeau: t, nombre: t.taille });
      }
    } else if (moment.saison === "printemps" && Grille.distance(t.gite, t.giteEte) > 2) {
      t.gite = { ...t.giteEte };
      t.cible = t.gite;
      evenements.push({ genre: "retour", troupeau: t, nombre: t.taille });
    }
  }

  // Scission des grands troupeaux.
  if (t.taille > profil.tailleMax) {
    const part = Math.floor(t.taille / 2);
    t.taille -= part;
    const nouveauGite = choisirPature(monde, t, true) ?? { ...t.position };
    const id = prochainId();
    scission = {
      id,
      espece: t.espece,
      position: { ...t.position },
      gite: nouveauGite,
      giteEte: { ...nouveauGite },
      taille: part,
      mefiance: t.mefiance,
      etat: "pature",
      cible: nouveauGite,
      faim: 0,
      derniereMiseBas: t.derniereMiseBas,
      proieHumaine: null,
      enMenace: false,
      rng: t.rng.fork(id),
    };
    evenements.push({ genre: "scission", troupeau: t, nombre: part });
  }

  if (t.taille <= 0 && !evenements.some((e) => e.genre === "disparition" && e.troupeau.id === t.id))
    evenements.push({ genre: "disparition", troupeau: t, nombre: 0 });
  return { evenements, scission };
}

/** Tuile du biome demandé la plus proche d'une position, dans un rayon (générée seulement). */
export function tuileProche(
  monde: Monde,
  centre: Position,
  biome: Biome,
  rayon: number,
): Position | null {
  let meilleure: Position | null = null;
  let distance = Infinity;
  for (let dy = -rayon; dy <= rayon; dy++) {
    for (let dx = -rayon; dx <= rayon; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (d >= distance) continue;
      const t = monde.grille.tuileSiGeneree(centre.x + dx, centre.y + dy);
      if (t !== null && t.biome === biome && t.batiment === null) {
        meilleure = { x: t.x, y: t.y };
        distance = d;
      }
    }
  }
  return meilleure;
}

/** Troupeaux (hors prédateurs) à portée de vue d'une position. */
export function troupeauxVisiblesDepuis(monde: Monde, pos: Position, rayon: number): Troupeau[] {
  const resultat: Troupeau[] = [];
  for (const t of monde.troupeaux.values()) {
    if (t.taille > 0 && Grille.distance(t.position, pos) <= rayon) resultat.push(t);
  }
  return resultat.sort(
    (a, b) => Grille.distance(a.position, pos) - Grille.distance(b.position, pos),
  );
}

/** Compte par espèce : troupeaux et bêtes. */
export function recensement(
  monde: Monde,
): { espece: Espece; nom: string; troupeaux: number; betes: number }[] {
  const compte = new Map<Espece, { troupeaux: number; betes: number }>();
  for (const t of monde.troupeaux.values()) {
    if (t.taille <= 0) continue;
    const c = compte.get(t.espece) ?? { troupeaux: 0, betes: 0 };
    c.troupeaux += 1;
    c.betes += t.taille;
    compte.set(t.espece, c);
  }
  return ESPECES.filter((e) => compte.has(e)).map((e) => ({
    espece: e,
    nom: PROFILS[e].pluriel,
    troupeaux: compte.get(e)?.troupeaux ?? 0,
    betes: compte.get(e)?.betes ?? 0,
  }));
}
