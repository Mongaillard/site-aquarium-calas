/**
 * Les batailles tick par tick (M32). Avant, une bataille entre villages se
 * résolvait d'un coup à l'aube, hors écran, et une attaque de loups ou un
 * pillage en un tick. Désormais elles durent : une troupe marche jusqu'au
 * village ennemi ; sur place, chaque combattant choisit un adversaire à
 * portée et frappe à sa cadence, les défenseurs sortent des maisons, la
 * palissade compte, les blessés reculent, les morts sont rares. Les bandes
 * de pillards et les meutes (M32c) sont des camps « virtuels » : des membres
 * avec une position et une santé, menés par le moteur, que les villageois
 * combattent par le même code. L'issue rejoue ce que M21 et M10 appliquaient
 * déjà (butin, pillage, meute repoussée, peur, attitude), et le journal des
 * coups (`frappes`) sert au viewer pour animer. Tout est déterministe.
 */
import { SANTE_FUITE, bonusArme, defenseursAutour } from "../agents/combat.js";
import { blesser } from "../agents/corps.js";
import type { Gravite, LieuBlessure } from "../agents/corps.js";
import { phenotype } from "../agents/genetique.js";
import { ajouter, possede } from "../agents/inventaire.js";
import { niveau } from "../agents/competences.js";
import { clamp } from "../agents/besoins.js";
import type { Personnage } from "../agents/personnage.js";
import { stresser } from "../memoire/psyche.js";
import type { Monde } from "../monde.js";
import type { Rng } from "../rng.js";
import { Grille } from "./grille.js";
import type { Position } from "./grille.js";
import type { Troupeau } from "./faune.js";
import { faireFuir } from "./faune.js";
import {
  BATAILLES_MAX,
  JOURS_ENTRE_BATAILLES,
  PART_PILLAGE,
  adultesDe,
  faireLaPaix,
  forceDe,
  habitants,
  jourDe,
  nourritureDe,
  prelever,
  relationEntre,
  stocksDe,
  villageDe,
} from "./villages.js";
import type { Bande, Diplomatie, Village } from "./villages.js";

export type GenreBataille = "guerre" | "raid" | "meute";
export type PhaseBataille = "marche" | "combat" | "finie";
export type IssueBataille = "attaquant" | "defenseur" | "treve";

/** Un coup porté (ou manqué : dégâts 0), pour l'animation et le récit. */
export interface Frappe {
  readonly tick: number;
  readonly de: string;
  readonly vers: string;
  readonly degats: number;
  readonly mortelle: boolean;
}

/** Un combattant virtuel (pillard, loup) : mené par le moteur, sans cerveau ni inventaire. */
export interface Membre {
  readonly id: string;
  x: number;
  y: number;
  sante: number;
  readonly santeMax: number;
  /** Ticks avant le prochain coup. */
  cadence: number;
}

export interface Camp {
  /** Le village (null pour une bande ou une meute). */
  readonly village: string | null;
  readonly bande: string | null;
  readonly meute: string | null;
  /** Les combattants encore engagés (personnages ou membres virtuels). */
  guerriers: string[];
  /** Tous ceux qui ont pris les armes depuis le début (la défense se lève au fil du combat). */
  forceInitiale: number;
  membres: Membre[];
  /** Coups reçus et morts, comptés au fil du combat. */
  blesses: number;
  morts: number;
}

export interface Bataille {
  readonly id: string;
  readonly genre: GenreBataille;
  phase: PhaseBataille;
  readonly attaquant: Camp;
  readonly defenseur: Camp;
  /** Le lieu de l'assaut : le centre du village défenseur, ou la proie de la meute. */
  readonly lieu: Position;
  readonly debutTick: number;
  combatTick: number | null;
  /** Premier et dernier ticks où les deux camps étaient sur le champ. */
  premierContactTick: number | null;
  contactTick: number | null;
  finTick: number | null;
  issue: IssueBataille | null;
  frappes: Frappe[];
  /** Meute : la proie visée ; le prénom du premier mort, pour le récit. */
  proie: string | null;
  victime: string | null;
}

