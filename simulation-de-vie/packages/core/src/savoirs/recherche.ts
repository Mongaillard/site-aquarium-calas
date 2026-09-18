/**
 * La recherche (M38b) : comment une personne passe d'un problème à une idée.
 *
 * Le moteur ne souffle aucune invention. Il mesure ce qui va mal autour d'une
 * personne — elle a faim, elle gèle, ses vivres pourrissent, ses plaies
 * s'infectent, sa hache ne mord plus — et traduit chaque ennui en **fonction**
 * manquante. Le soir, un esprit curieux prend la fonction dont il souffre, la
 * croise avec une matière qu'il connaît et un procédé qu'il maîtrise, et se
 * retrouve avec une hypothèse : la trouvaille de M38a.
 *
 * Ensuite, il essaie. Souvent ça rate (l'exécuteur s'en charge). Quand ça tient,
 * le savoir est éprouvé, sa famille l'apprend, et le dialogue le répand.
 *
 * C'est aussi là que naissent les matières : devant un four, quelqu'un mêle deux
 * choses et en tire une troisième, plus dure, à laquelle il donne un nom.
 */
import { placeLibre, possede, quantite, retirer } from "../agents/inventaire.js";
import type { Ressource } from "../monde/ressources.js";
import type { Personnage } from "../agents/personnage.js";
import { niveau } from "../agents/competences.js";
import { batimentsAccessibles } from "../monde.js";
import type { Monde } from "../monde.js";
import { PLANS_BATIMENT } from "../monde/batiments.js";
import type { Atelier } from "../monde/recettes.js";
import { SEUIL_SAVOIR } from "./catalogue.js";
import { apprendre } from "./lecons.js";
import {
  FONCTION,
  PROCEDE,
  PROCEDES,
  bonusSu,
  combinaisonValide,
  ingredientsDe,
  composerTrouvaille,
  deriverMatiere,
  retenirTrouvaille,
} from "./grammaire.js";
import type { FicheMatiere, Fonction, Procede, Trouvaille } from "./grammaire.js";

/** Un ennui mesurable, et la fonction qui y répondrait. */
export interface Probleme {
  readonly cle: string;
  /** Ce qu'il faudrait savoir faire. */
  readonly fonction: Fonction;
  /** Ce qu'on se dit en le constatant. */
  readonly plainte: string;
  /** De 0 à 1 : à quel point ça presse. */
  readonly poids: number;
}

/** Il faut au moins ça pour qu'un ennui vaille qu'on y réfléchisse. */
export const POIDS_MINIMAL = 0.3;
/**
 * Une idée jamais réalisée s'efface au bout de tant de jours. **[DÉCISION]**
 * Quatre-vingt-dix et non trente (M41) : à trente jours, une idée qui demandait
 * cinq cuivres mourait avant qu'on ait pu les réunir, et l'onglet se remplissait
 * d'idées que personne n'avait jamais eu le temps d'essayer.
 */
export const JOURS_IDEE = 90;

/**
 * Ce qui va mal autour de cette personne, du plus pressant au moins. Tout se lit
 * dans son état et dans ce qu'elle a sous les yeux : rien n'est soufflé.
 */
