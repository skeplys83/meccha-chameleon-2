"use client";

/**
 * LAN discovery, client half. A browser cannot scan a network, so the local
 * server does it over UDP and hands the result back here — see `server/`.
 */

export type Session = {
  id: string;
  name: string;
  host: string;
  port: number;
  gamePort: number;
};

/** The local server's own identity plus every session it has heard on the LAN. */
export async function fetchSessions(): Promise<{
  self: Session | null;
  sessions: Session[];
}> {
  try {
    const res = await fetch("/api/sessions", { cache: "no-store" });
    if (!res.ok) return { self: null, sessions: [] };
    const data = await res.json();
    return {
      // The browser reaches its own host by the address it loaded the page from.
      self: data.self ? { ...data.self, host: location.hostname } : null,
      sessions: data.sessions ?? [],
    };
  } catch {
    return { self: null, sessions: [] };
  }
}
