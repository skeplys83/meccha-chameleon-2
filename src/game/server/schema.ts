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

  constructor() {
    super();
    this.players = new MapSchema<Player>();
    // Death markers live in state, not in a broadcast: they are permanent, so
    // someone joining an hour later still has to see every one of them.
    this.graves = new ArraySchema<string>();
  }
}

defineTypes(GameState, { players: { map: Player }, graves: ["string"] });
