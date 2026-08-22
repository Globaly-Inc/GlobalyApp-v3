// Shared AgentCIS HTTP client — base URL/auth header resolution and the paginated
// search fetch, used by both agentcis.service.ts (search, bulk-crawl) and
// extraction-agentcis.worker.ts (fetch-by-id). Previously duplicated in both places.

import { config } from "../../../../config.js";

export function agentcisBaseUrl(): string | null {
  return config.AGENTCIS_BASE_URL || null;
}

export function agentcisHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (config.AGENTCIS_API_KEY) h["Authorization"] = `Bearer ${config.AGENTCIS_API_KEY}`;
  return h;
}

/**
 * One page of AgentCIS's /search endpoint. Throws on a non-OK response so callers
 * decide their own retry/fallback policy (search tries progressively simpler params;
 * bulk-crawl and fetch-by-id just stop at the first failed page).
 */
export async function fetchAgentcisSearchPage(params: URLSearchParams): Promise<Record<string, unknown>[]> {
  const baseUrl = agentcisBaseUrl();
  if (!baseUrl) return [];
  const res = await fetch(`${baseUrl}/search?${params.toString()}`, { headers: agentcisHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AgentCIS ${res.status}: ${text.substring(0, 200)}`);
  }
  const json = await res.json();
  return (json.data || []) as Record<string, unknown>[];
}
