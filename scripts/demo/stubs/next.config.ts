// DEMO STAND-IN for next.config.ts (copied over it by scripts/demo/run.sh):
// no standalone output, which `next start` doesn't serve, and no dev-mode
// indicator in screenshots.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  devIndicators: false,
};

export default nextConfig;
