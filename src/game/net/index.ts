"use client";

/**
 * The networking surface every other folder imports. Keeping it here means a
 * caller writes `from "@/game/net"` and never has to know which of the five
 * modules below a given function lives in.
 */

export { connect, disconnect } from "./client";
export { selfId } from "./connection";
export {
  onMark,
  onGrave,
  onKilled,
  onShot,
  type Grave,
  type NetMark,
} from "./events";
export {
  onRoster,
  remotes,
  type Remote,
  type RemoteTarget,
} from "./remotes";
export { fetchSessions, type Session } from "./sessions";
export {
  sendClearSkin,
  sendKill,
  sendPaint,
  sendShoot,
  sendState,
} from "./send";
