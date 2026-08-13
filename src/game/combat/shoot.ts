import * as THREE from "three";
import { remoteFigures } from "@/game/players/RemotePlayers";

/** What a shot from the centre of the screen hit. */
export type Shot =
  | { kind: "player"; id: string; point: [number, number, number] }
  | {
      kind: "wall";
      position: [number, number, number];
      rotation: [number, number, number];
      /** Where the shot started, so the tracer can be drawn along its path. */
      origin: [number, number, number];
    }
  | null;

const SCREEN_CENTRE = new THREE.Vector2(0, 0);
/** Lift the mark off the surface so it does not z-fight with it. */
const SURFACE_OFFSET = 0.02;

const worldNormal = new THREE.Vector3();
const quat = new THREE.Quaternion();
const facing = new THREE.Vector3();
const orient = new THREE.Object3D();

export function resolveShot(
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
  solids: THREE.Object3D[],
): Shot {
  raycaster.setFromCamera(SCREEN_CENTRE, camera);

  const figures = [...remoteFigures.values()];
  const person = figures.length ? raycaster.intersectObjects(figures, true)[0] : null;
  const wall = raycaster.intersectObjects(solids, false)[0];

  if (person && (!wall || person.distance < wall.distance)) {
    // The hit is a limb mesh; its owner is whichever ancestor carries the id.
    let owner: THREE.Object3D | null = person.object;
    while (owner && !owner.userData.remoteId) owner = owner.parent;
    const id = owner?.userData.remoteId as string | undefined;
    if (id) {
      return { kind: "player", id, point: [person.point.x, person.point.y, person.point.z] };
    }
    // An unowned figure mesh is not a person — fall through to the wall.
  }

  if (!wall || !wall.face) return null;

  // Room surfaces are unrotated, so the face normal only needs the object's
  // world rotation applied to become a world-space normal.
  worldNormal
    .copy(wall.face.normal)
    .applyQuaternion(wall.object.getWorldQuaternion(quat))
    .normalize();

  orient.position.copy(wall.point).addScaledVector(worldNormal, SURFACE_OFFSET);
  orient.lookAt(facing.copy(orient.position).add(worldNormal));

  return {
    kind: "wall",
    position: [orient.position.x, orient.position.y, orient.position.z],
    rotation: [orient.rotation.x, orient.rotation.y, orient.rotation.z],
    origin: [raycaster.ray.origin.x, raycaster.ray.origin.y, raycaster.ray.origin.z],
  };
}
