import { randomUUID } from "node:crypto";
import { Room } from "colyseus";
import { GameState, Player } from "./schema.mjs";
import { setSessionName } from "./discovery.mjs";
import {
  MAX_STROKES,
  MAX_STROKE_LENGTH,
  POSE_COUNT,
  ROOM_LIMIT,
} from "../src/shared/protocol.mjs";

/**
 * The one room, `"game"`.
 *
 * The trust model is friends-on-a-couch, not anti-cheat: clients simulate their
 * own movement and simply tell the server where they are, and the server clamps
 * the result into the arena. Everything that affects *someone else* — a kill —
 * is still checked here, because a client asserting another client's death is
 * the one message where being wrong is not cosmetic.
 */

// ROOM_LIMIT, POSE_COUNT, MAX_STROKES and MAX_STROKE_LENGTH are imported above:
// the client reads the same definitions, and each used to exist here as a
// second copy with a comment asking the next person to change both.
const PATCH_MS = 50; // 20 Hz state patches
const MAX_GRAVES = 200; // server-only: the client just renders what it is sent

/** Anything non-finite off the wire becomes 0 rather than poisoning the state. */
const clamp = (n, lo, hi) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0);

export class GameRoom extends Room {
  onCreate() {
    this.setState(new GameState());
    this.setPatchRate(PATCH_MS);

    this.onMessage("state", (client, msg) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !msg) return;
      const [x, y, z] = Array.isArray(msg.p) ? msg.p : [0, 0, 0];
      player.x = clamp(x, -ROOM_LIMIT, ROOM_LIMIT);
      player.y = clamp(y, -5, 30);
      player.z = clamp(z, -ROOM_LIMIT, ROOM_LIMIT);
      player.yaw = Number.isFinite(msg.yaw) ? msg.yaw : 0;
      player.pitch = Number.isFinite(msg.pitch) ? msg.pitch : 0;
      player.pose = clamp(Math.trunc(msg.pose), 0, POSE_COUNT - 1);
    });

    // Paint is cosmetic and self-applied: it is stored on the painter and
    // relayed to everyone else, who already have the same brush code.
    this.onMessage("paint", (client, msg) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !Array.isArray(msg?.strokes)) return;

      const strokes = msg.strokes
        .filter((s) => typeof s === "string" && s.length <= MAX_STROKE_LENGTH)
        .slice(0, 64);
      if (!strokes.length) return;

      for (const stroke of strokes) player.strokes.push(stroke);
      const overflow = player.strokes.length - MAX_STROKES;
      if (overflow > 0) player.strokes.splice(0, overflow);

      this.broadcast("paint", { id: client.sessionId, strokes }, { except: client });
    });

    // A hit is called by the shooter — the same trust model as movement. The
    // server still checks the shooter is a seeker and the victim is real, then
    // records the grave and drops the victim from the room.
    this.onMessage("kill", (client, msg) => {
      const shooter = this.state.players.get(client.sessionId);
      const victimId = String(msg?.id ?? "");
      const victim = this.state.players.get(victimId);
      if (!shooter || shooter.role !== "seeker" || !victim || victimId === client.sessionId) {
        return;
      }

      const [x, y, z] = Array.isArray(msg.position) ? msg.position : [victim.x, victim.y, victim.z];
      this.state.graves.push(
        [
          clamp(x, -ROOM_LIMIT, ROOM_LIMIT).toFixed(2),
          clamp(y, -5, 30).toFixed(2),
          clamp(z, -ROOM_LIMIT, ROOM_LIMIT).toFixed(2),
        ].join(","),
      );
      if (this.state.graves.length > MAX_GRAVES) {
        this.state.graves.splice(0, this.state.graves.length - MAX_GRAVES);
      }

      this.broadcast("killed", { id: victimId, by: shooter.name });

      // Give the message a moment to land before the victim is disconnected,
      // or they would be gone before they knew what happened.
      const doomed = this.clients.find((c) => c.sessionId === victimId);
      this.state.players.delete(victimId);
      if (doomed) setTimeout(() => doomed.leave(4000), 250);
    });

    this.onMessage("clearSkin", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.strokes.clear();
      this.broadcast("clearSkin", { id: client.sessionId }, { except: client });
    });

    // Marks are cosmetic and expire in three seconds, so they are simply
    // relayed and never stored.
    this.onMessage("shoot", (_client, msg) => {
      if (!msg) return;
      this.broadcast("mark", {
        id: randomUUID(),
        position: msg.position,
        rotation: msg.rotation,
      });
    });
  }

  onJoin(client, options) {
    const player = new Player();
    player.name = String(options?.name ?? "player").slice(0, 16);
    player.role = options?.role === "seeker" ? "seeker" : "hider";
    player.x = 0;
    player.y = 4;
    player.z = 0;
    player.yaw = 0;
    player.pitch = 0;
    player.pose = 0;
    this.state.players.set(client.sessionId, player);

    // The first person to join names the session, so it shows up on the LAN
    // as "Martin's Session" rather than the OS account name.
    if (this.state.players.size === 1 && !process.env.SESSION_NAME) {
      setSessionName(player.name);
    }
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
  }
}
