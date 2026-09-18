/**
 * Mode Dieu : l'observateur exerce des pouvoirs sur le monde, payés en faveur.
 * Le catalogue (`FICHES_POUVOIR`, dans le protocole) est fermé ; chaque pouvoir
 * a un effet déterministe, un coût, une recharge, et les témoins l'interprètent
 * (souvenir, humeur) sans jamais recevoir d'ordre. Tout est journalisé sous le
 * type `divin`, pour le rejeu.
 */
import {
  batailleActive,
  conclure as conclureBataille,
  frappeDuCiel,
  leverTroupe,
} from "./bataille.js";
import { declarerGuerre, faireLaPaix, relationEntre } from "./villages.js";
import type { Village } from "./villages.js";
import {
  COUT_ETRANGER,
  COUT_FAVORI,
  COUT_PAR_USAGE,
  FICHES_DOMAINE,
  FICHES_POUVOIR,
  NIVEAU_POUVOIR,
  POUVOIRS,
  POUVOIRS_EXAUCANT,
  RANG_MAX,
  USAGES_MAX,
} from "@sdv/protocole";
import type { Domaine, FaveurEtat, Pouvoir } from "@sdv/protocole";
import { INVENTIONS, SEUIL_SAVOIR } from "../savoirs/catalogue.js";
import type { Invention } from "../savoirs/catalogue.js";
import { besoinRessenti } from "../savoirs/inventions.js";
import { FAIM_MEUTE } from "./faune.js";
import type { Espece, Troupeau } from "./faune.js";
import { INFO_BIOME } from "./biomes.js";
import { estEau } from "../monde.js";
import { prochainCrepuscule } from "./danger.js";
import type { EtatDanger } from "./danger.js";
import type { Rng } from "../rng.js";
import { COMPETENCES, niveau } from "../agents/competences.js";
import type { Competence } from "../agents/competences.js";
import { tomberMalade } from "../agents/maladies.js";
import { ajouterHumeur, blesser } from "../agents/corps.js";
import { foiInitiale } from "../agents/personnage.js";
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

/** Réputation du dieu : bornes, et seuils de foi pour attribuer un miracle au ciel. */
export const REPUTATION_MAX = 10;
/** Foi nécessaire pour voir la main du ciel dans un bienfait (davantage si le dieu est redouté). */
export const FOI_ATTRIBUTION_BIENFAIT = 4;
export const FOI_ATTRIBUTION_EPREUVE = 2;
/** Une prière est exaucée si le ciel répond dans ce délai, en jours. */
export const JOURS_PRIERE = 3;
/** Rayon dans lequel un bienfait exauce les prières alentour. */
export const RAYON_EXAUCEMENT = 10;
/** Faveur gagnée par prière, et en plus par offrande, et par prière exaucée. */
export const FAVEUR_PRIERE = 1;
export const FAVEUR_OFFRANDE = 2;
export const FAVEUR_EXAUCEMENT = 2;
/** Taille du troupeau offert. */
export const TAILLE_TROUPEAU_OFFERT = 4;
/** Jours de neige d'un gel précoce, de canicule d'une sécheresse. */
export const JOURS_GEL = 3;
export const JOURS_SECHERESSE = 10;
/** Faveur maximale de base, et gain par niveau de culte. */
export const FAVEUR_MAX_PAR_CULTE = 10;
/** Prières exaucées pour retenir « le ciel écoute » ; prières sans réponse pour « ne pas attendre le ciel ». */
export const EXAUCEMENTS_POUR_LECON = 2;
export const SILENCES_POUR_LECON = 3;
/** Prières à l'autel pour mériter le titre de gardien. */
export const PRIERES_GARDIEN = 5;

/** Niveau de culte 0..3 : la foi moyenne des adultes vivants. */
export function niveauCulte(monde: Monde): number {
  const adultes = monde.personnages.filter((p) => p.vivant && p.corps.stade !== "enfant");
  if (adultes.length === 0) return 0;
  const moyenne = adultes.reduce((t, p) => t + p.foi, 0) / adultes.length;
  return moyenne < 3 ? 0 : moyenne < 6 ? 1 : moyenne < 9 ? 2 : 3;
}

