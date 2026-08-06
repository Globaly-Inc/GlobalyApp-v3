// URL filtering and markdown utilities.
// Scrapers return markdown, so we mostly work with URLs and text — not raw HTML.

/** Heuristic: does this URL look like a course detail or listing page? */
export function looksLikeCourseUrl(url: string): boolean {
  const lower = url.toLowerCase();
  const signals = [
    "/course", "/program", "/degree", "/bachelor", "/master",
    "/diploma", "/certificate", "/study", "/undergraduate",
    "/postgraduate", "/phd", "/mba", "/faculty", "/school-of",
    "/departments", "/subjects", "/units",
  ];
  return signals.some((s) => lower.includes(s));
}

/** Global asset extensions to exclude from URL discovery */
const ASSET_EXTS = new Set([
  ".pdf", ".zip", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp",
  ".mp4", ".mp3", ".wav", ".avi", ".mov", ".wmv",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".css", ".js", ".xml", ".json", ".rss", ".atom",
  ".ico", ".woff", ".woff2", ".ttf", ".eot",
]);

/** Filter URLs — remove assets, fragments, duplicates */
export function filterUrls(urls: string[], baseOrigin: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of urls) {
    try {
      const u = new URL(raw);
      // Same origin only
      if (u.origin !== baseOrigin) continue;
      // Skip assets
      const ext = u.pathname.slice(u.pathname.lastIndexOf(".")).toLowerCase();
      if (ASSET_EXTS.has(ext)) continue;
      // Skip common non-course paths
      const path = u.pathname.toLowerCase();
      if (/\/(login|signin|register|cart|checkout|search|privacy|cookie|terms|sitemap|feed|api)\b/.test(path)) continue;

      u.hash = "";
      const normalized = u.href.replace(/\/+$/, "");
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    } catch { /* invalid URL */ }
  }
  return result;
}

/** Truncate markdown to a max character length, breaking at line boundaries */
export function truncateMarkdown(md: string, maxLength = 60_000): string {
  if (md.length <= maxLength) return md;
  const cut = md.lastIndexOf("\n", maxLength);
  return md.slice(0, cut > 0 ? cut : maxLength);
}

/** Extract domain from URL */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown";
  }
}
