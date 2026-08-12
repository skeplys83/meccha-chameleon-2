/**
 * Who holds the Start button.
 *
 * **The host is the present player who has been part of this game longest**, so
 * the creator keeps it by construction and it passes to the next-longest only
 * when they leave for good. Getting that right took three separate pieces, and
 * removing any one of them puts the button back on a coin-toss — which is why
 * they live together in one place rather than scattered through `room.ts`.
 *
 * It knows nothing about rooms, clients or schema: `room.ts` tells it who is
 * here and whether a match is running, and it answers with a session id. That
 * boundary is what makes it readable on its own, and it is the reason this file
 * exists at all.
 */

/**
 * How long the button waits for an absent host after a match ends.
 *
 * Everyone comes back at once, in whatever order their seat reservations land,
 * and the host is not necessarily first through the door. Without this pause the
 * first arrival would be handed the button a moment before its owner walked in
 * and kept it — the exact reshuffle this whole file exists to prevent.
 */
const HOST_GRACE_MS = 10_000;

/** One seat, as `room.ts` sees it: a connection and the tab behind it. */
export type Seat = { sessionId: string; pid: string };

export class HostRule {
  /**
   * Which tab each seat belongs to, by session id.
   *
   * A session id identifies a connection to *one room* and is replaced every
   * time a player changes rooms, so it cannot answer "is this the person who
   * opened the game". The player id can, and this is where the two are tied
   * together for as long as the connection lasts.
   */
  private pidOf = new Map<string, string>();

  /**
   * When each player id was first seen in this room, for the room's whole life.
   *
   * This is what "longest participating" has to mean. Arrival *order* is no use:
   * everybody leaves the lobby when a match starts and comes back with fresh
   * session ids in whatever order their seat reservations happened to land, so
   * ordering by the current join would just be "first back from the match" —
   * exactly the arbitrary thing the host rule exists to avoid.
   *
   * Entries are kept after their player leaves. Someone who steps out and comes
   * back is still the same length of participating, and the map is a handful of
   * timestamps.
   */
  private firstSeen = new Map<string, number>();

  /** The tab currently holding the button. Empty while nobody does. */
  private holder = "";

  /** Until when the button waits for an absent host rather than moving on. */
  private graceUntil = 0;

  /**
   * The creator, named at `onCreate` rather than at their join.
   *
   * `onJoin` is too late: by then a returning player is indistinguishable from a
   * latecomer, which is precisely the confusion this is here to end.
   */
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

  /**
   * Whether this tab has ever been part of this game.
   *
   * Used by the capacity rule, not by the host rule: while a match is running a
   * lobby admits only players it already knows, or a stranger taking a seat
   * makes the trip home fail for whoever reserved last.
   */
  knows(pid: string) {
    return this.firstSeen.has(pid);
  }

  /** Start the window in which an absent host is waited for rather than replaced. */
  beginGrace() {
    this.graceUntil = Date.now() + HOST_GRACE_MS;
  }

  /**
   * Who should hold the button, given who is standing here.
   *
   * The gate is what makes it work: **nothing is reassigned while a match is
   * running.** A lobby is deliberately empty for that whole minute, so without
   * the gate the button would fall to the first stranger to wander in on the
   * invite code — and, before `start` learned to refuse, let them open a second
   * match. With it, an absent host during a match simply means nobody holds the
   * button until the group comes back.
   */
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
