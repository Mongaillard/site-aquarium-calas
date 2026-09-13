/**
 * Compression des sauvegardes : gzip par `CompressionStream` quand le
 * navigateur l'offre (tous les navigateurs récents). Une sauvegarde de
 * plusieurs mégaoctets tient en quelques centaines de kilo-octets et
 * s'écrit d'autant plus vite ; le travail se fait hors du fil principal.
 */
export const COMPRESSION = "gzip" as const;

export function compressionDisponible(): boolean {
  return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

/** Texte → octets gzip. */
export async function compresser(texte: string): Promise<ArrayBuffer> {
  const flux = new Blob([texte]).stream().pipeThrough(new CompressionStream(COMPRESSION));
  return new Response(flux).arrayBuffer();
}

/** Octets gzip → texte. */
export async function decompresser(octets: ArrayBuffer): Promise<string> {
  const flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream(COMPRESSION));
  return new Response(flux).text();
}
