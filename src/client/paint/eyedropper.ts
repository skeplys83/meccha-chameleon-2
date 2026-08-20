/**
 * Reading a colour off the drawn frame — the eyedropper's **fallback**, for
 * when the ray in `albedo.ts` hits nothing solid. The sky and the background
 * are near enough unlit that the pixel is the right answer there.
 *
 * It is not the primary path any more, and the reason is in `albedo.ts`: paint
 * is albedo, so a lit pixel handed back gets lit a second time and comes out
 * far too dark.
 *
 * The read happens against the real framebuffer, in the same frame as the draw.
 * `Scene.tsx`'s `FrameLimiter` owns `gl.render` at priority 2; the reader runs
 * at priority 3, which is after it, and before the browser composites the frame
 * away. Nothing needs `preserveDrawingBuffer`, which would cost every frame for
 * the sake of an occasional click. Re-rendering into a small render target is
 * not an option either: **three forces linear output and switches tone mapping
 * off when the destination is an ordinary render target**.
 *
 * **`FrameLimiter` does not draw every frame**, and that alone used to return
 * black. It caps at 60 fps by skipping `gl.render` outright, so on a 120 Hz
 * display half of all frames draw nothing — and the reader still ran on them,
 * calling `readPixels` on a buffer this frame never wrote, which comes back as
 * zeroes. On a 60 Hz screen nothing is ever skipped and the bug did not exist,
 * which is what made it look random rather than mechanical.
 *
 * So a pick is only ever *taken* on a frame that drew. `markDrawn` is the flag
 * and `FrameLimiter` sets it; anything else that starts owning `gl.render` has
 * to set it too, or this quietly goes back to picking black.
 */

type Pending = {
  /** Where the click landed, in CSS pixels from the canvas's top-left. */
  x: number;
  y: number;
  done: (hex: string) => void;
};

let pending: Pending | null = null;
/** Whether `gl.render` ran this frame. Cleared by every `takePick`. */
let drawn = false;

/** Called by whoever owns `gl.render`, immediately after it draws. */
export function markDrawn() {
  drawn = true;
}

/** Arm a pick. The colour arrives on the next drawn frame. */
export function requestPick(x: number, y: number, done: (hex: string) => void) {
  pending = { x, y, done };
}

/**
 * The pending pick, but only on a frame that actually drew. On a skipped frame
 * it returns null and **leaves the request pending**, so the colour arrives on
 * the next drawn frame instead — at most 16 ms later, and correct.
 */
export function takePick() {
  const fresh = drawn;
  // Cleared unconditionally, not just when a pick is waiting: otherwise a
  // drawn frame with nothing to read would leave this set for the skipped
  // frame after it.
  drawn = false;
  if (!fresh) return null;
  const p = pending;
  pending = null;
  return p;
}

export function cancelPick() {
  pending = null;
}
