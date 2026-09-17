/**
 * Vue du monde partagée par les sous-systèmes (actions, cerveaux, planificateur)
 * sans dépendre de la classe `Simulation` (évite les imports circulaires).
 */
import type { Personnage } from "./agents/personnage.js";
import type { SimConfig } from "./config.js";
import type { Loi } from "@sdv/protocole";
import type { Evenement, TypeEvenement } from "./evenements/journal.js";
import type { Batiment, TypeBatiment } from "./monde/batiments.js";
import { PLANS_BATIMENT } from "./monde/batiments.js";
import { INFO_BIOME } from "./monde/biomes.js";
import { Grille } from "./monde/grille.js";
import { SEUIL_SAVOIR } from "./savoirs/catalogue.js";
import type { Position, Tuile } from "./monde/grille.js";
import type { Horloge } from "./monde/horloge.js";
import type { Meteo } from "./monde/meteo.js";
import type { Troupeau } from "./monde/faune.js";
import type { Bete } from "./monde/village.js";
import { betesDe, enclosDe } from "./monde/village.js";
import type { Rng } from "./rng.js";
import type { EtatSociete } from "./social/societe.js";
import type { EtatChronique } from "./memoire/legendes.js";
import type { EtatTrouvailles } from "./savoirs/grammaire.js";
import type { EtatVillages } from "./monde/villages.js";

export interface Monde {
  readonly config: SimConfig;
  /** Les lois du monde (M25) : ce que l'observateur a suspendu. */
  readonly lois: Readonly<Record<Loi, boolean>>;
  readonly grille: Grille;
  readonly horloge: Horloge;
  readonly rng: Rng;
  readonly personnages: readonly Personnage[];
  /** Un personnage par identifiant, vivant ou mort (index, pas un parcours). */
  personnage(id: string): Personnage | undefined;
  readonly batiments: ReadonlyMap<string, Batiment>;
  /** La faune : un objet par troupeau ou meute (jalon « la faune vit »). */
  readonly troupeaux: ReadonlyMap<string, Troupeau>;
  /** Le bétail : bêtes apprivoisées, par identifiant. */
  readonly betail: ReadonlyMap<string, Bete>;
  ajouterBete(bete: Bete): void;
  retirerBete(id: string): void;
  prochainIdBete(): string;
  readonly meteo: Meteo;
  emettre(
    type: TypeEvenement,
    acteur: Personnage | null,
    details?: Evenement["details"],
    importance?: number,
    position?: Position | null,
  ): void;
  /** Fonde un chantier sur une tuile libre ; renvoie le bâtiment créé. */
  fonderChantier(type: TypeBatiment, position: Position, fondateur: Personnage): Batiment;
  /** Retire un bâtiment du monde (effondrement). */
  detruireBatiment(id: string): void;
  /** Fait naître l'enfant d'un couple ; renvoie le nouveau personnage. */
  naitre(mere: Personnage, pere: Personnage): Personnage;
  /** Fait mourir un personnage (cause libre). */
  tuer(p: Personnage, cause: string): void;
  /** La société (jalon 13) : coutumes, griefs, tension, alliances, lieux interdits. */
  readonly societe: EtatSociete;
  /** La mémoire collective (jalon 14) : récits, légendes, noms de lieux, proverbes. */
  readonly chronique: EtatChronique;
  /** Les villages (jalon 15) : schismes, bandes, caravanes, diplomatie. */
  readonly villages: EtatVillages;
  /** Ce que le monde a trouvé (M38) : matières dérivées et trouvailles. */
  readonly trouvailles: EtatTrouvailles;
}

/**
 * Deux personnes sont apparentées si elles portent le même nom ou si un lien
 * familial (partenaire, parent, enfant, fratrie) les unit.
 */
export function apparentes(a: Personnage, b: Personnage): boolean {
  if (a.id === b.id) return true;
  if (a.identite.nomFamille === b.identite.nomFamille) return true;
  const lien = a.relations.get(b.id)?.lien;
  return lien === "partenaire" || lien === "parent" || lien === "enfant" || lien === "fratrie";
}

