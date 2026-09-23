// Corrects a gap in 20260923_003's backfill: the V2 bulk-import seeder (e.g. The University of
// Queensland) inserts institutions/businesses directly with no source_job_id at all, so that
// migration's catch-all fell back to "signup" for them — wrong, they're pre-loaded seed data,
// same bucket as a real extraction promote. meta.created_via = 'v2_import' is how the seeder
// itself tags them (see v2_businesses_import_seeder.ts, which now also stamps origin: "seeded"
// on future/re-imported rows going forward).
//
// NOTE: this filter turned out to be unreliable for rows the V2 dump had already tagged with
// its own created_via — see 20260923_005 for the follow-up fix and why.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  for (const table of ["businesses", "institutions"]) {
    await knex(table).whereRaw("meta->>'created_via' = ?", ["v2_import"]).update({ origin: "seeded" });
  }
}

export async function down(): Promise<void> {
  // Not reversible to the prior (wrong) "signup" value — no data was lost, only reclassified.
}
