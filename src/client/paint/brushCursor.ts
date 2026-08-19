import * as THREE from "three";
import { encodeStroke, paint, SELF } from "./skin";
import { pickBody, type BodyHit } from "./pick";
import type { Brush } from "./brush";

/** Minimum UV travel before a drag lays down another dot — a smear at 60 fps
 *  would otherwise be hundreds of near-identical strokes. */
const PAINT_STEP = 0.012;
/** Lift the ring off the skin so it does not z-fight with the body. */
const RING_OFFSET = 0.02;
/**
 * How far outside the body a press or a drag still counts, in screen pixels.
 *
 * A limb is a few pixels wide at its tip, so a stroke that runs off the end of
 * an arm used to stop dead — the cursor was a pixel past the silhouette and the
 * ray hit nothing. Rays are fired in rings out to this distance and the first
 * hit wins, which reads as the body simply being a bit easier to hit.
 *
 * Only presses and live drags pay for it, and it is affordable at all because
 * `pick.ts` skins the body once and shares that between the rays: through
 * three's own raycast this search measured ~153 ms — a freeze every time a drag
 * ran off a limb — against ~2.4 ms now.
 */
const EDGE_RINGS = [7, 13, 19];
const EDGE_DIRS = 8;

const pointerNdc = new THREE.Vector2();
const facing = new THREE.Vector3();

export type BrushCursor = ReturnType<typeof createBrushCursor>;

export function createBrushCursor({
  canvas,
  camera,
  raycaster,
  figure,
  ring,
  brush,
  onStroke,
  onDrawingChange,
}: {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  raycaster: THREE.Raycaster;
  /** Your own figure's group. A getter — it mounts after this is built. */
  figure: () => THREE.Group | null;
  /** The hover preview. A getter for the same reason. */
  ring: () => THREE.Mesh | null;
  /** Read fresh on every stroke so changing colour mid-drag works. */
  brush: () => Brush;
  /** Called with the encoded stroke, for the caller to batch and send. */
  onStroke: (encoded: string) => void;
  /** Fires when a drag starts and when it ends, and only on the change. */
  onDrawingChange?: (drawing: boolean) => void;
}) {
  let drawing = false;
  let last: { u: number; v: number } | null = null;

  const setDrawing = (next: boolean) => {
    if (drawing === next) return;
    drawing = next;
    onDrawingChange?.(next);
  };

  /** Whatever part of your own body is under the cursor.
   *  `tolerant` widens the target — see `EDGE_RINGS`. */
  function hit(e: MouseEvent, tolerant = false): BodyHit | null {
    const group = figure();
    if (!group) return null;

    // The one skinned mesh wearing the paint. `figure/StickFigure` marks it;
    // the reveal overlay deliberately is not marked, so it cannot be picked.
    let body: THREE.SkinnedMesh | null = null;
    group.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!body && mesh.isSkinnedMesh && mesh.userData.body) body = mesh;
    });
    if (!body) return null;

    const rect = canvas.getBoundingClientRect();
    const cast = (px: number, py: number) => {
      pointerNdc.set((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointerNdc, camera);
      // Not `raycaster.intersectObject`: three re-skins the whole body for
      // every ray, at 6.15 ms each. See `pick.ts`.
      return pickBody(body!, raycaster.ray);
    };

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const direct = cast(x, y);
    if (direct || !tolerant) return direct;

    for (const radius of EDGE_RINGS) {
      for (let i = 0; i < EDGE_DIRS; i++) {
        const a = (i / EDGE_DIRS) * Math.PI * 2;
        const found = cast(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
        if (found) return found;
      }
    }
    return null;
  }

  /** Sit the ring on the body under the cursor, so you see the dot before you
   *  commit to it. The ring is built at the right radius by the caller, so this
   *  only has to place it. */
  function showRing(found: BodyHit | null) {
    const mesh = ring();
    if (!mesh) return;
    if (!found) {
      mesh.visible = false;
      return;
    }

    // The normal is already in world space — it is built from posed vertices.
    mesh.visible = true;
    mesh.position.copy(found.point).addScaledVector(found.normal, RING_OFFSET);
    mesh.lookAt(facing.copy(mesh.position).add(found.normal));
  }

  function drawAt(e: MouseEvent) {
    const found = hit(e, true);
    showRing(found);
    if (!found) return;

    // The body is one mesh wearing one continuous unwrap, so the hit's own UV
    // is the coordinate the canvas is drawn in — nothing to look up.
    const { u, v } = found;
    if (last && Math.hypot(last.u - u, last.v - v) < PAINT_STEP) return;
    last = { u, v };

    const { size, color } = brush();
    const stroke = { u, v, size, color };
    paint(SELF, stroke);
    onStroke(encodeStroke(stroke));
  }

  return {
    /** Is a stroke in flight? Callers give a live drag priority over anything
     *  else the mouse might mean. */
    get drawing() {
      return drawing;
    },

    /** Is the cursor over your own body right now? */
    over: (e: MouseEvent) => !!hit(e),

    /** Left button went down on the body. Returns false if it missed. */
    begin(e: MouseEvent) {
      if (!hit(e, true)) return false;
      setDrawing(true);
      last = null;
      drawAt(e);
      return true;
    },

    /** Mouse moved. Returns whether the cursor is over the body, which is what
     *  pops the palette open. */
    move(e: MouseEvent) {
      if (drawing) {
        drawAt(e);
        return true;
      }
      const found = hit(e);
      showRing(found);
      return !!found;
    },

    end() {
      setDrawing(false);
      last = null;
    },

    /** Drop any in-flight stroke and hide the preview — pausing, or losing the
     *  free cursor. A drag left running would carry on painting when the
     *  handlers woke up again. */
    cancel() {
      setDrawing(false);
      last = null;
      const mesh = ring();
      if (mesh) mesh.visible = false;
    },
  };
}
