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
      `${biomes}<br>${ressources}<br>● personnage (couleur = famille, contour = moral) · lettres = bâtiments (A abri, M maison, E entrepôt, f feu) · pointillé = chantier`;
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
        if (force || version !== this.derniereVersionJournal) {
          this.journal();
          this.derniereVersionJournal = version;
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
        if (force || version !== this.derniereVersionPopulation) {
          this.population();
          this.derniereVersionPopulation = version;
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

  private inspecteur(): void {
    const conteneur = $("inspecteur");
    const fiche = this.magasin.fiche;
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
        <span class="nom">${e(f.prenom)} ${e(f.nomFamille)}</span>
        <span class="actions"><button id="btn-suivre" class="${this.magasin.suivre ? "actif" : ""}" title="Caméra qui suit ce personnage (s)">suivre</button><button id="btn-fermer" title="Fermer (échap)">✕</button></span>
      </div>
      <div class="discret">${etat} · réputation ${f.reputation} · ${f.lieuxConnus} lieux connus · ${f.nombreSouvenirs} souvenirs</div>
      <div class="pensee">« ${e(f.pensee)} »</div>
      <h3>Maintenant</h3>
      <div>Intention : <b>${e(f.intention ?? "—")}</b>${f.projet ? ` · projet : ${e(NOMS_BATIMENT[f.projet] ?? f.projet)}` : ""}</div>
      <div class="discret">Action : ${e(f.action ?? "—")}${f.plan.length > 0 ? ` · puis ${e(f.plan.join(", "))}` : ""}</div>
      <h3>Besoins</h3>
      <div class="jauges">${jauge("faim", f.besoins.faim)}${jauge("soif", f.besoins.soif)}${jauge("sommeil", f.besoins.sommeil)}${jauge("chaleur", f.besoins.chaleur)}${jauge("sécurité", f.besoins.securite)}${jauge("social", f.besoins.social)}${jauge("moral", f.besoins.moral)}</div>
      <h3>Famille</h3>
      <div>Parents : ${liste(f.famille.parents)} · Partenaire : ${f.famille.partenaire ? personne(f.famille.partenaire) : "—"}</div>
      <div>Enfants : ${liste(f.famille.enfants)} · Fratrie : ${liste(f.famille.fratrie)}</div>
      <h3>Relations</h3>
      ${relations ? `<table class="relations"><tr class="discret"><td>qui</td><td>lien</td><td class="num">aff.</td><td class="num">conf.</td><td class="num">attir.</td><td class="num">dette</td></tr>${relations}</table>` : "<p class='discret'>personne encore</p>"}
      <h3>Inventaire (${Object.values(f.inventaire.ressources).reduce((a, b) => a + b, 0) + f.inventaire.objets.length}/${f.inventaire.capacite})</h3>
      <div class="puces">${inventaire}</div>
      <h3>Compétences</h3>
      <div class="puces">${competences}</div>
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
        ${tuile(s.appelsLLM, "appels IA")}${tuile(`${s.coutLLM.toFixed(2)} $`, "coût IA")}
      </div>
      <h3>Bâtiments</h3><div class="puces">${batiments}</div>
      <h3>Stocks</h3><div class="puces">${stocks}</div>
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
      `<li class="personne" data-id="${e(p.id)}"><span class="rond" style="background:${couleurFamille(p.nomFamille)}"></span><span>${e(p.prenom)} ${e(p.nomFamille)}</span><span class="detail">${e(p.stade)}${p.enceinte ? " · enceinte" : ""}${p.endormi ? " · dort" : ""} · ${e(p.intention ?? "—")}</span></li>`;
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
