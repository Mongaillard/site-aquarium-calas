/**
 * Directeur de danger (jalon « la nuit menace ») : un budget d'attaques par
 * saison, une menace à la fois, un préavis d'un jour (des traces), puis une
 * meute affamée qui vise, de nuit, l'isolé, l'enfant ou le dormeur à la
 * belle étoile ; jamais un groupe de trois, jamais à quatre tuiles d'un feu,
 * jamais à travers une palissade. Quand le gibier proche s'épuise, la chasse
 * attire de nouvelles meutes.
 */
import type { Monde } from "../monde.js";
import { feuProche } from "../monde.js";
import type { Personnage } from "../agents/personnage.js";
import type { Rng } from "../rng.js";
import { INFO_BIOME } from "./biomes.js";
import { PLANS_BATIMENT } from "./batiments.js";
import { PROFILS, FAIM_MEUTE, presDunFeu } from "./faune.js";
import type { Troupeau } from "./faune.js";
import { Grille } from "./grille.js";
import type { Position } from "./grille.js";
import { rayonVision } from "../cerveau/perception.js";

export const ATTAQUES_PAR_SAISON = 1;
/** Préavis minimal entre les traces et la première nuit d'attaque, en ticks (une demi-journée) ; l'attaque attend le crépuscule suivant. */
export const PREAVIS_TICKS = 72;
/** Distance à laquelle une meute menaçante rôde autour du village le jour. */
export const RAYON_RODE = 12;

/** Premier crépuscule (21 h) au moins `delai` ticks après `tick`. */
export function prochainCrepuscule(tick: number, delai: number, ticksParJour: number): number {
  const crepuscule = Math.round((21 / 24) * ticksParJour);
  let t = tick + delai;
  const reste = ((t % ticksParJour) + ticksParJour) % ticksParJour;
  t += reste <= crepuscule ? crepuscule - reste : ticksParJour - reste + crepuscule;
  return t;
}
/** Rayon autour du village dans lequel une meute peut devenir une menace. */
export const RAYON_MENACE = 40;
/** Portée du cri d'alarme. */
export const RAYON_ALARME = 12;
/** Distance à laquelle une meute choisit sa proie humaine. */
export const RAYON_TRAQUE_HUMAIN = 24;
/** Rayon de la fouille pour savoir si une position est enclose. */
export const RAYON_ENCLOS = 6;
/** Les premiers jours, la colonie s'installe : aucune menace avant ce jour. */
export const JOURS_DE_GRACE = 30;

export interface Menace {
  readonly meute: string;
  readonly depuis: number;
  /** Tick à partir duquel la meute peut attaquer (la nuit venue). */
  readonly preavis: number;
  cible: string | null;
  alarmeDonnee: boolean;
  tracesVues: boolean;
}

export interface EtatDanger {
  menace: Menace | null;
  /** Menaces ouvertes cette saison (le budget). */
  attaquesSaison: number;
  saisonCle: string;
  /** Nombre total de combats (statistiques). */
  attaques: number;
  /** Pas de nouvelle menace avant ce tick (répit après une menace refermée). */
  repitJusqua: number;
  /** Fin des jours de grâce (tick) : la colonie s'installe d'abord. */
  graceJusqua: number;
}

/** Répit entre deux menaces, en ticks (deux jours). */
export const REPIT_TICKS = 288;

export function etatDangerInitial(ticksParJour = 144): EtatDanger {
  return {
    menace: null,
    attaquesSaison: 0,
    saisonCle: "",
    attaques: 0,
    repitJusqua: 0,
    graceJusqua: JOURS_DE_GRACE * ticksParJour,
  };
}

/** Centre du village : barycentre des abris et maisons terminés, sinon des vivants. */
export function centreVillage(monde: Monde): Position | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const b of monde.batiments.values()) {
    if (b.etat !== "termine" || !PLANS_BATIMENT[b.type].abri) continue;
    sx += b.position.x;
    sy += b.position.y;
    n += 1;
  }
  if (n === 0) {
    for (const p of monde.personnages) {
      if (!p.vivant) continue;
      sx += p.corps.position.x;
      sy += p.corps.position.y;
      n += 1;
    }
  }
  return n === 0 ? null : { x: Math.round(sx / n), y: Math.round(sy / n) };
}

/**
 * Une position est enclose si, de proche en proche sur les tuiles praticables
 * sans bâtiment, on ne peut pas s'en éloigner de six tuiles : palissades, murs
 * de maisons, eau et montagne ferment l'enceinte.
 */
