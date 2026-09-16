/**
 * La mémoire collective (jalon 14) : les récits que le village se raconte aux
 * veillées et qui s'embellissent jusqu'à devenir des légendes ; les noms de
 * lieux (« la crique de Timéo ») qui remplacent « à douze pas au nord » ; les
 * proverbes nés des coutumes, repris dans les dialogues. Rien de tout cela ne
 * touche aux faits du journal : seule la mémoire déforme.
 */
import type { Personnage } from "../agents/personnage.js";
import type { Evenement } from "../evenements/journal.js";
import { Grille } from "../monde/grille.js";
import type { Position } from "../monde/grille.js";
import type { Monde } from "../monde.js";
import { LECONS } from "../savoirs/catalogue.js";
import type { Lecon } from "../savoirs/catalogue.js";
import type { Rng } from "../rng.js";

// ------------------------------------------------------------------ état

export interface Recit {
  readonly id: string;
  readonly tick: number;
  readonly genre: string;
  /** Le texte tel qu'on le raconte aujourd'hui (il change). */
  texte: string;
  /** Le texte d'origine, celui des faits. */
  readonly origine: string;
  readonly sujets: readonly string[];
  /** Fois raconté, embellissements subis, devenu légende. */
  fois: number;
  embellissements: number;
  legende: boolean;
  readonly position: Position | null;
}

export interface LieuNomme {
  readonly x: number;
  readonly y: number;
  readonly nom: string;
  readonly depuis: number;
  readonly origine: string;
}

export interface Proverbe {
  readonly lecon: Lecon;
  readonly texte: string;
  readonly depuis: number;
}

export interface EtatChronique {
  recits: Recit[];
  lieuxNommes: LieuNomme[];
  proverbes: Proverbe[];
  compteurRecits: number;
}

export function etatChroniqueInitial(): EtatChronique {
  return { recits: [], lieuxNommes: [], proverbes: [], compteurRecits: 0 };
}

export interface MondeChronique extends Monde {
  readonly chronique: EtatChronique;
}

export const RECITS_MAX = 40;
export const LIEUX_NOMMES_MAX = 12;
/** Un récit devient légende à partir de tant de fois raconté. */
export const FOIS_LEGENDE = 3;

// ----------------------------------------------------------- proverbes

export const PROVERBES: Readonly<Record<Lecon, string>> = {
  provisions_hiver: "Qui n'a rien rangé à l'automne mange la neige.",
  rentrer_quand_on_gele: "Le feu attend, le froid n'attend pas.",
  enfants_dabord: "Le petit mange, le grand attend.",
  partager_en_hiver: "Ventre plein à côté d'un ventre vide, c'est deux morts.",
  puits_pres_du_village: "Le puits vaut mieux que la rivière lointaine.",
  vetements_chauds: "Le cuir sur le dos, l'hiver dehors.",
  soigner_les_blesses: "Une plaie qu'on bande est une vie qu'on garde.",
  accoucheuse: "Nulle ne met au monde seule.",
  murs_contre_les_loups: "Les pieux dorment pour nous.",
  veilleur_de_nuit: "Un œil ouvert, tous les autres fermés.",
  le_ciel_ecoute: "Le ciel entend qui parle bas.",
  le_ciel_frappe: "On ne tourne pas le dos au ciel.",
  ne_pas_attendre_le_ciel: "Le ciel aide qui s'est levé.",
};

/** Une coutume engendre un proverbe, repris dans les dialogues. */
export function proverbeDeCoutume(monde: MondeChronique, lecon: Lecon): void {
  const c = monde.chronique;
  if (c.proverbes.some((p) => p.lecon === lecon)) return;
  c.proverbes.push({ lecon, texte: PROVERBES[lecon], depuis: monde.horloge.tick });
  monde.emettre(
    "legende",
    null,
    { genre: "proverbe", lecon, texte: PROVERBES[lecon], titre: LECONS[lecon].titre },
    5,
  );
}

/** Un proverbe au hasard, pour un dialogue (null s'il n'y en a pas). */
export function proverbeAuHasard(monde: MondeChronique, rng: Rng): string | null {
  const l = monde.chronique.proverbes;
  if (l.length === 0) return null;
  return l[Math.floor(rng.suivant() * l.length)]?.texte ?? null;
}

// ------------------------------------------------------------- récits

const GENRES_RECIT = new Set([
  "deces",
  "combat",
  "divin",
  "invention",
  "justice",
  "epidemie",
  "chasse",
  "naissance",
  "alliance",
  "gravure",
]);

