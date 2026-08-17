import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // The AI counsellor lives at /personal/ai, but the public navbar, the landing search bar and the
  // admin shell all link to the shorter /ai. One redirect fixes every caller (and bookmarks) instead
  // of three hrefs. Query values are passed through, so the search bar's ?q= survives.
  async redirects() {
    return [{ source: "/ai", destination: "/personal/ai", permanent: false }];
  },
};

export default nextConfig;
