import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { RigidBody } from "@react-three/rapier";
import type * as THREE from "three";
import { ROOM_SURFACE } from "./surface";
import type { Shape, Solid } from "./shapes";

/**
 * The one place a map's data becomes geometry.
 *
 * Maps are tables of `Solid` now (`maps/arena.ts`, `maps/dungeon.ts`) and this
 * is the only thing that reads them, which is what makes the split worth having:
 * every rule about *how* a piece is built lives here, once, instead of being
 * repeated in each map's JSX.
 *
 * Two of those rules are load-bearing:
 *
 * **Every mesh is named `ROOM_SURFACE`.** That name is what `players/Player.tsx`
 * filters on for the shot raycast, the ground test, the climb probes and the
 * camera pull-in. A piece without it is shot straight through, cannot be stood
 * on or climbed, and the camera clips into it. Doing it here means a new map
 * cannot forget.
 *
 * **The piece picks its own collider**, because rapier generates one from the
 * geometry and the right kind depends on the shape — see `Colliders` in
 * `shapes.ts`. Getting it wrong does not error, it just puts the wrong invisible
 * volume around the piece.
 */

/**
 * The transform sits on the *mesh*, not on the `RigidBody`.
 *
 * Rapier reads the collider off the geometry as it stands relative to the body,
 * so a body at the origin with a placed mesh inside it and a placed body with a
 * mesh at its origin are not interchangeable for rotated pieces — the arena's
 * ramp is the one that would move. This matches what the maps were built and
 * play-tested against; do not "simplify" it onto the body.
 */
function geometryFor(shape: Exclude<Shape, { kind: "model" }>) {
  switch (shape.kind) {
    case "box":
      return <boxGeometry args={shape.args} />;
    case "sphere":
      return <sphereGeometry args={shape.args} />;
    case "cylinder":
      return <cylinderGeometry args={shape.args} />;
    case "cone":
      return <coneGeometry args={shape.args} />;
    case "capsule":
      return <capsuleGeometry args={shape.args} />;
    case "torus":
      return <torusGeometry args={shape.args} />;
    case "octahedron":
      return <octahedronGeometry args={shape.args} />;
  }
}

/** Anything not painted a palette colour. */
const DEFAULT_COLOR = "#f1f1f1";

function Primitive({
  solid,
  shape,
}: {
  solid: Solid;
  shape: Exclude<Shape, { kind: "model" }>;
}) {
  return (
    <RigidBody type="fixed" colliders={solid.colliders ?? "cuboid"}>
      <mesh
        position={solid.position}
        rotation={solid.rotation}
        name={ROOM_SURFACE}
        castShadow={solid.castShadow !== false && !solid.hidden}
        receiveShadow={!solid.hidden}
      >
        {geometryFor(shape)}
        {/* `visible` on the *material*, not on the mesh. Both stop it drawing,
            but three's raycaster never looks at either — so this is a choice
            about clarity rather than behaviour, and the material is the honest
            place to say "this surface has no appearance". */}
        {solid.hidden ? (
          <meshBasicMaterial visible={false} />
        ) : (
          <meshStandardMaterial color={solid.color ?? DEFAULT_COLOR} roughness={0.85} />
        )}
      </mesh>
    </RigidBody>
  );
}

function Model({ solid, src }: { solid: Solid; src: string }) {
  const { scene } = useGLTF(src);

  /**
   * Cloned per placement, because one `Object3D` cannot be in two places — and
   * the same wall is used two dozen times in the dungeon.
   *
   * `clone(true)` copies the node tree but *shares* geometry and materials, so
   * every piece in the map still draws from the one 17 KB atlas rather than
   * uploading a texture each.
   *
   * Done in a memo rather than an effect so the names exist before anything
   * looks for them: `players/Player.tsx` collects `ROOM_SURFACE` meshes from the
   * scene graph, and effects run after render.
   */
  const object = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.name = ROOM_SURFACE;
      mesh.castShadow = solid.castShadow !== false;
      mesh.receiveShadow = true;
    });
    return copy;
  }, [scene, solid.castShadow]);

  return (
    <RigidBody
      type="fixed"
      colliders={solid.colliders ?? "cuboid"}
      position={solid.position}
      rotation={solid.rotation}
    >
      <primitive object={object} />
    </RigidBody>
  );
}

/**
 * A whole map's worth of pieces.
 *
 * The `kind` check is made *here* rather than inside one component on purpose:
 * a model calls `useGLTF` and a primitive does not, and a hook behind a branch
 * is a hook that changes between renders. Two components, chosen in the JSX, is
 * the version React is happy with.
 */
export function Solids({ list }: { list: Solid[] }) {
  return (
    <>
      {list.map((solid, i) =>
        solid.shape.kind === "model" ? (
          <Model key={i} solid={solid} src={solid.shape.src} />
        ) : (
          <Primitive key={i} solid={solid} shape={solid.shape} />
        ),
      )}
    </>
  );
}
