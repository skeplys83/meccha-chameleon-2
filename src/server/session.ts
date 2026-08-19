import { randomUUID } from "node:crypto";
import { networkInterfaces, userInfo } from "node:os";

export const sessionId = randomUUID();

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

let sessionName =
  process.env.SESSION_NAME ?? `${capitalize(userInfo().username)}'s Session`;

export const getSessionName = () => sessionName;

export function setSessionName(name: string) {
  sessionName = `${capitalize(name)}'s Session`;
}

/** This machine's first non-loopback IPv4 address for the network banner. */
export const lanAddress = () =>
  Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal)?.address ?? null;
