/**
 * Le conteur (M25) : le directeur de danger devient un narrateur. Une courbe
 * de tension en quatre temps — calme, montée, crise, répit — rythme le monde :
 * la crise envoie une épreuve (meute, bande, maladie, tempête, canicule,
 * neige), le répit un bienfait (troupeau, beau temps, guérison, aubaine).
 * Le conteur n'accable pas un village déjà en peine : si la pression est
 * forte au moment de frapper, il passe au répit. À chaque nouvel an, il écrit
 * la chronique de l'année écoulée, qu'on lit au joueur.
 */
import type { Loi } from "@sdv/protocole";
import { estMalade, tomberMalade } from "../agents/maladies.js";
import type { Monde } from "../monde.js";
import type { Rng } from "../rng.js";
import { PREAVIS_TICKS, centreVillage, prochainCrepuscule } from "./danger.js";
import { FAIM_MEUTE } from "./faune.js";
import type { EtatDanger } from "./danger.js";
import type { Espece, Troupeau } from "./faune.js";
import type { Position } from "./grille.js";
import { INFO_BIOME } from "./biomes.js";
import type { Meteo } from "./meteo.js";
import { lancerBande } from "./villages.js";
import type { EtatVillages } from "./villages.js";

export type PhaseConteur = "calme" | "montee" | "crise" | "repit";

export interface ActeConteur {
  readonly jour: number;
  readonly genre: string;
  readonly bienfait: boolean;
  readonly texte: string;
}

export interface ChroniqueAnnee {
  readonly annee: number;
  readonly titre: string;
  readonly texte: string;
  /** Tick où elle a été écrite (le viewer ne lit à voix haute que la toute fraîche). */
  readonly tick: number;
}

export interface EtatConteur {
  phase: PhaseConteur;
  /** La tension dramatique 0..100 : monte avec la phase, retombe au répit. */
  tension: number;
  phaseDepuisJour: number;
  phaseDureeJours: number;
  /** Pression réelle du monde 0..100 (faim, maladie, menace, deuils), mesurée chaque jour. */
  pression: number;
  crises: number;
  bienfaits: number;
  /** Ce que le conteur a fait, les plus récents à la fin (trente au plus). */
  actes: ActeConteur[];
  /** Les chroniques de fin d'année, la plus récente à la fin (douze au plus). */
  chroniques: ChroniqueAnnee[];
  /** Compteurs du journal au premier jour de l'année en cours. */
  repere: Record<string, number>;
  anneeEnCours: number;
  decesHier: number;
}

/** Durées des phases, en jours (bornes incluses). */
export const DUREES: Readonly<Record<PhaseConteur, readonly [number, number]>> = {
  calme: [8, 14],
  montee: [4, 8],
  crise: [1, 1],
  repit: [6, 10],
};
/** Le premier calme dure le temps que la colonie s'installe (les jours de grâce du danger). */
export const PREMIER_CALME_JOURS = 24;
/** Pression au-delà de laquelle le conteur épargne le village et passe au répit. */
export const PRESSION_CLEMENCE = 60;
const MAX_ACTES = 30;
const MAX_CHRONIQUES = 12;

/** Ce que la chronique compte : des types d'événements, ou des détails `type:genre`. */
const COMPTES: readonly string[] = [
  "naissance",
  "deces",
  "union",
  "batiment_termine",
  "invention",
  "legende:legende",
  "raid:approche",
  "combat",
  "divin",
  "epidemie",
  "village",
  "caravane:arrivee",
  "chantier_fonde",
];

export interface MondeConteur extends Monde {
  readonly danger: EtatDanger;
  readonly villages: EtatVillages;
  readonly lois: Readonly<Record<Loi, boolean>>;
  meteo: Meteo;
  forcerMeteo(meteo: Meteo, jours: number): void;
  ajouterTroupeau(position: Position, espece: Espece, taille: number): Troupeau;
  /** Compteur du journal pour un type, ou un détail `type:genre` (depuis le début du monde). */
  compter(cle: string): number;
}

export function etatConteurInitial(): EtatConteur {
  return {
    phase: "calme",
    tension: 10,
    phaseDepuisJour: 0,
    phaseDureeJours: PREMIER_CALME_JOURS,
    pression: 0,
    crises: 0,
    bienfaits: 0,
    actes: [],
    chroniques: [],
    repere: {},
    anneeEnCours: 1,
    decesHier: 0,
  };
}

