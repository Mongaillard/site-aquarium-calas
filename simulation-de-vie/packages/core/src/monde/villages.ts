/**
 * Le monde s'élargit (jalon 15) : plusieurs villages. Un schisme (faction
 * sous tension, famille bannie suivie des siens, surpeuplement) fonde un
 * second village soixante tuiles plus loin, au printemps, avec des vivres.
 * Des bandes attirées par les entrepôts pleins négocient un tribut si le
 * village est fort, pillent sinon. Des caravanes portent un surplus vers un
 * manque et font voyager une invention. Entre villages, une attitude faite
 * d'affinités, de mariages et d'échanges ; la guerre seulement avec un casus
 * belli, deux batailles au plus, toujours une porte de sortie : le prix du
 * sang. Tout est déterministe.
 */
import { NOURRITURE, ajouter, quantite, retirer, transferer } from "../agents/inventaire.js";
import { possede } from "../agents/inventaire.js";
import { relationAvec } from "../agents/personnage.js";
import type { Personnage } from "../agents/personnage.js";
import { clamp } from "../agents/besoins.js";
import type { Evenement } from "../evenements/journal.js";
import { PLANS_BATIMENT } from "./batiments.js";
import type { Batiment } from "./batiments.js";
import { INFO_BIOME } from "./biomes.js";
import { Grille } from "./grille.js";
import type { Position } from "./grille.js";
import type { Monde } from "../monde.js";
import { apprendre, connait } from "../savoirs/lecons.js";
import { INVENTIONS } from "../savoirs/catalogue.js";
import type { Invention } from "../savoirs/catalogue.js";
import type { Rng } from "../rng.js";
import type { Ressource } from "./ressources.js";
import { stresser } from "../memoire/psyche.js";
import { JOURS_DE_GRACE } from "./danger.js";
import type { Bataille } from "./bataille.js";

// ------------------------------------------------------------------ état

export interface Village {
  readonly id: string;
  readonly nom: string;
  /** Familles qui y vivent (les noms de famille). */
  familles: string[];
  centre: Position;
  readonly fondeJour: number;
  readonly origine: "fondation" | "schisme";
  /** Départs en cours : qui doit encore arriver. */
  enRoute: string[];
}

export type EtatDiplomatie = "paix" | "alliance" | "guerre";

export interface Diplomatie {
  readonly a: string;
  readonly b: string;
  /** Attitude −100..100 : mariages, échanges, parenté d'un côté ; vols, batailles de l'autre. */
  attitude: number;
  etat: EtatDiplomatie;
  casusBelli: string | null;
  batailles: number;
  depuisJour: number;
}

export type EtatBande = "approche" | "negocie" | "pille" | "parti";

export interface Bande {
  readonly id: string;
  taille: number;
  position: Position;
  etat: EtatBande;
  readonly cible: string;
  readonly depuisJour: number;
  butin: number;
}

export type EtatCaravane = "route" | "arrivee" | "perdue";

export interface Caravane {
  readonly id: string;
  readonly de: string;
  readonly vers: string;
  readonly cargaison: Partial<Record<Ressource, number>>;
  readonly invention: Invention | null;
  position: Position;
  etat: EtatCaravane;
  readonly departJour: number;
}

export interface EtatVillages {
  villages: Village[];
  relations: Diplomatie[];
  bandes: Bande[];
  caravanes: Caravane[];
  /** Routes empruntées au moins une fois (paires d'identifiants « a|b »). */
  routes: string[];
  /** Les batailles en cours ou fraîchement finies (M32, `bataille.ts`). */
  batailles: Bataille[];
  derniereBandeSaison: string;
  derniereCaravaneJour: number;
  derniereBatailleJour: number;
  compteurs: {
    villages: number;
    bandes: number;
    caravanes: number;
    tributs: number;
    pillages: number;
    batailles: number;
    guerres: number;
    paix: number;
  };
}

export function etatVillagesInitial(): EtatVillages {
  return {
    villages: [],
    relations: [],
    bandes: [],
    caravanes: [],
    routes: [],
    batailles: [],
    derniereBandeSaison: "",
    derniereCaravaneJour: -100,
    derniereBatailleJour: -100,
    compteurs: {
      villages: 0,
      bandes: 0,
      caravanes: 0,
      tributs: 0,
      pillages: 0,
      batailles: 0,
      guerres: 0,
      paix: 0,
    },
  };
}

export interface MondeVillages extends Monde {
  readonly villages: EtatVillages;
}

// ------------------------------------------------------------ constantes

