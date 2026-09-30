// Same-site link crawl through our own Scrapling, for sites whose sitemaps say too little.
// Firecrawl's map was the only crawler discovery had, so with its credits gone rochester.edu
// fell back to the homepage's 38 links — while /academics/programs.html, one hop away, links ~300
// programme pages. Fetches go through getPage, so every page crawled here is already cached when
// site_snapshot reaches it.

import { getPage } from "./page-store.js";
import { crawlRank, filterUrls } from "./html-utils.js";
import { extractLinksFromMarkdown } from "./scraper.js";

/** Paths worth following: the index pages a catalogue hangs off. Only these are fetched; every
 *  link found on a fetched page is still kept for the classifier. */
const HUB_PATH = /program|academic|degree|course|catalog|bulletin|undergrad|graduate|postgrad|major|stud(?:y|ies)|school|faculties|department|admission|content\.php|preview_program/i;

export function isHubLink(url: string): boolean {
  try {
    const u = new URL(url);
    return HUB_PATH.test(u.pathname + u.search);
  } catch {
    return false;
  }
}

function hostOf(url: string): string | null {
  try { return new URL(url).hostname; } catch { return null; }
}

function catoidOf(url: string): string | null {
  try { return new URL(url).searchParams.get("catoid"); } catch { return null; }
}

export const _crawlDeps = {
  // Re-read from the markdown too: rows cached before relative links were resolved carry only absolute ones.
  fetchLinks: async (url: string): Promise<string[]> => {
    const page = await getPage(url, { withLinks: true });
    return [...new Set([...page.links, ...extractLinksFromMarkdown(page.markdown, url)])];
  },
};

export interface CrawlResult { urls: string[]; fetched: number; stopped: boolean }

/** Below this many discovered URLs the sitemaps are treated as not describing the site. */
export const CRAWL_THIN = 300;
/** ponytail: fetch budget per job; Rochester's whole hub tree was 190 fetches. Raise if a real
 *  site's catalogue sits deeper. */
export const CRAWL_BUDGET = 300;

/** Where to crawl from. The homepage when discovery is thin; always a catalogue-like host that
 *  contributed only its root (catalog.csuohio.edu: Acalog, no sitemap, 1 URL). Pure. */
export function crawlSeeds(homepage: string, urls: string[]): string[] {
  const perHost = new Map<string, number>();
  for (const u of urls) {
    try { const h = new URL(u).hostname; perHost.set(h, (perHost.get(h) ?? 0) + 1); } catch { /* skip */ }
  }
  const rootOnly = urls.filter((u) => {
    try { return perHost.get(new URL(u).hostname) === 1 && crawlRank(u) === 1; } catch { return false; }
  });
  return [...new Set(urls.length < CRAWL_THIN ? [homepage, ...rootOnly] : rootOnly)];
}

/**
 * Breadth-first from `seeds`: fetch, keep every same-site link, follow only hub links, up to
 * `maxDepth` hops and `budget` fetches in total. `shouldStop` is checked between waves so a
 * paused job stops crawling. ponytail: waves run `concurrency` fetches at a time; getPage's own
 * per-host throttle is what keeps one host from being hammered.
 */
export async function crawlSite(
  seeds: string[],
  opts: { budget: number; maxDepth?: number; concurrency?: number; shouldStop?: () => Promise<boolean> },
): Promise<CrawlResult> {
  const { budget, maxDepth = 2, concurrency = 4, shouldStop } = opts;
  const scopeOf = new Map<string, string>();
  for (const seed of seeds) for (const u of filterUrls([seed], seed)) if (!scopeOf.has(u)) scopeOf.set(u, seed);
  const found = new Set<string>(scopeOf.keys());
  const visited = new Set<string>();
  let frontier = [...found];
  let fetched = 0;
  // Acalog catalogues, by the catoid their seed page links to. The seed shows only the CURRENT
  // catalogues; its "Archived Catalogs" page reaches every past year (csuohio: ~280 of 1,228 URLs
  // were catoid 1–46 beside the live 49/50), which would stage programmes that no longer run.
  // Per HOST: two catalogues on one site (catalog. and gradcatalog.) have unrelated catoid ranges.
  const currentCatoids = new Map<string, Set<string>>();

  for (let depth = 0; depth <= maxDepth && frontier.length && fetched < budget; depth++) {
    const next: string[] = [];
    for (let i = 0; i < frontier.length && fetched < budget; i += concurrency) {
      if (shouldStop && await shouldStop()) return { urls: [...found], fetched, stopped: true };
      const wave = frontier.slice(i, i + concurrency).filter((u) => !visited.has(u)).slice(0, budget - fetched);
      wave.forEach((u) => visited.add(u));
      fetched += wave.length;
      const results = await Promise.all(wave.map((u) => _crawlDeps.fetchLinks(u).catch(() => [] as string[])));
      for (let w = 0; w < results.length; w++) {
        const links = results[w];
        const scope = scopeOf.get(wave[w]) ?? seeds[0];
        // A host's current catalogues are the catoids on the FIRST page that links into that host,
        // at whatever depth it is reached — a second catalogue is often one hop in, not on the seed.
        const onThisPage = new Map<string, Set<string>>();
        for (const link of links) {
          const id = catoidOf(link);
          const host = hostOf(link);
          if (!id || !host || currentCatoids.has(host)) continue;
          if (!onThisPage.has(host)) onThisPage.set(host, new Set());
          onThisPage.get(host)!.add(id);
        }
        for (const [host, ids] of onThisPage) currentCatoids.set(host, ids);
        for (const link of filterUrls(links, scope)) {
          if (found.has(link)) continue;
          const catoid = catoidOf(link);
          const current = currentCatoids.get(hostOf(link) ?? "");
          if (current && catoid && !current.has(catoid)) continue;
          found.add(link);
          scopeOf.set(link, scope);
          if (isHubLink(link)) next.push(link);
        }
      }
    }
    frontier = next;
  }
  return { urls: [...found], fetched, stopped: false };
}
