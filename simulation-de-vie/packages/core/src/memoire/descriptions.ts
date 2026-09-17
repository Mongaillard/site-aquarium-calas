/** Mise en mots des événements pour la mémoire (section 5.4). */
import type { Evenement } from "../evenements/journal.js";

export type PointDeVue = "acteur" | "temoin";

export interface Nommeur {
  /** Prénom d'un personnage par id (ou l'id si inconnu). */
  prenom(id: string): string;
  /** Vrai si le personnage est de sexe féminin. */
  feminin(id: string): boolean;
}

const NOMS_RESSOURCES: Record<string, string> = {
  bois: "du bois",
  pierre: "de la pierre",
  baies: "des baies",
  poisson: "du poisson",
  gibier: "du gibier",
  lait: "du lait",
  graines: "des graines",
  eau: "de l'eau",
  fibres: "des fibres",
  argile: "de l'argile",
  cuir: "du cuir",
  corde: "de la corde",
  repas_cuit: "un repas cuit",
};

const NOMS_BATIMENTS: Record<string, string> = {
  feu_de_camp: "un feu de camp",
  abri: "un abri",
  maison: "une maison",
  entrepot: "un entrepôt",
  four: "un four",
  puits: "un puits",
  palissade: "une palissade",
  tombe: "une tombe",
  stele: "une stèle",
};

function ressource(details: Evenement["details"]): string {
  const r = String(details.ressource ?? "");
  return NOMS_RESSOURCES[r] ?? r;
}

function batiment(details: Evenement["details"]): string {
  const t = String(details.type ?? "");
  return NOMS_BATIMENTS[t] ?? t;
}

function lieu(e: Evenement): string {
  return e.position ? ` en (${e.position.x}, ${e.position.y})` : "";
}

/**
 * Phrase à la première personne décrivant l'événement, du point de vue de
 * l'acteur ou d'un témoin. Renvoie `null` si l'événement ne mérite pas d'être
 * mémorisé.
 */
