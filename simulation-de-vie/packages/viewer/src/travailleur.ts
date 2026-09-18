/**
 * Le travailleur (M26) : la simulation tourne dans un Web Worker, la page ne
 * fait qu'afficher. Les messages sont ceux du serveur, relayés tels quels ; les
 * commandes font le chemin inverse. La sauvegarde s'encode ici et voyage vers
 * la page par copie structurée.
 */
import type { Sauvegarde } from "@sdv/core";
import type { Commande, MessageServeur } from "@sdv/protocole";
import { LiaisonLocale } from "./local.js";
import type { OptionsLocales } from "./local.js";

export type VersTravailleur =
  | { readonly type: "demarrer"; readonly options: OptionsLocales }
  | { readonly type: "commande"; readonly commande: Commande }
  | { readonly type: "sauvegarder"; readonly id: number; readonly immediate: boolean }
  | { readonly type: "fermer" };

export type DuTravailleur =
  | { readonly type: "message"; readonly message: MessageServeur }
  | { readonly type: "connexion"; readonly connecte: boolean }
  | { readonly type: "progression"; readonly jour: number; readonly total: number }
  | {
      readonly type: "sauvegarde";
      readonly id: number;
      readonly sauvegarde: Sauvegarde | null;
      readonly cout: number;
    };

interface PorteeTravailleur {
  onmessage: ((ev: MessageEvent<VersTravailleur>) => void) | null;
  postMessage(m: DuTravailleur): void;
}

const portee = self as unknown as PorteeTravailleur;
let liaison: LiaisonLocale | null = null;

portee.onmessage = (ev: MessageEvent<VersTravailleur>): void => {
  const m = ev.data;
  switch (m.type) {
    case "demarrer":
      liaison?.fermer();
      liaison = new LiaisonLocale(
        m.options,
        (message) => {
          portee.postMessage({ type: "message", message });
        },
        (connecte) => {
          portee.postMessage({ type: "connexion", connecte });
        },
        (jour, total) => {
          portee.postMessage({ type: "progression", jour, total });
        },
      );
      liaison.connecter();
      break;
    case "commande":
      liaison?.envoyer(m.commande);
      break;
    case "sauvegarder": {
      const l = liaison;
      if (l === null) {
        portee.postMessage({ type: "sauvegarde", id: m.id, sauvegarde: null, cout: 0 });
        break;
      }
      if (m.immediate) {
        const debut = performance.now();
        const sauvegarde = l.sauvegarder();
        portee.postMessage({
          type: "sauvegarde",
          id: m.id,
          sauvegarde,
          cout: performance.now() - debut,
        });
      } else {
        void l.sauvegarderSansBloquer().then((sauvegarde) => {
          portee.postMessage({
            type: "sauvegarde",
            id: m.id,
            sauvegarde,
            cout: l.coutSauvegardeMs,
          });
        });
      }
      break;
    }
    case "fermer":
      liaison?.fermer();
      liaison = null;
      break;
  }
};
