/** Server discovery, client half. */

export type Session = {
  id: string;
  name: string;
  host: string;
  port: number;
  gamePort: number;
};

/** One public game, as the listing describes it. */
export type Game = {
  /** The invite code, which is the room's id — and how you join it. */
  code: string;
  /** Whoever holds the Start button, by name. */
  host: string;
  /** The map it will play, or is playing. */
  map: string;
  /** Whether its match is already running. */
  started: boolean;
  starting: boolean;
  /** Everyone in the game, across both of its rooms. */
  players: number;
  /** The cap the host chose, so the menu can show "4 / 8". */
  maxPlayers: number;
};

/** The local server's identity, its peers on the same network, and its public games. */
export async function fetchSessions(): Promise<{
  self: Session | null;
  sessions: Session[];
  games: Game[];
}> {
  try {
    const res = await fetch("/api/sessions", { cache: "no-store" });
    if (!res.ok) return { self: null, sessions: [], games: [] };
    const data = await res.json();
    return {
      // The browser reaches its own host by the address it loaded the page from.
      self: data.self ? { ...data.self, host: location.hostname } : null,
      sessions: data.sessions ?? [],
      games: data.games ?? [],
    };
  } catch {
    return { self: null, sessions: [], games: [] };
  }
}