/** Vrai si la tuile est de l'eau (source de boisson). */
export function estEau(monde: Monde, x: number, y: number): boolean {
  const t = monde.grille.tuileOuNull(x, y);
  return t !== null && estTuileEau(t);
}

/** La même question, la tuile en main. */
export function estTuileEau(t: Tuile): boolean {
  if (t.biome === "eau_profonde" || t.biome === "eau_peu_profonde") return true;
  return (
    t.batiment !== null &&
    t.batiment.etat === "termine" &&
    PLANS_BATIMENT[t.batiment.type].sourceEau
  );
}

/** Vrai si une source d'eau est à distance ≤ 1 de la position. */
export function eauAdjacente(monde: Monde, pos: Position): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (estEau(monde, pos.x + dx, pos.y + dy)) return true;
    }
  }
  return false;
}

/** Les ports achevés (M30) : d'un port, la barque mène à tout autre, pirogue ou non. */
export function portsDe(monde: Monde): Position[] {
  const ports: Position[] = [];
  for (const b of monde.batiments.values())
    if (b.type === "port" && b.etat === "termine") ports.push(b.position);
  return ports;
}

/** Lieux d'eau que connaît une personne : la mesure de « l'eau est partout autour ». */
export function lieuxEauConnus(p: Personnage): number {
  let n = 0;
  for (const l of p.connaissance.values()) if (l.type === "eau") n++;
  return n;
}

export function personnagesVivants(monde: Monde): Personnage[] {
  return monde.personnages.filter((p) => p.vivant);
}

/** Le personnage a-t-il le droit d'utiliser ce bâtiment ? (propriétaire, invité, famille, apparenté au propriétaire) */
export function autorise(monde: Monde, b: Batiment, p: Personnage): boolean {
  const jour = monde.horloge.moment().jourAbsolu;
  // Un banni n'a plus accès à rien, sinon aux tombes et aux chantiers communs.
  if (p.banni !== null && jour < p.banni.jusquaJour) return b.type === "tombe" || b.commun === true;
  if (b.commun === true) return true;
  if (b.proprietaire === p.id || b.autorises.includes(p.id) || b.famille === p.identite.nomFamille)
    return true;
  const s = monde.societe;
  // Les stocks ouverts par décision d'hiver, les abris des familles alliées par mariage.
  if (b.stock !== null && jour < s.stocksOuvertsJusquaJour) return true;
  if (PLANS_BATIMENT[b.type].abri) {
    const a = b.famille;
    const c = p.identite.nomFamille;
    if (s.alliances.includes(a < c ? `${a}|${c}` : `${c}|${a}`)) return true;
  }
  const proprietaire = monde.personnage(b.proprietaire);
  return proprietaire !== undefined && apparentes(p, proprietaire);
}

/**
 * Bâtiments accessibles, mémorisés une heure (six ticks) par personnage : la question
 * revient trente fois par tick, et les droits ne changent qu'aux événements rares.
 */
const cacheAcces = new WeakMap<Personnage, { heure: number; nombre: number; liste: Batiment[] }>();

export function batimentEn(monde: Monde, pos: Position): Batiment | null {
  return monde.grille.tuileOuNull(pos.x, pos.y)?.batiment ?? null;
}

/** Bâtiments (terminés ou non) auxquels le personnage a accès, triés par distance. */
export function batimentsAccessibles(monde: Monde, p: Personnage, type?: TypeBatiment): Batiment[] {
  const heure = Math.floor(monde.horloge.tick / 6);
  const nombre = monde.batiments.size;
  let entree = cacheAcces.get(p);
  if (entree?.heure !== heure || entree.nombre !== nombre) {
    entree = { heure, nombre, liste: accessibles(monde, p) };
    cacheAcces.set(p, entree);
  }
  // Le tri par distance, lui, suit le personnage à chaque appel (une distance par bâtiment).
  const pos = p.corps.position;
  const candidats = type === undefined ? entree.liste : entree.liste.filter((b) => b.type === type);
  const distances = candidats.map((b) => Grille.distance(pos, b.position));
  const ordre = candidats.map((_, i) => i);
  ordre.sort((i, j) => {
    const d = (distances[i] ?? 0) - (distances[j] ?? 0);
    return d !== 0 ? d : (candidats[i]?.id ?? "").localeCompare(candidats[j]?.id ?? "");
  });
  return ordre.map((i) => candidats[i]).filter((b): b is Batiment => b !== undefined);
}

