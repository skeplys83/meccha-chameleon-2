import { PART_SHAPE } from "@/game/figure/parts";
import type { Role } from "@/game/shared/protocol";

/**
 * Half-extents of the player's collider. Seekers are bigger.
 *
 * A hider's box is deliberately **narrower than their figure**: it is exactly the
 * head radius, taken from `figure/parts.ts` rather than copied, so the head,
 * torso and legs are all inside it but shoulders and outflung arms are not. That
 * is what lets a hider press into a wall or a corner and sink a shoulder in,
 * instead of floating a body's width away from every surface in the room. The half-height is untouched, so the feet
 * still rest exactly on the floor rather than sinking through it.
 */
const HEAD = PART_SHAPE.head.radius;

export const BODY: Record<Role, [hx: number, hy: number, hz: number]> = {
  hider: [HEAD, 1, HEAD],
  seeker: [HEAD * 2, 1.3, HEAD * 2],
};
