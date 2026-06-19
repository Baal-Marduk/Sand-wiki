import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Self-hosting: emit a self-contained `.next/standalone` server (server.js +
  // only the traced node_modules) so the Docker runtime needs no `npm install`.
  output: "standalone",
  // We live in an npm-workspaces monorepo. By default tracing roots at apps/wiki
  // and drops the workspace dep `@sandlabs/data` (and hoisted root node_modules).
  // Point the trace root at the repo root so they're included in standalone.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // Allow the dev server to be reached through an ngrok tunnel. Next blocks
  // cross-origin access to dev assets by default, which silently breaks client
  // hydration/HMR when the app is opened via the tunnel hostname (the page
  // renders but no client JS runs). Dev-only; ignored in production builds.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.io"],
  async headers() {
    // Game sprite icons are stable per filename — cache hard so repeat visitors
    // (and the Vercel edge) never re-download them. If an icon's *content* ever
    // changes, rename the file to bust the cache.
    const immutable = [
      { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
    ];
    return [
      { source: "/icons/:path*", headers: immutable },
      { source: "/tramplers/:path*", headers: immutable },
      {
        // Baseline security headers on every response.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
  transpilePackages: ["@sandlabs/data"],
};

export default nextConfig;
