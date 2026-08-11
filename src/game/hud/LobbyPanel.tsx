"use client";

import { useState } from "react";
import { sendMap, sendStart } from "@/game/net";
import { MATCH_MAP_LIST, mapName } from "@/game/world/maps";

/**
 * The waiting room's own overlay: the invite code, the map you are about to
 * play, and Start.
 *
 * It sits over a lobby that is a *playable* arena, so it stays small and out of
 * the middle — you are meant to walk around and paint yourself while people
 * arrive, not stare at a menu. It disappears the moment the match begins.
 *
 * **It stays up while paused, and that is the only way it is usable.** Everyone
 * in the waiting room is a seeker, so everyone holds the pointer lock and has no
 * cursor; pausing is what hands the cursor back. Hiding this panel behind the
 * pause menu — which is what it used to do — left the host looking at a Start
 * button they could see and could not click.
 *
 * Only the host sees a Start button or a map picker. That is a display rule on
 * top of a server rule, not instead of one: `server/room.ts` refuses both
 * messages from anyone but `hostId`. Everyone else gets the map they are about
 * to play, in the same place and at the same size, because for them it is the
 * only thing on the panel worth reading.
 */
export function LobbyPanel({
  code,
  nextMap,
  isHost,
  isListed,
}: {
  code: string;
  nextMap: string;
  isHost: boolean;
  isListed: boolean;
}) {
  const [copied, setCopied] = useState(false);

  /**
   * Copy the code, by whichever of the two routes exists here.
   *
   * `navigator.clipboard` is **secure-context only**, so it is present on
   * localhost and over HTTPS and absent on `http://192.168.x.x:3000` — which is
   * how every guest opens this game. Relying on it alone left the button
   * working for the developer and silently dead for everyone else, the same trap
   * that `crypto.randomUUID` set in `net/identity.ts`.
   *
   * `execCommand("copy")` is deprecated and has no such restriction, which makes
   * it the right fallback rather than a bad one. The code is on screen to be
   * read aloud regardless; this is a shortcut, so a failure is silent.
   */
  const copy = () => {
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    };

    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(done, () => {});
      return;
    }

    const scratch = document.createElement("textarea");
    scratch.value = code;
    // Off-screen rather than hidden: `display: none` cannot hold a selection.
    scratch.style.position = "fixed";
    scratch.style.opacity = "0";
    document.body.appendChild(scratch);
    scratch.select();
    try {
      if (document.execCommand("copy")) done();
    } catch {
      // Nothing left to try. The code is legible on the panel.
    }
    scratch.remove();
  };

  return (
    <div className="absolute left-1/2 top-4 w-[22rem] -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-950/90 px-4 py-3 text-neutral-100">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-neutral-500">
            {/* Whether strangers can find this game is worth saying out loud —
                it is decided at creation and cannot be changed from here. */}
            Invite code · {isListed ? "public" : "unlisted"}
          </div>
          <div className="font-mono text-2xl tracking-[0.35em]">{code}</div>
          {/* Said outright rather than inferred from "there is a Start button
              here": the button only appears once you pause, so without this a
              host who has not paused has no way of knowing the round is waiting
              on them. */}
          {isHost && (
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-red-400">
              You are host
            </div>
          )}
        </div>
        <button
          onClick={copy}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-500"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {isHost ? (
        <>
          <div className="mt-3 mb-1 text-[10px] uppercase tracking-widest text-neutral-500">
            Map
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MATCH_MAP_LIST.map((m) => (
              <button
                key={m.id}
                onClick={() => sendMap(m.id)}
                title={m.blurb}
                className={`rounded-md border px-2.5 py-1 text-xs transition ${
                  nextMap === m.id
                    ? "border-neutral-300 bg-neutral-800 text-neutral-100"
                    : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
          <button
            onClick={sendStart}
            className="mt-3 w-full rounded-md border border-emerald-500 bg-emerald-600/20 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-600/40"
          >
            Start on {mapName(nextMap)}
          </button>
        </>
      ) : (
        <>
          {/* The map is the one thing a non-host actually needs from this panel,
              so it gets the weight the Start button has for the host rather than
              being buried mid-sentence. */}
          <div className="mt-3 text-[10px] uppercase tracking-widest text-neutral-500">
            Next map
          </div>
          <div className="text-lg font-medium text-neutral-100">{mapName(nextMap)}</div>
          <p className="mt-2 text-xs text-neutral-500">
            Waiting for the host to start. One player keeps the shotgun and the
            rest become hiders — your paint comes with you.
          </p>
        </>
      )}
    </div>
  );
}
