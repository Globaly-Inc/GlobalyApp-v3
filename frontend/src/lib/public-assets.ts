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

/** The full GlobalyApp wordmark in navy — for light backgrounds. */
export const LOGO = {
  src: `${BUCKET}/logos/GlobalyApp%20Main%20Full%20Logo%20(2).png`,
  width: 737,
  height: 157,
} as const;
/** The same wordmark reversed to white — for navy and photographic backgrounds. */
export const LOGO_WHITE = {
  src: `${BUCKET}/logos/GlobalyApp%20Main%20Full%20Logo%20White%20(1).png`,
  width: 737,
  height: 157,
} as const;

/**
 * The square app mark: a navy rounded tile with a white glyph, replacing the red tile the
 * portal headers used. It carries its own background, so it holds up on `bg-card` in either
 * theme without needing a per-theme swap.
 *
 * The inverse cut (white tile, navy glyph) is the browser favicon and ships at
 * `src/app/icon.png` instead of here — Next's app-dir icon convention only reads a real
 * file, so a bucket URL cannot serve it.
 */
export const ICON = {
  src: `${BUCKET}/logos/GlobalyOS%20White%20BG%20Icon.png`,
  width: 283,
  height: 283,
} as const;

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

/** Ask Aly's animated orb, used as the assistant's nav icon and avatar. Square, 240×240. */
export const ALY_ORB = `${BUCKET}/ai/avatar/globaly-orb-rose-crimson-240.gif`;
