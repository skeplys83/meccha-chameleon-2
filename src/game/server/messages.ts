import { randomUUID } from "node:crypto";
import type { Client } from "colyseus";
import type { GameRoom } from "./room.ts";
import {
  FIRE_INTERVAL_MS,
  FIRE_INTERVAL_TOLERANCE,
  MAX_STROKE_BATCH,
  MAX_STROKES,
  MAX_STROKE_LENGTH,
  POSE_COUNT,
  WHISTLE_INTERVAL_MS,
  WHISTLE_TOLERANCE,
} from "../shared/protocol.ts";
import { mapLimit } from "../world/maps.ts";

/**
 * Everything a client may say, and what the server does about it.
 *
 * Split out of `room.ts` because it is a different *kind* of thing: the room
 * owns a round's shape — who is in it, which phase it is in, when it ends — and
 * this owns the moment-to-moment traffic. The two barely touch, which is what
 * makes the seam a real one rather than a line drawn to shorten a file.
 *
 * **The trust model lives here and is not symmetrical.** Clients simulate their
 * own movement and simply tell the server where they are; the server clamps the
 * result into the arena and believes it. Everything that affects *somebody else*
 * — a catch above all — is checked, because a client asserting another client's
 * fate is the one message where being wrong is not cosmetic.
 */

/**
 * Anything non-finite off the wire becomes 0 rather than poisoning the state.
 *
 * Exported because `room.ts` clamps a lobby's chosen size with it. A `NaN`
 * written into schema propagates to every client, so this is the one shape every
 * number arriving from a browser has to pass through.
 */
export const clamp = (n: number, lo: number, hi: number) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0;

const MIN_FIRE_GAP_MS = FIRE_INTERVAL_MS * FIRE_INTERVAL_TOLERANCE;
const MIN_WHISTLE_GAP_MS = WHISTLE_INTERVAL_MS * WHISTLE_TOLERANCE;

/** Server-only: the client just renders the graves it is sent. */
const MAX_GRAVES = 200;

type StateMsg = { p?: unknown; yaw?: unknown; pitch?: unknown; pose?: unknown; cling?: unknown };
type PaintMsg = { strokes?: unknown };
type KillMsg = { id?: unknown; position?: unknown };
type ShootMsg = {
  position: [number, number, number];
  rotation: [number, number, number];
  origin: [number, number, number];
};

/**
 * Wire up one room's message handlers.
 *
 * The two rate limiters are per room and live in this closure, because they are
 * only ever read by the handlers below — a trigger-pull sends exactly one of
 * `shoot` or `kill`, never both, so **one clock rate-limits the pair**. The gap
 * is `FIRE_INTERVAL_MS` times a tolerance, so a shot a few milliseconds early is
 * treated as jitter rather than eaten. The client enforces the same interval for
 * feel; this is here because fire *rate* is the property of a shot that reaches
 * everybody else.
 */
