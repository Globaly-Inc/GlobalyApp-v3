// Port of V2 crawlPriority.ts — sitemap lastmod + recrawl prioritization.

import { politeFetch } from "./scraper.js";

// ─── Sitemap lastmod ──────────────────────────────────────────────────────────

/** Fetch sitemap.xml (or sitemap index) and return URL -> lastmod (ISO). */
export async function fetchSitemapLastmod(seedUrl: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let origin = "";
  try { origin = new URL(seedUrl).origin; } catch { return out; }

  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
  ];

  for (const url of candidates) {
    try {
      const res = await politeFetch(url);
      if (!res.ok) continue;
      const xml = await res.text();
      await parseSitemapInto(xml, out, origin, 0);
      if (out.size > 0) break;
    } catch { /* try next */ }
  }
  return out;
}

async function parseSitemapInto(xml: string, out: Map<string, string>, origin: string, depth: number) {
  if (depth > 2) return; // ponytail: cap recursion, bump if deeply-nested sitemaps appear

  // Sitemap index — recurse into nested <sitemap><loc> entries
  if (/<sitemapindex[\s>]/i.test(xml)) {
    const locs = [...xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi)]
      .map((m) => m[1].trim())
      .slice(0, 20);
    for (const sub of locs) {
      try {
        const r = await politeFetch(sub);
        if (!r.ok) continue;
        const txt = await r.text();
        await parseSitemapInto(txt, out, origin, depth + 1);
        if (out.size > 5000) return;
      } catch { /* skip */ }
    }
    return;
  }

  // Regular urlset
  const entries = xml.matchAll(/<url>([\s\S]*?)<\/url>/gi);
  for (const e of entries) {
    const block = e[1];
    const loc = block.match(/<loc>([^<]+)<\/loc>/i)?.[1]?.trim();
    if (!loc) continue;
    const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/i)?.[1]?.trim() ?? "";
    out.set(loc, lastmod);
    if (out.size > 5000) return;
  }
}

// ─── Recrawl prioritization ──────────────────────────────────────────────────

export interface PriorityInput {
  url: string;
  crawled_at?: string | null;
  lastmod?: string | null;
}

export interface PrioritizedUrl {
  url: string;
  score: number;
  reason: string;
}

const NEWS_RE = /\/(news|updates|announcements|press-release|statement-of-changes|whats-new)\b/i;
const DATED_RE = /\/(19|20)\d{2}([\/-](0[1-9]|1[0-2]))?(?=\/|$|\b)/;
const CURRENT_YEAR = new Date().getUTCFullYear();
const CURRENT_YEAR_RE = new RegExp(`/${CURRENT_YEAR}(/|-|$)`);

export function prioritizeForRecrawl(items: PriorityInput[]): PrioritizedUrl[] {
  const now = Date.now();
  const out: PrioritizedUrl[] = [];

  for (const it of items) {
    let score = 0;
    let reason = "kept";

    const lastmodMs = it.lastmod ? Date.parse(it.lastmod) : NaN;
    const crawledMs = it.crawled_at ? Date.parse(it.crawled_at) : NaN;
    const hasLastmod = Number.isFinite(lastmodMs);
    const hasCrawled = Number.isFinite(crawledMs);

    // Never crawled → highest priority
    if (!hasCrawled) {
      score += 15;
      reason = "new";
    } else if (hasLastmod && lastmodMs > crawledMs) {
      // Updated since last crawl
      const daysOld = (now - lastmodMs) / 86_400_000;
      score += 12 + (daysOld < 30 ? 3 : 0);
      reason = "stale";
    } else if (hasCrawled) {
      // Already crawled and unchanged — demote if recent
      const sinceCrawl = (now - crawledMs) / 86_400_000;
      if (sinceCrawl < 14) score -= 5;
    }

    // News/updates pattern boost
    if (NEWS_RE.test(it.url)) {
      score += 4;
      if (reason === "kept") reason = "fresh-news";
    }

    // Dated URL boost
    if (DATED_RE.test(it.url)) {
      score += 2;
      if (CURRENT_YEAR_RE.test(it.url)) score += 3;
      if (reason === "kept") reason = "dated";
    }

    // Lastmod freshness
    if (hasLastmod) {
      const daysSinceLastmod = (now - lastmodMs) / 86_400_000;
      if (daysSinceLastmod < 7) score += 4;
      else if (daysSinceLastmod < 30) score += 2;
      else if (daysSinceLastmod < 180) score += 1;
    }

    out.push({ url: it.url, score, reason });
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}
