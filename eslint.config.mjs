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
      // Browser and Node both, because this repo holds both halves:
      // `src/client/` is browser, `src/server/` is Node, `src/shared/` is both.
      globals: { ...globals.browser, ...globals.node },
    },
  },

  /**
   * The three-way boundary, enforced rather than described.
   *
   * `src/server/` is a different runtime: it runs in Node, never reaches the
   * browser, and may import only from `src/shared/`. `src/shared/` is imported
   * by both, so it may import from neither. Both rules used to be a paragraph
   * of prose in a CLAUDE.md, which is not a thing that fails a build.
   */
  {
    files: ["src/server/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/client/*", "**/client/*", "../client/*"],
              message:
                "server/ is a different runtime and never reaches the browser. Move what you need into src/shared/.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/shared/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/client/*", "@/server/*", "**/client/*", "**/server/*"],
              message:
                "shared/ is imported by both halves, so it may depend on neither. It holds data and constants only.",
            },
          ],
        },
      ],
    },
  },

  /**
   * `hud/` renders outside the Canvas. It talks to the game through props from
   * `app/Game.tsx` and through `net/`, and reaching into the 3D folders directly
   * is what put React state in a frame loop the last time it happened. Reading
   * `POSES` for a label is the one allowed exception.
   */
  {
    files: ["src/client/hud/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/client/world/*",
                "@/client/players/*",
                "@/client/combat/*",
                "@/client/figure/*",
                "!@/client/figure/poses",
              ],
              message:
                "hud/ is DOM outside the Canvas: go through Game.tsx props or net/. (figure/poses is the one exception.)",
            },
          ],
        },
      ],
    },
  },
]);
