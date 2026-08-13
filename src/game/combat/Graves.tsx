import type { Grave } from "@/game/net";

/** A red square on the floor where somebody was shot. */
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
