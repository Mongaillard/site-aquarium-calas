/// <reference types="vite/client" />

/** Capacités offertes par la page publiée sur claude.ai (voir `claude.ts`). */
interface Window {
  claude?: { use(nom: string): Promise<unknown> };
}
