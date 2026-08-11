"use client";

import { useEffect, useState } from "react";
import { onRoster, remotes } from "@/game/net";
import type { Role } from "@/game/shared/protocol";

/**
 * Who is in this room, you included.
 *
 * You are on the list because the two things it answers — how many of us are
 * there, and who is the seeker — both have you in the answer. `remotes` holds
 * everybody *else* by design (it is a table of things to interpolate and draw,
 * and you are neither), so your own row is passed in from `Game.tsx`, which is
 * where the name you typed and the side the room gave you both live.
 */

/**
 * A glyph per side, because the word alone is easy to skim past in a list where
 * every row looks the same.
 *
 * Emoji rather than an icon set: they come from the operating system's own font,
 * and this game must work with no internet at all — the same rule that keeps
 * three.js's `Text` and drei's `Environment` out of the scene. The lizard is not
 * arbitrary; players are named after reptiles when they do not pick a name.
 *
 * The colour repeats the same fact, for anyone whose font substitutes something
 * unhelpful, and matches the two sides' colours in the menu.
 */
const MARK: Record<Role, { glyph: string; tone: string }> = {
  seeker: { glyph: "🔫", tone: "text-blue-300" },
  hider: { glyph: "🦎", tone: "text-rose-300" },
};

function Row({ name, role, you = false }: { name: string; role: Role; you?: boolean }) {
  const mark = MARK[role] ?? MARK.hider;
  return (
    <div className={`flex items-baseline gap-1.5 ${you ? "text-emerald-300" : "text-neutral-300"}`}>
      <span aria-hidden>{mark.glyph}</span>
      <span>{name}</span>
      <span className={`text-[10px] ${you ? "text-emerald-400/70" : mark.tone}`}>{role}</span>
      {you && <span className="text-[10px] text-emerald-400/70">(you)</span>}
    </div>
  );
}

export function PlayerList({ name, role }: { name: string; role: Role }) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => onRoster(setIds), []);

  return (
    <div className="pointer-events-none absolute left-4 top-4 select-none rounded-lg bg-black/55 px-4 py-3 font-mono text-xs text-neutral-100 backdrop-blur">
      <div className="mb-1 text-[11px] uppercase tracking-widest text-neutral-400">
        In this game · {ids.length + 1}
      </div>

      {/* Yours first and in green: in a list of near-identical rows, finding
          yourself should not need reading. */}
      <Row name={name} role={role} you />

      {ids.map((id) => {
        const remote = remotes.get(id);
        if (!remote) return null;
        return <Row key={id} name={remote.name} role={remote.role} />;
      })}
    </div>
  );
}
