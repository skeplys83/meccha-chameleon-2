import type { Grave } from "@/game/net";
import type { Role } from "@/game/shared/protocol";

/** The thirty seconds after a round is decided. */
export function RoundOverPanel({
  winner,
  role,
  seconds,
  graves,
}: {
  /** `"chameleons"`, `"hunters"`, or empty if the server never said. */
  winner: string;
  role: Role;
  seconds: number;
  /** Where each chameleon was found, in the order they were found. */
  graves: Grave[];
}) {
  const hunters = winner === "hunters";
  // You are on the winning side if the winner matches what you *ended* as —
  // which for anyone caught means they finished with the hunters, and that is
  // the honest reading: they spent the back half of the round hunting.
  const won = winner !== "" && (hunters ? role === "hunter" : role === "chameleon");

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 w-[24rem] max-w-[90vw] -translate-x-1/2 rounded-xl border border-white/15 bg-neutral-950/85 px-6 py-4 text-neutral-100 shadow-2xl shadow-black/50 backdrop-blur">
      <div
        className={`text-center text-xl font-semibold tracking-tight ${
          hunters ? "text-rose-300" : "text-emerald-300"
        }`}
      >
        {winner === ""
          ? "Round over"
          : hunters
            ? "Hunters win"
            : "Chameleons win"}
      </div>
      <div className="mt-0.5 text-center text-[11px] text-neutral-400">
        {winner === ""
          ? " "
          : hunters
            ? "Every chameleon was found."
            : "Time ran out with someone still hidden."}
        {winner !== "" && (
          <span className={won ? "text-emerald-400" : "text-neutral-500"}>
            {won ? " You won." : " You lost."}
          </span>
        )}
      </div>

      <div className="mt-4 mb-1 text-[10px] uppercase tracking-widest text-neutral-500">
        {graves.length ? `Found · ${graves.length}` : "Nobody was found"}
      </div>
      {/* Capped and scrollable: twelve players is twelve rows, and the panel
          must not grow past the world it is explaining. */}
      <div className="max-h-28 overflow-y-auto">
        {graves.map((g, i) => (
          <div
            key={g.id}
            className="flex items-baseline justify-between border-b border-white/5 py-1 text-xs last:border-0"
          >
            <span className="text-neutral-300">{g.name}</span>
            <span className="font-mono text-[10px] text-neutral-600">
              #{i + 1}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 text-center text-[11px] text-neutral-500">
        Back to the lobby in{" "}
        <span className="font-mono tabular-nums text-neutral-300">{seconds}</span>
      </div>
    </div>
  );
}
