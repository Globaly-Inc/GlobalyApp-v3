// Scraper — Scrapling (via its own MCP server) primary, Crawl4AI then Firecrawl fallback.
// Crawl4AI/Firecrawl cascade is a direct port of V1 supabase/functions/_shared/crawl4ai.ts.

import { gunzipSync } from "node:zlib";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config } from "../../../../config.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { isRegistrySuffix, isSameSite, siteOf } from "./html-utils.js";
import { assertPublicUrl, safeFetch, UnsafeUrlError } from "../../../../shared/public-url.js";

const logger = createChildLogger("scraper");

// Crawl4AI/Firecrawl calls below used a bare fetch() with no AbortSignal — a hung TCP connection
// (network partition, a stalled proxy, the provider itself wedging) held the page worker's queue
// item "processing" forever with nothing to time it out, which is the actual unbounded-hang case
// extraction-queue-reclaim.worker.ts exists to recover from. Bounding every external fetch here is
// the real fix for that; the reclaim sweep is then a backstop for a crashed process, not the only
// thing standing between a wedged socket and a stuck-forever job.
const EXTERNAL_FETCH_TIMEOUT_MS = 60_000;
const MAP_FETCH_TIMEOUT_MS = 120_000; // mapUrlsDetailed crawls a whole site (limit up to 10k URLs)

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScrapeOptions {
  onlyMainContent?: boolean;
  waitFor?: number;
  withLinks?: boolean;
  forceFirecrawl?: boolean;
  /** Firecrawl mobile emulation — some anti-bot walls only serve the mobile site. */
  mobile?: boolean;
  /**
   * Firecrawl proxy tier. "basic" (default) is a datacenter IP — the first thing a
   * university-wide WAF (Akamai/Cloudflare) blackholes. "auto" retries through
   * Firecrawl's residential/stealth proxy only if basic gets blocked (no extra
   * credit cost otherwise); "stealth" forces it. Unset = Firecrawl's own default.
   */
  proxy?: "basic" | "stealth" | "auto";
  /**
   * Click open any collapsed accordion/details/toggle before capturing (Firecrawl
   * executeJavascript action). Real bug, seen live on harvard.edu's "programs" pages:
   * the page isn't blocked at all (Firecrawl returns success every time) — the actual
   * degree listing only renders after a client click, so a static/rendered snapshot
   * comes back as an empty accordion shell (~95 chars) and our own length gate then
   * misclassifies it as "blocked", burning retries on proxy/mobile escalation that can
   * never fix a JS-interaction-gated page. Safe to always set: the click script no-ops
   * via querySelectorAll if nothing matches, so it never breaks a normal page.
   */
  expandCollapsed?: boolean;
}

export interface ScrapeResult {
  markdown: string;
  links: string[];
  scraper: "scrapling" | "crawl4ai" | "firecrawl" | "none";
  blocked?: boolean;
  notFound?: boolean;
  error?: string;
}

export interface MapOptions {
  limit?: number;
  includeSubdomains?: boolean;
}

export interface DiscoveryResult {
  urls: string[];
  method: "map" | "sitemap" | "page-links" | "seed-only";
  error?: string;
  insufficientCredits?: boolean;
  /**
   * How many URLs each source contributed, before dedupe. The "sitemap" method merges three
   * independent sources and each one swallows its own failure as `[]` — so a single total hides
   * which one died. A live Yale job logged a healthy "3252 URLs" while the course catalogue
   * (1,335 pages, ~98% of the useful ones) contributed zero, and nothing said so.
   */
  sources?: Record<string, number>;
}

const MIN_CONTENT_LEN = 200;

