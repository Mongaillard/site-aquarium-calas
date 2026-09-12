/**
 * Cerveau à règles (section 10.6) : sélection par score d'utilité pondéré par
 * la personnalité, avec un bruit seedé de ±10 %.
 */
import { INVENTIONS } from "../savoirs/catalogue.js";
import type { Invention, Savoir } from "../savoirs/catalogue.js";
import { NOURRITURE } from "../agents/inventaire.js";
import { urgence } from "../agents/besoins.js";
import type { Personnage } from "../agents/personnage.js";
import type { Intention } from "../actions/types.js";
import type { Ressource } from "../monde/ressources.js";
import type { Perception, PerceptionLegere } from "./perception.js";
import type { Cerveau } from "./types.js";

/** En dessous de ces valeurs, boire / manger deviennent des candidats. */
export const SEUILS_ENVIE = {
  soif: 80,
  faim: 70,
} as const;

/** En dessous de ces valeurs, boire / manger interrompent le plan en cours. */
export const SEUILS_URGENCE = {
  soif: 15,
  faim: 12,
  chaleur: 25,
} as const;

interface Candidat {
  readonly intention: Intention;
  readonly score: number;
}

export class RuleBrain implements Cerveau {
  constructor(private readonly personnage: Personnage) {}

  urgence(perception: PerceptionLegere): Intention | null {
    const b = perception.moi.besoins;
    if (b.soif < SEUILS_URGENCE.soif) return { type: "boire" };
    // Le froid tue plus vite que la faim : quand on gèle et qu'une chaleur est
    // à portée, on rentre d'abord, sauf si l'on a de quoi manger sur soi.
    // Qui a retenu la leçon rentre plus tôt.
    const seuilChaleur = perception.moi.savoirs.has("rentrer_quand_on_gele")
      ? SEUILS_URGENCE.chaleur + 15
      : SEUILS_URGENCE.chaleur;
    const gele = b.chaleur < seuilChaleur && (perception.abriDisponible || perception.feuConnu);
    const affame = b.faim < SEUILS_URGENCE.faim;
    if (gele && !(affame && perception.moi.nourritureEnPoche)) return { type: "se_rechauffer" };
    if (affame) return { type: "manger" };
    return null;
  }

  decider(perception: Perception): Intention {
    const candidats = this.candidats(perception);
    let meilleur: Candidat | null = null;
    for (const c of candidats) {
      const bruit = 0.9 + 0.2 * this.personnage.rng.suivant();
      const score = c.score * bruit;
      if (meilleur === null || score > meilleur.score) meilleur = { intention: c.intention, score };
    }
    return meilleur?.intention ?? { type: "attendre", ticks: 3 };
  }

