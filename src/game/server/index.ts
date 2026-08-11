import { createServer } from "node:http";
import next from "next";
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
 * It is deliberately *two* servers. Next keeps its own HTTP server, including
 * its dev HMR websocket upgrades; Colyseus listens on its own port. Handing a
 * WebSocket server the HTTP server's `upgrade` event destroys every non-matching
 * upgrade, which kills HMR, which stops the client bootstrap, which means React
 * never hydrates and no button on the page works. See the root CLAUDE.md.
 */

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const gamePort = Number(process.env.GAME_PORT ?? 2567);
const hostname = "0.0.0.0";

/**
 * The Colyseus port to *advertise*, which is not always the one we listen on.
 *
 * On a LAN they are the same and this is a no-op. Behind a reverse proxy they
 * are not: the proxy terminates TLS on 443 and forwards to 2567, so clients must
 * be told 443 while the server still binds 2567. Without this the browser is
 * handed an internal port it cannot reach — and on an HTTPS page it would be
 * refused anyway, since a `wss://` page cannot open a plain `ws://` socket.
 */
const publicGamePort = Number(process.env.PUBLIC_GAME_PORT ?? gamePort);

/**
 * UDP discovery is a LAN feature and only a LAN feature. On a hosted server
 * there are no peers to shout at, so it is off unless asked for. `/api/sessions`
 * still answers with `self`, which is the entry the menu actually joins.
 */
if (process.env.LAN_DISCOVERY !== "0") startDiscovery({ port, gamePort });

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

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
  // first because Next would otherwise answer `/colyseus` with a 404 page.
  if (admin && req.url?.startsWith(MONITOR_PATH)) {
    admin(req, res);
    return;
  }

  // The only other route the custom server owns. Everything else is Next's.
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
  handle(req, res);
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
  if (lan) console.log(`  LAN     http://${lan}:${port}`);
  console.log(`  game    colyseus on :${gamePort}`);
  if (publicGamePort !== gamePort) {
    console.log(`  public  clients are told :${publicGamePort}`);
  }
  const notice = monitorNotice(dev);
  if (notice) console.log(`  ${notice}`);
  if (process.env.LAN_DISCOVERY === "0") console.log("  discovery off");
});
