import { useEffect, useRef } from "react";
import { playSound, startLoop, stopLoop } from "@/client/sound/engine";
import {
  GONG_FALLOFF,
  GONG_GAP_MS,
  GONG_STRIKES,
  HUNT_URGENT_SECONDS,
  MUSIC_DELAY_MS,
} from "@/shared/protocol";
import type { Phase } from "@/shared/protocol";

/**
 * Everything the round itself makes a noise about: the clock's tick, the bell
 * when hiding ends, and the gong that closes it. All of it is driven by the
 * phase changing rather than by a message — there is no "match over" message,
 * and adding one would only be a second thing that can disagree with the phase.
 */
export function useRoundAudio(phase: Phase | undefined, secondsLeft: number) {
  /** One tick per second of a countdown, for everybody at once. */
  const ticking =
    phase === "countdown" ||
    phase === "hiding" ||
    (phase === "hunt" && secondsLeft <= HUNT_URGENT_SECONDS);
  useEffect(() => {
    if (!ticking || secondsLeft <= 0) return;
    playSound("tick");
  }, [ticking, secondsLeft]);

  const lastPhase = useRef<string | undefined>(undefined);
  /** The phase as of *now*, for anything scheduled to check before it fires. */
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const before = lastPhase.current;
    lastPhase.current = phase;

    // **The music belongs to the hunt and to nothing else**, so this is a fact
    // about the phase rather than about the transition into it. It stops the
    // moment the round is decided rather than playing under the gong and the
    // reveal, and it starts below for somebody who arrives mid-hunt and never
    // heard the bell — a reconnection, or a caught player coming back in.
    if (phase !== "hunt") stopLoop("ambient");

    if (!phase || before === phase) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    if (phase === "hunt") {
      /** Straight out of the hiding phase, rather than arriving part-way in. */
      const fromTheBell = before === "hiding";
      if (fromTheBell) {
        // Hiding is over and the hunter is on their way in.
        playSound("bell");
        /** Anything already playing is stopped before the wait, not after it. */
        stopLoop("ambient");
      }
      timers.push(
        setTimeout(
          () => {
            // Checked at fire time, not at schedule time. The cleanup below
            // covers the ordinary case; this covers a call that outlived the
            // code that scheduled it, which is what a hot reload produces.
            if (phaseRef.current !== "hunt") return;
            // Looping, so it runs for the whole hunt. `startLoop` is a no-op
            // when that name is already going, so arriving twice is harmless.
            startLoop("ambient");
          },
          // The delay is there to let the bell ring alone. Nobody arriving
          // late heard the bell, so there is nothing to wait for.
          fromTheBell ? MUSIC_DELAY_MS : 0,
        ),
      );
    }

    // The round is decided, either way: three strikes, overlapping into one
    // long fall rather than three separate noises. Only on the transition —
    // somebody who loads straight into a reveal did not watch it end.
    if (phase === "reveal" && before) {
      for (let i = 0; i < GONG_STRIKES; i++) {
        // Tapered: the strikes overlap and add, so a flat gain would make the
        // last one the loudest moment of the round rather than the first.
        const gain = GONG_FALLOFF ** i;
        if (i === 0) playSound("gong", { gain });
        else
          timers.push(
            setTimeout(() => playSound("gong", { gain }), i * GONG_GAP_MS),
          );
      }
    }

    /** Everything scheduled here is cancelled when the phase moves on. */
    return () => timers.forEach(clearTimeout);
  }, [phase]);
}
