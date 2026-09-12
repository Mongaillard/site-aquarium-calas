/** Couleurs, libellés et mises en forme (fonctions pures). */
import type { EvenementEtat, MomentEtat } from "@sdv/protocole";
import { teinteFamille } from "@sdv/protocole";

export const COULEURS_BIOME: Readonly<Record<string, string>> = {
  eau_profonde: "#1b3a6b",
  eau_peu_profonde: "#2e6ea8",
  plage: "#e6d59c",
  prairie: "#7db85a",
  foret: "#2f7a3a",
  colline: "#a3955e",
  montagne: "#8d8d8d",
  marais: "#587a5a",
};

export const COULEURS_RESSOURCE: Readonly<Record<string, string>> = {
  bois: "#7a4a1e",
  pierre: "#cfcfcf",
  baies: "#c23b8f",
  poisson: "#8fd3ff",
  gibier: "#d9a066",
  fibres: "#d6e04b",
  argile: "#c46a2b",
  graines: "#f0e68c",
};

export const LETTRES_BATIMENT: Readonly<Record<string, string>> = {
  feu_de_camp: "f",
  abri: "A",
  maison: "M",
  entrepot: "E",
  four: "F",
  puits: "P",
  palissade: "#",
  tombe: "+",
};

export const COULEURS_BATIMENT: Readonly<Record<string, string>> = {
  feu_de_camp: "#ff8c1a",
  abri: "#b5651d",
  maison: "#8b4513",
  entrepot: "#6b4f2a",
  four: "#9c6b3c",
  puits: "#5c7f9e",
  palissade: "#7a5a2e",
  tombe: "#555555",
};

export const NOMS_BATIMENT: Readonly<Record<string, string>> = {
  feu_de_camp: "feu de camp",
  abri: "abri",
  maison: "maison",
  entrepot: "entrepôt",
  four: "four",
  puits: "puits",
  palissade: "palissade",
  tombe: "tombe",
};

export const LIBELLES_METEO: Readonly<Record<string, string>> = {
  clair: "☀ clair",
  pluie: "🌧 pluie",
  orage: "⛈ orage",
  neige: "❄ neige",
  canicule: "🔥 canicule",
};

export const LIBELLES_SAISON: Readonly<Record<string, string>> = {
  printemps: "printemps",
  ete: "été",
  automne: "automne",
  hiver: "hiver",
};

export const LIBELLES_TYPE: Readonly<Record<string, string>> = {
  arrivee: "arrivée",
  deces: "décès",
  intention: "intention",
  action_terminee: "action terminée",
  action_echouee: "échec",
  recolte: "récolte",
  gisement_epuise: "gisement épuisé",
  repas: "repas",
  endormi: "sommeil",
  reveil: "réveil",
  fabrication: "fabrication",
  chantier_fonde: "chantier",
  livraison: "livraison",
  batiment_termine: "bâtiment terminé",
  batiment_repare: "réparation",
  batiment_effondre: "effondrement",
  feu_eteint: "feu éteint",
  feu_rallume: "feu rallumé",
  depot: "dépôt",
  retrait: "retrait",
  outil_casse: "outil cassé",
  jete: "abandon",
  meteo: "météo",
  dialogue: "dialogue",
  offre: "don",
  demande: "demande",
  vol: "vol",
  invitation: "invitation",
  reflexion: "réflexion",
  cour: "cour",
  union: "union",
  grossesse: "grossesse",
  fausse_couche: "fausse couche",
  naissance: "naissance",
  stade: "âge",
  heritage: "héritage",
  adoption: "adoption",
};

export function couleurFamille(nomFamille: string): string {
  return `hsl(${teinteFamille(nomFamille)} 70% 58%)`;
}

export function couleurMoral(moral: number): string {
  return moral >= 65 ? "#7dffa0" : moral <= 35 ? "#ff5f5f" : "#f0f0f0";
}

export function formaterHeure(m: MomentEtat): string {
  return `${String(m.heure).padStart(2, "0")}:${String(m.minute).padStart(2, "0")}`;
}

export function formaterMoment(m: MomentEtat): string {
  return `An ${m.annee} · ${LIBELLES_SAISON[m.saison] ?? m.saison} ${m.jourDeSaison} · ${formaterHeure(m)}${m.estNuit ? " ☾" : ""}`;
}

/** Moment lisible d'un tick passé, à partir des constantes de l'horloge. */
export function formaterTick(tick: number, ticksParJour: number, joursParSaison: number): string {
  const jour = Math.floor(tick / ticksParJour);
  const minutes = (tick % ticksParJour) * (1440 / ticksParJour);
  const saisons = ["printemps", "été", "automne", "hiver"];
  const annee = Math.floor(jour / (joursParSaison * 4)) + 1;
  const saison = saisons[Math.floor((jour % (joursParSaison * 4)) / joursParSaison)] ?? "";
  const jourDeSaison = (jour % joursParSaison) + 1;
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mn = String(minutes % 60).padStart(2, "0");
  return `An ${annee} ${saison} ${jourDeSaison}, ${h}:${mn}`;
}

