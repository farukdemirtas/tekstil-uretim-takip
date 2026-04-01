import type { NextConfig } from "next";
import path from "path";

/** `npm run dev` / `build` çalıştırılan klasör `frontend` olmalı (çift lockfile için üst dizin kök). */
const monorepoRoot = path.resolve(process.cwd(), "..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: monorepoRoot,
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const backend = process.env.BACKEND_DEV_URL ?? "http://127.0.0.1:4000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
