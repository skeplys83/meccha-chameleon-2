import { createRoot } from "react-dom/client";
import { Game } from "@/game/Game";
import "./index.css";

/**
 * The whole client entry point.
 *
 * **Deliberately not wrapped in `<StrictMode>`.** R3F's `Canvas` does not
 * survive StrictMode's dev-only double mount: the discarded mount calls
 * `forceContextLoss()` and the canvas stays dead, which shows as a black screen
 * and `THREE.WebGLRenderer: Context Lost`. This is the same rule that used to be
 * spelled `reactStrictMode: false` in `next.config.ts` — the framework changed,
 * the trap did not.
 */
createRoot(document.getElementById("root")!).render(<Game />);
