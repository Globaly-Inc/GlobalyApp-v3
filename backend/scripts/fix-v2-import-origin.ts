/**
 * One-off data correction, not a migration (PR review: migrations 20260923_004/005 were a data
 * backfill with no schema change, and got their own follow-up fix once merged — exactly the
 * "shouldn't have been a migration" smell. Consolidated into this idempotent script instead.)
 *
 * The V2 bulk-import seeder (e.g. The University of Queensland, Southern Highlands Campus) inserts
 * institutions/businesses directly with no source_job_id at all, so 20260923_003's backfill fell
 * back to origin='signup' for them — wrong, they're pre-loaded seed data, same bucket as a real
 * extraction promote. `meta.created_via = 'v2_import'` looked like the right tag to match on, but
 * the seeder's metaFrom() also preserves the V2 dump's OWN created_via field under that exact same
 * key, silently overwriting the marker for any row V2 had already tagged (e.g. "admin_manual").
 * `meta.v2_id` is set unconditionally on every V2-imported row and is never overwritten, so that's
 * what this corrects on instead.
 *
 * Safe to re-run — sets the same rows to the same value every time.
 *
 *   node --import tsx scripts/fix-v2-import-origin.ts            dry run — prints what would change
 *   node --import tsx scripts/fix-v2-import-origin.ts --apply    writes
 */
import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";

const apply = process.argv.includes("--apply");

async function main() {
  for (const table of ["businesses", "institutions"] as const) {
    const rows = await masterKnex(table).whereRaw("jsonb_exists(meta, 'v2_id')").whereNot("origin", "seeded").select("id");
    console.log(`${table}: ${rows.length} row(s) to correct to origin='seeded'`);
    if (apply && rows.length > 0) {
      await masterKnex(table).whereRaw("jsonb_exists(meta, 'v2_id')").update({ origin: "seeded" });
    }
  }
  if (!apply) console.log("Dry run — pass --apply to write.");
  await masterKnex.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
