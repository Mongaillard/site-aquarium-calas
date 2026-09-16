/**
 * Les buts (M26) : des succès qu'on débloque en jouant, un scénario choisi au
 * départ (une condition à remplir avant une année limite), et des prophéties
 * que le ciel formule pour la saison — accomplies, elles rapportent de la
 * faveur. Tout se vérifie à l'aube, sur l'état du monde et les compteurs du
 * journal ; rien ne dépend du hasard sauf le choix des prophéties.
 */
import { FICHES_SCENARIO, FICHES_SUCCES } from "@sdv/protocole";
import type { Scenario, Succes } from "@sdv/protocole";
import type { Monde } from "../monde.js";
import type { Rng } from "../rng.js";
import { PLANS_BATIMENT, TYPES_BATIMENT } from "./batiments.js";
import type { TypeBatiment } from "./batiments.js";
import { estAgeDuCuivre } from "./divin.js";
import type { EtatFaveur } from "./divin.js";
import type { EtatVillages } from "./villages.js";

export interface SuccesDebloque {
  readonly id: Succes;
  readonly jour: number;
}

export interface EtatScenario {
  readonly id: Scenario;
  etat: "en_cours" | "gagne" | "perdu";
  progres: number;
  texte: string;
  readonly finJour: number;
  jourIssue: number | null;
}

export type GenreProphetie = "naissance" | "ames" | "batiment" | "priere" | "legende" | "deuil";

export interface Prophetie {
  readonly id: string;
  readonly genre: GenreProphetie;
  readonly texte: string;
  readonly jour: number;
  readonly finJour: number;
  /** Ce qu'il faut atteindre (âmes, compteur) ou ne pas dépasser (deuil). */
  readonly cible: number;
  /** Paramètre libre : famille, type de bâtiment. */
  readonly parametre: string;
  etat: "ouverte" | "accomplie" | "manquee";
}

export interface EtatObjectifs {
  succes: SuccesDebloque[];
  scenario: EtatScenario | null;
  propheties: Prophetie[];
  compteurPropheties: number;
}

export interface MondeObjectifs extends Monde {
  readonly faveur: EtatFaveur;
  readonly villages: EtatVillages;
  readonly creaturesInvoquees: number;
  compter(cle: string): number;
  generations(): number;
}

/** Faveur gagnée pour une prophétie accomplie. */
export const FAVEUR_PROPHETIE = 8;
/** Une prophétie a une chance sur deux de tomber au premier jour d'une saison sans prophétie ouverte. */
export const CHANCE_PROPHETIE = 0.5;
const MAX_PROPHETIES = 12;

export function etatObjectifsInitial(
  scenario: Scenario | null,
  joursParAnnee: number,
): EtatObjectifs {
  const fiche = scenario === null ? null : FICHES_SCENARIO[scenario];
  return {
    succes: [],
    scenario:
      scenario === null || fiche === null
        ? null
        : {
            id: scenario,
            etat: "en_cours",
            progres: 0,
            texte: fiche.description,
            finJour: fiche.anneesLimite * joursParAnnee,
            jourIssue: null,
          },
    propheties: [],
    compteurPropheties: 0,
  };
}

function vivants(monde: Monde): number {
  let n = 0;
  for (const p of monde.personnages) if (p.vivant) n += 1;
  return n;
}

function batimentsTermines(monde: Monde, type?: TypeBatiment): number {
  let n = 0;
  for (const b of monde.batiments.values())
    if (b.etat === "termine" && (type === undefined || b.type === type)) n += 1;
  return n;
}

/** Les conditions des succès, par identifiant. */
const CONDITIONS: Readonly<Record<Succes, (monde: MondeObjectifs) => boolean>> = {
  un_toit: (m) => batimentsTermines(m) >= 1,
  premier_feu: (m) => m.compter("feu_rallume") + batimentsTermines(m, "feu_de_camp") >= 1,
  dix_berceaux: (m) => m.compter("naissance") >= 10,
  an_deux: (m) => m.horloge.moment().annee >= 2 && vivants(m) > 0,
  an_cinq: (m) => m.horloge.moment().annee >= 5 && vivants(m) > 0,
  an_dix: (m) => m.horloge.moment().annee >= 10 && vivants(m) > 0,
  vingt_ames: (m) => vivants(m) >= 20,
  cinquante_ames: (m) => vivants(m) >= 50,
  cent_ames: (m) => vivants(m) >= 100,
  troisieme_generation: (m) => m.generations() >= 3,
  age_du_cuivre: (m) => estAgeDuCuivre(m),
  une_legende: (m) => m.compter("legende:legende") >= 1,
  une_coutume: (m) => m.compter("coutume:adoptee") >= 1,
  second_village: (m) => m.villages.villages.length >= 2,
  une_alliance: (m) => m.villages.relations.some((r) => r.etat === "alliance"),
  priere_exaucee: (m) => m.faveur.exaucees >= 1,
  main_du_ciel: (m) => m.faveur.miracles >= 10,
  creature: (m) => m.creaturesInvoquees >= 1,
  loups_repousses: (m) => m.compter("combat") >= 3,
  raid_repousse: (m) => m.compter("raid:depart") >= 1,
};

