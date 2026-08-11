import { ARENA_ROUND_SECONDS, ARENA_SOLIDS, ARENA_SPAWN } from "./maps/arena.ts";
import {
  DUNGEON_ROUND_SECONDS,
  DUNGEON_SOLIDS,
  DUNGEON_SPAWN,
} from "./maps/dungeon.ts";
import { modelsIn, type Solid } from "./shapes.ts";
import {
  DEFAULT_MAP,
  DEFAULT_MATCH_MAP,
  LOBBY_MAP,
  MAP_IDS,
  MATCH_MAP_IDS,
  type MapId,
} from "./mapIds.ts";

export { DEFAULT_MAP, DEFAULT_MATCH_MAP, LOBBY_MAP, type MapId };

/**
 * Every map the game can load.
 *
 * Adding one is: drop a table of `Solid`s in `maps/`, add a line here, add its
 * id to `mapIds.ts`. It needs no other wiring — the menu lists whatever is in
 * this table, the server validates a chosen id against the ids, and `Room`
 * renders the solids.
 *
 * **A map is data, not a component.** That is what lets `Room` render every map
 * the same way, and it is why this file and everything it imports are free of
 * React and three.js: the registry is now readable by Node, which the server
 * side has never needed but is one import away from if it ever does (spawn
 * points, a bot's navmesh, validating a position against real geometry rather
 * than a square bound). Keep it that way — importing a component here closes
 * that door and gains nothing.
 *
 * **An id is a wire value.** It is chosen in the menu, stored in room state and
 * read by every client, so renaming one breaks anybody mid-session and orphans a
 * saved choice. Add ids freely; change them like you would a message name.
 */
export type GameMap = {
  id: MapId;
  /** Shown in the menu. Free to change — unlike the id. */
  name: string;
  /** One-line description of how it plays, for the menu. */
  blurb: string;
  /** The pieces, in the order they are built. */
  solids: Solid[];
  /**
   * Where a player's body centre starts, per map rather than per game.
   *
   * It must clear the floor by more than the tallest half-height (1.3, the
   * hunter) and it should not clear it by much more — the world has no colliders
   * while a map is loading, and a body dropped from high up spends that whole
   * window falling through a floor that is not there yet.
   *
   * The array identity is stable because it comes from the map table, which
   * matters: `players/Player.tsx` passes it straight to `RigidBody position`,
   * and a fresh array on every render re-applies the prop and teleports the
   * player. See invariant 11 in `players/CLAUDE.md`.
   */
  spawn: [number, number, number];
  /**
   * How long a round on this map lasts, hiding phase included, before the
   * reveal. Per map because a 40×40 arena and a 12×12 chamber want very
   * different amounts of time.
   */
  roundSeconds: number;
  /**
   * Every glTF this map needs, derived from `solids` rather than listed.
   *
   * `Room` loads all of them in one `useGLTF` call before a single `RigidBody`
   * exists — see the note there. Deriving it means a map cannot place a piece it
   * forgot to declare, which was previously a hand-maintained array beside the
   * layout.
   */
  models: string[];
};

const map = (
  id: MapId,
  name: string,
  blurb: string,
  solids: Solid[],
  spawn: [number, number, number],
  roundSeconds: number,
): GameMap => ({
  id,
  name,
  blurb,
  solids,
  spawn,
  roundSeconds,
  models: modelsIn(solids),
});

export const MAPS: Record<MapId, GameMap> = {
  arena: map(
    "arena",
    "Arena",
    "40×40, white, twenty-five pieces of cover. Nine painted to match a swatch.",
    ARENA_SOLIDS,
    ARENA_SPAWN,
    ARENA_ROUND_SECONDS,
  ),
  dungeon: map(
    "dungeon",
    "Dungeon",
    "One 12×12 chamber, split by a low wall. Very small, very close quarters.",
    DUNGEON_SOLIDS,
    DUNGEON_SPAWN,
    DUNGEON_ROUND_SECONDS,
  ),
};

export const MAP_LIST: GameMap[] = MAP_IDS.map((id) => MAPS[id]);

/**
 * The maps a match can be played on — everything a picker should offer.
 *
 * The arena is missing on purpose: it is the waiting room every lobby runs, not
 * a choice. Offering it would mean pressing Start and arriving where you already
 * were.
 */
export const MATCH_MAP_LIST: GameMap[] = MATCH_MAP_IDS.map((id) => MAPS[id]);

// Adding an id without a map, or a map without an id, fails here rather than
// showing an empty menu entry or silently refusing a legitimate choice.
for (const id of MAP_IDS) {
  if (!MAPS[id]) throw new Error(`world/maps.ts has no entry for map id "${id}"`);
}

/** Anything off the wire has to be checked against the table before it is used. */
export function safeMapId(id: unknown): MapId {
  return typeof id === "string" && id in MAPS ? (id as MapId) : DEFAULT_MAP;
}

/** The menu label for an id off the wire — a lobby listing carries the id only. */
export const mapName = (id: unknown) => MAPS[safeMapId(id)].name;

/** Where to put a body on this map. Stable identity — see `GameMap.spawn`. */
export const mapSpawn = (id: unknown) => MAPS[safeMapId(id)].spawn;

/** How long a round on this map runs. Read by the server, which is the point. */
export const mapRoundSeconds = (id: unknown) => MAPS[safeMapId(id)].roundSeconds;
