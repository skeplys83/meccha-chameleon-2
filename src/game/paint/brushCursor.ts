"use client";

import * as THREE from "three";
import type { Part } from "@/game/figure/parts";
import { encodeStroke, paint, SELF } from "./skin";
import type { Brush } from "./brush";

/**
 * The cursor end of painting: raycast your own figure, show the ring where the
 * dot would land, and lay down strokes as the mouse drags.
 *
 * It is a factory rather than a set of functions because all of it hangs off the
 * same four things — the canvas, the camera, your figure and the ring mesh — and
 * threading those through five call sites was most of what made `Player.tsx`
 * hard to read.
 *
 * Painting needs no mode, only a free cursor: anyone whose pointer is not locked
 * (always a hider, or a seeker who pinned the palette) can draw.
 */

/** Minimum UV travel before a drag lays down another dot — a smear at 60 fps
 *  would otherwise be hundreds of near-identical strokes. */
const PAINT_STEP = 0.012;
/** Lift the ring off the skin so it does not z-fight with the body. */
const RING_OFFSET = 0.02;

const pointerNdc = new THREE.Vector2();
const worldNormal = new THREE.Vector3();
const quat = new THREE.Quaternion();
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
}) {
  let drawing = false;
  let last: { part: Part; u: number; v: number } | null = null;

  /**
   * Whatever part of your own body is under the cursor. The raycast hands back
   * a UV, which is exactly the coordinate that part's canvas texture is drawn
   * in, so no unwrapping is needed.
   */
  function hit(e: MouseEvent): THREE.Intersection | null {
    const group = figure();
    if (!group) return null;

    const rect = canvas.getBoundingClientRect();
    pointerNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );

    const meshes: THREE.Object3D[] = [];
    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData.part) meshes.push(o);
    });

    raycaster.setFromCamera(pointerNdc, camera);
    const found = raycaster.intersectObjects(meshes, false)[0];
    return found?.uv ? found : null;
  }

  /** Sit the ring on the body under the cursor, so you see the dot before you
   *  commit to it. The ring is built at the right radius by the caller, so this
   *  only has to place it. */
  function showRing(found: THREE.Intersection | null) {
    const mesh = ring();
    if (!mesh) return;
    if (!found || !found.face) {
      mesh.visible = false;
      return;
    }

    worldNormal
      .copy(found.face.normal)
      .applyQuaternion(found.object.getWorldQuaternion(quat))
      .normalize();

    mesh.visible = true;
    mesh.position.copy(found.point).addScaledVector(worldNormal, RING_OFFSET);
    mesh.lookAt(facing.copy(mesh.position).add(worldNormal));
  }

  function drawAt(e: MouseEvent) {
    const found = hit(e);
    showRing(found);
    if (!found?.uv) return;

    const part = found.object.userData.part as Part;
    const { x: u, y: v } = found.uv;
    if (last && last.part === part && Math.hypot(last.u - u, last.v - v) < PAINT_STEP) return;
    last = { part, u, v };

    const { size, color } = brush();
    const stroke = { part, u, v, size, color };
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
      if (!hit(e)) return false;
      drawing = true;
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
      drawing = false;
      last = null;
    },

    /** Drop any in-flight stroke and hide the preview — pausing, or losing the
     *  free cursor. A drag left running would carry on painting when the
     *  handlers woke up again. */
    cancel() {
      drawing = false;
      last = null;
      const mesh = ring();
      if (mesh) mesh.visible = false;
    },
  };
}
