/**
 * What the browser and the server must agree on exactly.
 *
 * These values used to exist twice — once in a component and once in the server
 * — each with a comment begging the next person to change both. Four such pairs
 * are now one definition apiece.
 *
 * **Only put something here if both sides read it.** Server-only tunables (patch
 * rate, grave cap, discovery timings) belong in `server/`, and client-only ones
 * in the folder that owns them; a shared module that collects unrelated
 * constants is just a second global, which is the opposite of the point.
 */

/**
 * Which side you are on. It is protocol, not decoration: the server stores it in
 * schema and checks it before honouring a kill.
 */
export type Role = "hider" | "seeker";

/** Half-extent of the arena interior. `world/Room.tsx` builds the shell from it. */
export const ROOM_HALF = 20;

/**
 * How far out the server lets a player claim to be. Deliberately *not*
 * `ROOM_HALF`: it is a cheat bound, not a wall. A hider's collider is narrower
 * than their figure so they can press into a corner, which legitimately puts
 * them at ~19.7 — clamping that to 19 showed everyone else a body floating a
 * metre off the wall it was hiding against.
 */
export const ROOM_LIMIT = 19.9;

/**
 * How many poses exist. `figure/poses.ts` holds the actual table and throws on
 * import if its length disagrees with this, so the two can never drift.
 */
export const POSE_COUNT = 5;

/**
 * Paint strokes kept per player, on the server in schema and on each client in
 * its replay history. The server's cap is what a late joiner is handed, so a
 * smaller client cap would silently lose paint on respawn.
 */
export const MAX_STROKES = 800;

/**
 * Minimum gap between two shots, in milliseconds. A pump-action needs pumping:
 * without this the shotgun is a machine gun, and one held mouse button is a
 * wall of noise and a stream of marks.
 *
 * The client enforces it so the gun *feels* right, and the server enforces it
 * because rate is the one thing about a shot that affects everybody else. The
 * server allows a little less than this — see `FIRE_INTERVAL_TOLERANCE`.
 */
export const FIRE_INTERVAL_MS = 800;

/**
 * How much slack the server gives the client's clock. A shot that arrives a few
 * milliseconds early is jitter, not cheating, and rejecting it would eat a shot
 * the player heard themselves take.
 */
export const FIRE_INTERVAL_TOLERANCE = 0.85;

/**
 * Longest encoded stroke the server will accept. `encodeStroke` in
 * `paint/skin.ts` produces about 30 characters; anything longer is not a stroke.
 */
export const MAX_STROKE_LENGTH = 40;