/**
 * Les bâtiments auxquels le personnage a droit : les mêmes règles qu'`autorise`,
 * avec ce qui ne dépend que de la personne calculé une fois (bannissement,
 * stocks ouverts, familles alliées) — à deux cents habitants, la question se
 * pose des milliers de fois par tick.
 */
function accessibles(monde: Monde, p: Personnage): Batiment[] {
  const jour = monde.horloge.moment().jourAbsolu;
  const s = monde.societe;
  const famille = p.identite.nomFamille;
  const liste: Batiment[] = [];
  if (p.banni !== null && jour < p.banni.jusquaJour) {
    for (const b of monde.batiments.values())
      if (b.type === "tombe" || b.commun === true) liste.push(b);
    return liste;
  }
  const stocksOuverts = jour < s.stocksOuvertsJusquaJour;
  const allies = new Set<string>();
  for (const a of s.alliances) {
    const i = a.indexOf("|");
    const g = a.slice(0, i);
    const d = a.slice(i + 1);
    if (g === famille) allies.add(d);
    else if (d === famille) allies.add(g);
  }
  for (const b of monde.batiments.values()) {
    if (
      b.commun === true ||
      b.proprietaire === p.id ||
      b.famille === famille ||
      b.autorises.includes(p.id)
    ) {
      liste.push(b);
      continue;
    }
    if (b.stock !== null && stocksOuverts) {
      liste.push(b);
      continue;
    }
    if (PLANS_BATIMENT[b.type].abri && allies.has(b.famille)) {
      liste.push(b);
      continue;
    }
    const proprietaire = monde.personnage(b.proprietaire);
    if (proprietaire !== undefined && apparentes(p, proprietaire)) liste.push(b);
  }
  return liste;
}

/** Comptage des dormeurs mémorisé ; à refaire dès que quelqu'un s'endort, se réveille, meurt ou grandit. */
const cacheDormeurs = new WeakMap<
  Monde,
  { tick: number; version: number; parTuile: Map<string, number> }
>();
let versionSommeil = 0;

/** À appeler quand un `endormi`, un `vivant` ou un `stade` change : le comptage des dormeurs est à refaire. */
export function sommeilChange(): void {
  versionSommeil += 1;
}

/** Nombre d'adultes endormis sur la tuile d'un bâtiment (les enfants se serrent, ils ne comptent pas). */
export function dormeurs(monde: Monde, b: Batiment): number {
  // Comptés une fois pour tout le monde, tant que rien n'a changé (la question revient pour
  // chaque abri de chacun, à chaque tick).
  let entree = cacheDormeurs.get(monde);
  if (entree?.version !== versionSommeil || entree.tick !== monde.horloge.tick) {
    const parTuile = new Map<string, number>();
    for (const p of monde.personnages) {
      if (!p.vivant || !p.corps.endormi || p.corps.stade === "enfant") continue;
      const cle = `${String(p.corps.position.x)},${String(p.corps.position.y)}`;
      parTuile.set(cle, (parTuile.get(cle) ?? 0) + 1);
    }
    entree = { tick: monde.horloge.tick, version: versionSommeil, parTuile };
    cacheDormeurs.set(monde, entree);
  }
  return entree.parTuile.get(`${String(b.position.x)},${String(b.position.y)}`) ?? 0;
}

