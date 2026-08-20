import * as THREE from "three";
import { CLING_CEILING, CLING_NONE, CLING_WALL } from "@/shared/protocol";
import { BODY_SCALE } from "./body";

/** How far past the body's own surface still counts as touching. Scaled with
 *  the body: it is a tolerance around a chameleon, not a distance in the room,
 *  and left alone a smaller one would grab walls from relatively further off. */
export const CLING_GAP = 0.35 * BODY_SCALE.chameleon;
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

/** How far the body's own box extends in a direction — its support function. */
export function supportFor(dir: THREE.Vector3, half: readonly [number, number, number]) {
  return Math.abs(dir.x) * half[0] + Math.abs(dir.y) * half[1] + Math.abs(dir.z) * half[2];
}

/** The same, plus the tolerance a probe is allowed past the body's surface. */
export function reachFor(dir: THREE.Vector3, half: readonly [number, number, number]) {
  return supportFor(dir, half) + CLING_GAP;
}

/** How far `seatOn` will look for the surface it is putting the body back on.
 *  Longer than a body, because the box it is correcting for can be. */
const SEAT_LOOK = 3;

/**
 * Put the body back against the surface it is stuck to, so its box's face sits
 * exactly on it. Returns whether the surface was found at all.
 *
 * **Needed because the box changes shape when the surface does.** A chameleon
 * that wraps from a wall onto a ceiling was placed for its upright box — origin
 * a whole body-length below the ceiling it was touching — and then given a flat
 * one. Nothing moved it, so it hung there out of reach of its own cling probe
 * (which sees about 0.42) and simply fell off. It is the same correction as
 * "keep the feet put", along whatever the body is holding rather than down.
 */
export function seatOn(
  origin: THREE.Vector3,
  normal: THREE.Vector3,
  half: readonly [number, number, number],
  solids: THREE.Object3D[],
): boolean {
  if (!solids.length) return false;
  back.copy(normal).negate();
  ray.set(origin, back);
  ray.far = SEAT_LOOK;
  const hit = ray.intersectObjects(solids, false)[0];
  if (!hit) return false;
  origin.addScaledVector(normal, supportFor(normal, half) - hit.distance);
  return true;
}

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

/** The surface you just walked into, or null. */
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

/** Still on it? */
export function holdsCling(
  origin: THREE.Vector3,
  normal: THREE.Vector3,
  half: readonly [number, number, number],
  solids: THREE.Object3D[],
): THREE.Vector3 | null {
  back.copy(normal).negate();
  return probe(origin, back, half, solids);
}

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

/**
 * Which kind of surface a cling normal describes, as the wire value.
 *
 * The normal points *back at* the player, so a ceiling's points down. Anything
 * that is neither a wall nor a ceiling is a floor, which is not a thing you
 * cling to — you stand on it — so it reads as `CLING_NONE`.
 */
export function clingKind(normal: THREE.Vector3 | null) {
  if (!normal) return CLING_NONE;
  if (isWall(normal)) return CLING_WALL;
  return normal.y < 0 ? CLING_CEILING : CLING_NONE;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** The wall's own axes: which way is up its face, and which way is across it. */
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
