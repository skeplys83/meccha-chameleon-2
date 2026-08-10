import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Every address this machine can be reached on over the LAN.
 *
 * Read at startup rather than written down, because the address is handed out by
 * DHCP and changes when the router feels like it — a hardcoded one works until
 * the day it silently does not.
 */
const lanAddresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i!.address);

const nextConfig: NextConfig = {
  // react-three-fiber's Canvas does not survive StrictMode's dev-only double
  // mount: the discarded mount calls forceContextLoss() and blanks the canvas.
  reactStrictMode: false,

  /**
   * Who may load the dev server's internals.
   *
   * Next blocks cross-origin requests to `/_next/*` in development, which
   * includes the HMR socket — and this game is *meant* to be opened from other
   * machines on the Wi-Fi, so without this every guest gets a dead page.
   *
   * Next matches these right-to-left with `*` standing for one label, so an
   * octet-wise wildcard covers a whole private range. The two common ones are
   * listed outright, this machine's real addresses are added at startup for
   * anything else (172.16–31, a wired subnet), and `*.local` covers guests who
   * type the mDNS name instead of the number.
   *
   * It must live *inside* this object. A second `module.exports` beside the ESM
   * `export default` is dead code — Next reads the default export and never sees
   * it, so the setting silently does nothing.
   */
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.local", ...lanAddresses()],
};

export default nextConfig;
