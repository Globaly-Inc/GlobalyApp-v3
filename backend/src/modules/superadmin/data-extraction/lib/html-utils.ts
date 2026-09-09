// URL filtering and markdown utilities.
// Scrapers return markdown, so we mostly work with URLs and text — not raw HTML.

/**
 * Every `href="..."` value in raw HTML — deliberately not the scraper's own `links` array,
 * which (for Scrapling/Crawl4AI) is `extractLinksFromMarkdown()` in scraper.ts: a regex over
 * the already-converted MARKDOWN text, looking for `[text](url)` or bare URLs. An icon-only
 * anchor (`<a href="..."><span class="fab fa-facebook-f"></span></a>`, no visible text) never
 * produces either pattern in markdown, so that array is exactly as blind to it as the LLM
 * reading the same markdown — pulling from raw HTML is the only way to actually see it.
 */
export function extractHrefsFromHtml(html: string): string[] {
  const hrefs = new Set<string>();
  const re = /\bhref\s*=\s*["']([^"'#][^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) hrefs.add(m[1]);
  return [...hrefs];
}

export type SocialLinks = {
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  linkedin_url: string | null;
  youtube_url: string | null;
  other_social_links: { label: string; url: string }[];
};

const KNOWN_PLATFORMS: { key: keyof Omit<SocialLinks, "other_social_links">; hosts: RegExp }[] = [
  { key: "facebook_url", hosts: /(^|\.)facebook\.com$/i },
  { key: "instagram_url", hosts: /(^|\.)instagram\.com$/i },
  { key: "twitter_url", hosts: /(^|\.)(twitter\.com|x\.com)$/i },
  { key: "linkedin_url", hosts: /(^|\.)linkedin\.com$/i },
  { key: "youtube_url", hosts: /(^|\.)(youtube\.com|youtu\.be)$/i },
];

// A handful of other platforms worth a recognizable label instead of a generic "Link".
const OTHER_PLATFORM_LABELS: { hosts: RegExp; label: string }[] = [
  { hosts: /(^|\.)tiktok\.com$/i, label: "TikTok" },
  { hosts: /(^|\.)threads\.net$/i, label: "Threads" },
  { hosts: /(^|\.)wa\.me$|whatsapp\.com$/i, label: "WhatsApp" },
  { hosts: /(^|\.)pinterest\.com$/i, label: "Pinterest" },
  { hosts: /(^|\.)snapchat\.com$/i, label: "Snapchat" },
  { hosts: /(^|\.)wechat\.com$/i, label: "WeChat" },
];

/**
 * Classifies raw page links (the scraper's separate `links` array, not markdown text) into
 * known social platforms by domain — deterministic, no LLM involved. Exists because an
 * icon-only social footer (`<a href="..."><span class="fab fa-facebook-f"></span></a>`, no
 * visible link text) is extremely common and gets stripped or blanked by HTML→markdown
 * conversion before the LLM ever sees it — the raw href survives in `links` regardless of
 * what markdown conversion did to the surrounding text.
 */
export function extractSocialLinks(links: string[]): SocialLinks {
  const result: SocialLinks = {
    facebook_url: null, instagram_url: null, twitter_url: null, linkedin_url: null, youtube_url: null,
    other_social_links: [],
  };
  const seenOther = new Set<string>();

  for (const link of links) {
    let host: string;
    try {
      host = new URL(link).hostname;
    } catch {
      continue;
    }

    const known = KNOWN_PLATFORMS.find((p) => p.hosts.test(host));
    if (known) {
      if (!result[known.key]) result[known.key] = link;
      continue;
    }

    const other = OTHER_PLATFORM_LABELS.find((p) => p.hosts.test(host));
    if (other && !seenOther.has(link)) {
      seenOther.add(link);
      result.other_social_links.push({ label: other.label, url: link });
    }
  }

  return result;
}

/**
 * Fixes a specific LLM extraction quirk: given a page with a root-relative asset URL like
 * `<img src="/-/media/logos/foo.png">` (Sitecore's media-library convention, but any
 * root-relative path triggers this), the LLM sometimes "helpfully" absolutizes it by
 * prefixing `https://` without ever inserting the actual domain — producing
 * `https://-/media/logos/foo.png`, which parses as a syntactically valid URL (hostname:
 * "-") so nothing downstream catches it, but is completely broken.
 *
 * Detects this by hostname shape (a real one has a dot, or is "localhost") and re-resolves
 * treating "hostname + pathname + search" as the real relative path it should have been.
 */
export function fixMalformedAbsoluteUrl(value: string | null | undefined, pageUrl: string): string | null {
  if (!value) return value ?? null;
  try {
    const parsed = new URL(value);
    if (parsed.hostname.includes(".") || parsed.hostname === "localhost") return value;
    const relative = `/${parsed.hostname}${parsed.pathname}${parsed.search}`;
    return new URL(relative, pageUrl).href;
  } catch {
    try {
      return new URL(value, pageUrl).href;
    } catch {
      return value;
    }
  }
}

/** Heuristic: does this URL look like a course detail or listing page? */
export function looksLikeCourseUrl(url: string): boolean {
  const signals = [
    "/course", "/program", "/degree", "/bachelor", "/master",
    "/diploma", "/certificate", "/undergraduate",
    "/postgraduate", "/phd", "/mba", "/faculty", "/school-of",
    "/departments", "/subjects", "/units",
    // Universities publish their catalogue under these just as often, and without
    // them a site like MIT (catalog.mit.edu) or Stanford (bulletin/explorecourses)
    // yields zero course URLs.
    "/catalog", "/catalogue", "/bulletin", "/handbook", "/academics",
    "/majors", "/minors", "/curriculum", "/explorecourses",
    // Compound paths: /academic-programs, /new-programs, /collaborative-programs
    "-programs", "-courses",
    "/admission", "/fee-structure",
  ];
  // A catalogue host counts on its own — explorecourses.stanford.edu/search is a
  // course search, but its path carries no signal.
  // School/faculty subdomains (som.ku.edu.np, soe.ku.edu.np) are programme hosts too
  // "catalog(ue)" needs the plural too — seen live on catalogs.uky.edu, which the
  // singular-only form silently excluded even though it's exactly the kind of catalogue
  // host this exists for.
  const catalogueHost = /^(explorecourses|bulletin|catalog(?:ue)?s?|courses|programs|handbook|study|so[a-z]|school|faculty)\./i;

  let path: string;
  try {
    const u = new URL(url);
    if (catalogueHost.test(u.hostname)) return true;
    // Path only, never the full href: matching the whole URL string let a signal
    // like "/admission" match by pure string coincidence against a HOSTNAME
    // ("https://admission.example.edu/..." contains "/admission" right after
    // "://"), turning an institution's entire admissions subdomain into "course
    // pages" regardless of what was actually on them (seen live on
    // admission.universityofcalifornia.edu — every page matched, none were courses).
    path = u.pathname.toLowerCase();
  } catch {
    path = url.toLowerCase();
  }

  // "/study" alone is too common an English word to substring-match anywhere in a
  // URL — it also matches unrelated slugs like "/news/study-finds-x-causes-y" (a
  // research-study headline, not a program of study). Require it to end a path
  // segment ("/study/", "/study.html", or end of path), not just start one.
  if (/\/study(?:[/?.]|$)/.test(path)) return true;

  return signals.some((s) => path.includes(s));
}

/**
 * Heuristic: does this URL look like a page describing a visa/migration consultancy's own
 * service, fees, team, or registration? Path-only from the start (never the full href) —
 * looksLikeCourseUrl above learned that lesson live (a signal matching the HOSTNAME by pure
 * string coincidence turned an institution's whole admissions subdomain into "course pages").
 */
export function looksLikeVisaServiceUrl(url: string): boolean {
  const signals = [
    "/service", "/visa", "/migration", "/immigration", "/registration",
    "/accreditation", "/team", "/agent", "/fee", "/pricing", "/cost",
    "/eligibility", "/appeal", "/sponsorship", "/citizenship", "/skills-assessment",
    "/testimonial", "/review", "/about", "/contact",
  ];
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = url.toLowerCase();
  }
  return signals.some((s) => path.includes(s));
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
      // news/press-room/blog/media are excluded outright, not left to the heuristic:
      // a headline like "UC graduate programs and schools among nation's best" trips
      // the "-programs" course signal, and the LLM then fabricates a distinct "course"
      // per program merely named in passing (seen live: one ranking article produced
      // 17 invented "Graduate X Programs" courses across job b290bd10-...-3bcccb).
      const path = u.pathname.toLowerCase();
      if (/\/(login|signin|register|cart|checkout|privacy|cookie|terms|sitemap|feed|api|news|press-room|media|blog)\b/.test(path)) continue;

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

/**
 * Flatten every admin-supplied `*_urls` bucket in guided_urls into one URL list.
 * Suffix-driven on purpose: a new category in the UI needs no change here, and a
 * bucket silently dropping out is how a job goes from 97 courses to 4.
 * A bare array (legacy shape) is returned as-is.
 */
export function collectGuidedUrls(guided: unknown): string[] {
  if (Array.isArray(guided)) return guided.filter((u): u is string => typeof u === "string");
  if (!guided || typeof guided !== "object") return [];
  const out: string[] = [];
  for (const [key, val] of Object.entries(guided as Record<string, unknown>)) {
    if (!key.endsWith("_urls") || !Array.isArray(val)) continue;
    for (const u of val) { if (typeof u === "string" && u.trim()) out.push(u); }
  }
  return out;
}

/**
 * Strip provably information-free junk before sending markdown to the LLM: base64
 * payloads, HTML comments, runs of identical lines, and blank-line runs. Deliberately
 * conservative — extraction quality depends on real URLs (curriculum/fees links, logos),
 * link text (course names live in links), and table rows surviving VERBATIM, so nothing
 * that carries information is rewritten or shortened. Every stripped byte is a billed
 * input token the model could never use.
 */
function stripMarkdownJunk(md: string): string {
  let out = md
    // base64 data URIs: thousands of chars of pure noise (inline images, favicons)
    .replace(/data:[a-zA-Z0-9/+.-]+;base64,[A-Za-z0-9+/=]{64,}/g, "data:omitted")
    .replace(/<!--[\s\S]*?-->/g, "");

  const lines = out.split("\n");
  const deduped: string[] = [];
  for (const line of lines) {
    if (line.trim() !== "" && deduped[deduped.length - 1] === line) continue;
    deduped.push(line);
  }
  out = deduped.join("\n");

  return out.replace(/\n{3,}/g, "\n\n");
}

/** Truncate markdown to a max character length, breaking at line boundaries */
// ponytail: 120K chars — Gemini 2.5 Flash handles ~1M tokens, 60K was leaving data on the table
export function truncateMarkdown(md: string, maxLength = 120_000): string {
  // Junk removal runs before the cut, so stripped noise buys back budget for real content
  // instead of the tail of the page being lost to it.
  const cleaned = stripMarkdownJunk(md);
  if (cleaned.length <= maxLength) return cleaned;
  const cut = cleaned.lastIndexOf("\n", maxLength);
  return cleaned.slice(0, cut > 0 ? cut : maxLength);
}

/** Extract domain from URL */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown";
  }
}

