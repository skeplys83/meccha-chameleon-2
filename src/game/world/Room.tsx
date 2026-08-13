import { Suspense, useEffect } from "react";
import { Sky, useGLTF } from "@react-three/drei";
import { beginLoading } from "@/game/loading";
import { MAPS, safeMapId, type GameMap } from "./maps";
import { GltfLevel } from "./GltfLevel";
import { bumpSurfaces } from "./surface";

export { ROOM_SURFACE } from "./surface";
export { ROOM_HALF } from "@/game/shared/protocol";

/**
 * Where the sun sits, for the maps that are open to it. **The key light in
 * `arena.blend` is aimed along this and the two have to move together** — the
 * sky is only a backdrop, the light is what casts. Kept high: at the 23° this
 * used to be, shadows raked the whole arena and the shadow map striped with
 * acne, because the depth error across a texel goes as 1/tan(elevation).
 */
const SUN: [number, number, number] = [100, 150, 100];

/** Whichever map this room is playing. */
export function Room({ map }: { map: string }) {
  const chosen = MAPS[safeMapId(map)];
  return (
    <>
      <color attach="background" args={[chosen.background]} />
      {chosen.sky && <Sky sunPosition={SUN} />}
      {/* No light of any kind here, for any map — invariant 15. The arena used
          to be the exception because `arena.glb` carried none; it has four suns
          of its own now. */}
      {/* Scoped tightly around the map and nothing else. A map suspends while
          its file arrives, and a `Suspense` any higher would blank the player
          with it — the same trap `<Environment>` set. */}
      <Suspense fallback={<Loading />}>
        <Mounted map={chosen} />
      </Suspense>
    </>
  );
}

/** The fallback: it draws nothing, and says the player is waiting. */
function Loading() {
  useEffect(beginLoading, []);
  return null;
}

/** Tells the rest of the game the world's surfaces have changed. */
function Mounted({ map }: { map: GameMap }) {
  useEffect(() => {
    bumpSurfaces();
    return bumpSurfaces;
  }, [map]);

  /** The file, before a single collider exists — invariant 8. */
  useGLTF(map.src);

  return <GltfLevel level={map} />;
}
