import type { Knex } from "knex";

const S = "superadmin";

// Per-institution website knowledge for embed widgets.
//
// An institution that installs the widget on its own site should be answerable about
// anything ON that site — scholarship terms, refund policy, admissions prose — not only
// what structured extraction captured. The Knowledge Rack already crawls, chunks and
// embeds arbitrary sites, so the institution's website becomes a rack source rather than
// a second pipeline.
//
// Institutions only, deliberately: the pre-existing `ai_knowledge_sources.business_id` is
// a `uuid` while `businesses.id` is an `integer`, so that column can never have referenced
// a business and is unused (0 of 58 rows). It is left alone rather than repaired here —
// businesses already answer from their matched extraction jobs, and retyping a live column
// is not this migration's job.
//
// The retrieval function gains the owner filter, and — the important half — its DEFAULT
// behaviour changes: with no owner passed it now returns ONLY unowned (global) sources.
// Without that, crawling one university's site would surface its pages in every other
// user's chat. Isolation keys off the owner column, not the category, so an institution's
// site index can sit in an ordinary category.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("ai_knowledge_sources", (t) => {
    // CASCADE, not SET NULL: if the institution goes, its private site index must go with
    // it rather than silently becoming global knowledge.
    t.integer("institution_id").nullable()
      .references("id").inTable("public.institutions").onDelete("CASCADE");
  });

  await knex.raw(`
    CREATE INDEX idx_akd_sources_institution ON ${S}.ai_knowledge_sources (institution_id)
    WHERE institution_id IS NOT NULL
  `);

  // Uniqueness has to become owner-aware. Two institution records legitimately share one
  // website — this database holds three rows on www.curtin.edu.au and three on
  // www.ibm.vic.edu.au — and the old blanket UNIQUE (category_id, url) meant the second
  // institution's site index collided with the first and was dropped.
  //
  // Split rather than widened to (category_id, url, institution_id): NULLs compare as
  // distinct in a Postgres unique index, so a single widened index would have silently
  // allowed duplicate GLOBAL sources for the same URL.
  await knex.raw(`ALTER TABLE ${S}.ai_knowledge_sources DROP CONSTRAINT IF EXISTS ai_knowledge_sources_category_id_url_unique`);
  await knex.raw(`DROP INDEX IF EXISTS ${S}.ai_knowledge_sources_category_id_url_unique`);
  await knex.raw(`
    CREATE UNIQUE INDEX ai_knowledge_sources_global_url_unique
    ON ${S}.ai_knowledge_sources (category_id, url)
    WHERE institution_id IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ai_knowledge_sources_owned_url_unique
    ON ${S}.ai_knowledge_sources (category_id, url, institution_id)
    WHERE institution_id IS NOT NULL
  `);

  // DROP first, not CREATE OR REPLACE: a different parameter list makes a second OVERLOAD
  // rather than replacing the function, and then any 2- or 4-arg call fails with
  // "function is not unique". Verified — it is exactly what happened on the first attempt.
  await knex.raw(`
    DROP FUNCTION IF EXISTS ${S}.match_ai_knowledge_chunks(vector, integer, text, text)
  `);

  await knex.raw(`
    CREATE FUNCTION ${S}.match_ai_knowledge_chunks(
      query_embedding vector,
      match_count integer DEFAULT 8,
      filter_category_kind text DEFAULT NULL::text,
      filter_country_code text DEFAULT NULL::text,
      filter_institution_id integer DEFAULT NULL::integer
    )
    RETURNS TABLE(id uuid, document_id uuid, content text, heading_path text, page_number integer,
                  similarity double precision, title text, url text, file_name text, source_type text,
                  category_label text, source_domain text, trust_tier text,
                  last_verified_at timestamp with time zone, effective_until date)
    LANGUAGE sql
    STABLE
    AS $function$
      -- Over-fetch inside the ORDER BY, then re-rank: HNSW post-filters, so a
      -- country + kind filter applied after the LIMIT can starve the result set.
      SELECT k.id, k.document_id, k.content, k.heading_path, k.page_number,
             1 - (k.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) AS similarity,
             d.title, s.url, s.file_name, s.source_type,
             c.label AS category_label, s.domain AS source_domain, s.trust_tier,
             s.last_verified_at, s.effective_until
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
        -- Owner scope. An institution asked for => only that institution's own sources.
        -- Nobody asked for => global knowledge only, so a private site index can never
        -- leak into the platform-wide counsellor.
        AND CASE
              WHEN filter_institution_id IS NOT NULL THEN s.institution_id = filter_institution_id
              ELSE s.institution_id IS NULL AND s.business_id IS NULL
            END
      ORDER BY k.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
      LIMIT match_count
    $function$
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP FUNCTION IF EXISTS ${S}.match_ai_knowledge_chunks(vector, integer, text, text, integer)
  `);
  // Restore the 4-arg body this migration replaced.
  await knex.raw(`
    CREATE FUNCTION ${S}.match_ai_knowledge_chunks(
      query_embedding vector,
      match_count integer DEFAULT 8,
      filter_category_kind text DEFAULT NULL::text,
      filter_country_code text DEFAULT NULL::text
    )
    RETURNS TABLE(id uuid, document_id uuid, content text, heading_path text, page_number integer,
                  similarity double precision, title text, url text, file_name text, source_type text,
                  category_label text, source_domain text, trust_tier text,
                  last_verified_at timestamp with time zone, effective_until date)
    LANGUAGE sql
    STABLE
    AS $function$
      SELECT k.id, k.document_id, k.content, k.heading_path, k.page_number,
             1 - (k.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) AS similarity,
             d.title, s.url, s.file_name, s.source_type,
             c.label AS category_label, s.domain AS source_domain, s.trust_tier,
             s.last_verified_at, s.effective_until
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
      ORDER BY k.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
      LIMIT match_count
    $function$
  `);
  await knex.raw(`DROP INDEX IF EXISTS ${S}.ai_knowledge_sources_owned_url_unique`);
  await knex.raw(`DROP INDEX IF EXISTS ${S}.ai_knowledge_sources_global_url_unique`);
  // Owned rows must go before the blanket unique index can come back — two institutions
  // on one URL are legal now and would violate it.
  await knex(`${S}.ai_knowledge_sources`).whereNotNull("institution_id").del();
  await knex.raw(`
    CREATE UNIQUE INDEX ai_knowledge_sources_category_id_url_unique
    ON ${S}.ai_knowledge_sources (category_id, url)
  `);
  await knex.raw(`DROP INDEX IF EXISTS ${S}.idx_akd_sources_institution`);
  await knex.schema.withSchema(S).alterTable("ai_knowledge_sources", (t) => {
    t.dropColumn("institution_id");
  });
}
