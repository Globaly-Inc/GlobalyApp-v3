// AgentCIS search + import service.

import { createChildLogger } from "../../../../shared/logger.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { logAudit } from "../shared/audit.js";
import { agentcisBaseUrl, fetchAgentcisSearchPage } from "../lib/agentcis-client.js";

const logger = createChildLogger("agentcis-service");

export interface AgentCISResult {
  id: string | number | null;
  name: string;
  website: string | null;
  country: string | null;
  city: string | null;
}

/**
 * Search AgentCIS institutions. Returns empty results when API is not configured.
 */
export async function searchAgentCIS(query: string): Promise<AgentCISResult[]> {
  if (!agentcisBaseUrl()) {
    logger.warn("AGENTCIS_BASE_URL not configured — search returns empty");
    return [];
  }

  const q = query.trim();
  const limit = 50;

  // AgentCIS /search can 500 on some param combos — try progressively simpler queries.
  // include=country: without it, `country` on each result is a bare numeric id (e.g. 60)
  // AgentCIS never resolves — verified live, every search result showed country: null.
  const base = () => {
    const p = new URLSearchParams();
    p.set("page[number]", "1");
    p.set("page[size]", String(limit));
    p.set("include", "country");
    return p;
  };
  const attempts: URLSearchParams[] = [];
  if (q) {
    const a = base(); a.set("filter[name]", q); attempts.push(a);
    const b = base(); b.set("search", q); attempts.push(b);
  }
  attempts.push(base()); // unfiltered fallback

  let data: Record<string, unknown>[] = [];
  let lastErr: string | null = null;

  for (const params of attempts) {
    try {
      data = await fetchAgentcisSearchPage(params);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = (e as Error).message;
      logger.warn("Search attempt failed", { error: lastErr, params: params.toString() });
    }
  }

  if (lastErr && data.length === 0) {
    logger.error("All search attempts failed", { error: lastErr });
    return [];
  }

  const ql = q.toLowerCase();
  const filtered = q
    ? data.filter((d) => String(d.name || "").toLowerCase().includes(ql))
    : data;

  return filtered.slice(0, limit).map((d) => ({
    id: (d.id as string | number) ?? null,
    name: (d.name as string) || "Unnamed",
    website: (d.website as string) || null,
    country: mapCountrySimple(d.country),
    city: (d.city as string) || null,
  }));
}

/**
 * Queue AgentCIS imports. Publishes each institution_id to the AGENTCIS queue.
 */
export async function importAgentCIS(
  ids: string[],
  adminId: number,
): Promise<{ jobCount: number }> {
  for (const id of ids) {
    await queueService.publish(EXTRACTION_QUEUES.AGENTCIS, { institutionId: id });
  }

  await logAudit(adminId, "AGENTCIS_IMPORT_DISPATCH", {
    entityType: "agentcis",
    details: { institution_ids: ids, count: ids.length },
  });

  logger.info("Dispatched AgentCIS imports", { count: ids.length });
  return { jobCount: ids.length };
}

/**
 * Legacy bulk crawl (V1 parity) — scans a page range of AgentCIS's unfiltered institution
 * listing and queues every institution found, rather than requiring a search term. Reuses
 * importAgentCIS for the actual dispatch so both paths share one audit/queue code path.
 */
export async function bulkCrawlAgentCIS(
  startPage: number,
  maxPages: number,
  adminId: number,
): Promise<{ jobCount: number; pagesScanned: number }> {
  if (!agentcisBaseUrl()) {
    logger.warn("AGENTCIS_BASE_URL not configured — bulk crawl finds nothing");
    return { jobCount: 0, pagesScanned: 0 };
  }

  const limit = 50;
  const ids = new Set<string>();
  let pagesScanned = 0;

  for (let page = startPage; page < startPage + maxPages; page++) {
    const params = new URLSearchParams();
    params.set("page[number]", String(page));
    params.set("page[size]", String(limit));
    let data: Record<string, unknown>[];
    try {
      data = await fetchAgentcisSearchPage(params);
    } catch (e) {
      logger.warn("Bulk crawl page failed, stopping", { page, error: (e as Error).message });
      break;
    }
    pagesScanned++;
    if (data.length === 0) break; // ran off the end of the listing
    for (const d of data) {
      if (d.id != null) ids.add(String(d.id));
    }
    if (data.length < limit) break; // last page
  }

  const { jobCount } = await importAgentCIS([...ids], adminId);

  await logAudit(adminId, "AGENTCIS_BULK_CRAWL_DISPATCH", {
    entityType: "agentcis",
    details: { start_page: startPage, max_pages: maxPages, pages_scanned: pagesScanned, count: ids.size },
  });

  logger.info("Bulk crawl dispatched", { startPage, maxPages, pagesScanned, count: ids.size });
  return { jobCount, pagesScanned };
}

// ponytail: inline country coercion for search results, full normalizer only needed in worker
function mapCountrySimple(c: unknown): string | null {
  if (!c) return null;
  if (typeof c === "string") return c;
  if (typeof c === "object" && c !== null) {
    const o = c as Record<string, unknown>;
    // AgentCIS's resolved country object (via include=country) uses country_name, not
    // name — verified live against the real API. `name` kept as a fallback in case a
    // differently-shaped object ever comes through another code path.
    if (typeof o.country_name === "string") return o.country_name;
    if (typeof o.name === "string") return o.name;
  }
  return null;
}
