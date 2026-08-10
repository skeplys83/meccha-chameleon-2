"use client";

import type { Role } from "@/game/shared/protocol";
import { POSES } from "@/game/figure/poses";

type Row = [key: string, action: string];

/**
 * The two roles do not share a control scheme, so they do not share a legend
 * either. Anything listed here must actually be wired up in `Player.tsx` for
 * that role — a hider has no shoot, and a seeker has no pose, no Q/E and no
 * zoom, so none of those appear on the wrong card.
 */
const HIDER: Row[] = [
  ["W A S D", "Move · climb a surface you walk into"],
  ["Space", "Jump · let go of a surface"],
  ["Q / E", "Turn your figure"],
  ["Right drag", "Look around"],
  ["Scroll", "Zoom the camera"],
  ["Left drag", "Paint your body"],
  ...POSES.map((p, i): Row => [String(i + 1), p.label]),
];

const SEEKER: Row[] = [
  ["W A S D", "Move (relative to aim)"],
  ["Space", "Jump"],
  ["Mouse", "Aim"],
  ["Left click", "Shoot"],
];

export function ControlsPanel({ role }: { role: Role }) {
  const rows = role === "seeker" ? SEEKER : HIDER;

  return (
    <div className="pointer-events-none absolute right-4 top-4 select-none rounded-lg bg-black/55 px-4 py-3 font-mono text-xs text-neutral-100 backdrop-blur">
      <div className="mb-2 text-[11px] uppercase tracking-widest text-neutral-400">
        {role}
      </div>
      <table>
        <tbody>
          {rows.map(([key, action]) => (
            <tr key={key}>
              <td className="pr-4 text-neutral-300">{key}</td>
              <td className="text-neutral-400">{action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[11px] text-neutral-500">
        {role === "seeker"
          ? "Click to lock the cursor · Esc to release"
          : "Esc pauses · your cursor stays free"}
      </div>
    </div>
  );
}
