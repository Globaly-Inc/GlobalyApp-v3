// Scraper — Scrapling (via its own MCP server) primary, Crawl4AI then Firecrawl fallback.
// Crawl4AI/Firecrawl cascade is a direct port of V1 supabase/functions/_shared/crawl4ai.ts.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config } from "../../../../config.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { siteOf } from "./html-utils.js";

const logger = createChildLogger("scraper");

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

const lastHostHit = new Map<string, number>();
// ponytail: 800ms is polite enough for edu sites; set HOST_THROTTLE_MS=1500 if you get 429s
const MIN_HOST_GAP_MS = Number(process.env.HOST_THROTTLE_MS) || 800;

async function throttleForHost(url: string) {
  try {
    const host = new URL(url).host;
    const last = lastHostHit.get(host) ?? 0;
    const wait = MIN_HOST_GAP_MS - (Date.now() - last);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastHostHit.set(host, Date.now());
  } catch { /* invalid url */ }
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
    const res = await fetch(url, { ...init, headers });
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

const SCRAPLING_TIERS: { tool: string; timeoutMs: number; args: Record<string, unknown> }[] = [
  { tool: "get", timeoutMs: 22_000, args: { timeout: 10 } },
  { tool: "stealthy_fetch", timeoutMs: 30_000, args: { timeout: 25_000, network_idle: true, solve_cloudflare: true } },
  { tool: "fetch", timeoutMs: 35_000, args: { timeout: 30_000, network_idle: true } },
];

async function scraplingScrape(
  url: string,
  cfg: { baseUrl: string; apiKey?: string },
  extractionType: ScraplingExtractionType,
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
    logger.info(`scrapling mcp: calling tool "${tier.tool}" for ${url}`);
    try {
      const result = await client.callTool(
        { name: tier.tool, arguments: { url, extraction_type: extractionType, ...tier.args } },
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
  const scrapling = getScraplingConfig();
  if (scrapling) {
    const s = await scraplingScrape(url, scrapling, "html");
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
 */
export async function scrapeMarkdown(url: string, opts: ScrapeOptions = {}): Promise<ScrapeResult> {
  const fcKey = getFirecrawlKey();
  const scrapling = opts.forceFirecrawl ? null : getScraplingConfig();
  const c4 = opts.forceFirecrawl ? null : getCrawl4aiConfig();

  // Path 0: Scrapling available
  if (scrapling) {
    const s = await scraplingScrape(url, scrapling, "markdown");
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

export async function fetchSitemapUrls(seedUrl: string, max = 10000): Promise<string[]> {
  let origin = "";
  try { origin = new URL(seedUrl).origin; } catch { return []; }
  const seen = new Set<string>();
  const candidates = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/sitemap-index.xml`, `${origin}/robots.txt`];
  const sitemapsFromRobots: string[] = [];

  async function parse(xml: string, depth: number) {
    if (depth > 2 || seen.size >= max) return;
    const isIndex = /<sitemapindex[\s>]/i.test(xml);
    if (isIndex) {
      const locs = [...xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi)]
        .map((m) => m[1].trim()).slice(0, 25);
      for (const sub of locs) {
        try {
          await politeDelay(200, 800);
          const r = await politeFetch(sub, {}, { referer: seedUrl });
          if (!r.ok) continue;
          await parse(await r.text(), depth + 1);
          if (seen.size >= max) return;
        } catch { /* skip */ }
      }
      return;
    }
    for (const m of xml.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/gi)) {
      const loc = m[1].trim();
      if (loc && /^https?:\/\//i.test(loc)) seen.add(loc);
      if (seen.size >= max) return;
    }
  }

  for (const url of candidates) {
    try {
      await politeDelay(200, 800);
      const res = await politeFetch(url, {}, { referer: seedUrl });
      if (!res.ok) continue;
      const txt = await res.text();
      if (url.endsWith("robots.txt")) {
        for (const m of txt.matchAll(/sitemap:\s*(\S+)/gi)) sitemapsFromRobots.push(m[1].trim());
        continue;
      }
      await parse(txt, 0);
      if (seen.size > 0) break;
    } catch { /* try next */ }
  }
  if (seen.size === 0 && sitemapsFromRobots.length) {
    for (const sm of sitemapsFromRobots.slice(0, 5)) {
      try {
        await politeDelay(200, 800);
        const r = await politeFetch(sm, {}, { referer: seedUrl });
        if (!r.ok) continue;
        await parse(await r.text(), 0);
        if (seen.size > 0) break;
      } catch { /* skip */ }
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
    CATALOGUE_SUBDOMAINS.map(async (sub) => {
      const root = `https://${sub}.${site}`;
      try {
        const urls = await fetchSitemapUrls(root, limit);
        if (urls.length) return urls;
      } catch { /* fall through to the reachability probe */ }

      // Stanford's explorecourses and bulletin answer on / but 404 on sitemap.xml.
      // Returning the root still hands the crawler a real entry point instead of
      // nothing at all.
      try {
        const res = await fetch(root, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(10_000) });
        return res.ok ? [res.url || root] : [];
      } catch {
        return [];
      }
    }),
  );
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
    return { urls: map.links, method: "map" };
  }
  // 2. sitemap.xml — the seed's, plus any catalogue subdomain that has one
  const [sitemap, catalogue] = await Promise.all([
    fetchSitemapUrls(seedUrl, limit),
    fetchCatalogueSitemaps(seedUrl, limit),
  ]);
  const merged = [...new Set([...sitemap, ...catalogue])];
  if (merged.length > 1) {
    return { urls: merged, method: "sitemap", error: map.error };
  }
  // 3. Scrape seed page for links
  const res = await scrapeMarkdown(seedUrl, { withLinks: true, onlyMainContent: false });
  if (res.links.length > 1) {
    return { urls: res.links, method: "page-links", error: map.error };
  }
  // 4. Seed URL only
  return { urls: [seedUrl], method: "seed-only", error: map.error || "No URLs discovered", insufficientCredits: map.insufficientCredits };
}
