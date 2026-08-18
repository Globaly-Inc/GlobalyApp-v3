import type { MaraAgentDetail, MaraAgentItem } from "./types";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v3`;

/** V1's search_mara_agents RPC. Returns a bare array, as the RPC did. */
export async function searchMaraAgents(params: {
  q?: string;
  state?: string;
  limit?: number;
  offset?: number;
}): Promise<MaraAgentItem[]> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.state) qs.set("state", params.state);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  const res = await fetch(`${API_BASE}/migration-agents?${qs}`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error("Failed to load migration agents");
  return res.json();
}

/** V1's get_mara_agent_detail RPC, keyed on the MARN. */
export async function getMaraAgent(marn: string): Promise<MaraAgentDetail | null> {
  const res = await fetch(`${API_BASE}/migration-agents/${encodeURIComponent(marn)}`, {
    next: { revalidate: 300 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load migration agent");
  return res.json();
}
