/**
 * Construction des messages du protocole à partir de l'état de la simulation.
 * Tout ce que le viewer affiche passe par ici (section 13).
 */
import {
  ficheCreature,
  BIOMES,
  Grille,
  COMPETENCES,
  PLANS_BATIMENT,
  TAILLE_MORCEAU,
  INVENTIONS,
  LECONS,
  SEUIL_SAVOIR,
  cleMorceau,
  estLecon,
  titreSavoir,
  avancementGrossesse,
  capacites,
  estEpuise,
  PROFILS,
  PROFILS_MALADIE,
  recensement,
  codeBiome,
  decrireAction,
  decrireIntention,
  materiauxManquants,
  niveau,
  partenaireDe,
  rayonVision,
  estBanni,
  estNotable,
  notables,
  adultes,
  connait,
  nomDuLieu,
  habitants,
  nourritureDe,
  forceDe,
  possede,
  RAYON_CHAMP,
} from "@sdv/core";
import type {
  Evenement,
  Personnage,
  Simulation,
  Intention,
  Invention,
  Lecon,
  Savoir,
  TypeBatiment,
  TypeObjet,
  CampBataille,
} from "@sdv/core";
import type {
  AmbitionFiche,
  AmbitionStat,
  BatimentEtat,
  CampEtat,
  ConseilFiche,
  BilanSaison,
  EvenementEtat,
  GisementEtat,
  MessageEtat,
  SocieteEtat,
  ChroniqueEtat,
  PsycheFiche,
  VillagesEtat,
  MessageFiche,
  TroupeauEtat,
  MessageInit,
  PersonnageEtat,
  PersonneCourte,
  SavoirStat,
  Statistiques,
  ButsEtat,
} from "@sdv/protocole";
import { FICHES_SCENARIO, FICHES_SUCCES, SUCCES } from "@sdv/protocole";

export function messageInit(sim: Simulation): MessageInit {
  return {
    type: "init",
    seed: String(sim.config.seed),
    tailleMorceau: TAILLE_MORCEAU,
    nomsBiomes: [...BIOMES],
    ticksParJour: sim.horloge.ticksParJour,
    joursParSaison: sim.config.monde.joursParSaison,
    modeCerveau: sim.config.brain.mode,
  };
}

export function etatPersonnage(sim: Simulation, p: Personnage): PersonnageEtat {
  const b = p.besoins;
  return {
    id: p.id,
    prenom: p.identite.prenom,
    nomFamille: p.identite.nomFamille,
    sexe: p.identite.sexe,
    vivant: p.vivant,
    x: p.corps.position.x,
    y: p.corps.position.y,
    endormi: p.corps.endormi,
    stade: p.corps.stade,
    enceinte: p.corps.enceinte !== null,
    sante: arrondir(p.corps.sante),
    besoins: {
      faim: arrondir(b.faim),
      soif: arrondir(b.soif),
      sommeil: arrondir(b.sommeil),
      chaleur: arrondir(b.chaleur),
      securite: arrondir(b.securite),
      social: arrondir(b.social),
      moral: arrondir(b.moral),
    },
    intention: p.intention ? decrireIntention(p.intention) : null,
    action: p.actionEnCours ? decrireAction(p.actionEnCours) : null,
    parents: p.identite.parents,
    partenaire: partenaireDe(sim, p)?.id ?? null,
    causeDeces: p.causeDeces,
    teint: p.identite.apparence.teint,
    cheveux: p.identite.apparence.cheveux,
    blesse: p.corps.etat.blessures.length > 0,
    epuise: estEpuise(p),
    alerte: p.drapeaux.alerteJusqua > sim.tick,
    malade: p.corps.etat.maladies.length > 0,
    metier: sim.titre(p),
    notable: estNotable(sim, p),
    banni: estBanni(sim, p),
    abattu: p.psyche.abattu,
    foi: Math.round(p.foi * 10) / 10,
    outil: outilEnMain(p),
  };
}

/** L'outil qu'un personnage tient, d'après ce qu'il veut faire et ce qu'il porte (M31). */
export function outilEnMain(p: Personnage): string | null {
  const i = p.intention;
  if (i === null) return null;
  const inv = p.corps.inventaire;
  const a = (type: TypeObjet): boolean => possede(inv, type);
  const arme = (): string | null => (a("arc") ? "arc" : a("lance") ? "lance" : null);
  switch (i.type) {
    case "recolter":
      switch (i.ressource) {
        case "bois":
          return a("hache_cuivre") ? "hache_cuivre" : a("hache_pierre") ? "hache" : null;
        case "pierre":
        case "minerai":
        case "cuivre":
          return a("pioche_cuivre") ? "pioche_cuivre" : a("pioche") ? "pioche" : null;
        case "poisson":
          return a("canne_a_peche") || a("filet") ? "canne" : null;
        case "gibier":
          return arme();
        default:
          return null;
      }
    case "abattre":
    case "defendre":
    case "veiller":
    case "combattre":
      return arme();
    case "construire":
    case "reparer":
      return "marteau";
    default:
      return null;
  }
}

