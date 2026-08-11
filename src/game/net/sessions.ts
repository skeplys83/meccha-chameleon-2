"use client";

/**
 * LAN discovery, client half. A browser cannot scan a network, so the local
 * server does it over UDP and hands the result back here — see `server/`.
 *
 * It also carries the server's list of public games. A lobby created with the
 * box unticked is absent from it — and still perfectly joinable by its code,
 * which is the difference between unlisted and locked.
 */

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
  /**
   * Everyone in the game, across both of its rooms. Once a match starts its
   * players are no longer in the lobby, so counting only the lobby would show a
   * game in full swing as empty.
   */
  players: number;
};

/** The local server's identity, its LAN peers, and its public games. */
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
