/**
 * Page snapshots (design doc 2026-09-15 §3.3).
 *
 * What silently breaks the feature:
 *   1. URL normalisation — two spellings of one page must be one key, two pages must not be
 *   2. mode — a homepage fetched whole must never be served as a course page's main content
 *   3. hit / miss / fresh — within the window no scrape; past it a scrape; fresh always a scrape
 *   4. failures are never stored; links come back only when asked; `changed` tracks the hash
 *   5. PDFs go through the same table under scraper 'pdf-vision'
 *   6. the .md file in the bucket is the source of truth: the row keeps a blank markdown column,
 *      a read comes from the file, and a missing or mismatched file is a live scrape, not an error
 *
 * Run: node --import tsx tests/page-store.ts   (or: npm run test:page-store)
 * No scraper, no Gemini, no database — all swapped through _pageDeps.
 */

import "dotenv/config";
import { _pageDeps, getPage, getDocument, normaliseUrl, modeFor, snapshotPathFor, renderSnapshotFile, parseSnapshotFile } from "../src/modules/superadmin/data-extraction/lib/page-store.js";

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
}

// ── In-memory stand-ins ──
type Row = { id: string; url: string; mode: string; markdown: string; links: string[]; content_hash: string; scraper: string; scraped_at: Date };
const rows = new Map<string, Row>();
const bucket = new Map<string, string>();
let bucketOn = false; // sections 1–5 run without a bucket (the row carries the text); 6 turns it on
let scrapes = 0;
let visionCalls = 0;
let clock = Date.parse("2026-09-15T00:00:00Z");
let nextScrape: { markdown: string; blocked?: boolean; notFound?: boolean } = { markdown: "# Course page\n".padEnd(200, "x") };

_pageDeps.now = () => clock;
_pageDeps.scrape = async (_url, opts) => {
  scrapes++;
  return { ...nextScrape, links: opts.withLinks ? ["https://x.edu/a", "https://x.edu/b"] : [], scraper: "scrapling" as const };
};
_pageDeps.extractDocument = async () => { visionCalls++; return { text: "Tuition 2027: $32,000".padEnd(120, ".") }; };
_pageDeps.findPage = async (url, mode) => rows.get(`${url}|${mode}`) as never;
_pageDeps.readObject = async (path) => (bucketOn ? bucket.get(path) ?? null : null);
_pageDeps.writeObject = async (path, body) => { if (!bucketOn) return false; bucket.set(path, body); return true; };
_pageDeps.savePage = async (row) => {
  const key = `${row.url}|${row.mode}`;
  const id = rows.get(key)?.id ?? `id-${rows.size + 1}`;
  rows.set(key, { id, ...row, scraped_at: new Date(clock) });
  return id;
};

console.log("\n1. URL normalisation");
{
  const canon = "https://uq.edu.au/courses/msc";
  for (const variant of [
    "https://uq.edu.au/courses/msc",
    "http://uq.edu.au/courses/msc",
    "https://www.uq.edu.au/courses/msc/",
    "https://UQ.edu.au/courses/msc#fees",
    "https://uq.edu.au/courses/msc?utm_source=x&utm_medium=y",
    "https://uq.edu.au:443/courses/msc",
  ]) assert(normaliseUrl(variant) === canon, `${variant} → canon`, normaliseUrl(variant));
  assert(normaliseUrl("https://uq.edu.au/courses/msc?b=2&a=1") === normaliseUrl("https://uq.edu.au/courses/msc?a=1&b=2"), "param order is not identity");
  assert(normaliseUrl("https://uq.edu.au/courses/msc?page=2") !== canon, "a real query param IS identity (page 2 is another page)");
  assert(normaliseUrl("https://uq.edu.au/courses/msc-2") !== canon, "a different path is another page");
  assert(normaliseUrl("https://uq.edu.au/") === "https://uq.edu.au/", "the root keeps its slash");
  assert(normaliseUrl("not a url at all") === "not a url at all", "garbage passes through rather than throwing");
}

console.log("\n2. mode");
{
  assert(modeFor({}) === "main", "default is main (the scraper's own default)");
  assert(modeFor({ onlyMainContent: true }) === "main", "explicit true is main");
  assert(modeFor({ onlyMainContent: false }) === "full", "explicit false is the full page");
}

