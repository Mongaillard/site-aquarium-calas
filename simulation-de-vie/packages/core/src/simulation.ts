/**
 * Boucle principale (section 3). M2 : météo et saisons, bâtiments (chantiers,
 * usure, feux), chaleur selon abri / feu / vêtement, en plus des besoins, de la
 * perception, de la décision, de la planification et de l'exécution de M1.
 */
import { appliquerTickBesoins } from "./agents/besoins.js";
import { possede, retirer, transferer, placeLibre } from "./agents/inventaire.js";
import type { TypeAction } from "./actions/types.js";
import { gagnerExperience, niveau } from "./agents/competences.js";
import {
  capacites,
  fatigueEffort,
  fatigueRepos,
  humeur,
  passeQuotidienneCorps,
  risqueAccouchement,
  saigne,
  sourcesDegats,
  estEpuise,
  ajouterHumeur,
} from "./agents/corps.js";
import type { Gisement, Ressource } from "./monde/ressources.js";
import type { Personnage } from "./agents/personnage.js";
import { famillesLibres, genererGroupe, genererPopulation } from "./agents/population.js";
import { creerPersonnage, elaguerConnaissance } from "./agents/personnage.js";
import { heriter as heriterGenome } from "./agents/genetique.js";
import {
  adopter,
  apprendreParObservation,
  deuil,
  heriter,
  tickVieQuotidien,
} from "./agents/vie.js";
import { construireGenealogie } from "./genealogie.js";
import type { Genealogie } from "./genealogie.js";
import { executerTick } from "./actions/executeur.js";
import { planifier } from "./actions/planificateur.js";
import { decrireAction, decrireIntention, memeIntention } from "./actions/types.js";
import type { Intention } from "./actions/types.js";
import { observer, percevoir, percevoirLeger, rayonVision } from "./cerveau/perception.js";
import { RuleBrain } from "./cerveau/rule-brain.js";
import type { Cerveau } from "./cerveau/types.js";
import type { SimConfig, SimConfigPartielle } from "./config.js";
import { fusionnerConfig, validerConfig } from "./config.js";
import { Journal } from "./evenements/journal.js";
import type { Evenement, TypeEvenement } from "./evenements/journal.js";
import { estEau, feuProche, sommeilChange } from "./monde.js";
import { decrireEvenement, importancePourTemoin } from "./memoire/descriptions.js";
import type { Nommeur } from "./memoire/descriptions.js";
import { reflechir } from "./memoire/reflexion.js";
import { relationFamiliale } from "./social/relations.js";
import type { Monde } from "./monde.js";
import { PLANS_BATIMENT, creerChantier } from "./monde/batiments.js";
import { INFO_BIOME } from "./monde/biomes.js";
import { INVENTIONS, LECONS } from "./savoirs/catalogue.js";
import type { Lecon } from "./savoirs/catalogue.js";
import { apprenants, apprendre, tirerLecons } from "./savoirs/lecons.js";
import { inventer } from "./savoirs/inventions.js";
import type { Batiment, TypeBatiment } from "./monde/batiments.js";
import { abondanceDuBerceau, genererGrille, sitesDesPeuples } from "./monde/generation.js";
import type { OptionsGeneration } from "./monde/generation.js";
import { Grille, cleMorceau } from "./monde/grille.js";
import { RAYON_PINCEAU_MAX, sculpter, tuilePraticableProche } from "./monde/terrain.js";
import type { Pinceau, ResultatSculpture } from "./monde/terrain.js";
import {
  COTE_BASSIN,
  CROISSANCE_POISSON,
  IMMIGRATION_POISSON,
  JOURS_REPOUSSE_SOUCHE,
  PROFILS,
  heureTroupeau,
  jourTroupeau,
  peuplerMorceau,
} from "./monde/faune.js";
import type { Troupeau } from "./monde/faune.js";
import { heureBete, jourBete, jourChamp, semer, titre as titreDe } from "./monde/village.js";
import type { Bete } from "./monde/village.js";
import { REPIT_TICKS, etatDangerInitial, heureDanger, proieAuContact } from "./monde/danger.js";
import type { EtatDanger } from "./monde/danger.js";
import {
  ANNEES_ENTRE_EPIDEMIES,
  RAYON_SOUILLURE,
  heureContagion,
  jourMaladies,
  tomberMalade,
} from "./agents/maladies.js";
import { facteurFaimMaladies } from "./agents/maladies.js";
import { pourrir } from "./agents/inventaire.js";
import { BUCHES_PAR_JOUR, BUCHES_PAR_JOUR_FROID, BUCHES_PAR_JOUR_NEIGE } from "./monde.js";
import type { Position } from "./monde/grille.js";
import { Horloge } from "./monde/horloge.js";
import { EFFETS_METEO, EFFETS_SAISON, tirerMeteo } from "./monde/meteo.js";
import type { Meteo } from "./monde/meteo.js";
import { Rng } from "./rng.js";
import type { FaveurEtat, Pouvoir, QuestionConseil } from "@sdv/protocole";
import {
  COUT_CREATURE,
  COUT_PEUPLE,
  FICHES_DOMAINE,
  RANG_CREATURE,
  loisParDefaut,
} from "@sdv/protocole";
import type { Domaine, GenreCreature, Loi } from "@sdv/protocole";
import { creerCreature, ficheCreature, heureCreatures, jourCreatures } from "./monde/creatures.js";
import { etatConteurInitial, jourDuConteur } from "./monde/conteur.js";
import { FAVEUR_PROPHETIE, etatObjectifsInitial, jourDesObjectifs } from "./monde/objectifs.js";
import type { EtatObjectifs } from "./monde/objectifs.js";
import { FICHES_SCENARIO, FICHES_SUCCES } from "@sdv/protocole";
import type { EtatConteur } from "./monde/conteur.js";
import type { Creature } from "./monde/creatures.js";
import {
  FAVEUR_EVENEMENTS,
  FAVEUR_OFFRANDE,
  FAVEUR_PAR_JOUR,
  FAVEUR_PRIERE,
  JOURS_PRIERE,
  etatFaveurInitial,
  exercer as exercerPouvoir,
  faveurEtat,
  gagnerFaveur,
  gardienDeLAutel,
  jourDuCiel,
  providence,
  saisonDuCiel,
  saisonSansMiracle,
} from "./monde/divin.js";
import type { PriereEtat } from "@sdv/protocole";
import type { Espece } from "./monde/faune.js";
import {
  EVENEMENTS_GARDES,
  FORMAT_SAUVEGARDE,
  VERSION_SAUVEGARDE,
  decoder,
  encoder,
  estSauvegarde,
} from "./sauvegarde.js";
import type { Sauvegarde } from "./sauvegarde.js";
import type { EtatGrille } from "./monde/grille.js";
import type { EtatRng } from "./rng.js";
import type { CommandePouvoir, EtatFaveur, ResultatPouvoir } from "./monde/divin.js";
import {
  FILE_MAX,
  JOURS_ENTRE_CONSEILS,
  JOURS_ENTRE_CONSEILS_OBSERVATEUR,
  SEUIL_CONSEIL,
  appliquerConseil,
  besoinSansIdee,
  creerQuestion,
  jourAmbition,
  jourCompteurs,
  motifsDeConseil,
  scoreMotifs,
} from "./cerveau/conseil.js";
import type { ChoixConseil, Motif } from "./cerveau/conseil.js";
import {
  apprentissageDuSoir,
  aubeSociete,
  etatSocieteInitial,
  heureSociete,
  mortSociete,
  naissanceSociete,
  observerEvenement,
  soireeSociete,
} from "./social/societe.js";
import type { EtatSociete } from "./social/societe.js";
import {
  aubePsyche,
  mortPsyche,
  noterIntention,
  observerPsyche,
  psycheInitiale,
  soirPsyche,
} from "./memoire/psyche.js";
import { etatChroniqueInitial, observerChronique } from "./memoire/legendes.js";
import type { EtatChronique } from "./memoire/legendes.js";
import {
  aubeVillages,
  etatVillagesInitial,
  fonderPremierVillage,
  heureVillages,
  observerVillages,
} from "./monde/villages.js";
import type { EtatVillages } from "./monde/villages.js";
import { MATIERES_BRUTES, bonusPorte, bonusSu, etatTrouvaillesNeuf } from "./savoirs/grammaire.js";
import { chercher, melanger } from "./savoirs/recherche.js";
import type { EtatTrouvailles } from "./savoirs/grammaire.js";
import {
  aubeBatailles,
  aubeRevoltes,
  batailleActive,
  gardienRepousse,
  lancerBatailleMeute,
  tickBatailles,
} from "./monde/bataille.js";

export interface Statistiques {
  readonly tick: number;
  readonly vivants: number;
  readonly morts: number;
  readonly evenements: number;
  readonly batiments: number;
  readonly chantiers: number;
  readonly meteo: Meteo;
}

/**
 * Inspiration venue du cerveau Claude (M5) : un texte, jamais une décision
 * brute. Le moteur reste maître de ce qu'il applique.
 */
export interface Inspiration {
  readonly genre: "pensee" | "recit" | "epitaphe";
  readonly personnageId: string;
  readonly texte: string;
  /** Épitaphe : leçon retenue par Claude parmi le catalogue (facultatif). */
  readonly savoir?: string;
}

/** Réponse de Claude à une question ouverte (commande `conseil`). */
export interface Conseil extends ChoixConseil {
  readonly questionId: string;
  readonly personnageId: string;
}

export type ResultatConseil =
  | { readonly ok: true; readonly effet: string }
  | {
      readonly ok: false;
      readonly raison:
        "question_inconnue" | "question_expiree" | "personnage_mort" | "option_invalide" | "aucun";
    };

/** Rayon, en tuiles, de ce que la colonie connaît de son berceau au premier jour. */
const RAYON_CONNAISSANCE_INITIALE = 14;
/** Rayon, en tuiles, que le ciel voit d'un monde vierge (pour le sculpter et le peupler). */
const RAYON_MONDE_VIERGE = 40;

/** Commande `sculpter` : un pinceau, un centre, un rayon. */
export interface CommandeSculpter {
  readonly pinceau: Pinceau;
  readonly x: number;
  readonly y: number;
  readonly rayon: number;
}

/** Commande `peupler` : un point et une taille de peuple. */
export interface CommandePeupler {
  readonly x: number;
  readonly y: number;
  readonly taille: number;
}

/** Commande `creature` : un genre et un point. */
export interface CommandeCreature {
  readonly genre: GenreCreature;
  readonly x: number;
  readonly y: number;
}

export type ResultatInvocation =
  | { readonly ok: true; readonly id: string }
  | {
      readonly ok: false;
      readonly raison:
        "sans_domaine" | "verrouille" | "faveur_insuffisante" | "deja_la" | "hors_monde";
    };

export type ResultatPeuplement =
  | { readonly ok: true; readonly village: string; readonly personnages: readonly string[] }
  | { readonly ok: false; readonly raison: "hors_monde" | "faveur" };

/**
 * Met à niveau l'état d'une sauvegarde d'une version antérieure : les champs
 * apparus depuis prennent leur valeur de départ, rien n'est perdu.
 */
