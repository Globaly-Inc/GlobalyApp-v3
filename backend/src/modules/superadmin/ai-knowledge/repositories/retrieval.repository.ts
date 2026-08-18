// Hybrid retrieval over superadmin.ai_knowledge_chunks.
//
// Two independent legs, fused with Reciprocal Rank Fusion — the design V2 proved in
// apps/ai-service/src/rag/retrieve.ts, ported with its constants (per-leg pool 20,
// RRF k = 60, unweighted legs):
//
//   vector leg  pgvector cosine distance over the HNSW index (halfvec cast, because
//               pgvector will not index a 3072-dim `vector` directly)
//   text leg    Postgres full-text: websearch_to_tsquery against the generated tsv
//
//   score(chunk) = 1/(60 + vector_rank) + 1/(60 + text_rank), missing rank → 0
//
// RRF is used instead of score blending because the two legs' scores are not on a
// common scale (cosine distance vs ts_rank) and normalising them is a tuning knob
// that has to be re-tuned per corpus. Ranks always compare.
//
// A FULL OUTER JOIN, not an inner one: a chunk found by only one leg still has to
// be able to win, which is the entire reason for running both.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { EMBEDDING_DIMS } from "../../data-extraction/lib/llm-client.js";

/** Rows each leg contributes before fusion. V2's value. */
export const RETRIEVAL_POOL = 20;
/** RRF damping constant. 60 is the value from Cormack et al., and V2's. */
export const RRF_K = 60;
export const DEFAULT_TOP_K = 5;
export const MAX_TOP_K = 50;

/** Which legs to run. "hybrid" is production; the other two exist to be compared against. */
export type RetrievalLegs = "hybrid" | "vector" | "text";

export interface RetrievalFilters {
  /** ai_knowledge_categories.kind */
  categoryKind?: string | null;
  /** ai_knowledge_categories.country_code — NULL on a category means "applies anywhere". */
  countryCode?: string | null;
}

export interface HybridSearchOptions extends RetrievalFilters {
  queryText: string;
  /** Null when no embedding could be produced — the vector leg is then omitted entirely. */
  queryEmbedding: number[] | null;
  topK?: number;
  poolSize?: number;
  rrfK?: number;
  legs?: RetrievalLegs;
}

export interface RetrievedChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  title: string | null;
  content: string;
  url: string;
  source_domain: string;
  category_label: string;
  category_kind: string;
  score: number;
  vector_rank: number | null;
  text_rank: number | null;
}

const HALF = `halfvec(${EMBEDDING_DIMS})`;

/**
 * Only active documents, from active sources, in active categories. A source that
 * has been deactivated is the closest thing this schema has to a soft delete, and
 * its documents must stop being retrievable the moment it is — otherwise
 * unpublishing a source is cosmetic.
 */
const VISIBILITY = `
  JOIN ${S}.ai_knowledge_documents d ON d.id = c.document_id AND d.active
  JOIN ${S}.ai_knowledge_sources s ON s.id = d.source_id AND s.active
  JOIN ${S}.ai_knowledge_categories cat ON cat.id = d.category_id AND cat.active
`;

// CAST(... AS text), never `:name::text` — knex reads a trailing colon after a
// named binding as "quote this as an identifier", so `:categoryKind::text` would
// silently render the *value* as a quoted column name.
const FILTERS = `
  AND (CAST(:categoryKind AS text) IS NULL OR cat.kind = CAST(:categoryKind AS text))
  AND (CAST(:countryCode AS text) IS NULL
       OR cat.country_code IS NULL
       OR cat.country_code = CAST(:countryCode AS text))
`;

const EMPTY_LEG = "SELECT NULL::uuid AS id, NULL::bigint AS rank WHERE false";

// ponytail: the per-leg pool is applied in a subquery so the HNSW / GIN index does
// the limiting, and row_number() only ranks the 20 survivors. Ranking first and
// limiting after (V2's shape) makes the planner sort the whole match set.
const VECTOR_LEG = `
  SELECT t.id, row_number() OVER (ORDER BY t.distance) AS rank
  FROM (
    SELECT c.id,
           c.embedding::${HALF}
             <=> CAST(CAST(:queryVector AS vector(${EMBEDDING_DIMS})) AS ${HALF}) AS distance
    FROM ${S}.ai_knowledge_chunks c
    ${VISIBILITY}
    WHERE c.embedding IS NOT NULL
    ${FILTERS}
    ORDER BY distance
    LIMIT :poolSize
  ) t
`;

