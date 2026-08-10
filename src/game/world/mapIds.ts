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