/** Distance à laquelle un second village se fonde. */
export const DISTANCE_SCHISME = 60;
/** Population à partir de laquelle le surpeuplement pousse au départ. */
export const SURPEUPLEMENT = 24;
/** Tension à partir de laquelle une faction s'en va. */
export const TENSION_SCHISME = 70;
/** Nourriture en stock qui attire une bande, et taille des bandes. */
export const STOCK_QUI_ATTIRE = 80;
/** Pas de bande la première année : la colonie s'installe. */
export const JOURS_AVANT_BANDES = 120;
/** Part des vivres qu'un pillage emporte, et qu'un tribut coûte. */
export const PART_PILLAGE = 0.25;
export const PART_TRIBUT = 0.1;
export const BANDE_MIN = 3;
export const BANDE_MAX = 6;
/** Vitesse des bandes et des caravanes, en tuiles par heure. */
export const VITESSE_BANDE = 4;
export const VITESSE_CARAVANE = 6;
/** Jours entre deux caravanes, entre deux batailles ; batailles par guerre au plus. */
export const JOURS_ENTRE_CARAVANES = 20;
export const JOURS_ENTRE_BATAILLES = 10;
export const BATAILLES_MAX = 2;
/** Seuils d'attitude : guerre en dessous (avec casus belli), alliance au-dessus. */
export const SEUIL_GUERRE = -60;
export const SEUIL_ALLIANCE = 60;

// --------------------------------------------------------------- outils

export function jourDe(monde: Monde): number {
  return monde.horloge.moment().jourAbsolu;
}

function cleDe(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function villageDeFamille(etat: EtatVillages, famille: string): Village | null {
  return etat.villages.find((v) => v.familles.includes(famille)) ?? null;
}

export function villageDe(monde: MondeVillages, p: Personnage): Village | null {
  return villageDeFamille(monde.villages, p.identite.nomFamille);
}

/** Le village le plus proche d'une position (tous les bâtiments ont un village). */
export function villageEn(monde: MondeVillages, pos: Position): Village | null {
  let meilleur: Village | null = null;
  let d = Infinity;
  for (const v of monde.villages.villages) {
    const dist = Grille.distance(v.centre, pos);
    if (dist < d) {
      d = dist;
      meilleur = v;
    }
  }
  return meilleur;
}

export function habitants(monde: MondeVillages, v: Village): Personnage[] {
  return monde.personnages.filter((p) => p.vivant && v.familles.includes(p.identite.nomFamille));
}

export function adultesDe(monde: MondeVillages, v: Village): Personnage[] {
  return habitants(monde, v).filter(
    (p) => p.corps.stade === "adulte" || p.corps.stade === "ancien",
  );
}

export function stocksDe(monde: MondeVillages, v: Village): Batiment[] {
  return [...monde.batiments.values()].filter(
    (b) =>
      b.etat === "termine" &&
      b.stock !== null &&
      v.familles.includes(b.famille) &&
      Grille.distance(b.position, v.centre) <= 30,
  );
}

export function nourritureDe(monde: MondeVillages, v: Village): number {
  let n = 0;
  for (const b of stocksDe(monde, v))
    if (b.stock !== null)
      for (const [r, q] of Object.entries(b.stock.ressources))
        if (NOURRITURE[r as Ressource] !== undefined) n += q;
  return n;
}

/** Force d'un village : adultes, armes, palissades. */
export function forceDe(monde: MondeVillages, v: Village): number {
  let f = 0;
  for (const p of adultesDe(monde, v)) {
    f += 1;
    if (possede(p.corps.inventaire, "lance") || possede(p.corps.inventaire, "arc")) f += 1;
  }
  for (const b of monde.batiments.values())
    if (
      b.type === "palissade" &&
      b.etat === "termine" &&
      Grille.distance(b.position, v.centre) <= 12
    )
      f += 0.5;
  return f;
}

export function relationEntre(etat: EtatVillages, a: string, b: string): Diplomatie {
  const cle = cleDe(a, b);
  let r = etat.relations.find((x) => cleDe(x.a, x.b) === cle);
  if (r === undefined) {
    r = { a, b, attitude: 10, etat: "paix", casusBelli: null, batailles: 0, depuisJour: 0 };
    etat.relations.push(r);
  }
  return r;
}

function ajusterAttitude(monde: MondeVillages, a: string, b: string, delta: number): Diplomatie {
  const r = relationEntre(monde.villages, a, b);
  r.attitude = Math.max(-100, Math.min(100, r.attitude + delta));
  return r;
}

function siteLibre(monde: Monde, centre: Position, rayon: number): Position | null {
  for (let r = 0; r <= rayon; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const t = monde.grille.tuileOuNull(centre.x + dx, centre.y + dy);
        if (
          t?.batiment !== null ||
          !INFO_BIOME[t.biome].constructible ||
          !INFO_BIOME[t.biome].praticable
        )
          continue;
        return { x: t.x, y: t.y };
      }
  return null;
}

/** Le premier village existe dès le premier jour : celui des fondateurs. */
export function fonderPremierVillage(
  monde: MondeVillages,
  centre: Position,
  familles: readonly string[],
): Village {
  const e = monde.villages;
  e.compteurs.villages += 1;
  const v: Village = {
    id: `v-${String(e.compteurs.villages)}`,
    nom: familles[0] === undefined ? "le village" : `le village des ${familles[0]}`,
    familles: [...familles],
    centre: { ...centre },
    fondeJour: jourDe(monde),
    origine: "fondation",
    enRoute: [],
  };
  e.villages.push(v);
  return v;
}

/**
 * Recale le centre d'un village sur ses abris proches. Pas tant que des migrants
 * sont en route : ses familles ont encore leurs abris dans l'ancien village, et le
 * centre est le site choisi, pas la moyenne de ce qu'elles quittent.
 */
function recentrer(monde: MondeVillages, v: Village): void {
  if (v.enRoute.length > 0) return;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const b of monde.batiments.values()) {
    if (b.etat !== "termine" || !PLANS_BATIMENT[b.type].abri || !v.familles.includes(b.famille))
      continue;
    if (Grille.distance(b.position, v.centre) > DISTANCE_SCHISME / 2) continue;
    sx += b.position.x;
    sy += b.position.y;
    n += 1;
  }
  if (n > 0) v.centre = { x: Math.round(sx / n), y: Math.round(sy / n) };
}

