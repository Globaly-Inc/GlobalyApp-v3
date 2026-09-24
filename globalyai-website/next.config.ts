import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    // The motion posters are served from the public GCS bucket — see
    // MOTION_CDN in src/lib/imagery.ts. next/image refuses a remote host that
    // is not listed here, so the two move together.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/globalyapp-public-images/**",
      },
    ],
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
