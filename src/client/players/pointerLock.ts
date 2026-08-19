/**
 * The canvas is created inside the r3f tree but the pause menu lives outside
 * it, so the element both need is kept here.
 */
let target: HTMLCanvasElement | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;

/** Roughly how long the browser refuses a re-lock after Esc released one. */
const RETRY_MS = 250;
const RETRY_ATTEMPTS = 8;

export function setLockTarget(canvas: HTMLCanvasElement | null) {
  target = canvas;
  if (!canvas) cancelLock();
}

/** The element the lock is taken on, for anyone needing to compare against it. */
export function lockTargetEl() {
  return target;
}

export function isLocked() {
  return !!target && document.pointerLockElement === target;
}

/** Take the pointer back, and keep asking until it works. */
export function requestLock() {
  cancelLock();

  /** A missing target is a reason to wait, not to give up. */
  let left = RETRY_ATTEMPTS;
  const attempt = () => {
    retry = null;
    if (isLocked()) return;
    if (!target) {
      if (--left > 0) retry = setTimeout(attempt, RETRY_MS);
      return;
    }

    try {
      const pending = target.requestPointerLock() as unknown;
      if (pending && typeof (pending as Promise<void>).catch === "function") {
        void (pending as Promise<void>).catch(() => {});
      }
    } catch {
      // Refused for now; the retry below is the whole plan.
    }

    if (--left > 0) retry = setTimeout(attempt, RETRY_MS);
  };
  attempt();
}

/** Stop trying. */
export function cancelLock() {
  if (retry) clearTimeout(retry);
  retry = null;
}
