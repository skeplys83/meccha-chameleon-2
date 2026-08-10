"use client";

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

export function isLocked() {
  return !!target && document.pointerLockElement === target;
}

/**
 * Take the pointer back, and keep asking until it works.
 *
 * A single attempt is not enough and never was. Esc releases the lock *and*
 * starts a cooldown of roughly a second during which the browser silently
 * refuses `requestPointerLock` — so a seeker who paused with Esc and pressed
 * Resume got their cursor left loose in the tab with no way to look around, the
 * exact bug the old one-shot call was written to fix.
 *
 * Retrying until it lands is the only reliable answer; the browser gives no
 * event to wait for and the cooldown is not specified anywhere. Every attempt
 * is a no-op once the lock is held, so overshooting costs nothing.
 */
export function requestLock() {
  cancelLock();
  if (!target) return;

  let left = RETRY_ATTEMPTS;
  const attempt = () => {
    retry = null;
    if (!target || isLocked()) return;
    // Newer Chrome returns a promise that rejects while the cooldown is up.
    // The rejection is expected, and an unhandled one is just console noise.
    void Promise.resolve(target.requestPointerLock()).catch(() => {});
    if (--left > 0) retry = setTimeout(attempt, RETRY_MS);
  };
  attempt();
}

/**
 * Stop trying.
 *
 * **Anything that deliberately gives the cursor back must call this**, or the
 * retry loop grabs it straight back and the pause menu or paint panel becomes
 * unusable — a worse bug than the one the retry fixes.
 */
export function cancelLock() {
  if (retry) clearTimeout(retry);
  retry = null;
}
