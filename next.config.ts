import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // react-three-fiber's Canvas does not survive StrictMode's dev-only double
  // mount: the discarded mount calls forceContextLoss() and blanks the canvas.
  reactStrictMode: false,
};

export default nextConfig;
