/**
 * Sauvegardes côté page : IndexedDB du navigateur (des mégaoctets sans peine,
 * survit aux rechargements et aux republications de la page). Chaque
 * sauvegarde a un nom ; « auto » est celle que la page tient à jour toute
 * seule. Le contenu (`Sauvegarde` du moteur) est opaque pour la page.
 *
 * Deux façons d'écrire : compressée (gzip hors du fil principal, pour les
 * sauvegardes de routine) ou immédiate (le JSON tel quel, écriture lancée
 * dans la foulée, pour les sorties de page où le navigateur peut tuer la
 * page avant qu'un travail différé n'aboutisse). Une écriture plus récente
 * sur le même nom l'emporte toujours sur une plus ancienne encore en vol.
 */
import { estSauvegarde, type Sauvegarde } from "@sdv/core";
import {
  COMPRESSION,
  compresserParMorceaux,
  compressionDisponible,
  decompresser,
} from "./compression.js";

const BASE = "simulation-de-vie";
const MAGASIN = "sauvegardes";
export const NOM_AUTO = "auto";

export interface EntreeSauvegarde {
  readonly nom: string;
  readonly date: number;
  readonly seed: string;
  readonly jour: number;
  readonly vivants: number;
  /** Taille sur le disque en octets (connue pour les sauvegardes compressées ou immédiates). */
  readonly taille?: number;
}

interface Enregistrement extends EntreeSauvegarde {
  /** Contenu à plat (anciennes sauvegardes, ou navigateur sans compression)… */
  readonly sauvegarde?: Sauvegarde;
  /** …ou le JSON tel quel (sauvegarde immédiate, à la sortie de la page)… */
  readonly texte?: string;
  /** …ou compressé : le JSON de la sauvegarde en gzip. */
  readonly octets?: ArrayBuffer;
  readonly compression?: typeof COMPRESSION;
}

/** Connexion gardée ouverte : une écriture immédiate n'attend alors rien. */
let baseOuverte: IDBDatabase | null = null;
let ouverture: Promise<IDBDatabase> | null = null;

function ouvrir(): Promise<IDBDatabase> {
  if (baseOuverte !== null) return Promise.resolve(baseOuverte);
  if (ouverture !== null) return ouverture;
  const promesse = new Promise<IDBDatabase>((resoudre, rejeter) => {
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
      const db = requete.result;
      baseOuverte = db;
      // Fermée par le navigateur (autre onglet, nettoyage) : on rouvrira à la prochaine demande.
      db.onclose = () => {
        if (baseOuverte === db) baseOuverte = null;
      };
      db.onversionchange = () => {
        db.close();
        if (baseOuverte === db) baseOuverte = null;
      };
      resoudre(db);
    };
    requete.onerror = () => {
      rejeter(requete.error ?? new Error("IndexedDB indisponible"));
    };
  }).finally(() => {
    ouverture = null;
  });
  ouverture = promesse;
  return promesse;
}

/** Ouvre la base dès le chargement, pour que la sauvegarde de sortie n'ait pas à l'attendre. */
export function preparerStockage(): void {
  ouvrir().catch(() => undefined);
}

function requete<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (magasin: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise<T>((resoudre, rejeter) => {
    const tx = db.transaction(MAGASIN, mode);
    const r = action(tx.objectStore(MAGASIN));
    r.onsuccess = () => {
      resoudre(r.result);
    };
    r.onerror = () => {
      rejeter(r.error ?? new Error("écriture impossible"));
    };
  });
}

function transaction<T>(
  mode: IDBTransactionMode,
  action: (magasin: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return ouvrir().then((db) => requete(db, mode, action));
}

/** Les sauvegardes présentes, la plus récente d'abord. */
export async function listerSauvegardes(): Promise<EntreeSauvegarde[]> {
  const tout = await transaction("readonly", (m) => m.getAll() as IDBRequest<Enregistrement[]>);
  return tout
    .map(({ nom, date, seed, jour, vivants, octets, texte }) => ({
      nom,
      date,
      seed,
      jour,
      vivants,
      ...(octets !== undefined
        ? { taille: octets.byteLength }
        : texte !== undefined
          ? { taille: texte.length }
          : {}),
    }))
    .sort((a, b) => b.date - a.date);
}

/** Numéro de la dernière écriture demandée par nom : une plus ancienne encore en vol s'efface. */
const sequences = new Map<string, number>();

function entete(nom: string, s: Sauvegarde): EntreeSauvegarde {
  return { nom, date: s.date, seed: s.seed, jour: s.jour, vivants: s.vivants };
}

/**
 * Écrit une sauvegarde. `immediate` : le JSON part tel quel, et l'écriture
 * démarre dans la foulée si la base est déjà ouverte (sortie de page).
 * Sinon : compressée en flux, par tranches, quand le navigateur sait le faire
 * (`octets` : la compression déjà lancée par ailleurs, pour ne pas la refaire).
 */
export function ecrireSauvegarde(
  nom: string,
  s: Sauvegarde,
  immediate = false,
  octets: Promise<ArrayBuffer | null> | null = null,
): Promise<void> {
  const sequence = (sequences.get(nom) ?? 0) + 1;
  sequences.set(nom, sequence);
  const perimee = (): boolean => sequences.get(nom) !== sequence;
  const ecrire = (db: IDBDatabase, e: Enregistrement): Promise<void> =>
    perimee() ? Promise.resolve() : requete(db, "readwrite", (m) => m.put(e)).then(() => undefined);
  if (immediate || !compressionDisponible()) {
    const e: Enregistrement = immediate
      ? { ...entete(nom, s), texte: JSON.stringify(s) }
      : { ...entete(nom, s), sauvegarde: s };
    return baseOuverte !== null ? ecrire(baseOuverte, e) : ouvrir().then((db) => ecrire(db, e));
  }
  return (octets ?? compresserParMorceaux(s, perimee)).then((o) =>
    o === null || perimee()
      ? undefined
      : ouvrir().then((db) =>
          ecrire(db, { ...entete(nom, s), octets: o, compression: COMPRESSION }),
        ),
  );
}

export async function lireSauvegarde(nom: string): Promise<Sauvegarde | null> {
  const e = await transaction(
    "readonly",
    (m) => m.get(nom) as IDBRequest<Enregistrement | undefined>,
  );
  if (e === undefined) return null;
  let contenu: unknown;
  if (e.octets !== undefined) {
    if (e.compression !== COMPRESSION || !compressionDisponible())
      throw new Error("cette sauvegarde est compressée d'une façon que ce navigateur ne lit pas");
    contenu = JSON.parse(await decompresser(e.octets));
  } else if (e.texte !== undefined) {
    contenu = JSON.parse(e.texte);
  } else {
    return e.sauvegarde ?? null;
  }
  if (!estSauvegarde(contenu)) throw new Error("sauvegarde illisible");
  return contenu;
}

/** Copie une sauvegarde sous un autre nom, telle quelle (sans la relire ni la réécrire). */
export async function copierSauvegarde(nom: string, nouveauNom: string): Promise<boolean> {
  const e = await transaction(
    "readonly",
    (m) => m.get(nom) as IDBRequest<Enregistrement | undefined>,
  );
  if (e === undefined) return false;
  await transaction("readwrite", (m) => m.put({ ...e, nom: nouveauNom }));
  return true;
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
  const taille =
    e.taille === undefined
      ? ""
      : `, ${(e.taille / 1_048_576).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
  return `${e.nom === NOM_AUTO ? "Sauvegarde automatique" : e.nom} — jour ${String(e.jour)}, ${String(e.vivants)} vivants, graine ${e.seed}${taille} (${quand})`;
}
