/**
 * What the brush is, separately from the panel that edits it.
 *
 * `players/Player.tsx` needs this type to paint and to size its hover ring, and
 * it has no other business knowing the HUD exists — so the type lives here and
 * `PaintPanel.tsx` is just one of its consumers.
 */
export type Brush = {
  color: string;
  /**
   * Radius in figure-local units (the figure is 2 tall), so a dot is the same
   * size on a forearm as on the head. `skin.ts` converts it per part.
   */
  size: number;
};

export const DEFAULT_BRUSH: Brush = { color: "#e0245e", size: 0.06 };

export const MIN_SIZE = 0.015;
export const MAX_SIZE = 0.2;
