/**
 * Les batailles tick par tick (M32). Avant, une bataille entre villages se
 * résolvait d'un coup à l'aube, hors écran. Désormais elle dure : le village
 * attaquant lève une troupe qui marche jusqu'au village ennemi ; sur place,
 * chaque combattant choisit un adversaire à portée et frappe à sa cadence,
 * les défenseurs sortent des maisons, la palissade compte, les blessés
 * reculent, les morts sont rares. L'issue rejoue ce que M21 appliquait déjà
 * (butin, bâtiments ébranlés, peur, attitude), et le journal des coups
 * (`frappes`) sert au viewer pour animer. Tout est déterministe.
 */
import { SANTE_FUITE, bonusArme } from "../agents/combat.js";
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
import {
  BATAILLES_MAX,
  JOURS_ENTRE_BATAILLES,
  adultesDe,
  forceDe,
  habitants,
  jourDe,
  nourritureDe,
  faireLaPaix,
  prelever,
  relationEntre,
  stocksDe,
} from "./villages.js";
import type { Diplomatie, Village } from "./villages.js";

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

export interface Camp {
  /** Le village (null pour une bande ou une meute, M32c). */
  readonly village: string | null;
  /** Les combattants encore engagés (identifiants de personnages). */
  guerriers: string[];
  /** Tous ceux qui ont pris les armes depuis le début (la défense se lève au fil du combat). */
  forceInitiale: number;
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
  /** Le lieu de l'assaut : le centre du village défenseur. */
  readonly lieu: Position;
  readonly debutTick: number;
  combatTick: number | null;
  /** Premier et dernier ticks où les deux camps étaient sur le champ. */
  premierContactTick: number | null;
  contactTick: number | null;
  finTick: number | null;
  issue: IssueBataille | null;
  frappes: Frappe[];
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

/** L'adversaire vivant le plus proche de `p` sur le champ de bataille, ou null. */
export function adversaireLePlusProche(
  monde: Monde,
  b: Bataille,
  p: Personnage,
): Personnage | null {
  const camp = campDe(b, p.id);
  if (camp === null) return null;
  const ennemis = camp === "attaquant" ? b.defenseur.guerriers : b.attaquant.guerriers;
  let meilleur: Personnage | null = null;
  let dMin = Infinity;
  for (const id of ennemis) {
    const e = monde.personnage(id);
    if (e?.vivant !== true || Grille.distance(e.corps.position, b.lieu) > RAYON_CHAMP) continue;
    const d = Grille.distance(p.corps.position, e.corps.position);
    if (d < dMin || (d === dMin && meilleur !== null && id < meilleur.id)) {
      dMin = d;
      meilleur = e;
    }
  }
  return meilleur;
}

function villageDId(monde: Monde, id: string | null): Village | null {
  if (id === null) return null;
  return monde.villages.villages.find((v) => v.id === id) ?? null;
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
): Bataille | null {
  const e = monde.villages;
  if (batailleActive(monde) !== null) return null;
  const fa = forceDe(monde, a) * (0.8 + rng.suivant() * 0.4);
  const fb = forceDe(monde, b) * (0.8 + rng.suivant() * 0.4);
  const [att, def] = fa >= fb ? [a, b] : [b, a];
  const disponibles = guerriersDisponibles(monde, att);
  const n = Math.min(GUERRIERS_MAX, Math.max(2, Math.ceil(disponibles.length * 0.6)));
  const guerriers = disponibles.slice(0, n);
  if (guerriers.length < 2) return null;
  const tick = monde.horloge.tick;
  e.derniereBatailleJour = jourDe(monde);
  const bataille: Bataille = {
    id: `bataille-${String(tick)}`,
    genre: "guerre",
    phase: "marche",
    attaquant: {
      village: att.id,
      guerriers: guerriers.map((p) => p.id),
      forceInitiale: guerriers.length,
      blesses: 0,
      morts: 0,
    },
    defenseur: { village: def.id, guerriers: [], forceInitiale: 0, blesses: 0, morts: 0 },
    lieu: { ...def.centre },
    debutTick: tick,
    combatTick: null,
    premierContactTick: null,
    contactTick: null,
    finTick: null,
    issue: null,
    frappes: [],
  };
  e.batailles.push(bataille);
  for (const p of guerriers) p.drapeaux.bataille = bataille.id;
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

/** Un coup de `p` sur `cible` ; la frappe est consignée, manquée ou non. */
export function frapper(monde: Monde, p: Personnage, cible: Personnage, b: Bataille): Frappe {
  const rng = p.rng;
  const tick = monde.horloge.tick;
  let chance = 0.35 + bonusArme(p) + 0.03 * niveau(p.experience.chasse);
  if (possede(cible.corps.inventaire, "vetement_cuir")) chance -= 0.05;
  if (campDe(b, cible.id) === "defenseur" && palissadeProche(monde, cible.corps.position))
    chance -= 0.1;
  chance = Math.max(0.1, Math.min(0.85, chance));
  let degats = 0;
  let mortelle = false;
  if (rng.chance(chance)) {
    const r = rng.suivant();
    const gravite: Gravite = r < 0.6 ? 1 : r < 0.95 ? 2 : 3;
    const lieu: LieuBlessure = rng.choisir(["bras", "jambe", "flanc"] as const);
    const campAdverse = campDe(b, p.id) === "attaquant" ? b.attaquant : b.defenseur;
    const nom = villageDId(monde, campAdverse.village)?.nom ?? "des étrangers";
    const avant = cible.corps.sante;
    blesser(monde, cible, "coupure", gravite, lieu, `à la bataille contre ${nom}`);
    degats = Math.round(avant - cible.corps.sante);
    const campCible = campDe(b, cible.id) === "attaquant" ? b.attaquant : b.defenseur;
    campCible.blesses += 1;
    if (cible.corps.sante <= 15 && gravite >= 2 && rng.chance(0.5)) {
      monde.tuer(cible, "bataille");
      mortelle = true;
      campCible.morts += 1;
    }
  }
  const frappe: Frappe = { tick, de: p.id, vers: cible.id, degats, mortelle };
  b.frappes.push(frappe);
  if (b.frappes.length > FRAPPES_GARDEES) b.frappes.splice(0, b.frappes.length - FRAPPES_GARDEES);
  return frappe;
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
      // Les retardataires du village prennent les armes en arrivant.
      leverLaDefense(monde, b, RAYON_DEFENSE);
      const surLeChamp = (camp: Camp): boolean =>
        camp.guerriers.some((id) => {
          const p = monde.personnage(id);
          return p !== undefined && Grille.distance(p.corps.position, b.lieu) <= RAYON_CHAMP;
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

/** La fin : les flags tombent, le butin change de mains, la peur et la rancune s'installent. */
export function conclure(monde: Monde, b: Bataille, issue: IssueBataille): void {
  const e = monde.villages;
  const tick = monde.horloge.tick;
  b.phase = "finie";
  b.issue = issue;
  b.finTick = tick;
  for (const id of [...b.attaquant.guerriers, ...b.defenseur.guerriers]) liberer(monde, id);
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
