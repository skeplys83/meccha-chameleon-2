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

/**
 * Take the pointer back, and keep asking until it works.
 *
 * A single attempt is not enough and never was. Esc releases the lock *and*
 * starts a cooldown of roughly a second during which the browser silently
 * refuses `requestPointerLock` — so a hunter who paused with Esc and pressed
 * Resume got their cursor left loose in the tab with no way to look around, the
 * exact bug the old one-shot call was written to fix.
 *
 * Retrying until it lands is the only reliable answer; the browser gives no
 * event to wait for and the cooldown is not specified anywhere. Every attempt
 * is a no-op once the lock is held, so overshooting costs nothing.
 */
export function requestLock() {
  cancelLock();

  /**
   * **A missing target is a reason to wait, not to give up.**
   *
   * `Player` owns the canvas handle and lives inside r3f's own reconciler, so
   * its mount effect is not ordered against `Game.tsx`'s. When a role change
   * rebuilds the player — which is exactly what being caught does — the old
   * one's teardown clears the target and the new one's effect sets it back, and
   * the ask can land in between. Bailing out there left a freshly converted
   * hunter with a loose cursor and no way to aim until they clicked.
   */
  let left = RETRY_ATTEMPTS;
  const attempt = () => {
    retry = null;
    if (isLocked()) return;
    if (!target) {
      if (--left > 0) retry = setTimeout(attempt, RETRY_MS);
      return;
    }

    // A refusal during the cooldown is expected here, and it arrives two
    // different ways depending on the browser: older Chrome *throws*
    // SecurityError synchronously, newer Chrome returns a promise that rejects
    // with it. Both have to be swallowed. An escaped one is not just console
    // noise — Next's dev overlay catches it and throws a red modal over the
    // running game, which is how this was found.
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