const NOT_FOUND_PATTERNS = [
  /page (could not be found|not found|doesn['’]?t exist|does not exist)/i,
  /\b404\b[^a-z0-9]{0,20}(error|not found|page)/i,
  /we (can|could)['’]?n[o]?t find (that|this|the) page/i,
  /sorry,? (we )?(couldn['’]?t|could not|can['’]?t) find/i,
];
const ACCESS_DENIED_PATTERNS = [
  /access (denied|forbidden)/i,
  /you don['’]?t have permission to access/i,
];
const NO_CONTENT_PATTERNS = [...NOT_FOUND_PATTERNS, ...ACCESS_DENIED_PATTERNS];

// ponytail: phrase-based soft-404 detector, not a content-density model — add one if a
// real page keeps slipping through with boilerplate-only content but no matching phrase.
function isUsableContent(content: string): boolean {
  if (content.length < MIN_CONTENT_LEN) return false;
  return !NO_CONTENT_PATTERNS.some((re) => re.test(content));
}

/** True only for "this URL doesn't exist" phrasing — not access-denied/anti-bot walls. */
function isDeadUrl(content: string): boolean {
  return NOT_FOUND_PATTERNS.some((re) => re.test(content));
}

function isDeadUrlSignal(content: string, error?: string | null): boolean {
  if (isDeadUrl(content)) return true;
  return !!error && /\b404\b/.test(error);
}

/** Human-readable reason a rejected scrape had no usable content, for admin-visible errors. */
function unusableReason(content: string): string {
  if (content.length < MIN_CONTENT_LEN) return `page content too short (${content.length} chars)`;
  if (isDeadUrl(content)) return "source page reports the content doesn't exist (404 / not found)";
  if (ACCESS_DENIED_PATTERNS.some((re) => re.test(content))) return "page reports access denied (possible anti-bot block)";
  return "page content unusable";
}

// ─── Human-like fetch helpers ───────────────────────────────────────────────

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function humanHeaders(referer?: string): Record<string, string> {
  const ua = pickUserAgent();
  const isChrome = ua.includes("Chrome");
  const h: Record<string, string> = {
    "User-Agent": ua,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9,en-US;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Upgrade-Insecure-Requests": "1",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };
  if (isChrome) {
    h["Sec-Fetch-Dest"] = "document";
    h["Sec-Fetch-Mode"] = "navigate";
    h["Sec-Fetch-Site"] = referer ? "same-origin" : "none";
    h["Sec-Fetch-User"] = "?1";
    h["sec-ch-ua"] = '"Chromium";v="121", "Not A(Brand";v="99"';
    h["sec-ch-ua-mobile"] = "?0";
    h["sec-ch-ua-platform"] = '"macOS"';
  }
  if (referer) h["Referer"] = referer;
  return h;
}

export function politeDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(minMs + Math.random() * Math.max(0, maxMs - minMs));
  return new Promise((r) => setTimeout(r, ms));
}

/** Last RESERVED slot per host — a time already promised to a caller, not a time a request was
 *  observed to happen. See nextHostSlot. */
const lastHostHit = new Map<string, number>();
// ponytail: 800ms is polite enough for edu sites; set HOST_THROTTLE_MS=1500 if you get 429s
const MIN_HOST_GAP_MS = Number(process.env.HOST_THROTTLE_MS) || 800;

/**
 * The next moment a request to this host may go out, given the last slot already handed out. Pure.
 *
 * The slot must be RESERVED before the caller sleeps, not recorded after it wakes. Reading the
 * last hit, sleeping, then writing paces sequential callers correctly but does nothing for
 * concurrent ones: ten page-worker consumers calling at once all read the same timestamp, all
 * compute the same wait, and all fire together — a thundering herd wearing a throttle.
 *
 * Honest about the evidence: this fixes a throttle that provably did not throttle (see the
 * concurrency test), but NO target site in this pipeline's history has ever rate-limited or
 * blocked us — 1,490 recorded page errors, every one our own infrastructure, zero 429/403/
 * Cloudflare/captcha. The pacing is therefore precautionary, not a fix for an observed block:
 * it exists so a university does not ban the IP we crawl every institution from. Tune with
 * HOST_THROTTLE_MS if it costs more than it is worth on a given run.
 *
 * Reserving instead gives caller N the slot `last + N*gap`, so concurrency becomes a queue.
 */
export function nextHostSlot(lastSlot: number | undefined, now: number, gapMs: number): number {
  return Math.max(now, (lastSlot ?? 0) + gapMs);
}

/**
 * Claim the next free slot for a host ACROSS PROCESSES, in one atomic upsert.
 *
 * `GREATEST(next_slot_at, now()) + gap` is the same reservation the in-process version does, but
 * the row lock serialises claimants from every worker process — extraction-job, -pages, -step and
 * -verify each run their own Node process with their own Map, so an in-process throttle alone
 * lets them collectively exceed the rate against one catalogue host.
 *
 * Returns the milliseconds to wait, or null when the shared table can't be used (not migrated
 * yet, DB blip) so the caller can fall back to in-process pacing rather than failing the scrape.
 */
async function reserveSharedHostSlot(host: string, gapMs: number): Promise<number | null> {
  try {
    const { rows } = await masterKnex.raw(
      `INSERT INTO ${S}.extraction_host_slots AS s (host, next_slot_at, updated_at)
       VALUES (?, now() + (? || ' milliseconds')::interval, now())
       ON CONFLICT (host) DO UPDATE
         SET next_slot_at = GREATEST(s.next_slot_at, now()) + (? || ' milliseconds')::interval,
             updated_at = now()
       RETURNING EXTRACT(EPOCH FROM (s.next_slot_at - (? || ' milliseconds')::interval - now())) * 1000 AS wait_ms`,
      [host, gapMs, gapMs, gapMs],
    );
    const waitMs = Number(rows?.[0]?.wait_ms ?? 0);
    return Number.isFinite(waitMs) ? Math.max(0, waitMs) : 0;
  } catch (err) {
    logger.warn("Shared host-slot reservation unavailable, pacing in-process only", { host, error: String(err) });
    return null;
  }
}

/** Exported for the concurrency test: the bug this guards against is a write-ordering one that a
 *  pure slot calculation cannot express — it only shows up when several callers await at once. */
export async function throttleForHost(url: string) {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return; // invalid url
  }

  const shared = await reserveSharedHostSlot(host, MIN_HOST_GAP_MS);
  if (shared !== null) {
    // The shared table is authoritative; keep the local map roughly in step so a later fallback
    // doesn't immediately hand out a slot the shared reservation already used.
    lastHostHit.set(host, Date.now() + shared);
    if (shared > 0) await new Promise((r) => setTimeout(r, shared));
    return;
  }

  const now = Date.now();
  const slot = nextHostSlot(lastHostHit.get(host), now, MIN_HOST_GAP_MS);
  lastHostHit.set(host, slot); // reserve BEFORE awaiting, or concurrent callers all take it
  const wait = slot - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export async function politeFetch(
  url: string,
  init: RequestInit = {},
  opts: { referer?: string; maxRetries?: number } = {},
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? 2;
  let attempt = 0;
  let lastRes: Response | null = null;
  while (attempt <= maxRetries) {
    await throttleForHost(url);
    const headers = { ...humanHeaders(opts.referer), ...(init.headers as Record<string, string> | undefined) };
    // safeFetch, not fetch: the URLs reaching here come from remote content — a sitemap index's
    // <loc> children and robots.txt's Sitemap: lines — and bare fetch follows redirects, so a
    // guard on the seed alone protects neither.
    const res = await safeFetch(url, { ...init, headers });
    lastRes = res;
    if (res.status !== 429 && res.status !== 503) return res;
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "", 10);
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 10_000)
      : Math.min(2000 * Math.pow(2, attempt), 8000) + Math.random() * 500;
    logger.warn(`${res.status} on ${url} — backing off ${Math.round(backoff)}ms (attempt ${attempt + 1}/${maxRetries})`);
    await new Promise((r) => setTimeout(r, backoff));
    attempt++;
  }
  return lastRes!;
}

// ─── Config ─────────────────────────────────────────────────────────────────

function getCrawl4aiConfig() {
  const baseUrlRaw = config.CRAWL4AI_BASE_URL;
  if (!baseUrlRaw) return null;
  const baseUrl = baseUrlRaw.replace(/\/+$/, "");
  const normalised = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
  return { baseUrl: normalised, apiKey: config.CRAWL4AI_API_KEY };
}

function getScraplingConfig() {
  const baseUrlRaw = config.SCRAPLING_BASE_URL;
  if (!baseUrlRaw) return null;
  const baseUrl = baseUrlRaw.replace(/\/+$/, "");
  const normalised = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
  return { baseUrl: normalised, apiKey: config.SCRAPLING_API_KEY };
}

function getFirecrawlKey() {
  return config.FIRECRAWL_API_KEY || null;
}

// ─── Crawl4AI ───────────────────────────────────────────────────────────────

function extractLinksFromMarkdown(markdown: string): string[] {
  const links = new Set<string>();
  const mdLink = /\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdLink.exec(markdown)) !== null) links.add(m[1]);
  const bare = /(https?:\/\/[^\s)<>"']+)/g;
  while ((m = bare.exec(markdown)) !== null) links.add(m[1]);
  return [...links];
}

async function crawl4aiScrape(
  url: string,
  filter: "fit" | "raw",
  cfg: { baseUrl: string; apiKey?: string },
): Promise<{ markdown: string; error?: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // ponytail: new Crawl4AI Cloud uses X-API-Key, legacy self-hosted uses Bearer
  if (cfg.apiKey) {
    headers["X-API-Key"] = cfg.apiKey;
    headers["Authorization"] = `Bearer ${cfg.apiKey}`;
  }
  try {
    // Try new Cloud API first (/v1/crawl), fall back to legacy /md
    const newRes = await fetch(`${cfg.baseUrl}/v1/crawl`, {
      method: "POST",
      headers,
      body: JSON.stringify({ urls: [url], content_format: filter === "fit" ? "fit_markdown" : "raw_markdown" }),
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
    });
    if (newRes.ok) {
      const data: any = await newRes.json().catch(() => ({}));
      const result = Array.isArray(data?.results) ? data.results[0] : data;
      const markdown = result?.markdown || result?.fit_markdown || result?.raw_markdown || "";
      return { markdown, error: result?.success === false ? "crawl4ai returned success=false" : undefined };
    }
    // Fall back to legacy /md endpoint (self-hosted)
    const res = await fetch(`${cfg.baseUrl}/md`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url, f: filter }),
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return { markdown: "", error: data?.detail || data?.error || `HTTP ${res.status}` };
    const markdown = typeof data?.markdown === "string" ? data.markdown : "";
    return { markdown, error: data?.success === false ? "crawl4ai returned success=false" : undefined };
  } catch (err) {
    return { markdown: "", error: err instanceof Error ? err.message : "crawl4ai network error" };
  }
}