/** À cette distance du lieu, la troupe donne l'assaut. */
export const RAYON_ASSAUT = 6;
/** L'alarme porte loin : les adultes du village défenseur à cette distance du lieu accourent. */
export const RAYON_DEFENSE = 40;
/** Le champ de bataille : on ne s'y bat qu'à cette distance du lieu, sans courir après les fuyards. */
export const RAYON_CHAMP = 8;
/** Sans adversaire sur le champ ce temps-là, le camp resté seul l'emporte. */
export const TICKS_SANS_CONTACT = 24;
/** Un combat ne dure pas plus d'une demi-journée ; une marche, deux jours. */
export const DUREE_COMBAT_MAX = 72;
export const DUREE_MARCHE_MAX = 288;
export const GUERRIERS_MAX = 12;
/** La défense ne dégarnit pas le village : une fois et demie la troupe adverse au plus. */
export const RATIO_DEFENSE = 1.5;
/** Ticks entre deux coups d'un même combattant. */
export const CADENCE_FRAPPE = 3;
export const FRAPPES_GARDEES = 40;
/** Santé d'un pillard, d'un loup. */
export const SANTE_PILLARD = 60;
export const SANTE_LOUP = 30;
/** Une bataille finie reste lisible ce temps-là, puis s'efface. */
const REMANENCE = 144;

export function batailleDe(monde: Monde, id: string | null | undefined): Bataille | undefined {
  if (id === null || id === undefined) return undefined;
  return monde.villages.batailles.find((b) => b.id === id);
}

/** La bataille en cours (une à la fois), ou null. */
export function batailleActive(monde: Monde): Bataille | null {
  return monde.villages.batailles.find((b) => b.phase !== "finie") ?? null;
}

export function campDe(b: Bataille, id: string): "attaquant" | "defenseur" | null {
  if (b.attaquant.guerriers.includes(id)) return "attaquant";
  if (b.defenseur.guerriers.includes(id)) return "defenseur";
  return null;
}

function membreDe(b: Bataille, id: string): Membre | null {
  return (
    b.attaquant.membres.find((m) => m.id === id) ??
    b.defenseur.membres.find((m) => m.id === id) ??
    null
  );
}

/** La position d'un combattant, personnage vivant ou membre virtuel ; null s'il n'est plus là. */
export function positionDe(monde: Monde, b: Bataille, id: string): Position | null {
  const m = membreDe(b, id);
  if (m !== null) return { x: m.x, y: m.y };
  const p = monde.personnage(id);
  return p?.vivant === true ? p.corps.position : null;
}

export interface Adversaire {
  readonly id: string;
  readonly position: Position;
}

/** L'adversaire vivant le plus proche de `id` sur le champ de bataille, ou null. */
export function adversaireLePlusProche(
  monde: Monde,
  b: Bataille,
  id: string,
  depuis: Position,
): Adversaire | null {
  const camp = campDe(b, id);
  if (camp === null) return null;
  const ennemis = camp === "attaquant" ? b.defenseur.guerriers : b.attaquant.guerriers;
  let meilleur: Adversaire | null = null;
  let dMin = Infinity;
  for (const e of ennemis) {
    const position = positionDe(monde, b, e);
    if (position === null || Grille.distance(position, b.lieu) > RAYON_CHAMP) continue;
    const d = Grille.distance(depuis, position);
    if (d < dMin || (d === dMin && meilleur !== null && e < meilleur.id)) {
      dMin = d;
      meilleur = { id: e, position };
    }
  }
  return meilleur;
}

function villageDId(monde: Monde, id: string | null): Village | null {
  if (id === null) return null;
  return monde.villages.villages.find((v) => v.id === id) ?? null;
}

function campVillage(village: string | null, guerriers: readonly string[]): Camp {
  return {
    village,
    bande: null,
    meute: null,
    guerriers: [...guerriers],
    forceInitiale: guerriers.length,
    membres: [],
    blesses: 0,
    morts: 0,
  };
}

/** Un camp virtuel : `n` membres autour de `centre`, en anneau, avec la santé donnée. */
function campVirtuel(
  prefixe: string,
  bande: string | null,
  meute: string | null,
  n: number,
  centre: Position,
  santeMax: number,
): Camp {
  const membres: Membre[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / Math.max(1, n)) * Math.PI * 2;
    membres.push({
      id: `${prefixe}:${String(i + 1)}`,
      x: centre.x + Math.round(Math.cos(ang) * (n > 1 ? 1 : 0)),
      y: centre.y + Math.round(Math.sin(ang) * (n > 1 ? 1 : 0)),
      sante: santeMax,
      santeMax,
      cadence: CADENCE_FRAPPE + (i % 3),
    });
  }
  return {
    village: null,
    bande,
    meute,
    guerriers: membres.map((m) => m.id),
    forceInitiale: n,
    membres,
    blesses: 0,
    morts: 0,
  };
}

