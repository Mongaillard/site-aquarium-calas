/**
 * Dialogues à gabarits (section 9.1, mode règles). Un seul « appel » compose
 * de 2 à 6 répliques et une liste d'effets que l'exécuteur applique.
 * Le cerveau LLM (M5) remplacera `composerDialogue` par un appel modèle qui
 * renvoie la même structure.
 */
import { possede } from "../agents/inventaire.js";
import { INVENTIONS, LECONS, estLecon } from "../savoirs/catalogue.js";
import type { Savoir } from "../savoirs/catalogue.js";
import { NOURRITURE, nourritureDisponible, quantite } from "../agents/inventaire.js";
import { relationAvec } from "../agents/personnage.js";
import type { LieuConnu, Personnage } from "../agents/personnage.js";
import { abriDisponible, batimentsAccessibles, dormeurs } from "../monde.js";
import type { Monde } from "../monde.js";
import { PLANS_BATIMENT } from "../monde/batiments.js";
import { Grille } from "../monde/grille.js";
import type { Position } from "../monde/grille.js";
import type { Ressource } from "../monde/ressources.js";
import { compatibilite, tutoie } from "./relations.js";

export interface Replique {
  readonly locuteur: string;
  readonly texte: string;
}

export type EffetDialogue =
  | {
      readonly type: "information";
      readonly de: string;
      readonly vers: string;
      readonly lieu: LieuConnu;
    }
  | {
      readonly type: "relation";
      readonly de: string;
      readonly vers: string;
      readonly affinite: number;
      readonly confiance: number;
    }
  | {
      readonly type: "invitation";
      readonly de: string;
      readonly vers: string;
      readonly batimentId: string;
    }
  | {
      readonly type: "don";
      readonly de: string;
      readonly vers: string;
      readonly ressource: Ressource;
      readonly quantite: number;
    }
  | {
      readonly type: "savoir";
      readonly de: string;
      readonly vers: string;
      readonly savoir: Savoir;
      readonly origine: string | null;
    }
  | {
      readonly type: "jeu";
      readonly de: string;
      readonly vers: string;
      readonly jeu: "osselets" | "flute";
    };

export type SujetDialogue =
  "salutations" | "nouvelles" | "invitation" | "dispute" | "entraide" | "savoir" | "jeu";

export interface Dialogue {
  readonly sujet: SujetDialogue;
  readonly repliques: readonly Replique[];
  readonly effets: readonly EffetDialogue[];
}

const NOMS_LIEUX: Partial<Record<Ressource, string>> = {
  baies: "des baies",
  eau: "de l'eau",
  bois: "du bois",
  pierre: "de la pierre",
  fibres: "des fibres",
  poisson: "du poisson",
  gibier: "du gibier",
  argile: "de l'argile",
};

/** Direction cardinale approximative de `de` vers `vers`. */
export function directionVers(de: Position, vers: Position): string {
  const dx = vers.x - de.x;
  const dy = vers.y - de.y;
  if (dx === 0 && dy === 0) return "ici même";
  const ns = Math.abs(dy) >= Math.abs(dx) / 2 ? (dy < 0 ? "nord" : "sud") : "";
  const eo = Math.abs(dx) >= Math.abs(dy) / 2 ? (dx < 0 ? "ouest" : "est") : "";
  if (ns === "") return `à l'${eo}`;
  return `au ${ns}${eo ? `-${eo}` : ""}`;
}

/** Lieux utiles que `de` connaît et que `vers` ignore, les plus proches de `vers` d'abord. */
export function lieuxAPartager(de: Personnage, vers: Personnage, max: number): LieuConnu[] {
  const utiles: LieuConnu[] = [];
  for (const [cle, lieu] of de.connaissance) {
    if (vers.connaissance.has(cle)) continue;
    if (NOMS_LIEUX[lieu.type] === undefined || lieu.quantiteVue < 1) continue;
    if (lieu.type === "eau" && [...vers.connaissance.values()].some((l) => l.type === "eau"))
      continue;
    utiles.push(lieu);
  }
  const pos = vers.corps.position;
  utiles.sort(
    (a, b) => Grille.distance(pos, a) - Grille.distance(pos, b) || a.y - b.y || a.x - b.x,
  );
  // Une seule information par type de ressource.
  const vus = new Set<Ressource>();
  return utiles.filter((l) => (vus.has(l.type) ? false : (vus.add(l.type), true))).slice(0, max);
}

function salutation(b: Personnage, tu: boolean, estNuit: boolean): string {
  const moment = estNuit ? "Bonsoir" : "Bonjour";
  return tu
    ? `${moment} ${b.identite.prenom}, comment vas-tu ?`
    : `${moment} ${b.identite.prenom}, comment allez-vous ?`;
}

