/** Panneaux DOM : inspecteur, journal, conversations, statistiques, population, barre. */
import type { Commande, MessageFiche, PersonnageEtat, PersonneCourte } from "@sdv/protocole";
import { LIBELLES_PHASE, VITESSES } from "@sdv/protocole";
import type { Magasin } from "./etat.js";
import {
  COULEURS_BIOME,
  COULEURS_RESSOURCE,
  LIBELLES_METEO,
  LIBELLES_MOTIF,
  LIBELLES_SAISON,
  LIBELLES_FETE,
  LIBELLES_SUJET,
  LIBELLES_TYPE,
  NOMS_BATIMENT,
  NOMS_CARENCE,
  NOMS_HANDICAP,
  NOMS_LIEU,
  couleurFamille,
  echapper,
  formaterMoment,
  formaterTick,
  resumerEvenement,
} from "./format.js";

const e = echapper;

export interface Interactions {
  readonly envoyer: (c: Commande) => void;
  readonly selectionner: (id: string | null) => void;
  readonly basculerSuivi: () => void;
  /** « Aller voir » : centrer la carte sur une position du monde. */
  readonly allerVoir: (x: number, y: number) => void;
  /** Ouvrir la chronique d'une année (dialogue, lecture à voix haute). */
  readonly ouvrirChronique: (annee: number) => void;
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`élément #${id} introuvable`);
  return el;
}

export class Panneaux {
  private ongletActif = "inspecteur";
  private derniereVersionJournal = -1;
  private derniereVersionPopulation = -1;
  private derniereVersionStats = -1;
  private derniereVersionConversations = -1;
  private derniereVersionVillage = -1;
  private derniereVersionLegendes = -1;
  private derniereVersionButs = -1;
  private derniereVersionBatiment = -1;
  private dernierRenduLent = 0;
  private ficheAffichee: MessageFiche | null = null;
  private derniereCleFil = "";

  constructor(
    private readonly magasin: Magasin,
    private readonly inter: Interactions,
  ) {
    this.installerControles();
    this.installerOnglets();
    this.installerFiltres();
    this.installerLegende();
  }

  private installerControles(): void {
    for (const id of ["btn-pause", "flot-pause"])
      $(id).addEventListener("click", () => {
        this.inter.envoyer({ type: this.magasin.etat?.pause ? "reprendre" : "pause" });
      });
    $("btn-tick").addEventListener("click", () => {
      this.inter.envoyer({ type: "tick" });
    });
    $("btn-aube").addEventListener("click", () => {
      this.inter.envoyer({ type: "aube" });
    });
    const vitesses = $("vitesses");
    const select = $("vitesse-select") as HTMLSelectElement;
    for (const v of VITESSES) {
      const b = document.createElement("button");
      b.textContent = `×${v}`;
      b.dataset.vitesse = String(v);
      b.addEventListener("click", () => {
        this.inter.envoyer({ type: "vitesse", ticksParSeconde: v });
        this.inter.envoyer({ type: "reprendre" });
      });
      vitesses.append(b);
      const o = document.createElement("option");
      o.value = String(v);
      o.textContent = `×${v}`;
      select.append(o);
    }
    select.addEventListener("change", () => {
      this.inter.envoyer({ type: "vitesse", ticksParSeconde: Number(select.value) });
      this.inter.envoyer({ type: "reprendre" });
    });
    // Panneau repliable (écran étroit) : replié (onglets seuls, carte plein écran) ou déplié.
    const panneau = $("panneau");
    $("btn-poignee").addEventListener("click", () => {
      panneau.classList.toggle("replie");
      this.rafraichirPoignee();
    });
  }

  private rafraichirPoignee(): void {
    $("btn-poignee").textContent = $("panneau").classList.contains("replie") ? "▴" : "▾";
  }

  /** Déplie le panneau s'il était replié (une sélection sur la carte, par exemple). */
  deplier(): void {
    const panneau = $("panneau");
    if (panneau.classList.contains("replie")) {
      panneau.classList.remove("replie");
      this.rafraichirPoignee();
    }
    // En plein écran, le panneau est un volet : une sélection l'ouvre.
    if (document.getElementById("app")?.classList.contains("plein-ecran"))
      panneau.classList.add("ouvert");
  }

  private installerOnglets(): void {
    for (const b of $("onglets").querySelectorAll<HTMLButtonElement>("button[data-onglet]")) {
      b.addEventListener("click", () => {
        this.afficherOnglet(b.dataset.onglet ?? "inspecteur");
      });
    }
  }

  afficherOnglet(nom: string): void {
    this.ongletActif = nom;
    this.deplier();
    for (const b of $("onglets").querySelectorAll<HTMLButtonElement>("button[data-onglet]"))
      b.classList.toggle("actif", b.dataset.onglet === nom);
    for (const s of document.querySelectorAll<HTMLElement>(".onglet"))
      s.classList.toggle("actif", s.id === nom);
    this.derniereVersionJournal = -1;
    this.derniereVersionPopulation = -1;
    this.derniereVersionStats = -1;
    this.derniereVersionConversations = -1;
    this.rafraichir(true);
  }

  private installerFiltres(): void {
    for (const id of ["filtre-type", "filtre-personnage", "filtre-important"]) {
      $(id).addEventListener("change", () => {
        this.derniereVersionJournal = -1;
        this.rafraichir(true);
      });
    }
  }

  private installerLegende(): void {
    const biomes = Object.entries(COULEURS_BIOME)
      .map(
        ([n, c]) =>
          `<span class="pastille" style="background:${c}"></span>${e(n.replace(/_/g, " "))}`,
      )
      .join(" ");
    const ressources = Object.entries(COULEURS_RESSOURCE)
      .map(([n, c]) => `<span class="pastille" style="background:${c}"></span>${e(n)}`)
      .join(" ");
    $("legende").innerHTML =
      `${biomes}<br>${ressources}<br>personnages : vêtement = famille, contour = moral · bêtes : cerfs, sangliers, mouflons, lièvres, aurochs, loups (×n = taille du troupeau, yeux jaunes = meute qui rôde, « ! » = alarme) · huttes, maisons, entrepôts, feux · pointillé = chantier · clic : inspecter · <label><input type="checkbox" id="brouillard-case" checked /> brouillard d'exploration (b)</label>`;
  }

  /** Met à jour les panneaux visibles ; `force` ignore le cache de version. */
  rafraichir(force = false): void {
    this.barre();
    this.fil();
    const version = this.magasin.version;
    switch (this.ongletActif) {
      case "inspecteur":
        this.inspecteur();
        break;
      case "journal":
        if (
          force ||
          (version !== this.derniereVersionJournal &&
            performance.now() - this.dernierRenduLent > 1000)
        ) {
          this.journal();
          this.derniereVersionJournal = version;
          this.dernierRenduLent = performance.now();
        }
        break;
      case "conversations":
        if (force || version !== this.derniereVersionConversations) {
          this.conversations();
          this.derniereVersionConversations = version;
        }
        break;
      case "stats":
        if (force || version !== this.derniereVersionStats) {
          this.stats();
          this.derniereVersionStats = version;
        }
        break;
      case "village":
        if (force || version !== this.derniereVersionVillage) {
          this.village();
          this.derniereVersionVillage = version;
        }
        break;
      case "legendes":
        if (force || version !== this.derniereVersionLegendes) {
          this.legendes();
          this.derniereVersionLegendes = version;
        }
        break;
      case "buts":
        if (force || version !== this.derniereVersionButs) {
          this.buts();
          this.derniereVersionButs = version;
        }
        break;
      case "population":
        if (
          force ||
          (version !== this.derniereVersionPopulation &&
            performance.now() - this.dernierRenduLent > 1000)
        ) {
          this.population();
          this.derniereVersionPopulation = version;
          this.dernierRenduLent = performance.now();
        }
        break;
    }
  }

