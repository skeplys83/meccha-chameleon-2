import type { Phase, Role } from "@/game/shared/protocol";
import { HUNT_URGENT_SECONDS } from "@/game/shared/protocol";

/**
 * The clock, and what it is counting towards.
 *
 * A bare number was enough when a match was one sixty-second block. It is not
 * now: the same two digits mean "get hidden", "the hunter is coming" and "you
 * are nearly out of time" depending on the phase, and which of those it is
 * changes what you should be doing. So the phase is named alongside it, and the
 * wording differs by side — the same twenty seconds is a head start for one
 * player and a wait for the other.
 *
 * It replaces `MatchClock`, which only ever knew about seconds.
 */
const LABEL: Record<Phase, { chameleon: string; hunter: string } | null> = {
  waiting: null,
  countdown: null,
  hiding: { chameleon: "Hide", hunter: "They are hiding" },
  hunt: { chameleon: "Stay hidden", hunter: "Find them" },
  reveal: null,
};

export function PhaseBanner({
  phase,
  seconds,
  role,
}: {
  phase: Phase;
  seconds: number;
  role: Role;
}) {
  const label = LABEL[phase];
  // The lobby has its own panel with its own countdown, and the reveal has the
  // round-over card. This is only for the two phases with a world under them.
  if (!label) return null;

  /** The last stretch of a hunt. The tick runs throughout; this is the colour. */
  const urgent = phase === "hunt" && seconds <= HUNT_URGENT_SECONDS;
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 select-none rounded-lg px-4 py-2 text-center backdrop-blur ${
        phase === "hiding"
          ? "bg-emerald-950/80 text-emerald-200"
          : urgent
            ? "bg-rose-950/85 text-rose-200"
            : "bg-black/60 text-neutral-100"
      }`}
    >
      <div className="text-[10px] uppercase tracking-widest opacity-70">
        {role === "hunter" ? label.hunter : label.chameleon}
      </div>
      <div className="font-mono text-2xl leading-tight tabular-nums">
        {mm}:{ss}
      </div>
    </div>
  );
}
