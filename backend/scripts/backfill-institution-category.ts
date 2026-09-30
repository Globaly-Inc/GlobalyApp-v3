/**
 * Repair `institutions.business_category_id` for institutions created after migration
 * `20260916_001_institution_business_category.ts` added the column and one-time-backfilled every
 * institution that existed AT THAT MOMENT to the "institutions" category. No insert path
 * (self-service `onboardInstitution`, admin `createInstitution`) set it going forward until now
 * — every institution created since the migration had NULL here, which the admin's combined
 * businesses+institutions list reads directly for its Category column/filter.
 *
 * Every institution has exactly one possible category — "institutions" (see
 * business_categories_seeder.ts) — so this is a straight fill, no per-row lookup needed.
 *
 * DRY RUN BY DEFAULT — prints the plan and writes nothing. Pass --apply to commit.
 * Rerunnable: only touches rows where business_category_id IS NULL.
 *
 *   npm run institutions:backfill-category                    # plan only
 *   npm run institutions:backfill-category -- --apply         # write
 */

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { findCategoryIdBySlug } from "../src/modules/superadmin/data-extraction/repositories/promote.repository.js";

const APPLY = process.argv.includes("--apply");

const categoryId = await findCategoryIdBySlug("institutions");
if (!categoryId) {
  console.error('No business_categories row with slug "institutions" — check the seeder.');
  await masterKnex.destroy();
  process.exit(1);
}

const rows: { id: number; institution_name: string | null }[] = await masterKnex("institutions")
  .whereNull("deleted_at")
  .whereNull("business_category_id")
  .select("id", "institution_name")
  .orderBy("created_at");

console.log(`${rows.length} institution(s) with no business_category_id` + (APPLY ? "" : " — DRY RUN, nothing will be written"));
for (const row of rows) {
  console.log(`  ${APPLY ? "set" : "would set"}  ${row.id}  ${(row.institution_name ?? "").slice(0, 60)}  -> business_category_id ${categoryId}`);
}

if (APPLY && rows.length) {
  await masterKnex("institutions")
    .whereIn("id", rows.map((r) => r.id))
    .update({ business_category_id: categoryId, updated_at: masterKnex.fn.now() });
}

console.log(`\n${APPLY ? "applied" : "planned"}: ${rows.length} institution(s)`);
if (!APPLY) console.log("Re-run with --apply to write.");

await masterKnex.destroy();