function nouvelleBataille(
  monde: Monde,
  genre: GenreBataille,
  attaquant: Camp,
  defenseur: Camp,
  lieu: Position,
  phase: PhaseBataille,
): Bataille {
  const tick = monde.horloge.tick;
  const bataille: Bataille = {
    id: `bataille-${String(tick)}`,
    genre,
    phase,
    attaquant,
    defenseur,
    lieu: { ...lieu },
    debutTick: tick,
    combatTick: phase === "combat" ? tick : null,
    premierContactTick: null,
    contactTick: null,
    finTick: null,
    issue: null,
    frappes: [],
    proie: null,
    victime: null,
  };
  monde.villages.batailles.push(bataille);
  for (const id of [...attaquant.guerriers, ...defenseur.guerriers]) {
    const p = monde.personnage(id);
    if (p !== undefined) p.drapeaux.bataille = bataille.id;
  }
  return bataille;
}

/** Ceux qui peuvent partir en guerre : adultes valides, ni malades ni enceintes, sans plaie ouverte. */
export function guerriersDisponibles(monde: Monde, v: Village): Personnage[] {
  return adultesDe(monde, v)
    .filter(
      (p) =>
        p.corps.sante >= 60 &&
        p.corps.etat.maladies.length === 0 &&
        p.corps.enceinte === null &&
        !p.corps.etat.blessures.some((b) => b.saigne) &&
        (p.drapeaux.bataille ?? null) === null,
    )
    .sort(
      (x, y) =>
        phenotype(y.identite.genome, "force") - phenotype(x.identite.genome, "force") ||
        x.id.localeCompare(y.id),
    );
}

function palissadeProche(monde: Monde, pos: Position): boolean {
  for (const b of monde.batiments.values())
    if (b.type === "palissade" && b.etat === "termine" && Grille.distance(b.position, pos) <= 3)
      return true;
  return false;
}

/**
 * Lève une troupe : le village le plus fort (au hasard près) marche sur l'autre.
 * Null si une bataille court déjà ou si personne n'est en état de partir.
 */
export function leverTroupe(
  monde: Monde,
  rng: Rng,
  r: Diplomatie,
  a: Village,
  b: Village,
  attaquantForce: Village | null = null,
): Bataille | null {
  const e = monde.villages;
  if (batailleActive(monde) !== null) return null;
  const fa = forceDe(monde, a) * (0.8 + rng.suivant() * 0.4);
  const fb = forceDe(monde, b) * (0.8 + rng.suivant() * 0.4);
  const [att, def] =
    attaquantForce !== null
      ? attaquantForce.id === a.id
        ? [a, b]
        : [b, a]
      : fa >= fb
        ? [a, b]
        : [b, a];
  const disponibles = guerriersDisponibles(monde, att);
  const n = Math.min(GUERRIERS_MAX, Math.max(2, Math.ceil(disponibles.length * 0.6)));
  const guerriers = disponibles.slice(0, n);
  if (guerriers.length < 2) return null;
  e.derniereBatailleJour = jourDe(monde);
  const bataille = nouvelleBataille(
    monde,
    "guerre",
    campVillage(
      att.id,
      guerriers.map((p) => p.id),
    ),
    campVillage(def.id, []),
    def.centre,
    "marche",
  );
  monde.emettre(
    "village",
    null,
    {
      genre: "marche",
      bataille: bataille.id,
      a: att.id,
      b: def.id,
      aNom: att.nom,
      bNom: def.nom,
      guerriers: guerriers.length,
      numero: r.batailles + 1,
    },
    9,
    att.centre,
  );
  return bataille;
}

/** L'aube : chaque guerre déclarée lève une troupe, dix jours après la bataille précédente. */
export function aubeBatailles(monde: Monde, rng: Rng): void {
  const e = monde.villages;
  const jour = jourDe(monde);
  for (const r of e.relations) {
    if (r.etat !== "guerre" || r.batailles >= BATAILLES_MAX) continue;
    if (jour - e.derniereBatailleJour < JOURS_ENTRE_BATAILLES || jour - r.depuisJour < 3) continue;
    const a = villageDId(monde, r.a);
    const b = villageDId(monde, r.b);
    if (a === null || b === null) continue;
    if (batailleActive(monde) !== null) return;
    // Personne en état de partir : la guerre ne peut plus se faire, le prix du sang la clôt.
    if (leverTroupe(monde, rng, r, a, b) === null) faireLaPaix(monde, r, a, b);
    return;
  }
}

/**
 * Une bande arrivée devant un village trop faible pour un tribut (M32c) : le raid se joue
 * sur la carte. Les pillards sont un camp virtuel ; la défense se lève comme à la guerre.
 */
