/** Magasin d'état côté viewer : ce que le serveur a envoyé, plus l'état d'interface. */
import type {
  EvenementEtat,
  MessageEtat,
  MessageFiche,
  MessageInit,
  MessageServeur,
} from "@sdv/protocole";
import { FICHES_POUVOIR, decouperTranscription } from "@sdv/protocole";
import type { Pouvoir } from "@sdv/protocole";

export interface Bulle {
  readonly id: string;
  readonly texte: string;
  readonly debut: number;
  readonly fin: number;
}

/** Effet visuel d'un miracle sur la carte (une seconde environ). */
export interface Effet {
  readonly pouvoir: string;
  readonly x: number;
  readonly y: number;
  readonly rayon: number;
  readonly debut: number;
  readonly fin: number;
}

export interface Conversation {
  readonly tick: number;
  readonly acteur: string;
  readonly avec: string;
  readonly sujet: string;
  readonly repliques: readonly { locuteur: string; texte: string }[];
}

export const MAX_EVENEMENTS = 4000;
export const MAX_CONVERSATIONS = 150;

/** Un morceau du monde tel que le viewer le connaît : biome par tuile, −1 = jamais vu. */
export interface MorceauVue {
  readonly cx: number;
  readonly cy: number;
  readonly biomes: Int8Array;
  /** Incrémentée à chaque tuile nouvelle, pour redessiner le fond du morceau. */
  version: number;
  connues: number;
}

export interface Zone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function cleMorceau(cx: number, cy: number): number {
  return (cx + 32_768) * 65_536 + (cy + 32_768);
}

export class Magasin {
  init: MessageInit | null = null;
  etat: MessageEtat | null = null;
  fiche: MessageFiche | null = null;
  readonly gisements = new Map<
    string,
    { x: number; y: number; type: string; quantite: number; outil: string }
  >();
  /** Interpolation des déplacements : de (ax, ay) à (bx, by) entre t0 et t1. */
  private readonly trajets = new Map<
    string,
    { ax: number; ay: number; bx: number; by: number; t0: number; t1: number }
  >();
  private dernierEtatA = 0;
  selectionBatiment: string | null = null;
  readonly evenements: EvenementEtat[] = [];
  readonly conversations: Conversation[] = [];
  readonly noms = new Map<string, string>();
  readonly typesVus = new Set<string>();
  bulles: Bulle[] = [];
  selection: string | null = null;
  suivre = false;
  connecte = false;
  /** Morceaux du monde dont au moins une tuile a été vue. */
  readonly morceaux = new Map<number, MorceauVue>();
  /** Rectangle englobant des tuiles connues (bornes incluses). */
  private zone: Zone | null = null;
  /** Incrémenté à chaque nouvelle découverte, pour reconstruire le brouillard. */
  versionDecouvertes = 0;
  /** Brouillard d'exploration : l'inconnu reste noir, le déjà-vu est voilé. */
  brouillard = true;
  /** Compteur de messages `etat` reçus (pour rafraîchir les panneaux à cadence réduite). */
  version = 0;
  /** Mode Dieu : actif, pouvoir armé, réticule (tactile) et effets en cours. */
  modeDieu = false;
  pouvoirArme: Pouvoir | null = null;
  reticule: { x: number; y: number } | null = null;
  effets: Effet[] = [];

  nom(id: string): string {
    return this.noms.get(id) ?? id;
  }

  /** Oublie tout (nouveau monde). */
  reinitialiser(): void {
    this.init = null;
    this.etat = null;
    this.fiche = null;
    this.gisements.clear();
    this.trajets.clear();
    this.evenements.length = 0;
    this.conversations.length = 0;
    this.noms.clear();
    this.typesVus.clear();
    this.bulles = [];
    this.selection = null;
    this.selectionBatiment = null;
    this.suivre = false;
    this.effets = [];
    this.reticule = null;
    this.morceaux.clear();
    this.zone = null;
    this.versionDecouvertes += 1;
    this.version += 1;
  }

  get tailleMorceau(): number {
    return this.init?.tailleMorceau ?? 32;
  }

  /** Rectangle des tuiles découvertes (inclusif), ou null si rien n'est connu. */
  zoneDecouverte(): Zone | null {
    return this.zone === null ? null : { ...this.zone };
  }

