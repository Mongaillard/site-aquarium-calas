export { Rng, fnv1a32 } from "./rng.js";
export type { EtatRng, Graine } from "./rng.js";
export { CONFIG_PAR_DEFAUT, fusionnerConfig, validerConfig } from "./config.js";
export type {
  SimConfig,
  SimConfigPartielle,
  ModeCerveau,
  NiveauEffort,
  CoutumeNomFamille,
} from "./config.js";
export { Horloge, SAISONS } from "./monde/horloge.js";
export type { ConfigHorloge, Moment, Saison } from "./monde/horloge.js";
export { BIOMES, INFO_BIOME, codeBiome } from "./monde/biomes.js";
export type { Biome, InfoBiome } from "./monde/biomes.js";
export { BruitSimplex2D } from "./monde/bruit.js";
export { RESSOURCES, OUTILS, GISEMENTS_PAR_BIOME, ASCII_RESSOURCE } from "./monde/ressources.js";
export type { Ressource, Outil, Gisement } from "./monde/ressources.js";
export { Grille, TAILLE_MORCEAU, cleMorceau, coordMorceau } from "./monde/grille.js";
export type { Position, Tuile, Morceau, Generateur, Sculpture } from "./monde/grille.js";
export {
  genererGrille,
  choisirBiome,
  SEUILS,
  sitesDesPeuples,
  DISTANCE_PEUPLES,
} from "./monde/generation.js";
export type { OptionsGeneration } from "./monde/generation.js";
export { hacherGrille } from "./monde/hachage.js";
export {
  ESPECES,
  PROFILS,
  RAYON_ACTIVITE,
  JOURS_REPOUSSE_SOUCHE,
  CROISSANCE_POISSON,
  recensement,
  troupeauxVisiblesDepuis,
} from "./monde/faune.js";
export type { Espece, EtatTroupeau, ProfilEspece, Troupeau } from "./monde/faune.js";
export {
  ATTAQUES_PAR_SAISON,
  PREAVIS_TICKS,
  RAYON_ALARME,
  centreVillage,
  enclos,
  vulnerabilite,
} from "./monde/danger.js";
export type { EtatDanger, Menace } from "./monde/danger.js";
export { combattre, defenseursAutour } from "./agents/combat.js";
export {
  MALADIES,
  PROFILS_MALADIE,
  estMalade,
  estImmunise,
  tomberMalade,
  eauSouillee,
} from "./agents/maladies.js";
export type { Maladie, MaladieEnCours, ProfilMaladie } from "./agents/maladies.js";
export { VIE_NOURRITURE, ageDe, ajouterAge, pourrir, estGate } from "./agents/inventaire.js";
export {
  RESERVE_BOIS_MAX,
  BUCHES_PAR_JOUR,
  BUCHES_PAR_JOUR_FROID,
  BUCHES_PAR_JOUR_NEIGE,
  feuAAlimenter,
  seuilReserveBois,
} from "./monde.js";
export { REPARATIONS_MAX, SEUIL_REPARATION } from "./monde/recettes.js";
export {
  DOCILITE,
  CAPACITE_ENCLOS,
  GRAINES_PAR_SEMIS,
  JOURS_PAR_STADE,
  RENDEMENT_CHAMP,
  betesDe,
  enclosDe,
  titre,
  rendement,
} from "./monde/village.js";
export type { Bete, Culture } from "./monde/village.js";
export type { ResultatCombat, IssueCombat } from "./agents/combat.js";
export { tuileEnceinteManquante, RAYON_ENCEINTE } from "./monde.js";
export { rendreAscii, LEGENDE_ASCII } from "./monde/ascii.js";
export type { OptionsAscii } from "./monde/ascii.js";
export { Simulation } from "./simulation.js";
export { GENES, genomeAleatoire, phenotype } from "./agents/genetique.js";
export type { Gene, Genome } from "./agents/genetique.js";
export {
  genererIdentite,
  nomComplet,
  biographieParDefaut,
  mottoParDefaut,
} from "./agents/identite.js";
export type {
  Identite,
  Personnalite,
  Apparence,
  Sexe,
  OptionsIdentite,
} from "./agents/identite.js";
export {
  VALEURS_POSSIBLES,
  TRAITS_POSSIBLES,
  PRENOMS_F,
  PRENOMS_M,
  NOMS_FAMILLE,
} from "./agents/noms.js";
export type { Valeur } from "./agents/noms.js";
export { BESOINS, besoinsInitiaux, appliquerTickBesoins, urgence } from "./agents/besoins.js";
export type { Besoin, Besoins, ContexteBesoins, EffetBesoins } from "./agents/besoins.js";
export {
  creerInventaire,
  ajouter,
  retirer,
  quantite,
  total,
  placeLibre,
  NOURRITURE,
  nourritureDisponible,
} from "./agents/inventaire.js";
export type { Inventaire } from "./agents/inventaire.js";
export { COMPETENCES, niveau, gagnerExperience, experienceInitiale } from "./agents/competences.js";
export type { Competence, Experience } from "./agents/competences.js";
export {
  creerPersonnage,
  stadeDepuisAge,
  capaciteInventaire,
  cleLieu,
  ageAnnees,
} from "./agents/personnage.js";
export type {
  Personnage,
  Corps,
  Stade,
  LieuConnu,
  Echec,
  OptionsPersonnage,
} from "./agents/personnage.js";
export {
  famillesLibres,
  genererGroupe,
  genererPopulation,
  trouverPointDeDepart,
} from "./agents/population.js";
export { PINCEAUX, RAYON_PINCEAU_MAX, biomeDuPinceau, sculpter } from "./monde/terrain.js";
export type { Pinceau, ResultatSculpture } from "./monde/terrain.js";
export { trouverChemin, coutChemin } from "./actions/chemin.js";
export type { OptionsChemin } from "./actions/chemin.js";
export { decrireAction, decrireIntention, memeIntention } from "./actions/types.js";
export type { Action, TypeAction, Intention, TypeIntention } from "./actions/types.js";
export { executerTick, vitesse } from "./actions/executeur.js";
export type { Resultat } from "./actions/executeur.js";
export { planifier, lieuxConnusTries, destinationPourAtteindre } from "./actions/planificateur.js";
export type { ResultatPlan } from "./actions/planificateur.js";
export { percevoir, observer, rayonVision } from "./cerveau/perception.js";
export type { Perception, PersonneVisible } from "./cerveau/perception.js";
export type { Cerveau } from "./cerveau/types.js";
export { RuleBrain, SEUILS_URGENCE, SEUILS_ENVIE } from "./cerveau/rule-brain.js";
export { Journal, TYPES_EVENEMENT } from "./evenements/journal.js";
export { LECONS, INVENTIONS, SEUIL_SAVOIR, estLecon, titreSavoir } from "./savoirs/catalogue.js";
export type { Lecon, Invention, Savoir, SavoirAcquis, Domaine } from "./savoirs/catalogue.js";
export { apprendre, connait, savoirsConnus, tirerLecons, apprenants } from "./savoirs/lecons.js";
export { inventer } from "./savoirs/inventions.js";
export {
  capacites,
  estEpuise,
  humeur,
  saigne,
  aDeLaFievre,
  SEUIL_EPUISEMENT,
  SEUIL_FATIGUE,
} from "./agents/corps.js";
export type {
  Blessure,
  Capacites,
  Carence,
  EtatCorps,
  Handicap,
  Modificateur,
  TypeBlessure,
} from "./agents/corps.js";
export type { Evenement, TypeEvenement, Auditeur } from "./evenements/journal.js";
export { estEau, eauAdjacente, personnagesVivants } from "./monde.js";
export type { Monde } from "./monde.js";
export type {
  Statistiques,
  Inspiration,
  EtapesSauvegarde,
  CommandeSculpter,
  CommandePeupler,
  ResultatPeuplement,
  CommandeCreature,
  ResultatInvocation,
} from "./simulation.js";
export {
  creerCreature,
  ficheCreature,
  heureCreatures,
  jourCreatures,
  PORTEE_GARDIEN,
  ERRANCE_FLEAU,
  RAYON_FLEAU,
} from "./monde/creatures.js";
export type { Creature, MondeCreatures } from "./monde/creatures.js";
export {
  etatConteurInitial,
  jourDuConteur,
  mesurerPression,
  frapper,
  offrir,
  ecrireChronique,
  DUREES,
  PREMIER_CALME_JOURS,
  PRESSION_CLEMENCE,
} from "./monde/conteur.js";
export type {
  EtatConteur,
  MondeConteur,
  PhaseConteur,
  ActeConteur,
  ChroniqueAnnee,
} from "./monde/conteur.js";
export { lancerBande, declarerGuerre } from "./monde/villages.js";
export {
  batailleActive,
  batailleDe,
  campDe,
  leverTroupe,
  conclure as conclureBataille,
  frapper as frapperEnBataille,
  guerriersDisponibles,
  lancerRaid,
  lancerBatailleMeute,
  positionDe as positionEnBataille,
  SANTE_PILLARD,
  SANTE_LOUP,
  RAYON_ASSAUT,
  RAYON_DEFENSE,
  RAYON_CHAMP,
  TICKS_SANS_CONTACT,
  DUREE_COMBAT_MAX,
  DUREE_MARCHE_MAX,
  CADENCE_FRAPPE,
  GUERRIERS_MAX,
  RATIO_DEFENSE,
} from "./monde/bataille.js";
export type {
  Bataille,
  Camp as CampBataille,
  Membre as MembreBataille,
  Frappe,
  PhaseBataille,
  IssueBataille,
  GenreBataille,
} from "./monde/bataille.js";
export {
  etatObjectifsInitial,
  jourDesObjectifs,
  formuler,
  FAVEUR_PROPHETIE,
  CHANCE_PROPHETIE,
  TOUS_SUCCES,
} from "./monde/objectifs.js";
export type {
  EtatObjectifs,
  MondeObjectifs,
  Prophetie,
  EtatScenario,
  SuccesDebloque,
} from "./monde/objectifs.js";
export {
  affinite,
  coutEffectif,
  niveauRequis,
  rangDuCiel,
  saisonDuCiel,
  estAgeDuCuivre,
} from "./monde/divin.js";
export { METEOS, EFFETS_METEO, EFFETS_SAISON, tirerMeteo } from "./monde/meteo.js";
export type { Meteo, EffetsMeteo, EffetsSaison } from "./monde/meteo.js";
export {
  TYPES_OBJET,
  RECETTES,
  NOMS_RECETTES,
  recette,
  SOLIDITE_INITIALE,
} from "./monde/recettes.js";
export type {
  TypeObjet,
  Objet,
  Recette,
  NomRecette,
  Atelier,
  ProduitRecette,
} from "./monde/recettes.js";
export {
  TYPES_BATIMENT,
  PLANS_BATIMENT,
  creerChantier,
  materiauxManquants,
  materiauxLivres,
} from "./monde/batiments.js";
export type { TypeBatiment, PlanBatiment, Batiment } from "./monde/batiments.js";
export {
  transferer,
  ajouterObjet,
  objet,
  possede,
  userObjet,
  NOURRITURE_CRUE,
  quantiteNourriture,
} from "./agents/inventaire.js";
export type { Projet } from "./agents/personnage.js";
export {
  autorise,
  batimentEn,
  batimentsAccessibles,
  dormeurs,
  abriDisponible,
  feuProche,
  atelierAdjacent,
  membresFamille,
  prochainBatimentNecessaire,
  chantierFamilial,
  feuEteint,
  batimentAReparer,
} from "./monde.js";
export { choisirSite, libererPlace } from "./actions/planificateur.js";
export type { ProjetPercu } from "./cerveau/perception.js";
export { CONTEXTE_BESOINS_DEFAUT } from "./agents/besoins.js";
export { FluxMemoire, TYPES_SOUVENIR } from "./memoire/souvenir.js";
export type {
  Souvenir,
  TypeSouvenir,
  ContexteRecuperation,
  OptionsFlux,
} from "./memoire/souvenir.js";
export { decrireEvenement, importancePourTemoin } from "./memoire/descriptions.js";
export type { Nommeur, PointDeVue } from "./memoire/descriptions.js";
export { reflechir } from "./memoire/reflexion.js";
export type { Reflexion } from "./memoire/reflexion.js";
export {
  LIENS,
  LIENS_FIXES,
  relationVierge,
  relationFamiliale,
  lienDerive,
  compatibilite,
  ajusterRelation,
  tutoie,
} from "./social/relations.js";
export type { Lien, Relation, Ajustement } from "./social/relations.js";
export { composerDialogue, transcrire, directionVers, lieuxAPartager } from "./social/dialogue.js";
export type { Dialogue, Replique, EffetDialogue, SujetDialogue } from "./social/dialogue.js";
export {
  probabiliteAccord,
  accepteDemande,
  effetsDon,
  effetsRefus,
  effetsVol,
} from "./social/echange.js";
export { relationAvec } from "./agents/personnage.js";
export type { Drapeaux } from "./agents/personnage.js";
export { stockVolable } from "./actions/planificateur.js";
export {
  heriter as heriterGenome,
  esperanceDeVie,
  probabiliteMortNaturelle,
  phenotypeTeint,
  TAUX_MUTATION,
} from "./agents/genetique.js";
export {
  AGE_MATERNITE,
  ticksGestation,
  avancementGrossesse,
  tickVieQuotidien,
  personnaliteAdolescente,
  heriter,
  deuil,
  adopter,
  apprendreParObservation,
  competenceObservee,
} from "./agents/vie.js";
export { mettreAJourStade } from "./agents/personnage.js";
export type { Grossesse } from "./agents/personnage.js";
export {
  SEUILS_COUPLE,
  partenaireDe,
  estVolage,
  eligibles,
  gainAttirance,
  veutCourtiser,
  accepteCour,
  unir,
  rompre,
} from "./social/couple.js";
export { apparentes } from "./monde.js";
export { construireGenealogie, descendantsVivants } from "./genealogie.js";
export type { Genealogie, NoeudGenealogie } from "./genealogie.js";
export {
  FAVEUR_INITIALE,
  FAVEUR_MAX,
  FAVEUR_PAR_JOUR,
  FAVEUR_EVENEMENTS,
  BUCHES_BRAISE,
  etatFaveurInitial,
  faveurEtat,
  gagnerFaveur,
  exercer,
  providence,
} from "./monde/divin.js";
export type { CommandePouvoir, EtatFaveur, ResultatPouvoir, RaisonRefus } from "./monde/divin.js";
export {
  MOTIFS,
  POIDS_MOTIF,
  SEUIL_CONSEIL,
  JOURS_ENTRE_CONSEILS,
  JOURS_ENTRE_CONSEILS_OBSERVATEUR,
  JOURS_EXPIRATION,
  FILE_MAX,
  JOURS_AMBITION,
  LIEUX_A_DECOUVRIR,
  BONUS_PRIORITE,
  PRIORITES,
  DIRECTIONS,
  motifsDeConseil,
  scoreMotifs,
  optionsConseil,
  contexteConseil,
  leconsUtiles,
  ideesEnCours,
  besoinSansIdee,
  appliquerConseil,
  jourAmbition,
  bonusPriorite,
  prioriteEnCours,
} from "./cerveau/conseil.js";
export type { Motif, Priorite, ChoixConseil } from "./cerveau/conseil.js";
export type { Ambition } from "./agents/personnage.js";
export type { Conseil, ResultatConseil } from "./simulation.js";
export {
  VERSION_SAUVEGARDE,
  FORMAT_SAUVEGARDE,
  EVENEMENTS_GARDES,
  encoder,
  decoder,
  estSauvegarde,
} from "./sauvegarde.js";
export type { Sauvegarde } from "./sauvegarde.js";
export {
  etatSocieteInitial,
  adultes,
  estBanni,
  notables,
  estNotable,
  coutumesActives,
  estCoutume,
  lieuInterdit,
  eviteLeLieu,
  calculerFactions,
  factionDe,
  bannir,
  rixe,
  libelleFete,
  nourritureFamiliale,
  tombeARecueillir,
  SEUIL_NOTABLE,
  SEUIL_RIXE,
  JOURS_EXIL,
  JOURS_COUTUME,
  PART_COUTUME,
  JOURS_TABOU,
  RAYON_TABOU,
} from "./social/societe.js";
export type {
  EtatSociete,
  Coutume,
  Grief,
  Decision,
  LieuInterdit,
  Faction,
  Veillee,
  MotifGrief,
  IssueGrief,
} from "./social/societe.js";
export {
  psycheInitiale,
  stresser,
  lieuEvite,
  flechirPersonnalite,
  rever,
  deformerUnSouvenir,
  aubePsyche,
  intentionDominante,
  SEUIL_ABATTEMENT,
  SEUIL_ENNUI,
  BORNE_PERSONNALITE,
} from "./memoire/psyche.js";
export type { Psyche, Objectif, GenreObjectif, LieuEvite, Deuil } from "./memoire/psyche.js";
export {
  etatChroniqueInitial,
  observerChronique,
  raconter,
  embellir,
  nomDuLieu,
  legendes,
  proverbeDeCoutume,
  PROVERBES,
  FOIS_LEGENDE,
} from "./memoire/legendes.js";
export type { EtatChronique, Recit, LieuNomme, Proverbe } from "./memoire/legendes.js";
export {
  etatVillagesInitial,
  villageDe,
  villageDeFamille,
  villageEn,
  habitants,
  nourritureDe,
  forceDe,
  relationEntre,
  allies as villagesAllies,
  DISTANCE_SCHISME,
  SURPEUPLEMENT,
  TENSION_SCHISME,
  STOCK_QUI_ATTIRE,
} from "./monde/villages.js";
export type {
  EtatVillages,
  Village,
  Diplomatie,
  EtatDiplomatie,
  Bande,
  Caravane,
} from "./monde/villages.js";
