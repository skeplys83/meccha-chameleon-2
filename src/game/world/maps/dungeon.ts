import type { Solid } from "../shapes.ts";

/**
 * The dungeon: a 52 × 52 warren of nine rooms joined by corridors, with a raised
 * gallery over the crypt and a grate pit under the south end.
 *
 * Built from KayKit's Dungeon Pack (CC0) — see `public/maps/dungeon/LICENSE.txt`.
 * **Every model in the pack is placed at least once**, which is the point of the
 * map rather than a side effect: `scripts/check-map-assets.mjs` fails the commit
 * if a committed `.gltf` goes unused or a placement names a file that is not
 * there.
 *
 * ## The grid
 *
 * Every measurement below was read off the models' glTF accessors, not assumed.
 * The pack is built to a 4-unit grid; each piece is centred on X and Z with its
 * base at y = 0:
 *
 * ```
 *   floor_tile_large   4 × 4      top face at +0.05   ->  laid at y = -0.05
 *   ceiling_tile       4 × 4      underside at -0.25  ->  laid at y = CEILING + 0.25
 *   wall               4 wide, 4 tall, 1 thick, centred on its length
 * ```
 *
 * So floors sit on a 4-unit lattice, walls sit *on* the boundary lines between
 * tiles, and the whole map lands on whole numbers.
 *
 * ## Nothing in this pack is a door a hunter fits through
 *
 * Measured, because it decides how the map is joined together: the tallest
 * aperture in any of the 32 wall models is `wall_open_scaffold` at 2.35, and the
 * doorway frames are 2.20. A chameleon is 2 tall and a hunter 2.6, so **every
 * wall piece in this pack is a wall as far as a hunter is concerned.** Worse,
 * `wall_doorway` and `wall_doorway_scaffold` carry a door *leaf* inside the
 * frame, so as built they are solid for everyone.
 *
 * Two rules follow and both are load-bearing:
 *
 * 1. **Hunter circulation is gaps in the plan, never openings in a wall.** A
 *    corridor is floored cells with no wall between them. If it were a doorway
 *    piece the hunt could not reach the room behind it and the round would be
 *    unwinnable for hunters.
 * 2. **The three pieces with a real hole** — `wall_doorway_Tsplit`,
 *    `wall_doorway_sides` and `wall_open_scaffold` — are placed only as
 *    *interior* features, never in a sealing wall. Inside a room they are a
 *    chameleon-only shortcut, which is a nice asymmetry; in the perimeter they
 *    would be a hole a chameleon could leave the map through.
 */

const DIR = "/maps/dungeon";
const file = (name: string) => `${DIR}/${name}.gltf`;

const piece = (
  name: string,
  position: [number, number, number],
  rest: Partial<Solid> = {},
): Solid => ({ shape: { kind: "model", src: file(name) }, position, ...rest });

/** Tile size, and the whole reason every number below is round. */
const TILE = 4;
/** One course of wall. Two of them is the height of the tall rooms. */
const COURSE = 4;
/** Floor tiles are modelled with their top face 0.05 above the origin. */
const FLOOR_Y = -0.05;
/** Ceiling tiles hang 0.25 below theirs. */
const CEIL_DROP = 0.25;

const R = Math.PI;
const NORTH: [number, number, number] = [0, 0, 0];
const SOUTH: [number, number, number] = [0, R, 0];
const WEST: [number, number, number] = [0, R / 2, 0];
const EAST: [number, number, number] = [0, -R / 2, 0];

/**
 * The floor plan, one character per 4-unit cell, row `tz = -6` first.
 *
 * `.` is solid rock: no floor, and the walls around it are generated rather than
 * listed. Every other character is a zone, which decides that cell's floor
 * material, its ceiling height and what is scattered in it. The one-cell
 * corridors marked `c` are the only ways between rooms, and they are deliberately
 * open — see the note about doorways above.
 *
 *   g crypt (NW, has the gallery)   s storeroom (NE)     k kitchen (W)
 *   b barracks (E)                  t ruin (SW)          m treasury (SE)
 *   h great hall (the cross)        p grate pit (S)      c corridor
 */
const PLAN = [
  "gggg.hhh.ssss", // tz = -6
  "gggg.hhh.ssss", // tz = -5
  "ggggchhhcssss", // tz = -4
  "..c..hhh..c..", // tz = -3
  "kkkchhhhhcbbb", // tz = -2
  "kkk.hhhhh.bbb", // tz = -1
  "kkkchhhhhcbbb", // tz =  0
  "..c..hhh..c..", // tz =  1
  "ttttchhhcmmmm", // tz =  2
  "tttt.hhh.mmmm", // tz =  3
  "tttt.hhh.mmmm", // tz =  4
  "tttt.ppp.mmmm", // tz =  5
  ".....ppp.....", // tz =  6
];

/** Half-width of the plan in cells: indices run 0..12, so tile 0 is tx = -6. */
const HALF_CELLS = (PLAN.length - 1) / 2;