  /** Code de biome d'une tuile connue, ou −1. */
  biomeEn(x: number, y: number): number {
    const T = this.tailleMorceau;
    const m = this.morceaux.get(cleMorceau(Math.floor(x / T), Math.floor(y / T)));
    if (m === undefined) return -1;
    return m.biomes[(y - m.cy * T) * T + (x - m.cx * T)] ?? -1;
  }

  /** Nombre de tuiles connues. */
  get tuilesConnues(): number {
    let n = 0;
    for (const m of this.morceaux.values()) n += m.connues;
    return n;
  }

  private decouvrir(x: number, y: number, biome: number): void {
    const T = this.tailleMorceau;
    const cx = Math.floor(x / T);
    const cy = Math.floor(y / T);
    const cle = cleMorceau(cx, cy);
    let m = this.morceaux.get(cle);
    if (m === undefined) {
      m = { cx, cy, biomes: new Int8Array(T * T).fill(-1), version: 0, connues: 0 };
      this.morceaux.set(cle, m);
    }
    const i = (y - cy * T) * T + (x - cx * T);
    if (m.biomes[i] === biome) return;
    if (m.biomes[i] === -1) m.connues += 1;
    m.biomes[i] = biome;
    m.version += 1;
    if (this.zone === null) this.zone = { x0: x, y0: y, x1: x, y1: y };
    else {
      if (x < this.zone.x0) this.zone.x0 = x;
      if (x > this.zone.x1) this.zone.x1 = x;
      if (y < this.zone.y0) this.zone.y0 = y;
      if (y > this.zone.y1) this.zone.y1 = y;
    }
  }

  recevoir(message: MessageServeur, maintenant: number): void {
    switch (message.type) {
      case "init":
        this.init = message;
        this.morceaux.clear();
        this.zone = null;
        this.versionDecouvertes += 1;
        this.gisements.clear();
        this.evenements.length = 0;
        this.conversations.length = 0;
        break;
      case "etat": {
        const precedent = this.etat;
        this.etat = message;
        this.version += 1;
        // Durée d'interpolation : l'intervalle réel entre deux états, borné.
        const duree = Math.min(900, Math.max(80, maintenant - this.dernierEtatA));
        this.dernierEtatA = maintenant;
        for (const p of message.personnages) {
          this.noms.set(p.id, `${p.prenom} ${p.nomFamille}`);
          const t = this.trajets.get(p.id);
          if (t === undefined) {
            this.trajets.set(p.id, {
              ax: p.x,
              ay: p.y,
              bx: p.x,
              by: p.y,
              t0: maintenant,
              t1: maintenant,
            });
          } else if (t.bx !== p.x || t.by !== p.y) {
            const courant = this.positionAffichee(p.id, maintenant) ?? { x: t.bx, y: t.by };
            const saut = Math.max(Math.abs(p.x - t.bx), Math.abs(p.y - t.by)) > 6;
            this.trajets.set(p.id, {
              ax: saut ? p.x : courant.x,
              ay: saut ? p.y : courant.y,
              bx: p.x,
              by: p.y,
              t0: maintenant,
              t1: maintenant + (saut ? 0 : duree),
            });
          }
        }
        for (const tr of message.troupeaux) {
          const cle = `troupeau:${tr.id}`;
          const t = this.trajets.get(cle);
          if (t === undefined) {
            this.trajets.set(cle, {
              ax: tr.x,
              ay: tr.y,
              bx: tr.x,
              by: tr.y,
              t0: maintenant,
              t1: maintenant,
            });
          } else if (t.bx !== tr.x || t.by !== tr.y) {
            const courant = this.positionAffichee(cle, maintenant) ?? { x: t.bx, y: t.by };
            const saut = Math.max(Math.abs(tr.x - t.bx), Math.abs(tr.y - t.by)) > 12;
            this.trajets.set(cle, {
              ax: saut ? tr.x : courant.x,
              ay: saut ? tr.y : courant.y,
              bx: tr.x,
              by: tr.y,
              t0: maintenant,
              t1: maintenant + (saut ? 0 : duree),
            });
          }
        }
        if (precedent === null) this.dernierEtatA = maintenant;
        if (message.decouvertes.length > 0) {
          const d = message.decouvertes;
          for (let i = 0; i + 2 < d.length; i += 3)
            this.decouvrir(d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0);
          this.versionDecouvertes += 1;
        }
        for (const [x, y, type, quantite, outil] of message.gisements) {
          const cle = `${x},${y}`;
          if (quantite < 0) this.gisements.delete(cle);
          else this.gisements.set(cle, { x, y, type, quantite, outil });
        }
        for (const e of message.evenements) {
          this.typesVus.add(e.type);
          this.evenements.push(e);
          if (e.type === "dialogue") this.ajouterConversation(e, maintenant);
          if (e.type === "divin" && e.position !== null) this.ajouterEffet(e, maintenant);
        }
        this.effets = this.effets.filter((f) => f.fin > maintenant);
        if (this.evenements.length > MAX_EVENEMENTS)
          this.evenements.splice(0, this.evenements.length - MAX_EVENEMENTS);
        this.bulles = this.bulles.filter((b) => b.fin > maintenant);
        break;
      }
      case "fiche":
        if (message.id === this.selection) this.fiche = message;
        break;
      case "erreur":
        console.warn("serveur :", message.message);
        break;
    }
  }