// ─── Scrapling (via its own MCP server) ────────────────────────────────────

let mcpClient: Client | null = null;
let mcpClientBaseUrl: string | null = null;

const MCP_CONNECT_TIMEOUT_MS = 8_000;
const MCP_CONNECT_ATTEMPTS = 2;

async function getMcpClient(cfg: { baseUrl: string; apiKey?: string }): Promise<Client> {
  if (mcpClient && mcpClientBaseUrl === cfg.baseUrl) return mcpClient;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MCP_CONNECT_ATTEMPTS; attempt++) {
    const transport = new StreamableHTTPClientTransport(new URL(`${cfg.baseUrl}/mcp`), {
      requestInit: cfg.apiKey ? { headers: { Authorization: `Bearer ${cfg.apiKey}` } } : undefined,
    });
    const client = new Client({ name: "globalyapp-backend", version: "1.0.0" });
    try {
      await client.connect(transport, { timeout: MCP_CONNECT_TIMEOUT_MS });
      logger.info(`scrapling mcp connected at ${cfg.baseUrl}/mcp`);
      mcpClient = client;
      mcpClientBaseUrl = cfg.baseUrl;
      return client;
    } catch (err) {
      lastErr = err;
      logger.warn(`scrapling mcp connect attempt ${attempt}/${MCP_CONNECT_ATTEMPTS} failed — ${err instanceof Error ? err.message : String(err)}`);
      if (attempt < MCP_CONNECT_ATTEMPTS) await politeDelay(500, 500);
    }
  }
  const reason = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`scrapling mcp unreachable after ${MCP_CONNECT_ATTEMPTS} attempts: ${reason}`);
}

type ScraplingExtractionType = "markdown" | "html";

interface ScraplingToolResult {
  status?: number;
  content?: string[];
  url?: string;
}

const SCRAPLING_TIERS: { tool: string; timeoutMs: number; browser?: boolean; args: Record<string, unknown> }[] = [
  // follow_redirects "safe" is Scrapling's own SSRF guard — it follows redirects but refuses ones
  // aiming at private or link-local addresses. It is the default, set explicitly so a Scrapling
  // upgrade changing that default cannot silently reopen the hole. assertPublicUrl only validates
  // the URL we hand over; this is what covers the hops after it.
  //
  // The two browser tiers below take no such option — a browser follows redirects natively — and
  // they run in a container ON THIS HOST, so a catalogue that makes tier 1 fail can still escalate
  // to one and be redirected inward. Egress policy on the Scrapling container (deny RFC1918 and
  // 169.254.0.0/16) is the control for that; it cannot be closed from here.
  { tool: "get", timeoutMs: 22_000, args: { timeout: 10, follow_redirects: "safe", max_redirects: 5 } },
  { tool: "stealthy_fetch", timeoutMs: 30_000, browser: true, args: { timeout: 25_000, network_idle: true, solve_cloudflare: true } },
  { tool: "fetch", timeoutMs: 35_000, browser: true, args: { timeout: 30_000, network_idle: true } },
];

/**
 * How many browser-tier calls may be in flight at once, per process.
 *
 * Scrapling spawns a real Chromium for `stealthy_fetch`/`fetch` and does not reap it. Measured
 * 2026-09-17 with no limit: the container went from 4 processes to ~1,600 — 99% of its 2GiB —
 * in under a minute, after which it still answered MCP handshakes but could no longer open a
 * browser, so every scrape timed out and the page worker blamed the target site. Tier 1 `get` is
 * plain HTTP, spawns nothing, and is deliberately NOT gated: on the same run it served 138 of 138
 * successful scrapes while the two browser tiers served none.
 *
 * ponytail: per-process, so N worker processes allow N × this. Promote it to a slot table like
 * extraction_host_slots only if one process's share stops being the binding constraint.
 */
// `Number("two")` is NaN, and `Math.max(1, NaN)` is NaN — every `inFlight < NaN` is false, so the
// FIRST browser request queues itself as a waiter that nothing will ever wake. That is a permanent
// stall of every browser-tier scrape in the process, from one typo in an env var. `|| 2` catches
// NaN, 0 and "", Math.floor rejects "2.7", and Math.max rejects negatives — same shape as
// HOST_THROTTLE_MS above, which is why that one was never vulnerable to this.
const MAX_BROWSER_TIER_CONCURRENCY = Math.max(1, Math.floor(Number(process.env.SCRAPLING_BROWSER_CONCURRENCY) || 2));
let browsersInFlight = 0;
const browserWaiters: (() => void)[] = [];

async function acquireBrowserSlot(): Promise<void> {
  if (browsersInFlight < MAX_BROWSER_TIER_CONCURRENCY) { browsersInFlight++; return; }
  await new Promise<void>((resolve) => browserWaiters.push(resolve));
}

// The slot is HANDED to the next waiter without decrementing. Decrementing first and then waking
// someone lets a fresh caller see the free slot and take it before the waiter resumes, so both
// run and the limit is exceeded.
function releaseBrowserSlot(): void {
  const next = browserWaiters.shift();
  if (next) next();
  else browsersInFlight--;
}

export const __browserSlotInternals = { acquireBrowserSlot, releaseBrowserSlot, MAX_BROWSER_TIER_CONCURRENCY, inFlight: () => browsersInFlight };

/**
 * `mainContentOnly` maps to Scrapling's own `main_content_only`, which DEFAULTS TO TRUE on its
 * side. Never passing it cost us two silent failures:
 *   - `scrapeRenderedHtml` came back with the page's tab panels emptied, so a CourseLeaf
 *     catalogue's `table.sc_courselist` curriculum vanished — Johns Hopkins' Civil Engineering
 *     page returns 330,489 characters with 23 of those tables to curl and 236,634 characters
 *     with ZERO to us;
 *   - `ScrapeOptions.onlyMainContent` did nothing at all on the Scrapling path, which is why
 *     asking for the full page and asking for main content returned byte-identical markdown.
 */
