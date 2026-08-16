import { timingSafeEqual } from "node:crypto";
import express from "express";
import { monitor } from "@colyseus/monitor";

/** Colyseus's own admin panel, mounted at `/monitor`. */

export const MONITOR_PATH = "/monitor";

const user = process.env.MONITOR_USER || "admin";
const password = process.env.MONITOR_PASSWORD ?? "";

/** Constant-time, and length-safe: comparing different lengths would throw. */
function matches(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorised(header: string | undefined) {
  if (!password) return false;
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

/** The panel router, or `null` if it should not exist. */
export function createMonitor(dev: boolean) {
  const wanted = dev ? process.env.MONITOR !== "0" : Boolean(password);
  if (!wanted) return null;

  const router = express.Router();
  router.use((req, res, next) => {
    // No password in development is the documented case, not an oversight.
    if (dev && !password) return next();
    if (authorised(req.headers.authorization)) return next();
    res.setHeader("WWW-Authenticate", 'Basic realm="Super Chameleon"');
    res.status(401).send("Not authorised");
  });

  router.use(
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

  return router;
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
