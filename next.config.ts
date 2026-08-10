import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // react-three-fiber's Canvas does not survive StrictMode's dev-only double
  // mount: the discarded mount calls forceContextLoss() and blanks the canvas.
  reactStrictMode: false,

  // Other machines on the Wi-Fi open the dev server by LAN address, and Next
  // blocks cross-origin dev requests unless the origin is listed. Add each host
  // you actually play from.
  //
  // This has to live *inside* `nextConfig`: a second `module.exports` alongside
  // the ESM `export default` is dead code — Next reads the default export and
  // never sees it, so the setting silently does nothing.
  allowedDevOrigins: ["192.168.2.188"],
};

export default nextConfig;
