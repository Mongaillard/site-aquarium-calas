/**
 * Cerveau Claude (M5), côté page : quand la page est ouverte sur claude.ai,
 * elle peut demander à Claude, sur le compte de la personne qui la regarde,
 * d'écrire ce que le moteur ne sait pas écrire : la pensée intérieure d'un
 * personnage, l'épitaphe et la morale d'un décès, le récit d'une invention.
 * Le moteur reste déterministe : Claude souffle un texte (et, pour une
 * épitaphe, une leçon du catalogue) ; c'est le moteur qui l'applique.
 * Les appels sont rares : jamais en boucle, un à la fois, espacés.
 *
 * Second mandat (« demander à Claude ») : quand le moteur ouvre une question
 * (un personnage à court d'idées), la page la met en mots, Claude choisit une
 * option du catalogue fermé, et le moteur applique ce choix (commande `conseil`).
 */
import type {
  Commande,
  EvenementEtat,
  MessageFiche,
  PersonnageEtat,
  QuestionConseil,
} from "@sdv/protocole";
import type { Magasin } from "./etat.js";

/** Ce qu'on attend de `claude.use("sample")` : une question, une réponse texte. */
export type Sample = (
  entree: string,
  options?: { readonly modelTier?: "quick" | "default" | "complex" },
) => Promise<{ readonly text: string }>;

export interface OptionsClaude {
  /** Délai minimal entre deux appels, en millisecondes. */
  readonly intervalleMs?: number;
  /** Leçons possibles pour une épitaphe : id → morale. */
  readonly lecons?: Readonly<Record<string, string>>;
  /** Espacement minimal entre deux conseils, en millisecondes. */
  readonly intervalleConseilMs?: number;
}

export type Inspiration = Extract<Commande, { type: "inspiration" }>;
export type Conseil = Extract<Commande, { type: "conseil" }>;

/** Réponse attendue de Claude à une question de conseil. */
export interface ReponseConseil {
  readonly choix: string;
  readonly pensee: string;
  readonly ambition?: { readonly but: string; readonly jours: number };
}

const LECONS_PAR_DEFAUT: Record<string, string> = {
  provisions_hiver: "L'hiver ne nourrit pas : il faut des provisions avant les premières neiges.",
  rentrer_quand_on_gele: "Quand on gèle, on rentre d'abord ; on mange après.",
  enfants_dabord: "Les enfants mangent en premier et dorment au chaud.",
  partager_en_hiver:
    "Un stock plein à côté d'un ventre vide, c'est une mort de trop : en hiver on partage.",
  puits_pres_du_village:
    "Personne ne doit mourir de soif à deux pas de chez soi : creusons un puits.",
};