export function registerMessages(room: GameRoom) {
  const lastShot = new Map<string, number>();
  const lastWhistle = new Map<string, number>();

  /** True at most once per FIRE_INTERVAL_MS per client, and records the shot. */
  const canFire = (sessionId: string) => {
    const now = Date.now();
    if (now - (lastShot.get(sessionId) ?? 0) < MIN_FIRE_GAP_MS) return false;
    lastShot.set(sessionId, now);
    return true;
  };

  /** A seat has gone; stop remembering when it last pulled a trigger. */
  const forget = (sessionId: string) => {
    lastShot.delete(sessionId);
    lastWhistle.delete(sessionId);
  };

  room.onMessage("state", (client: Client, msg: StateMsg) => {
    const player = room.state.players.get(client.sessionId);
    if (!player || !msg) return;
    const [x, y, z] = Array.isArray(msg.p) ? (msg.p as number[]) : [0, 0, 0];
    // Per map, not per game: the dungeon is 52 across and the arena 40, and a
    // single bound meant whichever map was bigger had its far end amputated.
    const limit = mapLimit(room.state.map);
    player.x = clamp(x, -limit, limit);
    player.y = clamp(y, -5, 30);
    player.z = clamp(z, -limit, limit);
    player.yaw = Number.isFinite(msg.yaw) ? (msg.yaw as number) : 0;
    player.pitch = Number.isFinite(msg.pitch) ? (msg.pitch as number) : 0;
    player.pose = clamp(Math.trunc(msg.pose as number), 0, POSE_COUNT - 1);
    // Coerced, never stored raw: schema "boolean" will happily encode whatever
    // truthy junk arrives and hand it to every client. Chameleons only, because
    // clinging is what silences your footsteps for everyone else — a hunter
    // who could set it would simply hunt without making a sound.
    player.cling = player.role === "chameleon" && msg.cling === true;
  });

  // Paint is cosmetic and self-applied: it is stored on the painter and
  // relayed to everyone else, who already have the same brush code.
  room.onMessage("paint", (client: Client, msg: PaintMsg) => {
    const player = room.state.players.get(client.sessionId);
    if (!player || !Array.isArray(msg?.strokes)) return;

    const strokes = (msg.strokes as unknown[])
      .filter((s): s is string => typeof s === "string" && s.length <= MAX_STROKE_LENGTH)
      .slice(0, MAX_STROKE_BATCH);
    if (!strokes.length) return;

    for (const stroke of strokes) player.strokes.push(stroke);
    const overflow = player.strokes.length - MAX_STROKES;
    if (overflow > 0) player.strokes.splice(0, overflow);

    room.broadcast("paint", { id: client.sessionId, strokes }, { except: client });
  });

  /**
   * A catch, called by the hunter who made it — the same trust model as
   * movement. The server checks the shooter is a hunter and the victim is a
   * chameleon, then **converts** rather than kills.
   *
   * Being caught does not put you out of the game: you become a hunter, at the
   * map's spawn, stripped back to white, and you join the hunt for whoever is
   * left. That is why there is no death screen and no respawn any more, and
   * why the hunt gets harder the longer it runs.
   */
  room.onMessage("kill", (client: Client, msg: KillMsg) => {
    // Nobody is caught in the waiting room. Everyone there is armed — that is
    // what a lobby *is* — and being converted while queuing for a game you
    // have not started would be nonsense. The shot still bangs and still marks
    // the wall; only the consequence is withheld.
    if (room.isLobby) return;
    // The round is decided. The reveal is a thirty-second look at where
    // everybody was, not extra time.
    if (room.state.phase !== "hunt") return;

    const shooter = room.state.players.get(client.sessionId);
    const victimId = String(msg?.id ?? "");
    const victim = room.state.players.get(victimId);
    if (
      !shooter ||
      shooter.role !== "hunter" ||
      !victim ||
      // A hunter cannot catch a hunter, which also makes this safe to send
      // twice: the second one finds a victim who has already converted.
      victim.role !== "chameleon" ||
      victimId === client.sessionId
    ) {
      return;
    }
    if (!canFire(client.sessionId)) return;

    const [rawX, rawY, rawZ] = Array.isArray(msg.position)
      ? (msg.position as number[])
      : [victim.x, victim.y, victim.z];
    const limit = mapLimit(room.state.map);
    const x = clamp(rawX, -limit, limit);
    const y = clamp(rawY, -5, 30);
    const z = clamp(rawZ, -limit, limit);

    // Where somebody was found, and who. The name rides along so the reveal
    // can label the spot rather than showing anonymous markers.
    room.state.graves.push(
      [x.toFixed(2), y.toFixed(2), z.toFixed(2), victim.name].join(","),
    );
    if (room.state.graves.length > MAX_GRAVES) {
      room.state.graves.splice(0, room.state.graves.length - MAX_GRAVES);
    }

    /**
     * The conversion itself.
     *
     * Paint goes with the side: a chameleon's camouflage is the thing they
     * spent the lobby on, and carrying it into the hunt would leave a hunter
     * wearing the pattern of the wall they were caught against.
     * `clearSkin` tells everyone else, because they are the ones who have to
     * stop seeing it.
     */
    victim.role = "hunter";
    victim.cling = false;
    victim.pose = 0;
    victim.strokes.clear();
    room.broadcast("clearSkin", { id: victimId });

    // A catching shot is still a shot: it makes the same bang as one that hit
    // a wall, and it is the only bang for it, since this path relays no mark.
    room.broadcast("shot", { id: client.sessionId });
    room.broadcast("caught", { id: victimId, by: shooter.name, position: [x, y, z] });

    // The last one caught ends the round then and there.
    if (room.chameleonsLeft === 0) room.finish("hunters");
  });

  room.onMessage("clearSkin", (client: Client) => {
    const player = room.state.players.get(client.sessionId);
    if (!player) return;
    player.strokes.clear();
    room.broadcast("clearSkin", { id: client.sessionId }, { except: client });
  });

  // Marks are cosmetic and expire in three seconds, so they are simply relayed
  // and never stored. The bang is a separate broadcast: a mark is at the wall
  // the pellets hit, and a gunshot has to come from the gun.
  room.onMessage("shoot", (client: Client, msg: ShootMsg) => {
    if (!msg || !canFire(client.sessionId)) return;
    room.broadcast("mark", {
      id: randomUUID(),
      position: msg.position,
      rotation: msg.rotation,
      origin: msg.origin,
    });
    room.broadcast("shot", { id: client.sessionId });
  });

  // A whistle is only a position given away, so it is relayed like a shot:
  // everyone hears it, at whoever let it out. Chameleons only — the mirror of the
  // kill check below, which refuses anyone who is not a hunter.
  room.onMessage("whistle", (client: Client) => {
    const player = room.state.players.get(client.sessionId);
    if (!player || player.role !== "chameleon") return;
    const now = Date.now();
    if (now - (lastWhistle.get(client.sessionId) ?? 0) < MIN_WHISTLE_GAP_MS) return;
    lastWhistle.set(client.sessionId, now);
    room.broadcast("whistle", { id: client.sessionId });
  });

  return { forget };
}
