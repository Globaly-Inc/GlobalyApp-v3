// AgentCIS search + import service.

import { config } from "../../../../config.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { logAudit } from "../shared/audit.js";

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
  const baseUrl = config.AGENTCIS_BASE_URL;
  if (!baseUrl) {
    logger.warn("AGENTCIS_BASE_URL not configured — search returns empty");
    return [];
  }

  const apiKey = config.AGENTCIS_API_KEY || null;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const q = query.trim();
  const limit = 50;

  // AgentCIS /search can 500 on some param combos — try progressively simpler queries.
  const base = () => {
    const p = new URLSearchParams();
    p.set("page[number]", "1");
    p.set("page[size]", String(limit));
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
    const url = `${baseUrl}/search?${params.toString()}`;
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const json = await res.json();
        data = (json.data || []) as Record<string, unknown>[];
        lastErr = null;
        break;
      }
      const text = await res.text();
      lastErr = `AgentCIS ${res.status}: ${text.substring(0, 200)}`;
      logger.warn("Search attempt failed", { status: res.status, url });
    } catch (e) {
      lastErr = (e as Error).message;
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

// ponytail: inline country coercion for search results, full normalizer only needed in worker
function mapCountrySimple(c: unknown): string | null {
  if (!c) return null;
  if (typeof c === "string") return c;
  if (typeof c === "object" && c !== null) {
    const o = c as Record<string, unknown>;
    if (typeof o.name === "string") return o.name;
  }
  return null;
}
