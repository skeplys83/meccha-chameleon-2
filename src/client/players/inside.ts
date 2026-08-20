import * as THREE from "three";

/** How far short of a surface the centre is stopped. */
const SKIN = 0.02;

const ray = new THREE.Raycaster();
const step = new THREE.Vector3();

/**
 * The body's centre may never cross a surface.
 *
 * **A backstop, not the collision system.** Rapier's character controller
 * resolves *movement*, from where the body already is — so it never sees the
 * three places this file exists for:
 *
 * - the foot compensation, which shifts the body outright when a pose changes
 *   the shape of its box;
 * - `seatOn`, which shifts it outright when the surface changes;
 * - the collider being **rebuilt** with new extents when the pose box changes,
 *   which can bring it into existence already overlapping a wall.
 *
 * None of those is a movement, so none of them is checked, and a pose change
 * against a wall could put the body on the far side of it.
 *
 * This sweeps the centre from where it provably was to where it is about to be
 * and stops it short of anything in the way. **It does not stop the body
 * overlapping** — the collider is deliberately narrower than the figure and
 * that gap is the hiding mechanic (`body.ts`). What it guarantees is that the
 * *centre* is always on the room's side of every wall, so a chameleon can sink
 * into scenery and never end up behind it.
 */
export function keepInside(
  /** Where the centre provably was — last frame's position. */
  from: THREE.Vector3,
  /** Where it is about to be. Clamped in place. */
  to: THREE.Vector3,
  solids: THREE.Object3D[],
): boolean {
  if (!solids.length) return false;
  step.subVectors(to, from);
  const distance = step.length();
  if (distance < 1e-6) return false;

  ray.set(from, step.divideScalar(distance));
  ray.far = distance;
  const blocked = ray.intersectObjects(solids, false)[0];
  if (!blocked) return false;

  to.copy(from).addScaledVector(ray.ray.direction, Math.max(0, blocked.distance - SKIN));
  return true;
}
