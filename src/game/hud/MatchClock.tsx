"use client";

/**
 * How long is left in the match.
 *
 * The number comes off room state — the server counts it down and the same
 * counter is what ends the match, so what you read here is what will happen.
 * There is no local timer to drift out of step with it.
 *
 * It goes red for the last ten seconds. That is the only cue that the round is
 * about to end; nothing else on screen changes until everyone is moved.
 */
export function MatchClock({ seconds }: { seconds: number }) {
  const left = Math.max(0, Math.ceil(seconds));
  const urgent = left <= 10;

  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 select-none rounded-lg px-4 py-2 font-mono text-2xl tabular-nums backdrop-blur ${
        urgent ? "bg-rose-950/70 text-rose-200" : "bg-black/55 text-neutral-100"
      }`}
    >
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
    </div>
  );
}
