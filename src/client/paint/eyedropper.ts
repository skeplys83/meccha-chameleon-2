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
/** Whether `gl.render` ran this frame. Cleared by every `frameDrawn`. */
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
 * Whether this frame drew, consuming the flag.
 *
 * Cleared unconditionally, not just when a pick is waiting: otherwise a drawn
 * frame with nothing to read would leave it set for the skipped frame after it.
 * The reader calls this **once** and does nothing at all on a false, which is
 * what leaves a pending pick pending — the colour then arrives on the next
 * drawn frame instead, at most 16 ms later, and correct.
 */
export function frameDrawn() {
  const fresh = drawn;
  drawn = false;
  return fresh;
}

/** The pending pick, if any. Only meaningful after a true `frameDrawn`. */
export function takePick() {
  const p = pending;
  pending = null;
  return p;
}

export function cancelPick() {
  pending = null;
}

/**
 * The cursor swatch's live read — **a standing request, not a one-shot.**
 *
 * The click takes *albedo* (see `albedo.ts`), because paint is albedo and a lit
 * pixel handed to the brush gets lit twice. The swatch is the other question:
 * what the player is looking at. Albedo shown raw beside the surface it came
 * from does not match it — a grey stone under torchlight is brown on screen —
 * so the circle shows **the drawn pixel**, which is both what the eye sees and
 * what the body will look like once that albedo is lit by the same room.
 *
 * It is standing rather than per-move because the world moves under a still
 * cursor: a camera drift or a door opening changes the answer with no mouse
 * event to notice it.
 */
type Watch = {
  /** Where the cursor is, in client coordinates — the reader has the canvas
   *  rect to hand and converts there, so a mouse move costs no layout read. */
  x: number;
  y: number;
  show: (hex: string) => void;
};

let watch: Watch | null = null;

export function watchPixel(x: number, y: number, show: (hex: string) => void) {
  watch = { x, y, show };
}

export function moveWatch(x: number, y: number) {
  if (!watch) return;
  watch.x = x;
  watch.y = y;
}

export function stopWatch() {
  watch = null;
}

/** Only meaningful after a true `frameDrawn`. Left in place, unlike a pick:
 *  it is answered again on every frame until it is stopped. */
export function takeWatch() {
  return watch;
}