function migrer(etat: EtatSimulation, version: number): EtatSimulation {
  if (version >= VERSION_SAUVEGARDE) return etat;
  const brut = etat as unknown as Record<string, unknown>;
  const defauts = (o: Record<string, unknown>, valeurs: Record<string, unknown>): void => {
    for (const [k, v] of Object.entries(valeurs)) if (!(k in o)) o[k] = v;
  };
  // Version 2 (M19) : la société.
  if (!("societe" in brut)) brut.societe = etatSocieteInitial();
  defauts(brut.societe as Record<string, unknown>, {
    infractionsRecentes: new Map<string, number>(),
  });
  // Version 3 (M20) : la psyché et la chronique.
  if (!("chronique" in brut)) brut.chronique = etatChroniqueInitial();
  // Version 4 (M21) : les villages ; le premier se fonde sur les abris existants.
  if (!("villages" in brut)) {
    const villages = etatVillagesInitial();
    const familles = [
      ...new Set(etat.personnages.filter((p) => p.vivant).map((p) => p.identite.nomFamille)),
    ];
    const abris = etat.batiments.filter((b) => b.etat === "termine" && b.type === "abri");
    const centre = abris[0]?.position ?? etat.personnages[0]?.corps.position ?? { x: 0, y: 0 };
    villages.compteurs.villages = 1;
    villages.villages.push({
      id: "v-1",
      nom: familles[0] === undefined ? "le village" : `le village des ${familles[0]}`,
      familles,
      centre: { ...centre },
      fondeJour: 0,
      origine: "fondation",
      enRoute: [],
    });
    brut.villages = villages;
  }
  // Version 7 (M32) : les batailles tick par tick, les raids repoussés.
  defauts(brut.villages as Record<string, unknown>, { batailles: [] });
  defauts((brut.villages as { compteurs: Record<string, unknown> }).compteurs, {
    raidsRepousses: 0,
    conquetes: 0,
  });
  defauts(brut.villages as Record<string, unknown>, { derniereConqueteJour: -1000, vaincus: [] });
  defauts((brut.villages as { compteurs: Record<string, unknown> }).compteurs, { revoltes: 0 });
  // Version 8 (M38) : la grammaire d'invention ; les mondes d'avant n'ont rien trouvé.
  if (!("trouvailles" in brut)) brut.trouvailles = etatTrouvaillesNeuf();
  else {
    const e = brut.trouvailles as Record<string, unknown>;
    defauts(e, { nomsPris: new Set<string>() });
    // Les matières brutes viennent du code, pas de la sauvegarde : elles peuvent changer.
    const matieres = e.matieres as Map<string, unknown>;
    for (const f of MATIERES_BRUTES) if (!matieres.has(f.id)) matieres.set(f.id, f);
  }
  // Version 5 (M25) : les peuples rivaux du départ (un seul dans les mondes d'avant), les lois.
  defauts(etat.config.population, { peuples: 1 });
  if (!("lois" in brut)) brut.lois = loisParDefaut();
  // Version 7 (M33) : la loi des guerres.
  defauts(brut.lois as Record<string, unknown>, { guerres: true });
  defauts(brut.lois as Record<string, unknown>, loisParDefaut());
  defauts(brut, { creatures: [], compteurCreatures: 0, conteur: etatConteurInitial() });
  defauts(brut.config as Record<string, unknown>, { jeu: { scenario: null } });
  // Version 6 (M26) : les foyers des peuples rivaux ; les mondes d'avant gardent leur terrain.
  defauts(etat.config.monde, { foyers: false });
  defauts(brut, { objectifs: etatObjectifsInitial(null, etat.config.vie.joursParAnnee) });
  defauts(brut.faveur as Record<string, unknown>, { domaine: null, rang: 0, usages: [] });
  defauts(brut.config as Record<string, unknown>, { dieu: { domaine: null } });
  for (const p of etat.personnages) {
    const q = p as unknown as Record<string, unknown>;
    defauts(q, { prestige: 0, maitre: null, banni: null });
    if (!("psyche" in q)) q.psyche = psycheInitiale(p.identite.personnalite);
    defauts(p.drapeaux as unknown as Record<string, unknown>, {
      traumatiseJusqua: -1,
      refusePar: null,
      recueilliJour: -100,
    });
    for (const r of p.relations.values())
      defauts(r as unknown as Record<string, unknown>, { rancune: 0, haine: false });
  }
  return etat;
}

/** Une sauvegarde en cours d'encodage (voir `Simulation.sauvegarderParEtapes`). */
export interface EtapesSauvegarde {
  /** Le tick du monde encodé. */
  readonly tick: number;
  /** Personnages à encoder en tout. */
  readonly total: number;
  /** Encode jusqu'à `n` personnages de plus ; la sauvegarde quand tout y est, null sinon. */
  suivant(n: number): Sauvegarde | null;
}

/** Tout ce qu'une simulation possède en propre (sérialisé structurellement). */
interface EtatSimulation {
  readonly config: SimConfig;
  readonly rng: EtatRng;
  readonly tick: number;
  readonly grille: EtatGrille;
  readonly personnages: Personnage[];
  readonly batiments: Batiment[];
  readonly troupeaux: Troupeau[];
  readonly betail: Bete[];
  readonly danger: EtatDanger;
  readonly morceauxPeuples: number[];
  readonly compteurs: {
    readonly betail: number;
    readonly troupeaux: number;
    readonly personnages: number;
    readonly batiments: number;
    readonly questions: number;
  };
  readonly conseilsDuJour: number;
  readonly derniereEpidemieAnnee: number;
  readonly meteo: Meteo;
  readonly faveur: {
    readonly valeur: number;
    readonly miracles: number;
    readonly reputation: number;
    readonly prieres: number;
    readonly offrandes: number;
    readonly exaucees: number;
    readonly providence: boolean;
    readonly culte: number;
    readonly max: number;
    readonly recharges: [Pouvoir, number][];
    readonly domaine: Domaine | null;
    readonly rang: number;
    readonly usages: [Pouvoir, number][];
  };
  readonly meteoForcee: { readonly meteo: Meteo; readonly jusquaJour: number } | null;
  readonly questionEnCours: QuestionConseil | null;
  readonly fileConseils: { id: string; motifs: Motif[]; score: number }[];
  readonly journal: ReturnType<Journal["etat"]>;
  readonly societe: EtatSociete;
  readonly chronique: EtatChronique;
  readonly villages: EtatVillages;
  readonly trouvailles: EtatTrouvailles;
  readonly lois: Record<Loi, boolean>;
  readonly creatures: Creature[];
  readonly compteurCreatures: number;
  readonly conteur: EtatConteur;
  readonly objectifs: EtatObjectifs;
}

export class Simulation implements Monde {
  readonly journal = new Journal();
  readonly personnages: Personnage[];
  readonly batiments = new Map<string, Batiment>();
  /** La faune : troupeaux et meutes, peuplés morceau par morceau. */
  readonly troupeaux = new Map<string, Troupeau>();
  /** Directeur de danger : la menace en cours et le budget d'attaques. */
  readonly danger: EtatDanger;
  /** Le bétail (jalon « le village apprivoise »). */
  readonly betail = new Map<string, Bete>();
  private compteurBetail = 0;
  private readonly morceauxPeuples = new Set<number>();
  private compteurTroupeaux = 0;
  meteo: Meteo = "clair";
  private compteurPersonnages = 0;
  private readonly cerveaux = new Map<string, Cerveau>();
  private compteurBatiments = 0;
  /** Mode Dieu : la faveur de l'observateur. */
  readonly faveur: EtatFaveur = etatFaveurInitial();
  /** « Demander à Claude » : la question ouverte, la file des candidats, le budget du jour. */
  questionEnCours: QuestionConseil | null = null;
  readonly fileConseils: { id: string; motifs: Motif[]; score: number }[] = [];
  private conseilsDuJour = 0;
  private compteurQuestions = 0;
  /** Météo imposée par un miracle (gel précoce, sécheresse), jusqu'à ce jour absolu inclus. */
  meteoForcee: { readonly meteo: Meteo; readonly jusquaJour: number } | null = null;
  /** La société (jalon 13) : coutumes, griefs, tension, décisions, alliances, factions, tabous. */
  readonly societe: EtatSociete = etatSocieteInitial();
  /** La mémoire collective (jalon 14) : récits, légendes, noms de lieux, proverbes. */
  readonly chronique: EtatChronique = etatChroniqueInitial();
  /** Les villages (jalon 15) : schismes, bandes, caravanes, diplomatie. */
  readonly villages: EtatVillages = etatVillagesInitial();
  /** Ce que le monde a trouvé (M38) : les matières dérivées et les trouvailles. */
  readonly trouvailles: EtatTrouvailles = etatTrouvaillesNeuf();
  /** Les lois du monde (M25) : ce que l'observateur a suspendu. */
  readonly lois: Record<Loi, boolean> = loisParDefaut();
  /** Les créatures du ciel (M25) : gardiens postés, fléaux lâchés. */
  readonly creatures = new Map<string, Creature>();
  private compteurCreatures = 0;
  /** Le conteur (M25) : la courbe de tension, ses actes, ses chroniques. */
  readonly conteur: EtatConteur = etatConteurInitial();
  /** Les buts (M26) : succès, scénario, prophéties. */
  readonly objectifs: EtatObjectifs;

  private constructor(
    readonly config: SimConfig,
    readonly rng: Rng,
    readonly horloge: Horloge,
    readonly grille: Grille,
    etat: EtatSimulation | null = null,
  ) {
    this.objectifs =
      etat?.objectifs ?? etatObjectifsInitial(config.jeu.scenario, config.vie.joursParAnnee);
    if (etat !== null) {
      // Restauration : tout vient de la sauvegarde, rien n'est généré.
      this.personnages = etat.personnages;
      this.danger = etat.danger;
      for (const b of etat.batiments) {
        this.batiments.set(b.id, b);
        const t = grille.tuileOuNull(b.position.x, b.position.y);
        if (t) t.batiment = b;
      }
      for (const t of etat.troupeaux) this.troupeaux.set(t.id, t);
      for (const b of etat.betail) this.betail.set(b.id, b);
      for (const m of etat.morceauxPeuples) this.morceauxPeuples.add(m);
      this.compteurBetail = etat.compteurs.betail;
      this.compteurTroupeaux = etat.compteurs.troupeaux;
      this.compteurPersonnages = etat.compteurs.personnages;
      this.compteurBatiments = etat.compteurs.batiments;
      this.compteurQuestions = etat.compteurs.questions;
      this.conseilsDuJour = etat.conseilsDuJour;
      this.derniereEpidemieAnnee = etat.derniereEpidemieAnnee;
      this.meteo = etat.meteo;
      this.faveur.valeur = etat.faveur.valeur;
      this.faveur.miracles = etat.faveur.miracles;
      this.faveur.reputation = etat.faveur.reputation;
      this.faveur.prieres = etat.faveur.prieres;
      this.faveur.offrandes = etat.faveur.offrandes;
      this.faveur.exaucees = etat.faveur.exaucees;
      this.faveur.providence = etat.faveur.providence;
      this.faveur.culte = etat.faveur.culte;
      this.faveur.max = etat.faveur.max;
      this.faveur.domaine = etat.faveur.domaine;
      this.faveur.rang = etat.faveur.rang;
      for (const [k, v] of etat.faveur.usages) this.faveur.usages.set(k, v);
      this.meteoForcee = etat.meteoForcee;
      for (const [k, v] of etat.faveur.recharges) this.faveur.recharges.set(k, v);
      for (const c of etat.creatures) this.creatures.set(c.id, c);
      this.compteurCreatures = etat.compteurCreatures;
      Object.assign(this.conteur, etat.conteur);
      this.questionEnCours = etat.questionEnCours;
      this.fileConseils.push(...etat.fileConseils);
      this.journal.restaurer(etat.journal);
      Object.assign(this.societe, etat.societe);
      Object.assign(this.chronique, etat.chronique);
      Object.assign(this.villages, etat.villages);
      Object.assign(this.trouvailles, etat.trouvailles);
      Object.assign(this.lois, etat.lois);
      for (const p of this.personnages) this.cerveaux.set(p.id, new RuleBrain(p));
    } else {
      this.faveur.domaine = config.dieu.domaine;
      this.personnages = genererPopulation(rng, config, grille);
      this.compteurPersonnages = this.personnages.length;
      if (this.personnages.length > 0)
        fonderPremierVillage(this, this.personnages[0]?.corps.position ?? { x: 0, y: 0 }, [
          ...new Set(this.personnages.map((p) => p.identite.nomFamille)),
        ]);
      // Des peuples rivaux dès le départ : chacun son village, à bonne distance du berceau.
      const rngPeuples = rng.fork("peuples");
      rngPeuples.suivant();
      for (const site of sitesDesPeuples(rng, config.population.peuples))
        this.poserPeuple(site, config.population.initiale, rngPeuples);
      this.danger = etatDangerInitial(horloge.ticksParJour);
      this.peuplerFaune();
      // La colonie s'installe en terrain reconnu : chacun connaît déjà les environs
      // du berceau (points d'eau, gisements), et ces tuiles comptent comme découvertes.
      for (const p of this.personnages) observer(this, p, RAYON_CONNAISSANCE_INITIALE);
      // Un monde vierge : le ciel voit le berceau, pour le sculpter et y poser un peuple.
      if (this.personnages.length === 0) this.reveler({ x: 0, y: 0 }, RAYON_MONDE_VIERGE);
    }
    this.journal.ecouter((e) => {
      this.memoriser(e);
      observerEvenement(this, e);
      observerPsyche(this, e);
      observerChronique(this, e);
      observerVillages(this, e);
      const gain = FAVEUR_EVENEMENTS[e.type];
      if (gain !== undefined && this.tick > 0) gagnerFaveur(this.faveur, gain);
      if (e.type === "priere") {
        this.faveur.prieres += 1;
        gagnerFaveur(this.faveur, FAVEUR_PRIERE);
        if (typeof e.details.offrande === "string") {
          this.faveur.offrandes += 1;
          gagnerFaveur(this.faveur, FAVEUR_OFFRANDE);
        }
      }
    });
    if (etat !== null) return;
    for (const p of this.personnages) {
      this.cerveaux.set(p.id, new RuleBrain(p));
      this.emettre(
        "arrivee",
        p,
        { prenom: p.identite.prenom, nomFamille: p.identite.nomFamille },
        5,
      );
    }
    // Les membres d'une même famille initiale se connaissent comme frères et sœurs.
    for (const a of this.personnages) {
      for (const b of this.personnages) {
        if (a.id !== b.id && a.identite.nomFamille === b.identite.nomFamille) {
          a.relations.set(b.id, relationFamiliale(b.id, "fratrie"));
        }
      }
    }
    this.nouveauJour();
  }

