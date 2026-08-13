import * as THREE from "three";

/**
 * Turns a loaded level `.glb` into the two things the game wants from it: a
 * visual scene that is never collided with, and a set of colliders that are
 * never drawn.
 *
 * Deliberately **not** a component and deliberately free of React, so it can be
 * run outside a browser — parse a `.glb` with `GLTFLoader.parse` in Node, hand
 * the scene to this, and every claim in `world/CLAUDE.md`'s conventions table
 * is checkable without a canvas.
 */

/**
 * One collision object, reduced to exactly what rapier and the raycaster need
 * for its shape — and nothing more, so a field that is meaningless for a kind
 * cannot be read by mistake.
 *
 * Which shape you get is chosen by the object's prefix in Blender, because the
 * right answer is never derivable from the mesh: a hull around a ring fills its
 * hole in, and a box around a dome is a box.
 *
 * | prefix | collider | for |
 * | --- | --- | --- |
 * | `col_` | cuboid | walls, floors, crates — almost everything |
 * | `colhull_` | convex hull | cylinders, cones, ramps, anything sloped |
 * | `coltri_` | trimesh | only shapes with a **hole** through them |
 * | `colball_` | ball | spheres and domes |®
 *
 * Prefer `col_`. A cuboid is one comparison; a trimesh is the most expensive
 * collider rapier has, and using one where a hull would do is the classic way
 * to make a map that stutters.
 */
export type ColliderKind = "cuboid" | "hull" | "trimesh" | "ball";

/**
 * Where the collider sits. Hulls and trimeshes carry their world transform in
 * their *vertices*, so for those this is the raycast proxy's transform only and
 * the collider itself stays at the origin.
 */
type Placed = { position: THREE.Vector3; quaternion: THREE.Quaternion };

export type LevelCollider =
  | (Placed & { kind: "cuboid"; half: [number, number, number] })
  | (Placed & { kind: "ball"; radius: number })
  | (Placed & {
    kind: "hull";
    geometry: THREE.BufferGeometry;
    vertices: Float32Array;
  })
  | (Placed & {
    kind: "trimesh";
    geometry: THREE.BufferGeometry;
    vertices: Float32Array;
    indices: Uint32Array;
  });

// The prefixes are mutually exclusive — `colhull_` does not start with `col_`,
// because the fourth character is `h` rather than `_` — so the order here is
// presentation, not precedence.
const PREFIXES: [string, ColliderKind][] = [
  ["col_", "cuboid"],
  ["colhull_", "hull"],
  ["coltri_", "trimesh"],
  ["colball_", "ball"],
];

/** Which collider a name asks for, or null if it is not a collision object. */
export function colliderKindOf(name: string): ColliderKind | null {
  for (const [prefix, kind] of PREFIXES) if (name.startsWith(prefix)) return kind;
  return null;
}

export type PreparedLevel = {
  scene: THREE.Object3D;
  colliders: LevelCollider[];
  /** Reported by `checkLevel` in development. Nothing decides anything on it. */
  stats: {
    drawn: number;
    instanced: number;
    batches: number;
    lights: number;
    shadowCasters: number;
  };
};

/** Scratch, so preparing a level does not allocate a vector per piece. */
const SCALE = new THREE.Vector3();
const SIZE = new THREE.Vector3();
const SPARE_V = new THREE.Vector3();
const SPARE_Q = new THREE.Quaternion();

/**
 * The exporter is *asked* for `EXT_mesh_gpu_instancing` and does not always
 * give it — the flag is version-dependent and silently does nothing when it
 * declines. So the batching is done here instead, where it depends on nothing
 * but the file having repeated geometry.
 *
 * A level built from a kit is almost entirely repeats: dozens of floor tiles
 * drawn from a handful of meshes. Left as they are exported, that is one draw
 * call per tile.
 */
