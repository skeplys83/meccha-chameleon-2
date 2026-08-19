import type { Server } from "colyseus";
import { GameRoom } from "./room.ts";

/**
 * Both room types, in one place. `index.ts` and the tests call this, so a suite
 * that passes is a suite that ran against the wiring production uses.
 */
export function defineRooms(gameServer: Server) {
  gameServer.define("lobby", GameRoom);
  gameServer.define("match", GameRoom);
}
