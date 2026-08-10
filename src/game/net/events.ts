"use client";

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
};

/** Where somebody died, in world space. Permanent. */
export type Grave = { id: string; position: [number, number, number] };

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