export function lancerRaid(monde: Monde, bande: Bande, village: Village): Bataille {
  const attaquant = campVirtuel(
    bande.id,
    bande.id,
    null,
    bande.taille,
    bande.position,
    SANTE_PILLARD,
  );
  const bataille = nouvelleBataille(
    monde,
    "raid",
    attaquant,
    campVillage(village.id, []),
    village.centre,
    "combat",
  );
  bande.etat = "combat";
  const n = leverLaDefense(monde, bataille, RAYON_DEFENSE);
  for (const p of habitants(monde, village)) {
    stresser(p, 10);
    p.drapeaux.alerteJusqua = Math.max(p.drapeaux.alerteJusqua, monde.horloge.tick + 36);
  }
  monde.emettre(
    "raid",
    null,
    {
      genre: "assaut",
      bataille: bataille.id,
      bande: bande.id,
      taille: bande.taille,
      village: village.id,
      nom: village.nom,
      defenseurs: n,
    },
    9,
    village.centre,
  );
  return bataille;
}

/**
 * Une meute qui atteint sa proie (M32c) : le combat de M10 se joue tick par tick. La proie et
 * ceux qui se tiennent à ses côtés se battent ; les autres armés du village accourent.
 */
export function lancerBatailleMeute(monde: Monde, meute: Troupeau, proie: Personnage): Bataille {
  const defenseurs = defenseursAutour(monde, proie).map((p) => p.id);
  const village = villageDe(monde, proie);
  const attaquant = campVirtuel(meute.id, null, meute.id, meute.taille, meute.position, SANTE_LOUP);
  const defenseur = campVillage(village?.id ?? null, defenseurs);
  const bataille = nouvelleBataille(
    monde,
    "meute",
    attaquant,
    defenseur,
    proie.corps.position,
    "combat",
  );
  bataille.proie = proie.id;
  meute.cible = null;
  return bataille;
}

function enroler(monde: Monde, b: Bataille, p: Personnage): void {
  b.defenseur.guerriers.push(p.id);
  b.defenseur.forceInitiale += 1;
  p.drapeaux.bataille = b.id;
  p.drapeaux.alerteJusqua = Math.max(p.drapeaux.alerteJusqua, monde.horloge.tick + 36);
}

/**
 * Les adultes du village défenseur à portée qui ne se battent pas encore prennent les armes,
 * les plus proches d'abord, sans dépasser une fois et demie la troupe adverse.
 */
function leverLaDefense(monde: Monde, b: Bataille, rayon: number): number {
  const village = villageDId(monde, b.defenseur.village);
  if (village === null) return 0;
  const plafond = Math.max(2, Math.ceil(b.attaquant.forceInitiale * RATIO_DEFENSE));
  const candidats = adultesDe(monde, village)
    .filter(
      (p) =>
        (p.drapeaux.bataille ?? null) === null &&
        p.corps.sante >= SANTE_FUITE &&
        !p.corps.endormi &&
        Grille.distance(p.corps.position, b.lieu) <= rayon,
    )
    .sort(
      (x, y) =>
        Grille.distance(x.corps.position, b.lieu) - Grille.distance(y.corps.position, b.lieu) ||
        x.id.localeCompare(y.id),
    );
  let n = 0;
  for (const p of candidats) {
    if (b.defenseur.forceInitiale >= plafond) break;
    enroler(monde, b, p);
    n += 1;
  }
  return n;
}

/** Un camp réduit au quart de sa force (ou à un seul) est en déroute. */
function enDeroute(c: Camp): boolean {
  return c.guerriers.length <= Math.max(1, Math.floor(c.forceInitiale / 4));
}

function liberer(monde: Monde, id: string): void {
  const p = monde.personnage(id);
  if (p === undefined) return;
  p.drapeaux.bataille = null;
  if (!p.vivant) return;
  p.drapeaux.alerteJusqua = Math.max(p.drapeaux.alerteJusqua, monde.horloge.tick + 36);
  if (p.intention?.type === "combattre") {
    p.intention = null;
    p.plan = [];
    p.actionEnCours = null;
  }
}

/** Les morts quittent le camp ; les blessés sous le seuil se retirent et fuient. */
function retirerHorsDeCombat(monde: Monde, b: Bataille, camp: Camp): void {
  camp.guerriers = camp.guerriers.filter((id) => {
    if (camp.membres.some((m) => m.id === id)) return true;
    const p = monde.personnage(id);
    if (p === undefined || !p.vivant || (p.drapeaux.bataille ?? null) !== b.id) return false;
    if (p.corps.sante >= SANTE_FUITE) return true;
    liberer(monde, id);
    p.intention = { type: "fuir" };
    p.plan = [];
    p.actionEnCours = null;
    return false;
  });
}

