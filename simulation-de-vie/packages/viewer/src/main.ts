/** Point d'entrée du viewer : liaison (serveur ou locale), rendu, interactions souris et tactiles. */
import "./style.css";
import type { Commande, MessageServeur, Pouvoir } from "@sdv/protocole";
import { FICHES_POUVOIR, NOMS_CULTE, POUVOIRS, POUVOIRS_EXAUCANT, VITESSES } from "@sdv/protocole";
import { LIBELLES_SUJET, libelleReputation } from "./format.js";
import type { Camera } from "./camera.js";
import { cadrer, centrerSur, deplacer, versMonde, zoomer } from "./camera.js";
import { Magasin } from "./etat.js";
import { LiaisonLocale } from "./local.js";
import { CerveauClaude, sampleDeLaPage } from "./claude.js";
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
const magasin = new Magasin();
const rendu = new Rendu(canvas, magasin);
let cam: Camera = { echelle: 8, dx: 0, dy: 0 };
let camAjustee = false;
let survol: string | null = null;
let survolBatiment: string | null = null;

// Mode local : la simulation tourne dans la page (page publiée, mobile, ?local dans l'URL).
const parametres = new URLSearchParams(window.location.search);
const modeLocal = import.meta.env.VITE_MODE_LOCAL === "1" || parametres.has("local");
const graineInitiale = parametres.get("seed") ?? "42";
// Quelques jours d'avance seulement : on assiste ainsi à l'exploration du monde.
const joursAvance = Number.parseInt(parametres.get("jours") ?? "5", 10);
/** Habitants au départ (`?population=`, ou le choix du formulaire) : 12 par défaut, 3 familles. */
const POPULATIONS = [12, 24, 36, 48];
const populationInitiale = Number.parseInt(parametres.get("population") ?? "12", 10);
function population(): { initiale: number; familles: number } {
  const n = Number.parseInt(populationEntree.value, 10);
  const initiale = POPULATIONS.includes(n) ? n : 12;
  return { initiale, familles: Math.max(3, Math.round(initiale / 4)) };
}
if (POPULATIONS.includes(populationInitiale)) populationEntree.value = String(populationInitiale);

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
  return new LiaisonLocale(
    {
      seed,
      joursAvance: Number.isFinite(joursAvance) ? joursAvance : 20,
      ticksParSeconde: 4,
      config: { population: population() },
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
const panneaux = new Panneaux(magasin, { envoyer, selectionner, basculerSuivi });

/** Remplace le monde courant par un nouveau (graine) ou par une sauvegarde. */
function relancer(graine: string, sauvegarde?: unknown): void {
  liaison.fermer();
  magasin.reinitialiser();
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
  if (!(liaison instanceof LiaisonLocale)) return false;
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
    const cout =
      liaison instanceof LiaisonLocale && !force ? liaison.coutSauvegardeMs : coutImmediat;
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
  toucherA(sx, sy);
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
canvas.addEventListener("mousedown", (ev) => {
  glisse = { x: ev.clientX, y: ev.clientY, bouge: false };
  canvas.classList.add("glisse");
});
window.addEventListener("mousemove", (ev) => {
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
  if (magasin.modeDieu && magasin.pouvoirArme !== null) {
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
        if (magasin.modeDieu && magasin.pouvoirArme !== null) {
          const { sx, sy } = pointCanvas(t.clientX, t.clientY);
          appuiLong = setTimeout(() => {
            appuiLong = null;
            if (doigt && !doigt.bouge) {
              appliquerPouvoirA(sx, sy);
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
      if (magasin.modeDieu && magasin.pouvoirArme !== null) {
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
  b.innerHTML = `${touche === undefined ? "" : `<span class="touche">${touche}</span>`}${fiche.emoji}<span class="cout">${String(fiche.cout)}</span><span class="recharge" hidden></span>`;
  b.addEventListener("click", () => {
    armer(magasin.pouvoirArme === pouvoir ? null : pouvoir);
  });
  palette.append(b);
  boutonsPouvoir.set(pouvoir, b);
});
function armer(pouvoir: Pouvoir | null): void {
  magasin.pouvoirArme = pouvoir;
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
  armer(null);
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
  if (cibleTactile !== null) appliquerPouvoirA(cibleTactile.sx, cibleTactile.sy);
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
  if (etat.faveur.valeur < fiche.cout || (etat.faveur.recharges[pouvoir] ?? 0) > etat.tick) {
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
  for (const [p, b] of boutonsPouvoir) {
    const fiche = FICHES_POUVOIR[p];
    const recharge = (f.recharges[p] ?? 0) > etat.tick;
    b.disabled = f.valeur < fiche.cout || recharge;
    const voile = b.querySelector<HTMLElement>(".recharge");
    if (voile) voile.hidden = !recharge;
  }
  if (magasin.pouvoirArme !== null && boutonsPouvoir.get(magasin.pouvoirArme)?.disabled === true)
    desarmer();
  btnProvidence.setAttribute("aria-pressed", f.providence ? "true" : "false");
  reputationEl.textContent = `Réputation du ciel : ${libelleReputation(f.reputation)} · culte : ${NOMS_CULTE[f.culte] ?? "?"} · ${String(f.prieres)} prière${f.prieres > 1 ? "s" : ""}, ${String(f.exaucees)} exaucée${f.exaucees > 1 ? "s" : ""}`;
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

// Cerveau Claude (M5) : seulement dans la page publiée sur claude.ai, sur demande.
const btnClaude = element("btn-claude", HTMLButtonElement);
const btnConseils = element("btn-conseils", HTMLButtonElement);
const badgeConseils = element("badge-conseils", HTMLSpanElement);
const cerveauClaude = new CerveauClaude(
  magasin,
  (commande) => {
    liaison.envoyer(commande);
  },
  sampleDeLaPage,
  (texte) => {
    const el = document.getElementById("connexion");
    if (el) el.textContent = texte;
  },
);
// Les deux boutons Claude n'existent que là où `claude.use("sample")` existe : dans la page
// publiée sur claude.ai. Le serveur comme la liaison locale acceptent les commandes.
if (window.claude !== undefined) {
  btnClaude.hidden = false;
  btnConseils.hidden = false;
  btnClaude.addEventListener("click", () => {
    if (cerveauClaude.estActif) {
      cerveauClaude.desactiver();
      const el = document.getElementById("connexion");
      if (el) el.textContent = "en direct";
    } else {
      cerveauClaude.activer();
    }
    btnClaude.classList.toggle("actif", cerveauClaude.estActif);
  });
  btnConseils.addEventListener("click", () => {
    if (cerveauClaude.conseilsActifs) cerveauClaude.desactiverConseils();
    else cerveauClaude.activerConseils();
    btnConseils.classList.toggle("actif", cerveauClaude.conseilsActifs);
  });
}

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
      if (magasin.modeDieu && magasin.pouvoirArme !== null) {
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
      if (magasin.modeDieu && magasin.pouvoirArme !== null && cibleTactile !== null)
        appliquerPouvoirA(cibleTactile.sx, cibleTactile.sy);
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
    sauvegardeAutomatique(maintenant);
    const questions = magasin.etat?.questions.length ?? 0;
    badgeConseils.hidden = questions === 0;
    badgeConseils.textContent = String(questions);
    // La question ouverte, en un clic : la pastille de la barre ouvre la fiche du demandeur.
    const q = magasin.etat?.questions[0];
    btnQuestion.hidden = q === undefined;
    if (q !== undefined) {
      const texte = `❓ ${q.contexte.prenom} demande conseil${cerveauClaude.conseilsActifs ? " (Claude réfléchit)" : ""}`;
      if (btnQuestion.textContent !== texte) btnQuestion.textContent = texte;
      btnQuestion.dataset.id = q.personnageId;
    }
    dernierPanneau = maintenant;
    if (cerveauClaude.estActif || cerveauClaude.conseilsActifs) {
      void cerveauClaude.tick(maintenant).then(() => {
        btnClaude.classList.toggle("actif", cerveauClaude.estActif);
        btnConseils.classList.toggle("actif", cerveauClaude.conseilsActifs);
      });
    }
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
