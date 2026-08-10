/**
 * The name every climbable, shootable, camera-blocking mesh carries.
 *
 * It lives alone in its own file so a map can import it without importing the
 * map registry, and the registry can import the maps without a cycle.
 *
 * **Any new geometry must carry it.** That name is what `players/Player.tsx`
 * filters on for the shot raycast, the ground test, the climb probes and the
 * camera pull-in. A piece without it is shot straight through, cannot be stood
 * on or climbed, and the camera clips into it.
 */
export const ROOM_SURFACE = "room-surface";

let revision = 0;

/**
 * Bumped whenever the set of `ROOM_SURFACE` meshes in the scene changes — a map
 * finishing its load, or one map replacing another.
 *
 * `players/Player.tsx` collects those meshes once and reuses the list for the
 * shot raycast, the ground ray, the climb probes and the camera. It used to
 * collect them in a mount effect, which held for the arena because that map is
 * plain JSX and exists by the time anything else mounts. A map built from loaded
 * files does not: it suspends, so the player mounted first, found nothing, and
 * kept an empty list forever — no floor, no walls, no climbing, no shots. This
 * counter is how the player knows to look again.
 */
export function bumpSurfaces() {
  revision += 1;
}

/** Compared once per frame; a change means re-collect. */
export const surfaceRevision = () => revision;
