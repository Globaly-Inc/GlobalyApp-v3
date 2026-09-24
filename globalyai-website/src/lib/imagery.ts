/**
 * The photography slots on the site, in one place.
 *
 * Two pages want pictures, so the slots live here rather than inline in a
 * component: what each one has to show, the size the layout is built around,
 * and the file it points at. There are no placeholders left — the picsum
 * seeds and the remotePatterns entry that allowed them are both gone.
 *
 * Every frame was generated with Higgsfield (Cinema Studio Image 2.5) to the
 * briefs below, trimmed, and re-encoded to webp at the width the layout
 * actually uses. They are generic architecture rather than any real campus,
 * which is the point: nothing here should read as a customer's building until
 * a customer gives us one. Swapping in real photography is one edit — drop the
 * asset in /public/imagery and change `src`.
 *
 * `brief` is written for whoever commissions or generates the picture, and is
 * deliberately specific about the treatment: the variation 3 frames sit on a
 * near-black ground at around a quarter opacity, so a busy or high-key frame
 * turns to mud. What survives that is one clear subject, a strong
 * architectural line, and a dark sky. Say "night" and mean it — two frames
 * came back as bright overcast daytime elevations from briefs that said "late
 * in the day", and both had to be thrown away.
 *
 * The variation 3 set was then re-graded, in place and without moving the
 * camera, so its only light source is the page's own aqua rather than the
 * warm amber the generator reaches for by default. That is also why those
 * three are no longer displayed in greyscale: the tint is the point. A first
 * pass came back royal blue, which is the brand navy but not this page's
 * accent, and was redone.
 */
export type ImageSlot = {
  /** What the picture has to show, and how it has to behave once treated. */
  brief: string;
  /** Intrinsic size of the file in /public/imagery. */
  width: number;
  height: number;
  /** Path under /public. */
  src: string;
  /** Left empty on purpose: the slots are decorative, and the section around them carries the meaning. */
  alt: string;
};

export const IMAGERY = {
  /** Behind the hero, below the fold line — the place all of this happens. */
  horizon: {
    brief:
      "A campus skyline at blue hour from above: rooflines and a tower in clean silhouette against a still-luminous sky. It sits behind the first screen at a quarter opacity, masked to nothing at the top, so it has to survive being reduced to a horizon line. No people, no signage.",
    width: 2000,
    height: 848,
    src: "/imagery/campus-horizon.webp",
    alt: "",
  },
  /** Opens "who it's for" — the institutions the product is sold to. */
  institutions: {
    brief:
      "A university or college building read from outside, late in the day. One dominant architectural line, a dark sky, no legible signage and no identifiable faces. Wide crop; the lower third is covered by a scrim and carries the heading.",
    width: 1600,
    height: 893,
    src: "/imagery/campus-institutions.webp",
    alt: "",
  },
  /** Behind the close — the place the next prospective student is standing. */
  close: {
    brief:
      "A campus walkway or entrance at night, lit from within. Depth rather than detail: the frame sits at roughly a fifth opacity behind centred text, so it has to read as a place at a glance and nothing more. No identifiable faces.",
    width: 1600,
    height: 893,
    src: "/imagery/campus-close.webp",
    alt: "",
  },
} as const satisfies Record<string, ImageSlot>;

/**
 * Variation 5's cards.
 *
 * Four frames for the four kinds of institution, and unlike the variation 3
 * slots these are not wallpaper — they carry a card each, at full strength
 * under a scrim, so the set has to hold together as a set. One rule does that:
 * every one is the same place at the same hour, after dark, lit from inside,
 * with nobody in it. The page desaturates them most of the way and lets the
 * colour back in under the cursor, which is why they are stored untreated.
 */
export const V5_IMAGERY = {
  universities: {
    brief:
      "A collegiate quadrangle after dark: stone facade, tall windows lit warm, an empty lawn and path. No people, no signage.",
    width: 1200,
    height: 675,
    src: "/imagery/v5-universities.webp",
    alt: "",
  },
  colleges: {
    brief:
      "A modern college atrium at night seen from outside through a glass wall, empty, warm light within, wet paving in front. No people, no signage.",
    width: 1200,
    height: 675,
    src: "/imagery/v5-colleges.webp",
    alt: "",
  },
  schools: {
    brief:
      "The entrance of a low modern school at dusk, lit canopy over the doors, empty forecourt, dark sky. No people, no signage.",
    width: 1200,
    height: 675,
    src: "/imagery/v5-schools.webp",
    alt: "",
  },
  providers: {
    brief:
      "A reading room late at night: long tables, shaded lamps, shelves receding into shadow. Nobody there, which is the point — the hour the questions arrive.",
    width: 1200,
    height: 675,
    src: "/imagery/v5-providers.webp",
    alt: "",
  },
} as const satisfies Record<string, ImageSlot>;

