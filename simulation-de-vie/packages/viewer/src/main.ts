/** Point d'entrée du viewer : liaison (serveur ou locale), rendu, interactions souris et tactiles. */
import "./style.css";
import type {
  Commande,
  Domaine,
  Loi,
  MessageServeur,
  Pinceau,
  Pouvoir,
  Scenario,
} from "@sdv/protocole";
import {
  COUT_CREATURE,
  COUT_PEUPLE,
  FICHES_DOMAINE,
  FICHES_LOI,
  RANG_CREATURE,
  LOIS,
  FICHES_PINCEAU,
  FICHES_POUVOIR,
  NOMS_CULTE,
  PINCEAUX,
  POUVOIRS,
  POUVOIRS_EXAUCANT,
  RAYON_PINCEAU_MAX,
  SCENARIOS,
  TAILLES_PEUPLE,
  VITESSES,
} from "@sdv/protocole";
import type { Calque, Outil } from "./etat.js";
import { CALQUES, LIBELLES_CALQUE } from "./etat.js";
import { LIBELLES_SUJET, libelleReputation } from "./format.js";
import type { Camera } from "./camera.js";
import { cadrer, centrerSur, deplacer, versMonde, zoomer } from "./camera.js";
import { Magasin } from "./etat.js";
import { LiaisonLocale, estSimulee } from "./local.js";
import { LiaisonTravailleur } from "./travailleur-liaison.js";
import { ConseilLocal } from "./conseilLocal.js";
import { Panneaux } from "./panneaux.js";
import { Rendu } from "./rendu.js";
import { retenirLeTirer } from "./gestes.js";
import {
  NOM_AUTO,
  copierSauvegarde,
  decrireSauvegarde,
  ecrireSauvegarde,
  lireSauvegarde,
  listerSauvegardes,
  preparerStockage,
  supprimerSauvegarde,
} from "./sauvegarde.js";
import type { EntreeSauvegarde } from "./sauvegarde.js";
import { ecrireDistante, lireDistante, listerDistantes, supprimerDistante } from "./distant.js";
import { compresserParMorceaux, compressionDisponible } from "./compression.js";
import type { Liaison } from "./reseau.js";
import { Reseau, urlWebSocket } from "./reseau.js";

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`élément #${id} introuvable`);
  return el;
}
const canvas = element("carte", HTMLCanvasElement);
const zone = element("zone-carte", HTMLDivElement);
const survolEl = element("survol", HTMLDivElement);
const formulaireLocal = element("local", HTMLFormElement);
const graineEntree = element("graine-entree", HTMLInputElement);
const populationEntree = element("population-entree", HTMLSelectElement);
const peuplesEntree = element("peuples-entree", HTMLSelectElement);
const domaineEntree = element("domaine-entree", HTMLSelectElement);
const scenarioEntree = element("scenario-entree", HTMLSelectElement);
/** Le scénario choisi au formulaire (ou dans l'adresse, `?scenario=`), ou null : partie libre. */
function scenarioChoisi(): Scenario | null {
  const v = scenarioEntree.value;
  return (SCENARIOS as readonly string[]).includes(v) ? (v as Scenario) : null;
}
/** Le domaine du ciel choisi au formulaire (ou dans l'URL, `?domaine=`), ou null. */
function domaineChoisi(): Domaine | null {
  const v = domaineEntree.value;
  return v === "moisson" || v === "orage" || v === "feu" || v === "songes" ? v : null;
}
const viergeEntree = element("vierge-entree", HTMLInputElement);
const magasin = new Magasin();
const rendu = new Rendu(canvas, magasin);
let cam: Camera = { echelle: 8, dx: 0, dy: 0 };
let camAjustee = false;
let survol: string | null = null;
let survolBatiment: string | null = null;

// Application installable (M26) : le service worker garde la page hors ligne quand elle est
// servie par http(s) hors de claude.ai (dans l'artefact, la page est déjà un seul fichier).
if (
  "serviceWorker" in navigator &&
  (window.location.protocol === "https:" || window.location.hostname === "localhost") &&
  !window.location.hostname.endsWith("claude.ai") &&
  window.claude === undefined
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((erreur: unknown) => {
      console.warn("service worker :", erreur);
    });
  });
}

// Mode local : la simulation tourne dans la page (page publiée, mobile, ?local dans l'URL).
const parametres = new URLSearchParams(window.location.search);
const modeLocal = import.meta.env.VITE_MODE_LOCAL === "1" || parametres.has("local");
const graineInitiale = parametres.get("seed") ?? "42";
// Quelques jours d'avance seulement : on assiste ainsi à l'exploration du monde.
const joursAvance = Number.parseInt(parametres.get("jours") ?? "5", 10);
/** Habitants au départ (`?population=`, ou le choix du formulaire) : 12 par défaut, 3 familles. */
const POPULATIONS = [12, 24, 36, 48, 64];
const populationInitiale = Number.parseInt(parametres.get("population") ?? "12", 10);
/** Le peuple choisi au formulaire, avant de savoir si le monde naît vierge. */
function peupleChoisi(): number {
  const n = Number.parseInt(populationEntree.value, 10);
  return POPULATIONS.includes(n) ? n : 12;
}
function population(): { initiale: number; familles: number; peuples: number } {
  // Un monde vierge : personne au départ, le ciel posera son peuple où il veut.
  const initiale = viergeEntree.checked ? 0 : peupleChoisi();
  const peuples = viergeEntree.checked
    ? 1
    : Math.max(1, Math.min(4, Number.parseInt(peuplesEntree.value, 10) || 1));
  return { initiale, familles: Math.max(3, Math.round(peupleChoisi() / 4)), peuples };
}
if (POPULATIONS.includes(populationInitiale)) populationEntree.value = String(populationInitiale);
const peuplesInitiaux = Number.parseInt(parametres.get("peuples") ?? "1", 10);
if (peuplesInitiaux >= 1 && peuplesInitiaux <= 4) peuplesEntree.value = String(peuplesInitiaux);
if (parametres.has("vierge")) viergeEntree.checked = true;
if (parametres.has("domaine")) domaineEntree.value = parametres.get("domaine") ?? "";
if (parametres.has("scenario")) scenarioEntree.value = parametres.get("scenario") ?? "";

let derniereDemandeFiche = 0;
const recevoir = (m: MessageServeur): void => {
  const maintenant = performance.now();
  magasin.recevoir(m, maintenant);
  if (m.type === "init") camAjustee = false;
  if (
    m.type === "etat" &&
    magasin.selection !== null &&
    magasin.fiche === null &&
    maintenant - derniereDemandeFiche > 1000
  ) {
    derniereDemandeFiche = maintenant;
    liaison.envoyer({ type: "inspecter", id: magasin.selection });
  }
};
const connexion = (connecte: boolean): void => {
  magasin.connecte = connecte;
  if (connecte && magasin.selection !== null)
    liaison.envoyer({ type: "inspecter", id: magasin.selection });
};
const progression = (jour: number, total: number): void => {
  const el = document.getElementById("connexion");
  if (el)
    el.textContent = jour < total ? `préparation du monde : jour ${jour}/${total}` : "en direct";
};

function creerLiaison(graine: string, sauvegarde?: unknown): Liaison {
  if (!modeLocal) return new Reseau(urlWebSocket(window.location), recevoir, connexion);
  const seed = /^-?\d+$/.test(graine) ? Number.parseInt(graine, 10) : graine;
  // Dans un travailleur quand le navigateur le permet : la page n'attend plus la simulation.
  const Liaison =
    LiaisonTravailleur.disponible() && !parametres.has("sansworker")
      ? LiaisonTravailleur
      : LiaisonLocale;
  return new Liaison(
    {
      seed,
      joursAvance:
        population().initiale === 0 ? 0 : Number.isFinite(joursAvance) ? joursAvance : 20,
      ticksParSeconde: 4,
      config: {
        population: population(),
        dieu: { domaine: domaineChoisi() },
        jeu: { scenario: scenarioChoisi() },
      },
      ...(sauvegarde !== undefined ? { sauvegarde } : {}),
    },
    recevoir,
    connexion,
    progression,
  );
}
let liaison: Liaison = creerLiaison(graineInitiale);

