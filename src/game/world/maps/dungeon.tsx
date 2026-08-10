"use client";

import { useGLTF } from "@react-three/drei";

import { Piece, preloadPieces } from "../Piece";

/**
 * A very small dungeon: one 12×12 chamber, split by a low wall into a big room
 * and a back room, sealed by a ceiling.
 *
 * Built from KayKit's Dungeon Pack (CC0) — see `public/maps/dungeon/LICENSE.txt`.
 * Only the seven pieces used are committed, about 200 KB including the shared
 * texture atlas.
 *
 * ## The grid
 *
 * Every measurement below was read off the models, not assumed. The pack is
 * built to a 4-unit grid and every piece is centred on X and Z with its base at
 * y = 0, which is what makes a table of positions enough to place them:
 *
 * ```
 *   floor_tile_large   4 × 4      top face at +0.05   ->  laid at y = -0.05
 *   ceiling_tile       4 × 4      underside at -0.25  ->  laid at y = CEILING + 0.25
 *   wall               4 wide, 4 tall, 1 thick, centred on its length
 *   barrel/box/column  centred, base at y = 0
 * ```
 *
 * So floors sit on a 4-unit lattice, walls sit *on* the boundary lines between
 * tiles, and the whole room lands on whole numbers. A hider is 2 tall and a
 * seeker 2.6, which makes a 4-unit wall exactly the "must be climbed, cannot be
 * jumped" height — jump apex is about 3.
 */

const DIR = "/maps/dungeon";
const src = (name: string) => `${DIR}/${name}.gltf`;

const FLOOR = src("floor_tile_large");
const CEIL = src("ceiling_tile");
const WALL = src("wall");
const DOORWAY = src("wall_doorway");
const BARREL = src("barrel_large");
const BOX = src("box_large");
const COLUMN = src("column");

const PIECES = [FLOOR, CEIL, WALL, DOORWAY, BARREL, BOX, COLUMN];
preloadPieces(PIECES);

/** Tile size, and the whole reason the numbers below are round. */
const TILE = 4;
/** Tile centres: a 3 × 3 chamber, so the floor spans -6..6. */
const CELLS = [-TILE, 0, TILE];
/** Where the walls stand — the outer edge of the floor. */
const EDGE = 1.5 * TILE; // 6
/** Two courses of wall, so there is headroom for the third-person camera. */
const WALL_H = 4;
const CEILING = 2 * WALL_H; // 8

/** Floor tiles are modelled with their top face 0.05 above the origin. */
const FLOOR_Y = -0.05;
/** Ceiling tiles hang 0.25 below theirs. */
const CEIL_Y = CEILING + 0.25;

const R = Math.PI;
const NORTH: [number, number, number] = [0, 0, 0];
const SOUTH: [number, number, number] = [0, R, 0];
const WEST: [number, number, number] = [0, R / 2, 0];
const EAST: [number, number, number] = [0, -R / 2, 0];

type Placed = {
  src: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  colliders?: "cuboid" | "hull" | "trimesh" | "ball";
};

const floors: Placed[] = CELLS.flatMap((x) =>
  CELLS.map((z): Placed => ({ src: FLOOR, position: [x, FLOOR_Y, z] })),
);

const ceiling: Placed[] = CELLS.flatMap((x) =>
  CELLS.map((z): Placed => ({ src: CEIL, position: [x, CEIL_Y, z] })),
);

/**
 * The four outer walls, two courses high.
 *
 * A wall is 4 long and 1 thick, centred, so one placed at `z = -EDGE` straddles
 * the floor's edge and the next runs flush against it. The four outer corners
 * are left with a 0.5 notch where two walls meet, which is outside the sealed
 * room and cannot be reached or seen from inside it.
 */
const walls: Placed[] = [0, WALL_H].flatMap((y) => [
  ...CELLS.map((x): Placed => ({ src: WALL, position: [x, y, -EDGE], rotation: NORTH })),
  ...CELLS.map((x): Placed => ({ src: WALL, position: [x, y, EDGE], rotation: SOUTH })),
  ...CELLS.map((z): Placed => ({ src: WALL, position: [-EDGE, y, z], rotation: WEST })),
  ...CELLS.map((z): Placed => ({ src: WALL, position: [EDGE, y, z], rotation: EAST })),
]);

/**
 * The divider, one course high, across two thirds of the room.
 *
 * It deliberately stops short: the east third is an open corridor, so both roles
 * can always get through. The arch is a shortcut rather than the only way — its
 * opening is about 2.1 tall, which a 2-tall hider fits through and a 2.6-tall
 * seeker does not. Being one course high in a two-course room also means it can
 * simply be climbed, which is the more interesting answer anyway.
 *
 * `trimesh` on the doorway is not optional. A hull would fill the arch in, the
 * same trap the arena's ring has.
 */
const divider: Placed[] = [
  { src: WALL, position: [-TILE, 0, TILE / 2], rotation: NORTH },
  { src: DOORWAY, position: [0, 0, TILE / 2], rotation: NORTH, colliders: "trimesh" },
];

/** Cover. A 12 × 12 room with nothing in it is not a hiding place. */
const props: Placed[] = [
  { src: BARREL, position: [-3.6, 0, -3.6], colliders: "hull" },
  { src: BARREL, position: [3.8, 0, -4.0], colliders: "hull" },
  { src: BOX, position: [4.4, 0, 0.2] },
  { src: BOX, position: [-4.4, 0, -0.4] },
  { src: COLUMN, position: [-1.8, 0, -4.6], colliders: "hull" },
  { src: COLUMN, position: [1.8, 0, -4.6], colliders: "hull" },
  // The back room, past the divider.
  { src: BARREL, position: [-3.8, 0, 4.2], colliders: "hull" },
  { src: BOX, position: [3.9, 0, 4.3] },
];

const LAYOUT: Placed[] = [...floors, ...ceiling, ...walls, ...divider, ...props];

export function Dungeon() {
  /**
   * Load every model here, in one call, before a single `Piece` renders.
   *
   * Each `Piece` also calls `useGLTF`, and if the first one to want a file were
   * the one to fetch it, the map would suspend once per *file*: React discards a
   * suspended tree, so the rigid bodies of the pieces that had already committed
   * would be torn down and rebuilt on every one of those rounds. Rapier does not
   * survive that — it panics inside wasm with `unreachable`, and from then on
   * every call throws `recursive use of an object`, which kills physics for the
   * rest of the session.
   *
   * One suspension, resolved before any `RigidBody` is created. The per-piece
   * `useGLTF` calls below then read straight from the cache.
   */
  useGLTF(PIECES);

  return (
    <>
      {LAYOUT.map((p, i) => (
        <Piece
          key={`${p.src}-${i}`}
          src={p.src}
          position={p.position}
          rotation={p.rotation}
          colliders={p.colliders}
        />
      ))}
    </>
  );
}
