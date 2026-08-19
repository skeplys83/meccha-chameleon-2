import { describe, expect, it } from "vitest";
import { HostRule } from "./host.ts";

/** A seat, as `room.ts` builds them for `resolve`. */
const seat = (sessionId: string, pid: string) => ({ sessionId, pid });

describe("HostRule", () => {
  it("gives the button to the creator, named before they ever join", () => {
    const hosts = new HostRule();
    hosts.claim("creator");
    hosts.seat("s1", "creator");
    hosts.seat("s2", "guest");

    expect(hosts.resolve([seat("s1", "creator"), seat("s2", "guest")], false)).toBe("s1");
  });

  it("follows the creator's new session id home from a match", () => {
    const hosts = new HostRule();
    hosts.claim("creator");
    hosts.seat("s1", "creator");
    hosts.release("s1");
    // Same tab, new seat — which is exactly what a round trip produces.
    hosts.seat("s9", "creator");

    expect(hosts.resolve([seat("s9", "creator")], false)).toBe("s9");
  });

  it("holds the button vacant while a match is running", () => {
    const hosts = new HostRule();
    hosts.claim("creator");
    hosts.seat("stranger", "walk-in");

    // A stranger with the code walking into the empty lobby must not inherit it.
    expect(hosts.resolve([seat("stranger", "walk-in")], true)).toBe("");
  });

  it("still holds it vacant during the grace window after a match ends", () => {
    const hosts = new HostRule();
    hosts.claim("creator");
    hosts.beginGrace();
    hosts.seat("stranger", "walk-in");

    expect(hosts.resolve([seat("stranger", "walk-in")], false)).toBe("");
  });

  it("hands it to the longest-participating player once the host is gone", async () => {
    const hosts = new HostRule();
    hosts.claim("creator");
    hosts.seat("s1", "creator");
    hosts.seat("s2", "early");
    await new Promise((r) => setTimeout(r, 5));
    hosts.seat("s3", "late");
    hosts.release("s1");

    // No match, no grace: the button moves, and it moves by first arrival
    // rather than by who happens to be listed first.
    expect(hosts.resolve([seat("s3", "late"), seat("s2", "early")], false)).toBe("s2");
  });

  it("never gives it to a player with no id", () => {
    const hosts = new HostRule();
    hosts.seat("s1", "");

    expect(hosts.knows("")).toBe(false);
    expect(hosts.resolve([seat("s1", "")], false)).toBe("");
  });
});