export function enclos(monde: Monde, depart: Position): boolean {
  const vus = new Set<string>();
  const file: Position[] = [depart];
  vus.add(`${depart.x},${depart.y}`);
  while (file.length > 0) {
    const pos = file.pop();
    if (pos === undefined) break;
    if (Grille.distance(pos, depart) >= RAYON_ENCLOS) return false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = pos.x + dx;
        const y = pos.y + dy;
        const cle = `${x},${y}`;
        if (vus.has(cle)) continue;
        vus.add(cle);
        const t = monde.grille.tuileSiGeneree(x, y);
        if (t === null || !INFO_BIOME[t.biome].praticable) continue;
        if (t.batiment !== null && t.batiment.etat === "termine") continue;
        file.push({ x, y });
      }
    }
  }
  return true;
}

/**
 * Vulnérabilité d'une personne aux yeux d'une meute : l'enfant, l'isolé, le
 * dormeur dehors ; rien pour qui est en groupe, près d'un feu, à l'abri ou
 * derrière une enceinte.
 */
export function vulnerabilite(monde: Monde, p: Personnage, meute: Troupeau): number {
  if (!p.vivant) return 0;
  const pos = p.corps.position;
  const distance = Grille.distance(pos, meute.position);
  if (distance > RAYON_TRAQUE_HUMAIN) return 0;
  const tuile = monde.grille.tuileSiGeneree(pos.x, pos.y);
  if (
    tuile?.batiment !== null &&
    tuile?.batiment.etat === "termine" &&
    PLANS_BATIMENT[tuile.batiment.type].abri
  )
    return 0;
  if (presDunFeu(monde, pos)) return 0;
  let voisins = 0;
  for (const a of monde.personnages)
    if (a.vivant && a.id !== p.id && Grille.distance(a.corps.position, pos) <= 3) voisins += 1;
  if (voisins >= 2) return 0;
  if (enclos(monde, pos)) return 0;
  let score = 1;
  if (p.corps.stade === "enfant") score += 3;
  if (voisins === 0) score += 2;
  if (p.corps.endormi) score += 1;
  if (p.corps.etat.blessures.length > 0) score += 1;
  return score + Math.max(0, 1 - distance / RAYON_TRAQUE_HUMAIN);
}

export interface EffetDanger {
  readonly genre: "traces" | "menace" | "alarme" | "arrivee" | "fin";
  readonly meute: Troupeau;
  readonly personnage: Personnage | null;
}

/**
 * Une heure du directeur : ouvre une menace quand une meute affamée rôde près
 * du village (budget saisonnier), fait venir une meute quand le gibier proche
 * a disparu, désigne la proie la nuit venue, donne l'alarme quand quelqu'un
 * d'éveillé voit la meute, referme la menace à l'aube.
 */
