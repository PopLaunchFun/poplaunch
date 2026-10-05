import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@pop/math", "@pop/sdk", "@pop/simulator"],
  env: {
    NEXT_PUBLIC_GIT_COMMIT: process.env.NEXT_PUBLIC_GIT_COMMIT ?? process.env.GIT_COMMIT ?? "dev",
  },
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, os: false, crypto: false };
    return config;
  },
};

export default nextConfig;
