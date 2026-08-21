import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import {
  frameDrawn,
  requestPick,
  takePick,
  takeWatch,
} from "@/client/paint/eyedropper";

/** The pixel at a point given in client coordinates, or null when the read came
 *  back empty. Nothing in this scene draws fully transparent black — the
 *  background clears opaque and every material writes alpha 1 — so an empty
 *  buffer means the read found nothing rather than found black. */
function pixelAt(
  gl: THREE.WebGLRenderer,
  rect: DOMRect,
  clientX: number,
  clientY: number,
): string | null {
  const canvas = gl.domElement;
  const px = Math.min(
    canvas.width - 1,
    Math.round(((clientX - rect.left) / rect.width) * canvas.width),
  );
  // WebGL counts rows from the bottom; the DOM counts them from the top.
  const py = Math.min(
    canvas.height - 1,
    canvas.height - 1 - Math.round(((clientY - rect.top) / rect.height) * canvas.height),
  );
  const ctx = gl.getContext();
  const buffer = new Uint8Array(4);
  ctx.readPixels(px, py, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, buffer);
  if (buffer[0] === 0 && buffer[1] === 0 && buffer[2] === 0 && buffer[3] === 0) {
    return null;
  }
  return `#${[buffer[0], buffer[1], buffer[2]]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * The eyedropper's reads, at **priority 3** — after `Scene.tsx`'s draw at 2, and
 * before the browser composites the frame away. Reading the default framebuffer
 * here is what makes the colour *exactly* the pixel on screen; see
 * `paint/eyedropper.ts` for why the obvious alternatives are not.
 *
 * Two readers share the frame:
 *
 * - the **click's fallback**, one-shot, for when the ray in `albedo.ts` hit
 *   nothing solid and the sky is the answer;
 * - the **cursor swatch**, standing, for as long as the eyedropper is armed —
 *   the swatch shows what the player is looking at, and that is the drawn
 *   pixel rather than the albedo the brush will take.
 *
 * A 1×1 `readPixels` a frame is the cost of the swatch, and only while it is on
 * screen. Both take the same care about frames `FrameLimiter` skipped: a read on
 * a frame that never drew comes back as zeroes.
 */
export function useEyedropperReadback() {
  useFrame(({ gl }) => {
    // Consumed once, before anything else: `frameDrawn` clears the flag, and a
    // second caller on the same frame would read false and skip its own work.
    if (!frameDrawn()) return;
    const rect = gl.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const wanted = takePick();
    if (wanted) {
      const hex = pixelAt(gl, rect, wanted.x + rect.left, wanted.y + rect.top);
      // Put the request back and try the next drawn frame rather than reporting
      // `#000000`. `frameDrawn` already refuses undrawn frames; this is the
      // backstop for anything else that can hand back an empty buffer.
      if (hex) wanted.done(hex);
      else requestPick(wanted.x, wanted.y, wanted.done);
    }

    const watch = takeWatch();
    if (watch) {
      const hex = pixelAt(gl, rect, watch.x, watch.y);
      // An empty read leaves the swatch showing what it had. It is refreshed
      // every frame, so a dropped one is invisible; blanking it would flicker.
      if (hex) watch.show(hex);
    }
  }, 3);
}
