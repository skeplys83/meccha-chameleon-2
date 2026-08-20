import { describe, expect, it } from "vitest";
import { isShellName } from "../levelScene.ts";

/**
 * Names sampled from `public/maps/*.glb` — the real collision objects, read out
 * of the files with `@gltf-transform`. The rule is a regex over names a Blender
 * file chooses, so nothing in the build can catch it drifting: a re-export that
 * renames `col_ceiling` breaks the camera silently and only in the one map.
 */
const ARENA_SHELL = ["col_ceiling", "col_floor", "col_wall_east", "col_wall_north"];
const ARENA_PROPS = ["col_bench", "col_catwalk", "col_ramp", "col_stair_0", "colball_dome", "colhull_cone"];

const DUNGEON_SHELL = [
  "col_floor",
  "col_ceiling_000",
  "col_ceiling_hall",
  "col_wall_000_b",
  "col_wall_corner_001",
  "col_masonry_wall_endcap_002",
  "col_masonry_wall_half_endcap_sloped_001",
];
const DUNGEON_PROPS = [
  "col_scatter_barrel_small_001",
  "col_living_chair_004",
  "col_gold_coin_stack_large_002",
  "col_crates_box_large_001",
  "col_table_long_tablecloth_003",
  "col_column_002",
  "col_ring_deck_001",
];

describe("the room's shell", () => {
  it("catches the floor, the walls and the ceiling of both maps", () => {
    for (const name of [...ARENA_SHELL, ...DUNGEON_SHELL]) {
      expect(isShellName(name), name).toBe(true);
    }
  });

  it("lets the camera through everything a map is furnished with", () => {
    for (const name of [...ARENA_PROPS, ...DUNGEON_PROPS]) {
      expect(isShellName(name), name).toBe(false);
    }
  });

  it("counts a raised deck as furniture, which is the one judgement call", () => {
    // `col_ring_deck` is walkable, so a player standing on it can drop the lens
    // through it. Named here so the choice is visible rather than implied: add
    // `deck` to the pattern if that reads worse than a camera that stops on a
    // walkway you are not standing on.
    expect(isShellName("col_ring_deck_001")).toBe(false);
  });
});
