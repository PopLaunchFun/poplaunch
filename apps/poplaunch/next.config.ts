import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  transpilePackages: ["@pop/sdk"],
  env: {
    // Stage 1 ships demo fixtures by default. Set NEXT_PUBLIC_DEMO=0 for any build that must show no example launches.
    NEXT_PUBLIC_DEMO: process.env.NEXT_PUBLIC_DEMO ?? "1",
  },
};

export default nextConfig;
