/**
 * What a map is made of, as data — and nothing else.
 *
 * **This file has no imports, and neither may the map tables that use it.** The
 * whole point of describing geometry as data rather than as JSX is that both
 * halves of the game can read it: `world/Solids.tsx` turns a list of these into
 * meshes and colliders, and `src/game/server/` *could* read the same list
 * without pulling React and three.js into Node. That second half is not wired up
 * yet (the server has never needed geometry), but it is the reason the shape of
 * this file matters — the moment something here imports a component, the door
 * closes again. Same rule, and same reason, as `mapIds.ts` and `surface.ts`.
 *
 * A `kind` names a three.js geometry and its `args` are that geometry's
 * constructor arguments in order, so `{ kind: "box", args: [2, 1, 3] }` is
 * exactly `new BoxGeometry(2, 1, 3)`. Adding a shape means adding a case here
 * and a case in `Solids.tsx`; the type makes the second one a build error rather
 * than a silently missing piece.
 */

/**
 * How rapier should generate a collider for a shape.
 *
 * Getting this wrong does not error — it just puts the wrong invisible volume
 * around the piece. `cuboid` reads a bounding box, which is correct for boxes
 * including rotated ones like the ramp. `hull` wraps the real vertices and is
 * right for anything convex: cylinders, cones, the crystal, the capsule.
 * `trimesh` follows the surface exactly and is the **only** option for a shape
 * with a hole — the arena's ring and the dungeon's doorway both need it, because
 * a hull fills the opening in. `ball` is the cheap exact sphere.
 */
export type Colliders = "cuboid" | "hull" | "trimesh" | "ball";

/** A geometry, named by its three.js constructor and given that constructor's arguments. */
export type Shape =
  | { kind: "box"; args: [width: number, height: number, depth: number] }
  | { kind: "sphere"; args: [radius: number, widthSeg: number, heightSeg: number] }
  | { kind: "cylinder"; args: [rTop: number, rBottom: number, height: number, seg: number] }
  | { kind: "cone"; args: [radius: number, height: number, seg: number] }
  | { kind: "capsule"; args: [radius: number, length: number, capSeg: number, radialSeg: number] }
  | { kind: "torus"; args: [radius: number, tube: number, radialSeg: number, tubularSeg: number] }
  | { kind: "octahedron"; args: [radius: number] }
  /** A glTF file under `public/maps/…`, placed. The counterpart of a primitive. */
  | { kind: "model"; src: string };

/**
 * One piece of a map: a shape, where it sits, and how it is collided with.
 *
 * `color` is ignored for models — those wear whatever the artist gave them —
 * and defaults to the arena's off-white for primitives.
 */
export type Solid = {
  shape: Shape;
  position: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
  colliders?: Colliders;
  /**
   * Whether this piece casts a shadow. Defaults to true; the arena's shell sets
   * it false and that is not a tuning preference.
   *
   * The one directional light is overhead, so a ceiling that cast a shadow would
   * drop one over the entire room and every interior would go dark. Floor and
   * walls are the same argument more weakly. They still *receive*, which is what
   * makes the cover read as solid.
   */
  castShadow?: boolean;
};

/** Every model file a list of solids needs, deduplicated, in first-use order. */
export function modelsIn(solids: Solid[]): string[] {
  const seen = new Set<string>();
  for (const s of solids) if (s.shape.kind === "model") seen.add(s.shape.src);
  return [...seen];
}
