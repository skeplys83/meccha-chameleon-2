import * as THREE from "three";

const CAMERA_MIN_DISTANCE = 1.4;
/** Keep the lens off the surface it would otherwise touch. */
const CAMERA_SKIN = 0.35;

const lookAt = new THREE.Vector3();
const toCamera = new THREE.Vector3();
const ray = new THREE.Raycaster();
const hitNormal = new THREE.Vector3();

/**
 * Last frame's distance. Only the *distance* is smoothed — the camera itself is
 * rigid on the body, see below. `NaN` means "no previous frame": the first call,
 * and after a room change, which must snap rather than fly in from the old spot.
 */
let held = NaN;
/** A jump this large is a teleport, not a wall — snap. */
const SNAP_JUMP = 3;

export function followThirdPerson(
  camera: THREE.Camera,
  bodyPos: THREE.Vector3,
  lookDir: THREE.Vector3,
  zoom: number,
  solids: THREE.Object3D[],
  delta: number,
) {
  // The body's origin is the middle of the figure in every pose — measured, it
  // is within 0.05 of the posed mesh's own centre — so aiming there frames the
  // player centred whether they are standing, lying or curled up.
  lookAt.copy(bodyPos);

  toCamera.copy(lookDir).negate().normalize();
  let distance = zoom;
  // The height the lens may not go below, when what is in the way is the floor.
  let floor = -Infinity;
  if (solids.length) {
    ray.set(lookAt, toCamera);
    ray.far = zoom;
    const blocked = ray.intersectObjects(solids, false)[0];
    if (blocked?.face) {
      hitNormal.copy(blocked.face.normal).transformDirection(blocked.object.matrixWorld);
      // **The ground is slid along, not backed away from.** Pulling in on a
      // floor hit is what put the lens inside a lying player: the aim point is
      // barely above the ground, so any look from below the horizon crosses it
      // within a metre and the shot collapses to the minimum distance. Lifting
      // instead keeps the whole zoom and skims the surface, which is what a
      // player crouching to look at something along the floor expects.
      if (hitNormal.y > 0.5) floor = blocked.point.y + CAMERA_SKIN;
      else distance = Math.max(CAMERA_MIN_DISTANCE, blocked.distance - CAMERA_SKIN);
    } else if (blocked) {
      distance = Math.max(CAMERA_MIN_DISTANCE, blocked.distance - CAMERA_SKIN);
    }
  }

  // **The camera is rigid on the body.** Lerping its *position* made it trail
  // and swim behind the player on every direction change, which reads as the
  // view wobbling rather than as smoothing. Only how far back it sits is eased,
  // and only outwards: pulling in has to be immediate or the lens enters the
  // wall it is avoiding.
  if (!Number.isFinite(held) || Math.abs(distance - held) > SNAP_JUMP) held = distance;
  else if (distance < held) held = distance;
  else held += (distance - held) * (1 - Math.pow(0.0001, delta));

  camera.position.copy(lookAt).addScaledVector(toCamera, held);
  if (camera.position.y < floor) camera.position.y = floor;
  camera.lookAt(lookAt);
}

/** Forget the eased distance, so the next frame places the camera outright. */
export function resetFollow() {
  held = NaN;
}
