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

const markListeners = new Set<(mark: NetMark) => void>();
const graveListeners = new Set<(grave: Grave) => void>();
const killListeners = new Set<(victimId: string, by: string) => void>();

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

export function onKilled(fn: (victimId: string, by: string) => void) {
  killListeners.add(fn);
  return () => {
    killListeners.delete(fn);
  };
}

export function emitMark(mark: NetMark) {
  markListeners.forEach((fn) => fn(mark));
}

export function emitGrave(grave: Grave) {
  graveListeners.forEach((fn) => fn(grave));
}

export function emitKilled(victimId: string, by: string) {
  killListeners.forEach((fn) => fn(victimId, by));
}
