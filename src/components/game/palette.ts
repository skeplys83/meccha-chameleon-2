/**
 * The paint presets, in swatch order.
 *
 * One table, two consumers: `PaintPanel` renders it as the swatch row, and
 * `Room` paints a handful of arena pieces with the same hexes. That is
 * deliberate — camouflage is only testable if a preset is an *exact* match for
 * something you can lie against, so these must never drift apart.
 */
export const PAINT = {
  black: "#000000",
  white: "#ffffff",
  grey: "#8a8a8a",
  rose: "#e11d48",
  orange: "#f97316",
  yellow: "#facc15",
  green: "#22c55e",
  cyan: "#06b6d4",
  blue: "#3b82f6",
  purple: "#a855f7",
} as const;

export const SWATCHES: string[] = Object.values(PAINT);
