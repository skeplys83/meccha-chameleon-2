import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import express from "express";
import { monitor } from "@colyseus/monitor";

/**
 * Colyseus's own admin panel, mounted at `/colyseus`.
 *
 * It lists every live room with its client count and metadata, and lets you open
 * one and watch its state change in real time — which is the only way to see the
 * matchmaking from outside, since a lobby and its match are two rooms and a
 * player only ever sees the one they are standing in.
 *
 * ## Why it is off unless you ask for it
 *
 * The panel is not read-only. Its API exposes `matchMaker.remoteRoomCall`, which
 * invokes **any method on any room by name** — including `disconnect`, and
 * including this project's own `matchEnded`. Anyone who can reach it can end
 * anybody's game. On a LAN that is a shrug; on a hosted box it is a hole.
 *
 * So the rule is: **a password is what turns it on in production.**
 *
 * - development — on by default, no password, because the only person who can
 *   reach `localhost:3000` is you. `MONITOR=0` turns it off.
 * - production — off unless `MONITOR_PASSWORD` is set, and then behind HTTP
 *   Basic auth. There is deliberately no way to expose it unauthenticated on a
 *   public box; forgetting to set a password fails closed, with a line in the
 *   log saying why.
 *
 * Basic auth over plain http sends the password in a header in near-cleartext,
 * so this is worth having only behind the same TLS proxy that fronts everything
 * else. See "Hosting it" in the README.
 */

export const MONITOR_PATH = "/colyseus";

const user = process.env.MONITOR_USER || "admin";
const password = process.env.MONITOR_PASSWORD || "";

/** Constant-time, and length-safe: comparing different lengths would throw. */
function matches(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorised(header: string | undefined) {
  const [scheme, encoded] = (header ?? "").split(" ");
  if (scheme !== "Basic" || !encoded) return false;
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  // Only the *first* colon separates them: a password may contain one.
  const split = decoded.indexOf(":");
  if (split < 0) return false;
  return (
    matches(decoded.slice(0, split), user) && matches(decoded.slice(split + 1), password)
  );
}

/**
 * The panel as a plain request handler, or `null` if it should not exist.
 *
 * Returning `null` rather than an always-403 handler is deliberate: a route that
 * is not mounted cannot be probed, and `/colyseus` on a server without a
 * password should look exactly like any other unknown path.
 */
export function createMonitor(dev: boolean) {
  const wanted = dev ? process.env.MONITOR !== "0" : Boolean(password);
  if (!wanted) return null;

  const app = express();
  // Trust nothing about the URL beyond the mount point; express handles the rest.
  app.use(MONITOR_PATH, (req, res, next) => {
    // No password in development is the documented case, not an oversight.
    if (!password) return next();
    if (authorised(req.headers.authorization)) return next();
    res.setHeader("WWW-Authenticate", 'Basic realm="Meccha Chameleon"');
    res.status(401).send("Not authorised");
  });

  app.use(
    MONITOR_PATH,
    monitor({
      // The default columns plus this game's own metadata, which is what makes
      // the list readable: `host` and `map` are only ever set on a lobby, so a
      // row with them filled in is a waiting room and a row without is a match.
      columns: [
        "roomId",
        "name",
        "clients",
        { metadata: "host" },
        { metadata: "map" },
        { metadata: "started" },
        "elapsedTime",
      ],
    }),
  );

  return (req: IncomingMessage, res: ServerResponse) =>
    (app as unknown as (q: IncomingMessage, s: ServerResponse) => void)(req, res);
}

/** One line for the startup banner, or nothing if the panel is not mounted. */
export function monitorNotice(dev: boolean) {
  if (dev) {
    return process.env.MONITOR === "0" ? null : `monitor ${MONITOR_PATH} (no password, dev)`;
  }
  return password
    ? `monitor ${MONITOR_PATH} (basic auth as "${user}")`
    : `monitor off — set MONITOR_PASSWORD to enable it`;
}