/** Les villages, pour l'onglet Village et la carte. */
export function villagesEtat(sim: Simulation): VillagesEtat {
  const e = sim.villages;
  const centre = (id: string): { x: number; y: number } | null =>
    e.villages.find((v) => v.id === id)?.centre ?? null;
  return {
    villages: e.villages.map((v) => ({
      id: v.id,
      nom: v.nom,
      x: v.centre.x,
      y: v.centre.y,
      familles: [...v.familles],
      habitants: habitants(sim, v).length,
      fondeJour: v.fondeJour,
      origine: v.origine,
      enRoute: v.enRoute.length,
      nourriture: nourritureDe(sim, v),
      force: Math.round(forceDe(sim, v)),
    })),
    relations: e.relations.map((r) => ({
      a: r.a,
      b: r.b,
      attitude: Math.round(r.attitude),
      etat: r.etat,
      casusBelli: r.casusBelli,
      batailles: r.batailles,
    })),
    bandes: e.bandes
      .filter((b) => b.etat !== "parti")
      .map((b) => ({
        id: b.id,
        x: b.position.x,
        y: b.position.y,
        taille: b.taille,
        etat: b.etat,
        cible: b.cible,
      })),
    caravanes: e.caravanes
      .filter((c) => c.etat === "route")
      .map((c) => ({
        id: c.id,
        x: c.position.x,
        y: c.position.y,
        de: c.de,
        vers: c.vers,
        etat: c.etat,
        quantite: Object.values(c.cargaison).reduce((t, n) => t + n, 0),
        invention: c.invention,
      })),
    routes: e.routes
      .map((cle) => {
        const [a = "", b = ""] = cle.split("|");
        const ca = centre(a);
        const cb = centre(b);
        return ca === null || cb === null ? null : ([ca.x, ca.y, cb.x, cb.y] as const);
      })
      .filter((r): r is readonly [number, number, number, number] => r !== null),
    batailles: e.batailles.map((b) => ({
      id: b.id,
      genre: b.genre,
      phase: b.phase,
      attaquant: campEtat(sim, b.attaquant),
      defenseur: campEtat(sim, b.defenseur),
      x: b.lieu.x,
      y: b.lieu.y,
      rayon: RAYON_CHAMP,
      debutTick: b.debutTick,
      combatTick: b.combatTick,
      finTick: b.finTick,
      issue: b.issue,
      frappes: b.frappes.map((f) => ({ ...f })),
    })),
  };
}

function campEtat(sim: Simulation, c: CampBataille): CampEtat {
  const nom =
    c.village === null
      ? "des étrangers"
      : (sim.villages.villages.find((v) => v.id === c.village)?.nom ?? c.village);
  return {
    village: c.village,
    nom,
    guerriers: [...c.guerriers],
    forceInitiale: c.forceInitiale,
    blesses: c.blesses,
    morts: c.morts,
  };
}

/** La mémoire collective, pour la page « Légendes » et la carte. */
/** Les buts (M26) : tous les succès (débloqués ou non), le scénario, les prophéties. */
export function butsEtat(sim: Simulation): ButsEtat {
  const o = sim.objectifs;
  const jours = new Map(o.succes.map((s) => [s.id, s.jour]));
  const sc = o.scenario;
  return {
    succes: SUCCES.map((id) => ({
      id,
      nom: FICHES_SUCCES[id].nom,
      emoji: FICHES_SUCCES[id].emoji,
      description: FICHES_SUCCES[id].description,
      jour: jours.get(id) ?? null,
    })),
    scenario:
      sc === null
        ? null
        : {
            id: sc.id,
            nom: FICHES_SCENARIO[sc.id].nom,
            description: FICHES_SCENARIO[sc.id].description,
            etat: sc.etat,
            progres: sc.progres,
            texte: sc.texte,
            finJour: sc.finJour,
            jourIssue: sc.jourIssue,
          },
    propheties: [...o.propheties]
      .reverse()
      .map((p) => ({ id: p.id, texte: p.texte, jour: p.jour, finJour: p.finJour, etat: p.etat })),
  };
}

export function chroniqueEtat(sim: Simulation): ChroniqueEtat {
  const c = sim.chronique;
  return {
    recits: [...c.recits]
      .sort((a, b) => Number(b.legende) - Number(a.legende) || b.fois - a.fois || b.tick - a.tick)
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        tick: r.tick,
        genre: r.genre,
        texte: r.texte,
        origine: r.origine,
        fois: r.fois,
        legende: r.legende,
      })),
    lieuxNommes: c.lieuxNommes.map((l) => ({ x: l.x, y: l.y, nom: l.nom, origine: l.origine })),
    proverbes: c.proverbes.map((p) => ({
      lecon: p.lecon,
      titre: LECONS[p.lecon].titre,
      texte: p.texte,
    })),
  };
}

function ficheSpyche(sim: Simulation, p: Personnage): PsycheFiche {
  const ps = p.psyche;
  const T = sim.horloge.ticksParJour;
  const derive: Record<string, number> = {};
  for (const cle of Object.keys(ps.personnaliteBase) as (keyof typeof ps.personnaliteBase)[])
    derive[cle] = Math.round((p.identite.personnalite[cle] - ps.personnaliteBase[cle]) * 100);
  return {
    stress: Math.round(ps.stress),
    abattu: ps.abattu,
    ennui: Math.round(ps.ennui),
    sens: Math.round(ps.sens),
    objectif:
      ps.objectif === null
        ? null
        : {
            but: ps.objectif.but,
            joursRestants: Math.max(0, Math.ceil((ps.objectif.jusqua - sim.tick) / T)),
            progres: ps.objectif.cible <= ps.objectif.depart ? 100 : 0,
            issue: ps.objectif.issue,
          },
    reve: ps.reve,
    attachement: {
      lieu:
        ps.attachement.lieu === null
          ? null
          : (nomDuLieu(sim, ps.attachement.lieu) ??
            `(${String(ps.attachement.lieu.x)}, ${String(ps.attachement.lieu.y)})`),
      objet: ps.attachement.objet,
    },
    lieuxEvites: ps.lieuxEvites
      .filter((l) => l.jusqua > sim.tick)
      .map((l) => ({ motif: l.motif, joursRestants: Math.ceil((l.jusqua - sim.tick) / T) })),
    deuils: ps.deuils.map((d) => ({
      prenom: d.prenom,
      jours: Math.floor((sim.tick - d.tick) / T),
    })),
    derive,
  };
}