  /** Accès aux prénoms pour la mise en mots des souvenirs. */
  readonly nommeur: Nommeur = {
    prenom: (id) => this.personnage(id)?.identite.prenom ?? id,
    feminin: (id) => this.personnage(id)?.identite.sexe === "F",
  };

  /**
   * Alimente les mémoires : l'acteur (et l'interlocuteur d'un dialogue) se
   * souviennent à la première personne ; les témoins à portée de vue, en tiers.
   */
  private memoriser(e: Evenement): void {
    if (e.importance < 2 && e.type !== "dialogue") return;
    const type =
      e.type === "dialogue" ? "dialogue" : e.type === "reflexion" ? "reflexion" : "action";
    const acteur = e.acteur ? this.personnage(e.acteur) : undefined;
    if (acteur) {
      const texte = decrireEvenement(e, "acteur", this.nommeur);
      if (texte !== null) {
        const sujets = String(e.details.avec ?? e.details.cible ?? e.details.sujets ?? "")
          .split(",")
          .filter((x) => x !== "");
        acteur.memoire.ajouter(e.tick, type, texte, e.importance, sujets, e.position);
      }
    }
    if (e.type === "dialogue" || e.type === "offre" || e.type === "demande") {
      const autreId = String(e.details.avec ?? e.details.cible ?? "");
      const autre = this.personnage(autreId);
      if (autre && acteur) {
        const texte =
          e.type === "dialogue"
            ? `J'ai discuté avec ${acteur.identite.prenom} (${String(e.details.sujet)}).`
            : e.type === "offre"
              ? `${acteur.identite.prenom} m'a donné ${String(e.details.ressource)}.`
              : e.details.accepte === true
                ? `J'ai donné ${String(e.details.ressource)} à ${acteur.identite.prenom} qui me le demandait.`
                : `J'ai refusé ${String(e.details.ressource)} à ${acteur.identite.prenom}.`;
        autre.memoire.ajouter(e.tick, type, texte, e.importance, [acteur.id], e.position);
      }
    }
    if (e.importance < 3 || e.position === null) return;
    const rayon = rayonVision(this, this.horloge.moment());
    const exclus = new Set([e.acteur, String(e.details.avec ?? ""), String(e.details.cible ?? "")]);
    for (const t of this.personnages) {
      if (!t.vivant || t.corps.endormi || exclus.has(t.id)) continue;
      if (Grille.distance(t.corps.position, e.position) > rayon) continue;
      const texte = decrireEvenement(e, "temoin", this.nommeur);
      if (texte === null) continue;
      t.memoire.ajouter(
        e.tick,
        "observation",
        texte,
        importancePourTemoin(e),
        e.acteur ? [e.acteur] : [],
        e.position,
      );
      apprendreParObservation(t, e.type);
    }
  }

  /** Réflexion du soir pour un personnage : produit des événements `reflexion`, parfois une idée. */
  reflechirPour(p: Personnage): void {
    for (const r of reflechir(this, p)) {
      this.emettre(
        "reflexion",
        p,
        { texte: r.texte, cle: r.cle, sujets: r.sujets.join(",") },
        r.importance,
      );
    }
    const idee = inventer(this, p);
    if (idee !== null) {
      this.emettre("idee", p, { invention: idee, nom: INVENTIONS[idee].nom }, 6);
      p.memoire.ajouter(this.tick, "reflexion", `J'ai une idée. ${INVENTIONS[idee].idee}`, 7, []);
      p.drapeaux.soirsSansIdee = 0;
      return;
    }
    // Rien au catalogue : la grammaire (M38b). Un problème, une matière, un procédé.
    const trouvee = chercher(this, p);
    if (trouvee !== null) {
      const { trouvaille, probleme } = trouvee;
      this.emettre(
        "idee",
        p,
        { invention: trouvaille.id, nom: trouvaille.nom, probleme: probleme.plainte },
        6,
      );
      p.memoire.ajouter(
        this.tick,
        "reflexion",
        `${probleme.plainte} Et si je faisais un ${trouvaille.nom} ?`,
        7,
        [],
      );
      p.drapeaux.soirsSansIdee = 0;
      return;
    }
    // Devant un four, on mêle pour voir : c'est ainsi que naissent les matières.
    const matiere = melanger(this, p);
    if (matiere !== null) {
      this.emettre(
        "matiere",
        p,
        { matiere: matiere.id, nom: matiere.nom, procede: matiere.procede ?? "" },
        8,
      );
      p.memoire.ajouter(
        this.tick,
        "reflexion",
        `Du four est sorti quelque chose que je n'avais jamais vu. Je l'appellerai ${matiere.nom}.`,
        8,
        [],
      );
      p.drapeaux.soirsSansIdee = 0;
      return;
    }
    p.drapeaux.soirsSansIdee = besoinSansIdee(this, p) ? p.drapeaux.soirsSansIdee + 1 : 0;
  }

  // ------------------------------------------------------------ sculpter et peupler

  /** Découvre un disque de tuiles autour d'un centre (vue du ciel). */
  private reveler(centre: Position, rayon: number): void {
    for (let dy = -rayon; dy <= rayon; dy++)
      for (let dx = -rayon; dx <= rayon; dx++)
        if (Math.hypot(dx, dy) <= rayon + 0.5) this.grille.decouvrir(centre.x + dx, centre.y + dy);
  }

  /**
   * Le pinceau du ciel (commande `sculpter`) : remodèle le terrain en disque.
   * Gratuit : c'est l'acte de création, pas un miracle. Les personnes que l'eau
   * profonde surprend sont posées sur la rive la plus proche.
   */
  sculpter(commande: CommandeSculpter): ResultatSculpture {
    const rayon = Math.max(0, Math.min(RAYON_PINCEAU_MAX, commande.rayon));
    const centre = { x: commande.x, y: commande.y };
    const resultat = sculpter(this.grille, this.rng, commande.pinceau, centre, rayon);
    if (resultat.tuiles === 0) return resultat;
    for (const p of this.personnages) {
      if (!p.vivant) continue;
      const pos = p.corps.position;
      if (Grille.distance(pos, centre) > rayon + 1) continue;
      const t = this.grille.tuileOuNull(pos.x, pos.y);
      if (t === null || INFO_BIOME[t.biome].praticable) continue;
      const rive = tuilePraticableProche(this.grille, pos);
      if (rive !== null) p.corps.position = { x: rive.x, y: rive.y };
    }
    this.emettre(
      "divin",
      null,
      { pouvoir: "sculpture", pinceau: commande.pinceau, rayon, tuiles: resultat.tuiles },
      3,
      centre,
    );
    return resultat;
  }

  /**
   * Un peuple posé par le ciel (commande `peupler`) : de nouvelles familles
   * s'installent autour du point choisi et y fondent leur village. Le premier
   * peuple d'un monde vierge ne coûte rien ; les suivants coûtent de la faveur.
   */
  peupler(commande: CommandePeupler): ResultatPeuplement {
    const taille = Math.max(1, Math.min(48, Math.floor(commande.taille)));
    const site = tuilePraticableProche(this.grille, { x: commande.x, y: commande.y }, 24);
    if (site === null) return { ok: false, raison: "hors_monde" };
    const gratuit = this.vivants().length === 0;
    const cout = gratuit ? 0 : COUT_PEUPLE;
    if (this.faveur.valeur < cout) return { ok: false, raison: "faveur" };
    const rng = this.rng.fork(`peuple:${String(this.villages.compteurs.villages + 1)}`);
    const nouveaux = this.poserPeuple({ x: site.x, y: site.y }, taille, rng);
    if (nouveaux.length === 0) return { ok: false, raison: "hors_monde" };
    this.faveur.valeur -= cout;
    for (const p of nouveaux) {
      observer(this, p, RAYON_CONNAISSANCE_INITIALE);
      this.emettre(
        "arrivee",
        p,
        { prenom: p.identite.prenom, nomFamille: p.identite.nomFamille, source: "divin" },
        5,
      );
    }
    const village = this.villages.villages[this.villages.villages.length - 1];
    this.emettre(
      "divin",
      null,
      { pouvoir: "peuple", taille: nouveaux.length, village: village?.nom ?? "", cout },
      6,
      { x: site.x, y: site.y },
    );
    return { ok: true, village: village?.id ?? "", personnages: nouveaux.map((p) => p.id) };
  }

  /** Pose un peuple : familles neuves, membres, fratries, village. Renvoie les nouveaux venus. */
  private poserPeuple(centre: Position, taille: number, rng: Rng): Personnage[] {
    const portees = new Set<string>();
    for (const p of this.personnages) portees.add(p.identite.nomFamille);
    for (const v of this.villages.villages) for (const f of v.familles) portees.add(f);
    const familles = famillesLibres(rng, portees, Math.max(1, Math.round(taille / 4)));
    let nouveaux: Personnage[];
    try {
      nouveaux = genererGroupe(this.rng, rng, this.config, this.grille, {
        centre,
        taille,
        familles,
        premierNumero: this.compteurPersonnages + 1,
      });
    } catch {
      return [];
    }
    this.compteurPersonnages += nouveaux.length;
    for (const a of nouveaux) {
      this.personnages.push(a);
      this.cerveaux.set(a.id, new RuleBrain(a));
      for (const b of nouveaux)
        if (a.id !== b.id && a.identite.nomFamille === b.identite.nomFamille)
          a.relations.set(b.id, relationFamiliale(b.id, "fratrie"));
    }
    const premier = nouveaux[0];
    if (premier !== undefined)
      fonderPremierVillage(this, premier.corps.position, [
        ...new Set(nouveaux.map((p) => p.identite.nomFamille)),
      ]);
    return nouveaux;
  }

  /** Choisit le domaine du ciel (commande `domaine`), une fois pour toutes. */
  choisirDomaine(domaine: Domaine): boolean {
    if (this.faveur.domaine !== null) return false;
    this.faveur.domaine = domaine;
    const fiche = FICHES_DOMAINE[domaine];
    this.emettre(
      "divin",
      null,
      { pouvoir: "domaine", domaine, nom: fiche.nom, titre: fiche.titre },
      6,
    );
    return true;
  }

  /** Invoque une créature du domaine (commande `creature`) : un gardien à poster, un fléau à lâcher. */
  invoquer(commande: CommandeCreature): ResultatInvocation {
    const domaine = this.faveur.domaine;
    if (domaine === null) return { ok: false, raison: "sans_domaine" };
    if (this.faveur.rang < RANG_CREATURE) return { ok: false, raison: "verrouille" };
    if (this.faveur.valeur < COUT_CREATURE) return { ok: false, raison: "faveur_insuffisante" };
    for (const c of this.creatures.values())
      if (c.genre === commande.genre) return { ok: false, raison: "deja_la" };
    const site = tuilePraticableProche(this.grille, { x: commande.x, y: commande.y }, 8);
    if (site === null || this.grille.tuileSiGeneree(commande.x, commande.y) === null)
      return { ok: false, raison: "hors_monde" };
    this.compteurCreatures += 1;
    const id = `c-${String(this.compteurCreatures)}`;
    const c = creerCreature(
      id,
      commande.genre,
      domaine,
      { x: site.x, y: site.y },
      this.horloge.moment().jourAbsolu,
    );
    this.creatures.set(id, c);
    this.faveur.valeur -= COUT_CREATURE;
    this.faveur.miracles += 1;
    const fiche = ficheCreature(c);
    this.emettre(
      "divin",
      null,
      { pouvoir: commande.genre, nom: fiche.nom, emoji: fiche.emoji, cout: COUT_CREATURE, id },
      7,
      { x: site.x, y: site.y },
    );
    return { ok: true, id };
  }