export function heureDanger(
  monde: Monde,
  etat: EtatDanger,
  rng: Rng,
  creerMeute: (position: Position) => Troupeau,
): EffetDanger[] {
  const effets: EffetDanger[] = [];
  const moment = monde.horloge.moment();
  const tick = monde.horloge.tick;
  const cleSaison = `${String(moment.annee)}/${moment.saison}`;
  if (etat.saisonCle !== cleSaison) {
    etat.saisonCle = cleSaison;
    etat.attaquesSaison = 0;
  }
  const village = centreVillage(monde);
  if (village === null) return effets;

  if (etat.menace === null) {
    if (
      etat.attaquesSaison >= ATTAQUES_PAR_SAISON ||
      tick < etat.repitJusqua ||
      tick < etat.graceJusqua
    )
      return effets;
    // La chasse attire : sans gibier ni meute à portée, une meute finit par venir, la nuit.
    let meuteProche: Troupeau | null = null;
    let distanceMeute = Infinity;
    let gibierProche = false;
    for (const t of monde.troupeaux.values()) {
      if (t.taille <= 0) continue;
      const d = Grille.distance(t.position, village);
      if (PROFILS[t.espece].predateur) {
        if (d <= RAYON_MENACE && t.faim >= FAIM_MEUTE && t.taille >= 2 && d < distanceMeute) {
          distanceMeute = d;
          meuteProche = t;
        }
      } else if (d <= 30) {
        gibierProche = true;
      }
    }
    if (meuteProche === null && !gibierProche && moment.estNuit && rng.chance(0.01)) {
      const angle = rng.flottant(0, Math.PI * 2);
      const rayon = rng.entier(32, 40);
      const pos = {
        x: village.x + Math.round(Math.cos(angle) * rayon),
        y: village.y + Math.round(Math.sin(angle) * rayon),
      };
      const t = monde.grille.tuileSiGeneree(pos.x, pos.y);
      if (t !== null && INFO_BIOME[t.biome].praticable && t.batiment === null) {
        const meute = creerMeute(pos);
        meute.faim = FAIM_MEUTE + 2;
        effets.push({ genre: "arrivee", meute, personnage: null });
        meuteProche = meute;
      }
    }
    if (meuteProche !== null) {
      etat.attaquesSaison += 1;
      meuteProche.enMenace = true;
      etat.menace = {
        meute: meuteProche.id,
        depuis: tick,
        preavis: prochainCrepuscule(tick, PREAVIS_TICKS, monde.horloge.ticksParJour),
        cible: null,
        alarmeDonnee: false,
        tracesVues: false,
      };
      effets.push({ genre: "menace", meute: meuteProche, personnage: null });
    }
    return effets;
  }

  const menace = etat.menace;
  const meute = monde.troupeaux.get(menace.meute);
  if (meute === undefined || meute.taille <= 0 || meute.faim < 0) {
    // Meute disparue, ou qui a mangé entre-temps : la menace tombe.
    if (meute !== undefined) {
      meute.enMenace = false;
      meute.proieHumaine = null;
    }
    etat.menace = null;
    etat.repitJusqua = tick + REPIT_TICKS;
    return effets;
  }
  // Des traces : un humain éveillé passe à moins de quinze tuiles de la meute.
  if (!menace.tracesVues) {
    const temoin = monde.personnages.find(
      (p) =>
        p.vivant && !p.corps.endormi && Grille.distance(p.corps.position, meute.position) <= 15,
    );
    if (temoin !== undefined) {
      menace.tracesVues = true;
      effets.push({ genre: "traces", meute, personnage: temoin });
    }
  }
  // La nuit venue, après le préavis, la meute approche du village et choisit sa proie.
  if (tick >= menace.preavis && moment.estNuit) {
    const actuelle =
      menace.cible === null ? undefined : monde.personnages.find((p) => p.id === menace.cible);
    let cible: Personnage | null =
      actuelle !== undefined && vulnerabilite(monde, actuelle, meute) > 0 ? actuelle : null;
    if (cible === null) {
      let meilleur = 0;
      for (const p of monde.personnages) {
        const v = vulnerabilite(monde, p, meute);
        if (v > meilleur) {
          meilleur = v;
          cible = p;
        }
      }
    }
    if (cible !== null) {
      menace.cible = cible.id;
      meute.proieHumaine = cible.id;
      meute.cible = { ...cible.corps.position };
      meute.etat = "pature";
    } else {
      // Personne à portée : la meute rôde vers le village, en évitant les feux.
      menace.cible = null;
      meute.proieHumaine = null;
      meute.cible = Grille.distance(meute.position, village) > 6 ? { ...village } : null;
      meute.etat = "pature";
    }
    // L'alarme : quelqu'un d'éveillé voit la meute, à la portée de vue de la nuit (un veilleur au feu voit un peu plus loin).
    if (!menace.alarmeDonnee && meute.proieHumaine !== null) {
      const vue = rayonVision(monde, moment);
      const guetteur = monde.personnages.find(
        (p) =>
          p.vivant &&
          !p.corps.endormi &&
          Grille.distance(p.corps.position, meute.position) <=
            (p.actionEnCours?.type === "veiller" ? vue + 3 : vue),
      );
      if (guetteur !== undefined) {
        menace.alarmeDonnee = true;
        for (const p of monde.personnages) {
          if (
            p.vivant &&
            Grille.distance(p.corps.position, guetteur.corps.position) <= RAYON_ALARME
          )
            p.drapeaux.alerteJusqua = tick + 36;
        }
        effets.push({ genre: "alarme", meute, personnage: guetteur });
      }
    }
  } else if (tick < menace.preavis) {
    // Avant l'attaque, la meute rôde à une douzaine de tuiles du village.
    const d = Grille.distance(meute.position, village);
    if (d > RAYON_RODE + 2) {
      const dx = village.x - meute.position.x;
      const dy = village.y - meute.position.y;
      meute.cible = {
        x: village.x - Math.round((dx / d) * RAYON_RODE),
        y: village.y - Math.round((dy / d) * RAYON_RODE),
      };
      meute.etat = "pature";
    } else {
      meute.cible = null;
    }
  } else if (!moment.estNuit) {
    // L'aube referme la menace : la meute retourne à ses affaires.
    meute.proieHumaine = null;
    meute.enMenace = false;
    meute.cible = null;
    etat.menace = null;
    etat.repitJusqua = tick + REPIT_TICKS;
    effets.push({ genre: "fin", meute, personnage: null });
  }
  return effets;
}

/** La proie que la meute doit atteindre pour que le combat commence, si elle est au contact. */
export function proieAuContact(monde: Monde, meute: Troupeau): Personnage | null {
  if (meute.proieHumaine === null) return null;
  const p = monde.personnages.find((x) => x.id === meute.proieHumaine);
  if (!p?.vivant) return null;
  if (Grille.distance(p.corps.position, meute.position) > 1) return null;
  if (feuProche(monde, p.corps.position) !== null && presDunFeu(monde, meute.position)) return null;
  return p;
}
