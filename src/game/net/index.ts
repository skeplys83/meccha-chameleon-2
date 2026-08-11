"use client";

/**
 * The networking surface every other folder imports. Keeping it here means a
 * caller writes `from "@/game/net"` and never has to know which of the five
 * modules below a given function lives in.
 */

export { createLobby, disconnect, joinLobby, rejoin } from "./client";
export { selfId } from "./connection";
export {
  onDropped,
  onMark,
  onGrave,
  onKilled,
  onMoved,
  onMoveFailed,
  onRoom,
  onShot,
  onWhistle,
  type Grave,
  type NetMark,
  type RoomInfo,
} from "./events";
export {
  onRoster,
  remotes,
  type Remote,
  type RemoteTarget,
} from "./remotes";
export { fetchSessions, type Game, type Session } from "./sessions";
export {
  sendClearSkin,
  sendKill,
  sendMap,
  sendPaint,
  sendShoot,
  sendStart,
  sendState,
  sendWhistle,
} from "./send";