  private barre(): void {
    const { etat, init } = this.magasin;
    $("graine").textContent = init ? `· graine ${init.seed} · cerveau ${init.modeCerveau}` : "";
    const connexion = $("connexion");
    connexion.textContent = this.magasin.connecte ? "connecté" : "déconnecté, nouvelle tentative…";
    connexion.className = `connexion ${this.magasin.connecte ? "ok" : "ko"}`;
    if (etat === null) return;
    // La vitesse demandée est hors de portée (colonie nombreuse) : on le dit, plutôt que de geler.
    const effective = etat.vitesseEffective;
    const bride =
      effective !== undefined && !etat.pause && effective < etat.ticksParSeconde * 0.8
        ? ` · ×${String(effective)} effectif`
        : "";
    $("horloge").textContent = formaterMoment(etat.moment) + bride;
    $("meteo").textContent = LIBELLES_METEO[etat.meteo] ?? etat.meteo;
    const conteur = $("conteur");
    const c = etat.conteur;
    const texteConteur = `🎭 ${LIBELLES_PHASE[c.phase]} · ${String(c.tension)}`;
    if (conteur.textContent !== texteConteur) conteur.textContent = texteConteur;
    conteur.className = `conteur ${c.phase}`;
    conteur.hidden = false;
    $("btn-pause").textContent = etat.pause ? "▶" : "⏸";
    $("flot-pause").textContent = etat.pause ? "▶" : "⏸";
    $("flot-horloge").textContent =
      `${formaterMoment(etat.moment)} · ${LIBELLES_METEO[etat.meteo] ?? etat.meteo} · ${etat.stats.vivants} vivants`;
    for (const b of $("vitesses").querySelectorAll<HTMLButtonElement>("button")) {
      b.classList.toggle(
        "actif",
        !etat.pause && Number(b.dataset.vitesse) === etat.ticksParSeconde,
      );
    }
    const select = $("vitesse-select") as HTMLSelectElement;
    if (select.value !== String(etat.ticksParSeconde)) select.value = String(etat.ticksParSeconde);
    const s = etat.stats;
    $("resume").textContent =
      `${s.vivants} vivants (${s.enfants} enfants) · ${s.batiments} bâtiments · ${s.naissances} naissances · ${s.deces} décès · ${s.dialogues} dialogues`;
  }

  /** Carte d'un bâtiment sélectionné (type, famille, propriétaire, occupants, stock, chantier). */
  afficherBatiment(id: string): void {
    const b = this.magasin.batiment(id);
    const conteneur = $("inspecteur");
    if (b === null) return;
    const etat = this.magasin.etat;
    const occupants = (etat?.personnages ?? []).filter(
      (p) => p.vivant && p.x === b.x && p.y === b.y,
    );
    const stock = b.stock
      ? Object.entries(b.stock)
          .map(([r, n]) => `<span class="puce">${e(r)} ×${n}</span>`)
          .join("") || "<span class='discret'>vide</span>"
      : null;
    const manquants = Object.entries(b.manquants)
      .map(([r, n]) => `<span class="puce">${e(r)} ×${n}</span>`)
      .join("");
    const avancement =
      b.travailTotal > 0 ? Math.round((1 - b.travailRestant / b.travailTotal) * 100) : 0;
    conteneur.dataset.vide = "0";
    this.ficheAffichee = null;
    conteneur.innerHTML = `
      <div class="entete-fiche">
        <span class="rond" style="background:${couleurFamille(b.famille)}"></span>
        <span class="nom">${e(NOMS_BATIMENT[b.type] ?? b.nom)} <span class="discret">${e(b.id)}</span></span>
        <span class="actions"><button id="btn-fermer" title="Fermer (échap)">✕</button></span>
      </div>
      <div class="discret">famille ${e(b.famille)} · propriétaire <span class="lien" data-id="${e(b.proprietaire)}">${e(this.magasin.nom(b.proprietaire))}</span> · en (${b.x}, ${b.y})</div>
      ${
        b.etat === "chantier"
          ? `<h3>Chantier</h3><div class="jauges"><span>travail</span><div class="jauge"><i style="width:${avancement}%;background:#6cc2ff"></i></div><span class="num">${avancement}%</span></div><div>Matériaux manquants : ${manquants || "<span class='discret'>aucun, il ne reste qu'à travailler</span>"}</div>`
          : `<h3>État</h3><div class="jauges"><span>solidité</span><div class="jauge ${b.solidite < 40 ? "critique" : b.solidite < 60 ? "bas" : ""}"><i style="width:${b.solidite}%"></i></div><span class="num">${b.solidite}</span></div>${b.type === "feu_de_camp" ? `<div>${b.allume ? `🔥 allumé · ${b.reserveBois} bûche${b.reserveBois > 1 ? "s" : ""} en réserve (quatre par jour, six sous la neige)` : "éteint (une bûche suffit à le rallumer)"}</div>` : ""}${b.capaciteDormeurs > 0 ? `<div>${b.capaciteDormeurs} place${b.capaciteDormeurs > 1 ? "s" : ""} pour dormir (les enfants se serrent)</div>` : ""}${b.epitaphe ? `<p class="epitaphe">${e(b.epitaphe)}</p>` : ""}${b.culture ? `<div>${b.culture.seme ? `🌱 semé · stade ${b.culture.stade}/4 ${["(terre nue)", "(levée)", "(pousse)", "(épis)", "(mûr, à récolter)"][b.culture.stade] ?? ""}` : "en jachère, à semer au printemps (quatre graines)"}${b.culture.recoltes > 0 ? ` · ${b.culture.recoltes} récolte${b.culture.recoltes > 1 ? "s" : ""} de suite` : ""}</div>` : ""}${b.type === "enclos" ? `<div>Les bêtes de la famille y restent ; lait et laine vont dans son stock ; l'hiver, elles broutent les fibres alentour.</div>` : ""}`
      }
      ${stock !== null ? `<h3>Stock</h3><div class="puces">${stock}</div>` : ""}
      <h3>Présents</h3>
      ${occupants.length > 0 ? `<ol class="liste">${occupants.map((p) => `<li class="personne" data-id="${e(p.id)}"><span class="rond" style="background:${couleurFamille(p.nomFamille)}"></span>${e(p.prenom)} ${e(p.nomFamille)}<span class="detail">${p.endormi ? "dort" : e(p.intention ?? "—")}</span></li>`).join("")}</ol>` : "<p class='discret'>personne pour l'instant</p>"}`;
    conteneur.querySelector("#btn-fermer")?.addEventListener("click", () => {
      this.magasin.selectionBatiment = null;
      this.inter.selectionner(null);
    });
    for (const l of conteneur.querySelectorAll<HTMLElement>("[data-id]")) {
      l.addEventListener("click", () => {
        this.inter.selectionner(l.dataset.id ?? null);
      });
    }
  }

  private inspecteur(): void {
    const conteneur = $("inspecteur");
    const fiche = this.magasin.fiche;
    if (this.magasin.selectionBatiment !== null) {
      if (this.magasin.version !== this.derniereVersionBatiment) {
        this.afficherBatiment(this.magasin.selectionBatiment);
        this.derniereVersionBatiment = this.magasin.version;
      }
      return;
    }
    if (this.magasin.selection === null) {
      if (this.ficheAffichee !== null || conteneur.dataset.vide !== "1") {
        conteneur.innerHTML = `<p class="discret">Cliquez sur un personnage de la carte, ou choisissez-le dans l'onglet Population.</p>`;
        conteneur.dataset.vide = "1";
        this.ficheAffichee = null;
      }
      return;
    }
    if (fiche === null || fiche === this.ficheAffichee) return;
    this.ficheAffichee = fiche;
    conteneur.dataset.vide = "0";
    conteneur.innerHTML = this.htmlFiche(fiche);
    conteneur.querySelector("#btn-suivre")?.addEventListener("click", () => {
      this.inter.basculerSuivi();
      this.ficheAffichee = null;
    });
    conteneur.querySelector("#btn-fermer")?.addEventListener("click", () => {
      this.inter.selectionner(null);
    });
    conteneur.querySelector("#btn-conseil")?.addEventListener("click", () => {
      this.inter.envoyer({ type: "demander_conseil", id: fiche.id });
      this.ficheAffichee = null;
    });
    for (const l of conteneur.querySelectorAll<HTMLElement>("[data-id]")) {
      l.addEventListener("click", () => {
        this.inter.selectionner(l.dataset.id ?? null);
      });
    }
  }

