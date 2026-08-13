// The networking surface every other folder imports.

export { createLobby, disconnect, joinLobby, rejoin } from "./client";
export { selfId } from "./connection";
export {
  onDropped,
  onMark,
  onGrave,
  onCaught,
  onLeftRoom,
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
