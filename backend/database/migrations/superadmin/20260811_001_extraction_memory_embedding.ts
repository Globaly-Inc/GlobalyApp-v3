// Migration: Add embedding column to extraction_memory (pgvector),
// and missing updated_at to extraction_english_requirements + extraction_study_options.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // This is the FIRST migration in the chain to use the `vector` type, so it owns
  // enabling the extension. It used to document "must be enabled manually by a
  // superuser", and 20260814_001_ai_knowledge.ts later added the CREATE EXTENSION —
  // but that one runs three days further down the ordering, so a genuinely pristine
  // database failed here with `type "vector" does not exist`. The pristine-migration
  // gate only ever passed because the extension had been created by hand first.
  // Idempotent, and matches what 20260814_001 and 20260817_002 already do.
  await knex.raw("CREATE EXTENSION IF NOT EXISTS vector");

  await knex.raw(`
    ALTER TABLE superadmin.extraction_memory
      ADD COLUMN IF NOT EXISTS embedding vector(3072)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_extraction_memory_embedding
      ON superadmin.extraction_memory
      USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
  `);

  // Timestamp audit fixes — these tables were missing updated_at
  await knex.raw(`
    ALTER TABLE superadmin.extraction_english_requirements
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `);

  await knex.raw(`
    ALTER TABLE superadmin.extraction_study_options
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS superadmin.idx_extraction_memory_embedding`);
  await knex.raw(`ALTER TABLE superadmin.extraction_memory DROP COLUMN IF EXISTS embedding`);
  await knex.raw(`ALTER TABLE superadmin.extraction_english_requirements DROP COLUMN IF EXISTS updated_at`);
  await knex.raw(`ALTER TABLE superadmin.extraction_study_options DROP COLUMN IF EXISTS updated_at`);
}