function batch(scene: THREE.Object3D, drawn: THREE.Mesh[]) {
  const groups = new Map<string, THREE.Mesh[]>();
  for (const mesh of drawn) {
    const material = mesh.material as THREE.Material;
    const key = `${mesh.geometry.uuid}|${material.uuid}`;
    const group = groups.get(key);
    if (group) group.push(mesh);
    else groups.set(key, [mesh]);
  }

  let instanced = 0;
  let batches = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const [first] = group;
    const mesh = new THREE.InstancedMesh(
      first.geometry,
      first.material as THREE.Material,
      group.length,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Every piece of a level is static, so the matrices are written once.
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    group.forEach((source, i) => {
      mesh.setMatrixAt(i, source.matrixWorld);
      source.removeFromParent();
    });
    mesh.instanceMatrix.needsUpdate = true;
    // Placed at the root with world matrices baked in, so it does not matter
    // what the originals were parented to.
    scene.add(mesh);

    instanced += group.length;
    batches += 1;
  }

  return { instanced, batches };
}

/** The world-space geometry a hull or trimesh collider is built from. */
function bake(mesh: THREE.Mesh) {
  const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  geometry.computeBoundingBox();
  const vertices = geometry.attributes.position.array as Float32Array;
  return { geometry, vertices };
}

function colliderFrom(mesh: THREE.Mesh, kind: ColliderKind): LevelCollider | null {
  mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox;
  if (!bounds) return null;

  // The collider sits at the bounding box's *centre*, which is not the object's
  // origin — a wall modelled standing up from y = 0 has its origin on the floor.
  const placed: Placed = {
    position: bounds.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),
    quaternion: new THREE.Quaternion().setFromRotationMatrix(mesh.matrixWorld),
  };

  if (kind === "hull") return { ...placed, kind, ...bake(mesh) };

  if (kind === "trimesh") {
    const baked = bake(mesh);
    const index = baked.geometry.index;
    // Rapier wants indices; an unindexed geometry is just 0..n in order. Built
    // here rather than at render, so it is not rebuilt on every re-render.
    const indices = index
      ? Uint32Array.from(index.array)
      : Uint32Array.from({ length: baked.vertices.length / 3 }, (_, i) => i);
    return { ...placed, kind, ...baked, indices };
  }

  mesh.matrixWorld.decompose(SPARE_V, SPARE_Q, SCALE);

  if (kind === "ball") {
    mesh.geometry.computeBoundingSphere();
    const scale = Math.max(Math.abs(SCALE.x), Math.abs(SCALE.y), Math.abs(SCALE.z));
    const radius = (mesh.geometry.boundingSphere?.radius ?? 0) * scale;
    // A collider with a zero extent is one rapier will not build.
    return { ...placed, kind, radius: Math.max(radius, 0.001) };
  }

  bounds.getSize(SIZE).multiply(SCALE).multiplyScalar(0.5);
  return {
    ...placed,
    kind: "cuboid",
    half: [
      Math.max(Math.abs(SIZE.x), 0.001),
      Math.max(Math.abs(SIZE.y), 0.001),
      Math.max(Math.abs(SIZE.z), 0.001),
    ],
  };
}

export function prepareLevel(source: THREE.Object3D): PreparedLevel {
  const scene = source.clone(true);
  scene.updateMatrixWorld(true);

  const collision: [THREE.Mesh, ColliderKind][] = [];
  const drawn: THREE.Mesh[] = [];
  let lights = 0;
  let shadowCasters = 0;

  scene.traverse((child) => {
    const light = child as THREE.Light;
    if (light.isLight) {
      lights += 1;
      // Blender's exported lights are wildly brighter than this runtime's
      // `physicallyCorrectLights` defaults. The map files are loading with point
      // light intensities around 1,200–4,600, which makes every lamp wash out
      // the scene. Scale them down once on import so the authored brightness
      // survives the glTF conversion. `shadow_*` lights still opt into shadowing
      // by name, but they keep the same normalized intensity after this.
      light.intensity *= 0.01;
      if (light.name.startsWith("shadow_")) {
        shadowCasters += 1;
        light.castShadow = true;
        const shadow = (light as THREE.DirectionalLight).shadow;
        if (shadow) {
          shadow.mapSize.set(1024, 1024);
          shadow.bias = -0.0005;
        }
      }
      return;
    }

    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    const kind = colliderKindOf(mesh.name);
    if (kind) {
      collision.push([mesh, kind]);
      return;
    }

    // Decoration. Deliberately *not* named `ROOM_SURFACE`: shots, the ground
    // test and the camera all read the collision layer instead. See invariant 5.
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    drawn.push(mesh);
  });

  const colliders: LevelCollider[] = [];
  for (const [mesh, kind] of collision) {
    const collider = colliderFrom(mesh, kind);
    if (collider) colliders.push(collider);
    mesh.removeFromParent();
  }

  const { instanced, batches } = batch(scene, drawn);

  return {
    scene,
    colliders,
    stats: { drawn: drawn.length, instanced, batches, lights, shadowCasters },
  };
}

