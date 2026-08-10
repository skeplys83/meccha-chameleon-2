"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { RigidBody } from "@react-three/rapier";
import type * as THREE from "three";
import { ROOM_SURFACE } from "./surface";

/**
 * One loaded model, placed in the world — the glTF counterpart of `Solid` in
 * `maps/arena.tsx`, and it carries the same two responsibilities.
 *
 * **It names every mesh `ROOM_SURFACE`.** A model arrives with whatever names
 * Blender gave it, and nothing in the game can see a surface that is not called
 * that: not the shot raycast, the ground ray, the climb probes, or the camera
 * pull-in. A piece that skipped this would be shot straight through and could be
 * walked into.
 *
 * **The caller picks the collider**, exactly as `Solid` requires, and for the
 * same reason: `cuboid` reads a bounding box, `hull` wraps the real vertices,
 * `trimesh` follows the surface. A doorway *must* be `trimesh` — a hull fills
 * its opening in, the same trap the arena's ring has.
 */
export function Piece({
  src,
  position,
  rotation,
  colliders = "cuboid",
}: {
  /** File name inside `public/maps/<map>/`, without the extension. */
  src: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  colliders?: "cuboid" | "hull" | "trimesh" | "ball";
}) {
  const { scene } = useGLTF(src);

  /**
   * Cloned per placement, because one `Object3D` cannot be in two places — and
   * the same wall is used two dozen times in a room.
   *
   * `clone(true)` copies the node tree but *shares* geometry and materials, so
   * every piece in the map still draws from the one 17 KB atlas rather than
   * uploading a texture each.
   *
   * Done in a memo rather than an effect so the names exist before anything
   * looks for them: `players/Player.tsx` collects `ROOM_SURFACE` meshes in a
   * mount effect, and effects run after render.
   */
  const object = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.name = ROOM_SURFACE;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    return copy;
  }, [scene]);

  return (
    <RigidBody type="fixed" colliders={colliders} position={position} rotation={rotation}>
      <primitive object={object} />
    </RigidBody>
  );
}

/** Start fetching before the map renders, so the floor is there on arrival. */
export const preloadPieces = (srcs: string[]) => srcs.forEach((s) => useGLTF.preload(s));
