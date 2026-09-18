/**
 * Cerveau à règles (section 10.6) : sélection par score d'utilité pondéré par
 * la personnalité, avec un bruit seedé de ±10 %.
 */
import { INVENTIONS } from "../savoirs/catalogue.js";
import { BETES_PAR_FAMILLE_MAX } from "../monde/village.js";
import type { Invention, Lecon, Savoir } from "../savoirs/catalogue.js";
import { NOURRITURE } from "../agents/inventaire.js";
import { urgence } from "../agents/besoins.js";
import type { Personnage } from "../agents/personnage.js";
import type { Intention } from "../actions/types.js";
import type { Ressource } from "../monde/ressources.js";
import type { Perception, PerceptionLegere } from "./perception.js";
import type { Cerveau } from "./types.js";
import { bonusPriorite } from "./conseil.js";

/** En dessous de ces valeurs, boire / manger deviennent des candidats. */
/** Réserve visée par le garde-manger : unités de nourriture en stock par bouche. */
export const RESERVE_VISEE = 4;

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

/**
 * En dessous de quelle chaleur il faut rentrer : de quoi tenir le trajet, plus la
 * marge de sécurité. **[DÉCISION]** Le seuil était fixe (25, ou 40 pour qui avait
 * retenu la leçon) et ne disait rien de la distance (M43) : une nuit d'hiver coûte
 * 1,1 point par tick et un pas prend un tick, si bien qu'à vingt pas de chez soi
 * on partait avec vingt-deux points pour un trajet qui en demandait vingt-deux —
 * les vingt-sept morts de froid mesurés étaient tous dehors, éveillés, en route.
 * On vise donc le coût du trajet (distance × perte, majoré de moitié) sans jamais
 * descendre sous l'ancien seuil ni monter au-delà de quatre-vingts : au-delà, on
 * ne sortirait plus de chez soi l'hiver.
 */
export function seuilRentrer(perception: {
  readonly moi: { readonly savoirs: ReadonlySet<Savoir> };
  readonly distanceChaleur: number;
  readonly perteChaleurParTick: number;
}): number {
  const plancher = perception.moi.savoirs.has("rentrer_quand_on_gele")
    ? SEUILS_URGENCE.chaleur + 15
    : SEUILS_URGENCE.chaleur;
  if (!Number.isFinite(perception.distanceChaleur)) return plancher;
  const trajet = perception.distanceChaleur * perception.perteChaleurParTick * 1.5;
  return Math.min(80, Math.max(plancher, trajet));
}

interface Candidat {
  readonly intention: Intention;
  readonly score: number;
}

/**
 * Ce qu'un abattu fait encore : boire, manger, récolter, fabriquer et réparer ses outils,
 * ranger, dormir, se réchauffer, fuir, se soigner. Le reste (bâtir, explorer, parler,
 * courtiser, jouer, prier) pèse moins.
 */
const NECESSAIRE = new Set<Intention["type"]>([
  "boire",
  "manger",
  "recolter",
  "fabriquer",
  "reparer",
  "stocker",
  "dormir",
  "se_rechauffer",
  "fuir",
  "soigner",
  "se_reposer",
]);

export class RuleBrain implements Cerveau {
  constructor(private readonly personnage: Personnage) {}

  urgence(perception: PerceptionLegere): Intention | null {
    const b = perception.moi.besoins;
    // Une bataille (M32) : engagé, on marche et on se bat avant tout le reste.
    const bataille = perception.moi.bataille ?? null;
    if (bataille !== null) return { type: "combattre", bataille };
    // Des loups : les armés secourent, les autres se mettent à l'abri.
    const menace = perception.menace ?? null;
    if (menace !== null) {
      if (
        perception.moi.arme === true &&
        menace.cible !== null &&
        menace.cible !== this.personnage.id
      )
        return { type: "defendre", cible: menace.cible };
      return { type: "fuir" };
    }
    if (b.soif < SEUILS_URGENCE.soif) return { type: "boire" };
    // Le froid tue plus vite que la faim : quand on gèle et qu'une chaleur est
    // à portée, on rentre d'abord, sauf si l'on a de quoi manger sur soi.
    // Qui a retenu la leçon rentre plus tôt.
    const seuilChaleur = seuilRentrer(perception);
    const gele = b.chaleur < seuilChaleur && Number.isFinite(perception.distanceChaleur);
    const affame = b.faim < SEUILS_URGENCE.faim;
    if (gele && !(affame && perception.moi.nourritureEnPoche)) return { type: "se_rechauffer" };
    if (affame) return { type: "manger" };
    if (perception.moi.saigneAvecBandage === true)
      return { type: "soigner", cible: this.personnage.id };
    return null;
  }