export function problemes(monde: Monde, p: Personnage): Probleme[] {
  const liste: Probleme[] = [];
  const inv = p.corps.inventaire;
  const d = p.drapeaux;
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  const saison = monde.horloge.moment().saison;

  // La faim : ce qu'on n'attrape pas.
  if (d.joursFaim >= 2 || d.faimMinDuJour < 35) {
    const poids = Math.min(1, 0.4 + d.joursFaim * 0.15);
    const pres = (type: string): boolean =>
      [...p.connaissance.values()].some((l) => l.type === type && l.quantiteVue >= 1);
    if (pres("poisson"))
      liste.push({
        cle: "faim_poisson",
        fonction: "pecher",
        plainte: "Le poisson file entre les doigts.",
        poids,
      });
    if (pres("gibier"))
      liste.push({
        cle: "faim_gibier",
        fonction: "chasser",
        plainte: "Le gibier part avant qu'on l'approche.",
        poids,
      });
  }

  // Le froid.
  if (d.joursFroid >= 1 || d.chaleurMinDuJour < 40)
    liste.push({
      cle: "froid",
      fonction: "chauffer",
      plainte: "On gèle, même à l'abri.",
      poids: Math.min(1, 0.35 + d.joursFroid * 0.2 + (saison === "hiver" ? 0.2 : 0)),
    });

  // Ce qui pourrit.
  if (d.nourritureGateeJusqua > tick)
    liste.push({
      cle: "pourriture",
      fonction: "conserver",
      plainte: "Ce qu'on rentre se gâte avant qu'on le mange.",
      poids: 0.55,
    });

  // Les plaies.
  const blessures = p.corps.etat.blessures;
  if (blessures.some((b) => b.saigne || b.infectee) && !possede(inv, "bandage"))
    liste.push({
      cle: "plaies",
      fonction: "soigner",
      plainte: "Une plaie qu'on ne referme pas emporte son homme.",
      poids: 0.6,
    });

  // Les mains pleines.
  if (placeLibre(inv) <= 1)
    liste.push({
      cle: "charge",
      fonction: "porter",
      plainte: "Mes bras ne suffisent plus à tout rapporter.",
      poids: 0.35,
    });

  // La guerre qu'on a perdue, ou celle qui vient.
  if (d.bataille != null || d.alerteJusqua > tick)
    liste.push({
      cle: "guerre",
      fonction: "frapper",
      plainte: "Nos armes ne valent pas les leurs.",
      poids: 0.5,
    });

  // Les gisements qui résistent : ce qu'on voit et qu'on n'entame pas.
  const gisementsVus = new Set(
    [...p.connaissance.values()].filter((l) => l.quantiteVue >= 1).map((l) => l.type),
  );
  if (gisementsVus.has("bois") && quantite(inv, "bois") < 2 && d.joursFaim < 3)
    liste.push({
      cle: "bois",
      fonction: "couper",
      plainte: "Abattre un arbre prend la journée.",
      poids: 0.32,
    });
  if (gisementsVus.has("minerai") || gisementsVus.has("pierre"))
    liste.push({
      cle: "roche",
      fonction: "creuser",
      plainte: "La roche ne cède pas.",
      poids: 0.32,
    });

  // Un chantier qui traîne.
  if (p.projet !== null && tick - (p.drapeaux.observeTick ?? tick) < 3 * T)
    liste.push({
      cle: "chantier",
      fonction: "batir",
      plainte: "Ce chantier n'avance pas.",
      poids: 0.3,
    });

  liste.sort((a, b) => b.poids - a.poids || (a.cle < b.cle ? -1 : 1));
  return liste;
}

/** Les matières qu'une personne a sous la main ou sous les yeux. */
export function matieresConnues(monde: Monde, p: Personnage): FicheMatiere[] {
  const vues = new Set<string>();
  for (const l of p.connaissance.values()) if (l.quantiteVue >= 1) vues.add(l.type);
  const liste: FicheMatiere[] = [];
  for (const f of monde.trouvailles.matieres.values()) {
    if (f.ressource !== null) {
      // Une matière brute : il faut en avoir en poche, en stock, ou en avoir vu.
      if (quantite(p.corps.inventaire, f.ressource) >= 1 || vues.has(f.ressource)) {
        liste.push(f);
        continue;
      }
      for (const b of batimentsAccessibles(monde, p)) {
        if (b.stock !== null && quantite(b.stock, f.ressource) >= 1) {
          liste.push(f);
          break;
        }
      }
      continue;
    }
    // Une matière dérivée : il faut l'avoir tirée du four, ou l'avoir apprise.
    if (p.matieresSues?.has(f.id) === true) liste.push(f);
  }
  liste.sort((a, b) => (a.id < b.id ? -1 : 1));
  return liste;
}

/** Les ateliers dont cette personne dispose. */
function ateliers(monde: Monde, p: Personnage): Set<Atelier> {
  const dispo = new Set<Atelier>();
  for (const b of batimentsAccessibles(monde, p)) {
    if (b.etat !== "termine") continue;
    const a = PLANS_BATIMENT[b.type].atelier;
    if (a !== null && (a !== "feu" || b.allume)) dispo.add(a);
  }
  return dispo;
}

