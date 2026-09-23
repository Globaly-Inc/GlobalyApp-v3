// Follow-up to 20260923_004: that migration matched meta.created_via = 'v2_import' to find
// V2-imported rows (e.g. Southern Highlands Campus), but the seeder's metaFrom() also preserves
// the V2 dump's OWN created_via field under that exact same key — so any row V2 already tagged
// (e.g. "admin_manual") silently overwrote the "v2_import" marker before it ever reached the
// database, and 004 missed every one of those. meta.v2_id is set unconditionally on every
// V2-imported row and is never overwritten, so it's used here instead. The seeder itself
// (v2_businesses_import_seeder.ts) has also been fixed to stop the collision going forward,
// preserving V2's created_via under v2_created_via instead.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  for (const table of ["businesses", "institutions"]) {
    await knex(table).whereRaw("jsonb_exists(meta, 'v2_id')").update({ origin: "seeded" });
  }
}

export async function down(): Promise<void> {
  // Not reversible to the prior (wrong) "signup"/mixed values — no data was lost, only reclassified.
}
