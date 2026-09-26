import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    // Driver headshots returned by OpenF1's /drivers endpoint.
    remotePatterns: [{ protocol: "https", hostname: "media.formula1.com" }],
  },
};

export default nextConfig;