/** Les procédés qu'elle sait mener : son niveau d'artisanat et ses ateliers. */
export function procedesPossibles(monde: Monde, p: Personnage): Procede[] {
  const niv = niveau(p.experience.artisanat);
  const dispo = ateliers(monde, p);
  return PROCEDES.filter((c) => {
    const f = PROCEDE[c];
    return f.niveau <= niv && (f.atelier === null || dispo.has(f.atelier));
  });
}

/** A-t-elle déjà une idée en chantier ? Une à la fois. */
function ideeEnCours(p: Personnage): boolean {
  for (const [k, v] of p.savoirs)
    if (k.startsWith("t:") && v.force >= SEUIL_SAVOIR && v.force < 1) return true;
  return false;
}

/** Les idées jamais réalisées finissent par s'effacer : on passe à autre chose. */
export function oublierIdees(monde: Monde, p: Personnage): void {
  const limite = JOURS_IDEE * monde.horloge.ticksParJour;
  for (const [k, v] of p.savoirs) {
    if (!k.startsWith("t:") || v.force >= 1) continue;
    if (monde.horloge.tick - v.depuis > limite) p.savoirs.delete(k);
  }
}

/**
 * La réflexion du soir d'un curieux : un problème, une matière, un procédé, et
 * une idée. Renvoie la trouvaille et la plainte qui l'a fait naître, ou `null`.
 *
 * Elle ne sort une idée que si elle vaut mieux que ce qu'on sait déjà faire sur
 * ce levier : personne n'invente la hache de pierre deux fois.
 */
export function chercher(
  monde: Monde,
  p: Personnage,
): { trouvaille: Trouvaille; probleme: Probleme } | null {
  if (p.corps.stade === "enfant" || !p.vivant) return null;
  oublierIdees(monde, p);
  if (ideeEnCours(p)) return null;
  const curiosite = p.identite.personnalite.ouverture;
  if (curiosite < 0.35) return null;

  const ennuis = problemes(monde, p).filter((x) => x.poids >= POIDS_MINIMAL);
  if (ennuis.length === 0) return null;
  const matieres = matieresConnues(monde, p);
  if (matieres.length === 0) return null;
  const procedes = procedesPossibles(monde, p);
  if (procedes.length === 0) return null;

  // On cherche d'abord, sans tirer au sort : le meilleur remède à l'ennui le plus vif.
  const piste = meilleurRemede(monde, p, ennuis, matieres, procedes);
  if (piste === null) return null;
  const { trouvee, ennui } = piste;

  // Et l'idée ne vient pas toujours : un seul tirage par soir.
  if (!p.rng.chance(0.06 + curiosite * 0.14 + ennui.poids * 0.1)) return null;

  // Quelqu'un l'a peut-être déjà trouvée : alors c'est la sienne qu'on refait.
  const connue = monde.trouvailles.trouvailles.get(trouvee.id);
  const retenue = connue ?? trouvee;
  if (connue === undefined) {
    retenue.probleme = ennui.plainte;
    retenue.inventeur = p.identite.prenom;
    retenue.village = villageDe(monde, p);
    retenue.jour = monde.horloge.moment().jourAbsolu;
    retenirTrouvaille(monde.trouvailles, retenue);
  }
  apprendre(p, retenue.id, SEUIL_SAVOIR, p.identite.prenom, monde.horloge.tick);
  return { trouvaille: retenue, probleme: ennui };
}

function villageDe(monde: Monde, p: Personnage): string | null {
  for (const v of monde.villages.villages)
    if (v.familles.includes(p.identite.nomFamille)) return v.id;
  return null;
}

/**
 * Devant un four, un curieux mêle ce qu'il a et en tire parfois une matière
 * nouvelle, à laquelle il donne un nom. C'est ainsi que la chaîne s'allonge :
 * le cuivre devient bronze, le bronze devient autre chose, sans fin.
 */
