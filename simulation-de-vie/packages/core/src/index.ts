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
export type { Position, Tuile, Morceau, Generateur } from "./monde/grille.js";
export { genererGrille, choisirBiome, SEUILS } from "./monde/generation.js";
export type { OptionsGeneration } from "./monde/generation.js";
export { hacherGrille } from "./monde/hachage.js";
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
export { genererPopulation, trouverPointDeDepart } from "./agents/population.js";
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
export type { Statistiques, Inspiration } from "./simulation.js";
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
