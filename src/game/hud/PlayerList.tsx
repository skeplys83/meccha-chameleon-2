"use client";

import { useEffect, useState } from "react";
import { onRoster, remotes } from "@/game/net";

export function PlayerList() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => onRoster(setIds), []);

  return (
    <div className="pointer-events-none absolute left-4 top-4 select-none rounded-lg bg-black/55 px-4 py-3 font-mono text-xs text-neutral-100 backdrop-blur">
      <div className="mb-1 text-[11px] uppercase tracking-widest text-neutral-400">
        Others online · {ids.length}
      </div>
      {ids.length === 0 ? (
        <div className="text-neutral-500">nobody else yet</div>
      ) : (
        ids.map((id) => {
          const r = remotes.get(id);
          return (
            <div key={id} className="text-neutral-300">
              {r?.name} <span className="text-neutral-500">· {r?.role}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
