/**
 * Le corps (jalon « le corps ») : blessures, fatigue, carences, handicaps,
 * capacités dérivées et humeur à modificateurs datés. Tout est un état avec
 * une cause, une durée et un remède ; la santé ne bouge que par des sources
 * de dégâts nommées, ce qui garantit une cause de décès lisible.
 */
import type { Monde } from "../monde.js";
import type { Ressource } from "../monde/ressources.js";
import { NOURRITURE, possede, retirerObjet } from "./inventaire.js";
import { phenotype } from "./genetique.js";
import { gagnerExperience, niveau } from "./competences.js";
import type { Personnage } from "./personnage.js";

export type TypeBlessure = "coupure" | "fracture" | "morsure";
export type Gravite = 1 | 2 | 3;
export type LieuBlessure = "main" | "bras" | "jambe" | "flanc";

export interface Blessure {
  readonly type: TypeBlessure;
  readonly gravite: Gravite;
  readonly lieu: LieuBlessure;
  readonly depuis: number;
  saigne: boolean;
  bandee: boolean;
  infectee: boolean;
  /** Fin de la fièvre (tick), quand la plaie est infectée. */
  fievreJusqua: number | null;
  /** Un cataplasme a déjà été posé sur cette infection (un seul suffit). */
  cataplasme: boolean;
  immobilisee: boolean;
  /** Ticks passés au repos depuis la blessure (convalescence). */
  ticksRepos: number;
  /** Comment c'est arrivé (« en fendant du bois », « sous les crocs des loups »…). */
  readonly contexte: string;
}

export type Handicap = "boiterie" | "main_raide" | "sans_dents";
export type Carence = "gencives" | "ventre_creux";
export type CategorieAliment = "baies" | "poisson" | "viande" | "cuit";

export interface EtatCorps {
  blessures: Blessure[];
  /** Dette de la semaine (0..100), distincte du sommeil (dette du jour). */
  fatigue: number;
  carence: Carence | null;
  handicaps: { readonly type: Handicap; readonly depuis: number }[];
  cicatrices: number;
  /** Catégories des vingt derniers repas, la plus récente en dernier. */
  repas: CategorieAliment[];
  /** Vrai une fois l'épuisement signalé (une fois par épisode). */
  epuisementSignale: boolean;
}

export interface Modificateur {
  readonly cle: string;
  readonly valeur: number;
  readonly depuis: number;
  readonly jusqua: number;
}

export interface Capacites {
  readonly mobilite: number;
  readonly manipulation: number;
  readonly vue: number;
  readonly vigueur: number;
}

/** Perte de santé immédiate à la blessure, selon la gravité. */
export const PERTE_INITIALE: Record<Gravite, number> = { 1: 8, 2: 20, 3: 30 };
/** Perte de santé par jour selon la gravité d'une plaie qui saigne. */
export const SAIGNEMENT_PAR_JOUR: Record<Gravite, number> = { 1: 4, 2: 8, 3: 15 };
/** Perte de santé par jour d'une plaie infectée (fièvre). */
export const FIEVRE_PAR_JOUR = 6;
export const FIEVRE_JOURS = 8;
export const SEUIL_EPUISEMENT = 85;
export const SEUIL_FATIGUE = 60;
/** Jours de repos nécessaires pour qu'une fracture guérisse sans séquelle. */
export const REPOS_FRACTURE_JOURS = 5;
export const GUERISON_FRACTURE_JOURS = 30;

export function etatCorpsInitial(): EtatCorps {
  return {
    blessures: [],
    fatigue: 0,
    carence: null,
    handicaps: [],
    cicatrices: 0,
    repas: [],
    epuisementSignale: false,
  };
}

export function aHandicap(p: Personnage, h: Handicap): boolean {
  return p.corps.etat.handicaps.some((x) => x.type === h);
}

export function estEpuise(p: Personnage): boolean {
  return p.corps.etat.fatigue >= SEUIL_EPUISEMENT;
}

export function saigne(p: Personnage): boolean {
  return p.corps.etat.blessures.some((b) => b.saigne);
}

export function aDeLaFievre(p: Personnage, tick: number): boolean {
  return p.corps.etat.blessures.some(
    (b) => b.infectee && b.fievreJusqua !== null && b.fievreJusqua > tick,
  );
}

