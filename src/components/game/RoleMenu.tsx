"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSessions, type Session } from "@/lib/net";
import type { Role } from "./types";

const COOKIE = "mc_name";

function readNameCookie() {
  const hit = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(COOKIE.length + 1)) : "";
}

function writeNameCookie(name: string) {
  document.cookie = `${COOKIE}=${encodeURIComponent(name)}; path=/; max-age=31536000; samesite=lax`;
}

export function RoleMenu({
  onJoin,
}: {
  onJoin: (name: string, role: Role, target: Session) => void;
}) {
  // Uncontrolled: the saved name only exists on the client, and filling it in
  // after mount keeps the server-rendered markup and the hydrated input equal.
  const input = useRef<HTMLInputElement>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [self, setSelf] = useState<Session | null>(null);
  const [target, setTarget] = useState<Session | null>(null);

  useEffect(() => {
    const saved = readNameCookie();
    if (saved && input.current) input.current.value = saved;
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
    writeNameCookie(trimmed);
    onJoin(trimmed, role, destination);
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 overflow-y-auto bg-neutral-950/90 py-10 text-neutral-100 backdrop-blur-sm">
      <h1 className="text-3xl font-semibold tracking-tight">Meccha Chameleon</h1>

      <input
        ref={input}
        defaultValue=""
        placeholder="Your name"
        maxLength={16}
        className="w-64 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-center text-sm outline-none focus:border-neutral-500"
      />

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
