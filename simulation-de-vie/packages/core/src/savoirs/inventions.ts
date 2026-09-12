/**
 * Inventions : un besoin répété, une personne curieuse, et une idée le soir ;
 * puis un prototype, qui peut rater, avant que le savoir ne se répande.
 */
import { placeLibre, possede, quantite } from "../agents/inventaire.js";
import type { Personnage } from "../agents/personnage.js";
import type { Monde } from "../monde.js";
import { INVENTIONS, SEUIL_SAVOIR } from "./catalogue.js";
import type { Invention } from "./catalogue.js";
import { apprendre } from "./lecons.js";

/** Le besoin qui fait naître l'idée, pour chaque invention. */
function besoinRessenti(monde: Monde, p: Personnage, invention: Invention): boolean {
  const lieux = [...p.connaissance.values()];
  const inv = p.corps.inventaire;
  const saison = monde.horloge.moment().saison;
  switch (invention) {
    case "filet":
      return (
        lieux.some((l) => l.type === "poisson" && l.quantiteVue >= 1) &&
        possede(inv, "canne_a_peche") &&
        (saison === "automne" || p.drapeaux.faimMinDuJour < 40)
      );
    case "piege":
      return lieux.some((l) => l.type === "gibier" && l.quantiteVue >= 1) && !possede(inv, "lance");
    case "pirogue":
      return (
        lieux.filter((l) => l.type === "eau").length >= 25 &&
        p.identite.personnalite.ouverture > 0.5 &&
        monde.horloge.moment().jourAbsolu >= 20
      );
    case "osselets":
      return (
        (p.besoins.moral < 80 || p.besoins.social < 60) && monde.horloge.moment().jourAbsolu >= 10
      );
    case "arc":
      return (
        lieux.some((l) => l.type === "gibier" && l.quantiteVue >= 1) &&
        (possede(inv, "lance") || possede(inv, "piege")) &&
        (saison === "automne" || p.drapeaux.faimMinDuJour < 50)
      );
    case "fumoir":
      return (
        (saison === "automne" || saison === "ete") &&
        [...monde.batiments.values()].some(
          (b) =>
            b.etat === "termine" &&
            b.stock !== null &&
            b.famille === p.identite.nomFamille &&
            (b.stock.ressources.poisson ?? 0) >= 20,
        )
      );
    case "couche":
      return p.besoins.sommeil < 45 && p.drapeaux.chaleurMinDuJour < 60;
    case "traineau":
      return placeLibre(inv) === 0 && p.identite.personnalite.conscience > 0.45;
    case "flute":
      return (
        (p.besoins.social < 55 || p.besoins.moral < 65) &&
        monde.horloge.moment().jourAbsolu >= 15 &&
        !possede(inv, "osselets")
      );
    case "vetement":
      return (
        p.drapeaux.chaleurMinDuJour < 40 &&
        !possede(inv, "vetement_cuir") &&
        (quantite(inv, "cuir") >= 1 || lieux.some((l) => l.type === "gibier" && l.quantiteVue >= 1))
      );
  }
}

/**
 * Réflexion du soir d'un adulte : une idée peut venir. Au plus une idée en
 * cours à la fois ; l'ouverture d'esprit fait la curiosité.
 */
export function inventer(monde: Monde, p: Personnage): Invention | null {
  if (p.corps.stade === "enfant") return null;
  const tick = monde.horloge.tick;
  const T = monde.horloge.ticksParJour;
  // Une idée jamais réalisée s'efface au bout de vingt jours ; on passe à autre chose.
  for (const [k, v] of p.savoirs) {
    if (k in INVENTIONS && v.force >= SEUIL_SAVOIR && v.force < 1 && tick - v.depuis > 20 * T)
      p.savoirs.delete(k);
  }
  const enCours = [...p.savoirs.entries()].some(
    ([k, v]) => k in INVENTIONS && v.force >= SEUIL_SAVOIR && v.force < 1,
  );
  if (enCours) return null;
  const chance = 0.02 + p.identite.personnalite.ouverture * 0.06;
  for (const invention of Object.keys(INVENTIONS) as Invention[]) {
    if ((p.savoirs.get(invention)?.force ?? 0) >= SEUIL_SAVOIR) continue;
    if (!besoinRessenti(monde, p, invention)) continue;
    // Si quelqu'un l'a déjà inventé, on l'apprendra plutôt qu'on ne le réinventera.
    const dejaInvente = monde.personnages.some(
      (x) => x.vivant && (x.savoirs.get(invention)?.force ?? 0) >= 1,
    );
    if (!p.rng.chance(dejaInvente ? chance * 0.2 : chance)) continue;
    apprendre(p, invention, SEUIL_SAVOIR, p.identite.prenom, tick);
    return invention;
  }
  return null;
}