  /** Créatures invoquées depuis le début du monde (succès). */
  get creaturesInvoquees(): number {
    return this.compteurCreatures;
  }

  /** Générations vivantes ou passées, d'après la généalogie (succès). */
  generations(): number {
    return this.genealogie().generations;
  }

  /** À l'aube : succès, scénario, prophéties, et ce qu'on en dit au journal. */
  private jourDesButs(): void {
    const effet = jourDesObjectifs(
      this,
      this.objectifs,
      this.rng.fork(`objectifs/${String(this.horloge.moment().jourAbsolu)}`),
    );
    for (const id of effet.succes) {
      const fiche = FICHES_SUCCES[id];
      this.emettre("but", null, { genre: "succes", id, nom: fiche.nom, emoji: fiche.emoji }, 8);
    }
    const sc = this.objectifs.scenario;
    if (effet.scenario !== null && sc !== null)
      this.emettre(
        "but",
        null,
        { genre: "scenario", id: sc.id, nom: FICHES_SCENARIO[sc.id].nom, issue: effet.scenario },
        10,
      );
    for (const p of effet.propheties) {
      if (p.etat === "accomplie") gagnerFaveur(this.faveur, FAVEUR_PROPHETIE);
      this.emettre(
        "but",
        null,
        {
          genre: "prophetie",
          id: p.id,
          texte: p.texte,
          issue: p.etat,
          faveur: p.etat === "accomplie" ? FAVEUR_PROPHETIE : 0,
        },
        p.etat === "accomplie" ? 8 : 6,
      );
    }
    if (effet.nouvelle !== null)
      this.emettre(
        "but",
        null,
        {
          genre: "prophetie",
          id: effet.nouvelle.id,
          texte: effet.nouvelle.texte,
          issue: "ouverte",
          faveur: 0,
        },
        7,
      );
  }

  /** Compteur du journal pour un type, ou un détail `type:genre` (le conteur s'en sert pour ses chroniques). */
  compter(cle: string): number {
    return cle.includes(":")
      ? this.journal.compteDetail(cle)
      : this.journal.compte(cle as TypeEvenement);
  }

  /** Suspend ou rétablit une loi du monde (commande `loi`). */
  definirLoi(loi: Loi, actif: boolean): void {
    if (this.lois[loi] === actif) return;
    this.lois[loi] = actif;
    if (!actif && loi === "betes") this.danger.menace = null;
    this.emettre("divin", null, { pouvoir: "loi", loi, actif }, 5);
  }

  // ------------------------------------------------------------ mode Dieu

  /** Exerce un pouvoir de l'observateur (commande `pouvoir`). */
  exercer(commande: CommandePouvoir): ResultatPouvoir {
    return exercerPouvoir(this, this.faveur, commande);
  }

  /** La faveur, telle que le protocole la transporte. */
  etatFaveur(): FaveurEtat {
    return faveurEtat(this.faveur);
  }

  /** Providence : le ciel répond de lui-même aux prières (commande `providence`). */
  definirProvidence(actif: boolean): void {
    this.faveur.providence = actif;
  }

  /** Impose une météo pour `jours` jours à compter d'aujourd'hui (miracles). */
  forcerMeteo(meteo: Meteo, jours: number): void {
    this.meteoForcee = { meteo, jusquaJour: this.horloge.moment().jourAbsolu + jours - 1 };
  }

  /** Fait naître un troupeau (ou une meute) : troupeau offert, loups envoyés. */
  ajouterTroupeau(position: Position, espece: Espece, taille: number): Troupeau {
    const id = `faune-${String(++this.compteurTroupeaux)}`;
    const t: Troupeau = {
      id,
      espece,
      position: { ...position },
      gite: { ...position },
      giteEte: { ...position },
      taille,
      mefiance: 0,
      etat: "pature",
      cible: null,
      faim: 0,
      derniereMiseBas: 0,
      proieHumaine: null,
      enMenace: false,
      rng: this.rng.fork(id),
    };
    this.troupeaux.set(id, t);
    this.emettre("faune", null, { genre: "arrivee", espece, taille, source: "divin" }, 4, position);
    return t;
  }

  /** Les prières en attente d'une réponse du ciel (trois jours), les plus récentes d'abord. */
  prieresOuvertes(): PriereEtat[] {
    const T = this.horloge.ticksParJour;
    const resultat: PriereEtat[] = [];
    for (const p of this.vivants()) {
      const pr = p.priere;
      if (pr === null || pr.exaucee || this.tick - pr.tick > JOURS_PRIERE * T) continue;
      resultat.push({
        personnageId: p.id,
        prenom: p.identite.prenom,
        sujet: pr.sujet,
        tick: pr.tick,
        autel: pr.autel,
        x: p.corps.position.x,
        y: p.corps.position.y,
      });
    }
    return resultat.sort((a, b) => b.tick - a.tick);
  }

  // ---------------------------------------------------- demander à Claude

  /** Les questions ouvertes à Claude (au plus une). */
  questionsEnAttente(): readonly QuestionConseil[] {
    return this.questionEnCours === null ? [] : [this.questionEnCours];
  }

  /**
   * L'observateur peut-il faire poser sa question à cette personne maintenant ?
   * Sa demande passe devant une question ouverte par le moteur, jamais devant
   * une autre demande de l'observateur.
   */
  conseilPossible(p: Personnage): boolean {
    if (!p.vivant || p.corps.stade === "enfant") return false;
    const q = this.questionEnCours;
    if (q !== null && (q.personnageId === p.id || q.motifs.includes("observateur"))) return false;
    const T = this.horloge.ticksParJour;
    return (
      p.drapeaux.conseilDemandeA < 0 ||
      this.tick - p.drapeaux.conseilDemandeA >= JOURS_ENTRE_CONSEILS_OBSERVATEUR * T
    );
  }

  /** Bouton « Demander conseil » : ouvre tout de suite une question pour cette personne. */
  demanderConseil(personnageId: string): boolean {
    const p = this.personnage(personnageId);
    if (p === undefined || !this.conseilPossible(p)) return false;
    const q = this.questionEnCours;
    if (q !== null) {
      // La question du moteur cède la place ; son auteur repassera par la file.
      this.questionEnCours = null;
      this.emettre(
        "conseil",
        this.personnage(q.personnageId) ?? null,
        { questionId: q.id, etape: "reponse", applique: false, raison: "remplacee" },
        2,
      );
    }
    const motifs: Motif[] = ["observateur", ...motifsDeConseil(this, p)];
    this.ouvrirQuestion(p, motifs);
    return true;
  }

  private ouvrirQuestion(p: Personnage, motifs: readonly Motif[]): void {
    this.compteurQuestions += 1;
    const q = creerQuestion(this, p, motifs, this.compteurQuestions);
    this.questionEnCours = q;
    p.drapeaux.conseilDemandeA = this.tick;
    this.conseilsDuJour += 1;
    this.emettre(
      "conseil",
      p,
      { questionId: q.id, etape: "question", motifs: motifs.join(","), options: q.options.length },
      3,
    );
  }

  /** Le soir, après la réflexion : qui est à court d'idées entre dans la file. */
  private inscrireCandidats(): void {
    for (const p of this.vivants()) {
      const motifs = motifsDeConseil(this, p);
      const score = scoreMotifs(motifs);
      if (score < SEUIL_CONSEIL) continue;
      if (
        p.drapeaux.conseilDemandeA >= 0 &&
        this.tick - p.drapeaux.conseilDemandeA < JOURS_ENTRE_CONSEILS * this.horloge.ticksParJour
      )
        continue;
      if (this.fileConseils.some((c) => c.id === p.id)) continue;
      this.fileConseils.push({ id: p.id, motifs, score });
    }
    this.fileConseils.sort(
      (a, b) =>
        b.score - a.score ||
        (this.personnage(a.id)?.drapeaux.conseilDemandeA ?? -1) -
          (this.personnage(b.id)?.drapeaux.conseilDemandeA ?? -1),
    );
    if (this.fileConseils.length > FILE_MAX) this.fileConseils.length = FILE_MAX;
  }

  /** Chaque tick : expire la question ouverte trop vieille, ouvre la suivante si le budget le permet. */
  private gererConseils(): void {
    const q = this.questionEnCours;
    if (q !== null && this.tick > q.expireA) {
      this.questionEnCours = null;
      this.emettre(
        "conseil",
        this.personnage(q.personnageId) ?? null,
        { questionId: q.id, etape: "reponse", applique: false, raison: "expiree" },
        3,
      );
    }
    if (this.questionEnCours !== null || this.fileConseils.length === 0) return;
    if (this.conseilsDuJour >= this.config.brain.conseilsParJour) return;
    const candidat = this.fileConseils.shift();
    if (candidat === undefined) return;
    const p = this.personnage(candidat.id);
    if (p?.vivant !== true) return;
    // Les motifs sont revérifiés au moment de poser la question.
    const motifs = motifsDeConseil(this, p);
    if (scoreMotifs(motifs) < SEUIL_CONSEIL) return;
    this.ouvrirQuestion(p, motifs);
  }

  /**
   * Applique la réponse de Claude à la question ouverte : le choix doit être
   * une option de la question (on ne fait pas confiance à la page). Journalisé
   * sous `conseil` pour le rejeu.
   */
  conseiller(conseil: Conseil): ResultatConseil {
    const q = this.questionEnCours;
    if (q?.id !== conseil.questionId) return { ok: false, raison: "question_inconnue" };
    const p = this.personnage(q.personnageId);
    const fermer = (raison: string): void => {
      this.questionEnCours = null;
      if (p !== undefined)
        p.dernierConseil = {
          questionId: q.id,
          tick: this.tick,
          motifs: q.motifs,
          options: q.options,
          choix: conseil.choix === "aucun" ? null : conseil.choix,
          libelle: null,
          pensee: conseil.pensee.trim().slice(0, 300),
          but: null,
          applique: false,
          raison,
        };
      this.emettre(
        "conseil",
        p ?? null,
        { questionId: q.id, etape: "reponse", applique: false, raison, choix: conseil.choix },
        4,
      );
    };
    if (this.tick > q.expireA) {
      fermer("expiree");
      return { ok: false, raison: "question_expiree" };
    }
    if (p === undefined || !p.vivant || p.id !== conseil.personnageId) {
      fermer("personnage_mort");
      return { ok: false, raison: "personnage_mort" };
    }
    if (conseil.choix === "aucun") {
      fermer("aucun");
      return { ok: false, raison: "aucun" };
    }
    const option = q.options.find((o) => o.id === conseil.choix);
    if (option === undefined) {
      fermer("option_invalide");
      return { ok: false, raison: "option_invalide" };
    }
    this.questionEnCours = null;
    const ambition = appliquerConseil(this, p, option, conseil);
    p.dernierConseil = {
      questionId: q.id,
      tick: this.tick,
      motifs: q.motifs,
      options: q.options,
      choix: option.id,
      libelle: option.libelle,
      pensee: ambition.pensee,
      but: ambition.but,
      applique: true,
      raison: null,
    };
    this.emettre(
      "conseil",
      p,
      {
        questionId: q.id,
        etape: "reponse",
        applique: true,
        choix: option.id,
        libelle: option.libelle,
        pensee: ambition.pensee,
        but: ambition.but,
        jours: Math.round((ambition.jusqua - ambition.depuis) / this.horloge.ticksParJour),
      },
      7,
    );
    return { ok: true, effet: option.libelle };
  }

