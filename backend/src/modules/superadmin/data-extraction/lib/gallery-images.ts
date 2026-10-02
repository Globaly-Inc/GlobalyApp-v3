// Picks a few real photos from a scraped page's markdown for the org's Media section. Extraction
// keeps image links in the snapshot (`![alt](src)`) but never stored a gallery, so an extracted
// profile showed "No media added yet" even when its homepage is full of campus photos.

/** URLs whose path or extension marks them as chrome, not photos. */
const NOT_A_PHOTO = /\.(svg|gif|ico)(\?|$)|logo|icon|favicon|sprite|avatar|badge|flag|placeholder|spinner|loader|pixel|tracking|emoji/i;

/** Up to `max` distinct photo URLs from markdown image links, made absolute against `pageUrl`,
 * skipping the org's own logo and anything that looks like an icon. */
export function pickGalleryImages(markdown: string, pageUrl: string, logoUrl: string | null, max = 3): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    let url: string;
    try {
      url = new URL(m[1]!, pageUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:/i.test(url) || NOT_A_PHOTO.test(url) || url === logoUrl || out.includes(url)) continue;
    out.push(url);
    if (out.length === max) break;
  }
  return out;
}
