"use client";

import { getRoom } from "./connection";

/**
 * Everything this client tells the room. Movement is client-simulated and the
 * server clamps it — a friends-on-a-couch trust model, not anti-cheat. See
 * `server/room.mjs` for what is checked on the other side.
 */

export function sendState(
  p: [number, number, number],
  yaw: number,
  pitch: number,
  pose: number,
) {
  getRoom()?.send("state", { p, yaw, pitch, pose });
}

/** Strokes are batched by the caller — a drag produces far more points than
 *  are worth a message each. */
export function sendPaint(strokes: string[]) {
  if (strokes.length) getRoom()?.send("paint", { strokes });
}

export function sendClearSkin() {
  getRoom()?.send("clearSkin");
}

export function sendKill(id: string, position: [number, number, number]) {
  getRoom()?.send("kill", { id, position });
}

export function sendShoot(
  position: [number, number, number],
  rotation: [number, number, number],
) {
  getRoom()?.send("shoot", { position, rotation });
}
