/**
 * The brand marks (shipped in `public/brand/`) and the marketing mockups' stock imagery, served
 * from the public GCS bucket (`globalyapp-public-images`) rather than shipped in `frontend/public`.
 *
 * The bucket is where the imagery is maintained, so a repo copy is a second version of the truth that silently goes
 * stale. Referencing them here keeps one URL per asset instead of a path repeated across twenty
 * call sites; `next.config.ts` allows the host for next/image.
 *
 * The dimensions are the files' own, and next/image needs them for a remote src: they only fix
 * the aspect ratio, since every call site sizes the mark with `h-* w-auto`.
 */
const BUCKET = "https://storage.googleapis.com/globalyapp-public-images";

/**
 * GlobalyAI brand marks (2026-10-10), cut from the brand board as SVG and shipped in
 * `public/brand/`: SVG scales cleanly and next/image serves it as-is. The bucket's old
 * GlobalyAI PNGs are retired; the mail templates still need PNG copies uploaded there.
 * The dimensions only fix the aspect ratio, since call sites size the mark with `h-* w-auto`.
 */

/** The GlobalyAI wordmark, navy glyph and charcoal type — for light backgrounds. */
export const LOGO = {
  src: "/brand/globalyai-logo.svg",
  width: 610,
  height: 157,
} as const;
/** The same wordmark reversed to white — for navy, dark and photographic backgrounds. */
export const LOGO_WHITE = {
  src: "/brand/globalyai-logo-white.svg",
  width: 610,
  height: 157,
} as const;

/**
 * The square app mark: a navy rounded tile with a white glyph. It carries its own
 * background, so it holds up on `bg-card` in either theme. The favicon is the same file
 * at `src/app/icon.svg`; keep the two in step.
 */
export const ICON = {
  src: "/brand/globalyai-icon.svg",
  width: 283,
  height: 283,
} as const;

export const APP_ICON_ATTR = "data-app-icon";

/**
 * Raster copies for the places SVG doesn't work: social cards (1200x630) and the
 * schema.org logo, which crawlers want as PNG.
 */
export const OG_IMAGE = {
  src: "/brand/og-globalyai.png",
  width: 1200,
  height: 630,
} as const;
export const LOGO_PNG = "/brand/globalyai-logo.png";

const PHOTOS = `${BUCKET}/photos`;

/**
 * Crests and partner marks for the mockups' cards. Square, transparent PNG, 256×256 or larger —
 * the tiles render them `object-contain`, so a wide wordmark shrinks to unreadable.
 */
export const INSTITUTION_LOGOS = {
  asu: `${PHOTOS}/asu.png`,
  manchester: `${PHOTOS}/manchester.png`,
  melbourne: `${PHOTOS}/melbourne.png`,
  nus: `${PHOTOS}/nus.png`,
  toronto: `${PHOTOS}/toronto.png`,
} as const;

/** Agency marks for the partnerships mockup. All stand-in names, not real partners. */
export const PARTNER_LOGOS = {
  apex: `${PHOTOS}/apex.png`,
  northstar: `${PHOTOS}/360_F_506097171_1Kfn141Vfu4kPvblY1jH0oZYJrRT6V5e.jpg`,
  brightPath: `${PHOTOS}/3856014-5476.png`,
  mekong: `${PHOTOS}/MK-logo-design-vector-Graphics-17228864-1-1-580x386.jpg`,
  silverline: `${PHOTOS}/0e36b0cd37d1fdddb417a56724f1a6f0.jpg`,
} as const;

/** Counselor and student portraits for the same mockups. */
export const PEOPLE_PHOTOS = {
  danielOkoye: `${PHOTOS}/daniel-okoye.jpg`,
  priyaSharma: `${PHOTOS}/priya-sharma.jpg`,
  elenaMoreau: `${PHOTOS}/images%20(2).jpg`,
  sofiaAlmeida: `${PHOTOS}/images%20(1).jpg`,
} as const;

/**
 * Ask Aly's animated orb — the azure variant of the brand mark, used as the assistant's nav icon
 * and avatar. Square, 512×512 viewBox.
 *
 * The exception to this file's bucket rule: it is an SVG authored as code (vector, transparent,
 * ~6 KB, motion in an embedded `<style>` that honours `prefers-reduced-motion`), not a bitmap
 * maintained in the bucket, so it ships in `frontend/public` and is versioned with the repo.
 * It replaces the rose-crimson GIF at `${BUCKET}/ai/avatar/globaly-orb-rose-crimson-240.gif`.
 */
export const ALY_ORB = "/globaly-orb-azure.svg";
