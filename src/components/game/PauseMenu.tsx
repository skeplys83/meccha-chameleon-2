"use client";

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
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-neutral-950/80 text-neutral-100 backdrop-blur-sm">
      <h2 className="text-2xl font-semibold tracking-tight">Paused</h2>
      <p className="text-xs text-neutral-400">{sessionName}</p>
      <div className="flex flex-col gap-3">
        <button
          onClick={onResume}
          className="w-56 rounded-lg border border-neutral-500 bg-neutral-800 px-6 py-3 text-sm transition hover:bg-neutral-700"
        >
          Resume
        </button>
        <button
          onClick={onLeave}
          className="w-56 rounded-lg border border-rose-600 bg-rose-950/60 px-6 py-3 text-sm text-rose-200 transition hover:bg-rose-900/60"
        >
          Leave session
        </button>
      </div>
      <p className="text-xs text-neutral-600">Esc pauses · click Resume to lock the cursor</p>
    </div>
  );
}