async function scraplingScrape(
  url: string,
  cfg: { baseUrl: string; apiKey?: string },
  extractionType: ScraplingExtractionType,
  mainContentOnly: boolean,
): Promise<{ content: string; tierUsed?: string; error?: string }> {
  let client: Client;
  try {
    client = await getMcpClient(cfg);
  } catch (err) {
    // Connection-level failure (server down/unreachable) — drop the cached client so the next call retries fresh.
    mcpClient = null;
    mcpClientBaseUrl = null;
    return { content: "", error: err instanceof Error ? err.message : "scrapling mcp connection error" };
  }

  let lastError: string | undefined;
  for (const tier of SCRAPLING_TIERS) {
    if (tier.browser) await acquireBrowserSlot();
    try {
      // Inside the try, not before it: anything thrown between acquiring the slot and entering
      // this block would leak it, and a leaked slot is never returned — the process would
      // permanently lose one of its browser slots, and eventually all of them.
      logger.info(`scrapling mcp: calling tool "${tier.tool}" for ${url}`);
      const result = await client.callTool(
        {
          name: tier.tool,
          arguments: {
            url, extraction_type: extractionType, main_content_only: mainContentOnly, ...tier.args,
          },
        },
        undefined,
        { timeout: tier.timeoutMs },
      );
      if (result.isError) {
        lastError = `${tier.tool}: ${JSON.stringify(result.content)}`;
        logger.warn(`scrapling mcp: tool "${tier.tool}" errored for ${url} — ${lastError}`);
        continue;
      }
      const structured = result.structuredContent as ScraplingToolResult | undefined;
      const content = structured?.content?.join("\n") ?? "";
      if (isUsableContent(content)) {
        logger.info(`scrapling mcp: tool "${tier.tool}" succeeded for ${url} (${content.length} chars)`);
        return { content, tierUsed: tier.tool };
      }
      lastError = `${tier.tool}: ${unusableReason(content)}`;
      logger.info(`scrapling mcp: tool "${tier.tool}" insufficient for ${url} (${content.length} chars) — escalating`);
    } catch (err) {
      lastError = err instanceof Error ? `${tier.tool}: ${err.message}` : `${tier.tool} error`;
      logger.warn(`scrapling mcp: tool "${tier.tool}" threw for ${url} — ${lastError}`);
      mcpClient = null;
      mcpClientBaseUrl = null;
      try {
        client = await getMcpClient(cfg);
      } catch (reconnectErr) {
        lastError = reconnectErr instanceof Error ? reconnectErr.message : "scrapling mcp reconnect failed";
        break;
      }
    } finally {
      if (tier.browser) releaseBrowserSlot();
    }
  }
  return { content: "", error: lastError ?? "all scrapling tiers exhausted" };
}

// ─── Firecrawl ──────────────────────────────────────────────────────────────

// Generic click-open for common accordion/tab/toggle patterns — not Harvard-specific,
// add more selectors here if another site's collapse pattern slips through. Wrapped in
// try/catch per element and run via forEach (never throws on zero matches), unlike
// Firecrawl's dedicated `click` action which fails the whole scrape if the selector
// isn't found on the page.
const EXPAND_COLLAPSED_SCRIPT =
  `document.querySelectorAll('.c-accordion__header, [aria-expanded="false"], details:not([open]) summary, .accordion-header, .accordion-title, [data-toggle="collapse"], [data-bs-toggle="collapse"]').forEach(function(el){ try { el.click(); } catch(e) {} });`;

async function firecrawlScrape(
  url: string,
  apiKey: string,
  opts: ScrapeOptions,
): Promise<{ markdown: string; links: string[]; error?: string }> {
  const formats = opts.withLinks ? ["markdown", "links"] : ["markdown"];
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats,
        onlyMainContent: opts.onlyMainContent ?? true,
        waitFor: opts.waitFor ?? 2000,
        ...(opts.mobile ? { mobile: true } : {}),
        proxy: opts.proxy ?? "auto",
        ...(opts.expandCollapsed ? { actions: [
          { type: "executeJavascript", script: EXPAND_COLLAPSED_SCRIPT },
          { type: "wait", milliseconds: 1500 },
        ] } : {}),
      }),
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return { markdown: "", links: [], error: data?.error || `HTTP ${res.status}` };
    const markdown = data.data?.markdown || data.markdown || "";
    const links: string[] = data.data?.links || data.links || [];
    return { markdown, links };
  } catch (err) {
    return { markdown: "", links: [], error: err instanceof Error ? err.message : "firecrawl network error" };
  }
}

export async function scrapeRenderedHtml(
  url: string,
  opts: { waitFor?: number } = {},
): Promise<{ html: string; error?: string }> {
  // Guarded like scrapeMarkdown: this URL can come from a catalogue page's own anchors, so a
  // hostile or compromised source could otherwise aim it at localhost or the metadata endpoint.
  try {
    await assertPublicUrl(url);
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      logger.warn(`Refusing to fetch a non-public address: ${url} (${err.message})`);
      return { html: "", error: err.message };
    }
    throw err;
  }
  const scrapling = getScraplingConfig();
  if (scrapling) {
    // The WHOLE document: this exists to be parsed, and Scrapling's main-content extraction
    // strips exactly the tabbed panels a catalogue keeps its curriculum in.
    const s = await scraplingScrape(url, scrapling, "html", false);
    if (isUsableContent(s.content)) {
      logger.info(`scrapling OK (rendered html) for ${url} (tier: ${s.tierUsed ?? "unknown"}, ${s.content.length} chars)`);
      return { html: s.content };
    }
    logger.warn(`scrapling insufficient (rendered html) for ${url} (tier: ${s.tierUsed ?? "unknown"}) — falling through: ${s.error ?? "content too short"}`);
  }

  const apiKey = getFirecrawlKey();
  if (!apiKey) return { html: "", error: "firecrawl not configured" };
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["rawHtml"], onlyMainContent: false, waitFor: opts.waitFor ?? 8000 }),
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return { html: "", error: data?.error || `HTTP ${res.status}` };
    const html = data.data?.rawHtml || data.rawHtml || data.data?.html || data.html || "";
    return { html: typeof html === "string" ? html : "" };
  } catch (err) {
    return { html: "", error: err instanceof Error ? err.message : "firecrawl network error" };
  }
}

// ─── Main scrape function ───────────────────────────────────────────────────