  /** Bloc « Ambition » : où va cette personne, et le bouton « Demander conseil ». */
  private htmlAmbition(f: MessageFiche): string {
    const a = f.ambition;
    const questions = this.magasin.etat?.questions ?? [];
    const enQuestion = questions.some((q) => q.personnageId === f.id);
    const autre = questions.find((q) => q.personnageId !== f.id);
    const titre = enQuestion
      ? "Sa question est déjà posée"
      : autre !== undefined
        ? `Une question est déjà ouverte pour ${this.magasin.nom(autre.personnageId)} ; une seule à la fois`
        : f.conseilPossible
          ? "Ce personnage pose sa question : répondez dans le dialogue, ou le hasard choisira dans cinq secondes"
          : "Pas avant demain : il a déjà demandé conseil";
    const bouton = f.vivant
      ? `<button id="btn-conseil" ${f.conseilPossible && !enQuestion ? "" : "disabled"} title="${e(titre)}">💬 Demander conseil</button>`
      : "";
    const question = enQuestion
      ? `<div class="question">❓ Question ouverte : répondez dans le dialogue, ou le hasard choisira dans cinq secondes.</div>`
      : "";
    const conseil = this.htmlConseil(f);
    if (a === null)
      return `<h3>Ambition et conseil</h3>${question}${conseil}<p class="discret">aucune ambition pour l'instant ${bouton}</p>`;
    const etat =
      a.issue === "en_cours"
        ? `${a.joursRestants} jour${a.joursRestants > 1 ? "s" : ""} restant${a.joursRestants > 1 ? "s" : ""}`
        : a.issue === "accomplie"
          ? "accomplie ✓"
          : "abandonnée";
    return `<h3>Ambition et conseil</h3>${question}${conseil}
      <div class="ambition ${a.issue === "en_cours" ? "" : "finie"}">🎯 <span class="but">${e(a.but)}</span> — ${e(a.cible)}, ${e(etat)}${a.pensee ? `<div class="discret">« ${e(a.pensee)} »</div>` : ""}</div>
      <div>${bouton}</div>`;
  }

  /** La question posée (motifs, options) et sa réponse, telles que le moteur les a vues. */
  private htmlConseil(f: MessageFiche): string {
    const c = f.conseil;
    if (c === null) return "";
    const init = this.magasin.init;
    const quand = init
      ? formaterTick(c.tick, init.ticksParJour, init.joursParSaison)
      : String(c.tick);
    const motifs = c.motifs.map((m) => LIBELLES_MOTIF[m] ?? m).join(", ");
    const options = c.options
      .map(
        (o) =>
          `<li class="${o.id === c.choix ? "choisi" : ""}">${o.id === c.choix ? "✓ " : ""}${e(o.libelle)} <span class="discret">— ${e(o.pourquoi)}</span></li>`,
      )
      .join("");
    const entete =
      c.etat === "ouverte"
        ? `❓ <b>Question posée</b> (${e(quand)}) — ${e(motifs)}.`
        : c.etat === "repondue"
          ? `💬 <b>Réponse donnée</b> (${e(quand)}) : <b>${e(c.libelle ?? c.choix ?? "")}</b>${c.pensee ? ` — « ${e(c.pensee)} »` : ""}${c.but ? `<div class="discret">But : ${e(c.but)}</div>` : ""}`
          : `💬 <b>Question sans suite</b> (${e(quand)}) : ${e(
              c.raison === "expiree"
                ? "personne n'a répondu à temps"
                : c.raison === "aucun"
                  ? "rien n'a semblé convenir"
                  : c.raison === "remplacee"
                    ? "une autre question l'a remplacée"
                    : "la réponse n'était pas au catalogue",
            )}`;
    return `<div class="conseil">${entete}<div class="discret" style="margin-top:4px">Options proposées${c.etat === "ouverte" ? " (cinq secondes pour répondre, sinon le hasard choisit)" : ""} :</div><ul>${options}</ul></div>`;
  }

