"use client";

import type { Role } from "@/game/shared/protocol";

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

/** Where somebody died, in world space. Permanent. */
export type Grave = { id: string; position: [number, number, number] };

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
   * a seeker, and the draw at Start turns all but one of them into hiders, so
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
  /** Seconds left in the match. Zero in a lobby, which waits indefinitely. */
  timeLeft: number;
};

/** Where the shot came from — a session id, because every client already knows
 *  where that player is and a position on the wire would only be staler. */
const shotListeners = new Set<(shooterId: string) => void>();
/** Who whistled. Like a shot, the position is looked up locally from `remotes`. */
const whistleListeners = new Set<(whistlerId: string) => void>();
const markListeners = new Set<(mark: NetMark) => void>();
const graveListeners = new Set<(grave: Grave) => void>();
const killListeners = new Set<
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

export function onKilled(
  fn: (victimId: string, by: string, position?: [number, number, number]) => void,
) {
  killListeners.add(fn);
  return () => {
    killListeners.delete(fn);
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

export function emitKilled(
  victimId: string,
  by: string,
  position?: [number, number, number],
) {
  killListeners.forEach((fn) => fn(victimId, by, position));
}