const NOMS_RESSOURCES_EV: Readonly<Record<string, string>> = {
  bois: "du bois",
  pierre: "de la pierre",
  baies: "des baies",
  poisson: "du poisson",
  gibier: "du gibier",
  fibres: "des fibres",
  argile: "de l'argile",
  corde: "de la corde",
  repas_cuit: "un repas cuit",
  cuir: "du cuir",
};

function res(d: EvenementEtat["details"]): string {
  const r = String(d.ressource ?? "");
  return NOMS_RESSOURCES_EV[r] ?? r;
}

/** Résumé d'une ligne pour le journal. `nom(id)` rend « Prénom Nom ». */
export function resumerEvenement(e: EvenementEtat, nom: (id: string) => string): string {
  const d = e.details;
  const qui = e.acteur ? nom(e.acteur) : "";
  const cible = (cle: string): string => nom(String(d[cle] ?? ""));
  switch (e.type) {
    case "arrivee":
      return `${qui} arrive dans le monde.`;
    case "deces":
      return `${qui} meurt (${String(d.cause)}).`;
    case "intention":
      return `${qui} décide : ${String(d.intention)}.`;
    case "action_terminee":
      return `${qui} termine : ${String(d.intention)}.`;
    case "action_echouee":
      return `${qui} échoue (${String(d.action)}) : ${String(d.raison)}.`;
    case "recolte":
      return `${qui} récolte ${res(d)} (${String(d.quantite)}).`;
    case "gisement_epuise":
      return `${qui} épuise un gisement (${res(d)}).`;
    case "repas":
      return `${qui} mange ${res(d)}.`;
    case "endormi":
      return `${qui} s'endort.`;
    case "reveil":
      return `${qui} se réveille.`;
    case "fabrication":
      return `${qui} fabrique ${String(d.recette).replace(/_/g, " ")}.`;
    case "chantier_fonde":
      return `${qui} fonde un chantier (${NOMS_BATIMENT[String(d.type)] ?? String(d.type)}).`;
    case "livraison":
      return `${qui} livre ${res(d)} sur un chantier.`;
    case "batiment_termine":
      return `${qui} termine ${NOMS_BATIMENT[String(d.type)] ?? String(d.type)}.`;
    case "batiment_repare":
      return `${qui} répare ${NOMS_BATIMENT[String(d.type)] ?? String(d.type)}.`;
    case "batiment_effondre":
      return `${NOMS_BATIMENT[String(d.type)] ?? String(d.type)} s'effondre.`;
    case "feu_eteint":
      return "L'orage éteint un feu.";
    case "feu_rallume":
      return `${qui} rallume le feu.`;
    case "depot":
      return `${qui} range ${res(d)} au stock.`;
    case "retrait":
      return `${qui} prend ${res(d)} au stock.`;
    case "outil_casse":
      return `L'outil de ${qui} se casse (${String(d.outil)}).`;
    case "jete":
      return `${qui} abandonne ${res(d)}.`;
    case "meteo":
      return `Météo : ${String(d.meteo)}.`;
    case "dialogue":
      return `${qui} discute avec ${cible("avec")} (${String(d.sujet)}).`;
    case "offre":
      return `${qui} donne ${res(d)} à ${cible("cible")}.`;
    case "demande":
      return `${qui} demande ${res(d)} à ${cible("cible")} : ${d.accepte === true ? "accepté" : "refusé"}.`;
    case "vol":
      return `${qui} vole ${res(d)} chez les ${String(d.famille)} (${String(d.temoins)} témoin(s)).`;
    case "invitation":
      return `${qui} invite ${cible("cible")} chez lui.`;
    case "reflexion":
      return `${qui} pense : « ${String(d.texte)} »`;
    case "cour":
      return `${qui} fait la cour à ${cible("cible")} : ${d.accepte === true ? "succès" : "échec"}.`;
    case "union":
      return `${String(d.prenoms)} forment un couple.`;
    case "grossesse":
      return `${qui} attend un enfant.`;
    case "fausse_couche":
      return `${qui} perd l'enfant qu'elle attendait.`;
    case "naissance":
      return `${qui} met au monde ${String(d.prenom)} (${d.sexe === "F" ? "fille" : "garçon"}).`;
    case "stade":
      return `${qui} devient ${String(d.nouveau)} (${String(d.ageAnnees)} ans).`;
    case "heritage":
      return `${qui} hérite de ${cible("defunt")}.`;
    case "adoption":
      return `${qui} recueille ${String(d.prenom)}.`;
    case "lecon":
      return `De la mort de ${qui} (${String(d.cause)}), ${String(d.apprenants)} personne${Number(d.apprenants) > 1 ? "s" : ""} retiennent : « ${String(d.morale)} »`;
    case "idee":
      return `${qui} a une idée : ${String(d.nom)}.`;
    case "invention":
      return `${qui} réussit son ${String(d.nom)} : la famille sait désormais le faire.`;
    case "prototype_rate":
      return `${qui} rate son prototype de ${String(d.nom)}.`;
    case "jeu":
      return `${qui} joue aux osselets avec ${cible("avec")}.`;
    default:
      return `${qui} ${e.type}`;
  }
}

export function echapper(texte: string): string {
  return texte.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}