/** How many 4-unit courses of wall each zone stands, and so how high its lid is. */
const COURSES: Record<string, number> = {
  g: 2,
  h: 2,
  m: 2,
  p: 2,
  s: 1,
  k: 1,
  b: 1,
  t: 1,
  c: 1,
};

/** The base floor each zone is tiled with, before any override. */
const ZONE_FLOOR: Record<string, string> = {
  g: "floor_tile_large",
  h: "floor_tile_large",
  m: "floor_tile_large",
  p: "floor_tile_large_rocks",
  s: "floor_wood_large",
  k: "floor_tile_large",
  b: "floor_wood_large_dark",
  t: "floor_dirt_large",
  c: "floor_tile_large",
};

const world = (t: number) => t * TILE;
const zoneAt = (tx: number, tz: number): string | null => {
  const row = PLAN[tz + HALF_CELLS];
  if (!row) return null;
  const ch = row[tx + HALF_CELLS];
  return !ch || ch === "." ? null : ch;
};
const coursesAt = (tx: number, tz: number) => {
  const zone = zoneAt(tx, tz);
  return zone ? COURSES[zone] : 0;
};

/** Every floored cell, in reading order. */
const CELLS: { tx: number; tz: number; zone: string }[] = [];
for (let tz = -HALF_CELLS; tz <= HALF_CELLS; tz++) {
  for (let tx = -HALF_CELLS; tx <= HALF_CELLS; tx++) {
    const zone = zoneAt(tx, tz);
    if (zone) CELLS.push({ tx, tz, zone });
  }
}

/**
 * Cells whose floor is laid by hand below and must not also get their zone's
 * default tile — two floors in one cell is z-fighting, not decoration.
 */
const PAVED = new Set<string>();
const pave = (tx: number, tz: number) => PAVED.add(`${tx},${tz}`);

/* ------------------------------------------------------------------ floors */

/**
 * The great hall's two 8 × 8 grates, each covering a 2 × 2 block of cells.
 *
 * The open one is `trimesh` on purpose: its hole is real, so the middle of the
 * hall is a 1-deep pit you drop into and climb out of (jump apex is about 3).
 * A hull would fill it in — the same trap the arena's ring has.
 */
const hallGrates: Solid[] = [];
for (const [tx0, tz0, name, colliders] of [
  [-2, -2, "floor_tile_extralarge_grates", "trimesh"],
  [0, -2, "floor_tile_extralarge_grates_open", "trimesh"],
] as const) {
  for (const dx of [0, 1]) for (const dz of [0, 1]) pave(tx0 + dx, tz0 + dz);
  hallGrates.push(
    piece(name, [world(tx0) + TILE / 2, FLOOR_Y, world(tz0) + TILE / 2], {
      colliders,
      castShadow: false,
    }),
  );
}

/** The pit room: every grate and spike variant the pack has, one per cell. */
const pitFloor: Solid[] = [];
{
  const lay = (tx: number, tz: number, body: Solid[]) => {
    pave(tx, tz);
    pitFloor.push(...body);
  };
  lay(-1, 5, [
    piece("floor_tile_big_grate", [world(-1), FLOOR_Y, world(5)], {
      colliders: "trimesh",
      castShadow: false,
    }),
  ]);
  lay(0, 5, [
    piece("floor_tile_big_grate_open", [world(0), FLOOR_Y, world(5)], {
      colliders: "trimesh",
      castShadow: false,
    }),
  ]);
  lay(1, 5, [
    piece("floor_tile_big_spikes", [world(1), FLOOR_Y, world(5)], {
      colliders: "trimesh",
    }),
  ]);
  // The half-tiles are 4 wide by 2 deep, so a cell takes two of them.
  lay(
    -1,
    6,
    [-1, 1].map((dz) =>
      piece("floor_tile_grate", [world(-1), FLOOR_Y, world(6) + dz], {
        colliders: "trimesh",
        castShadow: false,
      }),
    ),
  );
  lay(
    0,
    6,
    [-1, 1].map((dz) =>
      piece("floor_tile_grate_open", [world(0), FLOOR_Y, world(6) + dz], {
        colliders: "trimesh",
        castShadow: false,
      }),
    ),
  );
}

/**
 * Mosaic cells: a cell paved with four 2 × 2 tiles instead of one 4 × 4.
 *
 * This is where the small floor variants live. Each entry is a cell and the four
 * tiles that fill it, in the order NW, NE, SW, SE.
 */
const MOSAICS: [tx: number, tz: number, tiles: [string, string, string, string]][] = [
  [
    -5,
    -4,
    [
      "floor_tile_small",
      "floor_tile_small_broken_A",
      "floor_tile_small_broken_B",
      "floor_tile_small_corner",
    ],
  ],
  [
    -4,
    -4,
    [
      "floor_tile_small_decorated",
      "floor_tile_small_weeds_A",
      "floor_tile_small_weeds_B",
      "floor_tile_small",
    ],
  ],
  [
    5,
    -5,
    [
      "floor_wood_small",
      "floor_wood_small_dark",
      "floor_wood_small_dark",
      "floor_wood_small",
    ],
  ],
  [
    -5,
    3,
    ["floor_dirt_small_A", "floor_dirt_small_B", "floor_dirt_small_C", "floor_dirt_small_D"],
  ],
  [
    -4,
    3,
    [
      "floor_dirt_small_corner",
      "floor_dirt_small_weeds",
      "floor_dirt_small_weeds",
      "floor_dirt_small_corner",
    ],
  ],
];

