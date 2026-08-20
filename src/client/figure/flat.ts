import * as THREE from "three";
import { CLING_NONE } from "@/shared/protocol";

/**
 * How a pose lies when it is on a flat surface, per pose.
 *
 * - `none` — never turns. `stand` is upright by definition and `curl` is a ball
 *   that reads the same whichever way up it is.
 * - `back` — lies with its back on the surface and its head pointing the way the
 *   body faces. A body that lies down feet-first slides feet-first when you walk.
 * - `side` — lies on its shoulder, which is what `lie` has always done, and it
 *   never stands up: a pose whose whole idea is being flat against a surface is
 *   flat against every one of them.
 *
 * `back` stands upright the moment it holds on to anything, because a body on
 * its back cannot grip a wall — or a ceiling.
 */
export type FlatMode = "none" | "back" | "side";

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const UPRIGHT = new THREE.Quaternion();

/**
 * How a pose is turned, by whether it is lying on the floor or holding on to
 * something.
 *
 * **Only the floor is lain on.** A wall and a ceiling are both *held*, and a
 * body holds them the same way — which is the rule that finally made the corner
 * between them work. A `back` pose lying on a ceiling is long along its forward
 * axis, and you face a wall to climb it, so reaching the ceiling drove a
 * body-length of collider straight into that wall and jammed. Held upright, the
 * long axis is vertical and hangs into the room instead.
 *
 * The figure faces **−Z** with its head at **+Y**.
 *
 * | mode | on the floor | held |
 * | ---- | ------------ | ---- |
 * | `back` | back down, head forward — π about (0, 1, −1) | upright |
 * | `side` | on its shoulder — `Rz(+π/2)` | the same |
 *
 * `back` on the floor is not a rotation about one axis, because it wants two
 * things at once. Tipping about X alone gets the back down and swings the head
 * to +Z, which is backwards; rolling about Z lays the body on its shoulder,
 * which is `side`.
 */
const TURNS: Record<Exclude<FlatMode, "none">, { floor: THREE.Quaternion; held: THREE.Quaternion }> =
  {
    back: {
      floor: new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, -1).normalize(),
        Math.PI,
      ),
      held: UPRIGHT,
    },
    side: {
      floor: new THREE.Quaternion().setFromAxisAngle(Z_AXIS, Math.PI / 2),
      // `side` holds on exactly as it lies: it never stands up at all.
      held: new THREE.Quaternion().setFromAxisAngle(Z_AXIS, Math.PI / 2),
    },
  };

/** How this pose sits on this surface. Identity when it does not turn at all. */
export function flatFor(mode: FlatMode, cling: number): THREE.Quaternion {
  if (mode === "none") return UPRIGHT;
  return cling === CLING_NONE ? TURNS[mode].floor : TURNS[mode].held;
}

const spun = new THREE.Vector3();

/**
 * Rotating by a quaternion leaves float dust — 0.23 comes back as
 * 0.22999999999999987. Harmless arithmetically, but `Player.tsx` keys the
 * collider on `half.join()`, and a key is nicer without it.
 */
const tidy = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * A pose's collider box, turned to match how the body is lying.
 *
 * **Poses state their box standing up**, which is the only way a pose can be
 * flagged as flat without also being re-measured by hand — and the first cut of
 * this got that backwards. `reach` was flagged flat and kept its standing box,
 * so the figure lay down inside a collider 1.1 units tall and hung in mid-air
 * instead of resting on the floor.
 *
 * Half-extents are unsigned, so the rotation is applied and the components
 * taken absolute; a centre is a real offset and keeps its signs.
 */
export function turnHalf(
  half: readonly [number, number, number],
  turn: THREE.Quaternion,
): [number, number, number] {
  spun.set(half[0], half[1], half[2]).applyQuaternion(turn);
  return [tidy(Math.abs(spun.x)), tidy(Math.abs(spun.y)), tidy(Math.abs(spun.z))];
}

export function turnCentre(
  centre: readonly [number, number, number],
  turn: THREE.Quaternion,
): [number, number, number] {
  spun.set(centre[0], centre[1], centre[2]).applyQuaternion(turn);
  return [tidy(spun.x), tidy(spun.y), tidy(spun.z)];
}
