import * as THREE from "three";

const CAMERA_MIN_DISTANCE = 1.4;
/** Keep the lens off the surface it would otherwise touch. */
const CAMERA_SKIN = 0.35;
/** Aim at the chest rather than the origin, which is the middle of the body. */
const LOOK_HEIGHT = 0.6;

const lookAt = new THREE.Vector3();
const toCamera = new THREE.Vector3();
const ray = new THREE.Raycaster();

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
  lookAt.copy(bodyPos).setY(bodyPos.y + LOOK_HEIGHT);

  toCamera.copy(lookDir).negate().normalize();
  let distance = zoom;
  if (solids.length) {
    ray.set(lookAt, toCamera);
    ray.far = zoom;
    const blocked = ray.intersectObjects(solids, false)[0];
    if (blocked) distance = Math.max(CAMERA_MIN_DISTANCE, blocked.distance - CAMERA_SKIN);
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
  camera.lookAt(lookAt);
}

/** Forget the eased distance, so the next frame places the camera outright. */
export function resetFollow() {
  held = NaN;
}