/** How far out a collider reaches on the ground plane. */
function reachOf(collider: LevelCollider) {
  if (collider.kind === "hull" || collider.kind === "trimesh") {
    const bounds = collider.geometry.boundingBox;
    if (!bounds) return 0;
    return Math.max(
      Math.abs(bounds.min.x),
      Math.abs(bounds.max.x),
      Math.abs(bounds.min.z),
      Math.abs(bounds.max.z),
    );
  }
  const { x, z } = collider.position;
  const [ex, ez] =
    collider.kind === "ball"
      ? [collider.radius, collider.radius]
      : [collider.half[0], collider.half[2]];
  return Math.max(Math.abs(x) + ex, Math.abs(z) + ez);
}

/**
 * Compares a loaded level against the numbers typed beside it in `maps.ts`, and
 * reports what it is made of.
 *
 * There is no build step between Blender and the game, so those numbers can
 * drift from the file the moment you move something. Both ways it drifts are
 * silent and neither looks like a bug from inside the game:
 *
 * - **`bound` too small** and the server clamps players inside a room they can
 *   still walk around in, so everyone else watches them stop dead at an
 *   invisible wall while their own screen shows them walking on.
 * - **`spawn` moved** and a round starts with everybody falling out of the
 *   world, or standing inside the geometry that replaced the floor.
 *
 * Development only, and it warns rather than throws: a level that is wrong is
 * still worth walking around in while you work out why.
 */
export function checkLevel(
  level: { id: string; bound: number; spawn: [number, number, number] },
  prepared: PreparedLevel,
) {
  const { colliders, scene, stats } = prepared;
  const say = (message: string) => console.warn(`level "${level.id}": ${message}`);

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  console.info(
    `level "${level.id}": ${stats.drawn} meshes → ` +
    `${stats.drawn - stats.instanced + stats.batches} draw calls, ` +
    `${plural(colliders.length, "collider")}, ` +
    `${plural(stats.lights, "light")} (${stats.shadowCasters} casting shadows)`,
  );

  // Every point light that casts is six render passes. Four is already a lot
  // for a browser; past that the frame cost stops being worth the darkness.
  if (stats.shadowCasters > 4) {
    say(`${stats.shadowCasters} lights cast shadows — drop the shadow_ prefix on some`);
  }
  if (!stats.lights) {
    say("no lights in the file — the map will be black. The game adds none.");
  }

  if (!colliders.length) {
    say("no collision objects — nothing to stand on. Is anything named col_*?");
    return;
  }

  let reach = 0;
  for (const collider of colliders) reach = Math.max(reach, reachOf(collider));

  // A perimeter wall always reaches past the floor it encloses, by its own
  // thickness — `bound` is the playable interior, not the outside of the shell,
  // so a small overshoot is correct and must not cry wolf. This is here to
  // catch a `bound` that is *badly* stale, which is what happens when a map
  // grows and the number beside it does not.
  const SHELL_SLACK = 1.5;
  if (reach > level.bound + SHELL_SLACK) {
    say(
      `collision reaches ${reach.toFixed(2)} but bound is ${level.bound} — ` +
      `players past ${level.bound} will be clamped. Raise it in maps.ts.`,
    );
  }

  // The `spawn` empty is the author's marker; `maps.ts` has to repeat it
  // because the player is placed before the file has loaded. It survives into
  // the prepared scene because it is an Empty rather than a mesh.
  const marker = scene.getObjectByName("spawn");
  if (marker) {
    const at = new THREE.Vector3().setFromMatrixPosition(marker.matrixWorld);
    if (at.distanceTo(SPARE_V.set(...level.spawn)) > 0.05) {
      say(
        `the spawn empty is at [${at.toArray().map((n) => n.toFixed(2))}] ` +
        `but maps.ts says [${level.spawn.join(", ")}]`,
      );
    }
  }
}