function nomDuCamp(monde: Monde, c: Camp): string {
  if (c.meute !== null) return "les loups";
  if (c.bande !== null) return "des pillards";
  return villageDId(monde, c.village)?.nom ?? "des étrangers";
}

/** Un coup de `de` sur `vers` (personnages ou membres) ; la frappe est consignée, manquée ou non. */
export function frapper(monde: Monde, b: Bataille, de: string, vers: string): Frappe {
  const tick = monde.horloge.tick;
  const attaquant = membreDe(b, de) === null ? monde.personnage(de) : undefined;
  const rng = attaquant?.rng ?? monde.rng.fork(`${b.id}/${de}/${String(tick)}`);
  const campAtt = campDe(b, de) === "attaquant" ? b.attaquant : b.defenseur;
  const campCible = campAtt === b.attaquant ? b.defenseur : b.attaquant;
  const cible = membreDe(b, vers);
  const cibleP = cible === null ? monde.personnage(vers) : undefined;
  const loups = b.genre === "meute" && campAtt.meute !== null;
  let chance =
    attaquant !== undefined
      ? 0.35 + bonusArme(attaquant) + 0.03 * niveau(attaquant.experience.chasse)
      : 0.3;
  if (cibleP !== undefined) {
    if (possede(cibleP.corps.inventaire, "vetement_cuir")) chance -= 0.05;
    if (campCible === b.defenseur && palissadeProche(monde, cibleP.corps.position)) chance -= 0.1;
  }
  chance = Math.max(0.1, Math.min(0.85, chance));
  let degats = 0;
  let mortelle = false;
  if (rng.chance(chance)) {
    if (cibleP?.vivant === true) {
      const r = rng.suivant();
      let gravite: Gravite = loups
        ? r < 0.6
          ? 1
          : r < 0.97
            ? 2
            : 3
        : r < 0.6
          ? 1
          : r < 0.95
            ? 2
            : 3;
      if (loups && gravite > 1 && possede(cibleP.corps.inventaire, "vetement_cuir"))
        gravite = (gravite - 1) as Gravite;
      const lieu: LieuBlessure = rng.choisir(["bras", "jambe", "flanc"] as const);
      const contexte = loups
        ? "sous les crocs des loups"
        : campAtt.bande !== null
          ? "sous les coups des pillards"
          : `à la bataille contre ${nomDuCamp(monde, campAtt)}`;
      const avant = cibleP.corps.sante;
      blesser(monde, cibleP, loups ? "morsure" : "coupure", gravite, lieu, contexte);
      degats = Math.round(avant - cibleP.corps.sante);
      campCible.blesses += 1;
      if (cibleP.corps.sante <= 15 && gravite >= 2 && rng.chance(0.5)) {
        monde.tuer(cibleP, loups ? "loups" : campAtt.bande !== null ? "pillards" : "bataille");
        mortelle = true;
        campCible.morts += 1;
        b.victime ??= cibleP.identite.prenom;
      }
    } else if (cible !== null) {
      degats =
        attaquant === undefined
          ? 10
          : 10 + Math.round(bonusArme(attaquant) * 50) + 2 * niveau(attaquant.experience.chasse);
      cible.sante -= degats;
      campCible.blesses += 1;
      if (cible.sante <= 0) {
        campCible.membres = campCible.membres.filter((m) => m.id !== cible.id);
        campCible.guerriers = campCible.guerriers.filter((id) => id !== cible.id);
        campCible.morts += 1;
        mortelle = true;
      }
    }
  }
  const frappe: Frappe = { tick, de, vers, degats, mortelle };
  b.frappes.push(frappe);
  if (b.frappes.length > FRAPPES_GARDEES) b.frappes.splice(0, b.frappes.length - FRAPPES_GARDEES);
  return frappe;
}

/** Les membres virtuels d'un camp : un pas vers l'adversaire le plus proche, puis un coup à la cadence. */
function agirMembres(monde: Monde, b: Bataille, camp: Camp): void {
  for (const m of [...camp.membres]) {
    if (!camp.membres.includes(m)) continue;
    const cible = adversaireLePlusProche(monde, b, m.id, { x: m.x, y: m.y });
    if (cible === null) {
      m.cadence = CADENCE_FRAPPE;
      continue;
    }
    if (Grille.distance({ x: m.x, y: m.y }, cible.position) > 1) {
      const nx = m.x + Math.sign(cible.position.x - m.x);
      const ny = m.y + Math.sign(cible.position.y - m.y);
      if (Grille.distance({ x: nx, y: ny }, b.lieu) <= RAYON_CHAMP) {
        m.x = nx;
        m.y = ny;
      }
      continue;
    }
    if (m.cadence > 0) {
      m.cadence -= 1;
      continue;
    }
    m.cadence = CADENCE_FRAPPE;
    frapper(monde, b, m.id, cible.id);
  }
}