/** Abri terminé, accessible, avec une place libre, le plus proche. */
export function abriDisponible(monde: Monde, p: Personnage): Batiment | null {
  for (const b of batimentsAccessibles(monde, p)) {
    if (b.etat !== "termine" || !PLANS_BATIMENT[b.type].abri) continue;
    if (p.corps.stade === "enfant") return b;
    const surPlace =
      p.corps.position.x === b.position.x && p.corps.position.y === b.position.y && p.corps.endormi
        ? 1
        : 0;
    if (dormeurs(monde, b) - surPlace < PLANS_BATIMENT[b.type].capaciteDormeurs) return b;
  }
  return null;
}

/** Feu de camp allumé à portée de la position (rayon du plan), le plus proche. */
export function feuProche(monde: Monde, pos: Position): Batiment | null {
  let meilleur: Batiment | null = null;
  let distanceMin = Infinity;
  for (const b of monde.batiments.values()) {
    if (b.etat !== "termine" || !b.allume) continue;
    const plan = PLANS_BATIMENT[b.type];
    if (plan.atelier !== "feu") continue;
    const d = Grille.distance(pos, b.position);
    if (d <= plan.rayonChaleur && d < distanceMin) {
      distanceMin = d;
      meilleur = b;
    }
  }
  return meilleur;
}

/** Atelier (feu allumé ou four terminé) à distance ≤ 1. */
export function atelierAdjacent(
  monde: Monde,
  pos: Position,
  atelier: "feu" | "four" | "fumoir",
): Batiment | null {
  for (const b of monde.batiments.values()) {
    if (b.etat !== "termine" || PLANS_BATIMENT[b.type].atelier !== atelier) continue;
    if (atelier === "feu" && !b.allume) continue;
    if (Grille.distance(pos, b.position) <= 1) return b;
  }
  return null;
}

/** Membres vivants de la famille (même nom ou lien familial) d'un personnage, lui compris. */
export function membresFamille(monde: Monde, p: Personnage): Personnage[] {
  return monde.personnages.filter((a) => a.vivant && apparentes(p, a));
}

/**
 * Prochain bâtiment dont le personnage (et sa famille) a besoin, par priorité :
 * abris pour tous, puis un feu, puis un lieu de stockage, puis une maison.
 * Les chantiers en cours comptent comme capacité future.
 */
