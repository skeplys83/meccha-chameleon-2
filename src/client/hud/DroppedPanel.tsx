/** The connection died. */
export function DroppedPanel({
  onReconnect,
  onExit,
}: {
  onReconnect: () => void;
  onExit: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/80 backdrop-blur-sm">
      <div className="flex w-[22rem] flex-col items-center gap-4 rounded-xl border border-amber-600/50 bg-neutral-950/90 px-8 py-6 text-center">
        <div className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-300">
          Connection lost
        </div>
        <p className="text-xs leading-relaxed text-neutral-400">
          The game is still running without you. Reconnect quickly and you keep
          your side, where you were standing and your paint.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onReconnect}
            className="rounded-lg border border-emerald-500/70 bg-emerald-600/20 px-5 py-2 text-sm text-emerald-200 transition hover:bg-emerald-600/40"
          >
            Reconnect
          </button>
          <button
            onClick={onExit}
            className="rounded-lg border border-neutral-600 px-5 py-2 text-sm text-neutral-300 transition hover:border-neutral-400"
          >
            Back to menu
          </button>
        </div>
      </div>
    </div>
  );
}
