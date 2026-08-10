export type Role = "hider" | "seeker";

/**
 * Half-extents of the player's collider. Seekers are bigger.
 *
 * A hider's box is deliberately **narrower than their figure**: 0.26 is the
 * head radius from `PART_SHAPE`, so the head, torso and legs are all inside it
 * but shoulders and outflung arms are not. That is what lets a hider press into
 * a wall or a corner and sink a shoulder into it instead of floating a body's
 * width away from every surface in the room. The half-height is untouched, so
 * the feet still rest exactly on the floor rather than sinking through it.
 */
export const BODY: Record<Role, [hx: number, hy: number, hz: number]> = {
  hider: [0.26, 1, 0.26],
  seeker: [0.52, 1.3, 0.52],
};

export type Mark = {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
};
