/**
 * Generic iframe widget provider.
 * Ported from V2 _shared/agent-sources/iframe-generic.ts.
 *
 * Matches any iframe whose src host differs from the seed host.
 * JS-renders the iframe URL and returns markdown for downstream LLM extraction.
 */

import { scrapeMarkdown } from "../scraper.js";
import type { AgentSourceProvider, ProviderDetection, ProviderResult } from "./types.js";

const IFRAME_RE = /<iframe[^>]+src=["']([^"']+)["']/i;
const DIV_IFRAME_RE_1 = /data-original-tag=["']iframe["'][^>]*src=["']([^"']+)["']/i;
const DIV_IFRAME_RE_2 = /src=["']([^"']+)["'][^>]*data-original-tag=["']iframe["']/i;

function hostOf(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

export const iframeGenericProvider: AgentSourceProvider = {
  id: "iframe-generic",
  name: "Generic iframe widget",

  detect(seedUrl, html) {
    if (!html) return null;
    const m = html.match(IFRAME_RE) || html.match(DIV_IFRAME_RE_1) || html.match(DIV_IFRAME_RE_2);
    if (!m?.[1]) return null;
    let iframeUrl = m[1];
    try {
      iframeUrl = new URL(iframeUrl, seedUrl).toString();
    } catch { return null; }

    const seedHost = hostOf(seedUrl);
    const iframeHost = hostOf(iframeUrl);
    if (!iframeHost || !seedHost || iframeHost === seedHost) return null;

    return {
      providerId: "iframe-generic",
      providerName: `Iframe (${iframeHost})`,
      resolvedUrl: iframeUrl,
      meta: { iframe_url: iframeUrl, iframe_host: iframeHost },
    };
  },

  async fetch(detection: ProviderDetection): Promise<ProviderResult | null> {
    const r = await scrapeMarkdown(detection.resolvedUrl, {
      onlyMainContent: false,
      waitFor: 12_000,
      withLinks: false,
      forceFirecrawl: true,
    });
    if (!r.markdown || r.markdown.length < 400) return null;
    return {
      agents: [],
      rawCount: 0,
      sourceUrl: detection.resolvedUrl,
      meta: {
        iframe_url: detection.resolvedUrl,
        strategy: "js_render",
        markdown: r.markdown.slice(0, 60_000),
      },
    };
  },
};
