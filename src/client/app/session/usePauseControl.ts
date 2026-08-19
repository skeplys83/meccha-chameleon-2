import { useCallback, useEffect, useState } from "react";
import { cancelLock, lockTargetEl, requestLock } from "@/client/players/pointerLock";
import { setAudioSuspended } from "@/client/sound/engine";
import type { Role } from "@/shared/protocol";
import { useLatestRef } from "./useLatestRef";

type Options = {
  joined: boolean;
  role: Role;
  dropped: boolean;
};

/**
 * The pause menu, the palette and the pointer lock — one hook, because they are
 * one mechanism.
 *
 * **`paused` and `painting` are mutually exclusive, and every path has to keep
 * them that way.** Opening the palette clears the pause; Esc closes the palette
 * before it will pause; the hunter's lock handler refuses to pause while it is
 * open. Losing the window was once the exception — it set `paused` and left
 * `painting` alone, which hid the pause menu *and* the palette while the keys
 * stayed dead, so a chameleon came back to a game that ignored them until they
 * pressed Esc to shut an invisible palette and only then found something to
 * resume. Owning both states here is what stops a future path forgetting.
 */
export function usePauseControl({ joined, role, dropped }: Options) {
  const [paused, setPaused] = useState(false);
  // `painting` means the palette is up. Hovering your own body opens it, and
  // from then on it stays open until it is minimised — a palette that closed
  // itself while you were mixing a colour would be maddening.
  const [painting, setPainting] = useState(false);

  // Paint mode deliberately gives the cursor back, so the lock handler below
  // must not read that as "the player wants the pause menu".
  const paintingRef = useLatestRef(painting);
  const pausedRef = useLatestRef(paused);

  /** Opening the panel hands the cursor back so you can draw. Closing it takes
   *  nothing back here — clearing `painting` is enough, because the lock effect
   *  below owns re-locking for every way into play, this one included. */
  const setPaintOpen = useCallback((open: boolean) => {
    setPainting(open);
    if (!open) return;
    setPaused(false);
    cancelLock();
    document.exitPointerLock();
  }, []);

  const resume = useCallback(() => {
    setPaused(false);
    // The lock effect below takes the lock back; this only clears the menu.
  }, []);

  /** Both overlays down at once: a room change, a drop, a fresh join. */
  const closeOverlays = useCallback(() => {
    setPaused(false);
    setPainting(false);
  }, []);

  /** Losing the window pauses the game, whoever you are. */
  useEffect(() => {
    if (!joined) return;
    const away = () => {
      setPaused(true);
      setPainting(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") away();
    };
    window.addEventListener("blur", away);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", away);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [joined]);

  // Pausing always hands the cursor back, whichever role you are, so the menu
  // buttons are reachable. A chameleon never held the lock, so this is a no-op
  // for them; a hunter usually lost it to Esc already, but not if something
  // else raised the menu.
  useEffect(() => {
    if (!paused) return;
    // Cancel first: `requestLock` keeps retrying for about two seconds, and a
    // retry landing after the menu opened would snatch the cursor back off it.
    cancelLock();
    document.exitPointerLock();
  }, [paused]);

  // Pause silences the room too. Without this a shot fired the instant before
  // Esc keeps ringing behind the menu.
  useEffect(() => {
    setAudioSuspended(paused);
  }, [paused]);

  useEffect(() => {
    if (!joined) return;

    /** A chameleon must be made to let go, not merely never asked to take. */
    if (role !== "hunter") {
      cancelLock();
      document.exitPointerLock();
      return;
    }

    if (paused || painting || dropped) return;
    requestLock();
  }, [joined, role, paused, painting, dropped]);

  /**
   * Esc opens the pause menu, and closes it again — but only for a chameleon,
   * and only while this document really holds focus.
   *
   * **Both halves of that are the pointer lock.** A hunter's Esc never reaches
   * here at all: the browser spends it releasing the lock, and
   * `pointerlockchange` is what raises their menu. Were it to reach here,
   * resuming would ask for the lock back in the same keypress that just gave it
   * up, which the browser refuses — so Esc would close the menu and leave them
   * looking around with no lock and no way back. A chameleon never holds one,
   * so for them the key is free to work both ways.
   *
   * `hasFocus` is the "with the mouse" half: a pause that came from losing the
   * window should be dismissed by coming *back* to it, not by a keystroke that
   * arrives while the page is still in the background.
   */
  useEffect(() => {
    if (!joined) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || e.repeat || dropped) return;
      if (paintingRef.current) {
        setPaintOpen(false);
        return;
      }
      if (role !== "chameleon") return;
      if (!pausedRef.current) setPaused(true);
      else if (document.hasFocus()) setPaused(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [joined, role, dropped, setPaintOpen, paintingRef, pausedRef]);

  // For a hunter, Esc releases the pointer lock rather than reaching the app,
  // so losing the lock is what actually means "the player wants out".
  useEffect(() => {
    if (!joined || role !== "hunter" || dropped) return;
    /** Whether this hunter has ever actually held the lock. */
    let held = document.pointerLockElement === lockTargetEl();
    const onLockChange = () => {
      if (document.pointerLockElement) {
        held = true;
        setPaused(false);
        return;
      }
      if (held && !paintingRef.current) setPaused(true);
      held = false;
    };
    document.addEventListener("pointerlockchange", onLockChange);
    return () => document.removeEventListener("pointerlockchange", onLockChange);
  }, [joined, role, dropped, paintingRef]);

  return {
    paused,
    painting,
    pausedRef,
    paintingRef,
    resume,
    setPaintOpen,
    closeOverlays,
  };
}
