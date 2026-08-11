import { useEffect, useState } from "react";
import { onRoster, remotes } from "@/game/net";
import type { Role } from "@/game/shared/protocol";

/**
 * Who is in this room, you included.
 *
 * You are on the list because the two things it answers — how many of us are
 * there, and who is the hunter — both have you in the answer. `remotes` holds
 * everybody *else* by design (it is a table of things to interpolate and draw,
 * and you are neither), so your own row is passed in from `Game.tsx`, which is
 * where the name you typed and the side the room gave you both live.
 */

/**
 * A colour per side, and *only* a colour.
 *
 * There were emoji here — a gun and a lizard — on the reasoning that a glyph is
 * easier to skim than a word. They came out because the operating system draws
 * them, so the row's weight, baseline and width changed per machine, and on
 * several of them the lizard simply is not a lizard. The word is already there
 * and does the job; the colour is the redundancy.
 */
const MARK: Record<Role, { tone: string }> = {
  hunter: { tone: "text-blue-300" },
  chameleon: { tone: "text-rose-300" },
};

function Row({
  name,
  role,
  showRole,
  you = false,
}: {
  name: string;
  role: Role;
  showRole: boolean;
  you?: boolean;
}) {
  const mark = MARK[role] ?? MARK.chameleon;
  return (
    <div className={`flex items-baseline gap-1.5 ${you ? "text-emerald-300" : "text-neutral-300"}`}>
      <span>{name}</span>
      {showRole && (
        <span className={`text-[10px] ${you ? "text-emerald-400/70" : mark.tone}`}>{role}</span>
      )}
      {you && <span className="text-[10px] text-emerald-400/70">(you)</span>}
    </div>
  );
}

export function PlayerList({
  name,
  role,
  showRoles,
}: {
  name: string;
  role: Role;
  /**
   * Whether sides exist yet.
   *
   * False in a lobby that is waiting or counting down, because there are no
   * sides to show: `onJoin` makes everybody a hunter and the draw has not
   * happened, so the labels would read "hunter" all the way down and give away
   * a decision nobody has made. True from the hiding phase on.
   */
  showRoles: boolean;
}) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => onRoster(setIds), []);

  return (
    <div className="pointer-events-none absolute left-4 top-4 select-none rounded-lg bg-black/55 px-4 py-3 font-mono text-xs text-neutral-100 backdrop-blur">
      <div className="mb-1 text-[11px] uppercase tracking-widest text-neutral-400">
        In this game · {ids.length + 1}
      </div>

      {/* Yours first and in green: in a list of near-identical rows, finding
          yourself should not need reading. */}
      <Row name={name} role={role} showRole={showRoles} you />

      {ids.map((id) => {
        const remote = remotes.get(id);
        if (!remote) return null;
        return <Row key={id} name={remote.name} role={remote.role} showRole={showRoles} />;
      })}
    </div>
  );
}
