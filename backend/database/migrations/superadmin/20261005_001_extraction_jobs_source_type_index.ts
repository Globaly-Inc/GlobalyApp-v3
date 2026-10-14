// Business Management's "Spreadsheet import" / "AgentCIS import" / "Seeded" source filters look up
// extraction_jobs by source_type for every filtered list and count; All Extractions filters on it
// too. Without an index each of those is a full scan of extraction_jobs.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_extraction_jobs_source_type ON superadmin.extraction_jobs (source_type)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS superadmin.idx_extraction_jobs_source_type");
}