  /**
   * Applique une inspiration de Claude : pensée intérieure, récit d'invention
   * ou épitaphe (avec, éventuellement, une leçon du catalogue). Journalisée
   * sous le type `claude`, pour que le mode rejeu la retrouve.
   */
  inspirer(inspiration: Inspiration): boolean {
    const p = this.personnage(inspiration.personnageId);
    if (p === undefined) return false;
    const texte = inspiration.texte.trim().slice(0, 400);
    if (texte.length === 0) return false;
    switch (inspiration.genre) {
      case "pensee":
        p.penseeClaude = { texte, tick: this.tick };
        this.emettre("claude", p, { genre: "pensee", texte }, 1);
        return true;
      case "recit":
        p.memoire.ajouter(this.tick, "reflexion", texte, 8, []);
        this.emettre("claude", p, { genre: "recit", texte }, 7);
        return true;
      case "epitaphe": {
        const tombe = [...this.batiments.values()].find(
          (b) => b.type === "tombe" && b.proprietaire === p.id,
        );
        if (tombe !== undefined) tombe.epitaphe = texte;
        const savoir = inspiration.savoir;
        if (savoir !== undefined && savoir in LECONS) {
          const lecon = savoir as Lecon;
          const eleves = apprenants(this, p).filter((e) =>
            apprendre(e, lecon, 1, p.identite.prenom, this.tick),
          );
          for (const e of eleves) {
            e.memoire.ajouter(
              this.tick,
              "reflexion",
              `La mort de ${p.identite.prenom} m'a appris ceci : ${LECONS[lecon].morale}`,
              8,
              [p.id],
            );
          }
          if (eleves.length > 0) {
            this.emettre(
              "lecon",
              p,
              {
                cause: p.causeDeces ?? "inconnue",
                lecon,
                titre: LECONS[lecon].titre,
                morale: LECONS[lecon].morale,
                apprenants: eleves.length,
              },
              8,
            );
          }
        }
        this.emettre("claude", p, { genre: "epitaphe", texte }, 7);
        return true;
      }
    }
  }

  /**
   * À chaque mort, une tombe et une morale : la famille et les témoins retiennent
   * une ou deux leçons, qui changeront leurs décisions et se transmettront.
   */
  private tirerLeconsDe(defunt: Personnage, cause: string): void {
    const lecons = tirerLecons(this, defunt, cause);
    const f = defunt.identite.sexe === "F";
    const epitaphe =
      lecons[0] !== undefined
        ? `${defunt.identite.prenom}, mort${f ? "e" : ""} de ${cause}. ${LECONS[lecons[0]].morale}`
        : `Ici repose ${defunt.identite.prenom}, mort${f ? "e" : ""} de ${cause}.`;
    // La tombe se creuse sur place, ou sur la tuile libre la plus proche (un mort
    // dans un abri n'y est pas enterré).
    // On enterre à l'écart de l'eau (une tombe près d'un point d'eau le souille), sinon sur place.
    const place =
      this.tuileLibreProche(defunt.corps.position, 8, true) ??
      this.tuileLibreProche(defunt.corps.position, 3);
    if (place !== null) {
      const tombe = this.fonderChantier("tombe", place, defunt);
      tombe.etat = "termine";
      tombe.travailRestant = 0;
      tombe.termineAuTick = this.tick;
      tombe.epitaphe = epitaphe;
    }
    for (const lecon of lecons) {
      const eleves = apprenants(this, defunt).filter((p) =>
        apprendre(p, lecon, 1, defunt.identite.prenom, this.tick),
      );
      for (const p of eleves) {
        p.memoire.ajouter(
          this.tick,
          "reflexion",
          `La mort de ${defunt.identite.prenom} m'a appris ceci : ${LECONS[lecon].morale}`,
          8,
          [defunt.id],
        );
      }
      this.emettre(
        "lecon",
        defunt,
        {
          cause,
          lecon,
          titre: LECONS[lecon].titre,
          morale: LECONS[lecon].morale,
          apprenants: eleves.length,
        },
        8,
      );
    }
  }

  /** Tuile constructible sans bâtiment la plus proche d'une position, dans un rayon donné. */
  private tuileLibreProche(centre: Position, rayon: number, loinDeLEau = false): Position | null {
    let meilleure: Position | null = null;
    let meilleureDistance = Infinity;
    for (let dy = -rayon; dy <= rayon; dy++) {
      for (let dx = -rayon; dx <= rayon; dx++) {
        const pos = { x: centre.x + dx, y: centre.y + dy };
        const d = Math.abs(dx) + Math.abs(dy);
        if (d >= meilleureDistance) continue;
        const tuile = this.grille.tuileOuNull(pos.x, pos.y);
        if (tuile?.batiment !== null || !INFO_BIOME[tuile.biome].constructible) continue;
        if (loinDeLEau && this.eauAMoinsDe(pos, RAYON_SOUILLURE + 1)) continue;
        meilleure = pos;
        meilleureDistance = d;
      }
    }
    return meilleure;
  }

  /** De l'eau (rivière, mer ou puits) à moins de `rayon` tuiles ? */
  private eauAMoinsDe(pos: Position, rayon: number): boolean {
    for (let dy = -rayon; dy <= rayon; dy++)
      for (let dx = -rayon; dx <= rayon; dx++)
        if (estEau(this, pos.x + dx, pos.y + dy)) return true;
    return false;
  }

  /** Crée une simulation neuve à partir d'une configuration (partielle ou non). */
  static creer(partielle: SimConfigPartielle = {}): Simulation {
    const config = fusionnerConfig(partielle);
    validerConfig(config);
    const rng = Rng.depuisGraine(config.seed);
    const grille = genererGrille(rng.fork("monde"), Simulation.optionsGeneration(config, rng));
    return Simulation.creerAvecGrille(config, grille);
  }

  /** Les options de génération d'un monde : le berceau, son abondance, les foyers des peuples. */
  private static optionsGeneration(config: SimConfig, rng: Rng): OptionsGeneration {
    return {
      echelleRelief: config.monde.echelleRelief,
      echelleContinents: config.monde.echelleContinents,
      berceau: config.monde.berceau,
      abondance: abondanceDuBerceau(config.population.initiale),
      ...(config.monde.foyers && config.population.peuples > 1
        ? { foyers: sitesDesPeuples(rng, config.population.peuples) }
        : {}),
    };
  }

  // ------------------------------------------------------------ sauvegarde

  /** L'état complet du monde, prêt à être rangé (JSON) et restauré à l'identique. */
  sauvegarder(): Sauvegarde {
    const etapes = this.sauvegarderParEtapes();
    let s = etapes.suivant(Infinity);
    while (s === null) s = etapes.suivant(Infinity);
    return s;
  }

  /**
   * La même sauvegarde, par étapes : tout est encodé d'un coup sauf les
   * personnages (l'essentiel du poids), qui le sont à la demande, par paquets,
   * pour qu'une page puisse rendre la main entre deux. Le monde ne doit pas
   * bouger d'ici la fin : `suivant` refuse de continuer s'il a avancé.
   */
  sauvegarderParEtapes(): EtapesSauvegarde {
    const etat = this.etatBrut();
    const tick = this.tick;
    const personnages = etat.personnages;
    const enveloppe = encoder({ ...etat, personnages: [] }) as { personnages: unknown[] };
    const encodes = enveloppe.personnages;
    const entete: Omit<Sauvegarde, "date" | "etat"> = {
      format: FORMAT_SAUVEGARDE,
      version: VERSION_SAUVEGARDE,
      seed: String(this.config.seed),
      tick,
      jour: Math.floor(tick / this.horloge.ticksParJour),
      vivants: this.vivants().length,
    };
    return {
      tick,
      total: personnages.length,
      suivant: (n: number): Sauvegarde | null => {
        if (this.tick !== tick) throw new Error("le monde a avancé pendant la sauvegarde");
        const fin = Math.min(personnages.length, encodes.length + Math.max(1, n));
        while (encodes.length < fin) encodes.push(encoder(personnages[encodes.length]));
        return encodes.length < personnages.length
          ? null
          : { ...entete, date: Date.now(), etat: enveloppe };
      },
    };
  }

  /** Tout ce que la sauvegarde contient, tel quel (avant encodage). */
  private etatBrut(): EtatSimulation {
    return {
      config: this.config,
      rng: this.rng.etat(),
      tick: this.tick,
      grille: this.grille.etat(),
      personnages: this.personnages,
      batiments: [...this.batiments.values()],
      troupeaux: [...this.troupeaux.values()],
      betail: [...this.betail.values()],
      danger: this.danger,
      morceauxPeuples: [...this.morceauxPeuples],
      compteurs: {
        betail: this.compteurBetail,
        troupeaux: this.compteurTroupeaux,
        personnages: this.compteurPersonnages,
        batiments: this.compteurBatiments,
        questions: this.compteurQuestions,
      },
      conseilsDuJour: this.conseilsDuJour,
      derniereEpidemieAnnee: this.derniereEpidemieAnnee,
      meteo: this.meteo,
      faveur: {
        valeur: this.faveur.valeur,
        miracles: this.faveur.miracles,
        reputation: this.faveur.reputation,
        prieres: this.faveur.prieres,
        offrandes: this.faveur.offrandes,
        exaucees: this.faveur.exaucees,
        providence: this.faveur.providence,
        culte: this.faveur.culte,
        max: this.faveur.max,
        recharges: [...this.faveur.recharges.entries()],
        domaine: this.faveur.domaine,
        rang: this.faveur.rang,
        usages: [...this.faveur.usages.entries()],
      },
      meteoForcee: this.meteoForcee,
      questionEnCours: this.questionEnCours,
      fileConseils: this.fileConseils,
      journal: this.journal.etat(EVENEMENTS_GARDES),
      societe: this.societe,
      chronique: this.chronique,
      villages: this.villages,
      trouvailles: this.trouvailles,
      lois: this.lois,
      creatures: [...this.creatures.values()],
      compteurCreatures: this.compteurCreatures,
      conteur: this.conteur,
      objectifs: this.objectifs,
    };
  }

  /** Restaure un monde sauvegardé ; lève une erreur si le format n'est pas le bon. */
  static restaurer(sauvegarde: unknown): Simulation {
    if (!estSauvegarde(sauvegarde)) throw new Error("Ce n'est pas une sauvegarde de simulation.");
    if (sauvegarde.version > VERSION_SAUVEGARDE || sauvegarde.version < 1)
      throw new Error(
        `Sauvegarde en version ${String(sauvegarde.version)}, cette simulation lit la version ${String(VERSION_SAUVEGARDE)}.`,
      );
    const etat = migrer(decoder(sauvegarde.etat) as EtatSimulation, sauvegarde.version);
    const config = etat.config;
    const rng = Rng.depuisEtat(etat.rng);
    const racine = Rng.depuisGraine(config.seed);
    const grille = genererGrille(
      racine.fork("monde"),
      Simulation.optionsGeneration(config, racine),
    );
    grille.restaurer(etat.grille);
    const horloge = new Horloge(
      {
        minutesParTick: config.temps.minutesParTick,
        joursParSaison: config.monde.joursParSaison,
      },
      etat.tick,
    );
    return new Simulation(config, rng, horloge, grille, etat);
  }

  /** Crée une simulation sur une grille fournie (tests, scénarios). */
  static creerAvecGrille(partielle: SimConfigPartielle, grille: Grille): Simulation {
    const config = fusionnerConfig(partielle);
    validerConfig(config);
    const rng = Rng.depuisGraine(config.seed);
    const horloge = new Horloge({
      minutesParTick: config.temps.minutesParTick,
      joursParSaison: config.monde.joursParSaison,
    });
    return new Simulation(config, rng, horloge, grille);
  }

  get tick(): number {
    return this.horloge.tick;
  }

  personnage(id: string): Personnage | undefined {
    return this.personnages.find((p) => p.id === id);
  }

  vivants(): Personnage[] {
    return this.personnages.filter((p) => p.vivant);
  }

  cerveau(id: string): Cerveau | undefined {
    return this.cerveaux.get(id);
  }

  /** Remplace le cerveau d'un personnage (mode LLM en M5, tests). */
  definirCerveau(id: string, cerveau: Cerveau): void {
    this.cerveaux.set(id, cerveau);
  }

  emettre(
    type: TypeEvenement,
    acteur: Personnage | null,
    details: Evenement["details"] = {},
    importance = 1,
    position: Position | null = null,
  ): void {
    this.journal.enregistrer({
      tick: this.horloge.tick,
      type,
      acteur: acteur?.id ?? null,
      position: position ?? (acteur ? { ...acteur.corps.position } : null),
      importance,
      details,
    });
  }

