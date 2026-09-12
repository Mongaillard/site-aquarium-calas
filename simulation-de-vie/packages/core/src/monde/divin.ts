/**
 * Mode Dieu : l'observateur exerce des pouvoirs sur le monde, payés en faveur.
 * Le catalogue (`FICHES_POUVOIR`, dans le protocole) est fermé ; chaque pouvoir
 * a un effet déterministe, un coût, une recharge, et les témoins l'interprètent
 * (souvenir, humeur) sans jamais recevoir d'ordre. Tout est journalisé sous le
 * type `divin`, pour le rejeu.
 */
import { FICHES_POUVOIR, POUVOIRS_EXAUCANT } from "@sdv/protocole";
import type { FaveurEtat, Pouvoir } from "@sdv/protocole";
import { INVENTIONS, SEUIL_SAVOIR } from "../savoirs/catalogue.js";
import type { Invention } from "../savoirs/catalogue.js";
import { besoinRessenti } from "../savoirs/inventions.js";
import { FAIM_MEUTE } from "./faune.js";
import type { Espece, Troupeau } from "./faune.js";
import { INFO_BIOME } from "./biomes.js";
import { estEau } from "../monde.js";
import { prochainCrepuscule } from "./danger.js";
import type { EtatDanger } from "./danger.js";
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

export interface EtatFaveur {
  valeur: number;
  readonly max: number;
  readonly recharges: Map<Pouvoir, number>;
  miracles: number;
  reputation: number;
  prieres: number;
  offrandes: number;
  exaucees: number;
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
  };
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
  };
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

/** Le monde, avec ce que seuls les miracles changent : la météo, la faune, le danger. */
export interface MondeDivin extends Monde {
  meteo: Meteo;
  readonly danger: EtatDanger;
  /** Fait naître un troupeau ou une meute à cet endroit. */
  ajouterTroupeau(position: Position, espece: Espece, taille: number): Troupeau;
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
  }
  if (!resultat.ok) return resultat;
  etat.valeur -= fiche.cout;
  etat.miracles += 1;
  if (fiche.rechargeJours > 0) etat.recharges.set(commande.pouvoir, tick + fiche.rechargeJours * T);
  const temoin = resultat.temoin;
  let reaction: string | null = null;
  let attribue = false;
  if (temoin !== null) {
    // Le témoin y voit la main du ciel selon sa foi et la réputation du dieu ; sa foi grandit.
    attribue = attribueAuCiel(temoin.foi, fiche.bienfait, etat.reputation);
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
  }
  if (commande.pouvoir !== "regard")
    etat.reputation = Math.max(
      -REPUTATION_MAX,
      Math.min(REPUTATION_MAX, etat.reputation + (fiche.bienfait ? 1 : -2)),
    );
  // Les prières que ce bienfait exauce (sujet correspondant, à dix tuiles ou sur la cible).
  const exauces: string[] = [];
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
      etat.exaucees += 1;
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
    }
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
      attribue,
      exauces: exauces.join(", "),
      cout: fiche.cout,
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
