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
        // Scoped to the site's own prefix: the bucket is shared, and a
        // wider pattern would let the optimizer spend egress on any image
        // in it that someone happened to point a URL at.
        pathname: "/globalyapp-public-images/website/**",
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
