// Extraction memory layer — recall site-specific patterns before LLM calls,
// store AI outputs for future similarity matching, build system prompt addenda.
// Uses pgvector cosine similarity for example retrieval.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { embed } from "./llm-client.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { domainOf } from "./html-utils.js";

const logger = createChildLogger("memory-client");
const S = "superadmin";

// ── Types ──

export interface SiteProfile {
  domain: string;
  canonical_institution_name: string | null;
  canonical_legal_name: string | null;
  fee_format_hint: string | null;
  intake_format_hint: string | null;
  notes: string | null;
  hints: unknown[];
}

export interface Lesson {
  id: string;
  scope: string;
  domain: string | null;
  step: string | null;
  rule: string;
  example_bad: string | null;
  example_good: string | null;
  weight: number;
}

export interface SimilarExample {
  source_excerpt: string;
  ai_output: unknown;
  similarity: number;
}

export interface RecalledMemory {
  siteProfile: SiteProfile | null;
  lessons: Lesson[];
  examples: SimilarExample[];
}

// ── Recall ──

export async function recallMemory(
  domain: string,
  step: string,
  sourceExcerpt?: string,
): Promise<RecalledMemory> {
  try {
    // Site profile
    const siteProfile = await masterKnex(`${S}.extraction_site_profiles`)
      .where({ domain })
      .first() as SiteProfile | undefined;

    // Lessons: domain-specific + global, active only, ordered by weight
    const lessons = await masterKnex(`${S}.extraction_lessons`)
      .where(function () {
        this.where({ domain, is_active: true })
          .orWhere({ scope: "global", is_active: true });
      })
      .where(function () {
        this.whereNull("step").orWhere({ step });
      })
      .orderBy("weight", "desc")
      .limit(20) as Lesson[];

    // Similar examples via cosine similarity (if sourceExcerpt provided)
    let examples: SimilarExample[] = [];
    if (sourceExcerpt) {
      try {
        const vec = await embed(sourceExcerpt);
        if (vec.length > 0) {
          // ponytail: pgvector <=> operator = cosine distance, lower = more similar
          // Cast to halfvec to hit the HNSW index (vector(3072) > HNSW max, halfvec(3072) is fine)
          const vecStr = `[${vec.join(",")}]`;
          const rows = await masterKnex.raw(`
            SELECT source_excerpt, ai_output,
                   (embedding::halfvec(3072) <=> ?::halfvec(3072)) as distance
            FROM ${S}.extraction_memory
            WHERE domain = ? AND step = ? AND embedding IS NOT NULL
            ORDER BY embedding::halfvec(3072) <=> ?::halfvec(3072)
            LIMIT 3
          `, [vecStr, domain, step, vecStr]);

          examples = (rows.rows || [])
            .filter((r: { source_excerpt: string | null }) => r.source_excerpt)
            .map((r: { source_excerpt: string; ai_output: unknown; distance: number }) => ({
              source_excerpt: r.source_excerpt,
              ai_output: r.ai_output,
              similarity: 1 - Number(r.distance), // convert distance to similarity
            }));
        }
      } catch (err) {
        // ponytail: embedding failures are non-fatal — proceed without examples
        logger.warn("Failed to retrieve similar examples", { domain, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return { siteProfile: siteProfile || null, lessons, examples };
  } catch (err) {
    logger.error("recallMemory failed", { domain, step, error: err instanceof Error ? err.message : String(err) });
    return { siteProfile: null, lessons: [], examples: [] };
  }
}

// ── Remember ──

export async function rememberMemory(opts: {
  job_id: string;
  domain: string;
  step: string;
  entity_type: string;
  entity_ref?: string;
  source_url?: string;
  source_excerpt?: string;
  ai_output: unknown;
}): Promise<void> {
  try {
    let embeddingVec: number[] | null = null;
    if (opts.source_excerpt) {
      try {
        embeddingVec = await embed(opts.source_excerpt);
      } catch {
        // ponytail: non-fatal — store without embedding
      }
    }

    const insert: Record<string, unknown> = {
      job_id: opts.job_id,
      domain: opts.domain,
      step: opts.step,
      entity_type: opts.entity_type,
      entity_ref: opts.entity_ref ?? null,
      source_url: opts.source_url ?? null,
      source_excerpt: opts.source_excerpt ?? null,
      ai_output: JSON.stringify(opts.ai_output),
    };

    if (embeddingVec && embeddingVec.length > 0) {
      insert.embedding = masterKnex.raw(`?::vector`, [`[${embeddingVec.join(",")}]`]);
    }

    await masterKnex(`${S}.extraction_memory`).insert(insert);
  } catch (err) {
    // ponytail: memory writes are best-effort, never block extraction
    logger.warn("rememberMemory failed", { domain: opts.domain, error: err instanceof Error ? err.message : String(err) });
  }
}

// ── System prompt addendum ──

export function buildSystemAddendum(recalled: RecalledMemory): string {
  const parts: string[] = [];

  if (recalled.siteProfile) {
    const p = recalled.siteProfile;
    const facts: string[] = [];
    if (p.canonical_institution_name) facts.push(`Institution name: ${p.canonical_institution_name}`);
    if (p.canonical_legal_name) facts.push(`Legal name: ${p.canonical_legal_name}`);
    if (p.fee_format_hint) facts.push(`Fee format: ${p.fee_format_hint}`);
    if (p.intake_format_hint) facts.push(`Intake format: ${p.intake_format_hint}`);
    if (p.notes) facts.push(`Notes: ${p.notes}`);
    if (facts.length > 0) {
      parts.push("LOCKED FACTS (use these exact values):\n" + facts.join("\n"));
    }
  }

  if (recalled.lessons.length > 0) {
    const rules = recalled.lessons.map((l) => {
      let line = `- ${l.rule}`;
      if (l.example_bad) line += ` (wrong: "${l.example_bad}")`;
      if (l.example_good) line += ` (correct: "${l.example_good}")`;
      return line;
    });
    parts.push("LEARNED RULES:\n" + rules.join("\n"));
  }

  if (recalled.examples.length > 0) {
    const exs = recalled.examples.map((e, i) => {
      const out = typeof e.ai_output === "string" ? e.ai_output : JSON.stringify(e.ai_output);
      return `Example ${i + 1} (similarity ${(e.similarity * 100).toFixed(0)}%):\nInput: ${e.source_excerpt.slice(0, 300)}\nOutput: ${out.slice(0, 500)}`;
    });
    parts.push("SIMILAR PAST EXTRACTIONS:\n" + exs.join("\n\n"));
  }

  return parts.join("\n\n");
}

// ── Helper: domain extraction (re-export for convenience) ──

export { domainOf };
