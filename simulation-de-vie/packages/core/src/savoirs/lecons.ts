/**
 * Leçons tirées des décès : à chaque mort, le moteur fait l'autopsie de la
 * situation et en déduit une ou deux morales, que la famille et les témoins
 * retiennent. Elles se transmettent ensuite par le dialogue et aux enfants.
 */
import type { Personnage } from "../agents/personnage.js";
import { possede } from "../agents/inventaire.js";
import { PLANS_BATIMENT } from "../monde/batiments.js";
import { Grille } from "../monde/grille.js";
import { abriDisponible, autorise, feuProche, membresFamille } from "../monde.js";
import type { Monde } from "../monde.js";
import { SEUIL_SAVOIR } from "./catalogue.js";
import type { Lecon, Savoir, SavoirAcquis } from "./catalogue.js";

export function connait(p: Personnage, savoir: Savoir): boolean {
  return (p.savoirs.get(savoir)?.force ?? 0) >= SEUIL_SAVOIR;
}

/** Retient un savoir, sans jamais l'affaiblir. Renvoie vrai s'il y a du nouveau. */
export function apprendre(
  p: Personnage,
  savoir: Savoir,
  force: number,
  origine: string | null = null,
  tick = 0,
): boolean {
  const actuel = p.savoirs.get(savoir);
  if (actuel !== undefined && actuel.force >= force) return false;
  const acquis: SavoirAcquis = { force, origine: origine ?? actuel?.origine ?? null, depuis: tick };
  p.savoirs.set(savoir, acquis);
  return true;
}

/** Savoirs connus (force suffisante). */
export function savoirsConnus(p: Personnage): Set<Savoir> {
  const s = new Set<Savoir>();
  for (const [k, v] of p.savoirs) if (v.force >= SEUIL_SAVOIR) s.add(k);
  return s;
}

/**
 * Autopsie : que faut-il retenir de cette mort ? Les leçons sont rendues de la
 * plus évidente à la moins évidente (deux au plus).
 */
export function tirerLecons(monde: Monde, defunt: Personnage, cause: string): Lecon[] {
  const lecons: Lecon[] = [];
  const b = defunt.besoins;
  const pos = defunt.corps.position;
  const saison = monde.horloge.moment().saison;
  const saisonFroide = saison === "automne" || saison === "hiver";
  const enfant = defunt.corps.stade === "enfant";
  const chaleurAPortee =
    abriDisponible(monde, defunt) !== null ||
    feuProche(monde, pos) !== null ||
    [...monde.batiments.values()].some(
      (x) =>
        x.etat === "termine" &&
        PLANS_BATIMENT[x.type].abri &&
        Grille.distance(x.position, pos) <= 30,
    );
  const stockPleinAilleurs = [...monde.batiments.values()].some(
    (x) =>
      x.etat === "termine" &&
      x.stock !== null &&
      !autorise(monde, x, defunt) &&
      (x.stock.ressources.poisson ?? 0) +
        (x.stock.ressources.baies ?? 0) +
        (x.stock.ressources.repas_cuit ?? 0) >=
        10,
  );
  const puits = [...monde.batiments.values()].some(
    (x) => x.type === "puits" && x.etat === "termine",
  );

  switch (cause) {
    case "froid":
      if (chaleurAPortee) lecons.push("rentrer_quand_on_gele");
      if (b.faim < 15 && saisonFroide) lecons.push("provisions_hiver");
      if (!aChaudSurLui(defunt)) lecons.push("vetements_chauds");
      if (enfant) lecons.push("enfants_dabord");
      break;
    case "faim":
      if (stockPleinAilleurs) lecons.push("partager_en_hiver");
      if (saisonFroide) lecons.push("provisions_hiver");
      if (enfant) lecons.push("enfants_dabord");
      break;
    case "soif":
      if (!puits) lecons.push("puits_pres_du_village");
      break;
    case "hémorragie":
    case "infection":
      lecons.push("soigner_les_blesses");
      break;
    case "accouchement":
      lecons.push("accoucheuse");
      break;
    default:
      break;
  }
  if (lecons.length === 0 && enfant && cause !== "vieillesse") lecons.push("enfants_dabord");
  return [...new Set(lecons)].slice(0, 2);
}

/** Qui retient une leçon : la famille, le partenaire, et les témoins proches. */
export function apprenants(monde: Monde, defunt: Personnage, rayon = 10): Personnage[] {
  const resultat = new Set<Personnage>();
  for (const p of membresFamille(monde, defunt)) if (p.id !== defunt.id) resultat.add(p);
  for (const p of monde.personnages) {
    if (!p.vivant || p.id === defunt.id) continue;
    const lien = p.relations.get(defunt.id)?.lien;
    if (lien === "partenaire" || lien === "ami") resultat.add(p);
    if (Grille.distance(p.corps.position, defunt.corps.position) <= rayon) resultat.add(p);
  }
  return [...resultat].sort((a, b) => a.id.localeCompare(b.id));
}

/** Porte un vêtement de cuir. */
export function aChaudSurLui(p: Personnage): boolean {
  return possede(p.corps.inventaire, "vetement_cuir");
}
