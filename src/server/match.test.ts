import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import { bootTestServer, connected, inner, roomOf, settle } from "./test/harness.ts";
import { DEFAULT_MATCH_MAP } from "../shared/mapIds.ts";

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await bootTestServer();
});
afterAll(async () => await colyseus.shutdown());
afterEach(async () => await colyseus.cleanup());

const PASS = "the-round-pass";

/** A match, opened the way a lobby's `start` opens one. */
const openMatch = () =>
  connected(
    colyseus.sdk.create("match", {
      map: DEFAULT_MATCH_MAP,
      lobby: "NONE",
      pass: PASS,
      maxPlayers: 6,
      name: "first",
      role: "chameleon",
    }),
  );

/** Take a seat in a running match, with whatever this player claims to be. */
const joinMatch = (code: string, name: string, options: Record<string, unknown> = {}) =>
  connected(colyseus.sdk.joinById(code, { name, pid: `${name}-tab`, ...options }));

/** Skip the hiding phase without waiting it out. */
const beginHunt = async (code: string) => {
  roomOf(colyseus, code).state.phase = "hunt";
  await settle();
};

describe("a match", () => {
  it("opens with everybody hiding and a clock the map decided", async () => {
    const client = await openMatch();

    expect(client.state.mode).toBe("match");
    expect(client.state.phase).toBe("hiding");
    expect(client.state.map).toBe(DEFAULT_MATCH_MAP);
    expect(client.state.timeLeft).toBeGreaterThan(0);
  });

  it("rings the bell on its own clock, without a second timer", async () => {
    const client = await openMatch();
    // The real interval, one tick from the end of hiding.
    roomOf(colyseus, client.roomId).state.timeLeft = 1;

    await settle(1600);

    expect(client.state.phase).toBe("hunt");
    expect(client.state.timeLeft).toBeGreaterThan(0);
  });

  it("makes a chameleon of anyone claiming the gun without the round's pass", async () => {
    const first = await openMatch();

    const liar = await joinMatch(first.roomId, "liar", { role: "hunter" });
    const wrong = await joinMatch(first.roomId, "wrong", { role: "hunter", pass: "guessed" });
    await settle();

    expect(first.state.players.get(liar.sessionId)!.role).toBe("chameleon");
    expect(first.state.players.get(wrong.sessionId)!.role).toBe("chameleon");
  });

  it("honours the gun on a seat its lobby reserved", async () => {
    const first = await openMatch();

    const hunter = await joinMatch(first.roomId, "hunter", { role: "hunter", pass: PASS });
    await settle();

    expect(first.state.players.get(hunter.sessionId)!.role).toBe("hunter");
  });

  it("converts the caught rather than removing them, and marks the spot", async () => {
    const victim = await openMatch();
    const hunter = await joinMatch(victim.roomId, "hunter", { role: "hunter", pass: PASS });
    const bystander = await joinMatch(victim.roomId, "bystander");
    await beginHunt(victim.roomId);

    hunter.send("kill", { id: victim.sessionId, position: [1, 2, 3] });
    await settle();

    const caught = victim.state.players.get(victim.sessionId)!;
    expect(caught).toBeDefined(); // still in the room — being caught keeps you playing
    expect(caught.role).toBe("hunter");
    expect(victim.state.graves.length).toBe(1);
    expect(victim.state.graves[0]).toContain("first");
    // One left free, so the round is not over.
    expect(victim.state.phase).toBe("hunt");
    expect(victim.state.players.get(bystander.sessionId)!.role).toBe("chameleon");
  });

  it("ends the round when the last chameleon is caught", async () => {
    const victim = await openMatch();
    const hunter = await joinMatch(victim.roomId, "hunter", { role: "hunter", pass: PASS });
    await beginHunt(victim.roomId);

    hunter.send("kill", { id: victim.sessionId });
    await settle();

    expect(victim.state.phase).toBe("reveal");
    expect(victim.state.winner).toBe("hunters");
  });

  it("gives the round to the chameleons when the hunt clock runs out", async () => {
    const client = await openMatch();
    await joinMatch(client.roomId, "hunter", { role: "hunter", pass: PASS });
    await beginHunt(client.roomId);
    roomOf(colyseus, client.roomId).state.timeLeft = 1;

    await settle(1600);

    expect(client.state.phase).toBe("reveal");
    expect(client.state.winner).toBe("chameleons");
  });

  it("refuses a kill during the reveal, so it cannot be played through", async () => {
    const victim = await openMatch();
    const survivor = await joinMatch(victim.roomId, "survivor");
    const hunter = await joinMatch(victim.roomId, "hunter", { role: "hunter", pass: PASS });
    await beginHunt(victim.roomId);
    inner(roomOf(colyseus, victim.roomId)).finish("chameleons");
    await settle();
    expect(victim.state.phase).toBe("reveal");

    hunter.send("kill", { id: survivor.sessionId });
    await settle();

    expect(victim.state.players.get(survivor.sessionId)!.role).toBe("chameleon");
    expect(victim.state.graves.length).toBe(0);
  });

  it("refuses a chameleon's kill, and one aimed at another hunter", async () => {
    const chameleon = await openMatch();
    const target = await joinMatch(chameleon.roomId, "target");
    const hunter = await joinMatch(chameleon.roomId, "hunter", { role: "hunter", pass: PASS });
    await beginHunt(chameleon.roomId);

    chameleon.send("kill", { id: target.sessionId });
    await settle();
    expect(chameleon.state.players.get(target.sessionId)!.role).toBe("chameleon");

    hunter.send("kill", { id: hunter.sessionId });
    await settle();
    expect(chameleon.state.graves.length).toBe(0);
  });

  it("clamps a reported position to the map rather than trusting it", async () => {
    const client = await openMatch();

    client.send("state", { p: [9999, 9999, -9999], yaw: Number.NaN, pitch: 0, pose: 99 });
    await settle();

    const me = client.state.players.get(client.sessionId)!;
    expect(Math.abs(me.x)).toBeLessThanOrEqual(40);
    expect(me.y).toBeLessThanOrEqual(30);
    // A NaN written into schema propagates to every client, so it becomes 0.
    expect(Number.isFinite(me.yaw)).toBe(true);
    expect(me.pose).toBeLessThanOrEqual(4);
  });
});
