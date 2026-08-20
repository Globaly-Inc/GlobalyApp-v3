/**
 * Scraper cascade order test — asserts scrapeMarkdown() tries Scrapling → Crawl4AI →
 * Firecrawl in that order and stops at the first tier that clears MIN_CONTENT_LEN.
 * Run: node --import tsx tests/scraper-cascade.ts   (or: npm run test:scraper-cascade)
 *
 * Style matches tests/referrals.ts/auth.ts: plain tsx script, manual counters, no framework.
 * Mocks global.fetch instead of hitting real services — this is pure branch logic, not
 * an integration test.
 */

process.env.SCRAPLING_BASE_URL = "https://scrapling.test";
process.env.CRAWL4AI_BASE_URL = "https://crawl4ai.test";
process.env.FIRECRAWL_API_KEY = "fc-test";
process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";

let passed = 0;
let failed = 0;

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const LONG = "x".repeat(250);
const SHORT = "too short";

function mockFetch(responses: Record<string, string>) {
  global.fetch = (async (url: string | URL) => {
    const u = url.toString();
    for (const [match, markdown] of Object.entries(responses)) {
      if (u.includes(match)) {
        return new Response(JSON.stringify({ markdown }), { status: 200 });
      }
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;
}

async function main() {
  const { scrapeMarkdown } = await import("../src/modules/superadmin/data-extraction/lib/scraper.js");

  // 1. Scrapling succeeds first — nothing else should even matter.
  mockFetch({ "scrapling.test": LONG });
  let r = await scrapeMarkdown("https://example.com");
  assertEqual(r.scraper, "scrapling", "picks scrapling when it clears the threshold");

  // 2. Scrapling short → falls through to Crawl4AI.
  mockFetch({ "scrapling.test": SHORT, "crawl4ai.test": LONG });
  r = await scrapeMarkdown("https://example.com");
  assertEqual(r.scraper, "crawl4ai", "falls through to crawl4ai when scrapling is short");

  // 3. Scrapling + Crawl4AI both short → falls through to Firecrawl.
  mockFetch({ "scrapling.test": SHORT, "crawl4ai.test": SHORT, "firecrawl.dev": LONG });
  r = await scrapeMarkdown("https://example.com");
  assertEqual(r.scraper, "firecrawl", "falls through to firecrawl when scrapling and crawl4ai are short");

  // 4. forceFirecrawl skips both scrapling and crawl4ai even though they'd succeed.
  mockFetch({ "scrapling.test": LONG, "crawl4ai.test": LONG, "firecrawl.dev": LONG });
  r = await scrapeMarkdown("https://example.com", { forceFirecrawl: true });
  assertEqual(r.scraper, "firecrawl", "forceFirecrawl skips scrapling and crawl4ai");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
