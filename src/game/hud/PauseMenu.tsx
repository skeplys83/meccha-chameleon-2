"use client";

/**
 * One dark panel along the bottom edge. There is still no full-screen scrim or
 * blur — the arena stays visible and readable while you are paused — but the
 * menu itself needs a solid ground of its own: it floats over a white room, and
 * the old translucent pills left the session name almost unreadable.
 */
export function PauseMenu({
  sessionName,
  onResume,
  onLeave,
}: {
  sessionName: string;
  onResume: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 select-none">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-white/15 bg-neutral-950/85 px-8 py-4 font-mono text-xs shadow-2xl shadow-black/40">
        <div className="text-center">
          {/* The letter-spacing hangs off the last glyph, so the padding puts
              the word back on the panel's centre line. */}
          <div className="pl-[0.3em] text-sm font-semibold uppercase tracking-[0.3em] text-neutral-50">
            Paused
          </div>
          <div className="mt-1 max-w-[18rem] truncate text-[11px] text-neutral-400">
            {sessionName}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onResume}
            className="rounded-lg border border-neutral-500/70 bg-neutral-800/80 px-5 py-2 text-neutral-100 transition hover:border-neutral-400 hover:bg-neutral-700/80"
          >
            Resume
          </button>
          <button
            onClick={onLeave}
            className="rounded-lg border border-rose-500/60 bg-rose-950/40 px-5 py-2 text-rose-200 transition hover:border-rose-400 hover:bg-rose-900/60"
          >
            Return to menu
          </button>
        </div>

        <div className="text-[10px] text-neutral-500">Esc toggles pause</div>
      </div>
    </div>
  );
}
