import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * The client build. The *server* has no build step at all — Node strips its
 * types at load — so this covers only what the browser gets.
 *
 * There is no dev-server config here on purpose: `npm run dev` does not run
 * `vite`, it runs `node src/game/server/index.ts`, which creates this same
 * config in middleware mode and mounts it behind the game server. One port, one
 * process, and the LAN URL the banner prints is the only one anybody needs.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    outDir: "dist",
    // three, R3F, rapier and colyseus come to about 3.6 MB, and there is nothing
    // to route-split in a single-page game. It is all served off the LAN, so the
    // size costs a moment on first load and nothing after that.
    chunkSizeWarningLimit: 4000,
  },
});