export function prochainBatimentNecessaire(monde: Monde, p: Personnage): TypeBatiment | null {
  if (p.corps.stade === "enfant") return null;
  const acces = batimentsAccessibles(monde, p);
  // Un conseil de Claude : le bâtiment voulu passe devant, s'il manque encore.
  const ambition = p.ambition;
  if (
    ambition !== null &&
    ambition.issue === "en_cours" &&
    ambition.genre === "batiment" &&
    ambition.cible in PLANS_BATIMENT &&
    !acces.some(
      (b) =>
        b.type === ambition.cible && b.termineAuTick !== null && b.termineAuTick >= ambition.depuis,
    ) &&
    (ambition.cible !== "palissade" || tuileEnceinteManquante(monde, p) !== null) &&
    (ambition.cible !== "portail" || siteDuPortail(monde, p) !== null)
  )
    return ambition.cible as TypeBatiment;
  // Une migration conseillée : loin du foyer qu'on quitte, il faut d'abord un abri.
  if (
    ambition?.issue === "en_cours" &&
    ambition.genre === "migrer" &&
    ambition.origine !== undefined &&
    Grille.distance(p.corps.position, ambition.origine) >= DISTANCE_MIGRATION &&
    !acces.some(
      (b) =>
        PLANS_BATIMENT[b.type].abri &&
        Grille.distance(b.position, p.corps.position) <= DISTANCE_MIGRATION / 2,
    )
  )
    return "abri";
  const famille = membresFamille(monde, p).length;
  let capacite = 0;
  for (const b of acces) capacite += PLANS_BATIMENT[b.type].capaciteDormeurs;
  if (capacite < famille) return "abri";
  // Un feu éteint compte comme un feu à (r)allumer ; un feu à court de bois, à alimenter.
  if (!acces.some((b) => b.type === "feu_de_camp" && (b.etat === "chantier" || b.allume)))
    return "feu_de_camp";
  if (feuAAlimenter(monde, p) !== null) return "feu_de_camp";
  if (!acces.some((b) => PLANS_BATIMENT[b.type].capaciteStock > 0)) return "entrepot";
  if (
    (p.savoirs.get("puits_pres_du_village")?.force ?? 0) >= 0.6 &&
    ![...monde.batiments.values()].some((b) => b.type === "puits")
  )
    return "puits";
  if (famille >= 3 && !acces.some((b) => b.type === "maison")) return "maison";
  // Un chantier décidé par le village : on y contribue une fois la famille logée, nourrie et au sec.
  const commun = acces.find((b) => b.commun === true && b.etat === "chantier");
  if (commun !== undefined && p.besoins.faim >= 50 && p.besoins.chaleur >= 50) return commun.type;
  // Une famille qui croit bâtit un autel (un seul par village).
  const membres = membresFamille(monde, p);
  const foiMoyenne = membres.reduce((t, m) => t + m.foi, 0) / Math.max(1, membres.length);
  if (foiMoyenne >= 5 && ![...monde.batiments.values()].some((b) => b.type === "autel"))
    return "autel";
  // Le fumoir, une fois inventé, dès que le poisson s'entasse.
  if (
    (p.savoirs.get("fumoir")?.force ?? 0) >= SEUIL_SAVOIR &&
    !acces.some((b) => b.type === "fumoir") &&
    acces.some((b) => b.stock !== null && (b.stock.ressources.poisson ?? 0) >= 15)
  )
    return "fumoir";
  // L'idée de la fonte est venue : il faut un four (argile et pierre) pour la réaliser ; un seul
  // par village, il sert à tous.
  if (
    (p.savoirs.get("fonte")?.force ?? 0) >= SEUIL_SAVOIR &&
    ![...monde.batiments.values()].some((b) => b.type === "four")
  )
    return "four";
  // Un port (M30), une fois la pirogue maîtrisée et l'eau bien connue : entre deux ports, tout
  // le monde traverse, pirogue ou non. Un seul par village.
  if (
    (p.savoirs.get("pirogue")?.force ?? 0) >= 1 &&
    lieuxEauConnus(p) >= LIEUX_EAU_POUR_PORT &&
    ![...monde.batiments.values()].some(
      (b) => b.type === "port" && Grille.distance(b.position, p.corps.position) <= RAYON_PORT,
    )
  )
    return "port";
  // Des bêtes et pas d'enclos : on en bâtit un.
  if (
    betesDe(monde, p.identite.nomFamille).length > 0 &&
    enclosDe(monde, p.identite.nomFamille) === null
  )
    return "enclos";
  // Des graines en main ou au stock à la belle saison : un champ.
  const saison = monde.horloge.moment().saison;
  if (
    (saison === "printemps" || saison === "ete") &&
    !acces.some((b) => b.type === "champ") &&
    grainesAccessibles(monde, p) >= 4
  )
    return "champ";
  // Des murs contre les loups : une enceinte de pieux autour du village (M39a).
  if ((p.savoirs.get("murs_contre_les_loups")?.force ?? 0) >= SEUIL_SAVOIR) {
    if (tuileEnceinteManquante(monde, p) !== null) return "palissade";
    // L'anneau tient debout : on y taille un portail, par où l'on sort.
    if (siteDuPortail(monde, p) !== null) return "portail";
  }
  return null;
}

/** Graines en poche et dans les stocks familiaux. */
export function grainesAccessibles(monde: Monde, p: Personnage): number {
  let n = p.corps.inventaire.ressources.graines ?? 0;
  for (const b of batimentsAccessibles(monde, p))
    if (b.etat === "termine" && b.stock !== null) n += b.stock.ressources.graines ?? 0;
  return n;
}

/** Distance au vieux foyer à partir de laquelle une migration s'installe (nouvel abri). */
export const DISTANCE_MIGRATION = 16;
/** Lieux d'eau connus à partir desquels un port vaut la peine (autant que l'idée de la pirogue). */
export const LIEUX_EAU_POUR_PORT = 25;
/** Un port sert à tout un village : pas deux à moins de cette distance. */
export const RAYON_PORT = 40;

