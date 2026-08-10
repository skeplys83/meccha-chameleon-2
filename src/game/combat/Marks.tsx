"use client";

import { useMemo } from "react";
import * as THREE from "three";
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

/** Thin enough to read as a line, thick enough to survive perspective. */
const TRACER_RADIUS = 0.012;

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The path a shot took, as a thin black line from the muzzle to the patch.
 *
 * A cylinder rather than a `THREE.Line`: GL line width is capped at one pixel on
 * every desktop driver worth naming, so a real line cannot be made to look like
 * anything, and cannot be made thinner either. A cylinder has an honest
 * thickness in world units and shrinks with distance like everything else.
 */
function Tracer({ from, to }: { from: NetMark["origin"]; to: NetMark["position"] }) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const span = new THREE.Vector3().subVectors(b, a);
    return {
      position: new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, span.clone().normalize()),
      length: span.length(),
    };
  }, [from, to]);

  // A shot fired point-blank has nowhere to draw.
  if (length < 0.05) return null;

  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[TRACER_RADIUS, TRACER_RADIUS, length, 6, 1, true]} />
      <meshBasicMaterial color="#000000" />
    </mesh>
  );
}

/**
 * Yellow patches where a seeker's shot landed, each with the line it travelled.
 *
 * Both live and die together — `Scene.tsx` owns the single timer that drops a
 * mark after `MARK_LIFETIME`, so the line is on screen for exactly as long as
 * the patch is by construction, not by two timers that happen to agree.
 */
export function Marks({ marks }: { marks: Mark[] }) {
  return (
    <>
      {marks.map((m) => (
        <group key={m.id}>
          <mesh position={m.position} rotation={m.rotation}>
            <planeGeometry args={[0.6, 0.6]} />
            <meshStandardMaterial
              color="#facc15"
              emissive="#facc15"
              emissiveIntensity={0.4}
              roughness={0.6}
              side={THREE.DoubleSide}
            />
          </mesh>
          {m.origin && <Tracer from={m.origin} to={m.position} />}
        </group>
      ))}
    </>
  );
}