/** Le gardien de l'autel : qui y a le plus prié (cinq fois au moins), s'il y a un autel. */
export function gardienDeLAutel(monde: Monde): Personnage | null {
  if (![...monde.batiments.values()].some((b) => b.type === "autel" && b.etat === "termine"))
    return null;
  let meilleur: Personnage | null = null;
  for (const p of monde.personnages) {
    if (!p.vivant || p.prieresAutel < PRIERES_GARDIEN) continue;
    if (meilleur === null || p.prieresAutel > meilleur.prieresAutel) meilleur = p;
  }
  return meilleur;
}

/**
 * Chaque aube : le culte fixe la faveur maximale, et les prières restées trois
 * jours sans réponse sont comptées (trois silences : « ne pas attendre le ciel »).
 */
export function jourDuCiel(monde: Monde, etat: EtatFaveur): void {
  etat.culte = niveauCulte(monde);
  etat.rang = rangDuCiel(monde, etat);
  etat.max = FAVEUR_MAX + FAVEUR_MAX_PAR_CULTE * etat.culte;
  etat.valeur = Math.min(etat.valeur, etat.max);
  const T = monde.horloge.ticksParJour;
  const tick = monde.horloge.tick;
  for (const p of monde.personnages) {
    const priere = p.priere;
    if (!p.vivant || priere === null || priere.exaucee || priere.sansReponse === true) continue;
    if (tick - priere.tick <= JOURS_PRIERE * T) continue;
    priere.sansReponse = true;
    p.prieresSansReponse += 1;
    if (
      p.prieresSansReponse >= SILENCES_POUR_LECON &&
      apprendre(p, "ne_pas_attendre_le_ciel", 1, null, tick)
    ) {
      p.memoire.ajouter(tick, "reflexion", LECONS.ne_pas_attendre_le_ciel.morale, 7, []);
      monde.emettre(
        "lecon",
        p,
        {
          cause: "des prières sans réponse",
          lecon: "ne_pas_attendre_le_ciel",
          titre: LECONS.ne_pas_attendre_le_ciel.titre,
          morale: LECONS.ne_pas_attendre_le_ciel.morale,
          apprenants: 1,
        },
        6,
      );
    }
  }
}

export interface EtatFaveur {
  valeur: number;
  max: number;
  /** Niveau de culte 0..3 (recalculé chaque aube). */
  culte: number;
  /** Le domaine du ciel (M25), choisi au départ ou en cours de partie ; null tant qu'il ne l'est pas. */
  domaine: Domaine | null;
  /** Rang du ciel 0..3 : le culte, plus un à l'âge du cuivre (recalculé chaque aube). */
  rang: number;
  /** Usages de chaque pouvoir dans la saison : chacun renchérit le suivant. */
  readonly usages: Map<Pouvoir, number>;
  readonly recharges: Map<Pouvoir, number>;
  miracles: number;
  reputation: number;
  prieres: number;
  offrandes: number;
  exaucees: number;
  /** Providence : le ciel répond de lui-même aux prières. */
  providence: boolean;
}

export function etatFaveurInitial(): EtatFaveur {
  return {
    valeur: FAVEUR_INITIALE,
    max: FAVEUR_MAX,
    recharges: new Map(),
    miracles: 0,
    reputation: 0,
    prieres: 0,
    offrandes: 0,
    exaucees: 0,
    providence: false,
    culte: 0,
    domaine: null,
    rang: 0,
    usages: new Map(),
  };
}

/** Le pouvoir est-il favori du domaine (un palier plus tôt, moins cher), étranger, ou ni l'un ni l'autre ? */
export function affinite(etat: EtatFaveur, pouvoir: Pouvoir): "favori" | "etranger" | "neutre" {
  if (etat.domaine === null) return "neutre";
  const fiche = FICHES_DOMAINE[etat.domaine];
  if (fiche.pouvoirs.includes(pouvoir)) return "favori";
  if (FICHES_DOMAINE[fiche.etranger].pouvoirs.includes(pouvoir)) return "etranger";
  return "neutre";
}

/**
 * Rang requis pour exercer un pouvoir, domaine compris. Un ciel sans visage
 * garde tous ses pouvoirs au prix du catalogue : les paliers (et les créatures)
 * sont le jeu d'un ciel qui a pris un domaine.
 */
