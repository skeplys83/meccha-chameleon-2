// The networking surface every other folder imports.

export { createLobby, disconnect, joinLobby, rejoin } from "./client";
export { selfId } from "./connection";
export {
  onChat,
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
  type ChatMessage,
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
export { fetchSessions, type Game } from "./sessions";
export {
  sendChat,
  sendClearSkin,
  sendKill,
  sendMap,
  sendPaint,
  sendShoot,
  sendStart,
  sendState,
  sendWhistle,
} from "./send";