const envoyer = (c: Commande): void => {
  liaison.envoyer(c);
};
const selectionner = (id: string | null): void => {
  magasin.selectionner(id);
  if (id === null) envoyer({ type: "fermer_fiche" });
  else envoyer({ type: "inspecter", id });
  panneaux.afficherOnglet("inspecteur");
};
const selectionnerBatiment = (id: string): void => {
  magasin.selectionner(null);
  envoyer({ type: "fermer_fiche" });
  magasin.selectionBatiment = id;
  panneaux.afficherOnglet("inspecteur");
};
const basculerSuivi = (): void => {
  if (magasin.selection === null) return;
  magasin.suivre = !magasin.suivre;
};
/** « Aller voir » : la caméra file sur la position, un repère y pulse quelques secondes. */
const allerVoir = (x: number, y: number): void => {
  magasin.suivre = false;
  cam = centrerSur(
    { ...cam, echelle: Math.max(cam.echelle, 10) },
    x,
    y,
    canvas.width,
    canvas.height,
  );
  magasin.repere = { x, y, fin: performance.now() + 3000 };
};
// La chronique de fin d'année (M25) : un dialogue, lu à voix haute si le navigateur sait.
const dlgChronique = element("dlg-chronique", HTMLDialogElement);
const chroniqueTitre = element("chronique-titre", HTMLHeadingElement);
const chroniqueTexte = element("chronique-texte", HTMLParagraphElement);
const btnLireChronique = element("btn-lire-chronique", HTMLButtonElement);
let derniereChroniqueVue = 0;
function ouvrirChronique(annee: number): void {
  const ch = magasin.etat?.conteur.chroniques.find((c) => c.annee === annee);
  if (ch === undefined) return;
  chroniqueTitre.textContent = `An ${String(ch.annee)} — ${ch.titre}`;
  chroniqueTexte.textContent = ch.texte;
  btnLireChronique.hidden = !("speechSynthesis" in window);
  if (!dlgChronique.open) dlgChronique.showModal();
}
function lireChronique(): void {
  if (!("speechSynthesis" in window)) return;
  const texte = `${chroniqueTitre.textContent}. ${chroniqueTexte.textContent}`;
  window.speechSynthesis.cancel();
  const parole = new SpeechSynthesisUtterance(texte);
  parole.lang = "fr-FR";
  parole.rate = 0.95;
  window.speechSynthesis.speak(parole);
}
btnLireChronique.addEventListener("click", lireChronique);
element("btn-fermer-chronique", HTMLButtonElement).addEventListener("click", () => {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  dlgChronique.close();
});
element("conteur", HTMLButtonElement).addEventListener("click", () => {
  const ch = magasin.etat?.conteur.chroniques[0];
  if (ch !== undefined) ouvrirChronique(ch.annee);
  else panneaux.afficherOnglet("stats");
});
/** Une chronique toute fraîche (écrite dans la journée) s'ouvre d'elle-même, une fois. */
function surveillerChronique(): void {
  const etat = magasin.etat;
  const init = magasin.init;
  if (etat === null || init === null) return;
  const ch = etat.conteur.chroniques[0];
  if (ch === undefined || ch.annee <= derniereChroniqueVue) return;
  derniereChroniqueVue = ch.annee;
  if (etat.tick - ch.tick <= init.ticksParJour) ouvrirChronique(ch.annee);
}
const panneaux = new Panneaux(magasin, {
  envoyer,
  selectionner,
  basculerSuivi,
  allerVoir,
  ouvrirChronique,
});

// Les lois du monde (M25) : un panneau de cases à cocher, l'état vient du monde.
const btnLois = element("btn-lois", HTMLButtonElement);
const panneauLois = element("lois", HTMLDivElement);
const listeLois = element("liste-lois", HTMLDivElement);
const casesLoi = new Map<Loi, HTMLInputElement>();
for (const loi of LOIS) {
  const fiche = FICHES_LOI[loi];
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = `loi-${loi}`;
  input.checked = true;
  input.addEventListener("change", () => {
    envoyer({ type: "loi", loi, actif: input.checked });
  });
  const texte = document.createElement("span");
  texte.innerHTML = `${fiche.emoji} ${fiche.nom}<span class="discret">${fiche.description}</span>`;
  label.append(input, texte);
  listeLois.append(label);
  casesLoi.set(loi, input);
}
function basculerLois(valeur = panneauLois.hidden): void {
  panneauLois.hidden = !valeur;
  btnLois.classList.toggle("actif", valeur);
}
btnLois.addEventListener("click", () => {
  basculerLois();
});
/** Reflète les lois du monde dans le panneau et le bouton (une loi suspendue le colore). */
function rafraichirLois(): void {
  const lois = magasin.etat?.lois;
  if (lois === undefined) return;
  let suspendues = 0;
  for (const [loi, input] of casesLoi) {
    const actif = lois[loi];
    if (input.checked !== actif) input.checked = actif;
    input.parentElement?.classList.toggle("suspendue", !actif);
    if (!actif) suspendues += 1;
  }
  const texte = suspendues > 0 ? `⚖️ Lois · ${String(suspendues)}` : "⚖️ Lois";
  if (btnLois.textContent !== texte) btnLois.textContent = texte;
  btnLois.classList.toggle("suspendue", suspendues > 0);
}

// Calques de lecture (M25) : villages, familles, foi, vivres.
const calquesEl = element("calques", HTMLDivElement);
const boutonsCalque = new Map<Calque, HTMLButtonElement>();
for (const calque of CALQUES) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = LIBELLES_CALQUE[calque];
  b.setAttribute("aria-pressed", calque === magasin.calque ? "true" : "false");
  b.addEventListener("click", () => {
    choisirCalque(calque);
  });
  calquesEl.append(b);
  boutonsCalque.set(calque, b);
}
function choisirCalque(calque: Calque): void {
  magasin.calque = calque;
  for (const [c, b] of boutonsCalque)
    b.setAttribute("aria-pressed", c === calque ? "true" : "false");
}

/** Remplace le monde courant par un nouveau (graine) ou par une sauvegarde. */
function relancer(graine: string, sauvegarde?: unknown): void {
  liaison.fermer();
  magasin.reinitialiser();
  derniereChroniqueVue = 0;
  liaison = creerLiaison(graine, sauvegarde);
  liaison.connecter();
  panneaux.afficherOnglet("inspecteur");
}

// Sauvegardes (mode local) : boîte de dialogue, sauvegarde automatique, reprise au chargement.
const dlgSauvegardes = element("dlg-sauvegardes", HTMLDialogElement);
const listeSauvegardes = element("liste-sauvegardes", HTMLOListElement);
const statutSauvegardes = element("statut-sauvegardes", HTMLDivElement);
const nomSauvegarde = element("nom-sauvegarde", HTMLInputElement);
const btnReprendre = element("btn-reprendre", HTMLButtonElement);
const statutSauvegarde = (texte: string): void => {
  statutSauvegardes.textContent = texte;
  const el = document.getElementById("connexion");
  if (el && !dlgSauvegardes.open) el.textContent = texte;
};
/** Où vit une sauvegarde : dans ce navigateur, ou dans la base de l'artefact (serveur). */
type Source = "local" | "distant";
const SOURCE_TEXTE: Readonly<Record<Source, string>> = { local: "📱", distant: "☁" };
let derniereDistanteA = 0;
/** Cadence de la sauvegarde distante (une écriture réseau, par morceaux). */
const INTERVALLE_DISTANT_MS = 60_000;

/**
 * Sauvegarde le monde courant sous ce nom ; vrai si c'est fait quelque part.
 * `immediate` : sans compression et sans attendre, pour une page qui se cache
 * ou se ferme. `distant` : aussi dans la base de l'artefact, qui survit au
 * navigateur (toujours pour une sauvegarde nommée ; à sa propre cadence pour
 * l'automatique).
 */
