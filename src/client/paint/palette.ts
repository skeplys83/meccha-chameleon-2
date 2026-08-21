/**
 * The colours you have painted with, most recent first.
 *
 * **This replaced a fixed grid of ten presets.** A preset is a guess at what
 * somebody wants; a chameleon is mixing a colour to match a wall, and the
 * colour they mixed two walls ago is far more use than "rose" — so the row
 * under the wheel is now a history rather than a palette.
 *
 * **Client-side and in memory only.** There are no accounts and nothing is
 * persisted, and the history is not sent anywhere: it is a convenience for one
 * tab. It deliberately outlives a room, since the map you were matching is
 * often the map you are going back to.
 *
 * A *use* is a stroke begun, not a colour chosen — `players/usePointerControls`
 * calls `rememberColor` when a paint drag starts. Everything else is a colour
 * you were only looking at, and a history of those is a history of dragging
 * across a wheel.
 */

/** Two rows of five, which is what the grid under the wheel holds. */
const MAX_RECENT = 10;

/** The reset target: bare, unpainted body white. */
export const WHITE = "#ffffff";

let recent: string[] = [];
const listeners = new Set<() => void>();

/** The list itself. Its identity changes only when the list does, which is what
 *  `useSyncExternalStore` requires of a snapshot. */
export function recentColors(): string[] {
  return recent;
}

export function rememberColor(hex: string) {
  const colour = hex.toLowerCase();
  // Painting is a lot of short drags in one colour, so the overwhelmingly
  // common call is a repeat of the head. Returning early keeps it from
  // re-rendering the panel on every stroke.
  if (recent[0] === colour) return;
  recent = [colour, ...recent.filter((c) => c !== colour)].slice(0, MAX_RECENT);
  listeners.forEach((fn) => fn());
}

export function subscribeColors(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