export function niveauRequis(etat: EtatFaveur, pouvoir: Pouvoir): number {
  if (etat.domaine === null) return 0;
  const base = NIVEAU_POUVOIR[pouvoir];
  const a = affinite(etat, pouvoir);
  return a === "favori"
    ? Math.max(0, base - 1)
    : a === "etranger"
      ? Math.min(RANG_MAX, base + 1)
      : base;
}

/** Coût effectif d'un pouvoir : le catalogue, le domaine, puis les usages de la saison. */
export function coutEffectif(etat: EtatFaveur, pouvoir: Pouvoir): number {
  const a = affinite(etat, pouvoir);
  const facteur = a === "favori" ? COUT_FAVORI : a === "etranger" ? COUT_ETRANGER : 1;
  const usages = Math.min(USAGES_MAX, etat.usages.get(pouvoir) ?? 0);
  return Math.max(
    1,
    Math.round(FICHES_POUVOIR[pouvoir].cout * facteur * (1 + COUT_PAR_USAGE * usages)),
  );
}

/** Vrai si un vivant tient du cuivre ou un outil de cuivre : l'âge du cuivre est là. */
export function estAgeDuCuivre(monde: Monde): boolean {
  for (const p of monde.personnages) {
    if (!p.vivant) continue;
    if ((p.corps.inventaire.ressources.cuivre ?? 0) > 0) return true;
    if (
      p.corps.inventaire.objets.some((o) => o.type === "hache_cuivre" || o.type === "pioche_cuivre")
    )
      return true;
  }
  return false;
}

/** Le rang du ciel : le culte, plus un à l'âge du cuivre, trois au plus. */
export function rangDuCiel(monde: Monde, etat: EtatFaveur): number {
  return Math.min(RANG_MAX, etat.culte + (estAgeDuCuivre(monde) ? 1 : 0));
}

/** Au changement de saison : les usages s'oublient à moitié, les pouvoirs redeviennent abordables. */
export function saisonDuCiel(etat: EtatFaveur): void {
  for (const [p, n] of etat.usages) {
    const reste = Math.floor(n / 2);
    if (reste === 0) etat.usages.delete(p);
    else etat.usages.set(p, reste);
  }
}

/**
 * Providence : pour chaque prière en attente, le premier pouvoir qui l'exauce,
 * payable et rechargé, est exercé sur la personne (ou sa tuile). Une réponse
 * par prière ; les épreuves ne sont jamais des réponses.
 */
export function providence(monde: MondeDivin, etat: EtatFaveur): CommandePouvoir[] {
  if (!etat.providence) return [];
  const T = monde.horloge.ticksParJour;
  const tick = monde.horloge.tick;
  const exercees: CommandePouvoir[] = [];
  for (const p of monde.personnages) {
    const priere = p.priere;
    if (!p.vivant || priere === null || priere.exaucee) continue;
    if (tick - priere.tick > JOURS_PRIERE * T) continue;
    for (const pouvoir of POUVOIRS_EXAUCANT[priere.sujet]) {
      const fiche = FICHES_POUVOIR[pouvoir];
      if (!fiche.bienfait || etat.valeur < coutEffectif(etat, pouvoir)) continue;
      if (niveauRequis(etat, pouvoir) > etat.rang) continue;
      if ((etat.recharges.get(pouvoir) ?? 0) > tick) continue;
      const commande: CommandePouvoir = {
        pouvoir,
        x: p.corps.position.x,
        y: p.corps.position.y,
        ...(fiche.cible === "personnage" ? { cibleId: p.id } : {}),
        auto: true,
      };
      if (exercer(monde, etat, commande).ok) {
        exercees.push(commande);
        break;
      }
    }
  }
  return exercees;
}

/** Le témoin voit-il la main du ciel, ou une chance / un malheur ? */
export function attribueAuCiel(foi: number, bienfait: boolean, reputation: number): boolean {
  if (bienfait) return foi >= FOI_ATTRIBUTION_BIENFAIT + (reputation <= -5 ? 2 : 0);
  return foi >= FOI_ATTRIBUTION_EPREUVE + (reputation >= 5 ? 2 : 0);
}

