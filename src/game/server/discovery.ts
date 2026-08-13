import { randomUUID } from "node:crypto";
import { networkInterfaces, userInfo } from "node:os";
import dgram from "node:dgram";

/** Same-network discovery. */

const DISCOVERY_PORT = 41234;
const ANNOUNCE_MS = 1000;
const PEER_TTL_MS = 4000;

export type Peer = {
  id: string;
  name: string;
  host: string;
  port: number;
  gamePort: number;
  seen: number;
};

export const sessionId = randomUUID();

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

let sessionName =
  process.env.SESSION_NAME ?? `${capitalize(userInfo().username)}'s Session`;

export const getSessionName = () => sessionName;

export function setSessionName(name: string) {
  sessionName = `${capitalize(name)}'s Session`;
}

/** Every other server on this network, id → session, pruned on the announce tick. */
export const peers = new Map<string, Peer>();

/** The .255 address of every real IPv4 interface — a broadcast has to be aimed. */
const broadcastAddresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal && i.netmask)
    .map((i) => {
      const addr = i!.address.split(".").map(Number);
      const mask = i!.netmask.split(".").map(Number);
      return addr.map((o, k) => (o & mask[k]) | (~mask[k] & 255)).join(".");
    });

/** This machine's first non-loopback IPv4, for the network URL in the banner. */
export const lanAddress = () =>
  Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal)?.address ?? null;

export function startDiscovery({ port, gamePort }: { port: number; gamePort: number }) {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

  socket.on("message", (buf, rinfo) => {
    let msg: { t?: string; id?: string; name?: string; port?: number; gamePort?: number };
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (msg.t !== "mc-session" || !msg.id || msg.id === sessionId) return;
    peers.set(msg.id, {
      id: msg.id,
      name: String(msg.name ?? "session").slice(0, 40),
      // The sender's own idea of its address would be wrong behind any NAT; the
      // packet's source address is the one that actually works.
      host: rinfo.address,
      port: Number(msg.port) || 3000,
      gamePort: Number(msg.gamePort) || 2567,
      seen: Date.now(),
    });
  });

  // Discovery is a nicety — a failed bind must not take the game down with it.
  socket.on("error", (err: Error) => {
    console.warn("  discovery disabled:", err.message);
  });

  socket.bind(DISCOVERY_PORT, () => {
    socket.setBroadcast(true);
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
        socket.send(payload, DISCOVERY_PORT, addr, () => {});
      }
      for (const [id, p] of peers) {
        if (Date.now() - p.seen > PEER_TTL_MS) peers.delete(id);
      }
    }, ANNOUNCE_MS);
  });

  return socket;
}
