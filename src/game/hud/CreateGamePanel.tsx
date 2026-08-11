import { useEffect, useState } from "react";
import { DEFAULT_MATCH_MAP, MATCH_MAP_LIST, type MapId } from "@/game/world/maps";
import { MAX_PLAYERS, MIN_PLAYERS } from "@/game/shared/protocol";

/**
 * The three choices you only get to make once, in a modal over the menu.
 *
 * They are together because they are the same decision — *what game is this* —
 * and because none of them can be changed afterwards in the same way. The map
 * moves (the host can pick a different `nextMap` from inside), but the public
 * flag and the size are fixed at creation: a game that went public while people
 * were already in it would be a surprise nobody consented to, and a cap that
 * moved under a room that was already filling would be a race with no right
 * answer.
 *
 * Escape closes it, because a modal that traps you is worse than no modal.
 */
export function CreateGamePanel({
  onCreate,
  onCancel,
}: {
  onCreate: (map: MapId, listed: boolean, maxPlayers: number) => void;
  onCancel: () => void;
}) {
  const [map, setMap] = useState<MapId>(DEFAULT_MATCH_MAP);
  // Public by default: a game nobody can find is the exception, not the rule.
  const [listed, setListed] = useState(true);
  const [size, setSize] = useState(8);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const clamp = (n: number) => Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, n));

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-black/70 p-6 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        // The backdrop closes; the card must not, or every click inside it would
        // dismiss the thing being filled in.
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-950 p-6 text-neutral-100 shadow-2xl shadow-black/60"
      >
        <h2 className="mb-5 text-lg font-semibold tracking-tight">New game</h2>

        {/* ── Map. The arena is absent on purpose: it is the waiting room every
               game starts in, not a map you choose. ── */}
        <div className="mb-2 text-[11px] uppercase tracking-widest text-neutral-500">
          Map
        </div>
        <div className="mb-5 flex flex-col gap-2">
          {MATCH_MAP_LIST.map((m) => (
            <button
              key={m.id}
              onClick={() => setMap(m.id)}
              className={`rounded-md border px-3 py-2 text-left transition ${
                map === m.id
                  ? "border-neutral-300 bg-neutral-800 text-neutral-100"
                  : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
              }`}
            >
              <div className="text-xs font-medium">{m.name}</div>
              <div className="mt-0.5 text-[10px] leading-snug text-neutral-500">
                {m.blurb}
              </div>
            </button>
          ))}
        </div>

        {/* ── Size ── */}
        <div className="mb-2 text-[11px] uppercase tracking-widest text-neutral-500">
          Players
        </div>
        <div className="mb-1 flex items-center gap-3">
          <button
            onClick={() => setSize((n) => clamp(n - 1))}
            disabled={size <= MIN_PLAYERS}
            aria-label="Fewer players"
            className="h-9 w-9 rounded-md border border-neutral-700 text-lg leading-none transition hover:border-neutral-500 disabled:opacity-30"
          >
            −
          </button>
          <input
            type="range"
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            value={size}
            onChange={(e) => setSize(clamp(Number(e.target.value)))}
            className="h-1 flex-1 accent-emerald-500"
          />
          <button
            onClick={() => setSize((n) => clamp(n + 1))}
            disabled={size >= MAX_PLAYERS}
            aria-label="More players"
            className="h-9 w-9 rounded-md border border-neutral-700 text-lg leading-none transition hover:border-neutral-500 disabled:opacity-30"
          >
            +
          </button>
          <span className="w-10 text-right font-mono text-xl tabular-nums">{size}</span>
        </div>
        <p className="mb-5 text-[10px] leading-snug text-neutral-600">
          The round starts by itself once this many have arrived — or whenever you
          press Start. {MIN_PLAYERS}–{MAX_PLAYERS}.
        </p>

        {/* ── Listing ── */}
        <label className="mb-6 flex cursor-pointer items-start gap-2 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={listed}
            onChange={(e) => setListed(e.target.checked)}
            className="mt-0.5 accent-emerald-500"
          />
          <span>
            List it publicly
            <span className="block text-[10px] leading-snug text-neutral-600">
              Anyone on this server sees it and can join. Unticked, only people
              with the code can — it still works either way.
            </span>
          </span>
        </label>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-neutral-700 px-5 py-3 text-sm text-neutral-400 transition hover:border-neutral-500"
          >
            Cancel
          </button>
          <button
            onClick={() => onCreate(map, listed, size)}
            className="flex-1 rounded-lg border border-emerald-500 bg-emerald-600/20 px-6 py-3 text-sm font-medium text-emerald-200 transition hover:bg-emerald-600/40"
          >
            Create game
          </button>
        </div>
      </div>
    </div>
  );
}
