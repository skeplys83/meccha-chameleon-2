/** The figure's anatomy: which parts exist and how big each one really is. */

export const PARTS = [
  "head",
  "torso",
  "armUpperL",
  "armForeL",
  "armUpperR",
  "armForeR",
  "legUpperL",
  "legLowerL",
  "legUpperR",
  "legLowerR",
] as const;

export type Part = (typeof PARTS)[number];

/** `length` is the capsule's straight section; 0 means a sphere. */
export const PART_SHAPE: Record<Part, { radius: number; length: number }> = {
  head: { radius: 0.26, length: 0 },
  torso: { radius: 0.23, length: 0.5 },
  armUpperL: { radius: 0.105, length: 0.32 },
  armForeL: { radius: 0.105, length: 0.32 },
  armUpperR: { radius: 0.105, length: 0.32 },
  armForeR: { radius: 0.105, length: 0.32 },
  legUpperL: { radius: 0.13, length: 0.38 },
  legLowerL: { radius: 0.13, length: 0.4 },
  legUpperR: { radius: 0.13, length: 0.38 },
  legLowerR: { radius: 0.13, length: 0.4 },
};