export function fractureNonImmobilisee(p: Personnage): boolean {
  return p.corps.etat.blessures.some((b) => b.type === "fracture" && !b.immobilisee);
}

export function graviteMax(p: Personnage): number {
  let g = 0;
  for (const b of p.corps.etat.blessures) g = Math.max(g, b.gravite);
  return g;
}

/**
 * Capacités 0..1 dérivées de l'âge, des blessures, des handicaps et de la
 * fatigue. Après trente jours, un handicap ne pèse plus que moitié : on s'y fait.
 */
export function capacites(p: Personnage, joursParAnnee: number, tick: number): Capacites {
  const ans = p.corps.ageJours / joursParAnnee;
  let mobilite = 1;
  let manipulation = 1;
  let vue = 1;
  let vigueur = 1;
  if (ans > 40) {
    vue -= 0.01 * (ans - 40);
    vigueur -= 0.01 * (ans - 40);
  }
  if (ans > 50) mobilite -= 0.015 * (ans - 50);
  for (const b of p.corps.etat.blessures) {
    if (b.type === "fracture") mobilite *= b.lieu === "jambe" ? 0.3 : 0.8;
    else if (b.lieu === "main" || b.lieu === "bras") manipulation *= 1 - 0.15 * b.gravite;
    else mobilite *= 1 - 0.1 * b.gravite;
    if (b.infectee && b.fievreJusqua !== null && b.fievreJusqua > tick) vigueur *= 0.6;
  }
  for (const h of p.corps.etat.handicaps) {
    const adapte = tick - h.depuis > 30 * 144;
    if (h.type === "boiterie") mobilite *= adapte ? 0.85 : 0.7;
    if (h.type === "main_raide") manipulation *= adapte ? 0.85 : 0.7;
  }
  if (p.corps.etat.fatigue > SEUIL_FATIGUE) {
    mobilite *= 0.9;
    manipulation *= 0.8;
  }
  const borne = (v: number): number => Math.max(0.2, Math.min(1, v));
  return {
    mobilite: borne(mobilite),
    manipulation: borne(manipulation),
    vue: borne(vue),
    vigueur: borne(vigueur),
  };
}

/** Sources de dégâts du corps, en points de santé par jour. */
export function sourcesDegats(
  p: Personnage,
  tick: number,
): { cause: string; perteParJour: number }[] {
  const sources: { cause: string; perteParJour: number }[] = [];
  let hemorragie = 0;
  let infection = 0;
  for (const b of p.corps.etat.blessures) {
    if (b.saigne) hemorragie += SAIGNEMENT_PAR_JOUR[b.gravite];
    if (b.infectee && b.fievreJusqua !== null && b.fievreJusqua > tick) {
      infection += FIEVRE_PAR_JOUR * (1.4 - 0.8 * phenotype(p.identite.genome, "immunite"));
    }
  }
  if (hemorragie > 0) sources.push({ cause: "hémorragie", perteParJour: hemorragie });
  if (infection > 0) sources.push({ cause: "infection", perteParJour: infection });
  if (p.corps.etat.carence === "gencives") sources.push({ cause: "carence", perteParJour: 1 });
  return sources;
}

// ---------------------------------------------------------------- humeur

export function ajouterHumeur(
  p: Personnage,
  cle: string,
  valeur: number,
  dureeTicks: number,
  tick: number,
): void {
  const existant = p.humeur.findIndex((m) => m.cle === cle);
  const m: Modificateur = { cle, valeur, depuis: tick, jusqua: tick + dureeTicks };
  if (existant >= 0) p.humeur[existant] = m;
  else p.humeur.push(m);
}

/** Somme des modificateurs actifs ; chacun s'efface sur son dernier quart. */
export function humeur(p: Personnage, tick: number): number {
  let total = 0;
  for (const m of p.humeur) {
    if (m.jusqua <= tick) continue;
    const duree = Math.max(1, m.jusqua - m.depuis);
    const restant = (m.jusqua - tick) / duree;
    total += m.valeur * (restant < 0.25 ? restant / 0.25 : 1);
  }
  return Math.max(-40, Math.min(40, total));
}

export function purgerHumeur(p: Personnage, tick: number): void {
  for (let i = p.humeur.length - 1; i >= 0; i--) {
    const m = p.humeur[i];
    if (m !== undefined && m.jusqua <= tick) p.humeur.splice(i, 1);
  }
}

// ---------------------------------------------------------------- fatigue

