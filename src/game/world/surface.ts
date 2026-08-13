/** The name every climbable, shootable, camera-blocking mesh carries. */
export const ROOM_SURFACE = "room-surface";

let revision = 0;

export function bumpSurfaces() {
  revision += 1;
}

/** Compared once per frame; a change means re-collect. */
export const surfaceRevision = () => revision;