/** Rayon minimal de l'enceinte ; elle s'élargit pour contenir le village. */
export const RAYON_ENCEINTE = 3;
/** Au-delà, une enceinte demanderait trop de bois pour tenir debout. */
export const RAYON_ENCEINTE_MAX = 7;
/** Part de l'anneau qu'il faut avoir dressée avant de tailler un portail. */
export const PART_ENCEINTE_POUR_PORTAIL = 0.6;

/**
 * Le centre de l'enceinte (M39a) : celui du village quand la personne en a un,
 * sinon le plus ancien abri de sa famille. **[DÉCISION]** Une enceinte entoure
 * le village, pas une maison : c'est ce qui la rend lisible sur la carte.
 */
export function centreEnceinte(monde: Monde, p: Personnage): Position | null {
  return enceinteDe(monde, p)?.centre ?? null;
}

/**
 * L'enceinte du village de cette personne : celle qui est déjà tracée, ou celle
 * qu'on trace maintenant — et alors on la retient, pour qu'elle ne bouge plus.
 */
export function enceinteDe(
  monde: Monde,
  p: Personnage,
): { readonly centre: Position; readonly rayon: number } | null {
  const village = monde.villages.villages.find((v) => v.familles.includes(p.identite.nomFamille));
  if (village?.enceinte !== undefined) return village.enceinte;
  const centre =
    village?.centre ??
    batimentsAccessibles(monde, p)
      .filter((b) => b.etat === "termine" && PLANS_BATIMENT[b.type].abri)
      .sort((a, b) => a.id.localeCompare(b.id))[0]?.position;
  if (centre === undefined) return null;
  const enceinte = { centre: { x: centre.x, y: centre.y }, rayon: rayonEnceinte(monde, centre) };
  if (village !== undefined) village.enceinte = enceinte;
  return enceinte;
}

/**
 * Le rayon de l'anneau. **[DÉCISION]** Une fois des pieux dressés autour de ce
 * centre, c'est leur rayon qui vaut, pour toujours : sinon le village grandit,
 * le rayon avec lui, et l'on dresse un second anneau plus large en laissant le
 * premier debout — ce sont ces anneaux empilés qui donnaient des pieux partout.
 * Sans pieu encore, on prend de quoi contenir ce qu'on a bâti.
 */
export function rayonEnceinte(monde: Monde, centre: Position): number {
  // Le rayon déjà choisi : celui où se tient le plus de pieux.
  const parRayon = new Map<number, number>();
  for (const b of monde.batiments.values()) {
    if (b.type !== "palissade" && b.type !== "portail") continue;
    const d = Math.max(Math.abs(b.position.x - centre.x), Math.abs(b.position.y - centre.y));
    if (d < RAYON_ENCEINTE - 1 || d > RAYON_ENCEINTE_MAX + 1) continue;
    parRayon.set(d, (parRayon.get(d) ?? 0) + 1);
  }
  let choisi = 0;
  let mieux = 0;
  for (const [d, n] of parRayon) {
    // Un pieu rattrapé d'un pas compte pour l'anneau qu'il borde.
    const rayon = Math.max(RAYON_ENCEINTE, Math.min(RAYON_ENCEINTE_MAX, d));
    const total = n + (parRayon.get(rayon) ?? 0);
    if (total > mieux) {
      mieux = total;
      choisi = rayon;
    }
  }
  if (choisi > 0) return choisi;
  let loin = 0;
  for (const b of monde.batiments.values()) {
    if (b.type === "palissade" || b.type === "portail" || b.type === "champ") continue;
    const d = Grille.distance(b.position, centre);
    if (d <= RAYON_ENCEINTE_MAX && d > loin) loin = d;
  }
  return Math.max(RAYON_ENCEINTE, Math.min(RAYON_ENCEINTE_MAX, loin + 1));
}

