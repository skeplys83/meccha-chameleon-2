import { useEffect, useState } from "react";
import { onRoster, remotes } from "@/game/net";
import type { Role } from "@/game/shared/protocol";

/** A colour per side, and *only* a colour. */
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
  /** Whether sides exist yet. */
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