export function melanger(monde: Monde, p: Personnage): FicheMatiere | null {
  if (p.corps.stade === "enfant" || !p.vivant) return null;
  const curiosite = p.identite.personnalite.ouverture;
  if (curiosite < 0.45) return null;
  const possibles = procedesPossibles(monde, p).filter((c) => PROCEDE[c].derive);
  if (possibles.length === 0) return null;

  // On ne mêle que ce qu'on a vraiment en main, en quantité : ça se paie.
  // **[DÉCISION]** On ne filtre plus sur `tenue >= 40 || durete >= 40` (M46) : c'était
  // un doublon de ce que `deriverMatiere` vérifie déjà — `fusible` d'un côté, le seuil
  // propre au procédé de l'autre — et un doublon faux. Le minerai brut vaut 28 de
  // dureté et 25 de tenue, donc il échouait ; or `fondre` n'exige rien, et fondre du
  // minerai brut est exactement le premier pas que la grammaire décrit. Comme la seule
  // autre matière fusible du départ est le cuivre, qu'on n'obtient que par la fonte,
  // les deux verrous se fermaient l'un sur l'autre : aucun monde neuf ne pouvait
  // entrer dans l'âge du métal.
  const fusibles = matieresConnues(monde, p).filter(
    (m) => m.fusible && aDeQuoi(p, ingredientsDe(monde.trouvailles, m.id, 3)),
  );
  if (fusibles.length === 0) return null;
  // Le dé se tire **après** avoir vu qu'on a de quoi : autrement on brûlait sa chance
  // sur les tours où l'on n'avait rien dans les mains (M46, l'inversion que M41 a
  // corrigée dans `chercher` et oubliée ici).
  if (!p.rng.chance(0.015 + curiosite * 0.03)) return null;
  const procede = p.rng.choisir(possibles);
  // **[DÉCISION]** Deux raffinements de ce tirage ont été essayés et **retirés**,
  // mesure en main (M46), pour qu'on ne les retente pas : appliquer ici le seuil
  // `exige` du procédé, puis pondérer le tirage par la qualité de la matière
  // (dureté + tenue). Les deux ont rendu, sur six mondes de neuf cents jours, un
  // résultat **identique au bit près** au tirage simple. La raison est arithmétique :
  // pondérer ou filtrer ne change rien quand il n'y a qu'un seul candidat, et
  // `fusibles` n'en contient presque jamais deux — un forgeron ne tient qu'une matière
  // fusible à la fois, parce que le minerai est rare (vingt-sept récoltés en cinq ans
  // dans un village). La profondeur de la chaîne des alliages n'est donc pas bornée
  // par ce choix mais par la **quantité de métal en circulation** : c'est un sujet de
  // mine et de transport, pas de tirage.
  const parents =
    procede === "allier"
      ? [p.rng.choisir(fusibles), p.rng.choisir(fusibles)]
      : [p.rng.choisir(fusibles)];
  // On n'allie pas une chose avec elle-même.
  if (procede === "allier" && parents[0]?.id === parents[1]?.id) return null;
  const nee = deriverMatiere(monde.trouvailles, p.rng, procede, parents);
  if (nee === null) return null;
  // La coulée consomme ce qu'on y a mis.
  for (const parent of parents)
    for (const [r, n] of Object.entries(ingredientsDe(monde.trouvailles, parent.id, 3)))
      retirer(p.corps.inventaire, r as Ressource, n);
  p.matieresSues ??= new Set();
  p.matieresSues.add(nee.id);
  for (const m of monde.personnages) {
    if (m.vivant && m.identite.nomFamille === p.identite.nomFamille) {
      m.matieresSues ??= new Set();
      m.matieresSues.add(nee.id);
    }
  }
  return nee;
}

/** A-t-on tout ça en poche ? */
function aDeQuoi(p: Personnage, besoin: Partial<Record<Ressource, number>>): boolean {
  for (const [r, n] of Object.entries(besoin) as [Ressource, number][])
    if (quantite(p.corps.inventaire, r) < n) return false;
  return true;
}

/**
 * Qui apprend une trouvaille apprend la matière dont elle est faite : sans
 * savoir couler le bronze, on ne referait pas l'épée qu'on vous a montrée.
 */
