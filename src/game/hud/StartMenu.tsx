import { useEffect, useRef, useState } from "react";
import { fetchSessions, type Game, type Session } from "@/game/net";
import { randomName } from "./names";
import { mapName, type MapId } from "@/game/world/maps";
import { CreateGamePanel } from "./CreateGamePanel";

/** The name lives in `sessionStorage`, deliberately — it is scoped to the tab, not to the browser. */
const NAME_KEY = "mc_name";
/** Left over from the cookie era. Expired on sight so it stops travelling with
 *  every request and can never leak a browser-wide name back into a tab. */
const LEGACY_COOKIE = "mc_name";

/** How often the games list is refreshed while this menu is in front. Was 2 s,
 *  which is a request every two seconds for a list that changes when somebody
 *  opens a lobby — rare enough that five is still faster than anyone notices. */
const SESSION_POLL_MS = 5000;

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

export function StartMenu({
  onCreate,
  onJoinCode,
}: {
  onCreate: (
    name: string,
    target: Session,
    map: MapId,
    listed: boolean,
    maxPlayers: number,
  ) => void;
  onJoinCode: (name: string, target: Session, code: string) => void;
}) {
  // Uncontrolled: the saved name only exists on the client, and filling it in
  // after mount keeps the server-rendered markup and the hydrated input equal.
  const input = useRef<HTMLInputElement>(null);
  const [self, setSelf] = useState<Session | null>(null);
  const [code, setCode] = useState("");
  const [games, setGames] = useState<Game[]>([]);
  /** The create modal. Map, listing and size all live inside it. */
  const [creating, setCreating] = useState(false);

  // Filled in after mount, so the server-rendered markup and the hydrated
  // input still match: a random name would differ on every render otherwise.
  useEffect(() => {
    dropLegacyCookie();
    if (input.current) input.current.value = readName() || randomName();
  }, []);

  // The server this page came from is the server the game runs on. It is still
  // asked rather than assumed, because it is what knows the Colyseus port —
  // which is not the page's port, and is not always the one it listens on — and
  // because the same answer carries the list of public games.
  //
  // It has to repeat, because the games list is live: someone else opening a
  // lobby, filling it, or starting it changes this screen with no other way of
  // hearing about it. Only this screen, though — the effect unmounts on join, so
  // nothing polls during a game — and only while the tab is actually in front,
  // since a menu nobody is looking at cannot be out of date. Coming back polls
  // at once rather than waiting out the interval.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      const { self: mine, games: open } = await fetchSessions();
      if (!alive) return;
      setSelf(mine);
      setGames(open);
    };

    const run = () => {
      clearInterval(timer);
      if (document.visibilityState === "hidden") return;
      void poll();
      timer = setInterval(() => void poll(), SESSION_POLL_MS);
    };

    run();
    document.addEventListener("visibilitychange", run);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
    };
  }, []);

  const takeName = () => {
    const trimmed = (input.current?.value ?? "").trim().slice(0, 16) || "player";
    writeName(trimmed);
    return trimmed;
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 overflow-y-auto bg-neutral-950/90 py-10 text-neutral-100 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Meccha Chameleon 2</h1>
        <p className="max-w-md text-center text-xs text-neutral-500">
          Everyone waits in the arena, armed. When the host starts, one player
          keeps the shotgun — the rest become chameleons.
        </p>
      </div>

      <input
        ref={input}
        defaultValue=""
        placeholder="Your name"
        maxLength={16}
        className="w-64 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-center text-sm outline-none focus:border-neutral-500"
      />

      <div className="grid w-full max-w-3xl grid-cols-1 gap-10 px-6 md:grid-cols-2">
        {/* ── Open a game of your own ───────────────────────────────────────── */}
        <section>
          <div className="mb-3 text-xs uppercase tracking-widest text-neutral-400">
            Create game
          </div>

          <p className="mb-4 text-[11px] leading-relaxed text-neutral-500">
            Pick a map, a size and whether strangers can see it. You get a code to
            hand out either way.
          </p>

          <button
            onClick={() => setCreating(true)}
            disabled={!self}
            className="w-full rounded-lg border border-emerald-500 bg-emerald-600/20 px-6 py-3 text-sm font-medium text-emerald-200 transition hover:bg-emerald-600/40 disabled:opacity-40"
          >
            Create game
          </button>
        </section>

        {/* ── Or type someone's code ────────────────────────────────────────── */}
        <section>
          <div className="mb-3 text-xs uppercase tracking-widest text-neutral-400">
            Join game
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const wanted = code.trim().toUpperCase();
              if (self && wanted) onJoinCode(takeName(), self, wanted);
            }}
            className="flex flex-col gap-3"
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              maxLength={8}
              autoComplete="off"
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-3 text-center font-mono text-xl tracking-[0.4em] outline-none focus:border-neutral-500"
            />
            <button
              type="submit"
              disabled={!self || !code.trim()}
              className="w-full rounded-lg border border-neutral-600 px-6 py-3 text-sm transition hover:border-neutral-400 disabled:opacity-40"
            >
              Join
            </button>
          </form>
          <p className="mt-2 text-[11px] leading-snug text-neutral-600">
            Four letters, from whoever opened the game.
          </p>

          <div className="mb-1.5 mt-6 flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-widest text-neutral-500">
              Public games
            </span>
            <span className="text-xs text-neutral-600">{games.length}</span>
          </div>

          {games.map((g) => (
            <button
              key={g.code}
              disabled={g.started || g.starting}
              onClick={() => self && onJoinCode(takeName(), self, g.code)}
              className="mb-1.5 flex w-full items-center justify-between gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-left text-sm transition hover:border-neutral-600 disabled:opacity-40 disabled:hover:border-neutral-800"
            >
              <span className="min-w-0">
                <span className="font-mono tracking-[0.2em] text-neutral-200">
                  {g.code}
                </span>
                <span className="ml-2 truncate text-xs text-neutral-500">
                  {g.host ? `${g.host}'s game` : "waiting room"}
                </span>
              </span>
              <span className="shrink-0 text-xs text-neutral-500">
                {/* Both rooms are counted, so a started game reads as busy
                    rather than empty. */}
                {mapName(g.map)} · {g.players}
                {g.maxPlayers ? ` / ${g.maxPlayers}` : ""}
                {/* `started` first: a lobby whose match is running is not
                    counting down, but if both were ever true "in play" is the
                    one that lasts. */}
                {g.started ? " · in play" : g.starting ? " · starting" : ""}
              </span>
            </button>
          ))}

          {games.length === 0 && (
            <p className="px-1 pt-1 text-xs text-neutral-600">
              No public games right now.
            </p>
          )}
        </section>
      </div>

      {!self && (
        <p className="text-xs text-neutral-600">Looking for the game server…</p>
      )}

      {creating && self && (
        <CreateGamePanel
          onCancel={() => setCreating(false)}
          onCreate={(map, listed, maxPlayers) => {
            setCreating(false);
            onCreate(takeName(), self, map, listed, maxPlayers);
          }}
        />
      )}
    </div>
  );
}
