/**
 * The motion assets on the site, and where they are served from. Photography
 * lives with the components that show it, as plain /imagery paths.
 *
 * The motion assets are the heaviest thing on the site and they never change
 * between deploys, so they live in the public GCS bucket rather than in
 * /public: the repo stays free of a megabyte of binaries and the bucket's
 * caching does the work. Moving the bucket is one edit here.
 *
 * next/image is handed these URLs for the posters, so the hostname has to
 * stay in `images.remotePatterns` in next.config.ts.
 */
const MOTION_CDN = "https://storage.googleapis.com/globalyapp-public-images/website";

export const MOTION = {
  /**
   * Variation 6's two auroras, one per theme.
   *
   * A single clip cannot serve both: pastel blobs on white vanish on a
   * near-black page, and a glowing blob on black is a grey smear on a white
   * one. So there are two, the page swaps them when the theme changes, and
   * both are ten second palindromes.
   */
  auroraLight: {
    brief:
      "Soft pale blue, lavender and aqua blobs drifting on white. Heavy blur, no hard edges, no objects.",
    width: 1280,
    height: 720,
    src: `${MOTION_CDN}/v6-aurora-light.mp4`,
    poster: `${MOTION_CDN}/v6-aurora-light-poster.webp`,
  },
  auroraDark: {
    brief:
      "One slow liquid mass of blue and cyan on near-black, morphing without ever resolving into an object.",
    width: 1280,
    height: 720,
    src: `${MOTION_CDN}/v6-aurora-dark.mp4`,
    poster: `${MOTION_CDN}/v6-aurora-dark-poster.webp`,
  },
} as const;
