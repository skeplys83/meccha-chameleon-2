import { useMemo } from "react";
import * as THREE from "three";
import type { NetMark } from "@/game/net";

/** A shot patch, as the scene holds it. */
export type Mark = NetMark;

/** Hairline. */
const TRACER_RADIUS = 0.004;

/** Faint enough to read as a trace of something that has already gone. */
const TRACER_OPACITY = 0.35;

const UP = new THREE.Vector3(0, 1, 0);

/** The path a shot took, as a thin black line from the muzzle to the patch. */
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
      <cylinderGeometry args={[TRACER_RADIUS, TRACER_RADIUS, length, 5, 1, true]} />
      <meshBasicMaterial
        color="#000000"
        transparent
        opacity={TRACER_OPACITY}
        // Depth-tested so a wall still hides it — a tracer visible through
        // geometry would give away shots nobody could have seen. Not
        // depth-*written*, so it never sorts against itself or the patch.
        depthWrite={false}
      />
    </mesh>
  );
}

/** Yellow patches where a hunter's shot landed, each with the line it travelled. */
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
