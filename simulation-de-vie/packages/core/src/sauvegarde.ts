/**
 * Sauvegarde et restauration d'un monde entier, à l'identique : après une
 * restauration, la simulation continue exactement comme l'original (même
 * journal, mêmes décisions). La sérialisation est structurelle — chaque champ
 * est parcouru, rien n'est recopié à la main — avec des marqueurs pour ce que
 * JSON ne sait pas dire : Map, Set, Infinity, générateurs aléatoires, flux de
 * mémoire. Les tuiles se regénèrent de la graine ; seuls leurs gisements, leurs
 * découvertes et leurs bâtiments sont sauvés.
 */
import { Rng } from "./rng.js";
import { FluxMemoire } from "./memoire/souvenir.js";

/** Version du format ; on refuse une sauvegarde d'un autre format. */
export const VERSION_SAUVEGARDE = 1;
export const FORMAT_SAUVEGARDE = "simulation-de-vie";
/** Événements gardés dans une sauvegarde (le journal complet serait énorme). */
export const EVENEMENTS_GARDES = 3000;

/** Convertit un graphe d'objets (sans cycles) en valeur JSON avec marqueurs. */
export function encoder(valeur: unknown): unknown {
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur === "number") {
    if (Number.isNaN(valeur)) return { __nombre: "nan" };
    if (valeur === Infinity) return { __nombre: "inf" };
    if (valeur === -Infinity) return { __nombre: "-inf" };
    return valeur;
  }
  if (typeof valeur !== "object") return valeur;
  if (Array.isArray(valeur)) return valeur.map(encoder);
  if (valeur instanceof Rng) {
    const e = valeur.etat();
    return { __rng: { graine: e.graine, s: [...e.s] } };
  }
  if (valeur instanceof FluxMemoire) {
    return { __memoire: encoder({ options: valeur.options, ...valeur.etat() }) };
  }
  if (valeur instanceof Map)
    return { __map: [...valeur.entries()].map(([k, v]) => [encoder(k), encoder(v)]) };
  if (valeur instanceof Set) return { __set: [...valeur].map(encoder) };
  if (valeur instanceof Uint8Array) return { __octets: [...valeur] };
  const resultat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valeur as Record<string, unknown>)) {
    if (v === undefined) continue;
    resultat[k] = encoder(v);
  }
  return resultat;
}

/** Inverse d'`encoder`. */
export function decoder(valeur: unknown): unknown {
  if (valeur === null || typeof valeur !== "object") return valeur;
  if (Array.isArray(valeur)) return valeur.map(decoder);
  const o = valeur as Record<string, unknown>;
  if (typeof o.__nombre === "string")
    return o.__nombre === "inf" ? Infinity : o.__nombre === "-inf" ? -Infinity : NaN;
  if (typeof o.__rng === "object" && o.__rng !== null) {
    const r = o.__rng as { graine: string; s: number[] };
    return Rng.depuisEtat({
      graine: r.graine,
      s: [r.s[0] ?? 0, r.s[1] ?? 0, r.s[2] ?? 0, r.s[3] ?? 0],
    });
  }
  if (typeof o.__memoire === "object" && o.__memoire !== null) {
    const m = decoder(o.__memoire) as {
      options: FluxMemoire["options"];
      souvenirs: ReturnType<FluxMemoire["etat"]>["souvenirs"];
      prochainId: number;
    };
    const flux = new FluxMemoire(m.options);
    flux.restaurer(m);
    return flux;
  }
  if (Array.isArray(o.__map))
    return new Map(
      (o.__map as unknown[][]).map((paire) => [decoder(paire[0]), decoder(paire[1])] as const),
    );
  if (Array.isArray(o.__set)) return new Set((o.__set as unknown[]).map(decoder));
  if (Array.isArray(o.__octets)) return Uint8Array.from(o.__octets as number[]);
  const resultat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) resultat[k] = decoder(v);
  return resultat;
}

/** Enveloppe d'une sauvegarde : ce que la page ou un fichier transporte. */
export interface Sauvegarde {
  readonly format: typeof FORMAT_SAUVEGARDE;
  readonly version: number;
  /** Date réelle (ms depuis 1970) de la sauvegarde. */
  readonly date: number;
  readonly seed: string;
  readonly tick: number;
  readonly jour: number;
  readonly vivants: number;
  /** L'état du moteur, encodé (voir `encoder`) ; opaque pour la page. */
  readonly etat: unknown;
}

export function estSauvegarde(v: unknown): v is Sauvegarde {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<Sauvegarde>;
  return (
    s.format === FORMAT_SAUVEGARDE &&
    typeof s.version === "number" &&
    typeof s.tick === "number" &&
    typeof s.etat === "object" &&
    s.etat !== null
  );
}
