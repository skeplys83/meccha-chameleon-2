"use client";

import { Suspense, useEffect, type ComponentType } from "react";
import { MAPS, safeMapId, type MapId } from "./maps";
import { bumpSurfaces } from "./surface";

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
      <Mounted Component={Component} />
    </Suspense>
  );
}

/**
 * Tells the rest of the game the world's surfaces have changed.
 *
 * The effect runs after the map's own subtree has mounted — React runs child
 * effects first — so by the time it fires, every mesh is in the scene and can be
 * found. It fires again on unmount, so swapping maps does not leave the player
 * raycasting against geometry that is gone.
 */
function Mounted({ Component }: { Component: ComponentType }) {
  useEffect(() => {
    bumpSurfaces();
    return bumpSurfaces;
  }, [Component]);
  return <Component />;
}
