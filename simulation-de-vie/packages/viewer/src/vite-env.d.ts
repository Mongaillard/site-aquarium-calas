/// <reference types="vite/client" />

/** Capacités offertes par la page publiée sur claude.ai (voir `claude.ts`). */
interface Window {
  claude?: { use(nom: string): Promise<unknown> };
}

/** Une image importée avec `?inline` (M27) : toujours une URL `data:`, quelle que soit sa taille. */
declare module "*.png?inline" {
  const src: string;
  export default src;
}
