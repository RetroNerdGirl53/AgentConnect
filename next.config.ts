import type { NextConfig } from "next";
import { serverConfig } from "./src/lib/serverConfig";

const nextConfig: NextConfig = {
  // Allow the dev server's internal assets (HMR, /_next/*) to be requested
  // cross-machine. Derived from whisper.config.json (the bound host).
  allowedDevOrigins: serverConfig.allowedDevOrigins,
};

export default nextConfig;
