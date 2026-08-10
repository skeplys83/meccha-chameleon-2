"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSessions, type Session } from "@/game/net";
import type { Role } from "@/game/shared/protocol";
import { randomName } from "./names";
import { DEFAULT_MAP, MAP_LIST, type MapId } from "@/game/world/maps";

/**
 * The name lives in `sessionStorage`, deliberately — it is scoped to the tab,
 * not to the browser. This was a cookie, which meant two tabs on one machine
 * (the normal way to test two players locally) shared and overwrote a single
 * name. `sessionStorage` gives each tab its own, and it survives a reload.
 *
 * Storage throws in some privacy modes, so neither side is allowed to be fatal:
 * the worst case is a fresh random name.
 */
const NAME_KEY = "mc_name";
/** Left over from the cookie era. Expired on sight so it stops travelling with
 *  every request and can never leak a browser-wide name back into a tab. */
const LEGACY_COOKIE = "mc_name";

function readName() {
  try {
    return sessionStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeName(name: string) {
  try {
    sessionStorage.setItem(NAME_KEY, name);
  } catch {
    // No storage available — the name just will not survive a reload.
  }
}

function dropLegacyCookie() {
  if (document.cookie.includes(`${LEGACY_COOKIE}=`)) {
    document.cookie = `${LEGACY_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }
}

export function RoleMenu({
  onJoin,
}: {
  onJoin: (name: string, role: Role, target: Session, map: MapId) => void;
}) {
  // Uncontrolled: the saved name only exists on the client, and filling it in
  // after mount keeps the server-rendered markup and the hydrated input equal.
  const input = useRef<HTMLInputElement>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [self, setSelf] = useState<Session | null>(null);
  const [target, setTarget] = useState<Session | null>(null);
  const [map, setMap] = useState<MapId>(DEFAULT_MAP);

  // Filled in after mount, so the server-rendered markup and the hydrated
  // input still match: a random name would differ on every render otherwise.
  useEffect(() => {
    dropLegacyCookie();
    if (input.current) input.current.value = readName() || randomName();
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const { self: mine, sessions: found } = await fetchSessions();
      if (!alive) return;
      setSelf(mine);
      setSessions(found);
      // Drop the selection if that session went away.
      setTarget((t) => (t && found.some((s) => s.id === t.id) ? t : null));
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const destination = target ?? self;

  const join = (role: Role) => {
    if (!destination) return;
    const trimmed = (input.current?.value ?? "").trim().slice(0, 16) || "player";
    writeName(trimmed);
    onJoin(trimmed, role, destination, map);
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 overflow-y-auto bg-neutral-950/90 py-10 text-neutral-100 backdrop-blur-sm">
      <h1 className="text-3xl font-semibold tracking-tight">Meccha Chameleon 2</h1>

      <input
        ref={input}
        defaultValue=""
        placeholder="Your name"
        maxLength={16}
        className="w-64 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-center text-sm outline-none focus:border-neutral-500"
      />

      {/* Always shown, even while there is one map: it is the standing answer to
          "which map am I about to play", and a picker that appears only once a
          second map exists is a control nobody knows is there. */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="text-[11px] uppercase tracking-widest text-neutral-500">
          Map
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {MAP_LIST.map((m) => (
            <button
              key={m.id}
              onClick={() => setMap(m.id)}
              title={m.blurb}
              className={`w-44 rounded-md border px-3 py-2 text-left transition ${
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
        {/* Only the room's creator chooses; anyone joining takes what is there. */}
        <div className="text-[10px] text-neutral-600">
          Applies only if you start the session
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={() => join("hider")}
          disabled={!destination}
          className="w-44 rounded-lg border border-rose-500 bg-rose-600/20 px-6 py-5 text-left transition hover:bg-rose-600/40 disabled:opacity-40"
        >
          <div className="text-lg font-medium text-rose-300">Hider</div>
          <div className="mt-1 text-xs text-neutral-400">
            Small figure, third person. Can lie on its side to blend in.
          </div>
        </button>
        <button
          onClick={() => join("seeker")}
          disabled={!destination}
          className="w-44 rounded-lg border border-blue-500 bg-blue-600/20 px-6 py-5 text-left transition hover:bg-blue-600/40 disabled:opacity-40"
        >
          <div className="text-lg font-medium text-blue-300">Seeker</div>
          <div className="mt-1 text-xs text-neutral-400">
            Bigger figure, first person. Carries a shotgun, always upright.
          </div>
        </button>
      </div>

      <div className="w-[23rem]">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-widest text-neutral-400">
            Sessions on your network
          </span>
          <span className="text-xs text-neutral-600">{sessions.length}</span>
        </div>

        <button
          onClick={() => setTarget(null)}
          className={`mb-1.5 w-full rounded-md border px-3 py-2 text-left text-sm transition ${
            target === null
              ? "border-neutral-400 bg-neutral-800"
              : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
          }`}
        >
          <span className="text-neutral-200">
            {self ? self.name : "Host your own session"}
          </span>
          <span className="ml-2 text-xs text-neutral-500">this machine</span>
        </button>

        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => setTarget(s)}
            className={`mb-1.5 w-full rounded-md border px-3 py-2 text-left text-sm transition ${
              target?.id === s.id
                ? "border-neutral-400 bg-neutral-800"
                : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
            }`}
          >
            <span className="text-neutral-200">{s.name}</span>
            <span className="ml-2 font-mono text-xs text-neutral-500">
              {s.host}
            </span>
          </button>
        ))}

        {sessions.length === 0 && (
          <p className="px-1 pt-1 text-xs text-neutral-600">
            No other sessions found yet. Others need the app running on their
            machine, on this same network.
          </p>
        )}

        <p className="px-1 pt-3 text-xs text-neutral-500">
          {target
            ? `Pick a side to join ${target.name}.`
            : "Pick a side to start your own session."}
        </p>
      </div>
    </div>
  );
}
