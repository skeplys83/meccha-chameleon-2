import { useEffect } from "react";
import { DEV, toggleDevMode } from "@/client/app/dev";

/**
 * Developer mode's keyboard half. The chip in the readout is the visible
 * toggle; this exists because a hunter holds the pointer lock and cannot click
 * anything, and because backquote is bound to nothing in `players/controls.ts`.
 * Compiled out of the build with the rest of developer mode.
 */
export function useDevHotkey() {
  useEffect(() => {
    if (!DEV) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Backquote" || e.metaKey || e.ctrlKey || e.altKey) return;
      // Not while somebody is typing their name into the menu.
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      toggleDevMode();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
