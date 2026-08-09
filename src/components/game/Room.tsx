"use client";

import { RigidBody } from "@react-three/rapier";

export const ROOM_SURFACE = "room-surface";

const SIZE = 40; // interior width/depth
const HEIGHT = 12;
const THICKNESS = 1;

/** Half-extent players are kept inside. Mirrored by ROOM_LIMIT in server.mjs. */
export const ROOM_HALF = SIZE / 2;

const half = SIZE / 2;
const t = THICKNESS / 2;

/** [position, size] for floor, ceiling and the four walls. */
const shell: [pos: [number, number, number], size: [number, number, number]][] = [
  [[0, -t, 0], [SIZE, THICKNESS, SIZE]],
  [[0, HEIGHT + t, 0], [SIZE, THICKNESS, SIZE]],
  [[0, HEIGHT / 2, -half - t], [SIZE, HEIGHT, THICKNESS]],
  [[0, HEIGHT / 2, half + t], [SIZE, HEIGHT, THICKNESS]],
  [[-half - t, HEIGHT / 2, 0], [THICKNESS, HEIGHT, SIZE]],
  [[half + t, HEIGHT / 2, 0], [THICKNESS, HEIGHT, SIZE]],
];

/** Cover to hide behind and climb on. */
const obstacles: [pos: [number, number, number], size: [number, number, number]][] = [
  // pillars
  [[-10, 3, -10], [2, 6, 2]],
  [[10, 3, -10], [2, 6, 2]],
  [[-10, 3, 10], [2, 6, 2]],
  [[10, 3, 10], [2, 6, 2]],
  // low crates, jumpable
  [[0, 0.75, -6], [3, 1.5, 3]],
  [[-6, 0.5, 4], [2, 1, 2]],
  [[6, 0.5, 4], [2, 1, 2]],
  [[3, 1, 12], [6, 2, 2]],
  [[-14, 1, 0], [2, 2, 8]],
  // long divider wall with a gap either side
  [[0, 2, -16], [16, 4, 1]],
  [[14, 2.5, 8], [1, 5, 10]],
];

export function Room() {
  return (
    <>
      {shell.map(([pos, size], i) => (
        <RigidBody key={`shell${i}`} type="fixed" colliders="cuboid">
          <mesh position={pos} receiveShadow name={ROOM_SURFACE}>
            <boxGeometry args={size} />
            <meshStandardMaterial color="#ffffff" roughness={0.9} />
          </mesh>
        </RigidBody>
      ))}

      {obstacles.map(([pos, size], i) => (
        <RigidBody key={`obs${i}`} type="fixed" colliders="cuboid">
          <mesh position={pos} receiveShadow castShadow name={ROOM_SURFACE}>
            <boxGeometry args={size} />
            <meshStandardMaterial color="#f1f1f1" roughness={0.85} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
