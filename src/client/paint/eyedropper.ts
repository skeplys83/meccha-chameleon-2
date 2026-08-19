/**
 * Taking a colour off the screen.
 *
 * The eyedropper has to report the pixel *as displayed* — tone mapped, lit, in
 * the output colour space — because what a chameleon is matching is what their
 * hunter will see. That rules out reading a material, and it also rules out the
 * obvious trick of rendering the scene again into a small render target:
 * **three forces linear output and switches tone mapping off when the
 * destination is an ordinary render target**, so the bytes that come back are
 * neither the colour on screen nor a useful approximation of it.
 *
 * So the read happens against the real framebuffer, in the same frame as the
 * draw. `Scene.tsx`'s `FrameLimiter` owns `gl.render` at priority 2; the reader
 * runs at priority 3, which is after it, and before the browser composites the
 * frame away. Nothing needs `preserveDrawingBuffer`, which would cost every
 * frame for the sake of an occasional click.
 */

type Pending = {
  /** Where the click landed, in CSS pixels from the canvas's top-left. */
  x: number;
  y: number;
  done: (hex: string) => void;
};

let pending: Pending | null = null;

/** Arm a pick. The colour arrives on the next drawn frame. */
export function requestPick(x: number, y: number, done: (hex: string) => void) {
  pending = { x, y, done };
}

export function takePick() {
  const p = pending;
  pending = null;
  return p;
}

export function cancelPick() {
  pending = null;
}
