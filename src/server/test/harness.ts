import { Server } from "colyseus";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import type { Room as ServerRoom } from "colyseus";
import type { Room as ClientRoom } from "colyseus.js";
import { defineRooms } from "../rooms.ts";
import type { GameRoom } from "../room.ts";
import type { GameState } from "../schema.ts";

export type { GameRoom };

/** Boot the same room definitions `index.ts` serves. */
export async function bootTestServer(): Promise<ColyseusTestServer> {
  const gameServer = new Server();
  defineRooms(gameServer);
  return boot(gameServer);
}

/** The room instance behind a client's connection, typed as ours. */
export const roomOf = (colyseus: ColyseusTestServer, roomId: string) =>
  colyseus.getRoomById(roomId) as unknown as GameRoom & ServerRoom<GameState>;

/**
 * The private members a test is allowed to reach for. Named rather than `any`,
 * so the day one of them is renamed the tests fail to compile instead of
 * silently asserting nothing.
 */
type Internals = {
  start(): Promise<void>;
  finish(winner: "chameleons" | "hunters"): void;
  hunterId: string;
  matchId: string | null;
};

export const inner = (room: unknown) => room as unknown as Internals;

export type Client = ClientRoom<GameState>;

/** Give the room loop a few ticks to settle. */
export const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

/**
 * Connect and wait for the first state to land. `waitForNextPatch` is no use
 * here: a room that has not changed sends no patch, so it simply hangs.
 */
export async function connected<T extends { state: unknown }>(joining: Promise<T>) {
  const room = await joining;
  await settle();
  return room;
}
