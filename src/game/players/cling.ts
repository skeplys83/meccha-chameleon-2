"use client";

import * as THREE from "three";

/**
 * Finding something to climb.
 *
 * A hider can stick to any surface in the arena — a wall, the side of an
 * obstacle, the ceiling, the underside of the catwalk. All of it is expressed as
 * one vector: the surface normal, pointing *away* from the surface and back at
 * the body. Walls give a horizontal normal, a ceiling gives `(0, −1, 0)`, and
 * everything between falls out of the same maths.
 *
 * **The figure never reorients while clinging.** It stays upright, sliding up a
 * wall face or moving along under a ceiling. That is what keeps this feature
 * small: the camera, the poses and the `yaw` on the wire all stay as they were.
 *
 * No React and no rapier in this file on purpose — it is pure three.js geometry,
 * so it imports straight into Node for testing. See the root CLAUDE.md.
 */

/** How far from the body centre a surface can be and still be grabbed. */
export const CLING_REACH = 0.75;
/** Up and down a wall, in units per second. Deliberately below walking speed. */
export const CLIMB_SPEED = 4;
/** Constant pull into the surface, so contact is never lost to a bump. */
export const STICK_SPEED = 2;
/** After letting go, ignore surfaces for this long or you re-grab instantly. */
export const RECLING_GRACE = 0.35;
/**
 * A normal this far toward straight down is a ceiling rather than a wall: you
 * are underneath the surface, so `Shift` should drop you off it instead of
 * walking you down it.
 */
export const CEILING_DOT = -0.5;

/**
 * How much closer a rival surface must be before it steals you off the one you
 * are already on. Without it, an inside corner flips the normal every frame.
 */
const PREFER_BIAS = 1.6;

/**
 * Directions probed when looking for something to grab: the six axes, plus the
 * four horizontal diagonals so a wall met at 45° is still found. Down is in the
 * list because the floor is a surface like any other — grabbing it is harmless
 * and it keeps the rule uniform.
 */
const PROBES: readonly THREE.Vector3[] = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(1, 0, 1).normalize(),
  new THREE.Vector3(1, 0, -1).normalize(),
  new THREE.Vector3(-1, 0, 1).normalize(),
  new THREE.Vector3(-1, 0, -1).normalize(),
];

const ray = new THREE.Raycaster();
const worldNormal = new THREE.Vector3();
const quat = new THREE.Quaternion();
const back = new THREE.Vector3();

/**
 * The world-space normal of a hit, flipped to face the body.
 *
 * Face normals are object-local and point whichever way the triangle was wound;
 * a room is built from boxes seen from inside, so half of them point away. What
 * the caller wants is always "which way is out of this surface, from where I am".
 */
function outwardNormal(hit: THREE.Intersection, towards: THREE.Vector3) {
  if (!hit.face) return null;
  worldNormal
    .copy(hit.face.normal)
    .applyQuaternion(hit.object.getWorldQuaternion(quat))
    .normalize();
  if (worldNormal.dot(towards) < 0) worldNormal.negate();
  return worldNormal.clone();
}

/**
 * The nearest grabbable surface, as a normal pointing back at `origin`, or null.
 *
 * `prefer` is the normal already being held. A surface pointing the same way
 * counts as nearer than it is, so standing in an inside corner does not flip you
 * between two walls every frame.
 */
export function findCling(
  origin: THREE.Vector3,
  reach: number,
  solids: THREE.Object3D[],
  prefer: THREE.Vector3 | null = null,
): THREE.Vector3 | null {
  if (!solids.length) return null;

  let best: THREE.Vector3 | null = null;
  let bestScore = Infinity;

  for (const dir of PROBES) {
    ray.set(origin, dir);
    ray.far = reach;
    const hit = ray.intersectObjects(solids, false)[0];
    if (!hit) continue;

    // Facing back down the probe is "out of the surface, toward me".
    back.copy(dir).negate();
    const normal = outwardNormal(hit, back);
    if (!normal) continue;

    const score = prefer && normal.dot(prefer) > 0.9 ? hit.distance / PREFER_BIAS : hit.distance;
    if (score < bestScore) {
      bestScore = score;
      best = normal;
    }
  }

  return best;
}

/**
 * Still on it? One ray straight into the surface. This is the per-frame check —
 * `findCling` is only for grabbing something new.
 *
 * Returns the refreshed normal, so a curved surface keeps updating as you move
 * across it, or null once the surface is gone (you climbed past the top of a
 * box, or slid off the side of it).
 */
export function holdsCling(
  origin: THREE.Vector3,
  normal: THREE.Vector3,
  reach: number,
  solids: THREE.Object3D[],
): THREE.Vector3 | null {
  if (!solids.length) return null;
  back.copy(normal).negate();
  ray.set(origin, back);
  ray.far = reach;
  const hit = ray.intersectObjects(solids, false)[0];
  if (!hit) return null;
  return outwardNormal(hit, normal);
}

/** Underneath the surface rather than beside it — the ceiling case. */
export const isCeiling = (normal: THREE.Vector3) => normal.y < CEILING_DOT;