const mosaics: Solid[] = MOSAICS.flatMap(([tx, tz, tiles]) => {
  pave(tx, tz);
  const off: [number, number][] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  return tiles.map((name, i) =>
    piece(name, [world(tx) + off[i][0], FLOOR_Y, world(tz) + off[i][1]], {
      castShadow: false,
    }),
  );
});

/** Cells given a rougher version of their zone's floor, for variety underfoot. */
const ROUGH: [number, number, string][] = [
  [-3, 3, "floor_dirt_large_rocky"],
  [-6, 4, "floor_dirt_large_rocky"],
  [1, 3, "floor_tile_large_rocks"],
  [-6, -6, "floor_tile_large_rocks"],
];
const rough: Solid[] = ROUGH.map(([tx, tz, name]) => {
  pave(tx, tz);
  return piece(name, [world(tx), FLOOR_Y, world(tz)], { castShadow: false });
});

/** Everything else gets its zone's plain tile. */
const floors: Solid[] = CELLS.filter(({ tx, tz }) => !PAVED.has(`${tx},${tz}`)).map(
  ({ tx, tz, zone }) =>
    piece(ZONE_FLOOR[zone], [world(tx), FLOOR_Y, world(tz)], { castShadow: false }),
);

/** One lid per cell, at that zone's height. */
const ceiling: Solid[] = CELLS.map(({ tx, tz, zone }) =>
  piece("ceiling_tile", [world(tx), COURSES[zone] * COURSE + CEIL_DROP, world(tz)], {
    castShadow: false,
  }),
);

/* ------------------------------------------------------------------- walls */

type Towards = "-x" | "+x" | "-z" | "+z";
type Edge = { tx: number; tz: number; dir: "x" | "z"; towards: Towards; zone: string };

/**
 * Where a wall stands, and which way it faces.
 *
 * An `x` edge is the boundary between cell `tx` and `tx + 1`; a `z` edge is the
 * boundary between `tz` and `tz + 1`. `towards` is the side the room is on, which
 * is what every wall-mounted prop is hung against — banners, shelves and torches
 * all extend along their own +Z, so the rotation that turns +Z into the room is
 * the same rotation the wall itself gets.
 */
function faceOf(edge: Edge, inset: number) {
  const { tx, tz, dir, towards } = edge;
  if (dir === "z") {
    const line = world(tz) + TILE / 2;
    return towards === "-z"
      ? { position: [world(tx), 0, line - inset] as [number, number, number], rotation: SOUTH }
      : { position: [world(tx), 0, line + inset] as [number, number, number], rotation: NORTH };
  }
  const line = world(tx) + TILE / 2;
  return towards === "-x"
    ? { position: [line - inset, 0, world(tz)] as [number, number, number], rotation: EAST }
    : { position: [line + inset, 0, world(tz)] as [number, number, number], rotation: WEST };
}

/**
 * Every wall the plan implies, worked out rather than listed.
 *
 * Two cases, and the second is the one that is easy to miss:
 *
 * - **A floored cell against rock or the outside** is walled for its full
 *   height. That is what seals the map.
 * - **A tall room against a short one** is walled for the *difference*. The
 *   corridor's own lid stops at 4, so without this the volume between 4 and 8
 *   above every corridor would be an open attic a chameleon could climb into and
 *   walk the whole map through. Sealed from the taller side, leaving the bottom
 *   course open as the way through.
 */
/**
 * Keyed on the edge rather than collected per cell, because both cells either
 * side of a wall ask for it and only one of them may build it. The entry that
 * spans the most courses wins, which is what makes the tall-against-short seal
 * come out right whichever order the cells are visited in.
 */
const stacks = new Map<string, { edge: Edge; from: number; to: number }>();
for (const { tx, tz, zone } of CELLS) {
  const mine = COURSES[zone];
  const sides: [number, number, "x" | "z", Towards][] = [
    [tx - 1, tz, "x", "+x"],
    [tx, tz, "x", "-x"],
    [tx, tz - 1, "z", "+z"],
    [tx, tz, "z", "-z"],
  ];
  for (const [ex, ez, dir, towards] of sides) {
    const nx = dir === "x" ? (towards === "+x" ? tx - 1 : tx + 1) : tx;
    const nz = dir === "z" ? (towards === "+z" ? tz - 1 : tz + 1) : tz;
    const theirs = coursesAt(nx, nz);
    // Full height against rock or the outside; otherwise only the courses I
    // have and my neighbour does not, which seals the gap above a lower lid.
    // Equal heights next to each other is an open passage and gets nothing.
    const from = theirs === 0 ? 0 : theirs;
    if (from >= mine) continue;
    const key = `${ex},${ez},${dir}`;
    const existing = stacks.get(key);
    if (!existing || existing.to - existing.from < mine - from) {
      stacks.set(key, { edge: { tx: ex, tz: ez, dir, towards, zone }, from, to: mine });
    }
  }
}
/**
 * Wall variants that are exactly 4 wide and so drop straight into a run.
 *
 * Anything deeper than the plain wall simply protrudes into the room, which is
 * why they are all safe here: the rotation puts their +Z inside. **Every one of
 * these is solid** — `wall_open_scaffold` is 4 wide too but has a real 2.35 hole,
 * so it is placed by hand inside a room instead of being allowed into a seal.
 */
