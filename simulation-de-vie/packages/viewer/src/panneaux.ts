/** Panneaux DOM : inspecteur, journal, conversations, statistiques, population, barre. */
import type { Commande, MessageFiche, PersonneCourte } from "@sdv/protocole";
import { VITESSES } from "@sdv/protocole";
import type { Magasin } from "./etat.js";
import {
  COULEURS_BIOME,
  COULEURS_RESSOURCE,
  LIBELLES_METEO,
  LIBELLES_SAISON,
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
  private derniereVersionBatiment = -1;
  private dernierRenduLent = 0;
  private ficheAffichee: MessageFiche | null = null;

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
    $("btn-pause").addEventListener("click", () => {
      this.inter.envoyer({ type: this.magasin.etat?.pause ? "reprendre" : "pause" });
    });
    $("btn-tick").addEventListener("click", () => {
      this.inter.envoyer({ type: "tick" });
    });
    $("btn-aube").addEventListener("click", () => {
      this.inter.envoyer({ type: "aube" });
    });
    const vitesses = $("vitesses");
    for (const v of VITESSES) {
      const b = document.createElement("button");
      b.textContent = `×${v}`;
      b.dataset.vitesse = String(v);
      b.addEventListener("click", () => {
        this.inter.envoyer({ type: "vitesse", ticksParSeconde: v });
        this.inter.envoyer({ type: "reprendre" });
      });
      vitesses.append(b);
    }
  }

  private installerOnglets(): void {
    for (const b of $("onglets").querySelectorAll<HTMLButtonElement>("button")) {
      b.addEventListener("click", () => {
        this.afficherOnglet(b.dataset.onglet ?? "inspecteur");
      });
    }
  }

  afficherOnglet(nom: string): void {
    this.ongletActif = nom;
    for (const b of $("onglets").querySelectorAll<HTMLButtonElement>("button"))
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
    $("horloge").textContent = formaterMoment(etat.moment);
    $("meteo").textContent = LIBELLES_METEO[etat.meteo] ?? etat.meteo;
    $("btn-pause").textContent = etat.pause ? "▶" : "⏸";
    for (const b of $("vitesses").querySelectorAll<HTMLButtonElement>("button")) {
      b.classList.toggle(
        "actif",
        !etat.pause && Number(b.dataset.vitesse) === etat.ticksParSeconde,
      );
    }
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
    for (const l of conteneur.querySelectorAll<HTMLElement>("[data-id]")) {
      l.addEventListener("click", () => {
        this.inter.selectionner(l.dataset.id ?? null);
      });
    }
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
        ? `<ol class="liste">${l.map((s) => `<li class="${s.importance >= 6 ? "majeur" : s.importance >= 3 ? "important" : ""}"><span class="quand">${e(tick(s.tick))}</span>${e(s.texte)}</li>`).join("")}</ol>`
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
      lignes.push(
        `<li class="${classe}"><span class="quand">${e(quand)}</span>${e(resumerEvenement(ev, (id) => this.magasin.nom(id)))}${detail}</li>`,
      );
    }
    $("liste-journal").innerHTML =
      lignes.join("") || "<li class='discret'>rien pour l'instant</li>";
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
        ${tuile(s.malades, "malades")}${tuile(s.betail, "bêtes apprivoisées")}${tuile(s.champs, "champs")}${tuile(s.tuilesDecouvertes, "tuiles découvertes")}${tuile(s.morceaux, "morceaux du monde")}${tuile(s.appelsLLM, "appels IA")}${tuile(`${s.coutLLM.toFixed(2)} $`, "coût IA")}
      </div>
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
      <h3>Par saison</h3>
      <table class="saisons"><tr><th>saison</th><th>naissances</th><th>décès</th></tr>${saisons || "<tr><td colspan='3' class='discret'>rien encore</td></tr>"}</table>`;
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
    for (const l of $("liste-population").querySelectorAll<HTMLElement>("[data-id]")) {
      l.addEventListener("click", () => {
        this.inter.selectionner(l.dataset.id ?? null);
        this.afficherOnglet("inspecteur");
      });
    }
  }
}
