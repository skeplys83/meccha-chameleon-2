import { Suspense, useEffect } from "react";
import { Sky, useGLTF } from "@react-three/drei";
import { beginLoading } from "@/game/loading";
import { MAPS, safeMapId, type GameMap } from "./maps";
import { GltfLevel } from "./GltfLevel";
import { bumpSurfaces } from "./surface";

export { ROOM_SURFACE } from "./surface";
export { ROOM_HALF } from "@/game/shared/protocol";

/** Where the sun sits, for the maps that are open to it. */
const SUN: [number, number, number] = [100, 60, 100];

/** Whichever map this room is playing. */
export function Room({ map }: { map: string }) {
  const chosen = MAPS[safeMapId(map)];
  return (
    <>
      <color attach="background" args={[chosen.background]} />
      {chosen.sky && <Sky sunPosition={SUN} />}
      {map === "arena" && (
        <ambientLight intensity={1.0} color="#ffffff" />


      )}
      {map === "dungeon" && (
        <spotLight
          position={[10, 7, 6]}
          angle={0.9}
          penumbra={0.7}
          intensity={18}
          distance={28}
          color="#ff6bb3"
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
      )}
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
