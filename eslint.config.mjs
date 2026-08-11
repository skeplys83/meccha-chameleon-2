import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";

/**
 * Lint, without `eslint-config-next`.
 *
 * The one rule set that genuinely mattered from it is `react-hooks` —
 * `exhaustive-deps` in particular, since half this codebase's scars are effects
 * with the wrong dependencies — so it is pulled in directly. The Next-specific
 * rules (`no-img-element`, `no-html-link-for-pages`, …) described a framework
 * this project no longer uses.
 */
export default defineConfig([
  globalIgnores(["dist/**", "node_modules/**", ".next/**"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  // `configs.flat.*`, not `configs["recommended-latest"]` — the top-level names
  // are still the eslintrc shape, with `plugins` as an array of strings, which
  // flat config rejects outright.
  reactHooks.configs.flat["recommended-latest"],
  {
    files: ["**/*.{ts,tsx,mts,mjs}"],
    languageOptions: {
      // Browser and Node both, because this repo holds both halves: `src/game/`
      // is browser code except `src/game/server/`, which Node runs directly.
      globals: { ...globals.browser, ...globals.node },
    },
  },
]);
