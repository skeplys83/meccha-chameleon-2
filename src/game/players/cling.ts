import * as THREE from "three";

/**
 * Finding something to climb, and holding onto it.
 *
 * A chameleon sticks to any surface in the arena — a wall, the side of an obstacle,
 * the ceiling, the underside of the catwalk. All of it is one vector: the
 * surface normal, pointing *away* from the surface and back at the body. Walls
 * give a horizontal normal, a ceiling gives `(0, −1, 0)`.
 *
 * **You attach by walking into something.** There is no grab key: press toward a
 * wall and your feet come off the floor. `Space` is the only way off.
 *
 * **The figure never reorients while clinging.** It stays upright, sliding up a
 * wall face or moving along under a ceiling. That is what keeps this feature
 * small: the camera, the poses and the `yaw` on the wire all stay as they were.
 *
 * No React and no rapier in this file on purpose — it is pure three.js geometry,
 * so it imports straight into Node for testing. See the root CLAUDE.md.
 */

/** How far past the body's own surface still counts as touching. */
export const CLING_GAP = 0.35;
/** Across a surface, in units per second. Deliberately below walking speed. */
export const CLIMB_SPEED = 4;
/** Constant pull into the surface, so contact is never lost to a bump. */
export const STICK_SPEED = 2;
/** After letting go, ignore surfaces for this long or you re-grab instantly. */
export const RECLING_GRACE = 0.4;
/** A nudge away from the surface on release, so you fall clear of it. */
export const RELEASE_PUSH = 2.5;
/**
 * How level a normal has to be to count as a wall you can walk onto. Keeps you
 * from sticking to the floor or a ramp just by walking across it.
 */
const WALL_DOT = 0.5;
/** How squarely you must be moving into a surface to grab it. ~70° either side. */
const INTO_SURFACE = 0.35;

const ray = new THREE.Raycaster();
const worldNormal = new THREE.Vector3();
const quat = new THREE.Quaternion();
const back = new THREE.Vector3();
const dirUnit = new THREE.Vector3();

/**
 * How far the body's own box extends in a direction — its support function.
 *
 * The reach has to depend on the direction or nothing works: a chameleon is 0.26
 * wide and 1 tall, so a probe upward that used the horizontal reach would never
 * see the ceiling their head is already touching, and a sideways probe that used
 * the vertical one would grab walls a body-length away.
 */
export function reachFor(dir: THREE.Vector3, half: readonly [number, number, number]) {
  return (
    Math.abs(dir.x) * half[0] +
    Math.abs(dir.y) * half[1] +
    Math.abs(dir.z) * half[2] +
    CLING_GAP
  );
}

/**
 * Cast from the body along `dir` and return the surface normal facing back, or
 * null if nothing is within reach.
 *
 * Face normals are object-local and point whichever way the triangle was wound —
 * a room is built from boxes seen from inside, so half of them face away. What
 * the caller always wants is "which way is out of this surface, from here".
 */
export function probe(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  half: readonly [number, number, number],
  solids: THREE.Object3D[],
): THREE.Vector3 | null {
  if (!solids.length || dir.lengthSq() === 0) return null;
  dirUnit.copy(dir).normalize();

  ray.set(origin, dirUnit);
  ray.far = reachFor(dirUnit, half);
  const hit = ray.intersectObjects(solids, false)[0];
  if (!hit?.face) return null;

  worldNormal
    .copy(hit.face.normal)
    .applyQuaternion(hit.object.getWorldQuaternion(quat))
    .normalize();
  // Flip it to face the body rather than away.
  back.copy(dirUnit).negate();
  if (worldNormal.dot(back) < 0) worldNormal.negate();
  return worldNormal.clone();
}

/**
 * The surface you just walked into, or null.
 *
 * Only wall-like faces count, and only when you are moving reasonably squarely
 * at one — so brushing along a wall does not peel you off the floor, and walking
 * across the floor or up the ramp never sticks you to it.
 */
export function findCling(
  origin: THREE.Vector3,
  moveDir: THREE.Vector3,
  half: readonly [number, number, number],
  solids: THREE.Object3D[],
): THREE.Vector3 | null {
  if (moveDir.lengthSq() === 0) return null;
  const normal = probe(origin, moveDir, half, solids);
  if (!normal) return null;
  if (Math.abs(normal.y) > WALL_DOT) return null;

  dirUnit.copy(moveDir).normalize();
  return dirUnit.dot(normal) < -INTO_SURFACE ? normal : null;
}

/**
 * Still on it? One ray straight into the surface.
 *
 * Returns a refreshed normal, so a curved face keeps updating as you cross it,
 * or null once the surface is gone — climbed past the top of a box, or slid off
 * the side of it. Losing the surface is the same code path as letting go, which
 * is why there is no ledge-mantling anywhere.
 */
export function holdsCling(
  origin: THREE.Vector3,
  normal: THREE.Vector3,
  half: readonly [number, number, number],
  solids: THREE.Object3D[],
): THREE.Vector3 | null {
  back.copy(normal).negate();
  return probe(origin, back, half, solids);
}

/**
 * Wrapping around an edge: whatever you are climbing *toward*, if it is a
 * different face from the one you are on.
 *
 * One rule covers every corner in the game — climbing a wall into the ceiling,
 * crossing an inside corner between two walls, and stepping off a ceiling back
 * onto a wall.
 */
export function wrapCling(
  origin: THREE.Vector3,
  normal: THREE.Vector3,
  climbDir: THREE.Vector3,
  half: readonly [number, number, number],
  solids: THREE.Object3D[],
): THREE.Vector3 | null {
  if (climbDir.lengthSq() === 0) return null;
  const found = probe(origin, climbDir, half, solids);
  // Within a few degrees of the face already held is the same face.
  return found && found.dot(normal) < 0.95 ? found : null;
}

/** Beside it, so there is an "up the wall" to walk. */
export const isWall = (normal: THREE.Vector3) => Math.abs(normal.y) <= WALL_DOT;

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * The wall's own axes: which way is up its face, and which way is across it.
 *
 * `W`/`S` run along `up`, `A`/`D` along `right`, so climbing does not depend on
 * where the camera happens to be pointing. `right = up × normal` also happens to
 * be screen-right whenever the camera is behind you looking at the wall, which
 * is the case that matters.
 *
 * Returns false for a surface with no meaningful "up" — a ceiling — where the
 * caller should fall back to ordinary camera-relative movement.
 */
export function wallTangents(
  normal: THREE.Vector3,
  up: THREE.Vector3,
  right: THREE.Vector3,
) {
  if (!isWall(normal)) return false;
  // World up flattened into the face.
  up.copy(WORLD_UP).addScaledVector(normal, -WORLD_UP.dot(normal));
  if (up.lengthSq() < 1e-6) return false;
  up.normalize();
  right.crossVectors(up, normal).normalize();
  return true;
}
