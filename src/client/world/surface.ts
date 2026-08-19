/** The name every climbable, shootable, camera-blocking mesh carries. */
export const ROOM_SURFACE = "room-surface";

// The collision layer is drawn in developer mode — `DEV` in `src/game/dev.ts`,
// read by `GltfLevel` and `Scene.tsx`. It is not a switch here any more, and it
// cannot be: this file has to stay import-free (invariant 1).

let revision = 0;

export function bumpSurfaces() {
  revision += 1;
}

/** Compared once per frame; a change means re-collect. */
export const surfaceRevision = () => revision;
