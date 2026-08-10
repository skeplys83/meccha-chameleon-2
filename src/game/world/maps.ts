"use client";

import type { ComponentType } from "react";
import { Arena } from "./maps/arena";
import { Dungeon } from "./maps/dungeon";
import { DEFAULT_MAP, MAP_IDS, type MapId } from "./mapIds";

export { DEFAULT_MAP, type MapId };

/**
 * Every map the game can load.
 *
 * Adding one is: drop a component in `maps/`, add a line here. It needs no other
 * wiring — the menu lists whatever is in this table, the server validates a
 * chosen id against it, and `Room` renders it.
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
  Component: ComponentType;
};

export const MAPS: Record<MapId, GameMap> = {
  arena: {
    id: "arena",
    name: "Arena",
    blurb: "40×40, white, twenty-five pieces of cover. Nine painted to match a swatch.",
    Component: Arena,
  },
  dungeon: {
    id: "dungeon",
    name: "Dungeon",
    blurb: "One 12×12 chamber, split by a low wall. Very small, very close quarters.",
    Component: Dungeon,
  },
};

export const MAP_LIST: GameMap[] = MAP_IDS.map((id) => MAPS[id]);

// Adding an id without a map, or a map without an id, fails here rather than
// showing an empty menu entry or silently refusing a legitimate choice.
for (const id of MAP_IDS) {
  if (!MAPS[id]) throw new Error(`world/maps.ts has no entry for map id "${id}"`);
}

/** Anything off the wire has to be checked against the table before it is used. */
export function safeMapId(id: unknown): MapId {
  return typeof id === "string" && id in MAPS ? (id as MapId) : DEFAULT_MAP;
}