// --------------------------------------------------------------- aube

/** L'aube des villages : centres, schisme au printemps, bandes, caravanes, diplomatie, batailles. */
export function aubeVillages(
  monde: MondeVillages,
  rng: Rng,
  tension: number,
  factions: readonly { nom: string; familles: readonly string[] }[],
  lois: { readonly raids: boolean; readonly schismes: boolean } = { raids: true, schismes: true },
): void {
  const e = monde.villages;
  for (const v of e.villages) recentrer(monde, v);
  // Les villages vidés disparaissent des cartes.
  e.villages = e.villages.filter(
    (v) => habitants(monde, v).length > 0 || v.enRoute.length > 0 || v.origine === "fondation",
  );
  if (lois.schismes) schisme(monde, rng, tension, factions);
  arriveeDesMigrants(monde);
  if (lois.raids) bandes(monde, rng);
  caravanes(monde, rng);
  diplomatie(monde);
}

/**
 * Le schisme : au printemps, une faction sous tension, ou le surpeuplement,
 * envoie une partie du village fonder le sien soixante tuiles plus loin.
 */
function schisme(
  monde: MondeVillages,
  rng: Rng,
  tension: number,
  factions: readonly { nom: string; familles: readonly string[] }[],
): void {
  const e = monde.villages;
  const moment = monde.horloge.moment();
  if (moment.saison !== "printemps" || moment.jourDeSaison > 10) return;
  if (e.villages.some((v) => v.enRoute.length > 0)) return;
  for (const v of e.villages) {
    const gens = habitants(monde, v);
    if (v.familles.length < 2 || gens.length < 8) continue;
    let partants: string[] = [];
    let motif = "";
    // Une faction minoritaire sous tension.
    const factionsDuVillage = factions.filter((f) =>
      f.familles.some((fam) => v.familles.includes(fam)),
    );
    if (tension >= TENSION_SCHISME && factionsDuVillage.length >= 2) {
      const petite = [...factionsDuVillage].sort(
        (x, y) => x.familles.length - y.familles.length || x.nom.localeCompare(y.nom),
      )[0];
      if (petite !== undefined) {
        partants = petite.familles.filter((f) => v.familles.includes(f));
        motif = "la tension du village";
      }
    }
    // Le surpeuplement : la famille la moins prestigieuse s'en va.
    if (partants.length === 0 && gens.length >= SURPEUPLEMENT) {
      const prestigeDe = (f: string): number =>
        gens.filter((p) => p.identite.nomFamille === f).reduce((t, p) => t + p.prestige, 0);
      const famille = [...v.familles].sort(
        (a, b) => prestigeDe(a) - prestigeDe(b) || a.localeCompare(b),
      )[0];
      if (famille !== undefined) {
        partants = [famille];
        motif = "le surpeuplement";
      }
    }
    if (partants.length === 0 || partants.length >= v.familles.length) continue;
    const migrants = gens.filter(
      (p) =>
        partants.includes(p.identite.nomFamille) &&
        (p.corps.stade === "adulte" || p.corps.stade === "ancien"),
    );
    if (migrants.length < 3) continue;
    // Le site : soixante tuiles dans une direction praticable, loin des autres villages.
    const site = choisirSiteDeSchisme(monde, v, rng);
    if (site === null) continue;
    e.compteurs.villages += 1;
    const nouveau: Village = {
      id: `v-${String(e.compteurs.villages)}`,
      nom: `le village des ${partants[0] ?? "partants"}`,
      familles: [...partants],
      centre: site,
      fondeJour: jourDe(monde),
      origine: "schisme",
      enRoute: [],
    };
    v.familles = v.familles.filter((f) => !partants.includes(f));
    e.villages.push(nouveau);
    // On part avec des vivres : chacun prend de quoi manger dans le stock familial.
    const tick = monde.horloge.tick;
    const T = monde.horloge.ticksParJour;
    const tous = habitants(monde, nouveau);
    for (const p of tous) {
      const stock = [...monde.batiments.values()].find(
        (b) => b.etat === "termine" && b.stock !== null && b.famille === p.identite.nomFamille,
      );
      if (stock?.stock)
        for (const r of Object.keys(NOURRITURE) as Ressource[]) {
          if (quantite(p.corps.inventaire, r) >= 4) break;
          transferer(stock.stock, p.corps.inventaire, r, Math.min(4, quantite(stock.stock, r)));
        }
      if (p.ambition !== null && p.ambition.issue === "en_cours") p.ambition.issue = "abandonnee";
      p.ambition = {
        genre: "migrer",
        cible: nouveau.id,
        origine: { ...v.centre },
        destination: { ...site },
        but: `fonder ${nouveau.nom}, à soixante tuiles`,
        pensee: "Nous partons. Là-bas, ce sera chez nous.",
        depuis: tick,
        jusqua: tick + 60 * T,
        issue: "en_cours",
        lieuxAuDepart: p.connaissance.size,
      };
      p.projet = null;
      p.plan = [];
      p.actionEnCours = null;
      p.intention = null;
      p.memoire.ajouter(
        tick,
        "plan",
        `Nous quittons ${v.nom} pour fonder ${nouveau.nom}. ${motif === "" ? "" : `C'est ${motif} qui nous pousse.`}`,
        9,
        [],
        v.centre,
      );
      nouveau.enRoute.push(p.id);
    }
    relationEntre(e, v.id, nouveau.id).attitude = motif === "la tension du village" ? -20 : 20;
    monde.emettre(
      "village",
      null,
      {
        genre: "schisme",
        village: nouveau.id,
        nom: nouveau.nom,
        de: v.id,
        familles: partants.join(","),
        partants: tous.length,
        motif,
        x: site.x,
        y: site.y,
      },
      9,
      site,
    );
    return;
  }
}