/** La société du village, pour l'onglet « Village » et la carte. */
export function societeEtat(sim: Simulation): SocieteEtat {
  const s = sim.societe;
  const jour = sim.horloge.moment().jourAbsolu;
  const ad = adultes(sim);
  return {
    tension: Math.round(s.tension),
    coutumes: s.coutumes.map((c) => ({
      lecon: c.lecon,
      titre: LECONS[c.lecon].titre,
      morale: LECONS[c.lecon].morale,
      depuisJour: c.depuisJour,
      part:
        ad.length === 0
          ? 0
          : Math.round((ad.filter((p) => connait(p, c.lecon)).length / ad.length) * 100),
    })),
    notables: notables(sim).map((p) => ({
      id: p.id,
      prenom: p.identite.prenom,
      nomFamille: p.identite.nomFamille,
      prestige: Math.round(p.prestige),
    })),
    factions: s.factions.map((f) => ({
      nom: f.nom,
      familles: [...f.familles],
      membres: f.membres,
    })),
    griefs: [...s.griefs]
      .slice(-12)
      .reverse()
      .map((g) => ({
        id: g.id,
        jour: g.jour,
        motif: g.motif,
        details: g.details,
        plaignant: personneCourte(sim, g.plaignant),
        accuse: personneCourte(sim, g.accuse),
        etat: g.etat,
      })),
    decisions: [...s.decisions].slice(-8).reverse(),
    alliances: s.alliances.map((a) => {
      const [x = "", y = ""] = a.split("|");
      return [x, y] as const;
    }),
    lieuxInterdits: s.lieuxInterdits
      .filter((l) => jour < l.jusquaJour)
      .map((l) => ({
        x: l.x,
        y: l.y,
        rayon: l.rayon,
        joursRestants: l.jusquaJour - jour,
        motif: l.motif,
      })),
    stocksOuverts: jour < s.stocksOuvertsJusquaJour,
    veillee:
      s.derniereVeillee === null
        ? null
        : {
            tick: s.derniereVeillee.tick,
            x: s.derniereVeillee.x,
            y: s.derniereVeillee.y,
            participants: [...s.derniereVeillee.participants],
            fete: s.derniereVeillee.fete,
          },
    bannis: sim
      .vivants()
      .filter((p) => estBanni(sim, p))
      .map((p) => personneCourte(sim, p.id)),
  };
}

export function etatBatiments(sim: Simulation): BatimentEtat[] {
  return [...sim.batiments.values()].map((b) => ({
    id: b.id,
    type: b.type,
    x: b.position.x,
    y: b.position.y,
    etat: b.etat,
    famille: b.famille,
    proprietaire: b.proprietaire,
    solidite: Math.round(b.solidite),
    epitaphe: b.epitaphe,
    allume: b.allume,
    reserveBois: b.reserveBois,
    culture: b.culture
      ? { seme: b.culture.seme, stade: b.culture.stade, recoltes: b.culture.recoltes }
      : null,
    stock: b.stock ? { ...b.stock.ressources } : null,
    travailRestant: Math.max(0, Math.round(b.travailRestant)),
    travailTotal: PLANS_BATIMENT[b.type].travail,
    manquants: materiauxManquants(b),
    capaciteDormeurs: PLANS_BATIMENT[b.type].capaciteDormeurs,
    nom: PLANS_BATIMENT[b.type].nom,
  }));
}

/** Clé numérique d'une tuile (coordonnées signées, jusqu'à ± 2^20). */
const DECALAGE = 1 << 20;
function cleTuile(x: number, y: number): number {
  return (x + DECALAGE) * (2 * DECALAGE) + (y + DECALAGE);
}
function xDeCle(cle: number): number {
  return Math.floor(cle / (2 * DECALAGE)) - DECALAGE;
}
function yDeCle(cle: number): number {
  return (cle % (2 * DECALAGE)) - DECALAGE;
}

/** Suivi de ce qu'un client a déjà reçu (gisements, découvertes), pour n'émettre que les changements. */
export class SuiviClient {
  private readonly derniers = new Map<number, number>();
  /** Par morceau, les tuiles déjà annoncées à ce client. */
  private readonly decouvertesEnvoyees = new Map<number, Uint8Array>();
  /** Version du terrain sculpté que ce client connaît. */
  private versionTerrain = 0;

  /**
   * Tuiles découvertes depuis le dernier appel, en triplets x, y, biome (toutes
   * au premier appel), puis celles que le ciel a sculptées depuis : le viewer
   * remplace le biome d'une tuile qu'il connaît déjà.
   */
  nouvellesDecouvertes(sim: Simulation): number[] {
    const resultat: number[] = [];
    if (sim.grille.versionDuTerrain !== this.versionTerrain) {
      for (const { tuile: t } of sim.grille.sculpturesDepuis(this.versionTerrain))
        if (sim.grille.estDecouverte(t.x, t.y)) resultat.push(t.x, t.y, codeBiome(t.biome));
      this.versionTerrain = sim.grille.versionDuTerrain;
    }
    for (const m of sim.grille.morceauxGeneres()) {
      if (m.nbDecouvertes === 0) continue;
      const cle = cleMorceau(m.cx, m.cy);
      let envoyees = this.decouvertesEnvoyees.get(cle);
      if (envoyees === undefined) {
        envoyees = new Uint8Array(m.decouvertes.length);
        this.decouvertesEnvoyees.set(cle, envoyees);
      }
      for (let i = 0; i < m.decouvertes.length; i++) {
        if (m.decouvertes[i] !== 1 || envoyees[i] === 1) continue;
        const t = m.tuiles[i];
        if (t === null || t === undefined) continue;
        envoyees[i] = 1;
        resultat.push(t.x, t.y, codeBiome(t.biome));
      }
    }
    return resultat;
  }

