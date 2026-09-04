/**
 * Brand marks and the marketing mockups' stock imagery, served from the public GCS bucket
 * (`globalyapp-public-images`) rather than shipped in `frontend/public`.
 *
 * The bucket is where these files are maintained — the same one the transactional mail templates
 * already pull the logo from — so a repo copy is a second version of the truth that silently goes
 * stale. Referencing them here keeps one URL per asset instead of a path repeated across twenty
 * call sites; `next.config.ts` allows the host for next/image.
 *
 * The dimensions are the files' own, and next/image needs them for a remote src: they only fix
 * the aspect ratio, since every call site sizes the mark with `h-* w-auto`.
 */
const BUCKET = "https://storage.googleapis.com/globalyapp-public-images";

/** The brand marks sit under `logos/`; everything else under `photos/`. */
export const LOGO = { src: `${BUCKET}/logos/globaly-logo.png`, width: 753, height: 157 } as const;
export const LOGO_WHITE = { src: `${BUCKET}/logos/globaly-logo-white.png`, width: 776, height: 188 } as const;

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

/** The agency shown on the partnerships mockup. Apex is a stand-in name, not a real partner. */
export const PARTNER_LOGOS = {
  apex: `${PHOTOS}/apex.png`,
} as const;

/** Counselor portraits for the same mockups. */
export const PEOPLE_PHOTOS = {
  danielOkoye: `${PHOTOS}/daniel-okoye.jpg`,
  priyaSharma: `${PHOTOS}/priya-sharma.jpg`,
} as const;
