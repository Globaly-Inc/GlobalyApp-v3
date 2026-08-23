// Phase 9 — knowledge freshness.
//
// last_crawled_at says when a machine last fetched a page. It says nothing about
// whether a human ever checked that what we stored is still true, and immigration
// figures go stale on a policy announcement, not on a crawl schedule.
//
//   last_verified_at — an admin looked at this and confirmed it (distinct from crawling)
//   effective_until  — a known expiry: a fee schedule, a cap, a temporary concession
//
// Both reach the counsellor: match_ai_knowledge_chunks() is recreated to return them,
// so a reply can say "verified in June" or flag that a figure is past its stated
// validity instead of stating stale numbers with full confidence (AC-10).

import type { Knex } from "knex";

const S = "superadmin";
const EMBEDDING_DIMS = 3072;

const DROP_FN = `DROP FUNCTION IF EXISTS ${S}.match_ai_knowledge_chunks(vector, int, text, text)`;

/** Postgres cannot change a function's return columns in place — drop and recreate. */
function createChunkFn(withFreshness: boolean): string {
  return `
    CREATE FUNCTION ${S}.match_ai_knowledge_chunks(
      query_embedding vector(${EMBEDDING_DIMS}),
      match_count int DEFAULT 8,
      filter_category_kind text DEFAULT NULL,
      filter_country_code text DEFAULT NULL
    )
    RETURNS TABLE (
      id uuid, document_id uuid, content text, heading_path text, page_number int,
      similarity float, title text, url text, file_name text, source_type text,
      category_label text, source_domain text, trust_tier text${
        withFreshness ? ",\n      last_verified_at timestamptz, effective_until date" : ""
      }
    )
    LANGUAGE sql STABLE
    AS $$
      -- Over-fetch inside the ORDER BY, then re-rank: HNSW post-filters, so a
      -- country + kind filter applied after the LIMIT can starve the result set.
      SELECT k.id, k.document_id, k.content, k.heading_path, k.page_number,
             1 - (k.embedding::halfvec(${EMBEDDING_DIMS}) <=> query_embedding::halfvec(${EMBEDDING_DIMS})) AS similarity,
             d.title, s.url, s.file_name, s.source_type,
             c.label AS category_label, s.domain AS source_domain, s.trust_tier${
               withFreshness ? ",\n             s.last_verified_at, s.effective_until" : ""
             }
      FROM ${S}.ai_knowledge_chunks k
      JOIN ${S}.ai_knowledge_documents d  ON d.id = k.document_id
      JOIN ${S}.ai_knowledge_sources s    ON s.id = d.source_id
      JOIN ${S}.ai_knowledge_categories c ON c.id = d.category_id
      WHERE d.active
        AND s.active
        AND k.embedding IS NOT NULL
        AND (filter_category_kind IS NULL OR c.kind = filter_category_kind)
        AND (filter_country_code IS NULL
             OR COALESCE(s.country_code, c.country_code) IS NULL
             OR COALESCE(s.country_code, c.country_code) = filter_country_code)
      ORDER BY k.embedding::halfvec(${EMBEDDING_DIMS}) <=> query_embedding::halfvec(${EMBEDDING_DIMS})
      LIMIT match_count
    $$;
  `;
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("ai_knowledge_sources", (t) => {
    t.timestamp("last_verified_at", { useTz: true }).nullable();
    t.date("effective_until").nullable();
  });

  // Drives the "verify the oldest first" admin view and the recrawl dispatcher's
  // work-list. NULLS FIRST because never-verified is the stalest state there is.
  await knex.raw(
    `CREATE INDEX idx_akd_sources_verified ON ${S}.ai_knowledge_sources (last_verified_at NULLS FIRST)
     WHERE active`,
  );

  await knex.raw(DROP_FN);
  await knex.raw(createChunkFn(true));
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(DROP_FN);
  await knex.raw(createChunkFn(false));
  await knex.raw(`DROP INDEX IF EXISTS ${S}.idx_akd_sources_verified`);
  await knex.schema.withSchema(S).alterTable("ai_knowledge_sources", (t) => {
    t.dropColumn("last_verified_at");
    t.dropColumn("effective_until");
  });
}
