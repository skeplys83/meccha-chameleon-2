import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { matchMaker, Server } from "colyseus";
import { GameRoom } from "./room.ts";
import { createMonitor, monitorNotice, MONITOR_PATH } from "./monitor.ts";
import {
  getSessionName,
  lanAddress,
  peers,
  sessionId,
  startDiscovery,
} from "./discovery.ts";

/** The entry point: `npm run dev` and `npm start` both run this file. See trap 2. */

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const gamePort = Number(process.env.GAME_PORT ?? 2567);
const hostname = "0.0.0.0";

/** Vite's HMR websocket, in development only. */
const hmrPort = Number(process.env.HMR_PORT ?? 24678);

/** The Colyseus port to *advertise*, which is not always the one we listen on. */
const publicGamePort = Number(process.env.PUBLIC_GAME_PORT ?? gamePort);

/** UDP discovery only works between machines on the same network. */
if (process.env.LAN_DISCOVERY !== "0") startDiscovery({ port, gamePort });

/** Where `vite build` puts the client. Resolved from this file, not from cwd. */
const DIST = fileURLToPath(new URL("../../../dist", import.meta.url));

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/** Whatever serves the page itself — Vite in development, the built files in production. */
async function serveApp(): Promise<Handler> {
  if (dev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      // `spa` is what makes Vite serve and transform index.html itself, with a
      // fallback for any path — so this file needs no HTML handling of its own.
      appType: "spa",
      server: {
        middlewareMode: true,
        // Its own port. See the note on `hmrPort` above.
        hmr: { port: hmrPort },
        // The page is opened from other machines on the Wi-Fi, and Vite refuses
        // hosts it does not recognise. This is the replacement for Next's
        // `allowedDevOrigins`, and it is one line because Vite checks the Host
        // header rather than the origin of every asset request.
        allowedHosts: true,
      },
    });
    return (req, res) => vite.middlewares(req, res);
  }

  let index: Buffer;
  try {
    index = readFileSync(new URL("../../../dist/index.html", import.meta.url));
  } catch {
    console.error(`  no client build at ${DIST} — run \`npm run build\` first`);
    process.exit(1);
  }

  const files = express.static(DIST, { index: false, maxAge: "1h" }) as unknown as (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => void;
  return (req, res) =>
    files(req, res, () => {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "no-cache");
      res.end(index);
    });
}

const app = await serveApp();

/** The public games on this server. */
async function publicGames() {
  const [lobbies, matches] = await Promise.all([
    matchMaker.query({ name: "lobby", private: false }),
    matchMaker.query({ name: "match" }),
  ]);
  const inMatch = new Map(matches.map((m) => [m.roomId, m.clients]));

  return lobbies.map((room) => ({
    code: room.roomId,
    host: room.metadata?.host ?? "",
    map: room.metadata?.map ?? "",
    started: room.metadata?.started === true,
    starting: room.metadata?.starting === true,
    players: room.clients + (inMatch.get(room.metadata?.matchId) ?? 0),
    maxPlayers: room.metadata?.maxPlayers ?? room.maxClients,
  }));
}

/** Colyseus's admin panel, or `null` when it should not be reachable at all. */
const admin = createMonitor(dev);

const web = createServer((req, res) => {
  // The panel is express-based, so it is handed the request whole. It comes
  // first because the app is the fall-through and answers everything — Vite's
  // SPA middleware in development, an index.html fallback in production — so a
  // route mounted after it would never be reached.
  if (admin && req.url?.startsWith(MONITOR_PATH)) {
    admin(req, res);
    return;
  }

  // The only other route the custom server owns. Everything else is the app's.
  if (req.url === "/api/sessions") {
    res.setHeader("content-type", "application/json");
    void publicGames().then((games) => {
      res.end(
        JSON.stringify({
          self: { id: sessionId, name: getSessionName(), port, gamePort: publicGamePort },
          sessions: [...peers.values()].map(({ id, name, host, port, gamePort }) => ({
            id,
            name,
            host,
            port,
            gamePort,
          })),
          games,
        }),
      );
    });
    return;
  }
  app(req, res);
});

const gameServer = new Server();
// One class, two names. A lobby is the arena and can start a match; a match is
// the game proper on the chosen map. See `room.ts`.
gameServer.define("lobby", GameRoom);
gameServer.define("match", GameRoom);
await gameServer.listen(gamePort);

web.listen(port, hostname, () => {
  const lan = lanAddress();
  console.log(`  ${getSessionName()}`);
  console.log(`  ready   http://localhost:${port}`);
  if (lan) console.log(`  network http://${lan}:${port}`);
  console.log(`  game    colyseus on :${gamePort}`);
  if (dev) console.log(`  hmr     vite on :${hmrPort}`);
  if (publicGamePort !== gamePort) {
    console.log(`  public  clients are told :${publicGamePort}`);
  }
  const notice = monitorNotice(dev);
  if (notice) console.log(`  ${notice}`);
  if (process.env.LAN_DISCOVERY === "0") console.log("  discovery off");
});
