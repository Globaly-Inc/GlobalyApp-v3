/**
 * Sitemap parsing helpers — robots.txt declarations, index children, page locs, gzip bodies.
 * Pure, no network. Run: npm run test:sitemap-parsing
 *
 * These exist because a live Yale job lost its entire 1,335-page course catalogue to a sitemap
 * source that returned [] and said nothing, and because the crawler silently ignored robots.txt
 * declarations, truncated index children at 25, and read a gzipped sitemap as binary.
 */
import { gzipSync } from "node:zlib";
import {
  decodeSitemapBody, sitemapIndexChildren, sitemapLocs, sitemapUrlsFromRobots,
} from "../src/modules/superadmin/data-extraction/lib/scraper.js";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

// ── robots.txt ──────────────────────────────────────────────────────────────
eq(
  sitemapUrlsFromRobots("User-agent: *\nDisallow: /admin\nSitemap: https://x.edu/sitemap.xml\nSitemap: https://x.edu/courses.xml"),
  ["https://x.edu/sitemap.xml", "https://x.edu/courses.xml"],
  "collects every Sitemap: declaration, not just the first",
);
eq(sitemapUrlsFromRobots("sitemap: https://x.edu/a.xml"), ["https://x.edu/a.xml"], "case-insensitive directive");
eq(sitemapUrlsFromRobots("  Sitemap:   https://x.edu/a.xml  "), ["https://x.edu/a.xml"], "tolerates surrounding whitespace");
// Anchored to line start: a URL that merely contains the word must not be read as a declaration.
eq(sitemapUrlsFromRobots("Disallow: /page?ref=sitemap:/foo"), [], "only line-start directives count");
eq(sitemapUrlsFromRobots("Sitemap: /relative.xml"), [], "ignores a non-absolute declaration");
eq(sitemapUrlsFromRobots("User-agent: *\nDisallow:"), [], "no declarations is empty, not a throw");

// ── index children vs page locs ─────────────────────────────────────────────
const indexXml = `<?xml version="1.0"?><sitemapindex xmlns="x">
  <sitemap><loc>https://x.edu/sm-1.xml</loc><lastmod>2026-01-01</lastmod></sitemap>
  <sitemap><loc>https://x.edu/sm-2.xml</loc></sitemap>
</sitemapindex>`;
eq(sitemapIndexChildren(indexXml), ["https://x.edu/sm-1.xml", "https://x.edu/sm-2.xml"], "reads index children");
eq(sitemapLocs(indexXml), [], "an index yields no page locs");

const urlsetXml = `<?xml version="1.0"?><urlset xmlns="x">
  <url><loc>https://x.edu/a</loc><priority>0.5</priority></url>
  <url><loc>https://x.edu/b</loc></url>
  <url><loc>ftp://x.edu/c</loc></url>
</urlset>`;
eq(sitemapLocs(urlsetXml), ["https://x.edu/a", "https://x.edu/b"], "reads page locs and drops non-http schemes");
eq(sitemapIndexChildren(urlsetXml), [], "a urlset yields no index children");

// ── gzip ────────────────────────────────────────────────────────────────────
// A .gz sitemap is a gzipped FILE, which fetch does NOT transparently decode (unlike
// Content-Encoding: gzip). Read as text it is binary, parses to zero URLs, and says nothing.
const gz = gzipSync(Buffer.from(urlsetXml, "utf8"));
eq(sitemapLocs(decodeSitemapBody(gz)), ["https://x.edu/a", "https://x.edu/b"], "decodes a gzipped sitemap");
eq(decodeSitemapBody(Buffer.from(urlsetXml, "utf8")), urlsetXml, "leaves plain XML untouched");
eq(decodeSitemapBody(Buffer.from([0x1f, 0x8b, 0x00, 0x01])), "", "corrupt gzip degrades to empty, not a throw");
eq(decodeSitemapBody(Buffer.alloc(0)), "", "empty body is empty");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
