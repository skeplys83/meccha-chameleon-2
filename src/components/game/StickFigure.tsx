"use client";

/**
 * Generic thick-limbed stick figure, built to a half-height of 1 so callers can
 * scale it to a role's body size. Origin sits at the middle of the body.
 */
export function StickFigure({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      {/* head */}
      <mesh position={[0, 0.78, 0]} castShadow>
        <sphereGeometry args={[0.26, 24, 24]} />
        <meshStandardMaterial color="#ffffff" roughness={0.55} />
      </mesh>

      {/* torso */}
      <mesh position={[0, 0.24, 0]} castShadow>
        <capsuleGeometry args={[0.23, 0.5, 8, 20]} />
        <meshStandardMaterial color="#ffffff" roughness={0.55} />
      </mesh>

      {/* arms */}
      {[-1, 1].map((s) => (
        <mesh
          key={`arm${s}`}
          position={[s * 0.32, 0.28, 0]}
          rotation={[0, 0, s * 0.28]}
          castShadow
        >
          <capsuleGeometry args={[0.115, 0.44, 8, 16]} />
          <meshStandardMaterial color="#ffffff" roughness={0.55} />
        </mesh>
      ))}

      {/* legs */}
      {[-1, 1].map((s) => (
        <mesh key={`leg${s}`} position={[s * 0.15, -0.44, 0]} castShadow>
          <capsuleGeometry args={[0.135, 0.5, 8, 16]} />
          <meshStandardMaterial color="#ffffff" roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}
