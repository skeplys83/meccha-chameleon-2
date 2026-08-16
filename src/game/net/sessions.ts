/** Public games and server port discovery on the client. */

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

let cachedGamePort: number | null = null;

export function getAdvertisedGamePort(): number | null {
  return cachedGamePort;
}

/** Fetches the public games list and discovers the server's advertised game port. */
export async function fetchSessions(): Promise<{ ready: boolean; games: Game[] }> {
  try {
    const res = await fetch("/api/sessions", { cache: "no-store" });
    if (!res.ok) return { ready: false, games: [] };
    const data = await res.json();
    if (data.self?.gamePort) {
      cachedGamePort = Number(data.self.gamePort);
    }
    return {
      ready: true,
      games: data.games ?? [],
    };
  } catch {
    return { ready: false, games: [] };
  }
}