/** Un tick d'effort : +1 par heure, +2 de plus par heure avec un sac lourd ; l'endurance aide. */
/**
 * Un tick d'effort : une journée de travail (environ 90 ticks) ajoute 25 à 40
 * points selon l'endurance et la charge ; un déplacement en ajoute moins.
 */
export function fatigueEffort(p: Personnage, sacLourd: boolean, leger = false): void {
  const endurance = phenotype(p.identite.genome, "endurance");
  const facteur = 1.3 - 0.6 * endurance;
  const base = leger ? 0.2 : 0.35;
  p.corps.etat.fatigue = Math.min(
    100,
    p.corps.etat.fatigue + base * (sacLourd ? 1.5 : 1) * facteur,
  );
}

export type ModeRepos = "sommeil" | "repos" | "calme";

/**
 * Un tick de récupération : les nuits sont courtes (25 à 35 ticks de sommeil),
 * alors le sommeil efface 2,5 points par tick, le repos éveillé 0,7, le calme 0,15.
 */
export function fatigueRepos(p: Personnage, mode: ModeRepos): void {
  const vitesse = mode === "sommeil" ? 2.5 : mode === "repos" ? 0.7 : 0.15;
  p.corps.etat.fatigue = Math.max(0, p.corps.etat.fatigue - vitesse);
  if (p.corps.etat.fatigue < SEUIL_FATIGUE) p.corps.etat.epuisementSignale = false;
}

// ---------------------------------------------------------------- repas

export function categorieAliment(r: Ressource): CategorieAliment | null {
  switch (r) {
    case "baies":
      return "baies";
    case "poisson":
      return "poisson";
    case "gibier":
      return "viande";
    case "repas_cuit":
    case "poisson_fume":
      return "cuit";
    default:
      return NOURRITURE[r] !== undefined ? "cuit" : null;
  }
}

export function enregistrerRepas(p: Personnage, r: Ressource): void {
  const c = categorieAliment(r);
  if (c === null) return;
  p.corps.etat.repas.push(c);
  if (p.corps.etat.repas.length > 20) p.corps.etat.repas.shift();
}

/** Régime varié : au moins deux catégories dont du cuit sur les dix derniers repas. */
export function regimeVarie(p: Personnage): boolean {
  const derniers = p.corps.etat.repas.slice(-10);
  if (derniers.length < 6) return false;
  return new Set(derniers).size >= 2 && derniers.includes("cuit");
}

/** Carence : neuf repas sur dix d'une seule famille ; elle ne s'efface qu'en dessous de sept sur dix. */
function carenceDuRegime(p: Personnage): Carence | null {
  const repas = p.corps.etat.repas;
  if (repas.length < 20) return null;
  const compte = new Map<CategorieAliment, number>();
  for (const c of repas) compte.set(c, (compte.get(c) ?? 0) + 1);
  const actuelle = p.corps.etat.carence;
  for (const [c, n] of compte) {
    const carenceDe = c === "poisson" ? "gencives" : c === "baies" ? "ventre_creux" : null;
    const seuil = carenceDe !== null && carenceDe === actuelle ? 0.7 : 0.9;
    if (n / repas.length < seuil) continue;
    if (c === "poisson") return "gencives";
    if (c === "baies") return "ventre_creux";
  }
  return null;
}

// ---------------------------------------------------------------- blessures

export function blesser(
  monde: Monde,
  p: Personnage,
  type: TypeBlessure,
  gravite: Gravite,
  lieu: LieuBlessure,
  contexte: string,
): Blessure {
  const tick = monde.horloge.tick;
  const b: Blessure = {
    type,
    gravite,
    lieu,
    contexte,
    depuis: tick,
    saigne: type !== "fracture",
    bandee: false,
    infectee: false,
    fievreJusqua: null,
    cataplasme: false,
    immobilisee: false,
    ticksRepos: 0,
  };
  p.corps.etat.blessures.push(b);
  p.corps.sante = Math.max(1, p.corps.sante - PERTE_INITIALE[gravite]);
  ajouterHumeur(p, "blessure", -10 * gravite, 30 * monde.horloge.ticksParJour, tick);
  monde.emettre("blessure", p, { type, gravite, lieu, contexte }, 4 + gravite * 2);
  return b;
}