async function sauvegarderSous(nom: string, immediate = false, distant = true): Promise<boolean> {
  if (!estSimulee(liaison)) return false;
  // Une sortie de page n'attend pas ; le reste du temps, la page ne gèle pas.
  const s = immediate ? liaison.sauvegarder() : await liaison.sauvegarderSansBloquer();
  if (s === null) return false;
  // Une seule compression, en flux, pour les deux destinations.
  const octets = distant && !immediate && compressionDisponible() ? compresserParMorceaux(s) : null;
  const locale = ecrireSauvegarde(nom, s, immediate, octets).then(
    () => true,
    (erreur: unknown) => {
      statutSauvegarde(
        `Sauvegarde impossible ici : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
      );
      return false;
    },
  );
  const distante = distant
    ? ecrireDistante(nom, s, octets).then(
        (fait) => {
          if (fait) derniereDistanteA = performance.now();
          return fait;
        },
        (erreur: unknown) => {
          statutSauvegarde(
            `Sauvegarde serveur impossible : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
          );
          return false;
        },
      )
    : Promise.resolve(false);
  const [l, d] = await Promise.all([locale, distante]);
  return l || d;
}
/** Toutes les sauvegardes, d'ici et du serveur, les plus récentes d'abord. */
async function toutesLesSauvegardes(): Promise<(EntreeSauvegarde & { source: Source })[]> {
  const [locales, distantes] = await Promise.all([
    listerSauvegardes().catch((erreur: unknown) => {
      statutSauvegarde(
        `Stockage indisponible ici : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
      );
      return [] as EntreeSauvegarde[];
    }),
    listerDistantes().catch(() => [] as EntreeSauvegarde[]),
  ]);
  return [
    ...locales.map((e) => ({ ...e, source: "local" as const })),
    ...distantes.map((e) => ({ ...e, source: "distant" as const })),
  ].sort((a, b) => b.date - a.date);
}
async function rafraichirListeSauvegardes(): Promise<void> {
  const entrees = await toutesLesSauvegardes();
  listeSauvegardes.replaceChildren(
    ...entrees.map((e) => {
      const li = document.createElement("li");
      const texte = document.createElement("span");
      texte.textContent = `${SOURCE_TEXTE[e.source]} ${decrireSauvegarde(e)}`;
      texte.title = e.source === "distant" ? "sur le serveur" : "dans ce navigateur";
      const charger = document.createElement("button");
      charger.type = "button";
      charger.textContent = "📂 Reprendre";
      charger.addEventListener("click", () => {
        void chargerSauvegarde(e.nom, e.source);
      });
      const supprimer = document.createElement("button");
      supprimer.type = "button";
      supprimer.textContent = "🗑";
      supprimer.title = "Supprimer cette sauvegarde";
      supprimer.addEventListener("click", () => {
        void (e.source === "distant" ? supprimerDistante(e.nom) : supprimerSauvegarde(e.nom)).then(
          rafraichirListeSauvegardes,
        );
      });
      li.append(texte, charger, supprimer);
      return li;
    }),
  );
  if (entrees.length === 0) {
    const li = document.createElement("li");
    li.className = "discret";
    li.textContent = "aucune sauvegarde pour l'instant";
    listeSauvegardes.append(li);
  }
}
async function chargerSauvegarde(nom: string, source: Source = "local"): Promise<void> {
  try {
    const s = source === "distant" ? await lireDistante(nom) : await lireSauvegarde(nom);
    if (s === null) {
      statutSauvegarde("Cette sauvegarde n'existe plus.");
      return;
    }
    dlgSauvegardes.close();
    btnReprendre.hidden = true;
    relancer(s.seed, s);
    graineEntree.value = s.seed;
    statutSauvegarde(`Partie reprise au jour ${String(s.jour)}.`);
  } catch (erreur: unknown) {
    statutSauvegarde(
      `Reprise impossible : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    );
  }
}
let derniereSauvegardeAutoA = 0;
let dernierTickSauve = -1;
let dernierJourSauve = -1;
let pauseVue = false;
/** Cadence de base de la sauvegarde automatique ; allongée si encoder le monde coûte cher. */
const INTERVALLE_AUTO_MS = 20_000;
const INTERVALLE_AUTO_MAX_MS = 180_000;
/** À l'aube, on sauvegarde aussi si la dernière date d'au moins cinq secondes. */
const INTERVALLE_AUBE_MS = 5_000;
/** Part du temps que l'encodage d'une sauvegarde peut prendre : un centième. */
const PART_ENCODAGE = 100;
let intervalleAutoMs = INTERVALLE_AUTO_MS;
/**
 * Sauvegarde automatique, seulement si le monde a avancé : toutes les vingt
 * secondes, à chaque aube, dès qu'on met en pause, et de force quand la page
 * se cache ou se ferme.
 */
function sauvegardeAutomatique(maintenant: number, force = false): void {
  if (!modeLocal) return;
  const etat = magasin.etat;
  if (etat === null) return;
  const miseEnPause = etat.pause && !pauseVue;
  pauseVue = etat.pause;
  const tick = etat.tick;
  if (tick < 0 || tick === dernierTickSauve) return;
  const jour = etat.moment.jourAbsolu;
  const ecoule = maintenant - derniereSauvegardeAutoA;
  // À grande vitesse les aubes défilent : on ne sauvegarde pas plus souvent que la moitié de la
  // cadence adaptative (encoder un gros monde bloque la page le temps de l'encodage).
  const aube =
    jour !== dernierJourSauve && ecoule >= Math.max(INTERVALLE_AUBE_MS, intervalleAutoMs / 2);
  if (!force && !miseEnPause && !aube && ecoule < intervalleAutoMs) return;
  derniereSauvegardeAutoA = maintenant;
  dernierJourSauve = jour;
  const distant =
    force || miseEnPause || aube || maintenant - derniereDistanteA >= INTERVALLE_DISTANT_MS;
  const debut = performance.now();
  const promesse = sauvegarderSous(NOM_AUTO, force, distant);
  // De force, le monde vient d'être encodé d'un coup ; sinon par tranches, on lira son coût.
  const coutImmediat = performance.now() - debut;
  void promesse.then((fait) => {
    if (fait) dernierTickSauve = tick;
    const cout = estSimulee(liaison) && !force ? liaison.coutSauvegardeMs : coutImmediat;
    intervalleAutoMs = Math.min(
      INTERVALLE_AUTO_MAX_MS,
      Math.max(INTERVALLE_AUTO_MS, cout * PART_ENCODAGE),
    );
  });
}

const btnMenu = element("btn-menu", HTMLButtonElement);
btnMenu.addEventListener("click", () => {
  formulaireLocal.classList.toggle("ouvert");
});

// Plein écran : la carte prend tout l'écran, les commandes deviennent des menus flottants.
const app = element("app", HTMLDivElement);
const barre = element("barre", HTMLElement);
const panneauEl = element("panneau", HTMLElement);
const flottants = element("flottants", HTMLDivElement);
function basculerPleinEcran(valeur = !app.classList.contains("plein-ecran")): void {
  app.classList.toggle("plein-ecran", valeur);
  flottants.hidden = !valeur;
  barre.classList.remove("ouvert");
  panneauEl.classList.toggle("ouvert", valeur && magasin.selection !== null);
  if (valeur) {
    // Le vrai plein écran du navigateur quand il est permis ; sinon, la page seule suffit.
    if (document.fullscreenElement === null)
      document.documentElement.requestFullscreen().catch(() => undefined);
  } else if (document.fullscreenElement !== null) {
    document.exitFullscreen().catch(() => undefined);
  }
  redimensionner();
}
element("btn-plein", HTMLButtonElement).addEventListener("click", () => {
  basculerPleinEcran(true);
});
element("flot-sortir", HTMLButtonElement).addEventListener("click", () => {
  basculerPleinEcran(false);
});
element("flot-menu", HTMLButtonElement).addEventListener("click", () => {
  barre.classList.toggle("ouvert");
  panneauEl.classList.remove("ouvert");
});
element("flot-panneau", HTMLButtonElement).addEventListener("click", () => {
  panneauEl.classList.toggle("ouvert");
  barre.classList.remove("ouvert");
});
document.addEventListener("fullscreenchange", () => {
  // Échap ou geste du navigateur : on quitte aussi le mode plein écran de la page.
  if (document.fullscreenElement === null && app.classList.contains("plein-ecran"))
    basculerPleinEcran(false);
});
if (modeLocal) {
  formulaireLocal.hidden = false;
  graineEntree.value = graineInitiale;
  formulaireLocal.addEventListener("submit", (ev) => {
    ev.preventDefault();
    relancer(graineEntree.value.trim() || "42");
    // Un monde vierge s'ouvre en mode Dieu, l'outil « peupler » en main, à la taille choisie.
    if (viergeEntree.checked) {
      magasin.taillePeuple = peupleChoisi();
      basculerModeDieu(true);
      armerOutil("peupler");
    }
  });
  element("btn-sauvegardes", HTMLButtonElement).addEventListener("click", () => {
    void rafraichirListeSauvegardes();
    dlgSauvegardes.showModal();
  });
  element("form-sauver", HTMLFormElement).addEventListener("submit", (ev) => {
    ev.preventDefault();
    const nom =
      nomSauvegarde.value.trim() ||
      `Partie du jour ${String(magasin.etat?.moment.jourAbsolu ?? 0)}`;
    void sauvegarderSous(nom).then((fait) => {
      statutSauvegarde(fait ? `« ${nom} » sauvegardée.` : "Le monde n'est pas encore prêt.");
      void rafraichirListeSauvegardes();
    });
  });
  element("btn-fermer-sauvegardes", HTMLButtonElement).addEventListener("click", () => {
    dlgSauvegardes.close();
  });
  btnReprendre.addEventListener("click", () => {
    const nom = btnReprendre.dataset.nom;
    if (nom !== undefined)
      void chargerSauvegarde(nom, btnReprendre.dataset.source === "distant" ? "distant" : "local");
  });
  // Quand la page passe à l'arrière-plan ou se ferme (mobile), on sauvegarde tout de suite.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") sauvegardeAutomatique(performance.now(), true);
  });
  window.addEventListener("pagehide", () => {
    sauvegardeAutomatique(performance.now(), true);
  });
  // Un doigt qui tire en butée ne doit pas recharger la page.
  retenirLeTirer(document);
}

/** Une sauvegarde plus vieille que cela ne reprend plus toute seule : elle se propose d'un clic. */
const REPRISE_AUTO_MS = 12 * 3_600_000;
/** À partir de ce jour, une partie automatique se met à l'abri avant d'être écrasée. */
const JOUR_PARTIE_PRECIEUSE = 20;
/**
 * Au chargement : la sauvegarde la plus récente (automatique ou nommée) reprend
 * toute seule si elle est fraîche et que l'adresse n'impose pas de graine ;
 * sinon elle se propose d'un clic. Vrai si la partie a repris.
 */
async function reprendreAuChargement(): Promise<boolean> {
  statutSauvegarde("recherche d'une partie à reprendre…");
  const sauvegardes = await toutesLesSauvegardes();
  const derniere = sauvegardes[0];
  if (derniere === undefined) return false;
  btnReprendre.hidden = false;
  btnReprendre.dataset.nom = derniere.nom;
  btnReprendre.dataset.source = derniere.source;
  btnReprendre.textContent = `↩ Reprendre ${derniere.nom === NOM_AUTO ? "la partie" : `« ${derniere.nom} »`} (jour ${String(derniere.jour)}, ${String(derniere.vivants)} vivants)`;
  // Un nouveau monde va écraser la sauvegarde automatique : une partie avancée y est d'abord
  // mise à l'abri sous son propre nom (dans ce navigateur ; la copie serveur se fait à la
  // prochaine sauvegarde nommée).
  const auto = sauvegardes.find((e) => e.nom === NOM_AUTO && e.source === "local");
  const proteger = async (): Promise<void> => {
    if (auto === undefined || auto.jour < JOUR_PARTIE_PRECIEUSE) return;
    const nom = `Partie du jour ${String(auto.jour)} (graine ${auto.seed})`;
    if (sauvegardes.some((e) => e.nom === nom)) return;
    if (await copierSauvegarde(NOM_AUTO, nom)) statutSauvegarde(`« ${nom} » mise à l'abri.`);
  };
  if (parametres.has("seed") || Date.now() - derniere.date > REPRISE_AUTO_MS) {
    await proteger();
    return false;
  }
  try {
    const s =
      derniere.source === "distant"
        ? await lireDistante(derniere.nom)
        : await lireSauvegarde(derniere.nom);
    if (s === null) return false;
    btnReprendre.hidden = true;
    relancer(s.seed, s);
    graineEntree.value = s.seed;
    statutSauvegarde(`Partie reprise au jour ${String(s.jour)}.`);
    return true;
  } catch (erreur: unknown) {
    await proteger();
    statutSauvegarde(
      `Reprise impossible : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    );
    return false;
  }
}

function redimensionner(): void {
  const rect = zone.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  camAjustee = false;
}
window.addEventListener("resize", redimensionner);
// La zone de carte change de taille sans que la fenêtre bouge (panneau replié, clavier mobile).
if ("ResizeObserver" in window) new ResizeObserver(redimensionner).observe(zone);
redimensionner();

const dpr = (): number => window.devicePixelRatio || 1;
const pointCanvas = (
  clientX: number,
  clientY: number,
): { sx: number; sy: number; dedans: boolean } => {
  const rect = canvas.getBoundingClientRect();
  return {
    sx: (clientX - rect.left) * dpr(),
    sy: (clientY - rect.top) * dpr(),
    dedans:
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom,
  };
};
/** Aiguillage d'un clic (sans glissement) : un pouvoir armé s'applique, sinon on inspecte. */
function agirA(sx: number, sy: number): void {
  if (magasin.modeDieu && magasin.pouvoirArme !== null) {
    appliquerPouvoirA(sx, sy);
    return;
  }
  if (magasin.modeDieu && magasin.outilArme !== null) {
    appliquerOutilA(sx, sy);
    return;
  }
  toucherA(sx, sy);
}
/** Vrai si quelque chose (pouvoir ou outil) est armé et attend un point de la carte. */
function enMain(): boolean {
  return magasin.modeDieu && (magasin.pouvoirArme !== null || magasin.outilArme !== null);
}

/** Sélectionne ce qui se trouve sous un point écran : personnage, bâtiment, ou rien. */
function toucherA(sx: number, sy: number): void {
  const p = rendu.trouverPersonnage(cam, sx, sy, performance.now());
  if (p !== null) {
    selectionner(p.id);
    return;
  }
  const b = rendu.trouverBatiment(cam, sx, sy);
  if (b !== null) selectionnerBatiment(b.id);
  else {
    magasin.selectionBatiment = null;
    selectionner(null);
  }
}

// Souris : glisser pour déplacer, molette pour zoomer, clic pour sélectionner.
let glisse: { x: number; y: number; bouge: boolean } | null = null;
/** Peinture au pinceau : le bouton gauche enfoncé sculpte au fil du geste (pas de déplacement). */
let peinture: { x: number; y: number } | null = null;
canvas.addEventListener("mousedown", (ev) => {
  if (
    ev.button === 0 &&
    magasin.modeDieu &&
    magasin.outilArme !== null &&
    estPinceau(magasin.outilArme)
  ) {
    const { sx, sy } = pointCanvas(ev.clientX, ev.clientY);
    const m = versMonde(cam, sx, sy);
    peinture = { x: Math.floor(m.x), y: Math.floor(m.y) };
    sculpterEn(peinture.x, peinture.y);
    return;
  }
  glisse = { x: ev.clientX, y: ev.clientY, bouge: false };
  canvas.classList.add("glisse");
});
window.addEventListener("mousemove", (ev) => {
  if (peinture !== null) {
    const { sx, sy, dedans } = pointCanvas(ev.clientX, ev.clientY);
    if (dedans) {
      const m = versMonde(cam, sx, sy);
      const x = Math.floor(m.x);
      const y = Math.floor(m.y);
      magasin.reticule = { x, y };
      // Un coup par pas de rayon : un trait continu sans inonder la simulation.
      const pas = Math.max(1, magasin.rayonPinceau);
      if (Math.max(Math.abs(x - peinture.x), Math.abs(y - peinture.y)) >= pas) {
        peinture = { x, y };
        sculpterEn(x, y);
      }
    }
    return;
  }
  if (glisse) {
    const ddx = ev.clientX - glisse.x;
    const ddy = ev.clientY - glisse.y;
    if (Math.abs(ddx) + Math.abs(ddy) > 3) glisse.bouge = true;
    if (glisse.bouge) {
      cam = deplacer(cam, ddx * dpr(), ddy * dpr());
      magasin.suivre = false;
      glisse.x = ev.clientX;
      glisse.y = ev.clientY;
    }
  }
  const { sx, sy, dedans } = pointCanvas(ev.clientX, ev.clientY);
  if (!dedans) return;
  if (enMain()) {
    const m = versMonde(cam, sx, sy);
    magasin.reticule = { x: Math.floor(m.x), y: Math.floor(m.y) };
  }
  const p = rendu.trouverPersonnage(cam, sx, sy, performance.now());
  const b = p === null ? rendu.trouverBatiment(cam, sx, sy) : null;
  survol = p?.id ?? null;
  survolBatiment = b?.id ?? null;
  if (p !== null || b !== null) {
    const rect = canvas.getBoundingClientRect();
    survolEl.hidden = false;
    survolEl.style.left = `${ev.clientX - rect.left + 14}px`;
    survolEl.style.top = `${ev.clientY - rect.top + 14}px`;
    survolEl.textContent = p
      ? `${p.prenom} ${p.nomFamille} · ${p.stade}${p.endormi ? " · dort" : ""} · ${p.intention ?? "—"}`
      : b
        ? `${b.nom} des ${b.famille}${b.etat === "chantier" ? " (chantier)" : b.type === "feu_de_camp" ? (b.allume ? " · allumé" : " · éteint") : ""}`
        : "";
  } else {
    survolEl.hidden = true;
  }
});
window.addEventListener("mouseup", (ev) => {
  peinture = null;
  if (glisse && !glisse.bouge) {
    const { sx, sy } = pointCanvas(ev.clientX, ev.clientY);
    if (ev.button === 2) desarmer();
    else agirA(sx, sy);
  }
  glisse = null;
  canvas.classList.remove("glisse");
});
canvas.addEventListener("contextmenu", (ev) => {
  if (magasin.modeDieu) ev.preventDefault();
});
canvas.addEventListener(
  "wheel",
  (ev) => {
    ev.preventDefault();
    const { sx, sy } = pointCanvas(ev.clientX, ev.clientY);
    cam = zoomer(cam, ev.deltaY < 0 ? 1.15 : 1 / 1.15, sx, sy);
  },
  { passive: false },
);

// Tactile : un doigt glisse ou touche, deux doigts pincent pour zoomer ;
// en mode Dieu, un appui long applique le pouvoir armé là où l'on appuie.
let doigt: { x: number; y: number; bouge: boolean } | null = null;
let pince: { distance: number; x: number; y: number } | null = null;
let appuiLong: ReturnType<typeof setTimeout> | null = null;
const DUREE_APPUI_LONG = 450;
const annulerAppuiLong = (): void => {
  if (appuiLong !== null) clearTimeout(appuiLong);
  appuiLong = null;
};
const centreEtDistance = (t: TouchList): { x: number; y: number; distance: number } => {
  const a = t.item(0);
  const b = t.item(1);
  if (!a || !b) return { x: 0, y: 0, distance: 1 };
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
    distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
  };
};
canvas.addEventListener(
  "touchstart",
  (ev) => {
    ev.preventDefault();
    annulerAppuiLong();
    if (ev.touches.length === 1) {
      const t = ev.touches.item(0);
      if (t) {
        doigt = { x: t.clientX, y: t.clientY, bouge: false };
        if (enMain()) {
          const { sx, sy } = pointCanvas(t.clientX, t.clientY);
          appuiLong = setTimeout(() => {
            appuiLong = null;
            if (doigt && !doigt.bouge) {
              agirA(sx, sy);
              doigt = null;
            }
          }, DUREE_APPUI_LONG);
        }
      }
      pince = null;
    } else if (ev.touches.length === 2) {
      pince = centreEtDistance(ev.touches);
      doigt = null;
    }
  },
  { passive: false },
);
canvas.addEventListener(
  "touchmove",
  (ev) => {
    ev.preventDefault();
    if (ev.touches.length === 2) {
      const c = centreEtDistance(ev.touches);
      if (pince) {
        const { sx, sy } = pointCanvas(c.x, c.y);
        cam = zoomer(cam, c.distance / Math.max(1, pince.distance), sx, sy);
        cam = deplacer(cam, (c.x - pince.x) * dpr(), (c.y - pince.y) * dpr());
        magasin.suivre = false;
      }
      pince = c;
      return;
    }
    const t = ev.touches.item(0);
    if (!t || !doigt) return;
    const ddx = t.clientX - doigt.x;
    const ddy = t.clientY - doigt.y;
    if (Math.abs(ddx) + Math.abs(ddy) > 8) doigt.bouge = true;
    if (doigt.bouge) {
      annulerAppuiLong();
      cam = deplacer(cam, ddx * dpr(), ddy * dpr());
      magasin.suivre = false;
      doigt.x = t.clientX;
      doigt.y = t.clientY;
    }
  },
  { passive: false },
);
canvas.addEventListener("touchend", (ev) => {
  annulerAppuiLong();
  if (ev.touches.length === 0) {
    if (doigt && !doigt.bouge) {
      const { sx, sy } = pointCanvas(doigt.x, doigt.y);
      if (enMain()) {
        // Un simple toucher pose le réticule ; le bouton ✓ (ou un appui long) applique.
        const m = versMonde(cam, sx, sy);
        magasin.reticule = { x: Math.floor(m.x), y: Math.floor(m.y) };
        cibleTactile = { sx, sy };
        btnAppliquer.hidden = false;
      } else {
        toucherA(sx, sy);
      }
    }
    doigt = null;
    pince = null;
  }
});

// Mode Dieu : barre de pouvoirs, armement, application sur la carte.
const btnDieu = element("btn-dieu", HTMLButtonElement);
const btnProvidence = element("btn-providence", HTMLButtonElement);
btnProvidence.addEventListener("click", () => {
  const actif = magasin.etat?.faveur.providence ?? false;
  envoyer({ type: "providence", actif: !actif });
});
const barrePouvoirs = element("pouvoirs", HTMLDivElement);
const palette = element("palette", HTMLDivElement);
const aidePouvoir = element("pouvoir-aide", HTMLDivElement);
const btnAppliquer = element("btn-appliquer", HTMLButtonElement);
const faveurJauge = element("faveur-jauge", HTMLElement);
const faveurNum = element("faveur-num", HTMLSpanElement);
const reputationEl = element("reputation", HTMLDivElement);
const prieresEl = element("prieres", HTMLDivElement);
const btnQuestion = element("btn-question", HTMLButtonElement);
const TOUCHES_POUVOIR = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
let cibleTactile: { sx: number; sy: number } | null = null;
const boutonsPouvoir = new Map<Pouvoir, HTMLButtonElement>();
POUVOIRS.forEach((pouvoir, i) => {
  const fiche = FICHES_POUVOIR[pouvoir];
  const b = document.createElement("button");
  b.type = "button";
  b.className = "pouvoir";
  b.dataset.pouvoir = pouvoir;
  b.title = `${fiche.nom} (${String(fiche.cout)} ✦${fiche.rechargeJours > 0 ? `, ${String(fiche.rechargeJours)} j de recharge` : ""}) — ${fiche.description}`;
  b.setAttribute("aria-pressed", "false");
  const touche = TOUCHES_POUVOIR[i];
  b.innerHTML = `${touche === undefined ? "" : `<span class="touche">${touche}</span>`}${fiche.emoji}<span class="cout">${String(fiche.cout)}</span><span class="recharge" hidden></span><span class="verrou" hidden></span>`;
  b.addEventListener("click", () => {
    armer(magasin.pouvoirArme === pouvoir ? null : pouvoir);
  });
  palette.append(b);
  boutonsPouvoir.set(pouvoir, b);
});
function armer(pouvoir: Pouvoir | null): void {
  magasin.pouvoirArme = pouvoir;
  if (pouvoir !== null) magasin.outilArme = null;
  reglageOutil.hidden = magasin.outilArme === null;
  for (const [o, b] of boutonsOutil)
    b.setAttribute("aria-pressed", o === magasin.outilArme ? "true" : "false");
  magasin.reticule = null;
  cibleTactile = null;
  btnAppliquer.hidden = true;
  for (const [p, b] of boutonsPouvoir)
    b.setAttribute("aria-pressed", p === pouvoir ? "true" : "false");
  const fiche = pouvoir === null ? null : FICHES_POUVOIR[pouvoir];
  aidePouvoir.textContent =
    fiche === null
      ? "Faveur ✦ : +1 par jour, plus quand la colonie prospère ou prie. Choisissez un pouvoir (coût en bas à droite), puis touchez la carte."
      : `${fiche.nom} : ${fiche.cible === "personnage" ? "touchez une personne" : fiche.cible === "batiment" ? "touchez un bâtiment" : "touchez une tuile connue"}. ${fiche.description}`;
}
function desarmer(): void {
  magasin.outilArme = null;
  armer(null);
}

// Sculpter et peupler (M25) : la seconde palette, son rayon et la taille du peuple.
const paletteOutils = element("outils", HTMLDivElement);
const reglageOutil = element("reglage-outil", HTMLDivElement);
const rayonOutilEl = element("rayon-outil", HTMLSpanElement);
const taillePeupleEl = element("taille-peuple", HTMLSelectElement);
const boutonsOutil = new Map<Outil, HTMLButtonElement>();
const OUTILS: readonly Outil[] = [...PINCEAUX, "peupler", "gardien", "fleau"];
for (const outil of OUTILS) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "pouvoir outil";
  b.dataset.outil = outil;
  b.setAttribute("aria-pressed", "false");
  if (outil === "peupler") {
    b.title = `Peupler (${String(COUT_PEUPLE)} ✦, gratuit dans un monde vide) — de nouvelles familles fondent leur village où vous touchez.`;
    b.innerHTML = `👥<span class="cout">${String(COUT_PEUPLE)}</span>`;
  } else if (outil === "gardien" || outil === "fleau") {
    b.title = `${outil === "gardien" ? "Gardien" : "Fléau"} (${String(COUT_CREATURE)} ✦, rang ${String(RANG_CREATURE)}) — la créature du domaine du ciel.`;
    b.innerHTML = `${outil === "gardien" ? "🛡️" : "💀"}<span class="cout">${String(COUT_CREATURE)}</span><span class="verrou" hidden></span>`;
  } else {
    const fiche = FICHES_PINCEAU[outil];
    b.title = `${fiche.nom} — ${fiche.description} Glissez pour peindre.`;
    b.innerHTML = `${fiche.emoji}<span class="cout">libre</span>`;
  }
  b.addEventListener("click", () => {
    armerOutil(magasin.outilArme === outil ? null : outil);
  });
  paletteOutils.append(b);
  boutonsOutil.set(outil, b);
}
for (const n of TAILLES_PEUPLE) {
  const o = document.createElement("option");
  o.value = String(n);
  o.textContent = `${String(n)} habitants`;
  taillePeupleEl.append(o);
}
taillePeupleEl.value = String(magasin.taillePeuple);
taillePeupleEl.addEventListener("change", () => {
  magasin.taillePeuple = Number.parseInt(taillePeupleEl.value, 10) || 12;
});
function reglerRayon(delta: number): void {
  magasin.rayonPinceau = Math.max(0, Math.min(RAYON_PINCEAU_MAX, magasin.rayonPinceau + delta));
  rayonOutilEl.textContent = String(magasin.rayonPinceau);
}
element("btn-rayon-moins", HTMLButtonElement).addEventListener("click", () => {
  reglerRayon(-1);
});
element("btn-rayon-plus", HTMLButtonElement).addEventListener("click", () => {
  reglerRayon(1);
});
function armerOutil(outil: Outil | null): void {
  magasin.outilArme = outil;
  magasin.pouvoirArme = null;
  magasin.reticule = null;
  cibleTactile = null;
  btnAppliquer.hidden = true;
  for (const [, b] of boutonsPouvoir) b.setAttribute("aria-pressed", "false");
  for (const [o, b] of boutonsOutil) b.setAttribute("aria-pressed", o === outil ? "true" : "false");
  reglageOutil.hidden = outil === null || outil === "gardien" || outil === "fleau";
  taillePeupleEl.hidden = outil !== "peupler";
  rayonOutilEl.hidden = outil === "peupler";
  for (const b of reglageOutil.querySelectorAll("button")) b.hidden = outil === "peupler";
  if (taillePeupleEl.value !== String(magasin.taillePeuple))
    taillePeupleEl.value = String(magasin.taillePeuple);
  rayonOutilEl.textContent = String(magasin.rayonPinceau);
  aidePouvoir.textContent =
    outil === null
      ? "Faveur ✦ : +1 par jour, plus quand la colonie prospère ou prie. Choisissez un pouvoir (coût en bas à droite), puis touchez la carte."
      : outil === "peupler"
        ? `Peupler : touchez la carte, ${String(magasin.taillePeuple)} personnes y fondent leur village (gratuit si le monde est vide, sinon ${String(COUT_PEUPLE)} ✦).`
        : outil === "gardien" || outil === "fleau"
          ? aideCreature(outil)
          : `${FICHES_PINCEAU[outil].nom} : glissez sur la carte pour peindre (rayon ${String(magasin.rayonPinceau)}). ${FICHES_PINCEAU[outil].description}`;
}
/** L'aide d'un outil de créature : la fiche du domaine, ou ce qui manque. */
function aideCreature(genre: "gardien" | "fleau"): string {
  const f = magasin.etat?.faveur;
  if (f?.domaine === null || f?.domaine === undefined)
    return "Une créature demande un domaine : choisissez le visage du ciel (à droite).";
  const fiche = FICHES_DOMAINE[f.domaine][genre];
  const manque =
    f.rang < RANG_CREATURE
      ? ` Il faut le rang ${String(RANG_CREATURE)} du ciel (culte, âge du cuivre) ; vous êtes au rang ${String(f.rang)}.`
      : "";
  return `${fiche.emoji} ${fiche.nom} : ${fiche.description} Touchez la carte pour ${genre === "gardien" ? "la poster" : "le lâcher"} (${String(COUT_CREATURE)} ✦, vingt jours).${manque}`;
}
// Le choix du domaine en cours de partie (vieux mondes, ou « sans visage » au départ).
const domaineChoix = element("domaine-choix", HTMLDivElement);
const domaineSelect = element("domaine-select", HTMLSelectElement);
domaineSelect.addEventListener("change", () => {
  const v = domaineSelect.value;
  if (v === "moisson" || v === "orage" || v === "feu" || v === "songes")
    envoyer({ type: "domaine", domaine: v });
  domaineSelect.value = "";
});
/** Un coup de pinceau à la tuile donnée (le pinceau armé, au rayon réglé). */
function sculpterEn(x: number, y: number): void {
  const outil = magasin.outilArme;
  if (outil === null || !estPinceau(outil)) return;
  envoyer({ type: "sculpter", pinceau: outil, x, y, rayon: magasin.rayonPinceau });
}
function estPinceau(outil: Outil): outil is Pinceau {
  return (PINCEAUX as readonly string[]).includes(outil);
}
/** Applique l'outil armé au point écran : un coup de pinceau, ou un peuple. */
function appliquerOutilA(sx: number, sy: number): void {
  const outil = magasin.outilArme;
  const etat = magasin.etat;
  if (outil === null || etat === null) return;
  const m = versMonde(cam, sx, sy);
  const x = Math.floor(m.x);
  const y = Math.floor(m.y);
  if (outil === "peupler") {
    if (etat.stats.vivants > 0 && etat.faveur.valeur < COUT_PEUPLE) {
      secouer();
      return;
    }
    envoyer({ type: "peupler", x, y, taille: magasin.taillePeuple });
    // Un peuple posé : on rend la main, le monde est habité.
    armerOutil(null);
  } else if (outil === "gardien" || outil === "fleau") {
    if (
      etat.faveur.domaine === null ||
      etat.faveur.rang < RANG_CREATURE ||
      etat.faveur.valeur < COUT_CREATURE ||
      etat.creatures.some((c) => c.genre === outil) ||
      magasin.biomeEn(x, y) < 0
    ) {
      secouer();
      return;
    }
    envoyer({ type: "creature", genre: outil, x, y });
    armerOutil(null);
  } else {
    sculpterEn(x, y);
  }
  if ("vibrate" in navigator) navigator.vibrate(15);
  cibleTactile = null;
  btnAppliquer.hidden = true;
  magasin.reticule = null;
}
function basculerModeDieu(valeur = !magasin.modeDieu): void {
  magasin.modeDieu = valeur;
  btnDieu.classList.toggle("actif", valeur);
  barrePouvoirs.hidden = !valeur;
  canvas.classList.toggle("dieu", valeur);
  zone.classList.toggle("dieu", valeur);
  if (!valeur) desarmer();
}
btnDieu.addEventListener("click", () => {
  basculerModeDieu();
});
btnAppliquer.addEventListener("click", () => {
  if (cibleTactile !== null) agirA(cibleTactile.sx, cibleTactile.sy);
});
function secouer(): void {
  barrePouvoirs.classList.remove("secousse");
  // Forcer un reflow pour rejouer l'animation.
  barrePouvoirs.getBoundingClientRect();
  barrePouvoirs.classList.add("secousse");
  if ("vibrate" in navigator) navigator.vibrate(40);
}
/** Applique le pouvoir armé au point écran : tuile connue, personne ou bâtiment selon la cible. */
function appliquerPouvoirA(sx: number, sy: number): void {
  const pouvoir = magasin.pouvoirArme;
  const etat = magasin.etat;
  if (pouvoir === null || etat === null) return;
  const fiche = FICHES_POUVOIR[pouvoir];
  if (
    etat.faveur.valeur < (etat.faveur.couts[pouvoir] ?? fiche.cout) ||
    (etat.faveur.recharges[pouvoir] ?? 0) > etat.tick ||
    (etat.faveur.verrous[pouvoir] ?? 0) > etat.faveur.rang
  ) {
    secouer();
    return;
  }
  const m = versMonde(cam, sx, sy);
  let x = Math.floor(m.x);
  let y = Math.floor(m.y);
  let cibleId: string | undefined;
  if (fiche.cible === "personnage") {
    const p = rendu.trouverPersonnage(cam, sx, sy, performance.now());
    if (p === null) {
      secouer();
      return;
    }
    cibleId = p.id;
    x = p.x;
    y = p.y;
  } else if (fiche.cible === "batiment") {
    const b = rendu.trouverBatiment(cam, sx, sy);
    if (b === null) {
      secouer();
      return;
    }
    x = b.x;
    y = b.y;
  } else if (magasin.biomeEn(x, y) < 0) {
    secouer();
    return;
  }
  envoyer({ type: "pouvoir", pouvoir, x, y, ...(cibleId !== undefined ? { cibleId } : {}) });
  if ("vibrate" in navigator) navigator.vibrate(15);
  cibleTactile = null;
  btnAppliquer.hidden = true;
  // Le pouvoir reste armé (pinceau) ; le réticule attend le prochain toucher.
  magasin.reticule = null;
}
/** Rafraîchit la jauge de faveur et l'état des pastilles (coût, recharge). */
function rafraichirPouvoirs(): void {
  const etat = magasin.etat;
  if (etat === null || barrePouvoirs.hidden) return;
  const f = etat.faveur;
  faveurJauge.style.height = `${String(Math.round((100 * f.valeur) / Math.max(1, f.max)))}%`;
  faveurNum.textContent = `✦ ${String(f.valeur)}`;
  const domaine = f.domaine === null ? null : FICHES_DOMAINE[f.domaine];
  for (const [p, b] of boutonsPouvoir) {
    const fiche = FICHES_POUVOIR[p];
    const recharge = (f.recharges[p] ?? 0) > etat.tick;
    const cout = f.couts[p] ?? fiche.cout;
    const requis = f.verrous[p] ?? 0;
    const verrouille = requis > f.rang;
    b.disabled = f.valeur < cout || recharge || verrouille;
    const voile = b.querySelector<HTMLElement>(".recharge");
    if (voile) voile.hidden = !recharge;
    const verrou = b.querySelector<HTMLElement>(".verrou");
    if (verrou) {
      verrou.hidden = !verrouille;
      const texte = `🔒 ${String(requis)}`;
      if (verrou.textContent !== texte) verrou.textContent = texte;
    }
    const coutEl = b.querySelector<HTMLElement>(".cout");
    if (coutEl && coutEl.textContent !== String(cout)) coutEl.textContent = String(cout);
    const favori = domaine?.pouvoirs.includes(p) === true;
    const etranger = domaine !== null && FICHES_DOMAINE[domaine.etranger].pouvoirs.includes(p);
    b.classList.toggle("favori", favori);
    b.classList.toggle("etranger", etranger);
  }
  for (const genre of ["gardien", "fleau"] as const) {
    const b = boutonsOutil.get(genre);
    if (b === undefined) continue;
    const verrouille = f.domaine === null || f.rang < RANG_CREATURE;
    const dejaLa = etat.creatures.some((c) => c.genre === genre);
    b.disabled = verrouille || f.valeur < COUT_CREATURE || dejaLa;
    const verrou = b.querySelector<HTMLElement>(".verrou");
    if (verrou) {
      verrou.hidden = !verrouille && !dejaLa;
      const texte = dejaLa
        ? "déjà là"
        : f.domaine === null
          ? "domaine"
          : `🔒 ${String(RANG_CREATURE)}`;
      if (verrou.textContent !== texte) verrou.textContent = texte;
    }
    if (domaine !== null) {
      const fiche = domaine[genre];
      const emoji = b.firstChild;
      if (emoji !== null && emoji.nodeType === Node.TEXT_NODE && emoji.textContent !== fiche.emoji)
        emoji.textContent = fiche.emoji;
      b.title = `${fiche.nom} (${String(COUT_CREATURE)} ✦, rang ${String(RANG_CREATURE)}) — ${fiche.description}`;
    }
  }
  domaineChoix.hidden = f.domaine !== null;
  if (magasin.pouvoirArme !== null && boutonsPouvoir.get(magasin.pouvoirArme)?.disabled === true)
    desarmer();
  const peupler = boutonsOutil.get("peupler");
  if (peupler !== undefined) {
    const gratuit = etat.stats.vivants === 0;
    peupler.disabled = !gratuit && f.valeur < COUT_PEUPLE;
    const cout = peupler.querySelector<HTMLElement>(".cout");
    if (cout) cout.textContent = gratuit ? "libre" : String(COUT_PEUPLE);
  }
  btnProvidence.setAttribute("aria-pressed", f.providence ? "true" : "false");
  reputationEl.textContent = `${domaine === null ? "Ciel sans visage" : `${domaine.emoji} ${domaine.titre} (${domaine.nom.toLowerCase()})`} · rang ${String(f.rang)}/3 · réputation : ${libelleReputation(f.reputation)} · culte : ${NOMS_CULTE[f.culte] ?? "?"} · ${String(f.prieres)} prière${f.prieres > 1 ? "s" : ""}, ${String(f.exaucees)} exaucée${f.exaucees > 1 ? "s" : ""}`;
  // Les prières en attente : ce que la colonie demande au ciel, et ce qui l'exaucerait.
  const prieres = etat.prieres.slice(0, 4);
  prieresEl.hidden = prieres.length === 0;
  if (
    prieresEl.dataset.cle !== prieres.map((p) => `${p.personnageId}:${String(p.tick)}`).join("|")
  ) {
    prieresEl.dataset.cle = prieres.map((p) => `${p.personnageId}:${String(p.tick)}`).join("|");
    prieresEl.replaceChildren(
      ...prieres.map((p) => {
        const b = document.createElement("button");
        b.type = "button";
        const pouvoirs = POUVOIRS_EXAUCANT[p.sujet]
          .map((x) => `${FICHES_POUVOIR[x].emoji} ${FICHES_POUVOIR[x].nom}`)
          .join(", ");
        b.innerHTML = `🙏 ${p.prenom} prie pour ${LIBELLES_SUJET[p.sujet] ?? p.sujet}<span class="discret">exaucer : ${pouvoirs}</span>`;
        b.title = "Voir la fiche";
        b.addEventListener("click", () => {
          selectionner(p.personnageId);
        });
        return b;
      }),
    );
  }
}

btnQuestion.addEventListener("click", () => {
  const id = btnQuestion.dataset.id;
  if (id !== undefined) selectionner(id);
});

// Légende repliable (utile sur petit écran).
const legende = element("legende", HTMLDivElement);
element("btn-legende", HTMLButtonElement).addEventListener("click", () => {
  legende.classList.toggle("ouverte");
});

// Demande de conseil (M28) : plus d'appel à Claude, ça coûtait trop de crédit. L'observateur
// répond dans un dialogue ; sans réponse en cinq secondes, une option est tirée au sort.
const conseilLocal = new ConseilLocal(
  element("dlg-conseil", HTMLDialogElement),
  element("conseil-titre", HTMLHeadingElement),
  element("conseil-sous-titre", HTMLParagraphElement),
  element("conseil-options", HTMLOListElement),
  element("conseil-compte", HTMLSpanElement),
  envoyer,
);

// Brouillard d'exploration : case dans la légende, touche b.
function basculerBrouillard(valeur = !magasin.brouillard): void {
  magasin.brouillard = valeur;
  const caseBrouillard = legende.querySelector<HTMLInputElement>("#brouillard-case");
  if (caseBrouillard) caseBrouillard.checked = valeur;
}
legende.addEventListener("change", (ev) => {
  const cible = ev.target;
  if (cible instanceof HTMLInputElement && cible.id === "brouillard-case")
    basculerBrouillard(cible.checked);
});

window.addEventListener("keydown", (ev) => {
  const cible = ev.target as HTMLElement | null;
  if (cible?.tagName === "INPUT" || cible?.tagName === "SELECT") return;
  const etat = magasin.etat;
  switch (ev.key) {
    case " ":
      ev.preventDefault();
      envoyer({ type: etat?.pause ? "reprendre" : "pause" });
      break;
    case "ArrowRight":
      envoyer({ type: "tick" });
      break;
    case "a":
      envoyer({ type: "aube" });
      break;
    case "s":
      basculerSuivi();
      break;
    case "Escape":
      if (enMain()) {
        desarmer();
        break;
      }
      magasin.selectionBatiment = null;
      selectionner(null);
      break;
    case "g":
      basculerModeDieu();
      break;
    case "Enter":
      if (enMain() && cibleTactile !== null) agirA(cibleTactile.sx, cibleTactile.sy);
      break;
    case "+":
    case "=": {
      const i = VITESSES.indexOf(etat?.ticksParSeconde ?? 1);
      envoyer({
        type: "vitesse",
        ticksParSeconde: VITESSES[Math.min(VITESSES.length - 1, i + 1)] ?? 1,
      });
      break;
    }
    case "-": {
      const i = VITESSES.indexOf(etat?.ticksParSeconde ?? 1);
      envoyer({ type: "vitesse", ticksParSeconde: VITESSES[Math.max(0, i - 1)] ?? 1 });
      break;
    }
    case "f":
      camAjustee = false;
      break;
    case "p":
      basculerPleinEcran();
      break;
    case "b":
      basculerBrouillard();
      break;
    case "c":
      choisirCalque(CALQUES[(CALQUES.indexOf(magasin.calque) + 1) % CALQUES.length] ?? "aucun");
      break;
    case "l":
      basculerLois();
      break;
    default: {
      const i = TOUCHES_POUVOIR.indexOf(ev.key);
      const pouvoir = i >= 0 ? POUVOIRS[i] : undefined;
      if (pouvoir !== undefined) {
        if (!magasin.modeDieu) basculerModeDieu(true);
        armer(magasin.pouvoirArme === pouvoir ? null : pouvoir);
      }
    }
  }
});

let dernierPanneau = 0;
let sauterImage = false;
function boucle(maintenant: number): void {
  const init = magasin.init;
  if (init !== null && !camAjustee) {
    const etat = magasin.etat;
    // Le monde n'a pas de limite : on cadre ce que la colonie connaît, sinon le berceau.
    const zone = magasin.zoneDecouverte();
    cam =
      zone !== null
        ? cadrer(zone, canvas.width, canvas.height, 20)
        : centrerSur({ echelle: 12, dx: 0, dy: 0 }, 0, 0, canvas.width, canvas.height);
    // Sur un écran étroit, le monde entier serait illisible : on cadre le village.
    if (etat !== null && canvas.width < 900 * (window.devicePixelRatio || 1)) {
      const vivants = etat.personnages.filter((p) => p.vivant);
      if (vivants.length > 0) {
        const cx = vivants.reduce((t, p) => t + p.x, 0) / vivants.length;
        const cy = vivants.reduce((t, p) => t + p.y, 0) / vivants.length;
        cam = centrerSur(
          { ...cam, echelle: Math.max(10, Math.min(24, canvas.width / 36)) },
          cx,
          cy,
          canvas.width,
          canvas.height,
        );
      }
    }
    if (etat !== null || !modeLocal) camAjustee = true;
  }
  if (magasin.suivre && magasin.selection !== null) {
    const pos = magasin.positionAffichee(magasin.selection, maintenant);
    if (pos) cam = centrerSur(cam, pos.x, pos.y, canvas.width, canvas.height);
  }
  // Une image qui coûte cher (grande colonie, petit processeur) : on saute la suivante, la
  // simulation et les gestes gardent la main.
  if (sauterImage) sauterImage = false;
  else {
    const debutImage = performance.now();
    rendu.dessiner(cam, maintenant, survol, survolBatiment);
    sauterImage = performance.now() - debutImage > 12;
  }
  if (maintenant - dernierPanneau > 250) {
    panneaux.rafraichir();
    rafraichirPouvoirs();
    rafraichirLois();
    surveillerChronique();
    sauvegardeAutomatique(maintenant);
    // La question ouverte, en un clic : la pastille de la barre ouvre la fiche du demandeur.
    const q = magasin.etat?.questions[0];
    btnQuestion.hidden = q === undefined;
    if (q !== undefined) {
      const texte = `❓ ${q.contexte.prenom} demande conseil`;
      if (btnQuestion.textContent !== texte) btnQuestion.textContent = texte;
      btnQuestion.dataset.id = q.personnageId;
    }
    conseilLocal.suivre(q);
    dernierPanneau = maintenant;
  }
  requestAnimationFrame(boucle);
}
requestAnimationFrame(boucle);
if (modeLocal) {
  preparerStockage();
  void reprendreAuChargement()
    .catch((erreur: unknown) => {
      statutSauvegarde(
        `Stockage indisponible : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
      );
      return false;
    })
    .then((reprise) => {
      if (!reprise) liaison.connecter();
    });
} else {
  liaison.connecter();
}