/**
 * Scrape a URL to markdown.
 * Cascade: Scrapling → Crawl4AI fit → Crawl4AI raw → Firecrawl.
 *
 * Every URL is SSRF-checked here rather than only at the callers. This is the single
 * choke point through which user- and LLM-supplied URLs reach the network: the widget
 * site index, the admin rack crawler (an admin could add any URL as a source), and the
 * extraction pipeline's discovered links. A guard per caller would leave whichever one
 * gets added next unprotected.
 */
export async function scrapeMarkdown(url: string, opts: ScrapeOptions = {}): Promise<ScrapeResult> {
  try {
    await assertPublicUrl(url);
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      logger.warn(`Refusing to scrape a non-public address: ${url} (${err.message})`);
      // "none" is the existing all-scrapers-failed value; callers already treat it as
      // "no content" and skip the page, which is exactly the behaviour wanted here.
      return { markdown: "", links: [], scraper: "none" };
    }
    throw err;
  }

  // Pace PAGE scrapes per host, not just sitemap fetches. This was the one path with no throttle
  // at all: throttleForHost lived only inside politeFetch, while the page worker auto-scales to 10
  // concurrent consumers and a well-discovered university puts nearly every course URL on a single
  // catalogue host (Yale: 983 of 1,013 queued on catalog.yale.edu), so a whole job lands on one
  // server as a burst. Precautionary, not a response to an observed block — nothing has ever
  // rate-limited us (see nextHostSlot). Once at the top, so falling through Scrapling → Crawl4AI →
  // Firecrawl for one page doesn't pay the gap three times.
  await throttleForHost(url);

  const fcKey = getFirecrawlKey();
  const scrapling = opts.forceFirecrawl ? null : getScraplingConfig();
  const c4 = opts.forceFirecrawl ? null : getCrawl4aiConfig();

  // Path 0: Scrapling available
  if (scrapling) {
    const s = await scraplingScrape(url, scrapling, "markdown", opts.onlyMainContent ?? true);
    if (isUsableContent(s.content)) {
      logger.info(`scrapling OK for ${url} (tier: ${s.tierUsed ?? "unknown"}, ${s.content.length} chars)`);
      return {
        markdown: s.content,
        links: opts.withLinks ? extractLinksFromMarkdown(s.content) : [],
        scraper: "scrapling",
      };
    }
    logger.warn(`scrapling insufficient for ${url} (tier: ${s.tierUsed ?? "unknown"}) — falling through: ${s.error ?? "content too short"}`);
  }

  // Path A: Crawl4AI available
  if (c4) {
    const a1 = await crawl4aiScrape(url, "fit", c4);
    if (isUsableContent(a1.markdown)) {
      return {
        markdown: a1.markdown,
        links: opts.withLinks ? extractLinksFromMarkdown(a1.markdown) : [],
        scraper: "crawl4ai",
      };
    }
    const a2 = await crawl4aiScrape(url, "raw", c4);
    if (isUsableContent(a2.markdown)) {
      return {
        markdown: a2.markdown,
        links: opts.withLinks ? extractLinksFromMarkdown(a2.markdown) : [],
        scraper: "crawl4ai",
      };
    }
    // Crawl4AI blocked — try Firecrawl
    if (fcKey) {
      const fc = await firecrawlScrape(url, fcKey, opts);
      if (isUsableContent(fc.markdown)) {
        return { markdown: fc.markdown, links: fc.links, scraper: "firecrawl" };
      }
      return {
        markdown: fc.markdown, links: fc.links, scraper: "firecrawl", blocked: true,
        error: fc.error || a2.error || a1.error || unusableReason(fc.markdown),
        notFound: isDeadUrlSignal(fc.markdown, fc.error)
          || isDeadUrlSignal(a2.markdown, a2.error)
          || isDeadUrlSignal(a1.markdown, a1.error),
      };
    }
    return {
      markdown: "", links: [], scraper: "crawl4ai", blocked: true,
      error: a2.error || a1.error || unusableReason(a2.markdown),
      notFound: isDeadUrlSignal(a2.markdown, a2.error) || isDeadUrlSignal(a1.markdown, a1.error),
    };
  }

  // Path B: Firecrawl-only
  if (fcKey) {
    const fc = await firecrawlScrape(url, fcKey, opts);
    const usable = isUsableContent(fc.markdown);
    return {
      markdown: fc.markdown, links: fc.links, scraper: "firecrawl", blocked: !usable,
      error: fc.error || (usable ? undefined : unusableReason(fc.markdown)),
      notFound: !usable && isDeadUrlSignal(fc.markdown, fc.error),
    };
  }

  return { markdown: "", links: [], scraper: "none", error: "No scraper configured (set CRAWL4AI_BASE_URL or FIRECRAWL_API_KEY)" };
}

// ─── URL discovery ──────────────────────────────────────────────────────────

function extractLinksFromFirecrawlMap(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  const candidates: unknown[] = [d.links, (d.data as any)?.links, d.data];
  for (const c of candidates) {
    if (!Array.isArray(c)) continue;
    const urls = c
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && typeof (item as any).url === "string") return (item as any).url;
        return null;
      })
      .filter((u): u is string => !!u && /^https?:\/\//i.test(u));
    if (urls.length) return urls;
  }
  return [];
}

export async function mapUrlsDetailed(
  url: string,
  opts: MapOptions = {},
): Promise<{ success: boolean; links: string[]; status?: number; error?: string; insufficientCredits?: boolean }> {
  const fcKey = getFirecrawlKey();
  if (!fcKey) return { success: false, links: [], error: "Firecrawl not configured (mapping requires Firecrawl)" };

  for (const endpoint of ["https://api.firecrawl.dev/v2/map", "https://api.firecrawl.dev/v1/map"]) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, limit: opts.limit ?? 10000, includeSubdomains: opts.includeSubdomains ?? false }),
        signal: AbortSignal.timeout(MAP_FETCH_TIMEOUT_MS),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg: string = (typeof data?.error === "string" ? data.error : "") || `HTTP ${res.status}`;
        const insufficient = res.status === 402 || msg.toLowerCase().includes("insufficient credits");
        if (res.status === 404 && endpoint.includes("/v2/")) continue;
        return { success: false, links: [], status: res.status, error: msg, insufficientCredits: insufficient };
      }
      return { success: true, links: extractLinksFromFirecrawlMap(data) };
    } catch (err) {
      logger.warn(`Map error at ${endpoint}`, { error: err });
    }
  }
  return { success: false, links: [], error: "firecrawl network error" };
}

/** `Sitemap:` declarations in a robots.txt — the site's own authoritative list, often several and
 *  often at non-conventional paths. Anchored to line start so a URL containing "sitemap:" or a
 *  commented-out line can't masquerade as one. Pure. */