/** Tirage d'un accident selon le contexte ; renvoie la blessure ou null. */
export function tirerAccident(
  monde: Monde,
  p: Personnage,
  contexte: "bois" | "chasse" | "montagne",
  competence: number,
): Blessure | null {
  let probabilite = contexte === "bois" ? 0.005 : contexte === "chasse" ? 0.03 : 0.01;
  if (estEpuise(p)) probabilite *= 3;
  if (competence >= 5) probabilite /= 2;
  if (!p.rng.chance(probabilite)) return null;
  const r = p.rng.suivant();
  if (contexte === "bois") {
    const gravite: Gravite = r < 0.7 ? 1 : r < 0.95 ? 2 : 3;
    return blesser(monde, p, "coupure", gravite, r < 0.5 ? "main" : "bras", "en fendant du bois");
  }
  if (contexte === "chasse") {
    return blesser(monde, p, "morsure", 2, r < 0.5 ? "jambe" : "bras", "à la chasse");
  }
  return blesser(monde, p, "fracture", 2, "jambe", "dans une chute en montagne");
}

/** Soigne `cible` avec ce que porte `soignant` ; renvoie ce qui a été fait, ou null. */
export function soignerAvec(monde: Monde, soignant: Personnage, cible: Personnage): string | null {
  const inv = soignant.corps.inventaire;
  const tick = monde.horloge.tick;
  const blessures = cible.corps.etat.blessures;
  const plaie = blessures.find((b) => b.saigne);
  if (plaie !== undefined && possede(inv, "bandage")) {
    retirerObjet(inv, "bandage");
    plaie.saigne = false;
    plaie.bandee = true;
    gagnerExperience(soignant.experience, "soin", 6);
    return "bandage";
  }
  const infectee = blessures.find(
    (b) => b.infectee && !b.cataplasme && b.fievreJusqua !== null && b.fievreJusqua > tick,
  );
  if (infectee !== undefined && possede(inv, "cataplasme")) {
    retirerObjet(inv, "cataplasme");
    infectee.cataplasme = true;
    if (infectee.fievreJusqua !== null)
      infectee.fievreJusqua = Math.min(
        infectee.fievreJusqua,
        tick + 2 * monde.horloge.ticksParJour,
      );
    gagnerExperience(soignant.experience, "soin", 8);
    return "cataplasme";
  }
  const fracture = blessures.find((b) => b.type === "fracture" && !b.immobilisee);
  if (fracture !== undefined && possede(inv, "attelle")) {
    retirerObjet(inv, "attelle");
    fracture.immobilisee = true;
    gagnerExperience(soignant.experience, "soin", 8);
    return "attelle";
  }
  const nonBandee = blessures.find((b) => !b.bandee && b.type !== "fracture");
  if (nonBandee !== undefined && possede(inv, "bandage")) {
    retirerObjet(inv, "bandage");
    nonBandee.bandee = true;
    gagnerExperience(soignant.experience, "soin", 4);
    return "bandage";
  }
  return null;
}

/** Ce dont `cible` aurait besoin, pour choisir quoi fabriquer. */
export function soinNecessaire(
  cible: Personnage,
  tick: number,
): "bandage" | "cataplasme" | "attelle" | null {
  const b = cible.corps.etat.blessures;
  if (b.some((x) => x.saigne || (!x.bandee && x.type !== "fracture"))) return "bandage";
  if (
    b.some((x) => x.infectee && !x.cataplasme && x.fievreJusqua !== null && x.fievreJusqua > tick)
  )
    return "cataplasme";
  if (b.some((x) => x.type === "fracture" && !x.immobilisee)) return "attelle";
  return null;
}

/**
 * Passe quotidienne : saignements qui s'arrêtent seuls, infections, fin de
 * fièvre, guérisons, séquelles, cicatrices, carences, handicaps de l'âge.
 */