const DROP_IN = [
  "wall_arched",
  "wall_archedwindow_gated",
  "wall_archedwindow_gated_scaffold",
  "wall_archedwindow_open",
  "wall_broken",
  "wall_cracked",
  "wall_doorway",
  "wall_doorway_scaffold",
  "wall_gated",
  "wall_scaffold",
  "wall_shelves",
  "wall_sloped",
  "wall_window_closed",
  "wall_window_closed_scaffold",
  "wall_window_open",
  "wall_window_open_scaffold",
  "wall_pillar",
  "wall_Tsplit",
  "wall_Tsplit_sloped",
];

const stackList = [...stacks.values()];

/**
 * Spread a set of models evenly over a list of slots, so each is used at least
 * once and no two land on top of each other.
 *
 * Used for the wall variants, the banners, the torches and the wall trophies —
 * all of which have to sit on a wall that actually exists, and all of which
 * would be a floating object if they were positioned by hand against a plan that
 * later moved.
 */
function spread<T, S>(models: T[], slots: S[]): [T, S][] {
  if (!slots.length) return [];
  return models.map((m, i) => [m, slots[Math.floor((i * slots.length) / models.length)]]);
}

/** Ground-course slots, which is where anything hung on a wall can go. */
const groundSlots = stackList.filter((s) => s.from === 0);

const variantAt = new Map<string, string>();
for (const [name, slot] of spread(DROP_IN, groundSlots)) {
  variantAt.set(`${slot.edge.tx},${slot.edge.tz},${slot.edge.dir}`, name);
}

const walls: Solid[] = stackList.flatMap(({ edge, from, to }) => {
  const key = `${edge.tx},${edge.tz},${edge.dir}`;
  // Inset 0, so the wall straddles the boundary line the way the old chamber's
  // did — half in the cell, half in the rock. Anything *hung* on it uses 0.5,
  // which is the room-side face.
  const { position, rotation } = faceOf(edge, 0);
  const out: Solid[] = [];
  for (let course = from; course < to; course++) {
    const name = course === 0 ? (variantAt.get(key) ?? "wall") : "wall";
    out.push(
      piece(name, [position[0], course * COURSE, position[2]], {
        rotation,
        castShadow: false,
        // The pieces with a hole in them have to follow their own surface — a
        // hull fills the opening in, the trap the arena's ring has.
        colliders: name === "wall_arched" || name === "wall_archedwindow_open"
          ? "trimesh"
          : "cuboid",
      }),
    );
  }
  return out;
});

/* -------------------------------------------------- gallery over the crypt */

/**
 * A second storey over the crypt, and the one stair that reaches it.
 *
 * The stair matters more than it looks: **hunters cannot climb**, so an upper
 * floor they cannot walk onto is a place chameleons hide and never get found.
 * `stairs_long_modular_center` rises 4 over 8 of run — 26.5°, inside the
 * controller's 30° no-slide angle, which `stairs` and `stairs_wood` (32° and
 * 34°) are not. Those two are scenery elsewhere for exactly that reason.
 *
 * The models climb toward **-Z**, so the rotation that turns that into -X is
 * `WEST`'s opposite; `EAST` puts the top at -X, against the gallery edge.
 */
const GALLERY_CELLS: [number, number][] = [
  [-6, -6],
  [-5, -6],
  [-6, -5],
  [-5, -5],
  [-6, -4],
  [-5, -4],
];
const GALLERY_Y = COURSE;

const gallery: Solid[] = [
  ...GALLERY_CELLS.map(([tx, tz]) =>
    piece("floor_tile_large", [world(tx), GALLERY_Y + FLOOR_Y, world(tz)]),
  ),
  // Bottom of the run at x = -10, top at x = -18, level with the gallery edge.
  piece("stairs_long_modular_center", [-14, 0, world(-4)], {
    rotation: WEST,
    colliders: "hull",
  }),
  piece("stairs_long_modular_left", [-14, 0, world(-4) - 1.75], {
    rotation: WEST,
    colliders: "hull",
  }),
  piece("stairs_long_modular_right", [-14, 0, world(-4) + 1.75], {
    rotation: WEST,
    colliders: "hull",
  }),
];