  /** Fatigue : l'effort la fait monter, le sommeil et le repos la font descendre. */
  private compterFatigue(p: Personnage, action: TypeAction): void {
    const effort =
      action === "recolter" ||
      action === "construire" ||
      action === "combattre" ||
      action === "deplacer" ||
      action === "fabriquer" ||
      action === "fonder";
    if (p.corps.endormi) {
      fatigueRepos(p, "sommeil");
    } else if (
      action === "se_reposer" ||
      action === "se_rechauffer" ||
      action === "attendre" ||
      action === "veiller" ||
      action === "defendre"
    ) {
      fatigueRepos(p, "repos");
    } else if (effort) {
      const inv = p.corps.inventaire;
      const sacLourd = placeLibre(inv) <= inv.capacite * 0.2;
      fatigueEffort(p, sacLourd, action === "deplacer");
      if (estEpuise(p) && !p.corps.etat.epuisementSignale) {
        p.corps.etat.epuisementSignale = true;
        ajouterHumeur(p, "epuisement", -8, 3 * this.horloge.ticksParJour, this.tick);
        this.emettre("epuisement", p, { fatigue: Math.round(p.corps.etat.fatigue) }, 5);
        p.memoire.ajouter(
          this.tick,
          "observation",
          "Je n'en peux plus ; il faut que je dorme.",
          4,
          [],
        );
      }
    } else {
      fatigueRepos(p, "calme");
    }
  }

  fonderChantier(type: TypeBatiment, position: Position, fondateur: Personnage): Batiment {
    const tuile = this.grille.tuile(position.x, position.y);
    if (tuile.batiment !== null) throw new Error(`Tuile (${position.x}, ${position.y}) déjà bâtie`);
    this.compteurBatiments += 1;
    const id = `b-${String(this.compteurBatiments).padStart(4, "0")}`;
    const b = creerChantier(
      id,
      type,
      position,
      fondateur.id,
      fondateur.identite.nomFamille,
      this.tick,
    );
    this.batiments.set(id, b);
    tuile.batiment = b;
    this.emettre("chantier_fonde", fondateur, { batiment: id, type }, 4, position);
    return b;
  }

  /** Prénoms déjà portés (vivants et morts), pour éviter les doublons. */
  prenomsUtilises(): Set<string> {
    return new Set(this.personnages.map((p) => p.identite.prenom));
  }

  naitre(mere: Personnage, pere: Personnage): Personnage {
    this.compteurPersonnages += 1;
    const id = `p-${String(this.compteurPersonnages).padStart(4, "0")}`;
    const coutume = this.config.social.nomFamille;
    const nomFamille =
      coutume === "pere"
        ? pere.identite.nomFamille
        : coutume === "mere"
          ? mere.identite.nomFamille
          : `${pere.identite.nomFamille}-${mere.identite.nomFamille}`;
    const enfant = creerPersonnage(this.rng, {
      id,
      naissance: this.tick,
      nomFamille,
      parents: [mere.id, pere.id],
      genome: heriterGenome(
        mere.identite.genome,
        pere.identite.genome,
        this.rng.fork(`genome/${id}`),
      ),
      prenomsInterdits: this.prenomsUtilises(),
      position: { ...mere.corps.position },
      ageJours: 0,
      joursParAnnee: this.config.vie.joursParAnnee,
      ageAdulte: this.config.vie.ageAdulte,
      ageAncien: this.config.vie.ageAncien,
      ticksParJour: this.horloge.ticksParJour,
      memoire: {
        maxSouvenirs: this.config.memoire.maxSouvenirs,
        demiVieRecenceJours: this.config.memoire.demiVieRecenceJours,
      },
    });
    enfant.besoins.faim = 80;
    enfant.besoins.soif = 80;
    enfant.corps.sante = 60;
    // La foi s'hérite à moitié, sans descendre sous celle que donnent ses propres valeurs.
    enfant.foi = Math.max(enfant.foi, Math.round((mere.foi + pere.foi) / 4));
    this.personnages.push(enfant);
    this.cerveaux.set(id, new RuleBrain(enfant));
    for (const parent of [mere, pere]) {
      parent.relations.set(id, relationFamiliale(id, "enfant"));
      enfant.relations.set(parent.id, relationFamiliale(parent.id, "parent"));
    }
    for (const autre of this.personnages) {
      if (autre.id === id || autre.identite.parents === null) continue;
      if (autre.identite.parents.some((x) => x === mere.id || x === pere.id)) {
        autre.relations.set(id, relationFamiliale(id, "fratrie"));
        enfant.relations.set(autre.id, relationFamiliale(autre.id, "fratrie"));
      }
    }
    this.emettre(
      "naissance",
      mere,
      {
        enfant: id,
        prenom: enfant.identite.prenom,
        sexe: enfant.identite.sexe,
        pere: pere.id,
        nomFamille,
      },
      10,
    );
    // L'accouchement a ses risques ; une accoucheuse les divise par deux.
    const risque = risqueAccouchement(this, mere);
    const meteo = this.horloge.moment().saison;
    this.emettre(
      "accouchement",
      mere,
      {
        enfant: id,
        accoucheuse: risque.accoucheuse?.identite.prenom ?? null,
        risque: Math.round(risque.probabilite * 1000) / 10,
        saison: meteo,
      },
      6,
    );
    if (risque.accoucheuse !== null) {
      gagnerExperience(risque.accoucheuse.experience, "soin", 10);
      risque.accoucheuse.memoire.ajouter(
        this.tick,
        "action",
        `J'ai aidé ${mere.identite.prenom} à mettre son enfant au monde.`,
        7,
        [mere.id],
      );
    }
    for (const parent of [mere, pere])
      ajouterHumeur(parent, "naissance", 15, 20 * this.horloge.ticksParJour, this.tick);
    naissanceSociete(enfant, mere, pere);
    if (this.rng.fork(`accouchement/${id}`).chance(risque.probabilite)) {
      mere.corps.dernierAccouchement = this.tick;
      this.mourir(mere, "accouchement");
      return enfant;
    }
    const fille = enfant.identite.sexe === "F";
    pere.memoire.ajouter(
      this.tick,
      "action",
      `${enfant.identite.prenom}, ${fille ? "ma fille" : "mon fils"}, est né${fille ? "e" : ""}. ${mere.identite.prenom} va bien.`,
      10,
      [id, mere.id],
      mere.corps.position,
    );
    mere.besoins.moral = Math.min(100, mere.besoins.moral + 20);
    pere.besoins.moral = Math.min(100, pere.besoins.moral + 20);
    return enfant;
  }

  tuer(p: Personnage, cause: string): void {
    this.mourir(p, cause);
  }

  genealogie(): Genealogie {
    return construireGenealogie(this.personnages);
  }

  detruireBatiment(id: string): void {
    const b = this.batiments.get(id);
    if (b === undefined) return;
    // Ce qu'un bâtiment effondré contenait est sauvé dans le stock familial le plus proche.
    if (b.stock !== null) {
      const refuges = [...this.batiments.values()]
        .filter(
          (x) => x.id !== id && x.etat === "termine" && x.stock !== null && x.famille === b.famille,
        )
        .sort(
          (x, y) =>
            Grille.distance(x.position, b.position) - Grille.distance(y.position, b.position),
        );
      for (const refuge of refuges) {
        if (refuge.stock === null) continue;
        for (const [r, n] of Object.entries(b.stock.ressources) as [Ressource, number][])
          transferer(b.stock, refuge.stock, r, n);
      }
    }
    this.batiments.delete(id);
    const tuile = this.grille.tuile(b.position.x, b.position.y);
    if (tuile.batiment?.id === id) tuile.batiment = null;
    for (const p of this.personnages) if (p.projet?.batimentId === id) p.projet = null;
    this.emettre(
      "batiment_effondre",
      null,
      { batiment: id, type: b.type, proprietaire: b.proprietaire },
      6,
      b.position,
    );
  }

  batimentsTermines(type?: TypeBatiment): Batiment[] {
    return [...this.batiments.values()].filter(
      (b) => b.etat === "termine" && (type === undefined || b.type === type),
    );
  }

  statistiques(): Statistiques {
    const vivants = this.vivants().length;
    let chantiers = 0;
    for (const b of this.batiments.values()) if (b.etat === "chantier") chantiers++;
    return {
      tick: this.tick,
      vivants,
      morts: this.personnages.length - vivants,
      evenements: this.journal.taille,
      batiments: this.batiments.size - chantiers,
      chantiers,
      meteo: this.meteo,
    };
  }

  /** Avance la simulation d'un tick. */
  tick1(): void {
    if (this.horloge.estAube() && this.tick > 0) this.nouveauJour();
    // La repousse se calcule à l'heure (six ticks), pas au tick : mêmes quantités, six fois moins de parcours.
    if (this.tick % 6 === 0) this.regenererGisements();
    this.peuplerFaune();
    if (this.tick % 6 === 0) {
      for (const t of this.troupeaux.values()) heureTroupeau(this, t);
      if (this.lois.betes) this.heureDeDanger();
      if (this.lois.maladies) heureContagion(this);
      this.heureDuBetail();
      providence(this, this.faveur);
      heureSociete(this);
      heureVillages(this, this.rng.fork(`villages/${String(this.tick)}`));
      if (this.creatures.size > 0)
        heureCreatures(this, this.creatures, this.rng.fork(`creatures/${String(this.tick)}`));
    }
    const moment = this.horloge.moment();
    if (moment.heure === 21 && moment.minute === 0) this.soiree();
    this.gererConseils();
    tickBatailles(this);
    if (this.creatures.size > 0) gardienRepousse(this, this.creatures.values());
    for (const t of this.troupeaux.values()) if (t.taille <= 0) this.troupeaux.delete(t.id);
    const ordre = this.rng.fork(`tick/${this.tick}`).melanger(this.vivants());
    for (const p of ordre) this.tickPersonnage(p);
    this.horloge.avancer(1);
  }

  avancer(n: number): void {
    for (let i = 0; i < n; i++) this.tick1();
  }

  avancerJusquaAube(): void {
    this.avancer(this.horloge.prochaineAube() - this.horloge.tick);
  }

  /** Aube : météo du jour, usure des bâtiments, tempêtes, vieillissement. */
  private nouveauJour(): void {
    const moment = this.horloge.moment();
    this.meteo = tirerMeteo(this.rng, moment.saison, moment.jourAbsolu);
    if (this.meteoForcee !== null) {
      if (moment.jourAbsolu <= this.meteoForcee.jusquaJour) this.meteo = this.meteoForcee.meteo;
      else this.meteoForcee = null;
    }
    this.emettre(
      "meteo",
      null,
      { meteo: this.meteo, saison: moment.saison, jour: moment.jourAbsolu },
      1,
    );
    const tempete = EFFETS_METEO[this.meteo].tempete;
    for (const b of [...this.batiments.values()]) {
      if (b.etat !== "termine") continue;
      b.solidite -= tempete ? 3 : 0.5;
      if (tempete && b.type === "feu_de_camp" && b.allume) {
        b.allume = false;
        this.emettre("feu_eteint", null, { batiment: b.id }, 3, b.position);
      }
      if (b.solidite <= 0) this.detruireBatiment(b.id);
    }
    if (this.tick > 0) {
      for (const p of this.vivants()) {
        p.corps.ageJours += 1;
        tickVieQuotidien(this, p);
        if (p.vivant) passeQuotidienneCorps(this, p);
      }
      this.jourFaune();
      this.jourDuTemps();
      this.jourDuVillage();
      this.regenererBassins();
      aubeSociete(this);
      for (const p of this.vivants()) {
        aubePsyche(this, p);
        elaguerConnaissance(p);
      }
      aubeVillages(
        this,
        this.rng.fork(`villages/aube/${String(this.tick)}`),
        this.societe.tension,
        this.societe.factions,
        { raids: this.lois.raids, schismes: this.lois.schismes, guerres: this.lois.guerres },
      );
      if (this.lois.guerres) aubeBatailles(this, this.rng.fork(`batailles/${String(this.tick)}`));
      aubeRevoltes(this);
    }
    if (this.tick > 0) {
      this.conseilsDuJour = 0;
      gagnerFaveur(this.faveur, FAVEUR_PAR_JOUR);
      if (moment.jourDeSaison === 1) {
        saisonSansMiracle(this);
        saisonDuCiel(this.faveur);
      }
      jourDuCiel(this, this.faveur);
      if (this.lois.conteur)
        jourDuConteur(this, this.conteur, this.rng.fork(`conteur/${String(moment.jourAbsolu)}`));
      this.jourDesButs();
      for (const c of jourCreatures(this.creatures, moment.jourAbsolu)) {
        const fiche = ficheCreature(c);
        this.emettre(
          "divin",
          null,
          { pouvoir: "creature_partie", genre: c.genre, nom: fiche.nom, faits: c.faits },
          5,
          { ...c.position },
        );
      }
      for (const p of this.vivants()) {
        jourCompteurs(p);
        const issue = jourAmbition(this, p);
        if (issue !== null && p.ambition !== null) {
          const a = p.ambition;
          this.emettre(
            "ambition",
            p,
            { genre: a.genre, cible: a.cible, but: a.but, issue },
            issue === "accomplie" ? 7 : 5,
          );
          p.memoire.ajouter(
            this.tick,
            "reflexion",
            issue === "accomplie"
              ? `J'ai obtenu ce que je voulais : ${a.but}.`
              : `J'ai renoncé : ${a.but}.`,
            6,
            [],
          );
          ajouterHumeur(
            p,
            "ambition",
            issue === "accomplie" ? 10 : -5,
            5 * this.horloge.ticksParJour,
            this.tick,
          );
        }
      }
    }
    for (const p of this.vivants()) {
      p.drapeaux.faimMinDuJour = p.besoins.faim;
      p.drapeaux.chaleurMinDuJour = p.besoins.chaleur;
    }
  }