function reponseSalutation(b: Personnage, tu: boolean): string {
  const f = b.besoins.faim < 30;
  const fatigue = b.besoins.sommeil < 30;
  if (f)
    return tu ? "J'ai l'estomac vide, à vrai dire." : "J'ai le ventre vide, pour être honnête.";
  if (fatigue) return tu ? "Épuisé, je tiens à peine debout." : "Épuisé, je tiens à peine debout.";
  const humeur = b.besoins.moral;
  if (humeur > 70) return tu ? "Très bien, et toi ?" : "Très bien, et vous ?";
  if (humeur < 40) return tu ? "Ça pourrait aller mieux." : "Les temps sont durs, vous savez.";
  return tu ? "Ça va, on fait aller." : "Ça va, on fait aller.";
}

function phraseInformation(vers: Personnage, lieu: LieuConnu, tu: boolean): string {
  const distance = Grille.distance(vers.corps.position, lieu);
  const nom = NOMS_LIEUX[lieu.type] ?? lieu.type;
  const ou = directionVers(vers.corps.position, lieu);
  const pas = distance <= 1 ? "juste là" : `à ${distance} pas ${ou}`;
  return tu ? `Tu sais qu'il y a ${nom} ${pas} ?` : `Savez-vous qu'il y a ${nom} ${pas} ?`;
}

