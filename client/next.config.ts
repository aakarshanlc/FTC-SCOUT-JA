import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The API lives in ../server (linked as the "ftc-scout-server" package) and is
  // served from pages/api. Trace files from the repo root so the deployment
  // includes it, and leave Node-only libraries unbundled.
  outputFileTracingRoot: path.join(__dirname, ".."),
  serverExternalPackages: ["ftc-scout-server", "mongoose", "express", "cors", "morgan", "papaparse", "nodemailer"],
  async rewrites() {
    return [{ source: "/events.ics", destination: "/api/events.ics" }];
  },
  turbopack: {
    root: path.join(__dirname, ".."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
