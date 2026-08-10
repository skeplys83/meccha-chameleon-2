"use client";

import * as THREE from "three";

/**
 * The third-person camera: sit behind the player along the look direction, but
 * never outside the room.
 *
 * The pull-in is the important part. Without it the camera walks straight
 * through a wall and you find yourself looking at the arena from the outside,
 * which reads as the game having broken.
 */

const CAMERA_MIN_DISTANCE = 1.4;
/** Keep the lens off the surface it would otherwise touch. */
const CAMERA_SKIN = 0.35;
/** Aim at the chest rather than the origin, which is the middle of the body. */
const LOOK_HEIGHT = 0.6;

const lookAt = new THREE.Vector3();
const toCamera = new THREE.Vector3();
const desired = new THREE.Vector3();
const ray = new THREE.Raycaster();

export function followThirdPerson(
  camera: THREE.Camera,
  bodyPos: THREE.Vector3,
  lookDir: THREE.Vector3,
  zoom: number,
  solids: THREE.Object3D[],
  delta: number,
) {
  lookAt.copy(bodyPos).setY(bodyPos.y + LOOK_HEIGHT);

  toCamera.copy(lookDir).negate().normalize();
  let distance = zoom;
  if (solids.length) {
    ray.set(lookAt, toCamera);
    ray.far = zoom;
    const blocked = ray.intersectObjects(solids, false)[0];
    if (blocked) distance = Math.max(CAMERA_MIN_DISTANCE, blocked.distance - CAMERA_SKIN);
  }

  desired.copy(lookAt).addScaledVector(toCamera, distance);
  // Frame-rate independent smoothing; the camera eases in but snaps out of
  // walls, because `distance` is already clamped before the lerp.
  camera.position.lerp(desired, 1 - Math.pow(0.0001, delta));
  camera.lookAt(lookAt);
}
