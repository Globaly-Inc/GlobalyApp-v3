/**
 * Scraper cascade order test — asserts scrapeMarkdown() tries Scrapling → Crawl4AI →
 * Firecrawl in that order and stops at the first tier that clears MIN_CONTENT_LEN.
 * Run: node --import tsx tests/scraper-cascade.ts   (or: npm run test:scraper-cascade)
 *
 * Style matches tests/referrals.ts/auth.ts: plain tsx script, manual counters, no framework.
 * Scrapling now goes over MCP (StreamableHTTPClientTransport, JSON-RPC/SSE) instead of a
 * plain REST call, so it's mocked one level up — patching Client.prototype.connect/callTool
 * directly — rather than hand-simulating the MCP wire protocol via fetch. Crawl4AI/Firecrawl
 * are still plain REST, so those stay mocked via global.fetch.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";

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

function mockScrapling(markdown: string | null) {
  (Client.prototype as any).connect = async function () {};
  (Client.prototype as any).callTool = async function () {
    return { structuredContent: { status: 200, content: [markdown ?? ""], url: "https://example.com" } };
  };
}

/**
 * Simulates the real staging bug: the cached MCP client's session id has gone dead
 * (scrapling-mcp restarted server-side), so the FIRST callTool throws exactly like a
 * StreamableHTTP 404 "unknown or expired session ID" would. Every call after that must
 * succeed, and connect() must fire again — proving the client actually reconnected
 * instead of reusing the dead session forever.
 */
function mockScraplingSessionExpiry(markdown: string) {
  let connectCalls = 0;
  let callToolCalls = 0;
  (Client.prototype as any).connect = async function () {
    connectCalls++;
  };
  (Client.prototype as any).callTool = async function () {
    callToolCalls++;
    if (callToolCalls === 1) {
      throw new Error("Rejected request with unknown or expired session ID: 230bcc487fa6454a911c8dbb36f89556");
    }
    return { structuredContent: { status: 200, content: [markdown], url: "https://example.com" } };
  };
  return { connectCalls: () => connectCalls };
}

async function main() {
  const { scrapeMarkdown } = await import("../src/modules/superadmin/data-extraction/lib/scraper.js");

  // 1. Scrapling succeeds first — nothing else should even matter.
  mockScrapling(LONG);
  let r = await scrapeMarkdown("https://example.com");
  assertEqual(r.scraper, "scrapling", "picks scrapling when it clears the threshold");

  // 2. Scrapling short → falls through to Crawl4AI.
  mockScrapling(SHORT);
  mockFetch({ "crawl4ai.test": LONG });
  r = await scrapeMarkdown("https://example.com");
  assertEqual(r.scraper, "crawl4ai", "falls through to crawl4ai when scrapling is short");

  // 3. Scrapling + Crawl4AI both short → falls through to Firecrawl.
  mockScrapling(SHORT);
  mockFetch({ "crawl4ai.test": SHORT, "firecrawl.dev": LONG });
  r = await scrapeMarkdown("https://example.com");
  assertEqual(r.scraper, "firecrawl", "falls through to firecrawl when scrapling and crawl4ai are short");

  // 4. forceFirecrawl skips both scrapling and crawl4ai even though they'd succeed.
  mockScrapling(LONG);
  mockFetch({ "crawl4ai.test": LONG, "firecrawl.dev": LONG });
  r = await scrapeMarkdown("https://example.com", { forceFirecrawl: true });
  assertEqual(r.scraper, "firecrawl", "forceFirecrawl skips scrapling and crawl4ai");

  // 5. Scrapling returns a long-but-empty soft-404 shell (nav/footer boilerplate padded past
  // MIN_CONTENT_LEN) — must not be accepted as a real scrape; falls through to Crawl4AI.
  // Reproduces the real UTS soft-404 page: 8k+ chars of nav/footer plus "Page not found".
  const SOFT_404 = `${LONG}\nPage not found\nWe can't find the page you're looking for.\n${LONG}`;
  mockScrapling(SOFT_404);
  mockFetch({ "crawl4ai.test": LONG });
  r = await scrapeMarkdown("https://example.com");
  assertEqual(r.scraper, "crawl4ai", "rejects a long soft-404 shell from scrapling and falls through");

  // 6. Cached client's session has died server-side (staging bug) — must reconnect and
  // recover WITHIN this same call, not just on some future call after the process restarts.
  const tracker = mockScraplingSessionExpiry(LONG);
  r = await scrapeMarkdown("https://example.com");
  assertEqual(r.scraper, "scrapling", "recovers within the same call after a session-expiry throw");
  assertEqual(tracker.connectCalls(), 1, "drops the dead client and reconnects exactly once");

  // 7. expandCollapsed threads through to Firecrawl as a click-open action. Real bug, seen
  // live on harvard.edu's "programs" pages: Firecrawl reports success every time (never
  // actually blocked) — the real degree listing only renders after a client-side accordion
  // click, so a static/rendered snapshot comes back as an empty shell (~95 chars) and the
  // old code burned two retries on proxy/mobile escalation that can never fix that. Verified
  // live against https://www.harvard.edu/programs/computer-science: adding this action took
  // the recovered markdown from ~95 chars to 3434.
  let capturedBody: any = null;
  mockScrapling(SHORT);
  global.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = url.toString();
    if (u.includes("crawl4ai.test")) return new Response(JSON.stringify({ markdown: SHORT }), { status: 200 });
    if (u.includes("firecrawl.dev")) {
      capturedBody = JSON.parse(init!.body as string);
      return new Response(JSON.stringify({ markdown: LONG }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;
  r = await scrapeMarkdown("https://example.com", { expandCollapsed: true });
  assertEqual(r.scraper, "firecrawl", "expandCollapsed still resolves via firecrawl");
  assertEqual(Array.isArray(capturedBody?.actions), true, "expandCollapsed adds a Firecrawl actions array");
  assertEqual(capturedBody?.actions?.[0]?.type, "executeJavascript", "the action is a JS click-open script, not a brittle selector-specific click that fails the whole scrape when nothing matches");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
