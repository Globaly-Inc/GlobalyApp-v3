/**
 * Repair `extraction_jobs.business_category_id` for jobs whose owner has a category but the job
 * doesn't (an old row created before the self-service/admin create paths set it, or an
 * admin-created job that was only linked up to its institution/business later).
 *
 * The category is read from the REAL owner's OWN business_category_id column, never guessed from
 * `source_type` or hardcoded:
 *   - institutions.source_job_id = job.id  → that institution's OWN business_category_id (in
 *     practice always "institutions" — see business_categories_seeder.ts — but read from the
 *     row, not assumed; an institution not yet backfilled itself is skipped, not guessed).
 *   - businesses.source_job_id = job.id AND source_agent_id IS NULL → the PRIMARY business's OWN
 *     business_category_id, copied as-is (education_agency / visa_services / accreditation_body /
 *     institutions / …). Agent-derived businesses (promoteAgent) share source_job_id with the
 *     institution/business they were scraped alongside, so joining them unfiltered would fan out
 *     one job into several rows and let an agent's own category ("education_agency") win the
 *     write over the real owner's — excluded here for exactly that reason.
 *   - no linked owner, but source_type = 'agentcis' → the "institutions" category, hardcoded.
 *     AgentCIS only ever imports education providers (stageAgentcisInstitution is the sole entity
 *     path — see the module CLAUDE.md), so this is never a guess, just the one real owner-less
 *     exception. Matches resolveIsInstitution's own agentcis special-case.
 *   - neither, or the owner itself has no category yet → left untouched. There is no real
 *     category to read, and resolveIsInstitution (promote.service.ts) already treats
 *     "no business_category_id, no owner" as "an admin must set one" rather than a bug to guess
 *     around — same principle applies here. Run `npm run institutions:backfill-category` first
 *     if institution rows are the ones being skipped.
 *
 * DRY RUN BY DEFAULT — prints the plan and writes nothing. Pass --apply to commit.
 * Rerunnable: only touches rows where business_category_id IS NULL.
 *
 *   npm run jobs:backfill-category                     # plan only
 *   npm run jobs:backfill-category -- --apply          # write
 *   npm run jobs:backfill-category -- --apply --ids <uuid>,<uuid>
 */

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { findCategoryIdBySlug } from "../src/modules/superadmin/data-extraction/repositories/promote.repository.js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const idsFlag = argv.indexOf("--ids");
const ONLY_IDS = idsFlag === -1 ? null : new Set((argv[idsFlag + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean));

const institutionsCategoryId = await findCategoryIdBySlug("institutions");

type Row = {
  id: string;
  institution_name: string | null;
  institution_url: string | null;
  source_type: string | null;
  inst_id: number | null;
  inst_category_id: number | null;
  biz_id: number | null;
  biz_name: string | null;
  biz_category_id: number | null;
};

let query = masterKnex("superadmin.extraction_jobs as j")
  .leftJoin("public.institutions as i", "i.source_job_id", "j.id")
  .leftJoin("public.businesses as b", function () {
    this.on("b.source_job_id", "j.id").andOnNull("b.source_agent_id");
  })
  .whereNull("j.business_category_id")
  .select(
    "j.id", "j.institution_name", "j.institution_url", "j.source_type",
    "i.id as inst_id", "i.business_category_id as inst_category_id",
    "b.id as biz_id", "b.business_name as biz_name", "b.business_category_id as biz_category_id",
  );
if (ONLY_IDS) query = query.whereIn("j.id", [...ONLY_IDS]);
const rows: Row[] = await query.orderBy("j.created_at");

console.log(`${rows.length} job(s) with no business_category_id` + (APPLY ? "" : " — DRY RUN, nothing will be written"));

const toApply: { id: string; categoryId: number }[] = [];
let skippedNoOwner = 0;
let skippedOwnerNoCategory = 0;

for (const row of rows) {
  const name = (row.institution_name ?? row.institution_url ?? row.id).slice(0, 60);
  if (row.inst_id && row.inst_category_id) {
    console.log(`  ${APPLY ? "set" : "would set"}  ${row.id}  ${name}  [institution ${row.inst_id}]  -> business_category_id ${row.inst_category_id} (its own category)`);
    toApply.push({ id: row.id, categoryId: row.inst_category_id });
  } else if (row.inst_id) {
    skippedOwnerNoCategory++;
    console.log(`  skip  ${row.id}  ${name}  — linked institution ${row.inst_id} has no category of its own yet (run institutions:backfill-category first)`);
  } else if (row.biz_id && row.biz_category_id) {
    console.log(`  ${APPLY ? "set" : "would set"}  ${row.id}  ${name}  [business ${row.biz_id} "${row.biz_name}"]  -> business_category_id ${row.biz_category_id} (its own category)`);
    toApply.push({ id: row.id, categoryId: row.biz_category_id });
  } else if (row.biz_id) {
    skippedOwnerNoCategory++;
    console.log(`  skip  ${row.id}  ${name}  — linked business ${row.biz_id} has no category of its own either`);
  } else if (row.source_type === "agentcis" && institutionsCategoryId) {
    console.log(`  ${APPLY ? "set" : "would set"}  ${row.id}  ${name}  [agentcis]  -> business_category_id ${institutionsCategoryId} (institutions)`);
    toApply.push({ id: row.id, categoryId: institutionsCategoryId });
  } else {
    skippedNoOwner++;
    console.log(`  skip  ${row.id}  ${name}  — no linked institution/business (e.g. unclaimed job)`);
  }
}

if (APPLY) {
  for (const { id, categoryId } of toApply) {
    await masterKnex("superadmin.extraction_jobs").where({ id }).update({ business_category_id: categoryId, updated_at: masterKnex.fn.now() });
  }
}

console.log(
  `\n${APPLY ? "applied" : "planned"}: ${toApply.length} job(s)` +
    `, ${skippedNoOwner} skipped (no owner), ${skippedOwnerNoCategory} skipped (owner has no category)`,
);
if (!APPLY) console.log("Re-run with --apply to write.");

await masterKnex.destroy();
