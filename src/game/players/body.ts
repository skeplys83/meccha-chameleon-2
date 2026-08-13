import { PART_SHAPE } from "@/game/figure/parts";
import type { Role } from "@/game/shared/protocol";

/** Half-extents of the player's collider. */
const HEAD = PART_SHAPE.head.radius;

export const BODY: Record<Role, [hx: number, hy: number, hz: number]> = {
  chameleon: [HEAD, 1, HEAD],
  hunter: [HEAD * 2, 1.3, HEAD * 2],
};

/** Downward acceleration, in units per second squared. */
export const GRAVITY = 20;