export function passeQuotidienneCorps(monde: Monde, p: Personnage): void {
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  const etat = p.corps.etat;
  const soin = niveau(p.experience.soin);
  for (let i = etat.blessures.length - 1; i >= 0; i--) {
    const b = etat.blessures[i];
    if (b === undefined) continue;
    const jours = (tick - b.depuis) / T;
    // Une plaie légère cesse de saigner en un jour, une moyenne en trois.
    if (b.saigne && ((b.gravite === 1 && jours >= 1) || (b.gravite === 2 && jours >= 3)))
      b.saigne = false;
    // Infection : chaque jour sans bandage, une chance ; la morsure est plus sale.
    if (!b.infectee && b.type !== "fracture" && jours < 10) {
      const base = b.type === "morsure" ? 0.15 : 0.1;
      const probabilite = b.bandee ? base / 3 : base;
      if (p.rng.chance(probabilite)) {
        b.infectee = true;
        b.fievreJusqua =
          tick +
          Math.round(FIEVRE_JOURS * T * (1.4 - 0.8 * phenotype(p.identite.genome, "immunite")));
        monde.emettre("infection", p, { lieu: b.lieu, type: b.type }, 6);
        ajouterHumeur(p, "fievre", -12, FIEVRE_JOURS * T, tick);
      }
    }
    const fievreFinie = b.infectee && b.fievreJusqua !== null && b.fievreJusqua <= tick;
    const dureeGuerison = b.type === "fracture" ? GUERISON_FRACTURE_JOURS : b.gravite * 4;
    const guerie =
      jours >= dureeGuerison / (1 + 0.15 * soin) && !b.saigne && (!b.infectee || fievreFinie);
    if (!guerie) continue;
    etat.blessures.splice(i, 1);
    let sequelle: Handicap | null = null;
    if (b.type === "fracture") {
      const reposSuffisant = b.ticksRepos >= REPOS_FRACTURE_JOURS * T || b.immobilisee;
      if (p.rng.chance(reposSuffisant ? 0.05 : 0.25))
        sequelle = b.lieu === "jambe" ? "boiterie" : "main_raide";
    }
    if (b.gravite >= 2) etat.cicatrices += 1;
    if (sequelle !== null && !aHandicap(p, sequelle)) {
      etat.handicaps.push({ type: sequelle, depuis: tick });
      ajouterHumeur(p, "sequelle", -10, 30 * T, tick);
      monde.emettre("sequelle", p, { handicap: sequelle, lieu: b.lieu }, 8);
    } else {
      ajouterHumeur(p, "guerison", 8, 10 * T, tick);
      monde.emettre(
        "guerison",
        p,
        { type: b.type, gravite: b.gravite, cicatrice: b.gravite >= 2 },
        5,
      );
    }
  }
  // Carences du régime.
  const carence = carenceDuRegime(p);
  if (carence !== etat.carence) {
    etat.carence = carence;
    if (carence !== null) monde.emettre("carence", p, { carence }, 5);
  }
  if (etat.carence !== null) ajouterHumeur(p, "carence", -10, 2 * T, tick);
  // L'âge : à cinquante ans, trois fois sur dix, les dents lâchent.
  const ans = p.corps.ageJours / monde.config.vie.joursParAnnee;
  if (
    Math.abs(ans - 50) < 0.5 / monde.config.vie.joursParAnnee &&
    p.corps.ageJours % monde.config.vie.joursParAnnee === 0
  ) {
    if (!aHandicap(p, "sans_dents") && p.rng.chance(0.3)) {
      etat.handicaps.push({ type: "sans_dents", depuis: tick });
      monde.emettre("sequelle", p, { handicap: "sans_dents", lieu: "" }, 6);
    }
  }
  purgerHumeur(p, tick);
}

/** Risque de mourir en couches, et qui assiste la mère. */
export function risqueAccouchement(
  monde: Monde,
  mere: Personnage,
): { probabilite: number; accoucheuse: Personnage | null } {
  const ans = mere.corps.ageJours / monde.config.vie.joursParAnnee;
  let probabilite = 0.03;
  if (mere.corps.sante < 50 || ans > 40) probabilite *= 2;
  const rayon = (mere.savoirs.get("accoucheuse")?.force ?? 0) >= 0.6 ? 10 : 3;
  let accoucheuse: Personnage | null = null;
  for (const a of monde.personnages) {
    if (!a.vivant || a.id === mere.id || a.corps.stade === "enfant") continue;
    const dx = Math.abs(a.corps.position.x - mere.corps.position.x);
    const dy = Math.abs(a.corps.position.y - mere.corps.position.y);
    if (Math.max(dx, dy) > rayon) continue;
    const experimentee =
      (a.identite.sexe === "F" && a.corps.dernierAccouchement !== null) ||
      niveau(a.experience.soin) >= 3;
    if (experimentee) {
      accoucheuse = a;
      break;
    }
  }
  if (accoucheuse !== null) probabilite /= 2;
  return { probabilite, accoucheuse };
}
