import type { NextConfig } from "next";

// V1 URLs that are indexed and linked from outside the app. Each one has a V3
// equivalent under a different path, so they redirect rather than 404. Permanent
// (308) because these are settled renames, not experiments — the exception is /ai,
// which is an internal shorthand we may still move.
const V1_LEGACY_REDIRECTS = [
  // V1's search sub-paths were themselves redirects to ?tab= on the same page.
  { source: "/search/courses", destination: "/search?tab=courses" },
  { source: "/search/institutions", destination: "/search?tab=institutions" },
  { source: "/search/agents", destination: "/search?tab=education-agencies" },
  { source: "/search/scholarships", destination: "/scholarships" },
  { source: "/search/services", destination: "/services" },
  { source: "/jobs", destination: "/search?tab=jobs" },
  // V1 served the same institution profile at both /institutions/{slug} and
  // /institution/{slug}, and agents at /agent/{slug}. V3 canonicalises on the
  // plural forms (which is what the backend's PUBLIC_PATHS and the sitemap emit).
  { source: "/institution/:slug", destination: "/institutions/:slug" },
  { source: "/agent/:slug", destination: "/agents/:slug" },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // The AI counsellor lives at /personal/ai, but the public navbar, the landing search bar and the
  // admin shell all link to the shorter /ai. One redirect fixes every caller (and bookmarks) instead
  // of three hrefs. Query values are passed through, so the search bar's ?q= survives.
  async redirects() {
    return [
      { source: "/ai", destination: "/personal/ai", permanent: false },
      ...V1_LEGACY_REDIRECTS.map((r) => ({ ...r, permanent: true })),
    ];
  },
};

export default nextConfig;