/**
 * Une saison sans miracle vu use la foi d'un point, jamais sous la foi native
 * (celle des valeurs) : ce que les miracles ont donné s'érode, le fond reste.
 */
export function saisonSansMiracle(monde: Monde): void {
  const T = monde.horloge.ticksParJour;
  const saison = monde.config.monde.joursParSaison * T;
  for (const p of monde.personnages) {
    if (!p.vivant || p.corps.stade === "enfant") continue;
    if (p.dernierMiracleVu < 0 && monde.horloge.tick < saison) continue;
    if (monde.horloge.tick - Math.max(0, p.dernierMiracleVu) >= saison)
      p.foi = Math.max(foiInitiale(p.identite.valeurs), p.foi - 1);
  }
}

export function gagnerFaveur(etat: EtatFaveur, n: number): void {
  etat.valeur = Math.min(etat.max, etat.valeur + n);
}

export function faveurEtat(etat: EtatFaveur): FaveurEtat {
  const recharges: Record<string, number> = {};
  for (const [k, v] of etat.recharges) recharges[k] = v;
  return {
    valeur: etat.valeur,
    max: etat.max,
    recharges,
    miracles: etat.miracles,
    reputation: etat.reputation,
    prieres: etat.prieres,
    offrandes: etat.offrandes,
    exaucees: etat.exaucees,
    providence: etat.providence,
    culte: etat.culte,
    domaine: etat.domaine,
    rang: etat.rang,
    couts: Object.fromEntries(POUVOIRS.map((p) => [p, coutEffectif(etat, p)])),
    verrous: Object.fromEntries(POUVOIRS.map((p) => [p, niveauRequis(etat, p)])),
  };
}

export interface CommandePouvoir {
  readonly pouvoir: Pouvoir;
  readonly x: number;
  readonly y: number;
  readonly cibleId?: string | undefined;
  /** Exercé par la providence, pas par l'observateur. */
  readonly auto?: boolean | undefined;
}

export type RaisonRefus =
  | "faveur_insuffisante"
  | "recharge"
  | "cible_invalide"
  | "hors_monde"
  | "sans_effet"
  | "verrouille";

export type ResultatPouvoir =
  | { readonly ok: true; readonly effet: string; readonly temoin: Personnage | null }
  | { readonly ok: false; readonly raison: RaisonRefus };

