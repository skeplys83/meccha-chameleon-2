/**
 * The two things that ride the cursor while you are painting: the eyedropper's
 * swatch, and the hint that tells you the eyedropper exists.
 *
 * The swatch answers the one question the crosshair cannot: *which* colour is
 * under that pixel. **It shows the drawn pixel, not the albedo the click takes**
 * — those differ by the room's lighting, and a swatch showing the brush's own
 * value looked broken beside the surface it came from: grey stone under
 * torchlight is brown on screen. The brush still takes albedo, which is what
 * makes the painted body come out that same brown under that same light; see
 * `albedo.ts` and `eyedropper.ts`. **It is big on purpose**: a colour is
 * judged by area, and a small chip beside a busy wall reads as whatever is
 * around it. The border is a hairline for the same reason — a thick one is a
 * second colour competing with the one being shown.
 *
 * **Both are plain DOM, updated imperatively, and deliberately not React
 * state.** They move with every mouse event; routing that through a `useState`
 * would re-render the whole HUD tree sixty times a second for the sake of a
 * circle.
 */
export type PickPreview = {
  /** Put the swatch beside the cursor, in client coordinates. */
  move(x: number, y: number): void;
  /** The colour under the cursor, or null when the ray hit nothing solid. */
  setColor(hex: string | null): void;
  destroy(): void;
};

/** Big enough to read a colour off rather than guess at it. */
const SWATCH = 72;
/** Clear of the crosshair's own arms, and below-right so the swatch never
 *  covers the pixel being sampled. */
const OFFSET = 20;

export function createPickPreview(): PickPreview {
  const el = document.createElement("div");
  el.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    `width:${SWATCH}px`,
    `height:${SWATCH}px`,
    "border-radius:9999px",
    // A hairline, and a hairline of shadow outside it so the circle still has
    // an edge against a white wall.
    "border:1px solid rgba(255,255,255,0.85)",
    "box-shadow:0 0 0 1px rgba(0,0,0,0.35),0 4px 14px rgba(0,0,0,0.45)",
    "pointer-events:none",
    "z-index:60",
    // Parked off screen until the first move, so arming the eyedropper cannot
    // flash a swatch in the corner.
    "transform:translate(-200px,-200px)",
  ].join(";");
  document.body.appendChild(el);

  return {
    move(x, y) {
      el.style.transform = `translate(${x + OFFSET}px,${y + OFFSET}px)`;
    },
    setColor(hex) {
      // Nothing solid under the cursor — sky, or background. Left hollow
      // rather than filled with a guess: the click there falls back to reading
      // the drawn pixel, which this cannot know in advance.
      el.style.background = hex ?? "transparent";
    },
    destroy() {
      el.remove();
    },
  };
}

/**
 * The label under the brush ring: **the only place the eyedropper's key is
 * advertised.** It shows exactly when the ring does — when the cursor is over
 * your own body, which is the moment somebody is thinking about colour — and
 * hides again the instant the pick is armed, because by then it has done its
 * job and the swatch wants the space.
 */
export type CursorHint = {
  move(x: number, y: number): void;
  setVisible(visible: boolean): void;
  destroy(): void;
};

export function createCursorHint(text: string): CursorHint {
  const el = document.createElement("div");
  el.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    "padding:3px 7px",
    "border-radius:5px",
    "background:rgba(0,0,0,0.7)",
    "color:rgba(245,245,245,0.95)",
    "font:500 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace",
    "white-space:nowrap",
    "pointer-events:none",
    "z-index:60",
    "opacity:0",
    "transition:opacity 120ms ease",
    "transform:translate(-200px,-200px)",
  ].join(";");
  el.textContent = text;
  document.body.appendChild(el);

  return {
    move(x, y) {
      // Below the cursor and clear of the brush ring, which is drawn around it.
      el.style.transform = `translate(${x + 16}px,${y + 22}px)`;
    },
    setVisible(visible) {
      el.style.opacity = visible ? "1" : "0";
    },
    destroy() {
      el.remove();
    },
  };
}