/**
 * Les tuiles de l'anneau, dans le sens des aiguilles d'une montre. Une tuile
 * qu'un bâtiment occupe, ou qu'on ne peut pas bâtir sans être fermée pour autant
 * (un marais, un gué), est **rattrapée** de un ou deux pas vers l'intérieur puis
 * vers l'extérieur, pour que le mur reste continu au lieu de se trouer. L'eau et la
 * montagne ferment d'elles-mêmes et ne sont pas rattrapées.
 *
 * **[DÉCISION]** Une souche ou un tas de pierres sur le tracé ne fait plus un
 * trou (M41) : la tuile reste de l'anneau, et l'on va la **défricher** avant d'y
 * planter le pieu. Sans cela le mur gardait des brèches, `enclos` le voyait
 * ouvert, et la palissade ne protégeait de rien.
 */
export function tuilesEnceinte(monde: Monde, centre: Position, rayon: number): Position[] {
  const anneau: Position[] = [];
  const prises = new Set<string>();
  const bord: [number, number][] = [];
  for (let d = -rayon; d <= rayon; d++) bord.push([d, -rayon]);
  for (let d = -rayon + 1; d <= rayon; d++) bord.push([rayon, d]);
  for (let d = rayon - 1; d >= -rayon; d--) bord.push([d, rayon]);
  for (let d = rayon - 1; d >= -rayon + 1; d--) bord.push([-rayon, d]);
  for (const [dx, dy] of bord) {
    const ideale = { x: centre.x + dx, y: centre.y + dy };
    const ferme = (pos: Position): boolean => {
      const t = monde.grille.tuileOuNull(pos.x, pos.y);
      return t === null || !INFO_BIOME[t.biome].praticable;
    };
    // L'eau, la montagne : le mur est déjà là.
    if (ferme(ideale)) continue;
    // Le rattrapage se fait **perpendiculairement au mur** : sur un bord est ou
    // ouest on ne bouge qu'en x, sur un bord nord ou sud qu'en y, et seulement à
    // un angle on bouge les deux. Déplacer une tuile de bord en diagonale la
    // détachait de ses voisines et ouvrait une brèche que les loups passaient.
    const surX = Math.abs(dx) === rayon;
    const surY = Math.abs(dy) === rayon;
    const vers = (k: number): Position => ({
      x: centre.x + dx - (surX ? Math.sign(dx) * k : 0),
      y: centre.y + dy - (surY ? Math.sign(dy) * k : 0),
    });
    // Deux pas de rattrapage : un marais ou un gué sur le tracé est praticable mais
    // ne se bâtit pas, et laissait passer les loups par la brèche (M41).
    const candidates = [ideale, vers(1), vers(-1), vers(2), vers(-2)];
    for (const pos of candidates) {
      const t = monde.grille.tuileOuNull(pos.x, pos.y);
      // Un marais se laisse assécher (M41) : il compte pour le tracé.
      if (t === null || !(INFO_BIOME[t.biome].constructible || t.biome === "marais")) continue;
      if (t.batiment !== null && t.batiment.type !== "palissade" && t.batiment.type !== "portail")
        continue;
      // Un rattrapage peut tomber sur la tuile du voisin : on ne la compte qu'une fois.
      const cle = `${pos.x},${pos.y}`;
      if (prises.has(cle)) break;
      prises.add(cle);
      anneau.push(pos);
      break;
    }
  }
  return anneau;
}

/** Les tuiles de l'anneau déjà dressées (pieu ou portail). */
function enceinteDressee(monde: Monde, anneau: readonly Position[]): Position[] {
  return anneau.filter((pos) => {
    const t = monde.grille.tuileOuNull(pos.x, pos.y);
    return (
      t?.batiment != null && (t.batiment.type === "palissade" || t.batiment.type === "portail")
    );
  });
}

/**
 * Prochaine tuile de l'enceinte qui manque encore, la plus proche de celui qui
 * bâtit. `null` quand l'anneau est clos.
 */
