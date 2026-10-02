/**
 * isScraperInfraFailure — "our stack broke" vs "the target blocked us".
 * Pure, no network. Run: npm run test:classify-failure
 *
 * Exists because the page worker hardcoded `anti_bot` for every empty page. A Scrapling container
 * that had leaked 2,821 Chromium processes into its 2GiB limit therefore reported 500 pages of
 * "anti_bot" on a university catalogue, which reads as a WAF block — the investigation went to
 * rate limiting, per-host pacing and trailing-slash redirects before `docker stats` showed it.
 */
import { classifyFailure, isScraperInfraFailure } from "../src/modules/superadmin/data-extraction/lib/classify-failure.js";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else { failed++; console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

// OUR infrastructure — the real strings the scraper cascade produces.
for (const e of [
  "scrapling mcp unreachable after 2 attempts: MCP error -32001: Request timed out",
  "MCP error -32001: Request timed out",
  "No scraper configured (set CRAWL4AI_BASE_URL or FIRECRAWL_API_KEY)",
  "firecrawl: insufficient credits",
  "Page blocked after 2 retries (firecrawl): Rate limit exceeded. Consumed (req/min): 54, Remaining: 0",
  "Page blocked after 2 retries (firecrawl): Quota exceeded for this billing period",
  "connect ECONNREFUSED 127.0.0.1:8123",
  "getaddrinfo ENOTFOUND scrapling",
  "socket hang up",
  "TypeError: fetch failed",
]) eq(isScraperInfraFailure(e), true, `ours: ${e.slice(0, 48)}`);

// THEIR defences — must NOT be mistaken for our outage, or we'd stop escalating proxy tiers.
for (const e of [
  "403 Forbidden",
  "Access denied by Cloudflare",
  "blocked by anti-bot protection",
  "page content too short (95 chars)",
  "You don't have permission to access this resource",
  // A university returning 429 IS defending itself — it must keep escalating, not be filed as our outage.
  "429 Too Many Requests — rate limit, slow down",
  "Page blocked after 2 retries (firecrawl): 403 Forbidden",
]) eq(isScraperInfraFailure(e), false, `theirs: ${e.slice(0, 48)}`);

// Greptile #2: a HEALTHY scraper fetching a dead or slow target relays the same words. The tool
// prefix is what tells them apart — `get: ...` is Scrapling reporting on the university, while
// `scrapling mcp unreachable: ...` is Scrapling failing to answer us at all.
for (const e of [
  "get: connect ECONNREFUSED 203.0.113.9:443",
  "get: getaddrinfo ENOTFOUND catalog.defunct-university.edu",
  "stealthy_fetch: Request timed out",
  "stealthy_fetch: socket hang up",
  "fetch: Request timed out",
]) eq(isScraperInfraFailure(e), false, `target relayed by a tool, not our outage: ${e.slice(0, 44)}`);

// ...and the same words WITHOUT a tool prefix are still ours (our fetch to Crawl4AI/Firecrawl).
for (const e of [
  "connect ECONNREFUSED 127.0.0.1:11235",
  "TypeError: fetch failed",
  "crawl4ai network error",
  "firecrawl network error",
]) eq(isScraperInfraFailure(e), true, `unrelayed network failure is ours: ${e.slice(0, 44)}`);

// An MCP-level timeout is ours even though it contains the same ambiguous words.
eq(isScraperInfraFailure("scrapling mcp unreachable after 2 attempts: MCP error -32001: Request timed out"), true,
   "mcp-level timeout stays ours");

eq(isScraperInfraFailure(null), false, "no error detail is not an infra failure");
eq(isScraperInfraFailure(undefined), false, "undefined is not an infra failure");
eq(isScraperInfraFailure(""), false, "empty string is not an infra failure");

// The existing classifier keeps its behaviour — this is additive, not a rewrite.
eq(classifyFailure("ai_transient: 503"), "ai_5xx", "ai_transient still wins first");
eq(classifyFailure("blocked by WAF"), "anti_bot", "blocked is still anti_bot");
eq(classifyFailure("ECONNREFUSED 127.0.0.1:5432"), "other", "a DB refusal is still not an AI 5xx");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