  /**
   * Gisements changés depuis le dernier appel (tous au premier appel). Parcours
   * par morceau, sans chaîne par tuile : des dizaines de milliers de tuiles
   * découvertes se passent en revue à chaque diffusion.
   */
  differentiel(sim: Simulation): GisementEtat[] {
    const resultat: GisementEtat[] = [];
    const vus = new Set<number>();
    // Seuls les gisements des tuiles découvertes sont annoncés : le viewer ne
    // doit rien savoir de ce que la colonie n'a pas vu.
    for (const m of sim.grille.morceauxGeneres()) {
      if (m.nbDecouvertes === 0) continue;
      for (const t of m.avecGisement) {
        if (t.gisement === null || m.decouvertes[Grille.indexLocal(t.x, t.y)] !== 1) continue;
        const cle = cleTuile(t.x, t.y);
        vus.add(cle);
        const q = Math.floor(t.gisement.quantite);
        if (this.derniers.get(cle) !== q) {
          this.derniers.set(cle, q);
          resultat.push([t.x, t.y, t.gisement.type, q, t.gisement.outilRequis ?? ""]);
        }
      }
    }
    if (this.derniers.size !== vus.size)
      for (const cle of [...this.derniers.keys()]) {
        if (vus.has(cle)) continue;
        this.derniers.delete(cle);
        resultat.push([xDeCle(cle), yDeCle(cle), "", -1, ""]);
      }
    return resultat;
  }
}

/** Bilan des naissances et décès par saison, calculé au fil des événements. */
export class BilanSaisons {
  private readonly bilans = new Map<
    string,
    { annee: number; saison: string; naissances: number; deces: number }
  >();
  private indexTraite = 0;

  mettreAJour(sim: Simulation): BilanSaison[] {
    const nouveaux = sim.journal.depuisIndex(this.indexTraite);
    this.indexTraite = sim.journal.taille;
    for (const e of nouveaux) {
      if (e.type !== "naissance" && e.type !== "deces") continue;
      const m = sim.horloge.moment(e.tick);
      const cle = `${m.annee}-${m.saison}`;
      const bilan = this.bilans.get(cle) ?? {
        annee: m.annee,
        saison: m.saison,
        naissances: 0,
        deces: 0,
      };
      if (e.type === "naissance") bilan.naissances += 1;
      else bilan.deces += 1;
      this.bilans.set(cle, bilan);
    }
    return [...this.bilans.values()];
  }
}

/** Les troupeaux sur des tuiles découvertes : le viewer ne voit que ce que la colonie a vu. */
export function etatTroupeaux(sim: Simulation): MessageEtat["troupeaux"] {
  const resultat: TroupeauEtat[] = [];
  for (const t of sim.troupeaux.values()) {
    if (t.taille <= 0 || !sim.grille.estDecouverte(t.position.x, t.position.y)) continue;
    resultat.push({
      id: t.id,
      espece: t.espece,
      nom: PROFILS[t.espece].pluriel,
      x: t.position.x,
      y: t.position.y,
      taille: t.taille,
      etat: t.etat,
      predateur: PROFILS[t.espece].predateur,
      menace: t.enMenace || t.proieHumaine !== null,
      domestique: false,
    });
  }
  for (const b of sim.betail.values()) {
    resultat.push({
      id: b.id,
      espece: b.espece,
      nom: PROFILS[b.espece].nom,
      x: b.position.x,
      y: b.position.y,
      taille: 1,
      etat: "pature",
      predateur: false,
      menace: false,
      domestique: true,
    });
  }
  return resultat;
}

export function statistiques(sim: Simulation, bilan: BilanSaisons): Statistiques {
  const s = sim.statistiques();
  const parType: Record<string, number> = {};
  const stocks: Record<string, number> = {};
  for (const b of sim.batiments.values()) {
    if (b.etat !== "termine") continue;
    parType[b.type] = (parType[b.type] ?? 0) + 1;
    if (b.stock)
      for (const [r, n] of Object.entries(b.stock.ressources)) stocks[r] = (stocks[r] ?? 0) + n;
  }
  return {
    tick: s.tick,
    vivants: s.vivants,
    morts: s.morts,
    population: sim.personnages.length,
    enfants: sim.vivants().filter((p) => p.corps.stade === "enfant").length,
    batiments: s.batiments,
    chantiers: s.chantiers,
    parType,
    naissances: sim.journal.compte("naissance"),
    deces: sim.journal.compte("deces"),
    unions: sim.journal.compte("union"),
    dialogues: sim.journal.compte("dialogue"),
    generations: sim.genealogie().generations,
    stocks,
    parSaison: bilan.mettreAJour(sim),
    appelsLLM: 0,
    coutLLM: 0,
    evenements: s.evenements,
    tuilesDecouvertes: sim.grille.nombreDecouvertes,
    tuiles: sim.grille.nombreTuiles,
    morceaux: sim.grille.nombreMorceaux,
    savoirs: savoirsDuVillage(sim),
    faune: recensement(sim),
    attaques: sim.danger.attaques,
    malades: sim.vivants().filter((p) => p.corps.etat.maladies.length > 0).length,
    betail: sim.betail.size,
    age: ageTechnique(sim),
    champs: [...sim.batiments.values()].filter((b) => b.type === "champ" && b.etat === "termine")
      .length,
    chasses: {
      reussies: sim.journal.compteDetail("chasse:reussie"),
      ratees: sim.journal.compteDetail("chasse:ratee"),
    },
    ambitions: ambitionsEnCours(sim),
    miracles: sim.faveur.miracles,
    foiMoyenne: foiMoyenne(sim),
    prieres: sim.faveur.prieres,
    exaucees: sim.faveur.exaucees,
    veillees: sim.societe.compteurs.veillees,
    fetes: sim.societe.compteurs.fetes,
    palabres: sim.societe.compteurs.palabres,
    exils: sim.societe.compteurs.exils,
    rixes: sim.societe.compteurs.rixes,
    legendes: sim.chronique.recits.filter((r) => r.legende).length,
    lieuxNommes: sim.chronique.lieuxNommes.length,
    proverbes: sim.chronique.proverbes.length,
    abattus: sim.vivants().filter((p) => p.psyche.abattu).length,
    villages: sim.villages.villages.length,
    raids: sim.villages.compteurs.tributs + sim.villages.compteurs.pillages,
    caravanes: sim.villages.compteurs.caravanes,
    batailles: sim.villages.compteurs.batailles,
  };
}

