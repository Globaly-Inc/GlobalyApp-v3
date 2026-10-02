// Queue-level failure classification for the page worker's retry routing.
// ponytail: ported from V2's classifyFailure + routeFailure

export type FailureClass = "anti_bot" | "scraper_down" | "not_found" | "not_a_course" | "ai_5xx" | "parse_error" | "other";

/**
 * Did OUR scraping stack fail, rather than the target refusing us?
 *
 * These two look identical from the page worker — both end with no content — and the worker used
 * to hardcode `anti_bot` for every empty page. That single mislabel cost hours of live debugging:
 * the Scrapling container had leaked 2,821 Chromium processes into its 2GiB limit, so it answered
 * healthchecks and MCP handshakes but could not spawn a browser, and 500 pages of "anti_bot" on a
 * university catalogue read as a WAF block. The investigation went to rate limiting, per-host
 * pacing and trailing-slash redirects before `docker stats` showed the truth in one line.
 *
 * `anti_bot` says "the site is defending itself" → escalate proxy/mobile tiers, slow down.
 * `scraper_down` says "we are broken" → look at the container, not the target.
 */
/**
 * A Scrapling TOOL error is the target's behaviour relayed to us — `get: ... ENOTFOUND` is the
 * university's DNS, not ours; `stealthy_fetch: ... Request timed out` is the university being slow.
 * Our OWN Scrapling failures are connection- or protocol-level and never carry a tool prefix
 * (`scrapling mcp unreachable ...`, `MCP error -32001 ...`), and Crawl4AI/Firecrawl failures come
 * from our own fetch to their API. So the generic network words below mean "us" only when nothing
 * relayed them. Note `TypeError: fetch failed` has no colon after `fetch` and is correctly OURS.
 */
const TIER_RELAYED = /(?:^|[\s:])(get|stealthy_fetch|fetch):\s/;

export function isScraperInfraFailure(error?: string | null): boolean {
  if (!error) return false;
  const e = error.toLowerCase();
  // Unambiguous: these name our own component, whoever relayed them.
  const ours = (
    e.includes("mcp unreachable")
    || e.includes("mcp error")
    || e.includes("no scraper configured")
    || e.includes("insufficient credits")
    || (e.includes("firecrawl") && (e.includes("rate limit") || e.includes("quota")))
    || e.includes("crawl4ai network error")
    || e.includes("firecrawl network error")
    || e.includes("scrapling mcp connection error")
  );
  if (ours) return true;
  // Ambiguous: a healthy scraper fetching a dead target produces these too.
  if (TIER_RELAYED.test(e)) return false;
  return (
    e.includes("econnrefused")
    || e.includes("enotfound")
    || e.includes("socket hang up")
    || e.includes("fetch failed")
    || e.includes("request timed out")
  );
}

export function classifyFailure(error: string): FailureClass {
  const e = error.toLowerCase();
  // Authoritative tag from llm-client's withRetry: the AI call itself failed transiently.
  // Checked first — it may quote arbitrary upstream text that the sniffs below misread.
  if (e.includes("ai_transient:")) return "ai_5xx";
  if (e.includes("blocked") || e.includes("minimal_content") || e.includes("empty") || e.includes("anti-bot")) return "anti_bot";
  if (e.includes("not a course") || e.includes("blog") || e.includes("news") || e.includes("staff")) return "not_a_course";
  // Word-bounded status sniffs for errors that never pass through llm-client. The old
  // broad /5\d{2}/ matched any digit run starting with 5 — "ECONNREFUSED 127.0.0.1:5432"
  // classified a DB outage as an AI 5xx, and each retry re-scraped the page and re-billed
  // Gemini for an extraction that had already succeeded.
  if (/\b(429|5\d{2}|5xx)\b/.test(e) || e.includes("overloaded") || e.includes("rate limit")) return "ai_5xx";
  if (e.includes("parse") || e.includes("no structured data")) return "parse_error";
  return "other";
}
