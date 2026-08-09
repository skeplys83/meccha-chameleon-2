"use client";

import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { POSES, safePose, type Joint } from "./poses";
import { getSkin, PART_SHAPE, type Part } from "@/lib/skin";

/**
 * Thick-limbed stick figure on a small joint rig, built to a half-height of 1
 * so callers can scale it to a role's body size. Origin sits at the middle of
 * the body.
 *
 * Limbs are groups pivoted at the joint with the capsule hanging below, so a
 * pose is just a set of rotations (see poses.ts). Each part carries its own
 * canvas texture and is named, which is what lets the paint mode raycast a
 * limb and know which canvas to draw into.
 */

// Proportions are chosen so the figure fills its collider: the soles land at
// -1 and the crown at +1, matching the half-height of 1 it is built to.
const HEAD_Y = 0.74;
const HEAD_R = PART_SHAPE.head.radius;
const TORSO_Y = 0.22;
const SHOULDER = new THREE.Vector3(0.28, 0.44, 0);
const HIP = new THREE.Vector3(0.15, -0.1, 0);
// Limb sizes come from PART_SHAPE so the geometry and the brush maths in
// skin.ts can never drift apart.
const UPPER_ARM = PART_SHAPE.armUpperL.length;
const FORE_ARM = PART_SHAPE.armForeL.length;
const UPPER_LEG = PART_SHAPE.legUpperL.length;

/** How fast a limb settles into a new pose. Higher is snappier. */
const POSE_DAMP = 14;

function Segment({ part, skin }: { part: Part; skin: Record<Part, THREE.CanvasTexture> }) {
  const { radius, length } = PART_SHAPE[part];
  return (
    <mesh
      position={[0, -length / 2, 0]}
      castShadow
      name={`PART:${part}`}
      userData={{ part }}
    >
      <capsuleGeometry args={[radius, length, 8, 20]} />
      <meshStandardMaterial map={skin[part]} roughness={0.55} />
    </mesh>
  );
}

export function StickFigure({
  scale = 1,
  pose = 0,
  skinId,
  aim = null,
  holding,
}: {
  scale?: number;
  /** A getter for remote figures: their pose changes on network patches, which
   *  deliberately do not re-render the tree. */
  pose?: number | (() => number);
  /** Which body's paint to wear — SELF for the local player, session id otherwise. */
  skinId: string;
  /**
   * Aim pitch in radians. When given, the right arm leaves the pose and points
   * where the player is looking — the figure's yaw is already the aim yaw, so
   * the arm only needs the elevation.
   */
  aim?: (() => number) | null;
  /** Rendered in the right hand, barrel already aligned down the arm. */
  holding?: ReactNode;
}) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const shoulders = useRef<(THREE.Group | null)[]>([]);
  const elbows = useRef<(THREE.Group | null)[]>([]);
  const hips = useRef<(THREE.Group | null)[]>([]);
  const knees = useRef<(THREE.Group | null)[]>([]);
  const skin = getSkin(skinId);

  useFrame((_, delta) => {
    const p = POSES[safePose(typeof pose === "function" ? pose() : pose)];

    const settle = (g: THREE.Group | null | undefined, j: Joint | undefined, side: number) => {
      if (!g) return;
      g.rotation.x = THREE.MathUtils.damp(g.rotation.x, j?.x ?? 0, POSE_DAMP, delta);
      g.rotation.z = THREE.MathUtils.damp(
        g.rotation.z,
        (j?.spread ?? 0) * side,
        POSE_DAMP,
        delta,
      );
    };

    if (root.current) {
      root.current.position.y = THREE.MathUtils.damp(
        root.current.position.y,
        p.offsetY ?? 0,
        POSE_DAMP,
        delta,
      );
      // Lying down is a roll of the whole body and crumpling is a tip forward,
      // both damped like every other joint so the figure keels over instead of
      // snapping into place.
      root.current.rotation.z = THREE.MathUtils.damp(
        root.current.rotation.z,
        p.roll ? Math.PI / 2 : 0,
        POSE_DAMP,
        delta,
      );
      root.current.rotation.x = THREE.MathUtils.damp(
        root.current.rotation.x,
        p.rootX ?? 0,
        POSE_DAMP,
        delta,
      );
    }

    settle(torso.current, p.torso, 1);
    settle(head.current, p.head, 1);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      // The gun arm is driven by the aim instead of the pose.
      const aiming = aim !== null && i === 1;
      if (!aiming) {
        settle(shoulders.current[i], p.shoulder, side);
        settle(elbows.current[i], p.elbow, side);
      }
      settle(hips.current[i], p.hip, side);
      settle(knees.current[i], p.knee, side);
    }

    if (aim) {
      // Straight out in front at rest (x = π/2), rising and falling with pitch.
      settle(shoulders.current[1], { x: Math.PI / 2 + aim(), spread: 0.12 }, 1);
      settle(elbows.current[1], undefined, 1);
    }
  });

  const sides: [index: number, sign: number, tag: "L" | "R"][] = [
    [0, -1, "L"],
    [1, 1, "R"],
  ];

  return (
    <group ref={root} scale={scale}>
      <group ref={torso}>
        {/* torso */}
        <mesh position={[0, TORSO_Y, 0]} castShadow name="PART:torso" userData={{ part: "torso" }}>
          <capsuleGeometry args={[PART_SHAPE.torso.radius, PART_SHAPE.torso.length, 8, 20]} />
          <meshStandardMaterial map={skin.torso} roughness={0.55} />
        </mesh>

        {/* head */}
        <group ref={head} position={[0, HEAD_Y - HEAD_R, 0]}>
          <mesh position={[0, HEAD_R, 0]} castShadow name="PART:head" userData={{ part: "head" }}>
            <sphereGeometry args={[HEAD_R, 24, 24]} />
            <meshStandardMaterial map={skin.head} roughness={0.55} />
          </mesh>
        </group>

        {/* arms */}
        {sides.map(([i, sign, tag]) => (
          <group
            key={`arm${tag}`}
            position={[sign * SHOULDER.x, SHOULDER.y, 0]}
            ref={(g) => {
              shoulders.current[i] = g;
            }}
          >
            <Segment part={`armUpper${tag}`} skin={skin} />
            <group
              position={[0, -UPPER_ARM, 0]}
              ref={(g) => {
                elbows.current[i] = g;
              }}
            >
              <Segment part={`armFore${tag}`} skin={skin} />
              {/* The hand. Rotating -90° about X turns the gun's -Z barrel to
                  run down the arm, so it points wherever the arm points. */}
              {tag === "R" && holding && (
                <group position={[0, -FORE_ARM, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  {holding}
                </group>
              )}
            </group>
          </group>
        ))}
      </group>

      {/* legs hang off the hips, which do not follow the torso lean */}
      {sides.map(([i, sign, tag]) => (
        <group
          key={`leg${tag}`}
          position={[sign * HIP.x, HIP.y, 0]}
          ref={(g) => {
            hips.current[i] = g;
          }}
        >
          <Segment part={`legUpper${tag}`} skin={skin} />
          <group
            position={[0, -UPPER_LEG, 0]}
            ref={(g) => {
              knees.current[i] = g;
            }}
          >
            <Segment part={`legLower${tag}`} skin={skin} />
          </group>
        </group>
      ))}
    </group>
  );
}