export function foiMoyenne(sim: Simulation): number {
  const vivants = sim.vivants();
  if (vivants.length === 0) return 0;
  return Math.round((vivants.reduce((t, p) => t + p.foi, 0) / vivants.length) * 10) / 10;
}

/** La question ouverte de cette personne, sinon son dernier conseil. */
export function conseilFiche(sim: Simulation, p: Personnage): ConseilFiche | null {
  const q = sim.questionEnCours;
  if (q?.personnageId === p.id)
    return {
      questionId: q.id,
      etat: "ouverte",
      tick: q.tick,
      motifs: q.motifs,
      options: q.options,
      choix: null,
      libelle: null,
      pensee: "",
      but: null,
      raison: null,
    };
  const d = p.dernierConseil;
  if (d === null) return null;
  return {
    questionId: d.questionId,
    etat: d.applique ? "repondue" : "sans_suite",
    tick: d.tick,
    motifs: d.motifs,
    options: d.options,
    choix: d.choix,
    libelle: d.libelle,
    pensee: d.pensee,
    but: d.but,
    raison: d.raison,
  };
}

/** Où ils vont : les ambitions en cours, nées des conseils de Claude. */
export function ambitionsEnCours(sim: Simulation): AmbitionStat[] {
  const T = sim.horloge.ticksParJour;
  const resultat: AmbitionStat[] = [];
  for (const p of sim.vivants()) {
    const a = p.ambition;
    if (a?.issue !== "en_cours") continue;
    resultat.push({
      personnageId: p.id,
      prenom: p.identite.prenom,
      nomFamille: p.identite.nomFamille,
      cible: libelleAmbition(a.genre, a.cible),
      but: a.but,
      joursRestants: Math.max(0, Math.ceil((a.jusqua - sim.tick) / T)),
    });
  }
  return resultat;
}

const LIBELLES_PRIORITE: Record<string, string> = {
  provisions: "les provisions d'abord",
  chaleur: "la chaleur d'abord",
  social: "les siens d'abord",
  soin: "les soins d'abord",
  explorer: "explorer",
};
const LIBELLES_DIRECTION: Record<string, string> = {
  nord: "vers le nord",
  est: "vers l'est",
  sud: "vers le sud",
  ouest: "vers l'ouest",
  nord_est: "vers le nord-est",
  sud_est: "vers le sud-est",
  sud_ouest: "vers le sud-ouest",
  nord_ouest: "vers le nord-ouest",
};

/** Libellé lisible d'une ambition (« bâtir un puits », « chercher : fumoir »…). */
export function libelleAmbition(genre: string, cible: string): string {
  switch (genre) {
    case "invention":
      return cible in INVENTIONS ? `inventer : ${INVENTIONS[cible as Invention].nom}` : cible;
    case "batiment":
      return cible in PLANS_BATIMENT
        ? `bâtir : ${PLANS_BATIMENT[cible as TypeBatiment].nom}`
        : cible;
    case "lecon":
      return cible in LECONS ? `retenir : ${LECONS[cible as Lecon].titre}` : cible;
    case "priorite":
      return LIBELLES_PRIORITE[cible] ?? cible;
    case "explorer":
      return `explorer ${LIBELLES_DIRECTION[cible] ?? cible}`;
    case "migrer":
      return `migrer ${LIBELLES_DIRECTION[cible] ?? cible}`;
    default:
      return cible;
  }
}

export function ambitionFiche(sim: Simulation, p: Personnage): AmbitionFiche | null {
  const a = p.ambition;
  if (a === null) return null;
  return {
    genre: a.genre,
    cible: libelleAmbition(a.genre, a.cible),
    but: a.but,
    pensee: a.pensee,
    joursRestants: Math.max(0, Math.ceil((a.jusqua - sim.tick) / sim.horloge.ticksParJour)),
    issue: a.issue,
  };
}

function texteSavoir(id: Savoir): string {
  return estLecon(id) ? LECONS[id].morale : INVENTIONS[id].confidence;
}