/** Le monde, avec ce que seuls les miracles changent : la météo, la faune, le danger. */
export interface MondeDivin extends Monde {
  meteo: Meteo;
  readonly danger: EtatDanger;
  /** Fait naître un troupeau ou une meute à cet endroit. */
  ajouterTroupeau(position: Position, espece: Espece, taille: number): Troupeau;
  /** Impose une météo pendant des jours (gel précoce, sécheresse). */
  forcerMeteo(meteo: Meteo, jours: number): void;
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
  if (niveauRequis(etat, commande.pouvoir) > etat.rang) return { ok: false, raison: "verrouille" };
  const cout = coutEffectif(etat, commande.pouvoir);
  if (etat.valeur < cout) return { ok: false, raison: "faveur_insuffisante" };
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
    case "troupeau":
      resultat = troupeauOffert(monde, pos);
      break;
    case "idee":
      resultat =
        cible === undefined ? { ok: false, raison: "cible_invalide" } : ideeSoufflee(monde, cible);
      break;
    case "loups":
      resultat = loups(monde, pos);
      break;
    case "gel":
      resultat = gel(monde, pos);
      break;
    case "secheresse":
      resultat = secheresse(monde, pos);
      break;
    case "fievre":
      resultat =
        cible === undefined ? { ok: false, raison: "cible_invalide" } : fievre(monde, cible);
      break;
    case "secousse":
      resultat = secousse(monde, pos, rng);
      break;
    case "epiphanie":
      resultat =
        cible === undefined ? { ok: false, raison: "cible_invalide" } : epiphanie(monde, cible);
      break;
    case "guerre":
      resultat = sonnerLaGuerre(monde, pos, rng);
      break;
    case "apaiser":
      resultat = apaiser(monde, pos);
      break;
  }
  if (resultat.ok && commande.pouvoir === "foudre") {
    // Sur un champ de bataille (M33), la foudre frappe aussi les combattants virtuels.
    const touches = frappeDuCiel(monde, pos);
    if (touches > 0)
      resultat = {
        ...resultat,
        effet: `${resultat.effet}, ${String(touches)} combattant${touches > 1 ? "s" : ""} foudroyé${touches > 1 ? "s" : ""}`,
      };
  }
  if (!resultat.ok) return resultat;
  etat.valeur -= cout;
  etat.usages.set(commande.pouvoir, (etat.usages.get(commande.pouvoir) ?? 0) + 1);
  etat.miracles += 1;
  if (fiche.rechargeJours > 0) etat.recharges.set(commande.pouvoir, tick + fiche.rechargeJours * T);
  // Les prières que ce bienfait exauce (sujet correspondant, à dix tuiles ou sur la cible).
  const exauces: string[] = [];
  const exaucesIds = new Set<string>();
  if (fiche.bienfait) {
    for (const p of monde.personnages) {
      const priere = p.priere;
      if (!p.vivant || priere === null || priere.exaucee) continue;
      if (tick - priere.tick > JOURS_PRIERE * T) continue;
      if (!POUVOIRS_EXAUCANT[priere.sujet].includes(commande.pouvoir)) continue;
      if (p.id !== cible?.id && Grille.distance(p.corps.position, pos) > RAYON_EXAUCEMENT) continue;
      priere.exaucee = true;
      p.foi = Math.min(10, p.foi + 2);
      p.dernierMiracleVu = tick;
      p.prieresExaucees += 1;
      etat.exaucees += 1;
      if (
        p.prieresExaucees >= EXAUCEMENTS_POUR_LECON &&
        apprendre(p, "le_ciel_ecoute", 1, null, tick)
      )
        monde.emettre(
          "lecon",
          p,
          {
            cause: "des prières exaucées",
            lecon: "le_ciel_ecoute",
            titre: LECONS.le_ciel_ecoute.titre,
            morale: LECONS.le_ciel_ecoute.morale,
            apprenants: 1,
          },
          6,
        );
      gagnerFaveur(etat, FAVEUR_EXAUCEMENT);
      p.memoire.ajouter(
        tick,
        "reflexion",
        `Le ciel m'a entendu${p.identite.sexe === "F" ? "e" : ""} : ${resultat.effet}.`,
        8,
        [],
      );
      ajouterHumeur(p, "exaucee", 10, 5 * T, tick);
      exauces.push(p.identite.prenom);
      exaucesIds.add(p.id);
    }
  }
  const temoin = resultat.temoin;
  let reaction: string | null = null;
  let attribue = false;
  if (temoin !== null) {
    // Le témoin y voit la main du ciel selon sa foi et la réputation du dieu (toujours, si
    // c'est sa propre prière qui vient d'être exaucée) ; sa foi grandit.
    attribue =
      exaucesIds.has(temoin.id) || attribueAuCiel(temoin.foi, fiche.bienfait, etat.reputation);
    reaction = fiche.bienfait
      ? attribue
        ? `Le ciel nous a fait une grâce : ${resultat.effet}`
        : `Une chance inespérée : ${resultat.effet}`
      : attribue
        ? `Le ciel nous a frappés : ${resultat.effet}`
        : `Un malheur : ${resultat.effet}`;
    temoin.memoire.ajouter(tick, "observation", reaction, fiche.bienfait ? 7 : 8, [], pos);
    ajouterHumeur(temoin, "miracle", fiche.bienfait ? 8 : -12, 3 * T, tick);
    temoin.foi = Math.min(10, temoin.foi + (fiche.bienfait ? 1 : 2));
    temoin.dernierMiracleVu = tick;
    // Une épreuve reconnue comme venue du ciel apprend à le craindre.
    if (!fiche.bienfait && attribue && apprendre(temoin, "le_ciel_frappe", 1, null, tick))
      monde.emettre(
        "lecon",
        temoin,
        {
          cause: "une épreuve du ciel",
          lecon: "le_ciel_frappe",
          titre: LECONS.le_ciel_frappe.titre,
          morale: LECONS.le_ciel_frappe.morale,
          apprenants: 1,
        },
        6,
      );
  }
  if (commande.pouvoir !== "regard")
    etat.reputation = Math.max(
      -REPUTATION_MAX,
      Math.min(REPUTATION_MAX, etat.reputation + (fiche.bienfait ? 1 : -2)),
    );
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
      attribue,
      exauces: exauces.join(", "),
      cout,
      auto: commande.auto === true,
    },
    commande.pouvoir === "regard" ? 1 : fiche.bienfait ? 6 : 8,
    pos,
  );
  return resultat;
}

