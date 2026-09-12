/**
 * Mode Dieu : l'observateur exerce des pouvoirs sur le monde, payés en faveur.
 * Le catalogue (`FICHES_POUVOIR`, dans le protocole) est fermé ; chaque pouvoir
 * a un effet déterministe, un coût, une recharge, et les témoins l'interprètent
 * (souvenir, humeur) sans jamais recevoir d'ordre. Tout est journalisé sous le
 * type `divin`, pour le rejeu.
 */
import { FICHES_POUVOIR } from "@sdv/protocole";
import type { FaveurEtat, Pouvoir } from "@sdv/protocole";
import { ajouterHumeur, blesser } from "../agents/corps.js";
import type { Personnage } from "../agents/personnage.js";
import { PROFILS_MALADIE } from "../agents/maladies.js";
import type { TypeEvenement } from "../evenements/journal.js";
import type { Monde } from "../monde.js";
import { PLANS_BATIMENT } from "./batiments.js";
import { Grille } from "./grille.js";
import type { Position } from "./grille.js";
import type { Meteo } from "./meteo.js";
import { LECONS } from "../savoirs/catalogue.js";
import { apprendre } from "../savoirs/lecons.js";
import { leconsUtiles } from "../cerveau/conseil.js";

export const FAVEUR_INITIALE = 20;
export const FAVEUR_MAX = 40;
/** Faveur gagnée à chaque aube. */
export const FAVEUR_PAR_JOUR = 1;
/** Faveur gagnée quand la colonie prospère (par événement). */
export const FAVEUR_EVENEMENTS: Readonly<Partial<Record<TypeEvenement, number>>> = {
  naissance: 3,
  union: 2,
  invention: 4,
  lecon: 2,
  batiment_termine: 1,
};
/** Bûches offertes par une braise. */
export const BUCHES_BRAISE = 20;
/** Rayon dans lequel on cherche un témoin d'un miracle sur une tuile. */
export const RAYON_TEMOIN = 10;
/** Rayon de la peur quand la foudre tombe. */
export const RAYON_PEUR = 8;

export interface EtatFaveur {
  valeur: number;
  readonly max: number;
  readonly recharges: Map<Pouvoir, number>;
  miracles: number;
}

export function etatFaveurInitial(): EtatFaveur {
  return { valeur: FAVEUR_INITIALE, max: FAVEUR_MAX, recharges: new Map(), miracles: 0 };
}

export function gagnerFaveur(etat: EtatFaveur, n: number): void {
  etat.valeur = Math.min(etat.max, etat.valeur + n);
}

export function faveurEtat(etat: EtatFaveur): FaveurEtat {
  const recharges: Record<string, number> = {};
  for (const [k, v] of etat.recharges) recharges[k] = v;
  return { valeur: etat.valeur, max: etat.max, recharges, miracles: etat.miracles };
}

export interface CommandePouvoir {
  readonly pouvoir: Pouvoir;
  readonly x: number;
  readonly y: number;
  readonly cibleId?: string | undefined;
}

export type RaisonRefus =
  "faveur_insuffisante" | "recharge" | "cible_invalide" | "hors_monde" | "sans_effet";

export type ResultatPouvoir =
  | { readonly ok: true; readonly effet: string; readonly temoin: Personnage | null }
  | { readonly ok: false; readonly raison: RaisonRefus };

/** Le monde, avec la météo modifiable (la simulation l'est ; l'interface la protège). */
export interface MondeDivin extends Monde {
  meteo: Meteo;
}

function temoinProche(monde: Monde, pos: Position, rayon: number): Personnage | null {
  let meilleur: Personnage | null = null;
  let d = Infinity;
  for (const p of monde.personnages) {
    if (!p.vivant || p.corps.endormi) continue;
    const dist = Grille.distance(p.corps.position, pos);
    if (dist <= rayon && dist < d) {
      d = dist;
      meilleur = p;
    }
  }
  return meilleur;
}

