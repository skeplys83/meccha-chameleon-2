import { useEffect } from "react";
import { preloadMap } from "@/client/world/preload";
import { preloadMusic, unlockAudio } from "@/client/sound/engine";
import type { RoomInfo } from "@/client/net";

/**
 * The two big downloads, fetched ahead of the player rather than in front of
 * them. Neither raises the loading screen: a lobby is a minute of standing
 * around painting, which is free budget for the map and the music, and a
 * spinner over a room you are happily walking around in would undo the reason
 * they are early.
 */
export function useRoundAssets(room: RoomInfo | null) {
  const nextMap = room?.nextMap;
  const counting = room?.phase === "countdown";

  useEffect(() => {
    if (!nextMap) return;
    preloadMap(nextMap);
    void preloadMusic();
  }, [nextMap, counting]);
}

/**
 * The audio context needs a user gesture, and the join click is normally it.
 * An instant-multiplayer launch has no click at all, so the first gesture of
 * any kind is taken instead — otherwise the whole game is silently mute.
 */
export function useAudioUnlockOnGesture() {
  useEffect(() => {
    const unlockOnGesture = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", unlockOnGesture);
      window.removeEventListener("keydown", unlockOnGesture);
    };
    window.addEventListener("pointerdown", unlockOnGesture);
    window.addEventListener("keydown", unlockOnGesture);
    return () => {
      window.removeEventListener("pointerdown", unlockOnGesture);
      window.removeEventListener("keydown", unlockOnGesture);
    };
  }, []);
}