  private htmlFiche(f: MessageFiche): string {
    const init = this.magasin.init;
    const tick = (t: number): string =>
      init ? formaterTick(t, init.ticksParJour, init.joursParSaison) : String(t);
    const jauge = (nom: string, v: number): string => {
      const classe = v < 20 ? "critique" : v < 45 ? "bas" : "";
      return `<span>${e(nom)}</span><div class="jauge ${classe}"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></div><span class="num">${Math.round(v)}</span>`;
    };
    const personne = (p: PersonneCourte): string =>
      `<span class="lien" data-id="${e(p.id)}">${e(p.prenom)}${p.vivant ? "" : " †"}</span>`;
    const liste = (l: readonly PersonneCourte[]): string =>
      l.length > 0 ? l.map(personne).join(", ") : "—";
    const relations = f.relations
      .filter((r) => r.interactions > 0 || r.lien !== "inconnu")
      .slice(0, 14)
      .map(
        (r) =>
          `<tr><td><span class="lien" data-id="${e(r.id)}">${e(r.prenom)}</span>${r.vivant ? "" : " †"}</td><td>${e(r.lien)}</td><td class="num" title="affinité">${r.affinite}</td><td class="num" title="confiance">${r.confiance}</td><td class="num" title="attirance">${r.attirance}</td><td class="num" title="dette">${r.dette}</td></tr>`,
      )
      .join("");
    const competences =
      Object.entries(f.competences)
        .filter(([, n]) => n > 0)
        .map(([c, n]) => `<span class="puce">${e(c)} ${n}</span>`)
        .join("") || "<span class='discret'>aucune encore</span>";
    const inventaire =
      [
        ...Object.entries(f.inventaire.ressources).map(
          ([r, n]) => `<span class="puce">${e(r)} ×${n}</span>`,
        ),
        ...f.inventaire.objets.map((o) => `<span class="puce">🔧 ${e(o)}</span>`),
      ].join("") || "<span class='discret'>vide</span>";
    const savoirs =
      f.savoirs
        .map(
          (s) =>
            `<span class="puce" title="${e(s.texte)}${s.origine ? ` — ${e(s.origine)}` : ""}">${s.genre === "lecon" ? "📜" : "💡"} ${e(s.titre)}${s.force < 1 ? " (idée)" : ""}</span>`,
        )
        .join("") || "<span class='discret'>rien encore</span>";
    const corps = f.corps;
    const blessures =
      corps.blessures
        .map((b) => {
          const etatB = [
            b.saigne ? "saigne" : null,
            b.bandee ? "bandée" : null,
            b.infectee ? "infectée" : null,
            b.immobilisee ? "attelle" : null,
          ]
            .filter((x) => x !== null)
            .join(", ");
          return `<span class="puce blessure">🩸 ${e(b.type)} ${e(NOMS_LIEU[b.lieu] ?? b.lieu)} (g${b.gravite}, ${b.jours} j${etatB ? ", " + e(etatB) : ""})</span>`;
        })
        .join("") || "";
    const corpsPuces = [
      ...corps.handicaps.map((h) => `<span class="puce">♿ ${e(NOMS_HANDICAP[h] ?? h)}</span>`),
      corps.carence
        ? `<span class="puce">🍽 ${e(NOMS_CARENCE[corps.carence] ?? corps.carence)}</span>`
        : "",
      corps.cicatrices > 0
        ? `<span class="puce">${corps.cicatrices} cicatrice${corps.cicatrices > 1 ? "s" : ""}</span>`
        : "",
      corps.epuise ? `<span class="puce blessure">épuisé</span>` : "",
      ...corps.maladies.map(
        (m) => `<span class="puce blessure">🤒 ${e(m.nom)} (${m.joursRestants} j)</span>`,
      ),
    ].join("");
    const capacitesTexte = Object.entries(corps.capacites)
      .filter(([, v]) => v < 0.99)
      .map(([k, v]) => `<span class="puce">${e(k)} ${Math.round(v * 100)} %</span>`)
      .join("");
    const humeur =
      f.humeur.length > 0
        ? f.humeur
            .map(
              (m) =>
                `<span class="puce ${m.valeur < 0 ? "blessure" : ""}">${e(m.cle.split(":")[0] ?? m.cle)} ${m.valeur > 0 ? "+" : ""}${m.valeur}</span>`,
            )
            .join("")
        : "<span class='discret'>rien de particulier</span>";
    const souvenirs = (l: MessageFiche["souvenirsRecents"]): string =>
      l.length > 0
        ? `<ol class="liste">${l.map((s) => `<li class="${s.importance >= 6 ? "majeur" : s.importance >= 3 ? "important" : ""}${s.type === "reve" ? " reve" : ""}${s.altere === true ? " altere" : ""}"><span class="quand">${e(tick(s.tick))}</span>${s.type === "reve" ? "💤 " : ""}${e(s.texte)}${s.altere === true ? ' <span class="discret">(altéré)</span>' : ""}</li>`).join("")}</ol>`
        : "<p class='discret'>rien encore</p>";
    const perso = Object.entries(f.personnalite)
      .map(
        ([k, v]) =>
          `<span>${e(k)}</span><div class="jauge"><i style="width:${Math.round(v * 100)}%;background:#6cc2ff"></i></div><span class="num">${Math.round(v * 100)}</span>`,
      )
      .join("");
    const etat = f.vivant
      ? `${e(f.stade)}, ${f.ageAnnees} ans · santé ${f.sante}${f.enceinte ? ` · enceinte (${Math.round(f.enceinte.avancement * 100)} %)` : ""}`
      : `décédé${f.sexe === "F" ? "e" : ""} (${e(f.causeDeces ?? "?")})`;
    return `
      <div class="entete-fiche">
        <span class="rond" style="background:${couleurFamille(f.nomFamille)}"></span>
        <span class="nom">${e(f.prenom)} ${e(f.nomFamille)}${f.metier ? ` <span class="discret">${e(f.metier)}</span>` : ""}</span>
        <span class="actions"><button id="btn-suivre" class="${this.magasin.suivre ? "actif" : ""}" title="Caméra qui suit ce personnage (s)">suivre</button><button id="btn-fermer" title="Fermer (échap)">✕</button></span>
      </div>
      <div class="discret">${etat} · réputation ${f.reputation} · ${f.lieuxConnus} lieux connus · ${f.nombreSouvenirs} souvenirs</div>
      <div class="pensee${f.penseeDeClaude ? " claude" : ""}">${f.penseeDeClaude ? "🧠 " : ""}« ${e(f.pensee)} »</div>
      ${this.htmlAmbition(f)}
      <h3>Maintenant</h3>
      <div>Intention : <b>${e(f.intention ?? "—")}</b>${f.projet ? ` · projet : ${e(NOMS_BATIMENT[f.projet] ?? f.projet)}` : ""}</div>
      <div class="discret">Action : ${e(f.action ?? "—")}${f.plan.length > 0 ? ` · puis ${e(f.plan.join(", "))}` : ""}</div>
      <h3>Besoins</h3>
      <div class="jauges">${jauge("faim", f.besoins.faim)}${jauge("soif", f.besoins.soif)}${jauge("sommeil", f.besoins.sommeil)}${jauge("chaleur", f.besoins.chaleur)}${jauge("sécurité", f.besoins.securite)}${jauge("social", f.besoins.social)}${jauge("moral", f.besoins.moral)}</div>
      <h3>Corps</h3>
      <div class="jauges">${jauge("forme", 100 - corps.fatigue)}</div>
      <div class="puces">${blessures}${corpsPuces}${capacitesTexte}${!blessures && !corpsPuces && !capacitesTexte ? "<span class='discret'>en forme</span>" : ""}</div>
      <h3>Humeur</h3>
      <div class="puces">${humeur}</div>
      <h3>Foi</h3>
      <div class="jauges"><span>foi</span><div class="jauge"><i style="width:${f.foi * 10}%;background:#ffd479"></i></div><span class="num">${f.foi}/10</span></div>
      <div class="discret">${f.foi >= 3 ? "prie le ciel quand ça va mal" : "ne prie guère"}${f.priere ? ` · dernière prière : ${e(LIBELLES_SUJET[f.priere.sujet] ?? f.priere.sujet)}${f.priere.autel ? " à l'autel" : ""}${f.priere.exaucee ? " — exaucée ✓" : ""}` : ""}</div>
      <h3>Village</h3>
      <div class="jauges"><span>prestige</span><div class="jauge"><i style="width:${f.prestige}%;background:#c9a7ff"></i></div><span class="num">${f.prestige}</span></div>
      <div class="discret">${f.notable ? "⭐ notable du village · " : ""}${f.banni ? `🚫 banni${f.sexe === "F" ? "e" : ""} encore ${f.banni.joursRestants} jour${f.banni.joursRestants > 1 ? "s" : ""} (${e(f.banni.motif)}) · ` : ""}${f.traumatise ? "💔 marqué par une mort violente · " : ""}${f.maitre ? `apprend auprès de ${personne(f.maitre)} · ` : ""}${f.apprentis.length > 0 ? `maître de ${liste(f.apprentis)} · ` : ""}${f.rancunes.length > 0 ? `rancunes : ${f.rancunes.map((r) => `<span class="lien" data-id="${e(r.id)}">${e(r.prenom)}</span> ${r.haine ? "(haine)" : String(r.rancune)}`).join(", ")}` : "sans rancune"}</div>
      <h3>Psyché</h3>
      <div class="jauges"><span>stress</span><div class="jauge ${f.psyche.stress >= 70 ? "critique" : f.psyche.stress >= 40 ? "bas" : ""}"><i style="width:${f.psyche.stress}%"></i></div><span class="num">${f.psyche.stress}</span><span>sens</span><div class="jauge"><i style="width:${f.psyche.sens}%;background:#c9a7ff"></i></div><span class="num">${f.psyche.sens}</span><span>ennui</span><div class="jauge"><i style="width:${f.psyche.ennui}%;background:#9aa3ad"></i></div><span class="num">${f.psyche.ennui}</span></div>
      <div class="discret">${f.psyche.abattu ? "🌧️ abattu : ne fait plus que le nécessaire · " : ""}${f.psyche.objectif ? `${f.psyche.objectif.issue === "en_cours" ? "🎯 veut" : f.psyche.objectif.issue === "accompli" ? "🎉 a réussi à" : "n'a pas pu"} ${e(f.psyche.objectif.but)}${f.psyche.objectif.issue === "en_cours" ? ` (${f.psyche.objectif.joursRestants} j)` : ""} · ` : ""}${f.psyche.attachement.lieu ? `tient à un lieu : ${e(f.psyche.attachement.lieu)} · ` : ""}${f.psyche.attachement.objet ? `tient à sa ${e(f.psyche.attachement.objet.replace(/_/g, " "))} · ` : ""}${f.psyche.lieuxEvites.length > 0 ? `évite : ${f.psyche.lieuxEvites.map((l) => `${e(l.motif)} (${l.joursRestants} j)`).join(", ")} · ` : ""}${f.psyche.deuils.length > 0 ? `porte le deuil de ${f.psyche.deuils.map((d) => e(d.prenom)).join(", ")} · ` : ""}${
        Object.entries(f.psyche.derive)
          .filter(([, v]) => v !== 0)
          .map(([k, v]) => `${e(k)} ${v > 0 ? "+" : ""}${v}`)
          .join(", ") || "caractère inchangé"
      }</div>
      ${f.psyche.reve ? `<div class="pensee reve">💤 ${e(f.psyche.reve.texte)}</div>` : ""}
      <h3>Famille</h3>
      <div>Parents : ${liste(f.famille.parents)} · Partenaire : ${f.famille.partenaire ? personne(f.famille.partenaire) : "—"}</div>
      <div>Enfants : ${liste(f.famille.enfants)} · Fratrie : ${liste(f.famille.fratrie)}</div>
      <h3>Relations</h3>
      ${relations ? `<table class="relations"><tr class="discret"><td>qui</td><td>lien</td><td class="num">aff.</td><td class="num">conf.</td><td class="num">attir.</td><td class="num">dette</td></tr>${relations}</table>` : "<p class='discret'>personne encore</p>"}
      <h3>Inventaire (${Object.values(f.inventaire.ressources).reduce((a, b) => a + b, 0) + f.inventaire.objets.length}/${f.inventaire.capacite})</h3>
      <div class="puces">${inventaire}</div>
      <h3>Compétences</h3>
      <div class="puces">${competences}</div>
      <h3>Savoirs</h3>
      <div class="puces">${savoirs}</div>
      <h3>Identité</h3>
      <p>${e(f.biographie)}</p>
      <p class="discret">« ${e(f.motto)} »</p>
      <div class="puces">${f.valeurs.map((v) => `<span class="puce">★ ${e(v)}</span>`).join("")}${f.traits.map((t) => `<span class="puce">${e(t)}</span>`).join("")}</div>
      <div class="jauges" style="margin-top:6px">${perso}</div>
      <h3>Souvenirs marquants</h3>
      ${souvenirs(f.souvenirsMarquants)}
      <h3>Derniers souvenirs</h3>
      ${souvenirs(f.souvenirsRecents)}`;
  }

