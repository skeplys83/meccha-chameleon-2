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

startDiscovery({ port, gamePort });

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

const web = createServer((req, res) => {
  // The only route the custom server owns. Everything else is Next's.
  if (req.url === "/api/sessions") {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        self: { id: sessionId, name: getSessionName(), port, gamePort },
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
});
