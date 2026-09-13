/**
 * Sauvegardes distantes : la base de documents de l'artefact (`claude.use("db")`),
 * côté serveur, qui survit au navigateur, à l'application et à l'appareil.
 * Une sauvegarde y est rangée en gzip + base64, découpée en morceaux (un
 * document ne peut dépasser 256 Kio) sous `sauvegardes/<id>/morceaux/<n>`,
 * l'en-tête `sauvegardes/<id>` écrit en dernier : une sauvegarde à moitié
 * écrite n'est jamais prise pour complète. Hors de claude.ai, tout renvoie
 * null ou une liste vide : la page vit alors avec le seul stockage local.
 */
import { estSauvegarde, type Sauvegarde } from "@sdv/core";
import { compresser, compressionDisponible, decompresser } from "./compression.js";
import type { EntreeSauvegarde } from "./sauvegarde.js";

/** Le peu qu'on attend de `claude.use("db")`. */
interface Document {
  readonly exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface RefDocument {
  get(): Promise<Document>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  collection(chemin: string): RefCollection;
}
interface RefCollection {
  doc(id: string): RefDocument;
  get(): Promise<{ readonly docs: readonly (Document & { readonly id: string })[] }>;
}
interface Db {
  doc(chemin: string): RefDocument;
  collection(chemin: string): RefCollection;
}

const COLLECTION = "sauvegardes";
/** Caractères de base64 par morceau : bien sous les 256 Kio d'un document. */
export const TAILLE_MORCEAU = 180_000;
const FORMAT = 1;

interface Entete extends EntreeSauvegarde {
  readonly format: number;
  readonly morceaux: number;
}

let promesseDb: Promise<Db | null> | null = null;

/** La base de l'artefact, ou null hors de claude.ai (mémorisé). */
export function baseDistante(): Promise<Db | null> {
  if (promesseDb !== null) return promesseDb;
  const claude = window.claude;
  if (claude === undefined) {
    promesseDb = Promise.resolve(null);
    return promesseDb;
  }
  promesseDb = claude
    .use("db")
    .then((ns: unknown) =>
      typeof ns === "object" && ns !== null && "doc" in ns && "collection" in ns
        ? (ns as Db)
        : null,
    )
    .catch(() => null);
  return promesseDb;
}

/** Identifiant de document : lettres, chiffres et `_ - . ~ : @ +` seulement. */
export function idDistant(nom: string): string {
  const id = Array.from(nom.normalize("NFD"))
    .map((c) => (/[A-Za-z0-9_\-.~:@+]/.test(c) ? c : /[̀-ͯ]/.test(c) ? "" : "_"))
    .join("")
    .replace(/_+/g, "_")
    .slice(0, 120);
  return id === "" || id === "." || id === ".." ? "partie" : id;
}

/** Octets → base64, par tranches (une chaîne d'un mégaoctet ne passe pas d'un coup). */
export function versBase64(octets: Uint8Array): string {
  let s = "";
  for (let i = 0; i < octets.length; i += 0x8000)
    s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}

export function depuisBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const octets = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) octets[i] = s.charCodeAt(i);
  return octets;
}

/** Découpe une chaîne en morceaux de taille fixe (le dernier plus court). */
export function decouper(texte: string, taille = TAILLE_MORCEAU): string[] {
  const morceaux: string[] = [];
  for (let i = 0; i < texte.length; i += taille) morceaux.push(texte.slice(i, i + taille));
  return morceaux.length === 0 ? [""] : morceaux;
}

/** Une écriture plus récente sur le même nom l'emporte sur une plus ancienne encore en vol. */
const sequences = new Map<string, number>();

