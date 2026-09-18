/**
 * Réponse aux demandes de conseil, sans Claude ni dialogue (M28) : appeler
 * Claude à chaque question coûtait trop de crédit, et faire choisir
 * l'observateur encombrait l'écran. Dès qu'une question s'ouvre, une option
 * du catalogue proposé par le moteur est tirée au sort et envoyée comme un
 * choix ; le moteur la valide comme n'importe quelle réponse.
 */
import type { Commande, QuestionConseil } from "@sdv/protocole";

export class ConseilLocal {
  private repondue: string | null = null;

  constructor(private readonly envoyer: (c: Commande) => void) {}

  /** À appeler à chaque rafraîchissement du panneau : répond à toute nouvelle question. */
  suivre(q: QuestionConseil | undefined): void {
    if (q === undefined || q.id === this.repondue) return;
    this.repondue = q.id;
    const option = q.options[Math.floor(Math.random() * q.options.length)];
    this.envoyer({
      type: "conseil",
      questionId: q.id,
      personnageId: q.personnageId,
      choix: option?.id ?? "aucun",
      pensee: "",
    });
  }
}