export function apprendreMatiere(monde: Monde, p: Personnage, idTrouvaille: string): void {
  const t = monde.trouvailles.trouvailles.get(idTrouvaille);
  if (t === undefined) return;
  const f = monde.trouvailles.matieres.get(t.matiere);
  if (f?.ressource != null) return;
  if (f === undefined) return;
  p.matieresSues ??= new Set();
  p.matieresSues.add(f.id);
}

/**
 * Le meilleur remède à l'ennui le plus vif : on descend la liste des problèmes,
 * et pour le premier qui trouve une réponse dans la grammaire, on garde la
 * meilleure combinaison. Aucun tirage au sort ici : que du raisonnement.
 */
function meilleurRemede(
  monde: Monde,
  p: Personnage,
  ennuis: readonly Probleme[],
  matieres: readonly FicheMatiere[],
  procedes: readonly Procede[],
): { trouvee: Trouvaille; ennui: Probleme } | null {
  for (const ennui of ennuis) {
    const levier = FONCTION[ennui.fonction].levier;
    const dejaSu = bonusSu(monde.trouvailles, [p.savoirs.keys()], levier);
    let meilleure: Trouvaille | null = null;
    let meilleureNote = 0;
    for (const matiere of matieres) {
      for (const procede of procedes) {
        if (!combinaisonValide(ennui.fonction, procede, matiere)) continue;
        const t = composerTrouvaille(monde.trouvailles, ennui.fonction, procede, matiere);
        if (t === null) continue;
        // Inutile de refaire ce qu'on a déjà, ou moins bien.
        if (1 + t.gain <= dejaSu + 0.05) continue;
        if ((p.savoirs.get(t.id)?.force ?? 0) >= SEUIL_SAVOIR) continue;
        // À gain proche, on préfère ce qu'on peut vraiment réunir (M41).
        const note = t.gain * (matieresAPortee(monde, p, t) ? 1 : 0.6);
        if (meilleure === null || note > meilleureNote) {
          meilleure = t;
          meilleureNote = note;
        }
      }
    }
    if (meilleure !== null) return { trouvee: meilleure, ennui };
  }
  return null;
}

/**
 * A-t-on de quoi faire cette trouvaille, en poche ou dans un stock accessible ?
 * C'est ce qui sépare une idée qu'on réalisera d'une idée en l'air (M41).
 */
export function matieresAPortee(monde: Monde, p: Personnage, t: Trouvaille): boolean {
  for (const [r, n] of Object.entries(t.ingredients) as [Ressource, number][]) {
    let dispo = quantite(p.corps.inventaire, r);
    if (dispo >= n) continue;
    for (const b of batimentsAccessibles(monde, p))
      if (b.stock !== null) dispo += quantite(b.stock, r);
    if (dispo < n) return false;
  }
  return true;
}

/**
 * À l'aube, le monde oublie les trouvailles que plus personne ne connaît, qui
 * n'ont jamais été réussies et dont personne ne porte d'exemplaire (M41) : sans
 * cela le registre — et l'onglet Inventions — grossit sans fin d'idées mortes.
 * Rien n'est perdu : l'identifiant vient du triplet, donc la même idée peut
 * revenir un jour à quelqu'un d'autre.
 */
export function oublierTrouvailles(monde: Monde): number {
  const connues = new Set<string>();
  for (const p of monde.personnages) {
    if (!p.vivant) continue;
    for (const [k, v] of p.savoirs) if (k.startsWith("t:") && v.force > 0) connues.add(k);
    for (const o of p.corps.inventaire.objets)
      if (o.trouvaille !== undefined) connues.add(o.trouvaille);
  }
  for (const b of monde.batiments.values())
    if (b.stock !== null)
      for (const o of b.stock.objets) if (o.trouvaille !== undefined) connues.add(o.trouvaille);
  let oubliees = 0;
  for (const [id, t] of monde.trouvailles.trouvailles) {
    if (connues.has(id)) continue;
    // On laisse sa chance à une trouvaille toute neuve.
    if (monde.horloge.moment().jourAbsolu - t.jour < JOURS_IDEE) continue;
    monde.trouvailles.trouvailles.delete(id);
    oubliees += 1;
  }
  return oubliees;
}
