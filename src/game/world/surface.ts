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