function choisirSiteDeSchisme(monde: MondeVillages, v: Village, rng: Rng): Position | null {
  const directions: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ];
  for (const [dx, dy] of rng.melanger(directions)) {
    const n = Math.hypot(dx, dy);
    const cible = {
      x: Math.round(v.centre.x + (dx / n) * DISTANCE_SCHISME),
      y: Math.round(v.centre.y + (dy / n) * DISTANCE_SCHISME),
    };
    // Le monde s'y génère à la demande.
    monde.grille.tuile(cible.x, cible.y);
    const site = siteLibre(monde, cible, 8);
    if (site === null) continue;
    if (
      monde.villages.villages.some((w) => Grille.distance(w.centre, site) < DISTANCE_SCHISME * 0.7)
    )
      continue;
    // Il faut de l'eau à moins de douze tuiles.
    let eau = false;
    for (let y = -12; y <= 12 && !eau; y++)
      for (let x = -12; x <= 12; x++) {
        const t = monde.grille.tuileOuNull(site.x + x, site.y + y);
        if (t !== null && (t.biome === "eau_peu_profonde" || t.biome === "eau_profonde")) {
          eau = true;
          break;
        }
      }
    if (eau) return site;
  }
  return null;
}

/** Les migrants arrivés (à huit tuiles du site) ne sont plus en route ; le village est fondé quand le premier abri s'élève. */
function arriveeDesMigrants(monde: MondeVillages): void {
  for (const v of monde.villages.villages) {
    if (v.enRoute.length === 0) continue;
    v.enRoute = v.enRoute.filter((id) => {
      const p = monde.personnages.find((x) => x.id === id);
      if (!p?.vivant) return false;
      return Grille.distance(p.corps.position, v.centre) > 8;
    });
    if (v.enRoute.length === 0)
      monde.emettre(
        "village",
        null,
        { genre: "fonde", village: v.id, nom: v.nom, x: v.centre.x, y: v.centre.y },
        8,
        v.centre,
      );
  }
}

