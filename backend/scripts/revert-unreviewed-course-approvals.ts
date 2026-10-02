
import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";

const APPLY = process.argv.includes("--apply");

const rows: { id: string; name: string; job_id: string; source_type: string }[] = await masterKnex("superadmin.extraction_courses as c")
  .join("superadmin.extraction_jobs as j", "j.id", "c.job_id")
  .where("c.verification_status", "confirmed")
  .whereNull("c.updated_by_platform_user_id")
  // Only a Super Admin's manual institutions: a "self_service" placeholder holds courses the owner
  // added in the business portal, which skip approval (BUSINESS_PORTAL_SOURCE_TYPES).
  .where("j.source_type", "manual")
  .select("c.id", "c.name", "c.job_id", "j.source_type")
  .orderBy("c.job_id");

console.log(`${rows.length} course(s) confirmed without review` + (APPLY ? "" : " — DRY RUN, nothing will be written"));
for (const row of rows) console.log(`  ${APPLY ? "revert" : "would revert"}  ${row.id}  [${row.source_type}]  ${row.name.slice(0, 60)}`);

if (APPLY && rows.length) {
  await masterKnex("superadmin.extraction_courses")
    .whereIn("id", rows.map((r) => r.id))
    // Re-checked at write time: a course someone approved or edited since the scan keeps that decision.
    .where("verification_status", "confirmed")
    .whereNull("updated_by_platform_user_id")
    .update({ verification_status: null, updated_at: masterKnex.fn.now() });
}

console.log(`\n${APPLY ? "applied" : "planned"}: ${rows.length} course(s)`);
if (!APPLY) console.log("Re-run with --apply to write.");

await masterKnex.destroy();
