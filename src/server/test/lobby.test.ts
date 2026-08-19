import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import { bootTestServer, connected, inner, roomOf, settle } from "./harness.ts";
import { MIN_PLAYERS } from "../../shared/protocol.ts";
import { DEFAULT_MATCH_MAP, LOBBY_MAP } from "../../shared/mapIds.ts";

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await bootTestServer();
});
afterAll(async () => await colyseus.shutdown());
afterEach(async () => await colyseus.cleanup());

/** Open a lobby the way `net/client.ts` does. */
const openLobby = (options: Record<string, unknown> = {}) =>
  connected(colyseus.sdk.create("lobby", { name: "host", pid: "host-tab", ...options }));

/** Join an existing lobby by its code, as somebody handed the invite would. */
const joinLobby = (code: string, name: string) =>
  connected(colyseus.sdk.joinById(code, { name, pid: `${name}-tab` }));

describe("a lobby", () => {
  it("waits in the arena under a readable four-letter code", async () => {
    const client = await openLobby();

    expect(client.roomId).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(client.state.mode).toBe("lobby");
    expect(client.state.phase).toBe("waiting");
    expect(client.state.map).toBe(LOBBY_MAP);
    // A clock that is not running is 0, never absent — see invariant 18.
    expect(client.state.timeLeft).toBe(0);
  });

  it("arms everybody, because nobody picks a side", async () => {
    const host = await openLobby();
    const guest = await joinLobby(host.roomId, "guest");

    expect(host.state.players.get(host.sessionId)!.role).toBe("hunter");
    expect(host.state.players.get(guest.sessionId)!.role).toBe("hunter");
  });

  it("refuses a kill even though everyone in it is armed", async () => {
    const host = await openLobby();
    const victim = await joinLobby(host.roomId, "victim");

    host.send("kill", { id: victim.sessionId });
    await settle();

    // The shot still bangs; only the consequence is withheld.
    expect(host.state.players.get(victim.sessionId)!.role).toBe("hunter");
    expect(host.state.graves.length).toBe(0);
  });

  it("refuses the arena as a match map, at creation and from the host", async () => {
    const host = await openLobby({ map: LOBBY_MAP });
    expect(host.state.nextMap).toBe(DEFAULT_MATCH_MAP);

    host.send("setMap", { map: LOBBY_MAP });
    await settle();
    expect(host.state.nextMap).toBe(DEFAULT_MATCH_MAP);
  });

  it("ignores start and setMap from anyone but the host", async () => {
    const host = await openLobby({ map: "dungeon" });
    const guest = await joinLobby(host.roomId, "guest");

    guest.send("setMap", { map: "arena" });
    guest.send("start", {});
    await settle();

    expect(host.state.nextMap).toBe("dungeon");
    expect(host.state.phase).toBe("waiting");
  });

  it("counts down when it fills up, and cancels if it stops being startable", async () => {
    const host = await openLobby({ maxPlayers: MIN_PLAYERS });
    const guest = await joinLobby(host.roomId, "guest");

    // Filling to maxPlayers is one of the two roads into `beginCountdown`.
    expect(host.state.phase).toBe("countdown");
    expect(host.state.timeLeft).toBeGreaterThan(0);

    await guest.leave(true);
    await settle();

    // Below MIN_PLAYERS there is no round to start, so it goes back to waiting
    // immediately rather than on the next tick.
    expect(host.state.phase).toBe("waiting");
    expect(host.state.timeLeft).toBe(0);
  });

  it("closes its door to strangers while it counts down, but not to its own", async () => {
    // Room for a third, so capacity plays no part in what is being tested here.
    const host = await openLobby({ maxPlayers: 3 });
    const known = await joinLobby(host.roomId, "known");
    host.send("start", {});
    await settle();
    expect(host.state.phase).toBe("countdown");

    await expect(
      colyseus.sdk.joinById(host.roomId, { name: "stranger", pid: "stranger-tab" }),
    ).rejects.toBeDefined();

    // A wifi blip inside the ten seconds is not an ejection from your own round.
    await known.leave(false);
    await settle();
    const back = await joinLobby(host.roomId, "known");
    expect(back.roomId).toBe(host.roomId);
  });

  it("draws exactly one hunter, and not always the host", async () => {
    const drawn = new Set<string>();

    for (let round = 0; round < 12; round++) {
      const host = await openLobby({ maxPlayers: 4 });
      const a = await joinLobby(host.roomId, `a${round}`);
      const b = await joinLobby(host.roomId, `b${round}`);
      const room = roomOf(colyseus, host.roomId);

      // Straight to the hand-off: the countdown is ten real seconds and is
      // tested above on its own.
      await inner(room).start();

      const hunterId = inner(room).hunterId;
      expect([host.sessionId, a.sessionId, b.sessionId]).toContain(hunterId);
      drawn.add(hunterId === host.sessionId ? "host" : "guest");

      await colyseus.cleanup();
    }

    // The draw is over whoever is present, so opening the room must not be a
    // way to keep the gun — nor a way to be spared it.
    expect([...drawn].sort()).toEqual(["guest", "host"]);
  });

  it("sends only the chameleons, and keeps the hunter waiting in the arena", async () => {
    const host = await openLobby({ maxPlayers: 4 });
    const guest = await joinLobby(host.roomId, "guest");

    const travelled = new Set<string>();
    host.onMessage("moveTo", () => travelled.add(host.sessionId));
    guest.onMessage("moveTo", () => travelled.add(guest.sessionId));

    const room = roomOf(colyseus, host.roomId);
    await inner(room).start();
    await settle();

    const hunterId = inner(room).hunterId;
    expect(travelled.size).toBe(1);
    expect(travelled.has(hunterId)).toBe(false);
    // The lobby stays in `hiding` until the hunter has actually been handed
    // over, or no bell rings for the one person it is about.
    expect(host.state.phase).toBe("hiding");
  });

  it("does not dispose when its last player leaves", async () => {
    const host = await openLobby();
    const code = host.roomId;
    inner(roomOf(colyseus, code)).matchId = "pretend-match";

    await host.leave(true);
    await settle();

    // The invite code has to survive the whole match its players are away in.
    expect(colyseus.getRoomById(code)).toBeDefined();
  });
});
