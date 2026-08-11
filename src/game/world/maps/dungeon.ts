import type { Solid } from "../shapes.ts";

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
 * tiles, and the whole room lands on whole numbers. A chameleon is 2 tall and a
 * hunter 2.6, which makes a 4-unit wall exactly the "must be climbed, cannot be
 * jumped" height — jump apex is about 3.
 */

const DIR = "/maps/dungeon";
const file = (name: string) => `${DIR}/${name}.gltf`;

const FLOOR = file("floor_tile_large");
const CEIL = file("ceiling_tile");
const WALL = file("wall");
const DOORWAY = file("wall_doorway");
const BARREL = file("barrel_large");
const BOX = file("box_large");
const COLUMN = file("column");

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

/**
 * Where a player drops in: the middle of the big room, on the near side of the
 * divider.
 *
 * Floor tiles put their top face at y = 0, so a centre at 2 clears the tallest
 * body by 0.7. The nearest obstruction in any direction is the divider at
 * z = 2, and the barrels, boxes and columns all sit at 1.8 or further out, so
 * nothing can be landed on top of.
 */
export const DUNGEON_SPAWN: [number, number, number] = [0, 2, 0];

/**
 * The whole playable round: the hiding phase plus the hunt, before the reveal.
 *
 * Two minutes for a 12×12 chamber. It is per map because a 40×40 arena and a
 * single room want very different amounts of time — one sweep of this place
 * takes a hunter about fifteen seconds.
 */
export const DUNGEON_ROUND_SECONDS = 120;

const piece = (
  src: string,
  position: [number, number, number],
  rest: Partial<Solid> = {},
): Solid => ({ shape: { kind: "model", src }, position, ...rest });

const floors: Solid[] = CELLS.flatMap((x) =>
  CELLS.map((z) => piece(FLOOR, [x, FLOOR_Y, z])),
);

const ceiling: Solid[] = CELLS.flatMap((x) =>
  CELLS.map((z) => piece(CEIL, [x, CEIL_Y, z])),
);

/**
 * The four outer walls, two courses high.
 *
 * A wall is 4 long and 1 thick, centred, so one placed at `z = -EDGE` straddles
 * the floor's edge and the next runs flush against it. The four outer corners
 * are left with a 0.5 notch where two walls meet, which is outside the sealed
 * room and cannot be reached or seen from inside it.
 */
const walls: Solid[] = [0, WALL_H].flatMap((y) => [
  ...CELLS.map((x) => piece(WALL, [x, y, -EDGE], { rotation: NORTH })),
  ...CELLS.map((x) => piece(WALL, [x, y, EDGE], { rotation: SOUTH })),
  ...CELLS.map((z) => piece(WALL, [-EDGE, y, z], { rotation: WEST })),
  ...CELLS.map((z) => piece(WALL, [EDGE, y, z], { rotation: EAST })),
]);

/**
 * The divider, one course high, across two thirds of the room.
 *
 * It deliberately stops short: the east third is an open corridor, so both roles
 * can always get through. The arch is a shortcut rather than the only way — its
 * opening is about 2.1 tall, which a 2-tall chameleon fits through and a 2.6-tall
 * hunter does not. Being one course high in a two-course room also means it can
 * simply be climbed, which is the more interesting answer anyway.
 *
 * `trimesh` on the doorway is not optional. A hull would fill the arch in, the
 * same trap the arena's ring has.
 */
const divider: Solid[] = [
  piece(WALL, [-TILE, 0, TILE / 2], { rotation: NORTH }),
  piece(DOORWAY, [0, 0, TILE / 2], { rotation: NORTH, colliders: "trimesh" }),
];

/** Cover. A 12 × 12 room with nothing in it is not a hiding place. */
const props: Solid[] = [
  piece(BARREL, [-3.6, 0, -3.6], { colliders: "hull" }),
  piece(BARREL, [3.8, 0, -4.0], { colliders: "hull" }),
  piece(BOX, [4.4, 0, 0.2]),
  piece(BOX, [-4.4, 0, -0.4]),
  piece(COLUMN, [-1.8, 0, -4.6], { colliders: "hull" }),
  piece(COLUMN, [1.8, 0, -4.6], { colliders: "hull" }),
  // The back room, past the divider.
  piece(BARREL, [-3.8, 0, 4.2], { colliders: "hull" }),
  piece(BOX, [3.9, 0, 4.3]),
];

export const DUNGEON_SOLIDS: Solid[] = [
  ...floors,
  ...ceiling,
  ...walls,
  ...divider,
  ...props,
];
