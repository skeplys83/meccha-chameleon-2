
/**
 * Which side you are on. It is protocol, not decoration: the server stores it in
 * schema and checks it before honouring a kill.
 */
export type Role = "chameleon" | "hunter";

/** What a room is doing right now, as opposed to which kind of room it is. */
export type Phase = "waiting" | "countdown" | "hiding" | "hunt" | "reveal";

/** Half-extent of the arena interior. `world/Room.tsx` builds the shell from it. */
export const ROOM_HALF = 20;

/**
 * What a chameleon is stuck to, and therefore which way up they are drawn.
 *
 * It replaced a boolean because the figure needs three answers where the
 * footsteps only needed two: a pose that lies flat lies flat on a floor and on
 * a ceiling, and stands up to climb a wall. Ordered so `cling !== CLING_NONE`
 * is still "is clinging", which is all `sound/` ever asks.
 */
export const CLING_NONE = 0;
export const CLING_WALL = 1;
export const CLING_CEILING = 2;

/** How far out the server lets a player claim to be. */
export const ROOM_LIMIT = 19.9;

/**
 * How many poses exist. `figure/poses.ts` holds the actual table and throws on
 * import if its length disagrees with this, so the two can never drift.
 */
export const POSE_COUNT = 5;

export const MAX_STROKES = 1500;

/** Minimum gap between two shots, in milliseconds. */
export const FIRE_INTERVAL_MS = 800;

/** How much slack the server gives the client's clock. */
export const FIRE_INTERVAL_TOLERANCE = 0.85;

/** How often each player whistles, from the moment they join. */
export const WHISTLE_INTERVAL_MS = 45_000;

/** Slack on the whistle rate, for the same clock-jitter reason as firing. */
export const WHISTLE_TOLERANCE = 0.8;

/** Most strokes the server will take from a single `paint` message. */
export const MAX_STROKE_BATCH = 64;

/**
 * Longest encoded stroke the server will accept. `encodeStroke` in
 * `paint/skin.ts` produces about 30 characters; anything longer is not a stroke.
 */
export const MAX_STROKE_LENGTH = 40;

/** The hard bounds on a lobby's size — not the size of any given lobby. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;

/** How long the lobby counts down before a round begins. */
export const COUNTDOWN_SECONDS = 5;

/** How long the chameleons get on the map before the hunter is let in. */
export const HIDE_SECONDS = 40;

export const REVEAL_SECONDS = 20;

/** The closing stretch of a hunt: the clock turns red and the tick starts. */
export const HUNT_URGENT_SECONDS = 30;

/** How long after the bell the music starts. */
export const MUSIC_DELAY_MS = 5000;

/** How many times the gong strikes when a round is decided, and how far apart. */
export const GONG_STRIKES = 3;
export const GONG_GAP_MS = 220;
/** How much quieter each strike is than the one before it. */
export const GONG_FALLOFF = 0.75;

/** A round is running in this game, and you were not part of it. */
export const LEAVE_IN_PROGRESS = 4001;

/** This lobby is already counting down. */
export const LEAVE_STARTING = 4002;
