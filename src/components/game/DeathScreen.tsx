"use client";

/**
 * Shown to the player who was shot. By the time this appears they are already
 * out of the room — respawning is a fresh join to the same session.
 */
export function DeathScreen({
  by,
  sessionName,
  onRespawn,
  onExit,
}: {
  by: string;
  sessionName: string;
  onRespawn: () => void;
  onExit: () => void;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-rose-950/45 font-mono text-neutral-100">
      <div className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-rose-200">You were shot</h2>
        <p className="mt-2 text-xs text-rose-200/70">
          {by} found you · {sessionName}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <button
          onClick={onRespawn}
          className="w-56 rounded-lg border border-emerald-500/60 bg-black/50 px-6 py-3 text-sm text-emerald-200 transition hover:bg-emerald-900/50"
        >
          Respawn in this session
        </button>
        <button
          onClick={onExit}
          className="w-56 rounded-lg border border-neutral-500/60 bg-black/50 px-6 py-3 text-sm text-neutral-200 transition hover:bg-neutral-800/70"
        >
          Exit to main menu
        </button>
      </div>
    </div>
  );
}