/** Chaque tick : l'assaut quand la troupe arrive, la défense qui se lève, la fin du combat. */
export function tickBatailles(monde: Monde): void {
  const e = monde.villages;
  const tick = monde.horloge.tick;
  for (const b of e.batailles) {
    if (b.phase === "finie") continue;
    retirerHorsDeCombat(monde, b, b.attaquant);
    retirerHorsDeCombat(monde, b, b.defenseur);
    if (b.phase === "marche") {
      if (b.attaquant.guerriers.length === 0) {
        conclure(monde, b, "defenseur");
        continue;
      }
      const arrive = b.attaquant.guerriers.some((id) => {
        const p = monde.personnage(id);
        return p !== undefined && Grille.distance(p.corps.position, b.lieu) <= RAYON_ASSAUT;
      });
      if (arrive) {
        b.phase = "combat";
        b.combatTick = tick;
        const n = leverLaDefense(monde, b, RAYON_DEFENSE);
        const att = villageDId(monde, b.attaquant.village);
        const def = villageDId(monde, b.defenseur.village);
        if (def !== null)
          for (const p of habitants(monde, def)) {
            stresser(p, 10);
            p.drapeaux.alerteJusqua = Math.max(p.drapeaux.alerteJusqua, tick + 36);
          }
        monde.emettre(
          "village",
          null,
          {
            genre: "assaut",
            bataille: b.id,
            a: b.attaquant.village,
            b: b.defenseur.village,
            aNom: att?.nom ?? null,
            bNom: def?.nom ?? null,
            guerriers: b.attaquant.guerriers.length,
            defenseurs: n,
          },
          9,
          b.lieu,
        );
      } else if (tick - b.debutTick > DUREE_MARCHE_MAX) {
        conclure(monde, b, "treve");
      }
    } else {
      // Les retardataires du village prennent les armes en arrivant ; les membres virtuels agissent.
      leverLaDefense(monde, b, b.genre === "meute" ? RAYON_CHAMP + 2 : RAYON_DEFENSE);
      agirMembres(monde, b, b.attaquant);
      agirMembres(monde, b, b.defenseur);
      if (b.attaquant.meute !== null) {
        // La meute suit ses membres.
        const meute = monde.troupeaux.get(b.attaquant.meute);
        const m = b.attaquant.membres;
        if (meute !== undefined && m.length > 0)
          meute.position = {
            x: Math.round(m.reduce((s, x) => s + x.x, 0) / m.length),
            y: Math.round(m.reduce((s, x) => s + x.y, 0) / m.length),
          };
      }
      const surLeChamp = (camp: Camp): boolean =>
        camp.guerriers.some((id) => {
          const pos = positionDe(monde, b, id);
          return pos !== null && Grille.distance(pos, b.lieu) <= RAYON_CHAMP;
        });
      const attaquantsLa = surLeChamp(b.attaquant);
      const defenseursLa = surLeChamp(b.defenseur);
      if (attaquantsLa && defenseursLa) {
        b.contactTick = tick;
        b.premierContactTick ??= tick;
      }
      const depuisAssaut = tick - (b.combatTick ?? tick);
      if (b.attaquant.guerriers.length === 0) conclure(monde, b, "defenseur");
      else if (b.defenseur.guerriers.length === 0) conclure(monde, b, "attaquant");
      else if (b.contactTick !== null && enDeroute(b.attaquant) && !enDeroute(b.defenseur))
        conclure(monde, b, "defenseur");
      else if (b.contactTick !== null && enDeroute(b.defenseur) && !enDeroute(b.attaquant))
        conclure(monde, b, "attaquant");
      else if (b.contactTick === null) {
        // Personne en face : le village est pris, ou la troupe s'est dispersée avant.
        if (depuisAssaut >= DUREE_COMBAT_MAX)
          conclure(monde, b, attaquantsLa ? "attaquant" : "defenseur");
      } else if (tick - b.contactTick >= TICKS_SANS_CONTACT) {
        // Un camp a quitté le champ : l'autre l'emporte ; les deux : chacun rentre.
        conclure(
          monde,
          b,
          attaquantsLa === defenseursLa ? "treve" : attaquantsLa ? "attaquant" : "defenseur",
        );
      } else if (tick - (b.premierContactTick ?? tick) >= DUREE_COMBAT_MAX)
        conclure(monde, b, "treve");
    }
  }
  if (e.batailles.some((b) => b.phase === "finie" && tick - (b.finTick ?? tick) >= REMANENCE))
    e.batailles = e.batailles.filter(
      (b) => b.phase !== "finie" || tick - (b.finTick ?? tick) < REMANENCE,
    );
}

