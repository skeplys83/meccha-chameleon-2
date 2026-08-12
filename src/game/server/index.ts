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

/**
 * The entry point: `npm run dev` and `npm start` both run this file. Node strips
 * the types itself — there is no build step for the server.
 *
 * It is deliberately *two* servers, and now arguably three. This HTTP server
 * carries the page and `/api/sessions`; Colyseus listens on its own port; and in
 * development Vite's HMR websocket gets a port of its own as well. Handing a
 * WebSocket server this server's `upgrade` event destroys every non-matching
 * upgrade — which is how HMR died once already, taking the client bootstrap and
 * every button on the page with it. See trap 2 in `docs/TRAPS.md`. Nothing
 * here touches `upgrade`, and that is the whole reason the ports are separate.
 */

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const gamePort = Number(process.env.GAME_PORT ?? 2567);
const hostname = "0.0.0.0";

/**
 * Vite's HMR websocket, in development only.
 *
 * It gets its own port for exactly the reason Colyseus has one: the alternative
 * is handing Vite this server's `upgrade` event. Guests on the network need to reach
 * it as well as the page, so it binds the same wildcard address.
 */
const hmrPort = Number(process.env.HMR_PORT ?? 24678);

/**
 * The Colyseus port to *advertise*, which is not always the one we listen on.
 *
 * Served directly they are the same and this is a no-op. Behind a reverse proxy they
 * are not: the proxy terminates TLS on 443 and forwards to 2567, so clients must
 * be told 443 while the server still binds 2567. Without this the browser is
 * handed an internal port it cannot reach — and on an HTTPS page it would be
 * refused anyway, since a `wss://` page cannot open a plain `ws://` socket.
 */
const publicGamePort = Number(process.env.PUBLIC_GAME_PORT ?? gamePort);

/**
 * UDP discovery only works between machines on the same network. On a hosted server
 * there are no peers to shout at, so it is off unless asked for. `/api/sessions`
 * still answers with `self`, which is the entry the menu actually joins.
 */
if (process.env.LAN_DISCOVERY !== "0") startDiscovery({ port, gamePort });

/** Where `vite build` puts the client. Resolved from this file, not from cwd. */
const DIST = fileURLToPath(new URL("../../../dist", import.meta.url));

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * Whatever serves the page itself — Vite in development, the built files in
 * production. Everything the custom server owns is checked before this; it is
 * the fall-through, the slot Next's request handler used to occupy.
 *
 * Vite is imported dynamically so it stays a devDependency: a production image
 * installs `--omit=dev` and must never reach for it.
 */
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

  // Vite fingerprints every asset filename, so the only file that must not be
  // cached is the one that names them.
  //
  // Cast for the same reason `monitor.ts` casts: express types its middleware
  // against its own Request/Response, but the implementation is plain connect
  // and reads nothing this server does not already have.
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

/**
 * The public games on this server.
 *
 * There is no room-list route in Colyseus 0.16 — its HTTP matchmaking endpoint
 * exposes only the join methods, and the browser client has no
 * `getAvailableRooms` — so the listing is served here, from the process that
 * holds the room directory. `matchMaker.query` *is* that directory.
 *
 * Only public lobbies appear. A lobby created with the box unticked is
 * `setPrivate`, which hides it from this query while leaving its code working,
 * and a match is always private because it is reached by being moved into it.
 *
 * **A game's population is both of its rooms.** Once a match starts, the people
 * playing are no longer in the lobby, and a count that ignored them would show a
 * busy game as empty. The lobby publishes its match's id in metadata; the
 * players are added back here.
 */
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
    players: room.clients + (inMatch.get(room.metadata?.matchId) ?? 0),
    maxPlayers: room.metadata?.maxPlayers ?? room.maxClients,
  }));
}

/**
 * Colyseus's admin panel, or `null` when it should not be reachable at all.
 *
 * Built before the HTTP server so the route below is a plain null check rather
 * than a per-request decision — and so the banner can say what happened.
 */
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
