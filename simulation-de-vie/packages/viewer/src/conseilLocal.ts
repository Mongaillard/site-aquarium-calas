/**
 * Réponse aux demandes de conseil, sans Claude (M28) : appeler Claude à chaque
 * question coûtait trop de crédit. Quand un personnage demande conseil,
 * l'observateur répond dans ce dialogue ; sans réponse en cinq secondes, une
 * option est tirée au sort parmi le catalogue que le moteur a proposé.
 */
import type { Commande, OptionConseil, QuestionConseil } from "@sdv/protocole";

const DELAI_MS = 5000;

export class ConseilLocal {
  private questionId: string | null = null;
  private minuteur: ReturnType<typeof setTimeout> | null = null;
  private compteur: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly dlg: HTMLDialogElement,
    private readonly titre: HTMLElement,
    private readonly sousTitre: HTMLElement,
    private readonly liste: HTMLOListElement,
    private readonly compteEl: HTMLElement,
    private readonly envoyer: (c: Commande) => void,
  ) {
    // Le tirage au sort ne doit pas être esquivé par une fermeture au clavier.
    this.dlg.addEventListener("cancel", (ev) => {
      ev.preventDefault();
    });
  }

  /** À appeler à chaque rafraîchissement du panneau : ouvre toute nouvelle question. */
  suivre(q: QuestionConseil | undefined): void {
    if (q === undefined) {
      if (this.questionId !== null) this.fermer();
      return;
    }
    if (q.id === this.questionId) return;
    this.ouvrir(q);
  }

  private repondre(q: QuestionConseil, choix: string): void {
    this.envoyer({
      type: "conseil",
      questionId: q.id,
      personnageId: q.personnageId,
      choix,
      pensee: "",
    });
    this.fermer();
  }

  private bouton(libelle: string, pourquoi: string | null, onClick: () => void): HTMLLIElement {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.append(libelle);
    if (pourquoi !== null) {
      const span = document.createElement("span");
      span.className = "discret";
      span.textContent = ` — ${pourquoi}`;
      b.append(span);
    }
    b.addEventListener("click", onClick);
    li.append(b);
    return li;
  }

  private ouvrir(q: QuestionConseil): void {
    this.fermer();
    this.questionId = q.id;
    this.titre.textContent = `❓ ${q.contexte.prenom} ${q.contexte.nomFamille} demande conseil`;
    this.sousTitre.textContent = q.contexte.motto;
    this.liste.replaceChildren(
      ...q.options.map((o: OptionConseil) =>
        this.bouton(o.libelle, o.pourquoi, () => {
          this.repondre(q, o.id);
        }),
      ),
      this.bouton("Rien de tout ça", null, () => {
        this.repondre(q, "aucun");
      }),
    );
    let restant = Math.ceil(DELAI_MS / 1000);
    this.compteEl.textContent = String(restant);
    this.compteur = setInterval(() => {
      restant -= 1;
      this.compteEl.textContent = String(Math.max(0, restant));
    }, 1000);
    this.minuteur = setTimeout(() => {
      const options = q.options;
      const choix =
        options.length > 0
          ? (options[Math.floor(Math.random() * options.length)]?.id ?? "aucun")
          : "aucun";
      this.repondre(q, choix);
    }, DELAI_MS);
    if (!this.dlg.open) this.dlg.showModal();
  }

  private fermer(): void {
    if (this.minuteur !== null) clearTimeout(this.minuteur);
    if (this.compteur !== null) clearInterval(this.compteur);
    this.minuteur = null;
    this.compteur = null;
    this.questionId = null;
    if (this.dlg.open) this.dlg.close();
  }
}
