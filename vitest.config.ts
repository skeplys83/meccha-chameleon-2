import { defineConfig } from "vitest/config";

/**
 * Server tests only. They boot a real Colyseus server on a fixed port
 * (`@colyseus/testing` hard-codes 2568), so no two files may run at once.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
