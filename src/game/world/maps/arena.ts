import { PAINT } from "../../paint/palette.ts";
import { ROOM_HALF } from "../../shared/protocol.ts";
import type { Solid } from "../shapes.ts";

/**
 * The arena, as data.
 *
 * Two rules shaped the layout. **Everything tall has a way up** — a ramp, a
 * stair, a tier or a smaller neighbour to hop from — because a chameleon who cannot
 * reach the high ground has nowhere to hide but the corners. Jump height is
 * about 3 units (`JUMP_SPEED²/2g` in `players/Player.tsx`), so no single step is
 * more than ~2.
 *
 * And **the coloured pieces are painted in exact palette hexes**, so you can
 * pick the matching swatch in the paint panel and check whether you actually
 * disappear against one. They are spread around the room, one colour each. Do
 * not "tidy" one to an off-palette shade: an exact match is the whole point.
 *
 * The two imports here are both import-free themselves, which is what keeps this
 * file readable by Node — see `world/shapes.ts` for why that matters.
 */

const SIZE = ROOM_HALF * 2; // interior width/depth
const HEIGHT = 12;
const THICKNESS = 1;

/** Anything not painted a palette colour. */
const ARENA = "#f1f1f1";
/** The shell is a shade brighter than the furniture, so corners read as corners. */
const SHELL = "#ffffff";

const half = SIZE / 2;
const t = THICKNESS / 2;

/**
 * Where a player drops in.
 *
 * The floor's top face is y = 0 and the tallest body's half-height is 1.3, so a
 * centre at 2 clears it by 0.7 — a step down rather than a plunge. It is
 * deliberately *small*: the world has no colliders at all for the moment a map
 * is loading, and every unit of drop is more time spent falling through a floor
 * that does not exist yet. The centre of the room is kept clear for it; see the
 * two-tier stone below, which sits at z = -6 for this reason.
 */
export const ARENA_SPAWN: [number, number, number] = [0, 2, 0];

/**
 * Unused: the arena is the waiting room, never a match map. It exists because
 * `GameMap` requires it and a map without a round length would be a hole waiting
 * for someone to make the arena playable as a match.
 */
export const ARENA_ROUND_SECONDS = 120;

const box = (
  position: [number, number, number],
  args: [number, number, number],
  rest: Partial<Solid> = {},
): Solid => ({ shape: { kind: "box", args }, position, color: ARENA, ...rest });

/** Floor, ceiling and the four walls. */
const shell: Solid[] = (
  [
    [[0, -t, 0], [SIZE, THICKNESS, SIZE]],
    [[0, HEIGHT + t, 0], [SIZE, THICKNESS, SIZE]],
    [[0, HEIGHT / 2, -half - t], [SIZE, HEIGHT, THICKNESS]],
    [[0, HEIGHT / 2, half + t], [SIZE, HEIGHT, THICKNESS]],
    [[-half - t, HEIGHT / 2, 0], [THICKNESS, HEIGHT, SIZE]],
    [[half + t, HEIGHT / 2, 0], [THICKNESS, HEIGHT, SIZE]],
  ] as [pos: [number, number, number], size: [number, number, number]][]
).map(([position, args]) => box(position, args, { color: SHELL, castShadow: false }));

/** SE: stairs onto the catwalk. Each tread is 0.9 higher than the last. */
const stairs: Solid[] = [1.0, 1.9, 2.8, 3.7].map((h, i) =>
  box([3.5, h / 2, 4.8 + i * 1.6], [3.2, h, 1.6]),
);

export const ARENA_SOLIDS: Solid[] = [
  ...shell,

  // ── NW: stepped ziggurat. Three 1-unit tiers, so it can be walked up from any
  //       side and lain on at three different heights. ──
  box([-11, 0.5, -11], [7, 1, 7], { color: PAINT.green }),
  box([-11, 1.5, -11], [5, 1, 5], { color: PAINT.green }),
  box([-11, 2.5, -11], [3, 1, 3], { color: PAINT.green }),

  // ── NE: an 18° ramp running up onto a platform. The one slope in the room you
  //       can walk rather than jump. ──
  box([8, 1.55, -6], [4.5, 0.5, 9.5], { rotation: [0.32, 0, 0], color: PAINT.orange }),
  box([8, 2.95, -13], [6, 0.5, 5]),

  // ── N: the divider, two steps rather than one blank wall: mount the low lip,
  //       then hop the top. ──
  box([-1, 0.6, -13.6], [10, 1.2, 1.6]),
  box([-1, 1.6, -15.2], [10, 3.2, 1.2]),

  // The cone, the capsule and the crystal are the deliberate non-perches: every
  // other piece has a top you can reach.
  {
    shape: { kind: "cone", args: [2.2, 4.5, 24] },
    position: [-17, 2.25, -17],
    color: PAINT.yellow,
    colliders: "hull",
  },

  // ── Centre: a two-tier round stone, clear of the spawn point. ──
  {
    shape: { kind: "cylinder", args: [2, 2, 1, 24] },
    position: [0, 0.5, -6],
    color: ARENA,
    colliders: "hull",
  },
  {
    shape: { kind: "cylinder", args: [1.2, 1.2, 1, 24] },
    position: [0, 1.5, -6],
    color: ARENA,
    colliders: "hull",
  },

  // ── E: a crystal, and the tall slab the catwalk runs into. ──
  {
    shape: { kind: "octahedron", args: [2.2] },
    position: [16, 1.7, -3],
    color: PAINT.blue,
    colliders: "hull",
  },
  box([14, 2.5, 6], [1, 5, 8]),

  // ── SE: stairs onto a catwalk, which dead-ends at the slab — the slab top is
  //       another ~0.9 up, so the climb keeps going if you want it. ──
  ...stairs,
  box([9, 3.9, 10.8], [9, 0.4, 2.4]),

  // A dome, sunk into the floor so it is a curve to slide off rather than a ball
  // to bump into.
  {
    shape: { kind: "sphere", args: [2.8, 32, 16] },
    position: [16, -0.6, 16],
    color: PAINT.purple,
    colliders: "ball",
  },

  // ── S: a ring you can run through, high enough for a hunter. It needs a
  //       trimesh collider — a hull would fill the hole in. ──
  {
    shape: { kind: "torus", args: [3, 0.45, 16, 48] },
    position: [0, 2.7, 13],
    color: PAINT.rose,
    colliders: "trimesh",
  },

  {
    shape: { kind: "cylinder", args: [2.4, 2.4, 1.6, 6] },
    position: [-6, 0.8, 15],
    color: PAINT.black,
    colliders: "hull",
  },
  // Kept to 2.6 so its top is a one-jump perch from the floor rather than
  // scenery you can only look at.
  {
    shape: { kind: "cylinder", args: [1.8, 1.8, 2.6, 3] },
    position: [7, 1.3, 16.5],
    color: PAINT.grey,
    colliders: "hull",
  },

  // ── W: a drum tall enough to matter, with a smaller one beside it as the step
  //       up. A capsule and a long bench fill out the wall. ──
  {
    shape: { kind: "cylinder", args: [2, 2, 3, 24] },
    position: [-13, 1.5, 7],
    color: PAINT.cyan,
    colliders: "hull",
  },
  {
    shape: { kind: "cylinder", args: [1.3, 1.3, 1.5, 20] },
    position: [-9.5, 0.75, 9.5],
    color: ARENA,
    colliders: "hull",
  },
  {
    shape: { kind: "capsule", args: [1, 2, 8, 16] },
    position: [-16.5, 2, 12],
    color: ARENA,
    colliders: "hull",
  },
  box([-15, 1, 0], [2, 2, 8]),
];
