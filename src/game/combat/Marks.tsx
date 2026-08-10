"use client";

import { DoubleSide } from "three";

/**
 * A shot patch, as the scene holds it. Same shape as `NetMark` in `net/events`,
 * which is where one arrives from — this is the render side of it.
 */
export type Mark = {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
};

/** Yellow patches left where a seeker's shot landed. */
export function Marks({ marks }: { marks: Mark[] }) {
  return (
    <>
      {marks.map((m) => (
        <mesh key={m.id} position={m.position} rotation={m.rotation}>
          <planeGeometry args={[0.6, 0.6]} />
          <meshStandardMaterial
            color="#facc15"
            emissive="#facc15"
            emissiveIntensity={0.4}
            roughness={0.6}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </>
  );
}
