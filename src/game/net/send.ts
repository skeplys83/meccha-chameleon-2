import { getRoom } from "./connection";
import { MAX_STROKE_BATCH } from "@/game/shared/protocol";

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
  cling: boolean,
) {
  getRoom()?.send("state", { p, yaw, pitch, pose, cling });
}

/**
 * Strokes are batched by the caller — a drag produces far more points than are
 * worth a message each — and split again here so no single message exceeds what
 * the server will accept. It caps a `paint` at `MAX_STROKE_BATCH` and silently
 * drops the rest, so a long enough drag would lose its tail with nothing said.
 */
export function sendPaint(strokes: string[]) {
  const room = getRoom();
  if (!room) return;
  for (let i = 0; i < strokes.length; i += MAX_STROKE_BATCH) {
    room.send("paint", { strokes: strokes.slice(i, i + MAX_STROKE_BATCH) });
  }
}

/** Tells the room you whistled. The server relays it to everyone, positioned at
 *  you — see `sound/`. */
export function sendWhistle() {
  getRoom()?.send("whistle");
}

/**
 * Start the match. Only the host's copy of this does anything — the server
 * checks `hostId` — so the button is hidden for everyone else rather than the
 * message being withheld.
 */
export function sendStart() {
  getRoom()?.send("start");
}

/** Change the map the lobby will start on. Host only, server-checked. */
export function sendMap(map: string) {
  getRoom()?.send("setMap", { map });
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
  origin: [number, number, number],
) {
  getRoom()?.send("shoot", { position, rotation, origin });
}