export function tuileEnceinteManquante(monde: Monde, p: Personnage): Position | null {
  const e = enceinteDe(monde, p);
  if (e === null) return null;
  const anneau = tuilesEnceinte(monde, e.centre, e.rayon);
  let meilleure: Position | null = null;
  let distance = Infinity;
  for (const pos of anneau) {
    const t = monde.grille.tuileOuNull(pos.x, pos.y);
    if (t?.batiment != null) continue;
    if (t === null) continue;
    const d = Grille.distance(p.corps.position, pos);
    if (d < distance) {
      distance = d;
      meilleure = pos;
    }
  }
  return meilleure;
}

/**
 * Où tailler le portail (M39a) : sur l'anneau bien dressé, la tuile qui regarde
 * l'eau connue la plus proche — c'est par là qu'on sort le plus souvent. `null`
 * tant que l'anneau est trop ajouré, ou s'il a déjà son portail.
 */
export function siteDuPortail(monde: Monde, p: Personnage): Position | null {
  const e = enceinteDe(monde, p);
  if (e === null) return null;
  const centre = e.centre;
  const anneau = tuilesEnceinte(monde, centre, e.rayon);
  if (anneau.length === 0) return null;
  const dressees = enceinteDressee(monde, anneau);
  if (dressees.length < anneau.length * PART_ENCEINTE_POUR_PORTAIL) return null;
  for (const pos of dressees) {
    const t = monde.grille.tuileOuNull(pos.x, pos.y);
    if (t?.batiment?.type === "portail") return null;
  }
  // Le côté de l'eau : à défaut, celui d'où l'on vient.
  let vise = p.corps.position;
  let dEau = Infinity;
  for (const l of p.connaissance.values()) {
    if (l.type !== "eau") continue;
    const d = Grille.distance(centre, l);
    if (d < dEau) {
      dEau = d;
      vise = { x: l.x, y: l.y };
    }
  }
  let meilleure: Position | null = null;
  let distance = Infinity;
  for (const pos of dressees) {
    const d = Grille.distance(pos, vise);
    if (d < distance) {
      distance = d;
      meilleure = pos;
    }
  }
  return meilleure;
}

/** Chantier de ce type appartenant à la famille, s'il en existe un. */
export function chantierFamilial(monde: Monde, p: Personnage, type: TypeBatiment): Batiment | null {
  return batimentsAccessibles(monde, p, type).find((b) => b.etat === "chantier") ?? null;
}

/** Feu de camp familial terminé mais éteint, le plus proche. */
export function feuEteint(monde: Monde, p: Personnage): Batiment | null {
  return (
    batimentsAccessibles(monde, p, "feu_de_camp").find((b) => b.etat === "termine" && !b.allume) ??
    null
  );
}

/** Réserve de bûches d'un feu, au plus ; consommation par jour, et sous la neige. */
export const RESERVE_BOIS_MAX = 20;
/** Bûches par jour : à la belle saison le feu couve sans rien consommer, en saison froide il brûle. */
export const BUCHES_PAR_JOUR = 0;
export const BUCHES_PAR_JOUR_FROID = 1;
export const BUCHES_PAR_JOUR_NEIGE = 2;

/** Réserve en dessous de laquelle on va chercher du bois pour le feu (plus tôt en saison froide). */
export function seuilReserveBois(monde: Monde): number {
  const saison = monde.horloge.moment().saison;
  return saison === "automne" || saison === "hiver" ? 4 : 0;
}

/** Feu familial éteint, ou allumé mais à court de bûches, le plus proche. */
export function feuAAlimenter(monde: Monde, p: Personnage): Batiment | null {
  const seuil = seuilReserveBois(monde);
  return (
    batimentsAccessibles(monde, p, "feu_de_camp").find(
      (b) => b.etat === "termine" && (!b.allume || (seuil > 0 && b.reserveBois < seuil)),
    ) ?? null
  );
}

/** Bâtiment familial terminé dont la solidité est passée sous le seuil, le plus abîmé. */
export function batimentAReparer(monde: Monde, p: Personnage, seuil = 60): Batiment | null {
  let pire: Batiment | null = null;
  for (const b of batimentsAccessibles(monde, p)) {
    if (b.etat !== "termine" || b.solidite >= seuil) continue;
    if (pire === null || b.solidite < pire.solidite) pire = b;
  }
  return pire;
}
