// 20261001_001 gained convert_claimed_at / convert_claim_id / convert_failed_at after some
// databases had already run its first version (converted_branch_id only) — knex never re-runs a
// recorded migration, so those databases are missing them. Idempotent: adds only what's missing,
// and is a no-op wherever 20261001_001's final version ran. Don't delete either file (knex refuses
// to run anything when a recorded migration's file is gone).

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE superadmin.extraction_campuses
      ADD COLUMN IF NOT EXISTS converted_branch_id uuid,
      ADD COLUMN IF NOT EXISTS convert_claimed_at timestamptz,
      ADD COLUMN IF NOT EXISTS convert_claim_id uuid,
      ADD COLUMN IF NOT EXISTS convert_failed_at timestamptz
  `);
}

// Nothing to undo — 20261001_001's down() owns these columns.
export async function down(): Promise<void> {}
