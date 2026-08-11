import { Suspense, useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import { MAPS, safeMapId, type GameMap } from "./maps";
import { Solids } from "./Solids";
import { bumpSurfaces } from "./surface";

export { ROOM_SURFACE } from "./surface";
export { ROOM_HALF } from "@/game/shared/protocol";

/**
 * Start fetching every map's models at import time, so the floor of a match is
 * already on its way while people are still standing in the lobby.
 *
 * This is the one place drei's loader is touched outside a component. It lives
 * here rather than in `maps.ts` deliberately: that file is data and must stay
 * free of React and three.js — see the note on `GameMap`.
 */
for (const map of Object.values(MAPS)) {
  for (const src of map.models) useGLTF.preload(src);
}

/**
 * Whichever map this room is playing.
 *
 * The id comes from room state, so every client in a session renders the same
 * geometry — a map chosen per client would mean players standing inside walls
 * their opponents cannot see. `safeMapId` is what makes an unknown id (an older
 * build, a hand-edited message) fall back rather than render nothing.
 */
export function Room({ map }: { map: string }) {
  const chosen = MAPS[safeMapId(map)];
  // Scoped tightly around the map and nothing else. A map built from loaded
  // files suspends while they arrive, and a `Suspense` any higher would blank
  // the lights and the player with it — the same trap `<Environment>` set.
  return (
    <Suspense fallback={null}>
      <Mounted map={chosen} />
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
function Mounted({ map }: { map: GameMap }) {
  useEffect(() => {
    bumpSurfaces();
    return bumpSurfaces;
  }, [map]);

  // Every model in one call, before a single `RigidBody` exists. If the first
  // piece to want a file were the one to fetch it, the map would suspend once
  // *per file* — and React discards a suspended tree, so pieces that had already
  // committed would have their rigid bodies torn down and rebuilt on every
  // round. Rapier does not survive that: it panics with `unreachable`, and every
  // later call throws `recursive use of an object`, killing physics for the
  // session. The per-piece `useGLTF` calls in `Solids` then read from cache.
  //
  // An empty list is not a conditional hook — the arena passes `[]` and drei
  // resolves it immediately, so both kinds of map take the same path.
  useGLTF(map.models);

  return <Solids list={map.solids} />;
}
