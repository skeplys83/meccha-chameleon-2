import { useEffect, useMemo, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import {
  BallCollider,
  ConvexHullCollider,
  CuboidCollider,
  TrimeshCollider,
} from "@react-three/rapier";
import type * as THREE from "three";
import { ROOM_SURFACE } from "./surface";
import { checkLevel, prepareLevel, type LevelCollider } from "./levelScene";
import type { GameMap } from "./maps";

/**
 * A map authored in Blender and exported as one `.glb`.
 *
 * The file is read by convention, and the conventions are in
 * `world/CLAUDE.md`: an object named for a collider is collision and is never
 * drawn, everything else is decoration and is never collided with, and lights
 * are lights. All of the reading is `levelScene.ts`; this file is the mounting.
 */
export function GltfLevel({ level }: { level: GameMap }) {
  const { scene } = useGLTF(level.src);

  // In a `useMemo` rather than an effect, so the `ROOM_SURFACE` meshes below
  // exist by the time `players/Player.tsx` collects them — see invariant 9.
  const prepared = useMemo(() => prepareLevel(scene), [scene]);

  // The one thing the deleted build step used to guarantee. See `checkLevel`.
  useEffect(() => {
    if (import.meta.env.DEV) checkLevel(level, prepared);
  }, [level, prepared]);

  return (
    <>
      {/* No light of any kind is added here. Every lamp in the game is an
          object in a .blend — see invariant 15. */}
      {/* No `RigidBody`: nothing that is drawn is collided with. */}
      <primitive object={prepared.scene} />
      {prepared.colliders.map((collider, i) => (
        <Collider key={i} collider={collider} />
      ))}
    </>
  );
}

/**
 * The invisible mesh a shot, the ground test and the camera all raycast.
 *
 * It exists alongside every collider because the two answer different
 * questions: rapier decides where a body can stand, `ROOM_SURFACE` decides what
 * a shot stops on. A collider on its own is a wall you can shoot through.
 */
function Proxy({
  children,
  ...placement
}: {
  children?: ReactNode;
  geometry?: THREE.BufferGeometry;
  position?: THREE.Vector3;
  quaternion?: THREE.Quaternion;
}) {
  return (
    <mesh name={ROOM_SURFACE} {...placement}>
      {children}
      {/* `visible` sits on the *material*, because three's raycaster skips an
          object whose own `visible` is false and this one has to stay findable. */}
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

/**
 * One collision object. A standalone collider is fixed, which is what every
 * piece of a map is.
 *
 * Hulls and trimeshes carry their world transform in their vertices, so those
 * colliders stay at the origin and only the proxy is placed.
 */
function Collider({ collider }: { collider: LevelCollider }) {
  switch (collider.kind) {
    case "cuboid": {
      const { half, position, quaternion } = collider;
      return (
        <>
          <CuboidCollider args={half} position={position} quaternion={quaternion} />
          <Proxy position={position} quaternion={quaternion}>
            <boxGeometry args={[half[0] * 2, half[1] * 2, half[2] * 2]} />
          </Proxy>
        </>
      );
    }
    case "ball": {
      const { radius, position, quaternion } = collider;
      return (
        <>
          <BallCollider args={[radius]} position={position} quaternion={quaternion} />
          <Proxy position={position} quaternion={quaternion}>
            <sphereGeometry args={[radius, 16, 12]} />
          </Proxy>
        </>
      );
    }
    case "hull":
      return (
        <>
          <ConvexHullCollider args={[collider.vertices]} />
          <Proxy geometry={collider.geometry} />
        </>
      );
    case "trimesh":
      return (
        <>
          <TrimeshCollider args={[collider.vertices, collider.indices]} />
          <Proxy geometry={collider.geometry} />
        </>
      );
  }
}