/** Savoirs connus d'au moins un vivant, les plus répandus d'abord. */
export function savoirsDuVillage(sim: Simulation): SavoirStat[] {
  const ids = [...Object.keys(LECONS), ...Object.keys(INVENTIONS)] as Savoir[];
  const resultat: SavoirStat[] = [];
  for (const id of ids) {
    const porteurs = sim
      .vivants()
      .filter((p) => (p.savoirs.get(id)?.force ?? 0) >= SEUIL_SAVOIR).length;
    if (porteurs === 0) continue;
    resultat.push({
      id,
      genre: estLecon(id) ? "lecon" : "invention",
      titre: titreSavoir(id),
      texte: texteSavoir(id),
      porteurs,
    });
  }
  return resultat.sort((a, b) => b.porteurs - a.porteurs || a.titre.localeCompare(b.titre));
}

export function evenementEtat(e: Evenement): EvenementEtat {
  return {
    tick: e.tick,
    type: e.type,
    acteur: e.acteur,
    position: e.position,
    importance: e.importance,
    details: e.details,
  };
}

export interface ContexteEtat {
  readonly ticksParSeconde: number;
  readonly pause: boolean;
  readonly suivi: SuiviClient;
  readonly bilan: BilanSaisons;
  readonly indexJournal: number;
  /** Faux : ni découvertes ni gisements dans ce message (la carte suit à sa propre cadence). */
  readonly avecCarte?: boolean;
}

export function messageEtat(sim: Simulation, ctx: ContexteEtat): MessageEtat {
  return {
    type: "etat",
    tick: sim.tick,
    moment: sim.horloge.moment(),
    meteo: sim.meteo,
    ticksParSeconde: ctx.ticksParSeconde,
    pause: ctx.pause,
    personnages: sim.personnages.map((p) => etatPersonnage(sim, p)),
    batiments: etatBatiments(sim),
    troupeaux: etatTroupeaux(sim),
    gisements: ctx.avecCarte === false ? [] : ctx.suivi.differentiel(sim),
    evenements: sim.journal.depuisIndex(ctx.indexJournal).map(evenementEtat),
    stats: statistiques(sim, ctx.bilan),
    decouvertes: ctx.avecCarte === false ? [] : ctx.suivi.nouvellesDecouvertes(sim),
    rayonVision: rayonVision(sim, sim.horloge.moment()),
    faveur: sim.etatFaveur(),
    questions: sim.questionsEnAttente(),
    prieres: sim.prieresOuvertes(),
    societe: societeEtat(sim),
    chronique: chroniqueEtat(sim),
    villages: villagesEtat(sim),
    lois: { ...sim.lois },
    buts: butsEtat(sim),
    conteur: {
      phase: sim.conteur.phase,
      tension: sim.conteur.tension,
      pression: sim.conteur.pression,
      joursDansPhase: sim.horloge.moment().jourAbsolu - sim.conteur.phaseDepuisJour,
      crises: sim.conteur.crises,
      bienfaits: sim.conteur.bienfaits,
      actes: sim.conteur.actes.slice(-6).reverse(),
      chroniques: sim.conteur.chroniques.slice(-6).reverse(),
    },
    creatures: [...sim.creatures.values()].map((c) => {
      const fiche = ficheCreature(c);
      return {
        id: c.id,
        genre: c.genre,
        domaine: c.domaine,
        nom: fiche.nom,
        emoji: fiche.emoji,
        x: c.position.x,
        y: c.position.y,
        joursRestants: Math.max(0, c.finJour - sim.horloge.moment().jourAbsolu),
      };
    }),
  };
}

/** L'âge du cuivre commence au premier lingot ou au premier outil de cuivre. */
function ageTechnique(sim: Simulation): "pierre" | "cuivre" {
  for (const p of sim.personnages) {
    if (!p.vivant) continue;
    if ((p.corps.inventaire.ressources.cuivre ?? 0) > 0) return "cuivre";
    if (
      p.corps.inventaire.objets.some((o) => o.type === "hache_cuivre" || o.type === "pioche_cuivre")
    )
      return "cuivre";
  }
  for (const b of sim.batiments.values())
    if (b.stock !== null && (b.stock.ressources.cuivre ?? 0) > 0) return "cuivre";
  return "pierre";
}

const NOMS_RESSOURCES: Record<string, string> = {
  bois: "du bois",
  pierre: "de la pierre",
  baies: "des baies",
  poisson: "du poisson",
  gibier: "du gibier",
  fibres: "des fibres",
  argile: "de l'argile",
  corde: "de la corde",
  repas_cuit: "un repas cuit",
  poisson_fume: "du poisson fumé",
  cuir: "du cuir",
  minerai: "du minerai",
  cuivre: "du cuivre",
};

/**
 * Pensée intérieure en mode règles : une phrase déduite de l'intention et des
 * besoins. Le cerveau Claude (M5) fournira la sienne.
 */
export function penseeDeClaude(sim: Simulation, p: Personnage): boolean {
  return p.penseeClaude !== null && sim.tick - p.penseeClaude.tick < sim.horloge.ticksParJour;
}