function troupeauOffert(monde: MondeDivin, pos: Position): ResultatPouvoir {
  const t = monde.grille.tuileSiGeneree(pos.x, pos.y);
  if (
    t === null ||
    !INFO_BIOME[t.biome].praticable ||
    t.batiment !== null ||
    estEau(monde, pos.x, pos.y)
  )
    return { ok: false, raison: "cible_invalide" };
  const troupeau = monde.ajouterTroupeau(pos, "mouflon", TAILLE_TROUPEAU_OFFERT);
  return {
    ok: true,
    effet: `${String(troupeau.taille)} mouflons paissent là où il n'y avait rien`,
    temoin: temoinProche(monde, pos, RAYON_TEMOIN),
  };
}

function ideeSoufflee(monde: Monde, p: Personnage): ResultatPouvoir {
  if (p.corps.stade === "enfant") return { ok: false, raison: "cible_invalide" };
  const inconnues = (Object.keys(INVENTIONS) as Invention[]).filter(
    (i) => (p.savoirs.get(i)?.force ?? 0) < SEUIL_SAVOIR,
  );
  const invention = inconnues.find((i) => besoinRessenti(monde, p, i)) ?? inconnues[0];
  if (invention === undefined) return { ok: false, raison: "sans_effet" };
  const tick = monde.horloge.tick;
  apprendre(p, invention, SEUIL_SAVOIR, "une inspiration", tick);
  p.memoire.ajouter(
    tick,
    "reflexion",
    `Une idée m'est venue d'un coup. ${INVENTIONS[invention].idee}`,
    7,
    [],
  );
  monde.emettre("idee", p, { invention, nom: INVENTIONS[invention].nom, source: "divin" }, 6);
  return {
    ok: true,
    effet: `${p.identite.prenom} a l'idée : ${INVENTIONS[invention].nom}`,
    temoin: p,
  };
}

function loups(monde: MondeDivin, pos: Position): ResultatPouvoir {
  const t = monde.grille.tuileSiGeneree(pos.x, pos.y);
  if (
    t === null ||
    !INFO_BIOME[t.biome].praticable ||
    t.batiment !== null ||
    estEau(monde, pos.x, pos.y)
  )
    return { ok: false, raison: "cible_invalide" };
  if (monde.danger.menace !== null) return { ok: false, raison: "sans_effet" };
  const tick = monde.horloge.tick;
  const meute = monde.ajouterTroupeau(pos, "loup", 3);
  meute.faim = FAIM_MEUTE + 2;
  meute.enMenace = true;
  monde.danger.attaquesSaison += 1;
  monde.danger.menace = {
    meute: meute.id,
    depuis: tick,
    preavis: prochainCrepuscule(tick, 0, monde.horloge.ticksParJour),
    cible: null,
    alarmeDonnee: false,
    tracesVues: false,
  };
  monde.emettre("menace", null, { genre: "menace", meute: meute.id, source: "divin" }, 6, pos);
  return {
    ok: true,
    effet: "une meute affamée rôde, elle viendra ce soir",
    temoin: temoinProche(monde, pos, RAYON_TEMOIN),
  };
}

/** Le village le plus proche d'une position, à trente tuiles au plus. */
function villageLePlusProche(monde: Monde, pos: Position): Village | null {
  let meilleur: Village | null = null;
  let d = 30;
  for (const v of monde.villages.villages) {
    const dist = Grille.distance(v.centre, pos);
    if (dist <= d) {
      d = dist;
      meilleur = v;
    }
  }
  return meilleur;
}

