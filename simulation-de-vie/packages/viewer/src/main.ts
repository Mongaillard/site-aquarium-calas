/** Point d'entrée du viewer : réseau, rendu, interactions. */
import "./style.css";
import type { Commande } from "@sdv/protocole";
import { VITESSES } from "@sdv/protocole";
import type { Camera } from "./camera.js";
import { ajuster, centrerSur, deplacer, zoomer } from "./camera.js";
import { Magasin } from "./etat.js";
import { Panneaux } from "./panneaux.js";
import { Rendu } from "./rendu.js";
import { Reseau, urlWebSocket } from "./reseau.js";

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`élément #${id} introuvable`);
  return el;
}
const canvas = element("carte", HTMLCanvasElement);
const zone = element("zone-carte", HTMLDivElement);
const survolEl = element("survol", HTMLDivElement);
const magasin = new Magasin();
const rendu = new Rendu(canvas, magasin);
let cam: Camera = { echelle: 8, dx: 0, dy: 0 };
let camAjustee = false;
let survol: string | null = null;
let survolBatiment: string | null = null;

const reseau = new Reseau(
  urlWebSocket(window.location),
  (m) => {
    magasin.recevoir(m, performance.now());
    if (m.type === "init") camAjustee = false;
    if (m.type === "etat" && magasin.selection !== null && magasin.fiche === null) {
      reseau.envoyer({ type: "inspecter", id: magasin.selection });
    }
  },
  (connecte) => {
    magasin.connecte = connecte;
    if (connecte && magasin.selection !== null)
      reseau.envoyer({ type: "inspecter", id: magasin.selection });
  },
);

const envoyer = (c: Commande): void => {
  reseau.envoyer(c);
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

// Souris : glisser pour déplacer, molette pour zoomer, clic pour sélectionner.
let glisse: { x: number; y: number; bouge: boolean } | null = null;
const dpr = (): number => window.devicePixelRatio || 1;
const pointCanvas = (ev: MouseEvent): { sx: number; sy: number; dedans: boolean } => {
  const rect = canvas.getBoundingClientRect();
  return {
    sx: (ev.clientX - rect.left) * dpr(),
    sy: (ev.clientY - rect.top) * dpr(),
    dedans:
      ev.clientX >= rect.left &&
      ev.clientX <= rect.right &&
      ev.clientY >= rect.top &&
      ev.clientY <= rect.bottom,
  };
};
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
  const { sx, sy, dedans } = pointCanvas(ev);
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
    const { sx, sy } = pointCanvas(ev);
    const p = rendu.trouverPersonnage(cam, sx, sy, performance.now());
    if (p !== null) {
      selectionner(p.id);
    } else {
      const b = rendu.trouverBatiment(cam, sx, sy);
      if (b !== null) selectionnerBatiment(b.id);
      else {
        magasin.selectionBatiment = null;
        selectionner(null);
      }
    }
  }
  glisse = null;
  canvas.classList.remove("glisse");
});
canvas.addEventListener(
  "wheel",
  (ev) => {
    ev.preventDefault();
    const { sx, sy } = pointCanvas(ev);
    const facteur = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
    cam = zoomer(cam, facteur, sx, sy);
  },
  { passive: false },
);

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
  }
});

let dernierPanneau = 0;
function boucle(maintenant: number): void {
  const init = magasin.init;
  if (init !== null && !camAjustee) {
    cam = ajuster(init.largeur, init.hauteur, canvas.width, canvas.height);
    camAjustee = true;
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
reseau.connecter();
