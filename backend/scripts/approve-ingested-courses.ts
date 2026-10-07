// Back-fills the approval that INGESTED_COURSE_STATUS now writes at ingest time: every course the
// pipeline already landed before that change is still sitting unapproved and therefore invisible to
// search, the public pages and the AI widget. Run: npm run courses:approve-ingested -- --apply
//
// Only pipeline-written rows (created_by_platform_user_id is null — see services.routes.ts) are
// touched, so a course someone added by hand keeps whatever state its own flow gave it. 'flagged'
// (an admin rejected it) and 'mismatch' (the verifier found the live page disagrees) are left alone:
// both are decisions, and re-approving them here would erase the signal.
import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { APPROVED_COURSE_STATUSES, INGESTED_COURSE_STATUS, SUPERADMIN_SCHEMA as S } from "../src/modules/superadmin/consts.js";

const APPLY = process.argv.includes("--apply");
const KEEP = [...APPROVED_COURSE_STATUSES, "flagged", "mismatch"];

const scope = (q: import("knex").Knex.QueryBuilder) =>
  q.whereNull("created_by_platform_user_id")
    .whereRaw("coalesce(verification_status, 'unverified') <> all(?)", [KEEP]);

const rows: { verification_status: string | null; count: string }[] = await scope(masterKnex(`${S}.extraction_courses`))
  .select("verification_status").count("id as count").groupBy("verification_status");

const total = rows.reduce((n, r) => n + Number(r.count), 0);
console.log(`${total} ingested course(s) not yet approved` + (APPLY ? "" : " — DRY RUN, nothing will be written"));
for (const r of rows) console.log(`  ${r.verification_status ?? "(null)"} -> ${INGESTED_COURSE_STATUS}  x${r.count}`);

if (APPLY && total) {
  // Re-scoped at write time: anything approved or rejected since the count above keeps that decision.
  const updated = await scope(masterKnex(`${S}.extraction_courses`))
    .update({ verification_status: INGESTED_COURSE_STATUS, updated_at: masterKnex.fn.now() });
  console.log(`\napplied: ${updated} course(s)`);
} else if (!APPLY) {
  console.log("\nRe-run with --apply to write.");
}

await masterKnex.destroy();
