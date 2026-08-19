import type { Phase, Role } from "@/shared/protocol";

export type NetMark = {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  /** Where the shot came from. The tracer is drawn from here to `position`. */
  origin: [number, number, number];
};

/** Where a chameleon was found, in world space, and who it was. */
export type Grave = { id: string; position: [number, number, number]; name: string };

/** Which room you are in and what it is doing. */
export type RoomInfo = {
  mode: "lobby" | "match";
  /** Which side you are on *here*. */
  role: Role;
  /** The geometry this room is running right now. */
  map: string;
  /** The map a lobby will start on. Equal to `map` in a match. */
  nextMap: string;
  /** The invite code — the room's id. Worth reading out only for a lobby. */
  code: string;
  /** Whether this client holds the Start button. */
  isHost: boolean;
  /** Whether this lobby shows up in the menu's list of games. Always false for
   *  a match. Decided at creation and never changed. */
  isListed: boolean;
  /** The invite code of the game this room belongs to: a lobby's own code, and
   *  for a match the lobby to go back to. */
  lobbyCode: string;
  /** Seconds left in whatever this room is counting. */
  timeLeft: number;
  /** What the room is doing, as opposed to which kind of room it is. */
  phase: Phase;
  winner: string;
  /** How many players this game holds. The host chose it when they opened it. */
  maxPlayers: number;
  /** How many are here now — for "4 / 8", and for knowing when full is full. */
  playerCount: number;
};

/** Where the shot came from — a session id, because every client already knows
 *  where that player is and a position on the wire would only be staler. */
const shotListeners = new Set<(shooterId: string) => void>();
/** Who whistled. Like a shot, the position is looked up locally from `remotes`. */
const whistleListeners = new Set<(whistlerId: string) => void>();
const markListeners = new Set<(mark: NetMark) => void>();
const graveListeners = new Set<(grave: Grave) => void>();
/** Somebody was caught and is now a hunter. */
const caughtListeners = new Set<
  (victimId: string, by: string, position?: [number, number, number]) => void
>();
const roomListeners = new Set<(info: RoomInfo) => void>();
/** A start that could not take you with it — you are still in the lobby. */
const moveFailedListeners = new Set<(reason: string) => void>();
/** The room went away without us asking it to. */
const droppedListeners = new Set<() => void>();
const movedListeners = new Set<() => void>();
/** The room you were in is gone — drop everything that belonged to it. */
const leftRoomListeners = new Set<() => void>();

export function onLeftRoom(fn: () => void) {
  leftRoomListeners.add(fn);
  return () => {
    leftRoomListeners.delete(fn);
  };
}

export function emitLeftRoom() {
  leftRoomListeners.forEach((fn) => fn());
}

export function onShot(fn: (shooterId: string) => void) {
  shotListeners.add(fn);
  return () => {
    shotListeners.delete(fn);
  };
}

export function onWhistle(fn: (whistlerId: string) => void) {
  whistleListeners.add(fn);
  return () => {
    whistleListeners.delete(fn);
  };
}

export function onMark(fn: (mark: NetMark) => void) {
  markListeners.add(fn);
  return () => {
    markListeners.delete(fn);
  };
}

export function onGrave(fn: (grave: Grave) => void) {
  graveListeners.add(fn);
  return () => {
    graveListeners.delete(fn);
  };
}

export function onCaught(
  fn: (victimId: string, by: string, position?: [number, number, number]) => void,
) {
  caughtListeners.add(fn);
  return () => {
    caughtListeners.delete(fn);
  };
}

export function onRoom(fn: (info: RoomInfo) => void) {
  roomListeners.add(fn);
  return () => {
    roomListeners.delete(fn);
  };
}

export function onMoveFailed(fn: (reason: string) => void) {
  moveFailedListeners.add(fn);
  return () => {
    moveFailedListeners.delete(fn);
  };
}

export function onDropped(fn: () => void) {
  droppedListeners.add(fn);
  return () => {
    droppedListeners.delete(fn);
  };
}

export function emitDropped() {
  droppedListeners.forEach((fn) => fn());
}

export function onMoved(fn: () => void) {
  movedListeners.add(fn);
  return () => {
    movedListeners.delete(fn);
  };
}

export function emitMoved() {
  movedListeners.forEach((fn) => fn());
}

export function emitRoom(info: RoomInfo) {
  roomListeners.forEach((fn) => fn(info));
}

export function emitMoveFailed(reason: string) {
  moveFailedListeners.forEach((fn) => fn(reason));
}

export function emitShot(shooterId: string) {
  shotListeners.forEach((fn) => fn(shooterId));
}

export function emitWhistle(whistlerId: string) {
  whistleListeners.forEach((fn) => fn(whistlerId));
}

export function emitMark(mark: NetMark) {
  markListeners.forEach((fn) => fn(mark));
}

export function emitGrave(grave: Grave) {
  graveListeners.forEach((fn) => fn(grave));
}

export function emitCaught(
  victimId: string,
  by: string,
  position?: [number, number, number],
) {
  caughtListeners.forEach((fn) => fn(victimId, by, position));
}
