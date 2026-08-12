/**
 * StudyLink "agent-widget-v2" provider.
 * Ported from V2 _shared/agent-sources/studylink.ts.
 * Uses V3 politeFetch + scrapeMarkdown instead of V2 safe-fetch.
 */

import { politeFetch, scrapeMarkdown } from "../scraper.js";
import type { AgentSourceProvider, AgentRow, ProviderDetection, ProviderResult } from "./types.js";

const STUDYLINK_HOST_RE = /(^|\.)studylink\.com$/i;
const STUDYLINK_WIDGET_URL_RE = /https?:\/\/[a-z0-9-]+\.studylink\.com\/js\/agent-widget-v2\/[^"'\s)]*/i;
const STUDYLINK_IFRAME_RE = /<iframe[^>]+src=["']([^"']+studylink\.com[^"']*)["']/i;
const STUDYLINK_DIV_IFRAME_RE = /data-original-tag=["']iframe["'][^>]*src=["']([^"']+studylink\.com[^"']*)["']|src=["']([^"']+studylink\.com[^"']*)["'][^>]*data-original-tag=["']iframe["']/i;
const STUDYLINK_DIV_SRC_RE = /<div[^>]+id=["']agentWidget["'][^>]+src=["']([^"']+studylink\.com[^"']*)["']/i;

function isStudylinkUrl(url: string): boolean {
  try { return STUDYLINK_HOST_RE.test(new URL(url).hostname); } catch { return false; }
}

function originOf(url: string): string | null {
  try { return new URL(url).origin; } catch { return null; }
}

function stripHtml(s: string | null | undefined): string | null {
  if (!s) return null;
  return s
    .replace(/<br\s*\/?>/gi, ", ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim() || null;
}

interface AdmitItem {
  ExternalID?: number | string;
  Name?: string;
  AddressCountry?: string;
  Email?: string;
  PhoneNumber?: string;
  Website?: string;
  Address?: string;
  LogoUrl?: string;
}

interface CaptureItem {
  id?: number | string;
  name?: string;
  country_name?: string;
  email?: string;
  phone_number?: string;
  phone?: string;
  web_site_url?: string;
  website?: string;
  address?: string;
  logo_url?: string;
}

function admitToRow(it: AdmitItem): AgentRow {
  return {
    name: (it.Name || "").trim() || null,
    country: (it.AddressCountry || "").trim() || null,
    email: (it.Email || "").trim() || null,
    phone: (it.PhoneNumber || "").trim() || null,
    website: (it.Website || "").trim() || null,
    address: stripHtml(it.Address),
    logo_url: (it.LogoUrl || "").trim() || null,
    external_id: it.ExternalID != null ? `sl:${String(it.ExternalID)}` : null,
  };
}

function captureToRow(it: CaptureItem): AgentRow {
  return {
    name: (it.name || "").trim() || null,
    country: (it.country_name || "").trim() || null,
    email: (it.email || "").trim() || null,
    phone: ((it.phone_number || it.phone) || "").trim() || null,
    website: ((it.web_site_url || it.website) || "").trim() || null,
    address: stripHtml(it.address),
    logo_url: (it.logo_url || "").trim() || null,
    external_id: it.id != null ? `sl:${String(it.id)}` : null,
  };
}

async function readWidgetConfig(widgetUrl: string): Promise<{ source: "admit" | "capture"; baseUrl: string }> {
  const fallbackBase = originOf(widgetUrl) || "";
  try {
    const r = await politeFetch(widgetUrl);
    if (!r.ok) return { source: "admit", baseUrl: fallbackBase };
    const html = await r.text();
    const sourceMatch = html.match(/source\s*:\s*['"]([a-z]+)['"]/i);
    const baseMatch = html.match(/baseUrl\s*:\s*['"]([^'"]+)['"]/i);
    const source = (sourceMatch?.[1] || "admit").toLowerCase() === "capture" ? "capture" : "admit";
    const baseUrl = (baseMatch?.[1] || fallbackBase).replace(/\/+$/, "");
    return { source, baseUrl };
  } catch {
    return { source: "admit", baseUrl: fallbackBase };
  }
}

async function fetchAdmitAgents(baseUrl: string, widgetUrl: string): Promise<AgentRow[] | null> {
  const url = `${baseUrl}/webservices/public/index.cfm/institution_agencies?countryInSearch=1`;
  const res = await politeFetch(url, {
    headers: { "Accept": "application/json", "Referer": widgetUrl, "Origin": baseUrl },
  });
  if (!res.ok) return null;
  const json: unknown = await res.json().catch(() => null);
  if (!Array.isArray(json)) return null;
  return (json as AdmitItem[]).map(admitToRow);
}

async function fetchCaptureAgents(baseUrl: string, widgetUrl: string): Promise<AgentRow[] | null> {
  const url = `${baseUrl}/api/agent_widget/v1/agents?page_size=0`;
  const res = await politeFetch(url, {
    headers: { "Accept": "application/json", "Referer": widgetUrl, "Origin": baseUrl },
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null) as { items?: CaptureItem[] } | null;
  if (!json?.items || !Array.isArray(json.items)) return null;
  return json.items.map(captureToRow);
}

export const studylinkProvider: AgentSourceProvider = {
  id: "studylink",
  name: "StudyLink agent-widget-v2",

  detect(seedUrl, html) {
    if (isStudylinkUrl(seedUrl) && /agent-widget/i.test(seedUrl)) {
      return {
        providerId: "studylink",
        providerName: "StudyLink agent-widget-v2",
        resolvedUrl: seedUrl,
        meta: { widget_url: seedUrl, base_url: originOf(seedUrl) },
      };
    }
    if (!html) return null;
    let widgetUrl: string | null = null;
    for (const re of [STUDYLINK_DIV_SRC_RE, STUDYLINK_IFRAME_RE]) {
      const m = html.match(re);
      if (m?.[1]) { widgetUrl = m[1]; break; }
    }
    if (!widgetUrl) {
      const dm = html.match(STUDYLINK_DIV_IFRAME_RE);
      widgetUrl = dm ? (dm[1] || dm[2]) : null;
    }
    if (!widgetUrl) {
      const bm = html.match(STUDYLINK_WIDGET_URL_RE);
      widgetUrl = bm ? bm[0] : null;
    }
    if (!widgetUrl) return null;
    return {
      providerId: "studylink",
      providerName: "StudyLink agent-widget-v2",
      resolvedUrl: widgetUrl,
      meta: { widget_url: widgetUrl, base_url: originOf(widgetUrl) },
    };
  },

  async fetch(detection: ProviderDetection): Promise<ProviderResult | null> {
    const widgetUrl = detection.resolvedUrl;
    const cfg = await readWidgetConfig(widgetUrl);
    const baseUrl = cfg.baseUrl;
    if (!baseUrl) return null;

    const primary = cfg.source === "capture"
      ? () => fetchCaptureAgents(baseUrl, widgetUrl)
      : () => fetchAdmitAgents(baseUrl, widgetUrl);
    const secondary = cfg.source === "capture"
      ? () => fetchAdmitAgents(baseUrl, widgetUrl)
      : () => fetchCaptureAgents(baseUrl, widgetUrl);

    let agents = await primary();
    let strategy = `${cfg.source}_api`;
    if (!agents || agents.length === 0) {
      agents = await secondary();
      strategy = `${cfg.source === "capture" ? "admit" : "capture"}_api_fallback`;
    }

    if (agents && agents.length > 0) {
      return {
        agents,
        rawCount: agents.length,
        sourceUrl: `${baseUrl}/(${strategy})`,
        meta: { base_url: baseUrl, widget_url: widgetUrl, source: cfg.source, strategy },
      };
    }

    // Last-resort: JS-render the widget and hand markdown to the LLM.
    const r = await scrapeMarkdown(widgetUrl, {
      onlyMainContent: false,
      waitFor: 12_000,
      withLinks: false,
      forceFirecrawl: true,
    });
    if (!r.markdown || r.markdown.length < 400) return null;
    return {
      agents: [],
      rawCount: 0,
      sourceUrl: widgetUrl,
      meta: { widget_url: widgetUrl, base_url: baseUrl, source: cfg.source, strategy: "js_render", markdown: r.markdown.slice(0, 60_000) },
    };
  },
};
