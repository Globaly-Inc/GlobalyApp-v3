import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Refuse framing everywhere EXCEPT the widget, so the portal, login and admin pages
  // cannot be clickjacked.
  //
  // The exclusion is the whole point. `X-Frame-Options` has no "allow any origin" value —
  // only DENY and SAMEORIGIN — so a blanket rule is not something the widget route can opt
  // out of afterwards: Next only overrides a header when a later rule sets the SAME key, and
  // a CSP `frame-ancestors *` on /embed is a different key, so both would be sent and the
  // browser would obey X-Frame-Options. Every institution's widget would go blank with no
  // error anywhere — 200 OK, empty iframe — so drop `(?!embed/)` and the feature dies
  // silently on other people's websites.
  //
  // /embed/* deliberately gets no framing headers at all, which is what makes it framable.
  async headers() {
    return [
      {
        source: "/((?!embed/).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
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