  decider(perception: Perception): Intention {
    const candidats = this.candidats(perception);
    let meilleur: Candidat | null = null;
    const dominante = perception.moi.intentionDominante;
    for (const c of candidats) {
      const bruit = 0.9 + 0.2 * this.personnage.rng.suivant();
      let score = this.ponderer(c.intention, c.score, perception.moi.corps.mobilite) * bruit;
      // Abattu : seul le nécessaire garde son poids ; l'ennui pousse vers autre chose.
      if (perception.moi.abattu && !NECESSAIRE.has(c.intention.type)) score *= 0.7;
      // La variété ne tente que le ventre plein et au chaud : la répétition, c'est aussi la survie.
      if (
        dominante !== null &&
        c.intention.type !== dominante &&
        perception.moi.besoins.faim >= 60 &&
        perception.moi.besoins.chaleur >= 60
      )
        score += 0.08;
      if (meilleur === null || score > meilleur.score) meilleur = { intention: c.intention, score };
    }
    return meilleur?.intention ?? { type: "attendre", ticks: 3 };
  }

  /** Pondération finale : un corps diminué se détourne des tâches qui demandent des jambes. */
  private ponderer(intention: Intention, score: number, mobilite: number): number {
    if (mobilite >= 0.8) return score;
    const marche =
      intention.type === "explorer" ||
      (intention.type === "recolter" && intention.ressource === "gibier");
    return marche ? score * 0.4 : score;
  }

