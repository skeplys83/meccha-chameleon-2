import type { Client, Room } from "colyseus.js";

let room: Room | null = null;

/** The client that opened it, kept for the whole session rather than per room. */
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

/** The last room's reconnection token, kept past the room it belongs to. */
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
