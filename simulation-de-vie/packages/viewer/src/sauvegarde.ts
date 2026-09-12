/**
 * Sauvegardes côté page : IndexedDB du navigateur (des mégaoctets sans peine,
 * survit aux rechargements et aux republications de la page). Chaque
 * sauvegarde a un nom ; « auto » est celle que la page tient à jour toute
 * seule. Le contenu (`Sauvegarde` du moteur) est opaque pour la page.
 */
import type { Sauvegarde } from "@sdv/core";

const BASE = "simulation-de-vie";
const MAGASIN = "sauvegardes";
export const NOM_AUTO = "auto";

export interface EntreeSauvegarde {
  readonly nom: string;
  readonly date: number;
  readonly seed: string;
  readonly jour: number;
  readonly vivants: number;
}

interface Enregistrement extends EntreeSauvegarde {
  readonly sauvegarde: Sauvegarde;
}

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resoudre, rejeter) => {
    if (typeof indexedDB === "undefined") {
      rejeter(new Error("ce navigateur n'a pas de stockage IndexedDB"));
      return;
    }
    const requete = indexedDB.open(BASE, 1);
    requete.onupgradeneeded = () => {
      const db = requete.result;
      if (!db.objectStoreNames.contains(MAGASIN)) db.createObjectStore(MAGASIN, { keyPath: "nom" });
    };
    requete.onsuccess = () => {
      resoudre(requete.result);
    };
    requete.onerror = () => {
      rejeter(requete.error ?? new Error("IndexedDB indisponible"));
    };
  });
}

function transaction<T>(
  mode: IDBTransactionMode,
  action: (magasin: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return ouvrir().then(
    (db) =>
      new Promise<T>((resoudre, rejeter) => {
        const tx = db.transaction(MAGASIN, mode);
        const requete = action(tx.objectStore(MAGASIN));
        requete.onsuccess = () => {
          resoudre(requete.result);
        };
        requete.onerror = () => {
          rejeter(requete.error ?? new Error("écriture impossible"));
        };
        tx.oncomplete = () => {
          db.close();
        };
      }),
  );
}

/** Les sauvegardes présentes, la plus récente d'abord. */
export async function listerSauvegardes(): Promise<EntreeSauvegarde[]> {
  const tout = await transaction("readonly", (m) => m.getAll() as IDBRequest<Enregistrement[]>);
  return tout
    .map(({ nom, date, seed, jour, vivants }) => ({ nom, date, seed, jour, vivants }))
    .sort((a, b) => b.date - a.date);
}

export async function ecrireSauvegarde(nom: string, sauvegarde: Sauvegarde): Promise<void> {
  const enregistrement: Enregistrement = {
    nom,
    date: sauvegarde.date,
    seed: sauvegarde.seed,
    jour: sauvegarde.jour,
    vivants: sauvegarde.vivants,
    sauvegarde,
  };
  await transaction("readwrite", (m) => m.put(enregistrement));
}

export async function lireSauvegarde(nom: string): Promise<Sauvegarde | null> {
  const e = await transaction(
    "readonly",
    (m) => m.get(nom) as IDBRequest<Enregistrement | undefined>,
  );
  return e?.sauvegarde ?? null;
}

export async function supprimerSauvegarde(nom: string): Promise<void> {
  await transaction("readwrite", (m) => m.delete(nom));
}

/** Nom lisible d'une sauvegarde dans la liste. */
export function decrireSauvegarde(e: EntreeSauvegarde): string {
  const quand = new Date(e.date).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${e.nom === NOM_AUTO ? "Sauvegarde automatique" : e.nom} — jour ${String(e.jour)}, ${String(e.vivants)} vivants, graine ${e.seed} (${quand})`;
}
