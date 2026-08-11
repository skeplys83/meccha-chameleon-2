/**
 * The map ids, and nothing else.
 *
 * Split out from `maps.ts` because the server validates a chosen id and the
 * server is plain Node — it cannot import `maps.ts`, which pulls in React
 * components and three.js. This file has no imports at all, which is what makes
 * it safe for both halves.
 *
 * `maps.ts` is checked against this list at import time, so adding a map without
 * adding its id here fails the build rather than silently rejecting the id.
 */
export const MAP_IDS = ["arena", "dungeon"] as const;

export type MapId = (typeof MAP_IDS)[number];

/** What a room uses when nobody chose, or chose something this build lacks. */
export const DEFAULT_MAP: MapId = "arena";

/**
 * The arena is not a map you pick — it is where every lobby waits.
 *
 * It is playable on purpose (walk about, paint yourself while people arrive) but
 * it is never the map a match runs on, so it is absent from every picker and
 * refused as a `nextMap`. Keeping it in `MAP_IDS` is deliberate: it is still a
 * real map that `Room` renders and the server validates.
 */
export const LOBBY_MAP: MapId = "arena";

/** The maps a match can actually be played on. */
export const MATCH_MAP_IDS = MAP_IDS.filter((id) => id !== LOBBY_MAP);

/** What a match runs when nobody chose, or chose something this build lacks. */
export const DEFAULT_MATCH_MAP: MapId = MATCH_MAP_IDS[0] ?? DEFAULT_MAP;
