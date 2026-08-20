import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Server tests only. They boot a real Colyseus server on a fixed port
 * (`@colyseus/testing` hard-codes 2568), so no two files may run at once.
 */
export default defineConfig({
  // The same `@/` the app uses, so a test can import client code that is pure
  // logic. Vite resolves it from tsconfig for the app; vitest needs telling.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