console.log("\n3. hit / miss / fresh");
{
  const url = "https://uq.edu.au/courses/msc";
  const first = await getPage(url, { onlyMainContent: true, withLinks: true });
  assert(scrapes === 1 && !first.fromCache && first.pageId === "id-1", "first read scrapes and stores", first);
  assert(first.contentHash !== null && first.contentHash.length === 64, "a content hash comes back");

  const second = await getPage(url, { onlyMainContent: true, withLinks: true });
  assert(scrapes === 1 && second.fromCache && second.pageId === "id-1", "second read within the window does not scrape", { scrapes, second });
  assert(second.markdown === first.markdown && second.links.length === 2, "and returns the stored content and links");

  const full = await getPage(url, { onlyMainContent: false });
  assert(scrapes === 2 && !full.fromCache && full.pageId === "id-2", "the same URL in FULL mode is a different row", { scrapes, full });

  clock += 31 * 86_400_000;
  const stale = await getPage(url, { onlyMainContent: true });
  assert(scrapes === 3 && !stale.fromCache, "past 30 days it scrapes again", { scrapes });
  assert(stale.changed === false, "same content → changed is false");
  assert(rows.get("https://uq.edu.au/courses/msc|main")!.id === "id-1", "the re-scrape overwrote the row, not a second row");

  const kept = await getPage(url, { onlyMainContent: true, maxAgeDays: 365 });
  assert(scrapes === 3 && kept.fromCache, "a caller's own maxAgeDays is honoured");

  nextScrape = { markdown: "# Course page — fees updated\n".padEnd(200, "y") };
  const fresh = await getPage(url, { onlyMainContent: true, fresh: true });
  assert(scrapes === 4 && !fresh.fromCache, "fresh bypasses a valid snapshot", { scrapes });
  assert(fresh.changed === true, "and reports that the content changed", fresh.changed);
  const again = await getPage(url, { onlyMainContent: true });
  assert(again.markdown === fresh.markdown, "the fresh result was stored for the next reader");
}

console.log("\n4. failures, links, provenance");
{
  const url = "https://uq.edu.au/blocked";
  nextScrape = { markdown: "", blocked: true };
  const blocked = await getPage(url, { onlyMainContent: true });
  assert(blocked.blocked === true && blocked.pageId === null, "a blocked page is returned as-is and not stored", blocked);
  assert(!rows.has("https://uq.edu.au/blocked|main"), "no row for a failure");
  nextScrape = { markdown: "short" };
  const thin = await getPage(url, { onlyMainContent: true });
  assert(thin.pageId === null && !rows.has("https://uq.edu.au/blocked|main"), "a thin page (<50 chars) is not stored either");

  nextScrape = { markdown: "# ok".padEnd(200, "z") };
  const noLinks = await getPage("https://uq.edu.au/nolinks", { onlyMainContent: true });
  assert(noLinks.links.length === 0, "links are not returned unless asked for");
  const withLinks = await getPage("https://uq.edu.au/nolinks", { onlyMainContent: true, withLinks: true });
  assert(withLinks.fromCache && withLinks.links.length === 2, "but the row stored them, so a later caller who asks gets them", withLinks.links);
}

console.log("\n4b. junk is stripped before hashing and storing");
{
  const url = "https://uq.edu.au/junky";
  const real = "# Fees\n\n| Programme | Fee |\n| --- | --- |\n| MSc | $32,000 |\n".padEnd(200, "z");
  const junkA = `![logo](data:image/png;base64,${"A".repeat(400)})\n<!-- tracking pixel -->\n${real}\nfooter\nfooter\nfooter\n\n\n\n\nend`;
  const junkB = `![logo](data:image/png;base64,${"B".repeat(400)})\n<!-- other comment -->\n${real}\nfooter\n\n\nend`;
  nextScrape = { markdown: junkA };
  const a = await getPage(url, { onlyMainContent: true });
  assert(!a.markdown.includes("AAAA") && !a.markdown.includes("<!--"), "returned markdown has no base64 payload or HTML comment", a.markdown.length);
  assert(a.markdown.includes("| MSc | $32,000 |"), "the table row survives verbatim");
  assert(rows.get("https://uq.edu.au/junky|main")?.markdown === a.markdown, "the stored row is the cleaned text, not the raw scrape");
  nextScrape = { markdown: junkB };
  const b = await getPage(url, { onlyMainContent: true, fresh: true });
  assert(b.changed === false && b.contentHash === a.contentHash, "two scrapes that differ only in junk hash the same, so `changed` is false", { a: a.contentHash, b: b.contentHash });
}

