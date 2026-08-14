// Migration: Add embedding column to extraction_memory (pgvector),
// and missing updated_at to extraction_english_requirements + extraction_study_options.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 3072-dim for Gemini gemini-embedding-001
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS vector`);
  await knex.raw(`
    ALTER TABLE superadmin.extraction_memory
      ADD COLUMN IF NOT EXISTS embedding vector(3072)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_extraction_memory_embedding
      ON superadmin.extraction_memory USING hnsw (embedding vector_cosine_ops)
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
