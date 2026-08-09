"use client";

import { DoubleSide } from "three";
import type { Mark } from "./types";

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