/** La pression réelle du monde : part des affamés et des malades, menace ouverte, morts de la veille. */
export function mesurerPression(monde: MondeConteur, etat: EtatConteur): number {
  const vivants = monde.personnages.filter((p) => p.vivant);
  if (vivants.length === 0) return 0;
  const affames = vivants.filter((p) => p.besoins.faim < 30).length / vivants.length;
  const malades = vivants.filter((p) => estMalade(p)).length / vivants.length;
  const deces = monde.compter("deces");
  const morts = Math.max(0, deces - etat.decesHier);
  etat.decesHier = deces;
  const pression =
    affames * 60 +
    malades * 40 +
    (monde.danger.menace !== null ? 25 : 0) +
    Math.min(40, morts * 20);
  return Math.round(Math.min(100, pression));
}

/** Chaque aube : la courbe avance, les phases s'enchaînent, la chronique s'écrit au nouvel an. */
export function jourDuConteur(monde: MondeConteur, etat: EtatConteur, rng: Rng): void {
  const moment = monde.horloge.moment();
  const jour = moment.jourAbsolu;
  if (Object.keys(etat.repere).length === 0) {
    for (const t of COMPTES) etat.repere[t] = monde.compter(t);
    etat.anneeEnCours = moment.annee;
  }
  if (moment.annee > etat.anneeEnCours) ecrireChronique(monde, etat);
  etat.pression = mesurerPression(monde, etat);
  const vivants = monde.personnages.some((p) => p.vivant);
  // La tension suit la phase.
  switch (etat.phase) {
    case "calme":
      etat.tension = Math.max(10, etat.tension - 3);
      break;
    case "montee":
      etat.tension = Math.min(90, etat.tension + 8);
      break;
    case "crise":
      etat.tension = 100;
      break;
    case "repit":
      etat.tension = Math.max(5, etat.tension - 12);
      break;
  }
  if (jour - etat.phaseDepuisJour < etat.phaseDureeJours) return;
  // Fin de phase : la suivante.
  let suivante: PhaseConteur;
  switch (etat.phase) {
    case "calme":
      suivante = "montee";
      break;
    case "montee":
      // Clémence : un village déjà en peine n'est pas frappé, il souffle.
      suivante = etat.pression >= PRESSION_CLEMENCE || !vivants ? "repit" : "crise";
      break;
    case "crise":
      suivante = "repit";
      break;
    case "repit":
      suivante = "calme";
      break;
  }
  entrer(monde, etat, rng, suivante, jour);
}

function entrer(
  monde: MondeConteur,
  etat: EtatConteur,
  rng: Rng,
  phase: PhaseConteur,
  jour: number,
): void {
  etat.phase = phase;
  etat.phaseDepuisJour = jour;
  const [min, max] = DUREES[phase];
  etat.phaseDureeJours = rng.entier(min, max);
  if (phase === "crise") frapper(monde, etat, rng);
  else if (phase === "repit") offrir(monde, etat, rng);
  else if (phase === "montee")
    monde.emettre(
      "conteur",
      null,
      { genre: "phase", phase, texte: "Quelque chose se prépare." },
      3,
    );
}

function noter(
  monde: MondeConteur,
  etat: EtatConteur,
  genre: string,
  bienfait: boolean,
  texte: string,
  position: Position | null,
): void {
  const jour = monde.horloge.moment().jourAbsolu;
  etat.actes.push({ jour, genre, bienfait, texte });
  if (etat.actes.length > MAX_ACTES) etat.actes.splice(0, etat.actes.length - MAX_ACTES);
  if (bienfait) etat.bienfaits += 1;
  else etat.crises += 1;
  monde.emettre(
    "conteur",
    null,
    { genre: bienfait ? "bienfait" : "crise", quoi: genre, texte, phase: etat.phase },
    bienfait ? 6 : 7,
    position,
  );
}

/** Une tuile praticable et libre à `rayon` tuiles du centre, dans une direction tirée au sort. */
function autourDe(monde: Monde, centre: Position, rayon: number, rng: Rng): Position | null {
  for (let essai = 0; essai < 12; essai++) {
    const angle = rng.suivant() * Math.PI * 2;
    const pos = {
      x: centre.x + Math.round(Math.cos(angle) * rayon),
      y: centre.y + Math.round(Math.sin(angle) * rayon),
    };
    const t = monde.grille.tuileOuNull(pos.x, pos.y);
    if (
      t !== null &&
      INFO_BIOME[t.biome].praticable &&
      t.biome !== "eau_peu_profonde" &&
      t.batiment === null
    )
      return pos;
  }
  return null;
}

