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
const BUCKET = "https://storage.googleapis.com/globalyapp-public-images/photos";

export const LOGO = { src: `${BUCKET}/globaly-logo.png`, width: 753, height: 157 } as const;
export const LOGO_WHITE = { src: `${BUCKET}/globaly-logo-white.png`, width: 776, height: 188 } as const;

/** Institution crests (250×250) used by the public marketing mockups. */
export const INSTITUTION_LOGOS = {
  asu: `${BUCKET}/asu.png`,
  manchester: `${BUCKET}/manchester.png`,
  melbourne: `${BUCKET}/melbourne.png`,
  nus: `${BUCKET}/nus.png`,
  toronto: `${BUCKET}/toronto.png`,
} as const;

/** Counselor portraits for the same mockups. */
export const PEOPLE_PHOTOS = {
  danielOkoye: `${BUCKET}/daniel-okoye.jpg`,
  priyaSharma: `${BUCKET}/priya-sharma.jpg`,
} as const;
