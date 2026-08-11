import type { Client, Room } from "colyseus.js";

/**
 * The one live room handle, kept here rather than in `client.ts` so the senders
 * in `send.ts` can reach it without importing the connection logic — and
 * without the two files forming a cycle.
 */
let room: Room | null = null;

/**
 * The client that opened it, kept for the whole session rather than per room.
 *
 * Moving from a lobby into its match is `consumeSeatReservation`, which is a
 * method on the *client*, not on the room being left — so a client that only
 * existed inside `connect` would leave nothing able to make the trip.
 */
let client: Client | null = null;

export function getRoom() {
  return room;
}

export function setRoom(next: Room | null) {
  room = next;
}

export function getClient() {
  return client;
}

export function setClient(next: Client | null) {
  client = next;
}

/**
 * The last room's reconnection token, kept past the room it belongs to.
 *
 * It is the only thing that can get a dropped player back into the seat they
 * left — same session id, so their position, their side and their paint are all
 * still there. It deliberately survives `disconnect()`, because the moment it is
 * needed is precisely the moment the room has gone.
 */
let token: string | null = null;

export function getToken() {
  return token;
}

export function setToken(next: string | null) {
  token = next;
}

/** The local player's id in the room, which is how they recognise their own death. */
export function selfId() {
  return room?.sessionId ?? null;
}
