import { useFrame } from "@react-three/fiber";
import { requestPick, takePick } from "@/client/paint/eyedropper";

/**
 * The eyedropper's read, at **priority 3** — after `Scene.tsx`'s draw at 2, and
 * before the browser composites the frame away. Reading the default framebuffer
 * here is what makes the picked colour *exactly* the pixel on screen; see
 * `paint/eyedropper.ts` for why the obvious alternatives are not.
 */
export function useEyedropperReadback() {
  useFrame(({ gl }) => {
    const wanted = takePick();
    if (!wanted) return;
    const canvas = gl.domElement;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = Math.min(
      canvas.width - 1,
      Math.round((wanted.x / rect.width) * canvas.width),
    );
    // WebGL counts rows from the bottom; the DOM counts them from the top.
    const py = Math.min(
      canvas.height - 1,
      canvas.height - 1 - Math.round((wanted.y / rect.height) * canvas.height),
    );
    const ctx = gl.getContext();
    const buffer = new Uint8Array(4);
    ctx.readPixels(px, py, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, buffer);

    // Fully transparent black is not a colour anything in this scene draws —
    // the background clears opaque and every material writes alpha 1 — so it
    // means the read found nothing rather than found black. Put the request
    // back and try the next drawn frame instead of reporting `#000000`.
    // `takePick` already refuses undrawn frames; this is the backstop for
    // anything else that can hand back an empty buffer.
    if (
      buffer[0] === 0 &&
      buffer[1] === 0 &&
      buffer[2] === 0 &&
      buffer[3] === 0
    ) {
      requestPick(wanted.x, wanted.y, wanted.done);
      return;
    }

    const hex = [buffer[0], buffer[1], buffer[2]]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    wanted.done(`#${hex}`);
  }, 3);
}
