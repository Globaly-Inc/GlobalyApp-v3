import type { Knex } from "knex";

// This institution's AI counselling memory — what its counsellor has been told and has learned
// about HOW to counsel. One row per statement; the schema this lives in is what makes it theirs.
//
// Why the tenant schema rather than globalyapp: like ai_widget_visitors (20260916_001), this is
// the institution's own record, not platform infrastructure. Isolation is structural — a query
// on this table can only ever see one institution — so there is no institution_id column and
// no owner filter to forget. The cost, as with visitors, is app-level links to globalyapp
// (ai_counselor_messages.memory_ids points here) with no cross-schema FK.
//
// The embedding column needs pgvector resolvable from this schema's search_path
// (schema, public). SETUP.md installs the extension into public as a superuser step and the
// globalyapp migration 20260925_001 guards it; by the time a tenant migrates, it is there.
//
// No HNSW on purpose: memories per institution are hundreds, not millions; an exact cosine
// sort over one schema's rows cannot starve the way a post-filtered HNSW scan can.
// ponytail: add the halfvec HNSW (same DDL as superadmin idx_akc_embedding) if one institution
// ever passes ~50k rows.

const DIMS = 3072; // = EMBEDDING_DIMS in data-extraction/lib/llm-client.ts

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("institution_ai_memories", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("type").notNullable();
    t.text("content").notNullable();
    t.text("content_hash").notNullable();
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.text("source").notNullable();
    t.jsonb("source_reference").notNullable().defaultTo("{}");
    t.specificType("confidence", "real").notNullable().defaultTo(0.5);
    t.smallint("importance").notNullable().defaultTo(3);
    t.text("status").notNullable().defaultTo("candidate");
    t.integer("version").notNullable().defaultTo(1);
    t.integer("reinforce_count").notNullable().defaultTo(0);
    t.integer("use_count").notNullable().defaultTo(0);
    t.specificType("embedding", `vector(${DIMS})`).nullable();
    // Set by negative votes on human-authored rows. Votes never deprecate those; they flag.
    t.timestamp("flagged_at", { useTz: true }).nullable();
    // A learned candidate that contradicts this memory (Jev decides). Blocks auto-promotion
    // until a human approves or removes it.
    t.uuid("conflicts_with_id").nullable().references("id").inTable("institution_ai_memories").onDelete("SET NULL");
    // Why it is in the state it is in: [{at, event, reason?, by?}], newest last, capped at 30
    // by the single UPDATE that appends (see memory.repository transition()).
    t.jsonb("history").notNullable().defaultTo("[]");
    t.integer("created_by").nullable(); // app-level: globalyapp.platform_users.id
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("last_used_at", { useTz: true }).nullable();
    t.timestamp("expires_at", { useTz: true }).nullable();
  });
  await knex.raw(`
    ALTER TABLE institution_ai_memories
      ADD CONSTRAINT institution_ai_memories_confidence_check CHECK (confidence BETWEEN 0 AND 1),
      ADD CONSTRAINT institution_ai_memories_importance_check CHECK (importance BETWEEN 1 AND 5)
  `);
  // Partial: a deleted statement must not block the same statement being learned again.
  // Inserts name the predicate (ON CONFLICT (...) WHERE status <> 'deleted') so Postgres infers it.
  await knex.raw(`
    CREATE UNIQUE INDEX institution_ai_memories_dedupe
      ON institution_ai_memories (content_hash) WHERE status <> 'deleted'
  `);
  await knex.raw(`CREATE INDEX institution_ai_memories_lookup ON institution_ai_memories (status, type)`);
  await knex.raw(`
    CREATE INDEX institution_ai_memories_expiry ON institution_ai_memories (expires_at)
      WHERE expires_at IS NOT NULL AND status = 'active'
  `);
  await knex.raw(`
    CREATE INDEX institution_ai_memories_conflicts ON institution_ai_memories (conflicts_with_id)
      WHERE conflicts_with_id IS NOT NULL
  `);

  // Created in this schema, so the unqualified call from a tenant connection resolves here.
  // Not STRICT: STRICT would return nothing whenever filter_types is left at its NULL default.
  await knex.raw(`
    CREATE FUNCTION match_institution_ai_memories(
      query_embedding vector,
      match_count integer DEFAULT 12,
      filter_types text[] DEFAULT NULL,
      filter_statuses text[] DEFAULT ARRAY['active']
    )
    RETURNS TABLE (
      id uuid, type text, content text, metadata jsonb, source text, confidence real,
      importance smallint, status text, reinforce_count integer, use_count integer,
      similarity double precision
    )
    LANGUAGE sql STABLE AS $$
      SELECT m.id, m.type, m.content, m.metadata, m.source, m.confidence, m.importance, m.status,
             m.reinforce_count, m.use_count,
             1 - (m.embedding::halfvec(${DIMS}) <=> query_embedding::halfvec(${DIMS})) AS similarity
      FROM institution_ai_memories m
      WHERE m.embedding IS NOT NULL
        AND m.status = ANY(filter_statuses)
        AND (filter_types IS NULL OR m.type = ANY(filter_types))
        AND (m.expires_at IS NULL OR m.expires_at > now())
      ORDER BY m.embedding::halfvec(${DIMS}) <=> query_embedding::halfvec(${DIMS})
      LIMIT match_count
    $$
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Exact signature: a mismatched DROP leaves the function and a later CREATE makes an overload.
  await knex.raw(`DROP FUNCTION IF EXISTS match_institution_ai_memories(vector, integer, text[], text[])`);
  await knex.schema.dropTableIfExists("institution_ai_memories");
}