/**
 * Exerce un pouvoir. Vérifie la faveur et la recharge, applique l'effet, fait
 * payer, journalise et laisse les témoins interpréter. Renvoie le résultat.
 */
export function exercer(
  monde: MondeDivin,
  etat: EtatFaveur,
  commande: CommandePouvoir,
): ResultatPouvoir {
  const fiche = FICHES_POUVOIR[commande.pouvoir];
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  if (etat.valeur < fiche.cout) return { ok: false, raison: "faveur_insuffisante" };
  if ((etat.recharges.get(commande.pouvoir) ?? 0) > tick) return { ok: false, raison: "recharge" };
  const pos = { x: commande.x, y: commande.y };
  // Seul le monde déjà généré se laisse toucher : un miracle ne crée pas de terres.
  if (monde.grille.tuileSiGeneree(pos.x, pos.y) === null)
    return { ok: false, raison: "hors_monde" };
  const cible =
    commande.cibleId === undefined
      ? undefined
      : monde.personnages.find((p) => p.id === commande.cibleId && p.vivant);
  const rng = monde.rng.fork(`divin/${String(tick)}/${commande.pouvoir}`);
  let resultat: ResultatPouvoir;
  switch (commande.pouvoir) {
    case "pluie":
      resultat = pluie(monde, pos);
      break;
    case "eclaircie":
      resultat = eclaircie(monde, pos);
      break;
    case "seve":
      resultat = seve(monde, pos);
      break;
    case "souffle":
      resultat =
        cible === undefined ? { ok: false, raison: "cible_invalide" } : souffle(monde, cible);
      break;
    case "guerison":
      resultat = cible === undefined ? { ok: false, raison: "cible_invalide" } : guerison(cible);
      break;
    case "braise":
      resultat = braise(monde, pos);
      break;
    case "foudre":
      resultat = foudre(monde, pos, rng.suivant());
      break;
    case "songe":
      resultat =
        cible === undefined ? { ok: false, raison: "cible_invalide" } : songe(monde, cible);
      break;
    case "regard":
      resultat = regard(monde, pos);
      break;
  }
  if (!resultat.ok) return resultat;
  etat.valeur -= fiche.cout;
  etat.miracles += 1;
  if (fiche.rechargeJours > 0) etat.recharges.set(commande.pouvoir, tick + fiche.rechargeJours * T);
  const temoin = resultat.temoin;
  let reaction: string | null = null;
  if (temoin !== null) {
    reaction = fiche.bienfait
      ? `Le ciel nous a fait une grâce : ${resultat.effet}`
      : `Le ciel nous a frappés : ${resultat.effet}`;
    temoin.memoire.ajouter(tick, "observation", reaction, fiche.bienfait ? 7 : 8, [], pos);
    ajouterHumeur(temoin, "miracle", fiche.bienfait ? 8 : -12, 3 * T, tick);
  }
  monde.emettre(
    "divin",
    temoin,
    {
      pouvoir: commande.pouvoir,
      nom: fiche.nom,
      x: pos.x,
      y: pos.y,
      cible: cible?.id ?? null,
      effet: resultat.effet,
      reaction,
      cout: fiche.cout,
    },
    commande.pouvoir === "regard" ? 1 : fiche.bienfait ? 6 : 8,
    pos,
  );
  return resultat;
}

function gisementsAutour(monde: Monde, pos: Position, rayon: number): number {
  let n = 0;
  for (let dy = -rayon; dy <= rayon; dy++)
    for (let dx = -rayon; dx <= rayon; dx++) {
      const t = monde.grille.tuileSiGeneree(pos.x + dx, pos.y + dy);
      const g = t?.gisement ?? null;
      if (g === null) continue;
      if (g.quantite < g.max) {
        g.quantite = g.max;
        g.epuiseDepuis = null;
        n++;
      }
    }
  return n;
}

