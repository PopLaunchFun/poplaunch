import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@pop/math", "@pop/sdk", "@pop/simulator"],
  turbopack: {},
  env: {
    NEXT_PUBLIC_GIT_COMMIT: process.env.NEXT_PUBLIC_GIT_COMMIT ?? process.env.GIT_COMMIT ?? "dev",
  },
  async redirects() {
    return [
      { source: "/pop", destination: "/", permanent: false },
      { source: "/markets", destination: "/", permanent: false },
      { source: "/market/:mint", destination: "/coin/:mint", permanent: false },
    ];
  },
};

export default nextConfig;
