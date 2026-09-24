import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    // Placeholder photography on /variation5 only, pending real campus
    // photography. Drop this entry once the real assets land in /public.
    remotePatterns: [{ protocol: "https", hostname: "picsum.photos" }],
  },
  // The marketing site is never meant to be framed by anyone.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
