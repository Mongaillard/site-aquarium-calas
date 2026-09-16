/** Couleurs, libellés et mises en forme (fonctions pures). */
import type { EvenementEtat, MomentEtat } from "@sdv/protocole";
import { teinteFamille } from "@sdv/protocole";

export const COULEURS_BIOME: Readonly<Record<string, string>> = {
  eau_profonde: "#1d4470",
  eau_peu_profonde: "#3f86bd",
  plage: "#e5d5a6",
  prairie: "#7fb257",
  foret: "#3b7c3e",
  colline: "#a49a63",
  montagne: "#8a8681",
  marais: "#5f8260",
  gue: "#63a8c9",
};

/** Noms de biomes qui ne se déduisent pas de la clé. */
export const LIBELLES_BIOME: Readonly<Record<string, string>> = {
  gue: "gué",
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
  herbes: "#5fb36a",
  minerai: "#5e9c8a",
  cuivre: "#c8742a",
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
  fumoir: "S",
  enclos: "O",
  champ: "=",
  autel: "^",
  port: "H",
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
  fumoir: "#8a6a3a",
  enclos: "#a0783c",
  champ: "#8fa63a",
  autel: "#d8c68a",
  port: "#7a5a3a",
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
  fumoir: "fumoir",
  enclos: "enclos",
  champ: "champ",
  autel: "autel",
  stele: "stèle",
  port: "port",
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

export const LIBELLES_FETE: Readonly<Record<string, string>> = {
  naissance: "d'une naissance",
  union: "d'une union",
  funerailles: "des funérailles",
  solstice: "du solstice",
};

export const LIBELLES_TYPE: Readonly<Record<string, string>> = {
  veillee: "veillée",
  palabre: "palabre",
  justice: "justice",
  rixe: "rixe",
  coutume: "coutume",
  decision: "décision du village",
  alliance: "alliance",
  tabou: "lieu interdit",
  recueillement: "recueillement",
  maitre: "maître et apprenti",
  psyche: "psyché",
  gravure: "gravure",
  legende: "légende",
  village: "villages",
  raid: "bande",
  caravane: "caravane",
  conteur: "le conteur",
  but: "buts",
  divin: "miracle",
  conseil: "conseil",
  ambition: "ambition",
  priere: "prière",
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

/** Motifs d'une demande de conseil, en clair. */
export const LIBELLES_MOTIF: Readonly<Record<string, string>> = {
  besoin_sans_idee: "un besoin sans idée pour y répondre",
  inconfort_chronique: "un inconfort qui dure (faim, froid ou moral)",
  echec_repete: "des échecs répétés",
  sans_projet: "aucun projet",
  observateur: "à votre demande",
};

/** Ce qu'une prière demande. */
export const LIBELLES_SUJET: Readonly<Record<string, string>> = {
  faim: "que la faim cesse",
  froid: "un peu de chaleur",
  soin: "guérir",
  securite: "être protégé",
  moral: "retrouver courage",
  protection: "que rien n'arrive aux siens",
};

/** Réputation du dieu, en un mot. */
export function libelleReputation(r: number): string {
  if (r >= 7) return "vénéré";
  if (r >= 3) return "bienveillant";
  if (r > -3) return "discret";
  if (r > -7) return "redouté";
  return "cruel";
}

export function couleurFamille(nomFamille: string): string {
  return `hsl(${teinteFamille(nomFamille)} 70% 58%)`;
}

/** Couleur d'un village (calque villages) : une teinte stable tirée de son identifiant. */
export function couleurVillage(id: string): string {
  return `hsl(${teinteFamille(`village:${id}`)} 65% 55%)`;
}

/** Couleur des réserves d'un village : rouge quand il n'y a rien, vert à partir de trois jours de vivres par tête. */
export function couleurVivres(nourriture: number, habitants: number): string {
  const part = Math.max(0, Math.min(1, nourriture / Math.max(1, habitants * 3)));
  return `hsl(${Math.round(part * 120)} 75% 50%)`;
}

/** Couleur de la foi (0 : gris ; 3 : or). */
export function couleurFoi(foi: number): string {
  const part = Math.max(0, Math.min(1, foi / 3));
  return `hsl(45 ${Math.round(20 + 75 * part)}% ${Math.round(45 + 25 * part)}%)`;
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
  poisson_fume: "du poisson fumé",
  herbes: "des herbes",
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
  minerai: "du minerai",
  cuivre: "du cuivre",
};

export const NOMS_ESPECE: Readonly<Record<string, string>> = {
  cerf: "cerfs",
  sanglier: "sangliers",
  mouflon: "mouflons",
  lievre: "lièvres",
  aurochs: "aurochs",
  loup: "loups",
};

export const NOMS_LIEU: Readonly<Record<string, string>> = {
  main: "à la main",
  bras: "au bras",
  jambe: "à la jambe",
  flanc: "au flanc",
};

export const NOMS_HANDICAP: Readonly<Record<string, string>> = {
  boiterie: "une boiterie",
  main_raide: "une main raide",
  sans_dents: "plus de dents",
};

export const NOMS_CARENCE: Readonly<Record<string, string>> = {
  gencives: "gencives qui saignent, trop de poisson",
  ventre_creux: "ventre creux, rien que des baies",
};

function res(d: EvenementEtat["details"]): string {
  const r = String(d.ressource ?? "");
  return NOMS_RESSOURCES_EV[r] ?? r;
}

/** Résumé d'une ligne pour le journal. `nom(id)` rend « Prénom Nom ». */
const LIBELLES_LOI: Readonly<Record<string, string>> = {
  faim: "la faim tue",
  maladies: "les maladies",
  betes: "les bêtes attaquent",
  raids: "les raids",
  schismes: "les schismes",
  vieillesse: "la mort de vieillesse",
};

const LIBELLES_PINCEAU: Readonly<Record<string, string>> = {
  terre: "terre",
  eau: "eau",
  foret: "forêt",
  montagne: "montagne",
  sable: "sable",
};

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
      return d.raison === "plus de bois"
        ? "Un feu s'éteint faute de bois."
        : "L'orage éteint un feu.";
    case "maladie":
      return `${qui} tombe malade : ${String(d.nom)}, ${String(d.origine)} (${String(d.jours)} jours).`;
    case "guerison_maladie":
      return `${qui} guérit de sa ${String(d.nom)}.`;
    case "epidemie":
      return `Une toux grise venue d'ailleurs prend ${qui} : l'épidémie commence.`;
    case "pourriture":
      return d.lieu === "sac"
        ? `${qui} jette ${String(d.quantite)} ${res(d)} gâté${Number(d.quantite) > 1 ? "s" : ""}.`
        : `${String(d.quantite)} ${res(d)} se gâte${Number(d.quantite) > 1 ? "nt" : ""} dans ${d.lieu === "entrepot" ? "un entrepôt" : "un stock"}.`;
    case "capture":
      return `${qui} ramène un jeune ${String(d.nom)} vivant, au bout d'une corde.`;
    case "abattage":
      return `${qui} abat ${d.nom === "aurochs" ? "l'" : "le "}${String(d.nom)} de la famille (${String(d.viande)} de viande).`;
    case "semis":
      return `${qui === "quelqu'un" ? "On sème" : `${qui} sème`} le champ.`;
    case "betail":
      switch (String(d.genre)) {
        case "naissance":
          return `Une bête naît à l'enclos (${String(d.espece)}).`;
        case "lait":
          return `${String(d.quantite)} lait à l'enclos.`;
        case "laine":
          return `La tonte donne ${String(d.quantite)} fibres.`;
        case "famine":
          return `Une bête (${String(d.espece)}) meurt de faim à l'enclos.`;
        case "fuite":
          return `Une bête (${String(d.espece)}) s'échappe.`;
        default:
          return `bétail : ${String(d.genre)}`;
      }
    case "champ":
      switch (String(d.genre)) {
        case "levee":
          return "Le champ lève.";
        case "mur":
          return "Le champ est mûr : il n'y a plus qu'à récolter.";
        case "gel":
          return "Le gel emporte la culture du champ.";
        case "ravage":
          return "Un troupeau piétine le champ.";
        case "jachere":
          return "Le champ, laissé en jachère, retrouve sa fertilité.";
        default:
          return `champ : ${String(d.genre)}`;
      }
    case "reparation":
      return `${qui} répare ${String(d.objet).replace(/_/g, " ")} (solidité ${String(d.solidite)}).`;
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
      return d.jeu === "flute"
        ? `${qui} joue de la flûte pour ${cible("avec")}.`
        : `${qui} joue aux osselets avec ${cible("avec")}.`;
    case "blessure":
      return `${qui} se blesse (${String(d.type)} ${NOMS_LIEU[String(d.lieu)] ?? String(d.lieu)}, gravité ${String(d.gravite)}) ${String(d.contexte)}.`;
    case "infection":
      return `La plaie de ${qui} s'infecte : la fièvre monte.`;
    case "soin":
      return d.soiMeme === true
        ? `${qui} se soigne (${String(d.soin)}).`
        : `${qui} soigne ${cible("cible")} (${String(d.soin)}).`;
    case "guerison":
      return `${qui} guérit de sa ${String(d.type)}${d.cicatrice === true ? ", qui laisse une cicatrice" : ""}.`;
    case "sequelle":
      return `${qui} garde une séquelle : ${NOMS_HANDICAP[String(d.handicap)] ?? String(d.handicap)}.`;
    case "carence":
      return `${qui} souffre d'une carence (${NOMS_CARENCE[String(d.carence)] ?? String(d.carence)}).`;
    case "epuisement":
      return `${qui} est à bout de forces (fatigue ${String(d.fatigue)}).`;
    case "accouchement":
      return `${qui} accouche${d.accoucheuse ? `, assistée par ${String(d.accoucheuse)}` : ", seule"} (risque ${String(d.risque)} %).`;
    case "chasse": {
      const nom = String(d.nom);
      if (d.reussie === true)
        return `${qui} rapporte ${String(d.betes)} ${nom}${Number(d.betes) > 1 ? "s" : ""}${Number(d.rabatteurs) > 0 ? ` (battue à ${String(Number(d.rabatteurs) + 1)})` : ""}${d.arc === true ? ", à l'arc" : ""}.`;
      return `${qui} rate un ${nom}${Number(d.rabatteurs) > 0 ? " malgré les rabatteurs" : ""}.`;
    }
    case "menace":
      return d.genre === "traces"
        ? `${qui} relève des traces de loups : une meute rôde (${String(d.loups)} bêtes).`
        : d.genre === "menace"
          ? `Une meute affamée (${String(d.loups)} loups) s'approche du village.`
          : `La meute s'éloigne avec le jour.`;
    case "alarme":
      return `${qui} crie : des loups ! (${String(d.loups)} bêtes)`;
    case "combat":
      return d.issue === "mort"
        ? `Les loups emportent ${qui} (${String(d.loups)} bêtes, ${String(d.defenseurs)} défenseur${Number(d.defenseurs) > 1 ? "s" : ""}).`
        : d.issue === "fuite"
          ? `${qui} échappe aux loups en ${String(d.rounds)} rounds, mordu${Number(d.blesses) > 1 ? "s à " + String(d.blesses) : ""}${Number(d.loupsTues) > 0 ? `, ${String(d.loupsTues)} loup${Number(d.loupsTues) > 1 ? "s" : ""} tué${Number(d.loupsTues) > 1 ? "s" : ""}` : ""}.`
          : `${qui} repousse ${String(d.loups)} loups${Number(d.defenseurs) > 1 ? ` à ${String(d.defenseurs)}` : ", seul"} en ${String(d.rounds)} round${Number(d.rounds) > 1 ? "s" : ""}${Number(d.loupsTues) > 0 ? ` (${String(d.loupsTues)} tué${Number(d.loupsTues) > 1 ? "s" : ""})` : ""}.`;
    case "faune": {
      const nom = String(d.nom);
      switch (String(d.genre)) {
        case "naissances":
          return `Des ${nom} mettent bas : ${String(d.nombre)} petit${Number(d.nombre) > 1 ? "s" : ""} (troupeau de ${String(d.taille)}).`;
        case "scission":
          return `Un troupeau de ${nom} se scinde : ${String(d.nombre)} bêtes partent au loin.`;
        case "migration":
          return `Les ${nom} gagnent la forêt pour l'hiver.`;
        case "retour":
          return `Les ${nom} reviennent sur leurs pâtures d'été.`;
        case "hiver":
          return d.espece === "loup"
            ? `Une meute affamée perd un loup.`
            : `L'hiver emporte ${String(d.nombre)} ${nom}.`;
        case "disparition":
          return `Il n'y a plus de ${nom} par ici.`;
        case "meute":
          return `Une meute de loups prend un ${String(d.proie)}.`;
        case "arrivee":
          return `Une meute de loups arrive dans la région : la chasse a vidé les environs.`;
        default:
          return `${nom} : ${String(d.genre)}`;
      }
    }
    case "divin":
      if (d.pouvoir === "sculpture")
        return `🪄 Le ciel sculpte le monde : ${String(d.tuiles)} tuile${Number(d.tuiles) > 1 ? "s" : ""} de ${LIBELLES_PINCEAU[String(d.pinceau)] ?? String(d.pinceau)} autour de (${String(d.x)}, ${String(d.y)}).`;
      if (d.pouvoir === "domaine")
        return `✨ Le ciel prend un visage : ${String(d.nom)}, ${String(d.titre)}.`;
      if (d.pouvoir === "gardien" || d.pouvoir === "fleau")
        return `${String(d.emoji)} ${d.pouvoir === "gardien" ? "Un gardien se poste" : "Un fléau est lâché"} : ${String(d.nom)} (${String(d.cout)} ✦).`;
      if (d.pouvoir === "gardien_repousse")
        return `🛡️ ${String(d.nom)} repousse ${d.quoi === "bande" ? `une bande de ${String(d.taille)}` : "une meute"}.`;
      if (d.pouvoir === "creature_partie")
        return `✨ ${String(d.nom)} s'en retourne au ciel${Number(d.faits) > 0 ? ` après ${String(d.faits)} fait${Number(d.faits) > 1 ? "s" : ""}` : ""}.`;
      if (d.pouvoir === "loi")
        return `⚖️ Le ciel ${d.actif === true ? "rétablit" : "suspend"} une loi du monde : ${LIBELLES_LOI[String(d.loi)] ?? String(d.loi)}.`;
      if (d.pouvoir === "peuple")
        return `🪄 Un peuple de ${String(d.taille)} arrive par la volonté du ciel et fonde ${String(d.village)}${Number(d.cout) > 0 ? ` (${String(d.cout)} ✦)` : ""}.`;
      return `${d.auto === true ? "🙏✨ Providence : " : "✨ "}${String(d.nom)} en (${String(d.x)}, ${String(d.y)}) : ${String(d.effet)}${d.reaction !== null && d.reaction !== undefined && qui ? ` — ${qui} : « ${String(d.reaction)} »` : ""}${typeof d.exauces === "string" && d.exauces !== "" ? ` — prière exaucée : ${d.exauces}` : ""}`;
    case "priere":
      return `🙏 ${qui} prie pour ${LIBELLES_SUJET[String(d.sujet)] ?? String(d.sujet)}${d.autel === true ? " à l'autel" : ""}${typeof d.offrande === "string" ? ` et offre ${d.offrande}` : ""}.`;
    case "conseil":
      if (d.etape === "question")
        return `💬 ${qui} demande conseil : ${String(d.motifs)
          .split(",")
          .map((m) => LIBELLES_MOTIF[m] ?? m)
          .join(", ")} (cliquez pour voir la question).`;
      return d.applique === true
        ? `💬 ${qui} a demandé conseil : ${String(d.libelle)} — « ${String(d.pensee)} » (${String(d.jours)} j pour : ${String(d.but)})`
        : d.raison === "expiree"
          ? `💬 ${qui} attendait un conseil qui n'est pas venu.`
          : d.raison === "remplacee"
            ? `💬 La question de ${qui} attendra : l'observateur en pose une autre.`
            : `💬 ${qui} a demandé conseil, mais n'en a rien tiré.`;
    case "ambition":
      return d.issue === "accomplie"
        ? `🎯 ${qui} a réussi ce qu'${d.cible === "" ? "il" : "on"} voulait : ${String(d.but)}.`
        : `${qui} renonce : ${String(d.but)}.`;
    case "claude":
      return d.genre === "pensee"
        ? `🧠 ${qui} pense : « ${String(d.texte)} »`
        : d.genre === "recit"
          ? `🧠 On raconte, à propos de ${qui} : « ${String(d.texte)} »`
          : `🧠 Sur la tombe de ${qui}, on grave : « ${String(d.texte)} »`;
    case "veillee":
      return d.fete === null || d.fete === undefined
        ? `🔥 Veillée autour du feu : ${String(d.noms)}${typeof d.transmis === "string" ? ` — on y a transmis « ${d.transmis.replace(/_/g, " ")} »` : ""}.`
        : `🎉 Fête ${LIBELLES_FETE[String(d.fete)] ?? String(d.fete)}${d.sujet ? ` (${String(d.sujet)})` : ""} : ${String(d.participants)} autour du feu.`;
    case "palabre":
      return `⚖️ Palabre : ${qui}, sur la plainte de ${cible("plaignant")} (${String(d.motif)}, ${String(d.details)}) — ${d.issue === "repare" ? `répare (${String(d.rendu)} rendus)` : d.issue === "exil" ? "banni par le vote" : "pardonné"}.`;
    case "justice":
      return d.genre === "exil"
        ? `🚫 ${qui} est banni du village pour ${String(d.jours)} jours (${String(d.motif)}).`
        : d.genre === "retour"
          ? `🏡 ${qui} revient d'exil.`
          : d.genre === "prix_du_sang"
            ? `🕊️ ${qui} paie le prix du sang aux ${String(d.famille)} (${String(d.donne)} portions) : la haine est levée.`
            : `💢 Les ${String(d.famille)} tiennent ${qui} pour responsable de la mort de ${cible("defunt")} : une haine qui se transmettra.`;
    case "rixe":
      return `👊 ${qui} et ${cible("cible")} en viennent aux mains (${String(d.temoins)} témoin${Number(d.temoins) > 1 ? "s" : ""}).`;
    case "coutume":
      return d.genre === "adoptee"
        ? `📜 « ${String(d.titre)} » devient une coutume du village (${String(d.part)} % des adultes) : ${String(d.morale)}`
        : d.genre === "abandonnee"
          ? `📜 La coutume « ${String(d.titre)} » se perd (${String(d.part)} % des adultes).`
          : `📜 ${qui} enfreint la coutume « ${String(d.titre)} » devant ${String(d.temoins)} témoin${Number(d.temoins) > 1 ? "s" : ""}.`;
    case "decision":
      return `🗳️ Le village ${d.adoptee === true ? "décide" : "refuse"} : ${String(d.libelle)} (${String(d.pour)} pour, ${String(d.contre)} contre).`;
    case "alliance":
      return `💍 Les ${String(d.familles).replace("|", " et les ")} sont alliés par ce mariage${Number(d.dot) > 0 ? ` ; dot de ${String(d.dot)} portions des ${String(d.de)} aux ${String(d.vers)}` : ""}.`;
    case "tabou":
      return d.genre === "lieu_interdit"
        ? `☠️ Là où ${qui} est mort (${String(d.cause)}), on ne va plus : lieu interdit pour ${String(d.jours)} jours.`
        : `Le lieu interdit en (${String(d.x)}, ${String(d.y)}) est levé.`;
    case "recueillement":
      return `🕯️ ${qui} se recueille sur une tombe. ${String(d.epitaphe)}`;
    case "maitre":
      return d.genre === "choisi"
        ? `🎓 ${qui} choisit ${cible("maitre")} pour maître (${String(d.competence)}).`
        : `🎓 ${qui} n'a plus besoin de maître.`;
    case "psyche":
      switch (d.genre) {
        case "abattement":
          return `🌧️ ${qui} sombre dans l'abattement : plus goût à rien.`;
        case "sortie":
          return `🌤️ ${qui} sort de l'abattement après ${String(d.jours)} jours, porté par les siens.`;
        case "objectif":
          return `🎯 ${qui} se donne un but pour la saison : ${String(d.but)}.`;
        case "accompli":
          return `🎉 ${qui} a réussi : ${String(d.but)}. Quelle joie !`;
        case "manque":
          return `${qui} n'a pas pu ${String(d.but)} cette saison.`;
        case "anniversaire":
          return `🕯️ ${qui} pense à ${cible("defunt")}, ${Number(d.ans) === 1 ? "un an" : `${String(d.ans)} ans`} après sa mort.`;
        default:
          return `${qui} : ${String(d.genre)}`;
      }
    case "gravure":
      return `🪨 ${qui} grave une pierre : ${String(d.inscription)}`;
    case "village":
      switch (d.genre) {
        case "schisme":
          return `🏕️ Schisme : ${String(d.partants)} personnes (${String(d.familles).replace(/,/g, ", ")}) quittent le village pour fonder ${String(d.nom)} à soixante tuiles, poussées par ${String(d.motif)}.`;
        case "fonde":
          return `🏘️ ${String(d.nom)} est fondé : tous les partants sont arrivés.`;
        case "alliance":
          return `🤝 ${String(d.aNom)} et ${String(d.bNom)} concluent une alliance.`;
        case "fin_alliance":
          return `L'alliance entre ${String(d.aNom)} et ${String(d.bNom)} se défait.`;
        case "guerre":
          return `⚔️ ${String(d.aNom)} et ${String(d.bNom)} entrent en guerre : ${String(d.casusBelli)}.`;
        case "marche":
          return `⚔️ ${String(d.aNom)} lève ${String(d.guerriers)} guerriers et marche sur ${String(d.bNom)} (bataille ${String(d.numero)}).`;
        case "assaut":
          return `⚔️ Assaut sur ${String(d.bNom)} : ${String(d.guerriers)} attaquants, ${String(d.defenseurs)} défenseur${Number(d.defenseurs) > 1 ? "s" : ""} prennent les armes.`;
        case "bataille": {
          const bilan = `${String(d.blesses)} coup${Number(d.blesses) > 1 ? "s" : ""} porté${Number(d.blesses) > 1 ? "s" : ""}${Number(d.morts) > 0 ? `, ${String(d.morts)} mort${Number(d.morts) > 1 ? "s" : ""}` : ""}`;
          if (d.issue === "treve" || d.gagnantNom === null || d.gagnantNom === undefined)
            return `⚔️ Bataille ${String(d.numero)} entre ${String(d.aNom)} et ${String(d.bNom)} : chacun rentre chez soi (${bilan}).`;
          return `⚔️ Bataille ${String(d.numero)} entre ${String(d.aNom)} et ${String(d.bNom)} : ${String(d.gagnantNom)} l'emporte (${bilan}, ${String(d.butin)} portions prises).`;
        }
        case "paix":
          return `🕊️ Paix entre ${String(d.aNom)} et ${String(d.bNom)} après ${String(d.batailles)} bataille${Number(d.batailles) > 1 ? "s" : ""} : le prix du sang, ${String(d.donne)} portions.`;
        default:
          return `villages : ${String(d.genre)}`;
      }
    case "raid":
      switch (d.genre) {
        case "approche":
          return `🏴 Une bande de ${String(d.taille)} approche de ${String(d.nom)}, attirée par les stocks.`;
        case "tribut":
          return `🏴 ${String(d.nom)} (force ${String(d.force)}) négocie : la bande de ${String(d.taille)} repart avec un tribut de ${String(d.quantite)} portions.`;
        case "assaut":
          return `⚔️ Une bande de ${String(d.taille)} pillards attaque ${String(d.nom)} : ${String(d.defenseurs)} défenseur${Number(d.defenseurs) > 1 ? "s" : ""} prennent les armes.`;
        case "repousse":
          return `🛡️ ${String(d.nom)} repousse les pillards${Number(d.pillardsTues) > 0 ? ` (${String(d.pillardsTues)} tué${Number(d.pillardsTues) > 1 ? "s" : ""})` : ""}${Number(d.morts) > 0 ? `, ${String(d.morts)} mort${Number(d.morts) > 1 ? "s" : ""}` : ""}.`;
        case "pillage":
          return `🔥 Pillage de ${String(d.nom)} par une bande de ${String(d.taille)} : ${String(d.quantite)} portions emportées${d.batiment ? `, ${String(d.batiment)} ébranlé` : ""}${Number(d.morts) > 0 ? `, ${String(d.morts)} mort${Number(d.morts) > 1 ? "s" : ""}` : ""}.`;
        default:
          return `La bande s'éloigne.`;
      }
    case "but":
      if (d.genre === "succes") return `🏅 Succès : ${String(d.emoji)} ${String(d.nom)}.`;
      if (d.genre === "scenario")
        return d.issue === "gagne"
          ? `🏆 Scénario réussi : ${String(d.nom)} !`
          : `💀 Scénario perdu : ${String(d.nom)}.`;
      return d.issue === "ouverte"
        ? `🔮 Prophétie : ${String(d.texte)}`
        : d.issue === "accomplie"
          ? `🔮 Prophétie accomplie (+${String(d.faveur)} ✦) : ${String(d.texte)}`
          : `🔮 Prophétie manquée : ${String(d.texte)}`;
    case "conteur":
      return d.genre === "chronique"
        ? `📜 Chronique de l'an ${String(d.annee)}, ${String(d.titre)} : ${String(d.texte)}`
        : d.genre === "crise"
          ? `🎭 Épreuve : ${String(d.texte)}`
          : d.genre === "bienfait"
            ? `🎭 Bienfait : ${String(d.texte)}`
            : `🎭 ${String(d.texte)}`;
    case "caravane":
      return d.genre === "depart"
        ? `🐐 Une caravane part de ${String(d.deNom)} vers ${String(d.versNom)} avec ${String(d.quantite)} portions${d.invention ? ` et le secret du ${String(d.invention)}` : ""}.`
        : d.genre === "arrivee"
          ? `🐐 La caravane de ${String(d.deNom)} arrive à ${String(d.versNom)} : ${String(d.quantite)} portions${d.invention ? `, et ${cible("apprenant")} apprend le ${String(d.invention)}` : ""}.`
          : `🐐 Une caravane s'est perdue en route entre ${String(d.de)} et ${String(d.vers)}.`;
    case "legende":
      return d.genre === "legende"
        ? `📖 Une légende est née (racontée ${String(d.fois)} fois) : ${String(d.texte)}`
        : d.genre === "recit"
          ? `📖 ${qui} raconte à la veillée : ${String(d.texte)}`
          : d.genre === "lieu"
            ? `🗺️ Un lieu prend un nom : ${String(d.nom)} (${String(d.origine)}).`
            : `💬 Un proverbe naît de la coutume « ${String(d.titre)} » : « ${String(d.texte)} »`;
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