  /** Soir (21 h) : chacun fait le bilan de sa journée. */
  private soiree(): void {
    for (const p of this.vivants()) {
      this.reflechirPour(p);
      apprentissageDuSoir(this, p);
      soirPsyche(p);
    }
    soireeSociete(this);
    this.inscrireCandidats();
  }

  /**
   * Peuple de troupeaux chaque morceau du monde nouvellement généré, à partir
   * d'un flux aléatoire propre au morceau (même monde, même faune).
   */
  private peuplerFaune(): void {
    if (this.grille.nombreMorceaux === this.morceauxPeuples.size) return;
    for (const m of this.grille.morceauxGeneres()) {
      const cle = cleMorceau(m.cx, m.cy);
      if (this.morceauxPeuples.has(cle)) continue;
      this.morceauxPeuples.add(cle);
      const rng = this.rng.fork(`faune/${m.cx}:${m.cy}`);
      for (const t of peuplerMorceau(m, rng, () => `faune-${++this.compteurTroupeaux}`))
        this.troupeaux.set(t.id, t);
    }
  }

  /**
   * Une heure du directeur de danger : menaces, traces, alarme, et le combat
   * quand une meute atteint sa proie.
   */
  private heureDeDanger(): void {
    const effets = heureDanger(
      this,
      this.danger,
      this.rng.fork(`danger/${String(this.tick)}`),
      (pos) => {
        const id = `faune-${String(++this.compteurTroupeaux)}`;
        const meute: Troupeau = {
          id,
          espece: "loup",
          position: { ...pos },
          gite: { ...pos },
          giteEte: { ...pos },
          taille: 3,
          mefiance: 0,
          etat: "pature",
          cible: null,
          faim: 0,
          derniereMiseBas: 0,
          proieHumaine: null,
          enMenace: false,
          rng: this.rng.fork(id),
        };
        this.troupeaux.set(id, meute);
        return meute;
      },
    );
    for (const e of effets) {
      if (e.genre === "arrivee") {
        this.emettre(
          "faune",
          null,
          {
            genre: "arrivee",
            espece: "loup",
            nom: "loups",
            nombre: e.meute.taille,
            taille: e.meute.taille,
            troupeau: e.meute.id,
            proie: null,
          },
          4,
          e.meute.position,
        );
        continue;
      }
      if (e.genre === "alarme") {
        this.emettre(
          "alarme",
          e.personnage,
          { meute: e.meute.id, loups: e.meute.taille },
          8,
          e.personnage?.corps.position ?? e.meute.position,
        );
        continue;
      }
      this.emettre(
        "menace",
        e.personnage,
        { genre: e.genre, meute: e.meute.id, loups: e.meute.taille },
        e.genre === "traces" ? 6 : 2,
        e.genre === "traces"
          ? (e.personnage?.corps.position ?? e.meute.position)
          : e.meute.position,
      );
    }
    const menace = this.danger.menace;
    if (menace === null) return;
    const meute = this.troupeaux.get(menace.meute);
    if (meute === undefined) return;
    const proie = proieAuContact(this, meute);
    if (proie === null) return;
    if (batailleActive(this) !== null) return;
    // M32c : le combat se joue tick par tick ; l'événement `combat` vient à sa conclusion.
    this.danger.attaques += 1;
    this.danger.menace = null;
    this.danger.repitJusqua = this.tick + REPIT_TICKS;
    lancerBatailleMeute(this, meute, proie);
    // Après le combat, tout le voisinage est en alerte : on se replie, on secourt.
    for (const p of this.personnages) {
      if (p.vivant && Grille.distance(p.corps.position, proie.corps.position) <= 12)
        p.drapeaux.alerteJusqua = this.tick + 36;
    }
  }

  /** La première épidémie ne peut frapper qu'à partir du deuxième hiver. */
  private derniereEpidemieAnnee = 0;

  /**
   * Aube (jalon « le temps compte ») : les feux brûlent leurs bûches, la
   * nourriture vieillit et se gâte, les maladies suivent leur cours, et une
   * toux grise arrive de loin au plus tous les deux ans, au premier jour de l'hiver.
   */
  private jourDuTemps(): void {
    const moment = this.horloge.moment();
    const saisonFroide = moment.saison === "automne" || moment.saison === "hiver";
    const buches =
      this.meteo === "neige"
        ? BUCHES_PAR_JOUR_NEIGE
        : saisonFroide
          ? BUCHES_PAR_JOUR_FROID
          : BUCHES_PAR_JOUR;
    for (const b of this.batiments.values()) {
      if (b.etat !== "termine" || !b.allume || PLANS_BATIMENT[b.type].atelier !== "feu") continue;
      if (b.reserveBois >= buches) {
        b.reserveBois -= buches;
      } else {
        b.reserveBois = 0;
        b.allume = false;
        this.emettre("feu_eteint", null, { batiment: b.id, raison: "plus de bois" }, 4, b.position);
      }
    }
    // Le froid conserve : quatre fois plus longtemps l'hiver, deux fois et demie l'automne.
    const froid = moment.saison === "hiver" ? 4 : moment.saison === "automne" ? 2.5 : 1;
    for (const b of this.batiments.values()) {
      if (b.stock === null || b.etat !== "termine") continue;
      // Ce que la famille sait conserver (M38) allonge la garde de ses stocks.
      const su = bonusSu(
        this.trouvailles,
        this.vivants()
          .filter((p) => p.identite.nomFamille === b.famille)
          .map((p) => p.savoirs.keys()),
        "conservation",
      );
      const conservation = froid * (b.type === "entrepot" ? 2 : 1) * su;
      for (const perte of pourrir(b.stock, conservation)) {
        if (perte.ressource === "poisson") {
          for (const p of this.vivants())
            if (p.identite.nomFamille === b.famille)
              p.drapeaux.nourritureGateeJusqua = this.tick + 20 * this.horloge.ticksParJour;
        }
        this.emettre(
          "pourriture",
          null,
          { ressource: perte.ressource, quantite: perte.quantite, lieu: b.type, batiment: b.id },
          2,
          b.position,
        );
      }
    }
    for (const p of this.vivants()) {
      for (const perte of pourrir(
        p.corps.inventaire,
        froid * bonusPorte(this.trouvailles, p.corps.inventaire, "conservation"),
      )) {
        if (perte.ressource === "poisson")
          p.drapeaux.nourritureGateeJusqua = this.tick + 20 * this.horloge.ticksParJour;
        this.emettre(
          "pourriture",
          p,
          { ressource: perte.ressource, quantite: perte.quantite, lieu: "sac", batiment: null },
          2,
        );
      }
      jourMaladies(this, p);
    }
    if (
      this.lois.maladies &&
      moment.saison === "hiver" &&
      moment.jourDeSaison === 1 &&
      moment.annee - this.derniereEpidemieAnnee >= ANNEES_ENTRE_EPIDEMIES &&
      this.rng.fork(`epidemie/${String(moment.annee)}`).chance(0.5)
    ) {
      const adultes = this.vivants().filter((p) => p.corps.stade !== "enfant");
      const index =
        adultes[
          this.rng
            .fork(`epidemie/${String(moment.annee)}/qui`)
            .entier(0, Math.max(0, adultes.length - 1))
        ];
      if (
        index !== undefined &&
        tomberMalade(this, index, "toux_grise", "une toux venue d'ailleurs") !== null
      ) {
        this.derniereEpidemieAnnee = moment.annee;
        this.emettre(
          "epidemie",
          index,
          { maladie: "toux_grise", nom: "toux grise" },
          7,
          index.corps.position,
        );
      }
    }
  }

  prochainIdBete(): string {
    return `betail-${String(++this.compteurBetail)}`;
  }

  ajouterBete(bete: Bete): void {
    this.betail.set(bete.id, bete);
  }

  retirerBete(id: string): void {
    this.betail.delete(id);
  }

  /** Titre de métier d'un personnage (« la pêcheuse »), s'il en a un. */
  titre(p: Personnage): string | null {
    const gardien = gardienDeLAutel(this);
    if (gardien?.id === p.id)
      return p.identite.sexe === "F" ? "gardienne de l'autel" : "gardien de l'autel";
    return titreDe(p);
  }

  /** Une heure du bétail : à l'enclos, ou derrière son maître, ou en fuite. */
  private heureDuBetail(): void {
    for (const b of [...this.betail.values()]) {
      if (heureBete(this, b) === "fuit") {
        this.betail.delete(b.id);
        this.emettre(
          "betail",
          null,
          { genre: "fuite", espece: b.espece, bete: b.id, famille: b.famille },
          4,
          b.position,
        );
      }
    }
  }

  /** Aube du village : le bétail vit, les champs poussent, on ressème au printemps. */
  private jourDuVillage(): void {
    const moment = this.horloge.moment();
    for (const b of [...this.betail.values()]) {
      const { evenements, nouvelle } = jourBete(
        this,
        b,
        this.rng.fork(`betail/${b.id}/${String(moment.jourAbsolu)}`),
        () => this.prochainIdBete(),
      );
      for (const e of evenements) {
        if (e.genre === "fuite" || e.genre === "famine") this.betail.delete(b.id);
        this.emettre(
          "betail",
          null,
          {
            genre: e.genre,
            espece: e.bete.espece,
            bete: e.bete.id,
            famille: e.bete.famille,
            quantite: e.quantite,
          },
          e.genre === "naissance" || e.genre === "famine" || e.genre === "fuite" ? 5 : 2,
          e.bete.position,
        );
      }
      if (nouvelle !== null) this.betail.set(nouvelle.id, nouvelle);
    }
    for (const champ of this.batiments.values()) {
      if (champ.type !== "champ" || champ.etat !== "termine") continue;
      const competence = Math.max(
        0,
        ...this.vivants()
          .filter((p) => p.identite.nomFamille === champ.famille)
          .map((p) => niveau(p.experience.agriculture)),
      );
      for (const e of jourChamp(this, champ, competence))
        this.emettre(
          "champ",
          null,
          { genre: e.genre, batiment: champ.id, famille: champ.famille },
          e.genre === "mur" || e.genre === "gel" ? 5 : 3,
          champ.position,
        );
      // Au printemps, un champ vide est ressemé avec les graines du stock familial.
      if (
        moment.saison === "printemps" &&
        moment.jourDeSaison <= 20 &&
        champ.culture !== null &&
        !champ.culture.seme
      ) {
        const stock = [...this.batiments.values()].find(
          (b) =>
            b.famille === champ.famille &&
            b.etat === "termine" &&
            b.stock !== null &&
            (b.stock.ressources.graines ?? 0) >= 4,
        );
        if (stock?.stock && retirer(stock.stock, "graines", 4) === 4 && semer(champ))
          this.emettre(
            "semis",
            null,
            { batiment: champ.id, famille: champ.famille },
            4,
            champ.position,
          );
      }
    }
  }

  /** Aube : démographie de la faune (mises bas, hiver, scissions, meutes). */
  private jourFaune(): void {
    const nouveaux: Troupeau[] = [];
    for (const t of [...this.troupeaux.values()]) {
      const { evenements, scission } = jourTroupeau(
        this,
        t,
        () => `faune-${++this.compteurTroupeaux}`,
      );
      if (scission !== null) nouveaux.push(scission);
      for (const e of evenements) {
        const profil = PROFILS[e.troupeau.espece];
        this.emettre(
          "faune",
          null,
          {
            genre: e.genre,
            espece: e.troupeau.espece,
            nom: profil.pluriel,
            nombre: e.nombre,
            taille: e.troupeau.taille,
            troupeau: e.troupeau.id,
            proie: e.proie !== undefined ? PROFILS[e.proie.espece].nom : null,
          },
          e.genre === "meute" || e.genre === "disparition" || e.genre === "naissances" ? 3 : 2,
          e.troupeau.position,
        );
      }
    }
    for (const t of nouveaux) this.troupeaux.set(t.id, t);
    for (const t of [...this.troupeaux.values()]) if (t.taille <= 0) this.troupeaux.delete(t.id);
  }