// -------------------------------------------------------------- bandes

/** Une bande par an au plus, attirée par un stock plein, après la première année. */
function bandes(monde: MondeVillages, rng: Rng): void {
  const e = monde.villages;
  const moment = monde.horloge.moment();
  const jour = moment.jourAbsolu;
  if (
    jour < Math.max(JOURS_DE_GRACE, JOURS_AVANT_BANDES) ||
    e.bandes.some((b) => b.etat !== "parti")
  )
    return;
  const saison = String(moment.annee);
  if (e.derniereBandeSaison === saison) return;
  const riches = e.villages.filter(
    (v) => nourritureDe(monde, v) >= STOCK_QUI_ATTIRE && habitants(monde, v).length > 0,
  );
  if (riches.length === 0) return;
  if (!rng.chance(0.25)) return; // un jour sur quatre où c'est possible
  lancerBande(monde, rng, rng.choisir(riches));
}

/**
 * Lance une bande vers un village (le plus riche, ou celui donné) : elle
 * approche à trente tuiles. Le conteur s'en sert ; null s'il n'y a personne à
 * piller ou si une bande court déjà.
 */
export function lancerBande(monde: MondeVillages, rng: Rng, village: Village | null): Bande | null {
  const e = monde.villages;
  const moment = monde.horloge.moment();
  const jour = moment.jourAbsolu;
  if (e.bandes.some((b) => b.etat !== "parti")) return null;
  const cible =
    village ??
    [...e.villages]
      .filter((v) => habitants(monde, v).length > 0)
      .sort((a, b) => nourritureDe(monde, b) - nourritureDe(monde, a))[0];
  if (cible === undefined) return null;
  const saison = String(moment.annee);
  e.derniereBandeSaison = saison;
  e.compteurs.bandes += 1;
  const angle = rng.suivant() * Math.PI * 2;
  const bande: Bande = {
    id: `bande-${String(e.compteurs.bandes)}`,
    taille: rng.entier(BANDE_MIN, BANDE_MAX),
    position: {
      x: Math.round(cible.centre.x + Math.cos(angle) * 30),
      y: Math.round(cible.centre.y + Math.sin(angle) * 30),
    },
    etat: "approche",
    cible: cible.id,
    depuisJour: jour,
    butin: 0,
  };
  e.bandes.push(bande);
  monde.emettre(
    "raid",
    null,
    { genre: "approche", bande: bande.id, taille: bande.taille, village: cible.id, nom: cible.nom },
    7,
    bande.position,
  );
  for (const p of habitants(monde, cible)) stresser(p, 5);
  return bande;
}