/* ------------------------------------------------------- interior features */

/**
 * The wall pieces that are not 4 × 4 and so cannot stand in a run, placed as
 * ruins and partitions inside rooms.
 *
 * All three pieces with a genuine opening are here rather than in a seal:
 * inside a room they are a chameleon-only squeeze (2.20 and 2.35 clear, against
 * a 2-tall chameleon and a 2.6-tall hunter) with a way round for everybody else.
 */
const features: Solid[] = [
  // Ruined partitions across the great hall, leaving the flanks open.
  piece("wall_doorway_sides", [world(0), 0, world(2) - 2], { rotation: NORTH }),
  piece("wall_doorway_Tsplit", [world(0), 0, world(-3) + 2], { rotation: NORTH }),
  piece("wall_open_scaffold", [world(-1) + 2, 0, world(3)], { rotation: WEST }),
  // Stubs and endcaps: broken-off walls in the ruin and the crypt.
  piece("wall_half", [world(-5), 0, world(4) - 2], { rotation: NORTH }),
  piece("wall_half_endcap", [world(-3) - 1, 0, world(2)], { rotation: WEST }),
  piece("wall_half_endcap_sloped", [world(-6) + 1, 0, world(5)], { rotation: EAST }),
  piece("wall_endcap", [world(-4), 0, world(5) - 2], { rotation: NORTH }),
  piece("wall_corner", [world(4), 0, world(4)], { rotation: NORTH }),
  piece("wall_corner_gated", [world(6) - 1, 0, world(3)], { rotation: EAST }),
  piece("wall_corner_scaffold", [world(3), 0, world(5)], { rotation: SOUTH }),
  piece("wall_corner_small", [world(5), 0, world(2) + 1], { rotation: NORTH }),
  piece("wall_crossing", [world(-5), 0, world(-1)], { rotation: NORTH }),
  // Free-standing columns and pillars.
  piece("pillar", [world(-1) - 1.2, 0, world(-1)], { colliders: "hull" }),
  piece("pillar", [world(1) + 1.2, 0, world(-1)], { colliders: "hull" }),
  piece("pillar_decorated", [world(-1) - 1.2, 0, world(0) + 1.5], { colliders: "hull" }),
  piece("pillar_decorated", [world(1) + 1.2, 0, world(0) + 1.5], { colliders: "hull" }),
  piece("column", [world(0) - 1.6, 0, world(-4)], { colliders: "hull" }),
  piece("column", [world(0) + 1.6, 0, world(-4)], { colliders: "hull" }),
  // Barriers: low cover you can shoot over but not walk through.
  piece("barrier", [world(2), 0, world(-1) - 1.6], { rotation: NORTH }),
  piece("barrier_half", [world(2) + 1.4, 0, world(-1) - 1.6], { rotation: NORTH }),
  piece("barrier_column", [world(-2), 0, world(1) - 1.6], { rotation: NORTH }),
  piece("barrier_colum_half", [world(-2) + 1.4, 0, world(1) - 1.6], { rotation: NORTH }),
  piece("barrier_corner", [world(2) + 1, 0, world(1) - 1], { rotation: NORTH }),
];

/**
 * Every other staircase in the pack, as scenery and cover.
 *
 * None of these gates access to anywhere: they are all steeper than the 30° the
 * character controller will hold you on, so they read as rubble you can scramble
 * partway up rather than as routes. `stairs_walled` is the exception at exactly
 * 45° but it leads nowhere either.
 */
const stairs: Solid[] = [
  piece("stairs", [world(-5), 0, world(-6) + 1], { rotation: NORTH, colliders: "hull" }),
  piece("stairs_long", [world(4), 0, world(-5)], { rotation: NORTH, colliders: "hull" }),
  piece("stairs_narrow", [world(6), 0, world(-6) + 1], { rotation: NORTH, colliders: "hull" }),
  piece("stairs_wide", [world(0), 0, world(6) + 1], { rotation: NORTH, colliders: "hull" }),
  piece("stairs_walled", [world(-6) + 1, 0, world(-2)], { rotation: EAST, colliders: "hull" }),
  piece("stairs_wall_left", [world(-6) + 1.5, 0, world(0)], { rotation: EAST, colliders: "hull" }),
  piece("stairs_wall_right", [world(6) - 1.5, 0, world(0)], { rotation: WEST, colliders: "hull" }),
  piece("stairs_modular_center", [world(3), 0, world(-6) + 1], { rotation: NORTH, colliders: "hull" }),
  piece("stairs_modular_left", [world(3) - 1.75, 0, world(-6) + 1], { rotation: NORTH, colliders: "hull" }),
  piece("stairs_modular_right", [world(3) + 1.75, 0, world(-6) + 1], { rotation: NORTH, colliders: "hull" }),
  piece("stairs_wood", [world(5), 0, world(4)], { rotation: NORTH, colliders: "hull" }),
  piece("stairs_wood_decorated", [world(-6) + 1.7, 0, world(3)], { rotation: NORTH, colliders: "hull" }),
];

