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
  decodeSitemapBody, nextHostSlot, throttleForHost, sitemapIndexChildren, sitemapLocs, sitemapUrlsFromRobots, updateHostHealth,
} from "../src/modules/superadmin/data-extraction/lib/scraper.js";
import type { HostHealth } from "../src/modules/superadmin/data-extraction/lib/scraper.js";

let passed = 0;
let failed = 0;
function fail(msg: string) { failed++; console.error(`FAIL ${msg}`); }
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

// ── host health ─────────────────────────────────────────────────────────────
// This bookkeeping has been wrong twice: first it condemned a live host because one concurrent
// path timed out, then it could never retire a host that went bad — 20 hanging robots declarations
// (or 200 index children) at two attempts x 15s each is a job standing still for 10-107 minutes.
const fresh = (): HostHealth | undefined => undefined;

// Never answered: one failure is enough, there is nothing to give it credit for.
eq(updateHostHealth(fresh(), false), { alive: false, failures: 1, dead: true }, "unknown host dies on first failure");

// Answered once, then one path fails — must NOT be condemned, that was the earlier bug.
const answered = updateHostHealth(fresh(), true);
eq(answered, { alive: true, failures: 0, dead: false }, "an answer marks the host alive");
const oneFail = updateHostHealth(answered, false);
eq(oneFail, { alive: true, failures: 1, dead: false }, "a live host survives one failed path");
const twoFail = updateHostHealth(oneFail, false);
eq(twoFail, { alive: true, failures: 2, dead: false }, "...and a second");
eq(updateHostHealth(twoFail, false), { alive: true, failures: 3, dead: true }, "but is retired at the limit");

// Any answer resets the streak, so a flaky-but-working host keeps working.
eq(updateHostHealth(twoFail, true), { alive: true, failures: 0, dead: false }, "an answer clears accumulated failures");

// A 404 is an answer — the server replied, so the host is up.
eq(updateHostHealth(updateHostHealth(fresh(), false), true), { alive: true, failures: 0, dead: false }, "a later answer revives a host that had failed");

eq(updateHostHealth(answered, false, 1), { alive: true, failures: 1, dead: true }, "the limit is tunable");

// ── per-host pacing ─────────────────────────────────────────────────────────
// The slot must be reserved before the caller sleeps. Read-sleep-write paces sequential callers
// but lets N concurrent ones read the same timestamp and fire together — which is how 500 queued
// pages against catalog.yale.edu produced 478 anti_bot failures in one second.
const GAP = 800;

// A host never hit: go now.
eq(nextHostSlot(undefined, 1_000, GAP), 1_000, "first request to a host goes immediately");

// Sequential caller after the gap has elapsed: go now (no artificial delay).
eq(nextHostSlot(1_000, 5_000, GAP), 5_000, "a request long after the last slot is not delayed");

// Sequential caller inside the gap: wait out the remainder — same as the old behaviour.
eq(nextHostSlot(1_000, 1_200, GAP), 1_800, "a request inside the gap waits for the slot");

// THE FIX: concurrent callers at the same instant get DIFFERENT slots, spaced by the gap.
let slot: number | undefined = undefined;
const burst: number[] = [];
for (let i = 0; i < 5; i++) {
  slot = nextHostSlot(slot, 1_000, GAP); // every caller sees the same `now` — a true burst
  burst.push(slot);
}
eq(burst, [1_000, 1_800, 2_600, 3_400, 4_200], "a burst of 5 is spread across 5 slots, not collapsed onto one");

// The arithmetic above cannot prove the real fix: `Math.max(now, last + gap)` and the old
// `gap - (now - last)` form are algebraically identical. The bug was WRITE ORDERING — reserving
// the slot after the sleep instead of before — which only shows up with concurrent callers.
// So measure actual concurrency against a real gap.
{
  const gap = Number(process.env.HOST_THROTTLE_MS) || 800;
  const started = Date.now();
  const finishedAt = await Promise.all(
    Array.from({ length: 4 }, () => throttleForHost("https://throttle-test.example/x").then(() => Date.now() - started)),
  );
  // Reserved slots: caller i waits ~i*gap. Read-sleep-write would release all four at ~0-gap.
  const spread = Math.max(...finishedAt) - Math.min(...finishedAt);
  if (spread < gap * 2) {
    fail(`concurrent callers were not serialised: released within ${spread}ms, expected >= ${gap * 2}ms of spread (${finishedAt.join(", ")})`);
  } else {
    passed++;
  }
  // throttleForHost reserves its slot in the SHARED table, so this test writes a row to whatever
  // database it runs against. Clean it up: a stray host row is harmless but it is still test
  // residue sitting in a real schema, and it made the table look like it had scraped a domain
  // nobody has ever crawled.
  const { masterKnex } = await import("../src/core/db/master-pool.js");
  await masterKnex("superadmin.extraction_host_slots").where({ host: "throttle-test.example" }).del().catch(() => {});
  await masterKnex.destroy().catch(() => {});
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
