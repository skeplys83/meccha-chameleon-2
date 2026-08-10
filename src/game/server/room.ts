import { randomUUID } from "node:crypto";
import { Room, type Client } from "colyseus";
import { GameState, Player } from "./schema.ts";
import { setSessionName } from "./discovery.ts";
import {
  FIRE_INTERVAL_MS,
  FIRE_INTERVAL_TOLERANCE,
  WHISTLE_INTERVAL_MS,
  WHISTLE_TOLERANCE,
  MAX_STROKES,
  MAX_STROKE_LENGTH,
  POSE_COUNT,
  ROOM_LIMIT,
} from "../shared/protocol.ts";

/**
 * The one room, `"game"`.
 *
 * The trust model is friends-on-a-couch, not anti-cheat: clients simulate their
 * own movement and simply tell the server where they are, and the server clamps
 * the result into the arena. Everything that affects *someone else* — a kill —
 * is checked here, because a client asserting another client's death is the one
 * message where being wrong is not cosmetic.
 */

// ROOM_LIMIT, POSE_COUNT, MAX_STROKES and MAX_STROKE_LENGTH are imported above:
// the client reads the same definitions, and each used to exist here as a second
// copy with a comment asking the next person to change both.
const PATCH_MS = 50; // 20 Hz state patches
const MAX_GRAVES = 200; // server-only: the client just renders what it is sent
/** A victim is told they died, then dropped. Long enough for the message to land. */
const DEATH_NOTICE_MS = 250;

/** Anything non-finite off the wire becomes 0 rather than poisoning the state. */
const clamp = (n: number, lo: number, hi: number) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0;

const MIN_FIRE_GAP_MS = FIRE_INTERVAL_MS * FIRE_INTERVAL_TOLERANCE;
const MIN_WHISTLE_GAP_MS = WHISTLE_INTERVAL_MS * WHISTLE_TOLERANCE;

type StateMsg = { p?: unknown; yaw?: unknown; pitch?: unknown; pose?: unknown; cling?: unknown };
type PaintMsg = { strokes?: unknown };
type KillMsg = { id?: unknown; position?: unknown };
type ShootMsg = {
  position: [number, number, number];
  rotation: [number, number, number];
};

export class GameRoom extends Room<GameState> {
  /** When each client last got a shot through, so a spammed trigger is dropped
   *  here as well as on the client. Rate is the one property of a shot that
   *  reaches everybody — an unlimited one is a wall of noise for the whole room. */
  private lastShot = new Map<string, number>();
  /** When each client last whistled, so nobody can turn theirs into a siren. */
  private lastWhistle = new Map<string, number>();

  /** True at most once per FIRE_INTERVAL_MS per client, and records the shot. */
  private canFire(sessionId: string) {
    const now = Date.now();
    if (now - (this.lastShot.get(sessionId) ?? 0) < MIN_FIRE_GAP_MS) return false;
    this.lastShot.set(sessionId, now);
    return true;
  }

