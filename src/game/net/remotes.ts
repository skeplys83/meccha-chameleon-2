"use client";

import type { Role } from "@/game/shared/protocol";

export type RemoteTarget = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Index into POSES. */
  pose: number;
  /** Stuck to a wall or the ceiling: they are climbing, so they are silent. */
  cling: boolean;
};

export type Remote = {
  id: string;
  name: string;
  role: Role;
  target: RemoteTarget;
};

/**
 * Live transforms for everyone else, mutated in place as Colyseus patches
 * arrive. Deliberately outside React: re-rendering the tree twenty times a
 * second is what makes naive multiplayer stutter.
 */
export const remotes = new Map<string, Remote>();

const rosterListeners = new Set<(ids: string[]) => void>();

/** Fires only when somebody joins or leaves — never on a movement patch. */
export function onRoster(fn: (ids: string[]) => void) {
  rosterListeners.add(fn);
  return () => {
    rosterListeners.delete(fn);
  };
}

export function emitRoster() {
  const ids = [...remotes.keys()];
  rosterListeners.forEach((fn) => fn(ids));
}

/** Drops everyone, telling React once. Used when the room goes away. */
export function clearRemotes() {
  if (!remotes.size) return;
  remotes.clear();
  emitRoster();
}