/** Chaque heure : les bandes avancent, négocient ou pillent, puis s'en vont. */
export function heureVillages(monde: MondeVillages, rng: Rng): void {
  const e = monde.villages;
  const jour = jourDe(monde);
  for (const b of e.bandes) {
    if (b.etat === "parti") continue;
    const cible = e.villages.find((v) => v.id === b.cible);
    if (cible === undefined) {
      b.etat = "parti";
      continue;
    }
    if (b.etat === "approche") {
      b.position = avancer(b.position, cible.centre, VITESSE_BANDE);
      if (Grille.distance(b.position, cible.centre) > 3) continue;
      const force = forceDe(monde, cible);
      const stocks = stocksDe(monde, cible);
      const nourriture = nourritureDe(monde, cible);
      if (force >= b.taille * 2) {
        // Négociation : un dixième des vivres, et la bande repart.
        const tribut = Math.max(2, Math.floor(nourriture * PART_TRIBUT));
        b.butin = prelever(stocks, tribut);
        b.etat = "negocie";
        e.compteurs.tributs += 1;
        monde.emettre(
          "raid",
          null,
          {
            genre: "tribut",
            bande: b.id,
            taille: b.taille,
            village: cible.id,
            nom: cible.nom,
            quantite: b.butin,
            force: Math.round(force),
          },
          7,
          cible.centre,
        );
      } else {
        // Pillage : quatre dixièmes des vivres, un bâtiment ébranlé, la peur.
        b.butin = prelever(stocks, Math.floor(nourriture * PART_PILLAGE));
        const proches = [...monde.batiments.values()].filter(
          (x) => x.etat === "termine" && Grille.distance(x.position, cible.centre) <= 10,
        );
        const bat = proches.length > 0 ? rng.choisir(proches) : null;
        if (bat !== null) bat.solidite = Math.max(5, bat.solidite - 30);
        for (const p of habitants(monde, cible)) {
          stresser(p, 15);
          p.besoins.securite = clamp(p.besoins.securite - 30);
        }
        b.etat = "pille";
        e.compteurs.pillages += 1;
        monde.emettre(
          "raid",
          null,
          {
            genre: "pillage",
            bande: b.id,
            taille: b.taille,
            village: cible.id,
            nom: cible.nom,
            quantite: b.butin,
            batiment: bat === null ? null : bat.type,
            force: Math.round(force),
          },
          9,
          cible.centre,
        );
      }
    } else {
      // Repartir, puis disparaître à trente tuiles.
      const loin = {
        x: cible.centre.x + (b.position.x - cible.centre.x || 1) * 40,
        y: cible.centre.y + (b.position.y - cible.centre.y || 1) * 40,
      };
      b.position = avancer(b.position, loin, VITESSE_BANDE);
      if (Grille.distance(b.position, cible.centre) >= 30 || jour - b.depuisJour > 6) {
        b.etat = "parti";
        monde.emettre(
          "raid",
          null,
          { genre: "depart", bande: b.id, village: cible.id },
          3,
          b.position,
        );
      }
    }
  }
  e.bandes = e.bandes.filter((b) => b.etat !== "parti" || jour - b.depuisJour <= 2);
  heureCaravanes(monde, rng);
}

function avancer(de: Position, vers: Position, pas: number): Position {
  const dx = vers.x - de.x;
  const dy = vers.y - de.y;
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  if (d <= pas) return { ...vers };
  return { x: Math.round(de.x + (dx / d) * pas), y: Math.round(de.y + (dy / d) * pas) };
}

export function prelever(stocks: readonly Batiment[], quantiteVoulue: number): number {
  let pris = 0;
  for (const b of stocks) {
    if (b.stock === null) continue;
    for (const r of Object.keys(NOURRITURE) as Ressource[]) {
      if (pris >= quantiteVoulue) return pris;
      pris += retirer(b.stock, r, Math.min(quantiteVoulue - pris, quantite(b.stock, r)));
    }
  }
  return pris;
}

// ----------------------------------------------------------- caravanes

/** Tous les vingt jours : un surplus part vers un manque, avec une invention à bord. */
function caravanes(monde: MondeVillages, rng: Rng): void {
  const e = monde.villages;
  const jour = jourDe(monde);
  if (e.villages.length < 2 || jour - e.derniereCaravaneJour < JOURS_ENTRE_CARAVANES) return;
  if (e.caravanes.some((c) => c.etat === "route")) return;
  for (const de of rng.melanger(e.villages)) {
    if (de.enRoute.length > 0) continue;
    const surplus = nourritureDe(monde, de);
    if (surplus < 30) continue;
    for (const vers of e.villages) {
      if (vers.id === de.id || vers.enRoute.length > 0) continue;
      const r = relationEntre(e, de.id, vers.id);
      if (r.etat === "guerre" || r.attitude < 0) continue;
      const manque = nourritureDe(monde, vers);
      if (manque >= 15 && r.etat !== "alliance") continue;
      const cargaison: Partial<Record<Ressource, number>> = {};
      let total = 0;
      for (const b of stocksDe(monde, de)) {
        if (b.stock === null) continue;
        for (const res of Object.keys(NOURRITURE) as Ressource[]) {
          if (total >= 12) break;
          const n = retirer(b.stock, res, Math.min(12 - total, quantite(b.stock, res)));
          if (n > 0) {
            cargaison[res] = (cargaison[res] ?? 0) + n;
            total += n;
          }
        }
      }
      if (total === 0) continue;
      // Une invention connue ici et pas là-bas voyage avec la caravane.
      const connuesIci = new Set<Invention>();
      for (const p of habitants(monde, de))
        for (const i of Object.keys(INVENTIONS) as Invention[])
          if (connait(p, i)) connuesIci.add(i);
      const laBas = habitants(monde, vers);
      const invention = [...connuesIci].find((i) => !laBas.some((p) => connait(p, i))) ?? null;
      e.compteurs.caravanes += 1;
      e.derniereCaravaneJour = jour;
      const c: Caravane = {
        id: `caravane-${String(e.compteurs.caravanes)}`,
        de: de.id,
        vers: vers.id,
        cargaison,
        invention,
        position: { ...de.centre },
        etat: "route",
        departJour: jour,
      };
      e.caravanes.push(c);
      monde.emettre(
        "caravane",
        null,
        {
          genre: "depart",
          caravane: c.id,
          de: de.id,
          vers: vers.id,
          deNom: de.nom,
          versNom: vers.nom,
          quantite: total,
          invention,
        },
        6,
        de.centre,
      );
      return;
    }
  }
}