  /** Candidats et scores bruts (exposé pour les tests). */
  candidats(perception: Perception): Candidat[] {
    const { besoins, personnalite, nourritureEnPoche, placeLibre, stade, projet } = perception.moi;
    const lieux = perception.lieuxConnus;
    const connait = (type: Ressource): boolean =>
      lieux.some((l) => l.type === type && l.quantiteVue >= 1 && l.outilRequis === null);
    const connaitEau = connait("eau");
    const connaitNourriture = (Object.keys(NOURRITURE) as Ressource[]).some(connait);
    const adulte = stade !== "enfant";
    const nuit = perception.moment.estNuit;
    const froid = urgence(besoins.chaleur);
    const candidats: Candidat[] = [];

    if (besoins.soif < SEUILS_ENVIE.soif) {
      candidats.push({
        intention: { type: "boire" },
        score: urgence(besoins.soif) * 3 + (connaitEau ? 0 : -0.1),
      });
    }

    if (besoins.faim < SEUILS_ENVIE.faim) {
      candidats.push({
        intention: { type: "manger" },
        score:
          urgence(besoins.faim) * 2.5 +
          (nourritureEnPoche ? 0.15 : connaitNourriture || perception.stockAccessible ? 0 : -0.2),
      });
    }

    if (besoins.sommeil < 80 || (nuit && perception.abriDisponible && besoins.sommeil < 95)) {
      candidats.push({
        intention: { type: "dormir" },
        score:
          urgence(besoins.sommeil) * 2 +
          (nuit ? 0.5 : 0) +
          (nuit && perception.abriDisponible ? 0.4 : 0) +
          (perception.abriDisponible || perception.feuConnu ? froid * 1.5 : 0),
      });
    }

    const saisonFroide = perception.saison === "automne" || perception.saison === "hiver";
    const sait = (s: Savoir): boolean => perception.moi.savoirs.has(s);

    // Se réchauffer au feu ou à l'abri quand on a froid (plus tôt si l'on a retenu la leçon).
    if (
      besoins.chaleur < (sait("rentrer_quand_on_gele") ? 75 : 60) &&
      (perception.feuConnu || perception.abriDisponible)
    ) {
      candidats.push({
        intention: { type: "se_rechauffer" },
        score:
          urgence(besoins.chaleur) * 4 +
          (saisonFroide ? 0.3 : 0) +
          (nuit ? 0.3 : 0) +
          (sait("rentrer_quand_on_gele") ? 0.3 : 0),
      });
    }

    // Constituer une réserve de nourriture (conscience) quand on sait où en trouver.
    const nourriture = perception.nourritureAccessible;
    if (adulte && nourriture !== null && placeLibre > 0 && !nourritureEnPoche) {
      candidats.push({
        intention: { type: "recolter", ressource: nourriture },
        score:
          0.25 +
          personnalite.conscience * 0.45 +
          urgence(besoins.faim) * 0.5 +
          (perception.moi.prudenceNourriture ? 0.3 : 0) +
          (perception.moi.enfantsACharge > 0 ? 0.35 : 0),
      });
    }

    // Provisions : en automne, on remplit les stocks pour l'hiver ; qui a retenu la
    // leçon s'y met dès l'été et y tient davantage.
    const prevoyant = sait("provisions_hiver");
    if (
      adulte &&
      nourriture !== null &&
      perception.stockAccessible &&
      placeLibre > 3 &&
      (saisonFroide || (prevoyant && perception.saison === "ete"))
    ) {
      candidats.push({
        intention: { type: "recolter", ressource: nourriture },
        score:
          0.35 +
          personnalite.conscience * 0.5 +
          (perception.saison === "automne" ? 0.2 : 0) +
          (prevoyant ? 0.4 : 0),
      });
    }
    if (adulte && perception.stockAccessible && perception.nourritureEnPocheQuantite >= 6) {
      candidats.push({
        intention: { type: "stocker" },
        score: 0.5 + personnalite.conscience * 0.3,
      });
    }

    // Une canne à pêche ouvre l'accès au poisson.
    if (adulte && perception.connaitPoisson && !perception.possedeCanne && placeLibre > 0) {
      candidats.push({
        intention: { type: "fabriquer", recette: "canne_a_peche" },
        score:
          0.35 +
          personnalite.conscience * 0.3 +
          urgence(besoins.faim) * 0.5 +
          (saisonFroide ? 0.3 : 0),
      });
    }

    // Parler : besoin social, extraversion, affinité ; pas deux fois de suite avec la même personne.
    const tick = perception.moment.tick;
    const interlocuteurs = perception.personnesVisibles.filter(
      (v) => !v.endormi && v.derniereInteraction < tick - (v.eligible ? 24 : 36),
    );
    if (interlocuteurs.length > 0 && besoins.social < 90) {
      let meilleur = interlocuteurs[0];
      let meilleurScore = -Infinity;
      for (const v of interlocuteurs) {
        const sc =
          v.affinite / 100 +
          (v.famille ? 0.2 : 0) +
          (v.eligible ? 0.35 + v.attirance / 100 : 0) +
          (v.lien === "inconnu" ? personnalite.ouverture * 0.3 : 0) -
          v.distance * 0.02;
        if (sc > meilleurScore) {
          meilleurScore = sc;
          meilleur = v;
        }
      }
      if (meilleur !== undefined) {
        candidats.push({
          intention: { type: "parler", cible: meilleur.id },
          score:
            0.2 +
            urgence(besoins.social) * 2.5 +
            personnalite.extraversion * 0.6 +
            Math.max(0, meilleurScore) * 0.3,
        });
      }
    }

    // Offrir à quelqu'un qui a faim quand on a des vivres ; en hiver, qui a retenu la
    // leçon partage même avec les autres familles, et donne aux enfants d'abord.
    const partageur = sait("partager_en_hiver") && saisonFroide;
    const affames = perception.personnesVisibles
      .filter((v) => v.aFaim && !v.endormi)
      .sort((x, y) => Number(y.stade === "enfant") - Number(x.stade === "enfant"));
    const v0 = affames[0];
    if (
      adulte &&
      v0 !== undefined &&
      perception.moi.ressourceNourriture !== null &&
      (perception.moi.nourritureCrue >= 3 ||
        (partageur && perception.nourritureEnPocheQuantite >= 2))
    ) {
      candidats.push({
        intention: { type: "offrir", cible: v0.id, ressource: perception.moi.ressourceNourriture },
        score:
          0.3 +
          personnalite.agreabilite * 0.7 +
          (v0.famille ? 0.3 : 0) +
          v0.affinite / 200 +
          (partageur ? 0.5 : 0) +
          (sait("enfants_dabord") && v0.stade === "enfant" ? 0.6 : 0),
      });
    }

    // Demander de la nourriture à un proche quand on en manque.
    if (besoins.faim < 40 && !nourritureEnPoche) {
      const proche = perception.personnesVisibles.find(
        (v) => !v.endormi && (v.famille || v.affinite >= 20),
      );
      if (proche !== undefined) {
        candidats.push({
          intention: { type: "demander", cible: proche.id, ressource: "baies" },
          score:
            urgence(besoins.faim) * 1.8 +
            (proche.famille ? 0.3 : 0) +
            (connaitNourriture ? -0.3 : 0.2),
        });
      }
    }

    // Nourrir ses enfants passe avant tout le reste.
    const enfantAffame = perception.personnesVisibles.find((v) => v.estMonEnfant && v.aUnPeuFaim);
    if (adulte && enfantAffame !== undefined && perception.moi.ressourceNourriture !== null) {
      candidats.push({
        intention: {
          type: "offrir",
          cible: enfantAffame.id,
          ressource: perception.moi.ressourceNourriture,
        },
        score: 1.2 + personnalite.agreabilite * 0.3 + (sait("enfants_dabord") ? 0.4 : 0),
      });
    }

    // Inventions : réaliser une idée, puis s'équiper de ce qu'on sait faire.
    if (adulte && placeLibre > 0) {
      for (const idee of perception.moi.ideesEnCours) {
        candidats.push({
          intention: { type: "fabriquer", recette: INVENTIONS[idee].recette },
          score: 0.55 + personnalite.ouverture * 0.3 + personnalite.conscience * 0.2,
        });
      }
      const equipement: { invention: Invention; utile: boolean }[] = [
        {
          invention: "filet",
          utile: perception.connaitPoisson && !perception.moi.possede("filet"),
        },
        {
          invention: "piege",
          utile:
            connait("gibier") &&
            !perception.moi.possede("piege") &&
            !perception.moi.possede("lance"),
        },
        {
          invention: "pirogue",
          utile: personnalite.ouverture > 0.5 && !perception.moi.possede("pirogue"),
        },
        { invention: "osselets", utile: besoins.moral < 60 && !perception.moi.possede("osselets") },
        {
          invention: "arc",
          utile: connait("gibier") && !perception.moi.possede("arc"),
        },
        {
          invention: "couche",
          utile:
            perception.abriDisponible && !perception.moi.possede("couche") && besoins.sommeil < 70,
        },
        {
          invention: "traineau",
          utile: placeLibre <= 2 && !perception.moi.possede("traineau"),
        },
        {
          invention: "flute",
          utile: (besoins.social < 60 || besoins.moral < 70) && !perception.moi.possede("flute"),
        },
        {
          invention: "vetement",
          utile:
            (saisonFroide || sait("vetements_chauds")) &&
            !perception.moi.possede("vetement_cuir") &&
            perception.moi.cuir >= 3,
        },
      ];
      for (const { invention, utile } of equipement) {
        if (!utile || !sait(invention) || perception.moi.ideesEnCours.includes(invention)) continue;
        if (invention === "fumoir") continue; // le fumoir est un bâtiment, pas un objet
        candidats.push({
          intention: { type: "fabriquer", recette: INVENTIONS[invention].recette },
          score:
            0.35 +
            personnalite.conscience * 0.3 +
            (invention === "vetement" && (saisonFroide || sait("vetements_chauds")) ? 0.5 : 0) +
            (invention === "osselets" ? urgence(besoins.moral) : 0),
        });
      }
    }

    // Un parent sans vivres va en chercher pour son enfant.
    if (adulte && enfantAffame !== undefined && perception.moi.ressourceNourriture === null) {
      if (connait("baies")) {
        candidats.push({
          intention: { type: "recolter", ressource: "baies" },
          score: 1.0 + personnalite.agreabilite * 0.3,
        });
      } else if (perception.stockAccessible) {
        candidats.push({ intention: { type: "manger" }, score: 0.6 }); // passe par le stock familial
      }
    }

    // Enfants : rester près d'un parent, demander à manger.
    if (!adulte) {
      // Un enfant qui a froid, ou que la nuit surprend, va se mettre au chaud
      // plutôt que d'attendre dehors qu'on s'occupe de lui.
      if ((besoins.chaleur < 70 || nuit) && (perception.abriDisponible || perception.feuConnu)) {
        candidats.push({
          intention: { type: "se_rechauffer" },
          score: 0.7 + urgence(besoins.chaleur) * 3 + (nuit ? 0.3 : 0),
        });
      }
      const parentProche = perception.moi.parents[0];
      if (parentProche !== undefined && parentProche.distance > 3) {
        candidats.push({
          intention: { type: "suivre", cible: parentProche.id },
          score:
            0.6 +
            urgence(besoins.securite) +
            urgence(besoins.faim) +
            Math.min(0.5, parentProche.distance / 20),
        });
      }
      const parent = perception.personnesVisibles.find((v) => v.estMonParent && !v.endormi);
      if (
        parent !== undefined &&
        besoins.faim < 45 &&
        !nourritureEnPoche &&
        parent.derniereInteraction < tick - 24
      ) {
        candidats.push({
          intention: { type: "demander", cible: parent.id, ressource: "baies" },
          score: 0.5 + urgence(besoins.faim) * 2,
        });
      }
    }

    // Cour : attirance et affinité suffisantes envers une personne libre.
    const courtisable = perception.personnesVisibles.find((v) => v.courtisable && !v.endormi);
    if (adulte && courtisable !== undefined && !nuit) {
      candidats.push({
        intention: { type: "courtiser", cible: courtisable.id },
        score:
          0.45 +
          courtisable.attirance / 120 +
          personnalite.extraversion * 0.3 +
          (perception.moi.valeurs.includes("famille") ? 0.2 : 0),
      });
    }

    // Reproduction : partenaire proche, abri disponible, personne enceinte.
    const partenaire = perception.moi.partenaire;
    const partenaireVisible = partenaire
      ? perception.personnesVisibles.find((v) => v.id === partenaire.id)
      : undefined;
    if (
      adulte &&
      partenaireVisible !== undefined &&
      !partenaireVisible.endormi &&
      !partenaireVisible.enceinte &&
      perception.moi.coupleFecond &&
      perception.abriDisponible &&
      !perception.moi.enceinte &&
      besoins.faim > 45 &&
      besoins.soif > 45 &&
      besoins.sommeil > 45
    ) {
      candidats.push({
        intention: { type: "se_reproduire" },
        score:
          0.35 +
          partenaireVisible.attirance / 150 +
          (nuit ? 0.35 : 0) +
          (perception.moi.valeurs.includes("famille") ? 0.3 : 0) +
          (perception.moi.valeurs.includes("plaisir") ? 0.2 : 0),
      });
    }

    // Voler : dernier recours des affamés peu scrupuleux.
    if (besoins.faim < 15 && !nourritureEnPoche && !connaitNourriture && perception.stockVolable) {
      candidats.push({
        intention: { type: "voler" },
        score: urgence(besoins.faim) * 2 * (1 - personnalite.agreabilite),
      });
    }

    // Construire : poursuivre son projet ou en lancer un pour un besoin réel.
    if (
      adulte &&
      (projet !== null || perception.besoinConstruction !== null || perception.reparationNecessaire)
    ) {
      const type = projet?.type ?? perception.besoinConstruction;
      const besoinAbri = (type === "abri" || type === "maison") && !perception.abriDisponible;
      const besoinFeu = type === "feu_de_camp" && !perception.feuConnu;
      candidats.push({
        intention: { type: "construire" },
        score:
          0.3 +
          personnalite.conscience * 0.4 +
          (projet !== null ? 0.15 : 0) +
          (perception.reparationNecessaire && projet === null ? 0.5 : 0) +
          (besoinAbri ? 0.5 + urgence(besoins.securite) + froid : 0) +
          (perception.moi.chercheAbri && (type === "abri" || type === "maison") ? 0.4 : 0) +
          (besoinFeu ? 0.3 + froid : 0) -
          (projet === null && perception.besoinConstruction === null ? 0.15 : 0) -
          (nuit ? 0.3 : 0),
      });
    }

    // Fabriquer une hache pour accéder aux arbres.
    if (adulte && !perception.moi.possedeHache && perception.connaitArbres && placeLibre > 0) {
      candidats.push({
        intention: { type: "fabriquer", recette: "hache_pierre" },
        score: 0.3 + personnalite.conscience * 0.3 + (projet !== null ? 0.15 : 0),
      });
    }

    // Fumer le poisson quand on a un fumoir et de quoi le remplir.
    if (
      adulte &&
      sait("fumoir") &&
      perception.fumoirConnu &&
      perception.moi.poissonCru >= 3 &&
      placeLibre > 0
    ) {
      candidats.push({
        intention: { type: "fabriquer", recette: "poisson_fume" },
        score: 0.4 + personnalite.conscience * 0.3 + (saisonFroide ? 0.3 : 0),
      });
    }

    // Chasser pour le cuir quand on sait ce qu'il vaut.
    if (
      adulte &&
      sait("vetements_chauds") &&
      !perception.moi.possede("vetement_cuir") &&
      perception.moi.cuir < 3 &&
      connait("gibier") &&
      placeLibre > 1
    ) {
      candidats.push({
        intention: { type: "recolter", ressource: "gibier" },
        score: 0.4 + personnalite.conscience * 0.2 + (saisonFroide ? 0.3 : 0),
      });
    }

    // Cuisiner ce que l'on porte près d'un feu.
    if (adulte && perception.moi.nourritureCrue >= 2 && perception.feuConnu) {
      candidats.push({
        intention: { type: "fabriquer", recette: "repas_cuit" },
        score: 0.2 + personnalite.conscience * 0.2 + urgence(besoins.faim) * 0.5,
      });
    }

    // Vider un inventaire encombré dans le stock familial.
    if (adulte && perception.stockAccessible && placeLibre <= 2) {
      candidats.push({
        intention: { type: "stocker" },
        score: 0.45 + personnalite.conscience * 0.2,
      });
    }

    // Explorer : d'autant plus que l'on connaît peu de lieux ou qu'il manque l'essentiel.
    const manque = (connaitEau ? 0 : 0.5) + (connaitNourriture ? 0 : 0.5);
    const familiarite = Math.min(1, lieux.length / 40);
    candidats.push({
      intention: { type: "explorer" },
      score:
        (adulte ? 0.15 : -0.2) +
        personnalite.ouverture * 0.35 +
        manque * 0.8 -
        familiarite * 0.2 -
        (nuit ? 0.2 : 0) -
        (perception.saison === "hiver" ? 0.3 : 0) +
        (perception.moi.explorerPlusLoin ? 0.3 : 0),
    });

    candidats.push({ intention: { type: "attendre", ticks: 3 }, score: 0.05 });
    return candidats;
  }
}
