/**
 * Repair `extraction_jobs.business_category_id` for jobs that are already OWNED by a real
 * institution or business but never got a category stamped (e.g. institution self-service jobs
 * created before institution-profile.service.ts's `startExtraction` was fixed to set it, or an
 * admin-created job that defaulted `source_type` to "institution" and was only linked up later).
 *
 * The category is read from the REAL owner, never guessed from `source_type`:
 *   - institutions.source_job_id = job.id  → the "institutions" category (the only one an
 *     institution can ever have — see business_categories_seeder.ts, institutions have no
 *     category field of their own to read a different value from).
 *   - businesses.source_job_id = job.id    → that business's OWN business_category_id, copied
 *     as-is (education_agency / visa_services / accreditation_body / institutions / …).
 *   - neither (agentcis imports, or a job nobody has claimed yet) → left untouched. There is no
 *     real category to read, and resolveIsInstitution (promote.service.ts) already treats
 *     "no business_category_id, no owner" as "an admin must set one" rather than a bug to guess
 *     around — same principle applies here.
 *
 * DRY RUN BY DEFAULT — prints the plan and writes nothing. Pass --apply to commit.
 * Rerunnable: only touches rows where business_category_id IS NULL.
 *
 *   npm run jobs:backfill-category                    # plan only
 *   npm run jobs:backfill-category -- --apply         # write
 *   npm run jobs:backfill-category -- --apply --ids <uuid>,<uuid>   # just these jobs
 */

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { findCategoryIdBySlug } from "../src/modules/superadmin/data-extraction/repositories/promote.repository.js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const idsFlag = argv.indexOf("--ids");
const ONLY_IDS = idsFlag === -1 ? null : new Set((argv[idsFlag + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean));

const institutionsCategoryId = await findCategoryIdBySlug("institutions");
if (!institutionsCategoryId) {
  console.error('No business_categories row with slug "institutions" — check the seeder.');
  await masterKnex.destroy();
  process.exit(1);
}

type Row = {
  id: string;
  institution_name: string | null;
  institution_url: string | null;
  inst_id: number | null;
  biz_id: number | null;
  biz_name: string | null;
  biz_category_id: number | null;
};

let query = masterKnex("superadmin.extraction_jobs as j")
  .leftJoin("institutions as i", function () {
    this.on("i.source_job_id", "=", "j.id").andOnNull("i.deleted_at");
  })
  .leftJoin("businesses as b", function () {
    this.on("b.source_job_id", "=", "j.id").andOnNull("b.deleted_at").andOnNull("b.source_agent_id");
  })
  .whereNull("j.business_category_id")
  .select(
    "j.id", "j.institution_name", "j.institution_url",
    "i.id as inst_id",
    "b.id as biz_id", "b.business_name as biz_name", "b.business_category_id as biz_category_id",
  );
if (ONLY_IDS) query = query.whereIn("j.id", [...ONLY_IDS]);

const rows: Row[] = await query.orderBy("j.created_at");

console.log(`${rows.length} job(s) with no business_category_id` + (ONLY_IDS ? " (filtered)" : "") + (APPLY ? "" : " — DRY RUN, nothing will be written"));

const toApply: { id: string; categoryId: number }[] = [];
let skippedNoOwner = 0;
let skippedBizNoCategory = 0;

for (const row of rows) {
  const name = (row.institution_name ?? row.institution_url ?? row.id).slice(0, 60);
  if (row.inst_id) {
    console.log(`  ${APPLY ? "set" : "would set"}  ${row.id}  ${name}  [institution ${row.inst_id}]  → business_category_id ${institutionsCategoryId} (institutions)`);
    toApply.push({ id: row.id, categoryId: institutionsCategoryId });
  } else if (row.biz_id && row.biz_category_id) {
    console.log(`  ${APPLY ? "set" : "would set"}  ${row.id}  ${name}  [business ${row.biz_id} "${row.biz_name}"]  → business_category_id ${row.biz_category_id} (its own category)`);
    toApply.push({ id: row.id, categoryId: row.biz_category_id });
  } else if (row.biz_id) {
    skippedBizNoCategory++;
    console.log(`  skip  ${row.id}  ${name}  — linked business ${row.biz_id} has no category of its own either`);
  } else {
    skippedNoOwner++;
    console.log(`  skip  ${row.id}  ${name}  — no linked institution or business; nothing real to fill in (leave for admin)`);
  }
}

if (APPLY) {
  for (const { id, categoryId } of toApply) {
    await masterKnex("superadmin.extraction_jobs").where({ id }).update({ business_category_id: categoryId, updated_at: masterKnex.fn.now() });
  }
}

console.log(
  `\n${APPLY ? "applied" : "planned"}: ${toApply.length} job(s)` +
    `, ${skippedNoOwner} skipped (no owner), ${skippedBizNoCategory} skipped (owner has no category)`,
);
if (!APPLY) console.log("Re-run with --apply to write.");

await masterKnex.destroy();
