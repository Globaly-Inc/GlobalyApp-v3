import type { Knex } from "knex";

// Adds trust_tier (from ai_knowledge_sources) to match_ai_knowledge_documents()
// so retrieval callers can weight results by source trust.
// Postgres cannot change a function's return columns in-place — drop and recreate.

const S = "superadmin";
const EMBEDDING_DIMS = 3072;

const DROP = `DROP FUNCTION IF EXISTS ${S}.match_ai_knowledge_documents(vector, int, text, text)`;

function createFn(withTrustTier: boolean): string {
  return `
    CREATE FUNCTION ${S}.match_ai_knowledge_documents(
      query_embedding vector(${EMBEDDING_DIMS}),
      match_count int DEFAULT 5,
      filter_category_kind text DEFAULT NULL,
      filter_country_code text DEFAULT NULL
    )
    RETURNS TABLE (
      id uuid, url text, title text, markdown text,
      similarity float, category_label text, source_domain text${withTrustTier ? ", trust_tier text" : ""}
    )
    LANGUAGE sql STABLE
    AS $$
      SELECT d.id, d.url, d.title, d.markdown,
             1 - (d.embedding::halfvec(${EMBEDDING_DIMS}) <=> query_embedding::halfvec(${EMBEDDING_DIMS})) AS similarity,
             c.label AS category_label,
             s.domain AS source_domain${withTrustTier ? ",\n             s.trust_tier" : ""}
      FROM ${S}.ai_knowledge_documents d
      JOIN ${S}.ai_knowledge_categories c ON c.id = d.category_id
      JOIN ${S}.ai_knowledge_sources s ON s.id = d.source_id
      WHERE d.active
        AND d.embedding IS NOT NULL
        AND (filter_category_kind IS NULL OR c.kind = filter_category_kind)
        AND (filter_country_code IS NULL OR c.country_code IS NULL OR c.country_code = filter_country_code)
      ORDER BY d.embedding::halfvec(${EMBEDDING_DIMS}) <=> query_embedding::halfvec(${EMBEDDING_DIMS})
      LIMIT match_count
    $$;
  `;
}

export async function up(knex: Knex): Promise<void> {
  await knex.raw(DROP);
  await knex.raw(createFn(true));
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(DROP);
  await knex.raw(createFn(false));
}
