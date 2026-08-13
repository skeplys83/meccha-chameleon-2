import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    outDir: "dist",
    // three, R3F, rapier and colyseus come to about 3.6 MB, and there is nothing
    // to route-split in a single-page game. It is all self-hosted, so the
    // size costs a moment on first load and nothing after that.
    chunkSizeWarningLimit: 4000,
  },
});
