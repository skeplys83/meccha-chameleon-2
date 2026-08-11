import { Schema, MapSchema, ArraySchema, defineTypes } from "@colyseus/schema";
import type { Role } from "../shared/protocol.ts";

/**
 * The synced room state.
 *
 * The rule that decides what belongs here rather than in a broadcast: **state is
 * what a late joiner still has to see.** Paint and graves are permanent, so they
 * are fields; shot marks expire after three seconds and nobody joining
 * afterwards should see them, so they are a broadcast in room.ts.
 *
 * Colyseus patches only the fields that changed, so adding one here is cheap —
 * but every field is sent to every client at the patch rate, so nothing goes in
 * that a client could derive for itself.
 */

export class Player extends Schema {
  // `declare`, never `!`. Node strips types by blanking them out rather than
  // re-emitting, so `name!: string` survives as the class field `name;` — which
  // defines an own property shadowing the accessor `defineTypes` installs on the
  // prototype. Colyseus then cannot find its metadata and every state encode
  // dies with "Cannot read properties of undefined (reading Symbol.metadata)".
  // `declare` is erased completely, which is what these need to be.
  declare name: string;
  declare role: Role;
  declare x: number;
  declare y: number;
  declare z: number;
  /** For a seeker this is the *camera* yaw, not the body yaw — that is how a
   *  hider reads where the gun hunting them is pointed. See players/CLAUDE.md. */
  declare yaw: number;
  declare pitch: number;
  declare pose: number;
  /** Stuck to a wall or the ceiling. Cosmetic — it keeps other clients from
   *  playing footsteps for someone sliding along a surface. */
  declare cling: boolean;
  declare strokes: ArraySchema<string>;

  constructor() {
    super();
    // Kept in state rather than only broadcast, so a player joining late is
    // handed everyone's existing paint.
    this.strokes = new ArraySchema<string>();
  }
}

defineTypes(Player, {
  name: "string",
  role: "string",
  x: "number",
  y: "number",
  z: "number",
  yaw: "number",
  pitch: "number",
  pose: "number",
  cling: "boolean",
  strokes: ["string"],
});

export class GameState extends Schema {
  declare players: MapSchema<Player>;
  declare graves: ArraySchema<string>;
  /**
   * Which map this room is playing. Fixed for the room's life: it is set by
   * whoever opened it and never changes, because swapping the geometry under
   * players who are standing on it has no sane outcome.
   */
  declare map: string;
  /**
   * `"lobby"` or `"match"`. A lobby is the waiting room — always the arena,
   * always able to start a match; a match is the game proper on the chosen map
   * and is unlisted. One class serves both, so the client has to be told which
   * it is in, and so does anything that renders a Start button.
   */
  declare mode: string;
  /**
   * The map a lobby will start its match on. Meaningless in a match room, where
   * `map` is already the answer. Kept apart from `map` because a lobby is
   * *playable* while it waits — it is the arena, not a menu — so it needs its
   * own geometry and the pending choice at the same time.
   */
  declare nextMap: string;
  /**
   * Whoever may press Start: the first player to join, reassigned if they
   * leave. Not authoritative about a person — there are no accounts — only about
   * which seat in this room holds the button.
   */
  declare hostId: string;
  /**
   * Whether this lobby appears in the menu's list of games.
   *
   * Chosen once, by whoever created it, and on by default — a game nobody can
   * find needs the code passed by hand. Unlisted is not locked: the code still
   * works either way, so this only decides whether strangers on the server can
   * see that the game exists. Always false for a match.
   */
  declare listed: boolean;
  /**
   * The invite code of the lobby this game belongs to.
   *
   * A lobby's own id, and for a match the lobby that opened it — which is how a
   * client leaving a match knows where "back" is, and how the match itself
   * finds the room to send everyone home to when time runs out.
   */
  declare lobby: string;
  /**
   * Seconds left in the match, counted down on the server.
   *
   * A number rather than a deadline: a wall-clock end time would have to be
   * reconciled against every client's own clock, and this is a countdown nobody
   * needs to the millisecond. Zero in a lobby, which waits for as long as it
   * likes.
   */
  declare timeLeft: number;

  constructor() {
    super();
    this.players = new MapSchema<Player>();
    // Death markers live in state, not in a broadcast: they are permanent, so
    // someone joining an hour later still has to see every one of them.
    this.graves = new ArraySchema<string>();
  }
}

defineTypes(GameState, {
  players: { map: Player },
  graves: ["string"],
  map: "string",
  mode: "string",
  nextMap: "string",
  hostId: "string",
  listed: "boolean",
  lobby: "string",
  timeLeft: "number",
});