/** Extrait le premier objet JSON d'une réponse (avec ou sans clôture de code). */
export function extraireJson(texte: string): Record<string, unknown> | null {
  const debut = texte.indexOf("{");
  const fin = texte.lastIndexOf("}");
  if (debut < 0 || fin <= debut) return null;
  try {
    const v: unknown = JSON.parse(texte.slice(debut, fin + 1));
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function texteDe(v: unknown, max = 400): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t.length > 0 ? t.slice(0, max) : null;
}

function decrirePersonnage(p: PersonnageEtat): string {
  const b = p.besoins;
  return `${p.prenom} ${p.nomFamille}, ${p.stade}, ${p.sexe === "F" ? "femme" : "homme"}${p.enceinte ? ", enceinte" : ""}. Besoins (0 = critique, 100 = comblé) : faim ${String(b.faim)}, soif ${String(b.soif)}, sommeil ${String(b.sommeil)}, chaleur ${String(b.chaleur)}, sécurité ${String(b.securite)}, social ${String(b.social)}, moral ${String(b.moral)}. Intention : ${p.intention ?? "aucune"}. Action : ${p.action ?? "aucune"}.`;
}

export class CerveauClaude {
  private actif = false;
  private conseils = false;
  private enCours = false;
  private dernierConseilA = -Infinity;
  private readonly questionsTraitees = new Set<string>();
  private readonly relances = new Map<string, number>();
  private readonly intervalleConseilMs: number;
  private dernierAppel = -Infinity;
  private reprisePossibleA = 0;
  private indexEvenements = 0;
  private dernierePenseePour: string | null = null;
  private derniereIntention: string | null = null;
  private dernierePenseeA = -Infinity;
  private readonly aTraiter: EvenementEtat[] = [];
  private nombreAppels = 0;
  private readonly intervalleMs: number;
  private readonly lecons: Readonly<Record<string, string>>;

  constructor(
    private readonly magasin: Magasin,
    private readonly envoyer: (commande: Inspiration | Conseil) => void,
    private readonly obtenirSample: () => Promise<Sample | null>,
    private readonly statut: (texte: string) => void,
    options: OptionsClaude = {},
  ) {
    this.intervalleMs = options.intervalleMs ?? 60_000;
    this.intervalleConseilMs = options.intervalleConseilMs ?? 20_000;
    this.lecons = options.lecons ?? LECONS_PAR_DEFAUT;
  }

  get estActif(): boolean {
    return this.actif;
  }

  get conseilsActifs(): boolean {
    return this.conseils;
  }

  activerConseils(): void {
    this.conseils = true;
    this.statut("Claude conseille : quand quelqu'un est à court d'idées, il lui répond.");
  }

  desactiverConseils(): void {
    this.conseils = false;
  }

  /** Met une question du moteur en mots (exposé pour les tests). */
  static promptConseil(q: QuestionConseil): string {
    const c = q.contexte;
    const b = c.besoins;
    const f = c.sexe === "F";
    const inconfort: string[] = [];
    if (c.inconfort.joursFaim > 0)
      inconfort.push(`${String(c.inconfort.joursFaim)} jour(s) de faim d'affilée`);
    if (c.inconfort.joursFroid > 0)
      inconfort.push(`${String(c.inconfort.joursFroid)} jour(s) à grelotter`);
    if (c.inconfort.joursMoralBas > 0)
      inconfort.push(`${String(c.inconfort.joursMoralBas)} jour(s) de moral bas`);
    if (c.inconfort.echecsConsecutifs > 0)
      inconfort.push(
        `${String(c.inconfort.echecsConsecutifs)} échec(s) de suite${c.inconfort.dernierEchec ? ` (dernier : ${c.inconfort.dernierEchec})` : ""}`,
      );
    const batiments = Object.entries(c.village.batiments)
      .map(([n, k]) => `${String(k)} ${n}`)
      .join(", ");
    const stocks = Object.entries(c.village.stocks)
      .map(([r, n]) => `${r} ${String(n)}`)
      .join(", ");
    const options = q.options.map((o) => `- ${o.id} — ${o.libelle} — ${o.pourquoi}`).join("\n");
    return `Tu conseilles UN personnage d'une simulation de vie (huttes, feux de camp), en français. Tu ne sais que ce qu'il sait. Question ${q.id}.
${c.prenom} ${c.nomFamille}, ${f ? "femme" : "homme"}, ${c.stade}, ${String(c.ageAnnees)} ans. Devise : « ${c.motto} ». Valeurs : ${c.valeurs.join(", ")}. Traits : ${c.traits.join(", ")}.
Jour ${String(c.moment.jourAbsolu)}, ${c.moment.saison}, ${c.moment.meteo}. Besoins (0 critique, 100 comblé) : faim ${String(b.faim)}, soif ${String(b.soif)}, sommeil ${String(b.sommeil)}, chaleur ${String(b.chaleur)}, social ${String(b.social)}, moral ${String(b.moral)}.
Ce qui ne va pas : ${inconfort.length > 0 ? inconfort.join(" ; ") : "rien de précis, mais aucun projet"} (motifs : ${q.motifs.join(", ")}).
Au village : ${batiments || "rien de bâti"} ; chantiers : ${c.village.chantiers.join(", ") || "aucun"} ; stocks : ${stocks || "vides"} ; famille de ${String(c.village.famille)} dont ${String(c.village.enfants)} enfant(s).
${f ? "Elle" : "Il"} sait : ${c.savoirs.join(" ; ") || "rien de particulier"}. Idée en cours : ${c.ideesEnCours.join(", ") || "aucune"}.
Derniers souvenirs :
${c.souvenirs.map((s) => `- ${s}`).join("\n") || "- rien de notable"}
Options possibles (choisis UN identifiant, exactement) :
${options}
Réponds uniquement par un objet JSON :
{"choix": "<identifiant>", "pensee": "<1-2 phrases à la première personne, sa voix, sans emoji>", "ambition": {"but": "<ce qu'${f ? "elle" : "il"} veut obtenir, 1 phrase>", "jours": <3 à 20>}}
"ambition" est facultatif ; "choix": "aucun" si rien ne convient.`;
  }

  /** Valide une réponse contre la question ; null si le choix n'est pas au catalogue. */
  static validerConseil(q: QuestionConseil, json: Record<string, unknown>): ReponseConseil | null {
    const choix = typeof json.choix === "string" ? json.choix.trim() : "";
    if (choix !== "aucun" && !q.options.some((o) => o.id === choix)) return null;
    const pensee = texteDe(json.pensee, 300) ?? "";
    let ambition: { but: string; jours: number } | undefined;
    const a = json.ambition;
    if (typeof a === "object" && a !== null) {
      const but = texteDe((a as { but?: unknown }).but, 200);
      const jours = (a as { jours?: unknown }).jours;
      if (but !== null && typeof jours === "number" && Number.isFinite(jours))
        ambition = { but, jours: Math.max(1, Math.min(30, Math.round(jours))) };
    }
    return { choix, pensee, ...(ambition !== undefined ? { ambition } : {}) };
  }

  get appels(): number {
    return this.nombreAppels;
  }

  activer(): void {
    this.actif = true;
    // On ne rattrape pas le passé : seuls les événements à venir inspirent Claude.
    this.indexEvenements = this.magasin.evenements.length;
    this.statut("Claude écoute : il écrira pensées, épitaphes et récits.");
  }

  desactiver(): void {
    this.actif = false;
    this.aTraiter.length = 0;
  }

  /** À appeler régulièrement (boucle d'affichage) ; décide s'il y a quelque chose à demander. */
  async tick(maintenant: number): Promise<void> {
    if ((!this.actif && !this.conseils) || this.enCours || maintenant < this.reprisePossibleA)
      return;
    // Les conseils passent devant : quelqu'un attend une réponse.
    if (this.conseils) {
      const q = this.magasin.etat?.questions[0];
      if (
        q !== undefined &&
        !this.questionsTraitees.has(q.id) &&
        maintenant - this.dernierConseilA >= this.intervalleConseilMs
      ) {
        await this.conseiller(q, maintenant);
        return;
      }
    }
    if (!this.actif) return;
    this.collecter();
    const evenement = this.aTraiter[0];
    if (evenement !== undefined && maintenant - this.dernierAppel >= this.intervalleMs / 3) {
      this.aTraiter.shift();
      await this.inspirerDepuis(evenement, maintenant);
      return;
    }
    const fiche = this.magasin.fiche;
    if (
      fiche !== null &&
      fiche.vivant &&
      fiche.id === this.magasin.selection &&
      maintenant - this.dernierAppel >= this.intervalleMs &&
      (fiche.id !== this.dernierePenseePour ||
        fiche.intention !== this.derniereIntention ||
        maintenant - this.dernierePenseeA >= this.intervalleMs * 3)
    ) {
      await this.penser(fiche, maintenant);
    }
  }

  /** Nouveaux événements dignes d'une inspiration (décès avec leçon, inventions). */
  private collecter(): void {
    const evenements = this.magasin.evenements;
    for (; this.indexEvenements < evenements.length; this.indexEvenements++) {
      const e = evenements[this.indexEvenements];
      if (e === undefined) continue;
      if (e.type === "deces" || e.type === "invention") this.aTraiter.push(e);
    }
    // Un décès et sa leçon arrivent ensemble : on garde le décès, la leçon est lue à côté.
  }

  private async inspirerDepuis(e: EvenementEtat, maintenant: number): Promise<void> {
    const p = this.magasin.etat?.personnages.find((x) => x.id === e.acteur);
    if (p === undefined) return;
    if (e.type === "deces") {
      const lecons = this.magasin.evenements.filter(
        (x) => x.type === "lecon" && x.acteur === p.id && x.tick === e.tick,
      );
      const proposees = lecons.map((l) => String(l.details.lecon ?? "")).filter((l) => l !== "");
      const catalogue = Object.entries(this.lecons)
        .map(([id, morale]) => `- ${id} : ${morale}`)
        .join("\n");
      const prompt = `Tu écris pour une simulation de vie : une petite colonie de personnages autonomes, à l'âge des huttes et des feux de camp, en français.
${p.prenom} ${p.nomFamille} (${p.stade}, ${p.sexe === "F" ? "femme" : "homme"}) vient de mourir de ${String(e.details.cause ?? "cause inconnue")}, au tick ${String(e.tick)}.
État au moment de la mort : faim ${String(p.besoins.faim)}, soif ${String(p.besoins.soif)}, chaleur ${String(p.besoins.chaleur)}, moral ${String(p.besoins.moral)}. Dernière intention : ${p.intention ?? "aucune"}.
Leçons possibles (identifiant : morale) :
${catalogue}
Le moteur propose : ${proposees.length > 0 ? proposees.join(", ") : "aucune"}.
Réponds uniquement par un objet JSON : {"epitaphe": "...", "lecon": "<identifiant ou vide>"}.
L'épitaphe : une ou deux phrases sobres, gravées par la famille, sans emoji. La leçon : l'identifiant le plus juste au vu de la mort (garde celle proposée si elle convient, sinon choisis-en une autre, ou vide si aucune ne s'applique).`;
      await this.appeler(prompt, maintenant, (json) => {
        const epitaphe = texteDe(json.epitaphe);
        if (epitaphe === null) return false;
        const lecon =
          typeof json.lecon === "string" && json.lecon in this.lecons ? json.lecon : undefined;
        this.envoyer({
          type: "inspiration",
          genre: "epitaphe",
          personnageId: p.id,
          texte: epitaphe,
          ...(lecon !== undefined ? { savoir: lecon } : {}),
        });
        return true;
      });
      return;
    }
    const prompt = `Tu écris pour une simulation de vie : une petite colonie de personnages autonomes, à l'âge des huttes et des feux de camp, en français.
${p.prenom} ${p.nomFamille} (${p.stade}, ${p.sexe === "F" ? "femme" : "homme"}) vient de réussir une invention : ${String(e.details.nom ?? "")} (domaine : ${String(e.details.domaine ?? "")}).
${decrirePersonnage(p)}
Réponds uniquement par un objet JSON : {"recit": "..."} — deux phrases à la troisième personne, sans emoji, racontant comment l'idée est venue et ce que cela change pour les siens.`;
    await this.appeler(prompt, maintenant, (json) => {
      const recit = texteDe(json.recit);
      if (recit === null) return false;
      this.envoyer({ type: "inspiration", genre: "recit", personnageId: p.id, texte: recit });
      return true;
    });
  }

  private async penser(fiche: MessageFiche, maintenant: number): Promise<void> {
    const souvenirs = fiche.souvenirsRecents
      .slice(-6)
      .map((s) => `- ${s.texte}`)
      .join("\n");
    const savoirs = fiche.savoirs.map((s) => s.titre).join(", ");
    const prompt = `Tu écris la pensée intérieure d'un personnage d'une simulation de vie : une petite colonie autonome, à l'âge des huttes et des feux de camp, en français.
Personnage : ${fiche.prenom} ${fiche.nomFamille}, ${fiche.stade}, ${String(fiche.ageAnnees)} ans, ${fiche.sexe === "F" ? "femme" : "homme"}. ${fiche.biographie} Devise : « ${fiche.motto} ». Valeurs : ${fiche.valeurs.join(", ")}. Traits : ${fiche.traits.join(", ")}.
Besoins (0 = critique, 100 = comblé) : faim ${String(fiche.besoins.faim)}, soif ${String(fiche.besoins.soif)}, sommeil ${String(fiche.besoins.sommeil)}, chaleur ${String(fiche.besoins.chaleur)}, sécurité ${String(fiche.besoins.securite)}, social ${String(fiche.besoins.social)}, moral ${String(fiche.besoins.moral)}.
Intention : ${fiche.intention ?? "aucune"}. Action : ${fiche.action ?? "aucune"}. Projet : ${fiche.projet ?? "aucun"}.
Famille : partenaire ${fiche.famille.partenaire?.prenom ?? "aucun"}, enfants ${fiche.famille.enfants.map((x) => x.prenom).join(", ") || "aucun"}.
Savoirs : ${savoirs || "aucun"}.
Derniers souvenirs :
${souvenirs || "- rien de notable"}
Réponds uniquement par un objet JSON : {"pensee": "..."} — une ou deux phrases à la première personne, dans sa voix, concrètes, sans emoji.`;
    this.dernierePenseePour = fiche.id;
    this.derniereIntention = fiche.intention;
    this.dernierePenseeA = maintenant;
    await this.appeler(prompt, maintenant, (json) => {
      const pensee = texteDe(json.pensee, 300);
      if (pensee === null) return false;
      this.envoyer({ type: "inspiration", genre: "pensee", personnageId: fiche.id, texte: pensee });
      return true;
    });
  }

  private async conseiller(q: QuestionConseil, maintenant: number): Promise<void> {
    this.dernierConseilA = maintenant;
    const relance = this.relances.get(q.id) ?? 0;
    const prompt =
      CerveauClaude.promptConseil(q) +
      (relance > 0 ? "\nTa réponse précédente n'était pas un identifiant de la liste." : "");
    this.statut(`${q.contexte.prenom} demande conseil à Claude…`);
    const boite: { reponse: ReponseConseil | null } = { reponse: null };
    await this.appeler(
      prompt,
      maintenant,
      (json) => {
        boite.reponse = CerveauClaude.validerConseil(q, json);
        return boite.reponse !== null;
      },
      "default",
    );
    const reponse = boite.reponse;
    if (reponse === null) {
      if (relance === 0 && this.conseils) {
        // Une seule relance ; ensuite, on ferme proprement avec « aucun ».
        this.relances.set(q.id, 1);
        return;
      }
      this.questionsTraitees.add(q.id);
      this.envoyer({
        type: "conseil",
        questionId: q.id,
        personnageId: q.personnageId,
        choix: "aucun",
        pensee: "",
      });
      return;
    }
    const r: ReponseConseil = reponse;
    this.questionsTraitees.add(q.id);
    this.envoyer({
      type: "conseil",
      questionId: q.id,
      personnageId: q.personnageId,
      choix: r.choix,
      pensee: r.pensee,
      ...(r.ambition !== undefined ? { ambition: r.ambition } : {}),
    });
    const option = q.options.find((o) => o.id === r.choix);
    this.statut(
      option === undefined
        ? `${q.contexte.prenom} n'a rien tiré du conseil de Claude.`
        : `${q.contexte.prenom} va tenter : ${option.libelle}.`,
    );
  }

  private async appeler(
    prompt: string,
    maintenant: number,
    appliquer: (json: Record<string, unknown>) => boolean,
    modelTier: "quick" | "default" = "quick",
  ): Promise<void> {
    this.enCours = true;
    this.dernierAppel = maintenant;
    try {
      const sample = await this.obtenirSample();
      if (sample === null) {
        this.statut("Claude n'est pas disponible ici (ouvrez la page sur claude.ai).");
        this.desactiver();
        this.desactiverConseils();
        return;
      }
      const { text } = await sample(prompt, { modelTier });
      this.nombreAppels += 1;
      const json = extraireJson(text);
      if (json === null || !appliquer(json))
        this.statut("Claude a répondu à côté ; on réessaiera.");
      else
        this.statut(
          `Claude a écrit (${String(this.nombreAppels)} appel${this.nombreAppels > 1 ? "s" : ""}).`,
        );
    } catch (erreur: unknown) {
      const code =
        typeof erreur === "object" && erreur !== null && "code" in erreur
          ? String(erreur.code)
          : "";
      if (code === "not_granted" || code === "sampling_disabled") {
        this.statut("Claude n'est pas autorisé sur cette page.");
        this.desactiver();
        this.desactiverConseils();
      } else if (code === "rate_limited") {
        this.reprisePossibleA = maintenant + 5 * 60_000;
        this.statut("Claude est très sollicité ; nouvelle tentative dans cinq minutes.");
      } else {
        this.reprisePossibleA = maintenant + 60_000;
        this.statut("Claude n'a pas pu répondre ; nouvelle tentative dans une minute.");
      }
    } finally {
      this.enCours = false;
    }
  }
}

/** Résout `claude.use("sample")` dans la page, ou null hors de claude.ai. */
export async function sampleDeLaPage(): Promise<Sample | null> {
  const claude = window.claude;
  if (claude === undefined) return null;
  const ns: unknown = await claude.use("sample");
  return typeof ns === "function" ? (ns as Sample) : null;
}