export function sitemapUrlsFromRobots(txt: string): string[] {
  return [...txt.matchAll(/^\s*sitemap:\s*(\S+)/gim)]
    .map((m) => m[1].trim())
    .filter((u) => /^https?:\/\//i.test(u));
}

/** Child sitemap URLs inside a `<sitemapindex>`. Pure. */
export function sitemapIndexChildren(xml: string): string[] {
  return [...xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi)].map((m) => m[1].trim());
}

/** Page URLs inside a `<urlset>`. Pure. */
export function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/gi)]
    .map((m) => m[1].trim())
    .filter((loc) => /^https?:\/\//i.test(loc));
}

/**
 * A sitemap body, decompressed when it is gzip. Pure.
 *
 * `fetch` transparently handles `Content-Encoding: gzip`, but NOT a gzipped FILE
 * (`sitemap.xml.gz`, served as application/gzip) — which large sites commonly publish as their
 * only sitemap. Reading that through `res.text()` yields binary, parses to zero URLs, and says
 * nothing. Detected by magic bytes rather than the extension, since servers disagree on both.
 */
export function decodeSitemapBody(buf: Buffer): string {
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try { return gunzipSync(buf).toString("utf8"); } catch { return ""; }
  }
  return buf.toString("utf8");
}

/** A sitemap index can legitimately list hundreds of children; `max` is the real budget, so this
 *  is only a runaway guard. Was 25, which silently truncated any site with per-faculty sitemaps. */
const SITEMAP_INDEX_CHILD_CAP = 200;
/** Indexes of indexes are real; bounded by `max` regardless. */
const SITEMAP_MAX_DEPTH = 3;
/** robots.txt may declare several; was 5. */
const ROBOTS_SITEMAP_CAP = 20;

/** A sitemap fetch had no timeout at all, so one hanging host (studies.yale.edu, seen live) stalls
 *  discovery for as long as the socket stays open — multiplied by every candidate and retry. */
const SITEMAP_FETCH_TIMEOUT_MS = 15_000;

type SitemapFetch =
  | { ok: true; text: string }
  /** The server answered, just not with a document — a 404 is a real answer, never retried. */
  | { ok: false; reachable: true }
  /** Nothing answered: DNS failure, refused, or a hang. Retrying the same HOST is near-useless. */
  | { ok: false; reachable: false };

/**
 * One sitemap document. Retries ONCE on a thrown error — politeFetch retries 429/503, but a
 * timeout or connection reset throws, and the old `catch { /* try next *␘/ }` swallowed it. That
 * is the failure that cost a live Yale job its course catalogue.
 *
 * The retry is deliberately NOT free: crt.sh hands back hosts that hold certificates but no longer
 * serve (dev boxes, decommissioned sites), and retrying each of 5 candidates on a dead host is 10
 * waits for nothing. So the caller is told whether the host answered AT ALL and bails on it.
 */
/**
 * Consecutive transport failures that retire a host even after it has answered.
 *
 * A host that answered is not condemned by one failed path — that was a real bug — but it cannot
 * be trusted indefinitely either: if its declared sitemaps or index children all hang, each costs
 * two attempts at a 15s timeout. At the caps above that is ~10 minutes for 20 robots declarations
 * and ~107 minutes for 200 index children, all of it a job sitting still.
 */
const HOST_FAILURE_LIMIT = 3;

export interface HostHealth {
  /** Something on this host has answered at least once. */
  alive: boolean;
  /** Transport failures since the last answer. */
  failures: number;
  /** Stop fetching from this host. */
  dead: boolean;
}

/**
 * Host health after one fetch result. Pure — the bookkeeping this encodes has now been wrong twice
 * (first condemning a live host on one failed path, then never retiring a host that went bad), so
 * it is testable on its own rather than buried in a closure.
 *
 * `answered` means the server replied AT ALL: a 404 proves the host is up just as well as a 200.
 */
export function updateHostHealth(
  prev: HostHealth | undefined,
  answered: boolean,
  limit = HOST_FAILURE_LIMIT,
): HostHealth {
  if (answered) return { alive: true, failures: 0, dead: false };
  const failures = (prev?.failures ?? 0) + 1;
  const alive = prev?.alive ?? false;
  // Never answered → dead on the first failure. Answered once → allowed `limit` failures before
  // being retired, so a single flaky path can't cost us a live host's declarations.
  return { alive, failures, dead: !alive || failures >= limit };
}

async function fetchSitemapDoc(url: string, seedUrl: string, opts: { retry?: boolean } = {}): Promise<SitemapFetch> {
  const attempts = opts.retry === false ? 1 : 2;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await politeDelay(200, 800);
      const res = await politeFetch(url, { signal: AbortSignal.timeout(SITEMAP_FETCH_TIMEOUT_MS) }, { referer: seedUrl });
      if (!res.ok) return { ok: false, reachable: true };
      return { ok: true, text: decodeSitemapBody(Buffer.from(await res.arrayBuffer())) };
    } catch (err) {
      if (attempt === attempts - 1) {
        logger.warn(`Sitemap fetch failed${attempts > 1 ? " after retry" : ""}: ${url}`, { error: String(err) });
        return { ok: false, reachable: false };
      }
      await politeDelay(500, 1500);
    }
  }
  return { ok: false, reachable: false };
}