  onCreate() {
    this.setState(new GameState());
    this.setPatchRate(PATCH_MS);

    this.onMessage("state", (client: Client, msg: StateMsg) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !msg) return;
      const [x, y, z] = Array.isArray(msg.p) ? (msg.p as number[]) : [0, 0, 0];
      player.x = clamp(x, -ROOM_LIMIT, ROOM_LIMIT);
      player.y = clamp(y, -5, 30);
      player.z = clamp(z, -ROOM_LIMIT, ROOM_LIMIT);
      player.yaw = Number.isFinite(msg.yaw) ? (msg.yaw as number) : 0;
      player.pitch = Number.isFinite(msg.pitch) ? (msg.pitch as number) : 0;
      player.pose = clamp(Math.trunc(msg.pose as number), 0, POSE_COUNT - 1);
      // Coerced, never stored raw: schema "boolean" will happily encode whatever
      // truthy junk arrives and hand it to every client.
      player.cling = msg.cling === true;
    });

    // Paint is cosmetic and self-applied: it is stored on the painter and
    // relayed to everyone else, who already have the same brush code.
    this.onMessage("paint", (client: Client, msg: PaintMsg) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !Array.isArray(msg?.strokes)) return;

      const strokes = (msg.strokes as unknown[])
        .filter((s): s is string => typeof s === "string" && s.length <= MAX_STROKE_LENGTH)
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
    this.onMessage("kill", (client: Client, msg: KillMsg) => {
      const shooter = this.state.players.get(client.sessionId);
      const victimId = String(msg?.id ?? "");
      const victim = this.state.players.get(victimId);
      if (!shooter || shooter.role !== "seeker" || !victim || victimId === client.sessionId) {
        return;
      }
      if (!this.canFire(client.sessionId)) return;

      const [rawX, rawY, rawZ] = Array.isArray(msg.position)
        ? (msg.position as number[])
        : [victim.x, victim.y, victim.z];
      const x = clamp(rawX, -ROOM_LIMIT, ROOM_LIMIT);
      const y = clamp(rawY, -5, 30);
      const z = clamp(rawZ, -ROOM_LIMIT, ROOM_LIMIT);

      this.state.graves.push([x.toFixed(2), y.toFixed(2), z.toFixed(2)].join(","));
      if (this.state.graves.length > MAX_GRAVES) {
        this.state.graves.splice(0, this.state.graves.length - MAX_GRAVES);
      }

      // A killing shot is still a shot: it makes the same bang as one that hit a
      // wall, and it is the only bang for it, since this path relays no mark.
      this.broadcast("shot", { id: client.sessionId });
      // The position is what lets everyone hear the death where it happened. It
      // rides on `killed` rather than on the grave, because `graves.onAdd` also
      // replays the whole backlog to a joining client — who would then hear
      // every death in the room's history at once.
      this.broadcast("killed", { id: victimId, by: shooter.name, position: [x, y, z] });

      // Give the message a moment to land before the victim is disconnected, or
      // they would be gone before they knew what happened.
      const doomed = this.clients.find((c) => c.sessionId === victimId);
      this.state.players.delete(victimId);
      if (doomed) setTimeout(() => doomed.leave(4000), DEATH_NOTICE_MS);
    });

    this.onMessage("clearSkin", (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.strokes.clear();
      this.broadcast("clearSkin", { id: client.sessionId }, { except: client });
    });

    // Marks are cosmetic and expire in three seconds, so they are simply relayed
    // and never stored. The bang is a separate broadcast: a mark is at the wall
    // the pellets hit, and a gunshot has to come from the gun.
    this.onMessage("shoot", (client: Client, msg: ShootMsg) => {
      if (!msg || !this.canFire(client.sessionId)) return;
      this.broadcast("mark", {
        id: randomUUID(),
        position: msg.position,
        rotation: msg.rotation,
      });
      this.broadcast("shot", { id: client.sessionId });
    });

    // A whistle is only a position given away, so it is relayed like a shot:
    // everyone hears it, at whoever let it out.
    this.onMessage("whistle", (client: Client) => {
      if (!this.state.players.has(client.sessionId)) return;
      const now = Date.now();
      if (now - (this.lastWhistle.get(client.sessionId) ?? 0) < MIN_WHISTLE_GAP_MS) return;
      this.lastWhistle.set(client.sessionId, now);
      this.broadcast("whistle", { id: client.sessionId });
    });
  }

  onJoin(client: Client, options?: { name?: string; role?: string }) {
    const player = new Player();
    player.name = String(options?.name ?? "player").slice(0, 16);
    player.role = options?.role === "seeker" ? "seeker" : "hider";
    player.x = 0;
    player.y = 4;
    player.z = 0;
    player.yaw = 0;
    player.pitch = 0;
    player.pose = 0;
    player.cling = false;
    this.state.players.set(client.sessionId, player);

    // The first person to join names the session, so it shows up on the LAN as
    // "Martin's Session" rather than the OS account name.
    if (this.state.players.size === 1 && !process.env.SESSION_NAME) {
      setSessionName(player.name);
    }
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.lastShot.delete(client.sessionId);
    this.lastWhistle.delete(client.sessionId);
  }
}
