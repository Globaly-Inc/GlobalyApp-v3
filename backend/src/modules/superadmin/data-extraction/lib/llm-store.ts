// DB side of llm-client: usage rows and the result cache. Kept apart from the client so a
// test can swap this module for an in-memory one and exercise the client's branch logic
// without a database or a Gemini key.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

const USAGE = `${S}.extraction_llm_usage`;
const CACHE = `${S}.extraction_llm_cache`;

export interface UsageRow {
  job_id: string | null;
  kind: string;
  model: string;
  prompt_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cache_hit: boolean;
}

export async function insertUsage(row: UsageRow): Promise<void> {
  await masterKnex(USAGE).insert(row);
}

export async function findCached(inputHash: string): Promise<unknown | undefined> {
  const row = await masterKnex(CACHE).where({ input_hash: inputHash }).select("result").first();
  return row?.result;
}

export async function saveCached(row: {
  input_hash: string;
  model: string;
  result: unknown;
  job_id: string | null;
  prompt_tokens: number;
  output_tokens: number;
}): Promise<void> {
  // DO NOTHING, not DO UPDATE: two workers racing on the same input both hold a valid
  // answer, and the first one in is as good as the second.
  await masterKnex(CACHE)
    .insert({ ...row, result: JSON.stringify(row.result) })
    .onConflict("input_hash")
    .ignore();
}

export async function bumpCacheHit(inputHash: string): Promise<void> {
  await masterKnex(CACHE)
    .where({ input_hash: inputHash })
    .update({ hit_count: masterKnex.raw("hit_count + 1"), last_hit_at: masterKnex.fn.now() });
}

export interface JobUsageTotals {
  calls: number;
  cache_hits: number;
  prompt_tokens: number;
  output_tokens: number;
}

export interface JobUsageByModel extends JobUsageTotals {
  model: string;
}

/** Per-model breakdown for one job's header. */
export async function jobUsageByModel(jobId: string): Promise<JobUsageByModel[]> {
  const rows = await masterKnex(USAGE)
    .where({ job_id: jobId })
    .groupBy("model")
    .select("model")
    .count("* as calls")
    .sum("prompt_tokens as prompt_tokens")
    .sum("output_tokens as output_tokens")
    .select(masterKnex.raw("count(*) filter (where cache_hit) as cache_hits"))
    .orderBy("model");
  return rows.map((r) => ({
    model: String(r.model),
    calls: Number(r.calls),
    cache_hits: Number(r.cache_hits),
    prompt_tokens: Number(r.prompt_tokens ?? 0),
    output_tokens: Number(r.output_tokens ?? 0),
  }));
}

/**
 * Subquery of per-job totals for the jobs list — joined, not looped, so the list stays one
 * query however many jobs it shows. ponytail: aggregated at read time over the indexed
 * (job_id) column; denormalise onto extraction_jobs if the list ever measurably slows.
 */
export function jobUsageTotalsSubquery() {
  return masterKnex(USAGE)
    .groupBy("job_id")
    .select("job_id")
    .count("* as usage_calls")
    .sum("prompt_tokens as usage_prompt_tokens")
    .sum("output_tokens as usage_output_tokens")
    .select(masterKnex.raw("count(*) filter (where cache_hit) as usage_cache_hits"))
    .as("u");
}