/** Progrès d'un scénario, 0..1, et ce qu'on en dit. */
const SCENARIOS: Readonly<
  Record<Scenario, (monde: MondeObjectifs) => { readonly progres: number; readonly texte: string }>
> = {
  an_dix: (m) => {
    const annee = m.horloge.moment().annee;
    return {
      progres: Math.min(1, (annee - 1) / 9),
      texte: `An ${String(annee)} sur 10, ${String(vivants(m))} âme${vivants(m) > 1 ? "s" : ""}.`,
    };
  },
  cuivre_an_cinq: (m) => {
    const cuivre = estAgeDuCuivre(m);
    const fours = batimentsTermines(m, "four");
    const minerai = m.compter("recolte:minerai");
    return {
      progres: cuivre ? 1 : fours > 0 ? 0.6 : minerai > 0 ? 0.3 : 0,
      texte: cuivre
        ? "Le cuivre est là."
        : fours > 0
          ? "Un four attend son minerai."
          : minerai > 0
            ? "Du minerai a été extrait ; il faut un four."
            : "Personne n'a encore vu de minerai.",
    };
  },
  une_legende: (m) => {
    const legendes = m.compter("legende:legende");
    const recits = m.compter("legende:recit");
    return {
      progres: legendes > 0 ? 1 : Math.min(0.9, recits / 10),
      texte:
        legendes > 0
          ? "Une légende est née."
          : `${String(recits)} récit${recits > 1 ? "s" : ""} aux veillées.`,
    };
  },
  trois_villages: (m) => {
    const n = m.villages.villages.length;
    const guerre = m.villages.relations.some((r) => r.etat === "guerre");
    return {
      progres: guerre ? Math.min(0.9, n / 3) : Math.min(1, n / 3),
      texte: `${String(n)} village${n > 1 ? "s" : ""}${guerre ? ", mais la guerre" : ", en paix"}.`,
    };
  },
  cent_ames: (m) => {
    const n = vivants(m);
    return { progres: Math.min(1, n / 100), texte: `${String(n)} âme${n > 1 ? "s" : ""} sur 100.` };
  },
};

export interface EffetObjectifs {
  readonly succes: readonly Succes[];
  readonly scenario: "gagne" | "perdu" | null;
  readonly propheties: readonly Prophetie[];
  readonly nouvelle: Prophetie | null;
}

/** À l'aube : succès, scénario, prophéties. Renvoie ce qui a changé, pour le journal. */
export function jourDesObjectifs(
  monde: MondeObjectifs,
  etat: EtatObjectifs,
  rng: Rng,
): EffetObjectifs {
  const moment = monde.horloge.moment();
  const jour = moment.jourAbsolu;
  const nouveaux: Succes[] = [];
  const deja = new Set(etat.succes.map((s) => s.id));
  for (const id of Object.keys(CONDITIONS) as Succes[]) {
    if (deja.has(id)) continue;
    if (CONDITIONS[id](monde)) {
      etat.succes.push({ id, jour });
      nouveaux.push(id);
    }
  }
  let issue: "gagne" | "perdu" | null = null;
  const sc = etat.scenario;
  if (sc !== null && sc.etat === "en_cours") {
    const { progres, texte } = SCENARIOS[sc.id](monde);
    sc.progres = progres;
    sc.texte = texte;
    if (progres >= 1) {
      sc.etat = "gagne";
      sc.jourIssue = jour;
      issue = "gagne";
    } else if (vivants(monde) === 0 || jour >= sc.finJour) {
      sc.etat = "perdu";
      sc.jourIssue = jour;
      issue = "perdu";
    }
  }
  // Les prophéties ouvertes se jugent ; une nouvelle peut tomber au premier jour d'une saison.
  const jugees: Prophetie[] = [];
  for (const p of etat.propheties) {
    if (p.etat !== "ouverte") continue;
    if (accomplie(monde, p)) {
      p.etat = "accomplie";
      jugees.push(p);
    } else if (jour >= p.finJour) {
      p.etat = "manquee";
      jugees.push(p);
    }
  }
  let nouvelle: Prophetie | null = null;
  if (
    moment.jourDeSaison === 1 &&
    vivants(monde) > 0 &&
    !etat.propheties.some((p) => p.etat === "ouverte") &&
    rng.chance(CHANCE_PROPHETIE)
  ) {
    nouvelle = formuler(monde, etat, rng);
    if (nouvelle !== null) {
      etat.propheties.push(nouvelle);
      if (etat.propheties.length > MAX_PROPHETIES)
        etat.propheties.splice(0, etat.propheties.length - MAX_PROPHETIES);
    }
  }
  return { succes: nouveaux, scenario: issue, propheties: jugees, nouvelle };
}

