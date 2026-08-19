
/** How long the button waits for an absent host after a match ends. */
const HOST_GRACE_MS = 10_000;

/** One seat, as `room.ts` sees it: a connection and the tab behind it. */
export type Seat = { sessionId: string; pid: string };

export class HostRule {
  /** Which tab each seat belongs to, by session id. */
  private pidOf = new Map<string, string>();

  /** When each player id was first seen in this room, for the room's whole life. */
  private firstSeen = new Map<string, number>();

  /** The tab currently holding the button. Empty while nobody does. */
  private holder = "";

  /** Until when the button waits for an absent host rather than moving on. */
  private graceUntil = 0;

  /** The creator, named at `onCreate` rather than at their join. */
  claim(pid: string) {
    this.holder = pid;
  }

  /** A player has taken a seat. Records the tie, and their first arrival. */
  seat(sessionId: string, pid: string) {
    if (!pid) return;
    this.pidOf.set(sessionId, pid);
    if (!this.firstSeen.has(pid)) this.firstSeen.set(pid, Date.now());
  }

  /**
   * A seat has gone. The *player* is deliberately remembered: stepping out and
   * coming back does not shorten how long you have been here.
   */
  release(sessionId: string) {
    this.pidOf.delete(sessionId);
  }

  /** The tab behind a seat, for forwarding through a hand-off. */
  pidFor(sessionId: string) {
    return this.pidOf.get(sessionId) ?? "";
  }

  /** Whether this tab has ever been part of this game. */
  knows(pid: string) {
    return this.firstSeen.has(pid);
  }

  /** Start the window in which an absent host is waited for rather than replaced. */
  beginGrace() {
    this.graceUntil = Date.now() + HOST_GRACE_MS;
  }

  /** Who should hold the button, given who is standing here. */
  resolve(here: Seat[], matchLive: boolean): string {
    // The holder is here: nothing to decide, but their session id has changed if
    // they have just come back from the match.
    const present = here.find((c) => c.pid !== "" && c.pid === this.holder);
    if (present) return present.sessionId;

    // They are away. If a match is running they are in it, and if one has just
    // ended they are on their way back through the door — either way the button
    // waits rather than falling to whoever happens to be standing here.
    if (matchLive || Date.now() < this.graceUntil) return "";

    // Gone for good, as far as this room can tell. Longest-participating wins,
    // measured from when each *player* first arrived rather than from when their
    // current connection did.
    let best: Seat | null = null;
    let bestSeen = Infinity;
    for (const candidate of here) {
      if (candidate.pid === "") continue;
      const seen = this.firstSeen.get(candidate.pid) ?? Infinity;
      if (seen < bestSeen) {
        best = candidate;
        bestSeen = seen;
      }
    }

    this.holder = best?.pid ?? "";
    return best?.sessionId ?? "";
  }
}