  private journal(): void {
    const init = this.magasin.init;
    const type = (document.getElementById("filtre-type") as HTMLSelectElement).value;
    const personnage = (document.getElementById("filtre-personnage") as HTMLSelectElement).value;
    const importants = (document.getElementById("filtre-important") as HTMLInputElement).checked;
    this.remplirFiltres();
    const lignes: string[] = [];
    const evenements = this.magasin.evenements;
    for (let i = evenements.length - 1; i >= 0 && lignes.length < 300; i--) {
      const ev = evenements[i];
      if (ev === undefined) continue;
      if (type !== "" && ev.type !== type) continue;
      if (importants && ev.importance < 3) continue;
      if (
        personnage !== "" &&
        ev.acteur !== personnage &&
        ev.details.avec !== personnage &&
        ev.details.cible !== personnage
      )
        continue;
      const quand = init
        ? formaterTick(ev.tick, init.ticksParJour, init.joursParSaison)
        : String(ev.tick);
      const classe = ev.importance >= 7 ? "majeur" : ev.importance >= 4 ? "important" : "";
      const detail =
        ev.type === "dialogue" && typeof ev.details.transcription === "string"
          ? `<div class="discret">${e(ev.details.transcription)}</div>`
          : "";
      const acteur = ev.acteur ?? (typeof ev.details.cible === "string" ? ev.details.cible : null);
      const voir =
        ev.position !== null
          ? `<button class="voir" type="button" data-x="${String(ev.position.x)}" data-y="${String(ev.position.y)}" title="Aller voir sur la carte">📍</button>`
          : "";
      lignes.push(
        `<li class="${classe}"${acteur !== null ? ` data-id="${e(acteur)}" title="Voir la fiche"` : ""}>${voir}<span class="quand">${e(quand)}</span>${e(resumerEvenement(ev, (id) => this.magasin.nom(id)))}${detail}</li>`,
      );
    }
    $("liste-journal").innerHTML =
      lignes.join("") || "<li class='discret'>rien pour l'instant</li>";
    // Un clic sur une ligne ouvre la fiche de la personne concernée ; 📍 va voir sur la carte.
    for (const l of $("liste-journal").querySelectorAll<HTMLElement>("li[data-id]")) {
      l.addEventListener("click", () => {
        this.inter.selectionner(l.dataset.id ?? null);
        this.afficherOnglet("inspecteur");
      });
    }
    this.brancherVoir($("liste-journal"));
  }