console.log("\n5. PDFs");
{
  const pdf = "https://uq.edu.au/fees/2027.pdf";
  const a = await getDocument(pdf);
  assert(visionCalls === 1 && a.scraper === "pdf-vision" && a.pageId !== null, "a PDF is read by Vision once and stored under 'pdf-vision'", a);
  const b = await getDocument(pdf);
  const c = await getDocument(pdf);
  assert(visionCalls === 1 && b.fromCache && c.fromCache, "every later reader gets the stored text — Vision is not called again", visionCalls);
  assert(b.markdown.includes("Tuition 2027"), "and the text is intact");
}

console.log("\n6. the bucket is the source of truth");
{
  bucketOn = true;
  const url = "https://uq.edu.au/courses/gcs";
  const path = snapshotPathFor(url);
  nextScrape = { markdown: "# In the bucket\n".padEnd(200, "g") };
  const a = await getPage(url, { onlyMainContent: true, withLinks: true });
  const row = rows.get("https://uq.edu.au/courses/gcs|main")!;
  assert(bucket.has(path) && row.markdown === "", "a stored page writes the .md file and leaves the row's markdown column blank", { path, row: row.markdown.length });
  assert(parseSnapshotFile(bucket.get(path)!) === a.markdown, "the file round-trips to exactly the stored markdown");
  assert(bucket.get(path)!.includes("- https://x.edu/a") === false && bucket.get(path)!.startsWith("---\nurl: "), "front-matter first; page links that are not files are not listed");
  assert(snapshotPathFor(url, "full") !== path && snapshotPathFor(url, "full").endsWith(".full.md"), "full mode is its own file, as it is its own row");

  const before = scrapes;
  const b = await getPage(url, { onlyMainContent: true });
  assert(scrapes === before && b.fromCache && b.markdown === a.markdown, "a hit is read back from the file, not scraped", { scrapes, before });

  bucket.delete(path);
  const c = await getPage(url, { onlyMainContent: true });
  assert(scrapes === before + 1 && !c.fromCache, "row present but file missing → live scrape, not an error", { scrapes });
  assert(bucket.has(path) && rows.get("https://uq.edu.au/courses/gcs|main")!.id === row.id, "…and the file is rewritten onto the same row");

  bucket.set(path, renderSnapshotFile({ url, mode: "main", scraper: "scrapling", scrapedAt: "x" }, "# someone edited this by hand".padEnd(200, "e"), []));
  const d = await getPage(url, { onlyMainContent: true });
  assert(scrapes === before + 2 && !d.fromCache, "a file that no longer hashes to its row is a miss too", { scrapes });

  const withFiles = renderSnapshotFile({ url, mode: "main", scraper: "scrapling", scrapedAt: "x" }, "# Fees\n\nbody", ["https://x.edu/fees.pdf", "https://x.edu/page", "https://x.edu/fees.pdf"]);
  assert(withFiles.endsWith("## Linked files\n\n- https://x.edu/fees.pdf\n") && parseSnapshotFile(withFiles) === "# Fees\n\nbody", "linked files are appended once each and stripped on read", withFiles);

  const pdf = "https://uq.edu.au/fees/2028.pdf";
  await getDocument(pdf);
  assert(bucket.has(snapshotPathFor(pdf)), "a PDF's Vision text is a file too", snapshotPathFor(pdf));

  // The store's size bound applies to the FILE as well as the row, and the hash is of what was
  // actually stored — otherwise a hostile 50MB page is 50MB of GCS writes on every fresh rerun,
  // and a bounded row could never re-hash to an unbounded file.
  const huge = "https://uq.edu.au/huge";
  nextScrape = { markdown: "# Huge\n" + "x".repeat(1_500_000) };
  const h = await getPage(huge, { onlyMainContent: true });
  const stored = parseSnapshotFile(bucket.get(snapshotPathFor(huge))!);
  assert(stored.length <= 1_000_000, "the file is bounded to MAX_STORED_CHARS", stored.length);
  assert(h.contentHash === (await getPage(huge, { onlyMainContent: true })).contentHash, "the hash is of the bounded text, so the file re-hashes to its row on read");
  assert((await getPage(huge, { onlyMainContent: true })).fromCache, "…and that read is a cache hit, not a mismatch → rescrape");
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