/**
 * The foundation blocks, as a plinth run in the treasury.
 *
 * They are 2 tall and 2.2 square with their base at y = 0, so they are a step
 * up onto — and a thing to hide behind — rather than scenery.
 */
const plinths: Solid[] = [
  "floor_foundation_allsides",
  "floor_foundation_corner",
  "floor_foundation_diagonal_corner",
  "floor_foundation_front",
  "floor_foundation_front_and_back",
  "floor_foundation_front_and_sides",
].map((name, i) =>
  piece(name, [world(5) - 1.2 + (i % 3) * 2.4, 0, world(4) - 1.2 + Math.floor(i / 3) * 2.4], {
    rotation: NORTH,
  }),
);

/* ------------------------------------------------------- things on a wall */

/**
 * Banners, torches and trophies, hung on walls the plan actually produced.
 *
 * Spread over the ground-course wall slots rather than positioned by hand, so
 * none of them can end up floating in a doorway the layout moved. All 42 banners
 * are here — the pack's whole run of colours and patterns — because a dungeon
 * that only uses six of them is a dungeon that quietly threw the other 36 away.
 */
const BANNERS = [
  "banner_blue", "banner_brown", "banner_green", "banner_red", "banner_white", "banner_yellow",
  "banner_patternA_blue", "banner_patternA_brown", "banner_patternA_green",
  "banner_patternA_red", "banner_patternA_white", "banner_patternA_yellow",
  "banner_patternB_blue", "banner_patternB_brown", "banner_patternB_green",
  "banner_patternB_red", "banner_patternB_white", "banner_patternB_yellow",
  "banner_patternC_blue", "banner_patternC_brown", "banner_patternC_green",
  "banner_patternC_red", "banner_patternC_white", "banner_patternC_yellow",
  "banner_shield_blue", "banner_shield_brown", "banner_shield_green",
  "banner_shield_red", "banner_shield_white", "banner_shield_yellow",
  "banner_thin_blue", "banner_thin_brown", "banner_thin_green",
  "banner_thin_red", "banner_thin_white", "banner_thin_yellow",
  "banner_triple_blue", "banner_triple_brown", "banner_triple_green",
  "banner_triple_red", "banner_triple_white", "banner_triple_yellow",
];

/** Hung flush: a banner's own geometry starts at its origin and hangs +Z. */
const banners: Solid[] = spread(BANNERS, groundSlots).map(([name, slot]) => {
  const { position, rotation } = faceOf(slot.edge, 0.5);
  return piece(name, position, { rotation, colliders: "hull" });
});

/** Sconces and trophies, at head height on their own slice of the same slots. */
const fixtures: Solid[] = [
  ...spread(["torch_mounted", "torch_mounted", "torch_mounted", "torch_mounted"], groundSlots).map(
    ([name, slot]) => {
      const { position, rotation } = faceOf(slot.edge, 0.45);
      return piece(name, [position[0], 2.4, position[2]], { rotation, colliders: "hull" });
    },
  ),
  ...spread(["sword_shield", "sword_shield_gold", "sword_shield_broken"], groundSlots).map(
    ([name, slot]) => {
      const { position, rotation } = faceOf(slot.edge, 0.42);
      return piece(name, [position[0], 2.2, position[2]], { rotation, colliders: "hull" });
    },
  ),
  ...spread(["shelves", "shelf_large", "shelf_small", "shelf_small_candles"], groundSlots).map(
    ([name, slot]) => {
      const { position, rotation } = faceOf(slot.edge, 0.3);
      const y = name === "shelves" ? 0 : 1.6;
      return piece(name, [position[0], y, position[2]], { rotation, colliders: "cuboid" });
    },
  ),
  ...spread(["keyring_hanging"], groundSlots).map(([name, slot]) => {
    const { position, rotation } = faceOf(slot.edge, 0.4);
    return piece(name, [position[0], 2.6, position[2]], { rotation, colliders: "hull" });
  }),
];

/* ------------------------------------------------------------------- props */

/** A prop, positioned in world units. Everything here sits on the floor. */
const p = (
  name: string,
  x: number,
  z: number,
  rest: Partial<Solid> & { y?: number } = {},
): Solid => {
  const { y = 0, ...opts } = rest;
  return piece(name, [x, y, z], opts);
};

const ROUND = { colliders: "hull" } as const;

/** Storeroom (NE): everything that comes in a barrel, a box or a crate. */
const storeroom: Solid[] = [
  p("barrel_large", world(3) - 1.2, world(-6) + 1.2, ROUND),
  p("barrel_large_decorated", world(4), world(-6) + 1.4, ROUND),
  p("barrel_small", world(5) - 1.4, world(-6) + 1, ROUND),
  p("barrel_small_stack", world(6) - 1, world(-6) + 1.3, ROUND),
  p("box_large", world(3) - 1.4, world(-4) - 1.2),
  p("box_small", world(3) + 0.4, world(-4) - 1.4),
  p("box_small_decorated", world(4) + 1.2, world(-4) - 1),
  p("box_stacked", world(6) - 1.2, world(-4) - 0.6),
  p("crates_stacked", world(5), world(-6) + 1.6),
  p("keg", world(6) - 1.2, world(-5), ROUND),
  p("keg_decorated", world(3) - 1, world(-5) + 0.6, ROUND),
  p("trunk_large_A", world(4) - 1.6, world(-4) + 1.2),
  p("trunk_large_B", world(4) + 0.2, world(-4) + 1.2),
  p("trunk_large_C", world(5) + 1.4, world(-4) + 1.2),
];