/** Ce qu'on retient d'un événement, pour le raconter plus tard. */
function texteDuRecit(monde: Monde, e: Evenement): string | null {
  const prenom = (id: string): string =>
    monde.personnages.find((p) => p.id === id)?.identite.prenom ?? id;
  const d = e.details;
  const qui = e.acteur === null ? "quelqu'un" : prenom(e.acteur);
  switch (e.type) {
    case "deces":
      return d.cause === "vieillesse"
        ? null
        : `${qui} est mort${monde.personnages.find((p) => p.id === e.acteur)?.identite.sexe === "F" ? "e" : ""} de ${String(d.cause)}, à ${String(Math.floor(Number(d.ageJours ?? 0) / monde.config.vie.joursParAnnee))} ans.`;
    case "combat":
      return d.issue === "mort"
        ? `Les loups ont emporté ${qui} : ${String(d.loups)} bêtes contre ${String(d.defenseurs)} des nôtres.`
        : d.issue === "fuite"
          ? `${qui} a échappé à ${String(d.loups)} loups.`
          : `${qui} a repoussé ${String(d.loups)} loups${Number(d.loupsTues ?? 0) > 0 ? ` et en a tué ${String(d.loupsTues)}` : ""}.`;
    case "divin":
      return `Le ciel a envoyé ${String(d.nom)} : ${String(d.effet)}`;
    case "invention":
      return `${qui} a réussi le premier ${String(d.nom)} du village.`;
    case "justice":
      return d.genre === "exil"
        ? `Le village a banni ${qui} pour ${String(d.jours)} jours.`
        : d.genre === "prix_du_sang"
          ? `${qui} a payé le prix du sang aux ${String(d.famille)}.`
          : null;
    case "epidemie":
      return `Une toux grise est venue d'ailleurs et a commencé par ${qui}.`;
    case "chasse":
      return d.reussie === true && Number(d.betes ?? 0) >= 2
        ? `${qui} a rapporté ${String(d.betes)} ${String(d.nom)}s d'une seule chasse.`
        : null;
    case "naissance":
      return null;
    case "alliance":
      return d.nouvelle === true
        ? `Le mariage de ${qui} a allié les ${String(d.familles).replace("|", " et les ")}.`
        : null;
    case "gravure":
      return `${qui} a gravé une pierre : ${String(d.inscription)}`;
    default:
      return null;
  }
}

/** Un événement marquant devient un récit que le village pourra raconter. */
export function observerChronique(monde: MondeChronique, e: Evenement): void {
  if (!GENRES_RECIT.has(e.type) || e.importance < 6) return;
  const texte = texteDuRecit(monde, e);
  if (texte === null) return;
  const c = monde.chronique;
  c.compteurRecits += 1;
  c.recits.push({
    id: `recit-${String(c.compteurRecits)}`,
    tick: e.tick,
    genre: e.type,
    texte,
    origine: texte,
    sujets: e.acteur === null ? [] : [e.acteur],
    fois: 0,
    embellissements: 0,
    legende: false,
    position: e.position === null ? null : { ...e.position },
  });
  if (c.recits.length > RECITS_MAX) {
    // On oublie d'abord les récits jamais racontés, les plus anciens.
    const i = c.recits.findIndex((r) => r.fois === 0 && !r.legende);
    c.recits.splice(i >= 0 ? i : 0, 1);
  }
  nommerLeLieu(monde, e);
}

const EPITHETES = [
  "— on s'en souvient encore —",
  "— et ce jour-là, le ciel était noir —",
  "— tout le village en tremble encore —",
  "— du jamais vu depuis les fondateurs —",
] as const;

/** Raconter grossit les nombres et ajoute une épithète ; trois fois racontée, l'histoire est une légende. */
export function embellir(recit: Recit, rng: Rng): void {
  recit.embellissements += 1;
  recit.texte = recit.texte.replace(/\b(\d+)\b/g, (m) => {
    const n = Number.parseInt(m, 10);
    return Number.isFinite(n) && n > 0 && n < 500 ? String(n + Math.max(1, Math.ceil(n * 0.5))) : m;
  });
  // Deux épithètes au plus : au-delà, l'histoire ne grandit plus que par ses nombres.
  if (recit.embellissements <= 2) {
    const ep = EPITHETES[Math.floor(rng.suivant() * EPITHETES.length)] ?? EPITHETES[0];
    if (!recit.texte.includes(ep)) recit.texte = recit.texte.replace(/[.!]$/, ` ${ep}.`);
  }
}

/**
 * À la veillée, quelqu'un raconte : un récit choisi parmi les plus marquants
 * et les moins usés. Les auditeurs s'en souviennent ; à la troisième fois,
 * c'est une légende, et les enfants l'apprendront comme telle.
 */
