/**
 * Construction des messages du protocole à partir de l'état de la simulation.
 * Tout ce que le viewer affiche passe par ici (section 13).
 */
import {
  BIOMES,
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
  codeBiome,
  decrireAction,
  decrireIntention,
  materiauxManquants,
  niveau,
  partenaireDe,
  rayonVision,
} from "@sdv/core";
import type { Evenement, Personnage, Simulation, Intention, Savoir } from "@sdv/core";
import type {
  BatimentEtat,
  BilanSaison,
  EvenementEtat,
  GisementEtat,
  MessageEtat,
  MessageFiche,
  MessageInit,
  PersonnageEtat,
  PersonneCourte,
  SavoirStat,
  Statistiques,
} from "@sdv/protocole";

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
    stock: b.stock ? { ...b.stock.ressources } : null,
    travailRestant: Math.max(0, Math.round(b.travailRestant)),
    travailTotal: PLANS_BATIMENT[b.type].travail,
    manquants: materiauxManquants(b),
    capaciteDormeurs: PLANS_BATIMENT[b.type].capaciteDormeurs,
    nom: PLANS_BATIMENT[b.type].nom,
  }));
}

/** Suivi de ce qu'un client a déjà reçu (gisements, découvertes), pour n'émettre que les changements. */
export class SuiviClient {
  private readonly derniers = new Map<string, number>();
  /** Par morceau, les tuiles déjà annoncées à ce client. */
  private readonly decouvertesEnvoyees = new Map<number, Uint8Array>();

  /** Tuiles découvertes depuis le dernier appel, en triplets x, y, biome (toutes au premier appel). */
  nouvellesDecouvertes(sim: Simulation): number[] {
    const resultat: number[] = [];
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

  /** Gisements changés depuis le dernier appel (tous au premier appel). */
  differentiel(sim: Simulation): GisementEtat[] {
    const resultat: GisementEtat[] = [];
    const vus = new Set<string>();
    // Seuls les gisements des tuiles découvertes sont annoncés : le viewer ne
    // doit rien savoir de ce que la colonie n'a pas vu.
    for (const t of sim.grille.tuilesAvecGisement()) {
      if (t.gisement === null || !sim.grille.estDecouverte(t.x, t.y)) continue;
      const cle = `${t.x},${t.y}`;
      vus.add(cle);
      const q = Math.floor(t.gisement.quantite);
      if (this.derniers.get(cle) !== q) {
        this.derniers.set(cle, q);
        resultat.push([t.x, t.y, t.gisement.type, q, t.gisement.outilRequis ?? ""]);
      }
    }
    for (const cle of [...this.derniers.keys()]) {
      if (vus.has(cle)) continue;
      this.derniers.delete(cle);
      const [x, y] = cle.split(",").map(Number);
      resultat.push([x ?? 0, y ?? 0, "", -1, ""]);
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
    const evenements = sim.journal.tous();
    for (; this.indexTraite < evenements.length; this.indexTraite++) {
      const e = evenements[this.indexTraite];
      if (e === undefined || (e.type !== "naissance" && e.type !== "deces")) continue;
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
    gisements: ctx.suivi.differentiel(sim),
    evenements: sim.journal.tous().slice(ctx.indexJournal).map(evenementEtat),
    stats: statistiques(sim, ctx.bilan),
    decouvertes: ctx.suivi.nouvellesDecouvertes(sim),
    rayonVision: rayonVision(sim, sim.horloge.moment()),
  };
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
  const souvenir = (s: { tick: number; type: string; texte: string; importance: number }) => ({
    tick: s.tick,
    type: s.type,
    texte: s.texte,
    importance: s.importance,
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
  };
}

function arrondir(v: number): number {
  return Math.round(v * 10) / 10;
}