export function decrireEvenement(
  e: Evenement,
  pointDeVue: PointDeVue,
  noms: Nommeur,
): string | null {
  const acteur = e.acteur ? noms.prenom(e.acteur) : null;
  const d = e.details;
  const temoin = pointDeVue === "temoin";
  const qui = acteur ?? "quelqu'un";
  const f = e.acteur ? noms.feminin(e.acteur) : false;
  const e_ = f ? "e" : "";
  switch (e.type) {
    case "recolte":
      return temoin
        ? `J'ai vu ${qui} récolter ${ressource(d)}${lieu(e)}.`
        : `J'ai récolté ${ressource(d)}${lieu(e)}.`;
    case "chasse":
      if (d.reussie === true)
        return temoin
          ? `J'ai vu ${qui} rapporter ${String(d.betes)} ${String(d.nom)}${Number(d.betes) > 1 ? "s" : ""}${lieu(e)}.`
          : `J'ai ${Number(d.rabatteurs) > 0 ? "chassé avec les autres" : "chassé seul" + e_} et rapporté ${String(d.betes)} ${String(d.nom)}${Number(d.betes) > 1 ? "s" : ""}${lieu(e)}.`;
      return temoin
        ? `${qui} a raté un ${String(d.nom)}${lieu(e)}.`
        : `Le ${String(d.nom)} m'a échappé${lieu(e)}.`;
    case "faune":
    case "pourriture":
    case "reparation":
    case "betail":
    case "champ":
    case "semis":
      return null;
    case "divin":
      // Le témoin le plus proche mémorise déjà le miracle dans `exercer`.
      return null;
    case "conseil":
      return null;
    case "priere":
      return temoin ? `${qui} a prié le ciel.` : null;
    case "ambition":
      return temoin
        ? d.issue === "accomplie"
          ? `${qui} a obtenu ce qu'${f ? "elle" : "il"} voulait : ${String(d.but)}.`
          : null
        : null;
    case "veillee":
    case "decision":
    case "coutume":
      return null; // les participants se souviennent déjà, par la société
    case "palabre": {
      const plaignant = noms.prenom(String(d.plaignant ?? ""));
      if (!temoin) return null;
      return d.issue === "exil"
        ? `Le village a banni ${qui} après la plainte de ${plaignant}.`
        : d.issue === "repare"
          ? `${qui} a réparé son tort envers ${plaignant} devant tous.`
          : `On a reproché à ${qui} son tort envers ${plaignant}, puis on lui a pardonné.`;
    }
    case "justice":
      if (d.genre === "exil") return temoin ? `${qui} a été banni${e_} du village.` : null;
      if (d.genre === "retour")
        return temoin ? `${qui} est revenu${e_} d'exil.` : `Mon exil est fini.`;
      if (d.genre === "prix_du_sang")
        return temoin ? `${qui} a payé le prix du sang aux ${String(d.famille)}.` : null;
      if (d.genre === "haine")
        return temoin
          ? `Les ${String(d.famille)} tiennent ${qui} pour responsable d'une mort.`
          : null;
      return null;
    case "rixe": {
      const cible = noms.prenom(String(d.cible ?? ""));
      return temoin ? `${qui} et ${cible} se sont battus.` : null;
    }
    case "alliance":
      return temoin
        ? `Les ${String(d.familles).replace("|", " et les ")} sont désormais alliés.`
        : null;
    case "tabou":
      return d.genre === "lieu_interdit"
        ? temoin
          ? `Là où ${qui} est mort${e_} sans raison, on ne va plus.`
          : null
        : null;
    case "recueillement":
      return temoin ? `${qui} s'est recueilli${e_} sur une tombe.` : null;
    case "maitre": {
      const maitre = noms.prenom(String(d.maitre ?? ""));
      return temoin
        ? d.genre === "choisi"
          ? `${qui} apprend auprès de ${maitre}.`
          : null
        : d.genre === "choisi"
          ? `J'ai choisi ${maitre} pour maître.`
          : `Je n'ai plus besoin de maître.`;
    }
    case "psyche":
      if (!temoin) return null;
      return d.genre === "abattement"
        ? `${qui} n'a plus goût à rien, ces jours-ci.`
        : d.genre === "sortie"
          ? `${qui} va mieux ; on le voit sourire de nouveau.`
          : null;
    case "gravure":
      return temoin ? `${qui} a gravé une pierre : ${String(d.inscription)}` : null;
    case "legende":
      return null; // les auditeurs se souviennent déjà, par la chronique
    case "village":
      if (!temoin) return null;
      switch (d.genre) {
        case "schisme":
          return `Une partie du village est partie fonder ${String(d.nom)}.`;
        case "fonde":
          return `${String(d.nom)} est fondé.`;
        case "guerre":
          return `La guerre est déclarée entre ${String(d.aNom)} et ${String(d.bNom)}.`;
        case "bataille":
          return `Bataille entre ${String(d.aNom)} et ${String(d.bNom)} : ${String(d.gagnantNom)} l'emporte.`;
        case "paix":
          return `La paix est faite entre ${String(d.aNom)} et ${String(d.bNom)}.`;
        case "alliance":
          return `${String(d.aNom)} et ${String(d.bNom)} sont alliés.`;
        default:
          return null;
      }
    case "raid":
      if (!temoin) return null;
      return d.genre === "approche"
        ? `Une bande de ${String(d.taille)} approche du village.`
        : d.genre === "tribut"
          ? `Le village a payé un tribut de ${String(d.quantite)} portions à une bande.`
          : d.genre === "pillage"
            ? `Une bande a pillé le village : ${String(d.quantite)} portions emportées.`
            : null;
    case "caravane":
      if (!temoin) return null;
      return d.genre === "arrivee"
        ? `Une caravane de ${String(d.deNom)} est arrivée avec ${String(d.quantite)} portions.`
        : null;
    case "capture":
      return temoin ? `${qui} a ramené un ${String(d.nom)} vivant.` : null;
    case "but":
      return null;
    case "conteur":
      // Le conteur agit par ce qu'il déclenche (meute, orage, guérison) : ce sont ces événements-là qu'on retient.
      return null;
    case "abattage":
      return temoin
        ? `${qui} a abattu ${d.nom === "aurochs" ? "l'" : "le "}${String(d.nom)} de la famille.`
        : null;
    case "maladie":
      return temoin ? `${qui} est tombé${e_} malade (${String(d.nom)}).` : null;
    case "guerison_maladie":
      return temoin ? null : `Je suis guéri${e_} : ${String(d.nom)}, c'est fini.`;
    case "epidemie":
      return temoin ? `Une toux venue d'ailleurs a pris ${qui}. On se tient loin.` : null;
    case "menace":
      if (d.genre === "traces")
        return temoin
          ? `${qui} a vu des traces de loups${lieu(e)}.`
          : `J'ai vu des traces de loups${lieu(e)} : une meute rôde près du village.`;
      return null;
    case "alarme":
      return temoin
        ? `${qui} a crié : des loups ! Tout le monde s'est mis à l'abri.`
        : `J'ai vu la meute la première et j'ai donné l'alarme.`;
    case "combat":
      if (d.issue === "mort")
        return temoin
          ? `Les loups ont pris ${qui}${lieu(e)}. Je n'oublierai pas cette nuit.`
          : `Les loups m'ont eu${e_}${lieu(e)}.`;
      if (d.issue === "fuite")
        return temoin
          ? `${qui} a échappé de justesse aux loups${lieu(e)}.`
          : `Les loups m'ont mordu${e_}, j'ai couru vers le feu.`;
      return temoin
        ? `${qui} a repoussé les loups${lieu(e)}${Number(d.loupsTues) > 0 ? ` et en a tué ${String(d.loupsTues)}` : ""}.`
        : `J'ai tenu tête aux loups${lieu(e)}${Number(d.defenseurs) > 1 ? ", à plusieurs" : ", seul" + e_}${Number(d.loupsTues) > 0 ? ` ; ${String(d.loupsTues)} y ${Number(d.loupsTues) > 1 ? "sont restés" : "est resté"}` : ""}.`;
    case "gisement_epuise":
      return temoin
        ? `${qui} a épuisé un gisement${lieu(e)}, il n'y a plus ${ressource(d)} là-bas.`
        : `Le gisement${lieu(e)} est épuisé, il n'y a plus ${ressource(d)}.`;
    case "repas":
      return temoin ? `J'ai vu ${qui} manger ${ressource(d)}.` : `J'ai mangé ${ressource(d)}.`;
    case "deces":
      return temoin
        ? `${qui} est mort${e_}${lieu(e)}, de ${String(d.cause)}. Je ne l'oublierai pas.`
        : `Je suis mort${e_} de ${String(d.cause)}.`;
    case "fabrication":
      return temoin
        ? `J'ai vu ${qui} fabriquer quelque chose (${String(d.recette)}).`
        : `J'ai fabriqué : ${String(d.recette)}.`;
    case "chantier_fonde":
      return temoin
        ? `${qui} a commencé à construire ${batiment(d)}${lieu(e)}.`
        : `J'ai commencé à construire ${batiment(d)}${lieu(e)}.`;
    case "batiment_termine":
      return temoin
        ? `${qui} a terminé ${batiment(d)}${lieu(e)}.`
        : `J'ai terminé ${batiment(d)}${lieu(e)}. Quelle fierté !`;
    case "batiment_effondre":
      return `${batiment(d)} s'est effondré${lieu(e)}.`;
    case "batiment_repare":
      return temoin
        ? `${qui} a réparé ${batiment(d)}${lieu(e)}.`
        : `J'ai réparé ${batiment(d)}${lieu(e)}.`;
    case "feu_eteint":
      return `L'orage a éteint le feu${lieu(e)}.`;
    case "feu_rallume":
      return temoin ? `${qui} a rallumé le feu${lieu(e)}.` : `J'ai rallumé le feu${lieu(e)}.`;
    case "livraison":
      return temoin
        ? `${qui} a apporté ${ressource(d)} sur un chantier${lieu(e)}.`
        : `J'ai apporté ${ressource(d)} sur le chantier${lieu(e)}.`;
    case "outil_casse":
      return temoin ? null : `Mon outil (${String(d.outil)}) s'est cassé.`;
    case "depot":
      return temoin
        ? `${qui} a déposé ${ressource(d)} dans un stock${lieu(e)}.`
        : `J'ai rangé ${ressource(d)} au stock${lieu(e)}.`;
    case "retrait":
      return temoin
        ? `${qui} a pris ${ressource(d)} dans un stock${lieu(e)}.`
        : `J'ai pris ${ressource(d)} au stock${lieu(e)}.`;
    case "jete":
      return temoin ? null : `J'ai abandonné ${ressource(d)} pour faire de la place.`;
    case "action_echouee":
      return temoin ? null : `Je n'ai pas réussi à ${String(d.action)} : ${String(d.raison)}.`;
    case "dialogue": {
      const avec = noms.prenom(String(d.avec ?? ""));
      const sujet = String(d.sujet ?? "");
      if (temoin) return `J'ai vu ${qui} discuter avec ${avec}.`;
      return `J'ai discuté avec ${avec} (${sujet}).`;
    }
    case "offre": {
      const cible = noms.prenom(String(d.cible ?? ""));
      return temoin
        ? `J'ai vu ${qui} donner ${ressource(d)} à ${cible}.`
        : `J'ai donné ${ressource(d)} à ${cible}.`;
    }
    case "demande": {
      const cible = noms.prenom(String(d.cible ?? ""));
      const accepte = d.accepte === true;
      return temoin
        ? `${qui} a demandé ${ressource(d)} à ${cible}${accepte ? ", qui a accepté" : ", qui a refusé"}.`
        : `J'ai demandé ${ressource(d)} à ${cible}${accepte ? ", et il me l'a donné." : ", et il a refusé."}`;
    }
    case "vol": {
      const victime = String(d.famille ?? "");
      return temoin
        ? `J'ai vu ${qui} voler ${ressource(d)} dans le stock des ${victime}${lieu(e)}. Je m'en souviendrai.`
        : `J'ai volé ${ressource(d)} dans le stock des ${victime}${lieu(e)}.`;
    }
    case "invitation": {
      const cible = noms.prenom(String(d.cible ?? ""));
      return temoin ? null : `J'ai invité ${cible} à utiliser ${batiment(d)}.`;
    }
    case "reflexion":
      return temoin ? null : String(d.texte ?? "");
    case "cour": {
      const cible = noms.prenom(String(d.cible ?? ""));
      const accepte = d.accepte === true;
      if (temoin) return `J'ai vu ${qui} faire la cour à ${cible}.`;
      return accepte
        ? `J'ai fait la cour à ${cible}, et ${noms.feminin(String(d.cible ?? "")) ? "elle" : "il"} a souri.`
        : `J'ai fait la cour à ${cible}, sans succès.`;
    }
    case "union": {
      const cible = noms.prenom(String(d.cible ?? ""));
      return temoin
        ? `${qui} et ${cible} sont désormais ensemble.`
        : `${cible} et moi sommes désormais ensemble. Quel jour !`;
    }
    case "grossesse":
      return temoin ? null : `J'attends un enfant de ${noms.prenom(String(d.pere ?? ""))}.`;
    case "fausse_couche":
      return temoin ? null : "J'ai perdu l'enfant que j'attendais.";
    case "naissance": {
      const prenom = String(d.prenom ?? "");
      const fille = d.sexe === "F";
      return temoin
        ? `${qui} a mis au monde ${fille ? "une fille" : "un fils"}, ${prenom}.`
        : `${prenom}, ${fille ? "ma fille" : "mon fils"}, est né${fille ? "e" : ""}.`;
    }
    case "stade":
      return temoin ? null : `Me voilà ${String(d.nouveau)} : ${String(d.ageAnnees)} ans déjà.`;
    case "heritage":
      return temoin ? null : `J'ai hérité des biens de ${noms.prenom(String(d.defunt ?? ""))}.`;
    case "adoption": {
      const enfant = String(d.prenom ?? "");
      return temoin
        ? `${qui} a recueilli ${enfant}.`
        : `J'ai recueilli ${enfant}, qui n'a plus personne.`;
    }
    case "invention":
      return temoin ? `J'ai vu ${qui} réussir son ${String(d.nom ?? "invention")}.` : null;
    case "matiere":
      return temoin
        ? `${qui} a tiré du four une matière nouvelle : ${String(d.nom ?? "on ne sait quoi")}.`
        : null;
    case "blessure":
      return temoin
        ? `${qui} s'est blessé${e_} ${String(d.contexte ?? "")}.`
        : `Je me suis blessé${e_} ${String(d.contexte ?? "")} : ${String(d.type)} ${d.lieu === "main" ? "à la main" : d.lieu === "bras" ? "au bras" : d.lieu === "jambe" ? "à la jambe" : "au flanc"}.`;
    case "infection":
      return temoin ? null : "Ma plaie s'est infectée ; la fièvre est là.";
    case "soin":
      return temoin
        ? `${qui} a soigné ${noms.prenom(String(d.cible ?? ""))}.`
        : d.soiMeme === true
          ? `Je me suis soigné${e_} (${String(d.soin)}).`
          : `J'ai soigné ${noms.prenom(String(d.cible ?? ""))} (${String(d.soin)}).`;
    case "guerison":
      return temoin
        ? null
        : d.cicatrice === true
          ? "Ma blessure est guérie ; j'en garderai la marque."
          : "Ma blessure est guérie.";
    case "sequelle":
      return temoin
        ? `${qui} ${d.handicap === "boiterie" ? "boite désormais" : d.handicap === "sans_dents" ? "a perdu ses dents" : "a la main raide"}.`
        : d.handicap === "boiterie"
          ? "Je boiterai toute ma vie. Il faudra faire avec."
          : d.handicap === "sans_dents"
            ? "Mes dents s'en vont ; le cru me fait peine."
            : "Ma main ne se refermera plus vraiment.";
    case "carence":
      return temoin
        ? null
        : d.carence === "gencives"
          ? "Mes gencives saignent ; trop de poisson, pas assez du reste."
          : "Le ventre creux malgré les baies : il me faut autre chose.";
    case "epuisement":
      return null; // souvenir ajouté par le moteur
    case "accouchement":
      return temoin
        ? d.accoucheuse === null
          ? `${qui} a accouché seule.`
          : `${qui} a accouché, ${String(d.accoucheuse)} à ses côtés.`
        : null;
    case "jeu":
      return temoin
        ? null
        : d.jeu === "flute"
          ? `J'ai joué de la flûte pour ${noms.prenom(String(d.avec ?? ""))} ; ça nous a fait du bien.`
          : `J'ai joué aux osselets avec ${noms.prenom(String(d.avec ?? ""))} ; ça fait du bien.`;
    case "lecon":
    case "idee":
    case "prototype_rate":
    case "claude":
      return null; // souvenirs ajoutés explicitement par le moteur
    case "meteo":
    case "arrivee":
    case "intention":
    case "action_terminee":
    case "endormi":
    case "reveil":
      return null;
  }
}

/** Importance mémorielle d'un événement pour un témoin (plus faible que pour l'acteur). */
export function importancePourTemoin(e: Evenement): number {
  if (e.type === "deces") return 8;
  if (e.type === "combat" || e.type === "alarme") return 7;
  if (e.type === "vol") return 7;
  return Math.max(1, Math.round(e.importance * 0.6));
}
