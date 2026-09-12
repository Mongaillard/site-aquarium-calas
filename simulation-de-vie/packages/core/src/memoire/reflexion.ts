/**
 * Réflexion du soir (section 5.4) en mode règles : synthèse de la journée en
 * quelques constats qui deviennent des souvenirs importants et orientent les
 * décisions des jours suivants. Le cerveau LLM (M5) produira des réflexions
 * plus riches avec la même interface.
 */
import { relationAvec } from "../agents/personnage.js";
import type { Personnage } from "../agents/personnage.js";
import { abriDisponible } from "../monde.js";
import type { Monde } from "../monde.js";

export interface Reflexion {
  readonly cle: string;
  readonly texte: string;
  readonly importance: number;
  readonly sujets: readonly string[];
}

/** Calcule les réflexions du jour et applique leurs effets (drapeaux, confiance). */
export function reflechir(monde: Monde, p: Personnage): Reflexion[] {
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  const jour = monde.horloge.moment().jourAbsolu;
  const reflexions: Reflexion[] = [];
  const faites = p.drapeaux.reflexionsFaites;
  const proposer = (r: Reflexion): void => {
    if (faites.has(r.cle)) return;
    faites.add(r.cle);
    reflexions.push(r);
  };

  // 1. Confiance envers les proches avec qui les échanges sont bons.
  for (const rel of p.relations.values()) {
    const autre = monde.personnages.find((a) => a.id === rel.cible);
    if (!autre?.vivant) continue;
    if (rel.interactions >= 3 && rel.affinite >= 50 && rel.derniereInteraction >= tick - 7 * T) {
      const cle = `confiance:${rel.cible}:${Math.floor(jour / 10)}`;
      if (faites.has(cle)) continue;
      rel.confiance = Math.min(100, rel.confiance + 5);
      proposer({
        cle,
        texte: `Je remarque que ${autre.identite.prenom} est toujours de bonne compagnie ; je peux compter sur ${autre.identite.sexe === "F" ? "elle" : "lui"}.`,
        importance: 6,
        sujets: [rel.cible],
      });
    }
  }

  // 2. Rareté : plusieurs gisements distincts épuisés dans la journée.
  const souvenirsDuJour = p.memoire.depuis(tick - T);
  const epuises = new Set(
    souvenirsDuJour
      .filter((s) => s.texte.includes("épuisé") && s.position !== null)
      .map((s) => `${s.position?.x ?? 0},${s.position?.y ?? 0}`),
  ).size;
  if (epuises >= 4) {
    p.drapeaux.explorerPlusLoinJusqua = tick + 2 * T;
    proposer({
      cle: `rarete:${Math.floor(jour / 5)}`,
      texte: "Les ressources se font rares par ici, il faudra chercher plus loin.",
      importance: 5,
      sujets: [],
    });
  }

  // 3. Faim vécue : faire des réserves.
  if (p.drapeaux.faimMinDuJour < 20) {
    p.drapeaux.prudenceNourritureJusqua = tick + 3 * T;
    proposer({
      cle: `faim:${jour}`,
      texte: "J'ai eu faim aujourd'hui ; je dois faire des réserves avant que cela ne recommence.",
      importance: 6,
      sujets: [],
    });
  }

  // 4. Froid subi sans abri : trouver un toit.
  if (p.drapeaux.chaleurMinDuJour < 40 && abriDisponible(monde, p) === null) {
    p.drapeaux.chercheAbriJusqua = tick + 3 * T;
    proposer({
      cle: `froid:${jour}`,
      texte: "J'ai eu froid ; il me faut un abri, et vite.",
      importance: 6,
      sujets: [],
    });
  }

  // 5. Dette morale : quelqu'un m'a aidé aujourd'hui.
  for (const s of souvenirsDuJour) {
    if (s.type !== "action" || !s.texte.includes("m'a donné")) continue;
    const id = s.sujets[0];
    if (id === undefined) continue;
    const autre = monde.personnages.find((a) => a.id === id);
    if (!autre) continue;
    const rel = relationAvec(p, id);
    if (rel.dette >= 0) continue;
    proposer({
      cle: `dette:${id}:${jour}`,
      texte: `${autre.identite.prenom} m'a aidé quand j'en avais besoin ; je lui dois quelque chose.`,
      importance: 5,
      sujets: [id],
    });
  }

  return reflexions;
}