/**
 * La foudre du ciel (M33) tombe sur le champ de bataille : le combattant le plus proche de la
 * tuile, à deux tuiles, est frappé (un membre virtuel perd quarante ; un personnage a déjà sa
 * brûlure par le pouvoir lui-même). Le coup est consigné au nom du ciel pour l'animation.
 */
export function frappeDuCiel(monde: Monde, pos: Position): number {
  const b = batailleActive(monde);
  if (b?.phase !== "combat") return 0;
  let touches = 0;
  for (const camp of [b.attaquant, b.defenseur]) {
    for (const id of [...camp.guerriers]) {
      const p = positionDe(monde, b, id);
      if (p === null || Grille.distance(p, pos) > 2) continue;
      const m = membreDe(b, id);
      let degats = 0;
      if (m !== null) {
        degats = 40;
        m.sante -= degats;
        camp.blesses += 1;
        if (m.sante <= 0) {
          camp.membres = camp.membres.filter((x) => x.id !== m.id);
          camp.guerriers = camp.guerriers.filter((x) => x !== m.id);
          camp.morts += 1;
        }
      } else {
        degats = 20;
      }
      b.frappes.push({ tick: monde.horloge.tick, de: "ciel", vers: id, degats, mortelle: false });
      touches += 1;
    }
  }
  if (b.frappes.length > FRAPPES_GARDEES) b.frappes.splice(0, b.frappes.length - FRAPPES_GARDEES);
  return touches;
}

/** Un gardien du ciel posté à dix tuiles d'un raid ou d'une meute en plein combat les repousse. */
export function gardienRepousse(
  monde: Monde,
  gardiens: Iterable<{ readonly genre: string; readonly position: Position; faits: number }>,
): void {
  const b = batailleActive(monde);
  if (b?.phase !== "combat" || b.genre === "guerre") return;
  for (const g of gardiens) {
    if (g.genre !== "gardien" || Grille.distance(g.position, b.lieu) > 10) continue;
    g.faits += 1;
    monde.emettre(
      "divin",
      null,
      { pouvoir: "gardien_repousse", bataille: b.id, genre: b.genre },
      7,
      b.lieu,
    );
    conclure(monde, b, "defenseur");
    return;
  }
}

/** La fin : les flags tombent, puis les suites propres à chaque genre. */
export function conclure(monde: Monde, b: Bataille, issue: IssueBataille): void {
  const tick = monde.horloge.tick;
  b.phase = "finie";
  b.issue = issue;
  b.finTick = tick;
  for (const id of [...b.attaquant.guerriers, ...b.defenseur.guerriers]) liberer(monde, id);
  if (b.genre === "raid") conclureRaid(monde, b, issue);
  else if (b.genre === "meute") conclureMeute(monde, b, issue);
  else conclureGuerre(monde, b, issue);
}

/** Le butin change de mains, la peur et la rancune s'installent, la bataille compte. */
function conclureGuerre(monde: Monde, b: Bataille, issue: IssueBataille): void {
  const e = monde.villages;
  const tick = monde.horloge.tick;
  const att = villageDId(monde, b.attaquant.village);
  const def = villageDId(monde, b.defenseur.village);
  if (att === null || def === null) return;
  const r = relationEntre(e, att.id, def.id);
  r.batailles += 1;
  e.compteurs.batailles += 1;
  e.derniereBatailleJour = jourDe(monde);
  const gagnant = issue === "attaquant" ? att : issue === "defenseur" ? def : null;
  const perdant = gagnant === att ? def : gagnant === def ? att : null;
  let butin = 0;
  if (gagnant !== null && perdant !== null) {
    butin = prelever(stocksDe(monde, perdant), Math.floor(nourritureDe(monde, perdant) * 0.2));
    const stock = stocksDe(monde, gagnant)[0]?.stock ?? null;
    if (stock !== null) ajouter(stock, "poisson_fume", Math.min(butin, 20));
    for (const x of monde.batiments.values())
      if (x.etat === "termine" && Grille.distance(x.position, perdant.centre) <= 8)
        x.solidite = Math.max(5, x.solidite - 20);
  }
  for (const p of [...habitants(monde, att), ...habitants(monde, def)]) {
    stresser(p, 15);
    p.besoins.securite = clamp(p.besoins.securite - 25);
  }
  r.attitude = Math.max(-100, r.attitude - 10);
  monde.emettre(
    "village",
    null,
    {
      genre: "bataille",
      bataille: b.id,
      a: att.id,
      b: def.id,
      aNom: att.nom,
      bNom: def.nom,
      issue,
      gagnant: gagnant?.id ?? null,
      gagnantNom: gagnant?.nom ?? null,
      blesses: b.attaquant.blesses + b.defenseur.blesses,
      morts: b.attaquant.morts + b.defenseur.morts,
      butin,
      numero: r.batailles,
      duree: tick - (b.combatTick ?? b.debutTick),
    },
    10,
    b.lieu,
  );
}

