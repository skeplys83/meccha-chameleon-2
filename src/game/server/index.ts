import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { matchMaker, Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./room.ts";
import { createMonitor, MONITOR_PATH, monitorNotice } from "./monitor.ts";
import { getSessionName, lanAddress, sessionId } from "./session.ts";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const gamePort = Number(process.env.GAME_PORT ?? (dev ? 2567 : port));
const hmrPort = Number(process.env.HMR_PORT ?? 24678);
const publicGamePort = Number(process.env.PUBLIC_GAME_PORT ?? gamePort);
const singlePort = gamePort === port;
const hostname = "0.0.0.0";

const DIST = fileURLToPath(new URL("../../../dist", import.meta.url));
const INDEX_HTML = fileURLToPath(new URL("../../../dist/index.html", import.meta.url));

const app = express();

const admin = createMonitor(dev);
if (admin) app.use(MONITOR_PATH, admin);

app.get("/api/sessions", async (_req, res, next) => {
  try {
    const [lobbies, matches] = await Promise.all([
      matchMaker.query({ name: "lobby", private: false }),
      matchMaker.query({ name: "match" }),
    ]);
    const inMatch = new Map(matches.map((m) => [m.roomId, m.clients]));
    const games = lobbies.map((room) => ({
      code: room.roomId,
      host: room.metadata?.host ?? "",
      map: room.metadata?.map ?? "",
      started: room.metadata?.started === true,
      starting: room.metadata?.starting === true,
      players: room.clients + (inMatch.get(room.metadata?.matchId) ?? 0),
      maxPlayers: room.metadata?.maxPlayers ?? room.maxClients,
    }));

    res.json({
      self: { id: sessionId, name: getSessionName(), port, gamePort: publicGamePort },
      games,
    });
  } catch (err) {
    next(err);
  }
});

if (dev) {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    appType: "spa",
    server: {
      middlewareMode: true,
      hmr: { port: hmrPort },
      allowedHosts: true,
    },
  });
  app.use(vite.middlewares);
} else {
  if (!existsSync(INDEX_HTML)) {
    console.error(`  no client build at ${DIST} — run \`npm run build\` first`);
    process.exit(1);
  }
  app.use(express.static(DIST, { index: false, maxAge: "1h" }));
  app.use((_req, res) => {
    res.setHeader("cache-control", "no-cache");
    res.sendFile(INDEX_HTML);
  });
}

const web = createServer(app);
const gameServer = new Server(
  singlePort ? { transport: new WebSocketTransport({ server: web }) } : undefined,
);

gameServer.define("lobby", GameRoom);
gameServer.define("match", GameRoom);

const printBanner = () => {
  const lan = lanAddress();
  console.log(`  ${getSessionName()}`);
  console.log(`  ready   http://localhost:${port}`);
  if (lan) console.log(`  network http://${lan}:${port}`);
  console.log(`  game    colyseus on :${singlePort ? port + " (shared)" : gamePort}`);
  if (publicGamePort !== (singlePort ? port : gamePort)) {
    console.log(`  public  clients are told :${publicGamePort}`);
  }
  const notice = monitorNotice(dev);
  if (notice) console.log(`  ${notice}`);
};

if (singlePort) {
  await gameServer.listen(port, hostname);
  printBanner();
} else {
  await gameServer.listen(gamePort);
  web.listen(port, hostname, printBanner);
}