  private ajouterConversation(e: EvenementEtat, maintenant: number): void {
    const acteur = e.acteur ?? "";
    const avec = String(e.details.avec ?? "");
    const repliques = decouperTranscription(String(e.details.transcription ?? ""));
    this.conversations.push({
      tick: e.tick,
      acteur,
      avec,
      sujet: String(e.details.sujet ?? ""),
      repliques,
    });
    if (this.conversations.length > MAX_CONVERSATIONS) this.conversations.shift();
    // Bulles : les répliques s'enchaînent toutes les 1,2 s, chacune reste 2,5 s ;
    // une seule bulle par personnage, la plus récente remplace l'ancienne.
    const prenomActeur = this.nom(acteur).split(" ")[0] ?? "";
    this.bulles = this.bulles.filter((b) => b.id !== acteur && b.id !== avec);
    repliques.slice(0, 4).forEach((r, i) => {
      const id = r.locuteur === prenomActeur ? acteur : avec;
      const debut = maintenant + i * 1200;
      this.bulles.push({ id, texte: r.texte, debut, fin: debut + 2500 });
    });
  }

  private ajouterEffet(e: EvenementEtat, maintenant: number): void {
    const pouvoir = String(e.details.pouvoir ?? "");
    const fiche = (FICHES_POUVOIR as Readonly<Record<string, { rayon: number }>>)[pouvoir];
    if (fiche === undefined || e.position === null) return;
    // Les événements d'une pré-simulation ou d'un rattrapage n'animent pas la carte.
    if (this.etat !== null && this.etat.tick - e.tick > 24) return;
    this.effets.push({
      pouvoir,
      x: e.position.x,
      y: e.position.y,
      rayon: fiche.rayon,
      debut: maintenant,
      fin: maintenant + (pouvoir === "foudre" ? 900 : 1400),
    });
  }

  /** Personnages ayant une question ouverte à Claude. */
  get questionnes(): ReadonlySet<string> {
    return new Set((this.etat?.questions ?? []).map((q) => q.personnageId));
  }

  selectionner(id: string | null): void {
    this.selection = id;
    if (id !== null) this.selectionBatiment = null;
    if (id === null) {
      this.fiche = null;
      this.suivre = false;
    }
  }

  /** Position affichée d'un personnage (interpolée), ou null s'il est inconnu. */
  positionAffichee(
    id: string,
    maintenant: number,
  ): { x: number; y: number; enMouvement: boolean } | null {
    const t = this.trajets.get(id);
    if (t === undefined) return null;
    if (maintenant >= t.t1) return { x: t.bx, y: t.by, enMouvement: false };
    const f = (maintenant - t.t0) / Math.max(1, t.t1 - t.t0);
    return { x: t.ax + (t.bx - t.ax) * f, y: t.ay + (t.by - t.ay) * f, enMouvement: true };
  }

  batiment(id: string) {
    return this.etat?.batiments.find((b) => b.id === id) ?? null;
  }

  personnage(id: string) {
    return this.etat?.personnages.find((p) => p.id === id) ?? null;
  }
}
