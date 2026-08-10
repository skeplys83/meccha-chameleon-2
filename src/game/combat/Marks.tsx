"use client";

import { DoubleSide } from "three";
import type { NetMark } from "@/game/net";

/**
 * A shot patch, as the scene holds it.
 *
 * An alias rather than a second declaration: a mark is created by the server,
 * arrives through `net/events`, and is handed straight to this component without
 * changing shape. The two used to be identical types written out twice, which is
 * a mirror waiting to drift the moment one of them gains a field.
 */
export type Mark = NetMark;

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