  /** Les boutons 📍 d'un conteneur : centrer la carte, sans ouvrir la fiche (ou ouvrir un onglet). */
  private brancherVoir(conteneur: HTMLElement): void {
    for (const b of conteneur.querySelectorAll<HTMLButtonElement>("button.voir")) {
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const onglet = b.dataset.onglet;
        if (onglet !== undefined) this.afficherOnglet(onglet);
        else this.inter.allerVoir(Number(b.dataset.x), Number(b.dataset.y));
      });
    }
  }

  /** L'onglet Buts : le scénario et sa jauge, les prophéties, la grille des succès. */
  private buts(): void {
    const etat = this.magasin.etat;
    const init = this.magasin.init;
    if (etat === null || init === null) return;
    const b = etat.buts;
    const jour = (j: number): string =>
      formaterTick(j * init.ticksParJour, init.ticksParJour, init.joursParSaison).replace(
        /,.*$/,
        "",
      );
    const sc = b.scenario;
    const scenario =
      sc === null
        ? "<p class='discret'>Partie libre : aucun scénario (choisissez-en un au formulaire « Nouveau monde »).</p>"
        : `<div class="scenario ${sc.etat}"><b>${sc.etat === "gagne" ? "🏆 " : sc.etat === "perdu" ? "💀 " : "🎯 "}${e(sc.nom)}</b> <span class="discret">— ${e(sc.description)} Limite : ${e(jour(sc.finJour))}.</span><div class="jauges"><span>${sc.etat === "en_cours" ? "progrès" : sc.etat === "gagne" ? "réussi" : "perdu"}</span><div class="jauge ${sc.etat === "perdu" ? "critique" : ""}"><i style="width:${String(Math.round(sc.progres * 100))}%${sc.etat === "gagne" ? ";background:#7dffa0" : ""}"></i></div><span class="num">${String(Math.round(sc.progres * 100))}%</span></div><div class="discret">${e(sc.texte)}${sc.jourIssue !== null ? ` (${e(jour(sc.jourIssue))})` : ""}</div></div>`;
    const propheties =
      b.propheties.length > 0
        ? `<ul class="liste propheties">${b.propheties.map((p) => `<li class="${p.etat}">${p.etat === "accomplie" ? "✅" : p.etat === "manquee" ? "✖" : "🔮"} ${e(p.texte)} <span class="discret">(${e(jour(p.jour))} → ${e(jour(p.finJour))})</span></li>`).join("")}</ul>`
        : "<p class='discret'>aucune prophétie encore : le ciel en formule au premier jour d'une saison, une fois sur deux</p>";
    const debloques = b.succes.filter((x) => x.jour !== null).length;
    const succes = `<div class="succes-grille">${b.succes
      .map(
        (x) =>
          `<div class="succes ${x.jour === null ? "verrou" : ""}" title="${e(x.description)}"><div class="titre">${x.emoji} ${e(x.nom)}</div>${e(x.description)}${x.jour !== null ? `<span class="quand">${e(jour(x.jour))}</span>` : ""}</div>`,
      )
      .join("")}</div>`;
    $("buts").innerHTML = `
      <h2>Buts</h2>
      <h3>Scénario</h3>${scenario}
      <h3>Prophéties</h3>${propheties}
      <h3>Succès · ${String(debloques)}/${String(b.succes.length)}</h3>${succes}`;
  }

  /** Le fil des grands événements sur la carte (importance ≥ 6), les quatre derniers. */
  private fil(): void {
    const init = this.magasin.init;
    const evenements = this.magasin.evenements;
    const majeurs: typeof evenements = [];
    for (let i = evenements.length - 1; i >= 0 && majeurs.length < 4; i--) {
      const ev = evenements[i];
      if (ev !== undefined && ev.importance >= 6 && (ev.position !== null || ev.importance >= 8))
        majeurs.push(ev);
    }
    const cle = majeurs.map((ev) => `${String(ev.tick)}:${ev.type}:${ev.acteur ?? ""}`).join("|");
    if (cle === this.derniereCleFil) return;
    const nouveau = majeurs[0] !== undefined && this.derniereCleFil !== "";
    this.derniereCleFil = cle;
    const fil = $("fil");
    fil.hidden = majeurs.length === 0;
    fil.innerHTML = majeurs
      .map((ev, i) => {
        const quand = init
          ? formaterTick(ev.tick, init.ticksParJour, init.joursParSaison)
          : String(ev.tick);
        const texte = resumerEvenement(ev, (id) => this.magasin.nom(id));
        const court = e(texte.length > 90 ? `${texte.slice(0, 88)}…` : texte);
        return ev.position === null
          ? `<li${i === 0 && nouveau ? ' class="nouveau"' : ""}><button class="voir but" type="button" data-onglet="buts" title="Voir les buts"><span class="quand">${e(quand)}</span>${court}</button></li>`
          : `<li${i === 0 && nouveau ? ' class="nouveau"' : ""}><button class="voir" type="button" data-x="${String(ev.position.x)}" data-y="${String(ev.position.y)}" title="Aller voir sur la carte">📍 <span class="quand">${e(quand)}</span>${court}</button></li>`;
      })
      .join("");
    this.brancherVoir(fil);
  }

  private remplirFiltres(): void {
    const selType = document.getElementById("filtre-type") as HTMLSelectElement;
    const types = [...this.magasin.typesVus].sort();
    if (selType.options.length !== types.length + 1) {
      const valeur = selType.value;
      selType.innerHTML = `<option value="">Tous les types</option>${types.map((t) => `<option value="${e(t)}">${e(LIBELLES_TYPE[t] ?? t)}</option>`).join("")}`;
      selType.value = valeur;
    }
    const selPers = document.getElementById("filtre-personnage") as HTMLSelectElement;
    const personnes = this.magasin.etat?.personnages ?? [];
    if (selPers.options.length !== personnes.length + 1) {
      const valeur = selPers.value;
      selPers.innerHTML = `<option value="">Tout le monde</option>${personnes.map((p) => `<option value="${e(p.id)}">${e(p.prenom)} ${e(p.nomFamille)}</option>`).join("")}`;
      selPers.value = valeur;
    }
  }

  private conversations(): void {
    const init = this.magasin.init;
    const lignes = [...this.magasin.conversations]
      .reverse()
      .slice(0, 60)
      .map((c) => {
        const quand = init
          ? formaterTick(c.tick, init.ticksParJour, init.joursParSaison)
          : String(c.tick);
        const repliques = c.repliques
          .map(
            (r) =>
              `<div class="replique"><span class="locuteur">${e(r.locuteur)}</span> — ${e(r.texte)}</div>`,
          )
          .join("");
        return `<li class="conversation"><span class="quand">${e(quand)}</span><b>${e(this.magasin.nom(c.acteur))}</b> et <b>${e(this.magasin.nom(c.avec))}</b> <span class="discret">(${e(c.sujet)})</span>${repliques}</li>`;
      });
    $("liste-conversations").innerHTML =
      lignes.join("") || "<li class='discret'>aucune conversation pour l'instant</li>";
  }

  private stats(): void {
    const etat = this.magasin.etat;
    if (etat === null) return;
    const s = etat.stats;
    const tuile = (valeur: string | number, libelle: string): string =>
      `<div class="tuile"><div class="valeur">${e(String(valeur))}</div><div class="libelle">${e(libelle)}</div></div>`;
    const batiments =
      Object.entries(s.parType)
        .map(([t, n]) => `<span class="puce">${e(NOMS_BATIMENT[t] ?? t)} ×${n}</span>`)
        .join("") || "<span class='discret'>aucun</span>";
    const stocks =
      Object.entries(s.stocks)
        .map(([r, n]) => `<span class="puce">${e(r)} ×${n}</span>`)
        .join("") || "<span class='discret'>vides</span>";
    const saisons = s.parSaison
      .map(
        (b) =>
          `<tr><td>An ${b.annee} ${e(LIBELLES_SAISON[b.saison] ?? b.saison)}</td><td>${b.naissances}</td><td>${b.deces}</td></tr>`,
      )
      .join("");
    $("stats").innerHTML = `
      <div class="tuiles">
        ${tuile(s.vivants, "vivants")}${tuile(s.enfants, "enfants")}${tuile(s.population, "population totale")}${tuile(s.morts, "morts")}
        ${tuile(s.naissances, "naissances")}${tuile(s.unions, "unions")}${tuile(s.generations, "générations")}${tuile(s.dialogues, "dialogues")}
        ${tuile(s.batiments, "bâtiments")}${tuile(s.chantiers, "chantiers")}${tuile(s.evenements, "événements")}${tuile(s.tick, "ticks")}
        ${tuile(s.malades, "malades")}${tuile(s.age === "cuivre" ? "cuivre" : "pierre", "âge")}${tuile(s.betail, "bêtes apprivoisées")}${tuile(s.champs, "champs")}${tuile(s.tuilesDecouvertes, "tuiles découvertes")}${tuile(s.morceaux, "morceaux du monde")}${tuile(s.appelsLLM, "appels IA")}${tuile(`${s.coutLLM.toFixed(2)} $`, "coût IA")}${tuile(s.miracles, "miracles")}${tuile(`✦ ${etat.faveur.valeur}/${etat.faveur.max}`, "faveur")}${tuile(s.foiMoyenne, "foi moyenne /10")}${tuile(`${s.prieres} · ${s.exaucees}`, "prières · exaucées")}${tuile(`${s.veillees} · ${s.fetes}`, "veillées · fêtes")}${tuile(`${s.palabres} · ${s.exils}`, "palabres · exils")}${tuile(s.rixes, "rixes")}${tuile(`${s.legendes} · ${s.lieuxNommes}`, "légendes · lieux nommés")}${tuile(s.abattus, "abattus")}${tuile(`${s.villages} · ${s.raids}`, "villages · raids")}${tuile(`${s.caravanes} · ${s.batailles}`, "caravanes · batailles")}
      </div>
      <h3>Où ils vont</h3>
      ${
        s.ambitions.length > 0
          ? `<table class="saisons"><tr><th>qui</th><th>quoi</th><th>jours</th></tr>${s.ambitions.map((a) => `<tr><td><span class="lien" data-id="${e(a.personnageId)}">${e(a.prenom)}</span></td><td title="${e(a.but)}">${e(a.cible)}<div class="discret">${e(a.but)}</div></td><td>${a.joursRestants}</td></tr>`).join("")}</table>`
          : "<p class='discret'>aucune ambition en cours (une réponse à une demande de conseil en donne une : bouton « Demander conseil » dans une fiche)</p>"
      }
      <h3>Bâtiments</h3><div class="puces">${batiments}</div>
      <h3>Stocks</h3><div class="puces">${stocks}</div>
      <h3>Faune</h3>
      ${
        s.faune.length > 0
          ? `<table class="saisons"><tr><th>espèce</th><th>troupeaux</th><th>bêtes</th></tr>${s.faune.map((f) => `<tr><td>${e(f.nom)}</td><td>${f.troupeaux}</td><td>${f.betes}</td></tr>`).join("")}</table>`
          : "<p class='discret'>aucune bête aperçue</p>"
      }
      <div class="discret">Chasses : ${s.chasses.reussies} réussie${s.chasses.reussies > 1 ? "s" : ""}, ${s.chasses.ratees} ratée${s.chasses.ratees > 1 ? "s" : ""} · attaques de loups : ${s.attaques}</div>
      <h3>Savoirs du village</h3>
      ${
        s.savoirs.length > 0
          ? `<table class="saisons"><tr><th>savoir</th><th>porté par</th></tr>${s.savoirs.map((v) => `<tr><td title="${e(v.texte)}">${v.genre === "lecon" ? "📜" : "💡"} ${e(v.titre)}</td><td>${v.porteurs}</td></tr>`).join("")}</table>`
          : "<p class='discret'>aucune leçon ni invention encore</p>"
      }
      <h3>Le conteur</h3>
      <p>Phase : <b>${e(LIBELLES_PHASE[etat.conteur.phase])}</b> depuis ${etat.conteur.joursDansPhase} j · tension ${etat.conteur.tension} · pression du monde ${etat.conteur.pression} · ${etat.conteur.crises} épreuve${etat.conteur.crises > 1 ? "s" : ""}, ${etat.conteur.bienfaits} bienfait${etat.conteur.bienfaits > 1 ? "s" : ""}</p>
      ${
        etat.conteur.actes.length > 0
          ? `<ul class="liste actes">${etat.conteur.actes.map((a) => `<li class="${a.bienfait ? "bienfait" : "crise"}"><span class="quand">j ${a.jour}</span>${a.bienfait ? "🎁" : "⚡"} ${e(a.texte)}</li>`).join("")}</ul>`
          : "<p class='discret'>rien encore : le conteur laisse la colonie s'installer</p>"
      }
      ${
        etat.conteur.chroniques.length > 0
          ? `<h3>Chroniques</h3><ul class="liste">${etat.conteur.chroniques.map((ch) => `<li><b>An ${ch.annee}, ${e(ch.titre)}</b> <button class="voir chronique-lire" type="button" data-annee="${ch.annee}" title="Relire">📖</button><div class="discret">${e(ch.texte)}</div></li>`).join("")}</ul>`
          : ""
      }
      <h3>Par saison</h3>
      <table class="saisons"><tr><th>saison</th><th>naissances</th><th>décès</th></tr>${saisons || "<tr><td colspan='3' class='discret'>rien encore</td></tr>"}</table>`;
    for (const b of $("stats").querySelectorAll<HTMLButtonElement>("button.chronique-lire")) {
      b.addEventListener("click", () => {
        this.inter.ouvrirChronique(Number(b.dataset.annee));
      });
    }
    for (const l of $("stats").querySelectorAll<HTMLElement>("[data-id]")) {
      l.addEventListener("click", () => {
        this.inter.selectionner(l.dataset.id ?? null);
        this.afficherOnglet("inspecteur");
      });
    }
  }

  /** Onglet Village : coutumes, notables, factions et tension, griefs, décisions, alliances, tabous. */
  private village(): void {
    const etat = this.magasin.etat;
    if (etat === null) return;
    const init = this.magasin.init;
    const s = etat.societe;
    const jour = etat.moment.jourAbsolu;
    const quand = (j: number): string =>
      init
        ? formaterTick(j * init.ticksParJour, init.ticksParJour, init.joursParSaison).replace(
            /,.*$/,
            "",
          )
        : `jour ${j}`;
    const personne = (p: PersonneCourte): string =>
      `<span class="lien" data-id="${e(p.id)}">${e(p.prenom)}${p.vivant ? "" : " †"}</span>`;
    const tensionClasse = s.tension >= 70 ? "critique" : s.tension >= 40 ? "bas" : "";
    const tensionTexte =
      s.tension >= 70
        ? "le village se déchire : chaque faction veille de son côté"
        : s.tension >= 40
          ? "les rancunes tournent vite en rixe"
          : "le village vit en paix";
    const coutumes = s.coutumes.length
      ? `<ul class="liste">${s.coutumes.map((c) => `<li title="${e(c.morale)}">📜 <b>${e(c.titre)}</b> <span class="discret">depuis ${quand(c.depuisJour)} · ${c.part} % des adultes</span><div class="discret">${e(c.morale)}</div></li>`).join("")}</ul>`
      : "<p class='discret'>aucune coutume encore : une leçon connue de 60 % des adultes pendant trente jours en devient une</p>";
    const notables = s.notables.length
      ? s.notables
          .map(
            (n) =>
              `<span class="puce">⭐ ${personne({ id: n.id, prenom: n.prenom, vivant: true })} <span class="discret">${e(n.nomFamille)} · ${n.prestige}</span></span>`,
          )
          .join("")
      : "<span class='discret'>personne ne se distingue encore (prestige ≥ 15)</span>";
    const factions = s.factions.length
      ? s.factions
          .map(
            (f) =>
              `<span class="puce" title="${e(f.familles.join(", "))}">${e(f.nom)}${f.familles.length > 1 ? ` + ${f.familles.length - 1}` : ""} <span class="discret">· ${f.membres} adulte${f.membres > 1 ? "s" : ""}</span></span>`,
          )
          .join("")
      : "<span class='discret'>calculées chaque semaine</span>";
    const issue: Record<string, string> = {
      ouvert: "à juger à la prochaine veillée",
      repare: "réparé",
      exil: "exil",
      pardonne: "pardonné",
      rixe: "réglé à mains nues",
    };
    const griefs = s.griefs.length
      ? `<table class="saisons"><tr><th>quand</th><th>qui</th><th>quoi</th><th>issue</th></tr>${s.griefs.map((g) => `<tr><td>${e(quand(g.jour))}</td><td>${personne(g.accuse)} <span class="discret">← ${personne(g.plaignant)}</span></td><td>${e(g.motif)} (${e(g.details)})</td><td>${g.etat === "ouvert" ? "⏳ " : ""}${e(issue[g.etat] ?? g.etat)}</td></tr>`).join("")}</table>`
      : "<p class='discret'>aucun grief : un vol vu par un témoin en ouvre un, jugé à la veillée</p>";
    const decisions = s.decisions.length
      ? `<ul class="liste">${s.decisions.map((d) => `<li>${d.adoptee ? "✅" : "❌"} <b>${e(d.libelle)}</b> <span class="discret">${e(quand(d.jour))} · ${d.pour} pour, ${d.contre} contre</span></li>`).join("")}</ul>`
      : "<p class='discret'>aucune décision collective encore (ouvrir les stocks en hiver, creuser un puits commun, bannir)</p>";
    const alliances = s.alliances.length
      ? s.alliances.map(([a, b]) => `<span class="puce">💍 ${e(a)} & ${e(b)}</span>`).join("")
      : "<span class='discret'>aucune : un mariage entre deux familles les allie</span>";
    const tabous = s.lieuxInterdits.length
      ? `<ul class="liste">${s.lieuxInterdits.map((l) => `<li>☠️ ${e(l.motif)} <span class="discret">en (${l.x}, ${l.y}), encore ${l.joursRestants} jour${l.joursRestants > 1 ? "s" : ""}</span></li>`).join("")}</ul>`
      : "<p class='discret'>aucun lieu interdit : une mort inexpliquée en fait un pour une saison</p>";
    const veillee = s.veillee
      ? `<div class="discret">Dernière veillée : ${s.veillee.fete ? `fête ${e(LIBELLES_FETE[s.veillee.fete] ?? s.veillee.fete)}, ` : ""}${s.veillee.participants.length} autour du feu en (${s.veillee.x}, ${s.veillee.y})${etat.tick - s.veillee.tick < 6 ? " — en ce moment" : ""}</div>`
      : "<div class='discret'>pas encore de veillée : il faut trois adultes éveillés près d'un feu à 21 h</div>";
    const vv = etat.villages;
    const nomVillage = (id: string): string => vv.villages.find((v) => v.id === id)?.nom ?? id;
    const villages = vv.villages.length
      ? `<table class="saisons"><tr><th>village</th><th>familles</th><th>habitants</th><th>vivres</th><th>force</th></tr>${vv.villages.map((v) => `<tr><td>${e(v.nom)}${v.origine === "schisme" ? ` <span class="discret">(schisme, ${e(quand(v.fondeJour))})</span>` : ""}${v.enRoute > 0 ? ` <span class="discret">· ${v.enRoute} en route</span>` : ""}</td><td>${e(v.familles.join(", "))}</td><td>${v.habitants}</td><td>${v.nourriture}</td><td>${v.force}</td></tr>`).join("")}</table>`
      : "";
    const relationsV = vv.relations.length
      ? `<ul class="liste">${vv.relations.map((r) => `<li>${r.etat === "guerre" ? "⚔️" : r.etat === "alliance" ? "🤝" : "☮️"} <b>${e(nomVillage(r.a))}</b> et <b>${e(nomVillage(r.b))}</b> : ${e(r.etat)}, attitude ${r.attitude}${r.casusBelli ? ` · casus belli : ${e(r.casusBelli)}` : ""}${r.batailles > 0 ? ` · ${r.batailles} bataille${r.batailles > 1 ? "s" : ""}` : ""}</li>`).join("")}</ul>`
      : vv.villages.length > 1
        ? ""
        : "<p class='discret'>un seul village pour l'instant : un schisme (tension, surpeuplement) en fondera un second à soixante tuiles</p>";
    const mouvements = [
      ...vv.bandes.map(
        (b) =>
          `<span class="puce">🏴 bande de ${b.taille} (${e(b.etat)}) vers ${e(nomVillage(b.cible))}</span>`,
      ),
      ...vv.caravanes.map(
        (c) =>
          `<span class="puce">🐐 caravane ${e(nomVillage(c.de))} → ${e(nomVillage(c.vers))}, ${c.quantite} portions${c.invention ? `, ${e(c.invention)}` : ""}</span>`,
      ),
    ].join("");
    $("village").innerHTML = `
      <h2>Le village au ${e(quand(jour))}</h2>
      <h3>Villages</h3>${villages}${relationsV}${mouvements ? `<div class="puces">${mouvements}</div>` : ""}
      <div class="jauges"><span>tension</span><div class="jauge ${tensionClasse}"><i style="width:${s.tension}%"></i></div><span class="num">${s.tension}</span></div>
      <div class="discret">${tensionTexte}${s.stocksOuverts ? " · les stocks sont ouverts à tous" : ""}${s.bannis.length ? ` · banni${s.bannis.length > 1 ? "s" : ""} : ${s.bannis.map(personne).join(", ")}` : ""}</div>
      ${veillee}
      <h3>Coutumes du village</h3>${coutumes}
      <h3>Notables</h3><div class="puces">${notables}</div>
      <h3>Factions</h3><div class="puces">${factions}</div>
      <h3>Griefs et palabres</h3>${griefs}
      <h3>Décisions</h3>${decisions}
      <h3>Alliances</h3><div class="puces">${alliances}</div>
      <h3>Lieux interdits</h3>${tabous}`;
    for (const l of $("village").querySelectorAll<HTMLElement>("[data-id]")) {
      l.addEventListener("click", () => {
        this.inter.selectionner(l.dataset.id ?? null);
        this.afficherOnglet("inspecteur");
      });
    }
  }

  /** Onglet Légendes : les récits du village, les lieux nommés, les proverbes. */
  private legendes(): void {
    const etat = this.magasin.etat;
    if (etat === null) return;
    const init = this.magasin.init;
    const c = etat.chronique;
    const quand = (t: number): string =>
      init
        ? formaterTick(t, init.ticksParJour, init.joursParSaison).replace(/,.*$/, "")
        : String(t);
    const legendes = c.recits.filter((r) => r.legende);
    const recits = c.recits.filter((r) => !r.legende);
    const bloc = (r: (typeof c.recits)[number]): string =>
      `<li class="${r.legende ? "majeur" : "important"}"><span class="quand">${e(quand(r.tick))}</span>${r.legende ? "📖 " : ""}${e(r.texte)}<div class="discret">racont${r.fois > 1 ? "ée" : "ée"} ${r.fois} fois${r.texte !== r.origine ? ` · les faits : « ${e(r.origine)} »` : ""}</div></li>`;
    $("legendes").innerHTML = `
      <h2>Ce que le village se raconte</h2>
      <p class="discret">Aux veillées, quelqu'un raconte ; les nombres grossissent, les épithètes s'ajoutent. Trois fois racontée, une histoire est une légende. Les faits du journal, eux, ne bougent pas.</p>
      <h3>Légendes</h3>
      ${legendes.length ? `<ol class="liste">${legendes.map(bloc).join("")}</ol>` : "<p class='discret'>aucune légende encore</p>"}
      <h3>Récits en cours</h3>
      ${recits.length ? `<ol class="liste">${recits.map(bloc).join("")}</ol>` : "<p class='discret'>rien de marquant à raconter pour l'instant</p>"}
      <h3>Lieux nommés</h3>
      ${c.lieuxNommes.length ? `<ul class="liste">${c.lieuxNommes.map((l) => `<li>🗺️ <b>${e(l.nom)}</b> <span class="discret">(${l.x}, ${l.y}) · ${e(l.origine)}</span></li>`).join("")}</ul>` : "<p class='discret'>aucun lieu n'a encore de nom : une grande pêche, une mort, un combat, un miracle en donnent</p>"}
      <h3>Proverbes</h3>
      ${c.proverbes.length ? `<ul class="liste">${c.proverbes.map((p) => `<li>💬 « ${e(p.texte)} » <span class="discret">— de la coutume « ${e(p.titre)} »</span></li>`).join("")}</ul>` : "<p class='discret'>aucun proverbe : chaque coutume en engendre un</p>"}`;
  }

  private population(): void {
    const etat = this.magasin.etat;
    if (etat === null) return;
    const vivants = etat.personnages
      .filter((p) => p.vivant)
      .sort((a, b) => a.nomFamille.localeCompare(b.nomFamille) || a.prenom.localeCompare(b.prenom));
    const morts = etat.personnages.filter((p) => !p.vivant);
    const ligne = (p: (typeof vivants)[number]): string =>
      `<li class="personne" data-id="${e(p.id)}"><span class="rond" style="background:${couleurFamille(p.nomFamille)}"></span><span>${e(p.prenom)} ${e(p.nomFamille)}</span><span class="detail">${p.metier ? `${e(p.metier)} · ` : ""}${e(p.stade)}${p.enceinte ? " · enceinte" : ""}${p.endormi ? " · dort" : ""} · ${e(p.intention ?? "—")}</span></li>`;
    $("liste-population").innerHTML =
      vivants.map(ligne).join("") +
      (morts.length > 0
        ? `<li class="discret">† ${morts.map((p) => `${e(p.prenom)} ${e(p.nomFamille)} (${e(p.causeDeces ?? "?")})`).join(", ")}</li>`
        : "");
    $("arbres").innerHTML = arbresDesFamilles(etat.personnages);
    for (const l of $("population").querySelectorAll<HTMLElement>("[data-id]")) {
      l.addEventListener("click", () => {
        this.inter.selectionner(l.dataset.id ?? null);
        this.afficherOnglet("inspecteur");
      });
    }
  }
}