function accomplie(monde: MondeObjectifs, p: Prophetie): boolean {
  switch (p.genre) {
    case "naissance": {
      const T = monde.horloge.ticksParJour;
      const depuis = monde.horloge.tick - p.jour * T;
      return monde.personnages.some(
        (x) => x.vivant && x.identite.nomFamille === p.parametre && x.corps.ageJours * T <= depuis,
      );
    }
    case "ames":
      return vivants(monde) >= p.cible;
    case "batiment":
      return batimentsTermines(monde, p.parametre as TypeBatiment) >= p.cible;
    case "priere":
      return monde.faveur.exaucees >= p.cible;
    case "legende":
      return monde.compter("legende:legende") >= p.cible;
    case "deuil":
      // Ne se juge qu'à l'échéance : personne ne sera mort.
      return monde.horloge.moment().jourAbsolu >= p.finJour && monde.compter("deces") <= p.cible;
  }
}

const SAISONS_TEXTE: Readonly<Record<string, string>> = {
  printemps: "du printemps",
  ete: "de l'été",
  automne: "de l'automne",
  hiver: "de l'hiver",
};

/** Une prophétie pour la saison, tirée de ce que le monde permet. */
export function formuler(monde: MondeObjectifs, etat: EtatObjectifs, rng: Rng): Prophetie | null {
  const moment = monde.horloge.moment();
  const jour = moment.jourAbsolu;
  const finJour = jour + monde.config.monde.joursParSaison - 1;
  const fin = `Avant la fin ${SAISONS_TEXTE[moment.saison] ?? "de la saison"}`;
  const choix: (() => Prophetie | null)[] = [];
  const id = (): string => {
    etat.compteurPropheties += 1;
    return `prophetie-${String(etat.compteurPropheties)}`;
  };
  const base = { jour, finJour, etat: "ouverte" as const };
  // Une naissance dans une famille où un couple vit.
  const familles = [
    ...new Set(
      monde.personnages
        .filter(
          (p) =>
            p.vivant &&
            p.corps.stade === "adulte" &&
            [...p.relations.values()].some((r) => r.lien === "partenaire"),
        )
        .map((p) => p.identite.nomFamille),
    ),
  ];
  if (familles.length > 0)
    choix.push(() => {
      const famille = rng.choisir(familles);
      return {
        ...base,
        id: id(),
        genre: "naissance",
        texte: `${fin}, un enfant naîtra chez les ${famille}.`,
        cible: 1,
        parametre: famille,
      };
    });
  const n = vivants(monde);
  choix.push(() => ({
    ...base,
    id: id(),
    genre: "ames",
    texte: `${fin}, le village comptera ${String(n + 2)} âmes.`,
    cible: n + 2,
    parametre: "",
  }));
  const types = TYPES_BATIMENT.filter((t) => t !== "tombe" && t !== "stele" && t !== "champ");
  choix.push(() => {
    const type = rng.choisir(types);
    const deja = batimentsTermines(monde, type);
    return {
      ...base,
      id: id(),
      genre: "batiment",
      texte: `${fin}, ${deja > 0 ? "un nouveau" : "un"} ${PLANS_BATIMENT[type].nom} s'élèvera.`,
      cible: deja + 1,
      parametre: type,
    };
  });
  if (monde.faveur.prieres > 0)
    choix.push(() => ({
      ...base,
      id: id(),
      genre: "priere",
      texte: `${fin}, une prière sera exaucée.`,
      cible: monde.faveur.exaucees + 1,
      parametre: "",
    }));
  if (monde.compter("legende:recit") > 0)
    choix.push(() => ({
      ...base,
      id: id(),
      genre: "legende",
      texte: `${fin}, une légende naîtra aux veillées.`,
      cible: monde.compter("legende:legende") + 1,
      parametre: "",
    }));
  choix.push(() => ({
    ...base,
    id: id(),
    genre: "deuil",
    texte: `${fin}, personne ne mourra.`,
    cible: monde.compter("deces"),
    parametre: "",
  }));
  return rng.choisir(choix)();
}

/** Les fiches, pour qui veut la liste complète (l'état du protocole). */
export const TOUS_SUCCES = Object.keys(FICHES_SUCCES) as Succes[];