function heureCaravanes(monde: MondeVillages, rng: Rng): void {
  const e = monde.villages;
  const jour = jourDe(monde);
  for (const c of e.caravanes) {
    if (c.etat !== "route") continue;
    const vers = e.villages.find((v) => v.id === c.vers);
    const de = e.villages.find((v) => v.id === c.de);
    if (vers === undefined || de === undefined) {
      c.etat = "perdue";
      continue;
    }
    // Une bande sur la route : une caravane sur dix ne revient pas.
    if (
      e.bandes.some((b) => b.etat === "approche" && Grille.distance(b.position, c.position) <= 6) &&
      rng.chance(0.1)
    ) {
      c.etat = "perdue";
      monde.emettre(
        "caravane",
        null,
        { genre: "perdue", caravane: c.id, de: c.de, vers: c.vers },
        7,
        c.position,
      );
      continue;
    }
    c.position = avancer(c.position, vers.centre, VITESSE_CARAVANE);
    if (Grille.distance(c.position, vers.centre) > 2) continue;
    c.etat = "arrivee";
    const stock = stocksDe(monde, vers)[0]?.stock ?? habitants(monde, vers)[0]?.corps.inventaire;
    let livre = 0;
    if (stock !== undefined)
      for (const [r, n] of Object.entries(c.cargaison) as [Ressource, number][])
        livre += ajouter(stock, r, n);
    const cle = cleDe(c.de, c.vers);
    if (!e.routes.includes(cle)) e.routes.push(cle);
    ajusterAttitude(monde, c.de, c.vers, 6);
    let apprenant: Personnage | null = null;
    if (c.invention !== null) {
      const inv = c.invention;
      apprenant =
        habitants(monde, vers).find((p) => p.corps.stade !== "enfant" && !connait(p, inv)) ?? null;
      if (apprenant !== null) apprendre(apprenant, inv, 0.6, de.nom, monde.horloge.tick);
    }
    monde.emettre(
      "caravane",
      null,
      {
        genre: "arrivee",
        caravane: c.id,
        de: c.de,
        vers: c.vers,
        deNom: de.nom,
        versNom: vers.nom,
        quantite: livre,
        invention: c.invention,
        apprenant: apprenant?.id ?? null,
      },
      7,
      vers.centre,
    );
    for (const p of habitants(monde, vers)) p.besoins.moral = clamp(p.besoins.moral + 3);
  }
  e.caravanes = e.caravanes.filter((c) => c.etat === "route" || jour - c.departJour <= 3);
}

// ---------------------------------------------------------- diplomatie

/** Un vol entre villages est un casus belli ; un mariage entre villages rapproche. */
export function observerVillages(monde: MondeVillages, e: Evenement): void {
  const etat = monde.villages;
  if (etat.villages.length < 2) return;
  const acteur = e.acteur === null ? undefined : monde.personnages.find((p) => p.id === e.acteur);
  if (acteur === undefined) return;
  const va = villageDe(monde, acteur);
  if (va === null) return;
  switch (e.type) {
    case "vol": {
      const vb = villageDeFamille(etat, String(e.details.famille ?? ""));
      if (vb === null || vb.id === va.id) break;
      const r = ajusterAttitude(monde, va.id, vb.id, -25);
      r.casusBelli = `un vol de ${String(e.details.ressource)} par ${acteur.identite.prenom}`;
      break;
    }
    case "union": {
      const autre = monde.personnages.find((p) => p.id === String(e.details.cible ?? ""));
      const vb = autre === undefined ? null : villageDe(monde, autre);
      if (vb === null || vb.id === va.id) break;
      const r = ajusterAttitude(monde, va.id, vb.id, 20);
      r.casusBelli = null;
      break;
    }
    case "rixe": {
      const autre = monde.personnages.find((p) => p.id === String(e.details.cible ?? ""));
      const vb = autre === undefined ? null : villageDe(monde, autre);
      if (vb === null || vb.id === va.id) break;
      ajusterAttitude(monde, va.id, vb.id, -8);
      break;
    }
    default:
      break;
  }
}