/** Kitchen (W): tables, what is on them, and what is under them. */
const kitchen: Solid[] = [
  p("table_long", world(-6) + 1.2, world(-1)),
  p("table_long_tablecloth", world(-5) + 0.4, world(-1)),
  p("table_long_broken", world(-4) - 0.2, world(-2) + 0.6),
  p("table_long_decorated_A", world(-6) + 1.2, world(0) + 1.2),
  p("table_long_decorated_C", world(-5) + 0.6, world(0) + 1.4),
  p("table_long_tablecloth_decorated_A", world(-4) - 0.4, world(0) + 1),
  p("table_medium", world(-6) + 1.4, world(-2) + 1),
  p("table_medium_broken", world(-5) + 1, world(-2) - 1),
  p("table_medium_decorated_A", world(-4) - 1, world(-1) - 1.2),
  p("table_medium_tablecloth", world(-4) + 0.8, world(-1) + 1.2),
  p("table_medium_tablecloth_decorated_B", world(-6) + 1, world(0) - 1.4),
  p("table_small", world(-5) - 0.6, world(0) - 1.2),
  p("table_small_decorated_A", world(-5) + 1.2, world(0) - 1.4),
  p("table_small_decorated_B", world(-4) - 1.2, world(0) - 1),
  p("chair", world(-6) + 1.2, world(-1) + 1.6),
  p("stool", world(-5) + 0.4, world(-1) - 1.6),
  // On the tables: plates, bottles and the light to see them by.
  p("plate", world(-6) + 1.2, world(-1) - 0.8, { y: 1.0 }),
  p("plate_small", world(-6) + 1.7, world(-1) + 0.6, { y: 1.0 }),
  p("plate_food_A", world(-5) + 0.4, world(-1) - 0.8, { y: 1.0 }),
  p("plate_food_B", world(-5) + 0.4, world(-1) + 0.8, { y: 1.0 }),
  p("plate_stack", world(-5) + 0.9, world(-1) + 0.1, { y: 1.0 }),
  p("bottle_A_brown", world(-6) + 0.8, world(-1) + 1.2, { y: 1.0, ...ROUND }),
  p("bottle_A_green", world(-6) + 1.1, world(-1) + 1.4, { y: 1.0, ...ROUND }),
  p("bottle_A_labeled_brown", world(-6) + 1.4, world(-1) + 1.2, { y: 1.0, ...ROUND }),
  p("bottle_A_labeled_green", world(-6) + 1.7, world(-1) + 1.4, { y: 1.0, ...ROUND }),
  p("bottle_B_brown", world(-5) - 0.1, world(-1) + 1.2, { y: 1.0, ...ROUND }),
  p("bottle_B_green", world(-5) + 0.2, world(-1) + 1.4, { y: 1.0, ...ROUND }),
  p("bottle_C_brown", world(-5) + 0.6, world(-1) + 1.2, { y: 1.0, ...ROUND }),
  p("bottle_C_green", world(-5) + 1.0, world(-1) + 1.4, { y: 1.0, ...ROUND }),
  p("candle", world(-6) + 1.2, world(-1), { y: 1.0 }),
  p("candle_lit", world(-5) + 0.4, world(-1), { y: 1.0 }),
  p("candle_melted", world(-4) - 0.2, world(-2) + 0.6, { y: 1.27 }),
  p("candle_thin", world(-6) + 1.6, world(-1) - 0.3, { y: 1.0 }),
  p("candle_thin_lit", world(-5) + 0.8, world(-1) - 0.3, { y: 1.0 }),
  p("candle_triple", world(-6) + 1.4, world(0) + 1.2, { y: 1.0 }),
];

/** Barracks (E): where the garrison slept and left its kit. */
const barracks: Solid[] = [
  p("bed_frame", world(6) - 1, world(-2) + 0.5, { rotation: WEST }),
  p("bed_decorated", world(6) - 1, world(-1) + 0.5, { rotation: WEST }),
  p("bed_floor", world(6) - 1, world(0) + 0.5, { rotation: WEST }),
  p("trunk_medium_A", world(4) - 1.2, world(-2) + 1.2),
  p("trunk_medium_B", world(4) + 0.4, world(-2) + 1.2),
  p("trunk_medium_C", world(5) + 1.2, world(-2) + 1.2),
  p("trunk_small_A", world(4) - 1.2, world(0) - 1.2),
  p("trunk_small_B", world(4) + 0.2, world(0) - 1.2),
  p("trunk_small_C", world(5), world(0) - 1.2),
  p("torch", world(4) - 1.6, world(-1), { y: 0.4, ...ROUND }),
  p("torch_lit", world(4) - 1.6, world(-1) + 1, { y: 0.4, ...ROUND }),
  p("chest", world(5) + 1, world(-1) - 1),
];