  /**
   * Bancs de poissons : croissance logistique par bassin (un morceau du monde),
   * répartie sur les gisements les plus entamés ; un bassin presque vide
   * se repeuple lentement depuis les bassins voisins.
   */
  private regenererBassins(): void {
    const bassins = new Map<number, Gisement[]>();
    for (const t of this.grille.tuilesAvecGisement()) {
      const g = t.gisement;
      if (g?.type !== "poisson") continue;
      const cle =
        (Math.floor(t.x / COTE_BASSIN) + 1048576) * 2097152 +
        (Math.floor(t.y / COTE_BASSIN) + 1048576);
      const liste = bassins.get(cle);
      if (liste === undefined) bassins.set(cle, [g]);
      else liste.push(g);
    }
    for (const bancs of bassins.values()) {
      let n = 0;
      let k = 0;
      for (const g of bancs) {
        n += g.quantite;
        k += g.max;
      }
      if (k <= 0 || n >= k) continue;
      let croissance = CROISSANCE_POISSON * n * (1 - n / k);
      if (n < 0.1 * k) croissance += IMMIGRATION_POISSON;
      const manque = k - n;
      for (const g of bancs) {
        const part = ((g.max - g.quantite) / manque) * croissance;
        g.quantite = Math.min(g.max, g.quantite + part);
      }
    }
  }

  private regenererGisements(): void {
    const moment = this.horloge.moment();
    const facteurBaies =
      EFFETS_SAISON[moment.saison].regenBaies * EFFETS_METEO[this.meteo].regenBaies;
    const parTick = 6 / this.horloge.ticksParJour;
    for (const tuile of this.grille.tuilesAvecGisement()) {
      const gisement = tuile.gisement;
      if (gisement === null || gisement.tauxRegen <= 0 || gisement.quantite >= gisement.max)
        continue;
      // Les bancs de poissons croissent par bassin, à l'aube.
      if (gisement.type === "poisson") continue;
      // Une souche ne repousse qu'après cent quatre-vingts jours.
      if (gisement.epuiseDepuis != null) {
        if (this.tick - gisement.epuiseDepuis < JOURS_REPOUSSE_SOUCHE * this.horloge.ticksParJour)
          continue;
        gisement.epuiseDepuis = null;
      }
      const facteur = gisement.type === "baies" || gisement.type === "herbes" ? facteurBaies : 1;
      if (facteur <= 0) continue;
      gisement.quantite = Math.min(
        gisement.max,
        gisement.quantite + gisement.tauxRegen * facteur * parTick,
      );
    }
  }

  private tickPersonnage(p: Personnage): void {
    const moment = this.horloge.moment();
    const pos = p.corps.position;
    const enCompagnie = this.personnages.some(
      (a) => a.vivant && a.id !== p.id && Grille.distance(a.corps.position, pos) <= 2,
    );

    // Chaleur : pertes (saison × météo) atténuées par l'abri et le vêtement, gains de l'abri et du feu.
    const saison = EFFETS_SAISON[moment.saison];
    const meteo = EFFETS_METEO[this.meteo];
    const batimentIci = this.grille.tuile(pos.x, pos.y).batiment;
    const abriIci =
      batimentIci !== null &&
      batimentIci.etat === "termine" &&
      PLANS_BATIMENT[batimentIci.type].abri
        ? batimentIci
        : null;
    let perteChaleur = (moment.estNuit ? saison.froidNuit : saison.froidJour) * meteo.froid;
    let gainChaleur = 0;
    if (abriIci !== null) {
      perteChaleur *= 0.3;
      gainChaleur += PLANS_BATIMENT[abriIci.type].chaleur;
    }
    const feu = feuProche(this, pos);
    if (feu !== null) {
      gainChaleur += PLANS_BATIMENT[feu.type].chaleur;
      perteChaleur *= 0.7;
    }
    if (possede(p.corps.inventaire, "vetement_cuir")) perteChaleur *= 0.6;
    // Ce qu'on porte de chaud, né de la grammaire (M38).
    perteChaleur /= bonusPorte(this.trouvailles, p.corps.inventaire, "chaleur");
    const surCouche = p.corps.endormi && abriIci !== null && possede(p.corps.inventaire, "couche");
    if (surCouche) perteChaleur *= 0.8;

    const effet = appliquerTickBesoins(p.besoins, {
      ticksParJour: this.horloge.ticksParJour,
      estNuit: moment.estNuit,
      dort: p.corps.endormi,
      aAbri: abriIci !== null,
      aCouche: surCouche,
      enCompagnie,
      extraversion: p.identite.personnalite.extraversion,
      perteChaleur,
      gainChaleur,
      facteurSoif: meteo.soif,
      facteurFaim:
        (p.corps.enceinte !== null ? 1.3 : p.corps.stade === "enfant" ? 0.7 : 1) *
        (p.corps.etat.carence === "ventre_creux" ? 1.15 : 1) *
        facteurFaimMaladies(p),
      humeur: humeur(p, this.tick),
    });
    // Sources de dégâts nommées : besoins vitaux, puis le corps (hémorragie, infection, carence).
    const T = this.horloge.ticksParJour;
    const sources = sourcesDegats(p, this.tick);
    let deltaSante = effet.deltaSante;
    // Loi suspendue : la faim ne tue pas (elle ronge le moral, pas la santé).
    const causes = this.lois.faim ? effet.causes : effet.causes.filter((c) => c !== "faim");
    if (causes.length !== effet.causes.length) deltaSante += 10 / T;
    const blesse = p.corps.etat.blessures.length > 0;
    if (deltaSante > 0 && blesse) {
      // Convalescence : on ne se répare qu'au repos, au chaud, sans saigner.
      const auRepos = p.corps.endormi || p.actionEnCours?.type === "se_reposer";
      deltaSante = saigne(p) ? 0 : auRepos && abriIci !== null ? 5 / T : 2 / T;
    }
    for (const source of sources) deltaSante -= source.perteParJour / T;
    p.corps.sante = Math.min(100, p.corps.sante + deltaSante);
    if (blesse && (p.corps.endormi || p.actionEnCours?.type === "se_reposer"))
      for (const b of p.corps.etat.blessures) b.ticksRepos += 1;
    p.drapeaux.faimMinDuJour = Math.min(p.drapeaux.faimMinDuJour, p.besoins.faim);
    p.drapeaux.chaleurMinDuJour = Math.min(p.drapeaux.chaleurMinDuJour, p.besoins.chaleur);
    if (p.corps.sante <= 0) {
      const vitales: Record<string, number> = { soif: 25, froid: 15, faim: 10 };
      let cause = "inconnue";
      let pire = 0;
      for (const c of causes) {
        const perte = vitales[c] ?? 0;
        if (perte > pire) {
          pire = perte;
          cause = c;
        }
      }
      for (const source of sources) {
        if (source.perteParJour > pire) {
          pire = source.perteParJour;
          cause = source.cause;
        }
      }
      this.mourir(p, cause);
      return;
    }

    // Projet orphelin (bâtiment détruit ou terminé par d'autres).
    if (p.projet !== null) {
      const b = this.batiments.get(p.projet.batimentId);
      if (b === undefined || b.etat === "termine") p.projet = null;
    }

    // Observation (connaissance des lieux) dès qu'on a bougé, sinon toutes les quatre heures de
    // veille ou une fois par nuit de sommeil : rien ne change autour de qui ne bouge pas.
    const d = p.drapeaux;
    const { x, y } = p.corps.position;
    const aBouge = d.observeX !== x || d.observeY !== y;
    const delai = p.corps.endormi ? 24 : 4;
    if (aBouge || d.observeTick === undefined || this.tick - d.observeTick >= delai) {
      const vue = capacites(p, this.config.vie.joursParAnnee, this.tick).vue;
      observer(this, p, Math.max(1, Math.round(rayonVision(this, moment) * vue)));
      d.observeTick = this.tick;
      d.observeX = x;
      d.observeY = y;
    }
    const legere = percevoirLeger(this, p);
    const cerveau = this.cerveaux.get(p.id);
    if (cerveau === undefined) return;

    if (!p.corps.endormi) {
      const urgence = this.tick >= p.urgenceIgnoreeJusqua ? cerveau.urgence(legere) : null;
      if (urgence !== null) {
        if (!memeIntention(urgence, p.intention)) {
          this.definirIntention(p, urgence);
          p.plan = [];
          p.actionEnCours = null;
        }
      } else if (p.besoins.sommeil <= 0) {
        // Épuisement sans urgence vitale : on s'endort sur place.
        this.definirIntention(p, { type: "dormir" });
        p.plan = [];
        p.actionEnCours = { type: "dormir", ticksDormis: 0 };
      }
    }

    if (p.actionEnCours === null && p.plan.length === 0) {
      const perception = percevoir(this, p, false);
      if (p.intention === null) this.definirIntention(p, cerveau.decider(perception));
      const intention = p.intention;
      if (intention === null) return;
      const resultat = planifier(this, p, intention);
      if (resultat.ok) {
        p.plan = resultat.plan;
        p.echecsConsecutifs = 0;
      } else {
        this.echouer(p, decrireIntention(intention), resultat.raison);
        p.intention = null;
        // Une urgence impossible à planifier (aucune eau connue…) est mise en sommeil
        // deux heures, sinon elle annulerait le repli à chaque tick sans jamais bouger.
        if (memeIntention(intention, cerveau.urgence(legere))) {
          p.urgenceIgnoreeJusqua = this.tick + 12;
        }
        // Repli : un enfant rejoint un parent, un adulte bouge pour découvrir autre chose.
        const parent =
          p.corps.stade === "enfant"
            ? p.identite.parents?.find((id) => this.personnage(id)?.vivant)
            : undefined;
        const repli = planifier(
          this,
          p,
          parent !== undefined ? { type: "suivre", cible: parent } : { type: "explorer" },
        );
        if (repli.ok) p.plan = repli.plan;
        return;
      }
    }

    p.actionEnCours ??= p.plan.shift() ?? null;
    const action = p.actionEnCours;
    if (action === null) return;

    const resultat = executerTick(this, p, action);
    this.compterFatigue(p, action.type);
    if (resultat.statut === "terminee") {
      p.actionEnCours = null;
      if (p.plan.length === 0) {
        this.emettre(
          "action_terminee",
          p,
          { intention: decrireIntention(p.intention ?? { type: "attendre", ticks: 0 }) },
          1,
        );
        p.intention = null;
      }
    } else if (resultat.statut === "echec") {
      this.echouer(p, decrireAction(action), resultat.raison);
      p.actionEnCours = null;
      p.plan = [];
      p.intention = null;
      p.corps.endormi = false;
      sommeilChange();
    }
  }

  private definirIntention(p: Personnage, intention: Intention): void {
    p.intention = intention;
    noterIntention(p, intention.type);
    this.emettre("intention", p, { intention: decrireIntention(intention) }, 1);
  }

  private echouer(p: Personnage, action: string, raison: string): void {
    p.dernierEchec = { tick: this.tick, action, raison };
    p.echecsConsecutifs += 1;
    this.emettre("action_echouee", p, { action, raison }, 1);
  }

  private mourir(p: Personnage, cause: string): void {
    p.vivant = false;
    p.causeDeces = cause;
    p.tickDeces = this.tick;
    p.corps.endormi = false;
    sommeilChange();
    p.actionEnCours = null;
    p.plan = [];
    p.intention = null;
    p.projet = null;
    this.emettre("deces", p, { cause, prenom: p.identite.prenom, ageJours: p.corps.ageJours }, 10);
    heriter(this, p); // avant le deuil, qui rompt l'union
    deuil(this, p, cause);
    this.tirerLeconsDe(p, cause);
    mortSociete(this, p, cause);
    mortPsyche(this, p, cause);
    // Un mort n'a plus besoin de sa carte mentale (elle pesait lourd dans les sauvegardes).
    p.connaissance.clear();
    for (const enfant of this.personnages) {
      if (enfant.vivant && (enfant.identite.parents?.includes(p.id) ?? false))
        adopter(this, enfant);
    }
  }
}
