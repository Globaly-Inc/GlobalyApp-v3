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
    // Universities publish their catalogue under these just as often, and without
    // them a site like MIT (catalog.mit.edu) or Stanford (bulletin/explorecourses)
    // yields zero course URLs.
    "/catalog", "/catalogue", "/bulletin", "/handbook", "/academics",
    "/majors", "/minors", "/curriculum", "/explorecourses",
  ];
  // A catalogue host counts on its own — explorecourses.stanford.edu/search is a
  // course search, but its path carries no signal.
  const catalogueHost = /^(explorecourses|bulletin|catalog|catalogue|courses|programs|handbook|study)\./i;
  try {
    if (catalogueHost.test(new URL(url).hostname)) return true;
  } catch { /* fall through to path signals */ }
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

/**
 * Multi-label public suffixes we actually meet in this domain. Without these, "last
 * two labels" turns torrens.edu.au into edu.au and would scope a crawl to every
 * Australian university. Not the full PSL — just the education-bearing suffixes.
 */
const MULTI_LABEL_SUFFIXES = new Set([
  "edu.au", "ac.uk", "edu.sg", "ac.nz", "edu.my", "ac.in", "edu.in",
  "edu.cn", "ac.jp", "edu.hk", "co.nz", "com.au", "org.au", "ac.za",
  "edu.ph", "ac.th", "edu.vn", "edu.pk", "ac.ir", "edu.tr", "com.br",
]);

/**
 * The site a URL belongs to, for crawl scope: its registrable domain.
 *
 * `www.stanford.edu` and `web.mit.edu` both reduce to the institution
 * (`stanford.edu`, `mit.edu`), so sibling catalogue hosts like `catalog.mit.edu`
 * are correctly in scope, while `torrens.edu.au` stops at the institution rather
 * than collapsing to the public suffix.
 */
export function siteOf(url: string): string {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./i, "");
  const labels = host.split(".");
  if (labels.length <= 2) return host;

  const lastTwo = labels.slice(-2).join(".");
  const keep = MULTI_LABEL_SUFFIXES.has(lastTwo) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

/** Same site if it is the bare host or any subdomain of it. */
export function isSameSite(candidate: string, site: string): boolean {
  const host = candidate.replace(/^www\./i, "").toLowerCase();
  return host === site || host.endsWith(`.${site}`);
}

/**
 * Filter URLs — remove assets, fragments, duplicates, and anything off-site.
 *
 * `base` may be a full URL or a bare origin. Scope is the seed's site, NOT its exact
 * origin: matching on origin dropped every URL when an admin entered the bare domain
 * and the site canonicalised to www (a 100% loss), and it discarded the catalogue
 * subdomains where universities actually publish courses.
 */
export function filterUrls(urls: string[], base: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  let site: string;
  try {
    site = siteOf(base);
  } catch {
    return [];
  }

  for (const raw of urls) {
    try {
      const u = new URL(raw);
      if (!isSameSite(u.hostname, site)) continue;
      // Skip assets
      const ext = u.pathname.slice(u.pathname.lastIndexOf(".")).toLowerCase();
      if (ASSET_EXTS.has(ext)) continue;
      // Skip common non-course paths. `search` is deliberately absent: course
      // catalogues are routinely served from /search (explorecourses.stanford.edu),
      // and the course heuristic is what narrows the list afterwards.
      const path = u.pathname.toLowerCase();
      if (/\/(login|signin|register|cart|checkout|privacy|cookie|terms|sitemap|feed|api)\b/.test(path)) continue;

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
