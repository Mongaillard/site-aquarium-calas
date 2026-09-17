/** Rendu illustré de la carte : fond pré-rendu, gisements, bâtiments, personnages animés, bulles, nuit. */
import { FICHES_PINCEAU, FICHES_POUVOIR, LEVER_COUCHER, opaciteNuit } from "@sdv/protocole";
import type { BatimentEtat, PersonnageEtat } from "@sdv/protocole";
import type { Camera } from "./camera.js";
import { versEcran, versMonde } from "./camera.js";
import { Brouillard, COULEUR_INCONNU } from "./brouillard.js";
import type { Magasin, MorceauVue } from "./etat.js";
import { cleMorceau } from "./etat.js";
import { RESOLUTION_FOND, construireFondMorceau } from "./fond.js";
import { atlasPret, structure } from "./atlas.js";
import type { Structure } from "./atlas.js";
import {
  couleurFamille,
  couleurFoi,
  couleurMoral,
  couleurVillage,
  couleurVivres,
  emblemeVillage,
} from "./format.js";
import * as sprites from "./sprites.js";

/** Distance (en tuiles) d'un point à la fenêtre visible ; 0 s'il est dedans. */
function distanceFenetre(
  x: number,
  y: number,
  hg: { x: number; y: number },
  bd: { x: number; y: number },
): number {
  const dx = x < hg.x ? hg.x - x : x > bd.x ? x - bd.x : 0;
  const dy = y < hg.y ? hg.y - y : y > bd.y ? y - bd.y : 0;
  return Math.max(dx, dy);
}

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
    resolution: number,
  ): HTMLCanvasElement {
    // Les bords d'un morceau dépendent aussi de ses voisins : leur version compte ; la
    // résolution aussi (M36 : de près, le fond se redessine à 48 px par tuile).
    let version = m.version * 4 + (resolution > RESOLUTION_FOND ? 1 : 0);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        version += (this.magasin.morceaux.get(cleMorceau(m.cx + dx, m.cy + dy))?.version ?? 0) * 7;
      }
    const existant = this.fonds.get(m);
    if (existant?.version === version) return existant.canvas;
    const canvas = construireFondMorceau(
      m,
      taille,
      nomsBiomes,
      (x, y) => this.magasin.biomeEn(x, y),
      resolution,
    );
    // Tant que les tuiles Kenney ne sont pas décodées, le fond se dessine sans elles (les
    // aplats vectoriels restent) mais ne se met pas en cache : le morceau se refait dès
    // qu'elles le sont, sans quoi un fond incomplet resterait figé jusqu'à la découverte suivante.
    if (atlasPret()) this.fonds.set(m, { canvas, version });
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
    ctx.imageSmoothingEnabled = true;
    ctx.translate(cam.dx, cam.dy);
    ctx.scale(cam.echelle, cam.echelle);
    // Fond : les morceaux connus qui tombent dans la fenêtre ; de près, en haute résolution.
    const T = magasin.tailleMorceau;
    const resolutionFond = cam.echelle >= 36 ? RESOLUTION_FOND * 2 : RESOLUTION_FOND;
    for (const m of magasin.morceaux.values()) {
      const x = m.cx * T;
      const y = m.cy * T;
      if (x + T < hg.x - 1 || x > bd.x + 1 || y + T < hg.y - 1 || y > bd.y + 1) continue;
      ctx.drawImage(this.fondMorceau(m, T, init.nomsBiomes, resolutionFond), x, y, T, T);
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
    if (etat !== null && (magasin.calque === "villages" || magasin.calque === "vivres")) {
      // Calque villages / vivres : le territoire de chaque village, teinté par village ou par ses réserves.
      for (const v of etat.villages.villages) {
        const rayon = 8 + Math.sqrt(Math.max(1, v.habitants)) * 2.2;
        if (!visible(v.x, v.y) && distanceFenetre(v.x, v.y, hg, bd) > rayon) continue;
        const couleur =
          magasin.calque === "villages"
            ? couleurVillage(v.id)
            : couleurVivres(v.nourriture, v.habitants);
        ctx.fillStyle = couleur;
        ctx.globalAlpha = 0.22;
        ctx.beginPath();
        ctx.arc(v.x + 0.5, v.y + 0.5, rayon, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = couleur;
        ctx.lineWidth = 0.25;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    if (etat !== null) {
      // Les routes entre villages : un trait pointillé.
      if (etat.villages.routes.length > 0) {
        ctx.strokeStyle = "rgba(255, 233, 168, 0.5)";
        ctx.lineWidth = 0.12;
        ctx.setLineDash([0.6, 0.5]);
        ctx.beginPath();
        for (const [x1, y1, x2, y2] of etat.villages.routes) {
          ctx.moveTo(x1 + 0.5, y1 + 0.5);
          ctx.lineTo(x2 + 0.5, y2 + 0.5);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Les caravanes : un chargement qui roule.
      for (const c of etat.villages.caravanes) {
        if (!visible(c.x, c.y)) continue;
        ctx.fillStyle = "#8a5a2b";
        ctx.fillRect(c.x + 0.15, c.y + 0.35, 0.7, 0.35);
        ctx.fillStyle = "#e0c090";
        ctx.fillRect(c.x + 0.25, c.y + 0.2, 0.5, 0.2);
        ctx.fillStyle = "#3a3a3a";
        ctx.beginPath();
        ctx.arc(c.x + 0.3, c.y + 0.78, 0.12, 0, Math.PI * 2);
        ctx.arc(c.x + 0.7, c.y + 0.78, 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      // Les bandes : des silhouettes grises, lance au poing, en groupe (en bataille, une par une).
      const groupesEnBataille = magasin.groupesEnBataille;
      ctx.imageSmoothingEnabled = cam.echelle < SEUIL_PIXELS;
      for (const b of etat.villages.bandes) {
        if (!visible(b.x, b.y) || groupesEnBataille.has(b.id)) continue;
        for (let i = 0; i < Math.min(4, b.taille); i++) {
          sprites.personnage(ctx, b.x + (i % 2) * 0.6 - 0.3, b.y + Math.floor(i / 2) * 0.5, {
            couleur: "#4a4a4a",
            contour: "#222222",
            teint: "#b8a898",
            cheveux: "#2a2a2a",
            sexe: "M",
            echelle: 0.9,
            endormi: false,
            marche: b.etat === "approche" || b.etat === "parti",
            phase: (maintenant / 350 + i * 0.25) % 1,
            enceinte: false,
            selection: false,
            survol: false,
            couches: {
              teint: "hâlé",
              cheveux: "noirs",
              sexe: "M",
              coiffure: i,
              couleur: "#5a5a60",
              outil: "lance",
              malade: false,
              banni: false,
            },
          });
        }
      }
      ctx.imageSmoothingEnabled = true;
      // Lieux interdits : une zone hachurée qu'on évite.
      for (const l of etat.societe.lieuxInterdits) {
        if (!visible(l.x, l.y)) continue;
        this.dessinerLieuInterdit(l.x, l.y, l.rayon);
      }
      // La veillée : un cercle de lumière autour du feu, une heure durant.
      const v = etat.societe.veillee;
      if (v !== null && etat.tick - v.tick < 6) {
        ctx.strokeStyle = `rgba(255, 220, 140, ${0.35 + 0.25 * Math.sin(maintenant / 300)})`;
        ctx.lineWidth = 0.12;
        ctx.setLineDash([0.3, 0.2]);
        ctx.beginPath();
        ctx.arc(v.x + 0.5, v.y + 0.5, 2.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Bâtiments, du haut vers le bas pour les recouvrements ; un fanion à la couleur du
      // village sur les maisons et les entrepôts quand il y a plusieurs villages (M34).
      const villageDeFamille = new Map<string, string>();
      if (etat.villages.villages.length > 1)
        for (const v of etat.villages.villages)
          for (const f of v.familles) villageDeFamille.set(f, v.id);
      const batiments = [...etat.batiments].sort((a, b) => a.y - b.y);
      for (const b of batiments) {
        if (!visible(b.x, b.y)) continue;
        this.dessinerBatiment(
          b,
          nuit,
          maintenant,
          b.id === magasin.selectionBatiment || b.id === survolBatiment,
        );
        const village = villageDeFamille.get(b.famille);
        if (
          village !== undefined &&
          b.etat === "termine" &&
          (b.type === "maison" || b.type === "entrepot" || b.type === "abri") &&
          cam.echelle >= 8
        )
          fanion(ctx, b.x + 0.86, b.y + 0.08, couleurVillage(village), 0.32);
      }
      // La bannière de chaque village, plantée à son centre.
      if (etat.villages.villages.length > 1 && cam.echelle >= 4)
        for (const v of etat.villages.villages) {
          if (!visible(v.x, v.y)) continue;
          fanion(ctx, v.x + 0.5, v.y + 0.2, couleurVillage(v.id), 0.7, emblemeVillage(v.id));
        }

      // Personnages, triés par ordre vertical (ceux du bas devant).
      const positions = etat.personnages
        .filter((p) => p.vivant)
        .map((p) => ({
          p,
          pos: magasin.positionAffichee(p.id, maintenant) ?? { x: p.x, y: p.y, enMouvement: false },
        }))
        .sort((a, b) => a.pos.y - b.pos.y);
      // La bataille (M32) : le champ, les anneaux de camp, les élans des coups.
      const parId = new Map<string, { x: number; y: number }>(
        positions.map(({ p, pos }) => [p.id, pos] as const),
      );
      const membres = magasin.membresEnBataille.map((m) => ({
        m,
        pos: magasin.positionAffichee(m.id, maintenant) ?? { x: m.x, y: m.y, enMouvement: false },
      }));
      for (const { m, pos } of membres) parId.set(m.id, pos);
      const combattants = magasin.combattants;
      const elans = new Map<string, { dx: number; dy: number }>();
      const impacts: { x: number; y: number; t: number; degats: number; mortelle: boolean }[] = [];
      for (const c of magasin.coups) {
        if (c.debut > maintenant || c.fin < maintenant) continue;
        const de = parId.get(c.de);
        const vers = parId.get(c.vers);
        if (de === undefined || vers === undefined) continue;
        const t = (maintenant - c.debut) / (c.fin - c.debut);
        const dx = vers.x - de.x;
        const dy = vers.y - de.y;
        const d = Math.hypot(dx, dy) || 1;
        // L'élan : un bond vers l'adversaire sur la première moitié, puis le retour.
        const a = Math.sin(Math.min(1, t / 0.6) * Math.PI) * 0.38;
        elans.set(c.de, { dx: (dx / d) * a, dy: (dy / d) * a });
        if (t >= 0.3)
          impacts.push({
            x: vers.x,
            y: vers.y,
            t: (t - 0.3) / 0.7,
            degats: c.degats,
            mortelle: c.mortelle,
          });
      }
      for (const b of etat.villages.batailles) {
        if (b.phase !== "combat" || !visible(b.x, b.y)) continue;
        ctx.strokeStyle = `rgba(255, 96, 96, ${String(0.45 + 0.2 * Math.sin(maintenant / 250))})`;
        ctx.lineWidth = 0.14;
        ctx.setLineDash([0.8, 0.5]);
        ctx.lineDashOffset = -(maintenant / 120) % 1.3;
        ctx.beginPath();
        ctx.arc(b.x + 0.5, b.y + 0.5, b.rayon + 0.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (combattants.size > 0) {
        ctx.lineWidth = 0.12;
        for (const { p, pos } of positions) {
          const camp = combattants.get(p.id);
          if (camp === undefined || !visible(pos.x, pos.y)) continue;
          ctx.strokeStyle =
            camp === "attaquant" ? "rgba(255, 96, 96, 0.9)" : "rgba(111, 176, 255, 0.9)";
          ctx.beginPath();
          ctx.ellipse(pos.x + 0.5, pos.y + 0.9, 0.5, 0.22, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // Calques familles / foi : un anneau au sol sous chaque personne, lisible même de loin.
      if (magasin.calque === "familles" || magasin.calque === "foi") {
        ctx.lineWidth = 0.18;
        for (const { p, pos } of positions) {
          if (!visible(pos.x, pos.y)) continue;
          ctx.strokeStyle =
            magasin.calque === "familles" ? couleurFamille(p.nomFamille) : couleurFoi(p.foi);
          ctx.fillStyle = ctx.strokeStyle;
          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.ellipse(pos.x + 0.5, pos.y + 0.85, 0.7, 0.35, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.stroke();
        }
        if (magasin.calque === "familles")
          for (const b of etat.batiments) {
            if (!visible(b.x, b.y)) continue;
            ctx.strokeStyle = couleurFamille(b.famille);
            ctx.strokeRect(b.x + 0.08, b.y + 0.08, 0.84, 0.84);
          }
      }
      // En pixels nets dès que la carte est assez proche pour les voir ; lissés de loin.
      ctx.imageSmoothingEnabled = cam.echelle < SEUIL_PIXELS;
      for (const { p, pos } of positions) {
        if (!visible(pos.x, pos.y)) continue;
        const couleur = couleurFamille(p.nomFamille);
        const elan = elans.get(p.id);
        sprites.personnage(ctx, pos.x + (elan?.dx ?? 0), pos.y + (elan?.dy ?? 0), {
          couleur,
          contour: couleurMoral(p.besoins.moral),
          teint: p.malade ? "#cfd3cf" : (sprites.TEINTS[p.teint] ?? "#f3d3b3"),
          cheveux: sprites.CHEVEUX[p.cheveux] ?? "#4a2e1a",
          sexe: p.sexe,
          echelle: p.stade === "enfant" ? 0.6 : p.stade === "adolescent" ? 0.8 : 1,
          endormi: p.endormi,
          marche: pos.enMouvement,
          phase: (maintenant / 400) % 1,
          enceinte: p.enceinte,
          blesse: p.blesse,
          alerte: p.alerte,
          notable: p.notable,
          banni: p.banni,
          selection: p.id === magasin.selection,
          survol: p.id === survol,
          couches: {
            teint: p.teint,
            cheveux: p.cheveux,
            sexe: p.sexe,
            coiffure: coiffureDe(p.id),
            couleur,
            outil: p.outil,
            outilCouleur: p.outilCouleur,
            malade: p.malade,
            banni: p.banni,
          },
        });
      }
      // Les combattants virtuels : pillards en gris, lance au poing ; loups un par un.
      for (const { m, pos } of membres) {
        if (!visible(pos.x, pos.y)) continue;
        const elan = elans.get(m.id);
        const x = pos.x + (elan?.dx ?? 0);
        const y = pos.y + (elan?.dy ?? 0);
        ctx.strokeStyle =
          m.camp === "attaquant" ? "rgba(255, 96, 96, 0.9)" : "rgba(111, 176, 255, 0.9)";
        ctx.lineWidth = 0.12;
        ctx.beginPath();
        ctx.ellipse(pos.x + 0.5, pos.y + 0.9, 0.5, 0.22, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (m.genre === "meute") {
          sprites.troupeau(ctx, x, y, {
            espece: "loup",
            taille: 1,
            predateur: true,
            yeux: nuit,
            echelle: 1,
            marche: pos.enMouvement,
            phase: (maintenant / 300 + m.x) % 1,
          });
        } else {
          const n = Number.parseInt(m.id.split(":").at(-1) ?? "0", 10) || 0;
          sprites.personnage(ctx, x, y, {
            couleur: "#4a4a4a",
            contour: "#222222",
            teint: "#b8a898",
            cheveux: "#2a2a2a",
            sexe: "M",
            echelle: 0.9,
            endormi: false,
            marche: pos.enMouvement,
            phase: (maintenant / 350 + n * 0.25) % 1,
            enceinte: false,
            selection: false,
            survol: false,
            couches: {
              teint: "hâlé",
              cheveux: "noirs",
              sexe: "M",
              coiffure: n,
              couleur: "#5a5a60",
              outil: "lance",
              malade: false,
              banni: false,
            },
          });
        }
      }
      ctx.imageSmoothingEnabled = true;
      // Les impacts des coups : un éclat blanc qui s'ouvre, rouge s'il a porté.
      for (const i of impacts) {
        if (!visible(i.x, i.y)) continue;
        const r = 0.15 + i.t * 0.35;
        ctx.strokeStyle =
          i.degats > 0
            ? `rgba(255, 90, 60, ${String(1 - i.t)})`
            : `rgba(255, 255, 255, ${String(0.7 * (1 - i.t))})`;
        ctx.lineWidth = 0.08;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2 + i.t;
          ctx.moveTo(i.x + 0.5 + Math.cos(ang) * r * 0.4, i.y + 0.45 + Math.sin(ang) * r * 0.4);
          ctx.lineTo(i.x + 0.5 + Math.cos(ang) * r, i.y + 0.45 + Math.sin(ang) * r);
        }
        ctx.stroke();
      }

      // Les créatures du ciel (M25) : un halo au sol, un grand glyphe, leur nom.
      for (const c of etat.creatures) {
        if (!visible(c.x, c.y)) continue;
        const pos = magasin.positionAffichee(`creature:${c.id}`, maintenant) ?? {
          x: c.x,
          y: c.y,
          enMouvement: false,
        };
        const halo = c.genre === "gardien" ? "255, 224, 130" : "180, 90, 255";
        ctx.fillStyle = `rgba(${halo}, ${String(0.22 + 0.1 * Math.sin(maintenant / 300))})`;
        ctx.beginPath();
        ctx.ellipse(pos.x + 0.5, pos.y + 0.9, 1.4, 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "1.6px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(c.emoji, pos.x + 0.5, pos.y - 0.2 + Math.sin(maintenant / 500) * 0.1);
      }
      // La faune : troupeaux et meutes sur les tuiles connues.
      for (const tr of etat.troupeaux) {
        if (groupesEnBataille.has(tr.id)) continue;
        const pos = magasin.positionAffichee(`troupeau:${tr.id}`, maintenant) ?? {
          x: tr.x,
          y: tr.y,
          enMouvement: false,
        };
        if (!visible(pos.x, pos.y) || magasin.biomeEn(Math.round(pos.x), Math.round(pos.y)) < 0)
          continue;
        sprites.troupeau(ctx, pos.x, pos.y, {
          espece: tr.espece,
          taille: tr.taille,
          predateur: tr.predateur,
          yeux: tr.menace && nuit,
          echelle: tr.domestique ? 0.85 : 1,
          marche: pos.enMouvement || tr.etat === "fuite",
          phase: (maintenant / 300) % 1,
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

    // Mode Dieu : effets des miracles, puis halo de visée (espace écran).
    // « Aller voir » : un repère qui pulse là où l'on vient d'arriver.
    const repere = magasin.repere;
    if (repere !== null) {
      if (repere.fin <= maintenant) magasin.repere = null;
      else {
        const c = versEcran(cam, repere.x + 0.5, repere.y + 0.5);
        const t = ((maintenant / 700) % 1) * 1;
        ctx.save();
        ctx.strokeStyle = `rgba(255, 255, 255, ${String(1 - t)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 8 + t * Math.max(24, cam.echelle * 3), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (etat !== null) {
      for (const f of magasin.effets) this.dessinerEffet(cam, f, maintenant);
      if (magasin.modeDieu && magasin.reticule !== null) {
        if (magasin.pouvoirArme !== null) {
          const fiche = FICHES_POUVOIR[magasin.pouvoirArme];
          this.dessinerHalo(
            cam,
            {
              emoji: fiche.emoji,
              rayon: fiche.rayon,
              couleur: fiche.bienfait ? "#ffd479" : "#ff9c5f",
            },
            magasin.reticule,
            maintenant,
            magasin.biomeEn(magasin.reticule.x, magasin.reticule.y) >= 0,
          );
        } else if (magasin.outilArme !== null) {
          const outil = magasin.outilArme;
          this.dessinerHalo(
            cam,
            outil === "peupler"
              ? { emoji: "👥", rayon: 4, couleur: "#9ad8ff" }
              : outil === "gardien" || outil === "fleau"
                ? {
                    emoji: outil === "gardien" ? "🛡️" : "💀",
                    rayon: outil === "gardien" ? 12 : 6,
                    couleur: outil === "gardien" ? "#ffe082" : "#d9a6ff",
                  }
                : {
                    emoji: FICHES_PINCEAU[outil].emoji,
                    rayon: magasin.rayonPinceau,
                    couleur: "#c8f0a0",
                  },
            magasin.reticule,
            maintenant,
            true,
          );
        }
      }
    }

    // Les créatures : leur nom et les jours qui restent.
    if (etat !== null && cam.echelle >= 4) {
      ctx.font = `bold ${String(Math.max(11, Math.min(14, cam.echelle * 1.5)))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      for (const c of etat.creatures) {
        if (!visible(c.x, c.y)) continue;
        const pos = magasin.positionAffichee(`creature:${c.id}`, maintenant) ?? { x: c.x, y: c.y };
        const e = versEcran(cam, pos.x + 0.5, pos.y - 1.2);
        const texte = `${c.nom} · ${String(c.joursRestants)} j`;
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillText(texte, e.x + 1, e.y + 1);
        ctx.fillStyle = c.genre === "gardien" ? "#ffe082" : "#d9a6ff";
        ctx.fillText(texte, e.x, e.y);
      }
    }
    // Les villages : leur nom au-dessus de leur centre.
    if (
      etat !== null &&
      (etat.villages.villages.length > 1 ||
        magasin.calque === "villages" ||
        magasin.calque === "vivres") &&
      cam.echelle >= 2
    ) {
      ctx.font = `bold ${String(Math.max(11, Math.min(16, cam.echelle * 2)))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      for (const v of etat.villages.villages) {
        if (!visible(v.x, v.y)) continue;
        const e = versEcran(cam, v.x + 0.5, v.y - 1);
        const texte =
          magasin.calque === "vivres"
            ? `${v.nom} · ${String(v.nourriture)} vivres`
            : magasin.calque === "villages"
              ? `${v.nom} · ${String(v.habitants)}`
              : v.nom;
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillText(texte, e.x + 1, e.y + 1);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(texte, e.x, e.y);
        // L'emblème du village (M34), à sa couleur, devant le nom.
        const largeur = ctx.measureText(texte).width;
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillText(emblemeVillage(v.id), e.x - largeur / 2 - 11, e.y + 1);
        ctx.fillStyle = couleurVillage(v.id);
        ctx.fillText(emblemeVillage(v.id), e.x - largeur / 2 - 12, e.y);
      }
    }

    // Les lieux nommés : leur nom en italique sur la carte.
    if (etat !== null && cam.echelle >= 4) {
      ctx.font = `italic ${String(Math.max(10, Math.min(14, cam.echelle * 1.6)))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      for (const l of etat.chronique.lieuxNommes) {
        if (!visible(l.x, l.y) || magasin.biomeEn(l.x, l.y) < 0) continue;
        const e = versEcran(cam, l.x + 0.5, l.y);
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillText(l.nom, e.x + 1, e.y - 1);
        ctx.fillStyle = "#ffe9a8";
        ctx.fillText(l.nom, e.x, e.y - 2);
      }
    }

    // Une question de conseil ouverte : un « ? » au-dessus de la tête.
    if (etat !== null && cam.echelle >= 7) {
      const questionnes = magasin.questionnes;
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const id of questionnes) {
        const p = etat.personnages.find((x) => x.id === id);
        if (p?.vivant !== true) continue;
        const pos = magasin.positionAffichee(p.id, maintenant) ?? { x: p.x, y: p.y };
        const e = versEcran(cam, pos.x + 0.5, pos.y - 0.35);
        const y = e.y + Math.sin(maintenant / 250) * 2;
        ctx.fillStyle = "#ffd479";
        ctx.beginPath();
        ctx.arc(e.x, y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#10141a";
        ctx.fillText("?", e.x, y + 0.5);
      }
    }

    // Barres de vie des combattants (M32), au-dessus de la tête, en pixels.
    if (etat !== null && cam.echelle >= 5) {
      const combattants = magasin.combattants;
      const villageDeFamilleGlobal = new Map<string, string>();
      for (const v of etat.villages.villages)
        for (const f of v.familles) villageDeFamilleGlobal.set(f, v.id);
      for (const p of etat.personnages) {
        const camp = combattants.get(p.id);
        if (camp === undefined || !p.vivant) continue;
        const pos = magasin.positionAffichee(p.id, maintenant) ?? { x: p.x, y: p.y };
        if (!visible(pos.x, pos.y)) continue;
        const e = versEcran(cam, pos.x + 0.5, pos.y - 0.05);
        const w = 26;
        const x = Math.round(e.x - w / 2);
        const y = Math.round(e.y - (cam.echelle >= 12 ? 16 : 4));
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(x - 1, y - 1, w + 2, 6);
        ctx.fillStyle = "#3a1414";
        ctx.fillRect(x, y, w, 4);
        const part = Math.max(0, Math.min(1, p.sante / 100));
        ctx.fillStyle = part > 0.5 ? "#6fd36f" : part > 0.3 ? "#ffcf4a" : "#ff5a5a";
        ctx.fillRect(x, y, Math.round(w * part), 4);
        ctx.fillStyle = camp === "attaquant" ? "#ff6060" : "#6fb0ff";
        ctx.fillRect(x - 4, y, 2, 4);
        const village = villageDeFamilleGlobal.get(p.nomFamille);
        if (village !== undefined) {
          ctx.fillStyle = couleurVillage(village);
          ctx.fillRect(x + w + 2, y, 2, 4);
        }
      }
      for (const m of magasin.membresEnBataille) {
        const pos = magasin.positionAffichee(m.id, maintenant) ?? { x: m.x, y: m.y };
        if (!visible(pos.x, pos.y)) continue;
        const e = versEcran(cam, pos.x + 0.5, pos.y - 0.05);
        const w = 26;
        const x = Math.round(e.x - w / 2);
        const y = Math.round(e.y - 4);
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(x - 1, y - 1, w + 2, 6);
        ctx.fillStyle = "#3a1414";
        ctx.fillRect(x, y, w, 4);
        const part = Math.max(0, Math.min(1, m.sante / Math.max(1, m.santeMax)));
        ctx.fillStyle = part > 0.5 ? "#6fd36f" : part > 0.3 ? "#ffcf4a" : "#ff5a5a";
        ctx.fillRect(x, y, Math.round(w * part), 4);
        ctx.fillStyle = m.camp === "attaquant" ? "#ff6060" : "#6fb0ff";
        ctx.fillRect(x - 4, y, 2, 4);
      }
      // Les dégâts qui montent et s'effacent.
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      for (const c of magasin.coups) {
        if (c.debut > maintenant || c.fin < maintenant || c.degats <= 0) continue;
        const t = (maintenant - c.debut) / (c.fin - c.debut);
        if (t < 0.3) continue;
        const pos = magasin.positionAffichee(c.vers, maintenant);
        if (pos === null) continue;
        const e = versEcran(cam, pos.x + 0.5, pos.y - 0.2);
        const y = e.y - 18 - ((t - 0.3) / 0.7) * 22;
        const alpha = 1 - (t - 0.3) / 0.7;
        const texte = c.mortelle ? `☠ −${String(c.degats)}` : `−${String(c.degats)}`;
        ctx.fillStyle = `rgba(0,0,0,${String(0.8 * alpha)})`;
        ctx.fillText(texte, e.x + 1, y + 1);
        ctx.fillStyle = `rgba(255, 90, 60, ${String(alpha)})`;
        ctx.fillText(texte, e.x, y);
      }
    }

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
        // Crépuscule et aube : une lueur chaude avant que le bleu de la nuit ne tombe.
        const crepuscule = alpha < 0.45 ? (0.45 - alpha) / 0.45 : 0;
        if (crepuscule > 0) {
          ctx.fillStyle = `rgba(255, 140, 60, ${String(0.12 * crepuscule * (alpha / 0.45 + 0.3))})`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.fillStyle = `rgba(8, 14, 46, ${String(alpha * 1.15)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (const b of etat.batiments) {
          if (b.type !== "feu_de_camp" || !b.allume || b.etat !== "termine") continue;
          const e = versEcran(cam, b.x + 0.5, b.y + 0.6);
          const r = cam.echelle * (3 + Math.sin(maintenant / 150) * 0.15);
          const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
          grad.addColorStop(0, `rgba(255,200,110,${String(alpha * 1.1)})`);
          grad.addColorStop(0.5, `rgba(255,170,70,${String(alpha * 0.45)})`);
          grad.addColorStop(1, "rgba(255,170,70,0)");
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
      // Six bulles à la fois au plus (trois pendant une bataille) : au-delà, la carte se
      // couvre de texte ; et jamais sur un combattant (M36).
      const combattants = magasin.combattants;
      const plafond = magasin.batailleActive === null ? 6 : 3;
      for (const bulle of magasin.bulles) {
        if (affichees.size >= plafond) break;
        if (bulle.debut > maintenant || bulle.fin < maintenant || affichees.has(bulle.id)) continue;
        if (combattants.has(bulle.id)) continue;
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

  /** Halo de visée d'un pouvoir armé : cercle tireté tournant, rouge sur l'inconnu. */
  private dessinerHalo(
    cam: Camera,
    fiche: { readonly emoji: string; readonly rayon: number; readonly couleur: string },
    reticule: { x: number; y: number },
    maintenant: number,
    valide: boolean,
  ): void {
    const { ctx } = this;
    const centre = versEcran(cam, reticule.x + 0.5, reticule.y + 0.5);
    const r = Math.max(0.6, fiche.rayon + 0.5) * cam.echelle;
    ctx.save();
    ctx.strokeStyle = valide ? fiche.couleur : "#ff5f5f";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -(maintenant / 40) % 12;
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.globalAlpha = 0.12;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = `${String(Math.max(14, Math.min(28, cam.echelle)))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fiche.emoji, centre.x, centre.y - r - 14);
    ctx.restore();
  }

  /** Effet vectoriel d'un miracle, une seconde environ : pluie, éclair, anneau, pousses… */
  /** Zone hachurée en espace monde : un tabou, un lieu où l'on ne va plus. */
  private dessinerLieuInterdit(x: number, y: number, rayon: number): void {
    const { ctx } = this;
    const x0 = x - rayon;
    const y0 = y - rayon;
    const cote = rayon * 2 + 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, cote, cote);
    ctx.clip();
    ctx.fillStyle = "rgba(120, 20, 40, 0.18)";
    ctx.fillRect(x0, y0, cote, cote);
    ctx.strokeStyle = "rgba(255, 90, 120, 0.55)";
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    for (let d = -cote; d < cote; d += 0.6) {
      ctx.moveTo(x0 + d, y0);
      ctx.lineTo(x0 + d + cote, y0 + cote);
    }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = "rgba(255, 90, 120, 0.8)";
    ctx.lineWidth = 0.08;
    ctx.setLineDash([0.25, 0.15]);
    ctx.strokeRect(x0, y0, cote, cote);
    ctx.setLineDash([]);
  }

  private dessinerEffet(
    cam: Camera,
    f: { pouvoir: string; x: number; y: number; rayon: number; debut: number; fin: number },
    maintenant: number,
  ): void {
    const { ctx, canvas } = this;
    const t = Math.max(0, Math.min(1, (maintenant - f.debut) / Math.max(1, f.fin - f.debut)));
    const c = versEcran(cam, f.x + 0.5, f.y + 0.5);
    const r = Math.max(1, f.rayon + 0.5) * cam.echelle;
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ctx.save();
    ctx.lineCap = "round";
    switch (f.pouvoir) {
      case "pluie": {
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.strokeStyle = "rgba(160, 200, 255, 0.8)";
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 40; i++) {
          const ang = i * 2.399;
          const rad = r * Math.sqrt(((i * 7919) % 1000) / 1000);
          const x = c.x + Math.cos(ang) * rad;
          const y = c.y - r + ((t * 3 + i / 40) % 1) * 2 * r;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - 2, y + 8);
          ctx.stroke();
        }
        break;
      }
      case "eclaircie":
      case "regard":
      case "guerison": {
        const couleur =
          f.pouvoir === "eclaircie"
            ? "255, 236, 150"
            : f.pouvoir === "regard"
              ? "140, 200, 255"
              : "255, 255, 255";
        ctx.strokeStyle = `rgba(${couleur}, ${String(1 - t)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(4, r * t), 0, Math.PI * 2);
        ctx.stroke();
        if (f.pouvoir === "guerison") {
          ctx.fillStyle = `rgba(255,255,255,${String(1 - t)})`;
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2 + t * 2;
            ctx.beginPath();
            ctx.arc(
              c.x + Math.cos(ang) * 14 * (0.5 + t),
              c.y + Math.sin(ang) * 14 * (0.5 + t) - t * 20,
              2,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
        }
        break;
      }
      case "seve": {
        ctx.fillStyle = `rgba(120, 220, 120, ${String(1 - t * 0.7)})`;
        for (let i = 0; i < 24; i++) {
          const ang = i * 2.399;
          const rad = r * Math.sqrt(((i * 104729) % 1000) / 1000);
          const h = Math.min(1, t * 2 - i / 48) * 10;
          if (h <= 0) continue;
          const x = c.x + Math.cos(ang) * rad;
          const y = c.y + Math.sin(ang) * rad;
          ctx.beginPath();
          ctx.moveTo(x - 3, y);
          ctx.lineTo(x, y - h);
          ctx.lineTo(x + 3, y);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case "souffle": {
        ctx.strokeStyle = `rgba(180, 240, 180, ${String(1 - t)})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const y = c.y - t * 30 - i * 8;
          ctx.beginPath();
          ctx.moveTo(c.x - 12, y);
          ctx.quadraticCurveTo(c.x, y - 6, c.x + 12, y);
          ctx.stroke();
        }
        break;
      }
      case "braise": {
        const p = 0.5 + Math.sin(t * Math.PI * 4) * 0.5;
        const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * 3);
        grad.addColorStop(0, `rgba(255, 170, 60, ${String(0.7 * (1 - t) * p)})`);
        grad.addColorStop(1, "rgba(255, 170, 60, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(c.x - r * 3, c.y - r * 3, r * 6, r * 6);
        break;
      }
      case "foudre": {
        if (t < 0.5) {
          ctx.strokeStyle = `rgba(255, 255, 220, ${String(1 - t * 2)})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(c.x + 30, 0);
          ctx.lineTo(c.x - 8, c.y * 0.4);
          ctx.lineTo(c.x + 10, c.y * 0.55);
          ctx.lineTo(c.x - 4, c.y);
          ctx.stroke();
          if (!reduit && t < 0.15) {
            ctx.fillStyle = `rgba(255, 255, 255, ${String(0.5 - t * 3)})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
        }
        ctx.strokeStyle = `rgba(255, 200, 120, ${String(1 - t)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r * (0.5 + t), 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "guerre": {
        ctx.strokeStyle = `rgba(255, 96, 96, ${String(1 - t)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(6, r * 2 * t), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(255, 220, 200, ${String(1 - t)})`;
        ctx.font = "20px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⚔️", c.x, c.y - 16 - t * 20);
        break;
      }
      case "apaiser": {
        ctx.strokeStyle = `rgba(255, 255, 255, ${String(0.8 * (1 - t))})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(6, r * (0.4 + t)), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(255, 255, 255, ${String(1 - t)})`;
        ctx.font = "18px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🕊️", c.x + 8, c.y - 14 - t * 24);
        break;
      }
      case "songe": {
        ctx.fillStyle = `rgba(200, 180, 255, ${String(1 - t)})`;
        ctx.font = "16px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("☾", c.x + 10, c.y - 18 - t * 24);
        ctx.font = "11px system-ui, sans-serif";
        ctx.fillText("z z", c.x - 8, c.y - 10 - t * 18);
        break;
      }
      default:
        break;
    }
    ctx.restore();
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
    // Les bâtiments de l'atlas Medieval RTS (M31), avec leur ombre ; le vectoriel reste en
    // secours tant que la planche n'est pas décodée.
    const rts = (nom: Structure, largeur: number): boolean => {
      sprites.ombreSol(ctx, b.x, b.y);
      return structure(ctx, nom, b.x, b.y, largeur);
    };
    switch (b.type) {
      case "abri":
        if (!rts("tente", 0.9)) sprites.abri(ctx, b.x, b.y);
        break;
      case "maison": {
        const haute = sprites.bruit(b.x, b.y, 31) < 0.5;
        if (!rts(haute ? "maison_haute" : "maison_basse", 1)) sprites.maison(ctx, b.x, b.y, nuit);
        else if (nuit) {
          // La nuit, une lueur chaude aux fenêtres du sprite (M36).
          ctx.fillStyle = `rgba(255, 210, 120, ${String(0.75 + 0.15 * Math.sin(maintenant / 400 + b.x))})`;
          const yF = b.y + (haute ? 0.62 : 0.66);
          ctx.fillRect(b.x + 0.2, yF, 0.14, 0.13);
          ctx.fillRect(b.x + 0.66, yF, 0.14, 0.13);
        }
        break;
      }
      case "entrepot":
        if (!rts("grange", 1.15)) sprites.entrepot(ctx, b.x, b.y);
        break;
      case "feu_de_camp":
        sprites.feu(ctx, b.x, b.y, b.allume, maintenant);
        break;
      case "four":
        if (!rts("four", 1.05)) sprites.four(ctx, b.x, b.y);
        break;
      case "fumoir":
        if (rts("fumoir", 1.05)) sprites.fumee(ctx, b.x + 0.78, b.y + 0.12, maintenant);
        else sprites.fumoir(ctx, b.x, b.y, maintenant);
        break;
      case "puits":
        if (!rts("puits", 0.55)) sprites.puits(ctx, b.x, b.y);
        break;
      case "palissade":
        sprites.palissade(ctx, b.x, b.y);
        break;
      case "tombe":
        sprites.tombe(ctx, b.x, b.y);
        break;
      case "stele":
        sprites.stele(ctx, b.x, b.y);
        break;
      case "autel":
        if (!rts("sanctuaire", 0.95)) sprites.autel(ctx, b.x, b.y, maintenant);
        break;
      case "enclos":
        sprites.enclos(ctx, b.x, b.y);
        break;
      case "champ":
        sprites.champ(ctx, b.x, b.y, b.culture?.seme ?? false, b.culture?.stade ?? 0);
        break;
      case "port":
        sprites.port(ctx, b.x, b.y);
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

/** Un fanion planté en (x, y) : une hampe et un triangle à la couleur donnée, un emblème si demandé. */
function fanion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  couleur: string,
  hauteur: number,
  embleme?: string,
): void {
  ctx.strokeStyle = "#3a2a1a";
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + hauteur);
  ctx.stroke();
  ctx.fillStyle = couleur;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + hauteur * 0.7, y + hauteur * 0.2);
  ctx.lineTo(x, y + hauteur * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 0.025;
  ctx.stroke();
  if (embleme !== undefined) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `${String(hauteur * 0.26)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(embleme, x + hauteur * 0.26, y + hauteur * 0.21);
  }
}

function cleDe(m: MorceauVue): number {
  return (m.cx + 32_768) * 65_536 + (m.cy + 32_768);
}

/** En deçà de cette échelle (px par tuile), les sprites de 16 px se lissent ; au-delà, pixels nets. */
const SEUIL_PIXELS = 14;

/** Une coiffure 0..2 stable par identifiant, pour que les têtes ne se ressemblent pas toutes. */
function coiffureDe(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 3;
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
