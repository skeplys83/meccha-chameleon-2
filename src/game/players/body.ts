import { PART_SHAPE } from "@/game/figure/parts";
import type { Role } from "@/game/shared/protocol";

/**
 * Half-extents of the player's collider. Hunters are bigger.
 *
 * A chameleon's box is deliberately **narrower than their figure**: it is exactly the
 * head radius, taken from `figure/parts.ts` rather than copied, so the head,
 * torso and legs are all inside it but shoulders and outflung arms are not. That
 * is what lets a chameleon press into a wall or a corner and sink a shoulder in,
 * instead of floating a body's width away from every surface in the room. The half-height is untouched, so the feet
 * still rest exactly on the floor rather than sinking through it.
 */
const HEAD = PART_SHAPE.head.radius;

export const BODY: Record<Role, [hx: number, hy: number, hz: number]> = {
  chameleon: [HEAD, 1, HEAD],
  hunter: [HEAD * 2, 1.3, HEAD * 2],
};

/**
 * Downward acceleration, in units per second squared.
 *
 * **Defined once and used twice**, which is the point of it living here. The
 * player is a *kinematic* body now — rapier does not accelerate it, `Player.tsx`
 * integrates its own vertical velocity with this — while `<Physics gravity>` in
 * `Scene.tsx` still governs any ordinary dynamic body. There are none today, so
 * the two could drift apart for a long time before anybody noticed a jump that
 * felt wrong next to a falling crate.
 *
 * Jump apex is `JUMP_SPEED² / 2g` ≈ 3 units, which is what every "everything
 * tall has a way up" decision in `world/` was measured against. Changing this
 * changes which parts of the arena a chameleon can reach.
 */
export const GRAVITY = 20;
