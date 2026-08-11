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
export type Role = "chameleon" | "hunter";

/**
 * What a room is doing right now, as opposed to which kind of room it is.
 *
 * A lobby waits, then counts down. A match hides, then hunts, then reveals.
 * Both halves read it — the server decides it, the HUD renders from it — so the
 * spellings live here rather than being typed out twice.
 *
 * `hiding` and `reveal` are declared before anything sets them: the union is the
 * design, and a phase the server can produce but the client has never heard of
 * is the failure this prevents.
 */
export type Phase = "waiting" | "countdown" | "hiding" | "hunt" | "reveal";

/** Half-extent of the arena interior. `world/Room.tsx` builds the shell from it. */
export const ROOM_HALF = 20;

/**
 * How far out the server lets a player claim to be. Deliberately *not*
 * `ROOM_HALF`: it is a cheat bound, not a wall. A chameleon's collider is narrower
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
 * How often each player whistles, from the moment they join.
 *
 * Every player runs this on their own clock and tells the room, so it is a
 * periodic tell rather than a round bell: whistles arrive at different moments
 * for different people, and each one gives away roughly where its owner is.
 *
 * The server rate-limits against it — a client that whistled continuously would
 * be a siren in everybody else's ears.
 */
export const WHISTLE_INTERVAL_MS = 45_000;

/** Slack on the whistle rate, for the same clock-jitter reason as firing. */
export const WHISTLE_TOLERANCE = 0.8;

/**
 * Most strokes the server will take from a single `paint` message.
 *
 * The client batches its respawn replay against the same number. They used to be
 * 50 and 64 written out separately, which worked only because 50 happened to be
 * the smaller — raise the client's batch past the server's cap and paint would
 * vanish silently on respawn, with nothing to say why.
 */
export const MAX_STROKE_BATCH = 64;

/**
 * Longest encoded stroke the server will accept. `encodeStroke` in
 * `paint/skin.ts` produces about 30 characters; anything longer is not a stroke.
 */
export const MAX_STROKE_LENGTH = 40;

/**
 * The hard bounds on a lobby's size — **not** the size of any given lobby.
 *
 * Whoever opens a game picks its cap, and `server/room.ts` clamps that choice
 * into this range before it becomes `maxClients`. Both halves read them: the
 * create panel builds its stepper from them, and the server refuses to trust the
 * number that arrives.
 *
 * The floor is 2 because a round needs a hunter *and* something to hunt. The
 * ceiling is 12 because one hunter against more than that is not a hunt, and
 * because every player is a body, a paint canvas and a stream of state at 20 Hz.
 */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;

/**
 * How long the lobby counts down before a round begins.
 *
 * It starts when the lobby fills or when the host presses Start, and it is the
 * one window in which somebody who wandered in can realise a game is about to
 * happen. Long enough to read the room, short enough not to be a wait.
 */
export const COUNTDOWN_SECONDS = 10;

/**
 * How long the chameleons get on the map before the hunter is let in.
 *
 * The hunter spends it in the lobby, playable but alone. Long enough to cross
 * either map and pick a spot, short enough that standing in an empty arena does
 * not feel like a punishment for being drawn.
 */
export const HIDE_SECONDS = 20;

/**
 * How long the world stays up after a round is decided, before everyone is sent
 * back to the lobby.
 *
 * Nobody moves and nothing can be caught; it is there so the hunt ends with an
 * answer rather than a cut to a menu — you get to see where everybody was.
 */
export const REVEAL_SECONDS = 30;

/**
 * The closing stretch of a hunt: the clock turns red and the tick starts.
 *
 * One threshold for both on purpose — a colour and a sound saying the same thing
 * at the same moment is one signal, and two thresholds would be two. Thirty
 * seconds is long enough to change how a round is played and short enough that
 * the tick still means something when it arrives.
 */
export const HUNT_URGENT_SECONDS = 30;

/**
 * How long after the bell the music starts.
 *
 * Not on the bell itself: the two land on top of each other and the bell is the
 * one carrying information. A few seconds later the hunt has visibly begun and
 * the music arrives under it rather than across it.
 */
export const MUSIC_DELAY_MS = 5000;

/**
 * How many times the gong strikes when a round is decided, and how far apart.
 *
 * The gap is deliberately far shorter than the sound: three strikes ringing into
 * each other read as one emphatic ending, where a second apart reads as three
 * separate gongs and a round that cannot decide it is over.
 */
export const GONG_STRIKES = 3;
export const GONG_GAP_MS = 220;
/**
 * How much quieter each strike is than the one before it.
 *
 * Overlapping strikes add, so a flat gain makes the *third* the loudest moment —
 * exactly backwards, and where the clipping was. Tapering puts the weight on the
 * first hit and lets the rest ring under it.
 */
export const GONG_FALLOFF = 0.75;
