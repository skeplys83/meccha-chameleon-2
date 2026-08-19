import { useSyncExternalStore } from "react";

/** Whether anything the player is *waiting on* is still arriving. */

let pending = 0;
const listeners = new Set<() => void>();

export function beginLoading(): () => void {
  pending += 1;
  emit();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    pending -= 1;
    emit();
  };
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A boolean rather than the count, so the snapshot is stable between emits. */
const snapshot = () => pending > 0;

/** Read by `Game.tsx`, which decides what to put on the screen about it. */
export function useLoading() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