/** Pillards vainqueurs : le pillage de M21 ; repoussés : ils s'en vont les mains vides. */
function conclureRaid(monde: Monde, b: Bataille, issue: IssueBataille): void {
  const e = monde.villages;
  const bande = e.bandes.find((x) => x.id === b.attaquant.bande);
  const village = villageDId(monde, b.defenseur.village);
  if (bande === undefined || village === null) return;
  bande.taille = b.attaquant.membres.length;
  bande.position = { ...b.lieu };
  const details = {
    bande: bande.id,
    taille: bande.taille,
    village: village.id,
    nom: village.nom,
    blesses: b.defenseur.blesses,
    morts: b.defenseur.morts,
    pillardsTues: b.attaquant.morts,
    duree: monde.horloge.tick - (b.combatTick ?? b.debutTick),
  };
  if (issue === "attaquant") {
    const stocks = stocksDe(monde, village);
    bande.butin = prelever(stocks, Math.floor(nourritureDe(monde, village) * PART_PILLAGE));
    const proches = [...monde.batiments.values()].filter(
      (x) => x.etat === "termine" && Grille.distance(x.position, village.centre) <= 10,
    );
    const bat = proches.length > 0 ? monde.rng.fork(`${b.id}/pillage`).choisir(proches) : null;
    if (bat !== null) bat.solidite = Math.max(5, bat.solidite - 30);
    for (const p of habitants(monde, village)) {
      stresser(p, 15);
      p.besoins.securite = clamp(p.besoins.securite - 30);
    }
    bande.etat = "pille";
    e.compteurs.pillages += 1;
    monde.emettre(
      "raid",
      null,
      {
        genre: "pillage",
        ...details,
        quantite: bande.butin,
        batiment: bat === null ? null : bat.type,
      },
      9,
      village.centre,
    );
  } else {
    bande.etat = "repousse";
    e.compteurs.raidsRepousses = (e.compteurs.raidsRepousses ?? 0) + 1;
    monde.emettre("raid", null, { genre: "repousse", ...details }, 8, village.centre);
  }
}

/** La meute repoussée s'enfuit ; victorieuse, elle a mangé. Un seul événement `combat` résume, comme en M10. */
function conclureMeute(monde: Monde, b: Bataille, issue: IssueBataille): void {
  const meute = monde.troupeaux.get(b.attaquant.meute ?? "");
  const proie = b.proie === null ? undefined : monde.personnage(b.proie);
  const loupsTues = b.attaquant.forceInitiale - b.attaquant.membres.length;
  if (meute !== undefined) {
    meute.taille = b.attaquant.membres.length;
    if (meute.taille > 0) {
      faireFuir(meute, b.lieu, 0.3);
      meute.faim = b.defenseur.morts > 0 ? -5 : Math.max(meute.faim, 0);
    }
    meute.proieHumaine = null;
    meute.enMenace = false;
  }
  const issueCombat =
    issue === "attaquant" ? (b.defenseur.morts > 0 ? "mort" : "fuite") : "repousses";
  monde.emettre(
    "combat",
    proie ?? null,
    {
      contre: "loups",
      bataille: b.id,
      meute: b.attaquant.meute,
      loups: b.attaquant.forceInitiale,
      issue: issueCombat,
      rounds: Math.max(1, Math.ceil((monde.horloge.tick - b.debutTick) / CADENCE_FRAPPE)),
      defenseurs: b.defenseur.forceInitiale,
      loupsTues,
      blesses: b.defenseur.blesses,
      victime: b.victime,
    },
    9,
    b.lieu,
  );
}