function pluie(monde: MondeDivin, pos: Position): ResultatPouvoir {
  monde.meteo = "pluie";
  let n = 0;
  const rayon = FICHES_POUVOIR.pluie.rayon;
  for (let dy = -rayon; dy <= rayon; dy++)
    for (let dx = -rayon; dx <= rayon; dx++) {
      const t = monde.grille.tuileSiGeneree(pos.x + dx, pos.y + dy);
      const g = t?.gisement ?? null;
      if (g !== null && (g.type === "baies" || g.type === "fibres") && g.quantite < g.max) {
        g.quantite = g.max;
        n++;
      }
      const c = t?.batiment?.culture ?? null;
      if (c !== null && c.seme && c.stade < 4) c.stade += 1;
    }
  return {
    ok: true,
    effet: `une ondée, et ${String(n)} buisson${n > 1 ? "s" : ""} regarni${n > 1 ? "s" : ""}`,
    temoin: temoinProche(monde, pos, RAYON_TEMOIN),
  };
}

function eclaircie(monde: MondeDivin, pos: Position): ResultatPouvoir {
  const avant = monde.meteo;
  monde.meteo = "clair";
  return {
    ok: true,
    effet: avant === "clair" ? "un ciel qui reste dégagé" : `le ciel se dégage (fini, ${avant})`,
    temoin: temoinProche(monde, pos, RAYON_TEMOIN),
  };
}

function seve(monde: Monde, pos: Position): ResultatPouvoir {
  const n = gisementsAutour(monde, pos, FICHES_POUVOIR.seve.rayon);
  return {
    ok: true,
    effet: `${String(n)} gisement${n > 1 ? "s" : ""} regorge${n > 1 ? "nt" : ""} de nouveau`,
    temoin: temoinProche(monde, pos, RAYON_TEMOIN),
  };
}

function souffle(monde: Monde, p: Personnage): ResultatPouvoir {
  const tick = monde.horloge.tick;
  ajouterHumeur(p, "souffle", 15, 3 * monde.horloge.ticksParJour, tick);
  p.corps.etat.fatigue = 0;
  p.besoins.moral = Math.min(100, p.besoins.moral + 15);
  return { ok: true, effet: `${p.identite.prenom} retrouve courage et forces`, temoin: p };
}

function guerison(p: Personnage): ResultatPouvoir {
  const etat = p.corps.etat;
  const plaies = etat.blessures.length;
  const maux = etat.maladies.length;
  if (plaies === 0 && maux === 0 && p.corps.sante >= 100 && etat.carence === null)
    return { ok: false, raison: "sans_effet" };
  for (const m of etat.maladies)
    if (PROFILS_MALADIE[m.type].immunisante && !etat.immunites.includes(m.type))
      etat.immunites.push(m.type);
  etat.blessures.length = 0;
  etat.maladies.length = 0;
  etat.carence = null;
  p.corps.sante = Math.min(100, p.corps.sante + 30);
  return {
    ok: true,
    effet: `${p.identite.prenom} guérit (${String(plaies)} plaie${plaies > 1 ? "s" : ""}, ${String(maux)} mal${maux > 1 ? "s" : ""})`,
    temoin: p,
  };
}

function braise(monde: Monde, pos: Position): ResultatPouvoir {
  const b = monde.grille.tuileSiGeneree(pos.x, pos.y)?.batiment ?? null;
  if (b === null) return { ok: false, raison: "cible_invalide" };
  if (b.etat === "chantier") return { ok: false, raison: "cible_invalide" };
  const temoin = temoinProche(monde, pos, RAYON_TEMOIN);
  if (PLANS_BATIMENT[b.type].atelier === "feu") {
    const etaitEteint = !b.allume;
    b.allume = true;
    b.reserveBois = Math.max(b.reserveBois, BUCHES_BRAISE);
    if (etaitEteint)
      monde.emettre("feu_rallume", null, { batiment: b.id, source: "divin" }, 3, pos);
    return {
      ok: true,
      effet: `le feu ${etaitEteint ? "se rallume" : "ronfle"} avec ${String(BUCHES_BRAISE)} bûches`,
      temoin,
    };
  }
  if (b.solidite >= 100) return { ok: false, raison: "sans_effet" };
  b.solidite = Math.min(100, b.solidite + 30);
  return { ok: true, effet: `${PLANS_BATIMENT[b.type].nom} se consolide`, temoin };
}

