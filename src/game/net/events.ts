import type { Phase, Role } from "@/game/shared/protocol";

/**
 * One-way notifications from the room that are not part of the synced state:
 * they are events, so they are delivered to listeners rather than stored.
 *
 * The exception that proves the rule is `grave` — graves *are* state on the
 * server (they must survive for late joiners), and `client.ts` turns the
 * `onAdd` backlog into the same event stream so the scene has one way in.
 */

export type NetMark = {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  /** Where the shot came from. The tracer is drawn from here to `position`. */
  origin: [number, number, number];
};

/**
 * Where a chameleon was found, in world space, and who it was.
 *
 * Permanent, and state rather than an event on the server, because the reveal at
 * the end of a round is built from these: they are the record of where everybody
 * was caught. The name rides along so a marker can be labelled rather than
 * anonymous.
 */
export type Grave = { id: string; position: [number, number, number]; name: string };

/**
 * Which room you are in and what it is doing.
 *
 * An event rather than a return value because a session is no longer one room:
 * you are moved from a lobby into its match, the host can change the map you are
 * about to play, and the Start button changes hands when its owner leaves. All
 * three arrive as a patch, so the UI is told rather than asking.
 */
export type RoomInfo = {
  mode: "lobby" | "match";
  /**
   * Which side you are on *here*. Not chosen and not carried: everybody waits as
   * a hunter, and the draw at Start turns all but one of them into chameleons, so
   * this is the room's answer rather than the player's.
   */
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
  /**
   * Seconds left in whatever this room is counting.
   *
   * Zero when nothing is: a lobby that is merely waiting has no clock, and that
   * is the difference between `phase === "waiting"` and `phase === "countdown"`.
   */
  timeLeft: number;
  /** What the room is doing, as opposed to which kind of room it is. */
  phase: Phase;
  /**
   * Who won, once somebody has — `"chameleons"`, `"hunters"`, or empty while the
   * round is still open. Only ever set during `reveal`, and in state rather than
   * an event because the reveal is long enough to reconnect inside.
   */
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
/**
 * Somebody was caught and is now a hunter.
 *
 * Not "killed": being caught does not put you out of the game, it changes which
 * side you are on. The victim's own client uses it to know the thing that just
 * happened was about them; everyone else uses it to place the sound.
 */
const caughtListeners = new Set<
  (victimId: string, by: string, position?: [number, number, number]) => void
>();
const roomListeners = new Set<(info: RoomInfo) => void>();
/** A start that could not take you with it — you are still in the lobby. */
const moveFailedListeners = new Set<(reason: string) => void>();
/**
 * The room went away without us asking it to.
 *
 * Every deliberate exit — quitting, dying, being handed to another room — clears
 * the room handle first, so this fires only for the case nobody chose: the
 * socket died. Until it existed a dropped player kept looking at a live-seeming
 * game with no other players in it and no input reaching anywhere.
 */
const droppedListeners = new Set<() => void>();
/**
 * Carried from one room into another — a lobby starting its match, or a match
 * sending everyone home when its clock runs out.
 *
 * Distinct from `onRoom`, which also fires for a new host or a changed map. This
 * one means *the room you were in is not the room you are in*, which is the only
 * question anything holding UI over the old one needs answered.
 */
const movedListeners = new Set<() => void>();
/**
 * The room you were in is gone — drop everything that belonged to it.
 *
 * Fired at each of the three places a room is left (a hand-off, a deliberate
 * exit, a dead socket), always **before** the next room is attached. That
 * ordering is the whole point and is why this cannot be an effect keyed on
 * `onRoom`: a new room replays its `graves` backlog during `attach`, which lands
 * *earlier* than the `RoomInfo` describing it, so a listener clearing on the
 * room id would wipe the graves it had just been told about.
 *
 * Distinct from `onMoved`, which fires *after* arrival and means "you are
 * somewhere new"; this one means "the old one stopped counting".
 */
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
