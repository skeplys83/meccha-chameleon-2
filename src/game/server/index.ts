import { createServer } from "node:http";
import next from "next";
import { Server } from "colyseus";
import { GameRoom } from "./room.ts";
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

const web = createServer((req, res) => {
  // The only route the custom server owns. Everything else is Next's.
  if (req.url === "/api/sessions") {
    res.setHeader("content-type", "application/json");
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
  const lan = lanAddress();
  console.log(`  ${getSessionName()}`);
  console.log(`  ready   http://localhost:${port}`);
  if (lan) console.log(`  LAN     http://${lan}:${port}`);
  console.log(`  game    colyseus on :${gamePort}`);
  if (publicGamePort !== gamePort) {
    console.log(`  public  clients are told :${publicGamePort}`);
  }
  if (process.env.LAN_DISCOVERY === "0") console.log("  discovery off");
});