/** Compose le dialogue entre `a` (qui parle) et `b`. Déterministe (rng de `a`). */
export function composerDialogue(monde: Monde, a: Personnage, b: Personnage): Dialogue {
  const ra = relationAvec(a, b.id);
  const rb = relationAvec(b, a.id);
  const famille = a.identite.nomFamille === b.identite.nomFamille;
  const tu = famille || tutoie(ra) || !monde.config.social.vouvoiementInconnus;
  const estNuit = monde.horloge.moment().estNuit;
  const compat = compatibilite(a.identite.personnalite, b.identite.personnalite);
  const repliques: Replique[] = [];
  const effets: EffetDialogue[] = [];
  const dire = (qui: Personnage, texte: string): void => {
    repliques.push({ locuteur: qui.id, texte });
  };

  dire(a, salutation(b, tu, estNuit));
  dire(b, reponseSalutation(b, tu));

  // Dispute : mésentente installée ou personnalités incompatibles et à vif.
  const aVif = a.identite.personnalite.nevrosisme > 0.6 && compat < -0.3;
  if (!famille && (ra.affinite <= -15 || rb.affinite <= -15 || (aVif && a.rng.chance(0.5)))) {
    dire(
      a,
      tu
        ? "Tu ne changes pas, toujours à traîner par ici."
        : "Vous ne changez pas, toujours à rôder par ici.",
    );
    dire(b, tu ? "Garde tes remarques pour toi." : "Gardez vos remarques pour vous.");
    effets.push({ type: "relation", de: a.id, vers: b.id, affinite: -8, confiance: -4 });
    effets.push({ type: "relation", de: b.id, vers: a.id, affinite: -8, confiance: -4 });
    return { sujet: "dispute", repliques, effets };
  }

  let sujet: SujetDialogue = "salutations";

  // Entraide : l'un a faim, l'autre a des vivres à partager.
  const affame = b.besoins.faim < 35;
  const nourriture = nourritureDisponible(a.corps.inventaire);
  const genereux = a.identite.personnalite.agreabilite > 0.45 || famille || ra.affinite >= 30;
  if (affame && nourriture !== null && quantite(a.corps.inventaire, nourriture) >= 2 && genereux) {
    const nom =
      NOMS_LIEUX[nourriture] ??
      (NOURRITURE[nourriture] !== undefined ? "de quoi manger" : nourriture);
    dire(a, tu ? `Tiens, prends ${nom}, j'en ai assez.` : `Tenez, prenez ${nom}, j'en ai assez.`);
    dire(b, tu ? "Merci, je te revaudrai ça." : "Merci, je vous revaudrai ça.");
    effets.push({ type: "don", de: a.id, vers: b.id, ressource: nourriture, quantite: 1 });
    sujet = "entraide";
  }

  // Savoirs : une leçon ou une invention que l'un connaît et pas l'autre (prioritaire).
  const savoirAB = savoirAPartager(a, b);
  const savoirBA = savoirAB === null ? savoirAPartager(b, a) : null;
  const transmission =
    savoirAB !== null
      ? { de: a, vers: b, s: savoirAB }
      : savoirBA !== null
        ? { de: b, vers: a, s: savoirBA }
        : null;

  // Nouvelles : échange de lieux utiles dans les deux sens (moins quand on a un savoir à dire).
  const maxLieux = transmission === null ? 2 : 1;
  const deAversB = lieuxAPartager(a, b, maxLieux);
  const deBversA = lieuxAPartager(b, a, maxLieux);
  for (const lieu of deAversB) {
    dire(a, phraseInformation(b, lieu, tu));
    effets.push({ type: "information", de: a.id, vers: b.id, lieu });
  }
  for (const lieu of deBversA) {
    dire(b, phraseInformation(a, lieu, tu));
    effets.push({ type: "information", de: b.id, vers: a.id, lieu });
  }
  if (deAversB.length + deBversA.length > 0) {
    dire(deBversA.length > 0 ? a : b, tu ? "Bon à savoir, merci." : "Bon à savoir, merci.");
    if (sujet === "salutations") sujet = "nouvelles";
  }

  if (transmission !== null) {
    const { de, vers, s } = transmission;
    dire(de, phraseSavoir(s.savoir, s.origine, tu));
    dire(vers, tu ? "Je m'en souviendrai." : "Je m'en souviendrai.");
    effets.push({ type: "savoir", de: de.id, vers: vers.id, savoir: s.savoir, origine: s.origine });
    sujet = "savoir";
  }

  // Jeu : une partie d'osselets remonte le moral.
  if (
    (possede(a.corps.inventaire, "osselets") || possede(b.corps.inventaire, "osselets")) &&
    (a.besoins.moral < 85 || b.besoins.moral < 85 || a.besoins.social < 70) &&
    !estNuit
  ) {
    const joueur = possede(a.corps.inventaire, "osselets") ? a : b;
    const autre = joueur === a ? b : a;
    dire(joueur, tu ? "On fait une partie d'osselets ?" : "Une partie d'osselets, ça vous dit ?");
    dire(autre, tu ? "Volontiers, ça change les idées." : "Volontiers, ça change les idées.");
    effets.push({ type: "jeu", de: joueur.id, vers: autre.id, jeu: "osselets" });
    sujet = "jeu";
  } else if (
    (possede(a.corps.inventaire, "flute") || possede(b.corps.inventaire, "flute")) &&
    (a.besoins.moral < 85 || b.besoins.moral < 85 || a.besoins.social < 70 || b.besoins.social < 70)
  ) {
    const musicien = possede(a.corps.inventaire, "flute") ? a : b;
    const autre = musicien === a ? b : a;
    dire(musicien, tu ? "Écoute, j'ai appris un air." : "Écoutez, j'ai appris un air.");
    dire(autre, tu ? "C'est beau. Rejoue-le." : "C'est beau. Rejouez-le.");
    effets.push({ type: "jeu", de: musicien.id, vers: autre.id, jeu: "flute" });
    sujet = "jeu";
  }

  // Invitation : confiance suffisante et l'autre n'a pas d'abri.
  if (ra.confiance >= 60 && ra.affinite >= 40 && abriDisponible(monde, b) === null) {
    const abri = batimentsAccessibles(monde, a).find(
      (x) =>
        x.etat === "termine" &&
        PLANS_BATIMENT[x.type].abri &&
        !x.autorises.includes(b.id) &&
        dormeurs(monde, x) < PLANS_BATIMENT[x.type].capaciteDormeurs,
    );
    if (abri !== undefined) {
      dire(
        a,
        tu
          ? "Si tu n'as nulle part où dormir, viens chez nous."
          : "Si vous n'avez nulle part où dormir, venez chez nous.",
      );
      dire(b, tu ? "C'est généreux, merci." : "C'est très généreux, merci.");
      effets.push({ type: "invitation", de: a.id, vers: b.id, batimentId: abri.id });
      sujet = "invitation";
    }
  }

  // Une conversation cordiale rapproche, davantage entre personnes compatibles.
  const bonus = compat > 0 ? 2 : 0;
  effets.push({
    type: "relation",
    de: a.id,
    vers: b.id,
    affinite: 4 + bonus,
    confiance: 2 + (sujet === "nouvelles" ? 1 : 0),
  });
  effets.push({
    type: "relation",
    de: b.id,
    vers: a.id,
    affinite: 4 + bonus,
    confiance: 2 + (sujet === "entraide" ? 3 : 0),
  });

  // Bornes : 2 à 6 répliques.
  return { sujet, repliques: repliques.slice(0, 8), effets };
}

/** Un savoir que `de` connaît bien et que `vers` ignore encore, s'il y en a un. */
function savoirAPartager(
  de: Personnage,
  vers: Personnage,
): { savoir: Savoir; origine: string | null } | null {
  for (const [savoir, acquis] of de.savoirs) {
    if (acquis.force < 1) continue;
    if ((vers.savoirs.get(savoir)?.force ?? 0) >= 1) continue;
    return { savoir, origine: acquis.origine };
  }
  return null;
}

function phraseSavoir(savoir: Savoir, origine: string | null, tu: boolean): string {
  if (estLecon(savoir)) {
    const morale = LECONS[savoir].morale;
    return origine !== null
      ? `Depuis la mort de ${origine}, on le sait : ${morale.charAt(0).toLowerCase()}${morale.slice(1)}`
      : morale;
  }
  const c = INVENTIONS[savoir].confidence;
  return tu ? `Tu sais quoi ? ${c}` : `Vous savez quoi ? ${c}`;
}

/** Texte compact d'un dialogue pour le journal. */
export function transcrire(d: Dialogue, prenom: (id: string) => string): string {
  return d.repliques.map((r) => `${prenom(r.locuteur)} : ${r.texte}`).join(" / ");
}