function foudre(monde: MondeDivin, pos: Position, tirage: number): ResultatPouvoir {
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  const effets: string[] = [];
  const b = monde.grille.tuileSiGeneree(pos.x, pos.y)?.batiment ?? null;
  if (b !== null && b.etat === "termine") {
    if (PLANS_BATIMENT[b.type].atelier === "feu" && !b.allume) {
      b.allume = true;
      b.reserveBois = Math.max(b.reserveBois, 2);
      monde.emettre("feu_rallume", null, { batiment: b.id, source: "foudre" }, 3, pos);
      effets.push("le feu s'embrase");
    } else {
      b.solidite -= 40;
      effets.push(`${PLANS_BATIMENT[b.type].nom} ébranlé${b.solidite <= 0 ? " et détruit" : ""}`);
      if (b.solidite <= 0) monde.detruireBatiment(b.id);
    }
  }
  let brules = 0;
  let effrayes = 0;
  const lieux = ["main", "bras", "jambe", "flanc"] as const;
  for (const p of monde.personnages) {
    if (!p.vivant) continue;
    const d = Grille.distance(p.corps.position, pos);
    if (d <= FICHES_POUVOIR.foudre.rayon) {
      blesser(
        monde,
        p,
        "coupure",
        2,
        lieux[Math.floor(tirage * 4) % 4] ?? "bras",
        "frappé par la foudre",
      );
      brules++;
    }
    if (d <= RAYON_PEUR) {
      p.besoins.securite = Math.max(0, p.besoins.securite - 30);
      ajouterHumeur(p, "peur", -10, 3 * T, tick);
      effrayes++;
    }
  }
  if (brules > 0)
    effets.push(
      `${String(brules)} personne${brules > 1 ? "s" : ""} brûlée${brules > 1 ? "s" : ""}`,
    );
  if (effrayes > 0) effets.push(`${String(effrayes)} effrayée${effrayes > 1 ? "s" : ""}`);
  if (monde.meteo === "clair" || monde.meteo === "canicule") monde.meteo = "orage";
  return {
    ok: true,
    effet: effets.length > 0 ? effets.join(", ") : "la foudre tombe dans le vide",
    temoin: temoinProche(monde, pos, RAYON_TEMOIN),
  };
}

function songe(monde: Monde, p: Personnage): ResultatPouvoir {
  const utile = leconsUtiles(monde, p)[0];
  if (utile === undefined) return { ok: false, raison: "sans_effet" };
  const tick = monde.horloge.tick;
  apprendre(p, utile.lecon, 1, "un songe", tick);
  p.memoire.ajouter(
    tick,
    "reflexion",
    `J'ai rêvé, et j'ai compris : ${LECONS[utile.lecon].morale}`,
    8,
    [],
  );
  monde.emettre(
    "lecon",
    p,
    {
      cause: "un songe",
      lecon: utile.lecon,
      titre: LECONS[utile.lecon].titre,
      morale: LECONS[utile.lecon].morale,
      apprenants: 1,
    },
    6,
  );
  return {
    ok: true,
    effet: `${p.identite.prenom} rêve : « ${LECONS[utile.lecon].titre} »`,
    temoin: p,
  };
}

function regard(monde: Monde, pos: Position): ResultatPouvoir {
  let n = 0;
  const rayon = FICHES_POUVOIR.regard.rayon;
  for (let dy = -rayon; dy <= rayon; dy++)
    for (let dx = -rayon; dx <= rayon; dx++) {
      const x = pos.x + dx;
      const y = pos.y + dy;
      if (Math.hypot(dx, dy) > rayon) continue;
      if (monde.grille.tuileSiGeneree(x, y) === null) continue;
      if (monde.grille.decouvrir(x, y)) n++;
    }
  return {
    ok: true,
    effet: `${String(n)} tuile${n > 1 ? "s" : ""} révélée${n > 1 ? "s" : ""}`,
    temoin: null,
  };
}
