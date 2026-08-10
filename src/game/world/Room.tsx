"use client";

import type { ReactNode } from "react";
import { RigidBody } from "@react-three/rapier";
import { PAINT } from "@/game/core/palette";

export const ROOM_SURFACE = "room-surface";

const SIZE = 40; // interior width/depth
const HEIGHT = 12;
const THICKNESS = 1;

/** Half-extent players are kept inside. Mirrored by ROOM_LIMIT in server.mjs. */
export const ROOM_HALF = SIZE / 2;

/** Anything not painted a palette colour. */
const ARENA = "#f1f1f1";

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

/**
 * One piece of cover.
 *
 * The collider is generated from the geometry, so the shape has to say which
 * kind it needs: `cuboid` reads a bounding box (fine for boxes, even rotated
 * ones), `hull` wraps the real vertices and is right for anything convex —
 * cylinders, cones, crystals — and `trimesh` follows the surface exactly, which
 * is the only way a ring keeps its hole. `ball` is the cheap exact sphere.
 *
 * Every mesh carries `ROOM_SURFACE`: that name is what shots and the camera
 * filter on, so a piece without it would be shot through and clipped into.
 */
function Solid({
  position,
  rotation,
  color = ARENA,
  colliders = "cuboid",
  children,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
  colliders?: "cuboid" | "hull" | "trimesh" | "ball";
  children: ReactNode;
}) {
  return (
    <RigidBody type="fixed" colliders={colliders}>
      <mesh
        position={position}
        rotation={rotation}
        name={ROOM_SURFACE}
        castShadow
        receiveShadow
      >
        {children}
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
    </RigidBody>
  );
}

/**
 * The arena.
 *
 * Two rules shaped the layout. **Everything tall has a way up** — a ramp, a
 * stair, a tier or a smaller neighbour to hop from — because a hider who cannot
 * reach the high ground has nowhere to hide but the corners. Jump height is
 * about 3 units (`JUMP_SPEED²/2g` in Player.tsx), so no single step is more
 * than ~2.
 *
 * And **the coloured pieces are painted in exact palette hexes**, so you can
 * pick the matching swatch in the paint panel and check whether you actually
 * disappear against one. They are spread around the room, one colour each.
 */
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

      {/* ── NW: stepped ziggurat. Three 1-unit tiers, so it can be walked up
             from any side and lain on at three different heights. ── */}
      <Solid position={[-11, 0.5, -11]} color={PAINT.green}>
        <boxGeometry args={[7, 1, 7]} />
      </Solid>
      <Solid position={[-11, 1.5, -11]} color={PAINT.green}>
        <boxGeometry args={[5, 1, 5]} />
      </Solid>
      <Solid position={[-11, 2.5, -11]} color={PAINT.green}>
        <boxGeometry args={[3, 1, 3]} />
      </Solid>

      {/* ── NE: an 18° ramp running up onto a platform. The one slope in the
             room you can walk rather than jump. ── */}
      <Solid position={[8, 1.55, -6]} rotation={[0.32, 0, 0]} color={PAINT.orange}>
        <boxGeometry args={[4.5, 0.5, 9.5]} />
      </Solid>
      <Solid position={[8, 2.95, -13]}>
        <boxGeometry args={[6, 0.5, 5]} />
      </Solid>

      {/* ── N: the divider, now two steps rather than one blank wall: mount the
             low lip, then hop the top. ── */}
      <Solid position={[-1, 0.6, -13.6]}>
        <boxGeometry args={[10, 1.2, 1.6]} />
      </Solid>
      <Solid position={[-1, 1.6, -15.2]}>
        <boxGeometry args={[10, 3.2, 1.2]} />
      </Solid>

      {/* The cone, the capsule and the crystal are the deliberate non-perches:
          every other piece has a top you can reach. */}
      <Solid position={[-17, 2.25, -17]} color={PAINT.yellow} colliders="hull">
        <coneGeometry args={[2.2, 4.5, 24]} />
      </Solid>

      {/* ── Centre: a two-tier round stone, clear of the spawn point. ── */}
      <Solid position={[0, 0.5, -6]} colliders="hull">
        <cylinderGeometry args={[2, 2, 1, 24]} />
      </Solid>
      <Solid position={[0, 1.5, -6]} colliders="hull">
        <cylinderGeometry args={[1.2, 1.2, 1, 24]} />
      </Solid>

      {/* ── E: a crystal, and the tall slab the catwalk runs into. ── */}
      <Solid position={[16, 1.7, -3]} color={PAINT.blue} colliders="hull">
        <octahedronGeometry args={[2.2]} />
      </Solid>
      <Solid position={[14, 2.5, 6]}>
        <boxGeometry args={[1, 5, 8]} />
      </Solid>

      {/* ── SE: stairs onto a catwalk, which dead-ends at the slab — the slab
             top is another ~0.9 up, so the climb keeps going if you want it. ── */}
      {[1.0, 1.9, 2.8, 3.7].map((h, i) => (
        <Solid key={`step${i}`} position={[3.5, h / 2, 4.8 + i * 1.6]}>
          <boxGeometry args={[3.2, h, 1.6]} />
        </Solid>
      ))}
      <Solid position={[9, 3.9, 10.8]}>
        <boxGeometry args={[9, 0.4, 2.4]} />
      </Solid>

      {/* A dome, sunk into the floor so it is a curve to slide off rather than
          a ball to bump into. */}
      <Solid position={[16, -0.6, 16]} color={PAINT.purple} colliders="ball">
        <sphereGeometry args={[2.8, 32, 16]} />
      </Solid>

      {/* ── S: a ring you can run through, high enough for a seeker. It needs a
             trimesh collider — a hull would fill the hole in. ── */}
      <Solid position={[0, 2.7, 13]} color={PAINT.rose} colliders="trimesh">
        <torusGeometry args={[3, 0.45, 16, 48]} />
      </Solid>

      <Solid position={[-6, 0.8, 15]} color={PAINT.black} colliders="hull">
        <cylinderGeometry args={[2.4, 2.4, 1.6, 6]} />
      </Solid>
      {/* Kept to 2.6 so its top is a one-jump perch from the floor rather than
          scenery you can only look at. */}
      <Solid position={[7, 1.3, 16.5]} color={PAINT.grey} colliders="hull">
        <cylinderGeometry args={[1.8, 1.8, 2.6, 3]} />
      </Solid>

      {/* ── W: a drum tall enough to matter, with a smaller one beside it as the
             step up. A capsule and a long bench fill out the wall. ── */}
      <Solid position={[-13, 1.5, 7]} color={PAINT.cyan} colliders="hull">
        <cylinderGeometry args={[2, 2, 3, 24]} />
      </Solid>
      <Solid position={[-9.5, 0.75, 9.5]} colliders="hull">
        <cylinderGeometry args={[1.3, 1.3, 1.5, 20]} />
      </Solid>
      <Solid position={[-16.5, 2, 12]} colliders="hull">
        <capsuleGeometry args={[1, 2, 8, 16]} />
      </Solid>
      <Solid position={[-15, 1, 0]}>
        <boxGeometry args={[2, 2, 8]} />
      </Solid>
    </>
  );
}
