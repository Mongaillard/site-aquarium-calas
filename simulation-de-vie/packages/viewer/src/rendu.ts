/** Rendu illustré de la carte : fond pré-rendu, gisements, bâtiments, personnages animés, bulles, nuit. */
import { LEVER_COUCHER, opaciteNuit } from "@sdv/protocole";
import type { BatimentEtat, PersonnageEtat } from "@sdv/protocole";
import type { Camera } from "./camera.js";
import { versEcran, versMonde } from "./camera.js";
import { Brouillard, COULEUR_INCONNU } from "./brouillard.js";
import type { Magasin, MorceauVue } from "./etat.js";
import { RESOLUTION_FOND, construireFondMorceau } from "./fond.js";
import { couleurFamille, couleurMoral } from "./format.js";
import * as sprites from "./sprites.js";

export class Rendu {
  /** Fond pré-rendu de chaque morceau connu, avec la version dessinée. */
  private readonly fonds = new Map<MorceauVue, { canvas: HTMLCanvasElement; version: number }>();
  private readonly brouillard = new Brouillard();
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly magasin: Magasin,
  ) {
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("canvas 2D indisponible");
    this.ctx = ctx;
  }

  private fondMorceau(
    m: MorceauVue,
    taille: number,
    nomsBiomes: readonly string[],
  ): HTMLCanvasElement {
    const existant = this.fonds.get(m);
    if (existant?.version === m.version) return existant.canvas;
    const canvas = construireFondMorceau(m, taille, nomsBiomes);
    this.fonds.set(m, { canvas, version: m.version });
    return canvas;
  }

  dessiner(
    cam: Camera,
    maintenant: number,
    survol: string | null,
    survolBatiment: string | null,
  ): void {
    const { canvas, ctx, magasin } = this;
    const init = magasin.init;
    const etat = magasin.etat;
    ctx.fillStyle = COULEUR_INCONNU;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (init === null) return;
    if (!this.fonds.size && magasin.morceaux.size === 0 && etat === null) return;

    // Fenêtre visible en tuiles, pour ne dessiner que le nécessaire.
    const hg = versMonde(cam, 0, 0);
    const bd = versMonde(cam, canvas.width, canvas.height);
    const visible = (x: number, y: number): boolean =>
      x >= hg.x - 2 && x <= bd.x + 1 && y >= hg.y - 2 && y <= bd.y + 1;

    ctx.save();
    ctx.imageSmoothingEnabled = cam.echelle < RESOLUTION_FOND;
    ctx.translate(cam.dx, cam.dy);
    ctx.scale(cam.echelle, cam.echelle);
    // Fond : les morceaux connus qui tombent dans la fenêtre.
    const T = magasin.tailleMorceau;
    for (const m of magasin.morceaux.values()) {
      const x = m.cx * T;
      const y = m.cy * T;
      if (x + T < hg.x - 1 || x > bd.x + 1 || y + T < hg.y - 1 || y > bd.y + 1) continue;
      ctx.drawImage(this.fondMorceau(m, T, init.nomsBiomes), x, y, T, T);
    }
    // Les morceaux oubliés (nouveau monde) libèrent leur fond.
    for (const m of [...this.fonds.keys()])
      if (!magasin.morceaux.has(cleDe(m))) this.fonds.delete(m);

    // Gisements.
    if (cam.echelle >= 5) {
      for (const g of magasin.gisements.values()) {
        if (g.quantite <= 0 || !visible(g.x, g.y) || magasin.biomeEn(g.x, g.y) < 0) continue;
        sprites.gisement(ctx, g.x, g.y, g.type, g.outil, g.quantite / 8);
      }
    } else {
      for (const g of magasin.gisements.values()) {
        if (g.quantite <= 0 || !visible(g.x, g.y) || magasin.biomeEn(g.x, g.y) < 0) continue;
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillRect(g.x + 0.3, g.y + 0.3, 0.4, 0.4);
      }
    }

    const nuit = etat?.moment.estNuit ?? false;
    if (etat !== null) {
      // Bâtiments, du haut vers le bas pour les recouvrements.
      const batiments = [...etat.batiments].sort((a, b) => a.y - b.y);
      for (const b of batiments) {
        if (!visible(b.x, b.y)) continue;
        this.dessinerBatiment(
          b,
          nuit,
          maintenant,
          b.id === magasin.selectionBatiment || b.id === survolBatiment,
        );
      }

      // Personnages, triés par ordre vertical (ceux du bas devant).
      const positions = etat.personnages
        .filter((p) => p.vivant)
        .map((p) => ({
          p,
          pos: magasin.positionAffichee(p.id, maintenant) ?? { x: p.x, y: p.y, enMouvement: false },
        }))
        .sort((a, b) => a.pos.y - b.pos.y);
      for (const { p, pos } of positions) {
        if (!visible(pos.x, pos.y)) continue;
        sprites.personnage(ctx, pos.x, pos.y, {
          couleur: couleurFamille(p.nomFamille),
          contour: couleurMoral(p.besoins.moral),
          teint: sprites.TEINTS[p.teint] ?? "#f3d3b3",
          cheveux: sprites.CHEVEUX[p.cheveux] ?? "#4a2e1a",
          sexe: p.sexe,
          echelle: p.stade === "enfant" ? 0.6 : p.stade === "adolescent" ? 0.8 : 1,
          endormi: p.endormi,
          marche: pos.enMouvement,
          phase: (maintenant / 400) % 1,
          enceinte: p.enceinte,
          selection: p.id === magasin.selection,
          survol: p.id === survol,
        });
      }

      // Brouillard d'exploration : dessiné après le monde, avant les textes.
      if (magasin.brouillard) {
        this.brouillard.dessiner(
          ctx,
          magasin,
          positions.map(({ pos }) => pos),
          etat.rayonVision,
        );
      }
    }
    ctx.restore();

    // Prénoms (espace écran).
    if (etat !== null && cam.echelle >= 12) {
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      for (const p of etat.personnages) {
        if (!p.vivant) continue;
        const pos = magasin.positionAffichee(p.id, maintenant) ?? { x: p.x, y: p.y };
        if (!visible(pos.x, pos.y)) continue;
        const e = versEcran(cam, pos.x + 0.5, pos.y + 0.02);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillText(p.prenom, e.x + 1, e.y + 1);
        ctx.fillStyle = "#fff";
        ctx.fillText(p.prenom, e.x, e.y);
      }
    }

    // Voile nocturne et halos des feux.
    if (etat !== null) {
      const [lever, coucher] = LEVER_COUCHER[etat.moment.saison] ?? [6, 20];
      const alpha = opaciteNuit(etat.moment.heure, etat.moment.minute, lever, coucher);
      if (alpha > 0) {
        ctx.fillStyle = `rgba(10, 18, 50, ${alpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (const b of etat.batiments) {
          if (b.type !== "feu_de_camp" || !b.allume || b.etat !== "termine") continue;
          const e = versEcran(cam, b.x + 0.5, b.y + 0.6);
          const r = cam.echelle * (3 + Math.sin(maintenant / 150) * 0.15);
          const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
          grad.addColorStop(0, `rgba(255,190,90,${alpha * 0.95})`);
          grad.addColorStop(1, "rgba(255,190,90,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(e.x - r, e.y - r, 2 * r, 2 * r);
        }
      }
    }

    // Bulles de dialogue (masquées quand la carte est vue de loin).
    if (etat !== null && cam.echelle >= 7) {
      ctx.font = "12px system-ui, sans-serif";
      ctx.textBaseline = "middle";
      const affichees = new Set<string>();
      for (const bulle of magasin.bulles) {
        if (bulle.debut > maintenant || bulle.fin < maintenant || affichees.has(bulle.id)) continue;
        affichees.add(bulle.id);
        const p = etat.personnages.find((x) => x.id === bulle.id);
        if (p === undefined) continue;
        const pos = magasin.positionAffichee(p.id, maintenant) ?? { x: p.x, y: p.y };
        const e = versEcran(cam, pos.x + 0.5, pos.y);
        const texte = bulle.texte.length > 60 ? `${bulle.texte.slice(0, 57)}…` : bulle.texte;
        const largeur = ctx.measureText(texte).width + 14;
        const x = Math.max(4, Math.min(canvas.width - largeur - 4, e.x - largeur / 2));
        const y = e.y - 34;
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        arrondi(ctx, x, y, largeur, 22, 8);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(e.x - 5, y + 22);
        ctx.lineTo(e.x + 5, y + 22);
        ctx.lineTo(e.x, y + 28);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#111";
        ctx.textAlign = "left";
        ctx.fillText(texte, x + 7, y + 11);
      }
    }
  }

  private dessinerBatiment(
    b: BatimentEtat,
    nuit: boolean,
    maintenant: number,
    surligne: boolean,
  ): void {
    const ctx = this.ctx;
    if (surligne) {
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 0.06;
      ctx.strokeRect(b.x + 0.02, b.y + 0.02, 0.96, 0.96);
    }
    if (b.etat === "chantier") {
      const avancement = b.travailTotal > 0 ? 1 - b.travailRestant / b.travailTotal : 0;
      sprites.chantier(ctx, b.x, b.y, Object.keys(b.manquants).length > 0 ? 0 : avancement);
      return;
    }
    switch (b.type) {
      case "abri":
        sprites.abri(ctx, b.x, b.y);
        break;
      case "maison":
        sprites.maison(ctx, b.x, b.y, nuit);
        break;
      case "entrepot":
        sprites.entrepot(ctx, b.x, b.y);
        break;
      case "feu_de_camp":
        sprites.feu(ctx, b.x, b.y, b.allume, maintenant);
        break;
      case "four":
        sprites.four(ctx, b.x, b.y);
        break;
      case "puits":
        sprites.puits(ctx, b.x, b.y);
        break;
      case "palissade":
        sprites.palissade(ctx, b.x, b.y);
        break;
      case "tombe":
        sprites.tombe(ctx, b.x, b.y);
        break;
      default:
        ctx.fillStyle = "#888";
        ctx.fillRect(b.x + 0.1, b.y + 0.1, 0.8, 0.8);
    }
    if (b.solidite < 40) {
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.moveTo(b.x + 0.3, b.y + 0.5);
      ctx.lineTo(b.x + 0.45, b.y + 0.7);
      ctx.lineTo(b.x + 0.4, b.y + 0.9);
      ctx.stroke();
    }
  }

  /** Personnage vivant le plus proche du point écran (rayon de 16 px), ou null. */
  trouverPersonnage(
    cam: Camera,
    sx: number,
    sy: number,
    maintenant: number,
  ): PersonnageEtat | null {
    const etat = this.magasin.etat;
    if (etat === null) return null;
    const m = versMonde(cam, sx, sy);
    let meilleur: PersonnageEtat | null = null;
    let dMin = Infinity;
    for (const p of etat.personnages) {
      if (!p.vivant) continue;
      const pos = this.magasin.positionAffichee(p.id, maintenant) ?? { x: p.x, y: p.y };
      const d = Math.hypot(pos.x + 0.5 - m.x, pos.y + 0.55 - m.y) * cam.echelle;
      if (d < 16 && d < dMin) {
        dMin = d;
        meilleur = p;
      }
    }
    return meilleur;
  }

  /** Bâtiment sous le point écran, ou null. */
  trouverBatiment(cam: Camera, sx: number, sy: number): BatimentEtat | null {
    const etat = this.magasin.etat;
    if (etat === null) return null;
    const m = versMonde(cam, sx, sy);
    const x = Math.floor(m.x);
    const y = Math.floor(m.y);
    return etat.batiments.find((b) => b.x === x && b.y === y) ?? null;
  }
}

function cleDe(m: MorceauVue): number {
  return (m.cx + 32_768) * 65_536 + (m.cy + 32_768);
}

function arrondi(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