  /** Candidats et scores bruts (exposé pour les tests). */
  candidats(perception: Perception): Candidat[] {
    const { besoins, personnalite, nourritureEnPoche, placeLibre, stade, projet } = perception.moi;
    const lieux = perception.lieuxConnus;
    const connait = (type: Ressource): boolean =>
      lieux.some((l) => l.type === type && l.quantiteVue >= 1 && l.outilRequis === null);
    const connaitEau = connait("eau");
    // Le gibier se chasse avec une arme : on le « connaît » dès qu'on a vu des bêtes.
    const connaitGibier = lieux.some((l) => l.type === "gibier" && l.quantiteVue >= 1);
    const connaitNourriture = (Object.keys(NOURRITURE) as Ressource[]).some(connait);
    const adulte = stade !== "enfant";
    const armeDeChasse =
      perception.moi.possede("lance") ||
      perception.moi.possede("arc") ||
      perception.moi.possede("piege");
    const nuit = perception.moment.estNuit;
    const placeALEnclos = perception.moi.betesFamille < BETES_PAR_FAMILLE_MAX;
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
    const sait = (s: Savoir): boolean =>
      perception.moi.savoirs.has(s) || perception.coutumes.has(s as Lecon);
    const corps = perception.moi.corps;

    // Le corps d'abord : se soigner, se reposer, dormir quand on n'en peut plus.
    if (corps.soinNecessaire !== null) {
      if (perception.moi.possede(corps.soinNecessaire)) {
        candidats.push({
          intention: { type: "soigner", cible: perception.moi.id },
          score: 1.2 + (corps.saigne ? 1 : 0) + (corps.fievre ? 0.5 : 0),
        });
      } else if (adulte) {
        candidats.push({
          intention: { type: "fabriquer", recette: corps.soinNecessaire },
          score: 0.9 + (corps.saigne ? 1 : 0) + (corps.fievre ? 0.4 : 0),
        });
      }
    }
    // Le repos ne passe pas avant la faim ni la soif.
    if (
      (corps.blesse || corps.fievre || corps.malade || corps.fatigue > 80) &&
      perception.abriDisponible &&
      besoins.faim >= 35 &&
      besoins.soif >= 35
    ) {
      candidats.push({
        intention: { type: "se_reposer" },
        score:
          0.35 +
          0.15 * corps.graviteMax +
          (corps.fievre ? 0.5 : 0) +
          (corps.fatigue > 80 ? (corps.fatigue - 80) / 40 : 0) +
          (nuit ? 0.2 : 0),
      });
    }
    if (corps.epuise && (nuit || corps.fatigue >= 95))
      candidats.push({ intention: { type: "dormir" }, score: 1.6 });
    // Soigner quelqu'un qu'on voit souffrir, si l'on a de quoi.
    const blesse = perception.personnesVisibles.find(
      (v) => v.soinNecessaire !== null && perception.moi.possede(v.soinNecessaire),
    );
    if (adulte && blesse !== undefined && blesse.soinNecessaire !== null) {
      candidats.push({
        intention: { type: "soigner", cible: blesse.id },
        score:
          0.9 +
          (blesse.saigne ? 0.6 : 0) +
          (blesse.famille ? 0.4 : 0) +
          blesse.affinite / 200 +
          personnalite.agreabilite * 0.3 +
          (sait("soigner_les_blesses") ? 0.5 : 0),
      });
    }
    // Fabriquer ce qui manque à un blessé visible, ou garder un bandage d'avance.
    const aSoigner = perception.personnesVisibles.find((v) => v.soinNecessaire !== null);
    if (
      adulte &&
      aSoigner?.soinNecessaire != null &&
      !perception.moi.possede(aSoigner.soinNecessaire)
    ) {
      candidats.push({
        intention: { type: "fabriquer", recette: aSoigner.soinNecessaire },
        score: 0.6 + (aSoigner.saigne ? 0.5 : 0) + (aSoigner.famille ? 0.3 : 0),
      });
    } else if (
      adulte &&
      sait("soigner_les_blesses") &&
      !perception.moi.possede("bandage") &&
      placeLibre > 0
    ) {
      candidats.push({
        intention: { type: "fabriquer", recette: "bandage" },
        score: 0.35 + personnalite.conscience * 0.2,
      });
    }

    // Se réchauffer au feu ou à l'abri quand on a froid (plus tôt si l'on a retenu la
    // leçon, et toujours s'il reste juste de quoi faire le trajet — M43).
    if (
      besoins.chaleur <
        Math.max(sait("rentrer_quand_on_gele") ? 75 : 60, seuilRentrer(perception)) &&
      (Number.isFinite(perception.distanceChaleur) || perception.boisEnPoche >= 5)
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
    // Le garde-manger : quand la réserve de la famille descend sous quelques jours
    // de nourriture par bouche, on part en chercher, quelle que soit la saison.
    if (
      adulte &&
      nourriture !== null &&
      perception.stockAccessible &&
      placeLibre > 3 &&
      perception.reserveJours < RESERVE_VISEE &&
      // Qui part fonder un autre village ne remplit plus le garde-manger de l'ancien.
      perception.moi.destination === null
    ) {
      candidats.push({
        intention: { type: "recolter", ressource: nourriture },
        score:
          0.45 +
          personnalite.conscience * 0.4 +
          (RESERVE_VISEE - perception.reserveJours) * 0.12 +
          Math.min(3, perception.moi.enfantsACharge) * 0.1,
      });
    }
    // Un grand enfant cueille des baies : pour lui, et pour le garde-manger quand il se vide.
    if (!adulte && perception.moi.grandEnfant && connait("baies") && placeLibre > 1) {
      candidats.push({
        intention: { type: "recolter", ressource: "baies" },
        score:
          0.25 +
          personnalite.conscience * 0.3 +
          urgence(besoins.faim) * 0.4 +
          (perception.stockAccessible && perception.reserveJours < RESERVE_VISEE ? 0.35 : 0),
      });
    }
    if (
      (adulte || perception.moi.grandEnfant) &&
      perception.stockAccessible &&
      perception.nourritureEnPocheQuantite >= 6
    ) {
      candidats.push({
        intention: { type: "stocker" },
        score: 0.5 + personnalite.conscience * 0.3,
      });
    }

    // Un outil ébréché se répare, tant qu'il le peut encore.
    if (adulte && perception.moi.outilAReparer !== null) {
      candidats.push({
        intention: { type: "reparer", objet: perception.moi.outilAReparer },
        score: 0.45 + personnalite.conscience * 0.3,
      });
    }

    // Une lance ouvre l'accès au gibier, quand on en a vu.
    if (adulte && connaitGibier && !armeDeChasse && placeLibre > 0) {
      candidats.push({
        intention: { type: "fabriquer", recette: "lance" },
        score:
          0.3 +
          personnalite.conscience * 0.2 +
          urgence(besoins.faim) * 0.4 +
          (sait("vetements_chauds") && perception.moi.cuir < 3 ? 0.3 : 0) +
          (perception.troupeauxVisibles.some((t) => !t.predateur) ? 0.2 : 0),
      });
    }

    // Une canne à pêche ouvre l'accès au poisson.
    if (adulte && perception.connaitPoisson && !perception.possedeCanne && placeLibre > 0) {
      candidats.push({
        intention: { type: "fabriquer", recette: "canne_a_peche" },
        score:
          0.5 +
          personnalite.conscience * 0.3 +
          urgence(besoins.faim) * 0.5 +
          (saisonFroide ? 0.3 : 0) +
          (perception.stockAccessible && perception.reserveJours < RESERVE_VISEE ? 0.3 : 0),
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
          v.distance * 0.02 -
          (v.malade ? 0.6 : 0);
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
        const scoreIdee = 0.55 + personnalite.ouverture * 0.3 + personnalite.conscience * 0.2;
        // La fonte demande d'abord une pioche (le minerai est dans la roche), puis un four.
        if (idee === "fonte") {
          const pioche =
            perception.moi.possede("pioche") || perception.moi.possede("pioche_cuivre");
          if (!pioche) {
            candidats.push({
              intention: { type: "fabriquer", recette: "pioche" },
              score: scoreIdee,
            });
            continue;
          }
          if (!perception.fourConnu) continue;
        }
        candidats.push({
          intention: { type: "fabriquer", recette: INVENTIONS[idee].recette },
          score: scoreIdee,
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
            connaitGibier && !perception.moi.possede("piege") && !perception.moi.possede("lance"),
        },
        {
          invention: "pirogue",
          utile: personnalite.ouverture > 0.5 && !perception.moi.possede("pirogue"),
        },
        { invention: "osselets", utile: besoins.moral < 60 && !perception.moi.possede("osselets") },
        {
          invention: "arc",
          utile: connaitGibier && !perception.moi.possede("arc"),
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
        {
          invention: "outils_de_cuivre",
          utile: perception.cuivreAccessible >= 1 && !perception.moi.possede("hache_cuivre"),
        },
      ];
      // Une trouvaille (M38) : ce qu'on a imaginé soi-même, ou qu'on nous a appris.
      // On fait la meilleure d'abord ; le premier exemplaire rate souvent.
      // Ce qu'on peut faire sur-le-champ, avec ce qu'on a en poche.
      const aFaire = perception.moi.trouvaillesAFaire[0];
      if (aFaire !== undefined) {
        candidats.push({
          intention: { type: "fabriquer", recette: aFaire },
          score: 0.42 + personnalite.ouverture * 0.25 + personnalite.conscience * 0.15,
        });
      }
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
      if (
        (besoins.chaleur < Math.max(70, seuilRentrer(perception)) || nuit) &&
        Number.isFinite(perception.distanceChaleur)
      ) {
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
    // Une construction qui vient d'échouer à se planifier (rien à livrer, site introuvable)
    // attend six heures avant d'être retentée : on ne tourne pas en rond.
    const constructionEnPanne =
      perception.moi.dernierEchec !== null &&
      (perception.moi.dernierEchec.action.startsWith("construire") ||
        perception.moi.dernierEchec.action.startsWith("fonder")) &&
      perception.moment.tick - perception.moi.dernierEchec.tick < 36;
    if (
      adulte &&
      !constructionEnPanne &&
      (projet !== null || perception.besoinConstruction !== null || perception.reparationNecessaire)
    ) {
      const type = projet?.type ?? perception.besoinConstruction;
      const besoinAbri = (type === "abri" || type === "maison") && !perception.abriDisponible;
      // Un feu éteint presse ; un feu qui manque de bûches attend que quelqu'un ait le temps.
      const feuEteint =
        type === "feu_de_camp" && (!perception.feuConnu || perception.feuFamilialEteint);
      const feuABois = type === "feu_de_camp" && !feuEteint && perception.feuFamilialAAlimenter;
      candidats.push({
        intention: { type: "construire" },
        score:
          0.3 +
          personnalite.conscience * 0.4 +
          (projet !== null ? 0.15 : 0) +
          // Le bâtiment qu'un conseil nous a fait vouloir passe devant.
          (perception.moi.ambitionBatiment === type ? 0.35 : 0) +
          (perception.reparationNecessaire && projet === null ? 0.5 : 0) +
          (besoinAbri ? 0.5 + urgence(besoins.securite) + froid : 0) +
          (perception.moi.chercheAbri && (type === "abri" || type === "maison") ? 0.4 : 0) +
          (feuEteint ? 0.4 + froid : 0) +
          (feuABois ? 0.1 + (saisonFroide ? 0.1 : 0) : 0) -
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

    // Apprivoiser : une corde en poche, pour ramener vivante une bête docile qu'on voit.
    const troupeauDocile = perception.troupeauxVisibles.find((t) => t.docile);
    if (
      adulte &&
      placeALEnclos &&
      !perception.moi.possedeCorde &&
      troupeauDocile !== undefined &&
      connait("fibres") &&
      placeLibre > 2
    ) {
      candidats.push({
        intention: { type: "fabriquer", recette: "corde" },
        score: 0.45 + personnalite.ouverture * 0.2 + (perception.moi.betesFamille === 0 ? 0.2 : 0),
      });
    }

    // L'âge du cuivre : une pioche pour le minerai, du minerai pour le four, un lingot pour l'outil.
    const fonte = sait("fonte") || perception.moi.ideesEnCours.includes("fonte");
    if (adulte && fonte && perception.connaitMinerai && placeLibre > 0) {
      const pioche = perception.moi.possede("pioche") || perception.moi.possede("pioche_cuivre");
      if (!pioche) {
        candidats.push({
          intention: { type: "fabriquer", recette: "pioche" },
          score: 0.4 + personnalite.conscience * 0.2,
        });
      } else if (
        perception.moi.minerai < 3 &&
        perception.mineraiAccessible < 6 &&
        perception.cuivreAccessible < 2 &&
        placeLibre > 3
      ) {
        candidats.push({
          intention: { type: "recolter", ressource: "minerai" },
          score: 0.4 + personnalite.ouverture * 0.2 + personnalite.conscience * 0.2,
        });
      }
      if (
        perception.fourConnu &&
        (perception.moi.minerai >= 3 || (perception.mineraiAccessible >= 3 && placeLibre >= 3))
      ) {
        candidats.push({
          intention: { type: "fabriquer", recette: "cuivre" },
          score: 0.55 + personnalite.conscience * 0.2,
        });
      }
    }
    if (
      adulte &&
      sait("outils_de_cuivre") &&
      perception.cuivreAccessible >= 1 &&
      placeLibre > 0 &&
      !perception.moi.possede("pioche_cuivre") &&
      perception.connaitMinerai &&
      perception.moi.possede("hache_cuivre")
    ) {
      candidats.push({
        intention: { type: "fabriquer", recette: "pioche_cuivre" },
        score: 0.45 + personnalite.conscience * 0.2,
      });
    }

    // Fumer le poisson quand on a un fumoir et de quoi le remplir.
    if (
      adulte &&
      sait("fumoir") &&
      perception.fumoirConnu &&
      (perception.moi.poissonCru >= 3 || (perception.stockAccessible && placeLibre >= 3)) &&
      placeLibre > 0
    ) {
      candidats.push({
        intention: { type: "fabriquer", recette: "poisson_fume" },
        score: 0.55 + personnalite.conscience * 0.3 + (saisonFroide ? 0.4 : 0),
      });
    }

    // Veiller la nuit au feu, quand on a retenu la leçon et que personne ne veille.
    if (
      adulte &&
      nuit &&
      sait("veilleur_de_nuit") &&
      armeDeChasse &&
      besoins.sommeil > 35 &&
      perception.feuConnu &&
      !perception.personnesVisibles.some((v) => v.veille)
    ) {
      candidats.push({
        intention: { type: "veiller" },
        score: 0.7 + personnalite.conscience * 0.3 - urgence(besoins.sommeil) * 0.5,
      });
    }

    // Prier : qui croit au ciel s'adresse à lui quand ça va mal (un besoin bas maintenant, ou
    // des jours de faim, de froid ou de moral bas), une fois par jour, jamais à la place d'une
    // urgence : c'est un moment pris entre deux tâches.
    if (
      adulte &&
      perception.moi.foi >= 3 &&
      perception.moi.peutPrier &&
      !nuit &&
      (besoins.faim < 40 ||
        besoins.chaleur < 40 ||
        besoins.securite < 40 ||
        besoins.moral < 40 ||
        perception.moi.joursDeGene > 0 ||
        corps.blesse ||
        corps.malade)
    ) {
      candidats.push({
        intention: { type: "prier" },
        score:
          0.55 +
          perception.moi.foi * 0.04 +
          (perception.autelConnu ? 0.15 : 0) +
          (sait("le_ciel_ecoute") || sait("le_ciel_frappe") ? 0.2 : 0) -
          (sait("ne_pas_attendre_le_ciel") ? 0.3 : 0),
      });
    }

    // Le schisme : on marche vers le site du nouveau village, de jour, tant qu'on n'y est pas.
    const destination = perception.moi.destination;
    if (destination !== null && !nuit) {
      candidats.push({
        intention: { type: "migrer", cible: destination },
        score: 1.1 + (besoins.faim < 50 ? -0.4 : 0),
      });
    }

    // Se recueillir : la tombe d'où vient une leçon se visite une fois par saison, de jour.
    if (adulte && !nuit && perception.tombeARecueillir !== null) {
      candidats.push({
        intention: { type: "se_recueillir", cible: perception.tombeARecueillir },
        score: 0.45 + personnalite.conscience * 0.2 + (besoins.moral < 50 ? 0.15 : 0),
      });
    }

    // Du gibier en vue : on chasse, d'autant plus qu'on a faim et que d'autres rabattent déjà.
    const gibierEnVue = perception.troupeauxVisibles.find((t) => !t.predateur);
    if (adulte && gibierEnVue !== undefined && armeDeChasse && placeLibre > 1) {
      const battue = perception.personnesVisibles.some((v) => v.chasse);
      candidats.push({
        intention: { type: "recolter", ressource: "gibier" },
        score:
          0.55 +
          urgence(besoins.faim) * 1.0 +
          (battue ? 0.35 : 0) +
          (saisonFroide ? 0.2 : 0) +
          (sait("vetements_chauds") && perception.moi.cuir < 3 ? 0.3 : 0) +
          (gibierEnVue.taille >= 4 ? 0.1 : 0) +
          personnalite.ouverture * 0.2 -
          gibierEnVue.distance / 30 -
          gibierEnVue.mefiance * 0.4 +
          // Une corde en poche et une bête docile : on ramène un jeune vivant.
          (gibierEnVue.docile && perception.moi.possedeCorde && placeALEnclos ? 0.4 : 0),
      });
    }

    // Abattre une bête de la famille quand la faim presse et qu'on ne connaît rien d'autre à manger.
    if (
      adulte &&
      perception.moi.betail !== null &&
      besoins.faim < 35 &&
      !nourritureEnPoche &&
      !connaitNourriture &&
      !perception.stockAccessible &&
      (perception.moi.possede("lance") || perception.moi.possede("hache_pierre"))
    ) {
      candidats.push({
        intention: { type: "abattre", bete: perception.moi.betail.premiere },
        score: 0.3 + urgence(besoins.faim) * 1.5,
      });
    }

    // Chasser pour le cuir quand on sait ce qu'il vaut. **[DÉCISION]** On a essayé
    // de déclencher cette chasse sur la seule saison froide (M43), puisque sur
    // vingt-sept morts de froid vingt-six n'avaient pas de vêtement et que la leçon
    // `vetements_chauds` ne s'apprend qu'en enterrant l'un d'eux. Mesuré : 145
    // survivants au lieu de 169, et *plus* de morts de froid (12 contre 7) et de
    // carence (16 contre 8) — courir le gibier en novembre coûte les vivres et la
    // chaleur qu'on allait chercher. On garde donc la leçon comme déclencheur.
    if (
      adulte &&
      sait("vetements_chauds") &&
      !perception.moi.possede("vetement_cuir") &&
      perception.moi.cuir < 3 &&
      connaitGibier &&
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
    // Une priorité choisie sur les conseils de Claude pèse sur les candidats concernés.
    const priorite = perception.moi.priorite;
    if (priorite === null) return candidats;
    return candidats.map((c) => ({
      intention: c.intention,
      score: c.score + bonusPriorite(priorite, c.intention),
    }));
  }
}