// ponytail: self-check
if (import.meta.url.endsWith("/html-utils.ts") && process.argv[1]?.endsWith("html-utils.ts")) {
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(`FAIL: ${msg}`); };

  const r = extractSocialLinks([
    "https://www.facebook.com/ballstate",
    "https://twitter.com/BallState",
    "https://www.youtube.com/officialballstate",
    "https://www.instagram.com/ballstateuniversity/",
    "https://www.linkedin.com/school/ball-state-university/",
    "https://www.tiktok.com/@ballstate/",
    "https://www.bsu.edu/about",
    "not a url",
  ]);
  assert(r.facebook_url === "https://www.facebook.com/ballstate", `facebook: ${r.facebook_url}`);
  assert(r.twitter_url === "https://twitter.com/BallState", `twitter (twitter.com): ${r.twitter_url}`);
  assert(r.youtube_url === "https://www.youtube.com/officialballstate", `youtube: ${r.youtube_url}`);
  assert(r.instagram_url === "https://www.instagram.com/ballstateuniversity/", `instagram: ${r.instagram_url}`);
  assert(r.linkedin_url === "https://www.linkedin.com/school/ball-state-university/", `linkedin: ${r.linkedin_url}`);
  assert(r.other_social_links.length === 1 && r.other_social_links[0].label === "TikTok", `tiktok in other: ${JSON.stringify(r.other_social_links)}`);

  const rX = extractSocialLinks(["https://x.com/BallState"]);
  assert(rX.twitter_url === "https://x.com/BallState", `twitter (x.com): ${rX.twitter_url}`);

  const rEmpty = extractSocialLinks([]);
  assert(rEmpty.facebook_url === null && rEmpty.other_social_links.length === 0, "empty input returns all-null");

  const hrefs = extractHrefsFromHtml(
    `<a href="https://www.facebook.com/ballstate" title="Facebook"><span class="fab fa-facebook-f"></span></a>` +
    `<a href="#top">Back to top</a><a href="/about">About</a>`,
  );
  assert(hrefs.includes("https://www.facebook.com/ballstate"), `icon-only anchor href captured: ${JSON.stringify(hrefs)}`);
  assert(hrefs.includes("/about"), `relative href captured: ${JSON.stringify(hrefs)}`);
  assert(!hrefs.includes("#top"), `fragment-only href excluded: ${JSON.stringify(hrefs)}`);

  const fixed = fixMalformedAbsoluteUrl(
    "https://-/media/www/images/logos/bsu-logo_top.png?h=112&w=402",
    "https://www.bsu.edu/about/contactus",
  );
  assert(fixed === "https://www.bsu.edu/-/media/www/images/logos/bsu-logo_top.png?h=112&w=402", `fixMalformedAbsoluteUrl: ${fixed}`);
  assert(fixMalformedAbsoluteUrl("https://www.facebook.com/ballstate", "https://www.bsu.edu") === "https://www.facebook.com/ballstate", "real absolute URL untouched");
  assert(fixMalformedAbsoluteUrl(null, "https://www.bsu.edu") === null, "null passes through");

  console.log("html-utils: all checks passed");
}
