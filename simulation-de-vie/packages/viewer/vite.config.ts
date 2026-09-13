import { defineConfig } from "vite";

export default defineConfig({
  build: { outDir: "dist", emptyOutDir: true, sourcemap: true },
  server: {
    port: 5173,
    proxy: { "/ws": { target: "ws://localhost:8080", ws: true } },
  },
});