/** La crise : une épreuve parmi celles que les lois et la saison permettent. */
export function frapper(monde: MondeConteur, etat: EtatConteur, rng: Rng): void {
  const moment = monde.horloge.moment();
  const centre = centreVillage(monde);
  if (centre === null) return;
  const choix: string[] = ["tempete"];
  if (monde.lois.betes && monde.danger.menace === null) choix.push("meute", "meute");
  if (monde.lois.raids && monde.villages.villages.length > 0) choix.push("bande");
  if (monde.lois.maladies) choix.push("maladie");
  if (moment.saison === "ete" || moment.saison === "automne") choix.push("canicule");
  if (moment.saison === "hiver" || moment.saison === "automne") choix.push("neige");
  const quoi = rng.choisir(choix);
  switch (quoi) {
    case "meute": {
      const pos = autourDe(monde, centre, 30, rng);
      if (pos === null) break;
      const meute = monde.ajouterTroupeau(pos, "loup", rng.entier(3, 5));
      meute.faim = FAIM_MEUTE + 2;
      meute.enMenace = true;
      monde.danger.attaquesSaison += 1;
      monde.danger.menace = {
        meute: meute.id,
        depuis: monde.horloge.tick,
        preavis: prochainCrepuscule(monde.horloge.tick, PREAVIS_TICKS, monde.horloge.ticksParJour),
        cible: null,
        alarmeDonnee: false,
        tracesVues: false,
      };
      noter(monde, etat, quoi, false, "Une meute affamée descend vers le village.", pos);
      return;
    }
    case "bande": {
      const bande = lancerBande(monde, rng, null);
      if (bande === null) break;
      noter(
        monde,
        etat,
        quoi,
        false,
        "Une bande a eu vent des réserves du village.",
        bande.position,
      );
      return;
    }
    case "maladie": {
      const adultes = monde.personnages.filter(
        (p) => p.vivant && p.corps.stade !== "enfant" && !estMalade(p),
      );
      if (adultes.length === 0) break;
      const p = rng.choisir(adultes);
      if (tomberMalade(monde, p, "toux_grise", "un mal venu d'ailleurs") === null) break;
      noter(monde, etat, quoi, false, `${p.identite.prenom} tousse : un mal venu d'ailleurs.`, {
        ...p.corps.position,
      });
      return;
    }
    case "canicule":
      monde.forcerMeteo("canicule", 4);
      noter(monde, etat, quoi, false, "Quatre jours de canicule s'abattent sur le pays.", centre);
      return;
    case "neige":
      monde.forcerMeteo("neige", 3);
      noter(monde, etat, quoi, false, "Trois jours de neige enferment le village.", centre);
      return;
    default:
      break;
  }
  monde.forcerMeteo("orage", 2);
  noter(monde, etat, "tempete", false, "Deux jours d'orage roulent sur le village.", centre);
}

/** Le répit : un bienfait, choisi selon ce qui manque. */
export function offrir(monde: MondeConteur, etat: EtatConteur, rng: Rng): void {
  const centre = centreVillage(monde);
  if (centre === null) return;
  const vivants = monde.personnages.filter((p) => p.vivant);
  const malades = vivants.filter((p) => estMalade(p));
  const choix: string[] = ["beau_temps", "aubaine", "troupeau"];
  if (malades.length > 0) choix.push("guerison", "guerison");
  const quoi = rng.choisir(choix);
  switch (quoi) {
    case "guerison":
      for (const p of malades) p.corps.etat.maladies.length = 0;
      noter(
        monde,
        etat,
        quoi,
        true,
        `Les malades se relèvent : ${String(malades.length)} guérison${malades.length > 1 ? "s" : ""} d'un coup.`,
        centre,
      );
      return;
    case "troupeau": {
      const pos = autourDe(monde, centre, 14, rng);
      if (pos === null) break;
      const espece: Espece = rng.chance(0.5) ? "cerf" : "mouflon";
      monde.ajouterTroupeau(pos, espece, rng.entier(4, 6));
      noter(
        monde,
        etat,
        quoi,
        true,
        `Un troupeau de ${espece === "cerf" ? "cerfs" : "mouflons"} vient paître près du village.`,
        pos,
      );
      return;
    }
    case "aubaine": {
      let n = 0;
      for (let dy = -12; dy <= 12; dy++)
        for (let dx = -12; dx <= 12; dx++) {
          const t = monde.grille.tuileSiGeneree(centre.x + dx, centre.y + dy);
          if (t?.gisement && t.gisement.quantite < t.gisement.max) {
            t.gisement.quantite = t.gisement.max;
            t.gisement.epuiseDepuis = null;
            n += 1;
          }
        }
      noter(
        monde,
        etat,
        quoi,
        true,
        `Une saison d'aubaine : ${String(n)} gisement${n > 1 ? "s" : ""} regarnis autour du village.`,
        centre,
      );
      return;
    }
    default:
      break;
  }
  monde.forcerMeteo("clair", 4);
  noter(
    monde,
    etat,
    "beau_temps",
    true,
    "Quatre jours de ciel clair : le village respire.",
    centre,
  );
}

