/** Point d'entrée du viewer : liaison (serveur ou locale), rendu, interactions souris et tactiles. */
import "./style.css";
import type { Commande, MessageServeur } from "@sdv/protocole";
import { VITESSES } from "@sdv/protocole";
import type { Camera } from "./camera.js";
import { ajuster, cadrer, centrerSur, deplacer, zoomer } from "./camera.js";
import { Magasin } from "./etat.js";
import { LiaisonLocale } from "./local.js";
import { Panneaux } from "./panneaux.js";
import { Rendu } from "./rendu.js";
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

function creerLiaison(graine: string): Liaison {
  if (!modeLocal) return new Reseau(urlWebSocket(window.location), recevoir, connexion);
  const seed = /^-?\d+$/.test(graine) ? Number.parseInt(graine, 10) : graine;
  return new LiaisonLocale(
    { seed, joursAvance: Number.isFinite(joursAvance) ? joursAvance : 20, ticksParSeconde: 4 },
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

if (modeLocal) {
  formulaireLocal.hidden = false;
  graineEntree.value = graineInitiale;
  formulaireLocal.addEventListener("submit", (ev) => {
    ev.preventDefault();
    liaison.fermer();
    magasin.reinitialiser();
    liaison = creerLiaison(graineEntree.value.trim() || "42");
    liaison.connecter();
    panneaux.afficherOnglet("inspecteur");
  });
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
    toucherA(sx, sy);
  }
  glisse = null;
  canvas.classList.remove("glisse");
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

// Tactile : un doigt glisse ou touche, deux doigts pincent pour zoomer.
let doigt: { x: number; y: number; bouge: boolean } | null = null;
let pince: { distance: number; x: number; y: number } | null = null;
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
    if (ev.touches.length === 1) {
      const t = ev.touches.item(0);
      if (t) doigt = { x: t.clientX, y: t.clientY, bouge: false };
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
      cam = deplacer(cam, ddx * dpr(), ddy * dpr());
      magasin.suivre = false;
      doigt.x = t.clientX;
      doigt.y = t.clientY;
    }
  },
  { passive: false },
);
canvas.addEventListener("touchend", (ev) => {
  if (ev.touches.length === 0) {
    if (doigt && !doigt.bouge) {
      const { sx, sy } = pointCanvas(doigt.x, doigt.y);
      toucherA(sx, sy);
    }
    doigt = null;
    pince = null;
  }
});

// Légende repliable (utile sur petit écran).
const legende = element("legende", HTMLDivElement);
element("btn-legende", HTMLButtonElement).addEventListener("click", () => {
  legende.classList.toggle("ouverte");
});

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
      magasin.selectionBatiment = null;
      selectionner(null);
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
    case "b":
      basculerBrouillard();
      break;
  }
});

let dernierPanneau = 0;
function boucle(maintenant: number): void {
  const init = magasin.init;
  if (init !== null && !camAjustee) {
    cam = ajuster(init.largeur, init.hauteur, canvas.width, canvas.height);
    const etat = magasin.etat;
    // Avec le brouillard, on cadre ce que la colonie connaît plutôt que tout le monde.
    const zone = magasin.brouillard ? magasin.zoneDecouverte() : null;
    if (zone !== null) cam = cadrer(zone, canvas.width, canvas.height, 20);
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
  rendu.dessiner(cam, maintenant, survol, survolBatiment);
  if (maintenant - dernierPanneau > 250) {
    panneaux.rafraichir();
    dernierPanneau = maintenant;
  }
  requestAnimationFrame(boucle);
}
requestAnimationFrame(boucle);
liaison.connecter();