/** Écrit une sauvegarde dans la base ; faux si la base n'est pas là. */
export async function ecrireDistante(nom: string, s: Sauvegarde): Promise<boolean> {
  const db = await baseDistante();
  if (db === null || !compressionDisponible()) return false;
  const sequence = (sequences.get(nom) ?? 0) + 1;
  sequences.set(nom, sequence);
  const perimee = (): boolean => sequences.get(nom) !== sequence;
  const octets = new Uint8Array(await compresser(JSON.stringify(s)));
  if (perimee()) return false;
  const morceaux = decouper(versBase64(octets));
  const ref = db.doc(`${COLLECTION}/${idDistant(nom)}`);
  const ancien = await ref.get();
  const anciensMorceaux = ancien.exists ? Number(ancien.data()?.morceaux ?? 0) : 0;
  const sous = ref.collection("morceaux");
  // Trois morceaux à la fois : assez pour aller vite, pas assez pour saturer.
  for (let i = 0; i < morceaux.length; i += 3) {
    if (perimee()) return false;
    await Promise.all(
      morceaux.slice(i, i + 3).map((b64, j) => sous.doc(String(i + j)).set({ b64 })),
    );
  }
  if (perimee()) return false;
  const entete: Entete = {
    nom,
    date: s.date,
    seed: s.seed,
    jour: s.jour,
    vivants: s.vivants,
    taille: octets.byteLength,
    format: FORMAT,
    morceaux: morceaux.length,
  };
  await ref.set({ ...entete });
  // Les morceaux en trop d'une sauvegarde plus grosse, avant.
  for (let i = morceaux.length; i < anciensMorceaux; i++)
    await sous
      .doc(String(i))
      .delete()
      .catch(() => undefined);
  return true;
}

function enteteDepuis(d: Record<string, unknown> | undefined): Entete | null {
  if (d?.format !== FORMAT) return null;
  const { nom, date, seed, jour, vivants, taille, morceaux } = d;
  if (
    typeof nom !== "string" ||
    typeof date !== "number" ||
    typeof seed !== "string" ||
    typeof jour !== "number" ||
    typeof vivants !== "number" ||
    typeof morceaux !== "number"
  )
    return null;
  return {
    nom,
    date,
    seed,
    jour,
    vivants,
    format: FORMAT,
    morceaux,
    ...(typeof taille === "number" ? { taille } : {}),
  };
}

/** Les sauvegardes distantes complètes, la plus récente d'abord ; vide hors de claude.ai. */
export async function listerDistantes(): Promise<EntreeSauvegarde[]> {
  const db = await baseDistante();
  if (db === null) return [];
  const { docs } = await db.collection(COLLECTION).get();
  return docs
    .map((d) => enteteDepuis(d.data()))
    .filter((e): e is Entete => e !== null)
    .map(({ nom, date, seed, jour, vivants, taille }) => ({
      nom,
      date,
      seed,
      jour,
      vivants,
      ...(taille === undefined ? {} : { taille }),
    }))
    .sort((a, b) => b.date - a.date);
}

export async function lireDistante(nom: string): Promise<Sauvegarde | null> {
  const db = await baseDistante();
  if (db === null) return null;
  const ref = db.doc(`${COLLECTION}/${idDistant(nom)}`);
  const entete = enteteDepuis((await ref.get()).data());
  if (entete === null) return null;
  const sous = ref.collection("morceaux");
  const morceaux = await Promise.all(
    Array.from({ length: entete.morceaux }, (_, i) => sous.doc(String(i)).get()),
  );
  const b64 = morceaux
    .map((m) => {
      const v = m.data()?.b64;
      if (typeof v !== "string") throw new Error("sauvegarde distante incomplète");
      return v;
    })
    .join("");
  const contenu: unknown = JSON.parse(await decompresser(depuisBase64(b64).buffer as ArrayBuffer));
  if (!estSauvegarde(contenu)) throw new Error("sauvegarde distante illisible");
  return contenu;
}

export async function supprimerDistante(nom: string): Promise<void> {
  const db = await baseDistante();
  if (db === null) return;
  const ref = db.doc(`${COLLECTION}/${idDistant(nom)}`);
  const entete = enteteDepuis((await ref.get()).data());
  await ref.delete();
  if (entete === null) return;
  const sous = ref.collection("morceaux");
  for (let i = 0; i < entete.morceaux; i++)
    await sous
      .doc(String(i))
      .delete()
      .catch(() => undefined);
}