export function raconter(
  monde: MondeChronique,
  participants: readonly Personnage[],
  rng: Rng,
): Recit | null {
  const c = monde.chronique;
  if (c.recits.length === 0 || participants.length === 0) return null;
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  // Les récits neufs et marquants d'abord ; une histoire déjà bien racontée laisse la place.
  const poids = c.recits.map((r) => {
    const age = (tick - r.tick) / T;
    return Math.max(0.05, 2 + (r.legende ? 0.3 : 0) - r.fois * 0.6 + Math.min(1, age / 60));
  });
  const recit = rng.choisirPondere(c.recits, poids);
  const conteur = rng.choisir(participants);
  recit.fois += 1;
  if (recit.fois >= 2) embellir(recit, rng);
  const devientLegende = !recit.legende && recit.fois >= FOIS_LEGENDE;
  if (devientLegende) recit.legende = true;
  for (const p of participants) {
    if (p.id === conteur.id) continue;
    const jeune = p.corps.stade === "enfant" || p.corps.stade === "adolescent";
    p.memoire.ajouter(
      tick,
      "dialogue",
      `${conteur.identite.prenom} a raconté à la veillée : ${recit.texte}`,
      jeune ? 5 : 3,
      [conteur.id, ...recit.sujets],
      recit.position,
    );
  }
  monde.emettre(
    "legende",
    conteur,
    {
      genre: devientLegende ? "legende" : "recit",
      recit: recit.id,
      texte: recit.texte,
      fois: recit.fois,
      auditeurs: participants.length - 1,
    },
    devientLegende ? 7 : 3,
    recit.position,
  );
  return recit;
}

// ------------------------------------------------------- noms de lieux

const NOMS_BIOME: Readonly<Record<string, string>> = {
  foret: "le bois",
  prairie: "le pré",
  colline: "la butte",
  montagne: "le rocher",
  marais: "le marais",
  plage: "la grève",
  eau_peu_profonde: "la crique",
  eau_profonde: "le large",
  gue: "le gué",
};

function lieuDejaNomme(c: EtatChronique, pos: Position): boolean {
  return c.lieuxNommes.some((l) => Grille.distance(l, pos) <= 5);
}

function nommer(monde: MondeChronique, pos: Position, nom: string, origine: string): void {
  const c = monde.chronique;
  if (c.lieuxNommes.length >= LIEUX_NOMMES_MAX || lieuDejaNomme(c, pos)) return;
  c.lieuxNommes.push({ x: pos.x, y: pos.y, nom, depuis: monde.horloge.tick, origine });
  monde.emettre("legende", null, { genre: "lieu", nom, x: pos.x, y: pos.y, origine }, 5, pos);
}

/** Les lieux prennent le nom de ce qui s'y est passé. */
function nommerLeLieu(monde: MondeChronique, e: Evenement): void {
  if (e.position === null || e.acteur === null) return;
  const p = monde.personnages.find((x) => x.id === e.acteur);
  if (p === undefined) return;
  const prenom = p.identite.prenom;
  const biome = monde.grille.tuileOuNull(e.position.x, e.position.y)?.biome ?? "prairie";
  const base = NOMS_BIOME[biome] ?? "le lieu";
  switch (e.type) {
    case "deces":
      if (e.details.cause !== "vieillesse")
        nommer(
          monde,
          e.position,
          `${base} de ${prenom}`,
          `${prenom} y est mort${p.identite.sexe === "F" ? "e" : ""}`,
        );
      break;
    case "combat":
      nommer(monde, e.position, "le pré des loups", `${prenom} y a affronté les loups`);
      break;
    case "divin":
      nommer(
        monde,
        e.position,
        `la clairière du miracle`,
        `le ciel y a envoyé ${String(e.details.nom)}`,
      );
      break;
    case "chasse":
      if (e.details.reussie === true && Number(e.details.betes ?? 0) >= 2)
        nommer(
          monde,
          e.position,
          `${base} des ${String(e.details.nom)}s`,
          `${prenom} y a fait sa grande chasse`,
        );
      break;
    default:
      break;
  }
}

/** Le premier à pêcher loin du village donne son nom à la crique. */
export function nommerLaPeche(monde: MondeChronique, p: Personnage, pos: Position): void {
  const c = monde.chronique;
  if (c.lieuxNommes.length >= LIEUX_NOMMES_MAX || lieuDejaNomme(c, pos)) return;
  // Loin des abris : à plus de dix tuiles de tout bâtiment terminé.
  for (const b of monde.batiments.values())
    if (b.etat === "termine" && Grille.distance(b.position, pos) <= 10) return;
  if (c.lieuxNommes.some((l) => l.origine.startsWith(`${p.identite.prenom} y a`))) return;
  // Trois criques au plus : au-delà, les pêcheurs ne baptisent plus rien.
  if (c.lieuxNommes.filter((l) => l.nom.startsWith("la crique")).length >= 3) return;
  nommer(
    monde,
    pos,
    `la crique de ${p.identite.prenom}`,
    `${p.identite.prenom} y a pêché le premier`,
  );
}

/** Le nom du lieu à moins de quatre tuiles, s'il y en a un. */
export function nomDuLieu(monde: MondeChronique, pos: Position): string | null {
  let meilleur: LieuNomme | null = null;
  let d = 4;
  for (const l of monde.chronique.lieuxNommes) {
    const dist = Grille.distance(l, pos);
    if (dist < d) {
      d = dist;
      meilleur = l;
    }
  }
  return meilleur?.nom ?? null;
}

/** Les légendes, les plus racontées d'abord. */
export function legendes(monde: MondeChronique): Recit[] {
  return monde.chronique.recits
    .filter((r) => r.legende)
    .sort((a, b) => b.fois - a.fois || a.tick - b.tick);
}
