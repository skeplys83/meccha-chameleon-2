"use client";

import type { Room } from "colyseus.js";

/**
 * The one live room handle, kept here rather than in `client.ts` so the senders
 * in `send.ts` can reach it without importing the connection logic — and
 * without the two files forming a cycle.
 */
let room: Room | null = null;

export function getRoom() {
  return room;
}

export function setRoom(next: Room | null) {
  room = next;
}

/** The local player's id in the room, which is how they recognise their own death. */
export function selfId() {
  return room?.sessionId ?? null;
}
