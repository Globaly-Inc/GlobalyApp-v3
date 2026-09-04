import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    // The brand marks and mockup imagery live in the public GCS bucket (see lib/public-assets.ts).
    // next/image refuses a remote src whose host isn't listed here.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/globalyapp-public-images/**",
      },
    ],
  },
};

export default nextConfig;
