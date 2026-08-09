import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { networkInterfaces, userInfo } from "node:os";
import dgram from "node:dgram";
import next from "next";
import { Server, Room } from "colyseus";
import { Schema, MapSchema, ArraySchema, defineTypes } from "@colyseus/schema";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const gamePort = Number(process.env.GAME_PORT ?? 2567);
const hostname = "0.0.0.0";

// Half-extent players are clamped to; mirrors ROOM_HALF (20) in Room.tsx. It is
// a cheat bound, not a wall — a hider pressed into a corner sits legitimately at
// ~19.7, and clamping that to 19 would have shown everyone else a hider floating
// a metre off the wall they were trying to hide against.
const ROOM_LIMIT = 19.9;
const PATCH_MS = 50; // 20 Hz state patches
const POSE_COUNT = 5; // mirrors POSES in src/components/game/poses.ts
const MAX_STROKES = 800; // per player; mirrors MAX_STROKES in src/lib/skin.ts
const MAX_STROKE_LENGTH = 40;
const MAX_GRAVES = 200;

const DISCOVERY_PORT = 41234;
const ANNOUNCE_MS = 1000;
const PEER_TTL_MS = 4000;

const sessionId = randomUUID();
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
let sessionName =
  process.env.SESSION_NAME ?? `${capitalize(userInfo().username)}'s Session`;

const clamp = (n, lo, hi) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0);

// ------------------------------------------------------------------- schema

class Player extends Schema {
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
  yaw: "number",
  pitch: "number",
  pose: "number",
  strokes: ["string"],
});

class GameState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    // Death markers live in state, not in a broadcast: they are permanent, so
    // someone joining an hour later still has to see every one of them.
    this.graves = new ArraySchema();
  }
}
defineTypes(GameState, { players: { map: Player }, graves: ["string"] });

class GameRoom extends Room {
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

    // Marks are cosmetic, so they are simply relayed to everyone.
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
      sessionName = `${capitalize(player.name)}'s Session`;
    }
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
  }
}

// ---------------------------------------------------------------- discovery

/** @type {Map<string, {id:string,name:string,host:string,port:number,gamePort:number,seen:number}>} */
const peers = new Map();

const broadcastAddresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal && i.netmask)
    .map((i) => {
      const addr = i.address.split(".").map(Number);
      const mask = i.netmask.split(".").map(Number);
      return addr.map((o, k) => (o & mask[k]) | (~mask[k] & 255)).join(".");
    });

const discovery = dgram.createSocket({ type: "udp4", reuseAddr: true });

discovery.on("message", (buf, rinfo) => {
  let msg;
  try {
    msg = JSON.parse(buf.toString());
  } catch {
    return;
  }
  if (msg.t !== "mc-session" || msg.id === sessionId) return;
  peers.set(msg.id, {
    id: msg.id,
    name: String(msg.name ?? "session").slice(0, 40),
    host: rinfo.address,
    port: Number(msg.port) || 3000,
    gamePort: Number(msg.gamePort) || 2567,
    seen: Date.now(),
  });
});

discovery.on("error", (err) => {
  console.warn("  discovery disabled:", err.message);
});

discovery.bind(DISCOVERY_PORT, () => {
  discovery.setBroadcast(true);
  setInterval(() => {
    const payload = Buffer.from(
      JSON.stringify({
        t: "mc-session",
        id: sessionId,
        name: sessionName,
        port,
        gamePort,
      }),
    );
    for (const addr of broadcastAddresses()) {
      discovery.send(payload, DISCOVERY_PORT, addr, () => {});
    }
    for (const [id, p] of peers) {
      if (Date.now() - p.seen > PEER_TTL_MS) peers.delete(id);
    }
  }, ANNOUNCE_MS);
});

// ------------------------------------------------------------------ servers

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

// Next keeps its own HTTP server untouched, including its dev HMR upgrades.
// Colyseus listens separately, so nothing competes for the upgrade event.
const web = createServer((req, res) => {
  if (req.url === "/api/sessions") {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        self: { id: sessionId, name: sessionName, port, gamePort },
        sessions: [...peers.values()].map(({ id, name, host, port, gamePort }) => ({
          id,
          name,
          host,
          port,
          gamePort,
        })),
      }),
    );
    return;
  }
  handle(req, res);
});

const gameServer = new Server();
gameServer.define("game", GameRoom);
await gameServer.listen(gamePort);

web.listen(port, hostname, () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal);
  console.log(`  ${sessionName}`);
  console.log(`  ready   http://localhost:${port}`);
  if (lan) console.log(`  LAN     http://${lan.address}:${port}`);
  console.log(`  game    colyseus on :${gamePort}`);
});
