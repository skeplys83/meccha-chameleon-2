import { Schema, MapSchema, ArraySchema, defineTypes } from "@colyseus/schema";

/**
 * The synced room state.
 *
 * The rule that decides what belongs here rather than in a broadcast: **state
 * is what a late joiner still has to see.** Paint and graves are permanent, so
 * they are fields; shot marks expire after three seconds and nobody joining
 * afterwards should see them, so they are a broadcast in room.mjs.
 *
 * Colyseus patches only the fields that changed, so adding one here is cheap —
 * but every field is sent to every client at the patch rate, so nothing goes in
 * that a client could derive for itself.
 */

export class Player extends Schema {
  constructor() {
    super();
    // Kept in state rather than only broadcast, so a player joining late is
    // handed everyone's existing paint.
    this.strokes = new ArraySchema();
  }
}

defineTypes(Player, {
  name: "string",
  role: "string",
  x: "number",
  y: "number",
  z: "number",
  // For a seeker this is the *camera* yaw, not the body yaw — that is how a
  // hider reads where the gun hunting them is pointed. See players/CLAUDE.md.
  yaw: "number",
  pitch: "number",
  pose: "number",
  strokes: ["string"],
});

export class GameState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    // Death markers live in state, not in a broadcast: they are permanent, so
    // someone joining an hour later still has to see every one of them.
    this.graves = new ArraySchema();
  }
}

defineTypes(GameState, { players: { map: Player }, graves: ["string"] });
