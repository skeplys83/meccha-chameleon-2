"use client";

import type { Grave } from "@/game/net";

/**
 * A red square on the floor where somebody was shot. Unlike a shot mark these
 * never expire — they are the record of the round.
 *
 * They are not named ROOM_SURFACE on purpose: a grave should not stop a bullet
 * or a camera, it is paint on the floor.
 */
export function Graves({ graves }: { graves: Grave[] }) {
  return (
    <>
      {graves.map((g) => (
        <mesh
          key={g.id}
          position={[g.position[0], 0.02, g.position[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[1.1, 1.1]} />
          <meshStandardMaterial
            color="#c81e1e"
            roughness={0.6}
            polygonOffset
            polygonOffsetFactor={-2}
          />
        </mesh>
      ))}
    </>
  );
}