/** Sonner la guerre (M33) : le village visé entre en guerre avec son pire voisin, troupe levée. */
function sonnerLaGuerre(monde: MondeDivin, pos: Position, rng: Rng): ResultatPouvoir {
  if (!monde.lois.guerres) return { ok: false, raison: "sans_effet" };
  const a = villageLePlusProche(monde, pos);
  if (a === null) return { ok: false, raison: "cible_invalide" };
  const autres = monde.villages.villages.filter((v) => v.id !== a.id);
  if (autres.length === 0 || batailleActive(monde) !== null)
    return { ok: false, raison: "sans_effet" };
  // Le pire voisin : l'attitude la plus basse, puis le plus proche.
  const b = [...autres].sort(
    (x, y) =>
      relationEntre(monde.villages, a.id, x.id).attitude -
        relationEntre(monde.villages, a.id, y.id).attitude ||
      Grille.distance(a.centre, x.centre) - Grille.distance(a.centre, y.centre),
  )[0];
  if (b === undefined) return { ok: false, raison: "sans_effet" };
  const r = declarerGuerre(monde, a, b, "le ciel l'a voulu");
  if (r === null) return { ok: false, raison: "sans_effet" };
  const bataille = leverTroupe(monde, rng, r, a, b, a);
  return {
    ok: true,
    effet:
      bataille === null
        ? `${a.nom} entre en guerre avec ${b.nom}, mais personne n'est en état de partir`
        : `${a.nom} entre en guerre avec ${b.nom} : ${String(bataille.attaquant.guerriers.length)} guerriers se mettent en marche`,
    temoin: temoinProche(monde, a.centre, RAYON_TEMOIN),
  };
}

