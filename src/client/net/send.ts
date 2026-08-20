import { getRoom } from "./connection";
import { MAX_STROKE_BATCH } from "@/shared/protocol";

/** Everything this client tells the room. */

export function sendState(
  p: [number, number, number],
  yaw: number,
  pitch: number,
  pose: number,
  cling: number,
) {
  getRoom()?.send("state", { p, yaw, pitch, pose, cling });
}

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

/** Start the match. */
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
