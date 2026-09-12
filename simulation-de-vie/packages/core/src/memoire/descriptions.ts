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
  eau: "de l'eau",
  fibres: "des fibres",
  argile: "de l'argile",
  graines: "des graines",
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
    case "jeu":
      return temoin
        ? null
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
  if (e.type === "vol") return 7;
  return Math.max(1, Math.round(e.importance * 0.6));
}
