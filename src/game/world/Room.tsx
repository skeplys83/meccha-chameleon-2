"use client";

import { Suspense } from "react";
import { MAPS, safeMapId, type MapId } from "./maps";

export { ROOM_SURFACE } from "./surface";
export { ROOM_HALF } from "@/game/shared/protocol";

/**
 * Whichever map this room is playing.
 *
 * The id comes from room state, so every client in a session renders the same
 * geometry — a map chosen per client would mean players standing inside walls
 * their opponents cannot see. `safeMapId` is what makes an unknown id (an older
 * build, a hand-edited message) fall back rather than render nothing.
 */
export function Room({ map }: { map: MapId | string }) {
  const { Component } = MAPS[safeMapId(map)];
  // Scoped tightly around the map and nothing else. A map built from loaded
  // files suspends while they arrive, and a `Suspense` any higher would blank
  // the lights and the player with it — the same trap `<Environment>` set.
  return (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  );
}
