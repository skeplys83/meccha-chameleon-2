import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

/** The body everyone wears — both roles — on a 14-bone rig, exported from
 *  `characters/figure-poses.blend`. Loaded once and cloned per figure. */

const SRC = "/models/player.glb";

/**
 * Every bone in the rig. glTF strips the dots Blender puts in names, so
 * `Shoulder.L` arrives as `ShoulderL` and the second spine bone — named
 * `Spine1.001` in the .blend — arrives as `Spine1001`.
 *
 * There is no `Root` and there are no hand bones: `Spine1` is the root, and the
 * shotgun hangs off the forearm instead. See `StickFigure`.
 */
export const BONES = [
  "Spine1",
  "Spine1001",
  "Neck",
  "Head",
  "ShoulderL",
  "UpperArmL",
  "LowerArmL",
  "ShoulderR",
  "UpperArmR",
  "LowerArmR",
  "UpperLegL",
  "LowerLegL",
  "UpperLegR",
  "LowerLegR",
] as const;

export type BoneName = (typeof BONES)[number];

export type Character = {
  root: THREE.Object3D;
  mesh: THREE.SkinnedMesh;
  bones: Record<BoneName, THREE.Bone>;
  /** Every bone's bind-pose local rotation. A pose is composed onto this, never
   *  written over it — the rig is bound in the star pose, so a bone's rest
   *  rotation is most of where its limb points. */
  rest: Map<THREE.Bone, THREE.Quaternion>;
};

let source: THREE.Group | null = null;
let inFlight: Promise<void> | null = null;

/**
 * Fetch the model. Called from `Game.tsx` on the join click, alongside the
 * sounds — 124 KB, and nothing renders a body before then. Idempotent.
 */
export function preloadCharacter(): Promise<void> {
  if (source) return Promise.resolve();
  if (!inFlight) {
    inFlight = new GLTFLoader()
      .loadAsync(SRC)
      .then((gltf) => {
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.SkinnedMesh;
          if (!mesh.isSkinnedMesh) return;
          mesh.castShadow = true;
          // Raycasts test the bounding volume first, and three computes it from
          // the bind pose — which here is a star, arms and legs thrown wide. A
          // folded pose sits well inside it, but a reached-out one does not, so
          // both volumes are grown rather than trusted. Without this a shot at
          // an outstretched arm misses silently.
          mesh.geometry.computeBoundingSphere();
          mesh.geometry.computeBoundingBox();
          if (mesh.geometry.boundingSphere) mesh.geometry.boundingSphere.radius *= 1.6;
          mesh.frustumCulled = false;
        });
        source = gltf.scene;
      })
      .catch((err) => {
        inFlight = null;
        throw err;
      });
  }
  return inFlight;
}

/** The model's geometry, in bind space — what `paint/surface.ts` paints on.
 *  Shared by every clone, so it is the one copy everybody's paint agrees with. */
export function characterGeometry(): THREE.BufferGeometry | null {
  if (!source) return null;
  let geometry: THREE.BufferGeometry | null = null;
  source.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) geometry = (o as THREE.SkinnedMesh).geometry;
  });
  return geometry;
}

/** A fresh body with its own skeleton, or null while the model is still coming. */
export function makeCharacter(): Character | null {
  if (!source) return null;
  const root = cloneSkinned(source);

  let mesh: THREE.SkinnedMesh | null = null;
  const bones = {} as Record<BoneName, THREE.Bone>;
  const rest = new Map<THREE.Bone, THREE.Quaternion>();

  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh;
    if ((o as THREE.Bone).isBone) {
      const bone = o as THREE.Bone;
      rest.set(bone, bone.quaternion.clone());
      if ((BONES as readonly string[]).includes(bone.name)) {
        bones[bone.name as BoneName] = bone;
      }
    }
  });

  if (!mesh) return null;
  return { root, mesh, bones, rest };
}
