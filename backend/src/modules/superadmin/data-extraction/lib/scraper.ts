// Scraper — Crawl4AI primary, Firecrawl fallback.
// Direct port of V1 supabase/functions/_shared/crawl4ai.ts.

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
}

export interface ScrapeResult {
  markdown: string;
  links: string[];
  scraper: "crawl4ai" | "firecrawl" | "none";
  blocked?: boolean;
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

// ─── Firecrawl ──────────────────────────────────────────────────────────────

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
 * Cascade: Crawl4AI fit → Crawl4AI raw → Firecrawl.
 */
export async function scrapeMarkdown(url: string, opts: ScrapeOptions = {}): Promise<ScrapeResult> {
  const fcKey = getFirecrawlKey();
  const c4 = opts.forceFirecrawl ? null : getCrawl4aiConfig();

  // Path A: Crawl4AI available
  if (c4) {
    const a1 = await crawl4aiScrape(url, "fit", c4);
    if (a1.markdown.length >= MIN_CONTENT_LEN) {
      return {
        markdown: a1.markdown,
        links: opts.withLinks ? extractLinksFromMarkdown(a1.markdown) : [],
        scraper: "crawl4ai",
      };
    }
    const a2 = await crawl4aiScrape(url, "raw", c4);
    if (a2.markdown.length >= MIN_CONTENT_LEN) {
      return {
        markdown: a2.markdown,
        links: opts.withLinks ? extractLinksFromMarkdown(a2.markdown) : [],
        scraper: "crawl4ai",
      };
    }
    // Crawl4AI blocked — try Firecrawl
    if (fcKey) {
      const fc = await firecrawlScrape(url, fcKey, opts);
      if (fc.markdown.length >= MIN_CONTENT_LEN) {
        return { markdown: fc.markdown, links: fc.links, scraper: "firecrawl" };
      }
      return { markdown: fc.markdown, links: fc.links, scraper: "firecrawl", blocked: true, error: fc.error || a2.error || a1.error || "Empty page" };
    }
    return { markdown: "", links: [], scraper: "crawl4ai", blocked: true, error: a2.error || a1.error || "Empty page" };
  }

  // Path B: Firecrawl-only
  if (fcKey) {
    const fc = await firecrawlScrape(url, fcKey, opts);
    return { markdown: fc.markdown, links: fc.links, scraper: "firecrawl", blocked: fc.markdown.length < MIN_CONTENT_LEN, error: fc.error };
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