/**
 * The page's one piece of footage.
 *
 * A generated motion graphic rather than a product recording: a field of
 * points drifting and converging on a single light, which is the argument
 * variation 5 makes in canvas under the cursor. It is a ten second palindrome
 * — the generated five seconds followed by itself reversed — so the loop has
 * no seam to notice, and it is re-encoded down from the 6 Mbps the generator
 * returns to something a marketing page can justify shipping.
 *
 * Used three times, always as a light source behind something else and never
 * as a thing to watch: behind the hero console, behind the close, and inside
 * the widest cell of the control bento where it waits on a hover.
 */
/**
 * Variation 6's daylight set.
 *
 * The opposite brief to everything above: variation 6 is light by default, so
 * these are bright, cool and airy, and they are shown at full strength rather
 * than as a wash. The rule that holds them together is daylight and emptiness,
 * the same way the variation 5 set is held together by night and emptiness.
 */
export const V6_IMAGERY = {
  campus: {
    brief:
      "A contemporary academic block with a glazed entrance and planted approach, cool daylight, nobody in it. Carries the hero's second panel, so it has to read at a glance and small.",
    width: 1600,
    height: 900,
    src: "/imagery/v6-campus.webp",
    alt: "",
  },
  library: {
    brief:
      "A bright study hall with a full-height window wall, pale wood, empty chairs. Used at full strength in a bento cell, so this one is a photograph rather than a texture.",
    width: 1600,
    height: 900,
    src: "/imagery/v6-library.webp",
    alt: "",
  },
  courtyard: {
    brief:
      "A white courtyard with a long reflecting pool and citrus trees, hard sunlight, no people. The portrait cell of the bento; blue and white, which is the palette the page is already in.",
    width: 1200,
    height: 900,
    src: "/imagery/v6-courtyard.webp",
    alt: "",
  },
} as const satisfies Record<string, ImageSlot>;

export const MOTION = {
  field: {
    brief:
      "Pale blue points drifting in black, converging toward one luminous core and dispersing again. No text, no objects, no camera cuts.",
    width: 1280,
    height: 720,
    src: "/motion/v5-field.mp4",
    poster: "/motion/v5-field-poster.webp",
  },

  /**
   * Variation 6's two auroras, one per theme.
   *
   * A single clip cannot serve both: pastel blobs on white vanish on a
   * near-black page, and a glowing blob on black is a grey smear on a white
   * one. So there are two, the page swaps them when the theme changes, and
   * both are the same ten second palindrome treatment as the field above.
   */
  auroraLight: {
    brief:
      "Soft pale blue, lavender and aqua blobs drifting on white. Heavy blur, no hard edges, no objects.",
    width: 1280,
    height: 720,
    src: "/motion/v6-aurora-light.mp4",
    poster: "/motion/v6-aurora-light-poster.webp",
  },
  auroraDark: {
    brief:
      "One slow liquid mass of blue and cyan on near-black, morphing without ever resolving into an object.",
    width: 1280,
    height: 720,
    src: "/motion/v6-aurora-dark.mp4",
    poster: "/motion/v6-aurora-dark-poster.webp",
  },

  /**
   * The learning core, one per theme for the same reason as the auroras.
   *
   * Square and centred, because core.tsx masks them to a circle and feathers
   * the edge: a 16:9 clip cropped to a circle loses the sides of whatever it
   * was showing. Both are the same ten second palindrome as the auroras.
   */
  coreLight: {
    brief:
      "A pale aqua sphere of light on white with fine filaments drifting inside it, turning slowly. Soft focus, no hard edges, no objects, no text.",
    width: 640,
    height: 640,
    src: "/motion/v6-core-light.mp4",
    poster: "/motion/v6-core-light-poster.webp",
  },
  coreDark: {
    brief:
      "A cyan sphere of light on black with luminous filaments coiling inside it, turning slowly. Never resolves into an object.",
    width: 640,
    height: 640,
    src: "/motion/v6-core-dark.mp4",
    poster: "/motion/v6-core-dark-poster.webp",
  },
} as const;