export function pensee(sim: Simulation, p: Personnage): string {
  if (!p.vivant) return "…";
  if (p.penseeClaude !== null && penseeDeClaude(sim, p)) return p.penseeClaude.texte;
  if (p.corps.endormi) return "Zzz…";
  const b = p.besoins;
  const prenom = (id: string): string => sim.personnage(id)?.identite.prenom ?? id;
  const i: Intention | null = p.intention;
  if (i === null)
    return b.moral < 35 ? "Rien ne va comme je voudrais." : "Voyons ce que je pourrais faire.";
  switch (i.type) {
    case "boire":
      return b.soif < 25
        ? "J'ai la gorge sèche, vite, de l'eau."
        : "Un peu d'eau me ferait du bien.";
    case "manger":
      return b.faim < 25
        ? "J'ai l'estomac vide, il faut que je mange."
        : "Je grignoterais bien quelque chose.";
    case "dormir":
      return sim.horloge.moment().estNuit
        ? "La nuit est là, allons dormir."
        : "Je tombe de fatigue.";
    case "recolter": {
      const quoi = NOMS_RESSOURCES[i.ressource] ?? i.ressource;
      const enfants = sim.personnages.some(
        (x) =>
          x.vivant && x.corps.stade === "enfant" && (x.identite.parents?.includes(p.id) ?? false),
      );
      return enfants
        ? `Je vais chercher ${quoi} : les petits ne doivent pas manquer.`
        : p.identite.personnalite.conscience > 0.6
          ? `Je vais chercher ${quoi}, mieux vaut prévoir.`
          : `Allons chercher ${quoi}.`;
    }
    case "explorer":
      return p.identite.personnalite.ouverture > 0.6
        ? "Qu'y a-t-il plus loin ? Allons voir."
        : "Il faut que je trouve autre chose par ici.";
    case "construire": {
      const projet = p.projet ? sim.batiments.get(p.projet.batimentId) : undefined;
      return projet
        ? `Le chantier (${projet.type.replace("_", " ")}) n'attend pas.`
        : "Il nous faut un toit solide.";
    }
    case "fabriquer":
      return `Je vais fabriquer ${i.recette.replace(/_/g, " ")}.`;
    case "stocker":
      return "Je range tout ça au stock, on en aura besoin.";
    case "parler":
      return b.social < 40
        ? `Je me sens seul, allons parler à ${prenom(i.cible)}.`
        : `J'ai envie de discuter avec ${prenom(i.cible)}.`;
    case "offrir":
      return `${prenom(i.cible)} a l'air d'avoir faim, je partage.`;
    case "demander":
      return `Je vais demander un coup de main à ${prenom(i.cible)}.`;
    case "voler":
      return "Personne ne regarde… j'ai trop faim pour hésiter.";
    case "courtiser":
      return `${prenom(i.cible)} me plaît. Allons lui parler.`;
    case "se_reproduire": {
      const partenaire = partenaireDe(sim, p);
      return partenaire
        ? `${partenaire.identite.prenom} et moi avons l'abri pour nous.`
        : "Si seulement j'avais quelqu'un…";
    }
    case "suivre":
      return `Je reste près de ${prenom(i.cible)}.`;
    case "se_rechauffer":
      return b.chaleur < 30
        ? "Je grelotte, il faut que je me réchauffe."
        : "Un peu de chaleur avant de repartir.";
    case "attendre":
      return "Rien ne presse.";
    case "soigner":
      return i.cible === p.id
        ? "Il faut que je m'occupe de cette blessure."
        : `${prenom(i.cible)} souffre, je vais le soigner.`;
    case "se_reposer":
      return p.corps.etat.blessures.length > 0
        ? "Je dois me ménager, le temps que ça guérisse."
        : "Je n'en peux plus, un peu de repos.";
    case "fuir":
      return "Des loups ! Vite, à l'abri.";
    case "defendre":
      return `Je ne laisserai pas les loups approcher ${prenom(i.cible)}.`;
    case "veiller":
      return "Je veille au feu cette nuit ; qu'ils viennent.";
    case "reparer":
      return `Cet outil est ébréché, je le répare tant qu'il tient.`;
    case "abattre":
      return "On n'a plus rien ; il va falloir abattre une bête.";
    case "prier":
      return "Que le ciel m'entende.";
    case "se_recueillir":
      return "Je vais me recueillir sur la tombe de qui m'a appris ce que je sais.";
    case "migrer":
      return "Nous partons fonder notre village, là-bas. Encore quelques jours de marche.";
    case "combattre": {
      const b = sim.villages.batailles.find((x) => x.id === i.bataille);
      return b?.phase === "combat"
        ? "Tenir, frapper, ne pas reculer."
        : "Nous marchons sur leur village. Qu'ils se souviennent de ce jour.";
    }
  }
}

function personneCourte(sim: Simulation, id: string): PersonneCourte {
  const p = sim.personnage(id);
  return { id, prenom: p?.identite.prenom ?? id, vivant: p?.vivant ?? false };
}

