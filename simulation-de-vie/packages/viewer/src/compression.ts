/**
 * Compression des sauvegardes : gzip par `CompressionStream` quand le
 * navigateur l'offre (tous les navigateurs récents). Une sauvegarde de
 * plusieurs mégaoctets tient en quelques centaines de kilo-octets et
 * s'écrit d'autant plus vite.
 *
 * Une grande colonie fait un JSON de plusieurs mégaoctets : le bâtir d'un
 * bloc, puis le passer d'un bloc au compresseur, fige la page une demi-
 * seconde sur un téléphone. La sauvegarde est donc sérialisée par morceaux
 * (chaque personnage, chaque morceau de carte), chaque morceau poussé
 * aussitôt dans le flux gzip, en rendant la main toutes les quelques
 * millisecondes : rien n'est jamais assemblé en une seule chaîne.
 */
export const COMPRESSION = "gzip" as const;

export function compressionDisponible(): boolean {
  return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

/** Travail synchrone par tranche avant de rendre la main. */
const TRANCHE_MS = 8;

const souffler = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** `JSON.stringify` rend en vérité undefined pour ce que JSON ne dit pas (fonctions, undefined). */
function json(valeur: unknown): string {
  const texte: unknown = JSON.stringify(valeur);
  return typeof texte === "string" ? texte : "null";
}

/** Les tableaux sérialisés élément par élément (l'essentiel du poids d'une sauvegarde). */
const PAR_ELEMENT = new Set(["personnages", "morceaux"]);

/**
 * Le JSON d'une valeur, exactement celui de `JSON.stringify`, mais en morceaux :
 * les objets et les tableaux nommés dans `PAR_ELEMENT` sont parcourus, tout le
 * reste est sérialisé d'un coup.
 */
export function* jsonParMorceaux(valeur: unknown, profondeur = 0): Generator<string> {
  if (
    profondeur > 3 ||
    valeur === null ||
    typeof valeur !== "object" ||
    Array.isArray(valeur) ||
    valeur instanceof Map ||
    valeur instanceof Set
  ) {
    yield json(valeur);
    return;
  }
  let premier = true;
  yield "{";
  for (const [cle, v] of Object.entries(valeur)) {
    if (v === undefined || typeof v === "function") continue;
    const entete = `${premier ? "" : ","}${JSON.stringify(cle)}:`;
    premier = false;
    if (Array.isArray(v) && PAR_ELEMENT.has(cle)) {
      yield `${entete}[`;
      for (let i = 0; i < v.length; i++) yield `${i === 0 ? "" : ","}${json(v[i])}`;
      yield "]";
    } else {
      yield entete;
      yield* jsonParMorceaux(v, profondeur + 1);
    }
  }
  yield "}";
}

/**
 * Le JSON d'une sauvegarde, assemblé par morceaux en rendant la main entre
 * deux tranches (pour qui a besoin du texte entier, tests et navigateurs
 * sans compression).
 */
export async function stringifyParMorceaux(sauvegarde: unknown): Promise<string> {
  const morceaux: string[] = [];
  let debut = performance.now();
  for (const m of jsonParMorceaux(sauvegarde)) {
    morceaux.push(m);
    if (performance.now() - debut > TRANCHE_MS) {
      await souffler();
      debut = performance.now();
    }
  }
  return morceaux.join("");
}

/**
 * Gzip d'une sauvegarde, en flux : chaque morceau de JSON est encodé et poussé
 * dans le compresseur dès qu'il est produit, la page reprenant la main toutes
 * les quelques millisecondes. `abandonner` (vérifié entre deux tranches) rend
 * null sans finir le travail.
 */
export async function compresserParMorceaux(
  sauvegarde: unknown,
  abandonner: () => boolean = () => false,
): Promise<ArrayBuffer | null> {
  const flux = new CompressionStream(COMPRESSION);
  const sortie = new Response(flux.readable).arrayBuffer();
  const ecrivain = flux.writable.getWriter();
  const encodeur = new TextEncoder();
  let debut = performance.now();
  try {
    for (const m of jsonParMorceaux(sauvegarde)) {
      await ecrivain.write(encodeur.encode(m));
      if (performance.now() - debut > TRANCHE_MS) {
        await souffler();
        if (abandonner()) {
          await ecrivain.abort();
          await sortie.catch(() => undefined);
          return null;
        }
        debut = performance.now();
      }
    }
    await ecrivain.close();
  } catch (erreur: unknown) {
    await ecrivain.abort().catch(() => undefined);
    await sortie.catch(() => undefined);
    throw erreur;
  }
  return sortie;
}

/** Texte → octets gzip (d'un bloc). */
export async function compresser(texte: string): Promise<ArrayBuffer> {
  const flux = new Blob([texte]).stream().pipeThrough(new CompressionStream(COMPRESSION));
  return new Response(flux).arrayBuffer();
}

/** Octets gzip → texte. */
export async function decompresser(octets: ArrayBuffer): Promise<string> {
  const flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream(COMPRESSION));
  return new Response(flux).text();
}