/** Les actes, dédoublonnés et comptés (« deux jours d'orage… (×2) »). */
function enumerer(actes: readonly ActeConteur[]): string {
  const comptes = new Map<string, number>();
  for (const a of actes) {
    const t = a.texte.replace(/\.$/, "");
    const texte = t.charAt(0).toLowerCase() + t.slice(1);
    comptes.set(texte, (comptes.get(texte) ?? 0) + 1);
  }
  return [...comptes.entries()].map(([t, k]) => (k > 1 ? `${t} (×${String(k)})` : t)).join(" ; ");
}

/** Au nouvel an : la chronique de l'année écoulée, un titre et quelques phrases. */
export function ecrireChronique(monde: MondeConteur, etat: EtatConteur): void {
  const annee = etat.anneeEnCours;
  const delta: Record<string, number> = {};
  for (const t of COMPTES) delta[t] = monde.compter(t) - (etat.repere[t] ?? 0);
  const n = (t: string): number => delta[t] ?? 0;
  const vivants = monde.personnages.filter((p) => p.vivant).length;
  const actes = etat.actes.filter((a) => a.jour >= (annee - 1) * monde.config.vie.joursParAnnee);
  const crises = actes.filter((a) => !a.bienfait);
  const bienfaits = actes.filter((a) => a.bienfait);
  // Le titre : ce qui a le plus marqué l'année.
  const titre =
    n("deces") >= Math.max(3, n("naissance") * 2)
      ? "l'année du deuil"
      : n("naissance") >= 3 && n("naissance") > n("deces")
        ? "l'année des berceaux"
        : n("raid:approche") > 0
          ? "l'année des bandes"
          : n("combat") > 0
            ? "l'année des loups"
            : n("epidemie") > 0
              ? "l'année de la toux"
              : n("invention") > 0
                ? "l'année des idées"
                : n("village") > 0
                  ? "l'année du départ"
                  : n("legende:legende") > 0
                    ? "l'année des récits"
                    : n("divin") >= 4
                      ? "l'année des miracles"
                      : "une année tranquille";
  const phrases: string[] = [];
  phrases.push(
    `An ${String(annee)}, ${titre}. Le village compte ${String(vivants)} âme${vivants > 1 ? "s" : ""}${n("naissance") > 0 ? `, ${String(n("naissance"))} naissance${n("naissance") > 1 ? "s" : ""}` : ""}${n("deces") > 0 ? ` et ${String(n("deces"))} mort${n("deces") > 1 ? "s" : ""}` : ", et personne n'est mort"}.`,
  );
  if (n("union") > 0 || n("batiment_termine") > 0)
    phrases.push(
      `${n("union") > 0 ? `${String(n("union"))} union${n("union") > 1 ? "s" : ""} célébrée${n("union") > 1 ? "s" : ""}` : "Aucune union"}${n("batiment_termine") > 0 ? `, ${String(n("batiment_termine"))} bâtiment${n("batiment_termine") > 1 ? "s" : ""} achevé${n("batiment_termine") > 1 ? "s" : ""}` : ""}.`,
    );
  const legendes = n("legende:legende");
  if (n("invention") > 0 || legendes > 0)
    phrases.push(
      `${n("invention") > 0 ? `${String(n("invention"))} invention${n("invention") > 1 ? "s" : ""}` : ""}${n("invention") > 0 && legendes > 0 ? " et " : ""}${legendes > 0 ? `${String(legendes)} légende${legendes > 1 ? "s" : ""} née${legendes > 1 ? "s" : ""} aux veillées` : ""}.`,
    );
  if (crises.length > 0) phrases.push(`Épreuves : ${enumerer(crises)}.`);
  if (bienfaits.length > 0) phrases.push(`Bienfaits : ${enumerer(bienfaits)}.`);
  if (n("divin") > 0) phrases.push(`Le ciel s'est manifesté ${String(n("divin"))} fois.`);
  const texte = phrases.join(" ");
  etat.chroniques.push({ annee, titre, texte, tick: monde.horloge.tick });
  if (etat.chroniques.length > MAX_CHRONIQUES)
    etat.chroniques.splice(0, etat.chroniques.length - MAX_CHRONIQUES);
  for (const t of COMPTES) etat.repere[t] = monde.compter(t);
  etat.anneeEnCours = monde.horloge.moment().annee;
  monde.emettre("conteur", null, { genre: "chronique", annee, titre, texte }, 9);
}
