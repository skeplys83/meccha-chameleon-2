"use client";

import type { Role } from "./types";

const BASE: [key: string, action: string][] = [
  ["W A S D", "Move (relative to view)"],
  ["Mouse", "Look around"],
  ["Q / E", "Turn your figure"],
  ["Space", "Jump"],
];

const HIDER: [key: string, action: string][] = [
  ["1", "Stand upright"],
  ["2", "Lie on your side"],
];

const SEEKER: [key: string, action: string][] = [["Left click", "Shoot"]];

export function ControlsPanel({ role }: { role: Role }) {
  const rows = [...BASE, ...(role === "hider" ? HIDER : SEEKER)];

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
        Click to lock the cursor · Esc to release
      </div>
    </div>
  );
}