export async function fetchSitemapUrls(seedUrl: string, max = 10000): Promise<string[]> {
  // Same guard: sitemapsFromLinkedHosts derives the host from a page's own links.
  try {
    await assertPublicUrl(seedUrl);
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      logger.warn(`Refusing to fetch a sitemap from a non-public address: ${seedUrl}`);
      return [];
    }
    throw err;
  }
  let origin = "";
  try { origin = new URL(seedUrl).origin; } catch { return []; }
  const seen = new Set<string>();
  const tried = new Set<string>();
  /** Hosts that answered nothing at all. crt.sh surfaces plenty of them; once a host has failed to
   *  respond, every remaining candidate on it is a wait for nothing.
   *
   *  A host is only dead until something on it answers. One path can time out on a perfectly live
   *  server — and since robots.txt and /sitemap.xml are fetched CONCURRENTLY, a slow /sitemap.xml
   *  used to condemn the origin while robots.txt was busy returning its authoritative list of
   *  sitemaps, which were then all skipped. Any answer at all (a 404 counts: the server replied)
   *  clears the host and keeps it cleared. */
  const health = new Map<string, HostHealth>();

  const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url; } };

  function noteHostHealth(url: string, r: SitemapFetch) {
    const host = hostOf(url);
    health.set(host, updateHostHealth(health.get(host), r.ok || r.reachable));
  }

  async function fetchDoc(url: string): Promise<string | null> {
    const host = hostOf(url);
    if (health.get(host)?.dead) return null;
    // A host that has already failed once this run doesn't get a second attempt per URL either —
    // that halves what a retiring host costs before HOST_FAILURE_LIMIT stops it entirely.
    const r = await fetchSitemapDoc(url, seedUrl, { retry: !health.get(host)?.failures });
    noteHostHealth(url, r);
    return r.ok ? r.text : null;
  }

  async function parse(xml: string, depth: number) {
    if (depth > SITEMAP_MAX_DEPTH || seen.size >= max) return;
    if (/<sitemapindex[\s>]/i.test(xml)) {
      for (const sub of sitemapIndexChildren(xml).slice(0, SITEMAP_INDEX_CHILD_CAP)) {
        if (seen.size >= max) return;
        if (tried.has(sub)) continue;
        tried.add(sub);
        const child = await fetchDoc(sub);
        if (child) await parse(child, depth + 1);
      }
      return;
    }
    for (const loc of sitemapLocs(xml)) {
      seen.add(loc);
      if (seen.size >= max) return;
    }
  }

  async function consume(url: string) {
    if (seen.size >= max || tried.has(url)) return;
    tried.add(url);
    const doc = await fetchDoc(url);
    if (doc) await parse(doc, 0);
  }

  // robots.txt is read ALWAYS, not as a last resort. It is the site's own declaration of where its
  // sitemaps live — frequently several, frequently not at /sitemap.xml — and the old code broke
  // out of the candidate loop as soon as /sitemap.xml returned anything, so those declarations
  // were never seen on any site that also had a conventional (possibly partial) sitemap.
  const robotsUrl = `${origin}/robots.txt`;
  const [robots] = await Promise.all([
    fetchSitemapDoc(robotsUrl, seedUrl),
    consume(`${origin}/sitemap.xml`),
  ]);
  // After BOTH land, so a robots.txt that answered clears any dead mark its concurrent
  // /sitemap.xml sibling left behind — otherwise the declarations below are skipped on a live host.
  noteHostHealth(robotsUrl, robots);
  const declared = robots.ok ? sitemapUrlsFromRobots(robots.text).slice(0, ROBOTS_SITEMAP_CAP) : [];
  for (const url of declared) await consume(url);

  // Only if nothing has been found yet: the other conventional spellings, and the gzipped form.
  // Skipped entirely for a host that never answered — that was costing 5 candidates x 2 attempts
  // of pure waiting per dead crt.sh host, with up to 25 of them per job.
  if (seen.size === 0 && !health.get(hostOf(origin))?.dead) {
    for (const url of [`${origin}/sitemap_index.xml`, `${origin}/sitemap-index.xml`, `${origin}/sitemap.xml.gz`]) {
      await consume(url);
      if (seen.size > 0 || health.get(hostOf(origin))?.dead) break;
    }
  }
  return [...seen];
}

/**
 * Hosts universities publish their course catalogue on. A big institution's www
 * sitemap is usually a marketing brochure — stanford.edu lists 27 pages and not one
 * course — while the catalogue lives on its own host with its own sitemap
 * (catalog.mit.edu has 437). Probing these costs one cheap HEAD-ish fetch each.
 */
const CATALOGUE_SUBDOMAINS = [
  "explorecourses", "bulletin", "catalog", "catalogue",
  "courses", "programs", "handbook", "study", "studies",
];

const CATALOGUE_HOST_RE = /catalog|catalogue|bulletin|explorecourses|handbook|curriculum|programs?\b|courses?\b/i;

/** The list above matches an exact prefix, so e-catalogue.jhu.edu is never probed. Match the
 *  hosts the site actually links to instead. */
async function sitemapsFromLinkedHosts(links: string[], limit: number): Promise<string[]> {
  const hosts = new Set<string>();
  for (const link of links) {
    try {
      const { hostname } = new URL(link);
      if (CATALOGUE_HOST_RE.test(hostname)) hosts.add(hostname);
    } catch { /* not a URL */ }
  }
  if (!hosts.size) return [];
  const found = await Promise.all(
    [...hosts].slice(0, 5).map(async (h) => {
      try { return await fetchSitemapUrls(`https://${h}`, limit); } catch { return []; }
    }),
  );
  return found.flat();
}

/** Try a sitemap first; a real content host that just 404s on sitemap.xml (Stanford's
 *  explorecourses/bulletin) still gets handed to the crawler as a live entry point instead
 *  of nothing at all. Shared by the wordlist probe below and the cert-log probe. */
async function sitemapOrRootFor(root: string, limit: number): Promise<string[]> {
  try {
    const urls = await fetchSitemapUrls(root, limit);
    if (urls.length) return urls;
  } catch { /* fall through to the reachability probe */ }
  try {
    const res = await safeFetch(root, { method: "GET", signal: AbortSignal.timeout(10_000) });
    return res.ok ? [res.url || root] : [];
  } catch {
    return [];
  }
}

/** Sitemaps from any catalogue subdomain that resolves. */
async function fetchCatalogueSitemaps(seedUrl: string, limit: number): Promise<string[]> {
  let site: string;
  try {
    // Registrable domain, so a seed of web.mit.edu still probes catalog.mit.edu.
    site = siteOf(seedUrl);
  } catch {
    return [];
  }
  const found = await Promise.all(
    CATALOGUE_SUBDOMAINS.map((sub) => sitemapOrRootFor(`https://${sub}.${site}`, limit)),
  );
  return found.flat();
}

/** Infra hosts a cert-transparency lookup returns alongside real content hosts — DNS/mail/CI
 *  plumbing, never a course catalogue. Matched against the leftmost label only. */
const INFRA_SUBDOMAIN_PREFIXES = new Set([
  "mail", "webmail", "autodiscover", "autoconfig", "ns", "ns1", "ns2", "ns3", "ns4",
  "mx", "mx1", "mx2", "smtp", "imap", "pop", "pop3", "ftp", "sftp", "vpn", "cpanel",
  "whm", "webdisk", "cname", "git", "svn", "jenkins", "jira", "confluence",
  "grafana", "kibana", "status", "monitor", "cdn",
]);

/** Leftmost label of a same-site host is DNS/mail/CI plumbing, never a course catalogue. */
function isInfraHost(host: string, site: string): boolean {
  if (host === site) return false;
  const prefix = host.slice(0, -(site.length + 1)).split(".")[0];
  return INFRA_SUBDOMAIN_PREFIXES.has(prefix);
}

/** Clean, same-site, non-infra hostnames named in one crt.sh `name_value` SAN blob (it can list
 *  several, newline-separated, and any of them may carry a wildcard prefix). */
function hostsFromNameValue(nameValue: string, site: string): string[] {
  return nameValue
    .split("\n")
    .map((name) => name.trim().toLowerCase().replace(/^\*\./, ""))
    .filter((host) => host && isSameSite(host, site) && !isInfraHost(host, site));
}

