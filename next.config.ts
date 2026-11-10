import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false, // the dev badge must never cover the mobile navigation
};

export default nextConfig;
