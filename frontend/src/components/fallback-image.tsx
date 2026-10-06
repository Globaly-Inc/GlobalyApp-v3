"use client";

import type { ImgHTMLAttributes } from "react";

/**
 * A plain `<img>` that disappears instead of painting the browser's broken-image glyph.
 *
 * Covers and logos are arbitrary URLs — scraped partner domains, or private-bucket links
 * the extraction worker stored raw — so a 403/404 is routine, and the default rendering
 * puts a cracked-image icon straight on the card. Hiding the element lets whatever sits
 * BEHIND it show through, so every call site must paint its fallback (gradient, initials)
 * as a layer underneath rather than in an `else` branch.
 *
 * ponytail: hide-on-error, no retry and no state — the element reinstates itself if a
 * later src loads. Reach for next/image only if these URLs ever become a known host set.
 */
export function FallbackImage({ alt = "", ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={alt}
      onError={(e) => { e.currentTarget.style.display = "none"; }}
      // display:none still loads a replacement src and still fires load, so onLoad is what
      // un-hides the element when the src changes after a failure.
      onLoad={(e) => { e.currentTarget.style.display = ""; }}
    />
  );
}