const TEXT_LEG = `
  SELECT t.id, row_number() OVER (ORDER BY t.rank_score DESC) AS rank
  FROM (
    SELECT c.id, ts_rank(c.tsv, websearch_to_tsquery('english', :queryText)) AS rank_score
    FROM ${S}.ai_knowledge_chunks c
    ${VISIBILITY}
    WHERE c.tsv @@ websearch_to_tsquery('english', :queryText)
    ${FILTERS}
    ORDER BY rank_score DESC
    LIMIT :poolSize
  ) t
`;

/**
 * pgvector's text input form. Validated here rather than trusted: a wrong width or
 * a NaN is a caller bug, and Postgres's error for it is far less legible than this.
 */
function toVectorLiteral(vector: number[]): string {
  if (vector.length !== EMBEDDING_DIMS) {
    throw new Error(`Query embedding has ${vector.length} dims, expected ${EMBEDDING_DIMS}`);
  }
  for (const v of vector) {
    if (!Number.isFinite(v)) throw new Error("Query embedding contains a non-finite value");
  }
  return `[${vector.join(",")}]`;
}

export async function hybridSearch(opts: HybridSearchOptions): Promise<RetrievedChunk[]> {
  const topK = Math.min(Math.max(opts.topK ?? DEFAULT_TOP_K, 1), MAX_TOP_K);
  const poolSize = Math.max(opts.poolSize ?? RETRIEVAL_POOL, topK);
  const rrfK = opts.rrfK ?? RRF_K;
  const legs = opts.legs ?? "hybrid";

  const useVector = opts.queryEmbedding != null && legs !== "text";
  const useText = opts.queryText.trim().length > 0 && legs !== "vector";
  if (!useVector && !useText) return [];

  const sql = `
    WITH vec AS (
      ${useVector ? VECTOR_LEG : EMPTY_LEG}
    ), txt AS (
      ${useText ? TEXT_LEG : EMPTY_LEG}
    ), fused AS (
      SELECT COALESCE(v.id, x.id) AS id,
             COALESCE(1.0 / (:rrfK + v.rank), 0) + COALESCE(1.0 / (:rrfK + x.rank), 0) AS score,
             v.rank AS vector_rank,
             x.rank AS text_rank
      FROM vec v
      FULL OUTER JOIN txt x USING (id)
    )
    SELECT c.id, c.document_id, c.chunk_index, c.title, c.content,
           d.url, s.domain AS source_domain,
           cat.label AS category_label, cat.kind AS category_kind,
           f.score::float8 AS score, f.vector_rank, f.text_rank
    FROM fused f
    JOIN ${S}.ai_knowledge_chunks c ON c.id = f.id
    JOIN ${S}.ai_knowledge_documents d ON d.id = c.document_id
    JOIN ${S}.ai_knowledge_sources s ON s.id = d.source_id
    JOIN ${S}.ai_knowledge_categories cat ON cat.id = d.category_id
    -- (url, chunk_index) breaks score ties, not c.id: the primary key is a random
    -- uuid, so ordering on it makes two runs over identical content disagree and the
    -- recall gate stops being reproducible. This pair is the chunk's natural identity.
    ORDER BY f.score DESC, d.url, c.chunk_index
    LIMIT :topK
  `;

  // Only the bindings the assembled SQL actually references — a name that never
  // appears in the statement is a silent no-op at best and a mismatch at worst.
  const bindings: Record<string, unknown> = {
    categoryKind: opts.categoryKind ?? null,
    countryCode: opts.countryCode ?? null,
    poolSize,
    rrfK,
    topK,
  };
  if (useVector) bindings.queryVector = toVectorLiteral(opts.queryEmbedding!);
  if (useText) bindings.queryText = opts.queryText;

  const { rows } = await masterKnex.raw(sql, bindings);

  return (rows as Record<string, unknown>[]).map((r) => ({
    ...r,
    score: Number(r.score),
    vector_rank: r.vector_rank == null ? null : Number(r.vector_rank),
    text_rank: r.text_rank == null ? null : Number(r.text_rank),
  })) as RetrievedChunk[];
}