export function messageFiche(sim: Simulation, id: string): MessageFiche | null {
  const p = sim.personnage(id);
  if (p === undefined) return null;
  const competences: Record<string, number> = {};
  for (const c of COMPETENCES) competences[c] = niveau(p.experience[c]);
  const relations = [...p.relations.values()]
    .sort((a, b) => b.affinite - a.affinite)
    .map((r) => {
      const autre = sim.personnage(r.cible);
      return {
        id: r.cible,
        prenom: autre?.identite.prenom ?? r.cible,
        nomFamille: autre?.identite.nomFamille ?? "",
        vivant: autre?.vivant ?? false,
        lien: r.lien,
        affinite: Math.round(r.affinite),
        confiance: Math.round(r.confiance),
        attirance: Math.round(r.attirance),
        dette: r.dette,
        interactions: r.interactions,
      };
    });
  const souvenir = (s: {
    tick: number;
    type: string;
    texte: string;
    importance: number;
    altere?: boolean;
  }) => ({
    tick: s.tick,
    type: s.type,
    texte: s.texte,
    importance: s.importance,
    ...(s.altere === true ? { altere: true } : {}),
  });
  const partenaire = partenaireDe(sim, p);
  const enfants = sim.personnages.filter((x) => x.identite.parents?.includes(p.id) ?? false);
  const fratrie = [...p.relations.values()].filter((r) => r.lien === "fratrie").map((r) => r.cible);
  return {
    type: "fiche",
    id: p.id,
    prenom: p.identite.prenom,
    nomFamille: p.identite.nomFamille,
    sexe: p.identite.sexe,
    vivant: p.vivant,
    causeDeces: p.causeDeces,
    ageAnnees: Math.floor(p.corps.ageJours / sim.config.vie.joursParAnnee),
    stade: p.corps.stade,
    biographie: p.identite.biographie,
    motto: p.identite.motto,
    personnalite: { ...p.identite.personnalite },
    valeurs: p.identite.valeurs,
    traits: p.identite.traits,
    apparence: { ...p.identite.apparence },
    sante: arrondir(p.corps.sante),
    besoins: etatPersonnage(sim, p).besoins,
    inventaire: {
      ressources: { ...p.corps.inventaire.ressources },
      objets: p.corps.inventaire.objets.map((o) => `${o.type} (${o.solidite})`),
      capacite: p.corps.inventaire.capacite,
    },
    competences,
    relations,
    intention: p.intention ? decrireIntention(p.intention) : null,
    action: p.actionEnCours ? decrireAction(p.actionEnCours) : null,
    plan: p.plan.map(decrireAction),
    projet: p.projet ? (sim.batiments.get(p.projet.batimentId)?.type ?? null) : null,
    pensee: pensee(sim, p),
    penseeDeClaude: penseeDeClaude(sim, p),
    souvenirsRecents: p.memoire.tous().slice(-20).reverse().map(souvenir),
    souvenirsMarquants: p.memoire
      .recuperer({ tick: sim.tick }, 8)
      .map(souvenir)
      .sort((a, b) => b.importance - a.importance),
    famille: {
      parents: (p.identite.parents ?? []).map((x) => personneCourte(sim, x)),
      partenaire: partenaire ? personneCourte(sim, partenaire.id) : null,
      enfants: enfants.map((x) => personneCourte(sim, x.id)),
      fratrie: fratrie.map((x) => personneCourte(sim, x)),
    },
    reputation: p.reputation,
    enceinte: p.corps.enceinte
      ? { avancement: avancementGrossesse(sim, p), pere: p.corps.enceinte.pere }
      : null,
    lieuxConnus: p.connaissance.size,
    savoirs: [...p.savoirs.entries()].map(([id, s]) => ({
      id,
      genre: estLecon(id) ? "lecon" : "invention",
      titre: titreSavoir(id),
      texte: texteSavoir(id),
      force: s.force,
      origine: s.origine,
    })),
    nombreSouvenirs: p.memoire.taille,
    corps: ficheCorps(sim, p),
    metier: sim.titre(p),
    ambition: ambitionFiche(sim, p),
    conseilPossible: sim.conseilPossible(p),
    conseil: conseilFiche(sim, p),
    foi: p.foi,
    priere: p.priere
      ? {
          sujet: p.priere.sujet,
          tick: p.priere.tick,
          exaucee: p.priere.exaucee,
          autel: p.priere.autel,
        }
      : null,
    humeur: p.humeur
      .filter((m) => m.jusqua > sim.tick)
      .map((m) => ({ cle: m.cle, valeur: Math.round(m.valeur) })),
    prestige: Math.round(p.prestige),
    notable: estNotable(sim, p),
    maitre: p.maitre === null ? null : personneCourte(sim, p.maitre),
    apprentis: sim.personnages
      .filter((x) => x.vivant && x.maitre === p.id)
      .map((x) => personneCourte(sim, x.id)),
    banni:
      p.banni !== null && estBanni(sim, p)
        ? {
            joursRestants: p.banni.jusquaJour - sim.horloge.moment().jourAbsolu,
            motif: p.banni.motif,
          }
        : null,
    rancunes: [...p.relations.values()]
      .filter((r) => r.rancune >= 20 || r.haine)
      .sort((a, b) => b.rancune - a.rancune)
      .slice(0, 5)
      .map((r) => ({
        id: r.cible,
        prenom: sim.personnage(r.cible)?.identite.prenom ?? r.cible,
        rancune: Math.round(r.rancune),
        haine: r.haine,
      })),
    traumatise: p.drapeaux.traumatiseJusqua > sim.tick,
    psyche: ficheSpyche(sim, p),
  };
}

function ficheCorps(sim: Simulation, p: Personnage): MessageFiche["corps"] {
  const etat = p.corps.etat;
  const T = sim.horloge.ticksParJour;
  const c = capacites(p, sim.config.vie.joursParAnnee, sim.tick);
  return {
    fatigue: Math.round(etat.fatigue),
    epuise: estEpuise(p),
    blessures: etat.blessures.map((b) => ({
      type: b.type,
      gravite: b.gravite,
      lieu: b.lieu,
      jours: Math.floor((sim.tick - b.depuis) / T),
      saigne: b.saigne,
      bandee: b.bandee,
      infectee: b.infectee,
      immobilisee: b.immobilisee,
    })),
    carence: etat.carence,
    handicaps: etat.handicaps.map((h) => h.type),
    cicatrices: etat.cicatrices,
    maladies: etat.maladies.map((m) => ({
      nom: PROFILS_MALADIE[m.type].nom,
      joursRestants: Math.max(0, Math.ceil((m.jusqua - sim.tick) / T)),
    })),
    capacites: {
      mobilite: Math.round(c.mobilite * 100) / 100,
      manipulation: Math.round(c.manipulation * 100) / 100,
      vue: Math.round(c.vue * 100) / 100,
      vigueur: Math.round(c.vigueur * 100) / 100,
    },
  };
}

function arrondir(v: number): number {
  return Math.round(v * 10) / 10;
}