/** Chaque aube : l'attitude dérive vers zéro, alliances et guerres se déclarent, les batailles se livrent. */
function diplomatie(monde: MondeVillages): void {
  const e = monde.villages;
  const jour = jourDe(monde);
  for (const r of e.relations) {
    const a = e.villages.find((v) => v.id === r.a);
    const b = e.villages.find((v) => v.id === r.b);
    if (a === undefined || b === undefined) continue;
    // Dérive lente vers la neutralité ; la parenté rapproche.
    r.attitude += r.attitude > 0 ? -0.2 : r.attitude < 0 ? 0.2 : 0;
    const parente = habitants(monde, a).some((p) =>
      habitants(monde, b).some((q) => {
        const lien = relationAvec(p, q.id).lien;
        return (
          lien === "parent" || lien === "enfant" || lien === "fratrie" || lien === "partenaire"
        );
      }),
    );
    if (parente) r.attitude = Math.min(100, r.attitude + 0.3);
    if (r.etat === "paix" && r.attitude >= SEUIL_ALLIANCE) {
      r.etat = "alliance";
      r.depuisJour = jour;
      monde.emettre(
        "village",
        null,
        { genre: "alliance", a: a.id, b: b.id, aNom: a.nom, bNom: b.nom },
        8,
        a.centre,
      );
    } else if (r.etat === "alliance" && r.attitude < 20) {
      r.etat = "paix";
      r.depuisJour = jour;
      monde.emettre(
        "village",
        null,
        { genre: "fin_alliance", a: a.id, b: b.id, aNom: a.nom, bNom: b.nom },
        6,
        a.centre,
      );
    } else if (r.etat === "paix" && r.attitude <= SEUIL_GUERRE && r.casusBelli !== null) {
      r.etat = "guerre";
      r.batailles = 0;
      r.depuisJour = jour;
      e.compteurs.guerres += 1;
      monde.emettre(
        "village",
        null,
        { genre: "guerre", a: a.id, b: b.id, aNom: a.nom, bNom: b.nom, casusBelli: r.casusBelli },
        10,
        a.centre,
      );
      for (const p of [...habitants(monde, a), ...habitants(monde, b)]) stresser(p, 10);
    } else if (r.etat === "guerre") {
      // Les batailles se lèvent après l'aube des villages (`aubeBatailles`, M32) et se livrent
      // tick par tick ; ici seulement la porte de sortie.
      if (r.batailles >= BATAILLES_MAX || r.attitude > -20) faireLaPaix(monde, r, a, b);
    }
  }
}

/** La porte de sortie : le prix du sang. Le perdant donne dix portions, et l'on se parle de nouveau. */
export function faireLaPaix(monde: MondeVillages, r: Diplomatie, a: Village, b: Village): void {
  const e = monde.villages;
  const jour = jourDe(monde);
  const plusFaible = forceDe(monde, a) <= forceDe(monde, b) ? a : b;
  const plusFort = plusFaible === a ? b : a;
  const donne = prelever(stocksDe(monde, plusFaible), 10);
  const stock = stocksDe(monde, plusFort)[0]?.stock ?? null;
  if (stock !== null && donne > 0) ajouter(stock, "poisson_fume", donne);
  r.etat = "paix";
  r.attitude = -10;
  r.casusBelli = null;
  r.depuisJour = jour;
  e.compteurs.paix += 1;
  monde.emettre(
    "village",
    null,
    {
      genre: "paix",
      a: a.id,
      b: b.id,
      aNom: a.nom,
      bNom: b.nom,
      de: plusFaible.id,
      vers: plusFort.id,
      donne,
      batailles: r.batailles,
    },
    9,
    plusFaible.centre,
  );
  for (const p of [...habitants(monde, a), ...habitants(monde, b)]) stresser(p, -10);
}

/** Vrai si les deux villages sont alliés (défense commune contre les bandes, caravanes plus fréquentes). */
export function allies(etat: EtatVillages, a: string, b: string): boolean {
  return (
    a === b || etat.relations.some((r) => cleDe(r.a, r.b) === cleDe(a, b) && r.etat === "alliance")
  );
}