/**
 * Les arbres des familles (M25) : chaque personne sans parents connus ouvre une
 * lignée ; ses enfants s'y rangent (sous la mère quand les deux parents sont là),
 * et ainsi de suite. Les morts restent, barrés.
 */
export function arbresDesFamilles(personnages: readonly PersonnageEtat[]): string {
  const parId = new Map(personnages.map((p) => [p.id, p]));
  const enfants = new Map<string, PersonnageEtat[]>();
  const racines: PersonnageEtat[] = [];
  for (const p of personnages) {
    const parent = p.parents?.find((id) => parId.has(id));
    if (parent === undefined) racines.push(p);
    else {
      const liste = enfants.get(parent) ?? [];
      liste.push(p);
      enfants.set(parent, liste);
    }
  }
  const noeud = (p: PersonnageEtat, profondeur: number): string => {
    const partenaire = p.partenaire === null ? undefined : parId.get(p.partenaire);
    const fils = (enfants.get(p.id) ?? []).sort((a, b) => a.prenom.localeCompare(b.prenom));
    const couple =
      partenaire !== undefined
        ? ` <span class="discret">♥ ${e(partenaire.prenom)}${partenaire.vivant ? "" : " †"}</span>`
        : "";
    const etat = p.vivant ? e(p.stade) : `† ${e(p.causeDeces ?? "")}`;
    return `<li><button class="noeud${p.vivant ? "" : " mort"}" type="button" data-id="${e(p.id)}"><span class="rond" style="background:${couleurFamille(p.nomFamille)}"></span>${e(p.prenom)} ${e(p.nomFamille)} <span class="discret">${etat}</span></button>${couple}${
      fils.length > 0 && profondeur < 8
        ? `<ul>${fils.map((f) => noeud(f, profondeur + 1)).join("")}</ul>`
        : ""
    }</li>`;
  };
  // Une lignée par racine ; les racines d'une même famille de départ sous un même titre.
  const parFamille = new Map<string, PersonnageEtat[]>();
  for (const r of racines) {
    const liste = parFamille.get(r.nomFamille) ?? [];
    liste.push(r);
    parFamille.set(r.nomFamille, liste);
  }
  return [...parFamille.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([nom, rs]) =>
        `<h4><span class="rond" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${couleurFamille(nom)};margin-right:6px"></span>${e(nom)}</h4><ul class="arbre">${rs
          .sort((a, b) => a.prenom.localeCompare(b.prenom))
          .map((r) => noeud(r, 0))
          .join("")}</ul>`,
    )
    .join("");
}