/** Treasury (SE): the chests, and what has spilled out of them. */
const treasury: Solid[] = [
  p("chest_gold", world(3) - 1, world(2) + 1),
  p("coin_stack_large", world(3) + 0.6, world(2) + 1.2, ROUND),
  p("coin_stack_medium", world(3) + 1.4, world(2) + 0.6, ROUND),
  p("coin_stack_small", world(4) - 0.6, world(2) + 1.4, ROUND),
  p("coin", world(4), world(2) + 0.4, { y: 0.06, ...ROUND }),
  p("coin", world(4) + 0.5, world(2) + 0.9, { y: 0.06, ...ROUND }),
  p("key", world(3) - 1.6, world(2) + 1.6, { y: 0.2 }),
  p("keyring", world(6) - 1.2, world(2) + 1.2, { y: 0.02 }),
];

/** The ruin (SW) and the pit: rubble, and the things left to rot in it. */
const ruin: Solid[] = [
  p("rubble_large", world(-5), world(2) + 1, { rotation: NORTH }),
  p("rubble_half", world(-3) - 0.5, world(5) - 1, { rotation: EAST }),
  p("barrel_large", world(-6) + 1.2, world(5) + 1.2, ROUND),
  p("box_large", world(-3) - 1.2, world(4)),
  p("crates_stacked", world(-4), world(5) + 1.2),
];

/** The great hall: cover in the middle of the biggest room. */
const hall: Solid[] = [
  p("barrel_large", world(-2) + 1.2, world(0) - 1.2, ROUND),
  p("barrel_large", world(2) - 1.2, world(0) - 1.2, ROUND),
  p("box_large", world(-1) - 1.2, world(2) + 1.2),
  p("box_large", world(1) + 1.2, world(2) + 1.2),
  p("box_stacked", world(0), world(4) + 0.8),
  p("crates_stacked", world(-1), world(-5)),
  p("barrel_small_stack", world(1), world(-5), ROUND),
  p("table_long", world(0), world(-6) + 1.2),
  p("chair", world(0) - 1.4, world(-6) + 1.2),
  p("stool", world(0) + 1.4, world(-6) + 1.2),
];

/** The crypt (NW), under and on the gallery. */
const crypt: Solid[] = [
  p("trunk_large_A", world(-6) + 1.2, world(-6) + 1.2, { y: GALLERY_Y }),
  p("box_small", world(-5), world(-6) + 1.4, { y: GALLERY_Y }),
  p("barrel_small", world(-6) + 1.2, world(-5), { y: GALLERY_Y, ...ROUND }),
  p("candle_lit", world(-5) + 1, world(-5), { y: GALLERY_Y }),
  p("box_large", world(-6) + 1.2, world(-4) - 1.2),
  p("barrel_large", world(-5) - 0.4, world(-4) - 1.2, ROUND),
  p("column", world(-6) + 1, world(-6) + 1, ROUND),
  p("chest", world(-3) - 1.2, world(-6) + 1.2),
];

export const DUNGEON_SOLIDS: Solid[] = [
  ...floors,
  ...mosaics,
  ...rough,
  ...hallGrates,
  ...pitFloor,
  ...ceiling,
  ...walls,
  ...gallery,
  ...features,
  ...stairs,
  ...plinths,
  ...banners,
  ...fixtures,
  ...storeroom,
  ...kitchen,
  ...barracks,
  ...treasury,
  ...ruin,
  ...hall,
  ...crypt,
];

/**
 * Where a player drops in: the middle of the great hall.
 *
 * Floor tiles put their top face at y = 0, so a centre at 2 clears the tallest
 * body by 0.7. Cell (0, 0) is deliberately left clear of props and is not one of
 * the grated cells, so a full lobby lands on solid floor and walks apart.
 */
export const DUNGEON_SPAWN: [number, number, number] = [0, 2, 0];

/**
 * Half-extent of the playable footprint: the plan is 13 cells of 4 across, so
 * the floor spans -26..26.
 *
 * The server clamps every reported position against this — see `mapLimit` in
 * `world/maps.ts`. It used to be one number for the whole game, which is exactly
 * what stopped the dungeon being bigger than the arena.
 */
export const DUNGEON_BOUND = (PLAN.length * TILE) / 2;

/**
 * The whole playable round: the hiding phase plus the hunt, before the reveal.
 *
 * Five minutes, up from two. The old chamber was one room a hunter swept in
 * fifteen seconds; this is nine rooms, a gallery and a pit, and a sweep of it is
 * closer to ninety.
 */
export const DUNGEON_ROUND_SECONDS = 300;