/**
 * crt.sh's JSON response → cleaned, same-site, non-infra hostnames, RANKED (catalogue-like
 * names first, via the same CATALOGUE_HOST_RE used for linked-host discovery) but NOT capped —
 * capping is the caller's job (see capCertLogHosts), kept separate so ranking stays testable on
 * its own. Pure — no network, so it degrades to [] on anything malformed rather than throwing.
 *
 * CATALOGUE_SUBDOMAINS above is a fixed 9-word list: it can never find a content host whose
 * name isn't one of those words (academic.stanford.edu, datascience.<institution>.com — seen
 * live, neither guessable nor linked from the pages already crawled). Every public TLS
 * certificate is logged permanently in Certificate Transparency logs, so this finds a real
 * subdomain regardless of what it's named or whether anything on the site links to it.
 */
export function parseCertLogHosts(raw: unknown, site: string): string[] {
  if (!Array.isArray(raw)) return [];
  const hosts = new Set<string>();
  for (const entry of raw) {
    const nameValue = (entry as { name_value?: string } | null)?.name_value;
    if (typeof nameValue === "string") {
      for (const host of hostsFromNameValue(nameValue, site)) hosts.add(host);
    }
  }
  // A big institution's cert history is mostly infra/CDN/marketing noise ahead of the one host
  // that matters (seen live: img/cdn hosts outnumber a real coursecatalog. host in crt.sh's own
  // order). Sort is stable, so within each group crt.sh's original order is kept.
  return [...hosts].sort((a, b) => Number(CATALOGUE_HOST_RE.test(b)) - Number(CATALOGUE_HOST_RE.test(a)));
}

/** ponytail: cap PROBES, not correctness — a large institution's cert history can run into the
 *  hundreds of hosts, and each one costs a real network fetch. Safe to cap hard because
 *  parseCertLogHosts already ranks catalogue-like names first — this can only ever trim the
 *  low-confidence tail, never the host that actually matters. Bump if a real site's course
 *  subdomain still isn't among the first N. */
const CERT_LOG_HOST_CAP = 25;

/** Pure split at the probe cap, so "did this actually drop something" is testable without a
 *  network call — the caller logs when `dropped` is non-empty instead of the cap firing silently. */
export function capCertLogHosts(ranked: string[], cap = CERT_LOG_HOST_CAP): { kept: string[]; dropped: string[] } {
  return { kept: ranked.slice(0, cap), dropped: ranked.slice(cap) };
}

/** politeFetch already retries a 429/503 with backoff; the gap is a thrown timeout/connection
 *  error, which isn't retried at all. crt.sh's real failure mode is slowness under a large
 *  query more often than a sustained outage, so one extra attempt after a short pause is cheap
 *  insurance — if the second attempt also throws, it propagates to the caller as before. */
async function fetchCrtSh(site: string): Promise<Response> {
  const url = `https://crt.sh/?q=%25.${site}&output=json`;
  try {
    return await politeFetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch {
    await politeDelay(1000, 2000);
    return await politeFetch(url, { signal: AbortSignal.timeout(15_000) });
  }
}

/** Subdomains Certificate Transparency logs know about that neither the wordlist nor the
 *  already-linked-hosts path would ever find. */
async function fetchCertLogSitemaps(seedUrl: string, limit: number): Promise<string[]> {
  let site: string;
  try {
    site = siteOf(seedUrl);
  } catch {
    return [];
  }
  // siteOf reduces a suffix it doesn't know to the registry itself (ui.ac.id -> "ac.id"), and
  // "%.ac.id" asks crt.sh for every Indonesian university. isSameSite would then accept all of
  // them, so we would probe and merge unrelated institutions into this job. Refuse, and name the
  // missing suffix — the real repair is one entry in MULTI_LABEL_SUFFIXES.
  if (isRegistrySuffix(site)) {
    logger.warn(`Skipping crt.sh: "${site}" is a registry suffix, not an institution — add it to MULTI_LABEL_SUFFIXES`, { seedUrl, site });
    return [];
  }
  let kept: string[];
  try {
    const res = await fetchCrtSh(site);
    if (!res.ok) return [];
    const ranked = parseCertLogHosts(await res.json(), site);
    const capped = capCertLogHosts(ranked);
    kept = capped.kept;
    if (capped.dropped.length) {
      logger.warn(`crt.sh probe cap reached for ${site} — dropping ${capped.dropped.length} lower-confidence hosts`, {
        site, kept: kept.length, dropped: capped.dropped.length, sample: capped.dropped.slice(0, 5),
      });
    }
  } catch (err) {
    logger.warn(`crt.sh lookup failed for ${site}`, { error: err });
    return [];
  }
  const found = await Promise.all(kept.map((h) => sitemapOrRootFor(`https://${h}`, limit)));
  return found.flat();
}

export async function discoverUrlsForCrawl(seedUrl: string, opts: MapOptions = {}): Promise<DiscoveryResult> {
  const limit = opts.limit ?? 5000;
  // Course catalogues live on subdomains far more often than not, and both the map
  // call and the URL filter used to exclude them.
  const mapOpts: MapOptions = { includeSubdomains: true, ...opts };

  // 1. Firecrawl map
  const map = await mapUrlsDetailed(seedUrl, mapOpts);
  if (map.success && map.links.length > 1) {
    return { urls: map.links, method: "map", sources: { map: map.links.length } };
  }
  // 2. sitemap.xml — the seed's, any catalogue subdomain that has one, plus anything
  // Certificate Transparency logs surface that the wordlist and already-linked-hosts
  // paths below could never find on their own (see fetchCertLogSitemaps).
  const [sitemap, catalogue, certLog] = await Promise.all([
    fetchSitemapUrls(seedUrl, limit),
    fetchCatalogueSitemaps(seedUrl, limit),
    fetchCertLogSitemaps(seedUrl, limit),
  ]);
  const merged = [...new Set([...sitemap, ...catalogue, ...certLog])];
  if (merged.length > 1) {
    return {
      urls: merged, method: "sitemap", error: map.error,
      sources: { seed_sitemap: sitemap.length, catalogue: catalogue.length, cert_log: certLog.length },
    };
  }
  // 3. Scrape seed page for links.
  const res = await scrapeMarkdown(seedUrl, { withLinks: true, onlyMainContent: false });
  if (res.links.length > 1) {
    const linked = await sitemapsFromLinkedHosts(res.links, limit);
    if (linked.length) {
      return { urls: [...new Set([...linked, ...res.links])], method: "sitemap", error: map.error };
    }
    return { urls: res.links, method: "page-links", error: map.error };
  }
  // 4. Seed URL only
  return { urls: [seedUrl], method: "seed-only", error: map.error || "No URLs discovered", insufficientCredits: map.insufficientCredits };
}
