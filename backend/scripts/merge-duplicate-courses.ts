/**
 * Clean up courses already staged before the writer learnt to tell units from courses and one
 * spelling from another. Uses the SAME parser/classifier as the writer (data-extraction/lib), no
 * schema, no model call. Dry run by default. The actual passes live in
 * src/modules/superadmin/data-extraction/lib/course-dedup.ts, which rerunJob also calls.
 *
 *   node --import tsx scripts/merge-duplicate-courses.ts                dry run — counts + samples
 *   node --import tsx scripts/merge-duplicate-courses.ts --apply        writes
 *   node --import tsx scripts/merge-duplicate-courses.ts --job <uuid>   one job
 *   node --import tsx scripts/merge-duplicate-courses.ts --pass units|merge
 */
import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { reclassifyUnits, mergeDuplicateCourses } from "../src/modules/superadmin/data-extraction/lib/course-dedup.js";

const apply = process.argv.includes("--apply");
const jobIdx = process.argv.indexOf("--job");
const onlyJob = jobIdx > -1 ? process.argv[jobIdx + 1] : null;
const passIdx = process.argv.indexOf("--pass");
const onlyPass = passIdx > -1 ? process.argv[passIdx + 1] : null;

async function main() {
  const jobs: Array<{ id: string; institution_url: string; source_type: string }> = await masterKnex("superadmin.extraction_jobs")
    .select("id", "institution_url", "source_type").modify((q) => { if (onlyJob) q.where({ id: onlyJob }); });
  const want = (p: string) => !onlyPass || onlyPass === p;
  let units = 0, mergeGroups = 0, mergeLosers = 0;
  const samples: Record<string, string[]> = { units: [], merge: [] };
  for (const job of jobs) {
    if (want("units")) { const r = await reclassifyUnits(job, { apply }); units += r.reclassified; samples.units.push(...r.sample.slice(0, 25 - samples.units.length)); }
    if (want("merge")) { const r = await mergeDuplicateCourses(job, { apply }); mergeGroups += r.groups; mergeLosers += r.losers; samples.merge.push(...r.sample.slice(0, 25 - samples.merge.length)); }
  }
  const verb = apply ? "" : "would be ";
  console.log(`\n${jobs.length} jobs scanned.`);
  console.log(`units: ${units} courses ${verb}moved to study units`);
  console.log(`merge: ${mergeLosers} rows ${verb}merged into ${mergeGroups} survivors`);
  for (const [k, s] of Object.entries(samples)) if (s.length) { console.log(`\n-- ${k} sample --`); for (const x of s) console.log("  " + x); }
  if (!apply) console.log("\nDry run — pass --apply to write.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => masterKnex.destroy());
