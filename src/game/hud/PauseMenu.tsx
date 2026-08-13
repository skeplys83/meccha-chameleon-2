/** One dark panel along the bottom edge. */
export function PauseMenu({
  sessionName,
  mode,
  onResume,
  onLeave,
}: {
  sessionName: string;
  /** Which room is paused, because backing out means different things in each. */
  mode: "lobby" | "match";
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

        <div className="flex w-full gap-2">
          <button
            onClick={onLeave}
            className="flex-1 basis-0 whitespace-nowrap rounded-lg border border-rose-500/60 bg-rose-950/40 px-5 py-2 text-rose-200 transition hover:border-rose-400 hover:bg-rose-900/60"
          >
            {mode === "match" ? "Leave match" : "Return to menu"}
          </button>
          <button
            onClick={onResume}
            className="flex-1 basis-0 whitespace-nowrap rounded-lg border border-neutral-500/70 bg-neutral-800/80 px-5 py-2 text-neutral-100 transition hover:border-neutral-400 hover:bg-neutral-700/80"
          >
            Resume
          </button>
        </div>

        {/* Not "Esc toggles pause" any more: Esc is what released the pointer,
            and the browser will not give it back for about a second afterwards.
            Resuming has to be a click. */}
        <div className="text-[10px] text-neutral-500">
          {mode === "match"
            ? "Leaving takes you back to the waiting room"
            : "Click Resume to continue"}
        </div>
      </div>
    </div>
  );
}