/** Apaiser (M33) : la bataille en cours s'arrête ; sinon le village le plus proche fait la paix. */
function apaiser(monde: MondeDivin, pos: Position): ResultatPouvoir {
  const b = batailleActive(monde);
  if (b !== null) {
    conclureBataille(monde, b, "treve");
    return {
      ok: true,
      effet:
        b.genre === "guerre"
          ? "les armes tombent, chacun rentre chez soi"
          : b.genre === "raid"
            ? "les pillards s'en vont les mains vides"
            : "la meute renonce et s'éloigne",
      temoin: temoinProche(monde, b.lieu, RAYON_TEMOIN),
    };
  }
  const v = villageLePlusProche(monde, pos);
  if (v === null) return { ok: false, raison: "cible_invalide" };
  const guerres = monde.villages.relations.filter(
    (r) => r.etat === "guerre" && (r.a === v.id || r.b === v.id),
  );
  if (guerres.length === 0) return { ok: false, raison: "sans_effet" };
  for (const r of guerres) {
    const a = monde.villages.villages.find((x) => x.id === r.a);
    const c = monde.villages.villages.find((x) => x.id === r.b);
    if (a !== undefined && c !== undefined) faireLaPaix(monde, r, a, c);
  }
  return {
    ok: true,
    effet: `${v.nom} fait la paix`,
    temoin: temoinProche(monde, v.centre, RAYON_TEMOIN),
  };
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
  if (n === 0) return { ok: false, raison: "sans_effet" };
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

function gel(monde: MondeDivin, pos: Position): ResultatPouvoir {
  monde.forcerMeteo("neige", JOURS_GEL);
  monde.meteo = "neige";
  return {
    ok: true,
    effet: `la neige tombe pour ${String(JOURS_GEL)} jours, en pleine ${monde.horloge.moment().saison === "ete" ? "été" : monde.horloge.moment().saison}`,
    temoin: temoinProche(monde, pos, RAYON_TEMOIN),
  };
}

function secheresse(monde: MondeDivin, pos: Position): ResultatPouvoir {
  monde.forcerMeteo("canicule", JOURS_SECHERESSE);
  monde.meteo = "canicule";
  let n = 0;
  const rayon = FICHES_POUVOIR.secheresse.rayon;
  for (let dy = -rayon; dy <= rayon; dy++)
    for (let dx = -rayon; dx <= rayon; dx++) {
      const g = monde.grille.tuileSiGeneree(pos.x + dx, pos.y + dy)?.gisement ?? null;
      if (g === null || g.quantite <= 0) continue;
      if (g.type === "baies" || g.type === "fibres" || g.type === "poisson") {
        g.quantite = Math.floor(g.quantite / 2);
        n++;
      }
    }
  return {
    ok: true,
    effet: `${String(JOURS_SECHERESSE)} jours de canicule, ${String(n)} gisement${n > 1 ? "s" : ""} réduit${n > 1 ? "s" : ""} de moitié`,
    temoin: temoinProche(monde, pos, RAYON_TEMOIN),
  };
}

function fievre(monde: Monde, p: Personnage): ResultatPouvoir {
  const m = tomberMalade(monde, p, "fievre_des_eaux", "une fièvre venue du ciel");
  if (m === null) return { ok: false, raison: "sans_effet" };
  return { ok: true, effet: `${p.identite.prenom} prend la fièvre`, temoin: p };
}

function secousse(monde: MondeDivin, pos: Position, rng: Rng): ResultatPouvoir {
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  let ebranles = 0;
  let detruits = 0;
  for (const b of [...monde.batiments.values()]) {
    if (b.etat !== "termine" || b.type === "tombe") continue;
    if (Grille.distance(b.position, pos) > FICHES_POUVOIR.secousse.rayon) continue;
    b.solidite -= 50;
    ebranles++;
    if (b.solidite <= 0) {
      detruits++;
      monde.detruireBatiment(b.id);
    }
  }
  let blesses = 0;
  const lieux = ["bras", "jambe"] as const;
  for (const p of monde.personnages) {
    if (!p.vivant) continue;
    const d = Grille.distance(p.corps.position, pos);
    if (d <= FICHES_POUVOIR.secousse.rayon && rng.chance(0.3)) {
      blesser(
        monde,
        p,
        "fracture",
        rng.chance(0.5) ? 2 : 1,
        lieux[rng.entier(0, 1)] ?? "jambe",
        "quand la terre a tremblé",
      );
      blesses++;
    }
    if (d <= 12) {
      p.besoins.securite = Math.max(0, p.besoins.securite - 40);
      ajouterHumeur(p, "peur", -12, 4 * T, tick);
    }
  }
  return {
    ok: true,
    effet: `la terre tremble : ${String(ebranles)} bâtiment${ebranles > 1 ? "s" : ""} ébranlé${ebranles > 1 ? "s" : ""}${detruits > 0 ? ` (${String(detruits)} détruit${detruits > 1 ? "s" : ""})` : ""}, ${String(blesses)} fracture${blesses > 1 ? "s" : ""}`,
    temoin: temoinProche(monde, pos, RAYON_TEMOIN),
  };
}

function epiphanie(monde: Monde, p: Personnage): ResultatPouvoir {
  if (p.corps.stade === "enfant") return { ok: false, raison: "cible_invalide" };
  let meilleure: Competence = "recolte";
  for (const c of COMPETENCES) if (p.experience[c] > p.experience[meilleure]) meilleure = c;
  const actuel = niveau(p.experience[meilleure]);
  if (actuel >= 10) return { ok: false, raison: "sans_effet" };
  p.experience[meilleure] = (actuel + 1) * (actuel + 1) * 10;
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  ajouterHumeur(p, "epiphanie", 20, 5 * T, tick);
  p.memoire.ajouter(
    tick,
    "reflexion",
    `J'ai vu clair d'un coup : je sais maintenant ${meilleure} comme jamais.`,
    8,
    [],
  );
  let convives = 0;
  for (const autre of monde.personnages) {
    if (!autre.vivant || autre.id === p.id) continue;
    if (Grille.distance(autre.corps.position, p.corps.position) > FICHES_POUVOIR.epiphanie.rayon)
      continue;
    ajouterHumeur(autre, "fete", 10, 3 * T, tick);
    autre.memoire.ajouter(
      tick,
      "observation",
      `On a fêté ${p.identite.prenom}, qui a eu une révélation.`,
      5,
      [p.id],
    );
    convives++;
  }
  return {
    ok: true,
    effet: `${p.identite.prenom} passe au niveau ${String(actuel + 1)} en ${meilleure}, et ${String(convives)} personne${convives > 1 ? "s" : ""} font la fête`,
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
